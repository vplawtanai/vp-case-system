-- Phase 4A: additive Invoice Draft foundation. No Invoice, number, or downstream record is created.

do $$
begin
  if to_regclass('public.finance_billing_plans') is null
    or to_regclass('public.finance_billing_installments') is null
    or to_regclass('public.finance_billing_installment_items') is null
    or to_regclass('public.finance_fee_agreements') is null
    or to_regclass('public.finance_fee_agreement_items') is null
  then
    raise exception 'Invoice foundation requires the current Billing Plan and Fee Agreement foundations';
  end if;

  if not exists (
    select 1
    from public.document_numbering_profiles
    where document_type = 'invoice'
      and display_prefix = 'VP-IV'
      and period_scope = 'monthly'
      and sequence_width = 6
      and is_active
  ) then
    raise exception 'Active Invoice numbering profile VP-IV / monthly / 6 digits is required';
  end if;
end;
$$;

create table public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  billing_plan_id uuid not null references public.finance_billing_plans(id) on delete restrict,
  primary_billing_installment_id uuid not null references public.finance_billing_installments(id) on delete restrict,
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  source_quotation_id uuid null references public.finance_quotations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  case_id bigint null references public.cases(id) on delete restrict,
  advisory_matter_id uuid null references public.advisory_matters(id) on delete restrict,
  invoice_no text null,
  document_status text not null default 'draft',
  issue_date date null,
  due_date date null,
  currency text not null default 'THB',
  language_code text not null default 'th',
  customer_note text null,
  payment_terms_text text null,
  internal_note text null,
  amount_before_vat numeric(14, 2) not null,
  vat_amount numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  seller_name_th text null,
  seller_name_en text null,
  seller_tax_id text null,
  seller_branch text null,
  seller_address text null,
  seller_phone text null,
  seller_email text null,
  seller_website text null,
  customer_name text null,
  customer_tax_id text null,
  customer_branch text null,
  customer_billing_address text null,
  customer_phone text null,
  customer_email text null,
  seller_snapshot_json jsonb not null default '{}'::jsonb,
  customer_snapshot_json jsonb not null default '{}'::jsonb,
  matter_snapshot_json jsonb not null default '{}'::jsonb,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  issued_snapshot_json jsonb null,
  issued_at timestamptz null,
  issued_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  cancel_reason text null,
  voided_at timestamptz null,
  voided_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  void_reason text null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_invoices_document_status_check
    check (document_status in ('draft', 'issued', 'cancelled', 'voided')),
  constraint finance_invoices_single_matter_check
    check (case_id is null or advisory_matter_id is null),
  constraint finance_invoices_currency_check
    check (btrim(currency) <> ''),
  constraint finance_invoices_language_check
    check (language_code in ('th', 'en')),
  constraint finance_invoices_amounts_non_negative_check
    check (amount_before_vat >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_invoices_total_consistency_check
    check (total_amount = amount_before_vat + vat_amount),
  constraint finance_invoices_due_date_check
    check (due_date is null or issue_date is null or due_date >= issue_date),
  constraint finance_invoices_snapshot_shape_check
    check (
      jsonb_typeof(seller_snapshot_json) = 'object'
      and jsonb_typeof(customer_snapshot_json) = 'object'
      and jsonb_typeof(matter_snapshot_json) = 'object'
      and jsonb_typeof(source_snapshot_json) = 'object'
      and (issued_snapshot_json is null or jsonb_typeof(issued_snapshot_json) = 'object')
    ),
  constraint finance_invoices_lifecycle_metadata_check
    check (
      (
        document_status = 'draft'
        and invoice_no is null
        and issue_date is null
        and issued_snapshot_json is null
        and issued_at is null
        and issued_by_user_id is null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and voided_at is null
        and voided_by_user_id is null
        and void_reason is null
      )
      or (
        document_status = 'cancelled'
        and invoice_no is null
        and issue_date is null
        and issued_snapshot_json is null
        and issued_at is null
        and issued_by_user_id is null
        and cancelled_at is not null
        and cancelled_by_user_id is not null
        and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
        and voided_at is null
        and voided_by_user_id is null
        and void_reason is null
      )
      or (
        document_status = 'issued'
        and nullif(btrim(coalesce(invoice_no, '')), '') is not null
        and issue_date is not null
        and issued_snapshot_json is not null
        and issued_snapshot_json <> '{}'::jsonb
        and issued_at is not null
        and issued_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and voided_at is null
        and voided_by_user_id is null
        and void_reason is null
      )
      or (
        document_status = 'voided'
        and nullif(btrim(coalesce(invoice_no, '')), '') is not null
        and issue_date is not null
        and issued_snapshot_json is not null
        and issued_snapshot_json <> '{}'::jsonb
        and issued_at is not null
        and issued_by_user_id is not null
        and cancelled_at is null
        and cancelled_by_user_id is null
        and cancel_reason is null
        and voided_at is not null
        and voided_by_user_id is not null
        and nullif(btrim(coalesce(void_reason, '')), '') is not null
      )
    )
);

