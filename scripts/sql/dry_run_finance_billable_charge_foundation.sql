begin;

select set_config(
  'vp.phase_b1_billable_charge_dry_run_baseline',
  jsonb_build_object(
    'invoice_rows', (select count(*) from public.finance_invoices),
    'payment_rows', (select count(*) from public.finance_payments),
    'confirmed_payment_rows', (
      select count(*) from public.finance_payments where status = 'confirmed'
    ),
    'confirmed_payment_cash', (
      select coalesce(sum(cash_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ),
    'confirmed_payment_wht', (
      select coalesce(sum(wht_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ),
    'confirmed_payment_settlement', (
      select coalesce(sum(settlement_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ),
    'cash_transaction_rows', (select count(*) from public.finance_cash_transactions),
    'opening_balance_rows', (select count(*) from public.finance_account_opening_balances),
    'legacy_ledger_rows', (select count(*) from public.finance_company_ledger),
    'compensation_rows', (select count(*) from public.finance_compensation_batches)
  )::text,
  true
);

-- BEGIN BYTE-FOR-BYTE MIGRATION 030 EMBED
-- Phase B1: prospective Billable Charge foundation.
-- No Charge, Invoice, Payment, Cash, Ledger, or Compensation data is created.

do $billable_charge_foundation_preflight$
begin
  if to_regclass('public.clients') is null
    or to_regclass('public.cases') is null
    or to_regclass('public.advisory_matters') is null
    or to_regclass('public.user_profiles') is null
    or to_regclass('public.finance_fee_agreements') is null
    or to_regclass('public.finance_fee_agreement_items') is null
    or to_regclass('public.finance_billing_plans') is null
    or to_regclass('public.finance_billing_installments') is null
    or to_regclass('public.finance_billing_installment_items') is null
    or to_regclass('public.finance_invoices') is null
    or to_regclass('public.finance_invoice_items') is null
    or to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_cash_transactions') is null
    or to_regclass('public.finance_account_opening_balances') is null
    or to_regclass('public.finance_company_ledger') is null
    or to_regclass('public.finance_compensation_batches') is null
  then
    raise exception 'Billable Charge foundation requires the current Finance, Client, and Matter architecture';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'id'
      and data_type = 'bigint'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'client_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'advisory_matters'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'advisory_matters'
      and column_name = 'client_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_billing_installment_items'
      and column_name = 'id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name in ('id', 'active', 'role', 'email', 'full_name', 'staff_name')
    group by table_schema, table_name
    having count(*) = 6
  ) then
    raise exception 'Billable Charge prerequisite column types are incompatible';
  end if;

  if to_regclass('public.finance_billable_charges') is not null
    or to_regclass('public.finance_billable_charge_audit_events') is not null
  then
    raise exception 'Billable Charge relation names already exist; inspect partial Production state';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name in (
        'can_view_finance_billable_charges',
        'can_manage_finance_billable_charges',
        'can_approve_finance_billable_charges'
      )
  ) then
    raise exception 'Billable Charge permission fields already exist; inspect partial Production state';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    join pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.proname in (
        'protect_finance_billable_charge_permission_fields',
        'current_user_can_view_finance_billable_charges',
        'current_user_can_manage_finance_billable_charges',
        'current_user_can_approve_finance_billable_charges',
        'calculate_finance_billable_charge_amounts',
        'assert_finance_billable_charge_context',
        'validate_finance_billable_charge_integrity',
        'enforce_finance_billable_charge_integrity',
        'enforce_finance_billable_charge_lifecycle',
        'protect_finance_billable_charge_audit_event',
        'record_finance_billable_charge_audit_event',
        'create_finance_billable_charge_draft',
        'save_finance_billable_charge_draft',
        'mark_finance_billable_charge_ready',
        'cancel_finance_billable_charge'
      )
  ) then
    raise exception 'Billable Charge function names already exist; inspect partial Production state';
  end if;
end;
$billable_charge_foundation_preflight$;

alter table public.user_profiles
  add column can_view_finance_billable_charges boolean not null default false,
  add column can_manage_finance_billable_charges boolean not null default false,
  add column can_approve_finance_billable_charges boolean not null default false;

create table public.finance_billable_charges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  case_id bigint null references public.cases(id) on delete restrict,
  advisory_matter_id uuid null references public.advisory_matters(id) on delete restrict,
  source_type text not null,
  source_billing_installment_item_id uuid null
    references public.finance_billing_installment_items(id) on delete restrict,
  source_reference text null,
  source_event_key text null,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  idempotency_key uuid null,
  supersedes_charge_id uuid null
    references public.finance_billable_charges(id) on delete restrict,
  description text null,
  quantity numeric(14, 4) not null default 1,
  unit text null,
  unit_rate numeric(14, 2) not null default 0,
  currency text not null default 'THB',
  service_date date null,
  economic_classification text null,
  vat_applicable boolean not null default false,
  vat_rate numeric(7, 4) not null default 0,
  tax_category text null,
  price_tax_mode text not null default 'non_vat',
  amount_before_vat numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  status text not null default 'draft',
  ready_snapshot_json jsonb null,
  ready_to_invoice_at timestamptz null,
  ready_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancel_reason text null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  constraint finance_billable_charges_single_matter_check
    check (case_id is null or advisory_matter_id is null),
  constraint finance_billable_charges_source_type_check
    check (source_type in ('ad_hoc_service', 'recoverable_cost', 'billing_installment_item')),
  constraint finance_billable_charges_source_contract_check
    check (
      (source_type in ('ad_hoc_service', 'recoverable_cost') and source_billing_installment_item_id is null)
      or (source_type = 'billing_installment_item' and source_billing_installment_item_id is not null)
    ),
  constraint finance_billable_charges_no_self_supersession_check
    check (supersedes_charge_id is null or supersedes_charge_id <> id),
  constraint finance_billable_charges_description_length_check
    check (length(coalesce(description, '')) <= 2000),
  constraint finance_billable_charges_unit_check
    check (unit is null or (nullif(btrim(unit), '') is not null and length(unit) <= 100)),
  constraint finance_billable_charges_source_text_length_check
    check (
      length(coalesce(source_reference, '')) <= 1000
      and length(coalesce(source_event_key, '')) <= 500
    ),
  constraint finance_billable_charges_quantity_check
    check (quantity > 0),
  constraint finance_billable_charges_unit_rate_check
    check (unit_rate >= 0),
  constraint finance_billable_charges_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_billable_charges_economic_classification_check
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
  constraint finance_billable_charges_vat_rate_check
    check (vat_rate >= 0),
  constraint finance_billable_charges_price_tax_mode_check
    check (price_tax_mode in ('non_vat', 'vat_exclusive', 'vat_inclusive')),
  constraint finance_billable_charges_tax_mode_consistency_check
    check (
      (price_tax_mode = 'non_vat' and not vat_applicable and vat_rate = 0 and vat_amount = 0)
      or (price_tax_mode in ('vat_exclusive', 'vat_inclusive') and vat_applicable)
    ),
  constraint finance_billable_charges_amounts_non_negative_check
    check (amount_before_vat >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_billable_charges_total_consistency_check
    check (total_amount = amount_before_vat + vat_amount),
  constraint finance_billable_charges_status_check
    check (status in ('draft', 'ready_to_invoice', 'reserved', 'invoiced', 'cancelled')),
  constraint finance_billable_charges_snapshot_shape_check
    check (
      jsonb_typeof(source_snapshot_json) = 'object'
      and (ready_snapshot_json is null or jsonb_typeof(ready_snapshot_json) = 'object')
    ),
  constraint finance_billable_charges_lifecycle_metadata_check
    check (
      (
        status = 'draft'
        and ready_snapshot_json is null
        and ready_to_invoice_at is null
        and ready_by_user_id is null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
      )
      or (
        status in ('ready_to_invoice', 'reserved', 'invoiced')
        and ready_snapshot_json is not null
        and ready_snapshot_json <> '{}'::jsonb
        and ready_to_invoice_at is not null
        and ready_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
      )
      or (
        status = 'cancelled'
        and cancelled_at is not null
        and cancelled_by_user_id is not null
        and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
      )
    )
);

create unique index uq_finance_billable_charges_idempotency
on public.finance_billable_charges (idempotency_key)
where idempotency_key is not null;

create unique index uq_finance_billable_charges_active_source_event
on public.finance_billable_charges (source_type, source_event_key)
where source_event_key is not null and status <> 'cancelled';

create unique index uq_finance_billable_charges_active_supersession
on public.finance_billable_charges (supersedes_charge_id)
where supersedes_charge_id is not null and status <> 'cancelled';

create index idx_finance_billable_charges_client_status
on public.finance_billable_charges (client_id, status, created_at desc);

create index idx_finance_billable_charges_case_status
on public.finance_billable_charges (case_id, status, created_at desc)
where case_id is not null;

create index idx_finance_billable_charges_advisory_status
on public.finance_billable_charges (advisory_matter_id, status, created_at desc)
where advisory_matter_id is not null;

create index idx_finance_billable_charges_ready
on public.finance_billable_charges (ready_to_invoice_at, id)
where status = 'ready_to_invoice';

create index idx_finance_billable_charges_source_installment_item
on public.finance_billable_charges (source_billing_installment_item_id)
where source_billing_installment_item_id is not null;

create table public.finance_billable_charge_audit_events (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.finance_billable_charges(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_billable_charge_audit_type_check
    check (event_type in ('created', 'draft_saved', 'marked_ready', 'cancelled')),
  constraint finance_billable_charge_audit_payload_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_billable_charge_audit_charge
on public.finance_billable_charge_audit_events (charge_id, created_at, id);

create or replace function public.protect_finance_billable_charge_permission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_permission_guard$
begin
  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  ) then
    raise exception 'Only an active Admin can change Billable Charge authority';
  end if;
  return new;
end;
$billable_charge_permission_guard$;

create trigger protect_finance_billable_charge_permission_fields
before update of
  can_view_finance_billable_charges,
  can_manage_finance_billable_charges,
  can_approve_finance_billable_charges
on public.user_profiles
for each row execute function public.protect_finance_billable_charge_permission_fields();

create or replace function public.current_user_can_view_finance_billable_charges()
returns boolean
language sql
security definer
set search_path = public
as $billable_charge_view_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in ('admin', 'partner')
        or can_view_finance_billable_charges
        or can_manage_finance_billable_charges
        or can_approve_finance_billable_charges
      )
  );
$billable_charge_view_permission$;

create or replace function public.current_user_can_manage_finance_billable_charges()
returns boolean
language sql
security definer
set search_path = public
as $billable_charge_manage_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_manage_finance_billable_charges)
  );
