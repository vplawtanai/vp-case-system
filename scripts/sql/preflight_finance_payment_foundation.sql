-- SELECT-only Production preflight for Migration 021.
-- Run once before the transactional dry-run and retain the legacy row counts
-- for comparison with the post-apply verification result.

select
  'PAYMENT_FOUNDATION_PREFLIGHT' as report_section,
  current_database() as database_name,
  current_user as database_user,
  version() as postgres_version,
  to_regclass('public.finance_invoices') is not null as invoice_table_present,
  to_regclass('public.clients') is not null as clients_table_present,
  to_regclass('public.user_profiles') is not null as user_profiles_table_present,
  to_regclass('public.finance_bank_accounts') is not null as reusable_bank_accounts_present,
  to_regprocedure('public.current_user_can_manage_finance_quotations()') is not null as finance_permission_function_present,
  (
    select count(*)
    from public.finance_invoices
  ) as current_invoice_count,
  (
    select count(*)
    from public.finance_invoices
    where document_status = 'issued'
  ) as current_issued_invoice_count,
  (
    select count(*)
    from public.finance_invoices
    where invoice_no = 'VP-IV-202608-000001'
      and document_status = 'issued'
      and total_amount = 15000.00
  ) = 1 as uat_invoice_baseline_present,
  to_regclass('public.finance_payments') is null as payments_name_available,
  to_regclass('public.finance_payment_invoice_allocations') is null as payment_allocations_name_available,
  to_regclass('public.finance_payment_evidence') is null as payment_evidence_name_available,
  to_regclass('public.finance_payment_audit_events') is null as payment_audit_name_available,
  to_regclass('public.finance_invoice_settlement_summary') is null as settlement_view_name_available,
  (
    select coalesce(jsonb_agg(object_name order by object_name), '[]'::jsonb)
    from (
      select namespace_record.nspname || '.' || class_record.relname as object_name
      from pg_class as class_record
      join pg_namespace as namespace_record on namespace_record.oid = class_record.relnamespace
      where namespace_record.nspname = 'public'
        and (
          class_record.relname like 'finance_payment%'
          or class_record.relname = 'finance_invoice_settlement_summary'
        )
    ) as existing_payment_objects
  ) as existing_payment_like_objects,
  (
    select coalesce(jsonb_agg(function_name order by function_name), '[]'::jsonb)
    from (
      select function_record.proname as function_name
      from pg_proc as function_record
      join pg_namespace as namespace_record on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and (
          function_record.proname like '%finance_payment%'
          or function_record.proname = 'validate_finance_invoice_payment_settlement'
        )
    ) as existing_payment_functions
  ) as existing_payment_like_functions,
  (
    select count(*)
    from public.finance_company_ledger
  ) as ledger_row_count_for_comparison,
  (
    select count(*)
    from public.finance_compensation_batches
  ) as compensation_row_count_for_comparison,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'client_id'
      and udt_name = 'uuid'
  ) as invoice_client_fk_source_compatible,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'currency'
      and data_type = 'text'
  ) as invoice_currency_source_compatible,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'total_amount'
      and data_type = 'numeric'
  ) as invoice_total_source_compatible,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) as bank_account_fk_source_compatible;