create table public.finance_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  source_fee_agreement_item_id uuid not null references public.finance_fee_agreement_items(id) on delete restrict,
  source_billing_installment_item_id uuid not null references public.finance_billing_installment_items(id) on delete restrict,
  description text not null,
  source_quantity numeric(14, 4) null,
  source_unit_price numeric(14, 2) null,
  allocation_percent numeric(9, 6) null,
  vat_applicable boolean not null,
  vat_rate numeric(7, 4) not null,
  tax_category text null,
  price_tax_mode text null,
  amount_before_vat numeric(14, 2) not null,
  vat_amount numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  sort_order integer not null default 0,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_invoice_items_description_check check (btrim(description) <> ''),
  constraint finance_invoice_items_source_quantity_check
    check (source_quantity is null or source_quantity > 0),
  constraint finance_invoice_items_source_unit_price_check
    check (source_unit_price is null or source_unit_price >= 0),
  constraint finance_invoice_items_allocation_percent_check
    check (allocation_percent is null or (allocation_percent >= 0 and allocation_percent <= 100)),
  constraint finance_invoice_items_vat_rate_check check (vat_rate >= 0),
  constraint finance_invoice_items_price_tax_mode_check
    check (price_tax_mode is null or price_tax_mode in ('non_vat', 'vat_exclusive', 'vat_inclusive')),
  constraint finance_invoice_items_amounts_non_negative_check
    check (amount_before_vat >= 0 and vat_amount >= 0 and line_total >= 0),
  constraint finance_invoice_items_total_consistency_check
    check (line_total = amount_before_vat + vat_amount),
  constraint finance_invoice_items_non_vat_check
    check (vat_applicable or (vat_rate = 0 and vat_amount = 0)),
  constraint finance_invoice_items_sort_order_check check (sort_order >= 0),
  constraint finance_invoice_items_source_snapshot_shape_check
    check (jsonb_typeof(source_snapshot_json) = 'object'),
  constraint uq_finance_invoice_items_source_installment_item
    unique (invoice_id, source_billing_installment_item_id)
);

create table public.finance_invoice_installment_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  billing_installment_id uuid not null references public.finance_billing_installments(id) on delete restrict,
  allocated_before_vat numeric(14, 2) not null,
  allocated_vat numeric(14, 2) not null,
  allocated_total numeric(14, 2) not null,
  source_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint finance_invoice_installment_allocations_amounts_non_negative_check
    check (allocated_before_vat >= 0 and allocated_vat >= 0 and allocated_total >= 0),
  constraint finance_invoice_installment_allocations_total_consistency_check
    check (allocated_total = allocated_before_vat + allocated_vat),
  constraint finance_invoice_installment_allocations_snapshot_shape_check
    check (jsonb_typeof(source_snapshot_json) = 'object'),
  constraint uq_finance_invoice_installment_allocations_source
    unique (invoice_id, billing_installment_id)
);

