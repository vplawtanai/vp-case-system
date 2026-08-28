begin;

-- Transactional dry-run of the exact Migration 025 foundation, followed by
-- rollback-only structural probes. No test row or schema object is committed.
-- Phase 5D-B: authoritative company cash-movement foundation.
-- This migration creates no cash transaction or opening balance and does not
-- read from, write to, or alter the legacy finance_company_ledger.

do $finance_cash_foundation_preflight$
begin
  if to_regclass('public.finance_bank_accounts') is null
    or to_regclass('public.finance_bank_account_access') is null
    or to_regclass('public.finance_payments') is null
    or to_regclass('public.user_profiles') is null
    or to_regprocedure('public.current_user_can_view_finance_payments()') is null
    or to_regprocedure('public.current_user_can_manage_finance_payments()') is null
  then
    raise exception 'Finance Cash foundation requires the existing bank-account and Payment architecture';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'is_active'
      and data_type = 'boolean'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_account_access'
      and column_name = 'can_view'
      and data_type = 'boolean'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_payments'
      and column_name in (
        'status',
        'cash_amount',
        'currency',
        'received_on',
        'receiving_bank_account_id'
      )
    group by table_schema, table_name
    having count(*) = 5
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name in ('id', 'active', 'role')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'Finance Cash source, bank-access, or permission contract is incompatible';
  end if;

  if to_regclass('public.finance_cash_transactions') is not null
    or to_regclass('public.finance_account_opening_balances') is not null
    or to_regclass('public.finance_cash_transaction_audit_events') is not null
    or to_regclass('public.finance_account_opening_balance_audit_events') is not null
    or to_regclass('public.finance_cash_account_balance_summary') is not null
  then
    raise exception 'Finance Cash foundation relation names already exist; inspect partial Production state';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name in (
        'can_view_finance_cash_transactions',
        'can_manage_finance_cash_transactions',
        'can_confirm_finance_cash_transactions',
        'can_reverse_finance_cash_transactions'
      )
  ) then
    raise exception 'Finance Cash permission fields already exist; inspect partial Production state';
  end if;

  if to_regprocedure('public.current_user_can_view_finance_cash_transactions()') is not null
    or to_regprocedure('public.current_user_can_manage_finance_cash_transactions()') is not null
    or to_regprocedure('public.current_user_can_confirm_finance_cash_transactions()') is not null
    or to_regprocedure('public.current_user_can_reverse_finance_cash_transactions()') is not null
    or to_regprocedure('public.current_user_can_view_finance_cash_bank_account(uuid)') is not null
    or to_regprocedure('public.protect_finance_cash_permission_fields()') is not null
    or to_regprocedure('public.enforce_finance_cash_transaction_lifecycle()') is not null
    or to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') is not null
    or to_regprocedure('public.enforce_finance_cash_transaction_integrity()') is not null
    or to_regprocedure('public.enforce_finance_opening_balance_lifecycle()') is not null
    or to_regprocedure('public.validate_finance_opening_balance_integrity(uuid)') is not null
    or to_regprocedure('public.enforce_finance_opening_balance_integrity()') is not null
    or to_regprocedure('public.protect_finance_cash_audit_event()') is not null
  then
    raise exception 'Finance Cash foundation function names already exist; inspect partial Production state';
  end if;
end;
$finance_cash_foundation_preflight$;

alter table public.user_profiles
  add column can_view_finance_cash_transactions boolean not null default false,
  add column can_manage_finance_cash_transactions boolean not null default false,
  add column can_confirm_finance_cash_transactions boolean not null default false,
  add column can_reverse_finance_cash_transactions boolean not null default false;

create table public.finance_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  direction text not null,
  transaction_type text not null,
  bank_account_id uuid not null
    references public.finance_bank_accounts(id) on delete restrict,
  cash_amount numeric(14, 2) not null,
  currency text not null default 'THB',
  status text not null default 'draft',
  source_payment_id uuid null
    references public.finance_payments(id) on delete restrict,
  reference_no text null,
  description text null,
  note text null,
  reversal_of_transaction_id uuid null
    references public.finance_cash_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null
    references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null
    references public.user_profiles(id) on delete set null,
  confirmed_at timestamptz null,
  confirmed_by_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  cancel_reason text null,
  constraint finance_cash_transactions_direction_check
    check (direction in ('inflow', 'outflow')),
  constraint finance_cash_transactions_type_check
    check (
      transaction_type in (
        'customer_payment',
        'manual_inflow',
        'manual_outflow',
        'expense_claim',
        'refund',
        'tax_payment',
        'transfer',
        'reversal',
        'other'
      )
    ),
  constraint finance_cash_transactions_amount_check
    check (cash_amount > 0),
  constraint finance_cash_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_cash_transactions_status_check
    check (status in ('draft', 'confirmed', 'cancelled')),
  constraint finance_cash_transactions_text_length_check
    check (
      length(coalesce(reference_no, '')) <= 500
      and length(coalesce(description, '')) <= 1000
      and length(coalesce(note, '')) <= 4000
      and length(coalesce(cancel_reason, '')) <= 2000
    ),
  constraint finance_cash_transactions_lifecycle_metadata_check
    check (
      (
        status = 'draft'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
      )
      or (
        status = 'confirmed'
        and confirmed_at is not null
        and confirmed_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
      )
      or (
        status = 'cancelled'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is not null
        and cancelled_by_user_id is not null
        and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
      )
    ),
  constraint finance_cash_transactions_source_contract_check
    check (
      (
        reversal_of_transaction_id is null
        and (
          (transaction_type = 'customer_payment' and source_payment_id is not null and direction = 'inflow')
          or (
            transaction_type not in ('customer_payment', 'reversal')
            and source_payment_id is null
          )
        )
      )
      or (
        reversal_of_transaction_id is not null
        and transaction_type = 'reversal'
        and status = 'confirmed'
      )
    ),
  constraint finance_cash_transactions_type_direction_check
    check (
      (transaction_type <> 'manual_inflow' or direction = 'inflow')
      and (transaction_type not in ('manual_outflow', 'expense_claim', 'refund', 'tax_payment') or direction = 'outflow')
    ),
  constraint finance_cash_transactions_no_self_reversal_check
    check (reversal_of_transaction_id is null or reversal_of_transaction_id <> id)
);

