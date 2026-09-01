-- Phase B3A: Invoice V2 bridge, semantic lineage, and anti-double-billing foundation.
-- This migration creates no bridge, Charge, Invoice, Payment, Cash, Ledger, or Compensation data.

do $invoice_v2_bridge_preflight$
begin
  if to_regclass('public.finance_billable_charges') is null
    or to_regclass('public.finance_billable_charge_audit_events') is null
    or to_regclass('public.finance_quotation_items') is null
    or to_regclass('public.finance_fee_agreement_items') is null
    or to_regclass('public.finance_billing_plans') is null
    or to_regclass('public.finance_billing_installments') is null
    or to_regclass('public.finance_billing_installment_items') is null
    or to_regclass('public.finance_invoices') is null
    or to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is null
    or to_regprocedure('public.validate_finance_billable_charge_integrity(uuid)') is null
  then
    raise exception 'Invoice V2 bridge foundation requires the current Invoice V1 and Billable Charge foundations';
  end if;

  if to_regclass('public.finance_billing_installment_charge_bridges') is not null
    or to_regclass('public.finance_billing_installment_charge_bridge_audit_events') is not null
    or to_regprocedure('public.assert_finance_billing_installment_v2_bridge_eligible(uuid)') is not null
    or to_regprocedure('public.enforce_finance_billing_installment_charge_bridge()') is not null
    or to_regprocedure('public.record_finance_billing_installment_charge_bridge_audit()') is not null
    or to_regprocedure('public.protect_finance_billing_installment_charge_bridge_audit()') is not null
    or to_regprocedure('public.protect_finance_invoice_source_model()') is not null
  then
    raise exception 'Invoice V2 bridge object names already exist; inspect partial state before continuing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'finance_quotation_items' and column_name in ('unit', 'economic_classification'))
        or (table_name = 'finance_fee_agreement_items' and column_name in ('unit', 'economic_classification'))
        or (table_name = 'finance_billing_installment_items' and column_name in ('unit', 'economic_classification', 'semantic_snapshot_json'))
        or (table_name = 'finance_billable_charges' and column_name in ('calculation_basis', 'source_semantics_json'))
        or (table_name = 'finance_invoices' and column_name = 'source_model')
      )
  ) then
    raise exception 'Invoice V2 semantic columns already exist; inspect partial state before continuing';
  end if;
end;
$invoice_v2_bridge_preflight$;

alter table public.finance_quotation_items
  add column unit text null,
  add column economic_classification text null,
  add constraint finance_quotation_items_unit_check
    check (unit is null or (nullif(btrim(unit), '') is not null and length(unit) <= 100)),
  add constraint finance_quotation_items_economic_classification_check
    check (
      economic_classification is null
      or economic_classification in (
        'professional_fee',
        'additional_service',
        'reimbursable_expense',
        'government_or_court_fee',
        'other'
      )
    );

alter table public.finance_fee_agreement_items
  add column unit text null,
  add column economic_classification text null,
  add constraint finance_fee_agreement_items_unit_check
    check (unit is null or (nullif(btrim(unit), '') is not null and length(unit) <= 100)),
  add constraint finance_fee_agreement_items_economic_classification_check
    check (
      economic_classification is null
      or economic_classification in (
        'professional_fee',
        'additional_service',
        'reimbursable_expense',
        'government_or_court_fee',
        'other'
      )
    );

alter table public.finance_billing_installment_items
  add column unit text null,
  add column economic_classification text null,
  add column semantic_snapshot_json jsonb null,
  add constraint finance_billing_installment_items_unit_check
    check (unit is null or (nullif(btrim(unit), '') is not null and length(unit) <= 100)),
  add constraint finance_billing_installment_items_economic_classification_check
    check (
      economic_classification is null
      or economic_classification in (
        'professional_fee',
        'additional_service',
        'reimbursable_expense',
        'government_or_court_fee',
        'other'
      )
    ),
  add constraint finance_billing_installment_items_semantic_snapshot_shape_check
    check (semantic_snapshot_json is null or jsonb_typeof(semantic_snapshot_json) = 'object');