create table public.finance_invoice_audit_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_invoice_audit_events_type_check
    check (event_type in ('draft_created', 'draft_saved', 'issued', 'cancelled', 'voided', 'replacement_created')),
  constraint finance_invoice_audit_events_payload_shape_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create unique index uq_finance_invoices_invoice_no
on public.finance_invoices (invoice_no)
where invoice_no is not null;

create unique index uq_finance_invoices_active_primary_installment
on public.finance_invoices (primary_billing_installment_id)
where document_status not in ('cancelled', 'voided');

create index idx_finance_invoices_plan on public.finance_invoices (billing_plan_id);
create index idx_finance_invoices_agreement on public.finance_invoices (fee_agreement_id);
create index idx_finance_invoices_source_quotation on public.finance_invoices (source_quotation_id)
where source_quotation_id is not null;
create index idx_finance_invoices_client on public.finance_invoices (client_id);
create index idx_finance_invoices_status on public.finance_invoices (document_status);
create index idx_finance_invoices_created_at on public.finance_invoices (created_at desc);
create index idx_finance_invoice_items_invoice on public.finance_invoice_items (invoice_id, sort_order);
create index idx_finance_invoice_items_agreement_item on public.finance_invoice_items (source_fee_agreement_item_id);
create index idx_finance_invoice_allocations_invoice on public.finance_invoice_installment_allocations (invoice_id);
create index idx_finance_invoice_allocations_installment on public.finance_invoice_installment_allocations (billing_installment_id);
create index idx_finance_invoice_audit_events_invoice on public.finance_invoice_audit_events (invoice_id, created_at);

