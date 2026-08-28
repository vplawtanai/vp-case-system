-- SELECT-only post-apply verification for Migration 025.
-- Returns one row and performs no RPC or mutation.

with relation_state as (
  select
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regclass('public.finance_cash_transaction_audit_events') is not null as cash_audit_present,
    to_regclass('public.finance_account_opening_balance_audit_events') is not null as opening_audit_present,
    to_regclass('public.finance_cash_account_balance_summary') is not null as balance_view_present
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
       )) as cash_transaction_columns_correct,
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
       )) as opening_balance_columns_correct,
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
       and is_nullable = 'NO'
       and column_default ilike 'false%') as finance_cash_permission_columns_correct
), foreign_key_state as (
  select
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and contype = 'f'
        and confrelid = 'public.finance_payments'::regclass
        and pg_get_constraintdef(oid) like '%source_payment_id%'
        and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
    ) as payment_source_fk_restrict,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and contype = 'f'
        and confrelid = 'public.finance_cash_transactions'::regclass
        and pg_get_constraintdef(oid) like '%reversal_of_transaction_id%'
        and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
    ) as reversal_fk_restrict,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_account_opening_balances'::regclass
        and contype = 'f'
        and confrelid = 'public.finance_account_opening_balances'::regclass
        and pg_get_constraintdef(oid) like '%supersedes_opening_balance_id%'
        and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
    ) as supersession_fk_restrict,
    (select count(*) = 2
     from pg_constraint
     where contype = 'f'
       and conrelid in (
         'public.finance_cash_transactions'::regclass,
         'public.finance_account_opening_balances'::regclass
       )
       and confrelid = 'public.finance_bank_accounts'::regclass
       and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%') as bank_account_fks_restrict
), constraint_state as (
  select
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_amount_check'
        and pg_get_constraintdef(oid) like '%cash_amount >%0%'
    ) as positive_cash_amount_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_direction_check'
        and pg_get_constraintdef(oid) like '%inflow%'
        and pg_get_constraintdef(oid) like '%outflow%'
    ) as cash_direction_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_status_check'
        and pg_get_constraintdef(oid) like '%draft%'
        and pg_get_constraintdef(oid) like '%confirmed%'
        and pg_get_constraintdef(oid) like '%cancelled%'
    ) as cash_status_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_source_contract_check'
        and pg_get_constraintdef(oid) like '%customer_payment%'
        and pg_get_constraintdef(oid) like '%reversal%'
    ) as source_and_reversal_shape_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_cash_transactions'::regclass
        and conname = 'finance_cash_transactions_no_self_reversal_check'
    ) as self_reversal_blocked,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_account_opening_balances'::regclass
        and conname = 'finance_opening_balances_status_check'
        and pg_get_constraintdef(oid) like '%superseded%'
    ) as opening_lifecycle_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_account_opening_balances'::regclass
        and conname = 'finance_opening_balances_no_self_supersession_check'
    ) as self_supersession_blocked,
    not exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_account_opening_balances'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%balance_amount >%'
    ) as signed_opening_balance_allowed
), index_state as (
  select
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_cash_transactions'
        and indexname = 'uq_finance_cash_transactions_source_payment'
        and indexdef ilike '%unique%'
        and indexdef ilike '%source_payment_id%'
        and indexdef ilike '%reversal_of_transaction_id is null%'
    ) as original_payment_source_unique,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_cash_transactions'
        and indexname = 'uq_finance_cash_transactions_reversal'
        and indexdef ilike '%unique%'
        and indexdef ilike '%reversal_of_transaction_id%'
    ) as one_reversal_per_original,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_account_opening_balances'
        and indexname = 'uq_finance_opening_balances_current'
        and indexdef ilike '%unique%'
        and indexdef ilike '%bank_account_id%'
        and indexdef ilike '%currency%'
        and indexdef ilike '%status =%confirmed%'
    ) as one_current_opening_per_account_currency,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_account_opening_balances'
        and indexname = 'uq_finance_opening_balances_supersedes'
        and indexdef ilike '%unique%'
        and indexdef ilike '%supersedes_opening_balance_id%'
    ) as one_replacement_per_opening
), trigger_state as (
  select
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
       )) as all_foundation_triggers_present,
    (select count(*) = 2
     from pg_trigger
     where not tgisinternal
       and tgname in (
         'finance_cash_transaction_integrity',
         'finance_opening_balance_integrity'
       )
       and tgdeferrable
       and tginitdeferred) as integrity_triggers_deferred
), rls_state as (
  select
    (select count(*) = 4
     from pg_class as class_record
     where class_record.oid in (
       'public.finance_cash_transactions'::regclass,
       'public.finance_account_opening_balances'::regclass,
       'public.finance_cash_transaction_audit_events'::regclass,
       'public.finance_account_opening_balance_audit_events'::regclass
     )
       and class_record.relrowsecurity) as rls_enabled_on_all_tables,
    (select count(*) = 4
     from pg_policies
     where schemaname = 'public'
       and tablename in (
         'finance_cash_transactions',
         'finance_account_opening_balances',
         'finance_cash_transaction_audit_events',
         'finance_account_opening_balance_audit_events'
       )
       and cmd = 'SELECT') as select_policies_present,
    not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'finance_cash_transactions',
          'finance_account_opening_balances',
          'finance_cash_transaction_audit_events',
          'finance_account_opening_balance_audit_events'
        )
        and cmd <> 'SELECT'
    ) as no_browser_mutation_policies
), grant_state as (
  select
    has_table_privilege('authenticated', 'public.finance_cash_transactions', 'SELECT')
      and has_table_privilege('authenticated', 'public.finance_account_opening_balances', 'SELECT')
      and has_table_privilege('authenticated', 'public.finance_cash_transaction_audit_events', 'SELECT')
      and has_table_privilege('authenticated', 'public.finance_account_opening_balance_audit_events', 'SELECT')
      and has_table_privilege('authenticated', 'public.finance_cash_account_balance_summary', 'SELECT')
      as authenticated_read_grants_present,
    not (
      has_table_privilege('authenticated', 'public.finance_cash_transactions', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_account_opening_balances', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_cash_transaction_audit_events', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_account_opening_balance_audit_events', 'INSERT, UPDATE, DELETE')
    ) as authenticated_direct_mutation_blocked,
    not (
      has_table_privilege('anon', 'public.finance_cash_transactions', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_account_opening_balances', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_cash_transaction_audit_events', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_account_opening_balance_audit_events', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_cash_account_balance_summary', 'SELECT')
    ) as anon_access_blocked
), function_state as (
  select
    count(*) = 13 as all_functions_present,
    count(distinct function_record.proowner) = 1 as functions_share_trusted_owner,
    bool_and(function_record.prosecdef) as all_functions_security_definer,
    bool_and(
      coalesce(function_record.proconfig, array[]::text[])
      @> array['search_path=public']
    ) as all_functions_fixed_public_search_path
  from pg_proc as function_record
  where function_record.oid in (
    'public.current_user_can_view_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_manage_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_confirm_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_reverse_finance_cash_transactions()'::regprocedure,
    'public.current_user_can_view_finance_cash_bank_account(uuid)'::regprocedure,
    'public.protect_finance_cash_permission_fields()'::regprocedure,
    'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure,
    'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
    'public.enforce_finance_cash_transaction_integrity()'::regprocedure,
    'public.enforce_finance_opening_balance_lifecycle()'::regprocedure,
    'public.validate_finance_opening_balance_integrity(uuid)'::regprocedure,
    'public.enforce_finance_opening_balance_integrity()'::regprocedure,
    'public.protect_finance_cash_audit_event()'::regprocedure
  )
), function_grant_state as (
  select
    (select bool_and(
       has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
       and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
     )
     from pg_proc as function_record
     where function_record.oid in (
       'public.current_user_can_view_finance_cash_transactions()'::regprocedure,
       'public.current_user_can_manage_finance_cash_transactions()'::regprocedure,
       'public.current_user_can_confirm_finance_cash_transactions()'::regprocedure,
       'public.current_user_can_reverse_finance_cash_transactions()'::regprocedure,
       'public.current_user_can_view_finance_cash_bank_account(uuid)'::regprocedure
     )) as browser_permission_functions_intentional,
    (select bool_and(
       not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
       and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
     )
     from pg_proc as function_record
     where function_record.oid in (
       'public.protect_finance_cash_permission_fields()'::regprocedure,
       'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure,
       'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
       'public.enforce_finance_cash_transaction_integrity()'::regprocedure,
       'public.enforce_finance_opening_balance_lifecycle()'::regprocedure,
       'public.validate_finance_opening_balance_integrity(uuid)'::regprocedure,
       'public.enforce_finance_opening_balance_integrity()'::regprocedure,
       'public.protect_finance_cash_audit_event()'::regprocedure
     )) as internal_helpers_not_browser_executable
), view_definition_state as (
  select
    view_record.definition,
    regexp_replace(
      translate(lower(view_record.definition), '()', ''),
      '[[:space:]]+',
      '',
      'g'
    ) as normalized_definition
  from pg_views as view_record
  where view_record.schemaname = 'public'
    and view_record.viewname = 'finance_cash_account_balance_summary'
), view_state as (
  select
    definition not ilike '%finance_company_ledger%' as legacy_excluded,
    normalized_definition like '%opening_balance.status=''confirmed''%'
      as confirmed_opening_only,
    normalized_definition like '%cash_transaction.status=''confirmed''%'
      as confirmed_transactions_only,
    normalized_definition like '%whencurrent_opening.idisnullthennull%'
      as uninitialized_balance_is_null,
    normalized_definition like '%current_opening.balance_amount+movement.confirmed_inflow_after_opening-movement.confirmed_outflow_after_opening%'
      as direction_balance_formula_present
  from view_definition_state
), row_state as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows,
    (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    (select count(*) from public.finance_payments) as total_payment_rows
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
  'FINANCE_CASH_TRANSACTION_FOUNDATION_VERIFICATION' as report_section,
  relation_state.*,
  column_state.*,
  foreign_key_state.*,
  constraint_state.*,
  index_state.*,
  trigger_state.*,
  rls_state.*,
  grant_state.*,
  function_state.*,
  function_grant_state.*,
  view_state.*,
  row_state.*,
  target_payment_state.*,
  downstream_state.*,
  (
    relation_state.cash_transactions_present
    and relation_state.opening_balances_present
    and relation_state.cash_audit_present
    and relation_state.opening_audit_present
    and relation_state.balance_view_present
    and column_state.cash_transaction_columns_correct
    and column_state.opening_balance_columns_correct
    and column_state.finance_cash_permission_columns_correct
    and foreign_key_state.payment_source_fk_restrict
    and foreign_key_state.reversal_fk_restrict
    and foreign_key_state.supersession_fk_restrict
    and foreign_key_state.bank_account_fks_restrict
    and constraint_state.positive_cash_amount_enforced
    and constraint_state.cash_direction_enforced
    and constraint_state.cash_status_enforced
    and constraint_state.source_and_reversal_shape_enforced
    and constraint_state.self_reversal_blocked
    and constraint_state.opening_lifecycle_enforced
    and constraint_state.self_supersession_blocked
    and constraint_state.signed_opening_balance_allowed
    and index_state.original_payment_source_unique
    and index_state.one_reversal_per_original
    and index_state.one_current_opening_per_account_currency
    and index_state.one_replacement_per_opening
    and trigger_state.all_foundation_triggers_present
    and trigger_state.integrity_triggers_deferred
    and rls_state.rls_enabled_on_all_tables
    and rls_state.select_policies_present
    and rls_state.no_browser_mutation_policies
    and grant_state.authenticated_read_grants_present
    and grant_state.authenticated_direct_mutation_blocked
    and grant_state.anon_access_blocked
    and function_state.all_functions_present
    and function_state.functions_share_trusted_owner
    and function_state.all_functions_security_definer
    and function_state.all_functions_fixed_public_search_path
    and function_grant_state.browser_permission_functions_intentional
    and function_grant_state.internal_helpers_not_browser_executable
    and view_state.legacy_excluded
    and view_state.confirmed_opening_only
    and view_state.confirmed_transactions_only
    and view_state.uninitialized_balance_is_null
    and view_state.direction_balance_formula_present
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
  ) as finance_cash_transaction_foundation_verification_pass
from relation_state
cross join column_state
cross join foreign_key_state
cross join constraint_state
cross join index_state
cross join trigger_state
cross join rls_state
cross join grant_state
cross join function_state
cross join function_grant_state
cross join view_state
cross join row_state
cross join target_payment_state
cross join downstream_state;
