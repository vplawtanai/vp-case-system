-- Phase 8A.1. Verified Production source: 2026-09-26T14:43:37.87954+00:00.
-- No backfill, renumbering, profile changes, child-policy or Finance changes.
-- The original two counter algorithms/formats are preserved. Allocation is now
-- internal to a caller-authorized create transaction. Run manually, once.
begin;
set local lock_timeout = '10s';

-- Freeze only the four affected data tables while checking migration preservation.
-- Advanced live counters are allowed; compare before/after, never reset to 52/12.
lock table public.file_no_counters, public.advisory_matter_counters,
  public.cases, public.advisory_matters in share row exclusive mode;

do $guard$
begin
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where p.polrelid = 'public.cases'::regclass
      and p.polname = 'cases_insert_policy' and p.polcmd = 'a'
      and p.polpermissive and c.relrowsecurity
      and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polwithcheck, p.polrelid) in
        ('can_write_case_data()', 'public.can_write_case_data()')
  ) or exists (
    select 1 from pg_policy p where p.polrelid = 'public.cases'::regclass
      and p.polpermissive and p.polcmd in ('a', '*')
      and p.polname <> 'cases_insert_policy'
  ) then
    raise exception '072_CASE_INSERT_BASELINE_MISMATCH';
  end if;
  if not exists (
    select 1 from pg_policy p where p.polrelid = 'public.cases'::regclass
      and p.polcmd = 'w'
      and pg_get_expr(p.polqual, p.polrelid) in
        ('can_write_case_data()', 'public.can_write_case_data()')
      and pg_get_expr(p.polwithcheck, p.polrelid) in
        ('can_write_case_data()', 'public.can_write_case_data()')
  ) then
    raise exception '072_CASE_UPDATE_BASELINE_MISMATCH';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.advisory_matters'::regclass
    and polcmd in ('a', '*')) then
    raise exception '072_ADVISORY_INSERT_POLICY_MISSING';
  end if;
end;
$guard$;

-- Transaction-local evidence, not a permanent audit/business record.
create temporary table vp072_before on commit drop as
select
  (select jsonb_build_object('count', count(*), 'hash', md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')))
    from public.cases t) as case_rows,
  (select jsonb_build_object('count', count(*), 'hash', md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')))
    from public.advisory_matters t) as advisory_rows,
  (select coalesce(jsonb_agg(to_jsonb(t) order by year), '[]') from public.file_no_counters t) as case_counters,
  (select coalesce(jsonb_agg(to_jsonb(t) order by year), '[]') from public.advisory_matter_counters t) as advisory_counters,
  (select coalesce(jsonb_agg(to_jsonb(p) order by p.oid), '[]') from pg_policy p
    where p.polrelid in ('public.cases'::regclass, 'public.advisory_matters'::regclass)
      and not (p.polrelid = 'public.cases'::regclass and p.polname = 'cases_insert_policy')) as preserved_policies,
  (select to_jsonb(p) from pg_proc p where oid = 'public.can_write_case_data()'::regprocedure) as write_helper,
  (select jsonb_agg(jsonb_build_object('oid', oid, 'owner', relowner,
      'rls', relrowsecurity, 'force_rls', relforcerowsecurity) order by oid)
    from pg_class where oid in ('public.cases'::regclass, 'public.advisory_matters'::regclass,
      'public.file_no_counters'::regclass, 'public.advisory_matter_counters'::regclass)) as table_security;

create function public.can_create_case()
returns boolean language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.active = true
      and up.role in ('admin', 'partner', 'lawyer')
  );
$function$;

create function public.can_create_advisory_matter()
returns boolean language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from public.user_profiles up
    where up.id = auth.uid() and up.active = true
      and up.role in ('admin', 'partner', 'lawyer', 'assistant_lawyer')
  );
$function$;

-- Only top-level Case INSERT changes. can_write_case_data, UPDATE, children and
-- every Advisory policy remain untouched.
alter policy cases_insert_policy on public.cases with check (public.can_create_case());

create or replace function public.generate_file_no()
returns text language plpgsql security definer set search_path = public
as $function$
declare
  current_year text;
  next_number int;
  new_file_no text;
begin
  if auth.uid() is null or public.can_create_case() is distinct from true then
    raise exception 'CASE_CREATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
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
returns text language plpgsql security definer set search_path = public
as $function$
declare
  current_year integer;
  next_number integer;