$billable_charge_manage_permission$;

create or replace function public.current_user_can_approve_finance_billable_charges()
returns boolean
language sql
security definer
set search_path = public
as $billable_charge_approve_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_approve_finance_billable_charges)
  );
$billable_charge_approve_permission$;

create or replace function public.calculate_finance_billable_charge_amounts(
  p_quantity numeric,
  p_unit_rate numeric,
  p_price_tax_mode text,
  p_vat_rate numeric
)
returns table (
  vat_applicable boolean,
  amount_before_vat numeric(14, 2),
  vat_amount numeric(14, 2),
  total_amount numeric(14, 2)
)
language plpgsql
immutable
set search_path = public
as $billable_charge_calculator$
declare
  v_mode text := lower(btrim(coalesce(p_price_tax_mode, '')));
  v_entered_total numeric(14, 2);
  v_before_vat numeric(14, 2);
  v_vat numeric(14, 2);
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 4) then
    raise exception 'Billable Charge quantity must be positive with no more than four decimal places';
  end if;
  if p_unit_rate is null or p_unit_rate < 0 or p_unit_rate <> round(p_unit_rate, 2) then
    raise exception 'Billable Charge unit rate must be non-negative with no more than two decimal places';
  end if;
  if v_mode not in ('non_vat', 'vat_exclusive', 'vat_inclusive') then
    raise exception 'Billable Charge price tax mode is invalid';
  end if;
  if p_vat_rate is null or p_vat_rate < 0 or p_vat_rate <> round(p_vat_rate, 4) then
    raise exception 'Billable Charge VAT rate must be non-negative with no more than four decimal places';
  end if;
  if v_mode = 'non_vat' and p_vat_rate <> 0 then
    raise exception 'Non-VAT Billable Charge must use a zero VAT rate';
  end if;

  v_entered_total := round(p_quantity * p_unit_rate, 2);
  v_before_vat := case
    when v_mode = 'vat_inclusive'
      then round(v_entered_total / (1 + p_vat_rate / 100), 2)
    else v_entered_total
  end;
  v_vat := case
    when v_mode = 'non_vat' then 0
    when v_mode = 'vat_inclusive' then v_entered_total - v_before_vat
    else round(v_before_vat * p_vat_rate / 100, 2)
  end;

  return query select
    v_mode <> 'non_vat',
    v_before_vat,
    v_vat,
    case when v_mode = 'vat_inclusive' then v_entered_total else v_before_vat + v_vat end;
