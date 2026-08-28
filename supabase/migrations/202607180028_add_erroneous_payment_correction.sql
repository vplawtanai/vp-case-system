-- Phase 5D-E1: full correction of one factually erroneous Confirmed Payment.
-- This is an append-only record correction, not a customer refund or a
-- Payment-allocation change.

do $erroneous_payment_correction_preflight$
begin
  if to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_payment_invoice_allocations') is null
    or to_regclass('public.finance_payment_audit_events') is null
    or to_regclass('public.finance_cash_transactions') is null
    or to_regclass('public.finance_account_opening_balances') is null
    or to_regclass('public.finance_cash_transaction_audit_events') is null
    or to_regclass('public.finance_account_opening_balance_audit_events') is null
    or to_regclass('public.finance_invoice_settlement_summary') is null
    or to_regprocedure('public.reverse_finance_payment(uuid,text)') is null
    or to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is null
    or to_regprocedure('public.current_user_can_reverse_finance_payments()') is null
    or to_regprocedure('public.current_user_can_reverse_finance_cash_transactions()') is null
    or to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is null
    or to_regprocedure('public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)') is null
    or to_regprocedure('public.validate_finance_payment_integrity(uuid)') is null
    or to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') is null
  then
    raise exception 'Erroneous Payment correction requires Migrations 021, 022, 025, 026, and 027';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'finance_cash_transactions'
      and indexname = 'uq_finance_cash_transactions_source_payment'
      and indexdef ilike '%unique%'
      and indexdef ilike '%source_payment_id%'
  ) or not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'finance_cash_transactions'
      and indexname = 'uq_finance_cash_transactions_reversal'
      and indexdef ilike '%unique%'
      and indexdef ilike '%reversal_of_transaction_id%'
  ) then
    raise exception 'Erroneous Payment correction requires the Cash source and one-reversal-per-original contracts';
  end if;

  if position(
    'FINANCE_PAYMENT_HAS_CASH_TRANSACTION'
    in pg_get_functiondef(
      'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure
    )
  ) = 0 then
    raise exception 'Migration 027 generic Payment reversal Cash blocker is missing';
  end if;

  if to_regprocedure('public.assert_finance_erroneous_payment_correction_dependencies(uuid)') is not null
    or to_regprocedure('public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)') is not null
    or to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is not null
  then
    raise exception 'Erroneous Payment correction function names already exist; inspect partial Production state';
  end if;

  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or exists (select 1 from public.finance_cash_transaction_audit_events)
    or exists (select 1 from public.finance_account_opening_balance_audit_events)
  then
    raise exception 'Migration 028 requires the verified empty pre-cutover Finance Cash state';
  end if;
end;
$erroneous_payment_correction_preflight$;

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

create or replace function public.create_finance_erroneous_payment_cash_correction(
  p_payment_id uuid,
  p_reason text,
  p_corrected_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $erroneous_payment_cash_correction$
declare
  v_payment public.finance_payments%rowtype;
  v_original_cash public.finance_cash_transactions%rowtype;
  v_existing_correction public.finance_cash_transactions%rowtype;
  v_correction_cash_id uuid;
begin
  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null or v_payment.status <> 'confirmed' then
    raise exception 'Cash correction requires the locked Confirmed Payment';
  end if;

  select *
  into v_original_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null
  for update;

  if v_original_cash.id is null then
    return null;
  end if;

  if v_original_cash.status <> 'confirmed'
    or v_original_cash.transaction_type <> 'customer_payment'
    or v_original_cash.direction <> 'inflow'
    or v_original_cash.cash_amount <> v_payment.cash_amount
    or v_original_cash.bank_account_id is distinct from v_payment.receiving_bank_account_id
    or v_original_cash.currency <> v_payment.currency
    or v_original_cash.source_payment_id <> v_payment.id
  then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_LINEAGE_INVALID';
  end if;

  select *
  into v_existing_correction
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.reversal_of_transaction_id = v_original_cash.id
  for update;

  if v_existing_correction.id is not null then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_ALREADY_EXISTS';
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
    reversal_of_transaction_id,
    created_at,
    created_by_user_id,
    updated_at,
    updated_by_user_id,
    confirmed_at,
    confirmed_by_user_id
  ) values (
    v_original_cash.occurred_at,
    'outflow',
    'reversal',
    v_original_cash.bank_account_id,
    v_original_cash.cash_amount,
    v_original_cash.currency,
    'confirmed',
    v_payment.id,
    left('RECORD-CORRECTION:' || coalesce(v_original_cash.reference_no, v_original_cash.id::text), 500),
    'Correction of a factually erroneous Payment cash record; not a customer refund',
    p_reason,
    v_original_cash.id,
    p_corrected_at,
    auth.uid(),
    p_corrected_at,
    auth.uid(),
    p_corrected_at,
    auth.uid()
  )
  returning id into v_correction_cash_id;

  perform public.record_finance_cash_transaction_audit_event(
    v_correction_cash_id,
    'reversal_created',
    jsonb_build_object(
      'semantic_type', 'record_correction',
      'is_customer_refund', false,
      'full_erroneous_payment_correction', true,
      'original_cash_transaction_id', v_original_cash.id,
      'correction_cash_transaction_id', v_correction_cash_id,
      'source_payment_id', v_payment.id,
      'original_cash_amount', v_original_cash.cash_amount,
      'bank_account_id', v_original_cash.bank_account_id,
      'currency', v_original_cash.currency,
      'original_accounting_effective_occurred_at', v_original_cash.occurred_at,
      'correction_accounting_effective_occurred_at', v_original_cash.occurred_at,
      'correction_created_at', p_corrected_at,
      'correction_actor_user_id', auth.uid(),
      'reason', p_reason
    )
  );

  return v_correction_cash_id;