create unique index uq_finance_cash_transactions_source_payment
on public.finance_cash_transactions (source_payment_id)
where source_payment_id is not null
  and reversal_of_transaction_id is null;

create unique index uq_finance_cash_transactions_reversal
on public.finance_cash_transactions (reversal_of_transaction_id)
where reversal_of_transaction_id is not null;

create index idx_finance_cash_transactions_account_date
on public.finance_cash_transactions (bank_account_id, currency, occurred_at desc);

create index idx_finance_cash_transactions_status_date
on public.finance_cash_transactions (status, occurred_at desc);

create index idx_finance_cash_transactions_source_payment
on public.finance_cash_transactions (source_payment_id)
where source_payment_id is not null;

create table public.finance_account_opening_balances (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null
    references public.finance_bank_accounts(id) on delete restrict,
  currency text not null default 'THB',
  as_of timestamptz not null,
  balance_amount numeric(14, 2) not null,
  status text not null default 'draft',
  evidence_reference text null,
  note text null,
  supersedes_opening_balance_id uuid null
    references public.finance_account_opening_balances(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null
    references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null
    references public.user_profiles(id) on delete set null,
  confirmed_at timestamptz null,
  confirmed_by_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  cancel_reason text null,
  superseded_at timestamptz null,
  superseded_by_user_id uuid null
    references public.user_profiles(id) on delete restrict,
  constraint finance_opening_balances_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_opening_balances_status_check
    check (status in ('draft', 'confirmed', 'cancelled', 'superseded')),
  constraint finance_opening_balances_text_length_check
    check (
      length(coalesce(evidence_reference, '')) <= 1000
      and length(coalesce(note, '')) <= 4000
      and length(coalesce(cancel_reason, '')) <= 2000
    ),
  constraint finance_opening_balances_lifecycle_metadata_check
    check (
      (
        status = 'draft'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and superseded_at is null
        and superseded_by_user_id is null
      )
      or (
        status = 'confirmed'
        and confirmed_at is not null
        and confirmed_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and superseded_at is null
        and superseded_by_user_id is null
      )
      or (
        status = 'cancelled'
        and confirmed_at is null
        and confirmed_by_user_id is null
        and cancelled_at is not null
        and cancelled_by_user_id is not null
        and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
        and superseded_at is null
        and superseded_by_user_id is null
      )
      or (
        status = 'superseded'
        and confirmed_at is not null
        and confirmed_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and superseded_at is not null
        and superseded_by_user_id is not null
      )
    ),
  constraint finance_opening_balances_no_self_supersession_check
    check (supersedes_opening_balance_id is null or supersedes_opening_balance_id <> id)
);

create unique index uq_finance_opening_balances_current
on public.finance_account_opening_balances (bank_account_id, currency)
where status = 'confirmed';

create unique index uq_finance_opening_balances_supersedes
on public.finance_account_opening_balances (supersedes_opening_balance_id)
where supersedes_opening_balance_id is not null;

create index idx_finance_opening_balances_account_as_of
on public.finance_account_opening_balances (bank_account_id, currency, as_of desc);

create index idx_finance_opening_balances_status
on public.finance_account_opening_balances (status, as_of desc);

create table public.finance_cash_transaction_audit_events (
  id uuid primary key default gen_random_uuid(),
  cash_transaction_id uuid not null
    references public.finance_cash_transactions(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_cash_transaction_audit_type_check
    check (event_type in ('draft_created', 'draft_saved', 'confirmed', 'cancelled', 'reversal_created')),
  constraint finance_cash_transaction_audit_payload_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_cash_transaction_audit_transaction
on public.finance_cash_transaction_audit_events (cash_transaction_id, created_at);

create table public.finance_account_opening_balance_audit_events (
  id uuid primary key default gen_random_uuid(),
  opening_balance_id uuid not null
    references public.finance_account_opening_balances(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_opening_balance_audit_type_check
    check (event_type in ('draft_created', 'draft_saved', 'confirmed', 'cancelled', 'superseded')),
  constraint finance_opening_balance_audit_payload_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_opening_balance_audit_balance
on public.finance_account_opening_balance_audit_events (opening_balance_id, created_at);

create or replace function public.protect_finance_cash_permission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_cash_permission_guard$
begin
  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  ) then
    raise exception 'Only an active Admin can change Finance Cash authority';
  end if;
  return new;
end;
$finance_cash_permission_guard$;

create trigger protect_finance_cash_permission_fields
before update of
  can_view_finance_cash_transactions,
  can_manage_finance_cash_transactions,
  can_confirm_finance_cash_transactions,
  can_reverse_finance_cash_transactions
on public.user_profiles
for each row execute function public.protect_finance_cash_permission_fields();

create or replace function public.current_user_can_view_finance_cash_transactions()
returns boolean
language sql
security definer
set search_path = public
as $finance_cash_view_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in ('admin', 'partner')
        or can_view_finance_cash_transactions
        or can_manage_finance_cash_transactions
        or can_confirm_finance_cash_transactions
        or can_reverse_finance_cash_transactions
      )
  );
$finance_cash_view_permission$;

create or replace function public.current_user_can_manage_finance_cash_transactions()
returns boolean
language sql
security definer
set search_path = public
as $finance_cash_manage_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_manage_finance_cash_transactions)
  );
