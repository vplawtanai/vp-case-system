create table if not exists public.finance_document_counters (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,
  year integer not null,
  month integer null,
  prefix text not null,
  last_no integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_finance_document_counters_period
on public.finance_document_counters (doc_type, year, coalesce(month, 0));

create table if not exists public.finance_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  client_id uuid not null,
  case_id bigint null,
  advisory_matter_id uuid null,
  issue_date date not null,
  valid_until date null,
  status text not null default 'draft',
  subtotal_vatable numeric(12, 2) not null default 0,
  subtotal_non_vatable numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  note text null,
  internal_note text null,
  created_by_user_id uuid null,
  created_by_email text null,
  created_by_name text null,
  updated_by_user_id uuid null,
  updated_by_email text null,
  updated_by_name text null,
  sent_at timestamptz null,
  sent_by_user_id uuid null,
  accepted_at timestamptz null,
  accepted_by_user_id uuid null,
  cancelled_at timestamptz null,
  cancelled_by_user_id uuid null,
  cancel_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_quotations_status_check check (status in ('draft', 'sent', 'accepted', 'cancelled')),
  constraint finance_quotations_single_matter_check check (case_id is null or advisory_matter_id is null)
);

create table if not exists public.finance_quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.finance_quotations(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  amount_before_tax numeric(12, 2) not null default 0,
  vat_applicable boolean not null default false,
  vat_rate numeric(5, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_quotation_items_quantity_check check (quantity > 0),
  constraint finance_quotation_items_unit_price_check check (unit_price >= 0)
);

create or replace function public.current_user_can_manage_finance_quotations()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'partner')
  );
$$;

create or replace function public.finance_quotation_is_draft(target_quotation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_quotations
    where id = target_quotation_id
      and status = 'draft'
  );
$$;

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
  v_doc_type text := coalesce(upper(trim(p_doc_type)), '');
  v_year integer := extract(year from p_issue_date)::integer;
  v_month integer := extract(month from p_issue_date)::integer;
  v_prefix text;
  v_next integer;
begin
  if v_doc_type = '' then
    raise exception 'Document type is required';
  end if;

  v_prefix := v_doc_type || '-' || to_char(p_issue_date, 'YYYYMM') || '-';

  insert into public.finance_document_counters (doc_type, year, month, prefix, last_no)
  values (v_doc_type, v_year, v_month, v_prefix, 1)
  on conflict (doc_type, year, (coalesce(month, 0)))
  do update set
    last_no = public.finance_document_counters.last_no + 1,
    prefix = excluded.prefix,
    updated_at = now()
  returning last_no into v_next;

  return v_prefix || lpad(v_next::text, 4, '0');
end;
$$;

alter table public.finance_document_counters enable row level security;
alter table public.finance_quotations enable row level security;
alter table public.finance_quotation_items enable row level security;

drop policy if exists "finance quotation managers select counters" on public.finance_document_counters;
create policy "finance quotation managers select counters"
on public.finance_document_counters
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers select quotations" on public.finance_quotations;
create policy "finance quotation managers select quotations"
on public.finance_quotations
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers insert quotations" on public.finance_quotations;
create policy "finance quotation managers insert quotations"
on public.finance_quotations
for insert
with check (
  public.current_user_can_manage_finance_quotations()
  and status = 'draft'
);

drop policy if exists "finance quotation managers update quotations" on public.finance_quotations;
create policy "finance quotation managers update quotations"
on public.finance_quotations
for update
using (public.current_user_can_manage_finance_quotations())
with check (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers select quotation items" on public.finance_quotation_items;
create policy "finance quotation managers select quotation items"
on public.finance_quotation_items
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers insert quotation items" on public.finance_quotation_items;
create policy "finance quotation managers insert quotation items"
on public.finance_quotation_items
for insert
with check (
  public.current_user_can_manage_finance_quotations()
  and public.finance_quotation_is_draft(quotation_id)
);

drop policy if exists "finance quotation managers update quotation items" on public.finance_quotation_items;
create policy "finance quotation managers update quotation items"
on public.finance_quotation_items
for update
using (
  public.current_user_can_manage_finance_quotations()
  and public.finance_quotation_is_draft(quotation_id)
)
with check (
  public.current_user_can_manage_finance_quotations()
  and public.finance_quotation_is_draft(quotation_id)
);

drop policy if exists "finance quotation managers delete draft quotation items" on public.finance_quotation_items;
create policy "finance quotation managers delete draft quotation items"
on public.finance_quotation_items
for delete
using (
  public.current_user_can_manage_finance_quotations()
  and public.finance_quotation_is_draft(quotation_id)
);
