-- Phase 6B V1: documentary Tax Invoice evidence only. No historical backfill.
-- Only one fully settled V2 line and one effective confirmed Payment are supported.
do $preflight$
begin
  if to_regclass('public.finance_tax_invoices') is not null
    or to_regprocedure('public.document_logo_evidence(text)') is null
    or to_regprocedure('public.build_finance_receipt_source(uuid)') is null
    or to_regclass('public.finance_payment_effective_invoice_allocations') is null
  then raise exception 'TAX_INVOICE_FOUNDATION_PRECONDITION'; end if;
  if not exists(select 1 from public.document_numbering_profiles where document_type='tax_invoice'
    and display_prefix='VP-TI' and period_scope='monthly' and sequence_width=6 and is_active)
  then raise exception 'TAX_INVOICE_NUMBERING_PROFILE_INVALID'; end if;
  if exists(select 1 from public.finance_document_counters where lower(doc_type) in ('tax_invoice','ti','vp-ti') or prefix like 'VP-TI-%')
  then raise exception 'TAX_INVOICE_EXISTING_COUNTER_REVIEW_REQUIRED'; end if;
end;
$preflight$;

alter table public.user_profiles
  add column can_view_finance_tax_invoices boolean not null default false,
  add column can_manage_finance_tax_invoices boolean not null default false,
  add column can_issue_finance_tax_invoices boolean not null default false;

create function public.current_user_can_view_finance_tax_invoices()
returns boolean language sql stable security definer set search_path=public as $view$
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and
    (role='admin' or can_view_finance_tax_invoices or can_manage_finance_tax_invoices or can_issue_finance_tax_invoices));
$view$;
create function public.current_user_can_manage_finance_tax_invoices()
returns boolean language sql stable security definer set search_path=public as $manage$
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and (role='admin' or can_manage_finance_tax_invoices));
$manage$;
create function public.current_user_can_issue_finance_tax_invoices()
returns boolean language sql stable security definer set search_path=public as $issue_permission$
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and (role='admin' or can_issue_finance_tax_invoices));
$issue_permission$;
create function public.protect_finance_tax_invoice_permissions()
returns trigger language plpgsql security definer set search_path=public as $permission_guard$
begin
  if tg_op='INSERT' and not(new.can_view_finance_tax_invoices or new.can_manage_finance_tax_invoices or new.can_issue_finance_tax_invoices) then return new; end if;
  if not exists(select 1 from public.user_profiles where id=auth.uid() and active and role='admin')
  then raise exception 'TAX_INVOICE_PERMISSION_ADMIN_REQUIRED'; end if;
  return new;
end;
$permission_guard$;
create trigger protect_finance_tax_invoice_permissions before insert or update of
can_view_finance_tax_invoices,can_manage_finance_tax_invoices,can_issue_finance_tax_invoices on public.user_profiles
for each row execute function public.protect_finance_tax_invoice_permissions();

create table public.finance_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  status text not null default 'draft' check(status in ('draft','issued','cancelled')),
  tax_invoice_no text unique,
  issue_date date not null,
  source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
  decisions_json jsonb not null default '{}' check(jsonb_typeof(decisions_json)='object'),
  draft_snapshot_json jsonb not null check(jsonb_typeof(draft_snapshot_json)='object'),
  issued_snapshot_json jsonb,
  issued_at timestamptz,
  issued_by_user_id uuid references public.user_profiles(id),
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid not null references public.user_profiles(id),
  constraint tax_invoice_lifecycle check(
    (status in ('draft','cancelled') and tax_invoice_no is null and issued_at is null and issued_by_user_id is null and issued_snapshot_json is null)
    or (status='issued' and tax_invoice_no ~ '^VP-TI-[0-9]{6}-[0-9]{6}$' and tax_invoice_no is not null
      and issued_at is not null and issued_by_user_id is not null and issued_snapshot_json is not null and jsonb_typeof(issued_snapshot_json)='object')),
  constraint tax_invoice_cancel_evidence check(
    (status='cancelled' and cancelled_at is not null and cancelled_by_user_id is not null and nullif(btrim(cancel_reason),'') is not null)
    or (status<>'cancelled' and cancelled_at is null and cancelled_by_user_id is null and cancel_reason is null))
);
create unique index tax_invoice_active_payment on public.finance_tax_invoices(payment_id) where status in ('draft','issued');
create index tax_invoice_source_invoice on public.finance_tax_invoices(invoice_id);
create table public.finance_tax_point_events (
  id uuid primary key default gen_random_uuid(),
  tax_invoice_id uuid not null unique references public.finance_tax_invoices(id) on delete restrict,
  event_type text not null check(event_type='payment_received'),
  occurred_on date not null,
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  approved_at timestamptz,
  approved_by_user_id uuid references public.user_profiles(id),
  check((approved_at is null)=(approved_by_user_id is null))
);
-- Amount-bearing components and source coverage are separate, allowing later
-- partial/mixed support without rewriting an issued V1 component.
create table public.finance_tax_invoice_items (
  id uuid primary key default gen_random_uuid(),
  tax_invoice_id uuid not null references public.finance_tax_invoices(id) on delete restrict,
  invoice_item_id uuid not null references public.finance_invoice_items(id) on delete restrict,
  amount_before_vat numeric(14,2) not null check(amount_before_vat>0),
  vat_amount numeric(14,2) not null check(vat_amount>=0),
  total_amount numeric(14,2) not null check(total_amount=amount_before_vat+vat_amount),
  source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
  unique(tax_invoice_id,invoice_item_id)
);
create table public.finance_tax_invoice_source_coverages (
  id uuid primary key default gen_random_uuid(),
  tax_invoice_id uuid not null references public.finance_tax_invoices(id) on delete restrict,
  tax_invoice_item_id uuid not null unique references public.finance_tax_invoice_items(id) on delete restrict,
  invoice_item_id uuid not null references public.finance_invoice_items(id) on delete restrict,
  tax_point_event_id uuid not null references public.finance_tax_point_events(id) on delete restrict,
  status text not null check(status in ('reserved','issued','released')),
  amount_before_vat numeric(14,2) not null check(amount_before_vat>0),
  vat_amount numeric(14,2) not null check(vat_amount>=0),
  total_amount numeric(14,2) not null check(total_amount=amount_before_vat+vat_amount),
  source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object')
);
create unique index tax_invoice_full_line_coverage on public.finance_tax_invoice_source_coverages(invoice_item_id)
where status in ('reserved','issued');
create index tax_invoice_coverage_document on public.finance_tax_invoice_source_coverages(tax_invoice_id);
create table public.finance_tax_invoice_audit_events (
  id uuid primary key default gen_random_uuid(),
  tax_invoice_id uuid not null references public.finance_tax_invoices(id) on delete restrict,
  event_type text not null check(event_type in ('draft_created','draft_saved','draft_refreshed','issued','cancelled')),
  event_payload_json jsonb not null check(jsonb_typeof(event_payload_json)='object'),
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);
create index tax_invoice_audit_history on public.finance_tax_invoice_audit_events(tax_invoice_id,created_at);

