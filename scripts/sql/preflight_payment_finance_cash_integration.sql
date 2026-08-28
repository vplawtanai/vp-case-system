-- Phase 5D-D Production preflight: Confirmed Payment -> Finance Cash integration.
-- SELECT-only. Returns exactly one result row and performs no RPC or mutation.

with catalog as (
  select
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as payment_allocations_present,
    to_regclass('public.finance_payment_audit_events') is not null as payment_audit_present,
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_cash_transaction_audit_events') is not null as cash_audit_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regclass('public.finance_account_opening_balance_audit_events') is not null as opening_audit_present,
    to_regclass('public.finance_cash_account_balance_summary') is not null as balance_view_present,
    to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is not null as payment_confirm_rpc_present,
    to_regprocedure('public.reverse_finance_payment(uuid,text)') is not null as payment_reverse_rpc_present,
    to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is not null
      as payment_downstream_guard_present,
    to_regprocedure('public.confirm_finance_account_opening_balance(uuid,boolean)') is not null
      as opening_confirm_rpc_present,
    to_regprocedure('public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)') is not null
      as opening_input_guard_present,
    to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is not null
      as payment_audit_writer_present,
    to_regprocedure('public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)') is not null
      as cash_audit_writer_present,
    to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') is not null
      as cash_integrity_validator_present,
    to_regprocedure('public.finance_bangkok_completed_day_end(date)') is null
      as completed_day_helper_name_available,
    to_regprocedure('public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)') is null
      as opening_gap_guard_name_available,
    to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)') is null
      as payment_cash_helper_name_available,
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
),
source_index as (
  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'finance_cash_transactions'
      and indexname = 'uq_finance_cash_transactions_source_payment'
      and indexdef ilike '%unique%'
      and indexdef ilike '%source_payment_id%'
      and indexdef ilike '%reversal_of_transaction_id is null%'
  ) as payment_source_unique_index_present
),
foundation_counts as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows,
    (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status = 'confirmed') as confirmed_payment_rows,
    (
      select coalesce(sum(cash_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) as confirmed_payment_cash,
    (
      select coalesce(sum(wht_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) as confirmed_payment_wht,
    (
      select coalesce(sum(settlement_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) as confirmed_payment_settlement
),
uat_payments as (
  select
    count(*) filter (
      where id = '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid
        and status = 'confirmed'
        and cash_amount = 9700
    ) as payment_9700_matches,
    count(*) filter (
      where id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
        and status = 'confirmed'
        and cash_amount = 4850
    ) as payment_4850_matches
  from public.finance_payments
),
uat_cash as (
  select count(*) as uat_payment_source_cash_rows
  from public.finance_cash_transactions
  where source_payment_id in (
    '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
    '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
  )
)
select
  'PHASE_5D_D_PAYMENT_FINANCE_CASH_PREFLIGHT'::text as report_section,
  catalog.*,
  source_index.payment_source_unique_index_present,
  foundation_counts.*,
  uat_payments.payment_9700_matches,
  uat_payments.payment_4850_matches,
  uat_cash.uat_payment_source_cash_rows,
  (
    catalog.payments_present
    and catalog.payment_allocations_present
    and catalog.payment_audit_present
    and catalog.cash_transactions_present
    and catalog.cash_audit_present
    and catalog.opening_balances_present
    and catalog.opening_audit_present
    and catalog.balance_view_present
    and catalog.payment_confirm_rpc_present
    and catalog.payment_reverse_rpc_present
    and catalog.payment_downstream_guard_present
    and catalog.opening_confirm_rpc_present
    and catalog.opening_input_guard_present
    and catalog.payment_audit_writer_present
    and catalog.cash_audit_writer_present
    and catalog.cash_integrity_validator_present
    and catalog.completed_day_helper_name_available
    and catalog.opening_gap_guard_name_available
    and catalog.payment_cash_helper_name_available
    and catalog.receipt_object_absent
    and catalog.tax_invoice_object_absent
    and source_index.payment_source_unique_index_present
    and foundation_counts.cash_transaction_rows = 0
    and foundation_counts.opening_balance_rows = 0
    and foundation_counts.cash_audit_rows = 0
    and foundation_counts.opening_audit_rows = 0
    and foundation_counts.legacy_ledger_rows = 267
    and foundation_counts.compensation_rows = 33
    and uat_payments.payment_9700_matches = 1
    and uat_payments.payment_4850_matches = 1
    and uat_cash.uat_payment_source_cash_rows = 0
  ) as payment_finance_cash_integration_preflight_pass
from catalog
cross join source_index
cross join foundation_counts
cross join uat_payments
cross join uat_cash;
