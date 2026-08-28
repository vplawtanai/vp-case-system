begin;

-- Transactional dry-run of the exact Migration 027 body, followed by
-- rollback-only integration probes. No test row or schema object is committed.
-- Phase 5D-D: atomically post post-cutover Confirmed Payment cash into the
-- authoritative Finance Cash Transaction system. WHT never becomes cash.

do $payment_cash_integration_preflight$
begin
  if to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_payment_invoice_allocations') is null
    or to_regclass('public.finance_payment_audit_events') is null
    or to_regclass('public.finance_cash_transactions') is null
    or to_regclass('public.finance_cash_transaction_audit_events') is null
    or to_regclass('public.finance_account_opening_balances') is null
    or to_regclass('public.finance_account_opening_balance_audit_events') is null
    or to_regclass('public.finance_cash_account_balance_summary') is null
    or to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is null
    or to_regprocedure('public.reverse_finance_payment(uuid,text)') is null
    or to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is null
    or to_regprocedure('public.confirm_finance_account_opening_balance(uuid,boolean)') is null
    or to_regprocedure('public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)') is null
    or to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is null
    or to_regprocedure('public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)') is null
    or to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') is null
  then
    raise exception 'Payment to Finance Cash integration requires Migrations 021, 022, 025, and 026';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'finance_cash_transactions'
      and indexname = 'uq_finance_cash_transactions_source_payment'
      and indexdef ilike '%unique%'
      and indexdef ilike '%source_payment_id%'
  ) then
    raise exception 'Payment to Finance Cash integration requires the unique Payment source contract';
  end if;

  if to_regprocedure('public.finance_bangkok_completed_day_end(date)') is not null
    or to_regprocedure('public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)') is not null
    or to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)') is not null
  then
    raise exception 'Payment to Finance Cash helper names already exist; inspect partial Production state';
  end if;

  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or exists (select 1 from public.finance_cash_transaction_audit_events)
    or exists (select 1 from public.finance_account_opening_balance_audit_events)
  then
    raise exception 'Payment to Finance Cash integration requires the verified empty pre-cutover foundation';
  end if;
end;
$payment_cash_integration_preflight$;

create or replace function public.finance_bangkok_completed_day_end(
  p_calendar_date date
)
returns timestamptz
language sql
security definer
set search_path = public
as $bangkok_completed_day_end$
  select case
    when p_calendar_date is null then null
    else (
      ((p_calendar_date + 1)::timestamp at time zone 'Asia/Bangkok')
      - interval '1 microsecond'
    )
  end;
$bangkok_completed_day_end$;

