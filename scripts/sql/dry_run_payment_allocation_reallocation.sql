begin;

-- Migration 029 is embedded byte-for-byte below for transactional validation.
-- Phase 5D-E2: append-only correction of Confirmed Payment Invoice attribution.
-- Reallocation never changes the Payment, its Cash Transaction, or bank balance.

do $payment_reallocation_preflight$
begin
  if to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_payment_invoice_allocations') is null
    or to_regclass('public.finance_payment_audit_events') is null
    or to_regclass('public.finance_invoice_settlement_summary') is null
    or to_regclass('public.finance_cash_transactions') is null
    or to_regclass('public.finance_account_opening_balances') is null
    or to_regprocedure('public.validate_finance_payment_integrity(uuid)') is null
    or to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is null
    or to_regprocedure('public.create_finance_payment_draft_from_invoice(uuid)') is null
    or to_regprocedure('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)') is null
    or to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is null
    or to_regprocedure('public.reverse_finance_payment(uuid,text)') is null
    or to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is null
    or to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is null
    or to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)') is null
    or to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is null
  then
    raise exception 'Payment allocation reallocation requires Migrations 021 through 028';
  end if;

  if to_regclass('public.finance_payment_allocation_reallocations') is not null
    or to_regclass('public.finance_payment_effective_invoice_allocations') is not null
    or to_regprocedure('public.current_user_can_reallocate_finance_payments()') is not null
    or to_regprocedure('public.validate_finance_payment_effective_allocations(uuid)') is not null
    or to_regprocedure('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)') is not null
    or to_regprocedure('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)') is not null
  then
    raise exception 'Payment allocation reallocation objects already exist; inspect partial Production state';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'can_reallocate_finance_payments'
  ) then
    raise exception 'Payment reallocation permission already exists; inspect partial Production state';
  end if;

  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
  then
    raise exception 'Migration 029 requires the verified pre-cutover Finance Cash state';
  end if;
end;
$payment_reallocation_preflight$;

alter table public.user_profiles
  add column can_reallocate_finance_payments boolean not null default false;

drop trigger protect_finance_payment_permission_fields on public.user_profiles;
create trigger protect_finance_payment_permission_fields
before update of
  can_manage_finance_payments,
  can_confirm_finance_payments,
  can_reverse_finance_payments,
  can_reallocate_finance_payments
on public.user_profiles
for each row execute function public.protect_finance_payment_permission_fields();

create or replace function public.current_user_can_reallocate_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_reallocation_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_reallocate_finance_payments)
  );
$payment_reallocation_permission$;

create or replace function public.current_user_can_view_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_view_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in ('admin', 'partner')
        or can_manage_finance_payments
        or can_confirm_finance_payments
        or can_reverse_finance_payments
        or can_reallocate_finance_payments
      )
  );
$payment_view_permission$;

create table public.finance_payment_allocation_reallocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  source_invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  target_invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  cash_moved numeric(14, 2) not null default 0,
  wht_moved numeric(14, 2) not null default 0,
  settlement_moved numeric(14, 2)
    generated always as ((cash_moved + wht_moved)::numeric(14, 2)) stored,
  reason text not null,
  request_id uuid not null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_payment_reallocation_distinct_invoices_check
    check (source_invoice_id <> target_invoice_id),
  constraint finance_payment_reallocation_amounts_check
    check (
      cash_moved >= 0
      and wht_moved >= 0
      and settlement_moved > 0
      and cash_moved = round(cash_moved, 2)
      and wht_moved = round(wht_moved, 2)
    ),
  constraint finance_payment_reallocation_reason_check
    check (nullif(btrim(reason), '') is not null and length(reason) <= 2000),
  constraint uq_finance_payment_reallocation_request unique (request_id)
);

create index idx_finance_payment_reallocations_payment
on public.finance_payment_allocation_reallocations (payment_id, created_at, id);

create index idx_finance_payment_reallocations_source_invoice
on public.finance_payment_allocation_reallocations (source_invoice_id, created_at, id);

create index idx_finance_payment_reallocations_target_invoice
on public.finance_payment_allocation_reallocations (target_invoice_id, created_at, id);

create view public.finance_payment_effective_invoice_allocations
with (security_invoker = true)
as
with allocation_legs as (
  select
    allocation.payment_id,
    allocation.invoice_id,
    allocation.cash_allocated::numeric as cash_delta,
    allocation.wht_credit_allocated::numeric as wht_delta
  from public.finance_payment_invoice_allocations as allocation

  union all

  select
    reallocation.payment_id,
    reallocation.source_invoice_id,
    -reallocation.cash_moved::numeric,
    -reallocation.wht_moved::numeric
  from public.finance_payment_allocation_reallocations as reallocation

  union all

  select
    reallocation.payment_id,
    reallocation.target_invoice_id,
    reallocation.cash_moved::numeric,
    reallocation.wht_moved::numeric
  from public.finance_payment_allocation_reallocations as reallocation
), effective as (
  select
    payment_id,
    invoice_id,
    sum(cash_delta)::numeric(14, 2) as effective_cash_allocated,
    sum(wht_delta)::numeric(14, 2) as effective_wht_credit_allocated
  from allocation_legs
  group by payment_id, invoice_id
)
select
  payment_id,
  invoice_id,
  effective_cash_allocated,
  effective_wht_credit_allocated,
  (effective_cash_allocated + effective_wht_credit_allocated)::numeric(14, 2)
    as effective_settlement_total
from effective
where effective_cash_allocated <> 0
   or effective_wht_credit_allocated <> 0;

create or replace function public.protect_finance_payment_allocation_reallocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_reallocation_immutability$
begin
  raise exception 'Payment allocation reallocation events are append-only';
end;
$payment_reallocation_immutability$;

create trigger finance_payment_allocation_reallocation_immutability
before update or delete on public.finance_payment_allocation_reallocations
for each row execute function public.protect_finance_payment_allocation_reallocation();

alter table public.finance_payment_audit_events
  drop constraint finance_payment_audit_events_type_check,
  add constraint finance_payment_audit_events_type_check
  check (
    event_type in (
      'draft_created',
      'draft_saved',
      'confirmed',
      'cancelled',
      'reversed',
      'allocation_changed',
      'allocation_reallocated',
      'evidence_added',
      'evidence_removed'
    )
  );

create or replace function public.validate_finance_payment_effective_allocations(
  p_payment_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $effective_payment_validator$
declare
  v_payment public.finance_payments%rowtype;
  v_effective_count integer;
  v_cash numeric(14, 2);
  v_wht numeric(14, 2);
  v_settlement numeric(14, 2);
begin
  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id;

  if v_payment.id is null then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(effective_cash_allocated), 0)::numeric(14, 2),
    coalesce(sum(effective_wht_credit_allocated), 0)::numeric(14, 2),
    coalesce(sum(effective_settlement_total), 0)::numeric(14, 2)
  into v_effective_count, v_cash, v_wht, v_settlement
  from public.finance_payment_effective_invoice_allocations
  where payment_id = v_payment.id;

  if exists (
    select 1
    from public.finance_payment_effective_invoice_allocations
    where payment_id = v_payment.id
      and (
        effective_cash_allocated < 0
        or effective_wht_credit_allocated < 0
        or effective_settlement_total <= 0
      )
  ) then
    raise exception using message = 'FINANCE_PAYMENT_EFFECTIVE_ALLOCATION_NEGATIVE';
  end if;

  if v_effective_count > 100 then
    raise exception 'A Payment may have no more than 100 effective Invoice allocations';
  end if;
  if v_cash <> v_payment.cash_amount
    or v_wht <> v_payment.wht_amount
    or v_settlement <> v_payment.settlement_amount
  then
    raise exception using message = 'FINANCE_PAYMENT_EFFECTIVE_TOTALS_MISMATCH';
  end if;
  if v_payment.status in ('confirmed', 'reversed') and v_effective_count = 0 then
    raise exception 'A confirmed or reversed Payment must retain an effective Invoice allocation';
  end if;

  if exists (
    select 1
    from public.finance_payment_effective_invoice_allocations as effective
    join public.finance_invoices as invoice on invoice.id = effective.invoice_id
    where effective.payment_id = v_payment.id
      and (
        invoice.client_id <> v_payment.client_id
        or invoice.currency <> v_payment.currency
        or (
          v_payment.status in ('draft', 'confirmed')
          and invoice.document_status <> 'issued'
        )
        or (
          v_payment.status in ('cancelled', 'reversed')
          and invoice.document_status not in ('issued', 'voided')
        )
      )
  ) then
    raise exception 'Effective Payment allocations require compatible Client, currency, and Invoice status';
  end if;
