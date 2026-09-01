-- SELECT-only post-apply verification for Migration 031.
-- Returns one row, calls no RPC, and performs no data or schema mutation.

with relation_state as (
  select
    to_regclass('public.finance_billing_installment_charge_bridges') is not null
      as bridge_table_present,
    to_regclass('public.finance_billing_installment_charge_bridge_audit_events') is not null
      as bridge_audit_table_present,
    to_regclass('public.finance_invoice_charge_allocations') is null
      as invoice_charge_allocation_deferred
), expected_bridge_columns(column_name, data_type, is_nullable) as (
  values
    ('id', 'uuid', 'NO'),
    ('billing_installment_id', 'uuid', 'NO'),
    ('billing_plan_id', 'uuid', 'NO'),
    ('fee_agreement_id', 'uuid', 'NO'),
    ('client_id', 'uuid', 'NO'),
    ('case_id', 'bigint', 'YES'),
    ('advisory_matter_id', 'uuid', 'YES'),
    ('currency', 'text', 'NO'),
    ('request_id', 'uuid', 'NO'),
    ('source_snapshot_json', 'jsonb', 'NO'),
    ('certification_snapshot_json', 'jsonb', 'NO'),
    ('claimed_at', 'timestamp with time zone', 'NO'),
    ('claimed_by_user_id', 'uuid', 'NO'),
    ('created_at', 'timestamp with time zone', 'NO')
), bridge_column_state as (
  select
    count(*) as expected_bridge_column_count,
    count(*) filter (
      where actual.column_name is not null
        and actual.data_type = expected.data_type
        and actual.is_nullable = expected.is_nullable
    ) as exact_bridge_column_count,
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_billing_installment_charge_bridges'
    ) as actual_bridge_column_count
  from expected_bridge_columns as expected
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = 'finance_billing_installment_charge_bridges'
   and actual.column_name = expected.column_name
), bridge_constraint_state as (
  select
    count(*) filter (where contype = 'p') = 1 as bridge_primary_key_present,
    count(*) filter (where contype = 'f') = 7 as bridge_foreign_keys_exact,
    count(*) filter (
      where conname = 'finance_billing_installment_charge_bridges_installment_unique'
        and contype = 'u'
    ) = 1 as one_bridge_per_installment_enforced,
    count(*) filter (
      where conname = 'finance_billing_installment_charge_bridges_request_unique'
        and contype = 'u'
    ) = 1 as bridge_request_idempotency_enforced,
    count(*) filter (
      where conname = 'finance_billing_installment_charge_bridges_snapshot_check'
        and pg_get_constraintdef(oid) ilike '%human_confirmed%'
        and pg_get_constraintdef(oid) ilike '%schema_version%'
    ) = 1 as bridge_human_certification_enforced
  from pg_constraint
  where conrelid = to_regclass('public.finance_billing_installment_charge_bridges')
), bridge_fk_state as (
  select
    count(*) filter (where confrelid = 'public.finance_billing_installments'::regclass) = 1
      as installment_fk_present,
    count(*) filter (where confrelid = 'public.finance_billing_plans'::regclass) = 1
      as plan_fk_present,
    count(*) filter (where confrelid = 'public.finance_fee_agreements'::regclass) = 1
      as agreement_fk_present,
    count(*) filter (where confrelid = 'public.clients'::regclass) = 1
      as client_fk_present,
    bool_and(confdeltype = 'r') as all_bridge_deletes_restricted
  from pg_constraint
  where conrelid = 'public.finance_billing_installment_charge_bridges'::regclass
    and contype = 'f'
), bridge_audit_state as (
  select
    (
      select count(*)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_billing_installment_charge_bridge_audit_events'
    ) = 9 as bridge_audit_columns_exact,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_billing_installment_charge_bridge_audit_events'::regclass
        and conname = 'finance_billing_installment_charge_bridge_audit_type_check'
        and pg_get_constraintdef(oid) ilike '%v2_path_claimed%'
    ) as bridge_claim_audit_type_present,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.finance_billing_installment_charge_bridge_audit_events'::regclass
        and tgname = 'finance_billing_installment_charge_bridge_audit_immutability'
        and not tgisinternal
    ) as bridge_audit_append_only_trigger_present,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.finance_billing_installment_charge_bridges'::regclass
        and tgname = 'finance_billing_installment_charge_bridge_audit_writer'
        and not tgisinternal
    ) as bridge_insert_audit_trigger_present
), bridge_security_state as (
  select
    (select relrowsecurity from pg_class where oid = 'public.finance_billing_installment_charge_bridges'::regclass)
      as bridge_rls_enabled,
    (select relrowsecurity from pg_class where oid = 'public.finance_billing_installment_charge_bridge_audit_events'::regclass)
      as bridge_audit_rls_enabled,
    has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridges', 'SELECT')
      as authenticated_bridge_select,
    not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridges', 'INSERT')
      and not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridges', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridges', 'DELETE')
      as authenticated_bridge_mutation_blocked,
    not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridge_audit_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridge_audit_events', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.finance_billing_installment_charge_bridge_audit_events', 'DELETE')
      as authenticated_bridge_audit_mutation_blocked,
    not has_function_privilege(
      'authenticated',
      'public.assert_finance_billing_installment_v2_bridge_eligible(uuid)',
      'EXECUTE'
    ) as bridge_eligibility_internal_only,
    not exists (
      select 1
      from pg_proc as function_record
      join pg_namespace as namespace_record on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname in (
          'create_finance_billing_installment_charge_bridge',
          'claim_finance_billing_installment_charge_bridge',
          'generate_finance_billing_installment_charges'
        )
    ) as no_operational_bridge_rpc
), function_state as (
  select
    to_regprocedure('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)') is not null
      as bridge_eligibility_function_present,
    to_regprocedure('public.enforce_finance_billing_installment_charge_bridge()') is not null
      as bridge_guard_function_present,
    to_regprocedure('public.protect_finance_invoice_source_model()') is not null
      as invoice_source_guard_present,
    pg_get_functiondef('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)'::regprocedure)
      ilike '%FINANCE_INSTALLMENT_HAS_V1_INVOICE_HISTORY%'
      and pg_get_functiondef('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)'::regprocedure)
        ilike '%primary_billing_installment_id%'
      as any_v1_history_blocks_bridge,
    pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
      ilike '%finance_billing_installment_charge_bridges%'
      and pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
        ilike '%FINANCE_INSTALLMENT_V2_BRIDGED%'
      as authoritative_v1_bridge_guard_present,
    pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
      ilike '%source_model%installment_v1%'
      and pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
        ilike '%primary_billing_installment_id%'
      as zero_bridge_v1_path_structurally_preserved,
    pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure)
      ilike '%source_fixed_allocation%'
      and pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure)
        ilike '%installment_item.amount_before_tax%'
      and pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure)
        ilike '%installment_item.vat_amount%'
      and pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure)
        ilike '%installment_item.total_amount%'
      and pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure)
        ilike '%bridge.id%'
      as source_fixed_integrity_validator_present
), semantic_column_state as (
  select
    count(*) filter (
      where table_name = 'finance_quotation_items'
        and column_name in ('unit', 'economic_classification')
        and is_nullable = 'YES'
    ) = 2 as quotation_semantic_columns_nullable,
    count(*) filter (
      where table_name = 'finance_fee_agreement_items'
        and column_name in ('unit', 'economic_classification')
        and is_nullable = 'YES'
    ) = 2 as agreement_semantic_columns_nullable,
    count(*) filter (
      where table_name = 'finance_billing_installment_items'
        and column_name in ('unit', 'economic_classification', 'semantic_snapshot_json')
        and is_nullable = 'YES'
    ) = 3 as installment_semantic_columns_nullable,
    count(*) filter (
      where table_name = 'finance_billable_charges'
        and column_name in ('calculation_basis', 'source_semantics_json')
    ) = 2 as charge_calculation_columns_present,
    count(*) filter (
      where table_name = 'finance_billable_charges'
        and column_name in ('quantity', 'unit_rate')
        and is_nullable = 'YES'
    ) = 2 as charge_quantity_rate_conditionally_nullable,
    count(*) filter (
      where table_name = 'finance_invoices'
        and column_name = 'source_model'
        and is_nullable = 'NO'
    ) = 1 as invoice_source_model_required
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'finance_quotation_items',
      'finance_fee_agreement_items',
      'finance_billing_installment_items',
      'finance_billable_charges',
      'finance_invoices'
    )
), semantic_constraint_state as (
  select
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_billable_charges'::regclass
        and conname = 'finance_billable_charges_calculation_basis_check'
        and pg_get_constraintdef(oid) ilike '%quantity_rate%'
        and pg_get_constraintdef(oid) ilike '%source_fixed_allocation%'
    ) as calculation_basis_taxonomy_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_billable_charges'::regclass
        and conname = 'finance_billable_charges_calculation_contract_check'
        and pg_get_constraintdef(oid) ilike '%human_certified%'
        and pg_get_constraintdef(oid) ilike '%quantity is null%'
        and pg_get_constraintdef(oid) ilike '%unit_rate is null%'
    ) as source_fixed_no_fake_quantity_rate_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_invoices'::regclass
        and conname = 'finance_invoices_source_model_check'
        and pg_get_constraintdef(oid) ilike '%installment_v1%'
        and pg_get_constraintdef(oid) ilike '%billable_charge_v2%'
    ) as invoice_source_model_taxonomy_enforced,
    exists (
      select 1 from pg_trigger
      where tgrelid = 'public.finance_invoices'::regclass
        and tgname = 'finance_invoice_source_model_guard'
        and not tgisinternal
    ) as invoice_source_model_immutable
), no_backfill_state as (
  select
    (select count(*) from public.finance_quotation_items where unit is not null or economic_classification is not null) = 0
      as quotation_semantics_not_guessed,
    (select count(*) from public.finance_fee_agreement_items where unit is not null or economic_classification is not null) = 0
      as agreement_semantics_not_guessed,
    (
      select count(*)
      from public.finance_billing_installment_items
      where unit is not null or economic_classification is not null or semantic_snapshot_json is not null
    ) = 0 as installment_semantics_not_guessed,
    (
      select count(*)
      from public.finance_billable_charges
      where calculation_basis <> 'quantity_rate' or source_semantics_json is not null
    ) = 0 as existing_charges_remain_quantity_rate,
    (select count(*) from public.finance_invoices where source_model <> 'installment_v1') = 0
      as all_existing_invoices_are_v1,
    (
      select count(*)
      from public.finance_invoices
      where billing_plan_id is null
        or primary_billing_installment_id is null
        or fee_agreement_id is null
    ) = 0 as historical_v1_source_lineage_still_required
), dormant_state as (
  select
    (select count(*) from public.finance_billing_installment_charge_bridges) as bridge_rows,
    (select count(*) from public.finance_billing_installment_charge_bridge_audit_events) as bridge_audit_rows,
    (
      select count(*)
      from public.finance_billable_charges
      where source_type = 'billing_installment_item'
    ) as generated_installment_charge_rows,
    (
      select count(*)
      from public.finance_invoices
      where source_model = 'billable_charge_v2'
    ) as invoice_v2_rows
), ready_charge_state as (
  select
    count(*) filter (where status = 'ready_to_invoice') as ready_charge_rows,
    count(*) filter (
      where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid
        and status = 'ready_to_invoice'
        and amount_before_vat = 5000
        and vat_amount = 0
        and total_amount = 5000
        and ready_snapshot_json->'charge'->>'id' = id::text
        and ready_snapshot_json->'source'->>'source_type' = source_type
        and ready_snapshot_json->'economic'->>'classification' = economic_classification
        and calculation_basis = 'quantity_rate'
        and source_semantics_json is null
    ) = 1 as court_fee_ready_unchanged,
    count(*) filter (
      where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid
        and status = 'ready_to_invoice'
        and amount_before_vat = 2000
        and vat_amount = 0
        and total_amount = 2000
        and ready_snapshot_json->'charge'->>'id' = id::text
        and ready_snapshot_json->'source'->>'source_type' = source_type
        and ready_snapshot_json->'economic'->>'classification' = economic_classification
        and calculation_basis = 'quantity_rate'
        and source_semantics_json is null
    ) = 1 as travel_charge_ready_unchanged,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'description', description,
        'status', status,
        'source_type', source_type,
        'source_reference', source_reference,
        'source_event_key', source_event_key,
        'economic_classification', economic_classification,
        'amount_before_vat', amount_before_vat,
        'vat_amount', vat_amount,
        'total_amount', total_amount,
        'calculation_basis', calculation_basis,
        'source_semantics_json', source_semantics_json
      ) order by created_at, id
    ) filter (
      where id in (
        '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid,
        'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid
      )
    ) as intended_ready_charges
  from public.finance_billable_charges
), invoice_history_state as (
  select
    count(*) filter (
      where invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002', 'VP-IV-202608-000003')
        and source_model = 'installment_v1'
    ) = 3 as historical_uat_invoices_labeled_v1,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'invoice_no', invoice_no,
        'status', document_status,
        'source_model', source_model,
        'primary_billing_installment_id', primary_billing_installment_id
      ) order by created_at, id
    ) filter (
      where invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002', 'VP-IV-202608-000003')
    ) as historical_uat_invoices
  from public.finance_invoices
), finance_state as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status = 'draft') as draft_payment_rows,
    (select count(*) from public.finance_payments where status = 'confirmed') as confirmed_payment_rows,
    (select count(*) from public.finance_payments where status = 'cancelled') as cancelled_payment_rows,
    (select count(*) from public.finance_payments where status = 'reversed') as reversed_payment_rows,
    (select coalesce(sum(cash_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_cash,
    (select coalesce(sum(wht_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_wht,
    (select coalesce(sum(settlement_amount), 0) from public.finance_payments where status = 'confirmed')
      as confirmed_payment_settlement,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent,
    count(*) filter (
      where id = '99e76b48-9ace-4cb0-aaf6-c50d75a968bb'::uuid
        and status = 'draft'
    ) = 1 as active_uat_payment_draft_unchanged
  from public.finance_payments
)
select
  'PHASE_B3A_INVOICE_V2_BRIDGE_FOUNDATION_VERIFICATION'::text as report_section,
  relation_state.*,
  bridge_column_state.*,
  bridge_constraint_state.*,
  bridge_fk_state.*,
  bridge_audit_state.*,
  bridge_security_state.*,
  function_state.*,
  semantic_column_state.*,
  semantic_constraint_state.*,
  no_backfill_state.*,
  dormant_state.*,
  ready_charge_state.*,
  invoice_history_state.*,
  finance_state.*,
  (
    relation_state.bridge_table_present
    and relation_state.bridge_audit_table_present
    and relation_state.invoice_charge_allocation_deferred
    and bridge_column_state.expected_bridge_column_count = 14
    and bridge_column_state.exact_bridge_column_count = 14
    and bridge_column_state.actual_bridge_column_count = 14
    and bridge_constraint_state.bridge_primary_key_present
    and bridge_constraint_state.bridge_foreign_keys_exact
    and bridge_constraint_state.one_bridge_per_installment_enforced
    and bridge_constraint_state.bridge_request_idempotency_enforced
    and bridge_constraint_state.bridge_human_certification_enforced
    and bridge_fk_state.installment_fk_present
    and bridge_fk_state.plan_fk_present
    and bridge_fk_state.agreement_fk_present
    and bridge_fk_state.client_fk_present
    and bridge_fk_state.all_bridge_deletes_restricted
    and bridge_audit_state.bridge_audit_columns_exact
    and bridge_audit_state.bridge_claim_audit_type_present
    and bridge_audit_state.bridge_audit_append_only_trigger_present
    and bridge_audit_state.bridge_insert_audit_trigger_present
    and bridge_security_state.bridge_rls_enabled
    and bridge_security_state.bridge_audit_rls_enabled
    and bridge_security_state.authenticated_bridge_select
    and bridge_security_state.authenticated_bridge_mutation_blocked
    and bridge_security_state.authenticated_bridge_audit_mutation_blocked
    and bridge_security_state.bridge_eligibility_internal_only
    and bridge_security_state.no_operational_bridge_rpc
    and function_state.bridge_eligibility_function_present
    and function_state.bridge_guard_function_present
    and function_state.invoice_source_guard_present
    and function_state.any_v1_history_blocks_bridge
    and function_state.authoritative_v1_bridge_guard_present
    and function_state.zero_bridge_v1_path_structurally_preserved
    and function_state.source_fixed_integrity_validator_present
    and semantic_column_state.quotation_semantic_columns_nullable
    and semantic_column_state.agreement_semantic_columns_nullable
    and semantic_column_state.installment_semantic_columns_nullable
    and semantic_column_state.charge_calculation_columns_present
    and semantic_column_state.charge_quantity_rate_conditionally_nullable
    and semantic_column_state.invoice_source_model_required
    and semantic_constraint_state.calculation_basis_taxonomy_enforced
    and semantic_constraint_state.source_fixed_no_fake_quantity_rate_enforced
    and semantic_constraint_state.invoice_source_model_taxonomy_enforced
    and semantic_constraint_state.invoice_source_model_immutable
    and no_backfill_state.quotation_semantics_not_guessed
    and no_backfill_state.agreement_semantics_not_guessed
    and no_backfill_state.installment_semantics_not_guessed
    and no_backfill_state.existing_charges_remain_quantity_rate
    and no_backfill_state.all_existing_invoices_are_v1
    and no_backfill_state.historical_v1_source_lineage_still_required
    and dormant_state.bridge_rows = 0
    and dormant_state.bridge_audit_rows = 0
    and dormant_state.generated_installment_charge_rows = 0
    and dormant_state.invoice_v2_rows = 0
    and ready_charge_state.court_fee_ready_unchanged
    and ready_charge_state.travel_charge_ready_unchanged
    and invoice_history_state.historical_uat_invoices_labeled_v1
    and finance_state.confirmed_payment_cash = 14550
    and finance_state.confirmed_payment_wht = 450
    and finance_state.confirmed_payment_settlement = 15000
    and finance_state.receipt_object_absent
    and finance_state.tax_invoice_object_absent
    and finance_state.active_uat_payment_draft_unchanged
  ) as phase_b3a_invoice_v2_bridge_foundation_verification_pass
from relation_state
cross join bridge_column_state
cross join bridge_constraint_state
cross join bridge_fk_state
cross join bridge_audit_state
cross join bridge_security_state
cross join function_state
cross join semantic_column_state
cross join semantic_constraint_state
cross join no_backfill_state
cross join dormant_state
cross join ready_charge_state
cross join invoice_history_state
cross join finance_state;
