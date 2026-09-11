-- Candidate 042: one reviewed Client tax identity; no backfill or document writes.
-- 039/040 buyer, tax-point, coverage and financial guards remain unchanged.
do $preflight$
begin
  if to_regclass('public.finance_customer_tax_profiles') is not null
    or to_regclass('public.finance_customer_tax_profile_audit_events') is not null
    or to_regprocedure('public.build_finance_document_tax_source(uuid)') is null
    or to_regprocedure('public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)') is null
    or to_regprocedure('public.document_tax_source_pre042(uuid)') is not null
    or to_regprocedure('public.document_tax_snapshot_pre042(jsonb,jsonb,date)') is not null
  then raise exception 'CUSTOMER_TAX_PROFILE_PRECONDITION'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='clients'
    and column_name in ('id','name','tax_id','address','client_type','status'))<>6
  then raise exception 'CUSTOMER_TAX_PROFILE_CLIENT_SCHEMA_REVIEW_REQUIRED'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='clients'
    and column_name ~* '(vat|branch|tax.*address|tax.*evidence|tax.*verif|legal_name|billing_address)')
    or exists(select 1 from information_schema.tables where table_schema='public'
      and table_name ~* '(client|customer).*(tax|vat)|(tax|vat).*(client|customer)')
  then raise exception 'CUSTOMER_TAX_PROFILE_COMPETING_SCHEMA_REVIEW_REQUIRED'; end if;
end;
$preflight$;

create table public.finance_customer_tax_profiles (
  client_id uuid primary key references public.clients(id) on delete restrict,
  vat_registered boolean,
  branch_type text,
  branch_code text,
  identity_evidence text check(length(identity_evidence)<=2000),
  identity_snapshot_json jsonb not null check(jsonb_typeof(identity_snapshot_json)='object'),
  verified_at timestamptz,
  verified_by_user_id uuid references public.user_profiles(id),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by_user_id uuid not null references public.user_profiles(id),
  constraint customer_tax_profile_branch check (
    (vat_registered is distinct from true and branch_type is null and branch_code is null)
    or (vat_registered is true and (
      (branch_type is null and branch_code is null)
      or (branch_type='head_office' and branch_code='00000')
      or (branch_type='branch' and branch_code ~ '^[0-9]{5}$' and branch_code<>'00000')) is true)),
  constraint customer_tax_profile_verified check (
    (verified_at is null and verified_by_user_id is null)
    or (verified_at is not null and verified_by_user_id is not null and vat_registered is not null
      and nullif(btrim(identity_snapshot_json->>'name'),'') is not null
      and nullif(btrim(identity_snapshot_json->>'address'),'') is not null
      and (vat_registered=false or (identity_snapshot_json->>'tax_id' ~ '^[0-9]{13}$'
        and branch_type in ('head_office','branch') and branch_code is not null)) is true))
);
create table public.finance_customer_tax_profile_audit_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.finance_customer_tax_profiles(client_id) on delete restrict,
  event_type text not null check(event_type='profile_saved'),
  event_payload_json jsonb not null check(jsonb_typeof(event_payload_json)='object'),
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create index customer_tax_profile_audit_history on public.finance_customer_tax_profile_audit_events(client_id,created_at);

alter table public.finance_customer_tax_profiles enable row level security;
alter table public.finance_customer_tax_profile_audit_events enable row level security;
revoke all on public.finance_customer_tax_profiles,public.finance_customer_tax_profile_audit_events from public,anon,authenticated;
grant select on public.finance_customer_tax_profiles,public.finance_customer_tax_profile_audit_events to authenticated;
create policy customer_tax_profile_read on public.finance_customer_tax_profiles for select to authenticated
using (public.current_user_can_view_finance_tax_invoices());
create policy customer_tax_profile_audit_read on public.finance_customer_tax_profile_audit_events for select to authenticated
using (public.current_user_can_view_finance_tax_invoices());

create function public.protect_customer_tax_profile_audit()
returns trigger language plpgsql set search_path=public as $audit_guard$
begin raise exception 'CUSTOMER_TAX_PROFILE_AUDIT_IMMUTABLE'; end;
$audit_guard$;
create trigger customer_tax_profile_audit_immutable before update or delete on public.finance_customer_tax_profile_audit_events
for each row execute function public.protect_customer_tax_profile_audit();

create function public.finance_customer_tax_identity(p_client_id uuid)
returns jsonb language sql stable security definer set search_path=public as $identity$
  select jsonb_build_object('id',c.id,'name',nullif(btrim(c.name),''),'tax_id',nullif(btrim(c.tax_id),''),
    'address',nullif(btrim(c.address),''),'client_type',c.client_type)
  from public.clients c where c.id=p_client_id and c.status is distinct from 'deleted';
