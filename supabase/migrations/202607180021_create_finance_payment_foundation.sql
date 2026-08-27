-- Phase 5A: Payment foundation and read-only Invoice settlement reporting.
-- This migration creates no Payment and performs no Ledger, Compensation,
-- Receipt, Tax Invoice, or other business-data write.

do $payment_foundation_preflight$
begin
  if to_regclass('public.finance_invoices') is null
    or to_regclass('public.clients') is null
    or to_regclass('public.user_profiles') is null
    or to_regclass('public.finance_bank_accounts') is null
    or to_regprocedure('public.current_user_can_manage_finance_quotations()') is null
  then
    raise exception 'Payment foundation requires the current Invoice, Client, user, permission, and bank-account foundations';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'client_id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'total_amount'
      and data_type = 'numeric'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    raise exception 'Payment foundation source column contract is not compatible';
  end if;

  if to_regclass('public.finance_payments') is not null
    or to_regclass('public.finance_payment_invoice_allocations') is not null
    or to_regclass('public.finance_payment_evidence') is not null
    or to_regclass('public.finance_payment_audit_events') is not null
    or to_regclass('public.finance_invoice_settlement_summary') is not null
    or to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is not null
    or to_regprocedure('public.validate_finance_payment_integrity(uuid)') is not null
    or to_regprocedure('public.enforce_finance_payment_lifecycle()') is not null
    or to_regprocedure('public.guard_finance_payment_child_mutation()') is not null
    or to_regprocedure('public.protect_finance_payment_audit_event()') is not null
    or to_regprocedure('public.enforce_finance_payment_integrity()') is not null
    or to_regprocedure('public.enforce_finance_payment_child_integrity()') is not null
    or to_regprocedure('public.enforce_finance_invoice_payment_integrity()') is not null
  then
    raise exception 'Payment foundation objects already exist; inspect Production state before retrying';
  end if;
end;
$payment_foundation_preflight$;

create table public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  internal_reference text null,
  client_id uuid not null references public.clients(id) on delete restrict,
  currency text not null default 'THB',
  status text not null default 'draft',
  cash_amount numeric(14, 2) not null default 0,
  wht_amount numeric(14, 2) not null default 0,
  settlement_amount numeric(14, 2)
    generated always as ((cash_amount + wht_amount)::numeric(14, 2)) stored,
  received_on date null,
  payment_method text null,
  receiving_bank_account_id uuid null references public.finance_bank_accounts(id) on delete restrict,
  receiving_account_reference text null,
  external_transaction_reference text null,
  payer_name text null,
  note text null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  confirmed_at timestamptz null,
  confirmed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancel_reason text null,
  reversed_at timestamptz null,
  reversed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  reverse_reason text null,
  constraint finance_payments_internal_reference_check
    check (internal_reference is null or nullif(btrim(internal_reference), '') is not null),
  constraint finance_payments_currency_check
    check (nullif(btrim(currency), '') is not null and currency = upper(btrim(currency))),
  constraint finance_payments_status_check
    check (status in ('draft', 'confirmed', 'cancelled', 'reversed')),
  constraint finance_payments_amounts_non_negative_check
    check (cash_amount >= 0 and wht_amount >= 0),
  constraint finance_payments_method_check
    check (
      payment_method is null
      or payment_method in ('bank_transfer', 'cash', 'cheque', 'card_or_gateway', 'other')
    ),
  constraint finance_payments_text_length_check
    check (
      length(coalesce(internal_reference, '')) <= 200
      and length(coalesce(receiving_account_reference, '')) <= 500
      and length(coalesce(external_transaction_reference, '')) <= 500
      and length(coalesce(payer_name, '')) <= 500
      and length(coalesce(note, '')) <= 4000
      and length(coalesce(cancel_reason, '')) <= 2000
      and length(coalesce(reverse_reason, '')) <= 2000
    ),
  constraint finance_payments_lifecycle_metadata_check
    check (
      (
        status = 'draft'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and reversed_at is null
        and reversed_by_user_id is null
        and reverse_reason is null
      )
      or (
        status = 'confirmed'
        and received_on is not null
        and payment_method is not null
        and settlement_amount > 0
        and confirmed_at is not null
        and confirmed_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and reversed_at is null
        and reversed_by_user_id is null
        and reverse_reason is null
      )
      or (
        status = 'cancelled'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is not null
        and cancelled_by_user_id is not null
        and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
        and reversed_at is null
        and reversed_by_user_id is null
        and reverse_reason is null
      )
      or (
        status = 'reversed'
        and received_on is not null
        and payment_method is not null
        and settlement_amount > 0
        and confirmed_at is not null
        and confirmed_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and reversed_at is not null
        and reversed_by_user_id is not null
        and nullif(btrim(coalesce(reverse_reason, '')), '') is not null
      )
    )
);

