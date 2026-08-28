-- SELECT-only Production preflight for Migration 024.

with source_objects as (
  select
    to_regclass('public.finance_invoices') is not null as invoices_present,
    to_regclass('public.finance_invoice_audit_events') is not null as invoice_audit_present,
    to_regclass('public.finance_invoice_installment_allocations') is not null as invoice_allocations_present,
    to_regclass('public.finance_billing_plans') is not null as billing_plans_present,
    to_regclass('public.finance_billing_installments') is not null as billing_installments_present,
    to_regclass('public.finance_billing_installment_audit_events') is not null as installment_audit_present,
    to_regclass('public.finance_payments') is not null as payments_present,
    to_regclass('public.finance_payment_invoice_allocations') is not null as payment_allocations_present,
    to_regclass('public.finance_invoice_settlement_summary') is not null as settlement_view_present,
    to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is not null as invoice_validator_present,
    to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is not null as payment_settlement_validator_present,
    to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null as issue_rpc_present,
    to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is not null as draft_cancel_rpc_present,
    to_regprocedure('public.current_user_can_manage_finance_quotations()') is not null as invoice_permission_present
), invoice_contract as (
  select
    count(*) filter (where column_name = 'document_status' and data_type = 'text') = 1 as status_present,
    count(*) filter (where column_name = 'voided_at' and data_type = 'timestamp with time zone') = 1 as voided_at_present,
    count(*) filter (where column_name = 'voided_by_user_id' and udt_name = 'uuid') = 1 as voided_by_present,
    count(*) filter (where column_name = 'void_reason' and data_type = 'text') = 1 as void_reason_present,
    count(*) filter (where column_name = 'invoice_no' and data_type = 'text') = 1 as invoice_no_present,
    count(*) filter (where column_name = 'issued_snapshot_json' and udt_name = 'jsonb') = 1 as issued_snapshot_present,
    count(*) filter (where column_name = 'payment_destination_snapshot_json' and udt_name = 'jsonb') = 1 as destination_snapshot_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_invoices'
), constraint_contract as (
  select
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_invoices'::regclass
        and conname = 'finance_invoices_document_status_check'
        and lower(pg_get_constraintdef(oid)) like '%voided%'
    ) as invoice_voided_status_allowed,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_invoices'::regclass
        and conname = 'finance_invoices_lifecycle_metadata_check'
        and lower(pg_get_constraintdef(oid)) like '%voided_at is not null%'
        and lower(pg_get_constraintdef(oid)) like '%void_reason%'
    ) as invoice_void_metadata_enforced,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_invoice_audit_events'::regclass
        and conname = 'finance_invoice_audit_events_type_check'
        and lower(pg_get_constraintdef(oid)) like '%voided%'
    ) as invoice_void_audit_allowed,
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_billing_installment_audit_events'::regclass
        and conname = 'finance_billing_installment_audit_events_type_check'
        and lower(pg_get_constraintdef(oid)) not like '%invoice_voided_reopened%'
    ) as installment_void_audit_name_available,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'uq_finance_invoices_invoice_no'
        and indexdef like '%UNIQUE%'
        and indexdef like '%invoice_no%'
    ) as invoice_number_unique,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'uq_finance_invoices_active_primary_installment'
        and indexdef like '%cancelled%'
        and indexdef like '%voided%'
    ) as active_invoice_index_excludes_voided,
    exists (
      select 1 from public.document_numbering_profiles
      where document_type = 'invoice'
        and display_prefix = 'VP-IV'
        and period_scope = 'monthly'
        and sequence_width = 6
        and is_active
    ) as invoice_numbering_profile_active
), target_names as (
  select
    to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)') is null as dependency_guard_name_available,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is null as void_rpc_name_available
), uat_invoices as (
  select
    count(*) filter (where invoice_no = 'VP-IV-202608-000001') = 1 as invoice_000001_found_once,
    count(*) filter (where invoice_no = 'VP-IV-202608-000001' and document_status = 'issued') = 1 as invoice_000001_still_issued,
    count(*) filter (where invoice_no = 'VP-IV-202608-000002') = 1 as invoice_000002_found_once,
    count(*) filter (where invoice_no = 'VP-IV-202608-000002' and document_status = 'issued') = 1 as invoice_000002_still_issued,
    count(*) filter (where document_status = 'voided') = 0 as no_invoice_currently_voided,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'invoice_no', invoice_no,
        'status', document_status,
        'issued_at', issued_at,
        'voided_at', voided_at
      ) order by invoice_no
    ) filter (where invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002')) as uat_invoice_rows
  from public.finance_invoices
), uat_payment_history as (
  select
    count(*) filter (
      where invoice.invoice_no = 'VP-IV-202608-000001'
        and payment.status = 'cancelled'
    ) >= 1 as invoice_000001_has_cancelled_payment_history,
    count(*) filter (
      where invoice.invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002')
        and payment.status = 'draft'
    ) = 0 as no_active_uat_payment_draft,
    count(*) filter (
      where invoice.invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002')
        and payment.status = 'confirmed'
    ) = 0 as no_effective_uat_confirmed_payment,
    coalesce(sum(allocation.settlement_total) filter (
      where invoice.invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002')
        and payment.status = 'confirmed'
    ), 0)::numeric(14, 2) = 0 as uat_confirmed_settlement_zero
  from public.finance_invoices as invoice
  left join public.finance_payment_invoice_allocations as allocation on allocation.invoice_id = invoice.id
  left join public.finance_payments as payment on payment.id = allocation.payment_id
  where invoice.invoice_no in ('VP-IV-202608-000001', 'VP-IV-202608-000002')
), downstream_objects as (
  select
    to_regclass('public.finance_receipts') is null as receipts_absent,
    to_regclass('public.finance_receipt_invoice_allocations') is null as receipt_invoice_allocations_absent,
    to_regclass('public.finance_tax_invoices') is null as tax_invoices_absent,
    to_regclass('public.finance_credit_notes') is null as credit_notes_absent,
    to_regclass('public.finance_invoice_credit_note_allocations') is null as credit_note_allocations_absent
), financial_baseline as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
)
select
  'MIGRATION_024_PREFLIGHT' as report_section,
  current_database() as database_name,
  current_user as database_user,
  source_objects.*,
  invoice_contract.*,
  constraint_contract.*,
  target_names.*,
  uat_invoices.*,
  uat_payment_history.*,
  downstream_objects.*,
  financial_baseline.*,
  (
    source_objects.invoices_present
    and source_objects.invoice_audit_present
    and source_objects.invoice_allocations_present
    and source_objects.billing_plans_present
    and source_objects.billing_installments_present
    and source_objects.installment_audit_present
    and source_objects.payments_present
    and source_objects.payment_allocations_present
    and source_objects.settlement_view_present
    and source_objects.invoice_validator_present
    and source_objects.payment_settlement_validator_present
    and source_objects.issue_rpc_present
    and source_objects.draft_cancel_rpc_present
    and source_objects.invoice_permission_present
    and invoice_contract.status_present
    and invoice_contract.voided_at_present
    and invoice_contract.voided_by_present
    and invoice_contract.void_reason_present
    and invoice_contract.invoice_no_present
    and invoice_contract.issued_snapshot_present
    and invoice_contract.destination_snapshot_present
    and constraint_contract.invoice_voided_status_allowed
    and constraint_contract.invoice_void_metadata_enforced
    and constraint_contract.invoice_void_audit_allowed
    and constraint_contract.installment_void_audit_name_available
    and constraint_contract.invoice_number_unique
    and constraint_contract.active_invoice_index_excludes_voided
    and constraint_contract.invoice_numbering_profile_active
    and target_names.dependency_guard_name_available
    and target_names.void_rpc_name_available
    and uat_invoices.invoice_000001_found_once
    and uat_invoices.invoice_000001_still_issued
    and uat_invoices.invoice_000002_found_once
    and uat_invoices.invoice_000002_still_issued
    and uat_invoices.no_invoice_currently_voided
    and uat_payment_history.invoice_000001_has_cancelled_payment_history
    and uat_payment_history.no_active_uat_payment_draft
    and uat_payment_history.no_effective_uat_confirmed_payment
    and uat_payment_history.uat_confirmed_settlement_zero
    and downstream_objects.receipts_absent
    and downstream_objects.receipt_invoice_allocations_absent
    and downstream_objects.tax_invoices_absent
    and downstream_objects.credit_notes_absent
    and downstream_objects.credit_note_allocations_absent
    and financial_baseline.ledger_rows = 267
    and financial_baseline.compensation_rows = 33
  ) as invoice_void_lifecycle_preflight_pass
from source_objects
cross join invoice_contract
cross join constraint_contract
cross join target_names
cross join uat_invoices
cross join uat_payment_history
cross join downstream_objects
cross join financial_baseline;