end;
$effective_payment_validator$;

create or replace function public.validate_finance_invoice_payment_settlement(
  p_invoice_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $payment_invoice_validator$
declare
  v_invoice public.finance_invoices%rowtype;
  v_confirmed_settlement numeric(14, 2);
  v_draft_reserved_settlement numeric(14, 2);
begin
  select *
  into v_invoice
  from public.finance_invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    if exists (
      select 1
      from public.finance_payment_invoice_allocations
      where invoice_id = p_invoice_id
    ) or exists (
      select 1
      from public.finance_payment_allocation_reallocations
      where source_invoice_id = p_invoice_id or target_invoice_id = p_invoice_id
    ) then
      raise exception 'Payment attribution references an Invoice that does not exist';
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.finance_payment_invoice_allocations as allocation
    join public.finance_payments as payment on payment.id = allocation.payment_id
    where allocation.invoice_id = v_invoice.id
      and (
        payment.client_id <> v_invoice.client_id
        or payment.currency <> v_invoice.currency
        or (payment.status = 'draft' and v_invoice.document_status <> 'issued')
        or (
          payment.status in ('cancelled', 'reversed')
          and v_invoice.document_status not in ('issued', 'voided')
        )
      )
  ) then
    raise exception 'Historical Payment allocation is incompatible with its Invoice';
  end if;

  if exists (
    select 1
    from public.finance_payment_effective_invoice_allocations as effective
    join public.finance_payments as payment on payment.id = effective.payment_id
    where effective.invoice_id = v_invoice.id
      and payment.status = 'confirmed'
      and (
        payment.client_id <> v_invoice.client_id
        or payment.currency <> v_invoice.currency
        or v_invoice.document_status <> 'issued'
      )
  ) then
    raise exception 'Effective Confirmed Payment allocation requires a compatible Issued Invoice';
  end if;

  select coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2)
  into v_confirmed_settlement
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_payments as payment on payment.id = effective.payment_id
  where effective.invoice_id = v_invoice.id
    and payment.status = 'confirmed';

  select coalesce(sum(allocation.settlement_total), 0)::numeric(14, 2)
  into v_draft_reserved_settlement
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment on payment.id = allocation.payment_id
  where allocation.invoice_id = v_invoice.id
    and payment.status = 'draft';

  if v_confirmed_settlement > v_invoice.total_amount then
    raise exception 'Confirmed Payments economically over-settle the Invoice';
  end if;
  if v_confirmed_settlement + v_draft_reserved_settlement > v_invoice.total_amount then
    raise exception 'Active Payment allocations exceed the Invoice gross amount';
  end if;
end;
$payment_invoice_validator$;

create or replace function public.validate_finance_payment_integrity(
  p_payment_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $payment_validator$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_raw_count integer;
  v_raw_cash numeric(14, 2);
  v_raw_wht numeric(14, 2);
  v_raw_settlement numeric(14, 2);
begin
  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(sum(cash_allocated), 0)::numeric(14, 2),
    coalesce(sum(wht_credit_allocated), 0)::numeric(14, 2),
    coalesce(sum(settlement_total), 0)::numeric(14, 2)
  into v_raw_count, v_raw_cash, v_raw_wht, v_raw_settlement
  from public.finance_payment_invoice_allocations
  where payment_id = v_payment.id;

  if v_raw_cash <> v_payment.cash_amount
    or v_raw_wht <> v_payment.wht_amount
    or v_raw_settlement <> v_payment.settlement_amount
  then
    raise exception 'Original Payment allocations must exactly reconcile to Payment totals';
  end if;
  if v_payment.status in ('confirmed', 'reversed') and v_raw_count = 0 then
    raise exception 'A confirmed or reversed Payment must retain original Invoice allocation evidence';
  end if;

  if exists (
    select 1
    from public.finance_payment_invoice_allocations as allocation
    join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
    where allocation.payment_id = v_payment.id
      and (
        invoice.client_id <> v_payment.client_id
        or invoice.currency <> v_payment.currency
        or (v_payment.status = 'draft' and invoice.document_status <> 'issued')
        or (
          v_payment.status in ('cancelled', 'reversed')
          and invoice.document_status not in ('issued', 'voided')
        )
      )
  ) then
    raise exception 'Original Payment allocation evidence is incompatible with the Payment';
  end if;

  perform public.validate_finance_payment_effective_allocations(v_payment.id);

  for v_invoice_id in
    select effective.invoice_id
    from public.finance_payment_effective_invoice_allocations as effective
    where effective.payment_id = v_payment.id
    order by effective.invoice_id
  loop
    perform 1 from public.finance_invoices where id = v_invoice_id for update;
    perform public.validate_finance_invoice_payment_settlement(v_invoice_id);
  end loop;
end;
$payment_validator$;

create or replace function public.enforce_finance_payment_reallocation_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_reallocation_integrity_trigger$
begin
  perform public.validate_finance_payment_integrity(new.payment_id);
  perform public.validate_finance_invoice_payment_settlement(new.source_invoice_id);
  perform public.validate_finance_invoice_payment_settlement(new.target_invoice_id);
  return null;
end;
$payment_reallocation_integrity_trigger$;

create constraint trigger finance_payment_reallocation_integrity_after_insert
after insert on public.finance_payment_allocation_reallocations
deferrable initially deferred
for each row execute function public.enforce_finance_payment_reallocation_integrity();

create or replace view public.finance_invoice_settlement_summary
with (security_invoker = true)
as
with confirmed_settlement as (
  select
    effective.invoice_id,
    coalesce(sum(effective.effective_cash_allocated), 0)::numeric(14, 2)
      as confirmed_cash_allocated,
    coalesce(sum(effective.effective_wht_credit_allocated), 0)::numeric(14, 2)
      as confirmed_wht_credit_allocated,
    coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2)
      as economically_settled_amount
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_payments as payment
    on payment.id = effective.payment_id
   and payment.status = 'confirmed'
  group by effective.invoice_id
), invoice_settlement as (
  select
    invoice.id as invoice_id,
    invoice.invoice_no,
    invoice.document_status as invoice_status,
    invoice.client_id,
    invoice.case_id,
    invoice.advisory_matter_id,
    invoice.currency,
    invoice.issue_date,
    invoice.due_date,
    invoice.total_amount as invoice_gross_amount,
    coalesce(settlement.confirmed_cash_allocated, 0)::numeric(14, 2) as confirmed_cash_allocated,
    coalesce(settlement.confirmed_wht_credit_allocated, 0)::numeric(14, 2) as confirmed_wht_credit_allocated,
    coalesce(settlement.economically_settled_amount, 0)::numeric(14, 2) as economically_settled_amount,
    greatest(invoice.total_amount - coalesce(settlement.economically_settled_amount, 0), 0)::numeric(14, 2)
      as outstanding_amount
  from public.finance_invoices as invoice
  left join confirmed_settlement as settlement on settlement.invoice_id = invoice.id
)
select
  invoice_settlement.*,
  case
    when economically_settled_amount = 0 and outstanding_amount > 0 then 'unpaid'
    when outstanding_amount = 0 then 'settled'
    else 'partially_settled'
  end as payment_status,
  (
    invoice_status = 'issued'
    and outstanding_amount > 0
    and due_date is not null
    and due_date < (now() at time zone 'Asia/Bangkok')::date
  ) as is_overdue
from invoice_settlement;

create or replace function public.finance_invoice_active_reserved_settlement(
  p_invoice_id uuid,
  p_excluded_draft_payment_id uuid default null
)
returns numeric
language sql
security invoker
set search_path = public
as $invoice_active_reservation$
  select (
    coalesce((
      select sum(effective.effective_settlement_total)
      from public.finance_payment_effective_invoice_allocations as effective
      join public.finance_payments as payment on payment.id = effective.payment_id
      where effective.invoice_id = p_invoice_id
        and payment.status = 'confirmed'
    ), 0)
    +
    coalesce((
      select sum(allocation.settlement_total)
      from public.finance_payment_invoice_allocations as allocation
      join public.finance_payments as payment on payment.id = allocation.payment_id
      where allocation.invoice_id = p_invoice_id
        and payment.status = 'draft'
        and allocation.payment_id is distinct from p_excluded_draft_payment_id
    ), 0)
  )::numeric(14, 2);
$invoice_active_reservation$;

