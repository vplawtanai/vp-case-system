-- Phase 6A: ordinary paper/PDF Receipt evidence, not settlement or a Tax Invoice.
-- No business rows are created and no historical Payment is backfilled.
do $receipt_preflight$
begin
  if to_regclass('public.finance_receipts') is not null
    or to_regclass('public.finance_receipt_invoice_allocations') is not null
    or to_regclass('public.finance_receipt_audit_events') is not null
    or to_regclass('public.finance_payment_effective_invoice_allocations') is null
    or to_regclass('public.finance_payment_wht_components') is null
    or to_regprocedure('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)') is null
  then raise exception 'Receipt foundation requires an unapplied 037 and complete Payment foundation'; end if;
  if not exists (select 1 from public.document_numbering_profiles
    where document_type = 'receipt' and display_prefix = 'VP-RC'
      and period_scope = 'monthly' and sequence_width = 6 and is_active)
  then raise exception 'Receipt numbering profile must be VP-RC monthly six digits'; end if;
end;
$receipt_preflight$;

alter table public.user_profiles
  add column can_view_finance_receipts boolean not null default false,
  add column can_manage_finance_receipts boolean not null default false,
  add column can_issue_finance_receipts boolean not null default false,
  add column can_void_finance_receipts boolean not null default false;

create function public.current_user_can_view_finance_receipts()
returns boolean language sql stable security definer set search_path = public
as $receipt_view$
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = 'admin' or can_view_finance_receipts or can_manage_finance_receipts
      or can_issue_finance_receipts or can_void_finance_receipts));
$receipt_view$;
create function public.current_user_can_manage_finance_receipts()
returns boolean language sql stable security definer set search_path = public
as $receipt_manage$
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = 'admin' or can_manage_finance_receipts));
$receipt_manage$;
create function public.current_user_can_issue_finance_receipts()
returns boolean language sql stable security definer set search_path = public
as $receipt_issue_permission$
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = 'admin' or can_issue_finance_receipts));
$receipt_issue_permission$;
create function public.current_user_can_void_finance_receipts()
returns boolean language sql stable security definer set search_path = public
as $receipt_void_permission$
  select exists (select 1 from public.user_profiles where id = auth.uid() and active
    and (role = 'admin' or can_void_finance_receipts));
$receipt_void_permission$;

create function public.protect_finance_receipt_permission_fields()
returns trigger language plpgsql security definer set search_path = public
as $receipt_permission_guard$
begin
  if tg_op = 'INSERT' and not (new.can_view_finance_receipts or new.can_manage_finance_receipts
    or new.can_issue_finance_receipts or new.can_void_finance_receipts) then return new; end if;
  if not exists (select 1 from public.user_profiles where id = auth.uid() and active and role = 'admin')
  then raise exception 'Only an active Admin can change Receipt authority'; end if;
  return new;
end;
$receipt_permission_guard$;
create trigger protect_finance_receipt_permission_fields
before insert or update of can_view_finance_receipts, can_manage_finance_receipts,
  can_issue_finance_receipts, can_void_finance_receipts on public.user_profiles
for each row execute function public.protect_finance_receipt_permission_fields();

