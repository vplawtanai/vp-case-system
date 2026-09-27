-- 074 SELECT-only prerequisite evidence. No Production writes; review output before manual gate.
-- Existing ACLs/policies are preserved, not normalized against a synthetic fixture.
-- Office/Legacy current policy evidence must be reviewed; broader 490 differences remain OUTSIDE scope.
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
select jsonb_build_object('candidate_sha256','f4425d58a006b3e10328855f4d75aab8a2f013df2243f4e3e14060c33996fef8','gate_pass',(select bool_and(ok) from checks),
 'failed_checks',(select coalesce(jsonb_agg(name),'[]') from checks where ok is not true),
 'functions',(select jsonb_agg(jsonb_build_object('name',name,'definition',pg_get_functiondef(oid),'owner',pg_get_userbyid(proowner),'acl',proacl,'config',proconfig,'security_definer',prosecdef) order by name) from fn),
 'tables',(select jsonb_agg(jsonb_build_object('name',name,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force_rls',relforcerowsecurity,'acl',relacl,
  'policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='public' and tablename=r.name),
  'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=r.oid and not t.tgisinternal)) order by name) from rel r),
 'scope','074 Admin authority only; no acceptance of broader catalog drift',
 'captured_at',statement_timestamp()) as preflight_074;