create or replace function public.assert_finance_opening_balance_input(
  p_bank_account_id uuid,
  p_currency text,
  p_as_of timestamptz,
  p_balance_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_opening_balance_input_guard$
declare
  v_bangkok_date date;
begin
  if p_bank_account_id is null then
    raise exception 'Opening Balance requires a bank account';
  end if;
  if not exists (
    select 1
    from public.finance_bank_accounts as bank_account
    where bank_account.id = p_bank_account_id
      and bank_account.is_active = true
  ) then
    raise exception 'Opening Balance requires an active bank account';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Opening Balance currency must be a three-letter uppercase code';
  end if;
  if p_as_of is null or p_as_of > now() then
    raise exception 'Opening Balance timestamp must not be in the future';
  end if;

  v_bangkok_date := (p_as_of at time zone 'Asia/Bangkok')::date;
  if p_as_of is distinct from public.finance_bangkok_completed_day_end(v_bangkok_date) then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_END_OF_DAY_REQUIRED';
  end if;

  if p_balance_amount is null or p_balance_amount <> round(p_balance_amount, 2) then
    raise exception 'Opening Balance amount is required and must use no more than two decimal places';
  end if;
end;
$finance_opening_balance_input_guard$;

create or replace function public.assert_finance_opening_balance_has_no_unposted_payments(
  p_bank_account_id uuid,
  p_currency text,
  p_as_of timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_opening_unposted_payment_guard$
declare
  v_cutoff_date date;
begin
  if p_bank_account_id is null or p_currency is null or p_as_of is null then
    raise exception 'Opening Balance cutoff guard requires account, currency, and timestamp';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_cash_cutover:' || p_currency, 0)
  );
  v_cutoff_date := (p_as_of at time zone 'Asia/Bangkok')::date;

  if exists (
    select 1
    from public.finance_payments as payment
    where payment.status = 'confirmed'
      and payment.cash_amount > 0
      and payment.receiving_bank_account_id = p_bank_account_id
      and payment.currency = p_currency
      and payment.received_on > v_cutoff_date
      and not exists (
        select 1
        from public.finance_cash_transactions as cash_transaction
        where cash_transaction.source_payment_id = payment.id
          and cash_transaction.reversal_of_transaction_id is null
      )
  ) then
    raise exception using message = 'FINANCE_CASH_UNPOSTED_PAYMENT_AFTER_CUTOVER';
  end if;
end;
$finance_opening_unposted_payment_guard$;

create or replace function public.post_confirmed_payment_to_finance_cash_transaction(
  p_payment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $post_confirmed_payment_cash$
declare
  v_payment public.finance_payments%rowtype;
  v_opening_balance public.finance_account_opening_balances%rowtype;
  v_existing_cash public.finance_cash_transactions%rowtype;
  v_cash_transaction_id uuid;
  v_cutoff_date date;
  v_occurred_at timestamptz;
begin
  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found for Finance Cash posting';
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'Finance Cash posting requires a Confirmed Payment';
  end if;
  if v_payment.received_on is null then
    raise exception 'Confirmed Payment received date is unavailable for Finance Cash posting';
  end if;
  if v_payment.cash_amount = 0 then
    return jsonb_build_object(
      'outcome', 'not_required_zero_cash',
      'wht_excluded_from_cash_posting', true
    );
  end if;
  if v_payment.cash_amount < 0 then
    raise exception 'Confirmed Payment cash amount is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance_cash_cutover:' || v_payment.currency, 0)
  );

  if v_payment.receiving_bank_account_id is null then
    if exists (
      select 1
      from public.finance_account_opening_balances as opening_balance
      where opening_balance.currency = v_payment.currency
        and opening_balance.status = 'confirmed'
    ) then
      raise exception using message = 'FINANCE_CASH_RECEIVING_ACCOUNT_REQUIRED';
    end if;

    return jsonb_build_object(
      'outcome', 'pre_cutover_no_opening',
      'wht_excluded_from_cash_posting', true
    );
  end if;

  perform 1
  from public.finance_bank_accounts as bank_account
  where bank_account.id = v_payment.receiving_bank_account_id
    and bank_account.is_active = true
  for update;

  if not found then
    raise exception 'Selected receiving bank account is not active';
  end if;

  select *
  into v_existing_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null
  for update;

  if v_existing_cash.id is not null then
    if v_existing_cash.status <> 'confirmed'
      or v_existing_cash.transaction_type <> 'customer_payment'
      or v_existing_cash.direction <> 'inflow'
      or v_existing_cash.cash_amount <> v_payment.cash_amount
      or v_existing_cash.currency <> v_payment.currency
      or v_existing_cash.bank_account_id <> v_payment.receiving_bank_account_id
    then
      raise exception 'Existing Payment-linked Finance Cash Transaction is inconsistent';
    end if;

    return jsonb_build_object(
      'outcome', 'posted',
      'cash_transaction_id', v_existing_cash.id,
      'cash_amount', v_existing_cash.cash_amount,
      'bank_account_id', v_existing_cash.bank_account_id,
      'currency', v_existing_cash.currency,
      'received_on', v_payment.received_on,
      'occurred_at', v_existing_cash.occurred_at,
      'wht_excluded_from_cash_posting', true,
      'idempotent_existing_row', true
    );
  end if;

  select *
  into v_opening_balance
  from public.finance_account_opening_balances as opening_balance
  where opening_balance.bank_account_id = v_payment.receiving_bank_account_id
    and opening_balance.currency = v_payment.currency
    and opening_balance.status = 'confirmed'
  for update;

  if v_opening_balance.id is null then
    return jsonb_build_object(
      'outcome', 'pre_cutover_no_opening',
      'bank_account_id', v_payment.receiving_bank_account_id,
      'currency', v_payment.currency,
      'wht_excluded_from_cash_posting', true
    );
  end if;

  v_cutoff_date := (v_opening_balance.as_of at time zone 'Asia/Bangkok')::date;
  if v_payment.received_on <= v_cutoff_date then
    return jsonb_build_object(
      'outcome', 'pre_cutover_date',
      'bank_account_id', v_payment.receiving_bank_account_id,
      'currency', v_payment.currency,
      'received_on', v_payment.received_on,
      'cutoff_date', v_cutoff_date,
      'wht_excluded_from_cash_posting', true
    );
  end if;

  if v_payment.currency !~ '^[A-Z]{3}$' then
    raise exception 'Payment currency is incompatible with Finance Cash Transaction currency';
  end if;

  -- Payment stores an authoritative date, not an actual clock time. This is
  -- the accounting-effective end of that Bangkok date for deterministic
  -- ordering only; it must not be presented as the real receipt time.
  v_occurred_at := public.finance_bangkok_completed_day_end(v_payment.received_on);
  if v_occurred_at <= v_opening_balance.as_of then
    raise exception using message = 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER';
  end if;

  insert into public.finance_cash_transactions (
    occurred_at,
    direction,
    transaction_type,
    bank_account_id,
    cash_amount,
    currency,
    status,
    source_payment_id,
    reference_no,
    description,
    note,
    created_by_user_id,
    updated_by_user_id,
    confirmed_at,
    confirmed_by_user_id
  ) values (
    v_occurred_at,
    'inflow',
    'customer_payment',
    v_payment.receiving_bank_account_id,
    v_payment.cash_amount,
    v_payment.currency,
    'confirmed',
    v_payment.id,
    coalesce(v_payment.external_transaction_reference, v_payment.internal_reference),
    'Automatically created from Confirmed Payment cash',
    null,
    v_payment.confirmed_by_user_id,
    v_payment.confirmed_by_user_id,
    v_payment.confirmed_at,
    v_payment.confirmed_by_user_id
  )
  returning id into v_cash_transaction_id;

  perform public.record_finance_cash_transaction_audit_event(
    v_cash_transaction_id,
    'confirmed',
    jsonb_build_object(
      'automatic_source', 'payment',
      'source_payment_id', v_payment.id,
      'payment_confirmer_user_id', v_payment.confirmed_by_user_id,
      'cash_amount', v_payment.cash_amount,
      'wht_amount_excluded', v_payment.wht_amount,
      'bank_account_id', v_payment.receiving_bank_account_id,
      'currency', v_payment.currency,
      'received_on', v_payment.received_on,
      'accounting_effective_occurred_at', v_occurred_at,
      'opening_balance_id', v_opening_balance.id,
      'opening_balance_as_of', v_opening_balance.as_of,
      'confirmed_creation', true
    )
  );

  return jsonb_build_object(
    'outcome', 'posted',
    'cash_transaction_id', v_cash_transaction_id,
    'cash_amount', v_payment.cash_amount,
    'bank_account_id', v_payment.receiving_bank_account_id,
    'currency', v_payment.currency,
    'received_on', v_payment.received_on,
    'occurred_at', v_occurred_at,
    'wht_excluded_from_cash_posting', true,
    'idempotent_existing_row', false
  );
