-- Phase 8C / 076 post-apply verifier. SELECT ONLY; no helper/numbering/write RPC.
-- Approved reviewed capture: 2026-09-27T10:30:22.906424+00:00. No identity or journey backfill.
-- Broader Finance differences are outside acceptance. No JSON/CSV transfer required.
WITH preserved AS (WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
 ('clients'), ('user_profiles'), ('case_audit_logs')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
raw(table_name,j) AS MATERIALIZED (
 SELECT 'advisory_matters',to_jsonb(t) FROM public.advisory_matters t UNION ALL
 SELECT 'advisory_issues',to_jsonb(t) FROM public.advisory_issues t UNION ALL
 SELECT 'advisory_issue_tasks',to_jsonb(t)-'assignee_user_id'-'stage_id' FROM public.advisory_issue_tasks t UNION ALL
 SELECT 'advisory_advice_records',to_jsonb(t) FROM public.advisory_advice_records t UNION ALL
 SELECT 'advisory_time_logs',to_jsonb(t)-'stage_id' FROM public.advisory_time_logs t UNION ALL
 SELECT 'advisory_matter_counters',to_jsonb(t) FROM public.advisory_matter_counters t UNION ALL
 SELECT 'clients',to_jsonb(t) FROM public.clients t UNION ALL
 SELECT 'user_profiles',to_jsonb(t) FROM public.user_profiles t UNION ALL
 SELECT 'case_audit_logs',to_jsonb(t) FROM public.case_audit_logs t
 WHERE t.table_name IN ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs')
),
rows AS MATERIALIZED (
 SELECT table_name,j,j->>'id' id,nullif(j->>'deleted_at','') IS NULL live FROM raw
),
fingerprints AS (
 SELECT s.name,count(r.j) row_count,
  encode(sha256(convert_to(coalesce(string_agg(r.j::text,E'\n' ORDER BY r.j::text),''),'UTF8')),'hex') rows_sha256
 FROM scope s LEFT JOIN rows r ON r.table_name=s.name GROUP BY s.name
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
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text,c.conname),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
),
function_roots(oid) AS (
 SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('create_advisory_matter_with_number','can_create_advisory_matter','generate_advisory_matter_no',
   'people_is_assignable','people_is_active_admin','admin074_session_allowed')
 UNION SELECT g.tgfoid FROM pg_trigger g JOIN relations t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal AND g.tgname NOT LIKE 'advisory076_%'
 UNION SELECT d.refobjid FROM pg_policy p JOIN relations t ON t.oid=p.polrelid
  JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
),
function_edges(parent,child) AS (
 SELECT p.oid,q.oid FROM pg_proc p JOIN pg_namespace pn ON pn.oid=p.pronamespace
 JOIN pg_proc q ON q.prokind='f' JOIN pg_namespace qn ON qn.oid=q.pronamespace
 WHERE p.prokind='f' AND pn.nspname IN ('public','auth') AND qn.nspname IN ('public','auth')
 AND q.proname ~ '^[a-zA-Z_][a-zA-Z_0-9]*$'
 AND p.prosrc ~ ('\m'||q.proname||'\M[[:space:]]*\(')
 UNION SELECT d.objid,d.refobjid FROM pg_depend d
 WHERE d.classid='pg_proc'::regclass AND d.refclassid='pg_proc'::regclass
),
function_walk(oid,path,depth) AS (
 SELECT oid,ARRAY[oid],0 FROM function_roots
 UNION ALL SELECT e.child,w.path||e.child,w.depth+1 FROM function_walk w
 JOIN function_edges e ON e.parent=w.oid WHERE w.depth<8 AND NOT e.child=ANY(w.path)
),
functions AS (
 SELECT p.oid,jsonb_build_object('signature',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'volatility',p.provolatile,
  'proconfig',p.proconfig,'acl',p.proacl::text,
  'effective_execute',(SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
   FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))) evidence
 FROM pg_proc p WHERE p.oid IN (SELECT oid FROM function_walk) AND p.prokind='f'
),
finance_relations AS (
 SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='advisory_matter_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND left(c.relname,8)='finance_'
),
finance_refs AS (
 SELECT f.relname,x.evidence::jsonb evidence FROM finance_relations f
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
  'SELECT jsonb_build_object(''count'',count(*),''orphan_matter_refs'',count(*) FILTER (WHERE NOT EXISTS
   (SELECT 1 FROM public.advisory_matters m WHERE m.id::text=t.advisory_matter_id::text)),
   ''rows_sha256'',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),''''),''UTF8'')),''hex''))::text evidence
   FROM %I.%I t WHERE t.advisory_matter_id IS NOT NULL',f.nspname,f.relname),false,false,'')
  COLUMNS evidence text PATH 'evidence') x
),
normalized_catalog as (select name,evidence || jsonb_build_object(
 'columns',(select jsonb_agg(case when name='advisory_issue_tasks' and x->>'name'='advisory_issue_id' then jsonb_set(x,'{not_null}','true') else x end order by n) from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where not (name='advisory_issue_tasks' and x->>'name' in ('assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id')),
 'constraints',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' not like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' not like '%INDEX advisory076_%'),
 'incoming_foreign_keys',(select coalesce(jsonb_agg(x order by x->>'table',x->>'name'),'[]') from jsonb_array_elements(evidence->'incoming_foreign_keys') x where x->>'table' not in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests') and x->>'name' not like 'advisory076_%')) evidence from catalog)
 SELECT jsonb_build_object('catalog',(select jsonb_object_agg(name,evidence) from normalized_catalog),
 'functions',(select jsonb_agg(evidence order by (evidence->>'signature') COLLATE "C") from functions),
 'rows',(select jsonb_object_agg(name,jsonb_build_object('count',row_count,'sha256',rows_sha256)) from fingerprints),
 'finance',(select coalesce(jsonb_object_agg(relname,evidence),'{}') from finance_refs))),applied AS (WITH RECURSIVE
scope(name) AS (VALUES
 ('advisory_matters'), ('advisory_issues'), ('advisory_issue_tasks'),
 ('advisory_advice_records'), ('advisory_time_logs'), ('advisory_matter_counters'),
 ('clients'), ('user_profiles'), ('case_audit_logs'),('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')
),
relations AS (
 SELECT c.*, n.nspname FROM scope s JOIN pg_class c ON c.oid=to_regclass('public.'||s.name)
 JOIN pg_namespace n ON n.oid=c.relnamespace
),
raw(table_name,j) AS MATERIALIZED (
 SELECT 'advisory_matters',to_jsonb(t) FROM public.advisory_matters t UNION ALL
 SELECT 'advisory_issues',to_jsonb(t) FROM public.advisory_issues t UNION ALL
 SELECT 'advisory_issue_tasks',to_jsonb(t) FROM public.advisory_issue_tasks t UNION ALL
 SELECT 'advisory_advice_records',to_jsonb(t) FROM public.advisory_advice_records t UNION ALL
 SELECT 'advisory_time_logs',to_jsonb(t) FROM public.advisory_time_logs t UNION ALL
 SELECT 'advisory_matter_counters',to_jsonb(t) FROM public.advisory_matter_counters t UNION ALL
 SELECT 'clients',to_jsonb(t) FROM public.clients t UNION ALL
 SELECT 'user_profiles',to_jsonb(t) FROM public.user_profiles t UNION ALL
 SELECT 'case_audit_logs',to_jsonb(t) FROM public.case_audit_logs t
 WHERE t.table_name IN ('advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs')
),
rows AS MATERIALIZED (
 SELECT table_name,j,j->>'id' id,nullif(j->>'deleted_at','') IS NULL live FROM raw
),
fingerprints AS (
 SELECT s.name,count(r.j) row_count,
  encode(sha256(convert_to(coalesce(string_agg(r.j::text,E'\n' ORDER BY r.j::text),''),'UTF8')),'hex') rows_sha256
 FROM scope s LEFT JOIN rows r ON r.table_name=s.name GROUP BY s.name
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
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid AND c.contype<>'n'),
  'incoming_foreign_keys',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,
    'name',c.conname,'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conrelid::regclass::text,c.conname),'[]')
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]')
    FROM pg_index i WHERE i.indrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid,true),'enabled',g.tgenabled)
    ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
    'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY role_id)
      FROM unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname),'[]') FROM pg_policy p WHERE p.polrelid=t.oid),
  'effective_grants_before_rls',(SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
    'select',has_table_privilege(r.oid,t.oid,'SELECT'),'insert',has_table_privilege(r.oid,t.oid,'INSERT'),
    'update',has_table_privilege(r.oid,t.oid,'UPDATE'),'delete',has_table_privilege(r.oid,t.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,t.oid,'TRUNCATE'))) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
 ) evidence FROM relations t
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section')))
 select jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by x->>'definition'),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues')))),
actual as (select (select * from preserved) old,(select * from applied) added),
checks as (select jsonb_build_object(
 'historical_rows_unchanged',encode(sha256(convert_to((old->'rows')::text,'UTF8')),'hex')='14b6915885070b1994c94be51ed6f389acc29db3bd05d9aa39d9ac49808fb1f1',
 'finance_references_unchanged',encode(sha256(convert_to((old->'finance')::text,'UTF8')),'hex')='2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8',
 'existing_catalog_security_preserved',encode(sha256(convert_to((old->'catalog')::text,'UTF8')),'hex')='826c1ebb656245109269bbe3a4bf032dc26ab0ca0bf5cb587bd78b19b6536a43',
 'existing_functions_preserved',encode(sha256(convert_to((old->'functions')::text,'UTF8')),'hex')='dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372',
 'applied_state_exact',encode(sha256(convert_to(added::text,'UTF8')),'hex')='86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471',
 'no_invented_control_history',not exists(select 1 from public.advisory_matter_control) and not exists(select 1 from public.advisory_matter_team) and not exists(select 1 from public.advisory_matter_stages) and not exists(select 1 from public.advisory_stage_visits) and not exists(select 1 from public.advisory_matter_activities) and not exists(select 1 from public.advisory_work_state_events) and not exists(select 1 from public.advisory_deliverables) and not exists(select 1 from public.advisory_control_requests),
 'no_identity_or_time_backfill',not exists(select 1 from public.advisory_issue_tasks where assignee_user_id is not null or stage_id is not null) and not exists(select 1 from public.advisory_time_logs where stage_id is not null),
 'unrestricted_owner_snapshot',current_user='postgres' and not current_setting('row_security')='off'
 ) result from actual), failures as (select coalesce(jsonb_agg(key order by key),'[]') failed from checks,jsonb_each(result) where value is distinct from 'true'::jsonb)
select jsonb_build_object('gate_pass',jsonb_array_length(failed)=0,'failed_checks',failed,
 'candidate_sha256','c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe','approved_historical_rows_sha256','43bbad187636d36fb57c7b12f535b58de2c375c877a1b4c68d0a2e026ea07774','checks',result,
 'historical_rows_unchanged',result->'historical_rows_unchanged','applied_state_exact',result->'applied_state_exact') phase8c_076_verification from checks,failures;
