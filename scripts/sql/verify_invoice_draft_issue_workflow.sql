-- SELECT-only Production verification for Migration 020.

with expected_functions(signature) as (
  values
    ('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)'),
    ('public.issue_finance_invoice(uuid,boolean)'),
    ('public.cancel_finance_invoice_draft(uuid,text)')
), function_checks as (
  select
    expected.signature,
    to_regprocedure(expected.signature) as function_oid
  from expected_functions as expected
)
select
  'MIGRATION_020_FUNCTIONS' as report_section,
  checks.signature,
  checks.function_oid is not null as function_present,
  coalesce(function_record.prosecdef, false) as security_definer,
  coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'] as fixed_public_search_path,
  case when checks.function_oid is null then false else has_function_privilege('authenticated', checks.function_oid, 'EXECUTE') end as authenticated_can_execute,
  case when checks.function_oid is null then false else has_function_privilege('anon', checks.function_oid, 'EXECUTE') end as anon_can_execute
from function_checks as checks
left join pg_proc as function_record on function_record.oid = checks.function_oid
order by checks.signature;

select
  'INVOICE_DATA_INVARIANTS' as report_section,
  count(*) filter (where document_status = 'draft' and invoice_no is not null) = 0 as no_numbered_drafts,
  count(*) filter (where document_status = 'draft' and issued_snapshot_json is not null) = 0 as no_frozen_drafts,
  count(*) filter (where document_status = 'issued' and (invoice_no is null or issue_date is null or issued_snapshot_json is null)) = 0 as issued_rows_complete,
  count(*) filter (where document_status = 'cancelled' and invoice_no is not null) = 0 as cancelled_drafts_unnumbered,
  count(*) filter (where due_date is not null and issue_date is not null and due_date < issue_date) = 0 as due_dates_valid
from public.finance_invoices;

select
  'MIGRATION_020_VERDICT' as report_section,
  to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)') is not null
  and to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null
  and to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is not null
  and has_function_privilege('authenticated', 'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.issue_finance_invoice(uuid,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancel_finance_invoice_draft(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.issue_finance_invoice(uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_finance_invoice_draft(uuid,text)', 'EXECUTE')
  as invoice_draft_issue_workflow_verification_pass;
