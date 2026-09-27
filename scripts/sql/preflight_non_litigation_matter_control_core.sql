-- Phase 8C-A: current-state evidence BEFORE designing Migration 076.
-- Manual Production SELECT only. This is NOT approval to apply a migration.
-- No business/helper/numbering RPC is called. No Auth rows or narrative text exported.
-- Legacy names and matching profile IDs are evidence only: NO automatic remapping.
-- Finance/Case are read-only boundaries. The broader 490 Finance differences are NOT accepted.
-- One SQL statement / one consistent snapshot. Run as the normal SQL Editor owner.
WITH RECURSIVE
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
    'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid),
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
),
function_roots(oid) AS (
 SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('create_advisory_matter_with_number','can_create_advisory_matter','generate_advisory_matter_no',
   'people_is_assignable','people_is_active_admin','admin074_session_allowed')
 UNION SELECT g.tgfoid FROM pg_trigger g JOIN relations t ON t.oid=g.tgrelid WHERE NOT g.tgisinternal
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
legacy_names AS (
 SELECT table_name,field,btrim(r.j->>field) legacy_value,count(*) row_count,count(*) FILTER(WHERE live) live_count
 FROM rows r CROSS JOIN LATERAL (VALUES
  (CASE r.table_name WHEN 'advisory_matters' THEN 'responsible_lawyer' WHEN 'advisory_issues' THEN 'responsible_person'
   WHEN 'advisory_issue_tasks' THEN 'assignee_name' WHEN 'advisory_advice_records' THEN 'responsible_person'
   WHEN 'advisory_time_logs' THEN 'staff_name' END)) f(field)
 WHERE nullif(btrim(r.j->>field),'') IS NOT NULL GROUP BY table_name,field,btrim(r.j->>field)
),
name_matches AS (
 SELECT n.*,coalesce(m.candidates,'[]') candidates,coalesce(m.total,0) candidate_count,coalesce(m.eligible,0) eligible_count
 FROM legacy_names n LEFT JOIN LATERAL (
  SELECT count(*) total,count(*) FILTER(WHERE r.j->>'active'='true' AND r.j->>'account_type'='operational'
    AND r.j->>'assignable'='true' AND (n.table_name<>'advisory_matters' OR r.j->>'role' IN ('admin','partner','lawyer','assistant_lawyer'))) eligible,
   jsonb_agg(jsonb_build_object('profile_id',r.id,'role',r.j->>'role','active',r.j->'active',
    'account_type',r.j->>'account_type','assignable',r.j->'assignable') ORDER BY r.id) candidates
  FROM rows r WHERE r.table_name='user_profiles'
    AND (n.legacy_value=nullif(btrim(r.j->>'staff_name'),'') OR n.legacy_value=nullif(btrim(r.j->>'full_name'),''))
 ) m ON true
),
links(child_table,field,parent_table,required) AS (VALUES
 ('advisory_matters','client_id','clients',true),('advisory_issues','advisory_matter_id','advisory_matters',true),
 ('advisory_issue_tasks','advisory_matter_id','advisory_matters',true),('advisory_issue_tasks','advisory_issue_id','advisory_issues',false),
 ('advisory_advice_records','advisory_matter_id','advisory_matters',true),('advisory_advice_records','advisory_issue_id','advisory_issues',false),
 ('advisory_time_logs','advisory_matter_id','advisory_matters',true),('advisory_time_logs','advisory_issue_id','advisory_issues',false)
),
link_checks AS (
 SELECT l.*,count(c.j) child_rows,count(c.j) FILTER(WHERE nullif(c.j->>l.field,'') IS NULL) null_links,
  count(c.j) FILTER(WHERE nullif(c.j->>l.field,'') IS NOT NULL AND p.id IS NULL) orphan_links,
  count(c.j) FILTER(WHERE c.live AND NOT p.live) live_child_deleted_parent
 FROM links l LEFT JOIN rows c ON c.table_name=l.child_table
 LEFT JOIN rows p ON p.table_name=l.parent_table AND p.id=c.j->>l.field GROUP BY l.child_table,l.field,l.parent_table,l.required
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
targets AS (
 SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN
  ('advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_work_state_events',
   'advisory_matter_activities','advisory_deliverables')
),
checks AS (
 SELECT jsonb_build_object(
  'complete_unrestricted_snapshot',NOT EXISTS(SELECT 1 FROM relations WHERE row_security_active(oid))
    AND NOT EXISTS(SELECT 1 FROM finance_relations WHERE row_security_active(oid)),
  'all_required_relations_present',(SELECT count(*) FROM relations)=(SELECT count(*) FROM scope),
  'all_finance_reference_counts_captured',(SELECT count(*) FROM finance_refs)=(SELECT count(*) FROM finance_relations),
  'people_alignment_columns_present',(SELECT count(*)=3 FROM pg_attribute WHERE attrelid='public.user_profiles'::regclass
    AND attname IN ('account_type','assignable','must_change_password') AND NOT attisdropped),
  'atomic_creation_present',to_regprocedure('public.create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text)') IS NOT NULL,
  'name_evidence_not_truncated',(SELECT count(*)<=500 FROM name_matches),
  'task_evidence_not_truncated',(SELECT count(*)<=500 FROM rows WHERE table_name='advisory_issue_tasks'),
  'matter_evidence_not_truncated',(SELECT count(*)<=500 FROM rows WHERE table_name='advisory_matters'),
  'helper_discovery_within_limit',NOT EXISTS(SELECT 1 FROM function_walk w JOIN function_edges e ON e.parent=w.oid
    WHERE w.depth=8 AND e.child NOT IN (SELECT oid FROM function_walk)),
  'no_proposed_target_conflicts',NOT EXISTS(SELECT 1 FROM targets)
 ) value
)
SELECT jsonb_build_object(
 'audit','PHASE8C_A_NON_LITIGATION_CURRENT_STATE','repository_commit','efa557f9c5167212f0663127b35c1e832f09f86d',
 'captured_at',current_timestamp,'execution_role',current_user,'business_timezone','Asia/Bangkok',
 'capture_complete',NOT EXISTS(SELECT 1 FROM checks,jsonb_each(value) c WHERE c.value<>'true'::jsonb),
 'failed_capture_checks',(SELECT coalesce(jsonb_agg(c.key ORDER BY c.key),'[]') FROM checks,jsonb_each(value) c WHERE c.value<>'true'::jsonb),
 'checks',(SELECT value FROM checks),
 'migration_ready',false,'next_step','Review exact Production evidence before designing 076; this capture is NOT Apply approval.',
 'read_scope',jsonb_build_object('rls_active_relations',(SELECT coalesce(jsonb_agg(relname ORDER BY relname),'[]')
   FROM relations WHERE row_security_active(oid)),'rls_active_finance_references',(SELECT coalesce(jsonb_agg(relname ORDER BY relname),'[]')
   FROM finance_relations WHERE row_security_active(oid))),
 'preservation_fingerprints',(SELECT jsonb_object_agg(name,jsonb_build_object('count',row_count,'sha256',rows_sha256) ORDER BY name) FROM fingerprints),
 'historical_rows_sha256',(SELECT encode(sha256(convert_to(jsonb_object_agg(name,jsonb_build_array(row_count,rows_sha256))::text,'UTF8')),'hex') FROM fingerprints),
 'catalog',(SELECT jsonb_object_agg(name,evidence ORDER BY name) FROM catalog),
 'functions',(SELECT coalesce(jsonb_agg(evidence ORDER BY evidence->>'signature'),'[]') FROM functions),
 'function_discovery_note','Direct trigger/policy/catalog edges plus conservative named-call scan to depth 8. Definitions must be reviewed for dynamic SQL; no helper is executed.',
 'statuses_and_types',(SELECT jsonb_agg(to_jsonb(s) ORDER BY table_name,field,value) FROM (
   SELECT table_name,field,j->>field value,count(*) rows,count(*) FILTER(WHERE live) live_rows FROM rows
   CROSS JOIN (VALUES ('status'),('matter_type'),('retainer_type'),('task_type'),('priority')) f(field)
   WHERE table_name LIKE 'advisory\_%' ESCAPE '\' AND j ? field GROUP BY table_name,field,j->>field) s),
 'relationships',(SELECT jsonb_agg(to_jsonb(l) ORDER BY child_table,field) FROM link_checks l),
 'cross_parent_mismatches',jsonb_build_object(
   'issue_matter',(SELECT count(*) FROM rows c JOIN rows i ON i.table_name='advisory_issues' AND i.id=c.j->>'advisory_issue_id'
    WHERE c.table_name IN ('advisory_issue_tasks','advisory_advice_records','advisory_time_logs') AND c.j->>'advisory_matter_id' IS DISTINCT FROM i.j->>'advisory_matter_id'),
   'client_matter',(SELECT count(*) FROM rows c JOIN rows m ON m.table_name='advisory_matters' AND m.id=c.j->>'advisory_matter_id'
    WHERE c.table_name IN ('advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs')
    AND nullif(c.j->>'client_id','') IS NOT NULL AND c.j->>'client_id' IS DISTINCT FROM m.j->>'client_id')),
 'matter_date_evidence',(SELECT coalesce(jsonb_agg(e ORDER BY e->>'id'),'[]') FROM (
   SELECT jsonb_build_object('id',id,'matter_no',j->>'matter_no','status',j->>'status','client_id',j->>'client_id',
    'start_date',j->>'start_date','end_date',j->>'end_date','created_at',j->>'created_at','deleted_at',j->>'deleted_at') e
   FROM rows WHERE table_name='advisory_matters' ORDER BY id LIMIT 500) m),
 'matter_date_evidence_total',(SELECT count(*) FROM rows WHERE table_name='advisory_matters'),
 'task_link_evidence',(SELECT coalesce(jsonb_agg(e ORDER BY e->>'id'),'[]') FROM (
   SELECT jsonb_build_object('id',id,'matter_id',j->>'advisory_matter_id','issue_id',j->>'advisory_issue_id',
    'client_id',j->>'client_id','status',j->>'status','priority',j->>'priority','due_date',j->>'due_date',
    'completed_at',j->>'completed_at','deleted_at',j->>'deleted_at') e
   FROM rows WHERE table_name='advisory_issue_tasks' ORDER BY id LIMIT 500) t),
 'people',jsonb_build_object(
   'assignment_rule','active=true AND account_type=operational AND assignable=true; assignment never grants permissions',
   'matching_rule','Exact case-sensitive full_name/staff_name after trimming only; no email/fuzzy/role inference; candidates require Human review.',
   'profile_groups',(SELECT jsonb_agg(to_jsonb(p) ORDER BY role,account_type,active,assignable) FROM (
     SELECT j->>'role' role,j->>'account_type' account_type,j->>'active' active,j->>'assignable' assignable,count(*) count
     FROM rows WHERE table_name='user_profiles' GROUP BY 1,2,3,4) p),
   'legacy_name_groups_total',(SELECT count(*) FROM name_matches),
   'legacy_name_matches',(SELECT coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('classification',
     CASE WHEN candidate_count=0 THEN 'unmatched' WHEN candidate_count>1 THEN 'ambiguous'
       WHEN eligible_count<>1 THEN 'ineligible' ELSE 'unique_eligible_candidate_requires_review' END) ORDER BY table_name,field,legacy_value),'[]')
     FROM (SELECT * FROM name_matches ORDER BY table_name,field,legacy_value LIMIT 500) m),
   'blank_assignment_counts',(SELECT jsonb_object_agg(s.table_name,s.count) FROM (
     SELECT r.table_name,count(*) FROM rows r JOIN (VALUES ('advisory_matters','responsible_lawyer'),('advisory_issues','responsible_person'),
       ('advisory_issue_tasks','assignee_name'),('advisory_advice_records','responsible_person'),('advisory_time_logs','staff_name')) f(t,k)
       ON r.table_name=f.t WHERE nullif(btrim(r.j->>f.k),'') IS NULL GROUP BY r.table_name) s)),
 'time_evidence',(SELECT jsonb_build_object('rows',count(*),'live_rows',count(*) FILTER(WHERE live),
   'minutes_total',sum(CASE WHEN j->>'minutes' ~ '^[0-9]+$' THEN (j->>'minutes')::numeric END),
   'invalid_minutes',count(*) FILTER(WHERE coalesce(j->>'minutes','') !~ '^[0-9]+$'),
   'core_live_minutes',sum(CASE WHEN live AND j->>'billable'='true' AND j->>'minutes' ~ '^[0-9]+$' THEN (j->>'minutes')::numeric ELSE 0 END),
   'support_live_minutes',sum(CASE WHEN live AND j->>'billable'='false' AND j->>'minutes' ~ '^[0-9]+$' THEN (j->>'minutes')::numeric ELSE 0 END),
   'missing_work_date',count(*) FILTER(WHERE nullif(j->>'work_date','') IS NULL),
   'missing_creator_id',count(*) FILTER(WHERE nullif(j->>'created_by_user_id','') IS NULL))
   FROM rows WHERE table_name='advisory_time_logs'),
 'finance_matter_references',(SELECT coalesce(jsonb_object_agg(relname,evidence ORDER BY relname),'{}') FROM finance_refs),
 'proposed_target_conflicts',(SELECT coalesce(jsonb_agg(relname ORDER BY relname),'[]') FROM targets),
 'boundaries',jsonb_build_object('production_writes',false,'case_changes',false,'finance_changes',false,
   'numbering_executed',false,'identity_backfill',false,'broader_finance_differences_accepted',false)
) AS phase8c_preflight;
