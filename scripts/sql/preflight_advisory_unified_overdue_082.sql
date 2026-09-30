-- 082 SELECT-only Preflight; no business/RPC execution.
-- Verifier fails closed until NEW Human-reviewed Production hashes are bound.
-- Earlier UAT row snapshots are not substituted for current Production evidence.
WITH state AS MATERIALIZED (WITH structure AS (WITH RECURSIVE
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
    FROM pg_constraint c WHERE c.confrelid=t.oid AND c.contype='f'),
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
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state)), expected AS (SELECT '{"tables":{"advisory_matter_team":"adffb903a8cd680902b536c0521b9e5fb2659ad26abd859ac915f8ab350b4c29","advisory_deliverables":"b321e1ad13277a1f2b02fe28b90eaba571753840566df032a5a3e259fb34b595","advisory_stage_visits":"a62c35cbaf0a46159b78fec0eb89251ee65b959de23d79be3288af4d29436362","advisory_matter_stages":"6f0fcc4f5815017218c11be290b9b2e815d986dff07f4e7bcfd8878d120bee28","advisory_matter_control":"7e71b4a3a195129c8b7fe54cc0f30447289ccd0469ae9556649a1c686934e661","advisory_control_requests":"20acda03f5080eae5d8b5c23fc9dda47c3a8fd59d66b2096d389df19eccf8fca","advisory_matter_activities":"72b705bb26b88f47156d3725fc3160fcf97fa4f0dbdea255ba5e92abc41ae0e2","advisory_work_state_events":"4ea56f42781fb7035467287cef50d45344b31013bd4067f131d7e9727138168b"},"functions":{"advisory076_task_guard()":"6891193a90940b45b8caadacb1627d9f84f5ff08fe39a541c218fcc1a09473e4","advisory076_time_guard()":"8ff23f40c764a7389ccf2669bd1b72d1fb46db86974cabaed2365aa06d2e47ca","advisory076_allowed(text)":"63e3aca4c29d78e402f16565c426b92c38b1d58aaae85d1c0a1b8eeafb2d696c","advisory076_issue_guard()":"f7725c60c394a3cfd68a11c120cbdd25d769e2cdf5c3625aba373978556df259","advisory076_template(text)":"4f378b68d43bc6182dc5913fdb6aa7557f81a9427dcc1452c8a13dd374bab91f","advisory076_task_activity()":"9e8b3329d92deeae30077dd4bec0c02b18943dd844a1c2785524efd77210cae5","advisory076_lifecycle_guard()":"8df0963008b4cebacb0d55429e629d9c584b7608f694278edbe2d3fc7e67dde7","advisory_control_read(uuid,jsonb)":"804eaa7df680b9ce58d30dbe75e93b722e9da7022c4f85ca728c1575f7b1f53a","advisory076_check_person(uuid,boolean)":"2016f002ef2df8c3954549a15a6be135125d8e435d4acdc2d542bf84438c4b4c","advisory_control_section(uuid,text,integer,uuid)":"cc75bf2ed45f5016024f2b62478ecff890e35d33a26e0204b84d8afbc5cdf1e8","advisory_control_write(uuid,text,jsonb,uuid,bigint)":"876962749704342f0a1966c4b47dfa3933debc89aa5120eb9502b887a2396184","advisory_workflow_checks(uuid)":"19b101435a3b80942873c6b863a523aaa8fc15f1b9fcab7b51155936d1f8aead"},"deltas":{"advisory_issues":"e126f7b5ccd5880e9bfff2a44a7fe4a4dbd02f7cb8854d0d21dcbb5a4de14ca3","advisory_matters":"51d260cd76c2ae7025057a6f510fed0aebcb92a67a2f014a4b84c7b12bec0db8","advisory_time_logs":"41aeb74c9950755084307db8ddf3dddcb04eee5f860bf7ec3d323d2449150440","advisory_issue_tasks":"8ec4ac947cfc1a2f376dfaa67b9ea87870f3c55f46ce829f551250fe816c1b86"}}'::jsonb value),
 differences AS (SELECT coalesce(jsonb_agg(jsonb_build_object('component',g.name,'object',k.name,
 'expected_sha256',e.value#>>ARRAY[g.name,k.name],'actual_sha256',encode(sha256(convert_to((s.state#>ARRAY['contract',g.name,k.name])::text,'UTF8')),'hex'))
 ORDER BY g.name COLLATE "C",k.name COLLATE "C"),'[]'::jsonb) value
 FROM state s,expected e,LATERAL (SELECT unnest(ARRAY['tables','functions','deltas']) name) g,
 LATERAL (SELECT jsonb_object_keys(coalesce(e.value->g.name,'{}')||coalesce(s.state#>ARRAY['contract',g.name],'{}')) name) k
 WHERE (e.value#>>ARRAY[g.name,k.name]) IS DISTINCT FROM encode(sha256(convert_to((s.state#>ARRAY['contract',g.name,k.name])::text,'UTF8')),'hex')),
 checks AS (SELECT jsonb_build_object('owner',current_user='postgres',
 'accepted_081_contract_exact',encode(sha256(convert_to((state->'contract')::text,'UTF8')),'hex')='0ba73dd77d65a221d9afadf935cab31bf15571bea642f56224ca671a1cdf1366') value FROM state s(state)),
 failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,
 'candidate_sha256','3fc98b29012babcb9aa1a2246e449da371fa82e63144b2b19182ec58318aa261','accepted_081_candidate_sha256','96428a6517218f94ca32cca806f4658e4d964bdae20f2ed91d925d226f3e9693','accepted_081_contract_sha256','0ba73dd77d65a221d9afadf935cab31bf15571bea642f56224ca671a1cdf1366',
 'checks',checks.value,'object_differences',differences.value,
 'rows_sha256',encode(sha256(convert_to((state->'rows')::text,'UTF8')),'hex'),'catalog_sha256',encode(sha256(convert_to((state->'catalog')::text,'UTF8')),'hex'),'row_fingerprints',state->'rows',
 'approved_rows_sha256',NULL::text,'approved_catalog_sha256',NULL::text,
 'business_rpc_executed',false,'broader_finance_differences_accepted',false) advisory082_preflight
FROM state s(state),checks,failures,differences;
