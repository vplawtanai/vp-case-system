begin;

create temporary table phase_b3b_dry_run_baseline on commit drop as
select
  (select count(*) from public.finance_billing_installment_charge_bridges) as bridge_rows,
  (select count(*) from public.finance_billing_installment_charge_bridge_audit_events) as bridge_audit_rows,
  (select count(*) from public.finance_billable_charges where source_type = 'billing_installment_item') as generated_installment_charge_rows,
  (select count(*) from public.finance_invoices where source_model = 'billable_charge_v2') as invoice_v2_rows,
  (select md5(coalesce(jsonb_agg(jsonb_build_object(
      'id',invoice.id,'invoice_no',invoice.invoice_no,'document_status',invoice.document_status,
      'source_model',invoice.source_model,'billing_plan_id',invoice.billing_plan_id,
      'primary_billing_installment_id',invoice.primary_billing_installment_id,
      'fee_agreement_id',invoice.fee_agreement_id,'client_id',invoice.client_id,
      'case_id',invoice.case_id,'advisory_matter_id',invoice.advisory_matter_id,
      'issue_date',invoice.issue_date,'due_date',invoice.due_date,'currency',invoice.currency,
      'amount_before_vat',invoice.amount_before_vat,'vat_amount',invoice.vat_amount,
      'total_amount',invoice.total_amount,'issued_snapshot_json',invoice.issued_snapshot_json,
      'payment_destination_bank_account_id',invoice.payment_destination_bank_account_id,
      'payment_destination_snapshot_json',invoice.payment_destination_snapshot_json,
      'cancelled_at',invoice.cancelled_at,'voided_at',invoice.voided_at
    ) order by invoice.id)::text,'[]')) from public.finance_invoices as invoice) as invoice_substantive_digest,
  (select md5(to_jsonb(charge)::text) from public.finance_billable_charges as charge
    where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) as travel_charge_digest,
  (select md5(to_jsonb(charge)::text) from public.finance_billable_charges as charge
    where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) as court_fee_charge_digest,
  (select md5(to_jsonb(payment)::text) from public.finance_payments as payment
    where id = '99e76b48-9ace-4cb0-aaf6-c50d75a968bb'::uuid) as active_payment_draft_digest,
  (select count(*) from public.finance_payments) as payment_rows,
  (select coalesce(sum(cash_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_cash,
  (select coalesce(sum(wht_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_wht,
  (select coalesce(sum(settlement_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_settlement,
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
  (select count(*) from public.finance_compensation_batches) as compensation_rows;

-- BEGIN EMBEDDED MIGRATION 032 (byte-for-byte below this marker)
-- Phase B3B: authoritative Invoice V2 composition, reservation, issue, cancel, and void lifecycle.
-- This migration creates no bridge, Charge, Invoice, Payment, Cash, Ledger, or Compensation rows.

do $invoice_v2_composition_preflight$
begin
  if to_regclass('public.finance_billable_charges') is null
    or to_regclass('public.finance_billable_charge_audit_events') is null
    or to_regclass('public.finance_billing_installment_charge_bridges') is null
    or to_regclass('public.finance_billing_installment_charge_bridge_audit_events') is null
    or to_regclass('public.finance_invoices') is null
    or to_regclass('public.finance_invoice_items') is null
    or to_regclass('public.finance_invoice_installment_allocations') is null
    or to_regclass('public.finance_invoice_audit_events') is null
    or to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is null
    or to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is null
    or to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is null
    or to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is null
    or to_regprocedure('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)') is null
  then
    raise exception 'Invoice V2 composition requires the current Invoice, Charge, and bridge foundations';
  end if;

  if to_regclass('public.finance_invoice_charge_allocations') is not null
    or to_regclass('public.finance_invoice_charge_allocation_audit_events') is not null
    or to_regclass('public.finance_invoice_v2_composition_requests') is not null
    or to_regprocedure('public.validate_finance_invoice_v1_integrity_internal(uuid)') is not null
    or to_regprocedure('public.validate_finance_invoice_v2_integrity(uuid)') is not null
    or to_regprocedure('public.issue_finance_invoice_v1_internal(uuid,boolean)') is not null
    or to_regprocedure('public.cancel_finance_invoice_v1_draft_internal(uuid,text)') is not null
    or to_regprocedure('public.void_finance_invoice_v1_internal(uuid,text,boolean)') is not null
    or to_regprocedure('public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)') is not null
    or to_regprocedure('public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)') is not null
    or exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and (
          (table_name = 'finance_invoices' and column_name in ('v2_bridge_id','v2_creation_request_id','v2_creation_fingerprint'))
          or (table_name = 'finance_invoice_items' and column_name in ('source_billable_charge_id','source_state'))
        )
    )
  then
    raise exception 'Invoice V2 composition objects already exist; inspect partial state before continuing';
  end if;

  if exists (select 1 from public.finance_billing_installment_charge_bridges)
    or exists (select 1 from public.finance_invoices where source_model = 'billable_charge_v2')
    or exists (
      select 1 from public.finance_billable_charges
      where source_type = 'billing_installment_item'
    )
  then
    raise exception 'Invoice V2 operational rows already exist; inspect state before enabling the lifecycle';
  end if;
end;
$invoice_v2_composition_preflight$;

alter function public.validate_finance_invoice_integrity(uuid)
  rename to validate_finance_invoice_v1_integrity_internal;
alter function public.issue_finance_invoice(uuid, boolean)
  rename to issue_finance_invoice_v1_internal;
alter function public.cancel_finance_invoice_draft(uuid, text)
  rename to cancel_finance_invoice_v1_draft_internal;
alter function public.void_finance_invoice(uuid, text, boolean)
  rename to void_finance_invoice_v1_internal;

alter table public.finance_invoices
  alter column billing_plan_id drop not null,
  alter column primary_billing_installment_id drop not null,
  alter column fee_agreement_id drop not null,
  add column v2_bridge_id uuid null
    references public.finance_billing_installment_charge_bridges(id) on delete restrict,
  add column v2_creation_request_id uuid null,
  add column v2_creation_fingerprint text null;

alter table public.finance_invoices
  add constraint finance_invoices_source_model_lineage_check
  check (
    (
      source_model = 'installment_v1'
      and billing_plan_id is not null
      and primary_billing_installment_id is not null
      and fee_agreement_id is not null
      and v2_bridge_id is null
      and v2_creation_request_id is null
      and v2_creation_fingerprint is null
    )
    or (
      source_model = 'billable_charge_v2'
      and primary_billing_installment_id is null
      and v2_creation_request_id is not null
      and nullif(btrim(coalesce(v2_creation_fingerprint, '')), '') is not null
      and (
        (
          v2_bridge_id is null
          and billing_plan_id is null
          and fee_agreement_id is null
        )
        or (
          v2_bridge_id is not null
          and billing_plan_id is not null
          and fee_agreement_id is not null
        )
      )
    )
  );

create unique index uq_finance_invoices_v2_creation_request
on public.finance_invoices (v2_creation_request_id)
where v2_creation_request_id is not null;

create index idx_finance_invoices_v2_bridge
on public.finance_invoices (v2_bridge_id)
where v2_bridge_id is not null;

alter table public.finance_invoice_items
  alter column source_fee_agreement_item_id drop not null,
  alter column source_billing_installment_item_id drop not null,
  add column source_billable_charge_id uuid null
    references public.finance_billable_charges(id) on delete restrict,
  add column source_state text not null default 'active';

alter table public.finance_invoice_items
  add constraint finance_invoice_items_conditional_source_check
  check (
    (
      source_billable_charge_id is null
      and source_fee_agreement_item_id is not null
      and source_billing_installment_item_id is not null
      and source_state = 'active'
    )
    or (
      source_billable_charge_id is not null
      and source_fee_agreement_item_id is null
      and source_billing_installment_item_id is null
      and source_state in ('active', 'released')
    )
  );

create unique index uq_finance_invoice_items_active_charge
on public.finance_invoice_items (invoice_id, source_billable_charge_id)
where source_billable_charge_id is not null and source_state = 'active';

create index idx_finance_invoice_items_charge_history
on public.finance_invoice_items (source_billable_charge_id, created_at, id)
where source_billable_charge_id is not null;

alter table public.finance_invoice_audit_events
  drop constraint finance_invoice_audit_events_type_check;
alter table public.finance_invoice_audit_events
  add constraint finance_invoice_audit_events_type_check
  check (
    event_type in (
      'draft_created', 'draft_saved', 'issued', 'cancelled', 'voided', 'replacement_created',
      'v2_draft_composed', 'v2_composition_changed'
    )
  );

alter table public.finance_billable_charge_audit_events
  drop constraint finance_billable_charge_audit_type_check;
alter table public.finance_billable_charge_audit_events
  add constraint finance_billable_charge_audit_type_check
  check (
    event_type in (
      'created', 'draft_saved', 'marked_ready', 'cancelled',
      'reserved', 'reservation_released', 'invoiced', 'invoice_voided_returned_ready'
    )
  );

create table public.finance_invoice_v2_composition_requests (
  request_id uuid primary key,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  operation text not null,
  request_fingerprint text not null,
  result_snapshot_json jsonb not null,
  created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finance_invoice_v2_composition_requests_operation_check
    check (operation in ('create', 'replace')),
  constraint finance_invoice_v2_composition_requests_fingerprint_check
    check (nullif(btrim(request_fingerprint), '') is not null),
  constraint finance_invoice_v2_composition_requests_snapshot_check
    check (jsonb_typeof(result_snapshot_json) = 'object' and result_snapshot_json <> '{}'::jsonb)
);

create index idx_finance_invoice_v2_composition_requests_invoice
on public.finance_invoice_v2_composition_requests (invoice_id, created_at, request_id);

alter table public.finance_invoices
  add constraint finance_invoices_v2_creation_request_fk
  foreign key (v2_creation_request_id)
  references public.finance_invoice_v2_composition_requests(request_id)
  on delete restrict
  deferrable initially deferred;

create table public.finance_invoice_charge_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  invoice_item_id uuid not null references public.finance_invoice_items(id) on delete restrict,
  billable_charge_id uuid not null references public.finance_billable_charges(id) on delete restrict,
  amount_before_vat numeric(14, 2) not null,
  vat_amount numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  source_snapshot_json jsonb not null,
  status text not null default 'reserved',
  request_id uuid not null,
  reserved_at timestamptz not null default now(),
  reserved_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  invoiced_at timestamptz null,
  invoiced_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  released_at timestamptz null,
  released_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  release_reason text null,
  created_at timestamptz not null default now(),
  constraint finance_invoice_charge_allocations_amounts_check
    check (
      amount_before_vat >= 0
      and vat_amount >= 0
      and total_amount > 0
      and total_amount = amount_before_vat + vat_amount
    ),
  constraint finance_invoice_charge_allocations_status_check
    check (status in ('reserved', 'invoiced', 'released')),
  constraint finance_invoice_charge_allocations_snapshot_check
    check (jsonb_typeof(source_snapshot_json) = 'object' and source_snapshot_json <> '{}'::jsonb),
  constraint finance_invoice_charge_allocations_lifecycle_check
    check (
      (
        status = 'reserved'
        and invoiced_at is null and invoiced_by_user_id is null
        and released_at is null and released_by_user_id is null and release_reason is null
      )
      or (
        status = 'invoiced'
        and invoiced_at is not null and invoiced_by_user_id is not null
        and released_at is null and released_by_user_id is null and release_reason is null
      )
      or (
        status = 'released'
        and released_at is not null and released_by_user_id is not null
        and nullif(btrim(coalesce(release_reason, '')), '') is not null
      )
    )
);

create unique index uq_finance_invoice_charge_allocations_effective_charge
on public.finance_invoice_charge_allocations (billable_charge_id)
where status in ('reserved', 'invoiced');

create unique index uq_finance_invoice_charge_allocations_item
on public.finance_invoice_charge_allocations (invoice_item_id);

create index idx_finance_invoice_charge_allocations_invoice
on public.finance_invoice_charge_allocations (invoice_id, status, created_at, id);

create index idx_finance_invoice_charge_allocations_charge_history
on public.finance_invoice_charge_allocations (billable_charge_id, created_at, id);

create table public.finance_invoice_charge_allocation_audit_events (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.finance_invoice_charge_allocations(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  billable_charge_id uuid not null references public.finance_billable_charges(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_invoice_charge_allocation_audit_type_check
    check (event_type in ('reserved', 'invoiced', 'released')),
  constraint finance_invoice_charge_allocation_audit_payload_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_invoice_charge_allocation_audit_invoice
on public.finance_invoice_charge_allocation_audit_events (invoice_id, created_at, id);

create index idx_finance_invoice_charge_allocation_audit_charge
on public.finance_invoice_charge_allocation_audit_events (billable_charge_id, created_at, id);

create or replace function public.protect_finance_invoice_v2_composition_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_v2_request_guard$
begin
  raise exception 'Invoice V2 composition requests are append-only';
end;
$invoice_v2_request_guard$;

create trigger finance_invoice_v2_composition_request_immutability
before update or delete on public.finance_invoice_v2_composition_requests
for each row execute function public.protect_finance_invoice_v2_composition_request();

create or replace function public.protect_finance_invoice_charge_allocation_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_charge_allocation_audit_guard$
begin
  raise exception 'Invoice Charge allocation audit events are append-only';
end;
$invoice_charge_allocation_audit_guard$;

create trigger finance_invoice_charge_allocation_audit_immutability
before update or delete on public.finance_invoice_charge_allocation_audit_events
for each row execute function public.protect_finance_invoice_charge_allocation_audit();

create or replace function public.record_finance_invoice_charge_allocation_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_charge_allocation_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  select profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  insert into public.finance_invoice_charge_allocation_audit_events (
    allocation_id, invoice_id, billable_charge_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name
  ) values (
    new.id, new.invoice_id, new.billable_charge_id, new.status,
    jsonb_build_object(
      'request_id', new.request_id,
      'from_status', case when tg_op = 'UPDATE' then old.status else null end,
      'to_status', new.status,
      'amount_before_vat', new.amount_before_vat,
      'vat_amount', new.vat_amount,
      'total_amount', new.total_amount,
      'reserved_at', new.reserved_at,
      'invoiced_at', new.invoiced_at,
      'released_at', new.released_at,
      'release_reason', new.release_reason
    ),
    auth.uid(), v_actor_email, v_actor_name
  );
  return null;
end;
$invoice_charge_allocation_audit_writer$;

create trigger finance_invoice_charge_allocation_audit_writer
after insert or update of status on public.finance_invoice_charge_allocations
for each row execute function public.record_finance_invoice_charge_allocation_audit();

create or replace function public.enforce_finance_invoice_charge_allocation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_charge_allocation_guard$
declare
  v_invoice public.finance_invoices%rowtype;
  v_item public.finance_invoice_items%rowtype;
  v_charge public.finance_billable_charges%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoice Charge allocations are retained as billing evidence and cannot be deleted';
  end if;
  if not public.current_user_can_manage_finance_quotations()
    or not public.current_user_can_manage_finance_billable_charges()
  then
    raise exception 'Invoice Charge allocation lifecycle authority is required';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(current_setting('vp.invoice_v2_lifecycle', true), '') <> 'compose' then
      raise exception 'Invoice Charge allocations can only be reserved by the controlled V2 composer';
    end if;
    select * into v_invoice from public.finance_invoices where id = new.invoice_id;
    select * into v_item from public.finance_invoice_items where id = new.invoice_item_id;
    select * into v_charge from public.finance_billable_charges where id = new.billable_charge_id;
    if v_invoice.id is null or v_invoice.source_model <> 'billable_charge_v2' or v_invoice.document_status <> 'draft'
      or v_item.id is null or v_item.invoice_id <> v_invoice.id
      or v_item.source_billable_charge_id <> v_charge.id or v_item.source_state <> 'active'
      or v_charge.id is null or v_charge.status <> 'ready_to_invoice'
      or new.status <> 'reserved'
      or new.amount_before_vat <> v_charge.amount_before_vat
      or new.vat_amount <> v_charge.vat_amount
      or new.total_amount <> v_charge.total_amount
    then
      raise exception 'Invoice V2 reservation must exactly bind one Ready Charge to one active Invoice item';
    end if;
    return new;
  end if;

  if old.id is distinct from new.id
    or old.invoice_id is distinct from new.invoice_id
    or old.invoice_item_id is distinct from new.invoice_item_id
    or old.billable_charge_id is distinct from new.billable_charge_id
    or old.amount_before_vat is distinct from new.amount_before_vat
    or old.vat_amount is distinct from new.vat_amount
    or old.total_amount is distinct from new.total_amount
    or old.source_snapshot_json is distinct from new.source_snapshot_json
    or old.request_id is distinct from new.request_id
    or old.reserved_at is distinct from new.reserved_at
    or old.reserved_by_user_id is distinct from new.reserved_by_user_id
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Invoice Charge allocation source and frozen amounts are immutable';
  end if;

  if old.status = 'reserved' and new.status = 'invoiced'
    and current_setting('vp.invoice_v2_lifecycle', true) = 'issue'
  then
    return new;
  end if;
  if old.status in ('reserved', 'invoiced') and new.status = 'released'
    and current_setting('vp.invoice_v2_lifecycle', true) in ('compose', 'cancel', 'void')
  then
    return new;
  end if;
  raise exception 'Invoice Charge allocation transition is not allowed';
end;
$invoice_charge_allocation_guard$;

create trigger finance_invoice_charge_allocation_lifecycle_guard
before insert or update or delete on public.finance_invoice_charge_allocations
for each row execute function public.enforce_finance_invoice_charge_allocation_lifecycle();

create or replace function public.protect_finance_invoice_source_model()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_source_model_guard$
begin
  if tg_op = 'UPDATE' and old.source_model is distinct from new.source_model then
    raise exception 'Invoice source model is immutable';
  end if;
  if tg_op = 'INSERT' and new.source_model = 'billable_charge_v2' then
    if coalesce(current_setting('vp.invoice_v2_lifecycle', true), '') <> 'compose'
      or not public.current_user_can_manage_finance_quotations()
      or not public.current_user_can_manage_finance_billable_charges()
    then
      raise exception 'Invoice V2 Drafts can only be created by the controlled composer';
    end if;
  end if;
  return new;
end;
$invoice_source_model_guard$;

create or replace function public.enforce_finance_billable_charge_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_lifecycle_guard$
declare
  v_context text := current_setting('vp.invoice_v2_lifecycle', true);
begin
  if tg_op = 'DELETE' then
    raise exception 'Billable Charges are retained as billing evidence and cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'Billable Charges must be created as Draft'; end if;
    return new;
  end if;

  if old.id is distinct from new.id
    or old.created_at is distinct from new.created_at
    or old.created_by_user_id is distinct from new.created_by_user_id
    or old.idempotency_key is distinct from new.idempotency_key
    or old.source_type is distinct from new.source_type
    or old.source_billing_installment_item_id is distinct from new.source_billing_installment_item_id
    or old.source_event_key is distinct from new.source_event_key
    or old.supersedes_charge_id is distinct from new.supersedes_charge_id
    or old.calculation_basis is distinct from new.calculation_basis
    or old.source_semantics_json is distinct from new.source_semantics_json
  then
    raise exception 'Billable Charge creation identity and source lineage are immutable';
  end if;

  if old.status = 'draft' and new.status in ('draft', 'ready_to_invoice', 'cancelled') then return new; end if;
  if old.status = 'ready_to_invoice' and new.status = 'cancelled' then
    if old.source_type = 'billing_installment_item' then
      raise exception 'Bridged installment Charges cannot be cancelled independently';
    end if;
    if (to_jsonb(new) - array['status','cancelled_at','cancelled_by_user_id','cancel_reason','updated_at','updated_by_user_id'])
      is distinct from
      (to_jsonb(old) - array['status','cancelled_at','cancelled_by_user_id','cancel_reason','updated_at','updated_by_user_id'])
    then raise exception 'Cancelling a Ready Billable Charge must preserve its frozen commercial evidence'; end if;
    return new;
  end if;

  if not public.current_user_can_manage_finance_quotations()
    or not public.current_user_can_manage_finance_billable_charges()
  then
    raise exception 'Controlled Invoice V2 Charge lifecycle authority is required';
  end if;
  if (to_jsonb(new) - array['status','updated_at','updated_by_user_id']) is distinct from
     (to_jsonb(old) - array['status','updated_at','updated_by_user_id'])
  then
    raise exception 'Invoice V2 Charge transitions must preserve frozen Charge evidence';
  end if;
  if old.status = 'ready_to_invoice' and new.status = 'reserved' and v_context = 'compose' then return new; end if;
  if old.status = 'reserved' and new.status = 'ready_to_invoice' and v_context in ('compose','cancel') then return new; end if;
  if old.status = 'reserved' and new.status = 'invoiced' and v_context = 'issue' then return new; end if;
  if old.status = 'invoiced' and new.status = 'ready_to_invoice' and v_context = 'void' then return new; end if;
  raise exception 'Ready, Reserved, Invoiced, or Cancelled Billable Charges are immutable outside controlled lifecycle transitions';
end;
$billable_charge_lifecycle_guard$;

create or replace function public.record_finance_billable_charge_invoice_lifecycle_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_invoice_audit_writer$
declare
  v_event_type text;
begin
  v_event_type := case
    when old.status = 'ready_to_invoice' and new.status = 'reserved' then 'reserved'
    when old.status = 'reserved' and new.status = 'ready_to_invoice' then 'reservation_released'
    when old.status = 'reserved' and new.status = 'invoiced' then 'invoiced'
    when old.status = 'invoiced' and new.status = 'ready_to_invoice' then 'invoice_voided_returned_ready'
    else null
  end;
  if v_event_type is not null then
    perform public.record_finance_billable_charge_audit_event(
      new.id,
      v_event_type,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status,
        'invoice_v2_lifecycle_context', current_setting('vp.invoice_v2_lifecycle', true)
      )
    );
  end if;
  return null;
end;
$billable_charge_invoice_audit_writer$;

create trigger finance_billable_charge_invoice_lifecycle_audit
after update of status on public.finance_billable_charges
for each row execute function public.record_finance_billable_charge_invoice_lifecycle_audit();

create or replace function public.validate_finance_invoice_v2_integrity(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $invoice_v2_integrity$
declare
  v_invoice public.finance_invoices%rowtype;
  v_bridge public.finance_billing_installment_charge_bridges%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_expected_allocation_status text;
  v_expected_charge_status text;
  v_item_count integer;
  v_before numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_source_count integer;
begin
  select * into v_invoice from public.finance_invoices where id = p_invoice_id;
  if v_invoice.id is null then return; end if;
  if v_invoice.source_model <> 'billable_charge_v2' then
    raise exception 'Invoice V2 integrity requires billable_charge_v2 source model';
  end if;
  if not exists (
    select 1
    from public.finance_invoice_v2_composition_requests as request
    where request.request_id = v_invoice.v2_creation_request_id
      and request.invoice_id = v_invoice.id
      and request.operation = 'create'
      and request.request_fingerprint = v_invoice.v2_creation_fingerprint
  ) then
    raise exception 'Invoice V2 durable creation request is missing or inconsistent';
  end if;
  if exists (
    select 1 from public.finance_invoice_installment_allocations
    where invoice_id = v_invoice.id
  ) then
    raise exception 'Invoice V2 cannot use the Invoice V1 installment-allocation contract';
  end if;

  v_expected_allocation_status := case
    when v_invoice.document_status = 'draft' then 'reserved'
    when v_invoice.document_status = 'issued' then 'invoiced'
    else 'released'
  end;
  v_expected_charge_status := case
    when v_invoice.document_status = 'draft' then 'reserved'
    when v_invoice.document_status = 'issued' then 'invoiced'
    else null
  end;

  select count(*)::integer, coalesce(sum(amount_before_vat),0), coalesce(sum(vat_amount),0), coalesce(sum(line_total),0)
  into v_item_count, v_before, v_vat, v_total
  from public.finance_invoice_items
  where invoice_id = v_invoice.id and source_state = 'active';
  if v_item_count = 0 or v_before <> v_invoice.amount_before_vat or v_vat <> v_invoice.vat_amount or v_total <> v_invoice.total_amount then
    raise exception 'Invoice V2 active items do not reconcile to Invoice totals';
  end if;

  if exists (
    select 1
    from public.finance_invoice_items as item
    left join public.finance_invoice_charge_allocations as allocation
      on allocation.invoice_item_id = item.id and allocation.status = v_expected_allocation_status
    left join public.finance_billable_charges as charge on charge.id = item.source_billable_charge_id
    where item.invoice_id = v_invoice.id and item.source_state = 'active'
      and (
        item.source_billable_charge_id is null
        or allocation.id is null
        or allocation.invoice_id <> v_invoice.id
        or allocation.billable_charge_id <> charge.id
        or charge.id is null
        or charge.client_id <> v_invoice.client_id
        or charge.case_id is distinct from v_invoice.case_id
        or charge.advisory_matter_id is distinct from v_invoice.advisory_matter_id
        or charge.currency <> v_invoice.currency
        or (v_expected_charge_status is not null and charge.status <> v_expected_charge_status)
        or item.amount_before_vat <> charge.amount_before_vat
        or item.vat_amount <> charge.vat_amount
        or item.line_total <> charge.total_amount
        or allocation.amount_before_vat <> charge.amount_before_vat
        or allocation.vat_amount <> charge.vat_amount
        or allocation.total_amount <> charge.total_amount
      )
  ) then
    raise exception 'Invoice V2 items, allocations, and Charges are inconsistent';
  end if;

  if exists (
    select 1 from public.finance_invoice_charge_allocations as allocation
    join public.finance_invoice_items as item on item.id = allocation.invoice_item_id
    where allocation.invoice_id = v_invoice.id
      and allocation.status in ('reserved','invoiced')
      and item.source_state <> 'active'
  ) then
    raise exception 'Released Invoice V2 items cannot retain effective Charge reservations';
  end if;

  if v_invoice.v2_bridge_id is not null then
    select * into v_bridge from public.finance_billing_installment_charge_bridges where id = v_invoice.v2_bridge_id;
    select * into v_installment from public.finance_billing_installments where id = v_bridge.billing_installment_id;
    if v_bridge.id is null or v_installment.id is null
      or v_invoice.billing_plan_id <> v_bridge.billing_plan_id
      or v_invoice.fee_agreement_id <> v_bridge.fee_agreement_id
      or v_invoice.client_id <> v_bridge.client_id
      or v_invoice.case_id is distinct from v_bridge.case_id
      or v_invoice.advisory_matter_id is distinct from v_bridge.advisory_matter_id
      or v_invoice.currency <> v_bridge.currency
    then raise exception 'Invoice V2 bridge lineage is inconsistent'; end if;

    select count(*)::integer into v_source_count
    from public.finance_billing_installment_items where billing_installment_id = v_installment.id;
    if v_source_count = 0 or v_source_count <> (
      select count(*) from public.finance_invoice_items as item
      join public.finance_billable_charges as charge on charge.id = item.source_billable_charge_id
      where item.invoice_id = v_invoice.id and item.source_state = 'active'
        and charge.source_type = 'billing_installment_item'
        and charge.source_billing_installment_item_id in (
          select id from public.finance_billing_installment_items where billing_installment_id = v_installment.id
        )
    ) then raise exception 'Invoice V2 must contain the complete bridged Billing Installment Charge group'; end if;

    if v_invoice.document_status = 'issued' and v_installment.status <> 'invoiced' then
      raise exception 'Issued Invoice V2 requires its bridged installment to be invoiced';
    end if;
    if v_invoice.document_status = 'draft' and v_installment.status <> 'ready_to_invoice' then
      raise exception 'Draft Invoice V2 requires its bridged installment to remain ready';
    end if;
  elsif exists (
    select 1 from public.finance_invoice_items as item
    join public.finance_billable_charges as charge on charge.id = item.source_billable_charge_id
    where item.invoice_id = v_invoice.id and item.source_state = 'active'
      and charge.source_type = 'billing_installment_item'
  ) then
    raise exception 'Charge-only Invoice V2 cannot contain bridged installment Charges';
  end if;
end;
$invoice_v2_integrity$;

create or replace function public.validate_finance_invoice_integrity(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $invoice_integrity_dispatch$
declare
  v_source_model text;
begin
  select source_model into v_source_model from public.finance_invoices where id = p_invoice_id;
  if not found then return; end if;
  if v_source_model = 'installment_v1' then
    perform public.validate_finance_invoice_v1_integrity_internal(p_invoice_id);
  elsif v_source_model = 'billable_charge_v2' then
    perform public.validate_finance_invoice_v2_integrity(p_invoice_id);
  else
    raise exception 'Invoice source model is invalid';
  end if;
end;
$invoice_integrity_dispatch$;

create or replace function public.enforce_finance_invoice_charge_allocation_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_charge_allocation_integrity_trigger$
begin
  if tg_table_name = 'finance_billable_charges' then
    perform public.validate_finance_invoice_integrity(allocation.invoice_id)
    from public.finance_invoice_charge_allocations as allocation
    where allocation.billable_charge_id = coalesce(new.id, old.id);
  else
    perform public.validate_finance_invoice_integrity(coalesce(new.invoice_id, old.invoice_id));
  end if;
  return null;
end;
$invoice_charge_allocation_integrity_trigger$;

create constraint trigger finance_invoice_charge_allocation_integrity
after insert or update or delete on public.finance_invoice_charge_allocations
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_charge_allocation_integrity();

create constraint trigger finance_charge_invoice_allocation_integrity
after update on public.finance_billable_charges
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_charge_allocation_integrity();

create or replace function public.create_finance_invoice_v2_draft(
  p_request_id uuid,
  p_billing_installment_id uuid default null,
  p_charge_ids uuid[] default '{}'::uuid[],
  p_adapter_certification_json jsonb default '{}'::jsonb,
  p_human_confirmed boolean default false,
  p_language_code text default 'th',
  p_due_date date default null,
  p_customer_note text default null,
  p_payment_terms_text text default null,
  p_internal_note text default null,
  p_payment_destination_bank_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_invoice_v2_draft$
declare
  v_request public.finance_invoice_v2_composition_requests%rowtype;
  v_fingerprint text;
  v_external_ids uuid[] := '{}'::uuid[];
  v_all_charge_ids uuid[] := '{}'::uuid[];
  v_generated_ids uuid[] := '{}'::uuid[];
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
  v_bridge public.finance_billing_installment_charge_bridges%rowtype;
  v_billing_plan_id uuid;
  v_bridge_id uuid;
  v_invoice_id uuid;
  v_item_id uuid;
  v_client public.clients%rowtype;
  v_company public.finance_company_profiles%rowtype;
  v_context_charge public.finance_billable_charges%rowtype;
  v_charge public.finance_billable_charges%rowtype;
  v_source record;
  v_semantics jsonb;
  v_economic text;
  v_unit text;
  v_price_mode text;
  v_charge_id uuid;
  v_before numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_sort integer := 0;
  v_language text := lower(btrim(coalesce(p_language_code, '')));
  v_actor_email text;
  v_actor_name text;
  v_customer_snapshot jsonb;
  v_seller_snapshot jsonb;
  v_bridge_certification jsonb;
  v_missing_adapter_semantics boolean;
begin
  if not public.current_user_can_manage_finance_quotations()
    or not public.current_user_can_manage_finance_billable_charges()
  then raise exception 'Not allowed to compose Invoice V2 Draft'; end if;
  if p_request_id is null then raise exception 'Invoice V2 request ID is required'; end if;
  if p_human_confirmed is distinct from true then raise exception 'Invoice V2 composition confirmation is required'; end if;
  if v_language not in ('th','en') then raise exception 'Invoice language is invalid'; end if;
  if jsonb_typeof(coalesce(p_adapter_certification_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Invoice V2 adapter certification must be an object';
  end if;
  if p_payment_destination_bank_account_id is not null and not exists (
    select 1 from public.finance_bank_accounts
    where id = p_payment_destination_bank_account_id and is_active
      and nullif(btrim(coalesce(account_name,'')), '') is not null
      and nullif(btrim(coalesce(account_number,'')), '') is not null
  ) then raise exception 'Selected Invoice payment bank account is not eligible'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_external_ids
  from (select distinct unnest(coalesce(p_charge_ids, '{}'::uuid[])) as id) as normalized;
  v_fingerprint := md5(jsonb_build_object(
    'billing_installment_id', p_billing_installment_id,
    'charge_ids', to_jsonb(v_external_ids),
    'adapter', coalesce(p_adapter_certification_json, '{}'::jsonb),
    'language', v_language,
    'due_date', p_due_date,
    'customer_note', nullif(btrim(coalesce(p_customer_note,'')),''),
    'payment_terms_text', nullif(btrim(coalesce(p_payment_terms_text,'')),''),
    'internal_note', nullif(btrim(coalesce(p_internal_note,'')),''),
    'payment_destination_bank_account_id', p_payment_destination_bank_account_id
  )::text);
  select * into v_request from public.finance_invoice_v2_composition_requests where request_id = p_request_id;
  if v_request.request_id is not null then
    if v_request.operation <> 'create' or v_request.request_fingerprint <> v_fingerprint then
      raise exception 'Invoice V2 request ID was already used with different composition data';
    end if;
    return v_request.invoice_id;
  end if;

  if p_billing_installment_id is not null then
    if not public.current_user_can_approve_finance_billable_charges() then
      raise exception 'Fixed-installment Invoice V2 composition requires Billable Charge approval authority';
    end if;
    select billing_plan_id into v_billing_plan_id
    from public.finance_billing_installments where id = p_billing_installment_id;
    if v_billing_plan_id is null then raise exception 'Billing Installment not found'; end if;
    select * into v_plan from public.finance_billing_plans where id = v_billing_plan_id for update;
    select * into v_installment from public.finance_billing_installments where id = p_billing_installment_id for update;
    perform public.assert_finance_billing_installment_v2_bridge_eligible(v_installment.id);
    select * into v_agreement from public.finance_fee_agreements where id = v_plan.fee_agreement_id for update;
    select * into v_bridge
    from public.finance_billing_installment_charge_bridges
    where billing_installment_id = v_installment.id
    for update;

    if v_bridge.id is not null then
      v_bridge_id := v_bridge.id;
      if v_bridge.billing_plan_id <> v_plan.id
        or v_bridge.fee_agreement_id <> v_agreement.id
        or v_bridge.client_id <> v_agreement.client_id
        or v_bridge.case_id is distinct from v_agreement.case_id
        or v_bridge.advisory_matter_id is distinct from v_agreement.advisory_matter_id
        or v_bridge.currency <> v_plan.currency
      then raise exception 'Existing Invoice V2 bridge lineage is inconsistent'; end if;
      if exists (
        select 1 from public.finance_invoices
        where v2_bridge_id = v_bridge.id and document_status not in ('cancelled','voided')
      ) then raise exception 'An active Invoice V2 already exists for this bridged installment'; end if;
      select coalesce(array_agg(charge.id order by charge.id), '{}'::uuid[])
      into v_generated_ids
      from public.finance_billable_charges as charge
      join public.finance_billing_installment_items as item
        on item.id = charge.source_billing_installment_item_id
      where item.billing_installment_id = v_installment.id
        and charge.source_type = 'billing_installment_item';
      if cardinality(v_generated_ids) <> (
        select count(*) from public.finance_billing_installment_items
        where billing_installment_id = v_installment.id
      ) or exists (
        select 1 from public.finance_billable_charges
        where id = any(v_generated_ids) and status <> 'ready_to_invoice'
      ) then raise exception 'Existing bridged installment Charge group is incomplete or unavailable'; end if;
    else
      select exists (
        select 1
        from public.finance_billing_installment_items
        where billing_installment_id = v_installment.id
          and economic_classification is null
      ) into v_missing_adapter_semantics;
      if v_missing_adapter_semantics and (
        coalesce((p_adapter_certification_json->>'human_confirmed')::boolean, false) is distinct from true
        or coalesce(p_adapter_certification_json->>'schema_version','') <> '1'
      ) then raise exception 'Human-certified installment semantic adapter is required for missing upstream semantics'; end if;
      v_bridge_certification := jsonb_build_object(
        'schema_version', 1,
        'human_confirmed', true,
        'confirmation_basis', case
          when v_missing_adapter_semantics then 'human_semantic_adapter'
          else 'upstream_frozen_semantics'
        end,
        'adapter_semantics_required', v_missing_adapter_semantics,
        'adapter', coalesce(p_adapter_certification_json, '{}'::jsonb)
      );

      insert into public.finance_billing_installment_charge_bridges (
        billing_installment_id, billing_plan_id, fee_agreement_id, client_id, case_id,
        advisory_matter_id, currency, request_id, source_snapshot_json,
        certification_snapshot_json, claimed_by_user_id
      ) values (
        v_installment.id, v_plan.id, v_agreement.id, v_agreement.client_id, v_agreement.case_id,
        v_agreement.advisory_matter_id, v_plan.currency, p_request_id,
        jsonb_build_object(
          'schema_version',1,'billing_plan',to_jsonb(v_plan),'billing_installment',to_jsonb(v_installment),
          'items',coalesce((select jsonb_agg(to_jsonb(item) order by item.sort_order,item.id)
            from public.finance_billing_installment_items as item where item.billing_installment_id=v_installment.id),'[]'::jsonb)
        ),
        v_bridge_certification, auth.uid()
      ) returning id into v_bridge_id;

      for v_source in
        select installment_item.*, agreement_item.description, agreement_item.vat_applicable,
          agreement_item.vat_rate, agreement_item.tax_category, agreement_item.item_snapshot_json
        from public.finance_billing_installment_items as installment_item
        join public.finance_fee_agreement_items as agreement_item
          on agreement_item.id = installment_item.fee_agreement_item_id
        where installment_item.billing_installment_id = v_installment.id
        order by installment_item.id
        for update of installment_item
      loop
        v_semantics := coalesce(p_adapter_certification_json->'items'->(v_source.id::text), '{}'::jsonb);
        v_economic := coalesce(v_source.economic_classification, nullif(lower(btrim(v_semantics->>'economic_classification')),''));
        v_unit := coalesce(v_source.unit, nullif(btrim(v_semantics->>'unit'),''));
        v_price_mode := nullif(lower(btrim(coalesce(v_source.item_snapshot_json->>'price_tax_mode',''))),'');
        if v_economic is null then raise exception 'Every bridged installment item requires economic classification'; end if;
        if v_source.economic_classification is null and coalesce((v_semantics->>'human_confirmed')::boolean,false) is distinct from true then
          raise exception 'Missing installment semantics require explicit human certification';
        end if;
        if v_price_mode not in ('non_vat','vat_exclusive','vat_inclusive') then
          raise exception 'Bridged installment item price-tax mode is unavailable';
        end if;
        insert into public.finance_billable_charges (
          client_id, case_id, advisory_matter_id, source_type, source_billing_installment_item_id,
          source_reference, source_event_key, source_snapshot_json, idempotency_key,
          description, quantity, unit, unit_rate, currency, service_date,
          economic_classification, vat_applicable, vat_rate, tax_category, price_tax_mode,
          amount_before_vat, vat_amount, total_amount, status, calculation_basis,
          source_semantics_json, created_by_user_id, updated_by_user_id
        ) values (
          v_agreement.client_id, v_agreement.case_id, v_agreement.advisory_matter_id,
          'billing_installment_item', v_source.id, v_installment.id::text,
          'billing_installment_item:'||v_source.id::text,
          jsonb_build_object('schema_version',1,'bridge_id',v_bridge_id,'billing_installment_item',to_jsonb(v_source)),
          v_source.id, v_source.description, null, v_unit, null, v_plan.currency,
          v_installment.readiness_event_date, v_economic, v_source.vat_applicable,
          v_source.vat_rate, v_source.tax_category, v_price_mode,
          v_source.amount_before_tax, v_source.vat_amount, v_source.total_amount, 'draft',
          'source_fixed_allocation', jsonb_build_object(
            'schema_version',1,'human_certified',true,
            'provenance',case when v_source.economic_classification is null then 'human_adapter' else 'upstream_frozen' end,
            'description',v_source.description,'unit',v_unit,'economic_classification',v_economic,
            'price_tax_mode',v_price_mode,'bridge_id',v_bridge_id,'certification',v_semantics
          ), auth.uid(), auth.uid()
        ) returning id into v_charge_id;
        perform public.mark_finance_billable_charge_ready(v_charge_id, true);
        v_generated_ids := array_append(v_generated_ids, v_charge_id);
      end loop;
    end if;
  end if;

  if cardinality(v_external_ids) > 0 then
    perform 1 from public.finance_billable_charges where id = any(v_external_ids) order by id for update;
    if (select count(*) from public.finance_billable_charges where id = any(v_external_ids)) <> cardinality(v_external_ids) then
      raise exception 'One or more selected Billable Charges do not exist';
    end if;
    if exists (select 1 from public.finance_billable_charges where id=any(v_external_ids) and (status<>'ready_to_invoice' or source_type='billing_installment_item')) then
      raise exception 'Selected external Billable Charges must be Ready and must not be installment-generated';
    end if;
  end if;
  v_all_charge_ids := v_generated_ids || v_external_ids;
  if cardinality(v_all_charge_ids) = 0 then raise exception 'Invoice V2 requires at least one Billable Charge'; end if;

  if v_bridge_id is not null then
    select * into v_context_charge from public.finance_billable_charges where id = v_generated_ids[1];
  else
    select * into v_context_charge from public.finance_billable_charges where id = v_external_ids[1];
  end if;
  if exists (
    select 1 from public.finance_billable_charges
    where id=any(v_all_charge_ids) and (
      client_id<>v_context_charge.client_id or currency<>v_context_charge.currency
      or case_id is distinct from v_context_charge.case_id
      or advisory_matter_id is distinct from v_context_charge.advisory_matter_id
    )
  ) then raise exception 'Invoice V2 sources must have the same Client, currency, and exact matter context'; end if;

  select * into v_client from public.clients where id=v_context_charge.client_id;
  select * into v_company from public.finance_company_profiles where id='default';
  v_customer_snapshot := case
    when v_bridge_id is not null
      and jsonb_typeof(v_agreement.client_snapshot_json) = 'object'
      and v_agreement.client_snapshot_json <> '{}'::jsonb
      then v_agreement.client_snapshot_json
    else jsonb_strip_nulls(jsonb_build_object(
      'id',v_client.id,'name',v_client.name,'client_type',v_client.client_type,'tax_id',v_client.tax_id,
      'address',v_client.address,'phone',v_client.phone,'email',v_client.email))
  end;
  v_seller_snapshot := case
    when v_bridge_id is not null
      and jsonb_typeof(v_agreement.company_snapshot_json) = 'object'
      and v_agreement.company_snapshot_json <> '{}'::jsonb
      then v_agreement.company_snapshot_json
    else jsonb_strip_nulls(jsonb_build_object(
      'company_name_th',v_company.company_name_th,'company_name_en',v_company.company_name_en,
      'tax_id',v_company.tax_id,'branch_label',coalesce(v_company.branch_th,v_company.branch_label),
      'address_th',v_company.address_th,'address_en',v_company.address_en,'phone',v_company.phone,
      'email',v_company.email,'website',v_company.website))
  end;
  select coalesce(sum(amount_before_vat),0),coalesce(sum(vat_amount),0),coalesce(sum(total_amount),0)
    into v_before,v_vat,v_total from public.finance_billable_charges where id=any(v_all_charge_ids);
  select profile.email,coalesce(nullif(btrim(profile.staff_name),''),nullif(btrim(profile.full_name),''),profile.email)
    into v_actor_email,v_actor_name from public.user_profiles profile where profile.id=auth.uid();

  perform set_config('vp.invoice_v2_lifecycle','compose',true);
  insert into public.finance_invoices (
    billing_plan_id,primary_billing_installment_id,fee_agreement_id,source_quotation_id,
    client_id,case_id,advisory_matter_id,source_model,v2_bridge_id,v2_creation_request_id,
    v2_creation_fingerprint,document_status,due_date,currency,language_code,customer_note,
    payment_terms_text,internal_note,payment_destination_bank_account_id,
    amount_before_vat,vat_amount,total_amount,seller_name_th,seller_name_en,seller_tax_id,
    seller_branch,seller_address,seller_phone,seller_email,seller_website,customer_name,
    customer_tax_id,customer_branch,customer_billing_address,customer_phone,customer_email,seller_snapshot_json,
    customer_snapshot_json,matter_snapshot_json,source_snapshot_json,created_by_user_id,updated_by_user_id
  ) values (
    case when v_bridge_id is null then null else v_plan.id end,null,
    case when v_bridge_id is null then null else v_agreement.id end,
    case when v_bridge_id is null then null else v_agreement.source_quotation_id end,
    v_context_charge.client_id,v_context_charge.case_id,v_context_charge.advisory_matter_id,
    'billable_charge_v2',v_bridge_id,p_request_id,v_fingerprint,'draft',p_due_date,
    v_context_charge.currency,v_language,nullif(btrim(coalesce(p_customer_note,'')),''),
    nullif(btrim(coalesce(p_payment_terms_text,'')),''),nullif(btrim(coalesce(p_internal_note,'')),''),
    p_payment_destination_bank_account_id,v_before,v_vat,v_total,
    coalesce(v_seller_snapshot->>'company_name_th',v_seller_snapshot->>'name_th',v_company.company_name_th),
    coalesce(v_seller_snapshot->>'company_name_en',v_seller_snapshot->>'name_en',v_company.company_name_en),
    coalesce(v_seller_snapshot->>'tax_id',v_company.tax_id),
    coalesce(v_seller_snapshot->>'branch_th',v_seller_snapshot->>'branch_label',v_company.branch_th,v_company.branch_label),
    coalesce(v_seller_snapshot->>'address_th',v_seller_snapshot->>'address',v_company.address_th),
    coalesce(v_seller_snapshot->>'phone',v_company.phone),coalesce(v_seller_snapshot->>'email',v_company.email),
    coalesce(v_seller_snapshot->>'website',v_company.website),
    coalesce(v_customer_snapshot->>'client_display_name',v_customer_snapshot->>'name',v_client.name),
    coalesce(v_customer_snapshot->>'tax_id',v_client.tax_id),
    coalesce(v_customer_snapshot->>'branch',v_customer_snapshot->>'branch_label'),
    coalesce(v_customer_snapshot->>'billing_address',v_customer_snapshot->>'address',v_client.address),
    coalesce(v_customer_snapshot->>'phone',v_client.phone),coalesce(v_customer_snapshot->>'email',v_client.email),
    v_seller_snapshot,v_customer_snapshot,
    case
      when v_bridge_id is not null and jsonb_typeof(v_agreement.matter_snapshot_json) = 'object'
        then v_agreement.matter_snapshot_json
      else jsonb_strip_nulls(jsonb_build_object('case_id',v_context_charge.case_id,'advisory_matter_id',v_context_charge.advisory_matter_id))
    end,
    jsonb_build_object('schema_version',2,'invoice_source_model','billable_charge_v2','bridge_id',v_bridge_id,'charge_ids',to_jsonb(v_all_charge_ids)),
    auth.uid(),auth.uid()
  ) returning id into v_invoice_id;

  for v_charge in select * from public.finance_billable_charges where id=any(v_all_charge_ids) order by id loop
    v_sort := v_sort+1;
    insert into public.finance_invoice_items (
      invoice_id,source_billable_charge_id,description,source_quantity,source_unit_price,
      vat_applicable,vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,
      line_total,sort_order,source_snapshot_json
    ) values (
      v_invoice_id,v_charge.id,v_charge.description,v_charge.quantity,v_charge.unit_rate,
      v_charge.vat_applicable,v_charge.vat_rate,v_charge.tax_category,v_charge.price_tax_mode,
      v_charge.amount_before_vat,v_charge.vat_amount,v_charge.total_amount,v_sort,
      jsonb_build_object('schema_version',2,'billable_charge_id',v_charge.id,'ready_snapshot',v_charge.ready_snapshot_json)
    ) returning id into v_item_id;
    insert into public.finance_invoice_charge_allocations (
      invoice_id,invoice_item_id,billable_charge_id,amount_before_vat,vat_amount,total_amount,
      source_snapshot_json,status,request_id,reserved_by_user_id
    ) values (
      v_invoice_id,v_item_id,v_charge.id,v_charge.amount_before_vat,v_charge.vat_amount,
      v_charge.total_amount,jsonb_build_object('ready_snapshot',v_charge.ready_snapshot_json),
      'reserved',p_request_id,auth.uid()
    );
    update public.finance_billable_charges set status='reserved',updated_at=now(),updated_by_user_id=auth.uid() where id=v_charge.id;
  end loop;

  insert into public.finance_invoice_v2_composition_requests (
    request_id,invoice_id,operation,request_fingerprint,result_snapshot_json,created_by_user_id
  ) values (
    p_request_id,v_invoice_id,'create',v_fingerprint,
    jsonb_build_object('invoice_id',v_invoice_id,'bridge_id',v_bridge_id,'charge_ids',to_jsonb(v_all_charge_ids)),auth.uid()
  );
  insert into public.finance_invoice_audit_events (
    invoice_id,event_type,event_payload_json,actor_user_id,actor_email,actor_name
  ) values (
    v_invoice_id,'v2_draft_composed',jsonb_build_object(
      'request_id',p_request_id,'bridge_id',v_bridge_id,'charge_ids',to_jsonb(v_all_charge_ids),
      'amount_before_vat',v_before,'vat_amount',v_vat,'total_amount',v_total,'invoice_number_allocated',false
    ),auth.uid(),v_actor_email,v_actor_name
  );
  perform public.validate_finance_invoice_integrity(v_invoice_id);
  return v_invoice_id;
end;
$create_invoice_v2_draft$;

create or replace function public.replace_finance_invoice_v2_draft_charges(
  p_invoice_id uuid,
  p_request_id uuid,
  p_charge_ids uuid[],
  p_human_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $replace_invoice_v2_charges$
declare
  v_invoice public.finance_invoices%rowtype;
  v_request public.finance_invoice_v2_composition_requests%rowtype;
  v_ids uuid[];
  v_fingerprint text;
  v_charge public.finance_billable_charges%rowtype;
  v_item_id uuid;
  v_before numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_sort integer;
  v_now timestamptz:=now();
begin
  if not public.current_user_can_manage_finance_quotations() or not public.current_user_can_manage_finance_billable_charges() then
    raise exception 'Not allowed to change Invoice V2 composition';
  end if;
  if p_invoice_id is null or p_request_id is null then raise exception 'Invoice and request ID are required'; end if;
  if p_human_confirmed is distinct from true then raise exception 'Invoice V2 composition confirmation is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_ids
  from (select distinct unnest(coalesce(p_charge_ids,'{}'::uuid[])) id) normalized;
  v_fingerprint:=md5(jsonb_build_object('invoice_id',p_invoice_id,'external_charge_ids',to_jsonb(v_ids))::text);
  select * into v_request from public.finance_invoice_v2_composition_requests where request_id=p_request_id;
  if v_request.request_id is not null then
    if v_request.operation<>'replace' or v_request.invoice_id<>p_invoice_id or v_request.request_fingerprint<>v_fingerprint then
      raise exception 'Invoice V2 request ID was already used with different composition data';
    end if;
    return p_invoice_id;
  end if;
  select * into v_invoice from public.finance_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.source_model<>'billable_charge_v2' or v_invoice.document_status<>'draft' then
    raise exception 'Only a Draft Invoice V2 can change composition';
  end if;
  if v_invoice.v2_bridge_id is null and cardinality(v_ids)=0 then raise exception 'Charge-only Invoice V2 requires at least one Charge'; end if;
  if cardinality(v_ids)>0 then
    perform 1 from public.finance_billable_charges where id=any(v_ids) order by id for update;
    if (select count(*) from public.finance_billable_charges where id=any(v_ids))<>cardinality(v_ids)
      or exists (select 1 from public.finance_billable_charges where id=any(v_ids) and source_type='billing_installment_item')
    then raise exception 'External Invoice V2 Charge selection is invalid'; end if;
    if exists (
      select 1 from public.finance_billable_charges charge
      where charge.id=any(v_ids)
        and not (
          charge.status='ready_to_invoice'
          or exists (
            select 1 from public.finance_invoice_charge_allocations allocation
            where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id and allocation.status='reserved'
          )
        )
    ) then raise exception 'Selected Billable Charge is not available'; end if;
    if exists (select 1 from public.finance_billable_charges where id=any(v_ids) and (
      client_id<>v_invoice.client_id or currency<>v_invoice.currency or case_id is distinct from v_invoice.case_id
      or advisory_matter_id is distinct from v_invoice.advisory_matter_id
    )) then raise exception 'Selected Billable Charges are incompatible with Invoice context'; end if;
  end if;

  perform set_config('vp.invoice_v2_lifecycle','compose',true);
  update public.finance_invoice_charge_allocations allocation
  set status='released',released_at=v_now,released_by_user_id=auth.uid(),release_reason='Removed from Invoice V2 Draft composition'
  from public.finance_billable_charges charge
  where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id
    and allocation.status='reserved' and charge.source_type<>'billing_installment_item'
    and not (charge.id=any(v_ids));
  update public.finance_invoice_items item set source_state='released',updated_at=v_now
  where item.invoice_id=v_invoice.id and item.source_state='active'
    and exists (select 1 from public.finance_billable_charges charge where charge.id=item.source_billable_charge_id and charge.source_type<>'billing_installment_item')
    and not (item.source_billable_charge_id=any(v_ids));
  update public.finance_billable_charges charge set status='ready_to_invoice',updated_at=v_now,updated_by_user_id=auth.uid()
  where charge.status='reserved' and charge.source_type<>'billing_installment_item'
    and exists (select 1 from public.finance_invoice_charge_allocations allocation where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id and allocation.status='released' and allocation.released_at=v_now);

  select coalesce(max(sort_order),0) into v_sort from public.finance_invoice_items where invoice_id=v_invoice.id;
  for v_charge in select * from public.finance_billable_charges charge where charge.id=any(v_ids) and charge.status='ready_to_invoice' order by charge.id loop
    v_sort:=v_sort+1;
    insert into public.finance_invoice_items (
      invoice_id,source_billable_charge_id,description,source_quantity,source_unit_price,vat_applicable,
      vat_rate,tax_category,price_tax_mode,amount_before_vat,vat_amount,line_total,sort_order,source_snapshot_json
    ) values (
      v_invoice.id,v_charge.id,v_charge.description,v_charge.quantity,v_charge.unit_rate,v_charge.vat_applicable,
      v_charge.vat_rate,v_charge.tax_category,v_charge.price_tax_mode,v_charge.amount_before_vat,v_charge.vat_amount,
      v_charge.total_amount,v_sort,jsonb_build_object('schema_version',2,'billable_charge_id',v_charge.id,'ready_snapshot',v_charge.ready_snapshot_json)
    ) returning id into v_item_id;
    insert into public.finance_invoice_charge_allocations (
      invoice_id,invoice_item_id,billable_charge_id,amount_before_vat,vat_amount,total_amount,
      source_snapshot_json,status,request_id,reserved_by_user_id
    ) values (
      v_invoice.id,v_item_id,v_charge.id,v_charge.amount_before_vat,v_charge.vat_amount,v_charge.total_amount,
      jsonb_build_object('ready_snapshot',v_charge.ready_snapshot_json),'reserved',p_request_id,auth.uid()
    );
    update public.finance_billable_charges set status='reserved',updated_at=v_now,updated_by_user_id=auth.uid() where id=v_charge.id;
  end loop;
  select coalesce(sum(amount_before_vat),0),coalesce(sum(vat_amount),0),coalesce(sum(line_total),0)
    into v_before,v_vat,v_total from public.finance_invoice_items where invoice_id=v_invoice.id and source_state='active';
  update public.finance_invoices set amount_before_vat=v_before,vat_amount=v_vat,total_amount=v_total,
    updated_at=v_now,updated_by_user_id=auth.uid() where id=v_invoice.id;
  insert into public.finance_invoice_v2_composition_requests(request_id,invoice_id,operation,request_fingerprint,result_snapshot_json,created_by_user_id)
    values(p_request_id,v_invoice.id,'replace',v_fingerprint,jsonb_build_object('invoice_id',v_invoice.id,'external_charge_ids',to_jsonb(v_ids)),auth.uid());
  insert into public.finance_invoice_audit_events(invoice_id,event_type,event_payload_json,actor_user_id)
    values(v_invoice.id,'v2_composition_changed',jsonb_build_object('request_id',p_request_id,'external_charge_ids',to_jsonb(v_ids),'total_amount',v_total),auth.uid());
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  return v_invoice.id;
end;
$replace_invoice_v2_charges$;

create or replace function public.cancel_finance_invoice_draft(p_invoice_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path=public
as $cancel_invoice_dispatch$
declare
  v_invoice public.finance_invoices%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_now timestamptz:=now();
begin
  select * into v_invoice from public.finance_invoices where id=p_invoice_id;
  if v_invoice.source_model='installment_v1' then return public.cancel_finance_invoice_v1_draft_internal(p_invoice_id,p_reason); end if;
  if not public.current_user_can_manage_finance_quotations() or not public.current_user_can_manage_finance_billable_charges() then raise exception 'Not allowed to cancel Invoice V2 Draft'; end if;
  if v_reason is null then raise exception 'Invoice Draft cancellation reason is required'; end if;
  if length(v_reason)>1000 then raise exception 'Invoice Draft cancellation reason is too long'; end if;
  select * into v_invoice from public.finance_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status='cancelled' then return v_invoice.id; end if;
  if v_invoice.source_model<>'billable_charge_v2' or v_invoice.document_status<>'draft' then raise exception 'Only a Draft Invoice V2 can be cancelled'; end if;
  perform 1 from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='reserved' order by billable_charge_id for update;
  perform 1 from public.finance_billable_charges where id in(select billable_charge_id from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='reserved') order by id for update;
  perform set_config('vp.invoice_v2_lifecycle','cancel',true);
  update public.finance_invoice_charge_allocations set status='released',released_at=v_now,released_by_user_id=auth.uid(),release_reason=v_reason
    where invoice_id=v_invoice.id and status='reserved';
  update public.finance_billable_charges charge set status='ready_to_invoice',updated_at=v_now,updated_by_user_id=auth.uid()
    where exists(select 1 from public.finance_invoice_charge_allocations allocation where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id and allocation.status='released' and allocation.released_at=v_now);
  update public.finance_invoices set document_status='cancelled',issue_date=null,cancelled_at=v_now,cancelled_by_user_id=auth.uid(),cancel_reason=v_reason,updated_at=v_now,updated_by_user_id=auth.uid() where id=v_invoice.id;
  insert into public.finance_invoice_audit_events(invoice_id,event_type,event_payload_json,actor_user_id)
    values(v_invoice.id,'cancelled',jsonb_build_object('source_model','billable_charge_v2','reason',v_reason,'bridge_preserved',v_invoice.v2_bridge_id is not null,'charges_returned_ready',true),auth.uid());
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  return v_invoice.id;
end;
$cancel_invoice_dispatch$;

create or replace function public.issue_finance_invoice(p_invoice_id uuid,p_human_confirmed boolean)
returns uuid
language plpgsql
security definer
set search_path=public
as $issue_invoice_dispatch$
declare
  v_invoice public.finance_invoices%rowtype;
  v_bridge public.finance_billing_installment_charge_bridges%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_invoice_no text;
  v_now timestamptz:=now();
  v_snapshot jsonb;
begin
  select * into v_invoice from public.finance_invoices where id=p_invoice_id;
  if v_invoice.source_model='installment_v1' then return public.issue_finance_invoice_v1_internal(p_invoice_id,p_human_confirmed); end if;
  if not public.current_user_can_manage_finance_quotations() or not public.current_user_can_manage_finance_billable_charges() then raise exception 'Not allowed to issue Invoice V2'; end if;
  if p_human_confirmed is distinct from true then raise exception 'Invoice issue confirmation is required'; end if;
  select * into v_invoice from public.finance_invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status='issued' then return v_invoice.id; end if;
  if v_invoice.source_model<>'billable_charge_v2' or v_invoice.document_status<>'draft' then raise exception 'Only a Draft Invoice V2 can be issued'; end if;
  if nullif(btrim(coalesce(v_invoice.customer_name,'')),'') is null or v_invoice.issue_date is null then raise exception 'Invoice customer and issue date are required'; end if;
  if v_invoice.issue_date>(now() at time zone 'Asia/Bangkok')::date then raise exception 'Invoice issue date cannot be in the future'; end if;
  if v_invoice.due_date is not null and v_invoice.due_date<v_invoice.issue_date then raise exception 'Invoice due date cannot be before issue date'; end if;
  if v_invoice.v2_bridge_id is not null then
    select * into v_bridge from public.finance_billing_installment_charge_bridges where id=v_invoice.v2_bridge_id;
    select * into v_plan from public.finance_billing_plans where id=v_bridge.billing_plan_id for update;
    select * into v_installment from public.finance_billing_installments where id=v_bridge.billing_installment_id for update;
    if v_plan.id is null or v_plan.status<>'active' then raise exception 'Bridged Billing Plan is not active'; end if;
    if v_installment.status<>'ready_to_invoice' then raise exception 'Bridged Billing Installment is not ready to invoice'; end if;
  end if;
  perform 1 from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='reserved' order by billable_charge_id for update;
  perform 1 from public.finance_billable_charges where id in(select billable_charge_id from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='reserved') order by id for update;
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  v_invoice_no:=public.generate_finance_document_no('invoice',v_invoice.issue_date);
  select jsonb_build_object(
    'schema_version',2,'source_model','billable_charge_v2',
    'invoice',jsonb_strip_nulls(to_jsonb(v_invoice)||jsonb_build_object('invoice_no',v_invoice_no,'document_status','issued','issued_at',v_now,'issued_by_user_id',auth.uid())),
    'seller',v_invoice.seller_snapshot_json,'customer',v_invoice.customer_snapshot_json,'matter',v_invoice.matter_snapshot_json,
    'source',v_invoice.source_snapshot_json,
    'bridge',case when v_bridge.id is null then null else jsonb_build_object('id',v_bridge.id,'source_snapshot',v_bridge.source_snapshot_json,'certification_snapshot',v_bridge.certification_snapshot_json) end,
    'items',coalesce((select jsonb_agg(jsonb_build_object('invoice_item',to_jsonb(item),'charge',to_jsonb(charge),'charge_ready_snapshot',charge.ready_snapshot_json,'allocation',to_jsonb(allocation)) order by item.sort_order,item.id)
      from public.finance_invoice_items item join public.finance_invoice_charge_allocations allocation on allocation.invoice_item_id=item.id and allocation.status='reserved'
      join public.finance_billable_charges charge on charge.id=allocation.billable_charge_id where item.invoice_id=v_invoice.id and item.source_state='active'),'[]'::jsonb)
  ) into v_snapshot;
  perform set_config('vp.invoice_v2_lifecycle','issue',true);
  update public.finance_invoices set invoice_no=v_invoice_no,document_status='issued',issued_snapshot_json=v_snapshot,issued_at=v_now,issued_by_user_id=auth.uid(),updated_at=v_now,updated_by_user_id=auth.uid() where id=v_invoice.id;
  update public.finance_invoice_charge_allocations set status='invoiced',invoiced_at=v_now,invoiced_by_user_id=auth.uid() where invoice_id=v_invoice.id and status='reserved';
  update public.finance_billable_charges charge set status='invoiced',updated_at=v_now,updated_by_user_id=auth.uid() where exists(select 1 from public.finance_invoice_charge_allocations allocation where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id and allocation.status='invoiced');
  if v_bridge.id is not null then update public.finance_billing_installments set status='invoiced',invoiced_at=v_now,updated_at=v_now,updated_by_user_id=auth.uid() where id=v_installment.id; end if;
  insert into public.finance_invoice_audit_events(invoice_id,event_type,event_payload_json,actor_user_id)
    values(v_invoice.id,'issued',jsonb_build_object('schema_version',2,'source_model','billable_charge_v2','invoice_no',v_invoice_no,'bridge_id',v_invoice.v2_bridge_id,'payment_created',false,'ledger_entry_created',false,'compensation_entry_created',false),auth.uid());
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  return v_invoice.id;
end;
$issue_invoice_dispatch$;

create or replace function public.void_finance_invoice(p_invoice_id uuid,p_reason text,p_acknowledged boolean)
returns uuid
language plpgsql
security definer
set search_path=public
as $void_invoice_dispatch$
declare
  v_invoice public.finance_invoices%rowtype;
  v_after public.finance_invoices%rowtype;
  v_bridge public.finance_billing_installment_charge_bridges%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_now timestamptz:=now();
  v_draft_payments integer;
  v_confirmed_payments integer;
  v_settled numeric(14,2);
begin
  select * into v_invoice from public.finance_invoices where id=p_invoice_id;
  if v_invoice.source_model='installment_v1' then return public.void_finance_invoice_v1_internal(p_invoice_id,p_reason,p_acknowledged); end if;
  if not public.current_user_can_manage_finance_quotations() or not public.current_user_can_manage_finance_billable_charges() then raise exception 'Not allowed to void Invoice V2'; end if;
  if v_reason is null or length(v_reason)>2000 then raise exception 'Valid Invoice Void reason is required'; end if;
  if p_acknowledged is distinct from true then raise exception 'Invoice Void acknowledgement is required'; end if;
  select * into v_invoice from public.finance_invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.source_model<>'billable_charge_v2' or v_invoice.document_status<>'issued' then raise exception 'Only an Issued Invoice V2 can be voided'; end if;
  select count(*) into v_draft_payments from public.finance_payment_invoice_allocations allocation join public.finance_payments payment on payment.id=allocation.payment_id where allocation.invoice_id=v_invoice.id and payment.status='draft';
  select count(*) into v_confirmed_payments from public.finance_payment_effective_invoice_allocations effective join public.finance_payments payment on payment.id=effective.payment_id where effective.invoice_id=v_invoice.id and payment.status='confirmed';
  select economically_settled_amount into v_settled from public.finance_invoice_settlement_summary where invoice_id=v_invoice.id;
  if v_settled is null then raise exception 'Invoice settlement summary is unavailable'; end if;
  if v_draft_payments>0 then raise exception 'Invoice has an active Payment Draft that must be cancelled before Void'; end if;
  if v_confirmed_payments>0 or v_settled<>0 then raise exception 'Invoice has effective Confirmed Payment settlement and cannot be voided'; end if;
  perform public.assert_finance_invoice_has_no_void_dependencies(v_invoice.id);
  if v_invoice.v2_bridge_id is not null then
    select * into v_bridge from public.finance_billing_installment_charge_bridges where id=v_invoice.v2_bridge_id;
    select * into v_plan from public.finance_billing_plans where id=v_bridge.billing_plan_id for update;
    select * into v_installment from public.finance_billing_installments where id=v_bridge.billing_installment_id for update;
    if v_installment.status<>'invoiced' then raise exception 'Bridged Billing Installment is not invoiced'; end if;
  end if;
  perform 1 from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='invoiced' order by billable_charge_id for update;
  perform 1 from public.finance_billable_charges where id in(select billable_charge_id from public.finance_invoice_charge_allocations where invoice_id=v_invoice.id and status='invoiced') order by id for update;
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  perform set_config('vp.invoice_v2_lifecycle','void',true);
  update public.finance_invoices set document_status='voided',voided_at=v_now,voided_by_user_id=auth.uid(),void_reason=v_reason,updated_at=v_now,updated_by_user_id=auth.uid() where id=v_invoice.id;
  select * into v_after from public.finance_invoices where id=v_invoice.id;
  if v_after.invoice_no is distinct from v_invoice.invoice_no or v_after.issued_snapshot_json is distinct from v_invoice.issued_snapshot_json or v_after.total_amount is distinct from v_invoice.total_amount then raise exception 'Invoice Void must preserve issued evidence'; end if;
  update public.finance_invoice_charge_allocations set status='released',released_at=v_now,released_by_user_id=auth.uid(),release_reason=v_reason where invoice_id=v_invoice.id and status='invoiced';
  update public.finance_billable_charges charge set status='ready_to_invoice',updated_at=v_now,updated_by_user_id=auth.uid() where exists(select 1 from public.finance_invoice_charge_allocations allocation where allocation.invoice_id=v_invoice.id and allocation.billable_charge_id=charge.id and allocation.status='released' and allocation.released_at=v_now);
  if v_bridge.id is not null then
    update public.finance_billing_installments set status='ready_to_invoice',invoiced_at=null,updated_at=v_now,updated_by_user_id=auth.uid() where id=v_installment.id;
    if v_plan.status='completed' then update public.finance_billing_plans set status='active',updated_at=v_now,updated_by_user_id=auth.uid() where id=v_plan.id; end if;
    insert into public.finance_billing_installment_audit_events(billing_installment_id,billing_plan_id,event_type,event_payload_json,actor_user_id)
      values(v_installment.id,v_plan.id,'invoice_voided_reopened',jsonb_build_object('schema_version',2,'invoice_id',v_invoice.id,'invoice_no',v_invoice.invoice_no,'bridge_id',v_bridge.id,'v1_eligibility_restored',false),auth.uid());
  end if;
  insert into public.finance_invoice_audit_events(invoice_id,event_type,event_payload_json,actor_user_id)
    values(v_invoice.id,'voided',jsonb_build_object('schema_version',2,'source_model','billable_charge_v2','reason',v_reason,'bridge_preserved',v_bridge.id is not null,'charges_returned_ready',true,'v1_eligibility_restored',false,'effective_payment_settlement_at_void',0),auth.uid());
  perform public.validate_finance_invoice_integrity(v_invoice.id);
  perform public.validate_finance_invoice_payment_settlement(v_invoice.id);
  return v_invoice.id;
end;
$void_invoice_dispatch$;

alter table public.finance_invoice_v2_composition_requests enable row level security;
alter table public.finance_invoice_charge_allocations enable row level security;
alter table public.finance_invoice_charge_allocation_audit_events enable row level security;

create policy "finance managers select invoice v2 composition requests"
on public.finance_invoice_v2_composition_requests for select
using (public.current_user_can_manage_finance_quotations());
create policy "finance managers select invoice charge allocations"
on public.finance_invoice_charge_allocations for select
using (public.current_user_can_manage_finance_quotations());
create policy "finance managers select invoice charge allocation audit"
on public.finance_invoice_charge_allocation_audit_events for select
using (public.current_user_can_manage_finance_quotations());

revoke all on table public.finance_invoice_v2_composition_requests from public,anon,authenticated;
revoke all on table public.finance_invoice_charge_allocations from public,anon,authenticated;
revoke all on table public.finance_invoice_charge_allocation_audit_events from public,anon,authenticated;
grant select on table public.finance_invoice_v2_composition_requests to authenticated;
grant select on table public.finance_invoice_charge_allocations to authenticated;
grant select on table public.finance_invoice_charge_allocation_audit_events to authenticated;

revoke all on function public.validate_finance_invoice_v1_integrity_internal(uuid) from public,anon,authenticated;
revoke all on function public.validate_finance_invoice_v2_integrity(uuid) from public,anon,authenticated;
revoke all on function public.validate_finance_invoice_integrity(uuid) from public,anon,authenticated;
revoke all on function public.issue_finance_invoice_v1_internal(uuid,boolean) from public,anon,authenticated;
revoke all on function public.cancel_finance_invoice_v1_draft_internal(uuid,text) from public,anon,authenticated;
revoke all on function public.void_finance_invoice_v1_internal(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.enforce_finance_invoice_charge_allocation_lifecycle() from public,anon,authenticated;
revoke all on function public.enforce_finance_invoice_charge_allocation_integrity() from public,anon,authenticated;
revoke all on function public.record_finance_invoice_charge_allocation_audit() from public,anon,authenticated;
revoke all on function public.protect_finance_invoice_charge_allocation_audit() from public,anon,authenticated;
revoke all on function public.protect_finance_invoice_v2_composition_request() from public,anon,authenticated;
revoke all on function public.record_finance_billable_charge_invoice_lifecycle_audit() from public,anon,authenticated;

revoke all on function public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid) to authenticated;
revoke all on function public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean) to authenticated;
revoke all on function public.issue_finance_invoice(uuid,boolean) from public,anon,authenticated;
grant execute on function public.issue_finance_invoice(uuid,boolean) to authenticated;
revoke all on function public.cancel_finance_invoice_draft(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_finance_invoice_draft(uuid,text) to authenticated;
revoke all on function public.void_finance_invoice(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.void_finance_invoice(uuid,text,boolean) to authenticated;

comment on table public.finance_invoice_charge_allocations is
  'History-preserving whole-Charge Invoice V2 reservations. Released rows remain as immutable source evidence.';
comment on table public.finance_invoice_v2_composition_requests is
  'Durable idempotency record for Invoice V2 create and composition-replacement operations.';
comment on function public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid) is
  'Atomically claims an optional permanent installment bridge, creates source-fixed Charges, reserves complete Charges, and creates one unnumbered Invoice V2 Draft.';
comment on function public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean) is
  'Atomically replaces only external Charge membership while preserving a complete bridged fixed-installment Charge group.';
comment on function public.issue_finance_invoice(uuid,boolean) is
  'Source-model dispatcher preserving Invoice V1 issue behavior and atomically issuing a complete reserved Invoice V2 composition.';
comment on function public.cancel_finance_invoice_draft(uuid,text) is
  'Source-model dispatcher preserving V1 cancellation and releasing V2 Charge reservations without deleting a permanent bridge.';
comment on function public.void_finance_invoice(uuid,text,boolean) is
  'Source-model dispatcher preserving Payment-aware V1 Void and returning V2 Charges to Ready while retaining bridge and issued evidence.';
-- END EMBEDDED MIGRATION 032

do $phase_b3b_dry_run_verification$
declare
  v_baseline record;
begin
  select * into v_baseline from phase_b3b_dry_run_baseline;

  if to_regclass('public.finance_invoice_v2_composition_requests') is null
    or to_regclass('public.finance_invoice_charge_allocations') is null
    or to_regclass('public.finance_invoice_charge_allocation_audit_events') is null
    or to_regprocedure('public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)') is null
    or to_regprocedure('public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)') is null
    or to_regprocedure('public.validate_finance_invoice_v1_integrity_internal(uuid)') is null
    or to_regprocedure('public.validate_finance_invoice_v2_integrity(uuid)') is null
  then
    raise exception 'Migration 032 catalog objects are incomplete';
  end if;

  if not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'finance_invoices_source_model_lineage_check'
  ) or not exists (
    select 1 from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = 'finance_invoices_v2_creation_request_fk'
      and condeferrable and condeferred
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'uq_finance_invoice_charge_allocations_effective_charge'
  ) then
    raise exception 'Migration 032 conditional lineage or effective-reservation constraints are incomplete';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.finance_invoice_v2_composition_requests'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.finance_invoice_charge_allocations'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.finance_invoice_charge_allocation_audit_events'::regclass)
    or has_table_privilege('authenticated','public.finance_invoice_v2_composition_requests','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.finance_invoice_charge_allocations','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.finance_invoice_charge_allocation_audit_events','INSERT,UPDATE,DELETE')
  then
    raise exception 'Migration 032 RLS or browser mutation boundary is incomplete';
  end if;

  if (select count(*) from public.finance_billing_installment_charge_bridges) <> v_baseline.bridge_rows
    or (select count(*) from public.finance_billing_installment_charge_bridge_audit_events) <> v_baseline.bridge_audit_rows
    or (select count(*) from public.finance_billable_charges where source_type = 'billing_installment_item') <> v_baseline.generated_installment_charge_rows
    or (select count(*) from public.finance_invoices where source_model = 'billable_charge_v2') <> v_baseline.invoice_v2_rows
    or (select count(*) from public.finance_invoice_v2_composition_requests) <> 0
    or (select count(*) from public.finance_invoice_charge_allocations) <> 0
    or (select count(*) from public.finance_invoice_charge_allocation_audit_events) <> 0
  then
    raise exception 'Migration 032 unexpectedly created operational V2 rows';
  end if;

  if (select md5(coalesce(jsonb_agg(jsonb_build_object(
        'id',invoice.id,'invoice_no',invoice.invoice_no,'document_status',invoice.document_status,
        'source_model',invoice.source_model,'billing_plan_id',invoice.billing_plan_id,
        'primary_billing_installment_id',invoice.primary_billing_installment_id,
        'fee_agreement_id',invoice.fee_agreement_id,'client_id',invoice.client_id,
        'case_id',invoice.case_id,'advisory_matter_id',invoice.advisory_matter_id,
        'issue_date',invoice.issue_date,'due_date',invoice.due_date,'currency',invoice.currency,
        'amount_before_vat',invoice.amount_before_vat,'vat_amount',invoice.vat_amount,
        'total_amount',invoice.total_amount,'issued_snapshot_json',invoice.issued_snapshot_json,
        'payment_destination_bank_account_id',invoice.payment_destination_bank_account_id,
        'payment_destination_snapshot_json',invoice.payment_destination_snapshot_json,
        'cancelled_at',invoice.cancelled_at,'voided_at',invoice.voided_at
      ) order by invoice.id)::text,'[]')) from public.finance_invoices as invoice)
      is distinct from v_baseline.invoice_substantive_digest
  then
    raise exception 'Migration 032 changed existing Invoice substantive data';
  end if;

  if (select md5(to_jsonb(charge)::text) from public.finance_billable_charges as charge
        where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) is distinct from v_baseline.travel_charge_digest
    or (select md5(to_jsonb(charge)::text) from public.finance_billable_charges as charge
        where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) is distinct from v_baseline.court_fee_charge_digest
    or (select md5(to_jsonb(payment)::text) from public.finance_payments as payment
        where id = '99e76b48-9ace-4cb0-aaf6-c50d75a968bb'::uuid) is distinct from v_baseline.active_payment_draft_digest
  then
    raise exception 'Migration 032 changed a controlled UAT Charge or Payment Draft';
  end if;

  if (select count(*) from public.finance_payments) <> v_baseline.payment_rows
    or (select coalesce(sum(cash_amount),0) from public.finance_payments where status = 'confirmed') <> v_baseline.confirmed_cash
    or (select coalesce(sum(wht_amount),0) from public.finance_payments where status = 'confirmed') <> v_baseline.confirmed_wht
    or (select coalesce(sum(settlement_amount),0) from public.finance_payments where status = 'confirmed') <> v_baseline.confirmed_settlement
    or (select count(*) from public.finance_cash_transactions) <> v_baseline.cash_transaction_rows
    or (select count(*) from public.finance_account_opening_balances) <> v_baseline.opening_balance_rows
    or (select count(*) from public.finance_company_ledger) <> v_baseline.legacy_ledger_rows
    or (select count(*) from public.finance_compensation_batches) <> v_baseline.compensation_rows
  then
    raise exception 'Migration 032 changed an out-of-scope Finance baseline';
  end if;

  if (select count(*) from public.finance_invoices
      where invoice_no = 'VP-IV-202608-000001' and document_status = 'voided' and source_model = 'installment_v1') <> 1
    or (select count(*) from public.finance_invoices
      where invoice_no = 'VP-IV-202608-000002' and document_status = 'issued' and source_model = 'installment_v1') <> 1
    or (select count(*) from public.finance_invoices
      where invoice_no = 'VP-IV-202608-000003' and document_status = 'issued' and source_model = 'installment_v1') <> 1
    or to_regclass('public.finance_receipts') is not null
    or to_regclass('public.finance_tax_invoices') is not null
  then
    raise exception 'Migration 032 changed an existing Invoice or downstream scope boundary';
  end if;
end;
$phase_b3b_dry_run_verification$;

select true as phase_b3b_invoice_v2_composition_dry_run_pass;

rollback;
