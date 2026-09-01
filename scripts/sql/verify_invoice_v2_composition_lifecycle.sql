-- Phase B3B post-apply verification: Invoice V2 composition lifecycle foundation.
-- SELECT only. Returns one result row and performs no lifecycle transition.

with
objects as (
  select
    to_regclass('public.finance_invoice_v2_composition_requests') is not null as request_table_present,
    to_regclass('public.finance_invoice_charge_allocations') is not null as allocation_table_present,
    to_regclass('public.finance_invoice_charge_allocation_audit_events') is not null as allocation_audit_table_present
),
columns as (
  select
    count(*) filter (where table_name = 'finance_invoices' and column_name in (
      'v2_bridge_id','v2_creation_request_id','v2_creation_fingerprint'
    )) = 3 as invoice_v2_columns_present,
    count(*) filter (where table_name = 'finance_invoice_items' and column_name in (
      'source_billable_charge_id','source_state'
    )) = 2 as invoice_item_v2_columns_present,
    count(*) filter (where table_name = 'finance_invoice_charge_allocations' and column_name in (
      'id','invoice_id','invoice_item_id','billable_charge_id','amount_before_vat','vat_amount',
      'total_amount','source_snapshot_json','status','request_id','reserved_at','reserved_by_user_id',
      'invoiced_at','invoiced_by_user_id','released_at','released_by_user_id','release_reason','created_at'
    )) = 18 as allocation_columns_complete
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('finance_invoices','finance_invoice_items','finance_invoice_charge_allocations')
),
constraints as (
  select
    count(*) filter (where conname = 'finance_invoices_source_model_lineage_check' and contype = 'c') = 1 as invoice_source_lineage_check_present,
    count(*) filter (where conname = 'finance_invoices_v2_creation_request_fk' and contype = 'f' and condeferrable and condeferred) = 1 as creation_request_fk_deferred,
    count(*) filter (where conname = 'finance_invoice_items_conditional_source_check' and contype = 'c') = 1 as conditional_item_source_check_present,
    count(*) filter (where conname = 'finance_invoice_charge_allocations_amounts_check' and contype = 'c') = 1 as allocation_amount_check_present,
    count(*) filter (where conname = 'finance_invoice_charge_allocations_lifecycle_check' and contype = 'c') = 1 as allocation_lifecycle_check_present
  from pg_constraint
  where connamespace = 'public'::regnamespace
),
indexes as (
  select
    count(*) filter (
      where indexname = 'uq_finance_invoice_charge_allocations_effective_charge'
        and indexdef like 'createuniqueindex%'
        and indexdef like '%where%'
        and indexdef like '%reserved%'
        and indexdef like '%invoiced%'
    ) = 1 as effective_charge_uniqueness_present,
    count(*) filter (where indexname = 'uq_finance_invoice_charge_allocations_item' and indexdef like 'createuniqueindex%') = 1 as one_allocation_per_item_present,
    count(*) filter (where indexname = 'uq_finance_invoices_v2_creation_request' and indexdef like 'createuniqueindex%') = 1 as creation_request_uniqueness_present
  from (
    select indexname, regexp_replace(lower(indexdef), '\s+', '', 'g') as indexdef
    from pg_indexes
    where schemaname = 'public'
  ) as normalized_indexes
),
triggers as (
  select
    count(*) filter (where tgname = 'finance_invoice_charge_allocation_lifecycle_guard' and not tgisinternal) = 1 as allocation_lifecycle_trigger_present,
    count(*) filter (where tgname = 'finance_invoice_charge_allocation_audit_writer' and not tgisinternal) = 1 as allocation_audit_trigger_present,
    count(*) filter (where tgname = 'finance_invoice_charge_allocation_integrity' and tgdeferrable and tginitdeferred) = 1 as allocation_integrity_deferred,
    count(*) filter (where tgname = 'finance_charge_invoice_allocation_integrity' and tgdeferrable and tginitdeferred) = 1 as charge_integrity_deferred,
    count(*) filter (where tgname = 'finance_billable_charge_invoice_lifecycle_audit' and not tgisinternal) = 1 as charge_lifecycle_audit_trigger_present
  from pg_trigger
  where tgrelid in (
    'public.finance_invoice_charge_allocations'::regclass,
    'public.finance_billable_charges'::regclass
  )
),
functions as (
  select
    to_regprocedure('public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)') is not null as v2_create_present,
    to_regprocedure('public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)') is not null as v2_replace_present,
    to_regprocedure('public.validate_finance_invoice_v2_integrity(uuid)') is not null as v2_validator_present,
    to_regprocedure('public.validate_finance_invoice_v1_integrity_internal(uuid)') is not null as v1_validator_preserved,
    to_regprocedure('public.issue_finance_invoice_v1_internal(uuid,boolean)') is not null as v1_issue_preserved,
    to_regprocedure('public.cancel_finance_invoice_v1_draft_internal(uuid,text)') is not null as v1_cancel_preserved,
    to_regprocedure('public.void_finance_invoice_v1_internal(uuid,text,boolean)') is not null as v1_void_preserved,
    to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is not null as validator_dispatch_present,
    to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null as issue_dispatch_present,
    to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is not null as cancel_dispatch_present,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null as void_dispatch_present
),
function_contracts as (
  select
    regexp_replace(lower(pg_get_functiondef('public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)'::regprocedure)), '\s+', '', 'g') as create_def,
    regexp_replace(lower(pg_get_functiondef('public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)'::regprocedure)), '\s+', '', 'g') as replace_def,
    regexp_replace(lower(pg_get_functiondef('public.validate_finance_invoice_v2_integrity(uuid)'::regprocedure)), '\s+', '', 'g') as validator_def,
    regexp_replace(lower(pg_get_functiondef('public.issue_finance_invoice(uuid,boolean)'::regprocedure)), '\s+', '', 'g') as issue_def,
    regexp_replace(lower(pg_get_functiondef('public.cancel_finance_invoice_draft(uuid,text)'::regprocedure)), '\s+', '', 'g') as cancel_def,
    regexp_replace(lower(pg_get_functiondef('public.void_finance_invoice(uuid,text,boolean)'::regprocedure)), '\s+', '', 'g') as void_def,
    regexp_replace(lower(pg_get_functiondef('public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure)), '\s+', '', 'g') as v1_create_def,
    regexp_replace(lower(pg_get_functiondef('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)'::regprocedure)), '\s+', '', 'g') as save_def
),
contract_checks as (
  select
    create_def like '%pg_advisory_xact_lock%'
      and create_def like '%finance_invoice_v2_composition_requests%'
      and create_def like '%assert_finance_billing_installment_v2_bridge_eligible%'
      and create_def like '%source_fixed_allocation%'
      and create_def like '%finance_invoice_charge_allocations%'
      and create_def like '%forupdate%'
      and create_def like '%invoicev2requestidwasalreadyusedwithdifferentcompositiondata%'
      as create_atomic_idempotent_contract,
    create_def like '%human-certifiedinstallmentsemanticadapterisrequired%'
      and create_def like '%missinginstallmentsemanticsrequireexplicithumancertification%'
      and create_def like '%adapter_semantics_required%'
      and create_def like '%upstream_frozen_semantics%'
      and create_def like '%amount_before_tax%'
      and create_def like '%vat_amount%'
      and create_def like '%total_amount%'
      as source_fixed_adapter_contract,
    create_def like '%sameclient,currency,andexactmattercontext%'
      and create_def like '%case_idisdistinctfrom%'
      and create_def like '%advisory_matter_idisdistinctfrom%'
      as exact_context_contract,
    replace_def like '%onlyadraftinvoicev2canchangecomposition%'
      and replace_def like '%source_type<>%billing_installment_item%'
      and replace_def like '%status=%released%'
      and replace_def like '%source_state=%released%'
      as draft_composition_history_contract,
    validator_def like '%completebridgedbillinginstallmentchargegroup%'
      and validator_def like '%durablecreationrequestismissingorinconsistent%'
      and validator_def like '%cannotusetheinvoicev1installment-allocationcontract%'
      as v2_integrity_contract,
    issue_def like '%source_model=%installment_v1%'
      and issue_def like '%issue_finance_invoice_v1_internal%'
      and issue_def like '%schema_version%2%'
      and issue_def like '%generate_finance_document_no%'
      and issue_def like '%status=%invoiced%'
      as issue_dispatch_and_freeze_contract,
    cancel_def like '%cancel_finance_invoice_v1_draft_internal%'
      and cancel_def like '%status=%released%'
      and cancel_def like '%status=%ready_to_invoice%'
      and cancel_def not like '%deletefrompublic.finance_billing_installment_charge_bridges%'
      as cancel_release_preserves_bridge,
    void_def like '%void_finance_invoice_v1_internal%'
      and void_def like '%finance_payment_effective_invoice_allocations%'
      and void_def like '%assert_finance_invoice_has_no_void_dependencies%'
      and void_def like '%issued_snapshot_jsonisdistinctfrom%'
      and void_def like '%status=%ready_to_invoice%'
      and void_def not like '%deletefrompublic.finance_billing_installment_charge_bridges%'
      as void_payment_and_history_contract,
    v1_create_def like '%finance_billing_installment_charge_bridges%'
      and v1_create_def like '%finance_installment_v2_bridged%'
      as v1_double_billing_guard_preserved,
    save_def not like '%finance_invoice_items%'
      and save_def not like '%finance_invoice_charge_allocations%'
      as nonfinancial_draft_save_preserved
  from function_contracts
),
security as (
  select
    (select relrowsecurity from pg_class where oid = 'public.finance_invoice_v2_composition_requests'::regclass) as request_rls_enabled,
    (select relrowsecurity from pg_class where oid = 'public.finance_invoice_charge_allocations'::regclass) as allocation_rls_enabled,
    (select relrowsecurity from pg_class where oid = 'public.finance_invoice_charge_allocation_audit_events'::regclass) as allocation_audit_rls_enabled,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'finance_invoice_v2_composition_requests' and cmd = 'SELECT') = 1 as request_select_policy_present,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'finance_invoice_charge_allocations' and cmd = 'SELECT') = 1 as allocation_select_policy_present,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'finance_invoice_charge_allocation_audit_events' and cmd = 'SELECT') = 1 as allocation_audit_select_policy_present,
    not has_table_privilege('anon','public.finance_invoice_v2_composition_requests','INSERT,UPDATE,DELETE') as anon_request_mutation_blocked,
    not has_table_privilege('authenticated','public.finance_invoice_v2_composition_requests','INSERT,UPDATE,DELETE') as authenticated_request_mutation_blocked,
    not has_table_privilege('anon','public.finance_invoice_charge_allocations','INSERT,UPDATE,DELETE') as anon_allocation_mutation_blocked,
    not has_table_privilege('authenticated','public.finance_invoice_charge_allocations','INSERT,UPDATE,DELETE') as authenticated_allocation_mutation_blocked,
    not has_table_privilege('anon','public.finance_invoice_charge_allocation_audit_events','INSERT,UPDATE,DELETE') as anon_allocation_audit_mutation_blocked,
    not has_table_privilege('authenticated','public.finance_invoice_charge_allocation_audit_events','INSERT,UPDATE,DELETE') as authenticated_allocation_audit_mutation_blocked,
    has_function_privilege('authenticated','public.create_finance_invoice_v2_draft(uuid,uuid,uuid[],jsonb,boolean,text,date,text,text,text,uuid)','EXECUTE') as authenticated_v2_create_execute,
    has_function_privilege('authenticated','public.replace_finance_invoice_v2_draft_charges(uuid,uuid,uuid[],boolean)','EXECUTE') as authenticated_v2_replace_execute,
    has_function_privilege('authenticated','public.issue_finance_invoice(uuid,boolean)','EXECUTE') as authenticated_issue_execute,
    has_function_privilege('authenticated','public.cancel_finance_invoice_draft(uuid,text)','EXECUTE') as authenticated_cancel_execute,
    has_function_privilege('authenticated','public.void_finance_invoice(uuid,text,boolean)','EXECUTE') as authenticated_void_execute,
    not has_function_privilege('authenticated','public.validate_finance_invoice_v2_integrity(uuid)','EXECUTE') as internal_v2_validator_not_exposed
),
operational_state as (
  select
    (select count(*) from public.finance_billing_installment_charge_bridges) as bridge_rows,
    (select count(*) from public.finance_billing_installment_charge_bridge_audit_events) as bridge_audit_rows,
    (select count(*) from public.finance_invoice_charge_allocations) as invoice_charge_allocation_rows,
    (select count(*) from public.finance_invoice_charge_allocation_audit_events) as allocation_audit_rows,
    (select count(*) from public.finance_invoice_v2_composition_requests) as composition_request_rows,
    (select count(*) from public.finance_billable_charges where source_type = 'billing_installment_item') as generated_installment_charge_rows,
    (select count(*) from public.finance_invoices where source_model = 'billable_charge_v2') as invoice_v2_rows
),
uat_charges as (
  select
    count(*) filter (where id = 'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid
      and status = 'ready_to_invoice' and amount_before_vat = 2000 and vat_amount = 0 and total_amount = 2000
      and economic_classification = 'additional_service' and currency = 'THB'
      and case_id is null and advisory_matter_id is null) = 1 as travel_charge_unchanged,
    count(*) filter (where id = '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid
      and status = 'ready_to_invoice' and amount_before_vat = 5000 and vat_amount = 0 and total_amount = 5000
      and economic_classification = 'government_or_court_fee' and currency = 'THB'
      and case_id is null and advisory_matter_id is null) = 1 as court_fee_charge_unchanged,
    count(distinct client_id) filter (where id in (
      'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid,
      '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid
    )) = 1 as uat_charge_clients_still_match
  from public.finance_billable_charges
),
existing_state as (
  select
    (select count(*) from public.finance_invoices where invoice_no = 'VP-IV-202608-000001' and document_status = 'voided' and source_model = 'installment_v1') = 1 as invoice_000001_unchanged,
    (select count(*) from public.finance_invoices where invoice_no = 'VP-IV-202608-000002' and document_status = 'issued' and source_model = 'installment_v1') = 1 as invoice_000002_unchanged,
    (select count(*) from public.finance_invoices where invoice_no = 'VP-IV-202608-000003' and document_status = 'issued' and source_model = 'installment_v1') = 1 as invoice_000003_unchanged,
    (select count(*) from public.finance_payments where id = '99e76b48-9ace-4cb0-aaf6-c50d75a968bb'::uuid and status = 'draft') = 1 as active_payment_draft_unchanged,
    (select coalesce(sum(cash_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_cash,
    (select coalesce(sum(wht_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_wht,
    (select coalesce(sum(settlement_amount),0) from public.finance_payments where status = 'confirmed') as confirmed_settlement,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    to_regclass('public.finance_receipts') is null as receipt_object_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoice_object_absent
),
checks as (
  select *
  from objects cross join columns cross join constraints cross join indexes cross join triggers
  cross join functions cross join contract_checks cross join security cross join operational_state
  cross join uat_charges cross join existing_state
)
select
  checks.*,
  (
    request_table_present and allocation_table_present and allocation_audit_table_present
    and invoice_v2_columns_present and invoice_item_v2_columns_present and allocation_columns_complete
    and invoice_source_lineage_check_present and creation_request_fk_deferred
    and conditional_item_source_check_present and allocation_amount_check_present and allocation_lifecycle_check_present
    and effective_charge_uniqueness_present and one_allocation_per_item_present and creation_request_uniqueness_present
    and allocation_lifecycle_trigger_present and allocation_audit_trigger_present
    and allocation_integrity_deferred and charge_integrity_deferred and charge_lifecycle_audit_trigger_present
    and v2_create_present and v2_replace_present and v2_validator_present
    and v1_validator_preserved and v1_issue_preserved and v1_cancel_preserved and v1_void_preserved
    and validator_dispatch_present and issue_dispatch_present and cancel_dispatch_present and void_dispatch_present
    and create_atomic_idempotent_contract and source_fixed_adapter_contract and exact_context_contract
    and draft_composition_history_contract and v2_integrity_contract and issue_dispatch_and_freeze_contract
    and cancel_release_preserves_bridge and void_payment_and_history_contract
    and v1_double_billing_guard_preserved and nonfinancial_draft_save_preserved
    and request_rls_enabled and allocation_rls_enabled and allocation_audit_rls_enabled
    and request_select_policy_present and allocation_select_policy_present and allocation_audit_select_policy_present
    and anon_request_mutation_blocked and authenticated_request_mutation_blocked
    and anon_allocation_mutation_blocked and authenticated_allocation_mutation_blocked
    and anon_allocation_audit_mutation_blocked and authenticated_allocation_audit_mutation_blocked
    and authenticated_v2_create_execute and authenticated_v2_replace_execute
    and authenticated_issue_execute and authenticated_cancel_execute and authenticated_void_execute
    and internal_v2_validator_not_exposed
    and bridge_rows = 0 and bridge_audit_rows = 0 and invoice_charge_allocation_rows = 0
    and allocation_audit_rows = 0 and composition_request_rows = 0
    and generated_installment_charge_rows = 0 and invoice_v2_rows = 0
    and travel_charge_unchanged and court_fee_charge_unchanged and uat_charge_clients_still_match
    and invoice_000001_unchanged and invoice_000002_unchanged and invoice_000003_unchanged
    and active_payment_draft_unchanged
    and confirmed_cash = 14550 and confirmed_wht = 450 and confirmed_settlement = 15000
    and cash_transaction_rows = 0 and opening_balance_rows = 0
    and legacy_ledger_rows = 271 and compensation_rows = 33
    and receipt_object_absent and tax_invoice_object_absent
  ) as phase_b3b_invoice_v2_composition_foundation_verification_pass
from checks;