$finance_cash_manage_permission$;

create or replace function public.current_user_can_confirm_finance_cash_transactions()
returns boolean
language sql
security definer
set search_path = public
as $finance_cash_confirm_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_confirm_finance_cash_transactions)
  );
$finance_cash_confirm_permission$;

create or replace function public.current_user_can_reverse_finance_cash_transactions()
returns boolean
language sql
security definer
set search_path = public
as $finance_cash_reverse_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_reverse_finance_cash_transactions)
  );
$finance_cash_reverse_permission$;

create or replace function public.current_user_can_view_finance_cash_bank_account(
  p_bank_account_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $finance_cash_bank_view_permission$
  select exists (
    select 1
    from public.user_profiles as profile
    where profile.id = auth.uid()
      and profile.active = true
      and (
        profile.role in ('admin', 'partner')
        or (
          (
            profile.can_view_finance_cash_transactions
            or profile.can_manage_finance_cash_transactions
            or profile.can_confirm_finance_cash_transactions
            or profile.can_reverse_finance_cash_transactions
          )
          and exists (
            select 1
            from public.finance_bank_account_access as access
            where access.user_profile_id = profile.id
              and access.bank_account_id = p_bank_account_id
              and access.can_view = true
          )
        )
      )
  );
$finance_cash_bank_view_permission$;

create or replace function public.enforce_finance_cash_transaction_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_cash_lifecycle_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Finance Cash Transactions are retained as financial evidence and cannot be deleted';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.status = 'draft' and new.status in ('draft', 'confirmed', 'cancelled') then
    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Finance Cash Transaction creation identity is immutable';
    end if;
    return new;
  end if;

  raise exception 'Confirmed or Cancelled Finance Cash Transactions are immutable';
end;
$finance_cash_lifecycle_guard$;

create or replace function public.validate_finance_cash_transaction_integrity(
  p_cash_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_cash_integrity_validator$
declare
  v_transaction public.finance_cash_transactions%rowtype;
  v_original public.finance_cash_transactions%rowtype;
  v_payment public.finance_payments%rowtype;
begin
  select * into v_transaction
  from public.finance_cash_transactions
  where id = p_cash_transaction_id;

  if v_transaction.id is null then
    return;
  end if;

  if v_transaction.status = 'confirmed' and not exists (
    select 1
    from public.finance_bank_accounts
    where id = v_transaction.bank_account_id
      and is_active = true
  ) then
    raise exception 'Confirmed Finance Cash Transaction requires an active bank account';
  end if;

  if v_transaction.reversal_of_transaction_id is not null then
    select * into v_original
    from public.finance_cash_transactions
    where id = v_transaction.reversal_of_transaction_id;

    if v_original.id is null
      or v_original.status <> 'confirmed'
      or v_original.reversal_of_transaction_id is not null
      or v_transaction.status <> 'confirmed'
      or v_transaction.direction = v_original.direction
      or v_transaction.cash_amount <> v_original.cash_amount
      or v_transaction.currency <> v_original.currency
      or v_transaction.bank_account_id <> v_original.bank_account_id
      or v_transaction.source_payment_id is distinct from v_original.source_payment_id
      or v_transaction.occurred_at < v_original.occurred_at
    then
      raise exception 'Finance Cash reversal must be one confirmed opposite transaction preserving source, account, currency, and amount';
    end if;
  end if;

  if v_transaction.source_payment_id is not null then
    select * into v_payment
    from public.finance_payments
    where id = v_transaction.source_payment_id;

    if v_payment.id is null
      or v_payment.status not in ('confirmed', 'reversed')
      or v_payment.cash_amount <= 0
      or v_transaction.cash_amount <> v_payment.cash_amount
      or v_transaction.currency <> v_payment.currency
      or v_transaction.bank_account_id is distinct from v_payment.receiving_bank_account_id
    then
      raise exception 'Payment-linked Finance Cash Transaction must preserve confirmed Payment cash, currency, and receiving account';
    end if;
  end if;
end;
$finance_cash_integrity_validator$;

create or replace function public.enforce_finance_cash_transaction_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_cash_integrity_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_cash_transaction_integrity(old.id);
  else
    perform public.validate_finance_cash_transaction_integrity(new.id);
  end if;
  return null;
end;
$finance_cash_integrity_trigger$;

create or replace function public.enforce_finance_opening_balance_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_opening_lifecycle_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Finance Account Opening Balances are retained as financial evidence and cannot be deleted';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.status = 'draft' and new.status in ('draft', 'confirmed', 'cancelled') then
    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.created_by_user_id is distinct from old.created_by_user_id
    then
      raise exception 'Finance Account Opening Balance creation identity is immutable';
    end if;
    return new;
  end if;

  if old.status = 'confirmed' and new.status = 'superseded' then
    if (
      to_jsonb(new) - array[
        'status',
        'superseded_at',
        'superseded_by_user_id',
        'updated_at',
        'updated_by_user_id'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'status',
        'superseded_at',
        'superseded_by_user_id',
        'updated_at',
        'updated_by_user_id'
      ]
    ) then
      raise exception 'Superseding an Opening Balance must preserve its confirmed evidence';
    end if;
    return new;
  end if;

  raise exception 'Confirmed, Superseded, or Cancelled Opening Balance evidence is immutable';
end;
$finance_opening_lifecycle_guard$;

create or replace function public.validate_finance_opening_balance_integrity(
  p_opening_balance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_opening_integrity_validator$
declare
  v_balance public.finance_account_opening_balances%rowtype;
  v_prior public.finance_account_opening_balances%rowtype;
begin
  select * into v_balance
  from public.finance_account_opening_balances
  where id = p_opening_balance_id;

  if v_balance.id is null then
    return;
  end if;

  if v_balance.status = 'confirmed' and not exists (
    select 1
    from public.finance_bank_accounts
    where id = v_balance.bank_account_id
      and is_active = true
  ) then
    raise exception 'Confirmed Opening Balance requires an active bank account';
  end if;

  if v_balance.supersedes_opening_balance_id is not null then
    select * into v_prior
    from public.finance_account_opening_balances
    where id = v_balance.supersedes_opening_balance_id;

    if v_prior.id is null
      or v_prior.bank_account_id <> v_balance.bank_account_id
      or v_prior.currency <> v_balance.currency
      or v_prior.as_of >= v_balance.as_of
    then
      raise exception 'Replacement Opening Balance must supersede an earlier balance for the same bank account and currency';
    end if;

    if v_balance.status = 'confirmed' and v_prior.status <> 'superseded' then
      raise exception 'Prior Opening Balance must be superseded atomically with confirmation of its replacement';
    end if;
  elsif v_balance.status = 'confirmed' and exists (
    select 1
    from public.finance_account_opening_balances as historical
    where historical.bank_account_id = v_balance.bank_account_id
      and historical.currency = v_balance.currency
      and historical.id <> v_balance.id
      and historical.status in ('confirmed', 'superseded')
  ) then
    raise exception 'Replacement Opening Balance must preserve supersession lineage';
  end if;

  if v_balance.status = 'superseded' and not exists (
    select 1
    from public.finance_account_opening_balances as replacement
    where replacement.supersedes_opening_balance_id = v_balance.id
      and replacement.status = 'confirmed'
  ) then
    raise exception 'Superseded Opening Balance requires one confirmed replacement';
  end if;
end;
$finance_opening_integrity_validator$;

create or replace function public.enforce_finance_opening_balance_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_opening_integrity_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_opening_balance_integrity(old.id);
  else
    perform public.validate_finance_opening_balance_integrity(new.id);
    if tg_op = 'UPDATE' and old.id is distinct from new.id then
      perform public.validate_finance_opening_balance_integrity(old.id);
    end if;
  end if;
  return null;
end;
$finance_opening_integrity_trigger$;

create or replace function public.protect_finance_cash_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $finance_cash_audit_guard$
begin
  raise exception 'Finance Cash audit events are append-only';
end;
$finance_cash_audit_guard$;

create trigger finance_cash_transaction_lifecycle_guard
before insert or update or delete on public.finance_cash_transactions
for each row execute function public.enforce_finance_cash_transaction_lifecycle();

create constraint trigger finance_cash_transaction_integrity
after insert or update or delete on public.finance_cash_transactions
deferrable initially deferred
for each row execute function public.enforce_finance_cash_transaction_integrity();

create trigger finance_opening_balance_lifecycle_guard
before insert or update or delete on public.finance_account_opening_balances
for each row execute function public.enforce_finance_opening_balance_lifecycle();

create constraint trigger finance_opening_balance_integrity
after insert or update or delete on public.finance_account_opening_balances
deferrable initially deferred
for each row execute function public.enforce_finance_opening_balance_integrity();

create trigger finance_cash_transaction_audit_immutability
before update or delete on public.finance_cash_transaction_audit_events
for each row execute function public.protect_finance_cash_audit_event();

create trigger finance_opening_balance_audit_immutability
before update or delete on public.finance_account_opening_balance_audit_events
for each row execute function public.protect_finance_cash_audit_event();

create view public.finance_cash_account_balance_summary
with (security_invoker = true)
as
with account_currency as (
  select bank_account.id as bank_account_id, 'THB'::text as currency
  from public.finance_bank_accounts as bank_account
  union
  select opening_balance.bank_account_id, opening_balance.currency
  from public.finance_account_opening_balances as opening_balance
  union
  select cash_transaction.bank_account_id, cash_transaction.currency
  from public.finance_cash_transactions as cash_transaction
), current_opening as (
  select
    opening_balance.id,
    opening_balance.bank_account_id,
    opening_balance.currency,
    opening_balance.as_of,
    opening_balance.balance_amount,
    opening_balance.confirmed_at,
    opening_balance.confirmed_by_user_id
  from public.finance_account_opening_balances as opening_balance
  where opening_balance.status = 'confirmed'
), confirmed_movement as (
  select
    account_currency.bank_account_id,
    account_currency.currency,
    count(cash_transaction.id) filter (
      where current_opening.id is not null
        and cash_transaction.occurred_at > current_opening.as_of
    ) as confirmed_transaction_count_after_opening,
    count(cash_transaction.id) filter (
      where current_opening.id is null
    ) as confirmed_transaction_count_without_opening,
    coalesce(sum(cash_transaction.cash_amount) filter (
      where current_opening.id is not null
        and cash_transaction.occurred_at > current_opening.as_of
        and cash_transaction.direction = 'inflow'
    ), 0)::numeric(14, 2) as confirmed_inflow_after_opening,
    coalesce(sum(cash_transaction.cash_amount) filter (
      where current_opening.id is not null
        and cash_transaction.occurred_at > current_opening.as_of
        and cash_transaction.direction = 'outflow'
    ), 0)::numeric(14, 2) as confirmed_outflow_after_opening
  from account_currency
  left join current_opening
    on current_opening.bank_account_id = account_currency.bank_account_id
   and current_opening.currency = account_currency.currency
  left join public.finance_cash_transactions as cash_transaction
    on cash_transaction.bank_account_id = account_currency.bank_account_id
   and cash_transaction.currency = account_currency.currency
   and cash_transaction.status = 'confirmed'
  group by
    account_currency.bank_account_id,
    account_currency.currency,
    current_opening.id
)
select
  bank_account.id as bank_account_id,
  bank_account.short_name,
  bank_account.bank_name,
  bank_account.account_name,
  bank_account.account_number,
  bank_account.is_active,
  account_currency.currency,
  current_opening.id as opening_balance_id,
  current_opening.as_of as opening_balance_as_of,
  current_opening.balance_amount as opening_balance_amount,
  current_opening.confirmed_at as opening_balance_confirmed_at,
  current_opening.confirmed_by_user_id as opening_balance_confirmed_by_user_id,
  current_opening.id is not null as is_initialized,
  movement.confirmed_transaction_count_after_opening,
  movement.confirmed_transaction_count_without_opening,
  movement.confirmed_inflow_after_opening,
  movement.confirmed_outflow_after_opening,
  case
    when current_opening.id is null then null
    else (
      current_opening.balance_amount
      + movement.confirmed_inflow_after_opening
      - movement.confirmed_outflow_after_opening
    )::numeric(14, 2)
  end as current_balance
from account_currency
join public.finance_bank_accounts as bank_account
  on bank_account.id = account_currency.bank_account_id
left join current_opening
  on current_opening.bank_account_id = account_currency.bank_account_id
 and current_opening.currency = account_currency.currency
join confirmed_movement as movement
  on movement.bank_account_id = account_currency.bank_account_id
 and movement.currency = account_currency.currency
where public.current_user_can_view_finance_cash_bank_account(bank_account.id);

alter table public.finance_cash_transactions enable row level security;
alter table public.finance_account_opening_balances enable row level security;
alter table public.finance_cash_transaction_audit_events enable row level security;
alter table public.finance_account_opening_balance_audit_events enable row level security;

create policy "finance cash viewers select transactions"
on public.finance_cash_transactions for select
using (
  public.current_user_can_view_finance_cash_transactions()
  and public.current_user_can_view_finance_cash_bank_account(bank_account_id)
);

create policy "finance cash viewers select opening balances"
on public.finance_account_opening_balances for select
using (
  public.current_user_can_view_finance_cash_transactions()
  and public.current_user_can_view_finance_cash_bank_account(bank_account_id)
);

create policy "finance cash viewers select transaction audit"
on public.finance_cash_transaction_audit_events for select
using (
  public.current_user_can_view_finance_cash_transactions()
  and exists (
    select 1
    from public.finance_cash_transactions as cash_transaction
    where cash_transaction.id = cash_transaction_id
      and public.current_user_can_view_finance_cash_bank_account(cash_transaction.bank_account_id)
  )
);

create policy "finance cash viewers select opening balance audit"
on public.finance_account_opening_balance_audit_events for select
using (
  public.current_user_can_view_finance_cash_transactions()
  and exists (
    select 1
    from public.finance_account_opening_balances as opening_balance
    where opening_balance.id = opening_balance_id
      and public.current_user_can_view_finance_cash_bank_account(opening_balance.bank_account_id)
  )
);

revoke all on table public.finance_cash_transactions from public, anon, authenticated;
revoke all on table public.finance_account_opening_balances from public, anon, authenticated;
revoke all on table public.finance_cash_transaction_audit_events from public, anon, authenticated;
revoke all on table public.finance_account_opening_balance_audit_events from public, anon, authenticated;
revoke all on table public.finance_cash_account_balance_summary from public, anon, authenticated;

grant select on table public.finance_cash_transactions to authenticated;
grant select on table public.finance_account_opening_balances to authenticated;
grant select on table public.finance_cash_transaction_audit_events to authenticated;
grant select on table public.finance_account_opening_balance_audit_events to authenticated;
grant select on table public.finance_cash_account_balance_summary to authenticated;

revoke all on function public.current_user_can_view_finance_cash_transactions()
  from public, anon, authenticated;
revoke all on function public.current_user_can_manage_finance_cash_transactions()
  from public, anon, authenticated;
revoke all on function public.current_user_can_confirm_finance_cash_transactions()
  from public, anon, authenticated;
revoke all on function public.current_user_can_reverse_finance_cash_transactions()
  from public, anon, authenticated;
revoke all on function public.current_user_can_view_finance_cash_bank_account(uuid)
  from public, anon, authenticated;

grant execute on function public.current_user_can_view_finance_cash_transactions()
  to authenticated;
grant execute on function public.current_user_can_manage_finance_cash_transactions()
  to authenticated;
grant execute on function public.current_user_can_confirm_finance_cash_transactions()
  to authenticated;
grant execute on function public.current_user_can_reverse_finance_cash_transactions()
  to authenticated;
grant execute on function public.current_user_can_view_finance_cash_bank_account(uuid)
  to authenticated;

revoke all on function public.protect_finance_cash_permission_fields()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_cash_transaction_lifecycle()
  from public, anon, authenticated;
revoke all on function public.validate_finance_cash_transaction_integrity(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_finance_cash_transaction_integrity()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_opening_balance_lifecycle()
  from public, anon, authenticated;
revoke all on function public.validate_finance_opening_balance_integrity(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_finance_opening_balance_integrity()
  from public, anon, authenticated;
revoke all on function public.protect_finance_cash_audit_event()
  from public, anon, authenticated;

do $finance_cash_foundation_security_check$
declare
  v_function_count integer;
  v_owner_count integer;
begin
  select count(*)::integer, count(distinct function_record.proowner)::integer
  into v_function_count, v_owner_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.current_user_can_view_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_manage_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_confirm_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_reverse_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_view_finance_cash_bank_account(uuid)'::regprocedure,
    'public.protect_finance_cash_permission_fields()'::regprocedure,
    'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure,
    'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
    'public.enforce_finance_cash_transaction_integrity()'::regprocedure,
    'public.enforce_finance_opening_balance_lifecycle()'::regprocedure,
    'public.validate_finance_opening_balance_integrity(uuid)'::regprocedure,
    'public.enforce_finance_opening_balance_integrity()'::regprocedure,
    'public.protect_finance_cash_audit_event()'::regprocedure
  );

  if v_function_count <> 13 or v_owner_count <> 1 then
    raise exception 'Finance Cash foundation functions must exist under one trusted owner';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.current_user_can_view_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_manage_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_confirm_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_reverse_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_view_finance_cash_bank_account(uuid)'::regprocedure,
      'public.protect_finance_cash_permission_fields()'::regprocedure,
      'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure,
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
      'public.enforce_finance_cash_transaction_integrity()'::regprocedure,
      'public.enforce_finance_opening_balance_lifecycle()'::regprocedure,
      'public.validate_finance_opening_balance_integrity(uuid)'::regprocedure,
      'public.enforce_finance_opening_balance_integrity()'::regprocedure,
      'public.protect_finance_cash_audit_event()'::regprocedure
    )
      and (
        not function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Finance Cash foundation functions require SECURITY DEFINER with fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.current_user_can_view_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_manage_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_confirm_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_reverse_finance_cash_transactions()'::regprocedure,
      'public.current_user_can_view_finance_cash_bank_account(uuid)'::regprocedure
    )
      and (
        not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Finance Cash browser permission-function grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.protect_finance_cash_permission_fields()'::regprocedure,
      'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure,
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
      'public.enforce_finance_cash_transaction_integrity()'::regprocedure,
      'public.enforce_finance_opening_balance_lifecycle()'::regprocedure,
      'public.validate_finance_opening_balance_integrity(uuid)'::regprocedure,
      'public.enforce_finance_opening_balance_integrity()'::regprocedure,
      'public.protect_finance_cash_audit_event()'::regprocedure
    )
      and (
        has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Finance Cash internal helpers must not be browser-executable';
  end if;
end;
$finance_cash_foundation_security_check$;

comment on table public.finance_cash_transactions is
  'Authoritative post-cutover company cash movements only. It excludes WHT, VAT, revenue allocation, and legacy Ledger history.';
comment on column public.finance_cash_transactions.cash_amount is
  'Positive actual cash amount. Direction determines balance sign.';
comment on column public.finance_cash_transactions.source_payment_id is
  'Explicit Payment lineage. One original cash transaction per Payment is enforced independently of reversal rows.';
comment on column public.finance_cash_transactions.reversal_of_transaction_id is
  'Append-only opposite cash movement correcting one immutable confirmed transaction.';
comment on table public.finance_account_opening_balances is
  'Independently verified bank-account balance at cutover. It is not income or cash-flow activity.';
comment on view public.finance_cash_account_balance_summary is
  'Confirmed opening balance plus confirmed post-opening inflows minus outflows. Current balance remains null until initialized.';
comment on column public.user_profiles.can_view_finance_cash_transactions is
  'Dedicated permission to view new Finance Cash data, subject to bank-account access. Admin and Partner retain view access by role.';
comment on column public.user_profiles.can_manage_finance_cash_transactions is
  'Dedicated permission for future controlled Draft Finance Cash and Opening Balance management. Admin remains authorized by role.';
comment on column public.user_profiles.can_confirm_finance_cash_transactions is
  'Dedicated authority for future confirmation of Finance Cash and Opening Balance evidence. Admin remains authorized by role.';
comment on column public.user_profiles.can_reverse_finance_cash_transactions is
  'Dedicated authority for future append-only Finance Cash reversals. Admin remains authorized by role.';

do $finance_cash_foundation_dry_run_tests$
declare
  v_actor_user_id uuid;
  v_payment public.finance_payments%rowtype;
  v_original_transaction_id uuid := gen_random_uuid();
  v_reversal_transaction_id uuid := gen_random_uuid();
  v_opening_balance_id uuid := gen_random_uuid();
  v_replacement_opening_balance_id uuid := gen_random_uuid();
  v_audit_event_id uuid := gen_random_uuid();
begin
  perform set_config(
    'vp_cash_dry_run.legacy_ledger_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
      from public.finance_company_ledger as ledger_record
    ),
    true
  );
  perform set_config(
    'vp_cash_dry_run.payment_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
      from public.finance_payments as payment_record
    ),
    true
  );
  perform set_config(
    'vp_cash_dry_run.compensation_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
      from public.finance_compensation_batches as compensation_record
    ),
    true
  );

  if (select count(*) from public.finance_company_ledger) <> 267 then
    raise exception 'Dry-run requires the confirmed 267-row Legacy Ledger baseline';
  end if;
  if (select count(*) from public.finance_compensation_batches) <> 33 then
    raise exception 'Dry-run requires the confirmed 33-row Compensation baseline';
  end if;
  if (select count(*) from public.finance_cash_transactions) <> 0
    or (select count(*) from public.finance_account_opening_balances) <> 0
  then
    raise exception 'Dry-run foundation must begin without Cash Transactions or Opening Balances';
  end if;

  select id into v_actor_user_id
  from public.user_profiles
  where active = true
    and role = 'admin'
  order by id
  limit 1;

  if v_actor_user_id is null then
    raise exception 'Dry-run requires one active Admin for audit metadata';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);

  select payment.* into v_payment
  from public.finance_payments as payment
  join public.finance_bank_accounts as bank_account
    on bank_account.id = payment.receiving_bank_account_id
   and bank_account.is_active = true
  where payment.status = 'confirmed'
    and payment.cash_amount > 0
  order by payment.confirmed_at, payment.id
  limit 1;

  if v_payment.id is null then
    raise exception 'Dry-run requires one confirmed bank-received Payment';
  end if;

  begin
    insert into public.finance_cash_transactions (
      occurred_at,
      direction,
      transaction_type,
      bank_account_id,
      cash_amount,
      currency,
      status
    ) values (
      now(),
      'inflow',
      'manual_inflow',
      v_payment.receiving_bank_account_id,
      -1,
      v_payment.currency,
      'draft'
    );
    raise exception 'Negative Cash Transaction amount was unexpectedly accepted';
  exception
    when check_violation then null;
  end;

  insert into public.finance_account_opening_balances (
    id,
    bank_account_id,
    currency,
    as_of,
    balance_amount,
    status,
    evidence_reference,
    created_by_user_id,
    confirmed_at,
    confirmed_by_user_id
  ) values (
    v_opening_balance_id,
    v_payment.receiving_bank_account_id,
    v_payment.currency,
    now() - interval '2 days',
    -100,
    'confirmed',
    'ROLLBACK-ONLY-OVERDRAFT-TEST',
    v_actor_user_id,
    now(),
    v_actor_user_id
  );

  insert into public.finance_account_opening_balances (
    id,
    bank_account_id,
    currency,
    as_of,
    balance_amount,
    status,
    supersedes_opening_balance_id,
    evidence_reference,
    created_by_user_id
  ) values (
    v_replacement_opening_balance_id,
    v_payment.receiving_bank_account_id,
    v_payment.currency,
    now() - interval '1 day',
    200,
    'draft',
    v_opening_balance_id,
    'ROLLBACK-ONLY-SUPERSESSION-TEST',
    v_actor_user_id
  );

  update public.finance_account_opening_balances
  set
    status = 'superseded',
    superseded_at = now(),
    superseded_by_user_id = v_actor_user_id,
    updated_at = now(),
    updated_by_user_id = v_actor_user_id
  where id = v_opening_balance_id;

  update public.finance_account_opening_balances
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = v_actor_user_id,
    updated_at = now(),
    updated_by_user_id = v_actor_user_id
  where id = v_replacement_opening_balance_id;

  insert into public.finance_cash_transactions (
    id,
    occurred_at,
    direction,
    transaction_type,
    bank_account_id,
    cash_amount,
    currency,
    status,
    source_payment_id,
    reference_no,
    created_by_user_id,
    confirmed_at,
    confirmed_by_user_id
  ) values (
    v_original_transaction_id,
    now(),
    'inflow',
    'customer_payment',
    v_payment.receiving_bank_account_id,
    v_payment.cash_amount,
    v_payment.currency,
    'confirmed',
    v_payment.id,
    'ROLLBACK-ONLY-PAYMENT-SOURCE-TEST',
    v_actor_user_id,
    now(),
    v_actor_user_id
  );

  begin
    insert into public.finance_cash_transactions (
      occurred_at,
      direction,
      transaction_type,
      bank_account_id,
      cash_amount,
      currency,
      status,
      source_payment_id,
      created_by_user_id,
      confirmed_at,
      confirmed_by_user_id
    ) values (
      now(),
      'inflow',
      'customer_payment',
      v_payment.receiving_bank_account_id,
      v_payment.cash_amount,
      v_payment.currency,
      'confirmed',
      v_payment.id,
      v_actor_user_id,
      now(),
      v_actor_user_id
    );
    raise exception 'Duplicate original Payment source was unexpectedly accepted';
  exception
    when unique_violation then null;
  end;

  insert into public.finance_cash_transactions (
    id,
    occurred_at,
    direction,
    transaction_type,
    bank_account_id,
    cash_amount,
    currency,
    status,
    source_payment_id,
    reversal_of_transaction_id,
    reference_no,
    created_by_user_id,
    confirmed_at,
    confirmed_by_user_id
  ) values (
    v_reversal_transaction_id,
    now(),
    'outflow',
    'reversal',
    v_payment.receiving_bank_account_id,
    v_payment.cash_amount,
    v_payment.currency,
    'confirmed',
    v_payment.id,
    v_original_transaction_id,
    'ROLLBACK-ONLY-REVERSAL-TEST',
    v_actor_user_id,
    now(),
    v_actor_user_id
  );

  begin
    insert into public.finance_cash_transactions (
      occurred_at,
      direction,
      transaction_type,
      bank_account_id,
      cash_amount,
      currency,
      status,
      source_payment_id,
      reversal_of_transaction_id,
      created_by_user_id,
      confirmed_at,
      confirmed_by_user_id
    ) values (
      now(),
      'outflow',
      'reversal',
      v_payment.receiving_bank_account_id,
      v_payment.cash_amount,
      v_payment.currency,
      'confirmed',
      v_payment.id,
      v_original_transaction_id,
      v_actor_user_id,
      now(),
      v_actor_user_id
    );
    raise exception 'Second reversal of one original transaction was unexpectedly accepted';
  exception
    when unique_violation then null;
  end;

  insert into public.finance_cash_transaction_audit_events (
    id,
    cash_transaction_id,
    event_type,
    event_payload_json,
    actor_user_id
  ) values (
    v_audit_event_id,
    v_original_transaction_id,
    'confirmed',
    jsonb_build_object('dry_run', true),
    v_actor_user_id
  );

  begin
    update public.finance_cash_transaction_audit_events
    set event_payload_json = jsonb_build_object('tampered', true)
    where id = v_audit_event_id;
    raise exception 'Finance Cash audit event was unexpectedly mutable';
  exception
    when raise_exception then
      if sqlerrm <> 'Finance Cash audit events are append-only' then
        raise;
      end if;
  end;
