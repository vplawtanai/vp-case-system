-- SELECT-only preflight for Migration 026.
-- Returns one row and performs no RPC or mutation.

with relation_state as (
  select
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regclass('public.finance_cash_transaction_audit_events') is not null as cash_audit_present,
    to_regclass('public.finance_account_opening_balance_audit_events') is not null as opening_audit_present,
    to_regclass('public.finance_cash_account_balance_summary') is not null as balance_view_present,
    to_regclass('public.finance_bank_accounts') is not null as bank_accounts_present,
    to_regclass('public.finance_bank_account_access') is not null as bank_access_present
), column_state as (
  select
    (select count(*) = 22
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'finance_cash_transactions'
       and column_name in (
         'id', 'occurred_at', 'direction', 'transaction_type', 'bank_account_id',
         'cash_amount', 'currency', 'status', 'source_payment_id', 'reference_no',
         'description', 'note', 'reversal_of_transaction_id', 'created_at',
         'created_by_user_id', 'updated_at', 'updated_by_user_id', 'confirmed_at',
         'confirmed_by_user_id', 'cancelled_at', 'cancelled_by_user_id', 'cancel_reason'
       )) as cash_contract_present,
    (select count(*) = 20
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'finance_account_opening_balances'
       and column_name in (
         'id', 'bank_account_id', 'currency', 'as_of', 'balance_amount', 'status',
         'evidence_reference', 'note', 'supersedes_opening_balance_id', 'created_at',
         'created_by_user_id', 'updated_at', 'updated_by_user_id', 'confirmed_at',
         'confirmed_by_user_id', 'cancelled_at', 'cancelled_by_user_id', 'cancel_reason',
         'superseded_at', 'superseded_by_user_id'
       )) as opening_contract_present,
    (select count(*) = 4
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'user_profiles'
       and column_name in (
         'can_view_finance_cash_transactions',
         'can_manage_finance_cash_transactions',
         'can_confirm_finance_cash_transactions',
         'can_reverse_finance_cash_transactions'
       )
       and data_type = 'boolean'
       and is_nullable = 'NO') as permission_columns_present
), foundation_contract_state as (
  select
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_type_check'
        and pg_get_constraintdef(oid) ilike '%customer_payment%'
        and pg_get_constraintdef(oid) ilike '%manual_inflow%'
        and pg_get_constraintdef(oid) ilike '%manual_outflow%'
        and pg_get_constraintdef(oid) ilike '%expense_claim%'
        and pg_get_constraintdef(oid) ilike '%transfer%'
        and pg_get_constraintdef(oid) ilike '%reversal%'
    ) as transaction_types_compatible,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_lifecycle_metadata_check'
        and pg_get_constraintdef(oid) ilike '%draft%'
        and pg_get_constraintdef(oid) ilike '%confirmed%'
        and pg_get_constraintdef(oid) ilike '%cancelled%'
    ) as cash_lifecycle_compatible,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_account_opening_balances'::regclass
        and conname = 'finance_opening_balances_lifecycle_metadata_check'
        and pg_get_constraintdef(oid) ilike '%superseded%'
    ) as opening_lifecycle_compatible,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_account_opening_balances'
        and indexname = 'uq_finance_opening_balances_supersedes'
        and indexdef ilike '%unique%'
        and indexdef ilike '%supersedes_opening_balance_id%'
    ) as supersession_index_present,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_cash_transaction_audit_events'::regclass
        and conname = 'finance_cash_transaction_audit_type_check'
        and pg_get_constraintdef(oid) ilike '%draft_created%'
        and pg_get_constraintdef(oid) ilike '%draft_saved%'
        and pg_get_constraintdef(oid) ilike '%confirmed%'
        and pg_get_constraintdef(oid) ilike '%cancelled%'
    ) as cash_audit_contract_compatible,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_account_opening_balance_audit_events'::regclass
        and conname = 'finance_opening_balance_audit_type_check'
        and pg_get_constraintdef(oid) ilike '%draft_created%'
        and pg_get_constraintdef(oid) ilike '%draft_saved%'
        and pg_get_constraintdef(oid) ilike '%confirmed%'
        and pg_get_constraintdef(oid) ilike '%cancelled%'
        and pg_get_constraintdef(oid) ilike '%superseded%'
    ) as opening_audit_contract_compatible,
    (select count(*) = 7
     from pg_trigger
     where not tgisinternal
       and tgname in (
         'protect_finance_cash_permission_fields',
         'finance_cash_transaction_lifecycle_guard',
         'finance_cash_transaction_integrity',
         'finance_opening_balance_lifecycle_guard',
         'finance_opening_balance_integrity',
         'finance_cash_transaction_audit_immutability',
         'finance_opening_balance_audit_immutability'
       )) as foundation_triggers_present
), permission_state as (
  select
    to_regprocedure('public.current_user_can_view_finance_cash_transactions()') is not null
      as view_permission_present,
    to_regprocedure('public.current_user_can_manage_finance_cash_transactions()') is not null
      as manage_permission_present,
    to_regprocedure('public.current_user_can_confirm_finance_cash_transactions()') is not null
      as confirm_permission_present,
    to_regprocedure('public.current_user_can_reverse_finance_cash_transactions()') is not null
      as reverse_permission_present,
    to_regprocedure('public.current_user_can_view_finance_cash_bank_account(uuid)') is not null
      as bank_scope_permission_present
), name_state as (
  select
    to_regclass('public.uq_finance_opening_balances_initial_draft') is null
      as initial_draft_index_name_available,
    not exists (
      select 1
      from pg_proc as function_record
      join pg_namespace as namespace_record
        on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname in (
          'record_finance_cash_transaction_audit_event',
          'record_finance_opening_balance_audit_event',
          'assert_finance_opening_balance_input',
          'assert_finance_manual_cash_transaction_input',
          'create_finance_account_opening_balance_draft',
          'save_finance_account_opening_balance_draft',
          'create_finance_account_opening_balance_replacement_draft',
          'confirm_finance_account_opening_balance',
          'cancel_finance_account_opening_balance_draft',
          'create_finance_cash_transaction_draft',
          'save_finance_cash_transaction_draft',
          'confirm_finance_cash_transaction',
          'cancel_finance_cash_transaction_draft'
        )
    ) as lifecycle_function_names_available
), row_state as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows,
    (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as total_payment_rows,
    (select count(*)
     from public.finance_expense_claims
     where status = 'approved'
       and ledger_entry_id is null) as approved_expense_claims_not_posted
), target_payment_state as (
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
), downstream_state as (
  select
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  'FINANCE_CASH_TRANSACTION_LIFECYCLE_PREFLIGHT' as report_section,
  relation_state.*,
  column_state.*,
  foundation_contract_state.*,
  permission_state.*,
  name_state.*,
  row_state.*,
  target_payment_state.*,
  downstream_state.*,
  (
    relation_state.cash_transactions_present
    and relation_state.opening_balances_present
    and relation_state.cash_audit_present
    and relation_state.opening_audit_present
    and relation_state.balance_view_present
    and relation_state.bank_accounts_present
    and relation_state.bank_access_present
    and column_state.cash_contract_present
    and column_state.opening_contract_present
    and column_state.permission_columns_present
    and foundation_contract_state.transaction_types_compatible
    and foundation_contract_state.cash_lifecycle_compatible
    and foundation_contract_state.opening_lifecycle_compatible
    and foundation_contract_state.supersession_index_present
    and foundation_contract_state.cash_audit_contract_compatible
    and foundation_contract_state.opening_audit_contract_compatible
    and foundation_contract_state.foundation_triggers_present
    and permission_state.view_permission_present
    and permission_state.manage_permission_present
    and permission_state.confirm_permission_present
    and permission_state.reverse_permission_present
    and permission_state.bank_scope_permission_present
    and name_state.initial_draft_index_name_available
    and name_state.lifecycle_function_names_available
    and row_state.cash_transaction_rows = 0
    and row_state.opening_balance_rows = 0
    and row_state.cash_audit_rows = 0
    and row_state.opening_audit_rows = 0
    and row_state.legacy_ledger_rows = 267
    and row_state.compensation_rows = 33
    and target_payment_state.confirmed_payment_count = 2
    and target_payment_state.confirmed_cash_amount = 14550.00::numeric
    and target_payment_state.confirmed_wht_amount = 450.00::numeric
    and target_payment_state.confirmed_settlement_amount = 15000.00::numeric
    and downstream_state.receipt_object_absent
    and downstream_state.tax_invoice_object_absent
  ) as finance_cash_transaction_lifecycle_preflight_pass
from relation_state
cross join column_state
cross join foundation_contract_state
cross join permission_state
cross join name_state
cross join row_state
cross join target_payment_state
cross join downstream_state;
