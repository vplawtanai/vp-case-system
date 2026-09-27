-- ADVISORY076_ATTEMPT_STATE_VERIFIER
-- SELECT ONLY. For an unknown Dashboard response; does NOT run/retry any migration or RPC.
-- Candidate SHA-256 verified offline: c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe
-- Approved capture: 2026-09-27T10:30:22.906424+00:00; no baseline file/import required.
-- gate_pass means fully_applied AND all preservation/security checks pass.
-- not_applied is a verified absent footprint; it is NOT permission to rerun the migration.
-- unexpected_partial_state means the observed catalog matches neither intended footprint.
-- Classification describes this SELECT's observed state; any concurrent 076 attempt fails the gate.
-- No source rows are returned. Missing new tables/columns are handled through catalogs/JSON.
-- Only fixed SELECT templates use query_to_xml, including the original scoped Finance fingerprint.
-- New-object catalog arrays use C ordering to match the approved applied artifact, preserving every entry.
-- Historical rows use exactly the original hash algorithm; function arrays use explicit C ordering.
-- Broader 490 Finance differences remain outside this acceptance.
WITH expected AS (SELECT $expected076state${"candidate_sha256":"c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe","baseline_hashes":{"catalog":"826c1ebb656245109269bbe3a4bf032dc26ab0ca0bf5cb587bd78b19b6536a43","functions":"dffbc07fcd28887910eebe96323cc1b21e756aa71fad061f28b8d454dbdf4372","rows":"14b6915885070b1994c94be51ed6f389acc29db3bd05d9aa39d9ac49808fb1f1","finance":"2a0f0f1ea78103ccfe15f827b10e4163ce9ce14d9685cc6aa8a76cb0cb2c28b8"},"historical_rows":{"clients":{"count":34,"sha256":"4c2e3e2e5fc2903e4a14deae3c69a98e6f71afbf0225ed16c1f942a4d66b9874"},"user_profiles":{"count":12,"sha256":"4724f27bb4debedd8f789017ab6804d67a9bdd7252123a411876e7b4517e80e8"},"advisory_issues":{"count":13,"sha256":"18eee54b2d085ad92f4c92ce4e08cb98187393b7201783d640deccc037742dbd"},"case_audit_logs":{"count":166,"sha256":"e6273b77acf60b6d06d18aa84c599c34d57c9d6278ea24fbd501178c31014558"},"advisory_matters":{"count":9,"sha256":"6c35ecdb6fe072fc6286a1769e5c43a656bb86f770f2d40274d2025bf724b09a"},"advisory_time_logs":{"count":94,"sha256":"24b76217661efac29bc7627a3b5ab14ff7ea7e159bca9d36a02591e87af18162"},"advisory_issue_tasks":{"count":4,"sha256":"357523e5d28c3c9a09aa0f1f069b03f6926b2129e5acac5a877325b9143992b6"},"advisory_advice_records":{"count":0,"sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},"advisory_matter_counters":{"count":1,"sha256":"56575606d7459585dd2976576dc59c19f97850787c31fb7731aafc6266966241"}},"finance_references":{"finance_expenses":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_invoices":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_quotations":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_company_ledger":{"count":58,"rows_sha256":"2bffbef78c58e6117fb3e9cc0e95a58162437a09e47cf18c230a44a4309160cc","orphan_matter_refs":0},"finance_expense_claims":{"count":41,"rows_sha256":"ac5b080d90238d383b6ca43f9d35d7ae9326737853083131ae55e48af8377351","orphan_matter_refs":0},"finance_fee_agreements":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_billable_charges":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_compensation_batches":{"count":17,"rows_sha256":"350fc6b2c59982299fc8966cc9bd4da1b7f72a4d4fe9e8df84999fd6e8ed67d9","orphan_matter_refs":0},"finance_direct_money_receipts":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0},"finance_billing_installment_charge_bridges":{"count":0,"rows_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","orphan_matter_refs":0}},"applied_contract_sha256":"86d20bac7582db6955e4b7f644221ee910e7ab41ab6457bbf48cefa1dacd3471","applied_objects":{"deltas":{"advisory_issues":"e126f7b5ccd5880e9bfff2a44a7fe4a4dbd02f7cb8854d0d21dcbb5a4de14ca3","advisory_matters":"51d260cd76c2ae7025057a6f510fed0aebcb92a67a2f014a4b84c7b12bec0db8","advisory_time_logs":"41aeb74c9950755084307db8ddf3dddcb04eee5f860bf7ec3d323d2449150440","advisory_issue_tasks":"8ec4ac947cfc1a2f376dfaa67b9ea87870f3c55f46ce829f551250fe816c1b86"},"tables":{"advisory_matter_team":"adffb903a8cd680902b536c0521b9e5fb2659ad26abd859ac915f8ab350b4c29","advisory_deliverables":"b321e1ad13277a1f2b02fe28b90eaba571753840566df032a5a3e259fb34b595","advisory_stage_visits":"a62c35cbaf0a46159b78fec0eb89251ee65b959de23d79be3288af4d29436362","advisory_matter_stages":"6f0fcc4f5815017218c11be290b9b2e815d986dff07f4e7bcfd8878d120bee28","advisory_matter_control":"7e71b4a3a195129c8b7fe54cc0f30447289ccd0469ae9556649a1c686934e661","advisory_control_requests":"20acda03f5080eae5d8b5c23fc9dda47c3a8fd59d66b2096d389df19eccf8fca","advisory_matter_activities":"72b705bb26b88f47156d3725fc3160fcf97fa4f0dbdea255ba5e92abc41ae0e2","advisory_work_state_events":"4ea56f42781fb7035467287cef50d45344b31013bd4067f131d7e9727138168b"},"functions":{"advisory076_task_guard()":"6416cf6ff818a649c623056f2e155ef3168202b1bcf10bb03494ed57c826f4af","advisory076_time_guard()":"8ff23f40c764a7389ccf2669bd1b72d1fb46db86974cabaed2365aa06d2e47ca","advisory076_allowed(text)":"63e3aca4c29d78e402f16565c426b92c38b1d58aaae85d1c0a1b8eeafb2d696c","advisory076_issue_guard()":"f7725c60c394a3cfd68a11c120cbdd25d769e2cdf5c3625aba373978556df259","advisory076_template(text)":"4f378b68d43bc6182dc5913fdb6aa7557f81a9427dcc1452c8a13dd374bab91f","advisory076_task_activity()":"9e8b3329d92deeae30077dd4bec0c02b18943dd844a1c2785524efd77210cae5","advisory076_lifecycle_guard()":"8df0963008b4cebacb0d55429e629d9c584b7608f694278edbe2d3fc7e67dde7","advisory_control_read(uuid,jsonb)":"804eaa7df680b9ce58d30dbe75e93b722e9da7022c4f85ca728c1575f7b1f53a","advisory076_check_person(uuid,boolean)":"2016f002ef2df8c3954549a15a6be135125d8e435d4acdc2d542bf84438c4b4c","advisory_control_section(uuid,text,integer,uuid)":"cc75bf2ed45f5016024f2b62478ecff890e35d33a26e0204b84d8afbc5cdf1e8","advisory_control_write(uuid,text,jsonb,uuid,bigint)":"e1020048527284626a4d0926df8ab8a53352444839434bc71119bbc98d6343a6"}},"legacy_anomalies":{"live_tasks_on_deleted_issues":1,"live_time_logs_on_deleted_issues":2,"in_progress_tasks_with_completed_at":2}}$expected076state$::jsonb value),
preserved AS MATERIALIZED (WITH RECURSIVE
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
 'finance',(select coalesce(jsonb_object_agg(relname,evidence),'{}') from finance_refs))),