create table public.finance_payment_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  cash_allocated numeric(14, 2) not null default 0,
  wht_credit_allocated numeric(14, 2) not null default 0,
  settlement_total numeric(14, 2)
    generated always as ((cash_allocated + wht_credit_allocated)::numeric(14, 2)) stored,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  constraint finance_payment_invoice_allocations_amounts_check
    check (cash_allocated >= 0 and wht_credit_allocated >= 0 and settlement_total > 0),
  constraint uq_finance_payment_invoice_allocation
    unique (payment_id, invoice_id)
);

create table public.finance_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  evidence_type text not null,
  evidence_on date null,
  external_reference text null,
  note text null,
  storage_bucket text null,
  storage_path text null,
  file_name text null,
  mime_type text null,
  file_size_bytes bigint null,
  file_sha256 text null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  constraint finance_payment_evidence_type_check
    check (
      evidence_type in (
        'bank_transfer_slip',
        'bank_statement',
        'cheque_copy',
        'cash_acknowledgement',
        'wht_certificate',
        'other'
      )
    ),
  constraint finance_payment_evidence_content_check
    check (
      nullif(btrim(coalesce(external_reference, '')), '') is not null
      or nullif(btrim(coalesce(note, '')), '') is not null
      or nullif(btrim(coalesce(storage_path, '')), '') is not null
    ),
  constraint finance_payment_evidence_file_metadata_check
    check (
      (
        storage_bucket is null
        and storage_path is null
        and file_name is null
        and mime_type is null
        and file_size_bytes is null
        and file_sha256 is null
      )
      or (
        nullif(btrim(coalesce(storage_bucket, '')), '') is not null
        and nullif(btrim(coalesce(storage_path, '')), '') is not null
        and nullif(btrim(coalesce(file_name, '')), '') is not null
        and (mime_type is null or nullif(btrim(mime_type), '') is not null)
        and (file_size_bytes is null or file_size_bytes > 0)
        and (
          file_sha256 is null
          or lower(btrim(file_sha256)) ~ '^[0-9a-f]{64}$'
        )
      )
    ),
  constraint finance_payment_evidence_text_length_check
    check (
      length(coalesce(external_reference, '')) <= 500
      and length(coalesce(note, '')) <= 4000
      and length(coalesce(storage_bucket, '')) <= 200
      and length(coalesce(storage_path, '')) <= 1024
      and length(coalesce(file_name, '')) <= 255
      and length(coalesce(mime_type, '')) <= 200
    )
);

create table public.finance_payment_audit_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_payment_audit_events_type_check
    check (
      event_type in (
        'draft_created',
        'draft_saved',
        'confirmed',
        'cancelled',
        'reversed',
        'allocation_changed',
        'evidence_added',
        'evidence_removed'
      )
    ),
  constraint finance_payment_audit_events_payload_shape_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create unique index uq_finance_payments_internal_reference
on public.finance_payments (internal_reference)
where internal_reference is not null;

create index idx_finance_payments_client
on public.finance_payments (client_id, created_at desc);

create index idx_finance_payments_status
on public.finance_payments (status, received_on desc);

create index idx_finance_payments_receiving_account
on public.finance_payments (receiving_bank_account_id)
where receiving_bank_account_id is not null;

create index idx_finance_payment_allocations_payment
on public.finance_payment_invoice_allocations (payment_id);

create index idx_finance_payment_allocations_invoice
on public.finance_payment_invoice_allocations (invoice_id);

create index idx_finance_payment_evidence_payment
on public.finance_payment_evidence (payment_id, created_at);

