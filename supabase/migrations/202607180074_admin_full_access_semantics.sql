-- Phase 8B.4: Admin role authority; explicit capabilities and non-Admin rules unchanged.
-- MANUAL PRODUCTION GATE ONLY. No profile/business DML. Existing retirement/lifecycle guards remain.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';

do $preflight$
declare failed jsonb;
begin
with expected(name,body) as (values
('current_user_is_admin','selectexists(select1frompublic.user_profileswhereid=auth.uid()androle=''admin'');'),
('current_user_is_admin_or_partner','selectexists(select1frompublic.user_profileswhereid=auth.uid()androlein(''admin'',''partner''));'),
('current_user_can_manage_finance_quotations','selectexists(select1frompublic.user_profileswhereid=auth.uid()androlein(''admin'',''partner''));'),
('current_user_can_approve_document_platform','selectexists(select1frompublic.user_profileswhereid=auth.uid()androlein(''admin'',''partner''));')
), fn as (
 select e.name,p.oid,p.proowner,p.proacl,p.prosrc,p.proconfig,p.prosecdef,p.provolatile,
  coalesce(p.prorettype='boolean'::regtype and l.lanname='sql' and p.prosecdef and p.provolatile='v'
   and p.proconfig=array['search_path=public']::text[] and pg_get_userbyid(p.proowner)='postgres'
   and regexp_replace(p.prosrc,'\s','','g')=e.body,false) valid
 from expected e left join pg_proc p on p.oid=to_regprocedure('public.'||e.name||'()') left join pg_language l on l.oid=p.prolang
), targets(name) as (values ('finance_company_ledger'),('finance_expense_claims'),('finance_compensation_batches'),('finance_compensation_allocations'),('finance_bank_accounts'),('office_work_logs')), rel as (
 select t.name,c.oid,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl,
 coalesce(c.relkind='r' and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres'
   and not exists(select 1 from pg_policy p where p.polrelid=c.oid and not p.polpermissive),false) valid
 from targets t left join pg_class c on c.oid=to_regclass('public.'||t.name)
), checks(name,ok) as (
 select 'helpers_match_known_repository_bodies_security',bool_and(valid) from fn
 union all select 'target_tables_rls_no_restrictive_conflict',bool_and(valid) from rel
 union all select '073_active_admin_helper_exact',exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang
   where p.oid=to_regprocedure('public.people_is_active_admin()') and p.prosecdef and l.lanname='sql' and p.provolatile='s'
    and p.prorettype='boolean'::regtype and p.proconfig=array['search_path=public']::text[] and pg_get_userbyid(p.proowner)='postgres'
    and regexp_replace(p.prosrc,'\s','','g')='selectexists(select1frompublic.user_profileswhereid=auth.uid()andactiveistrueandrole=''admin'');'
    and has_function_privilege('authenticated',p.oid,'execute'))
 union all select 'targets_absent',not exists(select 1 from pg_policy where polname like 'admin074_%')
   and to_regprocedure('public.admin074_session_allowed()') is null
 union all select 'profile_contract',count(*)=2 from pg_attribute where attrelid=to_regclass('public.user_profiles')
   and ((attname='active' and atttypid='boolean'::regtype) or (attname='role' and atttypid='text'::regtype)) and not attisdropped
)
 select coalesce(jsonb_agg(name),'[]') into failed from checks where ok is not true;
 if failed<>'[]' then raise exception '074 prerequisite mismatch: %',failed; end if;
end;
$preflight$;

