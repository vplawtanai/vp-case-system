begin;

-- Migration 028 is embedded byte-for-byte below for transactional validation.
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

do $erroneous_payment_correction_dry_run$
declare
  v_actor_user_id uuid;
  v_limited_user_id uuid;
  v_limited_payment_reverse_before boolean;
  v_limited_cash_reverse_before boolean;
  v_bank_account_id uuid;
  v_source_invoice public.finance_invoices%rowtype;
  v_source_agreement_item public.finance_fee_agreement_items%rowtype;
  v_invoice_ids uuid[] := array[]::uuid[];
  v_installment_id uuid;
  v_installment_item_id uuid;
  v_invoice_id uuid;
  v_payment_no_cash_id uuid;
  v_payment_with_cash_id uuid;
  v_payment_limited_authority_id uuid;
  v_original_cash_id uuid;
  v_correction_cash_id uuid;
  v_opening_balance_id uuid;
  v_currency text;
  v_cutoff_date date := (now() at time zone 'Asia/Bangkok')::date - 1;
  v_post_cutoff_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_cutoff_at timestamptz;
  v_before_vat numeric(14, 2) := 20000.00;
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
  v_next_installment_no integer;
  v_error_message text;
  v_retry_payment_id uuid;
  v_allocation_fingerprint_before text;
  v_allocation_fingerprint_after text;
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

  select
    profile.id,
    profile.can_reverse_finance_payments,
    profile.can_reverse_finance_cash_transactions
  into
    v_limited_user_id,
    v_limited_payment_reverse_before,
    v_limited_cash_reverse_before
  from public.user_profiles as profile
  where profile.active = true
    and profile.role <> 'admin'
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
  v_vat := case
    when v_source_agreement_item.vat_applicable
      then round(v_before_vat * v_source_agreement_item.vat_rate / 100, 2)
    else 0
  end;
  v_total := v_before_vat + v_vat;

  select bank_account.id
  into v_bank_account_id
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

  if v_actor_user_id is null
    or v_limited_user_id is null
    or v_source_invoice.id is null
    or v_source_agreement_item.id is null
    or v_bank_account_id is null
  then
    raise exception 'Dry-run requires one active Admin, one active non-Admin, one issued Invoice lineage, and one eligible active bank account';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);

  select coalesce(max(installment_no), 0) + 100
  into v_next_installment_no
  from public.finance_billing_installments
  where billing_plan_id = v_source_invoice.billing_plan_id;

  for v_index in 0..2 loop
    v_installment_id := gen_random_uuid();
    v_installment_item_id := gen_random_uuid();
    v_invoice_id := gen_random_uuid();

    insert into public.finance_billing_installments (
      id, billing_plan_id, installment_no, sort_order, title, trigger_type,
      status, invoiced_at, amount_before_tax, vat_amount, total_amount,
      created_by_user_id, updated_by_user_id
    ) values (
      v_installment_id,
      v_source_invoice.billing_plan_id,
      v_next_installment_no + v_index,
      v_next_installment_no + v_index,
      'ROLLBACK ONLY ERRONEOUS PAYMENT CORRECTION',
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
      id, billing_installment_id, fee_agreement_item_id, amount_before_tax,
      vat_amount, total_amount, sort_order, allocation_snapshot_json
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
      id, billing_plan_id, primary_billing_installment_id, fee_agreement_id,
      source_quotation_id, client_id, case_id, advisory_matter_id, invoice_no,
      document_status, issue_date, due_date, currency, language_code,
      amount_before_vat, vat_amount, total_amount, seller_snapshot_json,
      customer_snapshot_json, matter_snapshot_json, source_snapshot_json,
      issued_snapshot_json, issued_at, issued_by_user_id, created_by_user_id,
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
      'ROLLBACK-5DE1-' || v_index::text || '-' || txid_current()::text,
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
      invoice_id, source_fee_agreement_item_id, source_billing_installment_item_id,
      description, source_quantity, source_unit_price, allocation_percent,
      vat_applicable, vat_rate, tax_category, price_tax_mode, amount_before_vat,
      vat_amount, line_total, sort_order, source_snapshot_json
    ) values (
      v_invoice_id,
      v_source_agreement_item.id,
      v_installment_item_id,
      'ROLLBACK ONLY ERRONEOUS PAYMENT CORRECTION',
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
      invoice_id, billing_installment_id, allocated_before_vat, allocated_vat,
      allocated_total, source_snapshot_json
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

  -- No Opening Balance: the entire Payment settlement is invalidated without
  -- inventing a Cash correction row.
  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 1000, 0, v_post_cutoff_date,
    'bank_transfer', v_bank_account_id, 'ROLLBACK-CORRECTION-NO-CASH',
    v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_no_cash_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_no_cash_id, v_invoice_ids[1], 1000, 0,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_no_cash_id, true);

  if exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_no_cash_id
  ) or not exists (
    select 1 from public.finance_invoice_settlement_summary
    where invoice_id = v_invoice_ids[1]
      and economically_settled_amount = 1000
  ) then
    raise exception 'Pre-cutover correction setup did not create the expected settlement-only Payment';
  end if;

  perform public.correct_erroneous_finance_payment(
    v_payment_no_cash_id,
    'ROLLBACK ONLY ENTIRE PRE-CUTOVER PAYMENT WAS FACTUALLY WRONG',
    true
  );

  if not exists (
    select 1 from public.finance_payments
    where id = v_payment_no_cash_id
      and status = 'reversed'
  ) or exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_no_cash_id
  ) or not exists (
    select 1 from public.finance_invoice_settlement_summary
    where invoice_id = v_invoice_ids[1]
      and economically_settled_amount = 0
      and outstanding_amount = v_total
  ) then
    raise exception 'Pre-cutover full Payment correction did not reopen settlement without Cash mutation';
  end if;

  select public.create_finance_account_opening_balance_draft(
    v_bank_account_id,
    v_currency,
    v_cutoff_at,
    100000.00,
    'ROLLBACK-ONLY-CORRECTION-CUTOFF-EVIDENCE',
    'Rollback-only erroneous Payment correction cutoff'
  ) into v_opening_balance_id;
  perform public.confirm_finance_account_opening_balance(v_opening_balance_id, true);

  -- Post-cutover 9,700 Cash + 300 WHT: only the 9,700 Cash fact receives an
  -- opposite correction, while all 10,000 settlement ceases to be effective.
  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 9700, 300, v_post_cutoff_date,
    'bank_transfer', v_bank_account_id, 'ROLLBACK-CORRECTION-WITH-CASH',
    v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_with_cash_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_with_cash_id, v_invoice_ids[2], 9700, 300,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_with_cash_id, true);

  select cash_transaction.id
  into v_original_cash_id
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id = v_payment_with_cash_id
    and cash_transaction.reversal_of_transaction_id is null;

  if v_original_cash_id is null or not exists (
    select 1 from public.finance_invoice_settlement_summary
    where invoice_id = v_invoice_ids[2]
      and economically_settled_amount = 10000
  ) then
    raise exception 'Post-cutover correction setup did not create the expected Cash and settlement facts';
  end if;

  begin
    perform public.reverse_finance_payment(
      v_payment_with_cash_id,
      'ROLLBACK ONLY GENERIC REVERSAL MUST STAY BLOCKED'
    );
    raise exception 'Generic Payment reversal unexpectedly bypassed the Cash dependency blocker';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_PAYMENT_HAS_CASH_TRANSACTION' then
        raise;
      end if;
  end;

  begin
    perform public.correct_erroneous_finance_payment(
      v_payment_with_cash_id,
      'ROLLBACK ONLY ACKNOWLEDGEMENT TEST',
      false
    );
    raise exception 'Correction without acknowledgement was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_PAYMENT_CORRECTION_ACK_REQUIRED' then
        raise;
      end if;
  end;

  begin
    perform public.correct_erroneous_finance_payment(v_payment_with_cash_id, ' ', true);
    raise exception 'Correction without a reason was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'Payment correction reason is required' then
        raise;
      end if;
  end;

  select md5(jsonb_agg(to_jsonb(allocation) order by allocation.id)::text)
  into v_allocation_fingerprint_before
  from public.finance_payment_invoice_allocations as allocation
  where allocation.payment_id = v_payment_with_cash_id;

  perform public.correct_erroneous_finance_payment(
    v_payment_with_cash_id,
    'ROLLBACK ONLY ENTIRE PAYMENT AND RECEIPT FACT WERE WRONG',
    true
  );

  select cash_transaction.id
  into v_correction_cash_id
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.reversal_of_transaction_id = v_original_cash_id;

  select md5(jsonb_agg(to_jsonb(allocation) order by allocation.id)::text)
  into v_allocation_fingerprint_after
  from public.finance_payment_invoice_allocations as allocation
  where allocation.payment_id = v_payment_with_cash_id;

  if not exists (
    select 1
    from public.finance_cash_transactions as correction
    join public.finance_cash_transactions as original
      on original.id = correction.reversal_of_transaction_id
    where correction.id = v_correction_cash_id
      and original.id = v_original_cash_id
      and correction.status = 'confirmed'
      and correction.transaction_type = 'reversal'
      and correction.direction = 'outflow'
      and correction.cash_amount = 9700
      and correction.cash_amount = original.cash_amount
      and correction.bank_account_id = original.bank_account_id
      and correction.currency = original.currency
      and correction.source_payment_id = v_payment_with_cash_id
      and correction.occurred_at = original.occurred_at
  ) or (
    select count(*) from public.finance_cash_transactions
    where source_payment_id = v_payment_with_cash_id
  ) <> 2 or exists (
    select 1 from public.finance_cash_transactions
    where source_payment_id = v_payment_with_cash_id
      and cash_amount = 300
  ) or not exists (
    select 1 from public.finance_payments
    where id = v_payment_with_cash_id
      and status = 'reversed'
      and cash_amount = 9700
      and wht_amount = 300
      and settlement_amount = 10000
  ) or not exists (
    select 1 from public.finance_invoice_settlement_summary
    where invoice_id = v_invoice_ids[2]
      and economically_settled_amount = 0
      and outstanding_amount = v_total
  ) or v_allocation_fingerprint_after is distinct from v_allocation_fingerprint_before
  then
    raise exception 'Coordinated full Payment correction contract failed';
  end if;

  if not exists (
    select 1
    from public.finance_cash_account_balance_summary as balance_summary
    where balance_summary.bank_account_id = v_bank_account_id
      and balance_summary.currency = v_currency
      and balance_summary.current_balance = 100000.00
  ) then
    raise exception 'Same-effective-time Cash correction did not neutralize the false inflow';
  end if;

  if not exists (
    select 1
    from public.finance_cash_transaction_audit_events as audit_event
    where audit_event.cash_transaction_id = v_correction_cash_id
      and audit_event.event_type = 'reversal_created'
      and audit_event.event_payload_json ->> 'semantic_type' = 'record_correction'
      and audit_event.event_payload_json ->> 'is_customer_refund' = 'false'
      and audit_event.event_payload_json ->> 'source_payment_id' = v_payment_with_cash_id::text
      and audit_event.event_payload_json ->> 'original_cash_amount' = '9700.00'
  ) or not exists (
    select 1
    from public.finance_payment_audit_events as audit_event
    where audit_event.payment_id = v_payment_with_cash_id
      and audit_event.event_type = 'reversed'
      and audit_event.event_payload_json ->> 'correction_workflow' = 'full_erroneous_payment'
      and audit_event.event_payload_json ->> 'correction_completed' = 'true'
      and audit_event.event_payload_json ->> 'customer_refund_recorded' = 'false'
      and audit_event.event_payload_json ->> 'payment_reallocation_performed' = 'false'
      and audit_event.event_payload_json ->> 'wht_amount_invalidated' = '300.00'
  ) then
    raise exception 'Correction audit evidence is incomplete or semantically ambiguous';
  end if;

  select public.correct_erroneous_finance_payment(
    v_payment_with_cash_id,
    'ROLLBACK ONLY SAFE RETRY',
    true
  ) into v_retry_payment_id;

  if v_retry_payment_id <> v_payment_with_cash_id
    or (select count(*) from public.finance_cash_transactions where reversal_of_transaction_id = v_original_cash_id) <> 1
    or (
      select count(*)
      from public.finance_payment_audit_events
      where payment_id = v_payment_with_cash_id
        and event_type = 'reversed'
        and event_payload_json ->> 'correction_workflow' = 'full_erroneous_payment'
    ) <> 1
  then
    raise exception 'Correction retry was not idempotent';
  end if;

  -- A user holding only Payment reverse authority cannot alter post-cutover
  -- authoritative Cash history.
  insert into public.finance_payments (
    client_id, currency, cash_amount, wht_amount, received_on, payment_method,
    receiving_bank_account_id, internal_reference, created_by_user_id, updated_by_user_id
  ) values (
    v_source_invoice.client_id, v_currency, 100, 0, v_post_cutoff_date,
    'bank_transfer', v_bank_account_id, 'ROLLBACK-LIMITED-CORRECTION-AUTHORITY',
    v_actor_user_id, v_actor_user_id
  ) returning id into v_payment_limited_authority_id;
  insert into public.finance_payment_invoice_allocations (
    payment_id, invoice_id, cash_allocated, wht_credit_allocated,
    created_by_user_id, updated_by_user_id
  ) values (
    v_payment_limited_authority_id, v_invoice_ids[3], 100, 0,
    v_actor_user_id, v_actor_user_id
  );
  perform public.confirm_finance_payment(v_payment_limited_authority_id, true);

  update public.user_profiles
  set
    can_reverse_finance_payments = true,
    can_reverse_finance_cash_transactions = false
  where id = v_limited_user_id;

  perform set_config('request.jwt.claim.sub', v_limited_user_id::text, true);
  begin
    perform public.correct_erroneous_finance_payment(
      v_payment_limited_authority_id,
      'ROLLBACK ONLY INSUFFICIENT CASH AUTHORITY',
      true
    );
    raise exception 'Payment-only reverse authority unexpectedly corrected Cash history';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED' then
        raise;
      end if;
  end;
  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);

  if not exists (
    select 1 from public.finance_payments
    where id = v_payment_limited_authority_id
      and status = 'confirmed'
  ) or exists (
    select 1
    from public.finance_cash_transactions as correction
    join public.finance_cash_transactions as original
      on original.id = correction.reversal_of_transaction_id
    where original.source_payment_id = v_payment_limited_authority_id
  ) then
    raise exception 'Blocked limited-authority correction was not atomic';
  end if;

  update public.user_profiles
  set
    can_reverse_finance_payments = v_limited_payment_reverse_before,
    can_reverse_finance_cash_transactions = v_limited_cash_reverse_before
  where id = v_limited_user_id;

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
$erroneous_payment_correction_dry_run$;

