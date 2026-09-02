-- Phase B4 preflight: Billable Charge client-cost funding semantics.
-- SELECT only. Run in Production before reviewing or dry-running Migration 034.

with
column_state as (
  select
    count(*) filter (where column_name = 'client_cost_funding_mode') = 0
      as funding_column_available
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_billable_charges'
),
source_contract as (
  select
    count(*) filter (
      where conname = 'finance_billable_charges_source_type_check'
        and pg_get_constraintdef(oid, true) like '%ad_hoc_service%'
        and pg_get_constraintdef(oid, true) like '%recoverable_cost%'
        and pg_get_constraintdef(oid, true) like '%billing_installment_item%'
    ) = 1 as source_type_taxonomy_present,
    count(*) filter (
      where conname = 'finance_billable_charges_economic_classification_check'
        and pg_get_constraintdef(oid, true) like '%professional_fee%'
        and pg_get_constraintdef(oid, true) like '%additional_service%'
        and pg_get_constraintdef(oid, true) like '%reimbursable_expense%'
        and pg_get_constraintdef(oid, true) like '%government_or_court_fee%'
        and pg_get_constraintdef(oid, true) like '%other%'
    ) = 1 as economic_taxonomy_present
  from pg_constraint
  where conrelid = 'public.finance_billable_charges'::regclass
),
function_state as (
  select
    to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)') is not null
      as legacy_create_present,
    to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is not null
      as legacy_save_present,
    to_regprocedure('public.mark_finance_billable_charge_ready(uuid,boolean)') is not null
      as mark_ready_present,
    to_regprocedure('public.validate_finance_billable_charge_integrity(uuid)') is not null
      as integrity_validator_present,
    to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)') is null
      as funding_create_signature_available,
    to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is null
      as funding_save_signature_available
),
charge_observability as (
  select
    count(*) as charge_rows,
    count(*) filter (where source_type = 'ad_hoc_service') as service_rows,
    count(*) filter (where source_type = 'recoverable_cost') as client_cost_rows,
    count(*) filter (where source_type = 'billing_installment_item') as installment_charge_rows,
    count(*) filter (where status = 'draft') as draft_rows,
    count(*) filter (where status = 'ready_to_invoice') as ready_rows,
    count(*) filter (where status = 'reserved') as reserved_rows,
    count(*) filter (where status = 'invoiced') as invoiced_rows,
    count(*) filter (where status = 'cancelled') as cancelled_rows,
    count(*) filter (
      where id in (
        '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid,
        'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid
      )
    ) as known_historical_charge_rows
  from public.finance_billable_charges
),
finance_observability as (
  select
    (select count(*) from public.finance_invoices) as invoice_rows,
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
),
checks as (
  select *
  from column_state
  cross join source_contract
  cross join function_state
  cross join charge_observability
  cross join finance_observability
)
select
  checks.*,
  (
    funding_column_available
    and source_type_taxonomy_present
    and economic_taxonomy_present
    and legacy_create_present
    and legacy_save_present
    and mark_ready_present
    and integrity_validator_present
    and funding_create_signature_available
    and funding_save_signature_available
    and known_historical_charge_rows = 2
  ) as phase_b4_client_cost_funding_semantics_preflight_pass
from checks;
