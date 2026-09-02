-- Phase B4: distinguish client-cost funding semantics without rewriting historical Charges.
-- This migration creates no Billable Charge, Invoice, Payment, Cash, Ledger, or Compensation rows.

do $billable_charge_funding_preflight$
begin
  if to_regclass('public.finance_billable_charges') is null
    or to_regclass('public.finance_billable_charge_audit_events') is null
    or to_regprocedure('public.validate_finance_billable_charge_integrity(uuid)') is null
    or to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)') is null
    or to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is null
    or to_regprocedure('public.mark_finance_billable_charge_ready(uuid,boolean)') is null
  then
    raise exception 'Billable Charge funding semantics require the current Phase B3 Charge foundation';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_billable_charges'
      and column_name = 'client_cost_funding_mode'
  )
    or to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,text,jsonb,uuid)') is not null
    or to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is not null
  then
    raise exception 'Billable Charge funding semantics already exist; inspect partial state before continuing';
  end if;
end;
$billable_charge_funding_preflight$;

alter table public.finance_billable_charges
  add column client_cost_funding_mode text null,
  add constraint finance_billable_charges_client_cost_funding_mode_check
  check (
    client_cost_funding_mode is null
    or (
      source_type = 'recoverable_cost'
      and client_cost_funding_mode in (
        'collect_before_disbursement',
        'reimburse_after_advance'
      )
    )
  );

