-- SELECT-only preflight for Migration 031: Invoice V2 bridge foundation.
-- Returns one row and performs no RPC, data, or schema mutation.

with required_objects as (
  select
    to_regclass('public.finance_quotation_items') is not null as quotation_items_present,
    to_regclass('public.finance_fee_agreement_items') is not null as agreement_items_present,
    to_regclass('public.finance_billing_plans') is not null as billing_plans_present,
    to_regclass('public.finance_billing_installments') is not null as installments_present,
    to_regclass('public.finance_billing_installment_items') is not null as installment_items_present,
    to_regclass('public.finance_billable_charges') is not null as billable_charges_present,
    to_regclass('public.finance_billable_charge_audit_events') is not null as charge_audit_present,
    to_regclass('public.finance_invoices') is not null as invoices_present,
    to_regclass('public.finance_invoice_items') is not null as invoice_items_present,
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regclass('public.finance_company_ledger') is not null as legacy_ledger_present,
    to_regclass('public.finance_compensation_batches') is not null as compensation_present,
    to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is not null
      as v1_create_rpc_present,
    to_regprocedure('public.validate_finance_billable_charge_integrity(uuid)') is not null
      as charge_validator_present,
    to_regprocedure('public.mark_finance_billable_charge_ready(uuid,boolean)') is not null
      as charge_readiness_rpc_present
), prerequisite_columns as (
  select
    count(*) filter (
      where table_name = 'finance_quotation_items'
        and column_name in ('id', 'quotation_id', 'description', 'quantity', 'unit_price', 'price_tax_mode')
    ) = 6 as quotation_item_contract_present,
    count(*) filter (
      where table_name = 'finance_fee_agreement_items'
        and column_name in (
          'id', 'fee_agreement_id', 'source_quotation_item_id', 'description', 'quantity',
          'unit_price', 'amount_before_tax', 'vat_amount', 'line_total', 'item_snapshot_json'
        )
    ) = 10 as agreement_item_contract_present,
    count(*) filter (
      where table_name = 'finance_billing_installment_items'
        and column_name in (
          'id', 'billing_installment_id', 'fee_agreement_item_id', 'amount_before_tax',
          'vat_amount', 'total_amount', 'allocation_snapshot_json'
        )
    ) = 7 as installment_item_contract_present,
    count(*) filter (
      where table_name = 'finance_billable_charges'
        and column_name in (
          'id', 'source_type', 'source_billing_installment_item_id', 'quantity', 'unit',
          'unit_rate', 'economic_classification', 'amount_before_vat', 'vat_amount',
          'total_amount', 'status'
        )
    ) = 11 as charge_contract_present,
    count(*) filter (
      where table_name = 'finance_invoices'
        and column_name in (
          'id', 'billing_plan_id', 'primary_billing_installment_id', 'fee_agreement_id',
          'client_id', 'document_status', 'amount_before_vat', 'vat_amount', 'total_amount'
        )
    ) = 9 as invoice_v1_contract_present,
    count(*) filter (
      where table_name = 'finance_invoices'
        and column_name in ('billing_plan_id', 'primary_billing_installment_id', 'fee_agreement_id')
        and is_nullable = 'NO'
    ) = 3 as invoice_v1_source_columns_still_required
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'finance_quotation_items',
      'finance_fee_agreement_items',
      'finance_billing_installment_items',
      'finance_billable_charges',
      'finance_invoices'
    )
), target_name_state as (
  select
    to_regclass('public.finance_billing_installment_charge_bridges') is null
      as bridge_table_name_available,
    to_regclass('public.finance_billing_installment_charge_bridge_audit_events') is null
      as bridge_audit_table_name_available,
    to_regclass('public.finance_invoice_charge_allocations') is null
      as invoice_charge_allocation_remains_deferred,
    not exists (
      select 1
      from pg_class as class_record
      join pg_namespace as namespace_record on namespace_record.oid = class_record.relnamespace
      where namespace_record.nspname = 'public'
        and class_record.relkind in ('r', 'p', 'v', 'm', 'f')
        and class_record.relname ilike '%billing%installment%charge%bridge%'
    ) as no_alternate_bridge_relation,
    to_regprocedure('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)') is null
      as bridge_validator_name_available,
    to_regprocedure('public.enforce_finance_billing_installment_charge_bridge()') is null
      as bridge_guard_name_available,
    to_regprocedure('public.record_finance_billing_installment_charge_bridge_audit()') is null
      as bridge_audit_writer_name_available,
    to_regprocedure('public.protect_finance_billing_installment_charge_bridge_audit()') is null
      as bridge_audit_guard_name_available,
    to_regprocedure('public.protect_finance_invoice_source_model()') is null
      as invoice_source_guard_name_available
), target_column_state as (
  select count(*) = 0 as target_columns_available
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'finance_quotation_items' and column_name in ('unit', 'economic_classification'))
      or (table_name = 'finance_fee_agreement_items' and column_name in ('unit', 'economic_classification'))
      or (table_name = 'finance_billing_installment_items' and column_name in ('unit', 'economic_classification', 'semantic_snapshot_json'))
      or (table_name = 'finance_billable_charges' and column_name in ('calculation_basis', 'source_semantics_json'))
      or (table_name = 'finance_invoices' and column_name = 'source_model')
    )
), current_contract_state as (
  select
    coalesce(
      pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
        ilike '%primary_billing_installment_id = v_installment.id%',
      false
    ) as v1_rpc_uses_primary_installment,
    coalesce(
      pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)
        not ilike '%FINANCE_INSTALLMENT_V2_BRIDGED%',
      false
    ) as v1_bridge_guard_not_previously_installed,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_billable_charges'::regclass
        and conname = 'finance_billable_charges_source_contract_check'
        and pg_get_constraintdef(oid) ilike '%billing_installment_item%'
        and pg_get_constraintdef(oid) ilike '%source_billing_installment_item_id%'
    ) as typed_charge_source_contract_present,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_billable_charges'
        and column_name = 'quantity'
        and is_nullable = 'NO'
    ) as current_quantity_rate_contract_present,
    not exists (
      select 1
      from public.finance_billable_charges
      where source_type = 'billing_installment_item'
    ) as no_installment_generated_charges_before_migration
), historical_invoice_state as (
  select
    count(*) as historical_invoice_rows,
    count(*) filter (
      where invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002', 'VP-IV-202608-000003')
    ) as understood_uat_invoice_rows,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'invoice_no', invoice_no,
        'status', document_status,
        'primary_billing_installment_id', primary_billing_installment_id
      ) order by created_at, id
    ) filter (
      where invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002', 'VP-IV-202608-000003')
    ) as understood_uat_invoices
  from public.finance_invoices
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
        'total_amount', total_amount
      ) order by created_at, id
    ) filter (where status = 'ready_to_invoice') as ready_charges
  from public.finance_billable_charges
), finance_observability as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status = 'draft') as draft_payment_rows,
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
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
)
select
  'PHASE_B3A_INVOICE_V2_BRIDGE_PREFLIGHT'::text as report_section,
  required_objects.*,
  prerequisite_columns.*,
  target_name_state.*,
  target_column_state.*,
  current_contract_state.*,
  historical_invoice_state.*,
  ready_charge_state.*,
  finance_observability.*,
  (
    required_objects.quotation_items_present
    and required_objects.agreement_items_present
    and required_objects.billing_plans_present
    and required_objects.installments_present
    and required_objects.installment_items_present
    and required_objects.billable_charges_present
    and required_objects.charge_audit_present
    and required_objects.invoices_present
    and required_objects.invoice_items_present
    and required_objects.payments_present
    and required_objects.cash_transactions_present
    and required_objects.opening_balances_present
    and required_objects.legacy_ledger_present
    and required_objects.compensation_present
    and required_objects.v1_create_rpc_present
    and required_objects.charge_validator_present
    and required_objects.charge_readiness_rpc_present
    and prerequisite_columns.quotation_item_contract_present
    and prerequisite_columns.agreement_item_contract_present
    and prerequisite_columns.installment_item_contract_present
    and prerequisite_columns.charge_contract_present
    and prerequisite_columns.invoice_v1_contract_present
    and prerequisite_columns.invoice_v1_source_columns_still_required
    and target_name_state.bridge_table_name_available
    and target_name_state.bridge_audit_table_name_available
    and target_name_state.invoice_charge_allocation_remains_deferred
    and target_name_state.no_alternate_bridge_relation
    and target_name_state.bridge_validator_name_available
    and target_name_state.bridge_guard_name_available
    and target_name_state.bridge_audit_writer_name_available
    and target_name_state.bridge_audit_guard_name_available
    and target_name_state.invoice_source_guard_name_available
    and target_column_state.target_columns_available
    and current_contract_state.v1_rpc_uses_primary_installment
    and current_contract_state.v1_bridge_guard_not_previously_installed
    and current_contract_state.typed_charge_source_contract_present
    and current_contract_state.current_quantity_rate_contract_present
    and current_contract_state.no_installment_generated_charges_before_migration
    and historical_invoice_state.historical_invoice_rows >= 3
    and historical_invoice_state.understood_uat_invoice_rows = 3
    and ready_charge_state.court_fee_ready_unchanged
    and ready_charge_state.travel_charge_ready_unchanged
  ) as phase_b3a_invoice_v2_bridge_preflight_pass
from required_objects
cross join prerequisite_columns
cross join target_name_state
cross join target_column_state
cross join current_contract_state
cross join historical_invoice_state
cross join ready_charge_state
cross join finance_observability;