begin
  if auth.uid() is null or public.can_create_advisory_matter() is distinct from true then
    raise exception 'ADVISORY_CREATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
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

create function public.create_case_with_number(p_client_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  selected_client_name text := '';
  created_case public.cases%rowtype;
begin
  -- SECURITY DEFINER bypasses RLS, so explicitly authorize before any mutation.
  if auth.uid() is null or public.can_create_case() is distinct from true then
    raise exception 'CASE_CREATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_client_id is not null then
    select coalesce(c.name, '') into selected_client_name
    from public.clients c where c.id = p_client_id;
    if not found then
      raise exception 'CASE_CLIENT_NOT_FOUND' using errcode = '23503';
    end if;
  end if;
  -- Same initial fields/defaults as the existing Case create handler.
  insert into public.cases (
    file_no, client_id, title, client_name, court_name, case_number,
    phase, status, owner_name, physical_storage_type, physical_storage_detail,
    created_at, updated_at
  ) values (
    public.generate_file_no(), p_client_id, '', selected_client_name, '', '',
    'litigation', 'Active', '', 'Cabinet', '', now(), now()
  ) returning * into created_case;
  return jsonb_build_object('id', created_case.id, 'file_no', created_case.file_no);
end;
$function$;

create function public.create_advisory_matter_with_number(
  p_client_id uuid, p_title text, p_matter_type text, p_retainer_type text,
  p_status text, p_responsible_lawyer text, p_start_date date, p_end_date date,
  p_monthly_retainer_amount numeric, p_scope_of_work text, p_note text
)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  created_matter public.advisory_matters%rowtype;
begin
  if auth.uid() is null or public.can_create_advisory_matter() is distinct from true then
    raise exception 'ADVISORY_CREATE_PERMISSION_DENIED' using errcode = '42501';
  end if;
  -- Existing form's required fields. Retainer visibility/edit logic stays in its
  -- existing workflow; this RPC neither adds Finance privileges nor changes it.
  if p_client_id is null or nullif(btrim(p_title), '') is null
    or nullif(btrim(p_matter_type), '') is null then
    raise exception 'ADVISORY_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;
  insert into public.advisory_matters (
    client_id, matter_no, title, matter_type, retainer_type, status,
    responsible_lawyer, start_date, end_date, monthly_retainer_amount,
    scope_of_work, note
  ) values (
    p_client_id, public.generate_advisory_matter_no(), p_title, p_matter_type,
    p_retainer_type, p_status, p_responsible_lawyer, p_start_date, p_end_date,
    p_monthly_retainer_amount, p_scope_of_work, p_note
  ) returning * into created_matter;
  return to_jsonb(created_matter);
end;
$function$;

-- Explicit owner/ACL independent of Supabase default privileges. No standalone
-- allocator callers exist in the app/backend. Only the DB owner can execute them;
-- both also authorize auth.uid() in depth. The public business APIs are CREATE.
alter function public.can_create_case() owner to postgres;
alter function public.can_create_advisory_matter() owner to postgres;
alter function public.generate_file_no() owner to postgres;
alter function public.generate_advisory_matter_no() owner to postgres;
alter function public.create_case_with_number(uuid) owner to postgres;
alter function public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text) owner to postgres;
revoke all on function public.can_create_case(), public.can_create_advisory_matter(),
  public.generate_file_no(), public.generate_advisory_matter_no(),
  public.create_case_with_number(uuid),
  public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_create_case(), public.can_create_advisory_matter(),
  public.create_case_with_number(uuid),
  public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)
  to authenticated;

-- No app reads these tables. Remove all client table privileges, including
-- TRUNCATE; existing service_role administration and owner/RLS state are preserved.
revoke all on table public.file_no_counters, public.advisory_matter_counters
  from public, anon, authenticated;

