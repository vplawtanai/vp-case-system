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
