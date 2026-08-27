-- SELECT-only Production verification for Migration 021.
-- Compare the two legacy row-count columns with the retained preflight result.

with expected_tables(table_name) as (
  values
    ('finance_payments'),
    ('finance_payment_invoice_allocations'),
    ('finance_payment_evidence'),
    ('finance_payment_audit_events')
), table_security as (
  select
    count(*) filter (where class_record.oid is not null) = 4 as all_tables_present,
    count(*) filter (where class_record.relrowsecurity) = 4 as all_tables_rls_enabled,
    count(*) filter (
      where class_record.oid is not null
        and has_table_privilege('authenticated', class_record.oid, 'SELECT')
    ) = 4 as authenticated_select_enabled,
    count(*) filter (
      where class_record.oid is not null
        and not has_table_privilege('authenticated', class_record.oid, 'INSERT')
        and not has_table_privilege('authenticated', class_record.oid, 'UPDATE')
        and not has_table_privilege('authenticated', class_record.oid, 'DELETE')
        and not has_table_privilege('anon', class_record.oid, 'SELECT')
        and not has_table_privilege('anon', class_record.oid, 'INSERT')
        and not has_table_privilege('anon', class_record.oid, 'UPDATE')
        and not has_table_privilege('anon', class_record.oid, 'DELETE')
    ) = 4 as browser_writes_and_anon_access_blocked
  from expected_tables as expected
  left join pg_class as class_record
    on class_record.oid = to_regclass('public.' || expected.table_name)
), policy_security as (
  select
    count(*) = 4 as finance_select_policies_present,
    count(*) filter (
      where policy_record.polcmd = 'r'
        and policy_record.polroles = array[0::oid]
        and position(
          'current_user_can_manage_finance_quotations'
          in pg_get_expr(policy_record.polqual, policy_record.polrelid)
        ) > 0
    ) = 4 as finance_select_policy_qualifiers_correct
  from pg_policy as policy_record
  where policy_record.polrelid in (
    to_regclass('public.finance_payments'),
    to_regclass('public.finance_payment_invoice_allocations'),
    to_regclass('public.finance_payment_evidence'),
    to_regclass('public.finance_payment_audit_events')
  )
), expected_functions(signature, security_definer) as (
  values
    ('public.validate_finance_invoice_payment_settlement(uuid)', false),
    ('public.validate_finance_payment_integrity(uuid)', false),
    ('public.enforce_finance_payment_lifecycle()', true),
    ('public.guard_finance_payment_child_mutation()', true),
    ('public.protect_finance_payment_audit_event()', true),
    ('public.enforce_finance_payment_integrity()', true),
    ('public.enforce_finance_payment_child_integrity()', true),
    ('public.enforce_finance_invoice_payment_integrity()', true)
), function_security as (
  select
    count(*) filter (where function_record.oid is not null) = 8 as all_integrity_functions_present,
    count(*) filter (
      where function_record.oid is not null
        and function_record.prosecdef = expected.security_definer
        and coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public']
    ) = 8 as function_execution_contexts_correct,
    count(*) filter (
      where function_record.oid is not null
        and not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
    ) = 8 as internal_functions_not_browser_executable
  from expected_functions as expected
  left join pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
), trigger_security as (
  select
    count(*) filter (
      where trigger_record.tgname in (
        'finance_payment_integrity_after_header',
        'finance_payment_integrity_after_allocation',
        'finance_invoice_payment_integrity_after_invoice'
      )
        and trigger_record.tgdeferrable
        and trigger_record.tginitdeferred
    ) = 3 as deferred_integrity_chain_present,
    count(*) filter (
      where trigger_record.tgname in (
        'finance_payment_lifecycle_guard',
        'finance_payment_allocation_mutation_guard',
        'finance_payment_evidence_mutation_guard',
        'finance_payment_audit_event_immutability'
      )
        and not trigger_record.tgdeferrable
    ) = 4 as immediate_lifecycle_guards_present
  from pg_trigger as trigger_record
  where not trigger_record.tgisinternal
    and trigger_record.tgname in (
      'finance_payment_integrity_after_header',
      'finance_payment_integrity_after_allocation',
      'finance_invoice_payment_integrity_after_invoice',
      'finance_payment_lifecycle_guard',
      'finance_payment_allocation_mutation_guard',
      'finance_payment_evidence_mutation_guard',
      'finance_payment_audit_event_immutability'
    )
), constraint_security as (
  select
    count(*) filter (
      where constraint_record.conname in (
        'finance_payments_status_check',
        'finance_payments_amounts_non_negative_check',
        'finance_payments_method_check',
        'finance_payments_lifecycle_metadata_check'
      )
    ) = 4 as payment_lifecycle_constraints_present,
    count(*) filter (
      where constraint_record.conname in (
        'finance_payment_invoice_allocations_amounts_check',
        'uq_finance_payment_invoice_allocation'
      )
    ) = 2 as allocation_constraints_present
  from pg_constraint as constraint_record
  where constraint_record.conrelid in (
    to_regclass('public.finance_payments'),
    to_regclass('public.finance_payment_invoice_allocations')
  )
), generated_amounts as (
  select
    count(*) filter (
      where table_name = 'finance_payments'
        and column_name = 'settlement_amount'
        and is_generated = 'ALWAYS'
    ) = 1 as payment_settlement_generated,
    count(*) filter (
      where table_name = 'finance_payment_invoice_allocations'
        and column_name = 'settlement_total'
        and is_generated = 'ALWAYS'
    ) = 1 as allocation_settlement_generated
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'finance_payments' and column_name = 'settlement_amount')
      or (
        table_name = 'finance_payment_invoice_allocations'
        and column_name = 'settlement_total'
      )
    )
), validator_contract as (
  select
    position(
      'Active Payment allocations require an Issued Invoice'
      in pg_get_functiondef('public.validate_finance_payment_integrity(uuid)'::regprocedure)
    ) > 0 as issued_invoice_validation_present,
    position(
      'same Client'
      in pg_get_functiondef('public.validate_finance_payment_integrity(uuid)'::regprocedure)
    ) > 0 as same_client_validation_present,
    position(
      'same currency'
      in pg_get_functiondef('public.validate_finance_payment_integrity(uuid)'::regprocedure)
    ) > 0 as same_currency_validation_present,
    position(
      'Active Payment allocations exceed the Invoice gross amount'
      in pg_get_functiondef('public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure)
    ) > 0 as over_allocation_validation_present,
    position(
      'exactly reconcile to Payment cash, WHT, and settlement totals'
      in pg_get_functiondef('public.validate_finance_payment_integrity(uuid)'::regprocedure)
    ) > 0 as payment_reconciliation_validation_present
), view_security as (
  select
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    coalesce(class_record.reloptions, array[]::text[]) @> array['security_invoker=true'] as settlement_view_security_invoker,
    has_table_privilege('authenticated', 'public.finance_invoice_settlement_summary', 'SELECT') as settlement_view_authenticated_select,
    not has_table_privilege('anon', 'public.finance_invoice_settlement_summary', 'SELECT') as settlement_view_anon_blocked
  from pg_class as class_record
  where class_record.oid = to_regclass('public.finance_invoice_settlement_summary')
), uat_invoice as (
  select
    count(*) = 1 as uat_invoice_found_once,
    coalesce(max(invoice_gross_amount), 0) = 15000.00 as uat_invoice_gross_correct,
    coalesce(max(confirmed_cash_allocated), 0) = 0 as uat_invoice_cash_zero,
    coalesce(max(confirmed_wht_credit_allocated), 0) = 0 as uat_invoice_wht_zero,
    coalesce(max(economically_settled_amount), 0) = 0 as uat_invoice_settled_zero,
    coalesce(max(outstanding_amount), 0) = 15000.00 as uat_invoice_outstanding_correct,
    coalesce(max(payment_status), '') = 'unpaid' as uat_invoice_status_unpaid
  from public.finance_invoice_settlement_summary
  where invoice_no = 'VP-IV-202608-000001'
), row_counts as (
  select
    (select count(*) from public.finance_payments) as payment_row_count,
    (select count(*) from public.finance_payment_invoice_allocations) as allocation_row_count,
    (select count(*) from public.finance_payment_evidence) as evidence_row_count,
    (select count(*) from public.finance_payment_audit_events) as audit_row_count,
    (select count(*) from public.finance_company_ledger) as ledger_row_count_for_preflight_comparison,
    (select count(*) from public.finance_compensation_batches) as compensation_row_count_for_preflight_comparison
), forbidden_objects as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as no_receipt_or_tax_invoice_objects_created,
    not exists (
      select 1
      from pg_proc as function_record
      join pg_namespace as namespace_record on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname in (
          'create_finance_payment_draft',
          'save_finance_payment_draft',
          'confirm_finance_payment',
          'cancel_finance_payment_draft',
          'reverse_finance_payment'
        )
    ) as no_operational_payment_rpcs_created
)
select
  'PAYMENT_FOUNDATION_VERIFICATION' as report_section,
  table_security.*,
  policy_security.*,
  function_security.*,
  trigger_security.*,
  constraint_security.*,
  generated_amounts.*,
  validator_contract.*,
  view_security.*,
  uat_invoice.*,
  row_counts.*,
  forbidden_objects.*,
  (
    table_security.all_tables_present
    and table_security.all_tables_rls_enabled
    and table_security.authenticated_select_enabled
    and table_security.browser_writes_and_anon_access_blocked
    and policy_security.finance_select_policies_present
    and policy_security.finance_select_policy_qualifiers_correct
    and function_security.all_integrity_functions_present
    and function_security.function_execution_contexts_correct
    and function_security.internal_functions_not_browser_executable
    and trigger_security.deferred_integrity_chain_present
    and trigger_security.immediate_lifecycle_guards_present
    and constraint_security.payment_lifecycle_constraints_present
    and constraint_security.allocation_constraints_present
    and generated_amounts.payment_settlement_generated
    and generated_amounts.allocation_settlement_generated
    and validator_contract.issued_invoice_validation_present
    and validator_contract.same_client_validation_present
    and validator_contract.same_currency_validation_present
    and validator_contract.over_allocation_validation_present
    and validator_contract.payment_reconciliation_validation_present
    and view_security.settlement_view_present
    and view_security.settlement_view_security_invoker
    and view_security.settlement_view_authenticated_select
    and view_security.settlement_view_anon_blocked
    and uat_invoice.uat_invoice_found_once
    and uat_invoice.uat_invoice_gross_correct
    and uat_invoice.uat_invoice_cash_zero
    and uat_invoice.uat_invoice_wht_zero
    and uat_invoice.uat_invoice_settled_zero
    and uat_invoice.uat_invoice_outstanding_correct
    and uat_invoice.uat_invoice_status_unpaid
    and row_counts.payment_row_count = 0
    and row_counts.allocation_row_count = 0
    and row_counts.evidence_row_count = 0
    and row_counts.audit_row_count = 0
    and forbidden_objects.no_receipt_or_tax_invoice_objects_created
    and forbidden_objects.no_operational_payment_rpcs_created
  ) as payment_foundation_verification_pass
from table_security
cross join policy_security
cross join function_security
cross join trigger_security
cross join constraint_security
cross join generated_amounts
cross join validator_contract
cross join view_security
cross join uat_invoice
cross join row_counts
cross join forbidden_objects;