end;
$billable_charge_calculator$;

create or replace function public.assert_finance_billable_charge_context(
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $billable_charge_context_validator$
declare
  v_matter_client_id uuid;
begin
  if p_client_id is null or not exists (
    select 1 from public.clients where id = p_client_id
  ) then
    raise exception 'Billable Charge Client is required and must exist';
  end if;
  if p_case_id is not null and p_advisory_matter_id is not null then
    raise exception 'Select either Case or Advisory matter, not both';
  end if;

  if p_case_id is not null then
    select case_record.client_id
    into v_matter_client_id
    from public.cases as case_record
    where case_record.id = p_case_id;

    if not found then
      raise exception 'Billable Charge Case not found';
    end if;
    if v_matter_client_id is distinct from p_client_id then
      raise exception 'Billable Charge Case must belong to the selected Client';
    end if;
  elsif p_advisory_matter_id is not null then
    select matter.client_id
    into v_matter_client_id
    from public.advisory_matters as matter
    where matter.id = p_advisory_matter_id;

    if not found then
      raise exception 'Billable Charge Advisory matter not found';
    end if;
    if v_matter_client_id is distinct from p_client_id then
      raise exception 'Billable Charge Advisory matter must belong to the selected Client';
    end if;
  end if;
end;
$billable_charge_context_validator$;

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

  if v_charge.source_type = 'billing_installment_item' then
    select
      agreement.client_id,
      agreement.case_id,
      agreement.advisory_matter_id,
      agreement.currency
    into v_source
    from public.finance_billing_installment_items as installment_item
    join public.finance_billing_installments as installment
      on installment.id = installment_item.billing_installment_id
    join public.finance_billing_plans as plan
      on plan.id = installment.billing_plan_id
    join public.finance_fee_agreements as agreement
      on agreement.id = plan.fee_agreement_id
    where installment_item.id = v_charge.source_billing_installment_item_id;

    if not found
      or v_source.client_id <> v_charge.client_id
      or v_source.case_id is distinct from v_charge.case_id
      or v_source.advisory_matter_id is distinct from v_charge.advisory_matter_id
      or v_source.currency <> v_charge.currency
    then
      raise exception 'Billable Charge Billing Installment source lineage is inconsistent';
    end if;
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
      or nullif(btrim(coalesce(v_charge.unit, '')), '') is null
      or v_charge.economic_classification is null
      or v_charge.total_amount <= 0
      or v_charge.ready_snapshot_json is null
      or v_charge.ready_snapshot_json = '{}'::jsonb
      or v_charge.ready_snapshot_json->>'schema_version' <> '1'
      or v_charge.ready_snapshot_json->'charge'->>'id' <> v_charge.id::text
      or v_charge.ready_snapshot_json->'source'->>'source_type' <> v_charge.source_type
    then
      raise exception 'Ready Billable Charge requires complete positive commercial, economic, source, and frozen snapshot data';
    end if;
  end if;
end;
$billable_charge_integrity_validator$;

create or replace function public.enforce_finance_billable_charge_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_integrity_trigger$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_billable_charge_integrity(old.id);
  else
    perform public.validate_finance_billable_charge_integrity(new.id);
    if tg_op = 'UPDATE' and old.id is distinct from new.id then
      perform public.validate_finance_billable_charge_integrity(old.id);
    end if;
  end if;
  return null;
end;
$billable_charge_integrity_trigger$;

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

create or replace function public.protect_finance_billable_charge_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $billable_charge_audit_guard$
begin
  raise exception 'Billable Charge audit events are append-only';
end;
$billable_charge_audit_guard$;

create trigger finance_billable_charge_lifecycle_guard
before insert or update or delete on public.finance_billable_charges
for each row execute function public.enforce_finance_billable_charge_lifecycle();

create constraint trigger finance_billable_charge_integrity
after insert or update or delete on public.finance_billable_charges
deferrable initially deferred
for each row execute function public.enforce_finance_billable_charge_integrity();

create trigger finance_billable_charge_audit_immutability
before update or delete on public.finance_billable_charge_audit_events
for each row execute function public.protect_finance_billable_charge_audit_event();

create or replace function public.record_finance_billable_charge_audit_event(
  p_charge_id uuid,
  p_event_type text,
  p_event_payload_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $billable_charge_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  if p_charge_id is null then
    raise exception 'Billable Charge audit requires a Charge';
  end if;
  if jsonb_typeof(coalesce(p_event_payload_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Billable Charge audit payload must be an object';
  end if;

  select
    profile.email,
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(profile.staff_name), ''),
      profile.email
    )
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  insert into public.finance_billable_charge_audit_events (
    charge_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    p_charge_id,
    p_event_type,
    coalesce(p_event_payload_json, '{}'::jsonb),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );
end;
$billable_charge_audit_writer$;

create or replace function public.create_finance_billable_charge_draft(
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_source_type text,
  p_source_reference text,
  p_source_event_key text,
  p_source_snapshot_json jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_billable_charge_draft$
declare
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
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
      'source_reference', v_source_reference,
      'source_event_key', v_source_event_key,
      'status', 'draft'
    )
  );

  return v_charge_id;
end;
$create_billable_charge_draft$;

create or replace function public.save_finance_billable_charge_draft(
  p_charge_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
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
as $save_billable_charge_draft$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_updated public.finance_billable_charges%rowtype;
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
    raise exception 'Billing Installment Charges require the future controlled adapter';
  end if;

  if v_charge.client_id is not distinct from p_client_id
    and v_charge.case_id is not distinct from p_case_id
    and v_charge.advisory_matter_id is not distinct from p_advisory_matter_id
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
$save_billable_charge_draft$;

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
  if nullif(btrim(coalesce(v_charge.unit, '')), '') is null then
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
      'source_snapshot', v_charge.source_snapshot_json
    ),
    'commercial', jsonb_build_object(
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

create or replace function public.cancel_finance_billable_charge(
  p_charge_id uuid,
  p_cancel_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $cancel_billable_charge$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_cancel_reason text := nullif(btrim(coalesce(p_cancel_reason, '')), '');
  v_cancelled_at timestamptz := now();
begin
  if v_cancel_reason is null then
    raise exception 'Billable Charge cancellation reason is required';
  end if;
  if length(v_cancel_reason) > 2000 then
    raise exception 'Billable Charge cancellation reason is too long';
  end if;
  if not public.current_user_can_manage_finance_billable_charges()
    and not public.current_user_can_approve_finance_billable_charges()
  then
    raise exception 'Not allowed to cancel Billable Charge';
  end if;

  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'Billable Charge not found';
  end if;
  if v_charge.status = 'cancelled' then
    return v_charge.id;
  end if;
  if v_charge.status = 'draft' then
    if not public.current_user_can_manage_finance_billable_charges() then
      raise exception 'Not allowed to cancel Billable Charge Draft';
    end if;
  elsif v_charge.status = 'ready_to_invoice' then
    if not public.current_user_can_approve_finance_billable_charges() then
      raise exception 'Not allowed to cancel Ready Billable Charge';
    end if;
  else
    raise exception 'Reserved or Invoiced Billable Charges cannot be cancelled by the Phase B1 lifecycle';
  end if;

  update public.finance_billable_charges
  set
    status = 'cancelled',
    cancelled_at = v_cancelled_at,
    cancelled_by_user_id = auth.uid(),
    cancel_reason = v_cancel_reason,
    updated_at = v_cancelled_at,
    updated_by_user_id = auth.uid()
  where id = v_charge.id;

  perform public.record_finance_billable_charge_audit_event(
    v_charge.id,
    'cancelled',
    jsonb_build_object(
      'previous_status', v_charge.status,
      'cancel_reason', v_cancel_reason,
      'ready_snapshot_preserved', v_charge.ready_snapshot_json is not null
    )
  );

  return v_charge.id;
end;
$cancel_billable_charge$;

alter table public.finance_billable_charges enable row level security;
alter table public.finance_billable_charge_audit_events enable row level security;

create policy "finance billable charge viewers select charges"
on public.finance_billable_charges for select
using (public.current_user_can_view_finance_billable_charges());

create policy "finance billable charge viewers select audit"
on public.finance_billable_charge_audit_events for select
using (public.current_user_can_view_finance_billable_charges());

revoke all on table public.finance_billable_charges from public, anon, authenticated;
revoke all on table public.finance_billable_charge_audit_events from public, anon, authenticated;

grant select on table public.finance_billable_charges to authenticated;
grant select on table public.finance_billable_charge_audit_events to authenticated;

revoke all on function public.protect_finance_billable_charge_permission_fields()
  from public, anon, authenticated;
revoke all on function public.current_user_can_view_finance_billable_charges()
  from public, anon, authenticated;
revoke all on function public.current_user_can_manage_finance_billable_charges()
  from public, anon, authenticated;
revoke all on function public.current_user_can_approve_finance_billable_charges()
  from public, anon, authenticated;
revoke all on function public.calculate_finance_billable_charge_amounts(numeric, numeric, text, numeric)
  from public, anon, authenticated;
revoke all on function public.assert_finance_billable_charge_context(uuid, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.validate_finance_billable_charge_integrity(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_finance_billable_charge_integrity()
  from public, anon, authenticated;
revoke all on function public.enforce_finance_billable_charge_lifecycle()
  from public, anon, authenticated;
revoke all on function public.protect_finance_billable_charge_audit_event()
  from public, anon, authenticated;
revoke all on function public.record_finance_billable_charge_audit_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_finance_billable_charge_draft(uuid, bigint, uuid, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.save_finance_billable_charge_draft(uuid, uuid, bigint, uuid, text, jsonb, text, numeric, text, numeric, text, date, text, text, numeric, text)
  from public, anon, authenticated;
revoke all on function public.mark_finance_billable_charge_ready(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.cancel_finance_billable_charge(uuid, text)
  from public, anon, authenticated;

grant execute on function public.current_user_can_view_finance_billable_charges()
  to authenticated;
grant execute on function public.current_user_can_manage_finance_billable_charges()
  to authenticated;
grant execute on function public.current_user_can_approve_finance_billable_charges()
  to authenticated;
grant execute on function public.create_finance_billable_charge_draft(uuid, bigint, uuid, text, text, text, jsonb, uuid)
  to authenticated;
grant execute on function public.save_finance_billable_charge_draft(uuid, uuid, bigint, uuid, text, jsonb, text, numeric, text, numeric, text, date, text, text, numeric, text)
  to authenticated;
grant execute on function public.mark_finance_billable_charge_ready(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_finance_billable_charge(uuid, text)
  to authenticated;

comment on table public.finance_billable_charges is
  'Line-granular customer debt eligible for controlled future Invoice composition. Economic classification does not determine tax, revenue, WHT, or Compensation policy.';
comment on column public.finance_billable_charges.source_billing_installment_item_id is
  'Typed source bridge reserved for a later fixed-installment adapter; Migration 030 creates no adapter or Charge rows.';
comment on column public.finance_billable_charges.economic_classification is
  'Billing/economic meaning only. It does not infer VAT, WHT, revenue recognition, or Compensation eligibility.';
comment on column public.finance_billable_charges.ready_snapshot_json is
  'Frozen source, commercial, economic, and tax facts captured when the Charge becomes ready to invoice.';
comment on function public.mark_finance_billable_charge_ready(uuid, boolean) is
  'Freezes one valid Draft Billable Charge and marks it ready for future Invoice composition. It creates no Invoice.';
-- END BYTE-FOR-BYTE MIGRATION 030 EMBED

do $billable_charge_dry_run_verification$
declare
  v_baseline jsonb := current_setting(
    'vp.phase_b1_billable_charge_dry_run_baseline'
  )::jsonb;
begin
  if to_regclass('public.finance_billable_charges') is null
    or to_regclass('public.finance_billable_charge_audit_events') is null
  then
    raise exception 'Dry-run failed to create the Billable Charge foundation';
  end if;

  if to_regprocedure('public.create_finance_billable_charge_draft(uuid,bigint,uuid,text,text,text,jsonb,uuid)') is null
    or to_regprocedure('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)') is null
    or to_regprocedure('public.mark_finance_billable_charge_ready(uuid,boolean)') is null
    or to_regprocedure('public.cancel_finance_billable_charge(uuid,text)') is null
  then
    raise exception 'Dry-run failed to create the controlled Billable Charge RPCs';
  end if;

  if (select count(*) from public.finance_billable_charges) <> 0
    or (select count(*) from public.finance_billable_charge_audit_events) <> 0
  then
    raise exception 'Migration 030 must not create Billable Charge business data';
  end if;

  if to_regclass('public.finance_invoice_charge_allocations') is not null
    or to_regclass('public.finance_quotation_rate_terms') is not null
    or to_regclass('public.finance_fee_agreement_rate_terms') is not null
    or to_regclass('public.finance_client_billing_arrangements') is not null
    or to_regclass('public.finance_client_billing_arrangement_versions') is not null
    or to_regclass('public.finance_client_billing_rate_terms') is not null
  then
    raise exception 'Migration 030 exceeded the approved Billable Charge foundation scope';
  end if;

  if (select count(*) from public.finance_invoices)
      <> (v_baseline->>'invoice_rows')::bigint
    or (select count(*) from public.finance_payments)
      <> (v_baseline->>'payment_rows')::bigint
    or (select count(*) from public.finance_payments where status = 'confirmed')
      <> (v_baseline->>'confirmed_payment_rows')::bigint
    or (
      select coalesce(sum(cash_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) <> (v_baseline->>'confirmed_payment_cash')::numeric
    or (
      select coalesce(sum(wht_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) <> (v_baseline->>'confirmed_payment_wht')::numeric
    or (
      select coalesce(sum(settlement_amount), 0)
      from public.finance_payments
      where status = 'confirmed'
    ) <> (v_baseline->>'confirmed_payment_settlement')::numeric
    or (select count(*) from public.finance_cash_transactions)
      <> (v_baseline->>'cash_transaction_rows')::bigint
    or (select count(*) from public.finance_account_opening_balances)
      <> (v_baseline->>'opening_balance_rows')::bigint
    or (select count(*) from public.finance_company_ledger)
      <> (v_baseline->>'legacy_ledger_rows')::bigint
    or (select count(*) from public.finance_compensation_batches)
      <> (v_baseline->>'compensation_rows')::bigint
  then
    raise exception 'Production Finance baseline changed during the Migration 030 dry-run';
  end if;
end;
$billable_charge_dry_run_verification$;

with baseline as (
  select current_setting(
    'vp.phase_b1_billable_charge_dry_run_baseline'
  )::jsonb as value
)
select
  'PHASE_B1_BILLABLE_CHARGE_TRANSACTIONAL_DRY_RUN'::text as report_section,
  to_regclass('public.finance_billable_charges') is not null as charge_table_created_inside_transaction,
  to_regclass('public.finance_billable_charge_audit_events') is not null as audit_table_created_inside_transaction,
  (select count(*) from public.finance_billable_charges) as charge_rows_inside_transaction,
  (select count(*) from public.finance_billable_charge_audit_events) as audit_rows_inside_transaction,
  (baseline.value->>'invoice_rows')::bigint as invoice_rows_before,
  (select count(*) from public.finance_invoices) as invoice_rows_after,
  (baseline.value->>'payment_rows')::bigint as payment_rows_before,
  (select count(*) from public.finance_payments) as payment_rows_after,
  (baseline.value->>'confirmed_payment_rows')::bigint as confirmed_payment_rows_before,
  (select count(*) from public.finance_payments where status = 'confirmed')
    as confirmed_payment_rows_after,
  (baseline.value->>'confirmed_payment_cash')::numeric as confirmed_payment_cash_before,
  (
    select coalesce(sum(cash_amount), 0)
    from public.finance_payments
    where status = 'confirmed'
  ) as confirmed_payment_cash_after,
  (baseline.value->>'confirmed_payment_wht')::numeric as confirmed_payment_wht_before,
  (
    select coalesce(sum(wht_amount), 0)
    from public.finance_payments
    where status = 'confirmed'
  ) as confirmed_payment_wht_after,
  (baseline.value->>'confirmed_payment_settlement')::numeric
    as confirmed_payment_settlement_before,
  (
    select coalesce(sum(settlement_amount), 0)
    from public.finance_payments
    where status = 'confirmed'
  ) as confirmed_payment_settlement_after,
  (baseline.value->>'cash_transaction_rows')::bigint as cash_transaction_rows_before,
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_after,
  (baseline.value->>'opening_balance_rows')::bigint as opening_balance_rows_before,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_after,
  (baseline.value->>'legacy_ledger_rows')::bigint as legacy_ledger_rows_before,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_after,
  (baseline.value->>'compensation_rows')::bigint as compensation_rows_before,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_after,
  true as dry_run_checks_passed_before_rollback
from baseline;

rollback;
