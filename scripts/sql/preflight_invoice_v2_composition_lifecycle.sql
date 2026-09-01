-- Phase B3B preflight: Invoice V2 composition, reservation, issue, cancel, and void lifecycle.
-- SELECT only. Run in Production before reviewing or dry-running Migration 032.

with
required_objects as (
  select
    to_regclass('public.finance_billable_charges') is not null as billable_charges_present,
    to_regclass('public.finance_billable_charge_audit_events') is not null as charge_audit_present,
    to_regclass('public.finance_billing_installment_charge_bridges') is not null as bridge_present,
    to_regclass('public.finance_billing_installment_charge_bridge_audit_events') is not null as bridge_audit_present,
    to_regclass('public.finance_invoices') is not null as invoices_present,
    to_regclass('public.finance_invoice_items') is not null as invoice_items_present,
    to_regclass('public.finance_invoice_installment_allocations') is not null as v1_allocations_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_summary_present
),
new_objects_absent as (
  select
    to_regclass('public.finance_invoice_charge_allocations') is null as allocation_table_available,
    to_regclass('public.finance_invoice_charge_allocation_audit_events') is null as allocation_audit_table_available,
    to_regclass('public.finance_invoice_v2_composition_requests') is null as request_table_available,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and (
          (table_name = 'finance_invoices' and column_name in ('v2_bridge_id','v2_creation_request_id','v2_creation_fingerprint'))
          or (table_name = 'finance_invoice_items' and column_name in ('source_billable_charge_id','source_state'))
        )
    ) as v2_columns_available
),
required_functions as (
  select
    to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is not null as invoice_validator_present,
    to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is not null as v1_create_present,
    to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)') is not null as draft_save_present,
    to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is not null as cancel_present,
    to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null as issue_present,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null as void_present,
    to_regprocedure('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)') is not null as bridge_eligibility_present,
    to_regprocedure('public.current_user_can_manage_finance_billable_charges()') is not null as charge_manage_permission_present,
    to_regprocedure('public.current_user_can_approve_finance_billable_charges()') is not null as charge_approve_permission_present,
    to_regprocedure('public.validate_finance_invoice_v1_integrity_internal(uuid)') is null as v1_validator_internal_name_available,
    to_regprocedure('public.validate_finance_invoice_v2_integrity(uuid)') is null as v2_validator_name_available,
    to_regprocedure('public.issue_finance_invoice_v1_internal(uuid,boolean)') is null as v1_issue_internal_name_available,
    to_regprocedure('public.cancel_finance_invoice_v1_draft_internal(uuid,text)') is null as v1_cancel_internal_name_available,
    to_regprocedure('public.void_finance_invoice_v1_internal(uuid,text,boolean)') is null as v1_void_internal_name_available,
    to_regprocedure('public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)') is null as v2_create_name_available,
    to_regprocedure('public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)') is null as v2_replace_name_available
),
function_contracts as (
  select
    lower(pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure))
      like '%finance_billing_installment_charge_bridges%' as v1_create_checks_permanent_bridge,
    lower(pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure))
      like '%finance_installment_v2_bridged%' as v1_create_has_bridge_business_error,
    lower(pg_get_functiondef('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)'::regprocedure))
      like '%finance_installment_has_v1_invoice_history%' as bridge_blocks_any_v1_history,
    lower(pg_get_functiondef('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)'::regprocedure))
      not like '%finance_invoice_items%' as generic_draft_save_is_nonfinancial
),
source_model_contract as (
  select
    count(*) filter (
      where constraint_name = 'finance_invoices_source_model_check'
        and constraint_definition like '%installment_v1%'
        and constraint_definition like '%billable_charge_v2%'
    ) = 1 as source_model_check_present
  from (
    select con.conname as constraint_name, pg_get_constraintdef(con.oid, true) as constraint_definition
    from pg_constraint as con
    where con.conrelid = 'public.finance_invoices'::regclass
  ) as constraints
),
foundation_counts as (
  select
    (select count(*) from public.finance_billing_installment_charge_bridges) as bridge_rows,
    (select count(*) from public.finance_billing_installment_charge_bridge_audit_events) as bridge_audit_rows,
    (select count(*) from public.finance_billable_charges where source_type = 'billing_installment_item') as generated_installment_charge_rows,
    (select count(*) from public.finance_invoices where source_model = 'billable_charge_v2') as invoice_v2_rows
),
uat_charges as (
  select
    count(*) filter (where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) as travel_count,
    bool_and(status = 'ready_to_invoice') filter (where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) as travel_ready,
    bool_and(currency = 'THB' and case_id is null and advisory_matter_id is null)
      filter (where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) as travel_context_stable,
    bool_and(amount_before_vat = 2000 and vat_amount = 0 and total_amount = 2000
      and economic_classification = 'additional_service')
      filter (where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid) as travel_financials_stable,
    count(*) filter (where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) as court_fee_count,
    bool_and(status = 'ready_to_invoice') filter (where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) as court_fee_ready,
    bool_and(currency = 'THB' and case_id is null and advisory_matter_id is null)
      filter (where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) as court_fee_context_stable,
    bool_and(amount_before_vat = 5000 and vat_amount = 0 and total_amount = 5000
      and economic_classification = 'government_or_court_fee')
      filter (where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid) as court_fee_financials_stable,
    count(distinct client_id) filter (
      where id in (
        'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid,
        '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid
      )
    ) = 1 as uat_charges_same_client
  from public.finance_billable_charges
),
known_invoices as (
  select
    count(*) filter (where invoice_no = 'VP-IV-202608-000001' and document_status = 'voided' and source_model = 'installment_v1') = 1 as invoice_000001_stable,
    count(*) filter (where invoice_no = 'VP-IV-202608-000002' and document_status = 'issued' and source_model = 'installment_v1') = 1 as invoice_000002_stable,
    count(*) filter (where invoice_no = 'VP-IV-202608-000003' and document_status = 'issued' and source_model = 'installment_v1') = 1 as invoice_000003_stable,
    count(*) filter (where invoice_no in ('VP-IV-202608-000001','VP-IV-202608-000002','VP-IV-202608-000003')) as known_invoice_count
  from public.finance_invoices
),
payment_baseline as (
  select
    count(*) as payment_rows,
    count(*) filter (where status = 'draft') as draft_payment_rows,
    count(*) filter (where status = 'confirmed') as confirmed_payment_rows,
    coalesce(sum(cash_amount) filter (where status = 'confirmed'), 0) as confirmed_cash,
    coalesce(sum(wht_amount) filter (where status = 'confirmed'), 0) as confirmed_wht,
    coalesce(sum(settlement_amount) filter (where status = 'confirmed'), 0) as confirmed_settlement,
    count(*) filter (where id = '99e76b48-9ace-4cb0-aaf6-c50d75a968bb'::uuid and status = 'draft') = 1 as active_uat_payment_draft_untouched
  from public.finance_payments
),
scope_baseline as (
  select
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
),
checks as (
  select
    required_objects.*,
    new_objects_absent.*,
    required_functions.*,
    function_contracts.*,
    source_model_contract.*,
    foundation_counts.*,
    uat_charges.*,
    known_invoices.*,
    payment_baseline.*,
    scope_baseline.*
  from required_objects
  cross join new_objects_absent
  cross join required_functions
  cross join function_contracts
  cross join source_model_contract
  cross join foundation_counts
  cross join uat_charges
  cross join known_invoices
  cross join payment_baseline
  cross join scope_baseline
)
select
  checks.*,
  (
    billable_charges_present
    and charge_audit_present
    and bridge_present
    and bridge_audit_present
    and invoices_present
    and invoice_items_present
    and v1_allocations_present
    and settlement_summary_present
    and allocation_table_available
    and allocation_audit_table_available
    and request_table_available
    and v2_columns_available
    and invoice_validator_present
    and v1_create_present
    and draft_save_present
    and cancel_present
    and issue_present
    and void_present
    and bridge_eligibility_present
    and charge_manage_permission_present
    and charge_approve_permission_present
    and v1_validator_internal_name_available
    and v2_validator_name_available
    and v1_issue_internal_name_available
    and v1_cancel_internal_name_available
    and v1_void_internal_name_available
    and v2_create_name_available
    and v2_replace_name_available
    and v1_create_checks_permanent_bridge
    and v1_create_has_bridge_business_error
    and bridge_blocks_any_v1_history
    and generic_draft_save_is_nonfinancial
    and source_model_check_present
    and bridge_rows = 0
    and bridge_audit_rows = 0
    and generated_installment_charge_rows = 0
    and invoice_v2_rows = 0
    and travel_count = 1
    and coalesce(travel_ready, false)
    and coalesce(travel_context_stable, false)
    and coalesce(travel_financials_stable, false)
    and court_fee_count = 1
    and coalesce(court_fee_ready, false)
    and coalesce(court_fee_context_stable, false)
    and coalesce(court_fee_financials_stable, false)
    and uat_charges_same_client
    and invoice_000001_stable
    and invoice_000002_stable
    and invoice_000003_stable
    and known_invoice_count = 3
    and active_uat_payment_draft_untouched
    and confirmed_cash = 14550
    and confirmed_wht = 450
    and confirmed_settlement = 15000
    and cash_transaction_rows = 0
    and opening_balance_rows = 0
    and receipt_object_absent
    and tax_invoice_object_absent
  ) as phase_b3b_invoice_v2_composition_preflight_pass
from checks;
