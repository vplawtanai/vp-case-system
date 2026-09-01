with
constants as (
  select
    'efd31db6-d3c0-4947-ba61-cf6b3b273fa2'::uuid as quotation_id,
    '5018cf1e-d271-40e1-9bd6-2a0ac7f1a3bf'::uuid as fee_agreement_id,
    'aa7b83b1-f702-4eca-a8ec-5b07e411b049'::uuid as billing_plan_id
),
catalog_state as (
  select
    to_regprocedure('public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb)') is not null as current_save_rpc_present,
    to_regprocedure('public.save_finance_quotation_payment_terms_v1_internal(uuid,text,text,text,jsonb)') is null as internal_v1_rpc_absent,
    to_regprocedure('public.finance_allocate_satang_by_weights(bigint,bigint[])') is null as satang_helper_absent,
    to_regprocedure('public.finance_compute_quotation_percentage_allocation_gross_first(jsonb,jsonb,text)') is null as gross_first_contract_absent,
    pg_get_functiondef(to_regprocedure('public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb)')) as current_save_definition,
    pg_get_functiondef(to_regprocedure('public.freeze_finance_quotation_commercial_terms_v2()')) as current_freeze_definition,
    (
      select column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_quotation_payment_terms'
        and column_name = 'snapshot_version'
    ) as snapshot_version_default,
    (
      select pg_get_constraintdef(constraint_record.oid)
      from pg_constraint as constraint_record
      where constraint_record.conrelid = 'public.finance_quotation_payment_terms'::regclass
        and constraint_record.conname = 'finance_quotation_payment_terms_version_check'
    ) as snapshot_version_constraint
),
uat_state as (
  select
    (select count(*) from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as quotation_count,
    (select quotation.status from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as quotation_status,
    (select quotation.grand_total from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as quotation_gross,
    (select count(*) from public.finance_fee_agreements as agreement join constants on agreement.id = constants.fee_agreement_id and agreement.source_quotation_id = constants.quotation_id) as fee_agreement_count,
    (select agreement.status from public.finance_fee_agreements as agreement join constants on agreement.id = constants.fee_agreement_id) as fee_agreement_status,
    (select count(*) from public.finance_billing_plans as plan join constants on plan.id = constants.billing_plan_id and plan.fee_agreement_id = constants.fee_agreement_id) as billing_plan_count,
    (select plan.status from public.finance_billing_plans as plan join constants on plan.id = constants.billing_plan_id) as billing_plan_status,
    (select count(*) from public.finance_invoices as invoice join constants on invoice.billing_plan_id = constants.billing_plan_id) as invoice_count,
    (select count(*) from public.finance_billing_installment_charge_bridges as bridge join constants on bridge.billing_plan_id = constants.billing_plan_id) as bridge_count,
    (select count(distinct allocation.payment_id)
      from public.finance_payment_invoice_allocations as allocation
      join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
      join constants on invoice.billing_plan_id = constants.billing_plan_id) as payment_count,
    (select count(*)
      from public.finance_cash_transactions as cash_transaction
      join public.finance_payment_invoice_allocations as allocation on allocation.payment_id = cash_transaction.source_payment_id
      join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
      join constants on invoice.billing_plan_id = constants.billing_plan_id) as cash_transaction_count,
    (select terms.snapshot_version from public.finance_quotation_payment_terms as terms join constants on terms.quotation_id = constants.quotation_id) as live_payment_terms_version,
    (select quotation.document_data_snapshot_json->'payment_terms'->>'version' from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as frozen_payment_terms_version,
    (select jsonb_agg(installment.total_amount order by installment.installment_no)
      from public.finance_quotation_payment_installments as installment
      join public.finance_quotation_payment_terms as terms on terms.id = installment.payment_terms_id
      join constants on constants.quotation_id = terms.quotation_id) as live_installment_gross,
    (select jsonb_agg(installment.total_amount order by installment.installment_no)
      from public.finance_billing_installments as installment
      join constants on constants.billing_plan_id = installment.billing_plan_id) as billing_installment_gross
)
select
  catalog_state.current_save_rpc_present,
  catalog_state.internal_v1_rpc_absent,
  catalog_state.satang_helper_absent,
  catalog_state.gross_first_contract_absent,
  catalog_state.snapshot_version_default,
  catalog_state.snapshot_version_constraint,
  catalog_state.current_save_definition like '%round(source_before*allocation_percentage/100,2)%' as current_component_first_before_vat_present,
  catalog_state.current_save_definition like '%round(source_vat*allocation_percentage/100,2)%' as current_component_first_vat_present,
  catalog_state.current_save_definition not like '%finance_compute_quotation_percentage_allocation_gross_first%' as current_save_has_no_gross_first_contract,
  catalog_state.current_freeze_definition like '%' || quote_literal('version') || ', 2%' as current_trigger_hardcodes_payment_terms_version_2,
  uat_state.*,
  (
    catalog_state.current_save_rpc_present
    and catalog_state.internal_v1_rpc_absent
    and catalog_state.satang_helper_absent
    and catalog_state.gross_first_contract_absent
    and catalog_state.snapshot_version_default = '1'
    and catalog_state.snapshot_version_constraint like '%snapshot_version = 1%'
    and catalog_state.current_save_definition like '%round(source_before*allocation_percentage/100,2)%'
    and catalog_state.current_save_definition like '%round(source_vat*allocation_percentage/100,2)%'
    and catalog_state.current_save_definition not like '%finance_compute_quotation_percentage_allocation_gross_first%'
    and uat_state.quotation_count = 1
    and uat_state.quotation_status = 'accepted'
    and uat_state.quotation_gross = 20000
    and uat_state.fee_agreement_count = 1
    and uat_state.fee_agreement_status = 'signed'
    and uat_state.billing_plan_count = 1
    and uat_state.billing_plan_status = 'draft'
    and uat_state.invoice_count = 0
    and uat_state.bridge_count = 0
    and uat_state.payment_count = 0
    and uat_state.cash_transaction_count = 0
    and uat_state.live_payment_terms_version = 1
    and uat_state.frozen_payment_terms_version = '1'
    and uat_state.live_installment_gross = '[10000.01, 5000.00, 4999.99]'::jsonb
    and uat_state.billing_installment_gross = '[10000.01, 5000.00, 4999.99]'::jsonb
  ) as quotation_gross_first_allocation_preflight_pass
from catalog_state
cross join uat_state;
