-- Central, reusable drafting patterns for Quotation service wording.
-- No substantive wording is seeded; approved users build the library explicitly.

create table if not exists public.finance_quotation_service_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern_code text not null,
  display_name text not null,
  category text null,
  short_description text null,
  scope_text text null,
  included_services_text text null,
  excluded_services_text text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_by_email text null,
  created_by_name text null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_email text null,
  updated_by_name text null,
  constraint finance_quotation_service_patterns_code_check
    check (pattern_code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint finance_quotation_service_patterns_display_name_check
    check (nullif(btrim(display_name), '') is not null),
  constraint finance_quotation_service_patterns_sort_order_check
    check (sort_order >= 0),
  constraint finance_quotation_service_patterns_wording_check check (
    nullif(btrim(coalesce(scope_text, '')), '') is not null
    or nullif(btrim(coalesce(included_services_text, '')), '') is not null
    or nullif(btrim(coalesce(excluded_services_text, '')), '') is not null
  )
);

create unique index if not exists uq_finance_quotation_service_patterns_code
  on public.finance_quotation_service_patterns (lower(pattern_code));

create index if not exists idx_finance_quotation_service_patterns_active_order
  on public.finance_quotation_service_patterns (is_active, sort_order, display_name);

alter table public.finance_quotation_service_patterns enable row level security;

drop policy if exists "finance quotation managers select service patterns"
  on public.finance_quotation_service_patterns;
create policy "finance quotation managers select service patterns"
on public.finance_quotation_service_patterns
for select
using (public.current_user_can_manage_finance_quotations());

revoke all on table public.finance_quotation_service_patterns from public, anon, authenticated;
grant select on table public.finance_quotation_service_patterns to authenticated;

create or replace function public.save_finance_quotation_service_pattern(
  p_pattern_id uuid,
  p_pattern_code text,
  p_display_name text,
  p_category text,
  p_short_description text,
  p_scope_text text,
  p_included_services_text text,
  p_excluded_services_text text,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern_id uuid;
  v_pattern_code text := upper(btrim(coalesce(p_pattern_code, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_scope_text text := nullif(btrim(coalesce(p_scope_text, '')), '');
  v_included_services_text text := nullif(btrim(coalesce(p_included_services_text, '')), '');
  v_excluded_services_text text := nullif(btrim(coalesce(p_excluded_services_text, '')), '');
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to manage quotation service patterns';
  end if;

  if v_pattern_code = '' or v_pattern_code !~ '^[A-Z0-9][A-Z0-9_-]*$' then
    raise exception 'Pattern code must use A-Z, 0-9, underscore, or hyphen';
  end if;
  if v_display_name is null then
    raise exception 'Pattern display name is required';
  end if;
  if v_scope_text is null and v_included_services_text is null and v_excluded_services_text is null then
    raise exception 'At least one service wording field is required';
  end if;
  if coalesce(p_sort_order, 0) < 0 then
    raise exception 'Sort order cannot be negative';
  end if;

  select
    auth_user.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), auth_user.email, auth.uid()::text)
  into v_actor_email, v_actor_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.id = auth.uid();

  if p_pattern_id is null then
    insert into public.finance_quotation_service_patterns (
      pattern_code,
      display_name,
      category,
      short_description,
      scope_text,
      included_services_text,
      excluded_services_text,
      is_active,
      sort_order,
      created_by_user_id,
      created_by_email,
      created_by_name,
      updated_by_user_id,
      updated_by_email,
      updated_by_name
    ) values (
      v_pattern_code,
      v_display_name,
      nullif(btrim(coalesce(p_category, '')), ''),
      nullif(btrim(coalesce(p_short_description, '')), ''),
      v_scope_text,
      v_included_services_text,
      v_excluded_services_text,
      true,
      coalesce(p_sort_order, 0),
      auth.uid(),
      v_actor_email,
      v_actor_name,
      auth.uid(),
      v_actor_email,
      v_actor_name
    )
    returning id into v_pattern_id;
  else
    select pattern.id
    into v_pattern_id
    from public.finance_quotation_service_patterns pattern
    where pattern.id = p_pattern_id
    for update;

    if v_pattern_id is null then
      raise exception 'Quotation service pattern not found';
    end if;

    update public.finance_quotation_service_patterns pattern
    set
      pattern_code = v_pattern_code,
      display_name = v_display_name,
      category = nullif(btrim(coalesce(p_category, '')), ''),
      short_description = nullif(btrim(coalesce(p_short_description, '')), ''),
      scope_text = v_scope_text,
      included_services_text = v_included_services_text,
      excluded_services_text = v_excluded_services_text,
      sort_order = coalesce(p_sort_order, 0),
      updated_at = now(),
      updated_by_user_id = auth.uid(),
      updated_by_email = v_actor_email,
      updated_by_name = v_actor_name
    where pattern.id = v_pattern_id;
  end if;

  return v_pattern_id;
end;
$$;

create or replace function public.set_finance_quotation_service_pattern_active(
  p_pattern_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern_id uuid;
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to manage quotation service patterns';
  end if;

  select pattern.id
  into v_pattern_id
  from public.finance_quotation_service_patterns pattern
  where pattern.id = p_pattern_id
  for update;

  if v_pattern_id is null then
    raise exception 'Quotation service pattern not found';
  end if;

  select
    auth_user.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), auth_user.email, auth.uid()::text)
  into v_actor_email, v_actor_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.id = auth.uid();

  update public.finance_quotation_service_patterns pattern
  set
    is_active = coalesce(p_is_active, false),
    updated_at = now(),
    updated_by_user_id = auth.uid(),
    updated_by_email = v_actor_email,
    updated_by_name = v_actor_name
  where pattern.id = v_pattern_id;

  return v_pattern_id;
end;
$$;

revoke all on function public.save_finance_quotation_service_pattern(uuid,text,text,text,text,text,text,text,integer)
  from public, anon;
revoke all on function public.set_finance_quotation_service_pattern_active(uuid,boolean)
  from public, anon;
grant execute on function public.save_finance_quotation_service_pattern(uuid,text,text,text,text,text,text,text,integer)
  to authenticated;
grant execute on function public.set_finance_quotation_service_pattern_active(uuid,boolean)
  to authenticated;
