-- SELECT-only Production verifier for Migration 029.
-- One statement, one row, no RPC calls, and no schema or business-data writes.

with
objects as (
  select
    to_regclass('public.finance_payment_allocation_reallocations') is not null as reallocation_table_present,
    to_regclass('public.finance_payment_effective_invoice_allocations') is not null as effective_view_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    to_regprocedure('public.current_user_can_reallocate_finance_payments()') is not null as permission_helper_present,
    to_regprocedure('public.validate_finance_payment_effective_allocations(uuid)') is not null as effective_validator_present,
    to_regprocedure('public.finance_invoice_active_reserved_settlement(uuid,uuid)') is not null as capacity_helper_present,
    to_regprocedure('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)') is not null as dependency_guard_present,
    to_regprocedure('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)') is not null as external_rpc_present
),
definitions as (
  select
    pg_get_functiondef('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure) as rpc_definition,
    pg_get_functiondef('public.validate_finance_payment_effective_allocations(uuid)'::regprocedure) as effective_validator_definition,
    pg_get_functiondef('public.validate_finance_payment_integrity(uuid)'::regprocedure) as payment_validator_definition,
    pg_get_functiondef('public.validate_finance_invoice_payment_settlement(uuid)'::regprocedure) as invoice_validator_definition,
    pg_get_functiondef('public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure) as create_draft_definition,
    pg_get_functiondef('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure) as save_draft_definition,
    pg_get_functiondef('public.reverse_finance_payment(uuid,text)'::regprocedure) as reverse_definition,
    pg_get_functiondef('public.correct_erroneous_finance_payment(uuid,text,boolean)'::regprocedure) as correction_definition,
    pg_get_functiondef('public.void_finance_invoice(uuid,text,boolean)'::regprocedure) as void_definition,
    pg_get_functiondef('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)'::regprocedure) as dependency_definition,
    pg_get_functiondef('public.current_user_can_reallocate_finance_payments()'::regprocedure) as permission_definition,
    pg_get_viewdef('public.finance_payment_effective_invoice_allocations'::regclass, true) as effective_view_definition,
    pg_get_viewdef('public.finance_invoice_settlement_summary'::regclass, true) as settlement_view_definition
),
contracts as (
  select
    position('finance_payment_invoice_allocations' in definitions.effective_view_definition) > 0
      and position('finance_payment_allocation_reallocations' in definitions.effective_view_definition) > 0
      and position('source_invoice_id' in definitions.effective_view_definition) > 0
      and position('target_invoice_id' in definitions.effective_view_definition) > 0
      as effective_view_combines_original_and_movements,
    position('effective_cash_allocated' in definitions.effective_view_definition) > 0
      and position('effective_wht_credit_allocated' in definitions.effective_view_definition) > 0
      and position('effective_settlement_total' in definitions.effective_view_definition) > 0
      as effective_components_separate,
    position('finance_payment_effective_invoice_allocations' in definitions.settlement_view_definition) > 0
      and position('payment.status = ''confirmed''' in definitions.settlement_view_definition) > 0
      as settlement_uses_confirmed_effective_allocations,
    position('FINANCE_PAYMENT_EFFECTIVE_TOTALS_MISMATCH' in definitions.effective_validator_definition) > 0
      and position('effective_cash_allocated < 0' in definitions.effective_validator_definition) > 0
      and position('effective_wht_credit_allocated < 0' in definitions.effective_validator_definition) > 0
      and position('v_effective_count > 100' in definitions.effective_validator_definition) > 0
      as effective_invariant_guards_present,
    position('FINANCE_PAYMENT_REALLOCATION_ACK_REQUIRED' in definitions.rpc_definition) > 0
      and position('Payment reallocation reason is required' in definitions.rpc_definition) > 0
      and position('Only a Confirmed Payment allocation can be reallocated' in definitions.rpc_definition) > 0
      as acknowledgement_reason_status_guards_present,
    position('p_cash_amount < 0' in definitions.rpc_definition) > 0
      and position('p_wht_amount < 0' in definitions.rpc_definition) > 0
      and position('p_cash_amount + p_wht_amount <= 0' in definitions.rpc_definition) > 0
      and position('FINANCE_PAYMENT_REALLOCATION_SOURCE_INSUFFICIENT' in definitions.rpc_definition) > 0
      as explicit_cash_wht_guards_present,
    position('FINANCE_PAYMENT_REALLOCATION_TARGET_CAPACITY_EXCEEDED' in definitions.rpc_definition) > 0
      and position('finance_invoice_active_reserved_settlement' in definitions.rpc_definition) > 0
      and position('document_status <> ''issued''' in definitions.rpc_definition) > 0
      and position('FINANCE_PAYMENT_REALLOCATION_CLIENT_MISMATCH' in definitions.rpc_definition) > 0
      and position('FINANCE_PAYMENT_REALLOCATION_CURRENCY_MISMATCH' in definitions.rpc_definition) > 0
      as target_capacity_and_compatibility_guards_present,
    position('case_id <>' in definitions.rpc_definition) = 0
      and position('advisory_matter_id <>' in definitions.rpc_definition) = 0
      and position('cross_matter' in definitions.rpc_definition) > 0
      as cross_matter_allowed_and_audited,
    position('request_id = p_request_id' in definitions.rpc_definition) > 0
      and position('FINANCE_PAYMENT_REALLOCATION_REQUEST_CONFLICT' in definitions.rpc_definition) > 0
      and position('pg_advisory_xact_lock' in definitions.rpc_definition) > 0
      as idempotency_and_retry_guards_present,
    position('order by invoice_id' in definitions.rpc_definition) > 0
      and position('for update' in definitions.rpc_definition) > 0
      as deterministic_locking_present,
    position('insert into public.finance_cash_transactions' in lower(definitions.rpc_definition)) = 0
      and position('update public.finance_cash_transactions' in lower(definitions.rpc_definition)) = 0
      and position('delete from public.finance_cash_transactions' in lower(definitions.rpc_definition)) = 0
      and position('finance_account_opening_balances' in lower(definitions.rpc_definition)) = 0
      as reallocation_has_no_cash_or_opening_mutation_path,
    position('finance_payment_effective_invoice_allocations' in definitions.reverse_definition) > 0
      as generic_reverse_locks_effective_invoices,
    position('finance_payment_effective_invoice_allocations' in definitions.correction_definition) > 0
      and position('create_finance_erroneous_payment_cash_correction' in definitions.correction_definition) > 0
      as erroneous_correction_locks_effective_and_preserves_cash_contract,
    position('finance_payment_effective_invoice_allocations' in definitions.void_definition) > 0
      and position('effective Confirmed Payment settlement' in definitions.void_definition) > 0
      and position('finance_payment_allocation_reallocations' in definitions.void_definition) = 0
      as void_uses_effective_not_historical_reallocation,
    position('finance_payment_effective_invoice_allocations' in definitions.create_draft_definition) > 0
      and position('finance_invoice_active_reserved_settlement' in definitions.create_draft_definition) > 0
      and position('finance_invoice_active_reserved_settlement' in definitions.save_draft_definition) > 0
      as draft_capacity_uses_effective_confirmed_plus_raw_draft,
    position('finance_receipts' in definitions.dependency_definition) > 0
      and position('finance_tax_invoices' in definitions.dependency_definition) > 0
      and position('finance_wht_certificates' in definitions.dependency_definition) > 0
      and position('finance_credit_notes' in definitions.dependency_definition) > 0
      and position('finance_refunds' in definitions.dependency_definition) > 0
      and position('finance_revenue_allocations' in definitions.dependency_definition) > 0
      and position('finance_company_ledger' in definitions.dependency_definition) > 0
      and position('finance_compensation_batches' in definitions.dependency_definition) > 0
      and position('finance_cash_transactions' in definitions.dependency_definition) = 0
      as downstream_guard_fail_closed_except_expected_cash,
    position('role = ''admin''' in definitions.permission_definition) > 0
      and position('can_reallocate_finance_payments' in definitions.permission_definition) > 0
      and position('partner' in definitions.permission_definition) = 0
      as dedicated_permission_contract_present
  from definitions
),
table_contract as (
  select
    count(*) filter (where column_name = 'payment_id' and is_nullable = 'NO') = 1 as payment_fk_column,
    count(*) filter (where column_name = 'source_invoice_id' and is_nullable = 'NO') = 1 as source_invoice_column,
    count(*) filter (where column_name = 'target_invoice_id' and is_nullable = 'NO') = 1 as target_invoice_column,
    count(*) filter (where column_name = 'cash_moved' and data_type = 'numeric') = 1 as cash_column,
    count(*) filter (where column_name = 'wht_moved' and data_type = 'numeric') = 1 as wht_column,
    count(*) filter (where column_name = 'settlement_moved' and is_generated = 'ALWAYS') = 1 as generated_settlement,
    count(*) filter (where column_name = 'request_id' and is_nullable = 'NO') = 1 as request_id_column,
    count(*) filter (where column_name = 'reason' and is_nullable = 'NO') = 1 as reason_column
  from information_schema.columns
  where table_schema = 'public' and table_name = 'finance_payment_allocation_reallocations'
),
security as (
  select
    (select relrowsecurity from pg_class where oid = 'public.finance_payment_allocation_reallocations'::regclass) as rls_enabled,
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'finance_payment_allocation_reallocations'
        and cmd = 'SELECT'
        and qual ilike '%current_user_can_view_finance_payments%'
    ) as read_policy_present,
    not has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'INSERT')
      and not has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.finance_payment_allocation_reallocations', 'DELETE')
      and not has_table_privilege('anon', 'public.finance_payment_allocation_reallocations', 'INSERT')
      as browser_mutation_blocked,
    has_function_privilege('authenticated', 'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)'::regprocedure, 'EXECUTE')
      as rpc_grants_correct,
    exists (
      select 1 from pg_trigger
      where tgrelid = 'public.finance_payment_allocation_reallocations'::regclass
        and tgname = 'finance_payment_allocation_reallocation_immutability'
        and not tgisinternal
    ) as immutability_trigger_present
),
public_contract as (
  select array_agg(column_name::text order by ordinal_position) = array[
    'invoice_id','invoice_no','invoice_status','client_id','case_id','advisory_matter_id',
    'currency','issue_date','due_date','invoice_gross_amount','confirmed_cash_allocated',
    'confirmed_wht_credit_allocated','economically_settled_amount','outstanding_amount',
    'payment_status','is_overdue'
  ]::text[] as settlement_columns_unchanged
  from information_schema.columns
  where table_schema = 'public' and table_name = 'finance_invoice_settlement_summary'
),
production as (
  select
    (select count(*) from public.finance_payment_allocation_reallocations) as reallocation_rows,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payment_audit_events where event_type = 'allocation_reallocated') as reallocation_audit_rows
),
uat as (
  select
    count(*) as uat_payment_rows,
    count(*) filter (where status = 'confirmed') as uat_confirmed_rows,
    coalesce(sum(cash_amount) filter (where status = 'confirmed'), 0) as uat_cash,
    coalesce(sum(wht_amount) filter (where status = 'confirmed'), 0) as uat_wht,
    coalesce(sum(settlement_amount) filter (where status = 'confirmed'), 0) as uat_settlement
  from public.finance_payments
  where id in (
    '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
    '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
  )
),
future_objects as (
  select
    to_regclass('public.finance_receipts') is null as receipt_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_absent
)
select
  objects.*,
  contracts.*,
  table_contract.*,
  security.*,
  public_contract.*,
  production.*,
  uat.*,
  future_objects.*,
  (
    objects.reallocation_table_present and objects.effective_view_present
    and objects.settlement_view_present and objects.permission_helper_present
    and objects.effective_validator_present and objects.capacity_helper_present
    and objects.dependency_guard_present and objects.external_rpc_present
    and contracts.effective_view_combines_original_and_movements
    and contracts.effective_components_separate
    and contracts.settlement_uses_confirmed_effective_allocations
    and contracts.effective_invariant_guards_present
    and contracts.acknowledgement_reason_status_guards_present
    and contracts.explicit_cash_wht_guards_present
    and contracts.target_capacity_and_compatibility_guards_present
    and contracts.cross_matter_allowed_and_audited
    and contracts.idempotency_and_retry_guards_present
    and contracts.deterministic_locking_present
    and contracts.reallocation_has_no_cash_or_opening_mutation_path
    and contracts.generic_reverse_locks_effective_invoices
    and contracts.erroneous_correction_locks_effective_and_preserves_cash_contract
    and contracts.void_uses_effective_not_historical_reallocation
    and contracts.draft_capacity_uses_effective_confirmed_plus_raw_draft
    and contracts.downstream_guard_fail_closed_except_expected_cash
    and contracts.dedicated_permission_contract_present
    and table_contract.payment_fk_column and table_contract.source_invoice_column
    and table_contract.target_invoice_column and table_contract.cash_column
    and table_contract.wht_column and table_contract.generated_settlement
    and table_contract.request_id_column and table_contract.reason_column
    and security.rls_enabled and security.read_policy_present
    and security.browser_mutation_blocked and security.rpc_grants_correct
    and security.immutability_trigger_present
    and public_contract.settlement_columns_unchanged
    and production.reallocation_rows = 0
    and production.reallocation_audit_rows = 0
    and production.cash_transaction_rows = 0
    and production.opening_balance_rows = 0
    and production.legacy_ledger_rows = 267
    and production.compensation_rows = 33
    and uat.uat_payment_rows = 2
    and uat.uat_confirmed_rows = 2
    and uat.uat_cash = 14550.00
    and uat.uat_wht = 450.00
    and uat.uat_settlement = 15000.00
    and future_objects.receipt_absent
    and future_objects.tax_invoice_absent
  ) as payment_allocation_reallocation_verification_pass
from objects
cross join contracts
cross join table_contract
cross join security
cross join public_contract
cross join production
cross join uat
cross join future_objects;
