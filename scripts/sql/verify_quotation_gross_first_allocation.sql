with
constants as (
  select
    'efd31db6-d3c0-4947-ba61-cf6b3b273fa2'::uuid as quotation_id,
    '5018cf1e-d271-40e1-9bd6-2a0ac7f1a3bf'::uuid as fee_agreement_id,
    'aa7b83b1-f702-4eca-a8ec-5b07e411b049'::uuid as billing_plan_id
),
catalog_state as (
  select
    to_regprocedure('public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb)') is not null as public_save_rpc_present,
    to_regprocedure('public.save_finance_quotation_payment_terms_v1_internal(uuid,text,text,text,jsonb)') is not null as internal_v1_rpc_present,
    to_regprocedure('public.finance_allocate_satang_by_weights(bigint,bigint[])') is not null as satang_helper_present,
    to_regprocedure('public.finance_round_satang_ratio(bigint,bigint,bigint)') is not null as ratio_helper_present,
    to_regprocedure('public.finance_compute_quotation_percentage_allocation_gross_first(jsonb,jsonb,text)') is not null as gross_first_contract_present,
    pg_get_functiondef(to_regprocedure('public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb)')) as save_definition,
    pg_get_functiondef(to_regprocedure('public.freeze_finance_quotation_commercial_terms_v2()')) as freeze_definition,
    (
      select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'finance_quotation_payment_terms' and column_name = 'snapshot_version'
    ) as snapshot_version_default,
    (
      select pg_get_constraintdef(constraint_record.oid)
      from pg_constraint as constraint_record
      where constraint_record.conrelid = 'public.finance_quotation_payment_terms'::regclass
        and constraint_record.conname = 'finance_quotation_payment_terms_version_check'
    ) as snapshot_version_constraint
),
single_line_contract as (
  select public.finance_compute_quotation_percentage_allocation_gross_first(
    '[{"item_id":"item-1","amount_before_tax":18691.59,"vat_amount":1308.41,"total_amount":20000,"sort_order":0}]'::jsonb,
    '[{"installment_id":"installment-1","installment_no":1,"percentage":50,"items":[{"allocation_id":"allocation-1","item_id":"item-1","allocation_percentage":50}]},{"installment_id":"installment-2","installment_no":2,"percentage":25,"items":[{"allocation_id":"allocation-2","item_id":"item-1","allocation_percentage":25}]},{"installment_id":"installment-3","installment_no":3,"percentage":25,"items":[{"allocation_id":"allocation-3","item_id":"item-1","allocation_percentage":25}]}]'::jsonb,
    'proportional_all_items'
  ) as result
),
mixed_contract as (
  select public.finance_compute_quotation_percentage_allocation_gross_first(
    '[{"item_id":"taxable","amount_before_tax":9345.79,"vat_amount":654.21,"total_amount":10000,"sort_order":0},{"item_id":"non-vat","amount_before_tax":10000,"vat_amount":0,"total_amount":10000,"sort_order":1}]'::jsonb,
    '[{"installment_id":"installment-1","installment_no":1,"percentage":50,"items":[{"allocation_id":"a1","item_id":"taxable","allocation_percentage":50},{"allocation_id":"a2","item_id":"non-vat","allocation_percentage":50}]},{"installment_id":"installment-2","installment_no":2,"percentage":25,"items":[{"allocation_id":"a3","item_id":"taxable","allocation_percentage":25},{"allocation_id":"a4","item_id":"non-vat","allocation_percentage":25}]},{"installment_id":"installment-3","installment_no":3,"percentage":25,"items":[{"allocation_id":"a5","item_id":"taxable","allocation_percentage":25},{"allocation_id":"a6","item_id":"non-vat","allocation_percentage":25}]}]'::jsonb,
    'proportional_all_items'
  ) as result
),
uat_state as (
  select
    (select quotation.status from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as quotation_status,
    (select quotation.grand_total from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as quotation_gross,
    (select agreement.status from public.finance_fee_agreements as agreement join constants on agreement.id = constants.fee_agreement_id) as fee_agreement_status,
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
    (select terms.snapshot_version from public.finance_quotation_payment_terms as terms join constants on terms.quotation_id = constants.quotation_id) as historical_live_terms_version,
    (select quotation.document_data_snapshot_json->'payment_terms'->>'version' from public.finance_quotations as quotation join constants on quotation.id = constants.quotation_id) as historical_frozen_terms_version,
    (select jsonb_agg(installment.total_amount order by installment.installment_no)
      from public.finance_quotation_payment_installments as installment
      join public.finance_quotation_payment_terms as terms on terms.id = installment.payment_terms_id
      join constants on constants.quotation_id = terms.quotation_id) as historical_live_installment_gross,
    (select jsonb_agg(installment.total_amount order by installment.installment_no)
      from public.finance_billing_installments as installment
      join constants on constants.billing_plan_id = installment.billing_plan_id) as historical_billing_installment_gross
)
select
  catalog_state.public_save_rpc_present,
  catalog_state.internal_v1_rpc_present,
  catalog_state.satang_helper_present,
  catalog_state.ratio_helper_present,
  catalog_state.gross_first_contract_present,
  catalog_state.snapshot_version_default,
  catalog_state.snapshot_version_constraint,
  catalog_state.save_definition like '%finance_compute_quotation_percentage_allocation_gross_first%' as save_uses_gross_first_contract,
  catalog_state.save_definition like '%snapshot_version = 2%' as save_marks_version_2,
  catalog_state.freeze_definition like '%' || quote_literal('allocation_contract') || '%' as freeze_writes_allocation_contract,
  single_line_contract.result->>'allocation_contract' as single_line_allocation_contract,
  (select jsonb_agg((installment->>'total_amount')::numeric order by ordinality) from jsonb_array_elements(single_line_contract.result->'installments') with ordinality as row(installment, ordinality)) as single_line_gross,
  (select sum((installment->>'amount_before_tax')::numeric) from jsonb_array_elements(single_line_contract.result->'installments') as row(installment)) as single_line_before_vat,
  (select sum((installment->>'vat_amount')::numeric) from jsonb_array_elements(single_line_contract.result->'installments') as row(installment)) as single_line_vat,
  (select jsonb_agg((installment->>'total_amount')::numeric order by ordinality) from jsonb_array_elements(mixed_contract.result->'installments') with ordinality as row(installment, ordinality)) as mixed_gross,
  (select sum((installment->>'amount_before_tax')::numeric) from jsonb_array_elements(mixed_contract.result->'installments') as row(installment)) as mixed_before_vat,
  (select sum((installment->>'vat_amount')::numeric) from jsonb_array_elements(mixed_contract.result->'installments') as row(installment)) as mixed_vat,
  uat_state.*,
  (
    catalog_state.public_save_rpc_present
    and catalog_state.internal_v1_rpc_present
    and catalog_state.satang_helper_present
    and catalog_state.ratio_helper_present
    and catalog_state.gross_first_contract_present
    and catalog_state.snapshot_version_default = '2'
    and catalog_state.snapshot_version_constraint like '%ANY (ARRAY[1, 2])%'
    and catalog_state.save_definition like '%finance_compute_quotation_percentage_allocation_gross_first%'
    and catalog_state.save_definition like '%snapshot_version = 2%'
    and catalog_state.freeze_definition like '%' || quote_literal('allocation_contract') || '%'
    and single_line_contract.result->>'allocation_contract' = 'gross_first'
    and (select jsonb_agg((installment->>'total_amount')::numeric order by ordinality) from jsonb_array_elements(single_line_contract.result->'installments') with ordinality as row(installment, ordinality)) = '[10000,5000,5000]'::jsonb
    and (select sum((installment->>'amount_before_tax')::numeric) from jsonb_array_elements(single_line_contract.result->'installments') as row(installment)) = 18691.59
    and (select sum((installment->>'vat_amount')::numeric) from jsonb_array_elements(single_line_contract.result->'installments') as row(installment)) = 1308.41
    and (select jsonb_agg((installment->>'total_amount')::numeric order by ordinality) from jsonb_array_elements(mixed_contract.result->'installments') with ordinality as row(installment, ordinality)) = '[10000,5000,5000]'::jsonb
    and (select sum((installment->>'amount_before_tax')::numeric) from jsonb_array_elements(mixed_contract.result->'installments') as row(installment)) = 19345.79
    and (select sum((installment->>'vat_amount')::numeric) from jsonb_array_elements(mixed_contract.result->'installments') as row(installment)) = 654.21
    and uat_state.quotation_status = 'accepted'
    and uat_state.quotation_gross = 20000
    and uat_state.fee_agreement_status = 'signed'
    and uat_state.billing_plan_status = 'draft'
    and uat_state.invoice_count = 0
    and uat_state.bridge_count = 0
    and uat_state.payment_count = 0
    and uat_state.cash_transaction_count = 0
    and uat_state.historical_live_terms_version = 1
    and uat_state.historical_frozen_terms_version = '1'
    and uat_state.historical_live_installment_gross = '[10000.01,5000.00,4999.99]'::jsonb
    and uat_state.historical_billing_installment_gross = '[10000.01,5000.00,4999.99]'::jsonb
  ) as quotation_gross_first_allocation_verification_pass
from catalog_state
cross join single_line_contract
cross join mixed_contract
cross join uat_state;
