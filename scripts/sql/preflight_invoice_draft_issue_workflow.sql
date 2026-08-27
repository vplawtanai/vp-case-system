-- SELECT-only Production preflight for Migration 020.

select
  'MIGRATION_020_PREREQUISITES' as report_section,
  to_regclass('public.finance_invoices') is not null as invoice_table_present,
  to_regclass('public.finance_invoice_items') is not null as invoice_items_present,
  to_regclass('public.finance_invoice_installment_allocations') is not null as allocation_table_present,
  to_regclass('public.finance_invoice_audit_events') is not null as audit_table_present,
  to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is not null as draft_create_rpc_present,
  to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is not null as validator_present,
  to_regprocedure('public.generate_finance_document_no(text,date)') is not null as numbering_function_present,
  to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)') is not null as migration_020_save_rpc_already_present,
  to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null as migration_020_issue_rpc_already_present,
  to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is not null as migration_020_cancel_rpc_already_present;

select
  'CURRENT_INVOICE_BASELINE' as report_section,
  count(*) filter (where document_status = 'draft') as draft_count,
  count(*) filter (where document_status = 'issued') as issued_count,
  count(*) filter (where document_status = 'cancelled') as cancelled_count,
  count(*) filter (where document_status = 'voided') as voided_count,
  count(*) filter (where invoice_no is not null) as numbered_count,
  count(*) filter (where issued_snapshot_json is not null) as issued_snapshot_count
from public.finance_invoices;

select
  'SECURITY_BASELINE' as report_section,
  function_record.proname as function_name,
  function_record.prosecdef as security_definer,
  coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'] as fixed_public_search_path,
  has_function_privilege('authenticated', function_record.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', function_record.oid, 'EXECUTE') as anon_can_execute
from pg_proc as function_record
where function_record.oid in (
  'public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure,
  'public.validate_finance_invoice_integrity(uuid)'::regprocedure,
  'public.enforce_finance_invoice_integrity()'::regprocedure,
  'public.enforce_finance_invoice_child_integrity()'::regprocedure,
  'public.enforce_finance_invoice_source_status_integrity()'::regprocedure
)
order by function_record.proname;
