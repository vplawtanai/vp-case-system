with catalog as (
  select
    to_regprocedure('public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb)') is not null as quotation_helper_present,
    to_regprocedure('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)') is not null as quotation_create_present,
    to_regprocedure('public.inherit_finance_fee_agreement_item_semantics()') is null as fee_trigger_function_available,
    to_regprocedure('public.inherit_finance_billing_installment_item_semantics()') is null as installment_trigger_function_available,
    (select count(*) = 2 from information_schema.columns where table_schema='public' and table_name='finance_quotation_items' and column_name in ('unit','economic_classification')) as quotation_columns_present,
    (select count(*) = 2 from information_schema.columns where table_schema='public' and table_name='finance_fee_agreement_items' and column_name in ('unit','economic_classification')) as agreement_columns_present,
    (select count(*) = 3 from information_schema.columns where table_schema='public' and table_name='finance_billing_installment_items' and column_name in ('unit','economic_classification','semantic_snapshot_json')) as installment_columns_present
), observability as (
  select
    (select count(*) from public.finance_quotation_items where unit is null or economic_classification is null) as historical_quotation_items_missing_semantics,
    (select count(*) from public.finance_fee_agreement_items where unit is null or economic_classification is null) as historical_agreement_items_missing_semantics,
    (select count(*) from public.finance_billing_installment_items where unit is null or economic_classification is null) as historical_installment_items_missing_semantics
)
select catalog.*, observability.*,
  quotation_helper_present and quotation_create_present
  and fee_trigger_function_available and installment_trigger_function_available
  and quotation_columns_present and agreement_columns_present and installment_columns_present
  as commercial_item_semantic_propagation_preflight_pass
from catalog cross join observability;