alter table public.finance_tax_invoices enable row level security;
alter table public.finance_tax_invoice_items enable row level security;
alter table public.finance_tax_invoice_source_coverages enable row level security;
alter table public.finance_tax_point_events enable row level security;
alter table public.finance_tax_invoice_audit_events enable row level security;

create function public.build_finance_tax_invoice_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
declare p public.finance_payments%rowtype; i public.finance_invoices%rowtype;
  a record; item jsonb; source jsonb; company jsonb; seller jsonb;
begin
  select * into p from public.finance_payments where id=p_payment_id for update;
  if not found or p.status<>'confirmed' then raise exception 'TAX_INVOICE_CONFIRMED_PAYMENT_REQUIRED'; end if;
  if (select count(*) from public.finance_payment_effective_invoice_allocations where payment_id=p.id)<>1
  then raise exception 'TAX_INVOICE_MULTIPLE_SOURCES_UNSUPPORTED'; end if;
  select * into a from public.finance_payment_effective_invoice_allocations where payment_id=p.id;
  select * into i from public.finance_invoices where id=a.invoice_id for share;
  if i.document_status is distinct from 'issued' or i.source_model is distinct from 'billable_charge_v2'
    or i.issued_snapshot_json->>'schema_version' is distinct from '2'
    or i.issued_snapshot_json->>'source_model' is distinct from 'billable_charge_v2'
  then raise exception 'TAX_INVOICE_V2_ISSUED_SOURCE_REQUIRED'; end if;
  if jsonb_typeof(i.issued_snapshot_json->'items') is distinct from 'array' then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  if jsonb_array_length(i.issued_snapshot_json->'items')<>1 then raise exception 'TAX_INVOICE_MULTILINE_UNSUPPORTED'; end if;
  if p.currency<>'THB' or p.currency<>i.currency or p.client_id<>i.client_id then raise exception 'TAX_INVOICE_CONTEXT_UNSUPPORTED'; end if;
  if a.effective_settlement_total<>i.total_amount or p.settlement_amount<>i.total_amount
    or a.effective_cash_allocated<>p.cash_amount or a.effective_wht_credit_allocated<>p.wht_amount
    or exists(select 1 from public.finance_payment_effective_invoice_allocations e join public.finance_payments other on other.id=e.payment_id
      where e.invoice_id=i.id and e.payment_id<>p.id and other.status='confirmed')
  then raise exception 'TAX_INVOICE_PARTIAL_PAYMENT_UNSUPPORTED'; end if;
  item:=i.issued_snapshot_json #> '{items,0,invoice_item}';
  if item->>'invoice_id' is distinct from i.id::text or item->>'source_state' is distinct from 'active'
    or (select count(*) from public.finance_invoice_items where invoice_id=i.id and source_state='active')<>1
    or not exists(select 1 from public.finance_invoice_items where invoice_id=i.id and id::text=item->>'id' and source_state='active')
    or (item->>'amount_before_vat')::numeric is distinct from i.amount_before_vat
    or (item->>'vat_amount')::numeric is distinct from i.vat_amount
    or (item->>'line_total')::numeric is distinct from i.total_amount
    or (i.issued_snapshot_json #>> '{invoice,amount_before_vat}')::numeric is distinct from i.amount_before_vat
    or (i.issued_snapshot_json #>> '{invoice,vat_amount}')::numeric is distinct from i.vat_amount
    or (i.issued_snapshot_json #>> '{invoice,total_amount}')::numeric is distinct from i.total_amount
    or jsonb_typeof(item->'vat_applicable') is distinct from 'boolean'
    or i.amount_before_vat<=0 or i.vat_amount<0 or i.total_amount<>i.amount_before_vat+i.vat_amount
    or nullif(btrim(item->>'description'),'') is null or (item->>'vat_rate')::numeric is null
  then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  source:=public.build_finance_receipt_source(p.id);
  select to_jsonb(c) into company from public.finance_company_profiles c where id='default';
  seller:=source->'seller'||jsonb_build_object('vat_registered',true,'registration_basis','approved_vp_v1_policy',
    'branch_label_th',coalesce(nullif(btrim(company->>'branch_th'),''),nullif(btrim(company->>'branch_label'),'')),
    'branch_type',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then 'head_office' end,
    'branch_code',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then '00000' end);
  return source||jsonb_build_object('schema_version',1,'document_kind','tax_invoice','seller',seller,
    'invoice',i.issued_snapshot_json->'invoice','invoice_item',item,'invoice_snapshot',i.issued_snapshot_json,
    'receipt_reference',(select jsonb_build_object('id',r.id,'receipt_no',r.receipt_no,'issued_at',r.issued_at)
      from public.finance_receipts r where r.payment_id=p.id and r.status='issued'));
end;
$source$;

create function public.finance_tax_invoice_draft_snapshot(p_source jsonb,p_decisions jsonb,p_issue_date date)
returns jsonb language plpgsql immutable set search_path=public as $draft_snapshot$
declare customer jsonb:=p_source->'customer'; decisions jsonb:=coalesce(p_decisions,'{}'); branch text;
begin
  if jsonb_typeof(decisions)<>'object' or exists(select 1 from jsonb_object_keys(decisions) k where k not in
    ('tax_treatment','treatment_reason','buyer_vat_registered','customer_address','customer_tax_id','buyer_branch_type',
     'buyer_branch_code','identity_evidence','no_earlier_event','external_coverage_checked'))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if exists(select 1 from (values('buyer_vat_registered'),('no_earlier_event'),('external_coverage_checked')) f(key)
    where decisions ? f.key and jsonb_typeof(decisions->f.key) not in ('boolean','null'))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if exists(select 1 from jsonb_each(decisions) f where f.key not in ('buyer_vat_registered','no_earlier_event','external_coverage_checked')
    and (jsonb_typeof(f.value) not in ('string','null') or length(f.value #>> '{}')>2000))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if nullif(btrim(customer->>'address'),'') is not null and nullif(btrim(decisions->>'customer_address'),'') is not null
    and btrim(decisions->>'customer_address')<>customer->>'address'
    or nullif(btrim(customer->>'tax_id'),'') is not null and nullif(btrim(decisions->>'customer_tax_id'),'') is not null
    and btrim(decisions->>'customer_tax_id')<>customer->>'tax_id'
  then raise exception 'TAX_INVOICE_FROZEN_IDENTITY_CHANGE_BLOCKED'; end if;
  branch:=case when lower(customer->>'branch') in ('สำนักงานใหญ่','head office','00000') then 'head_office'
    else nullif(decisions->>'buyer_branch_type','') end;
  customer:=customer||jsonb_build_object('address',coalesce(nullif(btrim(customer->>'address'),''),nullif(btrim(decisions->>'customer_address'),'')),
    'tax_id',coalesce(nullif(btrim(customer->>'tax_id'),''),nullif(btrim(decisions->>'customer_tax_id'),'')),
    'vat_registered',decisions->'buyer_vat_registered','branch_type',branch,
    'branch_code',case when branch='head_office' then '00000' else nullif(btrim(decisions->>'buyer_branch_code'),'') end,
    'supplemental_evidence',nullif(btrim(decisions->>'identity_evidence'),''));
  return p_source||jsonb_build_object('customer',customer,'issue_date',p_issue_date,
    'tax_treatment',nullif(decisions->>'tax_treatment',''),'treatment_reason',nullif(btrim(decisions->>'treatment_reason'),''),
    'tax_point',jsonb_build_object('event_type','payment_received','date',p_source #> '{payment,received_on}',
      'no_earlier_event_acknowledged',coalesce(decisions->'no_earlier_event','false'::jsonb),'policy_version','vp_v1'),
    'external_coverage_checked',coalesce(decisions->'external_coverage_checked','false'::jsonb));
end;
$draft_snapshot$;

create function public.finance_tax_invoice_issue_blockers(p_snapshot jsonb)
returns text[] language plpgsql immutable set search_path=public as $blockers$
declare b text[]:='{}'; s jsonb:=p_snapshot->'seller'; c jsonb:=p_snapshot->'customer'; item jsonb:=p_snapshot->'invoice_item';
begin
  if nullif(btrim(s->>'company_name_th'),'') is null or nullif(btrim(s->>'address_th'),'') is null
    or coalesce(s->>'tax_id','')!~'^[0-9]{13}$' or s->>'branch_type' is distinct from 'head_office'
    or s->>'branch_code' is distinct from '00000' or s->'vat_registered' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_SELLER_IDENTITY_REQUIRED'); end if;
  if nullif(btrim(c->>'name'),'') is null or nullif(btrim(c->>'address'),'') is null
    or jsonb_typeof(c->'vat_registered') is distinct from 'boolean'
    or (c->'vat_registered'='true'::jsonb and (coalesce(c->>'tax_id','')!~'^[0-9]{13}$'
      or coalesce(c->>'branch_type','') not in ('head_office','branch') or coalesce(c->>'branch_code','')!~'^[0-9]{5}$'
      or (c->>'branch_type'='branch' and c->>'branch_code'='00000')))
    or ((nullif(btrim(p_snapshot #>> '{invoice_snapshot,invoice,customer_billing_address}'),'') is null
      and nullif(btrim(p_snapshot #>> '{invoice_snapshot,customer,address}'),'') is null)
      and nullif(btrim(c->>'supplemental_evidence'),'') is null)
    or (c->'vat_registered'='true'::jsonb and
      (nullif(btrim(p_snapshot #>> '{invoice_snapshot,customer,tax_id}'),'') is null
       or lower(coalesce(p_snapshot #>> '{invoice_snapshot,customer,branch}','')) not in ('สำนักงานใหญ่','head office','00000'))
      and nullif(btrim(c->>'supplemental_evidence'),'') is null)
  then b:=array_append(b,'TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED'); end if;
  if not coalesce((p_snapshot->>'tax_treatment'='standard_rated' and item->'vat_applicable'='true'::jsonb
      and (item->>'vat_rate')::numeric>0 and (item->>'vat_amount')::numeric>0)
    or (p_snapshot->>'tax_treatment'='zero_rated' and item->'vat_applicable'='true'::jsonb
      and (item->>'vat_rate')::numeric=0 and (item->>'vat_amount')::numeric=0
      and nullif(btrim(p_snapshot->>'treatment_reason'),'') is not null),false)
  then b:=array_append(b,'TAX_INVOICE_VAT_TREATMENT_UNRESOLVED'); end if;
  if p_snapshot #> '{tax_point,no_earlier_event_acknowledged}' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'); end if;
  if p_snapshot->'external_coverage_checked' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED'); end if;
  return b;
end;
$blockers$;

create function public.get_finance_tax_invoice_eligibility(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $eligibility$
declare source jsonb; existing public.finance_tax_invoices%rowtype;
begin
  if not public.current_user_can_view_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select * into existing from public.finance_tax_invoices where payment_id=p_payment_id and status in ('draft','issued');
  if found then return jsonb_build_object('can_prepare',false,'existing_id',existing.id,'existing_status',existing.status,'existing_number',existing.tax_invoice_no,
    'blockers',case when existing.status='issued' then array['TAX_INVOICE_ALREADY_COVERED'] else public.finance_tax_invoice_issue_blockers(existing.draft_snapshot_json) end); end if;
  begin source:=public.build_finance_tax_invoice_source(p_payment_id);
  exception when raise_exception then
    if sqlerrm like 'TAX_INVOICE_%' or sqlerrm like 'RECEIPT_%' then
      return jsonb_build_object('can_prepare',false,'blockers',array[sqlerrm]);
    end if; raise;
  end;
  if exists(select 1 from public.finance_tax_invoice_source_coverages where invoice_item_id::text=source #>> '{invoice_item,id}' and status in ('reserved','issued'))
  then return jsonb_build_object('can_prepare',false,'blockers',array['TAX_INVOICE_ALREADY_COVERED']); end if;
  return jsonb_build_object('can_prepare',true,'blockers',public.finance_tax_invoice_issue_blockers(public.finance_tax_invoice_draft_snapshot(source,'{}',(now() at time zone 'Asia/Bangkok')::date)));
end;
$eligibility$;

create function public.record_finance_tax_invoice_audit(p_id uuid,p_event text,p_payload jsonb)
returns void language sql security definer set search_path=public as $audit$
  insert into public.finance_tax_invoice_audit_events(tax_invoice_id,event_type,event_payload_json,actor_user_id)
  values(p_id,p_event,p_payload,auth.uid());
$audit$;

create function public.create_finance_tax_invoice_draft(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $create_draft$
declare source jsonb; existing uuid; id uuid; event_id uuid; item_id uuid; item jsonb; date_today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where finance_payments.id=p_payment_id for update;
  select t.id into existing from public.finance_tax_invoices t where t.payment_id=p_payment_id and t.status in ('draft','issued');
  if found then return existing; end if;
  source:=public.build_finance_tax_invoice_source(p_payment_id); item:=source->'invoice_item';
  if exists(select 1 from public.finance_tax_invoice_source_coverages c where c.invoice_item_id::text=item->>'id' and c.status in ('reserved','issued'))
  then raise exception 'TAX_INVOICE_ALREADY_COVERED'; end if;
  insert into public.finance_tax_invoices(payment_id,invoice_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id)
  values(p_payment_id,(source #>> '{invoice,id}')::uuid,(source #>> '{customer,id}')::uuid,date_today,source,
    public.finance_tax_invoice_draft_snapshot(source,'{}',date_today),auth.uid()) returning finance_tax_invoices.id into id;
  insert into public.finance_tax_point_events(tax_invoice_id,event_type,occurred_on,evidence_json)
  values(id,'payment_received',(source #>> '{payment,received_on}')::date,jsonb_build_object('payment',source->'payment','policy_version','vp_v1'))
  returning finance_tax_point_events.id into event_id;
  insert into public.finance_tax_invoice_items(tax_invoice_id,invoice_item_id,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
  values(id,(item->>'id')::uuid,(item->>'amount_before_vat')::numeric,(item->>'vat_amount')::numeric,(item->>'line_total')::numeric,item)
  returning finance_tax_invoice_items.id into item_id;
  insert into public.finance_tax_invoice_source_coverages(tax_invoice_id,tax_invoice_item_id,invoice_item_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
  values(id,item_id,(item->>'id')::uuid,event_id,'reserved',(item->>'amount_before_vat')::numeric,(item->>'vat_amount')::numeric,(item->>'line_total')::numeric,
    jsonb_build_object('invoice_id',source #> '{invoice,id}','payment_id',p_payment_id,'invoice_item',item,'rule','single_line_full_payment_v1'));
  perform public.record_finance_tax_invoice_audit(id,'draft_created',jsonb_build_object('payment_id',p_payment_id,'number_allocated',false));
  return id;
end;
$create_draft$;

create function public.save_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $save_draft$
declare t public.finance_tax_invoices%rowtype; snapshot jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if p_issue_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
    or p_issue_date<(t.source_snapshot_json #>> '{payment,received_on}')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  snapshot:=public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,p_decisions_json,p_issue_date);
  if snapshot=t.draft_snapshot_json and p_decisions_json=t.decisions_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=case when p_decisions_json->'no_earlier_event'='true'::jsonb then now() end,
    approved_by_user_id=case when p_decisions_json->'no_earlier_event'='true'::jsonb then auth.uid() end where tax_invoice_id=t.id;
  update public.finance_tax_invoices set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=snapshot,updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_saved',jsonb_build_object('previous_decisions',t.decisions_json,'decisions',p_decisions_json,'issue_date',p_issue_date));
  return t.id;
end;
$save_draft$;

create function public.refresh_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $refresh_draft$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  source:=public.build_finance_tax_invoice_source(pid);
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if source->'invoice_item' is distinct from t.source_snapshot_json->'invoice_item'
    or source->'payment' is distinct from t.source_snapshot_json->'payment'
  then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if source=t.source_snapshot_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=null,approved_by_user_id=null where tax_invoice_id=t.id;
  update public.finance_tax_invoices set source_snapshot_json=source,decisions_json='{}',
    draft_snapshot_json=public.finance_tax_invoice_draft_snapshot(source,'{}',t.issue_date),updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_refreshed',jsonb_build_object('approvals_reset',true));
  return t.id;
end;
$refresh_draft$;

create function public.issue_finance_tax_invoice(p_tax_invoice_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $issue$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid; number text; event public.finance_tax_point_events%rowtype; snapshot jsonb; moment timestamptz:=now(); b text[];
begin
  if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'TAX_INVOICE_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='issued' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  source:=public.build_finance_tax_invoice_source(pid);
  if source is distinct from t.source_snapshot_json then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if p_reviewed_snapshot_json is distinct from t.draft_snapshot_json then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  b:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(b)>0 then raise exception using message=b[1]; end if;
  select * into strict event from public.finance_tax_point_events where tax_invoice_id=t.id;
  if event.approved_at is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if t.issue_date<event.occurred_on or t.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if t.issue_date>event.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id and status='reserved' for update;
  number:=public.generate_finance_document_no('tax_invoice',t.issue_date);
  snapshot:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(event),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,
      'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=snapshot,updated_at=moment where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'tax_point_date',event.occurred_on,'issue_date',t.issue_date,
    'delayed_issue_acknowledged',t.issue_date>event.occurred_on and p_delayed_issue_acknowledged,'decisions',t.decisions_json,
    'documentary_only',true,'payment_changed',false,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false,'receipt_changed',false));
  return t.id;
end;
$issue$;

create function public.cancel_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare t public.finance_tax_invoices%rowtype; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'TAX_INVOICE_REASON_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='cancelled' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  update public.finance_tax_invoice_source_coverages set status='released' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='cancelled',cancelled_at=now(),cancelled_by_user_id=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'coverage_released',true));
  return t.id;
end;
$cancel$;

create function public.protect_finance_tax_invoice_history()
returns trigger language plpgsql security definer set search_path=public as $history$
declare state text;
begin
  if tg_op='DELETE' or tg_table_name='finance_tax_invoice_audit_events' then raise exception 'TAX_INVOICE_HISTORY_IMMUTABLE'; end if;
  if tg_table_name='finance_tax_invoices' then
    if old.status<>'draft' or new.id<>old.id or new.payment_id<>old.payment_id or new.invoice_id<>old.invoice_id
      or new.client_id<>old.client_id or new.created_at<>old.created_at or new.created_by_user_id<>old.created_by_user_id
    then raise exception 'TAX_INVOICE_HISTORY_IMMUTABLE'; end if;
  else
    select status into state from public.finance_tax_invoices where id=old.tax_invoice_id;
    if state<>'draft' or new.tax_invoice_id<>old.tax_invoice_id or new.id<>old.id then raise exception 'TAX_INVOICE_HISTORY_IMMUTABLE'; end if;
    if tg_table_name='finance_tax_invoice_items' then raise exception 'TAX_INVOICE_SOURCE_IMMUTABLE'; end if;
    if tg_table_name='finance_tax_invoice_source_coverages' and
      (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'TAX_INVOICE_SOURCE_IMMUTABLE'; end if;
    if tg_table_name='finance_tax_point_events' and
      (to_jsonb(new)-array['approved_at','approved_by_user_id']) is distinct from (to_jsonb(old)-array['approved_at','approved_by_user_id'])
    then raise exception 'TAX_INVOICE_SOURCE_IMMUTABLE'; end if;
  end if;
  return new;
end;
$history$;

create function public.validate_finance_tax_invoice_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
declare t public.finance_tax_invoices%rowtype; v_id uuid; c record; item jsonb; point public.finance_tax_point_events%rowtype;
begin
  if tg_table_name='finance_tax_invoices' then v_id:=new.id; else v_id:=new.tax_invoice_id; end if;
  select * into strict t from public.finance_tax_invoices where finance_tax_invoices.id=v_id;
  item:=t.source_snapshot_json->'invoice_item';
  if t.draft_snapshot_json is distinct from public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,t.decisions_json,t.issue_date)
    or t.payment_id::text is distinct from t.source_snapshot_json #>> '{payment,id}'
    or t.invoice_id::text is distinct from t.source_snapshot_json #>> '{invoice,id}'
    or t.client_id::text is distinct from t.source_snapshot_json #>> '{customer,id}'
  then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  if (select count(*) from public.finance_tax_invoice_items where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_point_events where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id)<>1
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id;
  if point.event_type<>'payment_received' or point.occurred_on is distinct from (t.source_snapshot_json #>> '{payment,received_on}')::date
    or point.evidence_json is distinct from jsonb_build_object('payment',t.source_snapshot_json->'payment','policy_version','vp_v1')
    or ((t.decisions_json->'no_earlier_event'='true'::jsonb) is true)<>(point.approved_at is not null)
  then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  select coverage.*,i.invoice_item_id as item_source_id,i.amount_before_vat as ib,i.vat_amount as iv,i.total_amount as it,i.source_snapshot_json as frozen_item
  into strict c from public.finance_tax_invoice_source_coverages coverage join public.finance_tax_invoice_items i on i.id=coverage.tax_invoice_item_id
  where coverage.tax_invoice_id=t.id and i.tax_invoice_id=t.id;
  if c.invoice_item_id<>c.item_source_id or c.invoice_item_id::text is distinct from item->>'id' or c.tax_point_event_id<>point.id
    or c.amount_before_vat<>c.ib or c.vat_amount<>c.iv or c.total_amount<>c.it
    or c.ib is distinct from (item->>'amount_before_vat')::numeric or c.iv is distinct from (item->>'vat_amount')::numeric or c.it is distinct from (item->>'line_total')::numeric
    or c.frozen_item is distinct from item or c.status<>(case t.status when 'draft' then 'reserved' when 'issued' then 'issued' else 'released' end)
    or c.source_snapshot_json is distinct from jsonb_build_object('invoice_id',t.source_snapshot_json #> '{invoice,id}',
      'payment_id',t.payment_id,'invoice_item',item,'rule','single_line_full_payment_v1')
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  if t.status='issued' then
    if cardinality(public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json))>0
      or t.issued_snapshot_json->>'document_kind' is distinct from 'tax_invoice'
      or t.issued_snapshot_json->'schema_version' is distinct from '1'::jsonb
      or (t.issued_snapshot_json-array['document','tax_point']) is distinct from (t.draft_snapshot_json-'tax_point')
      or t.issued_snapshot_json #>> '{document,tax_invoice_no}' is distinct from t.tax_invoice_no
      or t.issued_snapshot_json #>> '{document,id}' is distinct from t.id::text
      or (t.issued_snapshot_json #>> '{document,issue_date}')::date is distinct from t.issue_date
      or (t.issued_snapshot_json #>> '{document,issued_at}')::timestamptz is distinct from t.issued_at
      or t.issued_snapshot_json #>> '{document,issued_by_user_id}' is distinct from t.issued_by_user_id::text
      or t.issued_snapshot_json->'tax_point' is distinct from (t.draft_snapshot_json->'tax_point'||to_jsonb(point))
      or t.issued_snapshot_json #> '{seller,logo_asset}' is distinct from public.document_logo_evidence(t.issued_snapshot_json #>> '{seller,logo_asset,path}')
    then raise exception 'TAX_INVOICE_ISSUED_EVIDENCE_INVALID'; end if;
    if not exists(select 1 from public.finance_tax_invoice_audit_events where tax_invoice_id=t.id and event_type='issued'
      and event_payload_json->>'tax_invoice_no'=t.tax_invoice_no and actor_user_id=t.issued_by_user_id
      and (t.issue_date=point.occurred_on or event_payload_json->'delayed_issue_acknowledged'='true'::jsonb))
    then raise exception 'TAX_INVOICE_ISSUE_AUDIT_REQUIRED'; end if;
  end if;
  return new;
end;
$integrity$;

do $tables$
declare name text;
begin
  foreach name in array array['finance_tax_invoices','finance_tax_invoice_items','finance_tax_invoice_source_coverages','finance_tax_point_events','finance_tax_invoice_audit_events'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',name);
    execute format('grant select on table public.%I to authenticated',name);
    execute format('create policy tax_invoice_read on public.%I for select to authenticated using(public.current_user_can_view_finance_tax_invoices())',name);
    execute format('create trigger tax_invoice_history before update or delete on public.%I for each row execute function public.protect_finance_tax_invoice_history()',name);
    execute format('create constraint trigger tax_invoice_integrity after insert or update on public.%I deferrable initially deferred for each row execute function public.validate_finance_tax_invoice_integrity()',name);
  end loop;
end;
$tables$;
create policy tax_invoice_document_logos_read on storage.objects for select to authenticated
using(bucket_id='vp-document-assets' and name like 'company/logo/%' and public.current_user_can_view_finance_tax_invoices());

create function public.assert_finance_tax_invoice_dependencies(p_payment_id uuid,p_invoice_ids uuid[])
returns void language plpgsql security definer set search_path=public as $dependency$
begin
  if exists(select 1 from public.finance_tax_invoices t where t.status in ('draft','issued') and
    (t.payment_id=p_payment_id or t.invoice_id=any(p_invoice_ids) or exists(
      select 1 from public.finance_tax_invoice_source_coverages c join public.finance_invoice_items i on i.id=c.invoice_item_id
      where c.tax_invoice_id=t.id and c.status in ('reserved','issued') and i.invoice_id=any(p_invoice_ids))))
  then raise exception 'TAX_INVOICE_ACTIVE_DEPENDENCY'; end if;
end;
$dependency$;
revoke all on function public.assert_finance_tax_invoice_dependencies(uuid,uuid[]) from public,anon,authenticated;

create function public.guard_finance_tax_invoice_upstream()
returns trigger language plpgsql security definer set search_path=public as $upstream$
begin
  if tg_table_name='finance_payments' then
    if old.status='confirmed' and new.status<>'confirmed' then perform public.assert_finance_tax_invoice_dependencies(old.id,null); end if;
  elsif tg_table_name='finance_invoices' then
    if old.document_status='issued' and new.document_status<>'issued' then perform public.assert_finance_tax_invoice_dependencies(null,array[old.id]); end if;
  elsif tg_table_name='finance_payment_allocation_reallocations' then
    perform public.assert_finance_tax_invoice_dependencies(new.payment_id,array[new.source_invoice_id,new.target_invoice_id]);
  elsif tg_table_name='finance_receipts' then
    if old.status='issued' and new.status<>'issued' then
      if exists(select 1 from public.finance_tax_invoices t where t.status in ('draft','issued') and t.source_snapshot_json #>> '{receipt_reference,id}'=old.id::text)
      then raise exception 'TAX_INVOICE_ACTIVE_DEPENDENCY'; end if;
    end if;
  end if;
  return new;
end;
$upstream$;
revoke all on function public.guard_finance_tax_invoice_upstream() from public,anon,authenticated;
create trigger tax_invoice_payment_guard before update on public.finance_payments for each row execute function public.guard_finance_tax_invoice_upstream();
create trigger tax_invoice_invoice_guard before update on public.finance_invoices for each row execute function public.guard_finance_tax_invoice_upstream();
create trigger tax_invoice_receipt_guard before update on public.finance_receipts for each row execute function public.guard_finance_tax_invoice_upstream();
create trigger tax_invoice_reallocation_guard before insert on public.finance_payment_allocation_reallocations for each row execute function public.guard_finance_tax_invoice_upstream();

-- BEGIN GENERATED ALLOCATOR AND DEPENDENCY INTEGRATION
create or replace function public.generate_finance_document_no(
  p_doc_type text,
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_type text := lower(trim(coalesce(p_doc_type, '')));
  v_counter_type text;
  v_year integer := extract(year from p_issue_date)::integer;
  v_month integer;
  v_prefix_code text;
  v_prefix text;
  v_next integer;
  v_width integer := 4;
  v_period_scope text;
begin
  if v_input_type = '' then raise exception 'Document type is required'; end if;
  if p_issue_date is null then raise exception 'Document issue date is required'; end if;
  if v_input_type = 'tax_invoice' then
    if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  elsif v_input_type = 'receipt' then
    if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  elsif not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to allocate document number';
  end if;

  if v_input_type in ('fee_agreement', 'invoice', 'receipt', 'tax_invoice') then
    select display_prefix, period_scope, sequence_width
      into v_prefix_code, v_period_scope, v_width
    from public.document_numbering_profiles
    where document_type = v_input_type and is_active;
    if v_prefix_code is null then raise exception 'Document numbering profile is not active'; end if;
    if v_input_type = 'receipt' and (v_prefix_code <> 'VP-RC' or v_period_scope <> 'monthly' or v_width <> 6) then
      raise exception 'RECEIPT_NUMBERING_PROFILE_INVALID';
    end if;
    if v_input_type = 'tax_invoice' and (v_prefix_code <> 'VP-TI' or v_period_scope <> 'monthly' or v_width <> 6) then
      raise exception 'TAX_INVOICE_NUMBERING_PROFILE_INVALID';
    end if;
    v_counter_type := v_input_type;
    v_month := case when v_period_scope = 'annual' then null else extract(month from p_issue_date)::integer end;
    v_prefix := v_prefix_code || '-' || case
      when v_period_scope = 'annual' then to_char(p_issue_date, 'YYYY')
      else to_char(p_issue_date, 'YYYYMM')
    end || '-';
  else
    v_counter_type := upper(v_input_type);
    v_month := extract(month from p_issue_date)::integer;
    if v_counter_type = 'QT' then
      select nullif(trim(quotation_prefix), '') into v_prefix_code
      from public.finance_company_profiles where id = 'default';
      v_prefix_code := coalesce(v_prefix_code, 'VP-QT');
    else
      v_prefix_code := v_counter_type;
    end if;
    v_prefix := v_prefix_code || '-' || to_char(p_issue_date, 'YYYYMM') || '-';
  end if;

  insert into public.finance_document_counters (doc_type, year, month, prefix, last_no)
  values (v_counter_type, v_year, v_month, v_prefix, 1)
  on conflict (doc_type, year, (coalesce(month, 0))) do update set
    last_no = public.finance_document_counters.last_no + 1,
    prefix = excluded.prefix,
    updated_at = now()
  returning last_no into v_next;

  if v_input_type in ('receipt','tax_invoice') and length(v_next::text) > v_width then
    raise exception using message = case when v_input_type='tax_invoice' then 'TAX_INVOICE_NUMBERING_EXHAUSTED' else 'RECEIPT_NUMBERING_EXHAUSTED' end;
  end if;
  return v_prefix || lpad(v_next::text, v_width, '0');
end;
$$;

revoke all on function public.generate_finance_document_no(text,date) from public,anon,authenticated;

create or replace function public.assert_finance_payment_has_no_downstream_dependencies(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $payment_downstream_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  perform public.assert_finance_tax_invoice_dependencies(p_payment_id,null);
  perform public.assert_finance_receipt_dependencies(p_payment_id,null);
  if exists (
    select 1
    from public.finance_cash_transactions as cash_transaction
    where cash_transaction.source_payment_id = p_payment_id
      and cash_transaction.reversal_of_transaction_id is null
  ) then
    raise exception using message = 'FINANCE_PAYMENT_HAS_CASH_TRANSACTION';
  end if;

  -- Retain the conservative downstream registry until each module provides
  -- its own coordinated reversal contract.
  for v_dependency in
    select *
    from (
      values
        ('finance_receipts', 'payment_id'),
        ('finance_receipts', 'source_payment_id'),
        ('finance_receipt_payment_allocations', 'payment_id'),
        ('finance_tax_invoices', 'payment_id'),
        ('finance_tax_invoices', 'source_payment_id'),
        ('finance_company_ledger', 'source_payment_id'),
        ('finance_payment_ledger_postings', 'payment_id'),
        ('finance_revenue_allocations', 'payment_id'),
        ('finance_revenue_allocations', 'source_payment_id'),
        ('finance_compensation_batches', 'source_payment_id')
    ) as dependency(table_name, column_name)
  loop
    -- These known 037 references are checked above by active issued lifecycle.
    -- Unknown/future Receipt columns and all other registries stay fail-closed.
    if v_dependency.table_name = 'finance_tax_invoices'
      or (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
      or (v_dependency.table_name = 'finance_receipt_invoice_allocations' and v_dependency.column_name = 'invoice_id')
    then continue; end if;
    if to_regclass('public.' || v_dependency.table_name) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = v_dependency.table_name
          and column_name = v_dependency.column_name
      )
    then
      execute format(
        'select exists (select 1 from public.%I where %I = $1)',
        v_dependency.table_name,
        v_dependency.column_name
      )
      into v_exists
      using p_payment_id;

      if v_exists then
        raise exception 'Payment has downstream records and requires coordinated reversal';
      end if;
    end if;
  end loop;
end;
$payment_downstream_guard$;

create or replace function public.assert_finance_erroneous_payment_correction_dependencies(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $erroneous_payment_dependency_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  perform public.assert_finance_tax_invoice_dependencies(p_payment_id,null);
  perform public.assert_finance_receipt_dependencies(p_payment_id,null);
  -- The expected original Payment-linked Cash Transaction is deliberately not
  -- in this registry. It is validated and corrected by the coordinated helper.
  -- Every other discovered financial, tax, refund, or revenue dependency stays
  -- fail-closed until that module provides its own coordinated correction.
  for v_dependency in
    select *
    from (
      values
        ('finance_receipts', 'payment_id'),
        ('finance_receipts', 'source_payment_id'),
        ('finance_receipt_payment_allocations', 'payment_id'),
        ('finance_tax_invoices', 'payment_id'),
        ('finance_tax_invoices', 'source_payment_id'),
        ('finance_wht_certificates', 'payment_id'),
        ('finance_wht_certificates', 'source_payment_id'),
        ('finance_withholding_tax_certificates', 'payment_id'),
        ('finance_withholding_tax_certificates', 'source_payment_id'),
        ('finance_payment_wht_certificates', 'payment_id'),
        ('finance_customer_refunds', 'payment_id'),
        ('finance_customer_refunds', 'source_payment_id'),
        ('finance_refunds', 'payment_id'),
        ('finance_refunds', 'source_payment_id'),
        ('finance_payment_refunds', 'payment_id'),
        ('finance_company_ledger', 'source_payment_id'),
        ('finance_payment_ledger_postings', 'payment_id'),
        ('finance_revenue_allocations', 'payment_id'),
        ('finance_revenue_allocations', 'source_payment_id'),
        ('finance_compensation_batches', 'source_payment_id')
    ) as dependency(table_name, column_name)
  loop
    -- These known 037 references are checked above by active issued lifecycle.
    -- Unknown/future Receipt columns and all other registries stay fail-closed.
    if v_dependency.table_name = 'finance_tax_invoices'
      or (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
      or (v_dependency.table_name = 'finance_receipt_invoice_allocations' and v_dependency.column_name = 'invoice_id')
    then continue; end if;
    if to_regclass('public.' || v_dependency.table_name) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = v_dependency.table_name
          and column_name = v_dependency.column_name
      )
    then
      execute format(
        'select exists (select 1 from public.%I where %I = $1)',
        v_dependency.table_name,
        v_dependency.column_name
      )
      into v_exists
      using p_payment_id;

      if v_exists then
        raise exception using message = 'FINANCE_PAYMENT_CORRECTION_HAS_DOWNSTREAM_DEPENDENCIES';
      end if;
    end if;
  end loop;
end;
$erroneous_payment_dependency_guard$;

create or replace function public.assert_finance_payment_reallocation_dependencies(
  p_payment_id uuid,
  p_source_invoice_id uuid,
  p_target_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $payment_reallocation_dependency_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  perform public.assert_finance_tax_invoice_dependencies(p_payment_id,array[p_source_invoice_id,p_target_invoice_id]);
  perform public.assert_finance_receipt_dependencies(p_payment_id,array[p_source_invoice_id,p_target_invoice_id]);
  -- The expected Payment-linked Cash Transaction is intentionally absent:
  -- allocation correction never changes the Payment or its Cash fact.
  for v_dependency in
    select * from (
      values
        ('payment', 'finance_receipts', 'payment_id'),
        ('payment', 'finance_receipts', 'source_payment_id'),
        ('payment', 'finance_receipt_payment_allocations', 'payment_id'),
        ('payment', 'finance_tax_invoices', 'payment_id'),
        ('payment', 'finance_tax_invoices', 'source_payment_id'),
        ('payment', 'finance_wht_certificates', 'payment_id'),
        ('payment', 'finance_wht_certificates', 'source_payment_id'),
        ('payment', 'finance_withholding_tax_certificates', 'payment_id'),
        ('payment', 'finance_withholding_tax_certificates', 'source_payment_id'),
        ('payment', 'finance_payment_wht_certificates', 'payment_id'),
        ('payment', 'finance_customer_refunds', 'payment_id'),
        ('payment', 'finance_customer_refunds', 'source_payment_id'),
        ('payment', 'finance_refunds', 'payment_id'),
        ('payment', 'finance_refunds', 'source_payment_id'),
        ('payment', 'finance_payment_refunds', 'payment_id'),
        ('payment', 'finance_company_ledger', 'source_payment_id'),
        ('payment', 'finance_payment_ledger_postings', 'payment_id'),
        ('payment', 'finance_revenue_allocations', 'payment_id'),
        ('payment', 'finance_revenue_allocations', 'source_payment_id'),
        ('payment', 'finance_compensation_batches', 'source_payment_id'),
        ('invoice', 'finance_receipts', 'invoice_id'),
        ('invoice', 'finance_receipts', 'source_invoice_id'),
        ('invoice', 'finance_receipt_invoice_allocations', 'invoice_id'),
        ('invoice', 'finance_tax_invoices', 'invoice_id'),
        ('invoice', 'finance_tax_invoices', 'source_invoice_id'),
        ('invoice', 'finance_wht_certificates', 'invoice_id'),
        ('invoice', 'finance_wht_certificates', 'source_invoice_id'),
        ('invoice', 'finance_withholding_tax_certificates', 'invoice_id'),
        ('invoice', 'finance_withholding_tax_certificates', 'source_invoice_id'),
        ('invoice', 'finance_credit_notes', 'invoice_id'),
        ('invoice', 'finance_credit_notes', 'source_invoice_id'),
        ('invoice', 'finance_invoice_credit_note_allocations', 'invoice_id'),
        ('invoice', 'finance_customer_refunds', 'invoice_id'),
        ('invoice', 'finance_refunds', 'invoice_id'),
        ('invoice', 'finance_company_ledger', 'source_invoice_id'),
        ('invoice', 'finance_invoice_ledger_postings', 'invoice_id'),
        ('invoice', 'finance_revenue_allocations', 'invoice_id'),
        ('invoice', 'finance_revenue_allocations', 'source_invoice_id'),
        ('invoice', 'finance_compensation_batches', 'source_invoice_id')
    ) as dependency(scope, table_name, column_name)
  loop
    -- These known 037 references are checked above by active issued lifecycle.
    -- Unknown/future Receipt columns and all other registries stay fail-closed.
    if v_dependency.table_name = 'finance_tax_invoices'
      or (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
      or (v_dependency.table_name = 'finance_receipt_invoice_allocations' and v_dependency.column_name = 'invoice_id')
    then continue; end if;
    if to_regclass('public.' || v_dependency.table_name) is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = v_dependency.table_name
          and column_name = v_dependency.column_name
      )
    then
      if v_dependency.scope = 'payment' then
        execute format(
          'select exists (select 1 from public.%I where %I = $1)',
          v_dependency.table_name,
          v_dependency.column_name
        ) into v_exists using p_payment_id;
      else
        execute format(
          'select exists (select 1 from public.%I where %I = any($1))',
          v_dependency.table_name,
          v_dependency.column_name
        ) into v_exists using array[p_source_invoice_id, p_target_invoice_id];
      end if;

      if v_exists then
        raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_HAS_DOWNSTREAM_DEPENDENCIES';
      end if;
    end if;
  end loop;
end;
$payment_reallocation_dependency_guard$;

create or replace function public.assert_finance_invoice_has_no_void_dependencies(
  p_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $invoice_void_dependency_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  perform public.assert_finance_tax_invoice_dependencies(null,array[p_invoice_id]);
  perform public.assert_finance_receipt_dependencies(null,array[p_invoice_id]);
  if p_invoice_id is null then
    raise exception 'Invoice is required for downstream dependency validation';
  end if;

  -- Future downstream migrations must retain or extend this conservative
  -- registry before exposing Invoice-linked documents. A recognized reference
  -- blocks Void until that module provides a coordinated lifecycle contract.
  for v_dependency in
    select *
    from (
      values
        ('finance_receipts', 'invoice_id'),
        ('finance_receipts', 'source_invoice_id'),
        ('finance_receipt_invoice_allocations', 'invoice_id'),
        ('finance_tax_invoices', 'invoice_id'),
        ('finance_tax_invoices', 'source_invoice_id'),
        ('finance_credit_notes', 'invoice_id'),
        ('finance_credit_notes', 'source_invoice_id'),
        ('finance_invoice_credit_note_allocations', 'invoice_id'),
        ('finance_company_ledger', 'source_invoice_id'),
        ('finance_invoice_ledger_postings', 'invoice_id'),
        ('finance_revenue_allocations', 'invoice_id'),
        ('finance_revenue_allocations', 'source_invoice_id'),
        ('finance_compensation_batches', 'source_invoice_id')
    ) as dependency(table_name, column_name)
  loop
    -- These known 037 references are checked above by active issued lifecycle.
    -- Unknown/future Receipt columns and all other registries stay fail-closed.
    if v_dependency.table_name = 'finance_tax_invoices'
      or (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
      or (v_dependency.table_name = 'finance_receipt_invoice_allocations' and v_dependency.column_name = 'invoice_id')
    then continue; end if;
    if to_regclass('public.' || v_dependency.table_name) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = v_dependency.table_name
          and column_name = v_dependency.column_name
      )
    then
      execute format(
        'select exists (select 1 from public.%I where %I = $1)',
        v_dependency.table_name,
        v_dependency.column_name
      )
      into v_exists
      using p_invoice_id;

      if v_exists then
        raise exception 'Invoice has a downstream document dependency and cannot be voided';
      end if;
    end if;
  end loop;
end;
$invoice_void_dependency_guard$;
-- END GENERATED ALLOCATOR AND DEPENDENCY INTEGRATION

do $permissions$
declare fn record;
begin
  for fn in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'current_user_can_view_finance_tax_invoices','current_user_can_manage_finance_tax_invoices','current_user_can_issue_finance_tax_invoices',
      'protect_finance_tax_invoice_permissions','build_finance_tax_invoice_source','finance_tax_invoice_draft_snapshot','finance_tax_invoice_issue_blockers',
      'get_finance_tax_invoice_eligibility','record_finance_tax_invoice_audit','create_finance_tax_invoice_draft','save_finance_tax_invoice_draft',
      'refresh_finance_tax_invoice_draft','issue_finance_tax_invoice','cancel_finance_tax_invoice_draft','protect_finance_tax_invoice_history','validate_finance_tax_invoice_integrity')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    if fn.proname in ('current_user_can_view_finance_tax_invoices','current_user_can_manage_finance_tax_invoices','current_user_can_issue_finance_tax_invoices',
      'get_finance_tax_invoice_eligibility','create_finance_tax_invoice_draft','save_finance_tax_invoice_draft','refresh_finance_tax_invoice_draft',
      'issue_finance_tax_invoice','cancel_finance_tax_invoice_draft') then execute format('grant execute on function %s to authenticated',fn.signature); end if;
  end loop;
end;
$permissions$;
