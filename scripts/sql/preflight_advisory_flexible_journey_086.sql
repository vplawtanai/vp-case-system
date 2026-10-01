-- 086 STATIC SELECT-ONLY Preflight. No business/helper RPC execution.
WITH old_state as (WITH structure AS (WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
catalog AS (
 SELECT t.relname name,jsonb_build_object(
  'schema',t.nspname,'kind',t.relkind,'owner',pg_get_userbyid(t.relowner),
  'rls_enabled',t.relrowsecurity,'rls_forced',t.relforcerowsecurity,'acl',t.relacl::text,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,
    'acl',a.attacl::text) ORDER BY a.attnum),'[]') FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'validated',c.convalidated,
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname COLLATE "C"),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C"),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f' AND c.conrelid NOT IN (select c2.oid from pg_class c2 join pg_namespace n2 on n2.oid=c2.relnamespace where n2.nspname='public' and c2.relname in ('advisory_journey_variants','advisory_journey_versions','advisory_journey_snapshots','advisory_journey_requests'))),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text COLLATE "C"),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname COLLATE "C"),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname COLLATE "C"),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section','advisory_workflow_checks','advisory_overdue_work')))
 select jsonb_build_object('catalog',
 (select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs','advisory_matter_counters','advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'contract',jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by (x->>'name') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by (x->>'definition') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues'))))), rows AS (with raw(name,j) as (select 'advisory_matters',to_jsonb(t) from public.advisory_matters t union all select 'advisory_issues',to_jsonb(t) from public.advisory_issues t union all select 'advisory_issue_tasks',to_jsonb(t) from public.advisory_issue_tasks t union all select 'advisory_advice_records',to_jsonb(t) from public.advisory_advice_records t union all select 'advisory_time_logs',to_jsonb(t) from public.advisory_time_logs t union all select 'advisory_matter_counters',to_jsonb(t) from public.advisory_matter_counters t union all select 'advisory_matter_control',to_jsonb(t) from public.advisory_matter_control t union all select 'advisory_matter_team',to_jsonb(t) from public.advisory_matter_team t union all select 'advisory_matter_stages',to_jsonb(t) from public.advisory_matter_stages t union all select 'advisory_stage_visits',to_jsonb(t) from public.advisory_stage_visits t union all select 'advisory_work_state_events',to_jsonb(t) from public.advisory_work_state_events t union all select 'advisory_matter_activities',to_jsonb(t) from public.advisory_matter_activities t union all select 'advisory_deliverables',to_jsonb(t) from public.advisory_deliverables t union all select 'advisory_control_requests',to_jsonb(t) from public.advisory_control_requests t), scope(name) as (values ('advisory_matters'),('advisory_issues'),('advisory_issue_tasks'),('advisory_advice_records'),('advisory_time_logs'),('advisory_matter_counters'),('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests'))
 select jsonb_object_agg(name,evidence) from (select s.name,jsonb_build_object('count',count(j),'sha256',encode(sha256(convert_to(coalesce(string_agg(j::text,E'\n' order by j::text COLLATE "C"),''),'UTF8')),'hex')) evidence from scope s left join raw r using(name) group by s.name) fingerprints)
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state)), footprint as (WITH rels as (select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'advisory_journey_%' and c.relkind in ('r','p')),
 funcs as (select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'advisory086_%' or p.proname in ('advisory_journey_catalog','advisory_journey_manage')))
 select jsonb_build_object('tables',coalesce((select jsonb_object_agg(r.relname,jsonb_build_object('owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'acl',r.relacl::text,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true),'validated',convalidated) order by conname collate "C"),'[]') from pg_constraint where conrelid=r.oid and contype<>'n'),
 'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text collate "C"),'[]') from pg_index where indrelid=r.oid),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',(select jsonb_agg(rolname order by rolname collate "C") from pg_roles where oid=any(polroles)),'permissive',polpermissive,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname collate "C"),'[]') from pg_policy where polrelid=r.oid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(oid,true),'enabled',tgenabled) order by tgname collate "C"),'[]') from pg_trigger where tgrelid=r.oid and not tgisinternal))) from rels r),'{}'),
 'functions',coalesce((select jsonb_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'execute',(select jsonb_object_agg(role,has_function_privilege(role,p.oid,'EXECUTE')) from unnest(array['anon','authenticated','service_role']) role))) from funcs p),'{}'))), seeded as (WITH rels as (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('advisory_journey_variants','advisory_journey_versions','advisory_journey_snapshots','advisory_journey_requests') and c.relkind='r')
 select coalesce(jsonb_object_agg(relname,evidence::jsonb),'{}') from rels cross join lateral XMLTABLE('/table/row' PASSING query_to_xml(format('select coalesce(jsonb_agg(to_jsonb(t)-''created_at''-''captured_at''-''recorded_at'' order by (to_jsonb(t)-''created_at''-''captured_at''-''recorded_at'')::text collate "C"),''[]''::jsonb)::text evidence from public.%I t',relname),false,false,'') COLUMNS evidence text PATH 'evidence') x),
 checks as (select jsonb_build_object('owner',current_user='postgres','accepted_085_contract',encode(sha256(convert_to((s.state->'contract')::text,'UTF8')),'hex')='3f0a22461e57bfee0d4c91b91e26167553948836e078fd89b1cc3a3b2f39aa9f',
 'new_objects_exact',f.state='{"tables":{},"functions":{}}'::jsonb) value from old_state s,footprint f(state),seeded r(state)),
 failed as (select coalesce(jsonb_agg(key order by key collate "C"),'[]') value from checks,jsonb_each(checks.value) c(key,passed) where c.passed is distinct from 'true'::jsonb)
 select jsonb_build_object('gate_pass',failed.value='[]'::jsonb,'failed_checks',failed.value,'checks',checks.value,
 'candidate_sha256','71d07c7b59f86f8cc007f40b434d4b09b4980a9e507da23c2d4db3dc7c2f0dc7','accepted_085_sha256','db0870e52ecafaead843d30a3a5620091f7f5a1fdbfdd54a19330fac87bad0e7',
 'rows_sha256',encode(sha256(convert_to((s.state->'rows')::text,'UTF8')),'hex'),'catalog_sha256',encode(sha256(convert_to((s.state->'catalog')::text,'UTF8')),'hex'),'row_fingerprints',s.state->'rows',
 'object_differences',(select coalesce(jsonb_agg(jsonb_build_object('group',g,'object',k,'actual',f.state#>array[g,k],'expected',e#>array[g,k]) order by g collate "C",k collate "C"),'[]') from (select '{"tables":{},"functions":{}}'::jsonb e) expected, lateral(select unnest(array['tables','functions']) g) groups,lateral(select jsonb_object_keys(coalesce(e->g,'{}')||coalesce(f.state->g,'{}')) k) keys where e#>array[g,k] is distinct from f.state#>array[g,k]),
 'business_rpc_executed',false,'backfill',false,'broader_finance_differences_accepted',false) advisory086_preflight from old_state s,footprint f(state),checks,failed;
