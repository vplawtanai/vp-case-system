-- SELECT-only preflight for Migration 025.
-- Returns one row and performs no RPC or mutation.

with relation_state as (
  select
    to_regclass('public.finance_bank_accounts') is not null as bank_accounts_present,
    to_regclass('public.finance_bank_account_access') is not null as bank_access_present,
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as payment_allocations_present,
    to_regclass('public.finance_company_ledger') is not null as legacy_ledger_present,
    to_regclass('public.finance_compensation_batches') is not null as compensation_present,
    to_regclass('public.finance_cash_transactions') is null as cash_transactions_name_available,
    to_regclass('public.finance_account_opening_balances') is null as opening_balances_name_available,
    to_regclass('public.finance_cash_transaction_audit_events') is null as cash_audit_name_available,
    to_regclass('public.finance_account_opening_balance_audit_events') is null as opening_audit_name_available,
    to_regclass('public.finance_cash_account_balance_summary') is null as balance_view_name_available
), column_state as (
  select
    (select count(*) = 6
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'finance_bank_accounts'
       and column_name in ('id', 'short_name', 'bank_name', 'account_name', 'account_number', 'is_active'))
      as bank_account_contract_present,
    (select count(*) = 3
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'finance_bank_account_access'
       and column_name in ('user_profile_id', 'bank_account_id', 'can_view'))
      as bank_access_contract_present,
    (select count(*) = 7
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'finance_payments'
       and column_name in (
         'id', 'status', 'cash_amount', 'wht_amount', 'currency', 'received_on', 'receiving_bank_account_id'
       )) as payment_source_contract_present,
    (select count(*) = 10
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_profiles'
       and column_name in (
         'id', 'active', 'role',
         'can_manage_finance_payments',
         'can_confirm_finance_payments',
         'can_reverse_finance_payments',
         'can_view_company_ledger',
         'can_edit_company_ledger',
         'can_void_company_ledger',
         'financial_access'
       )) as existing_finance_permission_contract_present,
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_profiles'
        and column_name in (
          'can_view_finance_cash_transactions',
          'can_manage_finance_cash_transactions',
          'can_confirm_finance_cash_transactions',
          'can_reverse_finance_cash_transactions'
        )
    ) as finance_cash_permission_names_available
), function_state as (
  select
    to_regprocedure('public.current_user_can_view_finance_payments()') is not null
      as payment_view_permission_present,
    to_regprocedure('public.current_user_can_manage_finance_payments()') is not null
      as payment_manage_permission_present,
    to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is not null
      as payment_confirm_rpc_present,
    to_regprocedure('public.reverse_finance_payment(uuid,text)') is not null
      as payment_reverse_rpc_present,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null
      as invoice_void_rpc_present,
    not exists (
      select 1
      from pg_proc as function_record
      join pg_namespace as namespace_record
        on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname in (
          'current_user_can_view_finance_cash_transactions',
          'current_user_can_manage_finance_cash_transactions',
          'current_user_can_confirm_finance_cash_transactions',
          'current_user_can_reverse_finance_cash_transactions',
          'current_user_can_view_finance_cash_bank_account',
          'protect_finance_cash_permission_fields',
          'enforce_finance_cash_transaction_lifecycle',
          'validate_finance_cash_transaction_integrity',
          'enforce_finance_cash_transaction_integrity',
          'enforce_finance_opening_balance_lifecycle',
          'validate_finance_opening_balance_integrity',
          'enforce_finance_opening_balance_integrity',
          'protect_finance_cash_audit_event'
        )
    ) as finance_cash_function_names_available
), financial_baseline as (
  select
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as total_payment_rows,
    (select count(*)
     from public.finance_expense_claims
     where status = 'approved'
       and ledger_entry_id is null) as approved_expense_claims_not_posted
), target_payment_baseline as (
  select
    count(distinct payment.id) filter (where payment.status = 'confirmed') as confirmed_payment_count,
    coalesce(sum(payment.cash_amount) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_cash_amount,
    coalesce(sum(payment.wht_amount) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_wht_amount,
    coalesce(sum(allocation.settlement_total) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_settlement_amount
  from public.finance_invoices as invoice
  left join public.finance_payment_invoice_allocations as allocation
    on allocation.invoice_id = invoice.id
  left join public.finance_payments as payment
    on payment.id = allocation.payment_id
  where invoice.invoice_no = 'VP-IV-202608-000002'
), existing_cash_rows as (
  select
    case
      when to_regclass('public.finance_cash_transactions') is null then 0
      else -1
    end as cash_transaction_rows_before_migration,
    case
      when to_regclass('public.finance_account_opening_balances') is null then 0
      else -1
    end as opening_balance_rows_before_migration
), downstream_state as (
  select
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  'FINANCE_CASH_TRANSACTION_FOUNDATION_PREFLIGHT' as report_section,
  relation_state.*,
  column_state.*,
  function_state.*,
  financial_baseline.*,
  target_payment_baseline.*,
  existing_cash_rows.*,
  downstream_state.*,
  (
    relation_state.bank_accounts_present
    and relation_state.bank_access_present
    and relation_state.payments_present
    and relation_state.payment_allocations_present
    and relation_state.legacy_ledger_present
    and relation_state.compensation_present
    and relation_state.cash_transactions_name_available
    and relation_state.opening_balances_name_available
    and relation_state.cash_audit_name_available
    and relation_state.opening_audit_name_available
    and relation_state.balance_view_name_available
    and column_state.bank_account_contract_present
    and column_state.bank_access_contract_present
    and column_state.payment_source_contract_present
    and column_state.existing_finance_permission_contract_present
    and column_state.finance_cash_permission_names_available
    and function_state.payment_view_permission_present
    and function_state.payment_manage_permission_present
    and function_state.payment_confirm_rpc_present
    and function_state.payment_reverse_rpc_present
    and function_state.invoice_void_rpc_present
    and function_state.finance_cash_function_names_available
    and financial_baseline.legacy_ledger_rows = 267
    and financial_baseline.compensation_rows = 33
    and target_payment_baseline.confirmed_payment_count = 2
    and target_payment_baseline.confirmed_cash_amount = 14550.00::numeric
    and target_payment_baseline.confirmed_wht_amount = 450.00::numeric
    and target_payment_baseline.confirmed_settlement_amount = 15000.00::numeric
    and existing_cash_rows.cash_transaction_rows_before_migration = 0
    and existing_cash_rows.opening_balance_rows_before_migration = 0
    and downstream_state.receipt_object_absent
    and downstream_state.tax_invoice_object_absent
  ) as finance_cash_transaction_foundation_preflight_pass
from relation_state
cross join column_state
cross join function_state
cross join financial_baseline
cross join target_payment_baseline
cross join existing_cash_rows
cross join downstream_state;