create table public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','issued','cancelled','voided')),
  receipt_no text unique,
  receipt_date date not null,
  currency text not null check (btrim(currency) <> ''),
  cash_amount numeric(14,2) not null check (cash_amount >= 0),
  wht_amount numeric(14,2) not null check (wht_amount >= 0),
  settlement_amount numeric(14,2) generated always as (cash_amount + wht_amount) stored,
  draft_snapshot_json jsonb not null check (jsonb_typeof(draft_snapshot_json) = 'object' and draft_snapshot_json <> '{}'::jsonb),
  issued_snapshot_json jsonb,
  replaces_receipt_id uuid references public.finance_receipts(id) on delete restrict,
  external_receipt_checked_at timestamptz not null,
  external_receipt_checked_by_user_id uuid not null references public.user_profiles(id),
  issued_at timestamptz,
  issued_by_user_id uuid references public.user_profiles(id),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.user_profiles(id),
  cancel_reason text,
  voided_at timestamptz,
  voided_by_user_id uuid references public.user_profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  constraint finance_receipts_positive_settlement check (cash_amount + wht_amount > 0),
  constraint finance_receipts_predecessor_check check (replaces_receipt_id is distinct from id),
  constraint finance_receipts_lifecycle_check check (
    (status in ('draft','cancelled') and receipt_no is null and issued_at is null
      and issued_by_user_id is null and issued_snapshot_json is null)
    or (status in ('issued','voided') and receipt_no is not null and receipt_no ~ '^VP-RC-[0-9]{6}-[0-9]{6}$'
      and issued_at is not null and issued_by_user_id is not null
      and issued_snapshot_json is not null and jsonb_typeof(issued_snapshot_json) = 'object' and issued_snapshot_json <> '{}'::jsonb)
  ),
  constraint finance_receipts_cancel_check check (
    (status = 'cancelled' and cancelled_at is not null and cancelled_by_user_id is not null
      and nullif(btrim(cancel_reason),'') is not null)
    or (status <> 'cancelled' and cancelled_at is null and cancelled_by_user_id is null and cancel_reason is null)
  ),
  constraint finance_receipts_void_check check (
    (status = 'voided' and voided_at is not null and voided_by_user_id is not null
      and nullif(btrim(void_reason),'') is not null)
    or (status <> 'voided' and voided_at is null and voided_by_user_id is null and void_reason is null)
  )
);
create unique index uq_finance_receipts_active_payment on public.finance_receipts(payment_id)
  where status in ('draft','issued');
create index idx_finance_receipts_payment_history on public.finance_receipts(payment_id,created_at);
create index idx_finance_receipts_predecessor on public.finance_receipts(replaces_receipt_id);
create index idx_finance_receipts_status_date on public.finance_receipts(status,receipt_date);

