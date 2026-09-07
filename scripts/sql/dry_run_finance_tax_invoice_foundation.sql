BEGIN;
-- Manual schema rehearsal only. No business lifecycle calls.
-- BEGIN EMBEDDED MIGRATION 039
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
-- END EMBEDDED MIGRATION 039
-- Phase 6B manual SQL Editor review: ONE SELECT-only statement, ONE result row.
-- No lifecycle RPC calls. No business writes. Global Ledger counts are observation only.
-- Compare protected full-row hashes before/after apply; fixed facts are independently checked.
-- Technical catalog checks cannot verify external/manual VAT coverage or legal tax-point facts.
-- Those remain mandatory human decisions at Issue, not approval granted by this script.
with expected_functions(name,signature,body_hash,definer,callable) as (values
  ('current_user_can_view_finance_tax_invoices','public.current_user_can_view_finance_tax_invoices()','61b920f71b441ab396a6058f9903c903',true,true),
  ('current_user_can_manage_finance_tax_invoices','public.current_user_can_manage_finance_tax_invoices()','d049e03a67dd6c81f2309d134138dcb6',true,true),
  ('current_user_can_issue_finance_tax_invoices','public.current_user_can_issue_finance_tax_invoices()','6a613b3a2687144ca420f2aea28ffa0a',true,true),
  ('protect_finance_tax_invoice_permissions','public.protect_finance_tax_invoice_permissions()','cb5196416e6aa3d43b8f95296750fdcc',true,false),
  ('build_finance_tax_invoice_source','public.build_finance_tax_invoice_source(uuid)','be385f81fd68a12a3929901550ae7106',true,false),
  ('finance_tax_invoice_draft_snapshot','public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','e49e30e3642346e411eb479c3c172521',false,false),
  ('finance_tax_invoice_issue_blockers','public.finance_tax_invoice_issue_blockers(jsonb)','9956fcd2141247a996e3ac72600eff67',false,false),
  ('get_finance_tax_invoice_eligibility','public.get_finance_tax_invoice_eligibility(uuid)','d1517db4abb2c4437225928bee6c8173',true,true),
  ('record_finance_tax_invoice_audit','public.record_finance_tax_invoice_audit(uuid,text,jsonb)','d1d553369d3a1da5db5e1463c7c57ed5',true,false),
  ('create_finance_tax_invoice_draft','public.create_finance_tax_invoice_draft(uuid)','36460837a51d8bf25e3c15c8071cccf8',true,true),
  ('save_finance_tax_invoice_draft','public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz)','982f39ad0345366279a9c49b45a081e3',true,true),
  ('refresh_finance_tax_invoice_draft','public.refresh_finance_tax_invoice_draft(uuid,timestamptz)','dde80410373f2c781a6900b8edc2bbfd',true,true),
  ('issue_finance_tax_invoice','public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','82817a02817e85f05d992ab05ad3f183',true,true),
  ('cancel_finance_tax_invoice_draft','public.cancel_finance_tax_invoice_draft(uuid,text)','f8b815d6f05e1b217e816a1db65fb4b1',true,true),
  ('protect_finance_tax_invoice_history','public.protect_finance_tax_invoice_history()','b901f3edfabaa50b2259d76c531bb2b5',true,false),
  ('validate_finance_tax_invoice_integrity','public.validate_finance_tax_invoice_integrity()','b67d9db41ffb7c4407f62ce5f523eed6',true,false),
  ('assert_finance_tax_invoice_dependencies','public.assert_finance_tax_invoice_dependencies(uuid,uuid[])','e690121c3d9580a526b6fb4403c2a35d',true,false),
  ('guard_finance_tax_invoice_upstream','public.guard_finance_tax_invoice_upstream()','5dd37d44c791f9894cde57b6c25c2cef',true,false),
  ('generate_finance_document_no','public.generate_finance_document_no(text,date)','ab7482a8fee260d784ee579184d59517',true,false),
  ('assert_finance_payment_has_no_downstream_dependencies','public.assert_finance_payment_has_no_downstream_dependencies(uuid)','8fa53aace141bd6f6776cf3a36138ace',true,false),
  ('assert_finance_erroneous_payment_correction_dependencies','public.assert_finance_erroneous_payment_correction_dependencies(uuid)','ba3f4bb61867f1b9377754654c3e87a2',true,false),
  ('assert_finance_payment_reallocation_dependencies','public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)','d417d76282ec8d49036ad7d8e0820931',true,false),
  ('assert_finance_invoice_has_no_void_dependencies','public.assert_finance_invoice_has_no_void_dependencies(uuid)','fa8d75dd42f45c8b8d89350d340861a4',true,false)
), function_facts as (select e.*,p.oid,p.prosecdef,p.proconfig,md5(p.prosrc)=e.body_hash as exact_body,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
expected_tables as (select value as spec from jsonb_array_elements('[
  {
    "name": "finance_tax_invoice_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_type",
        "type": "text",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_payload_json",
        "type": "jsonb",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 6,
        "has_default": true,
        "default_expression": "now()"
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_audit_events_actor_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoice_audit_events_event_payload_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_audit_events_event_type_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''draft_refreshed''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_tax_invoice_audit_events_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_audit_events_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_audit_events_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_audit_events_pkey ON public.finance_tax_invoice_audit_events USING btree (id)"
      },
      {
        "name": "tax_invoice_audit_history",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_audit_history ON public.finance_tax_invoice_audit_events USING btree (tax_invoice_id, created_at)"
      }
    ]
  },
  {
    "name": "finance_tax_invoice_items",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "amount_before_vat",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "vat_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "total_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_items_amount_before_vat_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((amount_before_vat > (0)::numeric))"
      },
      {
        "name": "finance_tax_invoice_items_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((total_amount = (amount_before_vat + vat_amount)))"
      },
      {
        "name": "finance_tax_invoice_items_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_items_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_items_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_id, invoice_item_id)"
      },
      {
        "name": "finance_tax_invoice_items_vat_amount_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((vat_amount >= (0)::numeric))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_items_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_items_pkey ON public.finance_tax_invoice_items USING btree (id)"
      },
      {
        "name": "finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_items_tax_invoice_id_invoice_item_id_key ON public.finance_tax_invoice_items USING btree (tax_invoice_id, invoice_item_id)"
      }
    ]
  },
  {
    "name": "finance_tax_invoice_source_coverages",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "tax_invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_item_id",
        "type": "uuid",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "tax_point_event_id",
        "type": "uuid",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "status",
        "type": "text",
        "not_null": true,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "amount_before_vat",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "vat_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 8,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "total_amount",
        "type": "numeric(14,2)",
        "not_null": true,
        "position": 9,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 10,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoice_source_coverages_amount_before_vat_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((amount_before_vat > (0)::numeric))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((total_amount = (amount_before_vat + vat_amount)))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_status_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((status = ANY (ARRAY[''reserved''::text, ''issued''::text, ''released''::text])))"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_item_id) REFERENCES finance_tax_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_point_event_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_point_event_id) REFERENCES finance_tax_point_events(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoice_source_coverages_vat_amount_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((vat_amount >= (0)::numeric))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoice_source_coverages_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_source_coverages_pkey ON public.finance_tax_invoice_source_coverages USING btree (id)"
      },
      {
        "name": "finance_tax_invoice_source_coverages_tax_invoice_item_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoice_source_coverages_tax_invoice_item_id_key ON public.finance_tax_invoice_source_coverages USING btree (tax_invoice_item_id)"
      },
      {
        "name": "tax_invoice_coverage_document",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_coverage_document ON public.finance_tax_invoice_source_coverages USING btree (tax_invoice_id)"
      },
      {
        "name": "tax_invoice_full_line_coverage",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX tax_invoice_full_line_coverage ON public.finance_tax_invoice_source_coverages USING btree (invoice_item_id) WHERE (status = ANY (ARRAY[''reserved''::text, ''issued''::text]))"
      }
    ]
  },
  {
    "name": "finance_tax_invoices",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "client_id",
        "type": "uuid",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "status",
        "type": "text",
        "not_null": true,
        "position": 5,
        "has_default": true,
        "default_expression": "''draft''::text"
      },
      {
        "name": "tax_invoice_no",
        "type": "text",
        "not_null": false,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issue_date",
        "type": "date",
        "not_null": true,
        "position": 7,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 8,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "not_null": true,
        "position": 9,
        "has_default": true,
        "default_expression": "''{}''::jsonb"
      },
      {
        "name": "draft_snapshot_json",
        "type": "jsonb",
        "not_null": true,
        "position": 10,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "not_null": false,
        "position": 11,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 12,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 13,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 14,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancel_reason",
        "type": "text",
        "not_null": false,
        "position": 15,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "cancelled_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 16,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 17,
        "has_default": true,
        "default_expression": "now()"
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "not_null": true,
        "position": 18,
        "has_default": true,
        "default_expression": "now()"
      },
      {
        "name": "created_by_user_id",
        "type": "uuid",
        "not_null": true,
        "position": 19,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoices_cancelled_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_client_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_created_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_decisions_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_draft_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_issued_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_invoices_payment_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_invoices_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_invoices_source_snapshot_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_invoices_status_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_tax_invoices_tax_invoice_no_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_no)"
      },
      {
        "name": "tax_invoice_cancel_evidence",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((((status = ''cancelled''::text) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL)) OR ((status <> ''cancelled''::text) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL))))"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "tax_invoice_lifecycle",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (tax_invoice_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (tax_invoice_no ~ ''^VP-TI-[0-9]{6}-[0-9]{6}$''::text) AND (tax_invoice_no IS NOT NULL) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoices_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_pkey ON public.finance_tax_invoices USING btree (id)"
      },
      {
        "name": "finance_tax_invoices_tax_invoice_no_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_tax_invoice_no_key ON public.finance_tax_invoices USING btree (tax_invoice_no)"
      },
      {
        "name": "tax_invoice_active_payment",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX tax_invoice_active_payment ON public.finance_tax_invoices USING btree (payment_id) WHERE (status = ANY (ARRAY[''draft''::text, ''issued''::text]))"
      },
      {
        "name": "tax_invoice_source_invoice",
        "valid": true,
        "unique": false,
        "definition": "CREATE INDEX tax_invoice_source_invoice ON public.finance_tax_invoices USING btree (invoice_id)"
      }
    ]
  },
  {
    "name": "finance_tax_point_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "not_null": true,
        "position": 1,
        "has_default": true,
        "default_expression": "gen_random_uuid()"
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "not_null": true,
        "position": 2,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "event_type",
        "type": "text",
        "not_null": true,
        "position": 3,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "occurred_on",
        "type": "date",
        "not_null": true,
        "position": 4,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "not_null": true,
        "position": 5,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "approved_at",
        "type": "timestamp with time zone",
        "not_null": false,
        "position": 6,
        "has_default": false,
        "default_expression": null
      },
      {
        "name": "approved_by_user_id",
        "type": "uuid",
        "not_null": false,
        "position": 7,
        "has_default": false,
        "default_expression": null
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_point_events_approved_by_user_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (approved_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_point_events_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK (((approved_at IS NULL) = (approved_by_user_id IS NULL)))"
      },
      {
        "name": "finance_tax_point_events_event_type_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((event_type = ''payment_received''::text))"
      },
      {
        "name": "finance_tax_point_events_evidence_json_check",
        "type": "c",
        "valid": true,
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_point_events_pkey",
        "type": "p",
        "valid": true,
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_fkey",
        "type": "f",
        "valid": true,
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_key",
        "type": "u",
        "valid": true,
        "definition": "UNIQUE (tax_invoice_id)"
      },
      {
        "name": "tax_invoice_integrity",
        "type": "t",
        "valid": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_point_events_pkey",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_point_events_pkey ON public.finance_tax_point_events USING btree (id)"
      },
      {
        "name": "finance_tax_point_events_tax_invoice_id_key",
        "valid": true,
        "unique": true,
        "definition": "CREATE UNIQUE INDEX finance_tax_point_events_tax_invoice_id_key ON public.finance_tax_point_events USING btree (tax_invoice_id)"
      }
    ]
  }
]
'::jsonb)),
table_facts as (select e.spec,c.oid,c.relrowsecurity,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'has_default',d.oid is not null,'default_expression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
  -- PostgreSQL 18 adds table NOT NULL catalog rows. Check nullability through attnotnull on every version.
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'valid',con.convalidated,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype <> 'n') as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'unique',i.indisunique,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) order by idx.relname) from pg_index i join pg_class idx on idx.oid=i.indexrelid where i.indrelid=c.oid) as indexes
  from expected_tables e left join pg_class c on c.oid=to_regclass('public.'||(e.spec->>'name'))),