end;
$erroneous_payment_cash_correction$;

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
  if v_reason is null then
    raise exception 'Payment correction reason is required';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'Payment correction reason is too long';
  end if;
  if p_payment_id is null then
    raise exception 'Payment correction requires a Payment';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;

  -- Read the expected lineage for permission branching. The authoritative lock
  -- is acquired after allocated Invoices in the established Payment lock order.
  select *
  into v_original_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null;

  select exists (
    select 1
    from public.user_profiles as profile
    where profile.id = auth.uid()
      and profile.active = true
      and profile.role = 'admin'
  ),
  public.current_user_can_reverse_finance_payments(),
  public.current_user_can_reverse_finance_cash_transactions()
  into v_is_admin, v_payment_reverse_allowed, v_cash_reverse_allowed;

  if v_original_cash.id is null then
    if not v_payment_reverse_allowed then
      raise exception 'Not allowed to correct erroneous Payment';
    end if;
  elsif not (
    v_is_admin
    or (v_payment_reverse_allowed and v_cash_reverse_allowed)
  ) then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED';
  end if;

  if v_payment.status = 'reversed' then
    select count(*)::integer
    into v_completed_audit_count
    from public.finance_payment_audit_events as audit_event
    where audit_event.payment_id = v_payment.id
      and audit_event.event_type = 'reversed'
      and audit_event.event_payload_json ->> 'correction_workflow' = 'full_erroneous_payment'
      and audit_event.event_payload_json ->> 'correction_completed' = 'true';

    if v_completed_audit_count <> 1 then
      raise exception using message = 'FINANCE_PAYMENT_CORRECTION_AMBIGUOUS_REVERSED_PAYMENT';
    end if;

    if v_original_cash.id is not null then
      select *
      into v_existing_correction
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

  select *
  into v_original_cash
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment.id
    and cash_transaction.reversal_of_transaction_id is null
  for update;

  if v_original_cash.id is not null and not (
    v_is_admin
    or (v_payment_reverse_allowed and v_cash_reverse_allowed)
  ) then
    raise exception using message = 'FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED';
  end if;

  perform public.validate_finance_payment_integrity(v_payment.id);
  perform public.assert_finance_erroneous_payment_correction_dependencies(v_payment.id);

  v_correction_cash_id := public.create_finance_erroneous_payment_cash_correction(
    v_payment.id,
    v_reason,
    v_corrected_at
  );

  update public.finance_payments
  set
    status = 'reversed',
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

revoke all on function public.assert_finance_erroneous_payment_correction_dependencies(uuid)
  from public, anon, authenticated;
revoke all on function public.create_finance_erroneous_payment_cash_correction(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.correct_erroneous_finance_payment(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.correct_erroneous_finance_payment(uuid, text, boolean)
  to authenticated;

do $erroneous_payment_correction_security_check$
declare
  v_expected_owner oid;
  v_function_count integer;
begin
  select proowner
  into v_expected_owner
  from pg_proc
  where oid = 'public.reverse_finance_payment(uuid,text)'::regprocedure;

  select count(*)::integer
  into v_function_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
    'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
    'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure
  );

  if v_function_count <> 3 or exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
      'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure
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
    raise exception 'Erroneous Payment correction functions require the trusted Payment owner, SECURITY DEFINER, and fixed search_path=public';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Erroneous Payment correction internal helpers must not be browser-executable';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Erroneous Payment correction external RPC grants are incorrect';
  end if;
end;
$erroneous_payment_correction_security_check$;

do $erroneous_payment_correction_postcondition$
begin
  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or exists (select 1 from public.finance_cash_transaction_audit_events)
    or exists (select 1 from public.finance_account_opening_balance_audit_events)
  then
    raise exception 'Migration 028 must not create Payment correction or Finance Cash business data';
  end if;

  if exists (
    select 1
    from public.finance_cash_transactions
    where source_payment_id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
  ) then
    raise exception 'Migration 028 must not backfill or correct existing UAT Payments';
  end if;
end;
$erroneous_payment_correction_postcondition$;

comment on function public.correct_erroneous_finance_payment(uuid, text, boolean) is
  'Explicit full correction of one factually erroneous Confirmed Payment. It is not a refund or Invoice reallocation workflow.';
comment on function public.create_finance_erroneous_payment_cash_correction(uuid, text, timestamptz) is
  'Internal append-only Cash record correction using the original accounting-effective timestamp; never an operational refund outflow.';
