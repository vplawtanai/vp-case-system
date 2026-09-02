with definitions as (
  select
    lower(pg_get_functiondef('public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb)'::regprocedure)) as save_definition,
    lower(pg_get_functiondef('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)'::regprocedure)) as create_definition,
    lower(pg_get_functiondef('public.freeze_finance_quotation_commercial_terms_v2()'::regprocedure)) as freeze_definition
), triggers as (
  select
    count(*) filter (where tgname='finance_fee_agreement_item_semantics_before_write' and not tgisinternal) = 1 as fee_semantic_trigger_present,
    count(*) filter (where tgname='finance_billing_installment_item_semantics_before_write' and not tgisinternal) = 1 as installment_semantic_trigger_present
  from pg_trigger
), observability as (
  select
    (select count(*) from public.finance_quotation_items where unit is null or economic_classification is null) as historical_quotation_items_missing_semantics,
    (select count(*) from public.finance_fee_agreement_items where unit is null or economic_classification is null) as historical_agreement_items_missing_semantics,
    (select count(*) from public.finance_billing_installment_items where unit is null or economic_classification is null) as historical_installment_items_missing_semantics
)
select
  definitions.save_definition like '%economic_classification = lower(btrim(p->>''economic_classification''))%' as quotation_save_persists_semantics,
  definitions.create_definition like '%''economic_classification'', source.item->>''economic_classification''%' as quotation_create_passes_semantics,
  definitions.freeze_definition like '%''economic_classification'',i.economic_classification%' as frozen_snapshot_contains_semantics,
  triggers.fee_semantic_trigger_present,
  triggers.installment_semantic_trigger_present,
  observability.*,
  definitions.save_definition like '%economic_classification = lower(btrim(p->>''economic_classification''))%'
    and definitions.create_definition like '%''economic_classification'', source.item->>''economic_classification''%'
    and definitions.freeze_definition like '%''economic_classification'',i.economic_classification%'
    and triggers.fee_semantic_trigger_present and triggers.installment_semantic_trigger_present
    as commercial_item_semantic_propagation_verification_pass
from definitions cross join triggers cross join observability;