catalog_objects as (
  select t.spec->>'name' as table_name,part.category,side.source,item.value->>'name' as object_name,item.value as definition
  from table_facts t
  cross join lateral (values ('columns',t.spec->'columns',t.columns),('constraints',t.spec->'constraints',t.constraints),('indexes',t.spec->'indexes',t.indexes)) part(category,expected,actual)
  cross join lateral (values ('expected',part.expected),('actual',part.actual)) side(source,objects)
  cross join lateral jsonb_array_elements(side.objects) item(value)
), catalog_pairs as (
  select coalesce(e.table_name,a.table_name) as table_name,coalesce(e.category,a.category) as category,
    coalesce(e.object_name,a.object_name) as object_name,e.definition as expected,a.definition as actual
  from (select * from catalog_objects where source='expected') e
  full join (select * from catalog_objects where source='actual') a using(table_name,category,object_name)
), catalog_differences as (
  select p.table_name,p.category,p.object_name,d.property,d.expected,d.actual,
    case when p.actual is null then 'missing_object' when p.expected is null then 'unexpected_object' else 'property_mismatch' end as reason
  from catalog_pairs p cross join lateral (
    select null::text as property,p.expected,p.actual where p.expected is null or p.actual is null
    union all
    select coalesce(e.key,a.key),e.value,a.value
    from jsonb_each(p.expected) e full join jsonb_each(p.actual) a using(key)
    where p.expected is not null and p.actual is not null and e.value is distinct from a.value
  ) d
  union all
  select spec->>'name','table',spec->>'name','exists','true'::jsonb,'false'::jsonb,'missing_object'
  from table_facts where oid is null
),
protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
protected_observation as (select jsonb_build_object(
  'payment',(select to_jsonb(p) from protected_payment p),'invoice',(select to_jsonb(i)-'issued_snapshot_json'-'draft_snapshot_json' from protected_invoice i),
  'receipt',(select to_jsonb(r)-'issued_snapshot_json'-'draft_snapshot_json' from protected_receipt r),
  'payment_hash',(select md5(to_jsonb(p)::text) from protected_payment p),
  'invoice_hash',(select md5(to_jsonb(i)::text) from protected_invoice i),
  'receipt_hash',(select md5(to_jsonb(r)::text) from protected_receipt r),
  'cash_rows',(select count(*) from public.finance_cash_transactions),'opening_rows',(select count(*) from public.finance_account_opening_balances),
  'legacy_ledger_rows',(select count(*) from public.finance_company_ledger),
  'buyer_identity_incomplete',(select nullif(btrim(issued_snapshot_json #>> '{customer,address}'),'') is null from protected_invoice)
) as facts),
protected_checks(name,passed) as (values
  ('protected_payment_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
  ('protected_invoice_unchanged_facts',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and amount_before_vat=4672.90 and vat_amount=327.10 and total_amount=5000),false) from protected_invoice)),
  ('protected_receipt_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000 and issued_snapshot_json->'schema_version'='2'::jsonb),false) from protected_receipt)),
  ('protected_effective_settlement',(select count(*)=1 and coalesce(bool_and(effective_cash_allocated=4859.81 and effective_wht_credit_allocated=140.19 and effective_settlement_total=5000),false) from public.finance_payment_effective_invoice_allocations where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and invoice_id='74461042-e3ba-4922-9b64-55aac9ebd8aa')),
  ('protected_no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
),
checks(name,passed) as (select * from protected_checks union all select * from (values
  ('exact_039_functions_and_search_path',(select count(*)=23 and bool_and(oid is not null and exact_body and prosecdef=definer and proconfig @> array['search_path=public']) from function_facts)),
  ('rpc_and_private_grants',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
  ('exact_tables_columns_constraints_indexes',(select count(*)=5 from table_facts) and not exists(select 1 from catalog_differences)),
  ('rls_and_browser_direct_mutation_blocked',(select bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from table_facts)),
  ('only_permission_gated_read_policies',(select count(*)=5 and bool_and(p.cmd='SELECT' and p.roles=array['authenticated']::name[] and p.qual like '%current_user_can_view_finance_tax_invoices%') from pg_policies p join table_facts t on p.tablename=t.spec->>'name' where p.schemaname='public')),
  ('append_only_and_deferred_integrity_triggers',(select count(*)=10 and bool_and(g.tgenabled='O' and ((g.tgname='tax_invoice_history' and g.tgfoid=to_regprocedure('public.protect_finance_tax_invoice_history()')) or (g.tgname='tax_invoice_integrity' and g.tgdeferrable and g.tginitdeferred and g.tgfoid=to_regprocedure('public.validate_finance_tax_invoice_integrity()')))) from pg_trigger g join table_facts t on t.oid=g.tgrelid where not g.tgisinternal)),
  ('upstream_dependency_triggers',(select count(*)=4 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.guard_finance_tax_invoice_upstream()')) from pg_trigger where tgname in ('tax_invoice_payment_guard','tax_invoice_invoice_guard','tax_invoice_receipt_guard','tax_invoice_reallocation_guard') and not tgisinternal)),
  ('permission_escalation_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.protect_finance_tax_invoice_permissions()')) from pg_trigger where tgname='protect_finance_tax_invoice_permissions' and tgrelid='public.user_profiles'::regclass)),
  ('new_permissions_default_false',(select count(*)=3 and bool_and(data_type='boolean' and is_nullable='NO' and column_default='false') from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name in ('can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices'))),
  ('logo_read_policy',(select count(*)=1 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual like '%current_user_can_view_finance_tax_invoices%' and qual like '%company/logo/%') from pg_policies where schemaname='storage' and tablename='objects' and policyname='tax_invoice_document_logos_read')),
  ('numbering_profile_valid',(select count(*)=1 and coalesce(bool_and(is_active and display_prefix='VP-TI' and period_scope='monthly' and sequence_width=6),false) from public.document_numbering_profiles where document_type='tax_invoice')),('no_tax_invoice_number_consumption',not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('tax_invoice','ti','vp-ti') or prefix like 'VP-TI-%')),
  ('tax_foundation_zero_state',not exists(select 1 from public.finance_tax_invoices) and not exists(select 1 from public.finance_tax_invoice_items) and not exists(select 1 from public.finance_tax_invoice_source_coverages) and not exists(select 1 from public.finance_tax_point_events) and not exists(select 1 from public.finance_tax_invoice_audit_events)),
  ('receipt_038_functions_unchanged',coalesce((select md5(prosrc)='a76bf15714d1c4811e7845033b4afe72' from pg_proc where oid=to_regprocedure('public.document_logo_evidence(text)')),false) and coalesce((select md5(prosrc)='1fe91b4d85e36bdc913b5427f5a8e270' from pg_proc where oid=to_regprocedure('public.build_finance_receipt_source(uuid)')),false))
) v(name,passed))
select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
  (select facts from protected_observation) as protected_uat_observation,
  coalesce((select bool_and(passed is true) from checks),false) as tax_invoice_foundation_verification_pass,
  current_setting('server_version_num')::integer as catalog_server_version_num,
  (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,category,object_name,property),'[]'::jsonb) from catalog_differences d) as catalog_differences,
  jsonb_build_object('finance_tax_invoices',(select count(*) from public.finance_tax_invoices),'finance_tax_invoice_items',(select count(*) from public.finance_tax_invoice_items),'finance_tax_invoice_source_coverages',(select count(*) from public.finance_tax_invoice_source_coverages),'finance_tax_point_events',(select count(*) from public.finance_tax_point_events),'finance_tax_invoice_audit_events',(select count(*) from public.finance_tax_invoice_audit_events)) as tax_foundation_rows;
ROLLBACK;