create index idx_finance_payment_audit_events_payment
on public.finance_payment_audit_events (payment_id, created_at);

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
  v_active_reserved_settlement numeric(14, 2);
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
    ) then
      raise exception 'Payment allocation references an Invoice that does not exist';
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
        or (
          payment.status in ('draft', 'confirmed')
          and v_invoice.document_status <> 'issued'
        )
        or (
          payment.status in ('cancelled', 'reversed')
          and v_invoice.document_status not in ('issued', 'voided')
        )
      )
  ) then
    raise exception 'Invoice status, Client, or currency is inconsistent with its Payment allocations';
  end if;

  select
    coalesce(sum(allocation.settlement_total) filter (where payment.status = 'confirmed'), 0),
    coalesce(sum(allocation.settlement_total) filter (where payment.status in ('draft', 'confirmed')), 0)
  into v_confirmed_settlement, v_active_reserved_settlement
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment on payment.id = allocation.payment_id
  where allocation.invoice_id = v_invoice.id;

  if v_confirmed_settlement > v_invoice.total_amount then
    raise exception 'Confirmed Payments economically over-settle the Invoice';
  end if;

  if v_active_reserved_settlement > v_invoice.total_amount then
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
  v_allocation record;
  v_allocation_count integer;
  v_cash_allocated numeric(14, 2);
  v_wht_allocated numeric(14, 2);
  v_settlement_allocated numeric(14, 2);
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
    coalesce(sum(cash_allocated), 0),
    coalesce(sum(wht_credit_allocated), 0),
    coalesce(sum(settlement_total), 0)
  into v_allocation_count, v_cash_allocated, v_wht_allocated, v_settlement_allocated
  from public.finance_payment_invoice_allocations
  where payment_id = v_payment.id;

  if v_cash_allocated <> v_payment.cash_amount
    or v_wht_allocated <> v_payment.wht_amount
    or v_settlement_allocated <> v_payment.settlement_amount
  then
    raise exception 'Payment allocations must exactly reconcile to Payment cash, WHT, and settlement totals';
  end if;

  if v_payment.status in ('confirmed', 'reversed') and v_allocation_count = 0 then
    raise exception 'A confirmed or reversed Payment must retain at least one Invoice allocation';
  end if;

  for v_allocation in
    select
      allocation.invoice_id,
      invoice.document_status,
      invoice.client_id,
      invoice.currency
    from public.finance_payment_invoice_allocations as allocation
    join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
    where allocation.payment_id = v_payment.id
    order by allocation.invoice_id
  loop
    if v_payment.status in ('draft', 'confirmed')
      and v_allocation.document_status <> 'issued'
    then
      raise exception 'Active Payment allocations require an Issued Invoice';
    end if;

    if v_payment.status in ('cancelled', 'reversed')
      and v_allocation.document_status not in ('issued', 'voided')
    then
      raise exception 'Historical Payment allocations require an Issued or Voided Invoice';
    end if;

    if v_allocation.client_id <> v_payment.client_id then
      raise exception 'Payment and allocated Invoice must belong to the same Client';
    end if;

    if v_allocation.currency <> v_payment.currency then
      raise exception 'Payment and allocated Invoice must use the same currency';
    end if;

    perform 1
    from public.finance_invoices
    where id = v_allocation.invoice_id
    for update;

    perform public.validate_finance_invoice_payment_settlement(v_allocation.invoice_id);
  end loop;
end;
$payment_validator$;

create or replace function public.enforce_finance_payment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_lifecycle_trigger$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A Payment must be created as Draft';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only a Draft Payment may be deleted';
    end if;
    return old;
  end if;

  if old.status = 'draft' and new.status in ('draft', 'confirmed', 'cancelled') then
    return new;
  end if;

  if old.status = 'confirmed' and new.status = 'reversed' then
    -- Generated values are recomputed after BEFORE triggers; compare their
    -- authoritative cash/WHT inputs instead of the generated settlement field.
    if (
      to_jsonb(new) - array[
        'status',
        'reversed_at',
        'reversed_by_user_id',
        'reverse_reason',
        'settlement_amount',
        'updated_at',
        'updated_by_user_id'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'status',
        'reversed_at',
        'reversed_by_user_id',
        'reverse_reason',
        'settlement_amount',
        'updated_at',
        'updated_by_user_id'
      ]
    ) then
      raise exception 'Payment reversal must preserve the original confirmed Payment evidence';
    end if;
    return new;
  end if;

  raise exception 'Invalid Payment lifecycle transition from % to %', old.status, new.status;
end;
$payment_lifecycle_trigger$;

create or replace function public.guard_finance_payment_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_child_guard$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status
    into v_old_status
    from public.finance_payments
    where id = old.payment_id;

    if v_old_status is distinct from 'draft' then
      raise exception 'Payment allocations and evidence are immutable after Draft';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status
    into v_new_status
    from public.finance_payments
    where id = new.payment_id;

    if v_new_status is distinct from 'draft' then
      raise exception 'Payment allocations and evidence can only change while Payment is Draft';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$payment_child_guard$;

create or replace function public.protect_finance_payment_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_audit_guard$
begin
  raise exception 'Payment audit events are append-only';
end;
$payment_audit_guard$;

create or replace function public.enforce_finance_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_header_integrity_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_payment_integrity(old.id);
  else
    perform public.validate_finance_payment_integrity(new.id);
  end if;
  return null;