$identity$;

create function public.get_finance_customer_tax_profile(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $get$
declare identity jsonb; profile public.finance_customer_tax_profiles%rowtype;
begin
  if not public.current_user_can_view_finance_tax_invoices() then raise exception 'CUSTOMER_TAX_PROFILE_PERMISSION_DENIED'; end if;
  identity:=public.finance_customer_tax_identity(p_client_id);
  if identity is null then raise exception 'CUSTOMER_TAX_PROFILE_CLIENT_REQUIRED'; end if;
  select * into profile from public.finance_customer_tax_profiles where client_id=p_client_id;
  return jsonb_build_object('identity',identity,'profile',case when profile.client_id is not null then to_jsonb(profile) end,
    'can_manage',public.current_user_can_manage_finance_tax_invoices(),
    'status',case when profile.client_id is null then 'missing'
      when profile.identity_snapshot_json is distinct from identity then 'stale'
      when profile.verified_at is null then 'unverified' else 'verified' end);
end;
$get$;

create function public.save_finance_customer_tax_profile(
  p_client_id uuid,p_vat_registered boolean,p_branch_type text,p_branch_code text,p_identity_evidence text,
  p_verified boolean,p_expected_identity_json jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $save$
declare identity jsonb; previous public.finance_customer_tax_profiles%rowtype; saved public.finance_customer_tax_profiles%rowtype;
  branch text:=nullif(btrim(p_branch_type),''); code text:=nullif(btrim(p_branch_code),''); evidence text:=nullif(btrim(p_identity_evidence),'');
  moment timestamptz:=clock_timestamp();
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'CUSTOMER_TAX_PROFILE_PERMISSION_DENIED'; end if;
  -- Client lock serializes initial profile creation and ordinary Client changes.
  perform 1 from public.clients where id=p_client_id for update;
  identity:=public.finance_customer_tax_identity(p_client_id);
  if identity is null then raise exception 'CUSTOMER_TAX_PROFILE_CLIENT_REQUIRED'; end if;
  if p_expected_identity_json is distinct from identity then raise exception 'CUSTOMER_TAX_PROFILE_CLIENT_CHANGED'; end if;
  select * into previous from public.finance_customer_tax_profiles where client_id=p_client_id for update;
  if previous.updated_at is distinct from p_expected_updated_at then raise exception 'CUSTOMER_TAX_PROFILE_STALE'; end if;
  if p_verified is null or length(evidence)>2000 then raise exception 'CUSTOMER_TAX_PROFILE_INVALID'; end if;
  if p_vat_registered is distinct from true and (branch is not null or code is not null)
    or (p_vat_registered is true and ((branch is null and code is null)
      or (branch='head_office' and code='00000')
      or (branch='branch' and code ~ '^[0-9]{5}$' and code<>'00000')) is not true)
  then raise exception 'CUSTOMER_TAX_PROFILE_BRANCH_INVALID'; end if;
  if p_verified then
    if nullif(btrim(identity->>'name'),'') is null or nullif(btrim(identity->>'address'),'') is null
      then raise exception 'CUSTOMER_TAX_PROFILE_IDENTITY_REQUIRED'; end if;
    if p_vat_registered is null then raise exception 'CUSTOMER_TAX_PROFILE_VAT_REQUIRED'; end if;
    if p_vat_registered and (coalesce(identity->>'tax_id','')!~'^[0-9]{13}$' or branch is null or code is null)
      then raise exception 'CUSTOMER_TAX_PROFILE_REGISTERED_IDENTITY_REQUIRED'; end if;
  end if;
  if previous.client_id is not null and (previous.vat_registered,previous.branch_type,previous.branch_code,previous.identity_evidence,
      previous.identity_snapshot_json,previous.verified_at is not null)
    is not distinct from (p_vat_registered,branch,code,evidence,identity,p_verified)
  then return public.get_finance_customer_tax_profile(p_client_id); end if;
  insert into public.finance_customer_tax_profiles(client_id,vat_registered,branch_type,branch_code,identity_evidence,
    identity_snapshot_json,verified_at,verified_by_user_id,updated_at,updated_by_user_id)
  values(p_client_id,p_vat_registered,branch,code,evidence,identity,case when p_verified then moment end,
    case when p_verified then auth.uid() end,moment,auth.uid())
  on conflict(client_id) do update set vat_registered=excluded.vat_registered,branch_type=excluded.branch_type,branch_code=excluded.branch_code,
    identity_evidence=excluded.identity_evidence,identity_snapshot_json=excluded.identity_snapshot_json,verified_at=excluded.verified_at,
    verified_by_user_id=excluded.verified_by_user_id,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id
  returning * into saved;
  insert into public.finance_customer_tax_profile_audit_events(client_id,event_type,event_payload_json,actor_user_id)
  values(p_client_id,'profile_saved',jsonb_build_object('previous',case when previous.client_id is not null then to_jsonb(previous) end,
    'profile',to_jsonb(saved),'historical_documents_changed',false),auth.uid());
  return public.get_finance_customer_tax_profile(p_client_id);
end;
$save$;

-- Preserve the exact 040 source and snapshot implementations, privately.
alter function public.build_finance_document_tax_source(uuid) rename to document_tax_source_pre042;
alter function public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date) rename to document_tax_snapshot_pre042;

create function public.build_finance_document_tax_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
declare source jsonb; identity jsonb; profile public.finance_customer_tax_profiles%rowtype; state text; client uuid;
begin
  source:=public.document_tax_source_pre042(p_payment_id);
  client:=(source #>> '{customer,id}')::uuid;
  perform 1 from public.clients where id=client for share;
  identity:=public.finance_customer_tax_identity(client);
  select * into profile from public.finance_customer_tax_profiles where client_id=client for share;
  state:=case when profile.client_id is null then 'missing'
    when identity is null or identity is distinct from profile.identity_snapshot_json then 'stale'
    when profile.verified_at is null then 'unverified' else 'verified' end;
  -- Separate reviewed tax identity, never a rewrite of the issued Invoice or
  -- standalone Receipt customer. Existing Issue stale-source checks still apply.
  return source||jsonb_build_object('buyer_tax_profile',jsonb_build_object('schema_version',1,'status',state,
    'profile',case when profile.client_id is not null then to_jsonb(profile) end),
    'customer',case when state='verified' then profile.identity_snapshot_json||jsonb_build_object(
      'branch',case when profile.branch_type='head_office' then 'head office' end) else source->'customer' end);
end;
$source$;

create function public.finance_tax_invoice_draft_snapshot(p_source jsonb,p_decisions jsonb,p_issue_date date)
returns jsonb language plpgsql immutable set search_path=public as $snapshot$
declare envelope jsonb:=p_source->'buyer_tax_profile'; profile jsonb:=envelope->'profile'; controlled jsonb; k text;
  decisions jsonb:=coalesce(p_decisions,'{}'); reviewed boolean:=envelope->>'status'='verified';
begin
  -- Existing frozen Draft/Issued sources retain their exact predecessor semantics.
  if envelope is null then return public.document_tax_snapshot_pre042(p_source,p_decisions,p_issue_date); end if;
  if jsonb_typeof(decisions) is distinct from 'object' then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  controlled:=jsonb_build_object('buyer_vat_registered',case when reviewed then profile->'vat_registered' end,
    'buyer_branch_type',case when reviewed then profile->'branch_type' end,
    'buyer_branch_code',case when reviewed then profile->'branch_code' end,
    'identity_evidence',case when reviewed then profile->'identity_evidence' end);
  foreach k in array array['buyer_vat_registered','buyer_branch_type','buyer_branch_code','identity_evidence'] loop
    if decisions ? k and decisions->k is distinct from controlled->k then raise exception 'CUSTOMER_TAX_PROFILE_OVERRIDE_BLOCKED'; end if;
  end loop;
  if decisions ? 'customer_address' or decisions ? 'customer_tax_id' then raise exception 'CUSTOMER_TAX_PROFILE_OVERRIDE_BLOCKED'; end if;
  return public.document_tax_snapshot_pre042(p_source,decisions||controlled,p_issue_date);
end;
$snapshot$;

revoke all on function public.protect_customer_tax_profile_audit() from public,anon,authenticated;
revoke all on function public.finance_customer_tax_identity(uuid) from public,anon,authenticated;
revoke all on function public.document_tax_source_pre042(uuid) from public,anon,authenticated;
revoke all on function public.document_tax_snapshot_pre042(jsonb,jsonb,date) from public,anon,authenticated;
revoke all on function public.build_finance_document_tax_source(uuid) from public,anon,authenticated;
revoke all on function public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date) from public,anon,authenticated;
revoke all on function public.get_finance_customer_tax_profile(uuid) from public,anon,authenticated;
revoke all on function public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.get_finance_customer_tax_profile(uuid) to authenticated;
grant execute on function public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz) to authenticated;
