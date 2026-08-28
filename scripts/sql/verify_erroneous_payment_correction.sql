-- SELECT-only Production verifier for Migration 028.
-- This statement inspects catalog definitions and verified baselines only.

with
function_catalog as (
  select
    function_record.oid,
    function_record.oid::regprocedure::text as signature,
    function_record.prosecdef,
    function_record.proowner,
    coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public']
      as fixed_public_search_path,
    pg_get_functiondef(function_record.oid) as definition
  from pg_proc as function_record
  where function_record.oid in (
    to_regprocedure('public.assert_finance_erroneous_payment_correction_dependencies(uuid)'),
    to_regprocedure(
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'
    ),
    to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)')
  )
),
functions as (
  select
    count(*) = 3 as all_functions_present,
    bool_and(prosecdef) as all_security_definer,
    bool_and(fixed_public_search_path) as all_fixed_public_search_path,
    count(distinct proowner) = 1
      and bool_and(proowner = (
        select proowner
        from pg_proc
        where oid = 'public.reverse_finance_payment(uuid,text)'::regprocedure
      )) as trusted_owner_preserved,
    string_agg(definition, E'\n\n' order by signature) as combined_definition
  from function_catalog
),
definitions as (
  select
    functions.*,
    position('FINANCE_PAYMENT_CORRECTION_ACK_REQUIRED' in combined_definition) > 0
      as acknowledgement_guard_present,
    position('Payment correction reason is required' in combined_definition) > 0
      and position('Payment correction reason is too long' in combined_definition) > 0
      as reason_guards_present,
    position('FINANCE_PAYMENT_CORRECTION_CASH_AUTHORITY_REQUIRED' in combined_definition) > 0
      and position('current_user_can_reverse_finance_payments' in combined_definition) > 0
      and position('current_user_can_reverse_finance_cash_transactions' in combined_definition) > 0
      as combined_cash_authority_guard_present,
    position('full_erroneous_payment' in combined_definition) > 0
      and position('FINANCE_PAYMENT_CORRECTION_AMBIGUOUS_REVERSED_PAYMENT' in combined_definition) > 0
      as workflow_idempotency_marker_present,
    position('FINANCE_PAYMENT_CORRECTION_HAS_DOWNSTREAM_DEPENDENCIES' in combined_definition) > 0
      and position('finance_receipts' in combined_definition) > 0
      and position('finance_tax_invoices' in combined_definition) > 0
      and position('finance_wht_certificates' in combined_definition) > 0
      and position('finance_refunds' in combined_definition) > 0
      and position('finance_revenue_allocations' in combined_definition) > 0
      as future_dependency_guard_present,
    position('v_original_cash.cash_amount' in combined_definition) > 0
      and position('v_payment.cash_amount' in combined_definition) > 0
      and position('v_original_cash.occurred_at' in combined_definition) > 0
      and position('reversal_of_transaction_id' in combined_definition) > 0
      and position(E'''outflow''' in combined_definition) > 0
      and position(E'''reversal''' in combined_definition) > 0
      as opposite_cash_correction_contract_present,
    position('wht_amount_invalidated' in combined_definition) > 0
      and position('wht_invalidated_as_full_payment_correction' in combined_definition) > 0
      and position('wht_amount_excluded' in combined_definition) = 0
      as wht_settlement_only_contract_present,
    position('record_correction' in combined_definition) > 0
      and position('is_customer_refund' in combined_definition) > 0
      and position('customer_refund_recorded' in combined_definition) > 0
      as correction_not_refund_audit_present,
    position('payment_reallocation_performed' in combined_definition) > 0
      and position('update public.finance_payment_invoice_allocations' in lower(combined_definition)) = 0
      and position('delete from public.finance_payment_invoice_allocations' in lower(combined_definition)) = 0
      and position('insert into public.finance_payment_invoice_allocations' in lower(combined_definition)) = 0
      as no_reallocation_mutation_present,
    position('create_finance_erroneous_payment_cash_correction' in combined_definition)
      < position('update public.finance_payments' in lower(combined_definition))
      and position('update public.finance_payments' in lower(combined_definition))
      < position('record_finance_payment_audit_event' in combined_definition)
      as coordinated_mutation_order_present
  from functions
),
grants as (
  select
    has_function_privilege(
      'authenticated',
      'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure,
      'EXECUTE'
    ) as external_authenticated_execute,
    not has_function_privilege(
      'anon',
      'public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure,
      'EXECUTE'
    ) as external_anon_blocked,
    not has_function_privilege(
      'authenticated',
      'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
      'EXECUTE'
    ) and not has_function_privilege(
      'authenticated',
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
      'EXECUTE'
    ) and not has_function_privilege(
      'anon',
      'public.assert_finance_erroneous_payment_correction_dependencies(uuid)'::regprocedure,
      'EXECUTE'
    ) and not has_function_privilege(
      'anon',
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'::regprocedure,
      'EXECUTE'
    ) as internal_helpers_browser_blocked
),
existing_contracts as (
  select
    position(
      'FINANCE_PAYMENT_HAS_CASH_TRANSACTION'
      in pg_get_functiondef(
        'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure
      )
    ) > 0 as generic_reverse_cash_blocker_preserved,
    count(*) filter (
      where indexname = 'uq_finance_cash_transactions_source_payment'
        and indexdef ilike '%unique%'
        and indexdef ilike '%source_payment_id%'
    ) = 1 as one_original_cash_per_payment_preserved,
    count(*) filter (
      where indexname = 'uq_finance_cash_transactions_reversal'
        and indexdef ilike '%unique%'
        and indexdef ilike '%reversal_of_transaction_id%'
    ) = 1 as one_reversal_per_original_preserved,
    position(
      'payment.status = ''confirmed'''
      in pg_get_viewdef('public.finance_invoice_settlement_summary'::regclass, true)
    ) > 0 as settlement_still_uses_confirmed_payments
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'finance_cash_transactions'
),
production_counts as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows,
    (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as payment_rows
),
uat_payments as (
  select
    count(*) as uat_payment_rows,
    count(*) filter (where status = 'confirmed') as uat_confirmed_payment_rows,
    coalesce(sum(cash_amount), 0) as uat_confirmed_cash,
    coalesce(sum(wht_amount), 0) as uat_confirmed_wht,
    coalesce(sum(settlement_amount), 0) as uat_confirmed_settlement
  from public.finance_payments
  where id in (
    '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
    '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
  )
),
uat_cash as (
  select count(*) as uat_source_cash_rows
  from public.finance_cash_transactions
  where source_payment_id in (
    '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
    '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
  )
),
future_objects as (
  select
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  definitions.*,
  grants.*,
  existing_contracts.*,
  production_counts.*,
  uat_payments.*,
  uat_cash.uat_source_cash_rows,
  future_objects.*,
  (
    definitions.all_functions_present
    and definitions.all_security_definer
    and definitions.all_fixed_public_search_path
    and definitions.trusted_owner_preserved
    and definitions.acknowledgement_guard_present
    and definitions.reason_guards_present
    and definitions.combined_cash_authority_guard_present
    and definitions.workflow_idempotency_marker_present
    and definitions.future_dependency_guard_present
    and definitions.opposite_cash_correction_contract_present
    and definitions.wht_settlement_only_contract_present
    and definitions.correction_not_refund_audit_present
    and definitions.no_reallocation_mutation_present
    and definitions.coordinated_mutation_order_present
    and grants.external_authenticated_execute
    and grants.external_anon_blocked
    and grants.internal_helpers_browser_blocked
    and existing_contracts.generic_reverse_cash_blocker_preserved
    and existing_contracts.one_original_cash_per_payment_preserved
    and existing_contracts.one_reversal_per_original_preserved
    and existing_contracts.settlement_still_uses_confirmed_payments
    and production_counts.cash_transaction_rows = 0
    and production_counts.opening_balance_rows = 0
    and production_counts.cash_audit_rows = 0
    and production_counts.opening_audit_rows = 0
    and production_counts.legacy_ledger_rows = 267
    and production_counts.compensation_rows = 33
    and uat_payments.uat_payment_rows = 2
    and uat_payments.uat_confirmed_payment_rows = 2
    and uat_payments.uat_confirmed_cash = 14550.00
    and uat_payments.uat_confirmed_wht = 450.00
    and uat_payments.uat_confirmed_settlement = 15000.00
    and uat_cash.uat_source_cash_rows = 0
    and future_objects.receipt_object_absent
    and future_objects.tax_invoice_object_absent
  ) as erroneous_payment_correction_verification_pass
from definitions
cross join grants
cross join existing_contracts
cross join production_counts
cross join uat_payments
cross join uat_cash
cross join future_objects;