end;
$payment_header_integrity_trigger$;

create or replace function public.enforce_finance_payment_child_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_allocation_integrity_trigger$
begin
  if tg_op = 'INSERT' then
    perform public.validate_finance_payment_integrity(new.payment_id);
    perform 1 from public.finance_invoices where id = new.invoice_id for update;
    perform public.validate_finance_invoice_payment_settlement(new.invoice_id);
  elsif tg_op = 'UPDATE' then
    perform public.validate_finance_payment_integrity(old.payment_id);
    if new.payment_id is distinct from old.payment_id then
      perform public.validate_finance_payment_integrity(new.payment_id);
    end if;

    perform 1 from public.finance_invoices where id = old.invoice_id for update;
    perform public.validate_finance_invoice_payment_settlement(old.invoice_id);
    if new.invoice_id is distinct from old.invoice_id then
      perform 1 from public.finance_invoices where id = new.invoice_id for update;
      perform public.validate_finance_invoice_payment_settlement(new.invoice_id);
    end if;
  else
    perform public.validate_finance_payment_integrity(old.payment_id);
    perform 1 from public.finance_invoices where id = old.invoice_id for update;
    perform public.validate_finance_invoice_payment_settlement(old.invoice_id);
  end if;
  return null;
end;
$payment_allocation_integrity_trigger$;

create or replace function public.enforce_finance_invoice_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_payment_integrity_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_invoice_payment_settlement(old.id);
  else
    perform public.validate_finance_invoice_payment_settlement(new.id);
  end if;
  return null;
end;
$invoice_payment_integrity_trigger$;

create trigger finance_payment_lifecycle_guard
before insert or update or delete on public.finance_payments
for each row execute function public.enforce_finance_payment_lifecycle();

create trigger finance_payment_allocation_mutation_guard
before insert or update or delete on public.finance_payment_invoice_allocations
for each row execute function public.guard_finance_payment_child_mutation();

create trigger finance_payment_evidence_mutation_guard
before insert or update or delete on public.finance_payment_evidence
for each row execute function public.guard_finance_payment_child_mutation();

create trigger finance_payment_audit_event_immutability
before update or delete on public.finance_payment_audit_events
for each row execute function public.protect_finance_payment_audit_event();

create constraint trigger finance_payment_integrity_after_header
after insert or update or delete on public.finance_payments
deferrable initially deferred
for each row execute function public.enforce_finance_payment_integrity();

create constraint trigger finance_payment_integrity_after_allocation
after insert or update or delete on public.finance_payment_invoice_allocations
deferrable initially deferred
for each row execute function public.enforce_finance_payment_child_integrity();

create constraint trigger finance_invoice_payment_integrity_after_invoice
after update or delete on public.finance_invoices
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_payment_integrity();