end;
$post_confirmed_payment_cash$;

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

create or replace function public.confirm_finance_account_opening_balance(
  p_opening_balance_id uuid,
  p_independent_balance_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $confirm_finance_opening_balance$
declare
  v_candidate public.finance_account_opening_balances%rowtype;
  v_opening_balance public.finance_account_opening_balances%rowtype;
  v_prior public.finance_account_opening_balances%rowtype;
begin
  if not public.current_user_can_confirm_finance_cash_transactions() then
    raise exception 'Not allowed to confirm Opening Balance';
  end if;
  if p_independent_balance_acknowledged is distinct from true then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_ACKNOWLEDGEMENT_REQUIRED';
  end if;
  if p_opening_balance_id is null then
    raise exception 'Opening Balance Draft is required';
  end if;

  select *
  into v_candidate
  from public.finance_account_opening_balances
  where id = p_opening_balance_id;

  if v_candidate.id is null then
    raise exception 'Opening Balance Draft not found';
  end if;
  if v_candidate.status <> 'draft' then
    raise exception 'Only a Draft Opening Balance can be confirmed';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_candidate.bank_account_id) then
    raise exception 'Not allowed to confirm this bank account';
  end if;

  -- Acquire the currency cutoff lock before the Opening Balance row lock.
  -- Payment posting uses the same order, preventing an Opening/Payment
  -- deadlock while still serializing classification against confirmation.
  perform public.assert_finance_opening_balance_has_no_unposted_payments(
    v_candidate.bank_account_id,
    v_candidate.currency,
    v_candidate.as_of
  );

  select *
  into v_opening_balance
  from public.finance_account_opening_balances
  where id = p_opening_balance_id
  for update;

  if v_opening_balance.id is null then
    raise exception 'Opening Balance Draft not found';
  end if;
  if v_opening_balance.status <> 'draft' then
    raise exception 'Only a Draft Opening Balance can be confirmed';
  end if;
  if v_opening_balance.bank_account_id is distinct from v_candidate.bank_account_id
    or v_opening_balance.currency is distinct from v_candidate.currency
    or v_opening_balance.as_of is distinct from v_candidate.as_of
  then
    raise exception 'Opening Balance Draft changed during confirmation; retry';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = v_opening_balance.bank_account_id
  for update;

  perform public.assert_finance_opening_balance_input(
    v_opening_balance.bank_account_id,
    v_opening_balance.currency,
    v_opening_balance.as_of,
    v_opening_balance.balance_amount
  );

  if v_opening_balance.supersedes_opening_balance_id is not null then
    select *
    into v_prior
    from public.finance_account_opening_balances
    where id = v_opening_balance.supersedes_opening_balance_id
    for update;

    if v_prior.id is null
      or v_prior.status <> 'confirmed'
      or v_prior.bank_account_id <> v_opening_balance.bank_account_id
      or v_prior.currency <> v_opening_balance.currency
      or v_prior.as_of >= v_opening_balance.as_of
    then
      raise exception 'Replacement Opening Balance no longer matches the current confirmed evidence';
    end if;

    update public.finance_account_opening_balances
    set
      status = 'superseded',
      superseded_at = now(),
      superseded_by_user_id = auth.uid(),
      updated_at = now(),
      updated_by_user_id = auth.uid()
    where id = v_prior.id;
  elsif exists (
    select 1
    from public.finance_account_opening_balances
    where bank_account_id = v_opening_balance.bank_account_id
      and currency = v_opening_balance.currency
      and status = 'confirmed'
      and id <> v_opening_balance.id
  ) then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_CONFLICT';
  end if;

  update public.finance_account_opening_balances
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = auth.uid(),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_opening_balance.id;

  if v_prior.id is not null then
    perform public.record_finance_opening_balance_audit_event(
      v_prior.id,
      'superseded',
      jsonb_build_object(
        'replacement_opening_balance_id', v_opening_balance.id,
        'replacement_as_of', v_opening_balance.as_of
      )
    );
  end if;

  perform public.record_finance_opening_balance_audit_event(
    v_opening_balance.id,
    'confirmed',
    jsonb_build_object(
      'bank_account_id', v_opening_balance.bank_account_id,
      'currency', v_opening_balance.currency,
      'as_of', v_opening_balance.as_of,
      'cutoff_bangkok_date', (v_opening_balance.as_of at time zone 'Asia/Bangkok')::date,
      'balance_amount', v_opening_balance.balance_amount,
      'independently_verified_actual_balance_acknowledged', true,
      'is_replacement', v_opening_balance.supersedes_opening_balance_id is not null,
      'historical_unposted_payment_guard_passed', true,
      'legacy_balance_used', false
    )
  );

  return v_opening_balance.id;