create or replace function public.create_finance_payment_draft_from_invoice(
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_payment_draft$
declare
  v_invoice public.finance_invoices%rowtype;
  v_existing_payment_id uuid;
  v_payment_id uuid;
  v_confirmed_settlement numeric(14, 2);
  v_active_reserved_settlement numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_available numeric(14, 2);
begin
  if not public.current_user_can_manage_finance_payments() then
    raise exception 'Not allowed to create Payment Draft';
  end if;
  if p_invoice_id is null then
    raise exception 'Issued Invoice is required';
  end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  if v_invoice.document_status <> 'issued' then
    raise exception 'Payment Draft requires an Issued Invoice';
  end if;

  select payment.id into v_existing_payment_id
  from public.finance_payments as payment
  where payment.draft_origin_invoice_id = v_invoice.id
    and payment.status = 'draft'
  order by payment.created_at, payment.id
  limit 1;

  if v_existing_payment_id is not null then return v_existing_payment_id; end if;

  select coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2)
  into v_confirmed_settlement
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_payments as payment on payment.id = effective.payment_id
  where effective.invoice_id = v_invoice.id
    and payment.status = 'confirmed';

  v_active_reserved_settlement := public.finance_invoice_active_reserved_settlement(v_invoice.id, null);
  v_outstanding := (v_invoice.total_amount - v_confirmed_settlement)::numeric(14, 2);
  v_available := (v_invoice.total_amount - v_active_reserved_settlement)::numeric(14, 2);

  if v_outstanding <= 0 then raise exception 'Invoice is already economically settled'; end if;
  if v_available <= 0 then
    raise exception 'Invoice outstanding is already reserved by another Payment Draft';
  end if;

  insert into public.finance_payments (
    draft_origin_invoice_id, client_id, currency, cash_amount, wht_amount,
    created_by_user_id, updated_by_user_id
  ) values (
    v_invoice.id, v_invoice.client_id, v_invoice.currency, v_available, 0,
    auth.uid(), auth.uid()
  ) returning id into v_payment_id;

  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_id, v_invoice.id, v_available, 0, auth.uid(), auth.uid()
  );

  perform public.record_finance_payment_audit_event(
    v_payment_id,
    'draft_created',
    jsonb_build_object(
      'draft_origin_invoice_id', v_invoice.id,
      'proposed_from_unreserved_outstanding', true,
      'proposed_settlement_amount', v_available,
      'authoritative_settlement_created', false,
      'ledger_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'compensation_created', false
    )
  );
  return v_payment_id;
end;
$create_payment_draft$;