create view public.finance_invoice_settlement_summary
with (security_invoker = true)
as
with confirmed_settlement as (
  select
    allocation.invoice_id,
    coalesce(sum(allocation.cash_allocated), 0)::numeric(14, 2) as confirmed_cash_allocated,
    coalesce(sum(allocation.wht_credit_allocated), 0)::numeric(14, 2) as confirmed_wht_credit_allocated,
    coalesce(sum(allocation.settlement_total), 0)::numeric(14, 2) as economically_settled_amount
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment
    on payment.id = allocation.payment_id
   and payment.status = 'confirmed'
  group by allocation.invoice_id
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
    greatest(
      invoice.total_amount - coalesce(settlement.economically_settled_amount, 0),
      0
    )::numeric(14, 2) as outstanding_amount
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

alter table public.finance_payments enable row level security;
alter table public.finance_payment_invoice_allocations enable row level security;
alter table public.finance_payment_evidence enable row level security;
alter table public.finance_payment_audit_events enable row level security;

create policy "finance managers select payments"
on public.finance_payments for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select payment invoice allocations"
on public.finance_payment_invoice_allocations for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select payment evidence"
on public.finance_payment_evidence for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select payment audit events"
on public.finance_payment_audit_events for select
using (public.current_user_can_manage_finance_quotations());

revoke all on table public.finance_payments from public, anon, authenticated;
revoke all on table public.finance_payment_invoice_allocations from public, anon, authenticated;
revoke all on table public.finance_payment_evidence from public, anon, authenticated;
revoke all on table public.finance_payment_audit_events from public, anon, authenticated;
revoke all on table public.finance_invoice_settlement_summary from public, anon, authenticated;

grant select on table public.finance_payments to authenticated;
grant select on table public.finance_payment_invoice_allocations to authenticated;
grant select on table public.finance_payment_evidence to authenticated;
grant select on table public.finance_payment_audit_events to authenticated;
grant select on table public.finance_invoice_settlement_summary to authenticated;

revoke all on function public.validate_finance_invoice_payment_settlement(uuid)
  from public, anon, authenticated;
revoke all on function public.validate_finance_payment_integrity(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_finance_payment_lifecycle()
  from public, anon, authenticated;
revoke all on function public.guard_finance_payment_child_mutation()
  from public, anon, authenticated;
revoke all on function public.protect_finance_payment_audit_event()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_payment_integrity()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_payment_child_integrity()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_invoice_payment_integrity()
  from public, anon, authenticated;

do $payment_foundation_security_check$
declare
  v_function_count integer;
  v_owner_count integer;
  v_deferred_trigger_count integer;
begin
  select count(*)::integer, count(distinct function_record.proowner)::integer
  into v_function_count, v_owner_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure,
    'public.validate_finance_payment_integrity(uuid)'::regprocedure,
    'public.enforce_finance_payment_lifecycle()'::regprocedure,
    'public.guard_finance_payment_child_mutation()'::regprocedure,
    'public.protect_finance_payment_audit_event()'::regprocedure,
    'public.enforce_finance_payment_integrity()'::regprocedure,
    'public.enforce_finance_payment_child_integrity()'::regprocedure,
    'public.enforce_finance_invoice_payment_integrity()'::regprocedure
  );

  if v_function_count <> 8 or v_owner_count <> 1 then
    raise exception 'Payment integrity functions must exist under one trusted owner';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.enforce_finance_payment_lifecycle()'::regprocedure,
      'public.guard_finance_payment_child_mutation()'::regprocedure,
      'public.protect_finance_payment_audit_event()'::regprocedure,
      'public.enforce_finance_payment_integrity()'::regprocedure,
      'public.enforce_finance_payment_child_integrity()'::regprocedure,
      'public.enforce_finance_invoice_payment_integrity()'::regprocedure
    )
      and (
        not function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Payment trigger functions require SECURITY DEFINER with fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure,
      'public.validate_finance_payment_integrity(uuid)'::regprocedure
    )
      and (
        function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Payment validators require SECURITY INVOKER with fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure,
      'public.validate_finance_payment_integrity(uuid)'::regprocedure,
      'public.enforce_finance_payment_lifecycle()'::regprocedure,
      'public.guard_finance_payment_child_mutation()'::regprocedure,
      'public.protect_finance_payment_audit_event()'::regprocedure,
      'public.enforce_finance_payment_integrity()'::regprocedure,
      'public.enforce_finance_payment_child_integrity()'::regprocedure,
      'public.enforce_finance_invoice_payment_integrity()'::regprocedure
    )
      and (
        has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Payment internal functions must not be browser-executable';
  end if;

  select count(*)::integer
  into v_deferred_trigger_count
  from pg_trigger as trigger_record
  where not trigger_record.tgisinternal
    and trigger_record.tgname in (
      'finance_payment_integrity_after_header',
      'finance_payment_integrity_after_allocation',
      'finance_invoice_payment_integrity_after_invoice'
    )
    and trigger_record.tgdeferrable
    and trigger_record.tginitdeferred;

  if v_deferred_trigger_count <> 3 then
    raise exception 'Payment deferred integrity trigger chain is incomplete';
  end if;
end;
$payment_foundation_security_check$;

comment on table public.finance_payments is
  'Phase 5A Payment settlement events. Invoice gross remains unchanged; cash and WHT are separate factual settlement components.';

comment on column public.finance_payments.wht_amount is
  'Evidence-driven withholding-tax credit amount. It is economic settlement, not cash, discount, or a hard-coded tax rate.';

comment on table public.finance_payment_invoice_allocations is
  'Explicit many-to-many allocation of Payment cash and WHT credit to Issued Invoices.';

comment on table public.finance_payment_evidence is
  'Optional Payment evidence metadata. Phase 5A creates no Storage bucket and requires no file upload.';

comment on table public.finance_payment_audit_events is
  'Append-only Payment audit structure. Phase 5B controlled RPCs will record lifecycle and allocation events.';

comment on view public.finance_invoice_settlement_summary is
  'Authoritative read-only Invoice settlement derived only from Confirmed Payments; Bangkok date is used for overdue status.';

comment on column public.finance_payments.id is
  'Future Ledger integration must add a unique source_payment_id (or equivalent) to distinguish Payment-derived cash from legacy manual Ledger entries and prevent duplicate posting.';