end;
$confirm_finance_opening_balance$;

create or replace function public.confirm_finance_payment(
  p_payment_id uuid,
  p_confirmation_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $confirm_payment$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_allocation_count integer;
  v_cash_posting jsonb;
begin
  if not public.current_user_can_confirm_finance_payments() then
    raise exception 'Not allowed to confirm Payment';
  end if;
  if coalesce(p_confirmation_acknowledged, false) is not true then
    raise exception 'Explicit Payment confirmation is required';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;
  if v_payment.status = 'confirmed' then
    return v_payment.id;
  end if;
  if v_payment.status <> 'draft' then
    raise exception 'Only a Draft Payment can be confirmed';
  end if;
  if v_payment.received_on is null then
    raise exception 'Actual Payment received date is required';
  end if;
  if v_payment.received_on > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'Actual Payment received date cannot be in the future';
  end if;
  if v_payment.payment_method is null then
    raise exception 'Payment method is required';
  end if;
  if v_payment.settlement_amount <= 0 then
    raise exception 'Payment settlement must be positive';
  end if;
  if v_payment.receiving_bank_account_id is not null and not exists (
    select 1
    from public.finance_bank_accounts
    where id = v_payment.receiving_bank_account_id
      and is_active = true
  ) then
    raise exception 'Selected receiving bank account is not active';
  end if;
  if v_payment.payment_method = 'bank_transfer'
    and v_payment.receiving_bank_account_id is null
  then
    raise exception 'Receiving bank account is required for bank transfer';
  end if;

  select count(*)::integer
  into v_allocation_count
  from public.finance_payment_invoice_allocations
  where payment_id = v_payment.id;

  if v_allocation_count = 0 then
    raise exception 'Payment requires at least one Invoice allocation';
  end if;

  for v_invoice_id in
    select allocation.invoice_id
    from public.finance_payment_invoice_allocations as allocation
    where allocation.payment_id = v_payment.id
    order by allocation.invoice_id
  loop
    perform 1
    from public.finance_invoices
    where id = v_invoice_id
    for update;
  end loop;

  perform public.validate_finance_payment_integrity(v_payment.id);

  update public.finance_payments
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = auth.uid(),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_payment.id;

  v_cash_posting := public.post_confirmed_payment_to_finance_cash_transaction(v_payment.id);

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'confirmed',
    jsonb_build_object(
      'received_on', v_payment.received_on,
      'payment_method', v_payment.payment_method,
      'cash_amount', v_payment.cash_amount,
      'wht_amount', v_payment.wht_amount,
      'settlement_amount', v_payment.settlement_amount,
      'allocation_count', v_allocation_count,
      'cash_posting_outcome', v_cash_posting->>'outcome',
      'cash_transaction_id', v_cash_posting->>'cash_transaction_id',
      'cash_amount_posted', v_cash_posting->>'cash_amount',
      'cash_receiving_bank_account_id', v_cash_posting->>'bank_account_id',
      'cash_currency', v_cash_posting->>'currency',
      'cash_accounting_effective_occurred_at', v_cash_posting->>'occurred_at',
      'wht_excluded_from_cash_posting', true,
      'ledger_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'compensation_created', false
    )
  );

  return v_payment.id;
end;
$confirm_payment$;

revoke all on function public.finance_bangkok_completed_day_end(date)
  from public, anon, authenticated;
