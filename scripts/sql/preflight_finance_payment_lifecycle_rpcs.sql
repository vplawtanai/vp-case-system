-- SELECT-only Production preflight for Migration 022.
-- Retain this result for comparison with the post-apply verification.

with lifecycle_functions(signature) as (
  values
    ('public.current_user_can_view_finance_payments()'),
    ('public.current_user_can_manage_finance_payments()'),
    ('public.current_user_can_confirm_finance_payments()'),
    ('public.current_user_can_reverse_finance_payments()'),
    ('public.protect_finance_payment_permission_fields()'),
    ('public.record_finance_payment_audit_event(uuid,text,jsonb)'),
    ('public.assert_finance_payment_has_no_downstream_dependencies(uuid)'),
    ('public.create_finance_payment_draft_from_invoice(uuid)'),
    ('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'),
    ('public.confirm_finance_payment(uuid,boolean)'),
    ('public.cancel_finance_payment_draft(uuid,text)'),
    ('public.reverse_finance_payment(uuid,text)')
), source_contract as (
  select
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as allocations_present,
    to_regclass('public.finance_payment_evidence') is not null as evidence_present,
    to_regclass('public.finance_payment_audit_events') is not null as audit_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    to_regprocedure('public.validate_finance_payment_integrity(uuid)') is not null
      as payment_validator_present,
    to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is not null
      as invoice_settlement_validator_present,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_profiles'
        and column_name = 'active'
        and data_type = 'boolean'
    ) as active_profile_contract_present,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_profiles'
        and column_name = 'role'
    ) as role_contract_present,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_bank_accounts'
        and column_name = 'is_active'
        and data_type = 'boolean'
    ) as active_bank_account_contract_present
), target_names as (
  select
    count(*) filter (
      where table_name = 'user_profiles'
        and column_name in (
        'can_manage_finance_payments',
        'can_confirm_finance_payments',
        'can_reverse_finance_payments'
      )
    ) = 0 as payment_permission_names_available,
    count(*) filter (
      where table_name = 'finance_payments'
        and column_name = 'draft_origin_invoice_id'
    ) = 0
      as draft_origin_name_available
  from information_schema.columns
  where table_schema = 'public'
    and (
      table_name = 'user_profiles'
      or table_name = 'finance_payments'
    )
), function_names as (
  select
    count(*) filter (where to_regprocedure(expected.signature) is not null) = 0
      as lifecycle_function_names_available,
    coalesce(
      jsonb_agg(expected.signature order by expected.signature)
        filter (where to_regprocedure(expected.signature) is not null),
      '[]'::jsonb
    ) as conflicting_function_signatures
  from lifecycle_functions as expected
), supporting_names as (
  select
    to_regclass('public.uq_finance_payments_open_draft_origin_invoice') is null
      and to_regclass('public.idx_finance_payments_draft_origin_invoice') is null
      as lifecycle_index_names_available,
    not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.user_profiles'::regclass
        and tgname = 'protect_finance_payment_permission_fields'
        and not tgisinternal
    ) as permission_trigger_name_available
), uat_invoice as (
  select
    count(*) = 1 as uat_invoice_found_once,
    coalesce(max(invoice_gross_amount), 0) = 15000.00 as gross_is_15000,
    coalesce(max(economically_settled_amount), 0) = 0 as settled_is_zero,
    coalesce(max(outstanding_amount), 0) = 15000.00 as outstanding_is_15000,
    coalesce(max(payment_status), '') = 'unpaid' as payment_status_is_unpaid
  from public.finance_invoice_settlement_summary
  where invoice_no = 'VP-IV-202608-000001'
), baseline_counts as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payment_invoice_allocations) as allocation_rows,
    (select count(*) from public.finance_payment_evidence) as evidence_rows,
    (select count(*) from public.finance_payment_audit_events) as audit_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
), downstream_baseline as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as no_receipt_or_tax_invoice_objects
)
select
  'PAYMENT_LIFECYCLE_RPC_PREFLIGHT' as report_section,
  current_database() as database_name,
  current_user as database_user,
  version() as postgres_version,
  source_contract.*,
  target_names.*,
  function_names.*,
  supporting_names.*,
  uat_invoice.*,
  baseline_counts.*,
  downstream_baseline.*,
  (
    source_contract.payments_present
    and source_contract.allocations_present
    and source_contract.evidence_present
    and source_contract.audit_present
    and source_contract.settlement_view_present
    and source_contract.payment_validator_present
    and source_contract.invoice_settlement_validator_present
    and source_contract.active_profile_contract_present
    and source_contract.role_contract_present
    and source_contract.active_bank_account_contract_present
    and target_names.payment_permission_names_available
    and target_names.draft_origin_name_available
    and function_names.lifecycle_function_names_available
    and supporting_names.lifecycle_index_names_available
    and supporting_names.permission_trigger_name_available
    and uat_invoice.uat_invoice_found_once
    and uat_invoice.gross_is_15000
    and uat_invoice.settled_is_zero
    and uat_invoice.outstanding_is_15000
    and uat_invoice.payment_status_is_unpaid
    and baseline_counts.payment_rows = 0
    and baseline_counts.allocation_rows = 0
    and baseline_counts.evidence_rows = 0
    and baseline_counts.audit_rows = 0
    and downstream_baseline.no_receipt_or_tax_invoice_objects
  ) as payment_lifecycle_rpc_preflight_pass
from source_contract
cross join target_names
cross join function_names
cross join supporting_names
cross join uat_invoice
cross join baseline_counts
cross join downstream_baseline;