end;
$finance_cash_foundation_dry_run_tests$;

set constraints all immediate;

select
  'FINANCE_CASH_TRANSACTION_FOUNDATION_DRY_RUN' as report_section,
  (select count(*) from public.finance_cash_transactions) as rollback_only_cash_transaction_rows,
  (select count(*) from public.finance_account_opening_balances) as rollback_only_opening_balance_rows,
  (select count(*) from public.finance_cash_transaction_audit_events) as rollback_only_cash_audit_rows,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_unchanged,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_unchanged,
  (select count(*) from public.finance_payments) as payment_rows_unchanged_observability,
  current_setting('vp_cash_dry_run.legacy_ledger_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
    from public.finance_company_ledger as ledger_record
  ) as legacy_ledger_content_unchanged,
  current_setting('vp_cash_dry_run.payment_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
    from public.finance_payments as payment_record
  ) as payment_content_unchanged,
  current_setting('vp_cash_dry_run.compensation_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
    from public.finance_compensation_batches as compensation_record
  ) as compensation_content_unchanged,
  exists (
    select 1
    from public.finance_cash_account_balance_summary
    where is_initialized
      and opening_balance_amount = 200.00::numeric
      and confirmed_inflow_after_opening = confirmed_outflow_after_opening
      and current_balance = 200.00::numeric
  ) as balance_view_formula_pass,
  (
    (select count(*) from public.finance_cash_transactions) = 2
    and (select count(*) from public.finance_account_opening_balances) = 2
    and (select count(*) from public.finance_cash_transaction_audit_events) = 1
    and (select count(*) from public.finance_company_ledger) = 267
    and (select count(*) from public.finance_compensation_batches) = 33
    and current_setting('vp_cash_dry_run.legacy_ledger_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
      from public.finance_company_ledger as ledger_record
    )
    and current_setting('vp_cash_dry_run.payment_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
      from public.finance_payments as payment_record
    )
    and current_setting('vp_cash_dry_run.compensation_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
      from public.finance_compensation_batches as compensation_record
    )
  ) as finance_cash_transaction_foundation_dry_run_pass;

rollback;