applied AS MATERIALIZED (WITH RECURSIVE
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
), new_functions as (select p.oid::regprocedure::text name,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'advisory076_%' or p.proname in ('advisory_control_read','advisory_control_write','advisory_control_section')))
 select jsonb_build_object('tables',(select jsonb_object_agg(name,evidence) from catalog where name in ('advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events','advisory_matter_activities','advisory_deliverables','advisory_control_requests')),
 'functions',(select jsonb_object_agg(name,evidence) from new_functions),
 'deltas',(select jsonb_object_agg(name,jsonb_build_object(
 'columns',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'columns') with ordinality a(x,n) where name='advisory_issue_tasks' and x->>'name' in ('advisory_matter_id','advisory_issue_id','assignee_user_id','stage_id') or name='advisory_time_logs' and x->>'name'='stage_id'),
 'constraints',(select coalesce(jsonb_agg(x order by (x->>'name') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'constraints') x where x->>'name' like 'advisory076_%'),
 'indexes',(select coalesce(jsonb_agg(x order by n),'[]') from jsonb_array_elements(evidence->'indexes') with ordinality a(x,n) where x#>>'{}' like '%INDEX advisory076_%'),
 'triggers',(select coalesce(jsonb_agg(x order by (x->>'definition') COLLATE "C"),'[]') from jsonb_array_elements(evidence->'triggers') x where x->>'definition' like '%TRIGGER advisory076_%'))) from catalog where name in ('advisory_matters','advisory_issue_tasks','advisory_time_logs','advisory_issues')))),
