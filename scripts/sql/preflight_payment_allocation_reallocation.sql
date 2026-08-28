-- SELECT-only Production preflight for Migration 029.
-- One statement, one row, no RPC calls, and no schema or business-data writes.

with
required_objects as (
  select
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as raw_allocations_present,
    to_regclass('public.finance_payment_audit_events') is not null as payment_audit_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regprocedure('public.validate_finance_payment_integrity(uuid)') is not null as payment_validator_present,
    to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is not null as invoice_validator_present,
    to_regprocedure('public.create_finance_payment_draft_from_invoice(uuid)') is not null as create_draft_present,
    to_regprocedure('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)') is not null as save_draft_present,
    to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is not null as confirm_payment_present,
    to_regprocedure('public.reverse_finance_payment(uuid,text)') is not null as reverse_payment_present,
    to_regprocedure('public.correct_erroneous_finance_payment(uuid,text,boolean)') is not null as correction_present,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null as invoice_void_present,
    to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)') is not null as invoice_void_guard_present,
    to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is not null as payment_audit_writer_present
),
raw_contract as (
  select
    count(*) filter (where column_name = 'payment_id' and is_nullable = 'NO') = 1 as payment_id_present,
    count(*) filter (where column_name = 'invoice_id' and is_nullable = 'NO') = 1 as invoice_id_present,
    count(*) filter (where column_name = 'cash_allocated' and data_type = 'numeric') = 1 as cash_component_present,
    count(*) filter (where column_name = 'wht_credit_allocated' and data_type = 'numeric') = 1 as wht_component_present,
    count(*) filter (where column_name = 'settlement_total' and is_generated = 'ALWAYS') = 1 as generated_total_present
  from information_schema.columns
  where table_schema = 'public' and table_name = 'finance_payment_invoice_allocations'
),
proposed_names as (
  select
    to_regclass('public.finance_payment_allocation_reallocations') is null as reallocation_table_available,
    to_regclass('public.finance_payment_effective_invoice_allocations') is null as effective_view_available,
    to_regprocedure('public.current_user_can_reallocate_finance_payments()') is null as permission_helper_available,
    to_regprocedure('public.validate_finance_payment_effective_allocations(uuid)') is null as effective_validator_available,
    to_regprocedure('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)') is null as dependency_guard_available,
    to_regprocedure('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)') is null as rpc_available,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'user_profiles'
        and column_name = 'can_reallocate_finance_payments'
    ) as permission_column_available
),
production_counts as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as payment_rows
),
uat_payments as (
  select
    count(*) as uat_payment_rows,
    count(*) filter (where status = 'confirmed') as uat_confirmed_payment_rows,
    coalesce(sum(cash_amount) filter (where status = 'confirmed'), 0) as uat_confirmed_cash,
    coalesce(sum(wht_amount) filter (where status = 'confirmed'), 0) as uat_confirmed_wht,
    coalesce(sum(settlement_amount) filter (where status = 'confirmed'), 0) as uat_confirmed_settlement
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
  required_objects.*,
  raw_contract.*,
  proposed_names.*,
  production_counts.*,
  uat_payments.*,
  future_objects.*,
  (
    required_objects.payments_present
    and required_objects.raw_allocations_present
    and required_objects.payment_audit_present
    and required_objects.settlement_view_present
    and required_objects.cash_transactions_present
    and required_objects.opening_balances_present
    and required_objects.payment_validator_present
    and required_objects.invoice_validator_present
    and required_objects.create_draft_present
    and required_objects.save_draft_present
    and required_objects.confirm_payment_present
    and required_objects.reverse_payment_present
    and required_objects.correction_present
    and required_objects.invoice_void_present
    and required_objects.invoice_void_guard_present
    and required_objects.payment_audit_writer_present
    and raw_contract.payment_id_present
    and raw_contract.invoice_id_present
    and raw_contract.cash_component_present
    and raw_contract.wht_component_present
    and raw_contract.generated_total_present
    and proposed_names.reallocation_table_available
    and proposed_names.effective_view_available
    and proposed_names.permission_helper_available
    and proposed_names.effective_validator_available
    and proposed_names.dependency_guard_available
    and proposed_names.rpc_available
    and proposed_names.permission_column_available
    and production_counts.cash_transaction_rows = 0
    and production_counts.opening_balance_rows = 0
    and production_counts.legacy_ledger_rows = 267
    and production_counts.compensation_rows = 33
    and uat_payments.uat_payment_rows = 2
    and uat_payments.uat_confirmed_payment_rows = 2
    and uat_payments.uat_confirmed_cash = 14550.00
    and uat_payments.uat_confirmed_wht = 450.00
    and uat_payments.uat_confirmed_settlement = 15000.00
    and future_objects.receipt_absent
    and future_objects.tax_invoice_absent
  ) as payment_allocation_reallocation_preflight_pass
from required_objects
cross join raw_contract
cross join proposed_names
cross join production_counts
cross join uat_payments
cross join future_objects;
