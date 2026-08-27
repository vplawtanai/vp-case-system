-- Phase 4A Invoice foundation preflight. SELECT-only; returns one row and performs no RPC calls.
select
  current_database() as database_name,
  current_user as database_user,
  version() as postgres_version,
  to_regclass('public.finance_billing_plans') is not null as billing_plans_present,
  to_regclass('public.finance_billing_installments') is not null as billing_installments_present,
  to_regclass('public.finance_billing_installment_items') is not null as billing_installment_items_present,
  to_regclass('public.finance_fee_agreements') is not null as fee_agreements_present,
  to_regclass('public.finance_fee_agreement_items') is not null as fee_agreement_items_present,
  to_regclass('public.document_numbering_profiles') is not null as numbering_profiles_present,
  to_regclass('public.finance_document_counters') is not null as document_counters_present,
  to_regprocedure('public.generate_finance_document_no(text,date)') is not null as number_generator_present,
  (
    select count(*) = 1
    from public.document_numbering_profiles
    where document_type = 'invoice'
      and display_prefix = 'VP-IV'
      and period_scope = 'monthly'
      and sequence_width = 6
      and is_active
  ) as invoice_profile_ready,
  to_regclass('public.finance_invoices') is null as invoice_header_not_yet_present,
  to_regclass('public.finance_invoice_items') is null as invoice_items_not_yet_present,
  to_regclass('public.finance_invoice_installment_allocations') is null as invoice_allocations_not_yet_present,
  to_regclass('public.finance_invoice_audit_events') is null as invoice_audit_not_yet_present,
  (select count(*) from public.finance_billing_plans) as baseline_billing_plan_count,
  (select count(*) from public.finance_billing_installments) as baseline_billing_installment_count,
  (select count(*) from public.finance_billing_installment_items) as baseline_billing_installment_item_count,
  (select count(*) from public.finance_fee_agreements) as baseline_fee_agreement_count,
  (select count(*) from public.finance_fee_agreement_items) as baseline_fee_agreement_item_count,
  (select count(*) from public.finance_document_counters) as baseline_document_counter_count;
