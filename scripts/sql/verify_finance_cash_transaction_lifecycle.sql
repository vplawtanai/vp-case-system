-- SELECT-only post-apply verification for Migration 026.
-- Returns one row and performs no RPC or mutation.

with function_state as (
  select
    count(*) = 14 as lifecycle_functions_present,
    count(distinct function_record.proowner) = 1 as lifecycle_functions_share_owner,
    bool_and(function_record.prosecdef) as lifecycle_functions_security_definer,
    bool_and(
      coalesce(function_record.proconfig, array[]::text[])
      @> array['search_path=public']
    ) as lifecycle_functions_fixed_public_search_path,
    bool_and(
      function_record.proowner = (
        select permission_function.proowner
        from pg_proc as permission_function
        where permission_function.oid =
          'public.current_user_can_manage_finance_cash_transactions()'::regprocedure
      )
    ) as lifecycle_functions_use_foundation_owner
  from pg_proc as function_record
  where function_record.oid in (
    'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
    'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
    'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
    'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
    'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
    'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
    'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
    'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
    'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
    'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
  )
), function_grant_state as (
  select
    (select count(*) = 9
     from pg_proc as function_record
     where function_record.oid in (
       'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
       'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
       'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
       'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
       'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
       'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
       'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
       'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
       'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
     )
       and has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
       and not has_function_privilege('anon', function_record.oid, 'EXECUTE'))
      as authenticated_rpc_grants_intentional,
    (select count(*) = 5
     from pg_proc as function_record
     where function_record.oid in (
       'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
       'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
       'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
       'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
       'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure
     )
       and not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
       and not has_function_privilege('anon', function_record.oid, 'EXECUTE'))
      as internal_helpers_not_browser_executable
), function_definition_state as (
  select
    pg_get_functiondef(
      'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure
    ) as opening_create_definition,
    pg_get_functiondef(
      'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure
    ) as opening_save_definition,
    pg_get_functiondef(
      'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure
    ) as opening_replacement_definition,
    pg_get_functiondef(
      'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure
    ) as opening_confirm_definition,
    pg_get_functiondef(
      'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure
    ) as opening_cancel_definition,
    pg_get_functiondef(
      'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure
    ) as cash_create_definition,
    pg_get_functiondef(
      'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure
    ) as cash_save_definition,
    pg_get_functiondef(
      'public.confirm_finance_cash_transaction(uuid)'::regprocedure
    ) as cash_confirm_definition,
    pg_get_functiondef(
      'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
    ) as cash_cancel_definition,
    pg_get_functiondef(
      'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure
    ) as manual_input_definition,
    pg_get_functiondef(
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure
    ) as cash_integrity_definition
), lifecycle_contract_state as (
  select
    opening_create_definition ilike '%current_user_can_manage_finance_cash_transactions%'
      and opening_create_definition ilike '%record_finance_opening_balance_audit_event%'
      and opening_create_definition ilike '%draft_created%'
      as opening_create_controlled,
    opening_save_definition ilike '%status <> ''draft''%'
      and opening_save_definition ilike '%record_finance_opening_balance_audit_event%'
      and opening_save_definition ilike '%draft_saved%'
      as opening_save_controlled,
    opening_replacement_definition ilike '%supersedes_opening_balance_id%'
      and opening_replacement_definition ilike '%status <> ''confirmed''%'
      and opening_replacement_definition ilike '%record_finance_opening_balance_audit_event%'
      as opening_replacement_controlled,
    opening_confirm_definition ilike '%current_user_can_confirm_finance_cash_transactions%'
      and opening_confirm_definition ilike '%p_independent_balance_acknowledged is distinct from true%'
      and opening_confirm_definition ilike '%FINANCE_CASH_OPENING_BALANCE_ACKNOWLEDGEMENT_REQUIRED%'
      and opening_confirm_definition ilike '%status = ''superseded''%'
      and opening_confirm_definition ilike '%record_finance_opening_balance_audit_event%'
      and opening_confirm_definition ilike '%legacy_balance_used%false%'
      as opening_confirm_and_supersession_controlled,
    opening_cancel_definition ilike '%current_user_can_manage_finance_cash_transactions%'
      and opening_cancel_definition ilike '%status <> ''draft''%'
      and opening_cancel_definition ilike '%v_cancel_reason is null%'
      and opening_cancel_definition ilike '%record_finance_opening_balance_audit_event%'
      as opening_cancel_controlled,
    cash_create_definition ilike '%current_user_can_manage_finance_cash_transactions%'
      and cash_create_definition ilike '%assert_finance_manual_cash_transaction_input%'
      and cash_create_definition ilike '%source_payment_id%null%'
      and cash_create_definition ilike '%reversal_of_transaction_id%null%'
      and cash_create_definition ilike '%record_finance_cash_transaction_audit_event%'
      as cash_create_manual_only,
    cash_save_definition ilike '%status <> ''draft''%'
      and cash_save_definition ilike '%FINANCE_CASH_MANUAL_SOURCE_REQUIRED%'
      and cash_save_definition ilike '%assert_finance_manual_cash_transaction_input%'
      and cash_save_definition ilike '%record_finance_cash_transaction_audit_event%'
      as cash_save_manual_only,
    cash_confirm_definition ilike '%current_user_can_confirm_finance_cash_transactions%'
      and cash_confirm_definition ilike '%FINANCE_CASH_OPENING_BALANCE_REQUIRED%'
      and cash_confirm_definition ilike '%FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER%'
      and cash_confirm_definition ilike '%occurred_at <= v_opening_balance.as_of%'
      and cash_confirm_definition ilike '%record_finance_cash_transaction_audit_event%'
      as cash_confirm_cutover_guarded,
    cash_cancel_definition ilike '%current_user_can_manage_finance_cash_transactions%'
      and cash_cancel_definition ilike '%status <> ''draft''%'
      and cash_cancel_definition ilike '%v_cancel_reason is null%'
      and cash_cancel_definition ilike '%record_finance_cash_transaction_audit_event%'
      as cash_cancel_controlled,
    manual_input_definition ilike '%customer_payment%'
      and manual_input_definition ilike '%expense_claim%'
      and manual_input_definition ilike '%transfer%'
      and manual_input_definition ilike '%reversal%'
      and manual_input_definition ilike '%FINANCE_CASH_MANUAL_TYPE_REQUIRED%'
      and manual_input_definition ilike '%manual_inflow%'
      and manual_input_definition ilike '%manual_outflow%'
      as reserved_types_blocked_from_manual_rpc,
    cash_integrity_definition ilike '%FINANCE_CASH_OPENING_BALANCE_REQUIRED%'
      and cash_integrity_definition ilike '%FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER%'
      and cash_integrity_definition ilike '%occurred_at <= v_opening_balance.as_of%'
      as database_integrity_cutover_gate_present
  from function_definition_state
), index_state as (
  select
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_account_opening_balances'
        and indexname = 'uq_finance_opening_balances_initial_draft'
        and indexdef ilike '%unique%'
        and indexdef ilike '%status =%draft%'
        and indexdef ilike '%supersedes_opening_balance_id is null%'
    ) as one_initial_draft_per_account_currency,
    exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'finance_account_opening_balances'
        and indexname = 'uq_finance_opening_balances_supersedes'
        and indexdef ilike '%unique%'
        and indexdef ilike '%supersedes_opening_balance_id%'
        and indexdef ilike '%status <>%cancelled%'
    ) as one_effective_replacement_per_opening
), security_state as (
  select
    (select count(*) = 4
     from pg_class as class_record
     where class_record.oid in (
       'public.finance_cash_transactions'::regclass,
       'public.finance_account_opening_balances'::regclass,
       'public.finance_cash_transaction_audit_events'::regclass,
       'public.finance_account_opening_balance_audit_events'::regclass
     )
       and class_record.relrowsecurity) as rls_remains_enabled,
    not (
      has_table_privilege('authenticated', 'public.finance_cash_transactions', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_account_opening_balances', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_cash_transaction_audit_events', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_account_opening_balance_audit_events', 'INSERT, UPDATE, DELETE')
    ) as authenticated_direct_mutation_blocked,
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
       )) as lifecycle_and_immutability_triggers_present,
    pg_get_functiondef(
      'public.enforce_finance_cash_transaction_lifecycle()'::regprocedure
    ) ilike '%Confirmed or Cancelled Finance Cash Transactions are immutable%'
      as confirmed_cash_immutability_preserved,
    pg_get_functiondef(
      'public.enforce_finance_opening_balance_lifecycle()'::regprocedure
    ) ilike '%Confirmed, Superseded, or Cancelled Opening Balance evidence is immutable%'
      as confirmed_opening_immutability_preserved
), view_definition_state as (
  select
    definition,
    regexp_replace(
      translate(lower(definition), '()', ''),
      '[[:space:]]+',
      '',
      'g'
    ) as normalized_definition
  from pg_views
  where schemaname = 'public'
    and viewname = 'finance_cash_account_balance_summary'
), view_state as (
  select
    definition not ilike '%finance_company_ledger%' as legacy_excluded,
    normalized_definition like '%opening_balance.status=''confirmed''%'
      as confirmed_opening_only,
    normalized_definition like '%cash_transaction.status=''confirmed''%'
      as confirmed_transactions_only,
    regexp_count(
      normalized_definition,
      'cash_transaction\.occurred_at[^<>=]{0,160}>[^<>=]{0,160}current_opening(_[0-9]+)?\.as_of'
    ) = 3
    and regexp_count(
      normalized_definition,
      'cash_transaction\.occurred_at[^<>=]{0,160}>=[^<>=]{0,160}current_opening(_[0-9]+)?\.as_of'
    ) = 0
      as post_opening_transactions_only,
    normalized_definition like '%whencurrent_opening.idisnullthennull%'
      as uninitialized_balance_is_null,
    normalized_definition like '%current_opening.balance_amount+movement.confirmed_inflow_after_opening-movement.confirmed_outflow_after_opening%'
      as balance_formula_unchanged
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
  'FINANCE_CASH_TRANSACTION_LIFECYCLE_VERIFICATION' as report_section,
  function_state.*,
  function_grant_state.*,
  lifecycle_contract_state.*,
  index_state.*,
  security_state.*,
  view_state.*,
  row_state.*,
  target_payment_state.*,
  downstream_state.*,
  (
    function_state.lifecycle_functions_present
    and function_state.lifecycle_functions_share_owner
    and function_state.lifecycle_functions_security_definer
    and function_state.lifecycle_functions_fixed_public_search_path
    and function_state.lifecycle_functions_use_foundation_owner
    and function_grant_state.authenticated_rpc_grants_intentional
    and function_grant_state.internal_helpers_not_browser_executable
    and lifecycle_contract_state.opening_create_controlled
    and lifecycle_contract_state.opening_save_controlled
    and lifecycle_contract_state.opening_replacement_controlled
    and lifecycle_contract_state.opening_confirm_and_supersession_controlled
    and lifecycle_contract_state.opening_cancel_controlled
    and lifecycle_contract_state.cash_create_manual_only
    and lifecycle_contract_state.cash_save_manual_only
    and lifecycle_contract_state.cash_confirm_cutover_guarded
    and lifecycle_contract_state.cash_cancel_controlled
    and lifecycle_contract_state.reserved_types_blocked_from_manual_rpc
    and lifecycle_contract_state.database_integrity_cutover_gate_present
    and index_state.one_initial_draft_per_account_currency
    and index_state.one_effective_replacement_per_opening
    and security_state.rls_remains_enabled
    and security_state.authenticated_direct_mutation_blocked
    and security_state.lifecycle_and_immutability_triggers_present
    and security_state.confirmed_cash_immutability_preserved
    and security_state.confirmed_opening_immutability_preserved
    and view_state.legacy_excluded
    and view_state.confirmed_opening_only
    and view_state.confirmed_transactions_only
    and view_state.post_opening_transactions_only
    and view_state.uninitialized_balance_is_null
    and view_state.balance_formula_unchanged
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
  ) as finance_cash_transaction_lifecycle_verification_pass
from function_state
cross join function_grant_state
cross join lifecycle_contract_state
cross join index_state
cross join security_state
cross join view_state
cross join row_state
cross join target_payment_state
cross join downstream_state;