alter table public.finance_billable_charges
  add column calculation_basis text not null default 'quantity_rate',
  add column source_semantics_json jsonb null,
  alter column quantity drop not null,
  alter column unit_rate drop not null,
  drop constraint finance_billable_charges_quantity_check,
  drop constraint finance_billable_charges_unit_rate_check,
  add constraint finance_billable_charges_quantity_check
    check (quantity is null or quantity > 0),
  add constraint finance_billable_charges_unit_rate_check
    check (unit_rate is null or unit_rate >= 0),
  add constraint finance_billable_charges_calculation_basis_check
    check (calculation_basis in ('quantity_rate', 'source_fixed_allocation')),
  add constraint finance_billable_charges_source_semantics_shape_check
    check (source_semantics_json is null or jsonb_typeof(source_semantics_json) = 'object'),
  add constraint finance_billable_charges_calculation_contract_check
    check (
      (
        calculation_basis = 'quantity_rate'
        and quantity is not null
        and unit_rate is not null
        and source_semantics_json is null
      )
      or (
        calculation_basis = 'source_fixed_allocation'
        and source_type = 'billing_installment_item'
        and source_billing_installment_item_id is not null
        and quantity is null
        and unit_rate is null
        and source_semantics_json is not null
        and source_semantics_json <> '{}'::jsonb
        and source_semantics_json->>'schema_version' = '1'
        and coalesce((source_semantics_json->>'human_certified')::boolean, false)
      )
    );

create unique index uq_finance_billable_charges_active_installment_source
on public.finance_billable_charges (source_billing_installment_item_id)
where source_type = 'billing_installment_item' and status <> 'cancelled';

alter table public.finance_invoices
  add column source_model text not null default 'installment_v1',
  add constraint finance_invoices_source_model_check
    check (source_model in ('installment_v1', 'billable_charge_v2'));

