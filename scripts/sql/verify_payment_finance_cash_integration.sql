-- Phase 5D-D post-apply verifier.
-- SELECT-only. Returns exactly one result row and performs no RPC or mutation.

with function_definitions as (
  select
    lower(pg_get_functiondef('public.finance_bangkok_completed_day_end(date)'::regprocedure))
      as completed_day_definition,
    lower(pg_get_functiondef('public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure))
      as posting_definition,
    lower(pg_get_functiondef('public.confirm_finance_payment(uuid,boolean)'::regprocedure))
      as payment_confirm_definition,
    lower(pg_get_functiondef('public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure))
      as opening_gap_definition,
    lower(pg_get_functiondef('public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure))
      as opening_input_definition,
    lower(pg_get_functiondef('public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure))
      as opening_confirm_definition,
    lower(pg_get_functiondef('public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure))
      as reversal_guard_definition,
    lower(pg_get_functiondef('public.reverse_finance_payment(uuid,text)'::regprocedure))
      as payment_reverse_definition
),
function_security as (
  select
    count(*) = 7 as all_expected_functions_present,
    bool_and(prosecdef) as all_security_definer,
    bool_and(coalesce(proconfig, array[]::text[]) @> array['search_path=public'])
      as all_fixed_public_search_path,
    count(distinct proowner) = 1 as one_trusted_owner
  from pg_proc
  where oid in (
    'public.finance_bangkok_completed_day_end(date)'::regprocedure,
    'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
    'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure,
    'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure,
    'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'public.confirm_finance_payment(uuid,boolean)'::regprocedure
  )
),
grants as (
  select
    has_function_privilege('authenticated', 'public.confirm_finance_payment(uuid,boolean)'::regprocedure, 'EXECUTE')
      and has_function_privilege('authenticated', 'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.confirm_finance_payment(uuid,boolean)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure, 'EXECUTE')
      as external_rpc_grants_correct,
    not has_function_privilege('authenticated', 'public.finance_bangkok_completed_day_end(date)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.finance_bangkok_completed_day_end(date)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.assert_finance_opening_balance_has_no_unposted_payments(uuid,text,timestamp with time zone)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure, 'EXECUTE')
      and not has_function_privilege('anon', 'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure, 'EXECUTE')
      as internal_helpers_browser_inaccessible
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
  ) as one_original_cash_per_payment_enforced
),
semantics as (
  select
    completed_day_definition like '%asia/bangkok%'
      and completed_day_definition like '%p_calendar_date + 1%'
      and completed_day_definition like '%1 microsecond%'
      as bangkok_completed_day_semantics_present,
    posting_definition like '%v_payment.cash_amount = 0%'
      and posting_definition like '%not_required_zero_cash%'
      as zero_cash_skips_posting,
    posting_definition like '%pre_cutover_no_opening%'
      and posting_definition like '%v_opening_balance.id is null%'
      as no_opening_is_pre_cutover,
    posting_definition like '%v_payment.received_on <= v_cutoff_date%'
      and posting_definition like '%pre_cutover_date%'
      as on_or_before_cutoff_skips_posting,
    posting_definition like '%finance_cash_receiving_account_required%'
      and posting_definition like '%receiving_bank_account_id is null%'
      as receiving_account_guard_present,
    posting_definition like '%insert into public.finance_cash_transactions%'
      and posting_definition like '%''inflow''%'
      and posting_definition like '%''customer_payment''%'
      and posting_definition like '%v_payment.cash_amount%'
      and posting_definition like '%v_payment.id%'
      and posting_definition like '%''confirmed''%'
      as payment_cash_insert_contract_present,
    posting_definition not like '%v_payment.settlement_amount%'
      and posting_definition like '%wht_amount_excluded%'
      as cash_only_wht_excluded,
    posting_definition like '%v_existing_cash%'
      and posting_definition like '%idempotent_existing_row%'
      as helper_retry_path_present,
    payment_confirm_definition like '%update public.finance_payments%'
      and payment_confirm_definition like '%post_confirmed_payment_to_finance_cash_transaction%'
      and payment_confirm_definition like '%record_finance_payment_audit_event%'
      and strpos(payment_confirm_definition, 'update public.finance_payments')
        < strpos(payment_confirm_definition, 'post_confirmed_payment_to_finance_cash_transaction')
      and strpos(payment_confirm_definition, 'post_confirmed_payment_to_finance_cash_transaction')
        < strpos(payment_confirm_definition, 'record_finance_payment_audit_event')
      as payment_confirmation_atomic_order_present,
    payment_confirm_definition like '%if v_payment.status = ''confirmed''%'
      and strpos(payment_confirm_definition, 'if v_payment.status = ''confirmed''')
        < strpos(payment_confirm_definition, 'post_confirmed_payment_to_finance_cash_transaction')
      as existing_confirmed_payment_no_backfill_path_present,
    payment_confirm_definition like '%cash_posting_outcome%'
      and payment_confirm_definition like '%cash_transaction_id%'
      and payment_confirm_definition like '%wht_excluded_from_cash_posting%'
      as payment_audit_trace_present,
    posting_definition like '%record_finance_cash_transaction_audit_event%'
      and posting_definition like '%automatic_source%'
      and posting_definition like '%accounting_effective_occurred_at%'
      as cash_audit_trace_present,
    opening_gap_definition like '%finance_cash_unposted_payment_after_cutover%'
      and opening_gap_definition like '%payment.received_on > v_cutoff_date%'
      and opening_gap_definition like '%payment.cash_amount > 0%'
      and opening_gap_definition like '%source_payment_id = payment.id%'
      as historical_opening_gap_guard_present,
    opening_input_definition like '%finance_cash_opening_balance_end_of_day_required%'
      and opening_input_definition like '%finance_bangkok_completed_day_end%'
      as opening_cutoff_end_of_day_guard_present,
    opening_confirm_definition like '%assert_finance_opening_balance_has_no_unposted_payments%'
      and strpos(opening_confirm_definition, 'assert_finance_opening_balance_has_no_unposted_payments')
        < strpos(opening_confirm_definition, 'for update')
      as opening_confirmation_invokes_gap_guard,
    reversal_guard_definition like '%finance_payment_has_cash_transaction%'
      and reversal_guard_definition like '%source_payment_id = p_payment_id%'
      and payment_reverse_definition like '%assert_finance_payment_has_no_downstream_dependencies%'
      as payment_reversal_cash_blocker_present,
    posting_definition like '%from public.finance_payments%'
      and posting_definition like '%where id = p_payment_id%'
      and posting_definition not like '%finance_payment_invoice_allocations%'
      as one_payment_level_posting_model_present
  from function_definitions
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
    (select coalesce(sum(cash_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_cash,
    (select coalesce(sum(wht_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_wht,
    (select coalesce(sum(settlement_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_settlement
),
uat_safety as (
  select
    (
      select count(*)
      from public.finance_cash_transactions
      where source_payment_id in (
        '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid,
        '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
      )
    ) as existing_uat_payment_source_cash_rows,
    (
      select count(*)
      from public.finance_payments
      where (
        id = '1bf5c211-d9e6-4e86-b227-67d8bf48af1c'::uuid
        and status = 'confirmed'
        and cash_amount = 9700
      ) or (
        id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
        and status = 'confirmed'
        and cash_amount = 4850
      )
    ) as existing_uat_payments_unchanged
),
optional_objects as (
  select
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  'PHASE_5D_D_PAYMENT_FINANCE_CASH_VERIFICATION'::text as report_section,
  function_security.*,
  grants.*,
  source_index.*,
  semantics.*,
  foundation_counts.*,
  uat_safety.*,
  optional_objects.*,
  (
    function_security.all_expected_functions_present
    and function_security.all_security_definer
    and function_security.all_fixed_public_search_path
    and function_security.one_trusted_owner
    and grants.external_rpc_grants_correct
    and grants.internal_helpers_browser_inaccessible
    and source_index.one_original_cash_per_payment_enforced
    and semantics.bangkok_completed_day_semantics_present
    and semantics.zero_cash_skips_posting
    and semantics.no_opening_is_pre_cutover
    and semantics.on_or_before_cutoff_skips_posting
    and semantics.receiving_account_guard_present
    and semantics.payment_cash_insert_contract_present
    and semantics.cash_only_wht_excluded
    and semantics.helper_retry_path_present
    and semantics.payment_confirmation_atomic_order_present
    and semantics.existing_confirmed_payment_no_backfill_path_present
    and semantics.payment_audit_trace_present
    and semantics.cash_audit_trace_present
    and semantics.historical_opening_gap_guard_present
    and semantics.opening_cutoff_end_of_day_guard_present
    and semantics.opening_confirmation_invokes_gap_guard
    and semantics.payment_reversal_cash_blocker_present
    and semantics.one_payment_level_posting_model_present
    and foundation_counts.cash_transaction_rows = 0
    and foundation_counts.opening_balance_rows = 0
    and foundation_counts.cash_audit_rows = 0
    and foundation_counts.opening_audit_rows = 0
    and foundation_counts.legacy_ledger_rows = 267
    and foundation_counts.compensation_rows = 33
    and uat_safety.existing_uat_payment_source_cash_rows = 0
    and uat_safety.existing_uat_payments_unchanged = 2
    and optional_objects.receipt_object_absent
    and optional_objects.tax_invoice_object_absent
  ) as payment_finance_cash_integration_verification_pass
from function_security
cross join grants
cross join source_index
cross join semantics
cross join foundation_counts
cross join uat_safety
cross join optional_objects;