create or replace function public.save_finance_payment_draft(
  p_payment_id uuid,
  p_received_on date,
  p_payment_method text,
  p_receiving_bank_account_id uuid,
  p_receiving_account_reference text,
  p_external_transaction_reference text,
  p_payer_name text,
  p_note text,
  p_cash_amount numeric,
  p_wht_amount numeric,
  p_allocations_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_payment_draft$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice record;
  v_invoice_id uuid;
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_account_reference text := nullif(btrim(coalesce(p_receiving_account_reference, '')), '');
  v_transaction_reference text := nullif(btrim(coalesce(p_external_transaction_reference, '')), '');
  v_payer_name text := nullif(btrim(coalesce(p_payer_name, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allocation_count integer;
  v_distinct_invoice_count integer;
  v_invalid_allocation_count integer;
  v_locked_invoice_count integer := 0;
  v_cash_allocated numeric;
  v_wht_allocated numeric;
  v_other_active_settlement numeric(14, 2);
  v_allocations_unchanged boolean;
begin
  if not public.current_user_can_manage_finance_payments() then
    raise exception 'Not allowed to save Payment Draft';
  end if;
  if p_payment_id is null then raise exception 'Payment Draft is required'; end if;
  if p_cash_amount is null or p_wht_amount is null
    or p_cash_amount < 0 or p_wht_amount < 0
    or p_cash_amount + p_wht_amount <= 0
  then
    raise exception 'Payment settlement must be positive and contain non-negative cash and WHT amounts';
  end if;
  if p_cash_amount <> round(p_cash_amount, 2) or p_wht_amount <> round(p_wht_amount, 2) then
    raise exception 'Payment amounts must use no more than two decimal places';
  end if;
  if v_method is not null
    and v_method not in ('bank_transfer', 'cash', 'cheque', 'card_or_gateway', 'other')
  then
    raise exception 'Payment method is invalid';
  end if;
  if p_allocations_json is null
    or jsonb_typeof(p_allocations_json) <> 'array'
    or jsonb_array_length(p_allocations_json) = 0
    or jsonb_array_length(p_allocations_json) > 100
  then
    raise exception 'Payment allocations must be a non-empty array of no more than 100 Invoices';
  end if;

  select
    count(*)::integer,
    count(distinct allocation.invoice_id)::integer,
    count(*) filter (
      where allocation.invoice_id is null
        or allocation.cash_allocated is null
        or allocation.wht_credit_allocated is null
        or allocation.cash_allocated < 0
        or allocation.wht_credit_allocated < 0
        or allocation.cash_allocated + allocation.wht_credit_allocated <= 0
        or allocation.cash_allocated <> round(allocation.cash_allocated, 2)
        or allocation.wht_credit_allocated <> round(allocation.wht_credit_allocated, 2)
    )::integer,
    coalesce(sum(allocation.cash_allocated), 0),
    coalesce(sum(allocation.wht_credit_allocated), 0)
  into v_allocation_count, v_distinct_invoice_count, v_invalid_allocation_count,
    v_cash_allocated, v_wht_allocated
  from jsonb_to_recordset(p_allocations_json) as allocation(
    invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
  );

  if v_invalid_allocation_count <> 0 or v_allocation_count <> v_distinct_invoice_count then
    raise exception 'Payment allocations contain invalid or duplicated Invoice rows';
  end if;
  if v_cash_allocated <> p_cash_amount or v_wht_allocated <> p_wht_amount then
    raise exception 'Payment allocations must exactly reconcile to Payment cash and WHT totals';
  end if;

  select * into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then raise exception 'Payment Draft not found'; end if;
  if v_payment.status <> 'draft' then raise exception 'Only a Draft Payment can be saved'; end if;
  if v_payment.draft_origin_invoice_id is not null and not exists (
    select 1
    from jsonb_to_recordset(p_allocations_json) as allocation(
      invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
    )
    where allocation.invoice_id = v_payment.draft_origin_invoice_id
  ) then
    raise exception 'Payment Draft must retain its origin Invoice allocation';
  end if;

  for v_invoice_id in
    select invoice_id
    from (
      select allocation.invoice_id
      from public.finance_payment_invoice_allocations as allocation
      where allocation.payment_id = v_payment.id
      union
      select allocation.invoice_id
      from jsonb_to_recordset(p_allocations_json) as allocation(
        invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
      )
    ) as affected_invoice
    order by invoice_id
  loop
    perform 1 from public.finance_invoices where id = v_invoice_id for update;
  end loop;

  for v_invoice in
    select
      invoice.id, invoice.document_status, invoice.client_id, invoice.currency,
      invoice.total_amount, allocation.cash_allocated, allocation.wht_credit_allocated
    from jsonb_to_recordset(p_allocations_json) as allocation(
      invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
    )
    join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
    order by invoice.id
  loop
    v_locked_invoice_count := v_locked_invoice_count + 1;
    if v_invoice.document_status <> 'issued' then
      raise exception 'Payment allocations require Issued Invoices';
    end if;
    if v_invoice.client_id <> v_payment.client_id then
      raise exception 'All Payment allocations must belong to the same Client';
    end if;
    if v_invoice.currency <> v_payment.currency then
      raise exception 'All Payment allocations must use the Payment currency';
    end if;

    v_other_active_settlement := public.finance_invoice_active_reserved_settlement(
      v_invoice.id,
      v_payment.id
    );
    if v_other_active_settlement
      + v_invoice.cash_allocated
      + v_invoice.wht_credit_allocated
      > v_invoice.total_amount
    then
      raise exception 'Payment allocation exceeds the currently available Invoice outstanding amount';
    end if;
  end loop;

  if v_locked_invoice_count <> v_allocation_count then
    raise exception 'One or more allocated Invoices do not exist';
  end if;

  select not exists (
    select 1 from (
      (
        select invoice_id, cash_allocated, wht_credit_allocated
        from public.finance_payment_invoice_allocations where payment_id = v_payment.id
        except
        select invoice_id, cash_allocated, wht_credit_allocated
        from jsonb_to_recordset(p_allocations_json) as a(
          invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
        )
      ) union all (
        select invoice_id, cash_allocated, wht_credit_allocated
        from jsonb_to_recordset(p_allocations_json) as a(
          invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
        )
        except
        select invoice_id, cash_allocated, wht_credit_allocated
        from public.finance_payment_invoice_allocations where payment_id = v_payment.id
      )
    ) as allocation_difference
  ) into v_allocations_unchanged;

  if v_payment.received_on is not distinct from p_received_on
    and v_payment.payment_method is not distinct from v_method
    and v_payment.receiving_bank_account_id is not distinct from p_receiving_bank_account_id
    and v_payment.receiving_account_reference is not distinct from v_account_reference
    and v_payment.external_transaction_reference is not distinct from v_transaction_reference
    and v_payment.payer_name is not distinct from v_payer_name
    and v_payment.note is not distinct from v_note
    and v_payment.cash_amount = p_cash_amount
    and v_payment.wht_amount = p_wht_amount
    and v_allocations_unchanged
  then
    return v_payment.id;
  end if;

  update public.finance_payments
  set received_on = p_received_on,
      payment_method = v_method,
      receiving_bank_account_id = p_receiving_bank_account_id,
      receiving_account_reference = v_account_reference,
      external_transaction_reference = v_transaction_reference,
      payer_name = v_payer_name,
      note = v_note,
      cash_amount = p_cash_amount,
      wht_amount = p_wht_amount,
      updated_at = now(),
      updated_by_user_id = auth.uid()
  where id = v_payment.id;

  delete from public.finance_payment_invoice_allocations where payment_id = v_payment.id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  )
  select v_payment.id, invoice_id, cash_allocated, wht_credit_allocated, auth.uid(), auth.uid()
  from jsonb_to_recordset(p_allocations_json) as allocation(
    invoice_id uuid, cash_allocated numeric, wht_credit_allocated numeric
  );

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'draft_saved',
    jsonb_build_object(
      'cash_amount', p_cash_amount,
      'wht_amount', p_wht_amount,
      'settlement_amount', p_cash_amount + p_wht_amount,
      'allocation_count', v_allocation_count
    )
  );
  return v_payment.id;
end;
$save_payment_draft$;

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

create or replace function public.reallocate_finance_payment_allocation(
  p_payment_id uuid,
  p_source_invoice_id uuid,
  p_target_invoice_id uuid,
  p_cash_amount numeric,
  p_wht_amount numeric,
  p_reason text,
  p_acknowledged boolean,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $reallocate_payment_allocation$
declare
  v_payment public.finance_payments%rowtype;
  v_source public.finance_invoices%rowtype;
  v_target public.finance_invoices%rowtype;
  v_existing public.finance_payment_allocation_reallocations%rowtype;
  v_source_before public.finance_payment_effective_invoice_allocations%rowtype;
  v_target_before public.finance_payment_effective_invoice_allocations%rowtype;
  v_source_after public.finance_payment_effective_invoice_allocations%rowtype;
  v_target_after public.finance_payment_effective_invoice_allocations%rowtype;
  v_invoice_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_target_reserved numeric(14, 2);
  v_reallocation_id uuid;
  v_cross_matter boolean;
begin
  if not public.current_user_can_reallocate_finance_payments() then
    raise exception 'Not allowed to reallocate Confirmed Payment settlement';
  end if;
  if p_acknowledged is distinct from true then
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_ACK_REQUIRED';
  end if;
  if p_payment_id is null or p_source_invoice_id is null or p_target_invoice_id is null then
    raise exception 'Payment, source Invoice, and target Invoice are required';
  end if;
  if p_request_id is null then
    raise exception 'Payment reallocation request ID is required';
  end if;
  if p_source_invoice_id = p_target_invoice_id then
    raise exception 'Source and target Invoice must differ';
  end if;
  if v_reason is null then raise exception 'Payment reallocation reason is required'; end if;
  if length(v_reason) > 2000 then raise exception 'Payment reallocation reason is too long'; end if;
  if p_cash_amount is null or p_wht_amount is null
    or p_cash_amount < 0 or p_wht_amount < 0
    or p_cash_amount + p_wht_amount <= 0
    or p_cash_amount <> round(p_cash_amount, 2)
    or p_wht_amount <> round(p_wht_amount, 2)
  then
    raise exception 'Moved Cash and WHT must be explicit non-negative two-decimal amounts with a positive total';
  end if;

  select * into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then raise exception 'Payment not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing
  from public.finance_payment_allocation_reallocations
  where request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.payment_id = p_payment_id
      and v_existing.source_invoice_id = p_source_invoice_id
      and v_existing.target_invoice_id = p_target_invoice_id
      and v_existing.cash_moved = p_cash_amount
      and v_existing.wht_moved = p_wht_amount
      and v_existing.reason = v_reason
    then
      return v_existing.id;
    end if;
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT';
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Only a Confirmed Payment allocation can be reallocated';
  end if;

  for v_invoice_id in
    select invoice_id
    from (
      select p_source_invoice_id as invoice_id
      union select p_target_invoice_id
      union
      select effective.invoice_id
      from public.finance_payment_effective_invoice_allocations as effective
      where effective.payment_id = v_payment.id
    ) as affected_invoice
    order by invoice_id
  loop
    perform 1 from public.finance_invoices where id = v_invoice_id for update;
  end loop;

  select * into v_source from public.finance_invoices where id = p_source_invoice_id;
  select * into v_target from public.finance_invoices where id = p_target_invoice_id;
  if v_source.id is null then raise exception 'Source Invoice not found'; end if;
  if v_target.id is null then raise exception 'Target Invoice not found'; end if;
  perform public.validate_finance_payment_integrity(v_payment.id);
  if v_target.document_status <> 'issued' then
    raise exception 'Target Invoice must be Issued';
  end if;
  if v_target.client_id <> v_payment.client_id then
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH';
  end if;
  if v_target.currency <> v_payment.currency then
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH';
  end if;

  select * into v_source_before
  from public.finance_payment_effective_invoice_allocations
  where payment_id = v_payment.id and invoice_id = v_source.id;
  select * into v_target_before
  from public.finance_payment_effective_invoice_allocations
  where payment_id = v_payment.id and invoice_id = v_target.id;

  if v_source_before.payment_id is null
    or v_source_before.effective_cash_allocated < p_cash_amount
    or v_source_before.effective_wht_credit_allocated < p_wht_amount
  then
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT';
  end if;

  v_target_reserved := public.finance_invoice_active_reserved_settlement(v_target.id, null);
  if v_target_reserved + p_cash_amount + p_wht_amount > v_target.total_amount then
    raise exception using message = 'FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED';
  end if;

  perform public.assert_finance_payment_reallocation_dependencies(
    v_payment.id,
    v_source.id,
    v_target.id
  );

  insert into public.finance_payment_allocation_reallocations (
    payment_id, source_invoice_id, target_invoice_id, cash_moved, wht_moved,
    reason, request_id, created_by_user_id
  ) values (
    v_payment.id, v_source.id, v_target.id, p_cash_amount, p_wht_amount,
    v_reason, p_request_id, auth.uid()
  ) returning id into v_reallocation_id;

  perform public.validate_finance_payment_effective_allocations(v_payment.id);
  perform public.validate_finance_invoice_payment_settlement(v_source.id);
  perform public.validate_finance_invoice_payment_settlement(v_target.id);

  select * into v_source_after
  from public.finance_payment_effective_invoice_allocations
  where payment_id = v_payment.id and invoice_id = v_source.id;
  select * into v_target_after
  from public.finance_payment_effective_invoice_allocations
  where payment_id = v_payment.id and invoice_id = v_target.id;

  v_cross_matter := v_source.case_id is distinct from v_target.case_id
    or v_source.advisory_matter_id is distinct from v_target.advisory_matter_id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'allocation_reallocated',
    jsonb_build_object(
      'reallocation_id', v_reallocation_id,
      'request_id', p_request_id,
      'source_invoice_id', v_source.id,
      'target_invoice_id', v_target.id,
      'cash_moved', p_cash_amount,
      'wht_moved', p_wht_amount,
      'settlement_moved', p_cash_amount + p_wht_amount,
      'reason', v_reason,
      'source_effective_before', coalesce(to_jsonb(v_source_before), '{}'::jsonb),
      'source_effective_after', coalesce(to_jsonb(v_source_after), '{}'::jsonb),
      'target_effective_before', coalesce(to_jsonb(v_target_before), '{}'::jsonb),
      'target_effective_after', coalesce(to_jsonb(v_target_after), '{}'::jsonb),
      'source_case_id', v_source.case_id,
      'source_advisory_matter_id', v_source.advisory_matter_id,
      'target_case_id', v_target.case_id,
      'target_advisory_matter_id', v_target.advisory_matter_id,
      'cross_matter', v_cross_matter,
      'cash_transaction_changed', false,
      'payment_total_changed', false,
      'customer_refund_recorded', false
    )
  );

  return v_reallocation_id;
end;
$reallocate_payment_allocation$;

create or replace function public.reverse_finance_payment(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $reverse_payment$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.current_user_can_reverse_finance_payments() then
    raise exception 'Not allowed to reverse Payment';
  end if;
  if v_reason is null then raise exception 'Payment reversal reason is required'; end if;
  if length(v_reason) > 2000 then raise exception 'Payment reversal reason is too long'; end if;

  select * into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then raise exception 'Payment not found'; end if;
  if v_payment.status = 'reversed' then return v_payment.id; end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'Only a Confirmed Payment can be reversed';
  end if;

  for v_invoice_id in
    select effective.invoice_id
    from public.finance_payment_effective_invoice_allocations as effective
    where effective.payment_id = v_payment.id
    order by effective.invoice_id
  loop
    perform 1 from public.finance_invoices where id = v_invoice_id for update;
  end loop;

  perform public.assert_finance_payment_has_no_downstream_dependencies(v_payment.id);

  update public.finance_payments
  set status = 'reversed',
      reversed_at = now(),
      reversed_by_user_id = auth.uid(),
      reverse_reason = v_reason,
      updated_at = now(),
      updated_by_user_id = auth.uid()
  where id = v_payment.id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'reversed',
    jsonb_build_object(
      'reason', v_reason,
      'cash_amount', v_payment.cash_amount,
      'wht_amount', v_payment.wht_amount,
      'settlement_amount', v_payment.settlement_amount,
      'negative_payment_created', false,
      'ledger_reversal_created', false,
      'receipt_reversal_created', false,
      'tax_invoice_reversal_created', false,
      'compensation_reversal_created', false
    )
  );
  return v_payment.id;
end;
$reverse_payment$;

create or replace function public.correct_erroneous_finance_payment(
  p_payment_id uuid,
  p_reason text,
  p_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $correct_erroneous_payment$
declare
  v_payment public.finance_payments%rowtype;
  v_original_cash public.finance_cash_transactions%rowtype;
  v_existing_correction public.finance_cash_transactions%rowtype;
  v_invoice_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_corrected_at timestamptz := now();
  v_correction_cash_id uuid;
  v_is_admin boolean;
  v_payment_reverse_allowed boolean;
  v_cash_reverse_allowed boolean;
  v_completed_audit_count integer;
begin
  if p_acknowledged is distinct from true then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_ACK_REQUIRED';
  end if;
  if v_reason is null then raise exception 'Payment correction reason is required'; end if;
  if length(v_reason) > 2000 then raise exception 'Payment correction reason is too long'; end if;
  if p_payment_id is null then raise exception 'Payment correction requires a Payment'; end if;

  select * into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then raise exception 'Payment not found'; end if;

  select * into v_original_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null;

  select exists (
    select 1 from public.user_profiles as profile
    where profile.id = auth.uid() and profile.active = true and profile.role = 'admin'
  ),
  public.current_user_can_reverse_finance_payments(),
  public.current_user_can_reverse_finance_cash_transactions()
  into v_is_admin, v_payment_reverse_allowed, v_cash_reverse_allowed;

  if v_original_cash.id is null then
    if not v_payment_reverse_allowed then
      raise exception 'Not allowed to correct erroneous Payment';
    end if;
  elsif not (v_is_admin or (v_payment_reverse_allowed and v_cash_reverse_allowed)) then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED';
  end if;

  if v_payment.status = 'reversed' then
    select count(*)::integer into v_completed_audit_count
    from public.finance_payment_audit_events as audit_event
    where audit_event.payment_id = v_payment.id
      and audit_event.event_type = 'reversed'
      and audit_event.event_payload_json ->> 'correction_workflow' = 'full_erroneous_payment'
      and audit_event.event_payload_json ->> 'correction_completed' = 'true';

    if v_completed_audit_count <> 1 then
      raise exception using message = 'FINANCE_PAYMENT_CORRECTION_AMBIGUOUS_REVERSED_PAYMENT';
    end if;

    if v_original_cash.id is not null then
      select * into v_existing_correction
      from public.finance_cash_transactions as cash_transaction
      where cash_transaction.reversal_of_transaction_id = v_original_cash.id;

      if v_existing_correction.id is null
        or v_existing_correction.status <> 'confirmed'
        or v_existing_correction.transaction_type <> 'reversal'
        or v_existing_correction.direction <> 'outflow'
        or v_existing_correction.cash_amount <> v_original_cash.cash_amount
        or v_existing_correction.bank_account_id <> v_original_cash.bank_account_id
        or v_existing_correction.currency <> v_original_cash.currency
        or v_existing_correction.source_payment_id <> v_payment.id
        or v_existing_correction.occurred_at <> v_original_cash.occurred_at
      then
        raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_LINEAGE_INVALID';
      end if;
    end if;
    return v_payment.id;
  end if;

  if v_payment.status <> 'confirmed' then
    raise exception 'Only a Confirmed Payment can be corrected as erroneous';
  end if;

  for v_invoice_id in
    select effective.invoice_id
    from public.finance_payment_effective_invoice_allocations as effective
    where effective.payment_id = v_payment.id
    order by effective.invoice_id
  loop
    perform 1 from public.finance_invoices where id = v_invoice_id for update;
  end loop;

  select * into v_original_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null
  for update;

  if v_original_cash.id is not null and not (
    v_is_admin or (v_payment_reverse_allowed and v_cash_reverse_allowed)
  ) then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED';
  end if;

  perform public.validate_finance_payment_integrity(v_payment.id);
  perform public.assert_finance_erroneous_payment_correction_dependencies(v_payment.id);

  v_correction_cash_id := public.create_finance_erroneous_payment_cash_correction(
    v_payment.id, v_reason, v_corrected_at
  );

  update public.finance_payments
  set status = 'reversed',
      reversed_at = v_corrected_at,
      reversed_by_user_id = auth.uid(),
      reverse_reason = v_reason,
      updated_at = v_corrected_at,
      updated_by_user_id = auth.uid()
  where id = v_payment.id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'reversed',
    jsonb_build_object(
      'correction_workflow', 'full_erroneous_payment',
      'correction_completed', true,
      'correction_reason', v_reason,
      'correction_timestamp', v_corrected_at,
      'correction_actor_user_id', auth.uid(),
      'cash_correction_required', v_original_cash.id is not null,
      'original_cash_transaction_id', v_original_cash.id,
      'correction_cash_transaction_id', v_correction_cash_id,
      'cash_amount_invalidated', v_payment.cash_amount,
      'wht_amount_invalidated', v_payment.wht_amount,
      'settlement_amount_invalidated', v_payment.settlement_amount,
      'entire_payment_settlement_invalidated', true,
      'all_invoice_allocations_invalidated', true,
      'wht_invalidated_as_full_payment_correction', true,
      'customer_refund_recorded', false,
      'payment_reallocation_performed', false,
      'ledger_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'compensation_created', false
    )
  );
  return v_payment.id;
end;
$correct_erroneous_payment$;

create or replace function public.void_finance_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $void_invoice$
declare
  v_invoice public.finance_invoices%rowtype;
  v_voided_invoice public.finance_invoices%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_voided_at timestamptz := now();
  v_actor_email text;
  v_actor_name text;
  v_draft_payment_count integer;
  v_effective_confirmed_payment_count integer;
  v_confirmed_settlement numeric(14, 2);
  v_plan_reopened boolean := false;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to void Invoice';
  end if;
  if p_invoice_id is null then raise exception 'Issued Invoice is required'; end if;
  if v_reason is null then raise exception 'Invoice Void reason is required'; end if;
  if length(v_reason) > 2000 then raise exception 'Invoice Void reason is too long'; end if;
  if p_acknowledged is distinct from true then
    raise exception 'Invoice Void acknowledgement is required';
  end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice not found'; end if;
  if v_invoice.document_status <> 'issued' then
    raise exception 'Only an Issued Invoice can be voided';
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_invoice.billing_plan_id
  for update;

  select * into v_installment
  from public.finance_billing_installments
  where id = v_invoice.primary_billing_installment_id
  for update;

  if v_plan.id is null
    or v_installment.id is null
    or v_installment.billing_plan_id <> v_plan.id
    or v_plan.id <> v_invoice.billing_plan_id
  then
    raise exception 'Invoice source Billing Plan or Installment lineage is inconsistent';
  end if;
  if v_plan.status not in ('active', 'completed') then
    raise exception 'Invoice source Billing Plan is not eligible for reopening';
  end if;
  if v_installment.status <> 'invoiced' then
    raise exception 'Invoice source Billing Installment is not invoiced';
  end if;
  if v_installment.readiness_event_date is null
    or v_installment.ready_to_invoice_at is null
    or v_installment.readiness_confirmed_at is null
    or v_installment.readiness_confirmed_by_user_id is null
    or v_installment.readiness_evidence_json is null
    or v_installment.readiness_evidence_json = '{}'::jsonb
  then
    raise exception 'Invoice source Billing Installment readiness evidence is incomplete';
  end if;

  perform public.validate_finance_invoice_integrity(v_invoice.id);

  select count(*)::integer
  into v_draft_payment_count
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment on payment.id = allocation.payment_id
  where allocation.invoice_id = v_invoice.id
    and payment.status = 'draft';

  select count(*)::integer
  into v_effective_confirmed_payment_count
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_payments as payment on payment.id = effective.payment_id
  where effective.invoice_id = v_invoice.id
    and payment.status = 'confirmed';

  select settlement.economically_settled_amount
  into v_confirmed_settlement
  from public.finance_invoice_settlement_summary as settlement
  where settlement.invoice_id = v_invoice.id;

  if v_confirmed_settlement is null then
    raise exception 'Invoice settlement summary is unavailable';
  end if;
  if v_draft_payment_count > 0 then
    raise exception 'Invoice has an active Payment Draft that must be cancelled before Void';
  end if;
  if v_effective_confirmed_payment_count > 0 or v_confirmed_settlement <> 0 then
    raise exception 'Invoice has effective Confirmed Payment settlement and cannot be voided';
  end if;

  perform public.assert_finance_invoice_has_no_void_dependencies(v_invoice.id);

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set document_status = 'voided',
      voided_at = v_voided_at,
      voided_by_user_id = auth.uid(),
      void_reason = v_reason,
      updated_by_user_id = auth.uid(),
      updated_at = v_voided_at
  where id = v_invoice.id;

  select * into v_voided_invoice from public.finance_invoices where id = v_invoice.id;

  if v_voided_invoice.invoice_no is distinct from v_invoice.invoice_no
    or v_voided_invoice.issue_date is distinct from v_invoice.issue_date
    or v_voided_invoice.issued_at is distinct from v_invoice.issued_at
    or v_voided_invoice.issued_by_user_id is distinct from v_invoice.issued_by_user_id
    or v_voided_invoice.issued_snapshot_json is distinct from v_invoice.issued_snapshot_json
    or v_voided_invoice.payment_destination_bank_account_id is distinct from v_invoice.payment_destination_bank_account_id
    or v_voided_invoice.payment_destination_snapshot_json is distinct from v_invoice.payment_destination_snapshot_json
    or v_voided_invoice.amount_before_vat is distinct from v_invoice.amount_before_vat
    or v_voided_invoice.vat_amount is distinct from v_invoice.vat_amount
    or v_voided_invoice.total_amount is distinct from v_invoice.total_amount
    or v_voided_invoice.seller_snapshot_json is distinct from v_invoice.seller_snapshot_json
    or v_voided_invoice.customer_snapshot_json is distinct from v_invoice.customer_snapshot_json
    or v_voided_invoice.matter_snapshot_json is distinct from v_invoice.matter_snapshot_json
    or v_voided_invoice.source_snapshot_json is distinct from v_invoice.source_snapshot_json
  then
    raise exception 'Invoice Void must preserve the original issued document evidence';
  end if;

  update public.finance_billing_installments
  set status = 'ready_to_invoice', invoiced_at = null,
      updated_by_user_id = auth.uid(), updated_at = v_voided_at
  where id = v_installment.id;

  if v_plan.status = 'completed' then
    update public.finance_billing_plans
    set status = 'active', updated_by_user_id = auth.uid(), updated_at = v_voided_at
    where id = v_plan.id;
    v_plan_reopened := true;
  end if;

  insert into public.finance_invoice_audit_events (
    invoice_id, event_type, event_payload_json, actor_user_id,
    actor_email, actor_name, created_at
  ) values (
    v_invoice.id,
    'voided',
    jsonb_build_object(
      'schema_version', 1,
      'reason', v_reason,
      'voided_at', v_voided_at,
      'invoice_no', v_invoice.invoice_no,
      'from_status', 'issued',
      'to_status', 'voided',
      'source_billing_plan_id', v_plan.id,
      'source_billing_installment_id', v_installment.id,
      'installment_status_changed_from', 'invoiced',
      'installment_status_changed_to', 'ready_to_invoice',
      'billing_plan_status_changed_from', v_plan.status,
      'billing_plan_status_changed_to', case when v_plan_reopened then 'active' else v_plan.status end,
      'replacement_invoice_number_reused', false,
      'historical_payment_allocation_preserved', true,
      'effective_payment_settlement_at_void', 0,
      'payment_cancelled', false,
      'payment_reversed', false,
      'ledger_changed', false,
      'compensation_changed', false
    ),
    auth.uid(), v_actor_email, v_actor_name, v_voided_at
  );

  insert into public.finance_billing_installment_audit_events (
    billing_installment_id, billing_plan_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name, created_at
  ) values (
    v_installment.id,
    v_plan.id,
    'invoice_voided_reopened',
    jsonb_build_object(
      'schema_version', 1,
      'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no,
      'invoice_voided_at', v_voided_at,
      'from_status', 'invoiced',
      'to_status', 'ready_to_invoice',
      'readiness_evidence_preserved', true,
      'billing_plan_reopened', v_plan_reopened
    ),
    auth.uid(), v_actor_email, v_actor_name, v_voided_at
  );

  perform public.validate_finance_invoice_integrity(v_invoice.id);
  perform public.validate_finance_invoice_payment_settlement(v_invoice.id);
  return v_invoice.id;
end;
$void_invoice$;

alter table public.finance_payment_allocation_reallocations enable row level security;

create policy "finance payment viewers select allocation reallocations"
on public.finance_payment_allocation_reallocations for select
using (public.current_user_can_view_finance_payments());

revoke all on table public.finance_payment_allocation_reallocations
  from public, anon, authenticated;
revoke all on table public.finance_payment_effective_invoice_allocations
  from public, anon, authenticated;
grant select on table public.finance_payment_allocation_reallocations to authenticated;
grant select on table public.finance_payment_effective_invoice_allocations to authenticated;

revoke all on function public.current_user_can_reallocate_finance_payments()
  from public, anon, authenticated;
grant execute on function public.current_user_can_reallocate_finance_payments()
  to authenticated;
revoke all on function public.validate_finance_payment_effective_allocations(uuid)
  from public, anon, authenticated;
revoke all on function public.finance_invoice_active_reserved_settlement(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.protect_finance_payment_allocation_reallocation()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_payment_reallocation_integrity()
  from public, anon, authenticated;
revoke all on function public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)
  from public, anon, authenticated;
grant execute on function public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)
  to authenticated;

do $payment_reallocation_security_check$
declare
  v_expected_owner oid;
begin
  select proowner into v_expected_owner
  from pg_proc
  where oid = 'public.reverse_finance_payment(uuid,text)'::regprocedure;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'finance_payment_allocation_reallocations'
      and cmd = 'SELECT'
      and qual ilike '%current_user_can_view_finance_payments%'
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.finance_payment_allocation_reallocations'::regclass
  ) then
    raise exception 'Payment reallocation RLS contract is incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'INSERT')
    or has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'UPDATE')
    or has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'DELETE')
    or has_table_privilege('anon', 'public.finance_payment_allocation_reallocations', 'INSERT')
  then
    raise exception 'Browser roles must not mutate Payment reallocation evidence directly';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Payment reallocation RPC grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.current_user_can_reallocate_finance_payments()'::regprocedure,
      'public.protect_finance_payment_allocation_reallocation()'::regprocedure,
      'public.enforce_finance_payment_reallocation_integrity()'::regprocedure,
      'public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)'::regprocedure,
      'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure,
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure,
      'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'public.reverse_finance_payment(uuid,text)'::regprocedure,
      'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure,
      'public.void_finance_invoice(uuid,text,boolean)'::regprocedure
    )
      and (
        function_record.proowner <> v_expected_owner
        or not function_record.prosecdef
        or not (coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'])
      )
  ) then
    raise exception 'Authoritative Payment reallocation functions require trusted ownership, SECURITY DEFINER, and fixed search_path';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.validate_finance_payment_effective_allocations(uuid)'::regprocedure,
      'public.validate_finance_payment_integrity(uuid)'::regprocedure,
      'public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure,
      'public.finance_invoice_active_reserved_settlement(uuid,uuid)'::regprocedure
    )
      and (
        function_record.prosecdef
        or not (coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'])
      )
  ) then
    raise exception 'Payment reallocation validators must remain SECURITY INVOKER with fixed search_path';
  end if;
