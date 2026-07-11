create table if not exists public.finance_company_profiles (
  id text primary key default 'default',
  company_name_th text not null,
  company_name_en text not null,
  tax_id text not null,
  branch_label text null,
  address_th text null,
  phone text null,
  email text null,
  website text null,
  description text null,
  quotation_prefix text not null default 'VP-QT',
  logo_storage_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null,
  updated_by_email text null,
  updated_by_name text null,
  constraint finance_company_profiles_singleton_check check (id = 'default')
);

create table if not exists public.finance_authorized_signers (
  id uuid primary key default gen_random_uuid(),
  signer_key text not null unique,
  display_name text not null,
  nickname text null,
  position_th text null,
  position_en text null,
  email text null,
  signature_storage_path text null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null,
  updated_by_email text null,
  updated_by_name text null
);

create unique index if not exists uq_finance_authorized_signers_active_default
on public.finance_authorized_signers ((true))
where is_active = true and is_default = true;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.finance_company_profiles enable row level security;
alter table public.finance_authorized_signers enable row level security;

drop policy if exists "finance quotation managers select company profile" on public.finance_company_profiles;
create policy "finance quotation managers select company profile"
on public.finance_company_profiles
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "admins insert company profile" on public.finance_company_profiles;
create policy "admins insert company profile"
on public.finance_company_profiles
for insert
with check (public.current_user_is_admin());

drop policy if exists "admins update company profile" on public.finance_company_profiles;
create policy "admins update company profile"
on public.finance_company_profiles
for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "finance quotation managers select authorized signers" on public.finance_authorized_signers;
create policy "finance quotation managers select authorized signers"
on public.finance_authorized_signers
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers insert authorized signers" on public.finance_authorized_signers;
create policy "finance quotation managers insert authorized signers"
on public.finance_authorized_signers
for insert
with check (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance quotation managers update authorized signers" on public.finance_authorized_signers;
create policy "finance quotation managers update authorized signers"
on public.finance_authorized_signers
for update
using (public.current_user_can_manage_finance_quotations())
with check (public.current_user_can_manage_finance_quotations());

insert into public.finance_company_profiles (
  id,
  company_name_th,
  company_name_en,
  tax_id,
  branch_label,
  address_th,
  phone,
  email,
  website,
  description,
  quotation_prefix
)
values (
  'default',
  'บริษัท วีพี พาร์ทเนอร์ จำกัด',
  'VP Partners Co., Ltd.',
  '0105559032840',
  'สำนักงานใหญ่',
  'เลขที่ 91/260 ถนนสุวินทวงศ์ แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',
  '06-6014-3225',
  'info@vplawyer.com',
  'vplawyer.com',
  'Professional Legal Services',
  'VP-QT'
)
on conflict (id) do nothing;

insert into public.finance_authorized_signers (
  signer_key,
  display_name,
  nickname,
  position_th,
  position_en,
  email,
  is_default,
  is_active,
  sort_order
)
values
  ('preecha', 'นายปรีชา ฤกษ์งาม', 'ทนายเป้า', 'หุ้นส่วนผู้จัดการ', 'Managing Partner', 'preecha@vplawyer.com', true, true, 1),
  ('korbtul', 'นายกอรปตุลย์ อินทรำพรรณ', 'ทนายตุลย์', 'หุ้นส่วน', 'Partner', 'korbtul@vppartnerslaw.com', false, true, 2)
on conflict (signer_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vp-document-assets',
  'vp-document-assets',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

drop policy if exists "finance document asset managers read" on storage.objects;
create policy "finance document asset managers read"
on storage.objects
for select
using (
  bucket_id = 'vp-document-assets'
  and public.current_user_can_manage_finance_quotations()
);

drop policy if exists "finance document asset managers insert" on storage.objects;
create policy "finance document asset managers insert"
on storage.objects
for insert
with check (
  bucket_id = 'vp-document-assets'
  and (
    (
      name like 'company/logo/%'
      and public.current_user_is_admin()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
    ) or
    (
      name like 'signers/%'
      and public.current_user_can_manage_finance_quotations()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp')
    )
  )
);

drop policy if exists "finance document asset managers update" on storage.objects;
create policy "finance document asset managers update"
on storage.objects
for update
using (
  bucket_id = 'vp-document-assets'
  and (
    (
      name like 'company/logo/%'
      and public.current_user_is_admin()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
    ) or
    (
      name like 'signers/%'
      and public.current_user_can_manage_finance_quotations()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp')
    )
  )
)
with check (
  bucket_id = 'vp-document-assets'
  and (
    (
      name like 'company/logo/%'
      and public.current_user_is_admin()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
    ) or
    (
      name like 'signers/%'
      and public.current_user_can_manage_finance_quotations()
      and lower(coalesce(metadata->>'mimetype', '')) in ('image/png', 'image/jpeg', 'image/webp')
    )
  )
);

drop policy if exists "finance document asset managers delete" on storage.objects;
create policy "finance document asset managers delete"
on storage.objects
for delete
using (
  bucket_id = 'vp-document-assets'
  and (
    (name like 'company/logo/%' and public.current_user_is_admin()) or
    (name like 'signers/%' and public.current_user_can_manage_finance_quotations())
  )
);

create or replace function public.set_finance_authorized_signer_default(
  p_signer_id uuid,
  p_updated_by_user_id uuid default null,
  p_updated_by_email text default null,
  p_updated_by_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signer_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update authorized signer default';
  end if;

  select id
    into v_signer_id
  from public.finance_authorized_signers
  where id = p_signer_id
    and is_active = true
  for update;

  if v_signer_id is null then
    raise exception 'Active signer not found';
  end if;

  lock table public.finance_authorized_signers in row exclusive mode;

  update public.finance_authorized_signers
  set
    is_default = false,
    updated_at = now(),
    updated_by_user_id = coalesce(p_updated_by_user_id, auth.uid()),
    updated_by_email = p_updated_by_email,
    updated_by_name = p_updated_by_name
  where is_default = true
    and id <> v_signer_id;

  update public.finance_authorized_signers
  set
    is_default = true,
    updated_at = now(),
    updated_by_user_id = coalesce(p_updated_by_user_id, auth.uid()),
    updated_by_email = p_updated_by_email,
    updated_by_name = p_updated_by_name
  where id = v_signer_id;

  return v_signer_id;
end;
$$;

grant execute on function public.set_finance_authorized_signer_default(uuid, uuid, text, text) to authenticated;

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
  v_prefix_code text;
  v_prefix text;
  v_next integer;
begin
  if v_doc_type = '' then
    raise exception 'Document type is required';
  end if;

  if v_doc_type = 'QT' then
    select nullif(trim(quotation_prefix), '')
      into v_prefix_code
    from public.finance_company_profiles
    where id = 'default';

    v_prefix_code := coalesce(v_prefix_code, 'VP-QT');
  else
    v_prefix_code := v_doc_type;
  end if;

  v_prefix := v_prefix_code || '-' || to_char(p_issue_date, 'YYYYMM') || '-';

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