create or replace function public.validate_finance_invoice_integrity(
  p_invoice_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
  v_item_count integer;
  v_source_item_count integer;
  v_allocation_count integer;
  v_before_vat numeric(14, 2);
  v_vat numeric(14, 2);
  v_total numeric(14, 2);
begin
  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id;

  if v_invoice.id is null then
    return;
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_invoice.billing_plan_id;
  select * into v_installment
  from public.finance_billing_installments
  where id = v_invoice.primary_billing_installment_id;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = v_invoice.fee_agreement_id;

  if v_plan.id is null
    or v_installment.id is null
    or v_agreement.id is null
    or v_installment.billing_plan_id <> v_plan.id
    or v_plan.fee_agreement_id <> v_agreement.id
    or v_invoice.source_quotation_id is distinct from v_agreement.source_quotation_id
    or v_invoice.client_id <> v_agreement.client_id
    or v_invoice.case_id is distinct from v_agreement.case_id
    or v_invoice.advisory_matter_id is distinct from v_agreement.advisory_matter_id
    or v_invoice.currency <> v_plan.currency
    or v_plan.currency <> v_agreement.currency
  then
    raise exception 'Invoice source lineage is inconsistent';
  end if;

  if v_invoice.document_status = 'draft'
    and (v_plan.status <> 'active' or v_installment.status <> 'ready_to_invoice')
  then
    raise exception 'Invoice Draft requires an active plan and ready installment';
  end if;

  if v_invoice.document_status = 'issued' and v_installment.status <> 'invoiced' then
    raise exception 'Issued Invoice requires its installment to be invoiced';
  end if;

  select
    count(*)::integer,
    coalesce(sum(amount_before_vat), 0),
    coalesce(sum(vat_amount), 0),
    coalesce(sum(line_total), 0)
  into v_item_count, v_before_vat, v_vat, v_total
  from public.finance_invoice_items
  where invoice_id = v_invoice.id;

  if v_item_count = 0
    or v_before_vat <> v_invoice.amount_before_vat
    or v_vat <> v_invoice.vat_amount
    or v_total <> v_invoice.total_amount
  then
    raise exception 'Invoice Items do not reconcile to Invoice totals';
  end if;

  select count(*)::integer
  into v_source_item_count
  from public.finance_billing_installment_items
  where billing_installment_id = v_installment.id;

  if v_source_item_count <> v_item_count or exists (
    select 1
    from public.finance_invoice_items as invoice_item
    left join public.finance_billing_installment_items as installment_item
      on installment_item.id = invoice_item.source_billing_installment_item_id
    left join public.finance_fee_agreement_items as agreement_item
      on agreement_item.id = invoice_item.source_fee_agreement_item_id
    where invoice_item.invoice_id = v_invoice.id
      and (
        installment_item.id is null
        or agreement_item.id is null
        or installment_item.billing_installment_id <> v_installment.id
        or installment_item.fee_agreement_item_id <> agreement_item.id
        or agreement_item.fee_agreement_id <> v_agreement.id
        or invoice_item.amount_before_vat <> installment_item.amount_before_tax
        or invoice_item.vat_amount <> installment_item.vat_amount
        or invoice_item.line_total <> installment_item.total_amount
        or invoice_item.vat_applicable <> agreement_item.vat_applicable
        or invoice_item.vat_rate <> agreement_item.vat_rate
      )
  ) then
    raise exception 'Invoice Items must exactly copy the source Billing Installment Items';
  end if;

  select
    count(*)::integer,
    coalesce(sum(allocated_before_vat), 0),
    coalesce(sum(allocated_vat), 0),
    coalesce(sum(allocated_total), 0)
  into v_allocation_count, v_before_vat, v_vat, v_total
  from public.finance_invoice_installment_allocations
  where invoice_id = v_invoice.id;

  if v_allocation_count <> 1
    or v_before_vat <> v_invoice.amount_before_vat
    or v_vat <> v_invoice.vat_amount
    or v_total <> v_invoice.total_amount
    or not exists (
      select 1
      from public.finance_invoice_installment_allocations as allocation
      where allocation.invoice_id = v_invoice.id
        and allocation.billing_installment_id = v_installment.id
        and allocation.allocated_before_vat = v_installment.amount_before_tax
        and allocation.allocated_vat = v_installment.vat_amount
        and allocation.allocated_total = v_installment.total_amount
    )
  then
    raise exception 'Phase 1 Invoice must allocate one complete Billing Installment';
  end if;

  if v_invoice.amount_before_vat <> v_installment.amount_before_tax
    or v_invoice.vat_amount <> v_installment.vat_amount
    or v_invoice.total_amount <> v_installment.total_amount
  then
    raise exception 'Invoice totals must exactly match the source Billing Installment';
  end if;
end;
$$;

create or replace function public.enforce_finance_invoice_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.validate_finance_invoice_integrity(old.id);
  else
    perform public.validate_finance_invoice_integrity(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.enforce_finance_invoice_child_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.validate_finance_invoice_integrity(new.invoice_id);
  elsif tg_op = 'UPDATE' then
    perform public.validate_finance_invoice_integrity(old.invoice_id);
    if new.invoice_id is distinct from old.invoice_id then
      perform public.validate_finance_invoice_integrity(new.invoice_id);
    end if;
  else
    perform public.validate_finance_invoice_integrity(old.invoice_id);
  end if;
  return null;
end;
$$;

create constraint trigger finance_invoice_integrity_after_header
after insert or update or delete on public.finance_invoices
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_integrity();

create constraint trigger finance_invoice_integrity_after_item
after insert or update or delete on public.finance_invoice_items
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_child_integrity();

create constraint trigger finance_invoice_integrity_after_allocation
after insert or update or delete on public.finance_invoice_installment_allocations
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_child_integrity();

-- Keep Quotation and Fee Agreement output unchanged while making Invoice honor its profile.
create or replace function public.generate_finance_document_no(
  p_doc_type text,
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_type text := lower(trim(coalesce(p_doc_type, '')));
  v_counter_type text;
  v_year integer := extract(year from p_issue_date)::integer;
  v_month integer;
  v_prefix_code text;
  v_prefix text;
  v_next integer;
  v_width integer := 4;
  v_period_scope text;
begin
  if v_input_type = '' then raise exception 'Document type is required'; end if;
  if p_issue_date is null then raise exception 'Document issue date is required'; end if;
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to allocate document number'; end if;

  if v_input_type in ('fee_agreement', 'invoice') then
    select display_prefix, period_scope, sequence_width
      into v_prefix_code, v_period_scope, v_width
    from public.document_numbering_profiles
    where document_type = v_input_type and is_active;
    if v_prefix_code is null then raise exception 'Document numbering profile is not active'; end if;
    v_counter_type := v_input_type;
    v_month := case when v_period_scope = 'annual' then null else extract(month from p_issue_date)::integer end;
    v_prefix := v_prefix_code || '-' || case
      when v_period_scope = 'annual' then to_char(p_issue_date, 'YYYY')
      else to_char(p_issue_date, 'YYYYMM')
    end || '-';
  else
    v_counter_type := upper(v_input_type);
    v_month := extract(month from p_issue_date)::integer;
    if v_counter_type = 'QT' then
      select nullif(trim(quotation_prefix), '') into v_prefix_code
      from public.finance_company_profiles where id = 'default';
      v_prefix_code := coalesce(v_prefix_code, 'VP-QT');
    else
      v_prefix_code := v_counter_type;
    end if;
    v_prefix := v_prefix_code || '-' || to_char(p_issue_date, 'YYYYMM') || '-';
  end if;

  insert into public.finance_document_counters (doc_type, year, month, prefix, last_no)
  values (v_counter_type, v_year, v_month, v_prefix, 1)
  on conflict (doc_type, year, (coalesce(month, 0))) do update set
    last_no = public.finance_document_counters.last_no + 1,
    prefix = excluded.prefix,
    updated_at = now()
  returning last_no into v_next;

  return v_prefix || lpad(v_next::text, v_width, '0');
end;
$$;

create or replace function public.create_finance_invoice_draft_from_installment(
  p_billing_installment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_items enable row level security;
alter table public.finance_invoice_installment_allocations enable row level security;
alter table public.finance_invoice_audit_events enable row level security;

create policy "finance managers select invoices"
on public.finance_invoices for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select invoice items"
on public.finance_invoice_items for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select invoice installment allocations"
on public.finance_invoice_installment_allocations for select
using (public.current_user_can_manage_finance_quotations());

create policy "finance managers select invoice audit events"
on public.finance_invoice_audit_events for select
using (public.current_user_can_manage_finance_quotations());

revoke all on table public.finance_invoices from public, anon, authenticated;
revoke all on table public.finance_invoice_items from public, anon, authenticated;
revoke all on table public.finance_invoice_installment_allocations from public, anon, authenticated;
revoke all on table public.finance_invoice_audit_events from public, anon, authenticated;
grant select on table public.finance_invoices to authenticated;
grant select on table public.finance_invoice_items to authenticated;
grant select on table public.finance_invoice_installment_allocations to authenticated;
grant select on table public.finance_invoice_audit_events to authenticated;

revoke all on function public.validate_finance_invoice_integrity(uuid) from public, anon, authenticated;
revoke all on function public.enforce_finance_invoice_integrity() from public, anon, authenticated;
revoke all on function public.enforce_finance_invoice_child_integrity() from public, anon, authenticated;
revoke all on function public.generate_finance_document_no(text, date) from public, anon, authenticated;
revoke all on function public.create_finance_invoice_draft_from_installment(uuid) from public, anon;
grant execute on function public.create_finance_invoice_draft_from_installment(uuid) to authenticated;

comment on table public.finance_invoices is
  'Phase 4A Invoice documents. Draft creation does not allocate a number, issue a document, or create downstream accounting records.';
comment on column public.finance_invoice_items.source_quantity is
  'Source Agreement quantity for lineage only; allocated Invoice amounts remain authoritative for Phase 1 installment billing.';
comment on column public.finance_invoice_items.source_unit_price is
  'Source Agreement unit price for lineage only; it is not independently multiplied to recalculate an installment allocation.';
comment on table public.finance_invoice_installment_allocations is
  'Future-safe source linkage. Phase 1 integrity requires exactly one full Billing Installment per active Invoice.';
