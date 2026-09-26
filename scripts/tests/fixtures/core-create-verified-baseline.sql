-- LOCAL TEST FIXTURE ONLY. Never run against Production.
-- Generators, counter shapes and authorization below reproduce the user's
-- verified Production SELECT (2026-09-26T14:43:37.87954+00:00).
-- Business-table columns/defaults are a MINIMAL SYNTHETIC app-contract fixture,
-- not a claim to reproduce the entire Production schema/child/Finance catalog.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid;
$$;

create table public.user_profiles (
  id uuid primary key, role text, active boolean, staff_name text,
  financial_access boolean default false, finance_permissions jsonb default '{}'
);
create table public.clients (id uuid primary key, name text);
create table public.file_no_counters (year text primary key, last_number integer not null default 0);
create table public.advisory_matter_counters (
  year integer primary key, last_number integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.advisory_matter_counters enable row level security;
grant insert, select, update on public.file_no_counters, public.advisory_matter_counters
  to anon, authenticated, service_role;

create table public.cases (
  id bigserial primary key, file_no text unique not null,
  client_id uuid references public.clients(id), title text, client_name text,
  court_name text, case_number text, phase text, status text, owner_name text,
  physical_storage_type text, physical_storage_detail text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.advisory_matters (
  id uuid primary key default gen_random_uuid(), matter_no text unique not null,
  client_id uuid not null references public.clients(id), title text not null,
  matter_type text, retainer_type text, status text, responsible_lawyer text,
  start_date date, end_date date, monthly_retainer_amount numeric,
  scope_of_work text, note text, created_at timestamptz default now()
);
create function public.can_write_case_data()
returns boolean language sql security definer set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.active = true
      and up.role in ('admin','partner','lawyer','assistant_lawyer','staff')
  );
$function$;
alter table public.cases enable row level security;
create policy cases_select_policy on public.cases for select to authenticated using (true);
create policy cases_insert_policy on public.cases for insert to authenticated
  with check (public.can_write_case_data());
create policy cases_update_policy on public.cases for update to authenticated
  using (public.can_write_case_data()) with check (public.can_write_case_data());
alter table public.advisory_matters enable row level security;
create policy advisory_matters_select on public.advisory_matters for select to authenticated using (true);
create policy advisory_matters_insert on public.advisory_matters for insert to authenticated with check (
  exists (select 1 from public.user_profiles up where up.id = auth.uid()
    and up.active = true and up.role = any (array['admin','partner','lawyer','assistant_lawyer']))
);
create policy advisory_matters_update on public.advisory_matters for update to authenticated using (
  exists (select 1 from public.user_profiles up where up.id = auth.uid()
    and up.active = true and up.role = any (array['admin','partner','lawyer','assistant_lawyer']))
);
grant select on public.clients, public.user_profiles to authenticated;
grant select, insert, update on public.cases, public.advisory_matters to authenticated;
grant usage on sequence public.cases_id_seq to authenticated;

create or replace function public.generate_file_no()
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare
  current_year text;
  next_number int;
  new_file_no text;
begin
  current_year := extract(year from now())::text;
  loop
    update public.file_no_counters
    set last_number = last_number + 1
    where year = current_year
    returning last_number into next_number;
    if found then
      exit;
    end if;
    begin
      insert into public.file_no_counters(year, last_number)
      values (current_year, 1)
      returning last_number into next_number;
      exit;
    exception when unique_violation then
    end;
  end loop;
  new_file_no :=
    'VP-' || current_year || '-' || lpad(next_number::text, 3, '0');
  return new_file_no;
end;
$function$;
create or replace function public.generate_advisory_matter_no()
returns text language plpgsql security definer set search_path to 'public'
as $function$
declare
  current_year integer;
  next_number integer;
begin
  current_year := extract(year from now())::integer;
  insert into public.advisory_matter_counters
    (year, last_number, updated_at)
  values
    (current_year, 1, now())
  on conflict (year)
  do update
    set last_number =
      public.advisory_matter_counters.last_number + 1,
      updated_at = now()
  returning last_number into next_number;
  return
    'ADV-' ||
    current_year::text ||
    '-' ||
    lpad(next_number::text, 3, '0');
end;
$function$;
grant execute on function public.generate_file_no(), public.generate_advisory_matter_no()
  to postgres, anon, authenticated, service_role;

-- Synthetic child/Finance canaries: ensure 072 leaves existing policies,
-- functions, ACLs and rows alone. Actual app permission tests cover real UI rules.
create table public.case_tasks (id integer primary key, note text);
create table public.advisory_tasks (id integer primary key, note text);
create table public.finance_permission_canary (id integer primary key, amount numeric);
alter table public.case_tasks enable row level security;
alter table public.advisory_tasks enable row level security;
alter table public.finance_permission_canary enable row level security;
create policy case_tasks_write on public.case_tasks to authenticated
  using (public.can_write_case_data()) with check (public.can_write_case_data());
create policy advisory_tasks_write on public.advisory_tasks to authenticated
  using (public.can_write_case_data()) with check (public.can_write_case_data());
create function public.finance_permission_canary_check() returns boolean
  language sql security definer set search_path=public as $$
  select exists(select 1 from public.user_profiles where id=auth.uid() and active and financial_access);
$$;
create policy finance_canary_policy on public.finance_permission_canary to authenticated
  using (public.finance_permission_canary_check());
grant select, insert, update on public.case_tasks, public.advisory_tasks to authenticated;
grant select on public.finance_permission_canary to authenticated;
insert into public.case_tasks values (1, 'unchanged case task');
insert into public.advisory_tasks values (1, 'unchanged advisory task');
insert into public.finance_permission_canary values (1, 10400);

insert into public.user_profiles(id,role,active,staff_name,financial_access) values
 ('00000000-0000-0000-0000-000000000001','admin',true,'Admin',true),
 ('00000000-0000-0000-0000-000000000002','partner',true,'Partner',true),
 ('00000000-0000-0000-0000-000000000003','lawyer',true,'Lawyer',false),
 ('00000000-0000-0000-0000-000000000004','assistant_lawyer',true,'แพม',false),
 ('00000000-0000-0000-0000-000000000005','staff',true,'Staff',true),
 ('00000000-0000-0000-0000-000000000006','viewer',true,'Viewer',true),
 ('00000000-0000-0000-0000-000000000007','admin',false,'Inactive admin',true),
 ('00000000-0000-0000-0000-000000000008','lawyer',true,'ทนายแพม',true);
insert into public.clients values ('10000000-0000-0000-0000-000000000001','Fixture client');
insert into public.file_no_counters values (extract(year from now())::text,52);
insert into public.advisory_matter_counters(year,last_number) values (extract(year from now())::int,12);
insert into public.cases(id,file_no,title) values (1,'VP-'||extract(year from now())::text||'-052','Historical Case');
select setval('public.cases_id_seq', 1);
insert into public.advisory_matters(id,matter_no,client_id,title,note) values
 ('20000000-0000-0000-0000-000000000001','ADV-'||extract(year from now())::text||'-012',
  '10000000-0000-0000-0000-000000000001','Historical Advisory','Keep existing text');

-- Supabase-like permissive creator defaults must NOT leak through new functions.
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