-- Freeze current security and rows in this transaction; do not learn/replace old policies.
create function pg_temp.admin074_snapshot() returns jsonb language plpgsql as $snapshot$
declare r record; rows jsonb:='{}'; n bigint; h text;
begin
 for r in select c.oid::regclass rel,ns.nspname||'.'||c.relname name from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
  where c.relkind in ('r','p') and (ns.nspname='public' or (ns.nspname='auth' and c.relname='users')) order by c.oid
 loop
  execute format('select count(*),md5(coalesce(string_agg(v,E''\n'' order by v),'''')) from (select to_jsonb(t)::text v from %s t) s',r.rel) into n,h;
  rows:=rows||jsonb_build_object(r.name,jsonb_build_object('count',n,'hash',h));
 end loop;
 return jsonb_build_object('rows',rows,
  'functions',(select coalesce(jsonb_object_agg(p.oid::regprocedure::text,
    to_jsonb(p)-'prosrc'-'prosqlbody' || case when p.proname=any(array['current_user_is_admin','current_user_is_admin_or_partner','current_user_can_manage_finance_quotations','current_user_can_approve_document_platform']) then '{}'::jsonb
    else jsonb_build_object('definition',pg_get_functiondef(p.oid)) end),'{}') from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname<>'admin074_session_allowed'),
  'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by p.oid),'[]') from pg_policy p where p.polname not like 'admin074_%'),
  'relations',(select coalesce(jsonb_agg(to_jsonb(c) order by c.oid),'[]') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p')),
  'triggers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.oid),'[]') from pg_trigger t where not t.tgisinternal));
end;
$snapshot$;
-- Row snapshots must not race concurrent business writes during manual DDL.
do $locks$ declare r record; begin
 for r in select c.oid::regclass rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and (n.nspname='public' or (n.nspname='auth' and c.relname='users')) order by c.oid
 loop execute format('lock table %s in share mode',r.rel); end loop;
end; $locks$;
create temp table admin074_before on commit drop as select pg_temp.admin074_snapshot() snapshot;

-- CREATE OR REPLACE preserves the existing owner/ACL/volatility. No new RPC grant.
create or replace function public.current_user_is_admin() returns boolean language sql security definer set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin' and active is true);
$fn$;

-- CREATE OR REPLACE preserves the existing owner/ACL/volatility. No new RPC grant.
create or replace function public.current_user_is_admin_or_partner() returns boolean language sql security definer set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role in ('admin','partner') and (role<>'admin' or active is true));
$fn$;

-- CREATE OR REPLACE preserves the existing owner/ACL/volatility. No new RPC grant.
create or replace function public.current_user_can_manage_finance_quotations() returns boolean language sql security definer set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role in ('admin','partner') and (role<>'admin' or active is true));
$fn$;

-- CREATE OR REPLACE preserves the existing owner/ACL/volatility. No new RPC grant.
create or replace function public.current_user_can_approve_document_platform() returns boolean language sql security definer set search_path=public as $fn$
 select exists(select 1 from public.user_profiles where id=auth.uid() and role in ('admin','partner') and (role<>'admin' or active is true));
$fn$;

-- Only an INACTIVE Admin is restricted; preserve every non-Admin rule, including
-- historical Partner behavior. Definer prevents profile RLS from concealing inactivity.
create function public.admin074_session_allowed() returns boolean language sql stable security definer set search_path=public as $fn$
 select not exists(select 1 from public.user_profiles where id=auth.uid() and role='admin' and active is not true);
$fn$;
alter function public.admin074_session_allowed() owner to postgres;
revoke all on function public.admin074_session_allowed() from public,anon,authenticated,service_role;
grant execute on function public.admin074_session_allowed() to authenticated,service_role;

-- Preserve every existing finance_company_ledger policy and table grant. No new unsupported operation.
create policy admin074_select on public.finance_company_ledger for select to authenticated using (public.people_is_active_admin());
create policy admin074_insert on public.finance_company_ledger for insert to authenticated with check (public.people_is_active_admin());
create policy admin074_update on public.finance_company_ledger for update to authenticated using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy admin074_active_ceiling on public.finance_company_ledger as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

-- Preserve every existing finance_expense_claims policy and table grant. No new unsupported operation.
create policy admin074_select on public.finance_expense_claims for select to authenticated using (public.people_is_active_admin());
create policy admin074_insert on public.finance_expense_claims for insert to authenticated with check (public.people_is_active_admin());
create policy admin074_update on public.finance_expense_claims for update to authenticated using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy admin074_active_ceiling on public.finance_expense_claims as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

-- Preserve every existing finance_compensation_batches policy and table grant. No new unsupported operation.
create policy admin074_select on public.finance_compensation_batches for select to authenticated using (public.people_is_active_admin());
create policy admin074_insert on public.finance_compensation_batches for insert to authenticated with check (public.people_is_active_admin());
create policy admin074_update on public.finance_compensation_batches for update to authenticated using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy admin074_active_ceiling on public.finance_compensation_batches as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

-- Preserve every existing finance_compensation_allocations policy and table grant. No new unsupported operation.
create policy admin074_select on public.finance_compensation_allocations for select to authenticated using (public.people_is_active_admin());
create policy admin074_insert on public.finance_compensation_allocations for insert to authenticated with check (public.people_is_active_admin());
create policy admin074_update on public.finance_compensation_allocations for update to authenticated using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy admin074_delete on public.finance_compensation_allocations for delete to authenticated using (public.people_is_active_admin());
create policy admin074_active_ceiling on public.finance_compensation_allocations as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

-- Preserve every existing finance_bank_accounts policy and table grant. No new unsupported operation.
create policy admin074_select on public.finance_bank_accounts for select to authenticated using (public.people_is_active_admin());
create policy admin074_active_ceiling on public.finance_bank_accounts as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

-- Preserve every existing office_work_logs policy and table grant. No new unsupported operation.
create policy admin074_select on public.office_work_logs for select to authenticated using (public.people_is_active_admin());
create policy admin074_insert on public.office_work_logs for insert to authenticated with check (public.people_is_active_admin());
create policy admin074_update on public.office_work_logs for update to authenticated using (public.people_is_active_admin()) with check (public.people_is_active_admin());
create policy admin074_active_ceiling on public.office_work_logs as restrictive for all to authenticated
 using (public.admin074_session_allowed()) with check (public.admin074_session_allowed());

do $verify$
declare after_state jsonb:=pg_temp.admin074_snapshot();
begin
 if after_state is distinct from (select snapshot from admin074_before)
 then raise exception '074 changed protected rows, old policies, security, triggers or unrelated function metadata'; end if;
 if (select count(*) from pg_policy where polname like 'admin074_%')<>23
 then raise exception '074 policy contract mismatch'; end if;
 if has_function_privilege('anon','public.admin074_session_allowed()','execute')
   or not has_function_privilege('authenticated','public.admin074_session_allowed()','execute')
 then raise exception '074 helper security mismatch'; end if;
end;
$verify$;
select jsonb_build_object('gate_pass',true,'historical_rows_unchanged',true,'non_admin_policies_preserved',true,
 'existing_acl_preserved',true,'profile_flags_unchanged',true,'new_admin_policies',23) as migration_074_verifier;
commit;