end;
$payment_reallocation_security_check$;

do $payment_reallocation_postcondition$
begin
  if exists (select 1 from public.finance_payment_allocation_reallocations) then
    raise exception 'Migration 029 must not create a real Payment reallocation';
  end if;
  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or (select count(*) from public.finance_company_ledger) <> 267
    or (select count(*) from public.finance_compensation_batches) <> 33
  then
    raise exception 'Migration 029 must preserve the verified pre-cutover Finance state';
  end if;
  if (
    select count(*)
    from public.finance_payments
    where id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    ) and status = 'confirmed'
  ) <> 2 then
    raise exception 'Migration 029 must not change current confirmed UAT Payments';
  end if;
end;
$payment_reallocation_postcondition$;

comment on column public.user_profiles.can_reallocate_finance_payments is
  'Dedicated authority to move Confirmed Payment settlement attribution between compatible Invoices; Partner role alone does not grant it.';
comment on table public.finance_payment_allocation_reallocations is
  'Append-only correction evidence moving explicit Cash and WHT allocation components without changing Payment or Cash Transaction facts.';
comment on view public.finance_payment_effective_invoice_allocations is
  'Current Invoice attribution per Payment: original immutable allocation plus incoming movements minus outgoing movements.';
comment on function public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid) is
  'Atomic, idempotent Confirmed Payment allocation correction. It never creates or changes a Finance Cash Transaction.';


