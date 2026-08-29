-- SELECT-only Production preflight for Migration 030.
-- Returns one row, calls no RPC, and performs no data or schema mutation.

with required_relations as (
  select
    to_regclass('public.clients') is not null as clients_present,
    to_regclass('public.cases') is not null as cases_present,
    to_regclass('public.advisory_matters') is not null as advisory_matters_present,
    to_regclass('public.user_profiles') is not null as user_profiles_present,
    to_regclass('public.finance_fee_agreements') is not null as fee_agreements_present,
    to_regclass('public.finance_fee_agreement_items') is not null as fee_agreement_items_present,
    to_regclass('public.finance_billing_plans') is not null as billing_plans_present,
    to_regclass('public.finance_billing_installments') is not null as billing_installments_present,
    to_regclass('public.finance_billing_installment_items') is not null as billing_installment_items_present,
    to_regclass('public.finance_invoices') is not null as invoices_present,
    to_regclass('public.finance_invoice_items') is not null as invoice_items_present,
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_cash_transactions') is not null as cash_transactions_present,
    to_regclass('public.finance_account_opening_balances') is not null as opening_balances_present,
    to_regclass('public.finance_company_ledger') is not null as legacy_ledger_present,
    to_regclass('public.finance_compensation_batches') is not null as compensation_present,
    to_regclass('public.finance_billable_charges') is null as charge_table_name_available,
    to_regclass('public.finance_billable_charge_audit_events') is null as charge_audit_table_name_available,
    to_regclass('public.finance_invoice_charge_allocations') is null as invoice_charge_allocation_deferred,
    to_regclass('public.finance_quotation_rate_terms') is null as quotation_rate_terms_deferred,
    to_regclass('public.finance_fee_agreement_rate_terms') is null as agreement_rate_terms_deferred,
    to_regclass('public.finance_client_billing_arrangements') is null as client_arrangements_deferred,
    to_regclass('public.finance_client_billing_arrangement_versions') is null as client_arrangement_versions_deferred,
    to_regclass('public.finance_client_billing_rate_terms') is null as client_rate_terms_deferred
), expected_columns as (
  select *
  from (values
    ('clients', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('cases', 'id', 'bigint', 'int8', 64, 0),
    ('cases', 'client_id', 'uuid', 'uuid', null::integer, null::integer),
    ('advisory_matters', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('advisory_matters', 'client_id', 'uuid', 'uuid', null::integer, null::integer),
    ('user_profiles', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('user_profiles', 'active', 'boolean', 'bool', null::integer, null::integer),
    ('user_profiles', 'role', 'text', 'text', null::integer, null::integer),
    ('user_profiles', 'email', 'text', 'text', null::integer, null::integer),
    ('user_profiles', 'full_name', 'text', 'text', null::integer, null::integer),
    ('user_profiles', 'staff_name', 'text', 'text', null::integer, null::integer),
    ('finance_fee_agreements', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_fee_agreements', 'client_id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_fee_agreements', 'case_id', 'bigint', 'int8', 64, 0),
    ('finance_fee_agreements', 'advisory_matter_id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_fee_agreements', 'currency', 'text', 'text', null::integer, null::integer),
    ('finance_billing_plans', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_billing_plans', 'fee_agreement_id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_billing_installments', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_billing_installments', 'billing_plan_id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_billing_installment_items', 'id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_billing_installment_items', 'billing_installment_id', 'uuid', 'uuid', null::integer, null::integer),
    ('finance_invoice_items', 'vat_applicable', 'boolean', 'bool', null::integer, null::integer),
    ('finance_invoice_items', 'vat_rate', 'numeric', 'numeric', 7, 4),
    ('finance_invoice_items', 'tax_category', 'text', 'text', null::integer, null::integer),
    ('finance_invoice_items', 'price_tax_mode', 'text', 'text', null::integer, null::integer),
    ('finance_invoice_items', 'amount_before_vat', 'numeric', 'numeric', 14, 2),
    ('finance_invoice_items', 'vat_amount', 'numeric', 'numeric', 14, 2),
    ('finance_invoice_items', 'line_total', 'numeric', 'numeric', 14, 2)
  ) as expected(table_name, column_name, data_type, udt_name, numeric_precision, numeric_scale)
), actual_required_columns as (
  select
    expected.table_name,
    expected.column_name,
    actual.column_name is not null
      and actual.data_type = expected.data_type
      and actual.udt_name = expected.udt_name
      and (
        expected.numeric_precision is null
        or (
          actual.numeric_precision = expected.numeric_precision
          and actual.numeric_scale = expected.numeric_scale
        )
      ) as exact_match
  from expected_columns as expected
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
   and actual.table_name = expected.table_name
   and actual.column_name = expected.column_name
), required_column_state as (
  select
    count(*) as required_column_count,
    count(*) filter (where exact_match) as exact_required_column_count,
    bool_and(exact_match) as exact_required_column_types_present
  from actual_required_columns
), permission_name_state as (
  select
    count(*) = 0 as permission_column_names_available
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_profiles'
    and column_name in (
      'can_view_finance_billable_charges',
      'can_manage_finance_billable_charges',
      'can_approve_finance_billable_charges'
    )
), required_functions as (
  select
    to_regprocedure('auth.uid()') is not null as auth_uid_present,
    to_regprocedure('gen_random_uuid()') is not null as uuid_generator_present,
    to_regprocedure('pg_catalog.hashtextextended(text,bigint)') is not null as advisory_hash_present,
    to_regprocedure('public.current_user_can_manage_finance_quotations()') is not null
      as established_finance_permission_helper_present
), proposed_function_names(name) as (
  values
    ('protect_finance_billable_charge_permission_fields'),
    ('current_user_can_view_finance_billable_charges'),
    ('current_user_can_manage_finance_billable_charges'),
    ('current_user_can_approve_finance_billable_charges'),
    ('calculate_finance_billable_charge_amounts'),
    ('assert_finance_billable_charge_context'),
    ('validate_finance_billable_charge_integrity'),
    ('enforce_finance_billable_charge_integrity'),
    ('enforce_finance_billable_charge_lifecycle'),
    ('protect_finance_billable_charge_audit_event'),
    ('record_finance_billable_charge_audit_event'),
    ('create_finance_billable_charge_draft'),
    ('save_finance_billable_charge_draft'),
    ('mark_finance_billable_charge_ready'),
    ('cancel_finance_billable_charge')
), function_name_state as (
  select
    count(function_record.oid) = 0 as proposed_function_names_available
  from proposed_function_names
  left join pg_proc as function_record
    on function_record.proname = proposed_function_names.name
  left join pg_namespace as namespace_record
    on namespace_record.oid = function_record.pronamespace
   and namespace_record.nspname = 'public'
  where function_record.oid is null or namespace_record.oid is not null
), alternate_implementation_state as (
  select
    (
      select count(*) = 0
      from pg_class as class_record
      join pg_namespace as namespace_record
        on namespace_record.oid = class_record.relnamespace
      where namespace_record.nspname = 'public'
        and class_record.relkind in ('r', 'p', 'v', 'm', 'f')
        and class_record.relname ilike '%billable%'
        and class_record.relname ilike '%charge%'
    ) as no_existing_billable_charge_relation,
    (
      select count(*) = 0
      from pg_proc as function_record
      join pg_namespace as namespace_record
        on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname ilike '%billable%'
        and function_record.proname ilike '%charge%'
    ) as no_existing_billable_charge_function
), production_baseline as (
  select
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
  'PHASE_B1_BILLABLE_CHARGE_PREFLIGHT'::text as report_section,
  required_relations.*,
  required_column_state.required_column_count,
  required_column_state.exact_required_column_count,
  required_column_state.exact_required_column_types_present,
  permission_name_state.permission_column_names_available,
  required_functions.*,
  function_name_state.proposed_function_names_available,
  alternate_implementation_state.*,
  production_baseline.*,
  invoice_uat_state.*,
  downstream_state.*,
  (
    required_relations.clients_present
    and required_relations.cases_present
    and required_relations.advisory_matters_present
    and required_relations.user_profiles_present
    and required_relations.fee_agreements_present
    and required_relations.fee_agreement_items_present
    and required_relations.billing_plans_present
    and required_relations.billing_installments_present
    and required_relations.billing_installment_items_present
    and required_relations.invoices_present
    and required_relations.invoice_items_present
    and required_relations.payments_present
    and required_relations.cash_transactions_present
    and required_relations.opening_balances_present
    and required_relations.legacy_ledger_present
    and required_relations.compensation_present
    and required_relations.charge_table_name_available
    and required_relations.charge_audit_table_name_available
    and required_relations.invoice_charge_allocation_deferred
    and required_relations.quotation_rate_terms_deferred
    and required_relations.agreement_rate_terms_deferred
    and required_relations.client_arrangements_deferred
    and required_relations.client_arrangement_versions_deferred
    and required_relations.client_rate_terms_deferred
    and required_column_state.exact_required_column_types_present
    and permission_name_state.permission_column_names_available
    and required_functions.auth_uid_present
    and required_functions.uuid_generator_present
    and required_functions.advisory_hash_present
    and required_functions.established_finance_permission_helper_present
    and function_name_state.proposed_function_names_available
    and alternate_implementation_state.no_existing_billable_charge_relation
    and alternate_implementation_state.no_existing_billable_charge_function
    and production_baseline.confirmed_payment_rows = 2
    and production_baseline.confirmed_payment_cash = 14550.00
    and production_baseline.confirmed_payment_wht = 450.00
    and production_baseline.confirmed_payment_settlement = 15000.00
    and production_baseline.cash_transaction_rows = 0
    and production_baseline.opening_balance_rows = 0
    and production_baseline.legacy_ledger_rows = 267
    and production_baseline.compensation_rows = 33
    and invoice_uat_state.invoice_000001_remains_voided
    and invoice_uat_state.invoice_000002_remains_issued
    and invoice_uat_state.invoice_000003_remains_issued
    and downstream_state.receipt_object_absent
    and downstream_state.tax_invoice_object_absent
  ) as phase_b1_billable_charge_preflight_pass
from required_relations
cross join required_column_state
cross join permission_name_state
cross join required_functions
cross join function_name_state
cross join alternate_implementation_state
cross join production_baseline
cross join invoice_uat_state
cross join downstream_state;
