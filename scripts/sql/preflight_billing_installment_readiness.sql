-- Phase 4B readiness preflight. SELECT-only; returns one row and performs no RPC calls.
select
  current_database() as database_name,
  current_user as database_user,
  to_regclass('public.finance_billing_plans') is not null as billing_plans_present,
  to_regclass('public.finance_billing_installments') is not null as billing_installments_present,
  to_regclass('public.finance_invoices') is not null as invoice_foundation_present,
  to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is not null as invoice_draft_rpc_present,
  to_regprocedure('public.set_finance_billing_installment_status(uuid,text)') is not null as legacy_status_rpc_present,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_billing_installments'
      and column_name = 'readiness_event_date'
  ) as readiness_columns_not_yet_present,
  to_regclass('public.finance_billing_installment_audit_events') is null as readiness_audit_not_yet_present,
  to_regprocedure('public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)') is null as readiness_rpc_not_yet_present,
  (select count(*) from public.finance_billing_installments where status = 'pending') as pending_installment_count,
  (select count(*) from public.finance_billing_installments where status = 'ready_to_invoice') as ready_installment_count,
  (select count(*) from public.finance_invoices) as invoice_count;