revoke all on function public.assert_finance_opening_balance_has_no_unposted_payments(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.post_confirmed_payment_to_finance_cash_transaction(uuid)
  from public, anon, authenticated;
revoke all on function public.assert_finance_opening_balance_input(uuid, text, timestamptz, numeric)
  from public, anon, authenticated;
revoke all on function public.assert_finance_payment_has_no_downstream_dependencies(uuid)
  from public, anon, authenticated;

revoke all on function public.confirm_finance_account_opening_balance(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.confirm_finance_account_opening_balance(uuid, boolean)
  to authenticated;
revoke all on function public.confirm_finance_payment(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.confirm_finance_payment(uuid, boolean)
  to authenticated;

do $payment_cash_integration_security_check$
declare
  v_expected_owner oid;
  v_function_count integer;
begin
  select proowner
  into v_expected_owner
  from pg_proc
  where oid = 'public.confirm_finance_payment(uuid,boolean)'::regprocedure;

  select count(*)::integer
  into v_function_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.finance_bangkok_completed_day_end(date)'::regprocedure,
    'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
    'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure,
    'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure,
    'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'public.confirm_finance_payment(uuid,boolean)'::regprocedure
  );

  if v_function_count <> 7 or exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.finance_bangkok_completed_day_end(date)'::regprocedure,
      'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
      'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure,
      'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure,
      'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
      'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure
    )
      and (
        function_record.proowner <> v_expected_owner
        or not function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Payment to Finance Cash functions require one trusted owner, SECURITY DEFINER, and fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.finance_bangkok_completed_day_end(date)'::regprocedure,
      'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
      'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure,
      'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure,
      'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure
    )
      and (
        has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Payment to Finance Cash internal helpers must not be browser-executable';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.confirm_finance_payment(uuid,boolean)'::regprocedure,
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.confirm_finance_payment(uuid,boolean)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Payment and Opening Balance confirmation RPC grants are incorrect';
  end if;
end;
$payment_cash_integration_security_check$;

do $payment_cash_integration_postcondition$
begin
  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or exists (select 1 from public.finance_cash_transaction_audit_events)
    or exists (select 1 from public.finance_account_opening_balance_audit_events)
  then
    raise exception 'Migration 027 must not create Finance Cash or Opening Balance business data';
  end if;

  if exists (
    select 1
    from public.finance_cash_transactions
    where source_payment_id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
  ) then
    raise exception 'Migration 027 must not backfill existing Confirmed UAT Payments';
  end if;
end;
$payment_cash_integration_postcondition$;

comment on function public.finance_bangkok_completed_day_end(date) is
  'Internal accounting-effective end of one Bangkok calendar date. It is not an assertion of an actual event clock time.';
comment on function public.post_confirmed_payment_to_finance_cash_transaction(uuid) is
  'Internal idempotent consequence of Payment confirmation. It posts actual cash only after account cutover and excludes WHT.';
comment on function public.assert_finance_opening_balance_has_no_unposted_payments(uuid, text, timestamptz) is
  'Blocks a historical Opening Balance cutoff that would omit already-Confirmed positive-cash Payments.';
comment on function public.confirm_finance_payment(uuid, boolean) is
  'Confirms one Payment and atomically posts one post-cutover Payment-level cash inflow when required; it never posts WHT.';

do $payment_cash_integration_dry_run$
declare
  v_actor_user_id uuid;
  v_primary_bank_account_id uuid;
  v_history_bank_account_id uuid;
  v_source_invoice public.finance_invoices%rowtype;
  v_source_agreement_item public.finance_fee_agreement_items%rowtype;
  v_invoice_ids uuid[] := array[]::uuid[];
  v_installment_id uuid;
  v_installment_item_id uuid;
  v_invoice_id uuid;
  v_payment_no_opening_id uuid;
  v_payment_on_cutoff_id uuid;
  v_payment_post_cutoff_id uuid;
  v_payment_wht_only_id uuid;
  v_payment_accountless_id uuid;
  v_historical_unposted_payment_id uuid;
  v_opening_balance_id uuid;
  v_historical_opening_id uuid;
  v_currency text;
  v_cutoff_date date := (now() at time zone 'Asia/Bangkok')::date - 1;
  v_historical_cutoff_date date := (now() at time zone 'Asia/Bangkok')::date - 2;
  v_cutoff_at timestamptz;
  v_historical_cutoff_at timestamptz;
  v_post_cutoff_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_before_vat numeric(14, 2) := 1000.00;
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
  v_next_installment_no integer;
  v_error_message text;
  v_payment_fingerprint_before text;
  v_ledger_fingerprint_before text;
  v_compensation_fingerprint_before text;
begin
  if (select count(*) from public.finance_cash_transactions) <> 0
    or (select count(*) from public.finance_account_opening_balances) <> 0
    or (select count(*) from public.finance_cash_transaction_audit_events) <> 0
    or (select count(*) from public.finance_account_opening_balance_audit_events) <> 0
  then
    raise exception 'Dry-run requires the verified empty Finance Cash foundation';
  end if;
  if (select count(*) from public.finance_company_ledger) <> 267
    or (select count(*) from public.finance_compensation_batches) <> 33
  then
    raise exception 'Dry-run requires the verified Legacy Ledger and Compensation baselines';
  end if;

  select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
  into v_payment_fingerprint_before
  from public.finance_payments as payment_record
  where payment_record.id in (
    '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
    '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
  );
  select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
  into v_ledger_fingerprint_before
  from public.finance_company_ledger as ledger_record;
  select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
  into v_compensation_fingerprint_before
  from public.finance_compensation_batches as compensation_record;

  select profile.id
  into v_actor_user_id
  from public.user_profiles as profile
  where profile.active = true
    and profile.role = 'admin'
  order by profile.id
  limit 1;

  select invoice.*
  into v_source_invoice
  from public.finance_invoices as invoice
  where invoice.document_status = 'issued'
    and exists (
      select 1
      from public.finance_invoice_items as invoice_item
      where invoice_item.invoice_id = invoice.id
    )
  order by invoice.created_at, invoice.id
  limit 1;

  select agreement_item.*
  into v_source_agreement_item
  from public.finance_invoice_items as invoice_item
  join public.finance_fee_agreement_items as agreement_item
    on agreement_item.id = invoice_item.source_fee_agreement_item_id
  where invoice_item.invoice_id = v_source_invoice.id
  order by invoice_item.sort_order, invoice_item.id
  limit 1;

  v_currency := v_source_invoice.currency;
  v_cutoff_at := public.finance_bangkok_completed_day_end(v_cutoff_date);
  v_historical_cutoff_at := public.finance_bangkok_completed_day_end(v_historical_cutoff_date);
  v_vat := case
    when v_source_agreement_item.vat_applicable
      then round(v_before_vat * v_source_agreement_item.vat_rate / 100, 2)
    else 0
  end;
  v_total := v_before_vat + v_vat;

  select bank_account.id
  into v_primary_bank_account_id
  from public.finance_bank_accounts as bank_account
  where bank_account.is_active = true
    and not exists (
      select 1
      from public.finance_payments as payment
      where payment.status = 'confirmed'
        and payment.cash_amount > 0
        and payment.receiving_bank_account_id = bank_account.id
        and payment.currency = v_currency
        and payment.received_on > v_cutoff_date
    )
  order by bank_account.short_name, bank_account.id
  limit 1;

  select bank_account.id
  into v_history_bank_account_id
  from public.finance_bank_accounts as bank_account
  where bank_account.is_active = true
    and bank_account.id <> v_primary_bank_account_id
  order by bank_account.short_name, bank_account.id
  limit 1;

  if v_actor_user_id is null
    or v_source_invoice.id is null
    or v_source_agreement_item.id is null
    or v_primary_bank_account_id is null
    or v_history_bank_account_id is null
  then
    raise exception 'Dry-run requires one active Admin, one issued Invoice lineage, and two active bank accounts';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);

  select coalesce(max(installment_no), 0) + 100
  into v_next_installment_no
  from public.finance_billing_installments
  where billing_plan_id = v_source_invoice.billing_plan_id;

  for v_index in 0..1 loop
    v_installment_id := gen_random_uuid();
    v_installment_item_id := gen_random_uuid();
    v_invoice_id := gen_random_uuid();

    insert into public.finance_billing_installments (
      id,
      billing_plan_id,
      installment_no,
      sort_order,
      title,
      trigger_type,
      status,
      invoiced_at,
      amount_before_tax,
      vat_amount,
      total_amount,
      created_by_user_id,
      updated_by_user_id
    ) values (
      v_installment_id,
      v_source_invoice.billing_plan_id,
      v_next_installment_no + v_index,
      v_next_installment_no + v_index,
      'ROLLBACK ONLY PAYMENT CASH INTEGRATION',
      'manual',
      'invoiced',
      now(),
      v_before_vat,
      v_vat,
      v_total,
      v_actor_user_id,
      v_actor_user_id
    );

    insert into public.finance_billing_installment_items (
      id,
      billing_installment_id,
      fee_agreement_item_id,
      amount_before_tax,
      vat_amount,
      total_amount,
      sort_order,
      allocation_snapshot_json
    ) values (
      v_installment_item_id,
      v_installment_id,
      v_source_agreement_item.id,
      v_before_vat,
      v_vat,
      v_total,
      0,
      jsonb_build_object('dry_run', true)
    );

    insert into public.finance_invoices (
      id,
      billing_plan_id,
      primary_billing_installment_id,
      fee_agreement_id,
      source_quotation_id,
      client_id,
      case_id,
      advisory_matter_id,
      invoice_no,
      document_status,
      issue_date,
      due_date,
      currency,
      language_code,
      amount_before_vat,
      vat_amount,
      total_amount,
      seller_snapshot_json,
      customer_snapshot_json,
      matter_snapshot_json,
      source_snapshot_json,
      issued_snapshot_json,
      issued_at,
      issued_by_user_id,
      created_by_user_id,
      updated_by_user_id
    ) values (
      v_invoice_id,
      v_source_invoice.billing_plan_id,
      v_installment_id,
      v_source_invoice.fee_agreement_id,
      v_source_invoice.source_quotation_id,
      v_source_invoice.client_id,
      v_source_invoice.case_id,
      v_source_invoice.advisory_matter_id,
      'ROLLBACK-5DD-' || v_index::text || '-' || txid_current()::text,
      'issued',
      v_post_cutoff_date,
      v_post_cutoff_date,
      v_currency,
      v_source_invoice.language_code,
      v_before_vat,
      v_vat,
      v_total,
      jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true),
      jsonb_build_object('dry_run', true),
      now(),
      v_actor_user_id,
      v_actor_user_id,
      v_actor_user_id
    );

    insert into public.finance_invoice_items (
      invoice_id,
      source_fee_agreement_item_id,
      source_billing_installment_item_id,
      description,
      source_quantity,
      source_unit_price,
      allocation_percent,
      vat_applicable,
      vat_rate,
      tax_category,
      price_tax_mode,
      amount_before_vat,
      vat_amount,
      line_total,
      sort_order,
      source_snapshot_json
    ) values (
      v_invoice_id,
      v_source_agreement_item.id,
      v_installment_item_id,
      'ROLLBACK ONLY PAYMENT CASH INTEGRATION',
      null,
      null,
      null,
      v_source_agreement_item.vat_applicable,
      v_source_agreement_item.vat_rate,
      v_source_agreement_item.tax_category,
      null,
      v_before_vat,
      v_vat,
      v_total,
      0,
      jsonb_build_object('dry_run', true)
    );

    insert into public.finance_invoice_installment_allocations (
      invoice_id,
      billing_installment_id,
      allocated_before_vat,
      allocated_vat,
      allocated_total,
      source_snapshot_json
    ) values (
      v_invoice_id,
      v_installment_id,
      v_before_vat,
      v_vat,
      v_total,
      jsonb_build_object('dry_run', true)
    );

    v_invoice_ids := array_append(v_invoice_ids, v_invoice_id);
  end loop;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 10, 0, v_cutoff_date, 'bank_transfer',
    v_primary_bank_account_id, 'ROLLBACK-NO-OPENING', v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_no_opening_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_no_opening_id, v_invoice_ids[1], 10, 0,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_no_opening_id, true);

  if exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_no_opening_id
  ) or not exists (
    select 1 from public.finance_payment_audit_events
    where payment_id = v_payment_no_opening_id
      and event_type = 'confirmed'
      and event_payload_json ->> 'cash_posting_outcome' = 'pre_cutover_no_opening'
  ) then
    raise exception 'No-Opening-Balance Payment classification failed';
  end if;

  select public.create_finance_account_opening_balance_draft(
    v_primary_bank_account_id,
    v_currency,
    v_cutoff_at,
    100000.00,
    'ROLLBACK-ONLY-INDEPENDENT-BANK-EVIDENCE',
    'Rollback-only Payment integration cutoff'
  ) into v_opening_balance_id;
  perform public.confirm_finance_account_opening_balance(v_opening_balance_id, true);

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 10, 0, v_cutoff_date, 'bank_transfer',
    v_primary_bank_account_id, 'ROLLBACK-ON-CUTOFF', v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_on_cutoff_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_on_cutoff_id, v_invoice_ids[1], 10, 0,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_on_cutoff_id, true);

  if exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_on_cutoff_id
  ) or not exists (
    select 1 from public.finance_payment_audit_events
    where payment_id = v_payment_on_cutoff_id
      and event_type = 'confirmed'
      and event_payload_json ->> 'cash_posting_outcome' = 'pre_cutover_date'
  ) then
    raise exception 'On-cutoff Payment classification failed';
  end if;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 9, 1, v_post_cutoff_date, 'bank_transfer',
    v_primary_bank_account_id, 'ROLLBACK-POST-CUTOVER-MULTI', v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_post_cutoff_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values
    (v_payment_post_cutoff_id, v_invoice_ids[1], 4.50, 0.50, v_actor_user_id, v_actor_user_id),
    (v_payment_post_cutoff_id, v_invoice_ids[2], 4.50, 0.50, v_actor_user_id, v_actor_user_id);
  perform public.confirm_finance_payment(v_payment_post_cutoff_id, true);
  perform public.confirm_finance_payment(v_payment_post_cutoff_id, true);

  if (
    select count(*)
    from public.finance_cash_transactions
    where source_payment_id = v_payment_post_cutoff_id
      and reversal_of_transaction_id is null
      and status = 'confirmed'
      and transaction_type = 'customer_payment'
      and direction = 'inflow'
      and cash_amount = 9
      and bank_account_id = v_primary_bank_account_id
      and currency = v_currency
      and occurred_at = public.finance_bangkok_completed_day_end(v_post_cutoff_date)
  ) <> 1 then
    raise exception 'Post-cutover multi-Invoice Payment did not create exactly one cash-only inflow';
  end if;
  if not exists (
    select 1
    from public.finance_cash_transaction_audit_events as audit_event
    join public.finance_cash_transactions as cash_transaction
      on cash_transaction.id = audit_event.cash_transaction_id
    where cash_transaction.source_payment_id = v_payment_post_cutoff_id
      and audit_event.event_type = 'confirmed'
      and audit_event.event_payload_json ->> 'wht_amount_excluded' = '1.00'
      and audit_event.event_payload_json ->> 'automatic_source' = 'payment'
  ) then
    raise exception 'Automatic Payment Cash audit trace is incomplete';
  end if;

  begin
    perform public.reverse_finance_payment(
      v_payment_post_cutoff_id,
      'ROLLBACK ONLY REVERSAL BLOCKER'
    );
    raise exception 'Payment reversal with a Cash Transaction was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_PAYMENT_HAS_CASH_TRANSACTION' then
        raise;
      end if;
  end;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 0, 5, v_post_cutoff_date, 'other',
    null, 'ROLLBACK-WHT-ONLY', v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_wht_only_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_wht_only_id, v_invoice_ids[1], 0, 5,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_wht_only_id, true);

  if exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_wht_only_id
  ) or not exists (
    select 1 from public.finance_payment_audit_events
    where payment_id = v_payment_wht_only_id
      and event_type = 'confirmed'
      and event_payload_json ->> 'cash_posting_outcome' = 'not_required_zero_cash'
  ) then
    raise exception 'WHT-only Payment handling failed';
  end if;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 10, 0, v_post_cutoff_date, 'cash',
    null, 'ROLLBACK-ACCOUNTLESS', v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_accountless_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_accountless_id, v_invoice_ids[1], 10, 0,
    v_actor_user_id, v_actor_user_id
  );

  begin
    perform public.confirm_finance_payment(v_payment_accountless_id, true);
    raise exception 'Post-cutover accountless positive-cash Payment was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_CASH_RECEIVING_ACCOUNT_REQUIRED' then
        raise;
      end if;
  end;
  if not exists (
    select 1 from public.finance_payments
    where id = v_payment_accountless_id and status = 'draft'
  ) then
    raise exception 'Blocked accountless Payment confirmation was not atomic';
  end if;

  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 10, 0, v_cutoff_date, 'bank_transfer',
    v_history_bank_account_id, 'ROLLBACK-HISTORICAL-UNPOSTED', v_actor_user_id, v_actor_user_id
  ) returning id into v_historical_unposted_payment_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_historical_unposted_payment_id, v_invoice_ids[1], 10, 0,
    v_actor_user_id, v_actor_user_id
  );
  update public.finance_payments
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = v_actor_user_id,
    updated_at = now(),
    updated_by_user_id = v_actor_user_id
  where id = v_historical_unposted_payment_id;

  select public.create_finance_account_opening_balance_draft(
    v_history_bank_account_id,
    v_currency,
    v_historical_cutoff_at,
    50000.00,
    'ROLLBACK-ONLY-HISTORICAL-GAP-EVIDENCE',
    'Rollback-only historical Payment cutoff guard'
  ) into v_historical_opening_id;

  begin
    perform public.confirm_finance_account_opening_balance(v_historical_opening_id, true);
    raise exception 'Historical Opening Balance gap was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_CASH_UNPOSTED_PAYMENT_AFTER_CUTOVER' then
        raise;
      end if;
  end;
  if not exists (
    select 1 from public.finance_account_opening_balances
    where id = v_historical_opening_id and status = 'draft'
  ) then
    raise exception 'Blocked historical Opening Balance confirmation was not atomic';
  end if;

  if (
    select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
    from public.finance_payments as payment_record
    where payment_record.id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
  ) is distinct from v_payment_fingerprint_before then
    raise exception 'Dry-run changed an existing confirmed UAT Payment';
  end if;
  if (
    select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
    from public.finance_company_ledger as ledger_record
  ) is distinct from v_ledger_fingerprint_before then
    raise exception 'Dry-run changed Legacy Ledger';
  end if;
  if (
    select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
    from public.finance_compensation_batches as compensation_record
  ) is distinct from v_compensation_fingerprint_before then
    raise exception 'Dry-run changed Compensation';
  end if;
end;
$payment_cash_integration_dry_run$;

set constraints all immediate;

rollback;

select
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_after_rollback,
  (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows_after_rollback,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_after_rollback,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_after_rollback,
  to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)') is null
    as migration_objects_rolled_back,
  (
    (select count(*) from public.finance_cash_transactions) = 0
    and (select count(*) from public.finance_account_opening_balances) = 0
    and (select count(*) from public.finance_cash_transaction_audit_events) = 0
    and (select count(*) from public.finance_account_opening_balance_audit_events) = 0
    and (select count(*) from public.finance_company_ledger) = 267
    and (select count(*) from public.finance_compensation_batches) = 33
    and to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)') is null
  ) as payment_finance_cash_integration_dry_run_pass;
