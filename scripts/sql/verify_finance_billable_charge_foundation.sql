-- SELECT-only post-apply verification for Migration 030.
-- Returns one row, calls no RPC, and performs no data or schema mutation.

with relation_state as (
  select
    to_regclass('public.finance_billable_charges') is not null as charge_table_present,
    to_regclass('public.finance_billable_charge_audit_events') is not null as audit_table_present,
    to_regclass('public.finance_invoice_charge_allocations') is null as invoice_allocation_table_deferred,
    to_regclass('public.finance_quotation_rate_terms') is null as quotation_rate_terms_deferred,
    to_regclass('public.finance_fee_agreement_rate_terms') is null as agreement_rate_terms_deferred,
    to_regclass('public.finance_client_billing_arrangements') is null as client_arrangements_deferred,
    to_regclass('public.finance_client_billing_arrangement_versions') is null as client_arrangement_versions_deferred,
    to_regclass('public.finance_client_billing_rate_terms') is null as client_rate_terms_deferred
), expected_charge_columns as (
  select *
  from (values
    ('id', 'uuid', 'uuid', 'NO', null::integer, null::integer),
    ('client_id', 'uuid', 'uuid', 'NO', null::integer, null::integer),
    ('case_id', 'bigint', 'int8', 'YES', 64, 0),
    ('advisory_matter_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('source_type', 'text', 'text', 'NO', null::integer, null::integer),
    ('source_billing_installment_item_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('source_reference', 'text', 'text', 'YES', null::integer, null::integer),
    ('source_event_key', 'text', 'text', 'YES', null::integer, null::integer),
    ('source_snapshot_json', 'jsonb', 'jsonb', 'NO', null::integer, null::integer),
    ('idempotency_key', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('supersedes_charge_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('description', 'text', 'text', 'YES', null::integer, null::integer),
    ('quantity', 'numeric', 'numeric', 'NO', 14, 4),
    ('unit', 'text', 'text', 'YES', null::integer, null::integer),
    ('unit_rate', 'numeric', 'numeric', 'NO', 14, 2),
    ('currency', 'text', 'text', 'NO', null::integer, null::integer),
    ('service_date', 'date', 'date', 'YES', null::integer, null::integer),
    ('economic_classification', 'text', 'text', 'YES', null::integer, null::integer),
    ('vat_applicable', 'boolean', 'bool', 'NO', null::integer, null::integer),
    ('vat_rate', 'numeric', 'numeric', 'NO', 7, 4),
    ('tax_category', 'text', 'text', 'YES', null::integer, null::integer),
    ('price_tax_mode', 'text', 'text', 'NO', null::integer, null::integer),
    ('amount_before_vat', 'numeric', 'numeric', 'NO', 14, 2),
    ('vat_amount', 'numeric', 'numeric', 'NO', 14, 2),
    ('total_amount', 'numeric', 'numeric', 'NO', 14, 2),
    ('status', 'text', 'text', 'NO', null::integer, null::integer),
    ('ready_snapshot_json', 'jsonb', 'jsonb', 'YES', null::integer, null::integer),
    ('ready_to_invoice_at', 'timestamp with time zone', 'timestamptz', 'YES', null::integer, null::integer),
    ('ready_by_user_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('cancelled_at', 'timestamp with time zone', 'timestamptz', 'YES', null::integer, null::integer),
    ('cancelled_by_user_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('cancel_reason', 'text', 'text', 'YES', null::integer, null::integer),
    ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', null::integer, null::integer),
    ('created_by_user_id', 'uuid', 'uuid', 'YES', null::integer, null::integer),
    ('updated_at', 'timestamp with time zone', 'timestamptz', 'NO', null::integer, null::integer),
    ('updated_by_user_id', 'uuid', 'uuid', 'YES', null::integer, null::integer)
  ) as expected(column_name, data_type, udt_name, is_nullable, numeric_precision, numeric_scale)
), charge_column_state as (
  select
    count(*) as expected_charge_column_count,
    count(*) filter (
      where actual.column_name is not null
        and actual.data_type = expected.data_type
        and actual.udt_name = expected.udt_name
        and actual.is_nullable = expected.is_nullable
        and (
          expected.numeric_precision is null
          or (
            actual.numeric_precision = expected.numeric_precision
            and actual.numeric_scale = expected.numeric_scale
          )
        )
    ) as exact_charge_column_count,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_billable_charges'
    ) as actual_charge_column_count
  from expected_charge_columns as expected
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'finance_billable_charges'
   and actual.column_name = expected.column_name
), expected_audit_columns as (
  select *
  from (values
    ('id', 'uuid', 'uuid', 'NO'),
    ('charge_id', 'uuid', 'uuid', 'NO'),
    ('event_type', 'text', 'text', 'NO'),
    ('event_payload_json', 'jsonb', 'jsonb', 'NO'),
    ('actor_user_id', 'uuid', 'uuid', 'YES'),
    ('actor_email', 'text', 'text', 'YES'),
    ('actor_name', 'text', 'text', 'YES'),
    ('created_at', 'timestamp with time zone', 'timestamptz', 'NO')
  ) as expected(column_name, data_type, udt_name, is_nullable)
), audit_column_state as (
  select
    count(*) as expected_audit_column_count,
    count(*) filter (
      where actual.column_name is not null
        and actual.data_type = expected.data_type
        and actual.udt_name = expected.udt_name
        and actual.is_nullable = expected.is_nullable
    ) as exact_audit_column_count,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_billable_charge_audit_events'
    ) as actual_audit_column_count
  from expected_audit_columns as expected
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'finance_billable_charge_audit_events'
   and actual.column_name = expected.column_name
), permission_column_state as (
  select
    count(*) = 3 as permission_columns_present,
    bool_and(
      data_type = 'boolean'
      and udt_name = 'bool'
      and is_nullable = 'NO'
      and column_default in ('false', 'false::boolean')
    ) as permission_columns_exact
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_profiles'
    and column_name in (
      'can_view_finance_billable_charges',
      'can_manage_finance_billable_charges',
      'can_approve_finance_billable_charges'
    )
), constraint_state as (
  select
    count(*) filter (where contype = 'p') = 1 as charge_primary_key_present,
    count(*) filter (where contype = 'f') = 9 as charge_foreign_key_count_exact,
    count(*) filter (where contype = 'c') = 19 as charge_check_count_exact,
    count(*) filter (
      where conname = 'finance_billable_charges_single_matter_check'
        and contype = 'c'
        and convalidated
        and regexp_replace(
          lower(pg_get_expr(conbin, conrelid, true)),
          '[[:space:]()]',
          '',
          'g'
        ) in (
          'case_idisnulloradvisory_matter_idisnull',
          'advisory_matter_idisnullorcase_idisnull'
        )
    ) = 1 as single_matter_constraint_present,
    count(*) filter (
      where conname = 'finance_billable_charges_source_contract_check'
        and pg_get_constraintdef(oid) ilike '%billing_installment_item%'
        and pg_get_constraintdef(oid) ilike '%source_billing_installment_item_id%'
    ) = 1 as typed_source_contract_present,
    count(*) filter (
      where conname = 'finance_billable_charges_total_consistency_check'
        and pg_get_constraintdef(oid) ilike '%total_amount = (amount_before_vat + vat_amount)%'
    ) = 1 as exact_amount_sum_constraint_present,
    count(*) filter (
      where conname = 'finance_billable_charges_amounts_non_negative_check'
        and pg_get_constraintdef(oid) ilike '%amount_before_vat >=%'
        and pg_get_constraintdef(oid) ilike '%vat_amount >=%'
        and pg_get_constraintdef(oid) ilike '%total_amount >=%'
    ) = 1 as positive_charge_constraint_present,
    count(*) filter (
      where conname = 'finance_billable_charges_status_check'
        and pg_get_constraintdef(oid) ilike '%draft%'
        and pg_get_constraintdef(oid) ilike '%ready_to_invoice%'
        and pg_get_constraintdef(oid) ilike '%reserved%'
        and pg_get_constraintdef(oid) ilike '%invoiced%'
        and pg_get_constraintdef(oid) ilike '%cancelled%'
    ) = 1 as lifecycle_status_constraint_present,
    count(*) filter (
      where conname = 'finance_billable_charges_economic_classification_check'
        and pg_get_constraintdef(oid) ilike '%professional_fee%'
        and pg_get_constraintdef(oid) ilike '%reimbursable_expense%'
        and pg_get_constraintdef(oid) ilike '%government_or_court_fee%'
    ) = 1 as economic_classification_constraint_present,
    count(*) filter (
      where conname = 'finance_billable_charges_price_tax_mode_check'
        and pg_get_constraintdef(oid) ilike '%non_vat%'
        and pg_get_constraintdef(oid) ilike '%vat_exclusive%'
        and pg_get_constraintdef(oid) ilike '%vat_inclusive%'
    ) = 1 as existing_tax_modes_reused
  from pg_constraint
  where conrelid = to_regclass('public.finance_billable_charges')
), audit_constraint_state as (
  select
    count(*) filter (where contype = 'p') = 1 as audit_primary_key_present,
    count(*) filter (where contype = 'f') = 2 as audit_foreign_key_count_exact,
    count(*) filter (
      where conname = 'finance_billable_charge_audit_type_check'
        and pg_get_constraintdef(oid) ilike '%created%'
        and pg_get_constraintdef(oid) ilike '%draft_saved%'
        and pg_get_constraintdef(oid) ilike '%marked_ready%'
        and pg_get_constraintdef(oid) ilike '%cancelled%'
    ) = 1 as audit_event_types_present
  from pg_constraint
  where conrelid = to_regclass('public.finance_billable_charge_audit_events')
), foreign_key_state as (
  select
    count(*) filter (
      where confrelid = 'public.clients'::regclass
        and confdeltype = 'r'
        and pg_get_constraintdef(oid) ilike '%foreign key (client_id)%'
    ) = 1 as client_delete_restricted,
    count(*) filter (
      where confrelid = 'public.cases'::regclass
        and confdeltype = 'r'
        and pg_get_constraintdef(oid) ilike '%foreign key (case_id)%'
    ) = 1 as case_delete_restricted,
    count(*) filter (
      where confrelid = 'public.advisory_matters'::regclass
        and confdeltype = 'r'
        and pg_get_constraintdef(oid) ilike '%foreign key (advisory_matter_id)%'
    ) = 1 as advisory_delete_restricted,
    count(*) filter (
      where confrelid = 'public.finance_billing_installment_items'::regclass
        and confdeltype = 'r'
        and pg_get_constraintdef(oid) ilike '%foreign key (source_billing_installment_item_id)%'
    ) = 1 as installment_source_delete_restricted,
    count(*) filter (
      where confrelid = 'public.finance_billable_charges'::regclass
        and confdeltype = 'r'
        and pg_get_constraintdef(oid) ilike '%foreign key (supersedes_charge_id)%'
    ) = 1 as supersession_delete_restricted
  from pg_constraint
  where conrelid = 'public.finance_billable_charges'::regclass
    and contype = 'f'
), index_state as (
  select
    count(*) filter (
      where indexname = 'uq_finance_billable_charges_idempotency'
        and indexdef ilike '%unique%'
        and indexdef ilike '%idempotency_key%'
    ) = 1 as idempotency_unique_index_present,
    count(*) filter (
      where indexname = 'uq_finance_billable_charges_active_source_event'
        and indexdef ilike '%unique%'
        and indexdef ilike '%source_type%'
        and indexdef ilike '%source_event_key%'
        and indexdef ilike '%status <>%cancelled%'
    ) = 1 as active_source_event_unique_index_present,
    count(*) filter (
      where indexname = 'uq_finance_billable_charges_active_supersession'
        and indexdef ilike '%unique%'
        and indexdef ilike '%supersedes_charge_id%'
    ) = 1 as active_supersession_unique_index_present,
    count(*) filter (
      where indexname in (
        'idx_finance_billable_charges_client_status',
        'idx_finance_billable_charges_case_status',
        'idx_finance_billable_charges_advisory_status',
        'idx_finance_billable_charges_ready',
        'idx_finance_billable_charges_source_installment_item'
      )
    ) = 5 as charge_lookup_indexes_present,
    count(*) filter (
      where indexname = 'idx_finance_billable_charge_audit_charge'
    ) = 1 as audit_lookup_index_present
  from pg_indexes
  where schemaname = 'public'
    and tablename in ('finance_billable_charges', 'finance_billable_charge_audit_events')
), trigger_state as (
  select
    count(*) filter (
      where tgname = 'protect_finance_billable_charge_permission_fields'
    ) = 1 as permission_trigger_present,
    count(*) filter (
      where tgname = 'finance_billable_charge_lifecycle_guard'
    ) = 1 as lifecycle_trigger_present,
    count(*) filter (
      where tgname = 'finance_billable_charge_integrity'
        and tgconstraint <> 0
        and (
          select condeferrable and condeferred
          from pg_constraint
          where oid = trigger_record.tgconstraint
        )
    ) = 1 as deferred_integrity_trigger_present,
    count(*) filter (
      where tgname = 'finance_billable_charge_audit_immutability'
    ) = 1 as audit_immutability_trigger_present
  from pg_trigger as trigger_record
  where not trigger_record.tgisinternal
    and trigger_record.tgrelid in (
      'public.user_profiles'::regclass,
      'public.finance_billable_charges'::regclass,
      'public.finance_billable_charge_audit_events'::regclass
    )
), function_expectations as (
  select *
  from (values
    ('protect_finance_billable_charge_permission_fields()', false, true),
    ('current_user_can_view_finance_billable_charges()', true, true),
    ('current_user_can_manage_finance_billable_charges()', true, true),
    ('current_user_can_approve_finance_billable_charges()', true, true),
    ('calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric)', false, false),
    ('assert_finance_billable_charge_context(uuid,bigint,uuid)', false, true),
    ('validate_finance_billable_charge_integrity(uuid)', false, true),
    ('enforce_finance_billable_charge_integrity()', false, true),
    ('enforce_finance_billable_charge_lifecycle()', false, true),
    ('protect_finance_billable_charge_audit_event()', false, true),
    ('record_finance_billable_charge_audit_event(uuid,text,jsonb)', false, true),
    ('create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)', true, true),
    ('save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)', true, true),
    ('mark_finance_billable_charge_ready(uuid,boolean)', true, true),
    ('cancel_finance_billable_charge(uuid,text)', true, true)
  ) as expected(signature, authenticated_execute, security_definer)
), function_state as (
  select
    count(*) as expected_function_count,
    count(function_record.oid) as exact_function_count,
    bool_and(
      function_record.oid is not null
      and function_record.prosecdef = expected.security_definer
      and coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public']
    ) as function_security_configuration_exact,
    bool_and(
      function_record.oid is not null
      and has_function_privilege(
        'authenticated',
        function_record.oid,
        'EXECUTE'
      ) = expected.authenticated_execute
      and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
    ) as function_browser_grants_exact
  from function_expectations as expected
  left join pg_proc as function_record
    on function_record.oid = to_regprocedure('public.' || expected.signature)
), function_name_state as (
  select count(*) = 15 as no_unexpected_billable_charge_function_overloads
  from pg_proc as function_record
  join pg_namespace as namespace_record
    on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.proname in (
      'protect_finance_billable_charge_permission_fields',
      'current_user_can_view_finance_billable_charges',
      'current_user_can_manage_finance_billable_charges',
      'current_user_can_approve_finance_billable_charges',
      'calculate_finance_billable_charge_amounts',
      'assert_finance_billable_charge_context',
      'validate_finance_billable_charge_integrity',
      'enforce_finance_billable_charge_integrity',
      'enforce_finance_billable_charge_lifecycle',
      'protect_finance_billable_charge_audit_event',
      'record_finance_billable_charge_audit_event',
      'create_finance_billable_charge_draft',
      'save_finance_billable_charge_draft',
      'mark_finance_billable_charge_ready',
      'cancel_finance_billable_charge'
    )
), function_contract_state as (
  select
    pg_get_functiondef('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)'::regprocedure)
      as create_definition,
    pg_get_functiondef('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)'::regprocedure)
      as save_definition,
    pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure)
      as ready_definition,
    pg_get_functiondef('public.cancel_finance_billable_charge(uuid,text)'::regprocedure)
      as cancel_definition,
    pg_get_functiondef('public.enforce_finance_billable_charge_lifecycle()'::regprocedure)
      as lifecycle_definition,
    pg_get_functiondef('public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric)'::regprocedure)
      as calculator_definition
), lifecycle_contract_state as (
  select
    create_definition ilike '%current_user_can_manage_finance_billable_charges%'
      and create_definition ilike '%ad_hoc_service%'
      and create_definition ilike '%recoverable_cost%'
      and create_definition ilike '%request id is required%'
      and create_definition ilike '%pg_advisory_xact_lock%'
      and create_definition ilike '%idempotency_key%'
      and create_definition ilike '%source_snapshot_json is distinct from v_source_snapshot%'
      and create_definition ilike '%record_finance_billable_charge_audit_event%'
      as draft_create_controlled_and_idempotent,
    save_definition ilike '%status <> ''draft''%'
      and save_definition ilike '%calculate_finance_billable_charge_amounts%'
      and save_definition ilike '%is not distinct from%'
      and save_definition ilike '%record_finance_billable_charge_audit_event%'
      as draft_save_controlled_and_calculated,
    ready_definition ilike '%current_user_can_approve_finance_billable_charges%'
      and ready_definition ilike '%p_human_confirmed is distinct from true%'
      and ready_definition ilike '%total_amount <= 0%'
      and ready_definition ilike '%ready_snapshot_json%'
      and ready_definition ilike '%revenue_policy_inferred%false%'
      and ready_definition ilike '%compensation_policy_inferred%false%'
      and ready_definition ilike '%wht_policy_inferred%false%'
      and ready_definition ilike '%record_finance_billable_charge_audit_event%'
      as ready_transition_validated_frozen_and_audited,
    cancel_definition ilike '%current_user_can_manage_finance_billable_charges%'
      and cancel_definition ilike '%current_user_can_approve_finance_billable_charges%'
      and cancel_definition ilike '%cancellation reason is required%'
      and cancel_definition ilike '%reserved or invoiced%cannot be cancelled%'
      and cancel_definition ilike '%record_finance_billable_charge_audit_event%'
      as cancellation_scope_controlled_and_audited,
    lifecycle_definition ilike '%cannot be deleted%'
      and lifecycle_definition ilike '%ready_to_invoice%'
      and lifecycle_definition ilike '%frozen commercial evidence%'
      and lifecycle_definition ilike '%reserved%'
      and lifecycle_definition ilike '%invoiced%'
      and lifecycle_definition ilike '%immutable%'
      as lifecycle_immutability_guard_present,
    calculator_definition ilike '%round(p_quantity * p_unit_rate, 2)%'
      and calculator_definition ilike '%vat_inclusive%'
      and calculator_definition ilike '%vat_exclusive%'
      and calculator_definition ilike '%non_vat%'
      as existing_finance_rounding_and_tax_modes_preserved,
    create_definition not ilike '%insert into public.finance_invoices%'
      and create_definition not ilike '%insert into public.finance_invoice_items%'
      and save_definition not ilike '%finance_invoices%'
      and ready_definition not ilike '%finance_invoices%'
      and cancel_definition not ilike '%finance_invoices%'
      as no_invoice_integration_in_charge_rpcs
  from function_contract_state
), security_state as (
  select
    (
      select count(*) = 2
      from pg_class
      where oid in (
        'public.finance_billable_charges'::regclass,
        'public.finance_billable_charge_audit_events'::regclass
      )
        and relrowsecurity
    ) as rls_enabled_on_both_tables,
    (
      select count(*) = 2
      from pg_policies
      where schemaname = 'public'
        and tablename in ('finance_billable_charges', 'finance_billable_charge_audit_events')
        and cmd = 'SELECT'
        and qual ilike '%current_user_can_view_finance_billable_charges%'
    ) as select_policies_exact,
    has_table_privilege('authenticated', 'public.finance_billable_charges', 'SELECT')
      and has_table_privilege('authenticated', 'public.finance_billable_charge_audit_events', 'SELECT')
      as authenticated_select_granted,
    not (
      has_table_privilege('authenticated', 'public.finance_billable_charges', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('authenticated', 'public.finance_billable_charge_audit_events', 'INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_billable_charges', 'SELECT, INSERT, UPDATE, DELETE')
      or has_table_privilege('anon', 'public.finance_billable_charge_audit_events', 'SELECT, INSERT, UPDATE, DELETE')
    ) as direct_browser_mutation_and_anon_access_blocked
), row_state as (
  select
    (select count(*) from public.finance_billable_charges) as charge_rows,
    (select count(*) from public.finance_billable_charge_audit_events) as audit_rows,
    (select count(*) from public.finance_invoices) as invoice_rows,
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status = 'draft') as draft_payment_rows,
    (select count(*) from public.finance_payments where status = 'confirmed') as confirmed_payment_rows,
    (select count(*) from public.finance_payments where status = 'cancelled') as cancelled_payment_rows,
    (select count(*) from public.finance_payments where status = 'reversed') as reversed_payment_rows,
    (
      select count(*)
      from public.finance_payments
      where status = 'draft'
        and draft_origin_invoice_id is not null
    ) as active_draft_payment_reservation_rows,
    (
      select coalesce(sum(settlement_amount), 0)
      from public.finance_payments
      where status = 'draft'
        and draft_origin_invoice_id is not null
    ) as active_draft_reserved_settlement,
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
    ) as confirmed_payment_settlement,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
), invoice_uat_state as (
  select
    count(*) filter (
      where invoice_no = 'VP-IV-202608-000001' and document_status = 'voided'
    ) = 1 as invoice_000001_remains_voided,
    count(*) filter (
      where invoice_no = 'VP-IV-202608-000002' and document_status = 'issued'
    ) = 1 as invoice_000002_remains_issued,
    count(*) filter (
      where invoice_no = 'VP-IV-202608-000003' and document_status = 'issued'
    ) = 1 as invoice_000003_remains_issued
  from public.finance_invoices
), downstream_state as (
  select
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  'PHASE_B1_BILLABLE_CHARGE_FOUNDATION_VERIFICATION'::text as report_section,
  relation_state.*,
  charge_column_state.*,
  audit_column_state.*,
  permission_column_state.*,
  constraint_state.*,
  audit_constraint_state.*,
  foreign_key_state.*,
  index_state.*,
  trigger_state.*,
  function_state.*,
  function_name_state.*,
  lifecycle_contract_state.*,
  security_state.*,
  row_state.*,
  invoice_uat_state.*,
  downstream_state.*,
  (
    relation_state.charge_table_present
    and relation_state.audit_table_present
    and relation_state.invoice_allocation_table_deferred
    and relation_state.quotation_rate_terms_deferred
    and relation_state.agreement_rate_terms_deferred
    and relation_state.client_arrangements_deferred
    and relation_state.client_arrangement_versions_deferred
    and relation_state.client_rate_terms_deferred
    and charge_column_state.expected_charge_column_count = 36
    and charge_column_state.exact_charge_column_count = 36
    and charge_column_state.actual_charge_column_count = 36
    and audit_column_state.expected_audit_column_count = 8
    and audit_column_state.exact_audit_column_count = 8
    and audit_column_state.actual_audit_column_count = 8
    and permission_column_state.permission_columns_present
    and permission_column_state.permission_columns_exact
    and constraint_state.charge_primary_key_present
    and constraint_state.charge_foreign_key_count_exact
    and constraint_state.charge_check_count_exact
    and constraint_state.single_matter_constraint_present
    and constraint_state.typed_source_contract_present
    and constraint_state.exact_amount_sum_constraint_present
    and constraint_state.positive_charge_constraint_present
    and constraint_state.lifecycle_status_constraint_present
    and constraint_state.economic_classification_constraint_present
    and constraint_state.existing_tax_modes_reused
    and audit_constraint_state.audit_primary_key_present
    and audit_constraint_state.audit_foreign_key_count_exact
    and audit_constraint_state.audit_event_types_present
    and foreign_key_state.client_delete_restricted
    and foreign_key_state.case_delete_restricted
    and foreign_key_state.advisory_delete_restricted
    and foreign_key_state.installment_source_delete_restricted
    and foreign_key_state.supersession_delete_restricted
    and index_state.idempotency_unique_index_present
    and index_state.active_source_event_unique_index_present
    and index_state.active_supersession_unique_index_present
    and index_state.charge_lookup_indexes_present
    and index_state.audit_lookup_index_present
    and trigger_state.permission_trigger_present
    and trigger_state.lifecycle_trigger_present
    and trigger_state.deferred_integrity_trigger_present
    and trigger_state.audit_immutability_trigger_present
    and function_state.expected_function_count = 15
    and function_state.exact_function_count = 15
    and function_state.function_security_configuration_exact
    and function_state.function_browser_grants_exact
    and function_name_state.no_unexpected_billable_charge_function_overloads
    and lifecycle_contract_state.draft_create_controlled_and_idempotent
    and lifecycle_contract_state.draft_save_controlled_and_calculated
    and lifecycle_contract_state.ready_transition_validated_frozen_and_audited
    and lifecycle_contract_state.cancellation_scope_controlled_and_audited
    and lifecycle_contract_state.lifecycle_immutability_guard_present
    and lifecycle_contract_state.existing_finance_rounding_and_tax_modes_preserved
    and lifecycle_contract_state.no_invoice_integration_in_charge_rpcs
    and security_state.rls_enabled_on_both_tables
    and security_state.select_policies_exact
    and security_state.authenticated_select_granted
    and security_state.direct_browser_mutation_and_anon_access_blocked
    and row_state.charge_rows = 0
    and row_state.audit_rows = 0
    and row_state.confirmed_payment_rows = 2
    and row_state.confirmed_payment_cash = 14550.00
    and row_state.confirmed_payment_wht = 450.00
    and row_state.confirmed_payment_settlement = 15000.00
    and row_state.cash_transaction_rows = 0
    and row_state.opening_balance_rows = 0
    and row_state.legacy_ledger_rows = 267
    and row_state.compensation_rows = 33
    and invoice_uat_state.invoice_000001_remains_voided
    and invoice_uat_state.invoice_000002_remains_issued
    and invoice_uat_state.invoice_000003_remains_issued
    and downstream_state.receipt_object_absent
    and downstream_state.tax_invoice_object_absent
  ) as phase_b1_billable_charge_foundation_verification_pass
from relation_state
cross join charge_column_state
cross join audit_column_state
cross join permission_column_state
cross join constraint_state
cross join audit_constraint_state
cross join foreign_key_state
cross join index_state
cross join trigger_state
cross join function_state
cross join function_name_state
cross join lifecycle_contract_state
cross join security_state
cross join row_state
cross join invoice_uat_state
cross join downstream_state;
