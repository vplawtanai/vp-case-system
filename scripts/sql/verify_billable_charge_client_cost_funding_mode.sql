-- Phase B4 post-apply verification: Billable Charge client-cost funding semantics.
-- SELECT only. Run after Migration 034 is applied.

with
column_contract as (
  select
    count(*) filter (
      where column_name = 'client_cost_funding_mode'
        and data_type = 'text'
        and is_nullable = 'YES'
        and column_default is null
    ) = 1 as funding_column_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_billable_charges'
),
constraint_contract as (
  select
    count(*) filter (
      where conname = 'finance_billable_charges_client_cost_funding_mode_check'
        and convalidated
        and pg_get_constraintdef(oid, true) like '%recoverable_cost%'
        and pg_get_constraintdef(oid, true) like '%collect_before_disbursement%'
        and pg_get_constraintdef(oid, true) like '%reimburse_after_advance%'
    ) = 1 as funding_constraint_present
  from pg_constraint
  where conrelid = 'public.finance_billable_charges'::regclass
),
function_contract as (
  select
    to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)') is not null
      as funding_create_present,
    to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is not null
      as funding_save_present,
    to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)') is not null
      as legacy_create_preserved,
    to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is not null
      as legacy_save_preserved,
    lower(pg_get_functiondef('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)'::regprocedure))
      like '%client_cost_funding_mode%' as create_stores_funding_mode,
    lower(pg_get_functiondef('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)'::regprocedure))
      like '%client_cost_funding_mode = v_funding_mode%' as save_stores_funding_mode,
    lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
      like '%client-cost funding mode is required before readiness%' as ready_requires_client_cost_mode,
    lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
      like '%''cost_handling''%''funding_mode''%' as ready_snapshot_freezes_funding_mode,
    lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
      like '%''revenue_policy_inferred'', false%' as ready_snapshot_avoids_revenue_inference,
    lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
      like '%''compensation_policy_inferred'', false%' as ready_snapshot_avoids_compensation_inference,
    lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
      like '%''client_cost_funding_mode'', v_charge.client_cost_funding_mode%'
      and lower(pg_get_functiondef('public.mark_finance_billable_charge_ready(uuid,boolean)'::regprocedure))
        like '%''economic_classification'', v_charge.economic_classification%'
      as ready_audit_preserves_semantics,
    lower(pg_get_functiondef('public.validate_finance_billable_charge_integrity(uuid)'::regprocedure))
      like '%ready_snapshot_json->''cost_handling''->>''funding_mode''%' as validator_checks_frozen_funding_mode,
    lower(pg_get_functiondef('public.enforce_finance_billable_charge_lifecycle()'::regprocedure))
      like '%to_jsonb(new)%'
      and lower(pg_get_functiondef('public.enforce_finance_billable_charge_lifecycle()'::regprocedure))
        not like '%client_cost_funding_mode%'
      as ready_lifecycle_keeps_funding_immutable
),
permission_contract as (
  select
    has_function_privilege(
      'authenticated',
      'public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)',
      'EXECUTE'
    ) as authenticated_can_create,
    has_function_privilege(
      'authenticated',
      'public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)',
      'EXECUTE'
    ) as authenticated_can_save,
    not has_function_privilege(
      'anon',
      'public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)',
      'EXECUTE'
    ) as anon_cannot_create,
    not has_function_privilege(
      'anon',
      'public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)',
      'EXECUTE'
    ) as anon_cannot_save
),
historical_safety as (
  select
    count(*) filter (where client_cost_funding_mode is not null) = 0
      as no_existing_charge_backfilled,
    count(*) filter (
      where id in (
        '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid,
        'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid
      )
        and client_cost_funding_mode is null
    ) = 2 as known_historical_charges_remain_unspecified,
    count(*) as charge_rows,
    count(*) filter (where source_type = 'recoverable_cost') as historical_client_cost_rows
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
  from column_contract
  cross join constraint_contract
  cross join function_contract
  cross join permission_contract
  cross join historical_safety
  cross join finance_observability
)
select
  checks.*,
  (
    funding_column_present
    and funding_constraint_present
    and funding_create_present
    and funding_save_present
    and legacy_create_preserved
    and legacy_save_preserved
    and create_stores_funding_mode
    and save_stores_funding_mode
    and ready_requires_client_cost_mode
    and ready_snapshot_freezes_funding_mode
    and ready_snapshot_avoids_revenue_inference
    and ready_snapshot_avoids_compensation_inference
    and ready_audit_preserves_semantics
    and validator_checks_frozen_funding_mode
    and ready_lifecycle_keeps_funding_immutable
    and authenticated_can_create
    and authenticated_can_save
    and anon_cannot_create
    and anon_cannot_save
    and no_existing_charge_backfilled
    and known_historical_charges_remain_unspecified
  ) as phase_b4_client_cost_funding_semantics_verification_pass
from checks;
