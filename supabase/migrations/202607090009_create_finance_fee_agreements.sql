-- Phase 3B: additive Fee Agreement foundation. No legacy finance data is migrated.
create table if not exists public.finance_fee_agreements (
  id uuid primary key default gen_random_uuid(),
  agreement_no text null,
  title text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  case_id bigint null references public.cases(id) on delete restrict,
  advisory_matter_id uuid null references public.advisory_matters(id) on delete restrict,
  source_type text not null,
  source_quotation_id uuid null references public.finance_quotations(id) on delete restrict,
  source_reference text null,
  status text not null default 'draft',
  effective_date date null,
  expiry_date date null,
  currency text not null default 'THB',
  amount_before_tax numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  billing_method text not null default 'single',
  allocation_method text null,
  allocation_base_policy text null default 'received_professional_fee_before_vat',
  allocation_snapshot_json jsonb null,
  commercial_terms_snapshot_json jsonb null,
  client_snapshot_json jsonb null,
  matter_snapshot_json jsonb null,
  company_snapshot_json jsonb null,
  source_document_snapshot_json jsonb null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_agreements_single_matter_check
    check (case_id is null or advisory_matter_id is null),
  constraint finance_fee_agreements_status_check
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  constraint finance_fee_agreements_source_type_check
    check (source_type in ('quotation', 'master_rate', 'retainer', 'manual', 'legacy')),
  constraint finance_fee_agreements_billing_method_check
    check (billing_method in ('single', 'installments', 'milestone', 'recurring', 'manual')),
  constraint finance_fee_agreements_amounts_non_negative_check
    check (amount_before_tax >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_fee_agreements_total_amount_check
    check (total_amount = amount_before_tax + vat_amount),
  constraint finance_fee_agreements_effective_expiry_check
    check (expiry_date is null or effective_date is null or expiry_date >= effective_date),
  constraint finance_fee_agreements_quotation_source_check
    check (
      (source_type = 'quotation' and source_quotation_id is not null)
      or (source_type <> 'quotation' and source_quotation_id is null)
    )
);

create table if not exists public.finance_fee_agreement_items (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete cascade,
  source_quotation_item_id uuid null references public.finance_quotation_items(id) on delete restrict,
  description text not null,
  quantity numeric(14, 4) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  amount_before_tax numeric(14, 2) not null default 0,
  vat_applicable boolean not null default false,
  vat_rate numeric(7, 4) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null default 0,
  tax_category text null,
  item_snapshot_json jsonb null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_agreement_items_description_check
    check (btrim(description) <> ''),
  constraint finance_fee_agreement_items_quantity_check
    check (quantity > 0),
  constraint finance_fee_agreement_items_unit_price_check
    check (unit_price >= 0),
  constraint finance_fee_agreement_items_amount_before_tax_check
    check (amount_before_tax >= 0),
  constraint finance_fee_agreement_items_vat_rate_check
    check (vat_rate >= 0),
  constraint finance_fee_agreement_items_vat_amount_check
    check (vat_amount >= 0),
  constraint finance_fee_agreement_items_line_total_check
    check (line_total >= 0),
  constraint finance_fee_agreement_items_sort_order_check
    check (sort_order >= 0),
  constraint finance_fee_agreement_items_non_vat_amount_check
    check (vat_applicable or vat_amount = 0),
  constraint finance_fee_agreement_items_line_total_consistency_check
    check (line_total = amount_before_tax + vat_amount)
);

create unique index if not exists uq_finance_fee_agreements_active_quotation_source
on public.finance_fee_agreements (source_quotation_id)
where source_type = 'quotation'
  and source_quotation_id is not null
  and status <> 'cancelled';

create index if not exists idx_finance_fee_agreements_client_id
on public.finance_fee_agreements (client_id);

create index if not exists idx_finance_fee_agreements_case_id
on public.finance_fee_agreements (case_id)
where case_id is not null;

create index if not exists idx_finance_fee_agreements_advisory_matter_id
on public.finance_fee_agreements (advisory_matter_id)
where advisory_matter_id is not null;

create index if not exists idx_finance_fee_agreements_status
on public.finance_fee_agreements (status);

create index if not exists idx_finance_fee_agreements_source_type
on public.finance_fee_agreements (source_type);

create index if not exists idx_finance_fee_agreements_source_quotation_id
on public.finance_fee_agreements (source_quotation_id)
where source_quotation_id is not null;

create index if not exists idx_finance_fee_agreements_effective_date
on public.finance_fee_agreements (effective_date);

create index if not exists idx_finance_fee_agreements_created_at
on public.finance_fee_agreements (created_at desc);

create index if not exists idx_finance_fee_agreement_items_fee_agreement_id
on public.finance_fee_agreement_items (fee_agreement_id);

create index if not exists idx_finance_fee_agreement_items_source_quotation_item_id
on public.finance_fee_agreement_items (source_quotation_item_id)
where source_quotation_item_id is not null;

create index if not exists idx_finance_fee_agreement_items_agreement_sort_order
on public.finance_fee_agreement_items (fee_agreement_id, sort_order);

create or replace function public.finance_fee_agreement_is_draft(
  p_fee_agreement_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_fee_agreements
    where id = p_fee_agreement_id
      and status = 'draft'
  );
$$;

revoke all on function public.finance_fee_agreement_is_draft(uuid) from public, anon, authenticated;
grant execute on function public.finance_fee_agreement_is_draft(uuid) to authenticated;

alter table public.finance_fee_agreements enable row level security;
alter table public.finance_fee_agreement_items enable row level security;

drop policy if exists "finance fee agreement managers select agreements" on public.finance_fee_agreements;
create policy "finance fee agreement managers select agreements"
on public.finance_fee_agreements
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance fee agreement managers insert draft agreements" on public.finance_fee_agreements;
create policy "finance fee agreement managers insert draft agreements"
on public.finance_fee_agreements
for insert
with check (
  public.current_user_can_manage_finance_quotations()
  and status = 'draft'
  and (created_by_user_id is null or created_by_user_id = auth.uid())
  and (updated_by_user_id is null or updated_by_user_id = auth.uid())
);

drop policy if exists "finance fee agreement managers update draft agreements" on public.finance_fee_agreements;
create policy "finance fee agreement managers update draft agreements"
on public.finance_fee_agreements
for update
using (
  public.current_user_can_manage_finance_quotations()
  and status = 'draft'
)
with check (
  public.current_user_can_manage_finance_quotations()
  and status = 'draft'
  and (updated_by_user_id is null or updated_by_user_id = auth.uid())
);

drop policy if exists "finance fee agreement managers select items" on public.finance_fee_agreement_items;
create policy "finance fee agreement managers select items"
on public.finance_fee_agreement_items
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance fee agreement managers insert draft items" on public.finance_fee_agreement_items;
create policy "finance fee agreement managers insert draft items"
on public.finance_fee_agreement_items
for insert
with check (
  public.current_user_can_manage_finance_quotations()
  and public.finance_fee_agreement_is_draft(fee_agreement_id)
);

drop policy if exists "finance fee agreement managers update draft items" on public.finance_fee_agreement_items;
create policy "finance fee agreement managers update draft items"
on public.finance_fee_agreement_items
for update
using (
  public.current_user_can_manage_finance_quotations()
  and public.finance_fee_agreement_is_draft(fee_agreement_id)
)
with check (
  public.current_user_can_manage_finance_quotations()
  and public.finance_fee_agreement_is_draft(fee_agreement_id)
);

drop policy if exists "finance fee agreement managers delete draft items" on public.finance_fee_agreement_items;
create policy "finance fee agreement managers delete draft items"
on public.finance_fee_agreement_items
for delete
using (
  public.current_user_can_manage_finance_quotations()
  and public.finance_fee_agreement_is_draft(fee_agreement_id)
);

-- This SECURITY DEFINER lifecycle RPC relies on the table owner's ordinary RLS bypass.
-- Reassess this function before enabling FORCE ROW LEVEL SECURITY on finance_fee_agreements.
create or replace function public.set_finance_fee_agreement_status(
  p_fee_agreement_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_next_status text := lower(btrim(coalesce(p_next_status, '')));
  v_item_count integer;
  v_amount_before_tax numeric(14, 2);
  v_vat_amount numeric(14, 2);
  v_total_amount numeric(14, 2);
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance fee agreement status';
  end if;

  select *
    into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;

  if not (
    (v_agreement.status = 'draft' and v_next_status in ('active', 'cancelled'))
    or (v_agreement.status = 'active' and v_next_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid finance fee agreement status transition';
  end if;

  if v_agreement.status = 'draft' and v_next_status = 'active' then
    select
      count(*)::integer,
      coalesce(sum(amount_before_tax), 0),
      coalesce(sum(vat_amount), 0),
      coalesce(sum(line_total), 0)
    into
      v_item_count,
      v_amount_before_tax,
      v_vat_amount,
      v_total_amount
    from public.finance_fee_agreement_items
    where fee_agreement_id = v_agreement.id;

    if v_item_count = 0 then
      raise exception 'A fee agreement requires at least one item before activation';
    end if;

    if v_amount_before_tax <> v_agreement.amount_before_tax
      or v_vat_amount <> v_agreement.vat_amount
      or v_total_amount <> v_agreement.total_amount then
      raise exception 'Fee agreement totals must match the agreement items before activation';
    end if;
  end if;

  update public.finance_fee_agreements
  set
    status = v_next_status,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_agreement.id;

  return v_agreement.id;
end;
$$;

revoke all on function public.set_finance_fee_agreement_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid, text) to authenticated;