-- End embedded Migration 029.

do $payment_reallocation_dry_run$
declare
  v_actor_user_id uuid;
  v_other_client_id uuid;
  v_source_invoice public.finance_invoices%rowtype;
  v_source_agreement_item public.finance_fee_agreement_items%rowtype;
  v_invoice_ids uuid[] := array[]::uuid[];
  v_invoice_id uuid;
  v_installment_id uuid;
  v_installment_item_id uuid;
  v_payment_id uuid;
  v_correction_payment_id uuid;
  v_reservation_payment_id uuid;
  v_request_full uuid := gen_random_uuid();
  v_request_partial uuid := gen_random_uuid();
  v_request_wht uuid := gen_random_uuid();
  v_request_inverse uuid := gen_random_uuid();
  v_result_id uuid;
  v_retry_id uuid;
  v_index integer;
  v_next_installment_no integer;
  v_before_vat numeric(14, 2) := 20000.00;
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
  v_error_message text;
  v_cash_before integer;
begin
  select profile.id into v_actor_user_id
  from public.user_profiles as profile
  where profile.active = true and profile.role = 'admin'
  order by profile.id limit 1;

  select invoice.* into v_source_invoice
  from public.finance_invoices as invoice
  where invoice.document_status = 'issued'
    and exists (select 1 from public.finance_invoice_items where invoice_id = invoice.id)
  order by invoice.created_at, invoice.id limit 1;

  select agreement_item.* into v_source_agreement_item
  from public.finance_invoice_items as invoice_item
  join public.finance_fee_agreement_items as agreement_item
    on agreement_item.id = invoice_item.source_fee_agreement_item_id
  where invoice_item.invoice_id = v_source_invoice.id
  order by invoice_item.sort_order, invoice_item.id limit 1;

  select client.id into v_other_client_id
  from public.clients as client
  where client.id <> v_source_invoice.client_id
  order by client.id limit 1;

  if v_actor_user_id is null or v_source_invoice.id is null
    or v_source_agreement_item.id is null or v_other_client_id is null
  then
    raise exception 'Dry-run requires an active Admin, an issued Invoice lineage, and another Client';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);
  select count(*)::integer into v_cash_before from public.finance_cash_transactions;
  v_vat := case when v_source_agreement_item.vat_applicable
    then round(v_before_vat * v_source_agreement_item.vat_rate / 100, 2) else 0 end;
  v_total := v_before_vat + v_vat;

  select coalesce(max(installment_no), 0) + 200 into v_next_installment_no
  from public.finance_billing_installments
  where billing_plan_id = v_source_invoice.billing_plan_id;

  for v_index in 1..6 loop
    v_installment_id := gen_random_uuid();
    v_installment_item_id := gen_random_uuid();
    v_invoice_id := gen_random_uuid();

    insert into public.finance_billing_installments (
      id, billing_plan_id, installment_no, sort_order, title, trigger_type,
      status, invoiced_at, amount_before_tax, vat_amount, total_amount,
      readiness_event_date, ready_to_invoice_at, readiness_confirmed_at,
      readiness_confirmed_by_user_id, readiness_evidence_json,
      created_by_user_id, updated_by_user_id
    ) values (
      v_installment_id, v_source_invoice.billing_plan_id,
      v_next_installment_no + v_index, v_next_installment_no + v_index,
      'ROLLBACK ONLY PAYMENT REALLOCATION', 'manual', 'invoiced', now(),
      v_before_vat, v_vat, v_total, current_date, now(), now(), v_actor_user_id,
      jsonb_build_object('dry_run', true), v_actor_user_id, v_actor_user_id
    );

    insert into public.finance_billing_installment_items (
      id, billing_installment_id, fee_agreement_item_id, amount_before_tax,
      vat_amount, total_amount, sort_order, allocation_snapshot_json
    ) values (
      v_installment_item_id, v_installment_id, v_source_agreement_item.id,
      v_before_vat, v_vat, v_total, 0, jsonb_build_object('dry_run', true)
    );

    insert into public.finance_invoices (
      id, billing_plan_id, primary_billing_installment_id, fee_agreement_id,
      source_quotation_id, client_id, case_id, advisory_matter_id, invoice_no,
      document_status, issue_date, due_date, currency, language_code,
      amount_before_vat, vat_amount, total_amount, seller_snapshot_json,
      customer_snapshot_json, matter_snapshot_json, source_snapshot_json,
      issued_snapshot_json, issued_at, issued_by_user_id, created_by_user_id,
      updated_by_user_id
    ) values (
      v_invoice_id, v_source_invoice.billing_plan_id, v_installment_id,
      v_source_invoice.fee_agreement_id, v_source_invoice.source_quotation_id,
      case when v_index = 5 then v_other_client_id else v_source_invoice.client_id end,
      case when v_index = 2 and (v_source_invoice.case_id is not null or v_source_invoice.advisory_matter_id is not null)
        then null else v_source_invoice.case_id end,
      case when v_index = 2 and (v_source_invoice.case_id is not null or v_source_invoice.advisory_matter_id is not null)
        then null else v_source_invoice.advisory_matter_id end,
      'ROLLBACK-5DE2-' || v_index::text || '-' || txid_current()::text,
      'issued', current_date, current_date,
      case when v_index = 6 then 'USD' else v_source_invoice.currency end,
      v_source_invoice.language_code, v_before_vat, v_vat, v_total,
      jsonb_build_object('dry_run', true), jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true), jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true), now(), v_actor_user_id,
      v_actor_user_id, v_actor_user_id
    );

    insert into public.finance_invoice_items (
      invoice_id, source_fee_agreement_item_id, source_billing_installment_item_id,
      description, vat_applicable, vat_rate, tax_category, amount_before_vat,
      vat_amount, line_total, sort_order, source_snapshot_json
    ) values (
      v_invoice_id, v_source_agreement_item.id, v_installment_item_id,
      'ROLLBACK ONLY PAYMENT REALLOCATION', v_source_agreement_item.vat_applicable,
      v_source_agreement_item.vat_rate, v_source_agreement_item.tax_category,
      v_before_vat, v_vat, v_total, 0, jsonb_build_object('dry_run', true)
    );

    insert into public.finance_invoice_installment_allocations (
      invoice_id, billing_installment_id, allocated_before_vat, allocated_vat,
      allocated_total, source_snapshot_json
    ) values (
      v_invoice_id, v_installment_id, v_before_vat, v_vat, v_total,
      jsonb_build_object('dry_run', true)
    );
    v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
  end loop;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_source_invoice.currency, 9700, 300,
    current_date, 'cash', 'ROLLBACK-REALLOCATION-PRIMARY',
    v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_id, v_invoice_ids[1], 9700, 300, v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_id, true);

  v_result_id := public.reallocate_finance_payment_allocation(
    v_payment_id, v_invoice_ids[1], v_invoice_ids[2], 9700, 300,
    'ROLLBACK ONLY FULL MOVE', true, v_request_full
  );
  v_retry_id := public.reallocate_finance_payment_allocation(
    v_payment_id, v_invoice_ids[1], v_invoice_ids[2], 9700, 300,
    'ROLLBACK ONLY FULL MOVE', true, v_request_full
  );
  if v_retry_id <> v_result_id or (
    select count(*) from public.finance_payment_allocation_reallocations
    where request_id = v_request_full
  ) <> 1 then
    raise exception 'Idempotent full-move retry created inconsistent evidence';
  end if;

  if (v_source_invoice.case_id is not null or v_source_invoice.advisory_matter_id is not null)
    and not exists (
      select 1
      from public.finance_payment_audit_events
      where payment_id = v_payment_id
        and event_type = 'allocation_reallocated'
        and event_payload_json ->> 'cross_matter' = 'true'
    )
  then
    raise exception 'Cross-matter same-Client movement was not allowed and audited';
  end if;

  perform public.void_finance_invoice(
    v_invoice_ids[1],
    'ROLLBACK ONLY ZERO-EFFECTIVE HISTORICAL INVOICE VOID',
    true
  );
  if not exists (
    select 1 from public.finance_invoices
    where id = v_invoice_ids[1] and document_status = 'voided'
  ) or not exists (
    select 1 from public.finance_payment_invoice_allocations
    where payment_id = v_payment_id and invoice_id = v_invoice_ids[1]
  ) then
    raise exception 'Zero-effective Invoice Void did not preserve historical raw allocation evidence';
  end if;

  begin
    perform public.reallocate_finance_payment_allocation(
      v_payment_id, v_invoice_ids[2], v_invoice_ids[3], 1, 0,
      'ROLLBACK ONLY CONFLICT', true, v_request_full
    );
    raise exception 'Conflicting request ID unexpectedly succeeded';
  exception when raise_exception then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT' then raise; end if;
  end;

  perform public.reallocate_finance_payment_allocation(
    v_payment_id, v_invoice_ids[2], v_invoice_ids[3], 4850, 150,
    'ROLLBACK ONLY PARTIAL EXPLICIT CASH AND WHT', true, v_request_partial
  );
  perform public.reallocate_finance_payment_allocation(
    v_payment_id, v_invoice_ids[2], v_invoice_ids[3], 0, 50,
    'ROLLBACK ONLY WHT COMPONENT', true, v_request_wht
  );
  perform public.reallocate_finance_payment_allocation(
    v_payment_id, v_invoice_ids[3], v_invoice_ids[2], 0, 50,
    'ROLLBACK ONLY INVERSE WHT CORRECTION', true, v_request_inverse
  );

  if not exists (
    select 1 from public.finance_payment_effective_invoice_allocations
    where payment_id = v_payment_id and invoice_id = v_invoice_ids[2]
      and effective_cash_allocated = 4850 and effective_wht_credit_allocated = 150
  ) or not exists (
    select 1 from public.finance_payment_effective_invoice_allocations
    where payment_id = v_payment_id and invoice_id = v_invoice_ids[3]
      and effective_cash_allocated = 4850 and effective_wht_credit_allocated = 150
  ) then
    raise exception 'Partial, independent WHT, or inverse movement produced wrong effective attribution';
  end if;

  begin
    perform public.reallocate_finance_payment_allocation(
      v_payment_id, v_invoice_ids[2], v_invoice_ids[3], 4850.01, 0,
      'ROLLBACK ONLY SOURCE EXCESS', true, gen_random_uuid()
    );
    raise exception 'Current-effective source component guard unexpectedly allowed excess movement';
  exception when raise_exception then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT' then raise; end if;
  end;

  begin
    perform public.reallocate_finance_payment_allocation(
      v_payment_id, v_invoice_ids[2], v_invoice_ids[5], 1, 0,
      'ROLLBACK ONLY CLIENT MISMATCH', true, gen_random_uuid()
    );
    raise exception 'Different-Client target unexpectedly succeeded';
  exception when raise_exception then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH' then raise; end if;
  end;

  begin
    perform public.reallocate_finance_payment_allocation(
      v_payment_id, v_invoice_ids[2], v_invoice_ids[6], 1, 0,
      'ROLLBACK ONLY CURRENCY MISMATCH', true, gen_random_uuid()
    );
    raise exception 'Different-currency target unexpectedly succeeded';
  exception when raise_exception then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH' then raise; end if;
  end;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, internal_reference,
    created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_source_invoice.currency, v_total - 500, 0,
    'ROLLBACK-REALLOCATION-RESERVATION', v_actor_user_id, v_actor_user_id
  ) returning id into v_reservation_payment_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_reservation_payment_id, v_invoice_ids[4], v_total - 500, 0,
    v_actor_user_id, v_actor_user_id
  );

  begin
    perform public.reallocate_finance_payment_allocation(
      v_payment_id, v_invoice_ids[2], v_invoice_ids[4], 1000, 0,
      'ROLLBACK ONLY TARGET CAPACITY', true, gen_random_uuid()
    );
    raise exception 'Target capacity reservation unexpectedly allowed over-settlement';
  exception when raise_exception then
    get stacked diagnostics v_error_message = message_text;
    if v_error_message <> 'FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED' then raise; end if;
  end;

  if (select sum(effective_cash_allocated) from public.finance_payment_effective_invoice_allocations where payment_id = v_payment_id) <> 9700
    or (select sum(effective_wht_credit_allocated) from public.finance_payment_effective_invoice_allocations where payment_id = v_payment_id) <> 300
    or (select sum(effective_settlement_total) from public.finance_payment_effective_invoice_allocations where payment_id = v_payment_id) <> 10000
  then
    raise exception 'Effective allocation totals no longer reconcile to the Payment';
  end if;

  perform public.reverse_finance_payment(v_payment_id, 'ROLLBACK ONLY GENERIC REVERSAL AFTER REALLOCATION');
  if exists (
    select 1 from public.finance_invoice_settlement_summary
    where invoice_id in (v_invoice_ids[2], v_invoice_ids[3])
      and economically_settled_amount <> 0
  ) then
    raise exception 'Generic reversal did not deactivate all effective settlement';
  end if;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_source_invoice.currency, 1000, 0,
    current_date, 'cash', 'ROLLBACK-REALLOCATION-CORRECTION',
    v_actor_user_id, v_actor_user_id
  ) returning id into v_correction_payment_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_correction_payment_id, v_invoice_ids[2], 1000, 0,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_correction_payment_id, true);
  perform public.reallocate_finance_payment_allocation(
    v_correction_payment_id, v_invoice_ids[2], v_invoice_ids[3], 1000, 0,
    'ROLLBACK ONLY BEFORE FULL ERRONEOUS CORRECTION', true, gen_random_uuid()
  );
  perform public.correct_erroneous_finance_payment(
    v_correction_payment_id, 'ROLLBACK ONLY FULL PAYMENT ERROR', true
  );
  if not exists (
    select 1 from public.finance_payments
    where id = v_correction_payment_id and status = 'reversed'
  ) then
    raise exception 'Migration 028 full correction did not remain compatible after reallocation';
  end if;

  if (select count(*) from public.finance_cash_transactions) <> v_cash_before then
    raise exception 'Payment allocation reallocation dry-run changed Finance Cash';
  end if;

  if position('case_id <>' in pg_get_functiondef(
    'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure
  )) > 0 or position('advisory_matter_id <>' in pg_get_functiondef(
    'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure
  )) > 0 then
    raise exception 'Cross-matter same-Client reallocation was prohibited unexpectedly';
  end if;