new_table_names(name) AS (VALUES ('advisory_matter_control'),('advisory_matter_team'),('advisory_matter_stages'),('advisory_stage_visits'),('advisory_work_state_events'),('advisory_matter_activities'),('advisory_deliverables'),('advisory_control_requests')),
new_columns(table_name,column_name) AS (VALUES
 ('advisory_issue_tasks','assignee_user_id'),('advisory_issue_tasks','stage_id'),('advisory_time_logs','stage_id')
),
new_relations AS (
 SELECT c.oid,c.relname,c.relkind,n.nspname FROM new_table_names t
 JOIN pg_class c ON c.oid=to_regclass('public.'||t.name) JOIN pg_namespace n ON n.oid=c.relnamespace
),
new_row_counts AS MATERIALIZED (
 SELECT r.relname,x.row_count FROM new_relations r
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING
  query_to_xml(format('SELECT count(*) AS row_count FROM %I.%I',r.nspname,r.relname),false,false,'')
  COLUMNS row_count bigint PATH 'row_count') x
 WHERE r.relkind IN ('r','p')
),
markers AS (
 SELECT 'relation'::text kind,n.nspname schema_name,c.relname name,NULL::text parent
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND (c.relname IN (SELECT name FROM new_table_names) OR left(c.relname,12)='advisory076_')
 UNION ALL
 SELECT 'function',n.nspname,p.proname,p.oid::regprocedure::text FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND (left(p.proname,12)='advisory076_' OR p.proname IN ('advisory_control_read','advisory_control_write','advisory_control_section'))
 UNION ALL
 SELECT 'column','public',a.attname,t.table_name FROM new_columns t
 JOIN pg_attribute a ON a.attrelid=to_regclass('public.'||t.table_name)
 AND a.attname=t.column_name AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT 'constraint',n.nspname,c.conname,t.relname FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND left(c.conname,12)='advisory076_'
 UNION ALL
 SELECT 'trigger',n.nspname,g.tgname,t.relname FROM pg_trigger g
 JOIN pg_class t ON t.oid=g.tgrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND NOT g.tgisinternal AND left(g.tgname,12)='advisory076_'
 UNION ALL
 SELECT 'policy',n.nspname,p.polname,t.relname FROM pg_policy p
 JOIN pg_class t ON t.oid=p.polrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname='public' AND left(p.polname,12)='advisory076_'
),
actual_old_column AS (
 SELECT (SELECT attnotnull FROM pg_attribute WHERE attrelid=to_regclass('public.advisory_issue_tasks')
 AND attname='advisory_issue_id' AND attnum>0 AND NOT attisdropped) issue_id_not_null
),
backfill AS (
 SELECT jsonb_build_object(
 'task_assignee_ids',(SELECT count(*) FROM public.advisory_issue_tasks t WHERE to_jsonb(t)->>'assignee_user_id' IS NOT NULL),
 'task_stage_ids',(SELECT count(*) FROM public.advisory_issue_tasks t WHERE to_jsonb(t)->>'stage_id' IS NOT NULL),
 'time_stage_ids',(SELECT count(*) FROM public.advisory_time_logs t WHERE to_jsonb(t)->>'stage_id' IS NOT NULL)) value
),
legacy_anomalies AS (
 SELECT jsonb_build_object(
 'live_tasks_on_deleted_issues',(SELECT count(*) FROM public.advisory_issue_tasks t
  JOIN public.advisory_issues i ON i.id=t.advisory_issue_id WHERE t.deleted_at IS NULL AND i.deleted_at IS NOT NULL),
 'live_time_logs_on_deleted_issues',(SELECT count(*) FROM public.advisory_time_logs t
  JOIN public.advisory_issues i ON i.id=t.advisory_issue_id WHERE t.deleted_at IS NULL AND i.deleted_at IS NOT NULL),
 'in_progress_tasks_with_completed_at',(SELECT count(*) FROM public.advisory_issue_tasks t
  WHERE t.status='in_progress' AND t.completed_at IS NOT NULL)) value
),
read_context AS (
 SELECT current_user='postgres' AND NOT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND (c.relname IN (SELECT key FROM expected,jsonb_each(value->'historical_rows'))
   OR c.relname IN (SELECT key FROM expected,jsonb_each(value->'finance_references'))
   OR c.relname IN (SELECT name FROM new_table_names)) AND row_security_active(c.oid)
 ) unrestricted,
 (SELECT count(*) FROM pg_stat_activity a WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()
  AND a.xact_start IS NOT NULL AND a.query NOT LIKE '%-- ADVISORY076_ATTEMPT_STATE_VERIFIER%'
  AND (a.query LIKE '%-- Phase 8C: Non-Litigation Matter Control.%'
   OR a.query LIKE '%create temporary table advisory076_before%')) concurrent_candidate_sessions
),
object_expected AS (
 SELECT kind.key kind,entry.key name,entry.value#>>'{}' sha256 FROM expected e
 CROSS JOIN LATERAL jsonb_each(e.value->'applied_objects') kind
 CROSS JOIN LATERAL jsonb_each(kind.value) entry
),
object_actual AS (
 SELECT kind.key kind,entry.key name,encode(sha256(convert_to(entry.value::text,'UTF8')),'hex') sha256 FROM applied a
 CROSS JOIN LATERAL jsonb_each(a.jsonb_build_object) kind
 CROSS JOIN LATERAL jsonb_each(coalesce(nullif(kind.value,'null'::jsonb),'{}')) entry
),
object_differences AS (
 SELECT coalesce(e.kind,a.kind) kind,coalesce(e.name,a.name) name,e.sha256 expected_sha256,a.sha256 actual_sha256
 FROM object_expected e FULL JOIN object_actual a ON a.kind=e.kind AND a.name=e.name
 WHERE e.sha256 IS DISTINCT FROM a.sha256
),
actual_hashes AS (
 SELECT p.jsonb_build_object preserved,a.jsonb_build_object applied,e.value expected,
  encode(sha256(convert_to(a.jsonb_build_object::text,'UTF8')),'hex') applied_sha256,
  (SELECT jsonb_object_agg(k,encode(sha256(convert_to(v::text,'UTF8')),'hex')) FROM jsonb_each(p.jsonb_build_object) b(k,v)) baseline_hashes
 FROM preserved p CROSS JOIN applied a CROSS JOIN expected e
),
footprint_status AS (
 SELECT h.*,
  applied_sha256=expected->>'applied_contract_sha256' AND NOT EXISTS(SELECT 1 FROM object_differences)
    AND (SELECT count(*) FROM markers)=43 AS applied_state_exact,
  NOT EXISTS(SELECT 1 FROM markers) AND c.issue_id_not_null IS TRUE AS absent_state_exact,
  c.issue_id_not_null
 FROM actual_hashes h CROSS JOIN actual_old_column c
),
classified AS (
 SELECT f.*,CASE WHEN applied_state_exact THEN 'fully_applied'
  WHEN absent_state_exact THEN 'not_applied' ELSE 'unexpected_partial_state' END migration076_state
 FROM footprint_status f
),
checks AS (
 SELECT c.*,jsonb_build_object(
  'migration076_fully_applied',migration076_state='fully_applied',
  'unrestricted_read_context',r.unrestricted,
  'no_concurrent_076_attempt',r.concurrent_candidate_sessions=0,
  'existing_catalog_security_preserved',baseline_hashes->'catalog'=expected#>'{baseline_hashes,catalog}',
  'existing_functions_preserved',baseline_hashes->'functions'=expected#>'{baseline_hashes,functions}',
  'historical_scoped_rows_unchanged',preserved->'rows'=expected->'historical_rows'
    AND baseline_hashes->'rows'=expected#>'{baseline_hashes,rows}',
  'finance_references_unchanged',preserved->'finance'=expected->'finance_references'
    AND baseline_hashes->'finance'=expected#>'{baseline_hashes,finance}',
  'no_identity_or_stage_backfill',NOT EXISTS(SELECT 1 FROM backfill b CROSS JOIN LATERAL jsonb_each(b.value) x(k,v) WHERE x.v<>'0'::jsonb),
  'no_invented_journey_or_control_history',NOT EXISTS(SELECT 1 FROM new_row_counts WHERE row_count<>0)
    AND (SELECT count(*) FROM new_row_counts)=(SELECT count(*) FROM new_relations),
  'legacy_inconsistencies_preserved',(SELECT value FROM legacy_anomalies)=expected->'legacy_anomalies'
 ) value FROM classified c CROSS JOIN read_context r
),
failures AS (
 SELECT coalesce(jsonb_agg(k ORDER BY k COLLATE "C"),'[]') value FROM checks c
 CROSS JOIN LATERAL jsonb_each(c.value) b(k,v) WHERE v IS DISTINCT FROM 'true'::jsonb
)
SELECT jsonb_build_object(
 'migration076_state',c.migration076_state,
 'gate_pass',jsonb_array_length(f.value)=0,'failed_checks',f.value,
 'candidate_sha256',c.expected->'candidate_sha256','observed_at',statement_timestamp(),
 'applied_state_exact',c.applied_state_exact,'not_applied_footprint_exact',c.absent_state_exact,
 'key_object_counts',jsonb_build_object(
  'new_tables',(SELECT count(*) FROM new_relations WHERE relkind='r'),'expected_new_tables',8,
  'added_columns',(SELECT count(*) FROM markers WHERE kind='column'),'expected_added_columns',3,
  'new_functions',(SELECT count(*) FROM markers WHERE kind='function'),'expected_new_functions',11,
  'new_rpcs',(SELECT count(*) FROM markers WHERE kind='function' AND name IN ('advisory_control_read','advisory_control_write','advisory_control_section')),'expected_new_rpcs',3,
  'new_triggers',(SELECT count(*) FROM markers WHERE kind='trigger'),'expected_new_triggers',5,
  'new_policies',(SELECT count(*) FROM markers WHERE kind='policy'),'expected_new_policies',7,
  'named_delta_constraints',(SELECT count(*) FROM markers WHERE kind='constraint'),'expected_named_delta_constraints',3,
  'named_delta_indexes',(SELECT count(*) FROM markers WHERE kind='relation' AND left(name,12)='advisory076_'),'expected_named_delta_indexes',6,
  'advisory_issue_id_not_null',c.issue_id_not_null,
  'historical_rows',(SELECT jsonb_object_agg(k,v->'count') FROM jsonb_each(c.preserved->'rows') b(k,v)),
  'new_table_rows',(SELECT coalesce(jsonb_object_agg(relname,row_count),'{}') FROM new_row_counts)),
 'preservation',jsonb_build_object(
  'pass',NOT EXISTS(SELECT 1 FROM jsonb_each(c.value) b(k,v) WHERE k<>'migration076_fully_applied' AND v IS DISTINCT FROM 'true'::jsonb),
  'checks',c.value,
  'identity_or_stage_backfill_counts',(SELECT value FROM backfill),
  'known_legacy_inconsistencies',(SELECT value FROM legacy_anomalies),
  'finance_reference_counts',(SELECT jsonb_object_agg(k,v->'count') FROM jsonb_each(c.preserved->'finance') b(k,v))),
 'object_differences',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY kind COLLATE "C",name COLLATE "C"),'[]') FROM object_differences d),
 'concurrent_candidate_sessions',(SELECT concurrent_candidate_sessions FROM read_context)
) AS advisory076_attempt_state_verification
FROM checks c CROSS JOIN failures f;