set constraints all immediate;

rollback;

select
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_after_rollback,
  (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows_after_rollback,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_after_rollback,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_after_rollback,
  (
    select count(*)
    from public.finance_payments
    where internal_reference like 'ROLLBACK-CORRECTION-%'
      or internal_reference = 'ROLLBACK-LIMITED-CORRECTION-AUTHORITY'
  ) as synthetic_payment_rows_after_rollback,
  (
    select count(*)
    from public.finance_invoices
    where invoice_no like 'ROLLBACK-5DE1-%'
  ) as synthetic_invoice_rows_after_rollback,
  (
    select count(*)
    from public.finance_payments
    where id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
      and status = 'confirmed'
  ) as uat_confirmed_payment_rows_after_rollback,
  (
    select coalesce(sum(cash_amount), 0)
    from public.finance_payments
    where id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
      and status = 'confirmed'
  ) as uat_confirmed_cash_after_rollback,
  (
    select coalesce(sum(wht_amount), 0)
    from public.finance_payments
    where id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
      and status = 'confirmed'
  ) as uat_confirmed_wht_after_rollback,
  (
    select coalesce(sum(settlement_amount), 0)
    from public.finance_payments
    where id in (
      '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
      '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    )
      and status = 'confirmed'
  ) as uat_confirmed_settlement_after_rollback,
  (
    to_regprocedure('public.assert_finance_erroneous_payment_correction_dependencies(uuid)') is null
    and to_regprocedure(
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'
    ) is null
    and to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is null
  ) as migration_objects_rolled_back,
  (
    (select count(*) from public.finance_cash_transactions) = 0
    and (select count(*) from public.finance_account_opening_balances) = 0
    and (select count(*) from public.finance_cash_transaction_audit_events) = 0
    and (select count(*) from public.finance_account_opening_balance_audit_events) = 0
    and (select count(*) from public.finance_company_ledger) = 267
    and (select count(*) from public.finance_compensation_batches) = 33
    and (
      select count(*)
      from public.finance_payments
      where internal_reference like 'ROLLBACK-CORRECTION-%'
        or internal_reference = 'ROLLBACK-LIMITED-CORRECTION-AUTHORITY'
    ) = 0
    and (
      select count(*)
      from public.finance_invoices
      where invoice_no like 'ROLLBACK-5DE1-%'
    ) = 0
    and (
      select count(*)
      from public.finance_payments
      where id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
        and status = 'confirmed'
    ) = 2
    and (
      select coalesce(sum(cash_amount), 0)
      from public.finance_payments
      where id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
        and status = 'confirmed'
    ) = 14550.00
    and (
      select coalesce(sum(wht_amount), 0)
      from public.finance_payments
      where id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
        and status = 'confirmed'
    ) = 450.00
    and (
      select coalesce(sum(settlement_amount), 0)
      from public.finance_payments
      where id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
        and status = 'confirmed'
    ) = 15000.00
    and not exists (
      select 1
      from public.finance_cash_transactions
      where source_payment_id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
    )
    and to_regprocedure('public.assert_finance_erroneous_payment_correction_dependencies(uuid)') is null
    and to_regprocedure(
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'
    ) is null
    and to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is null
  ) as erroneous_payment_correction_dry_run_pass;
