BEGIN;
-- Local transaction setting only: before/after protected-row evidence, rolled back.
select set_config('vp.tax042_before',md5(evidence::text),true) from (select jsonb_build_object(
 'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.finance_invoices i where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.finance_payments p where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 'clients',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.clients c where id in (select client_id from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')))
 ) as evidence) p;
-- BEGIN EMBEDDED MIGRATION 042
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
-- END EMBEDDED MIGRATION 042
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_hash before/after apply; stop on ANY failed check.
-- Competing Client tax fields/profiles require schema review, never automatic overwrite.
with expected_functions(signature,hash,callable,security_definer,volatility) as (values ('public.protect_customer_tax_profile_audit()','a7e401cd7fce56208458721c29131bef',false,false,'v'),
('public.finance_customer_tax_identity(uuid)','259e4e1c344e24a112eaecd86bc0f6d6',false,true,'s'),
('public.get_finance_customer_tax_profile(uuid)','b0f24853759ff637123268398ca5cdba',true,true,'s'),
('public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz)','e91913ab1a8349a70778be75d699d30c',true,true,'v'),
('public.build_finance_document_tax_source(uuid)','6738b2496a31ae3236145dc121f55c6c',false,true,'v'),
('public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','98adea2dd41c427318401559df580a84',false,false,'i'),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',false,true,'v'),
('public.build_finance_receipt_source(uuid)','1fe91b4d85e36bdc913b5427f5a8e270',false,true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',false,true,'v'),
('public.current_user_can_view_finance_tax_invoices()','61b920f71b441ab396a6058f9903c903',false,true,'s'),
('public.current_user_can_manage_finance_tax_invoices()','d049e03a67dd6c81f2309d134138dcb6',false,true,'s'),
('public.document_tax_snapshot_pre042(jsonb,jsonb,date)','bef394e77841bd9e6394511f3eebc7bd',false,false,'i'),
('public.finance_tax_invoice_issue_blockers(jsonb)','e7f592f622ab0494cbf15c160b2807bb',false,false,'i'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,true,'v'),
('public.document_tax_source_pre042(uuid)','1629c804cf013b519759d672541d7d09',false,true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,true,'v'),
('public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)','dfbd31e473a7d682a1329c18a7c1ee93',true,true,'v')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),protected_evidence as (select jsonb_build_object(
 'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.finance_invoices i where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.finance_payments p where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 'clients',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.clients c where id in (select client_id from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')))
 ) as evidence),
 client_columns as (select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='clients'),
 competing_fields as (select column_name from client_columns where column_name ~* '(vat|branch|tax.*address|tax.*evidence|tax.*verif|legal_name|billing_address)'),
 competing_profiles as (select table_name from information_schema.tables where table_schema='public' and table_name ~* '(client|customer).*(tax|vat)|(tax|vat).*(client|customer)' and table_name not in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events')),
 protected_checks(name,passed) as (values
 ('protected_invoices',(select count(*)=2 and bool_and(document_status='issued' and ((id='74461042-e3ba-4922-9b64-55aac9ebd8aa' and invoice_no='VP-IV-202609-000003' and total_amount=5000) or (id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and vat_amount=607.10))) from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6'))),
 ('protected_payments',(select count(*)=2 and bool_and(status='confirmed' and ((id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) or (id='95e22d0e-1996-4f16-98e4-218db1cbd857' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280))) from public.finance_payments where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857'))),
 ('protected_receipt',(select count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('client_columns_compatible',(select count(*)=6 and bool_and(case when column_name='id' then udt_name='uuid' else data_type in ('text','character varying') end) from client_columns where column_name in ('id','name','tax_id','address','client_type','status'))),
 ('no_competing_profile_to_review',not exists(select 1 from competing_fields) and not exists(select 1 from competing_profiles))
 ),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_customer_tax_profile_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "client_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_payload_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_customer_tax_profile_audit_eve_event_payload_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_client_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (client_id) REFERENCES finance_customer_tax_profiles(client_id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ''profile_saved''::text))"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "customer_tax_profile_audit_history",
        "definition": "CREATE INDEX customer_tax_profile_audit_history ON public.finance_customer_tax_profile_audit_events USING btree (client_id, created_at)"
      },
      {
        "name": "finance_customer_tax_profile_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_customer_tax_profile_audit_events_pkey ON public.finance_customer_tax_profile_audit_events USING btree (id)"
      }
    ]
  },
  {
    "name": "finance_customer_tax_profiles",
    "columns": [
      {
        "name": "client_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "vat_registered",
        "type": "boolean",
        "default": null,
        "not_null": false
      },
      {
        "name": "branch_type",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "branch_code",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "identity_evidence",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "identity_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "verified_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "verified_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "clock_timestamp()",
        "not_null": true
      },
      {
        "name": "updated_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "customer_tax_profile_branch",
        "type": "c",
        "definition": "CHECK ((((vat_registered IS DISTINCT FROM true) AND (branch_type IS NULL) AND (branch_code IS NULL)) OR ((vat_registered IS TRUE) AND ((((branch_type IS NULL) AND (branch_code IS NULL)) OR ((branch_type = ''head_office''::text) AND (branch_code = ''00000''::text)) OR ((branch_type = ''branch''::text) AND (branch_code ~ ''^[0-9]{5}$''::text) AND (branch_code <> ''00000''::text))) IS TRUE))))"
      },
      {
        "name": "customer_tax_profile_verified",
        "type": "c",
        "definition": "CHECK ((((verified_at IS NULL) AND (verified_by_user_id IS NULL)) OR ((verified_at IS NOT NULL) AND (verified_by_user_id IS NOT NULL) AND (vat_registered IS NOT NULL) AND (NULLIF(btrim((identity_snapshot_json ->> ''name''::text)), ''''::text) IS NOT NULL) AND (NULLIF(btrim((identity_snapshot_json ->> ''address''::text)), ''''::text) IS NOT NULL) AND (((vat_registered = false) OR (((identity_snapshot_json ->> ''tax_id''::text) ~ ''^[0-9]{13}$''::text) AND (branch_type = ANY (ARRAY[''head_office''::text, ''branch''::text])) AND (branch_code IS NOT NULL))) IS TRUE))))"
      },
      {
        "name": "finance_customer_tax_profiles_client_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_customer_tax_profiles_identity_evidence_check",
        "type": "c",
        "definition": "CHECK ((length(identity_evidence) <= 2000))"
      },
      {
        "name": "finance_customer_tax_profiles_identity_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(identity_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_customer_tax_profiles_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (client_id)"
      },
      {
        "name": "finance_customer_tax_profiles_updated_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_customer_tax_profiles_verified_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (verified_by_user_id) REFERENCES user_profiles(id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_customer_tax_profiles_pkey",
        "definition": "CREATE UNIQUE INDEX finance_customer_tax_profiles_pkey ON public.finance_customer_tax_profiles USING btree (client_id)"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events') order by c.relname),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_new_and_preserved_functions',(select bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)),
 ('new_private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts where signature in ('public.protect_customer_tax_profile_audit()','public.finance_customer_tax_identity(uuid)','public.get_finance_customer_tax_profile(uuid)','public.save_finance_customer_tax_profile(uuid,boolean,text,text,text,boolean,jsonb,timestamptz)','public.build_finance_document_tax_source(uuid)','public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)'))),
 ('private_predecessors',not has_function_privilege('authenticated','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE') and not has_function_privilege('anon','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('anon','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE')),
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('rls_no_browser_mutation',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_customer_tax_profiles'::regclass,'public.finance_customer_tax_profile_audit_events'::regclass))),
 ('read_policies_only',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_tax_invoices()' and with_check is null) from pg_policies where schemaname='public' and tablename in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events'))),
 ('audit_immutable',(select count(*)=1 and bool_and(tgtype=27 and tgenabled='O' and tgfoid='public.protect_customer_tax_profile_audit()'::regprocedure) from pg_trigger where tgrelid='public.finance_customer_tax_profile_audit_events'::regclass and not tgisinternal)),
 ('new_profile_zero_state',not exists(select 1 from public.finance_customer_tax_profiles) and not exists(select 1 from public.finance_customer_tax_profile_audit_events)),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax042_before',true),'') is null or current_setting('vp.tax042_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as customer_tax_identity_verification_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_hash,
 (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from client_columns c) as client_columns,
 (select coalesce(jsonb_agg(column_name),'[]') from competing_fields) as competing_client_fields,
 (select coalesce(jsonb_agg(table_name),'[]') from competing_profiles) as competing_profile_tables,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_facts f where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_customer_tax_profiles',(select count(*) from public.finance_customer_tax_profiles),'finance_customer_tax_profile_audit_events',(select count(*) from public.finance_customer_tax_profile_audit_events)) as new_rows;
ROLLBACK;