-- Recompute preservation evidence without invoking any business/helper RPC.
create temporary table vp072_after on commit drop as
select
  (select jsonb_build_object('count', count(*), 'hash', md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')))
    from public.cases t) as case_rows,
  (select jsonb_build_object('count', count(*), 'hash', md5(coalesce(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text), '')))
    from public.advisory_matters t) as advisory_rows,
  (select coalesce(jsonb_agg(to_jsonb(t) order by year), '[]') from public.file_no_counters t) as case_counters,
  (select coalesce(jsonb_agg(to_jsonb(t) order by year), '[]') from public.advisory_matter_counters t) as advisory_counters,
  (select coalesce(jsonb_agg(to_jsonb(p) order by p.oid), '[]') from pg_policy p
    where p.polrelid in ('public.cases'::regclass, 'public.advisory_matters'::regclass)
      and not (p.polrelid = 'public.cases'::regclass and p.polname = 'cases_insert_policy')) as preserved_policies,
  (select to_jsonb(p) from pg_proc p where oid = 'public.can_write_case_data()'::regprocedure) as write_helper,
  (select jsonb_agg(jsonb_build_object('oid', oid, 'owner', relowner,
      'rls', relrowsecurity, 'force_rls', relforcerowsecurity) order by oid)
    from pg_class where oid in ('public.cases'::regclass, 'public.advisory_matters'::regclass,
      'public.file_no_counters'::regclass, 'public.advisory_matter_counters'::regclass)) as table_security;

-- Session-temporary output survives COMMIT so the final statement is SELECT-only.
-- Nothing is stored in public or any business/audit table.
create temporary table vp072_verification on commit preserve rows as
with expected(signature, result_type, volatility, client_execute) as (values
  ('public.can_create_case()', 'boolean', 's', true),
  ('public.can_create_advisory_matter()', 'boolean', 's', true),
  ('public.generate_file_no()', 'text', 'v', false),
  ('public.generate_advisory_matter_no()', 'text', 'v', false),
  ('public.create_case_with_number(uuid)', 'jsonb', 'v', true),
  ('public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)', 'jsonb', 'v', true)
), checks(name, pass) as (
  select 'functions_security_contract', count(p.oid) = 6 and bool_and(
    p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig = array['search_path=public']
    and p.provolatile::text = e.volatility and p.prorettype = e.result_type::regtype
    and has_function_privilege('authenticated', p.oid, 'EXECUTE') = e.client_execute
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  from expected e left join pg_proc p on p.oid = to_regprocedure(e.signature)
  union all
  select 'case_insert_authorization', exists (select 1 from pg_policy p
    where p.polrelid = 'public.cases'::regclass and p.polname = 'cases_insert_policy'
      and p.polcmd = 'a' and p.polroles = array['authenticated'::regrole::oid]
      and pg_get_expr(p.polwithcheck, p.polrelid) in ('can_create_case()', 'public.can_create_case()'))
  union all
  select 'case_update_and_advisory_policies_preserved', b.preserved_policies = a.preserved_policies
    and b.write_helper = a.write_helper from vp072_before b cross join vp072_after a
  union all
  select 'table_ownership_and_rls_preserved', b.table_security = a.table_security
    from vp072_before b cross join vp072_after a
  union all
  select 'counter_client_access_removed', not exists (
    select 1 from pg_class c cross join (values ('anon'), ('authenticated')) r(role)
    where c.oid in ('public.file_no_counters'::regclass, 'public.advisory_matter_counters'::regclass)
    and (has_table_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      or exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x where x.grantee = 0)))
  union all
  select 'historical_rows_unchanged', b.case_rows = a.case_rows and b.advisory_rows = a.advisory_rows
    from vp072_before b cross join vp072_after a
  union all
  select 'counters_unchanged', b.case_counters = a.case_counters and b.advisory_counters = a.advisory_counters
    from vp072_before b cross join vp072_after a
)
select jsonb_build_object(
  'migration', '072', 'gate_pass', bool_and(pass is true),
  'failed_checks', coalesce(jsonb_agg(name order by name) filter (where pass is distinct from true), '[]'),
  'checks', jsonb_object_agg(name, pass),
  'audit_reference_2026', jsonb_build_object('case', 52, 'advisory', 12),
  'case_counters_before', (select case_counters from vp072_before),
  'case_counters_after', (select case_counters from vp072_after),
  'advisory_counters_before', (select advisory_counters from vp072_before),
  'advisory_counters_after', (select advisory_counters from vp072_after),
  'case_rows_before_after', (select case_rows from vp072_after),
  'advisory_rows_before_after', (select advisory_rows from vp072_after)
) as result from checks;

-- Any failed/null check aborts all DDL/ACL changes before commit.
do $verify$
begin
  if (select result->>'gate_pass' from vp072_verification) is distinct from 'true' then
    raise exception '072_VERIFICATION_FAILED: %', (select result->'failed_checks' from vp072_verification);
  end if;
end;
$verify$;
notify pgrst, 'reload schema';
commit;

-- SELECT-only result: no create call and no number consumption.
select result as verification from pg_temp.vp072_verification;