create or replace function public.validate_finance_billable_charge_integrity(
  p_charge_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $billable_charge_integrity_validator$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_prior public.finance_billable_charges%rowtype;
  v_calculated record;
  v_source record;
  v_semantic_unit text;
begin
  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id;

  if v_charge.id is null then
    return;
  end if;

  perform public.assert_finance_billable_charge_context(
    v_charge.client_id,
    v_charge.case_id,
    v_charge.advisory_matter_id
  );

  if v_charge.client_cost_funding_mode is not null
    and (
      v_charge.source_type <> 'recoverable_cost'
      or v_charge.client_cost_funding_mode not in (
        'collect_before_disbursement',
        'reimburse_after_advance'
      )
    )
  then
    raise exception 'Billable Charge client-cost funding mode is inconsistent with its business nature';
  end if;

  if v_charge.calculation_basis = 'quantity_rate' then
    select * into v_calculated
    from public.calculate_finance_billable_charge_amounts(
      v_charge.quantity,
      v_charge.unit_rate,
      v_charge.price_tax_mode,
      v_charge.vat_rate
    );

    if v_charge.vat_applicable is distinct from v_calculated.vat_applicable
      or v_charge.amount_before_vat <> v_calculated.amount_before_vat
      or v_charge.vat_amount <> v_calculated.vat_amount
      or v_charge.total_amount <> v_calculated.total_amount
    then
      raise exception 'Billable Charge amounts must follow the authoritative quantity, rate, and VAT calculation';
    end if;
  elsif v_charge.calculation_basis = 'source_fixed_allocation' then
    select
      agreement.client_id,
      agreement.case_id,
      agreement.advisory_matter_id,
      agreement.currency,
      installment.id as billing_installment_id,
      installment_item.amount_before_tax,
      installment_item.vat_amount,
      installment_item.total_amount,
      agreement_item.vat_applicable,
      agreement_item.vat_rate,
      agreement_item.tax_category,
      bridge.id as bridge_id
    into v_source
    from public.finance_billing_installment_items as installment_item
    join public.finance_billing_installments as installment
      on installment.id = installment_item.billing_installment_id
    join public.finance_billing_plans as plan
      on plan.id = installment.billing_plan_id
    join public.finance_fee_agreements as agreement
      on agreement.id = plan.fee_agreement_id
    join public.finance_fee_agreement_items as agreement_item
      on agreement_item.id = installment_item.fee_agreement_item_id
     and agreement_item.fee_agreement_id = agreement.id
    left join public.finance_billing_installment_charge_bridges as bridge
      on bridge.billing_installment_id = installment.id
    where installment_item.id = v_charge.source_billing_installment_item_id;

    v_semantic_unit := nullif(btrim(coalesce(v_charge.source_semantics_json->>'unit', '')), '');

    if not found
      or v_source.bridge_id is null
      or v_source.client_id <> v_charge.client_id
      or v_source.case_id is distinct from v_charge.case_id
      or v_source.advisory_matter_id is distinct from v_charge.advisory_matter_id
      or v_source.currency <> v_charge.currency
      or v_source.amount_before_tax <> v_charge.amount_before_vat
      or v_source.vat_amount <> v_charge.vat_amount
      or v_source.total_amount <> v_charge.total_amount
      or v_source.vat_applicable is distinct from v_charge.vat_applicable
      or v_source.vat_rate <> v_charge.vat_rate
      or v_source.tax_category is distinct from v_charge.tax_category
      or v_charge.description is distinct from nullif(btrim(v_charge.source_semantics_json->>'description'), '')
      or v_charge.unit is distinct from v_semantic_unit
      or v_charge.economic_classification is distinct from nullif(
        lower(btrim(v_charge.source_semantics_json->>'economic_classification')),
        ''
      )
      or v_charge.price_tax_mode is distinct from nullif(
        lower(btrim(v_charge.source_semantics_json->>'price_tax_mode')),
        ''
      )
    then
      raise exception 'Source-fixed Billable Charge must exactly preserve its bridged installment allocation and certified semantics';
    end if;
  else
    raise exception 'Billable Charge calculation basis is invalid';
  end if;

  if v_charge.source_type = 'billing_installment_item'
    and v_charge.calculation_basis <> 'source_fixed_allocation'
  then
    raise exception 'Billing Installment Charges must use source-fixed allocation amounts';
  end if;

  if v_charge.supersedes_charge_id is not null then
    select * into v_prior
    from public.finance_billable_charges
    where id = v_charge.supersedes_charge_id;

    if v_prior.id is null
      or v_prior.status <> 'cancelled'
      or v_prior.client_id <> v_charge.client_id
      or v_prior.case_id is distinct from v_charge.case_id
      or v_prior.advisory_matter_id is distinct from v_charge.advisory_matter_id
      or v_prior.currency <> v_charge.currency
    then
      raise exception 'Replacement Billable Charge must supersede a cancelled Charge for the same Client, matter, and currency';
    end if;
  end if;

  if v_charge.status in ('ready_to_invoice', 'reserved', 'invoiced') then
    if nullif(btrim(coalesce(v_charge.description, '')), '') is null
      or (
        v_charge.calculation_basis = 'quantity_rate'
        and nullif(btrim(coalesce(v_charge.unit, '')), '') is null
      )
      or v_charge.economic_classification is null
      or v_charge.total_amount <= 0
      or v_charge.ready_snapshot_json is null
      or v_charge.ready_snapshot_json = '{}'::jsonb
      or v_charge.ready_snapshot_json->>'schema_version' <> '1'
      or v_charge.ready_snapshot_json->'charge'->>'id' <> v_charge.id::text
      or v_charge.ready_snapshot_json->'source'->>'source_type' <> v_charge.source_type
      or coalesce(
        v_charge.ready_snapshot_json->'commercial'->>'calculation_basis',
        'quantity_rate'
      ) <> v_charge.calculation_basis
      or (
        v_charge.client_cost_funding_mode is not null
        and v_charge.ready_snapshot_json->'cost_handling'->>'funding_mode'
          is distinct from v_charge.client_cost_funding_mode
      )
    then
      raise exception 'Ready Billable Charge requires complete positive commercial, economic, source, and frozen snapshot data';
    end if;
  end if;
end;
$billable_charge_integrity_validator$;

create or replace function public.create_finance_billable_charge_draft(
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_source_type text,
  p_client_cost_funding_mode text,
  p_source_reference text,
  p_source_event_key text,
  p_source_snapshot_json jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_billable_charge_draft_with_funding$
declare
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_funding_mode text := nullif(lower(btrim(coalesce(p_client_cost_funding_mode, ''))), '');
  v_source_reference text := nullif(btrim(coalesce(p_source_reference, '')), '');
  v_source_event_key text := nullif(btrim(coalesce(p_source_event_key, '')), '');
  v_source_snapshot jsonb := coalesce(p_source_snapshot_json, '{}'::jsonb);
  v_existing public.finance_billable_charges%rowtype;
  v_charge_id uuid;
begin
  if not public.current_user_can_manage_finance_billable_charges() then
    raise exception 'Not allowed to create Billable Charge Draft';
  end if;
  if p_request_id is null then
    raise exception 'Billable Charge request id is required';
  end if;
  if v_source_type not in ('ad_hoc_service', 'recoverable_cost') then
    raise exception 'User-created Billable Charge source type is invalid';
  end if;
  if v_funding_mode is not null
    and (
      v_source_type <> 'recoverable_cost'
      or v_funding_mode not in ('collect_before_disbursement', 'reimburse_after_advance')
    )
  then
    raise exception 'Billable Charge client-cost funding mode is invalid for its business nature';
  end if;
  if jsonb_typeof(v_source_snapshot) <> 'object' then
    raise exception 'Billable Charge source snapshot must be an object';
  end if;
  if length(coalesce(v_source_reference, '')) > 1000
    or length(coalesce(v_source_event_key, '')) > 500
  then
    raise exception 'Billable Charge source reference is too long';
  end if;

  perform public.assert_finance_billable_charge_context(
    p_client_id,
    p_case_id,
    p_advisory_matter_id
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select * into v_existing
  from public.finance_billable_charges
  where idempotency_key = p_request_id;

  if v_existing.id is not null then
    if v_existing.client_id is distinct from p_client_id
      or v_existing.case_id is distinct from p_case_id
      or v_existing.advisory_matter_id is distinct from p_advisory_matter_id
      or v_existing.source_type is distinct from v_source_type
      or v_existing.client_cost_funding_mode is distinct from v_funding_mode
      or v_existing.source_reference is distinct from v_source_reference
      or v_existing.source_event_key is distinct from v_source_event_key
      or v_existing.source_snapshot_json is distinct from v_source_snapshot
    then
      raise exception 'Billable Charge request id was already used for different source facts';
    end if;
    return v_existing.id;
  end if;

  insert into public.finance_billable_charges (
    client_id,
    case_id,
    advisory_matter_id,
    source_type,
    client_cost_funding_mode,
    source_reference,
    source_event_key,
    source_snapshot_json,
    idempotency_key,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_client_id,
    p_case_id,
    p_advisory_matter_id,
    v_source_type,
    v_funding_mode,
    v_source_reference,
    v_source_event_key,
    v_source_snapshot,
    p_request_id,
    auth.uid(),
    auth.uid()
  )
  returning id into v_charge_id;

  perform public.record_finance_billable_charge_audit_event(
    v_charge_id,
    'created',
    jsonb_build_object(
      'client_id', p_client_id,
      'case_id', p_case_id,
      'advisory_matter_id', p_advisory_matter_id,
      'source_type', v_source_type,
      'client_cost_funding_mode', v_funding_mode,
      'source_reference', v_source_reference,
      'source_event_key', v_source_event_key,
      'status', 'draft'
    )
  );

  return v_charge_id;
end;
$create_billable_charge_draft_with_funding$;

create or replace function public.save_finance_billable_charge_draft(
  p_charge_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_client_cost_funding_mode text,
  p_source_reference text,
  p_source_snapshot_json jsonb,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_unit_rate numeric,
  p_currency text,
  p_service_date date,
  p_economic_classification text,
  p_price_tax_mode text,
  p_vat_rate numeric,
  p_tax_category text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_billable_charge_draft_with_funding$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_updated public.finance_billable_charges%rowtype;
  v_funding_mode text := nullif(lower(btrim(coalesce(p_client_cost_funding_mode, ''))), '');
  v_source_reference text := nullif(btrim(coalesce(p_source_reference, '')), '');
  v_source_snapshot jsonb := coalesce(p_source_snapshot_json, '{}'::jsonb);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_economic_classification text := nullif(lower(btrim(coalesce(p_economic_classification, ''))), '');
  v_price_tax_mode text := lower(btrim(coalesce(p_price_tax_mode, '')));
  v_tax_category text := nullif(btrim(coalesce(p_tax_category, '')), '');
  v_calculated record;
begin
  if not public.current_user_can_manage_finance_billable_charges() then
    raise exception 'Not allowed to save Billable Charge Draft';
  end if;
  if p_charge_id is null then
    raise exception 'Billable Charge Draft is required';
  end if;
  if jsonb_typeof(v_source_snapshot) <> 'object' then
    raise exception 'Billable Charge source snapshot must be an object';
  end if;
  if length(coalesce(v_source_reference, '')) > 1000
    or length(coalesce(v_description, '')) > 2000
    or length(coalesce(v_unit, '')) > 100
  then
    raise exception 'Billable Charge text exceeds the supported length';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Billable Charge currency must be a three-letter uppercase code';
  end if;
  if v_economic_classification is not null
    and v_economic_classification not in (
      'professional_fee',
      'additional_service',
      'reimbursable_expense',
      'government_or_court_fee',
      'other'
    )
  then
    raise exception 'Billable Charge economic classification is invalid';
  end if;

  perform public.assert_finance_billable_charge_context(
    p_client_id,
    p_case_id,
    p_advisory_matter_id
  );

  select * into v_calculated
  from public.calculate_finance_billable_charge_amounts(
    p_quantity,
    p_unit_rate,
    v_price_tax_mode,
    p_vat_rate
  );

  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'Billable Charge Draft not found';
  end if;
  if v_charge.status <> 'draft' then
    raise exception 'Only a Draft Billable Charge can be saved';
  end if;
  if v_charge.source_type = 'billing_installment_item' then
    raise exception 'Billing Installment Charges require the controlled adapter';
  end if;
  if v_funding_mode is not null
    and (
      v_charge.source_type <> 'recoverable_cost'
      or v_funding_mode not in ('collect_before_disbursement', 'reimburse_after_advance')
    )
  then
    raise exception 'Billable Charge client-cost funding mode is invalid for its business nature';
  end if;

  if v_charge.client_id is not distinct from p_client_id
    and v_charge.case_id is not distinct from p_case_id
    and v_charge.advisory_matter_id is not distinct from p_advisory_matter_id
    and v_charge.client_cost_funding_mode is not distinct from v_funding_mode
    and v_charge.source_reference is not distinct from v_source_reference
    and v_charge.source_snapshot_json is not distinct from v_source_snapshot
    and v_charge.description is not distinct from v_description
    and v_charge.quantity is not distinct from p_quantity
    and v_charge.unit is not distinct from v_unit
    and v_charge.unit_rate is not distinct from p_unit_rate
    and v_charge.currency is not distinct from v_currency
    and v_charge.service_date is not distinct from p_service_date
    and v_charge.economic_classification is not distinct from v_economic_classification
    and v_charge.vat_applicable is not distinct from v_calculated.vat_applicable
    and v_charge.vat_rate is not distinct from p_vat_rate
    and v_charge.tax_category is not distinct from v_tax_category
    and v_charge.price_tax_mode is not distinct from v_price_tax_mode
    and v_charge.amount_before_vat is not distinct from v_calculated.amount_before_vat
    and v_charge.vat_amount is not distinct from v_calculated.vat_amount
    and v_charge.total_amount is not distinct from v_calculated.total_amount
  then
    return v_charge.id;
  end if;

  update public.finance_billable_charges
  set
    client_id = p_client_id,
    case_id = p_case_id,
    advisory_matter_id = p_advisory_matter_id,
    client_cost_funding_mode = v_funding_mode,
    source_reference = v_source_reference,
    source_snapshot_json = v_source_snapshot,
    description = v_description,
    quantity = p_quantity,
    unit = v_unit,
    unit_rate = p_unit_rate,
    currency = v_currency,
    service_date = p_service_date,
    economic_classification = v_economic_classification,
    vat_applicable = v_calculated.vat_applicable,
    vat_rate = p_vat_rate,
    tax_category = v_tax_category,
    price_tax_mode = v_price_tax_mode,
    amount_before_vat = v_calculated.amount_before_vat,
    vat_amount = v_calculated.vat_amount,
    total_amount = v_calculated.total_amount,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_charge.id
  returning * into v_updated;

  perform public.record_finance_billable_charge_audit_event(
    v_charge.id,
    'draft_saved',
    jsonb_build_object(
      'before', to_jsonb(v_charge),
      'after', to_jsonb(v_updated)
    )
  );

  return v_charge.id;
end;
$save_billable_charge_draft_with_funding$;

create or replace function public.mark_finance_billable_charge_ready(
  p_charge_id uuid,
  p_human_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $mark_billable_charge_ready$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_ready_at timestamptz := now();
  v_ready_snapshot jsonb;
begin
  if not public.current_user_can_approve_finance_billable_charges() then
    raise exception 'Not allowed to mark Billable Charge ready';
  end if;
  if p_human_confirmed is distinct from true then
    raise exception 'Billable Charge readiness confirmation is required';
  end if;

  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'Billable Charge not found';
  end if;
  if v_charge.status = 'ready_to_invoice' then
    return v_charge.id;
  end if;
  if v_charge.status <> 'draft' then
    raise exception 'Only a Draft Billable Charge can be marked ready';
  end if;
  if nullif(btrim(coalesce(v_charge.description, '')), '') is null then
    raise exception 'Billable Charge description is required';
  end if;
  if v_charge.calculation_basis = 'quantity_rate'
    and nullif(btrim(coalesce(v_charge.unit, '')), '') is null
  then
    raise exception 'Billable Charge unit is required';
  end if;
  if v_charge.economic_classification is null then
    raise exception 'Billable Charge economic classification is required';
  end if;
  if v_charge.total_amount <= 0 then
    raise exception 'Billable Charge total must be positive before readiness';
  end if;
  if v_charge.source_type = 'recoverable_cost'
    and v_charge.client_cost_funding_mode is null
  then
    raise exception 'Billable Charge client-cost funding mode is required before readiness';
  end if;

  perform public.validate_finance_billable_charge_integrity(v_charge.id);

  v_ready_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'charge', jsonb_build_object(
      'id', v_charge.id,
      'client_id', v_charge.client_id,
      'case_id', v_charge.case_id,
      'advisory_matter_id', v_charge.advisory_matter_id,
      'status', 'ready_to_invoice',
      'ready_to_invoice_at', v_ready_at,
      'ready_by_user_id', auth.uid()
    ),
    'source', jsonb_build_object(
      'source_type', v_charge.source_type,
      'source_billing_installment_item_id', v_charge.source_billing_installment_item_id,
      'source_reference', v_charge.source_reference,
      'source_event_key', v_charge.source_event_key,
      'source_snapshot', v_charge.source_snapshot_json,
      'certified_semantics', v_charge.source_semantics_json
    ),
    'commercial', jsonb_build_object(
      'calculation_basis', v_charge.calculation_basis,
      'description', v_charge.description,
      'quantity', v_charge.quantity,
      'unit', v_charge.unit,
      'unit_rate', v_charge.unit_rate,
      'currency', v_charge.currency,
      'service_date', v_charge.service_date,
      'amount_before_vat', v_charge.amount_before_vat,
      'vat_amount', v_charge.vat_amount,
      'total_amount', v_charge.total_amount
    ),
    'economic', jsonb_build_object(
      'classification', v_charge.economic_classification,
      'revenue_policy_inferred', false,
      'compensation_policy_inferred', false
    ),
    'cost_handling', jsonb_build_object(
      'funding_mode', v_charge.client_cost_funding_mode,
      'revenue_policy_inferred', false,
      'compensation_policy_inferred', false
    ),
    'tax', jsonb_build_object(
      'vat_applicable', v_charge.vat_applicable,
      'vat_rate', v_charge.vat_rate,
      'tax_category', v_charge.tax_category,
      'price_tax_mode', v_charge.price_tax_mode,
      'wht_policy_inferred', false
    )
  ));

  update public.finance_billable_charges
  set
    status = 'ready_to_invoice',
    ready_snapshot_json = v_ready_snapshot,
    ready_to_invoice_at = v_ready_at,
    ready_by_user_id = auth.uid(),
    updated_at = v_ready_at,
    updated_by_user_id = auth.uid()
  where id = v_charge.id;

  perform public.validate_finance_billable_charge_integrity(v_charge.id);

  perform public.record_finance_billable_charge_audit_event(
    v_charge.id,
    'marked_ready',
    jsonb_build_object(
      'source_type', v_charge.source_type,
      'client_cost_funding_mode', v_charge.client_cost_funding_mode,
      'economic_classification', v_charge.economic_classification,
      'ready_snapshot', v_ready_snapshot
    )
  );

  return v_charge.id;
end;
$mark_billable_charge_ready$;

revoke all on function public.create_finance_billable_charge_draft(uuid, bigint, uuid, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.save_finance_billable_charge_draft(uuid, uuid, bigint, uuid, text, text, jsonb, text, numeric, text, numeric, text, date, text, text, numeric, text)
  from public, anon, authenticated;

grant execute on function public.create_finance_billable_charge_draft(uuid, bigint, uuid, text, text, text, text, jsonb, uuid)
  to authenticated;
grant execute on function public.save_finance_billable_charge_draft(uuid, uuid, bigint, uuid, text, text, jsonb, text, numeric, text, numeric, text, date, text, text, numeric, text)
  to authenticated;

comment on column public.finance_billable_charges.client_cost_funding_mode is
  'For client-cost Charges only: whether VP collects before third-party disbursement or recovers an amount already advanced. NULL is retained for services, installment Charges, and historical unspecified records.';
comment on function public.create_finance_billable_charge_draft(uuid, bigint, uuid, text, text, text, text, jsonb, uuid) is
  'Creates an idempotent user-entered Draft Charge and preserves explicit client-cost funding semantics without inferring tax, revenue, Cash, or Compensation treatment.';
comment on function public.mark_finance_billable_charge_ready(uuid, boolean) is
  'Freezes source, commercial, economic, tax, and explicit client-cost funding facts. New client-cost Charges require a funding mode; historical ready Charges remain untouched.';