create table public.finance_billing_installment_charge_bridges (
  id uuid primary key default gen_random_uuid(),
  billing_installment_id uuid not null
    references public.finance_billing_installments(id) on delete restrict,
  billing_plan_id uuid not null
    references public.finance_billing_plans(id) on delete restrict,
  fee_agreement_id uuid not null
    references public.finance_fee_agreements(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  case_id bigint null references public.cases(id) on delete restrict,
  advisory_matter_id uuid null references public.advisory_matters(id) on delete restrict,
  currency text not null,
  request_id uuid not null,
  source_snapshot_json jsonb not null,
  certification_snapshot_json jsonb not null,
  claimed_at timestamptz not null default now(),
  claimed_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finance_billing_installment_charge_bridges_installment_unique
    unique (billing_installment_id),
  constraint finance_billing_installment_charge_bridges_request_unique
    unique (request_id),
  constraint finance_billing_installment_charge_bridges_single_matter_check
    check (case_id is null or advisory_matter_id is null),
  constraint finance_billing_installment_charge_bridges_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_billing_installment_charge_bridges_snapshot_check
    check (
      jsonb_typeof(source_snapshot_json) = 'object'
      and source_snapshot_json <> '{}'::jsonb
      and jsonb_typeof(certification_snapshot_json) = 'object'
      and certification_snapshot_json <> '{}'::jsonb
      and certification_snapshot_json->>'schema_version' = '1'
      and coalesce((certification_snapshot_json->>'human_confirmed')::boolean, false)
    )
);

create index idx_finance_billing_installment_charge_bridges_plan
on public.finance_billing_installment_charge_bridges (billing_plan_id, billing_installment_id);

create index idx_finance_billing_installment_charge_bridges_agreement
on public.finance_billing_installment_charge_bridges (fee_agreement_id, billing_installment_id);

create table public.finance_billing_installment_charge_bridge_audit_events (
  id uuid primary key default gen_random_uuid(),
  bridge_id uuid not null
    references public.finance_billing_installment_charge_bridges(id) on delete restrict,
  billing_installment_id uuid not null
    references public.finance_billing_installments(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_billing_installment_charge_bridge_audit_type_check
    check (event_type = 'v2_path_claimed'),
  constraint finance_billing_installment_charge_bridge_audit_payload_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_billing_installment_charge_bridge_audit_bridge
on public.finance_billing_installment_charge_bridge_audit_events
  (bridge_id, created_at, id);

create index idx_finance_billing_installment_charge_bridge_audit_installment
on public.finance_billing_installment_charge_bridge_audit_events
  (billing_installment_id, created_at, id);

create or replace function public.assert_finance_billing_installment_v2_bridge_eligible(
  p_billing_installment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $invoice_v2_bridge_eligibility$
declare
  v_installment public.finance_billing_installments%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
  v_item_count integer;
  v_before_vat numeric(14, 2);
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
begin
  if p_billing_installment_id is null then
    raise exception 'Billing Installment is required for Invoice V2 bridge eligibility';
  end if;

  select * into v_installment
  from public.finance_billing_installments
  where id = p_billing_installment_id;

  if v_installment.id is null then
    raise exception 'Billing Installment not found for Invoice V2 bridge eligibility';
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_installment.billing_plan_id;

  select * into v_agreement
  from public.finance_fee_agreements
  where id = v_plan.fee_agreement_id;

  if v_plan.id is null
    or v_agreement.id is null
    or v_installment.billing_plan_id <> v_plan.id
    or v_plan.fee_agreement_id <> v_agreement.id
  then
    raise exception 'Billing Installment lineage is inconsistent for Invoice V2 bridge eligibility';
  end if;
  if v_plan.status <> 'active'
    or v_installment.status <> 'ready_to_invoice'
    or not public.finance_fee_agreement_is_billing_eligible(v_agreement.id)
  then
    raise exception 'Invoice V2 bridge requires an eligible agreement, active plan, and ready installment';
  end if;
  if v_installment.readiness_event_date is null
    or v_installment.ready_to_invoice_at is null
    or v_installment.readiness_confirmed_at is null
    or v_installment.readiness_confirmed_by_user_id is null
    or v_installment.readiness_evidence_json is null
    or v_installment.readiness_evidence_json = '{}'::jsonb
  then
    raise exception 'Invoice V2 bridge requires complete Billing Installment readiness evidence';
  end if;
  if exists (
    select 1
    from public.finance_invoices as invoice
    where invoice.primary_billing_installment_id = v_installment.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCE_INSTALLMENT_HAS_V1_INVOICE_HISTORY';
  end if;

  select
    count(*)::integer,
    coalesce(sum(item.amount_before_tax), 0),
    coalesce(sum(item.vat_amount), 0),
    coalesce(sum(item.total_amount), 0)
  into v_item_count, v_before_vat, v_vat, v_total
  from public.finance_billing_installment_items as item
  join public.finance_fee_agreement_items as agreement_item
    on agreement_item.id = item.fee_agreement_item_id
  where item.billing_installment_id = v_installment.id
    and agreement_item.fee_agreement_id = v_agreement.id;

  if v_item_count = 0
    or v_before_vat <> v_installment.amount_before_tax
    or v_vat <> v_installment.vat_amount
    or v_total <> v_installment.total_amount
  then
    raise exception 'Billing Installment Items do not reconcile for Invoice V2 bridge eligibility';
  end if;
end;
$invoice_v2_bridge_eligibility$;

create or replace function public.enforce_finance_billing_installment_charge_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_v2_bridge_guard$
declare
  v_installment public.finance_billing_installments%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoice V2 path claims are permanent and cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Invoice V2 path claims are immutable';
  end if;
  if not public.current_user_can_approve_finance_billable_charges() then
    raise exception 'Invoice V2 path claim requires Billable Charge approval authority';
  end if;

  perform public.assert_finance_billing_installment_v2_bridge_eligible(
    new.billing_installment_id
  );

  select * into v_installment
  from public.finance_billing_installments
  where id = new.billing_installment_id;
  select * into v_plan
  from public.finance_billing_plans
  where id = v_installment.billing_plan_id;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = v_plan.fee_agreement_id;

  if new.billing_plan_id <> v_plan.id
    or new.fee_agreement_id <> v_agreement.id
    or new.client_id <> v_agreement.client_id
    or new.case_id is distinct from v_agreement.case_id
    or new.advisory_matter_id is distinct from v_agreement.advisory_matter_id
    or new.currency <> v_plan.currency
    or v_plan.currency <> v_agreement.currency
    or new.claimed_by_user_id is distinct from auth.uid()
  then
    raise exception 'Invoice V2 path claim does not match authoritative installment lineage';
  end if;

  return new;
end;
$invoice_v2_bridge_guard$;

create or replace function public.record_finance_billing_installment_charge_bridge_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_v2_bridge_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = new.claimed_by_user_id;

  insert into public.finance_billing_installment_charge_bridge_audit_events (
    bridge_id,
    billing_installment_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    new.id,
    new.billing_installment_id,
    'v2_path_claimed',
    jsonb_build_object(
      'request_id', new.request_id,
      'billing_plan_id', new.billing_plan_id,
      'fee_agreement_id', new.fee_agreement_id,
      'client_id', new.client_id,
      'case_id', new.case_id,
      'advisory_matter_id', new.advisory_matter_id,
      'currency', new.currency,
      'claimed_at', new.claimed_at,
      'source_snapshot', new.source_snapshot_json,
      'certification_snapshot', new.certification_snapshot_json
    ),
    new.claimed_by_user_id,
    v_actor_email,
    v_actor_name
  );

  return null;
end;
$invoice_v2_bridge_audit_writer$;

create or replace function public.protect_finance_billing_installment_charge_bridge_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_v2_bridge_audit_guard$
begin
  raise exception 'Invoice V2 path-claim audit events are append-only';
end;
$invoice_v2_bridge_audit_guard$;

create trigger finance_billing_installment_charge_bridge_guard
before insert or update or delete on public.finance_billing_installment_charge_bridges
for each row execute function public.enforce_finance_billing_installment_charge_bridge();

create trigger finance_billing_installment_charge_bridge_audit_writer
after insert on public.finance_billing_installment_charge_bridges
for each row execute function public.record_finance_billing_installment_charge_bridge_audit();

create trigger finance_billing_installment_charge_bridge_audit_immutability
before update or delete on public.finance_billing_installment_charge_bridge_audit_events
for each row execute function public.protect_finance_billing_installment_charge_bridge_audit();

create or replace function public.protect_finance_invoice_source_model()
returns trigger
language plpgsql
security definer
set search_path = public
as $invoice_source_model_guard$
begin
  if tg_op = 'UPDATE' and old.source_model is distinct from new.source_model then
    raise exception 'Invoice source model is immutable';
  end if;
  if tg_op = 'INSERT' and new.source_model <> 'installment_v1' then
    raise exception 'Invoice V2 composition is not operational in Migration 031';
  end if;
  return new;
end;
$invoice_source_model_guard$;

create trigger finance_invoice_source_model_guard
before insert or update of source_model on public.finance_invoices
for each row execute function public.protect_finance_invoice_source_model();

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
    then
      raise exception 'Ready Billable Charge requires complete positive commercial, economic, source, and frozen snapshot data';
    end if;
  end if;
end;
$billable_charge_integrity_validator$;

create or replace function public.enforce_finance_billable_charge_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_lifecycle_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Billable Charges are retained as billing evidence and cannot be deleted';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Billable Charges must be created as Draft';
    end if;
    return new;
  end if;

  if old.id is distinct from new.id
    or old.created_at is distinct from new.created_at
    or old.created_by_user_id is distinct from new.created_by_user_id
    or old.idempotency_key is distinct from new.idempotency_key
    or old.source_type is distinct from new.source_type
    or old.source_billing_installment_item_id is distinct from new.source_billing_installment_item_id
    or old.source_event_key is distinct from new.source_event_key
    or old.supersedes_charge_id is distinct from new.supersedes_charge_id
    or old.calculation_basis is distinct from new.calculation_basis
    or old.source_semantics_json is distinct from new.source_semantics_json
  then
    raise exception 'Billable Charge creation identity and source lineage are immutable';
  end if;

  if old.status = 'draft' and new.status in ('draft', 'ready_to_invoice', 'cancelled') then
    return new;
  end if;

  if old.status = 'ready_to_invoice' and new.status = 'cancelled' then
    if (
      to_jsonb(new) - array[
        'status', 'cancelled_at', 'cancelled_by_user_id', 'cancel_reason',
        'updated_at', 'updated_by_user_id'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'status', 'cancelled_at', 'cancelled_by_user_id', 'cancel_reason',
        'updated_at', 'updated_by_user_id'
      ]
    ) then
      raise exception 'Cancelling a Ready Billable Charge must preserve its frozen commercial evidence';
    end if;
    return new;
  end if;

  raise exception 'Ready, Reserved, Invoiced, or Cancelled Billable Charges are immutable outside controlled lifecycle transitions';
end;
$billable_charge_lifecycle_guard$;

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
    jsonb_build_object('ready_snapshot', v_ready_snapshot)
  );

  return v_charge.id;
end;
$mark_billable_charge_ready$;

create or replace function public.create_finance_invoice_draft_from_installment(
  p_billing_installment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_invoice_v1_draft$
declare
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
  v_billing_plan_id uuid;
  v_client public.clients%rowtype;
  v_company public.finance_company_profiles%rowtype;
  v_invoice_id uuid;
  v_existing_invoice public.finance_invoices%rowtype;
  v_customer_snapshot jsonb;
  v_seller_snapshot jsonb;
  v_actor_email text;
  v_actor_name text;
  v_item_count integer;
  v_before_vat numeric(14, 2);
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to create Invoice Draft';
  end if;

  if p_billing_installment_id is null then
    raise exception 'Billing Installment is required';
  end if;

  select billing_plan_id into v_billing_plan_id
  from public.finance_billing_installments
  where id = p_billing_installment_id;
  if v_billing_plan_id is null then raise exception 'Billing Installment not found'; end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_billing_plan_id
  for update;

  select * into v_installment
  from public.finance_billing_installments
  where id = p_billing_installment_id
  for update;

  if v_plan.status <> 'active' then
    raise exception 'Invoice Draft requires an active Billing Plan';
  end if;
  if v_installment.status <> 'ready_to_invoice' then
    raise exception 'Invoice Draft requires a Billing Installment that is ready to invoice';
  end if;
  if v_installment.billing_plan_id <> v_plan.id then
    raise exception 'Billing Installment does not belong to the locked Billing Plan';
  end if;
  if exists (
    select 1
    from public.finance_billing_installment_charge_bridges as bridge
    where bridge.billing_installment_id = v_installment.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FINANCE_INSTALLMENT_V2_BRIDGED';
  end if;

  select * into v_existing_invoice
  from public.finance_invoices
  where primary_billing_installment_id = v_installment.id
    and document_status not in ('cancelled', 'voided')
  order by created_at, id
  limit 1
  for update;

  if v_existing_invoice.id is not null then
    if v_existing_invoice.document_status = 'draft' then
      perform public.validate_finance_invoice_integrity(v_existing_invoice.id);
      return v_existing_invoice.id;
    end if;
    raise exception 'An active Invoice already exists for this Billing Installment';
  end if;

  select * into v_agreement
  from public.finance_fee_agreements
  where id = v_plan.fee_agreement_id
  for update;
  if v_agreement.id is null or not public.finance_fee_agreement_is_billing_eligible(v_agreement.id) then
    raise exception 'Invoice Draft requires an eligible commercial engagement';
  end if;
  if v_plan.currency <> v_agreement.currency then
    raise exception 'Billing Plan currency does not match the commercial engagement';
  end if;

  select * into v_client from public.clients where id = v_agreement.client_id;
  if v_client.id is null then raise exception 'Invoice Client not found'; end if;
  select * into v_company from public.finance_company_profiles where id = 'default';

  select
    count(*)::integer,
    coalesce(sum(item.amount_before_tax), 0),
    coalesce(sum(item.vat_amount), 0),
    coalesce(sum(item.total_amount), 0)
  into v_item_count, v_before_vat, v_vat, v_total
  from public.finance_billing_installment_items as item
  join public.finance_fee_agreement_items as agreement_item
    on agreement_item.id = item.fee_agreement_item_id
  where item.billing_installment_id = v_installment.id
    and agreement_item.fee_agreement_id = v_agreement.id;

  if v_item_count = 0
    or v_before_vat <> v_installment.amount_before_tax
    or v_vat <> v_installment.vat_amount
    or v_total <> v_installment.total_amount
  then
    raise exception 'Billing Installment Items do not reconcile to the installment';
  end if;

  v_customer_snapshot := case
    when jsonb_typeof(v_agreement.client_snapshot_json) = 'object'
      and v_agreement.client_snapshot_json <> '{}'::jsonb
      then v_agreement.client_snapshot_json
    else jsonb_strip_nulls(jsonb_build_object(
      'id', v_client.id,
      'name', v_client.name,
      'client_type', v_client.client_type,
      'tax_id', v_client.tax_id,
      'address', v_client.address,
      'phone', v_client.phone,
      'email', v_client.email
    ))
  end;
  v_seller_snapshot := case
    when jsonb_typeof(v_agreement.company_snapshot_json) = 'object'
      and v_agreement.company_snapshot_json <> '{}'::jsonb
      then v_agreement.company_snapshot_json
    else jsonb_strip_nulls(jsonb_build_object(
      'company_name_th', v_company.company_name_th,
      'company_name_en', v_company.company_name_en,
      'tax_id', v_company.tax_id,
      'branch_label', coalesce(v_company.branch_th, v_company.branch_label),
      'address_th', v_company.address_th,
      'address_en', v_company.address_en,
      'phone', v_company.phone,
      'email', v_company.email,
      'website', v_company.website
    ))
  end;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  insert into public.finance_invoices (
    billing_plan_id,
    primary_billing_installment_id,
    fee_agreement_id,
    source_quotation_id,
    client_id,
    case_id,
    advisory_matter_id,
    source_model,
    document_status,
    due_date,
    currency,
    language_code,
    payment_terms_text,
    amount_before_vat,
    vat_amount,
    total_amount,
    seller_name_th,
    seller_name_en,
    seller_tax_id,
    seller_branch,
    seller_address,
    seller_phone,
    seller_email,
    seller_website,
    customer_name,
    customer_tax_id,
    customer_branch,
    customer_billing_address,
    customer_phone,
    customer_email,
    seller_snapshot_json,
    customer_snapshot_json,
    matter_snapshot_json,
    source_snapshot_json,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_plan.id,
    v_installment.id,
    v_agreement.id,
    v_agreement.source_quotation_id,
    v_agreement.client_id,
    v_agreement.case_id,
    v_agreement.advisory_matter_id,
    'installment_v1',
    'draft',
    v_installment.due_date,
    v_plan.currency,
    coalesce(v_agreement.language_code, 'th'),
    v_installment.trigger_description,
    v_installment.amount_before_tax,
    v_installment.vat_amount,
    v_installment.total_amount,
    coalesce(v_seller_snapshot->>'company_name_th', v_company.company_name_th),
    coalesce(v_seller_snapshot->>'company_name_en', v_company.company_name_en),
    coalesce(v_seller_snapshot->>'tax_id', v_company.tax_id),
    coalesce(v_seller_snapshot->>'branch_th', v_seller_snapshot->>'branch_label', v_company.branch_th, v_company.branch_label),
    coalesce(v_seller_snapshot->>'address_th', v_company.address_th),
    coalesce(v_seller_snapshot->>'phone', v_company.phone),
    coalesce(v_seller_snapshot->>'email', v_company.email),
    coalesce(v_seller_snapshot->>'website', v_company.website),
    coalesce(v_customer_snapshot->>'client_display_name', v_customer_snapshot->>'name', v_client.name),
    coalesce(v_customer_snapshot->>'tax_id', v_client.tax_id),
    null,
    coalesce(v_customer_snapshot->>'billing_address', v_customer_snapshot->>'address', v_client.address),
    coalesce(v_customer_snapshot->>'phone', v_client.phone),
    coalesce(v_customer_snapshot->>'email', v_client.email),
    coalesce(v_seller_snapshot, '{}'::jsonb),
    coalesce(v_customer_snapshot, '{}'::jsonb),
    case when jsonb_typeof(v_agreement.matter_snapshot_json) = 'object'
      then v_agreement.matter_snapshot_json else '{}'::jsonb end,
    jsonb_strip_nulls(jsonb_build_object(
      'schema_version', 1,
      'invoice_source_model', 'installment_v1',
      'fee_agreement', jsonb_build_object(
        'id', v_agreement.id,
        'agreement_no', v_agreement.agreement_no,
        'engagement_basis', v_agreement.engagement_basis,
        'status', v_agreement.status,
        'source_quotation_id', v_agreement.source_quotation_id
      ),
      'billing_plan', jsonb_build_object(
        'id', v_plan.id,
        'status', v_plan.status,
        'billing_method', v_plan.billing_method,
        'currency', v_plan.currency
      ),
      'billing_installment', jsonb_build_object(
        'id', v_installment.id,
        'installment_no', v_installment.installment_no,
        'title', v_installment.title,
        'trigger_type', v_installment.trigger_type,
        'trigger_description', v_installment.trigger_description,
        'due_date', v_installment.due_date,
        'ready_to_invoice_at', v_installment.ready_to_invoice_at
      ),
      'client', v_customer_snapshot,
      'company', v_seller_snapshot,
      'matter', case when jsonb_typeof(v_agreement.matter_snapshot_json) = 'object'
        then v_agreement.matter_snapshot_json else '{}'::jsonb end,
      'commercial_terms', case when jsonb_typeof(v_agreement.commercial_terms_snapshot_json) = 'object'
        then v_agreement.commercial_terms_snapshot_json else '{}'::jsonb end,
      'source_document', case when jsonb_typeof(v_agreement.source_document_snapshot_json) = 'object'
        then v_agreement.source_document_snapshot_json else '{}'::jsonb end
    )),
    auth.uid(),
    auth.uid()
  ) returning id into v_invoice_id;

  insert into public.finance_invoice_installment_allocations (
    invoice_id,
    billing_installment_id,
    allocated_before_vat,
    allocated_vat,
    allocated_total,
    source_snapshot_json
  ) values (
    v_invoice_id,
    v_installment.id,
    v_installment.amount_before_tax,
    v_installment.vat_amount,
    v_installment.total_amount,
    jsonb_build_object(
      'billing_plan_id', v_plan.id,
      'billing_installment_id', v_installment.id,
      'installment_no', v_installment.installment_no,
      'source_status', v_installment.status
    )
  );

  insert into public.finance_invoice_items (
    invoice_id,
    source_fee_agreement_item_id,
    source_billing_installment_item_id,
    description,
    source_quantity,
    source_unit_price,
    allocation_percent,
    vat_applicable,
    vat_rate,
    tax_category,
    price_tax_mode,
    amount_before_vat,
    vat_amount,
    line_total,
    sort_order,
    source_snapshot_json
  )
  select
    v_invoice_id,
    agreement_item.id,
    installment_item.id,
    agreement_item.description,
    agreement_item.quantity,
    agreement_item.unit_price,
    installment_item.allocation_percent,
    agreement_item.vat_applicable,
    agreement_item.vat_rate,
    agreement_item.tax_category,
    case
      when agreement_item.item_snapshot_json->>'price_tax_mode' in ('non_vat', 'vat_exclusive', 'vat_inclusive')
        then agreement_item.item_snapshot_json->>'price_tax_mode'
      else null
    end,
    installment_item.amount_before_tax,
    installment_item.vat_amount,
    installment_item.total_amount,
    installment_item.sort_order,
    jsonb_build_object(
      'fee_agreement_item', coalesce(agreement_item.item_snapshot_json, '{}'::jsonb),
      'billing_allocation', coalesce(installment_item.allocation_snapshot_json, '{}'::jsonb)
    )
  from public.finance_billing_installment_items as installment_item
  join public.finance_fee_agreement_items as agreement_item
    on agreement_item.id = installment_item.fee_agreement_item_id
  where installment_item.billing_installment_id = v_installment.id
  order by installment_item.sort_order, installment_item.id;

  insert into public.finance_invoice_audit_events (
    invoice_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    v_invoice_id,
    'draft_created',
    jsonb_build_object(
      'source_model', 'installment_v1',
      'source_billing_plan_id', v_plan.id,
      'source_billing_installment_id', v_installment.id,
      'source_installment_status', v_installment.status,
      'invoice_number_allocated', false,
      'installment_status_changed', false
    ),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );

  return v_invoice_id;
end;
$create_invoice_v1_draft$;

alter table public.finance_billing_installment_charge_bridges enable row level security;
alter table public.finance_billing_installment_charge_bridge_audit_events enable row level security;

create policy "finance billable charge viewers select installment bridges"
on public.finance_billing_installment_charge_bridges for select
using (public.current_user_can_view_finance_billable_charges());

create policy "finance billable charge viewers select installment bridge audit"
on public.finance_billing_installment_charge_bridge_audit_events for select
using (public.current_user_can_view_finance_billable_charges());

revoke all on table public.finance_billing_installment_charge_bridges
  from public, anon, authenticated;
revoke all on table public.finance_billing_installment_charge_bridge_audit_events
  from public, anon, authenticated;

grant select on table public.finance_billing_installment_charge_bridges to authenticated;
grant select on table public.finance_billing_installment_charge_bridge_audit_events to authenticated;

revoke all on function public.assert_finance_billing_installment_v2_bridge_eligible(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_finance_billing_installment_charge_bridge()
  from public, anon, authenticated;
revoke all on function public.record_finance_billing_installment_charge_bridge_audit()
  from public, anon, authenticated;
revoke all on function public.protect_finance_billing_installment_charge_bridge_audit()
  from public, anon, authenticated;
revoke all on function public.protect_finance_invoice_source_model()
  from public, anon, authenticated;

revoke all on function public.create_finance_invoice_draft_from_installment(uuid)
  from public, anon;
grant execute on function public.create_finance_invoice_draft_from_installment(uuid)
  to authenticated;

comment on table public.finance_billing_installment_charge_bridges is
  'Permanent one-row-per-installment claim of the Invoice V2 Billable Charge path. Migration 031 exposes no operational bridge-creation RPC.';
comment on table public.finance_billing_installment_charge_bridge_audit_events is
  'Append-only evidence for permanent Billing Installment Invoice V2 path claims.';
comment on column public.finance_billing_installment_charge_bridges.certification_snapshot_json is
  'Human certification and adapter facts required before a future atomic Invoice V2 composer may claim the installment.';
comment on column public.finance_quotation_items.unit is
  'Prospective customer-facing unit semantics for future billing. Historical rows are intentionally not backfilled.';
comment on column public.finance_quotation_items.economic_classification is
  'Prospective billing classification only; it does not infer VAT, WHT, revenue, or Compensation policy.';
comment on column public.finance_fee_agreement_items.unit is
  'Frozen prospective unit copied from future Quotation workflows. Historical rows remain null.';
comment on column public.finance_fee_agreement_items.economic_classification is
  'Frozen prospective billing classification. Historical rows remain null and are never guessed.';
comment on column public.finance_billing_installment_items.semantic_snapshot_json is
  'Optional prospective semantic lineage for a future human-certified installment-to-Charge adapter.';
comment on column public.finance_billable_charges.calculation_basis is
  'quantity_rate recomputes authoritative amounts; source_fixed_allocation preserves exact allocated source amounts without inventing quantity or rate.';
comment on column public.finance_billable_charges.source_semantics_json is
  'Human-certified semantic adapter data for source-fixed Billing Installment Charges. It is not a tax, revenue, WHT, or Compensation policy.';
comment on column public.finance_invoices.source_model is
  'Immutable Invoice lineage discriminator. Existing and Migration 031-created Invoices are installment_v1; billable_charge_v2 is reserved for the future atomic composer.';
comment on function public.assert_finance_billing_installment_v2_bridge_eligible(uuid) is
  'Internal fail-closed validator. Any prior V1 Invoice history permanently disqualifies an installment from the V2 Charge path.';
comment on function public.create_finance_invoice_draft_from_installment(uuid) is
  'Authoritative Invoice V1 Draft path. Rejects permanently V2-bridged Billing Installments with FINANCE_INSTALLMENT_V2_BRIDGED.';
