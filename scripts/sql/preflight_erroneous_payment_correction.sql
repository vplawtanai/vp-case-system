-- SELECT-only Production preflight for Migration 028.
-- This statement does not call an RPC and does not mutate data or schema.

with
required_objects as (
  select
    to_regclass('public.finance_payments') is not null as payment_table_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as allocation_table_present,
    to_regclass('public.finance_payment_audit_events') is not null as payment_audit_table_present,
    to_regclass('public.finance_cash_transactions') is not null as cash_table_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_table_present,
    to_regclass('public.finance_cash_transaction_audit_events') is not null as cash_audit_table_present,
    to_regclass('public.finance_account_opening_balance_audit_events') is not null as opening_audit_table_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    to_regprocedure('public.reverse_finance_payment(uuid,text)') is not null as payment_reverse_rpc_present,
    to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is not null
      as generic_dependency_guard_present,
    to_regprocedure('public.current_user_can_reverse_finance_payments()') is not null
      as payment_reverse_permission_present,
    to_regprocedure('public.current_user_can_reverse_finance_cash_transactions()') is not null
      as cash_reverse_permission_present,
    to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is not null
      as payment_audit_writer_present,
    to_regprocedure('public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)') is not null
      as cash_audit_writer_present,
    to_regprocedure('public.validate_finance_payment_integrity(uuid)') is not null
      as payment_integrity_validator_present,
    to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') is not null
      as cash_integrity_validator_present
),
index_contracts as (
  select
    count(*) filter (
      where indexname = 'uq_finance_cash_transactions_source_payment'
        and indexdef ilike '%unique%'
        and indexdef ilike '%source_payment_id%'
        and indexdef ilike '%reversal_of_transaction_id is null%'
    ) = 1 as one_original_cash_per_payment,
    count(*) filter (
      where indexname = 'uq_finance_cash_transactions_reversal'
        and indexdef ilike '%unique%'
        and indexdef ilike '%reversal_of_transaction_id%'
    ) = 1 as one_reversal_per_original
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'finance_cash_transactions'
),
function_contracts as (
  select
    position(
      'FINANCE_PAYMENT_HAS_CASH_TRANSACTION'
      in coalesce(
        case
          when to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is not null
          then pg_get_functiondef(
            'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure
          )
        end,
        ''
      )
    ) > 0 as generic_reverse_cash_blocker_present,
    to_regprocedure('public.assert_finance_erroneous_payment_correction_dependencies(uuid)') is null
      as proposed_dependency_guard_available,
    to_regprocedure(
      'public.create_finance_erroneous_payment_cash_correction(uuid,text,timestamp with time zone)'
    ) is null as proposed_cash_helper_available,
    to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is null
      as proposed_external_rpc_available
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
  required_objects.*,
  index_contracts.*,
  function_contracts.*,
  production_counts.*,
  uat_payments.*,
  uat_cash.uat_source_cash_rows,
  future_objects.*,
  (
    required_objects.payment_table_present
    and required_objects.allocation_table_present
    and required_objects.payment_audit_table_present
    and required_objects.cash_table_present
    and required_objects.opening_table_present
    and required_objects.cash_audit_table_present
    and required_objects.opening_audit_table_present
    and required_objects.settlement_view_present
    and required_objects.payment_reverse_rpc_present
    and required_objects.generic_dependency_guard_present
    and required_objects.payment_reverse_permission_present
    and required_objects.cash_reverse_permission_present
    and required_objects.payment_audit_writer_present
    and required_objects.cash_audit_writer_present
    and required_objects.payment_integrity_validator_present
    and required_objects.cash_integrity_validator_present
    and index_contracts.one_original_cash_per_payment
    and index_contracts.one_reversal_per_original
    and function_contracts.generic_reverse_cash_blocker_present
    and function_contracts.proposed_dependency_guard_available
    and function_contracts.proposed_cash_helper_available
    and function_contracts.proposed_external_rpc_available
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
  ) as erroneous_payment_correction_preflight_pass
from required_objects
cross join index_contracts
cross join function_contracts
cross join production_counts
cross join uat_payments
cross join uat_cash
cross join future_objects;