end;
$payment_reallocation_dry_run$;

select
  (select count(*) from public.finance_payment_allocation_reallocations) as synthetic_reallocation_rows_before_rollback,
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_before_rollback,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_before_rollback,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_before_rollback,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_before_rollback,
  true as payment_allocation_reallocation_transactional_tests_pass;

rollback;

select
  to_regclass('public.finance_payment_allocation_reallocations') is null as migration_objects_rolled_back,
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_after_rollback,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_after_rollback,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_after_rollback,
  (select count(*) from public.finance_payments where internal_reference like 'ROLLBACK-REALLOCATION-%') as synthetic_payment_rows_after_rollback,
  (select count(*) from public.finance_invoices where invoice_no like 'ROLLBACK-5DE2-%') as synthetic_invoice_rows_after_rollback,
  (
    to_regclass('public.finance_payment_allocation_reallocations') is null
    and (select count(*) from public.finance_cash_transactions) = 0
    and (select count(*) from public.finance_account_opening_balances) = 0
    and (select count(*) from public.finance_company_ledger) = 267
    and (select count(*) from public.finance_compensation_batches) = 33
    and (select count(*) from public.finance_payments where internal_reference like 'ROLLBACK-REALLOCATION-%') = 0
    and (select count(*) from public.finance_invoices where invoice_no like 'ROLLBACK-5DE2-%') = 0
    and (
      select count(*) from public.finance_payments
      where id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      ) and status = 'confirmed'
    ) = 2
  ) as payment_allocation_reallocation_dry_run_pass;