-- Issue-only frozen coverage. These rows never participate in settlement views.
create table public.finance_receipt_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.finance_receipts(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  invoice_no text not null check (btrim(invoice_no) <> ''),
  currency text not null,
  cash_allocated numeric(14,2) not null check (cash_allocated >= 0),
  wht_allocated numeric(14,2) not null check (wht_allocated >= 0),
  settlement_allocated numeric(14,2) generated always as (cash_allocated + wht_allocated) stored,
  source_snapshot_json jsonb not null check (jsonb_typeof(source_snapshot_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (receipt_id,invoice_id),
  check (cash_allocated + wht_allocated > 0)
);
create index idx_finance_receipt_allocations_invoice on public.finance_receipt_invoice_allocations(invoice_id);
create table public.finance_receipt_audit_events (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.finance_receipts(id) on delete restrict,
  event_type text not null check (event_type in ('draft_created','draft_refreshed','issued','cancelled','voided')),
  event_payload_json jsonb not null check (jsonb_typeof(event_payload_json) = 'object'),
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);
create index idx_finance_receipt_audit_history on public.finance_receipt_audit_events(receipt_id,created_at);

create function public.protect_finance_receipt_history()
returns trigger language plpgsql set search_path = public
as $receipt_history$
begin
  raise exception 'RECEIPT_HISTORY_IMMUTABLE';
end;
$receipt_history$;
create trigger protect_finance_receipt_allocation_history before update or delete
on public.finance_receipt_invoice_allocations for each row execute function public.protect_finance_receipt_history();
create trigger protect_finance_receipt_audit_history before update or delete
on public.finance_receipt_audit_events for each row execute function public.protect_finance_receipt_history();

create function public.guard_finance_receipt_lifecycle()
returns trigger language plpgsql set search_path = public
as $receipt_lifecycle$
begin
  if tg_op = 'DELETE' then raise exception 'RECEIPT_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.payment_id is distinct from old.payment_id
    or new.client_id is distinct from old.client_id or new.replaces_receipt_id is distinct from old.replaces_receipt_id
    or new.created_at is distinct from old.created_at or new.created_by_user_id is distinct from old.created_by_user_id
    or new.external_receipt_checked_at is distinct from old.external_receipt_checked_at
    or new.external_receipt_checked_by_user_id is distinct from old.external_receipt_checked_by_user_id
  then raise exception 'RECEIPT_SOURCE_IMMUTABLE'; end if;
  if old.status = 'draft' and new.status in ('draft','issued','cancelled') then return new; end if;
  if old.status = 'issued' and new.status = 'voided' and
    (to_jsonb(new) - array['status','voided_at','voided_by_user_id','void_reason','updated_at','settlement_amount'])
      = (to_jsonb(old) - array['status','voided_at','voided_by_user_id','void_reason','updated_at','settlement_amount'])
  then return new; end if;
  raise exception 'RECEIPT_HISTORY_IMMUTABLE';
end;
$receipt_lifecycle$;
create trigger guard_finance_receipt_lifecycle before insert or update or delete
on public.finance_receipts for each row execute function public.guard_finance_receipt_lifecycle();

-- Callers serialize on Payment, then ordered Invoices, then Receipt. The same
-- Payment lock is held by confirmation, reversal, correction and reallocation.
create function public.build_finance_receipt_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $receipt_source$
declare
  v_payment public.finance_payments%rowtype;
  v_company jsonb;
  v_seller jsonb;
  v_bank jsonb;
  v_customer jsonb;
  v_candidate_customer jsonb;
  v_allocation record;
  v_invoice public.finance_invoices%rowtype;
  v_invoices jsonb := '[]'::jsonb;
  v_cash numeric := 0;
  v_wht numeric := 0;
  v_description text;
begin
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'RECEIPT_CONFIRMED_PAYMENT_REQUIRED'; end if;
  if v_payment.received_on is null or v_payment.payment_method is null or v_payment.settlement_amount <= 0
  then raise exception 'RECEIPT_PAYMENT_EVIDENCE_REQUIRED'; end if;
  select to_jsonb(company) into v_company from public.finance_company_profiles company where id = 'default' for share;
  v_seller := jsonb_build_object(
    'company_name_th',v_company->>'company_name_th','company_name_en',v_company->>'company_name_en',
    'tax_id',v_company->>'tax_id','address_th',v_company->>'address_th','address_en',v_company->>'address_en',
    'branch_label_th',coalesce(nullif(btrim(v_company->>'branch_th'),''),nullif(btrim(v_company->>'branch_label'),''),'สำนักงานใหญ่'),
    'branch_label_en',coalesce(nullif(btrim(v_company->>'branch_en'),''),'Head Office'),
    'phone',v_company->>'phone','email',v_company->>'email','website',v_company->>'website'
  );
  if nullif(btrim(v_seller->>'company_name_th'),'') is null
    or nullif(btrim(v_seller->>'address_th'),'') is null
    or nullif(btrim(v_seller->>'tax_id'),'') is null
  then raise exception 'RECEIPT_SELLER_IDENTITY_REQUIRED'; end if;
  if v_payment.receiving_bank_account_id is not null then
    select jsonb_build_object('id',bank.id,'short_name',bank.short_name,'bank_name',bank.bank_name,
      'account_name',bank.account_name,'account_number',bank.account_number,'branch_name',to_jsonb(bank)->>'branch_name')
    into v_bank from public.finance_bank_accounts bank where id = v_payment.receiving_bank_account_id for share;
    if v_bank is null or nullif(btrim(v_bank->>'bank_name'),'') is null
      or nullif(btrim(v_bank->>'account_name'),'') is null or nullif(btrim(v_bank->>'account_number'),'') is null
    then raise exception 'RECEIPT_RECEIVING_ACCOUNT_REQUIRED'; end if;
  end if;
  if v_payment.payment_method = 'bank_transfer' and v_bank is null
    and nullif(btrim(v_payment.receiving_account_reference),'') is null
  then raise exception 'RECEIPT_RECEIVING_ACCOUNT_REQUIRED'; end if;
  perform 1 from public.finance_invoices where id in (
    select invoice_id from public.finance_payment_effective_invoice_allocations where payment_id = p_payment_id
  ) order by id for share;
  for v_allocation in select * from public.finance_payment_effective_invoice_allocations
    where payment_id = p_payment_id order by invoice_id
  loop
    select * into strict v_invoice from public.finance_invoices where id = v_allocation.invoice_id;
    if v_invoice.document_status <> 'issued' or v_invoice.client_id <> v_payment.client_id
      or v_invoice.currency <> v_payment.currency
      or coalesce(v_invoice.issued_snapshot_json->>'schema_version','') not in ('1','2')
      or (v_invoice.issued_snapshot_json #>> '{invoice,id}') is distinct from v_invoice.id::text
      or (v_invoice.issued_snapshot_json #>> '{invoice,invoice_no}') is distinct from v_invoice.invoice_no
      or (v_invoice.issued_snapshot_json #>> '{invoice,document_status}') is distinct from 'issued'
      or (v_invoice.issued_snapshot_json #>> '{invoice,currency}') is distinct from v_payment.currency
      or nullif(v_invoice.issued_snapshot_json #>> '{invoice,issued_at}','') is null
      or nullif(v_invoice.invoice_no,'') is null
      or jsonb_typeof(v_invoice.issued_snapshot_json->'items') is distinct from 'array'
    then raise exception 'RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED'; end if;
    -- V1 snapshots have normalized customer fields; V2 preserves the Invoice
    -- row and its original customer snapshot. Never consult mutable Client data.
    v_candidate_customer := jsonb_build_object(
      'id',v_payment.client_id,
      'name',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_name}',
        v_invoice.issued_snapshot_json #>> '{customer,name}',v_invoice.issued_snapshot_json #>> '{customer,client_display_name}'),
      'tax_id',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_tax_id}',v_invoice.issued_snapshot_json #>> '{customer,tax_id}'),
      'address',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_billing_address}',
        v_invoice.issued_snapshot_json #>> '{customer,billing_address}',v_invoice.issued_snapshot_json #>> '{customer,address}'),
      'branch',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_branch}',
        v_invoice.issued_snapshot_json #>> '{customer,branch}',v_invoice.issued_snapshot_json #>> '{customer,branch_label}')
    );
    if nullif(btrim(v_candidate_customer->>'name'),'') is null then raise exception 'RECEIPT_CUSTOMER_IDENTITY_REQUIRED'; end if;
    if v_customer is not null and v_customer <> v_candidate_customer then raise exception 'RECEIPT_CUSTOMER_EVIDENCE_CONFLICT'; end if;
    v_customer := v_candidate_customer;
    select string_agg(coalesce(item->>'description',item #>> '{invoice_item,description}'),'; ' order by ordinal)
      into v_description from jsonb_array_elements(v_invoice.issued_snapshot_json->'items') with ordinality as entries(item,ordinal);
    if nullif(btrim(v_description),'') is null then raise exception 'RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED'; end if;
    if v_allocation.effective_cash_allocated < 0 or v_allocation.effective_wht_credit_allocated < 0
      or v_allocation.effective_settlement_total <= 0
      or v_allocation.effective_settlement_total <> v_allocation.effective_cash_allocated + v_allocation.effective_wht_credit_allocated
    then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
    v_cash := v_cash + v_allocation.effective_cash_allocated;
    v_wht := v_wht + v_allocation.effective_wht_credit_allocated;
    v_invoices := v_invoices || jsonb_build_array(jsonb_build_object(
      'invoice_id',v_invoice.id,'invoice_no',v_invoice.invoice_no,'currency',v_invoice.currency,
      'description',v_description,'matter',v_invoice.issued_snapshot_json->'matter',
      'cash_allocated',v_allocation.effective_cash_allocated,'wht_allocated',v_allocation.effective_wht_credit_allocated,
      'settlement_allocated',v_allocation.effective_settlement_total,
      'invoice_snapshot_schema_version',v_invoice.issued_snapshot_json->'schema_version',
      'invoice_issued_at',v_invoice.issued_snapshot_json #> '{invoice,issued_at}'
    ));
  end loop;
  if jsonb_array_length(v_invoices) = 0 or v_cash <> v_payment.cash_amount or v_wht <> v_payment.wht_amount
  then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
  return jsonb_build_object('schema_version',1,'document_kind','receipt','seller',v_seller,'customer',v_customer,
    'payment',jsonb_build_object('id',v_payment.id,'internal_reference',v_payment.internal_reference,
      'received_on',v_payment.received_on,'payment_method',v_payment.payment_method,
      'receiving_bank_account',v_bank,'receiving_account_reference',v_payment.receiving_account_reference,
      'external_transaction_reference',v_payment.external_transaction_reference,'payer_name',v_payment.payer_name,
      'cash_amount',v_payment.cash_amount,'wht_amount',v_payment.wht_amount,
      'settlement_amount',v_payment.settlement_amount,'currency',v_payment.currency),
    'invoices',v_invoices,'structured_wht_components',coalesce((select jsonb_agg(jsonb_build_object(
      'id',component.id,'invoice_id',component.invoice_id,'invoice_item_id',component.invoice_item_id,
      'calculation_rule',component.calculation_rule,'base_amount',component.base_amount,
      'rate_percent',component.rate_percent,'calculated_wht_amount',component.calculated_wht_amount,
      'basis_snapshot_json',component.basis_snapshot_json) order by component.id)
      from public.finance_payment_wht_components component where payment_id = p_payment_id),'[]'::jsonb));
end;
$receipt_source$;

create function public.record_finance_receipt_audit(p_receipt_id uuid,p_event text,p_payload jsonb)
returns void language sql security definer set search_path = public
as $receipt_audit$
  insert into public.finance_receipt_audit_events(receipt_id,event_type,event_payload_json,actor_user_id)
  values (p_receipt_id,p_event,p_payload,auth.uid());
$receipt_audit$;

create function public.create_finance_receipt_draft_from_payment(p_payment_id uuid,p_external_receipt_checked boolean default false)
returns uuid language plpgsql security definer set search_path = public
as $receipt_create$
declare
  v_payment public.finance_payments%rowtype;
  v_id uuid;
  v_predecessor uuid;
  v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'RECEIPT_CONFIRMED_PAYMENT_REQUIRED'; end if;
  select id into v_id from public.finance_receipts where payment_id = p_payment_id and status in ('draft','issued');
  if v_id is not null then return v_id; end if;
  if p_external_receipt_checked is distinct from true then raise exception 'RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED'; end if;
  select id into v_predecessor from public.finance_receipts where payment_id = p_payment_id and status = 'voided'
    order by issued_at desc,id desc limit 1;
  v_snapshot := public.build_finance_receipt_source(p_payment_id);
  insert into public.finance_receipts(payment_id,client_id,receipt_date,currency,cash_amount,wht_amount,
    draft_snapshot_json,replaces_receipt_id,external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id)
  values (p_payment_id,v_payment.client_id,v_payment.received_on,v_payment.currency,v_payment.cash_amount,v_payment.wht_amount,
    v_snapshot,v_predecessor,now(),auth.uid(),auth.uid()) returning id into v_id;
  perform public.record_finance_receipt_audit(v_id,'draft_created',jsonb_build_object(
    'payment_id',p_payment_id,'external_receipt_checked',true,'replaces_receipt_id',v_predecessor));
  return v_id;
end;
$receipt_create$;

create function public.refresh_finance_receipt_draft(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $receipt_refresh$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  if v_snapshot = v_receipt.draft_snapshot_json then return p_receipt_id; end if;
  update public.finance_receipts set draft_snapshot_json = v_snapshot,
    receipt_date = (v_snapshot #>> '{payment,received_on}')::date,
    currency = v_snapshot #>> '{payment,currency}',cash_amount = (v_snapshot #>> '{payment,cash_amount}')::numeric,
    wht_amount = (v_snapshot #>> '{payment,wht_amount}')::numeric,updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'draft_refreshed',jsonb_build_object('payment_id',v_payment_id));
  return p_receipt_id;
end;
$receipt_refresh$;

create function public.issue_finance_receipt(p_receipt_id uuid,p_acknowledged boolean,p_reviewed_snapshot_json jsonb default null)
returns uuid language plpgsql security definer set search_path = public
as $receipt_issue$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb; v_number text; v_now timestamptz := now();
begin
  if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  -- Retry must not consult changed master data or allocate another number.
  select * into v_receipt from public.finance_receipts where id = p_receipt_id;
  if v_receipt.status = 'issued' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_snapshot is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  if p_reviewed_snapshot_json is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_REVIEW_REQUIRED'; end if;
  v_number := public.generate_finance_document_no('receipt',v_receipt.receipt_date);
  v_snapshot := v_snapshot || jsonb_build_object('receipt',jsonb_build_object('id',p_receipt_id,
    'receipt_no',v_number,'receipt_date',v_receipt.receipt_date,'issued_at',v_now,'issued_by_user_id',auth.uid(),
    'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id = auth.uid()),
    'replaces_receipt_id',v_receipt.replaces_receipt_id));
  update public.finance_receipts set status = 'issued',receipt_no = v_number,issued_snapshot_json = v_snapshot,
    issued_at = v_now,issued_by_user_id = auth.uid(),updated_at = v_now where id = p_receipt_id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,
    cash_allocated,wht_allocated,source_snapshot_json)
  select p_receipt_id,(item->>'invoice_id')::uuid,item->>'invoice_no',item->>'currency',
    (item->>'cash_allocated')::numeric,(item->>'wht_allocated')::numeric,item
  from jsonb_array_elements(v_snapshot->'invoices') as entries(item);
  perform public.record_finance_receipt_audit(p_receipt_id,'issued',jsonb_build_object(
    'payment_id',v_payment_id,'receipt_no',v_number,'cash_amount',v_receipt.cash_amount,
    'wht_amount',v_receipt.wht_amount,'settlement_amount',v_receipt.settlement_amount,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'tax_invoice_created',false));
  return p_receipt_id;
end;
$receipt_issue$;

create function public.cancel_finance_receipt_draft(p_receipt_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $receipt_cancel$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.status = 'cancelled' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  update public.finance_receipts set status = 'cancelled',cancelled_at = now(),cancelled_by_user_id = auth.uid(),
    cancel_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'payment_changed',false));
  return p_receipt_id;
end;
$receipt_cancel$;

create function public.void_finance_receipt(p_receipt_id uuid,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path = public
as $receipt_void$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if not public.current_user_can_void_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_VOID_ACK_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.status = 'voided' then return p_receipt_id; end if;
  if v_receipt.status <> 'issued' then raise exception 'RECEIPT_ISSUED_REQUIRED'; end if;
  update public.finance_receipts set status = 'voided',voided_at = now(),voided_by_user_id = auth.uid(),
    void_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'voided',jsonb_build_object(
    'reason',btrim(p_reason),'receipt_no',v_receipt.receipt_no,'payment_changed',false,'cash_created',false));
  return p_receipt_id;
end;
$receipt_void$;

-- Deferred reconciliation catches partial Issue writes even in trusted SQL.
create function public.validate_finance_receipt_integrity()
returns trigger language plpgsql security definer set search_path = public
as $receipt_integrity$
declare v_receipt public.finance_receipts%rowtype; v_id uuid; v_cash numeric; v_wht numeric; v_count bigint;
begin
  if tg_table_name = 'finance_receipts' then v_id := new.id;
  else v_id := new.receipt_id; end if;
  select * into strict v_receipt from public.finance_receipts where id = v_id;
  if v_receipt.replaces_receipt_id is not null and not exists (
    select 1 from public.finance_receipts prior where prior.id = v_receipt.replaces_receipt_id
      and prior.payment_id = v_receipt.payment_id and prior.status = 'voided'
  ) then raise exception 'RECEIPT_REPLACEMENT_SOURCE_INVALID'; end if;
  select count(*),coalesce(sum(cash_allocated),0),coalesce(sum(wht_allocated),0)
    into v_count,v_cash,v_wht from public.finance_receipt_invoice_allocations where receipt_id = v_id;
  if v_receipt.status in ('draft','cancelled') and v_count <> 0 then raise exception 'RECEIPT_DRAFT_COVERAGE_INVALID'; end if;
  if v_receipt.status in ('issued','voided') then
    if v_count = 0 or v_cash <> v_receipt.cash_amount or v_wht <> v_receipt.wht_amount
      or (v_receipt.issued_snapshot_json #>> '{receipt,receipt_no}') is distinct from v_receipt.receipt_no
      or (v_receipt.issued_snapshot_json #>> '{receipt,id}') is distinct from v_id::text
      or (v_receipt.issued_snapshot_json #>> '{receipt,receipt_date}') is distinct from v_receipt.receipt_date::text
      or (v_receipt.issued_snapshot_json #>> '{payment,id}') is distinct from v_receipt.payment_id::text
      or (v_receipt.issued_snapshot_json #>> '{payment,currency}') is distinct from v_receipt.currency
      or (v_receipt.issued_snapshot_json #>> '{payment,cash_amount}')::numeric is distinct from v_receipt.cash_amount
      or (v_receipt.issued_snapshot_json #>> '{payment,wht_amount}')::numeric is distinct from v_receipt.wht_amount
      or (v_receipt.issued_snapshot_json #>> '{payment,settlement_amount}')::numeric is distinct from v_receipt.settlement_amount
      or v_count <> jsonb_array_length(v_receipt.issued_snapshot_json->'invoices')
      or (v_receipt.issued_snapshot_json - 'receipt') is distinct from v_receipt.draft_snapshot_json
      or exists (select 1 from public.finance_receipt_invoice_allocations a where a.receipt_id = v_id
        and (a.currency <> v_receipt.currency
          or (a.source_snapshot_json->>'invoice_id') is distinct from a.invoice_id::text
          or (a.source_snapshot_json->>'invoice_no') is distinct from a.invoice_no
          or (a.source_snapshot_json->>'currency') is distinct from a.currency
          or (a.source_snapshot_json->>'cash_allocated')::numeric is distinct from a.cash_allocated
          or (a.source_snapshot_json->>'wht_allocated')::numeric is distinct from a.wht_allocated
          or (a.source_snapshot_json->>'settlement_allocated')::numeric is distinct from a.settlement_allocated
          or not (v_receipt.issued_snapshot_json->'invoices' @> jsonb_build_array(a.source_snapshot_json))))
    then raise exception 'RECEIPT_FROZEN_COVERAGE_INVALID'; end if;
  end if;
  return null;
end;
$receipt_integrity$;
create constraint trigger validate_finance_receipt_integrity after insert or update on public.finance_receipts
deferrable initially deferred for each row execute function public.validate_finance_receipt_integrity();
create constraint trigger validate_finance_receipt_allocation_integrity after insert on public.finance_receipt_invoice_allocations
deferrable initially deferred for each row execute function public.validate_finance_receipt_integrity();

alter table public.finance_receipts enable row level security;
alter table public.finance_receipt_invoice_allocations enable row level security;
alter table public.finance_receipt_audit_events enable row level security;
create policy finance_receipts_read on public.finance_receipts for select to authenticated
using (public.current_user_can_view_finance_receipts());
create policy finance_receipt_allocations_read on public.finance_receipt_invoice_allocations for select to authenticated
using (public.current_user_can_view_finance_receipts());
create policy finance_receipt_audit_read on public.finance_receipt_audit_events for select to authenticated
using (public.current_user_can_view_finance_receipts());
revoke all on public.finance_receipts, public.finance_receipt_invoice_allocations, public.finance_receipt_audit_events
from public, anon, authenticated;
grant select on public.finance_receipts, public.finance_receipt_invoice_allocations, public.finance_receipt_audit_events to authenticated;

revoke all on function public.current_user_can_view_finance_receipts(),public.current_user_can_manage_finance_receipts(),
public.current_user_can_issue_finance_receipts(),public.current_user_can_void_finance_receipts() from public,anon,authenticated;
grant execute on function public.current_user_can_view_finance_receipts(),public.current_user_can_manage_finance_receipts(),
public.current_user_can_issue_finance_receipts(),public.current_user_can_void_finance_receipts() to authenticated;
revoke all on function public.build_finance_receipt_source(uuid),public.record_finance_receipt_audit(uuid,text,jsonb),
public.protect_finance_receipt_permission_fields(),public.protect_finance_receipt_history(),
public.guard_finance_receipt_lifecycle(),public.validate_finance_receipt_integrity() from public,anon,authenticated;
revoke all on function public.create_finance_receipt_draft_from_payment(uuid,boolean),public.refresh_finance_receipt_draft(uuid),
public.issue_finance_receipt(uuid,boolean,jsonb),public.cancel_finance_receipt_draft(uuid,text),public.void_finance_receipt(uuid,text,boolean)
from public,anon,authenticated;
grant execute on function public.create_finance_receipt_draft_from_payment(uuid,boolean),public.refresh_finance_receipt_draft(uuid),
public.issue_finance_receipt(uuid,boolean,jsonb),public.cancel_finance_receipt_draft(uuid,text),public.void_finance_receipt(uuid,text,boolean)
to authenticated;

-- Extend only the Receipt allocator branch; preserve all existing document contracts.
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
  if v_input_type = 'receipt' then
    if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  elsif not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to allocate document number';
  end if;

  if v_input_type in ('fee_agreement', 'invoice', 'receipt') then
    select display_prefix, period_scope, sequence_width
      into v_prefix_code, v_period_scope, v_width
    from public.document_numbering_profiles
    where document_type = v_input_type and is_active;
    if v_prefix_code is null then raise exception 'Document numbering profile is not active'; end if;
    if v_input_type = 'receipt' and (v_prefix_code <> 'VP-RC' or v_period_scope <> 'monthly' or v_width <> 6) then
      raise exception 'RECEIPT_NUMBERING_PROFILE_INVALID';
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

  if v_input_type = 'receipt' and length(v_next::text) > v_width then
    raise exception 'RECEIPT_NUMBERING_EXHAUSTED';
  end if;
  return v_prefix || lpad(v_next::text, v_width, '0');
end;
$$;
revoke all on function public.generate_finance_document_no(text,date) from public,anon,authenticated;

create function public.assert_finance_receipt_dependencies(p_payment_id uuid default null,p_invoice_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public
as $receipt_dependency$
begin
  if exists (select 1 from public.finance_receipts r where r.status = 'issued'
    and (r.payment_id = p_payment_id or exists (
      select 1 from public.finance_receipt_invoice_allocations a
      where a.receipt_id = r.id and a.invoice_id = any(p_invoice_ids))))
  then raise exception 'FINANCE_ISSUED_RECEIPT_DEPENDENCY'; end if;
end;
$receipt_dependency$;
revoke all on function public.assert_finance_receipt_dependencies(uuid,uuid[]) from public,anon,authenticated;

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
    if (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
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
    if (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
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
    if (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
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
    if (v_dependency.table_name = 'finance_receipts' and v_dependency.column_name = 'payment_id')
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

revoke all on function public.assert_finance_payment_has_no_downstream_dependencies(uuid),
public.assert_finance_erroneous_payment_correction_dependencies(uuid),
public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid),
public.assert_finance_invoice_has_no_void_dependencies(uuid) from public,anon,authenticated;
