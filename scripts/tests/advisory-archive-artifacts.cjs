/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 095 builder. No credentials, network, or Production connection.
const fs=require('node:fs'),assert=require('node:assert/strict');
const G=require('./advisory-controlled-journey-artifacts.cjs'),{A,q}=G,root=A.root;
const reviewed=require('./fixtures/advisory-095-reviewed-targets.json');
const candidate=root+'/supabase/migrations/202610050095_advisory_uat_operational_archive.sql';
const preflight=root+'/scripts/sql/preflight_advisory_archive_095.sql',apply=root+'/scripts/sql/apply_advisory_archive_095.sql',verifier=root+'/scripts/sql/verify_advisory_archive_095.sql';
const contractPath=__dirname+'/fixtures/advisory-095-contract.json',pinsPath=__dirname+'/fixtures/advisory-095-reviewed-baseline.json';
const changedFunctions=['advisory_control_read(uuid,jsonb)','advisory_control_section(uuid,text,integer,uuid)','advisory_overdue_work(uuid)','advisory_workflow_checks(uuid)'];
const views={advisory_matters:'advisory_operational_matters',advisory_issues:'advisory_operational_issues',advisory_issue_tasks:'advisory_operational_tasks',advisory_time_logs:'advisory_operational_time',advisory_advice_records:'advisory_operational_advice'};
const owned={advisory_matters:'id',advisory_issues:'advisory_matter_id',advisory_issue_tasks:'advisory_matter_id',advisory_time_logs:'advisory_matter_id',advisory_advice_records:'advisory_matter_id',...Object.fromEntries(['advisory_matter_control','advisory_matter_team','advisory_matter_stages','advisory_stage_visits','advisory_journey_snapshots','advisory_matter_activities','advisory_work_state_events','advisory_deliverables'].map(x=>[x,'matter_id']))};
const digest=x=>`encode(sha256(convert_to((${x})::text,'UTF8')),'hex')`,j=x=>q(JSON.stringify(x))+'::jsonb';
assert.equal(reviewed.targets.length,11);assert.deepEqual(reviewed.targets.map(x=>x.matter_no),Array.from({length:11},(_,i)=>'ADV-2026-'+(i+13).toString().padStart(3,'0')));
const values=()=>reviewed.targets.map(x=>`(${q(x.id)}::uuid,${q(x.matter_no)})`).join(',');
const changed=changedFunctions.map(q).join(',');
function functionsSql(extra=false){return `SELECT coalesce(jsonb_object_agg(signature,evidence),'{}') FROM (
 SELECT p.oid::regprocedure::text signature,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),
 'definer',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',p.proacl::text,
 'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) evidence
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND
 ${extra?`(p.proname LIKE 'advisory095_%' OR p.oid::regprocedure::text IN (${changed}))`:`p.oid::regprocedure::text IN (${Object.keys(G.afterContract.functions).map(q).join(',')},'advisory086_admin()','advisory086_immutable()')`}) x`;}
const priorFunctions={...G.afterContract.functions,...Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(G.footprintPath)).functions).filter(([k])=>['advisory086_admin()','advisory086_immutable()'].includes(k)).map(([k,v])=>{const {execute,security_definer,...rest}=v;return [k,{...rest,definer:security_definer,...execute}];}))};
const acceptedCatalog=JSON.parse(fs.readFileSync(G.pinsPath)).catalog_sha256;
const acceptedJourney=JSON.parse(fs.readFileSync(G.footprintPath));
function foundationSql(){return `WITH original AS (${G.snapshot()}),journey AS (${G.footprint()}) SELECT jsonb_build_object('core',state->'contract'=${j(G.afterContract)},'old_catalog',${digest("state->'catalog'")}=${q(acceptedCatalog)},'journey',j=${j(acceptedJourney)}) FROM original x(state),journey y(j)`;}
// Catalog representation uses attnotnull, excludes PG18-only NOT NULL pg_constraint rows.
function relationEvidence(alias='c',post=false){return `jsonb_build_object('kind',${alias}.relkind,'owner',pg_get_userbyid(${alias}.relowner),'acl',${alias}.relacl::text,'rls',${alias}.relrowsecurity,'force_rls',${alias}.relforcerowsecurity,'options',${alias}.reloptions,
 'view',CASE WHEN ${alias}.relkind='v' THEN pg_get_viewdef(${alias}.oid,true) END,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=${alias}.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid,true),k.convalidated) ORDER BY k.conname COLLATE "C"),'[]') FROM pg_constraint k WHERE k.conrelid=${alias}.oid AND k.contype<>'n'),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY ic.relname COLLATE "C"),'[]') FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=${alias}.oid),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p)-'schemaname'-'tablename' ORDER BY p.policyname COLLATE "C"),'[]') FROM pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=${alias}.relname),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname COLLATE "C"),'[]') FROM pg_trigger t WHERE t.tgrelid=${alias}.oid AND NOT t.tgisinternal ${post?'':"AND t.tgname NOT LIKE 'advisory095_%'"}))`;}
const isAdded=`(c.relname='advisory_matter_archives' OR c.relname IN (${Object.values(views).map(q).join(',')}))`;
function snapshot(){return `WITH targets(id,matter_no) AS (VALUES ${values()}),
 rels AS MATERIALIZED (SELECT c.oid,n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND NOT c.relispartition
 AND (n.nspname='public' AND c.relname<>'advisory_matter_archives' OR n.nspname='auth' AND c.relname='users' OR n.nspname='storage' AND c.relname IN ('buckets','objects'))),
 rows AS MATERIALIZED (SELECT r.nspname||'.'||r.relname name,x.evidence::jsonb evidence FROM rels r CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT jsonb_build_object(''count'',count(*),''sha256'',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex''))::text evidence FROM %I.%I t',r.nspname,r.relname),false,false,'') COLUMNS evidence text PATH 'evidence') x),
 catalog AS MATERIALIZED (SELECT n.nspname||'.'||c.relname name,${relationEvidence()} evidence FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S') AND NOT c.relispartition AND (n.nspname='public' AND NOT ${isAdded} OR n.nspname='auth' AND c.relname='users' OR n.nspname='storage' AND c.relname IN ('objects','buckets'))),
 funcs AS MATERIALIZED (SELECT p.oid::regprocedure::text name,jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text) evidence FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p') AND p.proname NOT LIKE 'advisory095_%' AND p.oid::regprocedure::text NOT IN (${changed})),
 target_rows AS MATERIALIZED (SELECT t.*,to_jsonb(m) facts FROM targets t LEFT JOIN public.advisory_matters m ON m.id=t.id AND m.matter_no=t.matter_no),
 tokens AS MATERIALIZED (SELECT array_agg(DISTINCT token) ids FROM (
 SELECT id::text token FROM targets UNION SELECT matter_no FROM targets
 ${Object.entries(owned).filter(([t])=>t!=='advisory_matters').map(([t,col])=>`UNION SELECT to_jsonb(x)->>'id' FROM public.${t} x JOIN targets t ON t.id=x.${col}`).join('\n')}
 ) x WHERE token IS NOT NULL),
 ref_columns AS (SELECT n.nspname,c.relname,a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition AND (c.relname LIKE 'finance_%' OR c.relname='cases' OR c.relname LIKE 'case_%') AND c.relname<>'case_audit_logs'
 AND (a.atttypid IN ('json'::regtype,'jsonb'::regtype) OR a.attname ~ '(advisory|matter|issue|task|source|origin|record|entity|object|target).*(id|ids|no|reference)$'
 OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f' AND k.conrelid=c.oid AND a.attnum=ANY(k.conkey) AND k.confrelid IN(SELECT to_regclass('public.'||x) FROM unnest(ARRAY[${Object.keys(owned).map(q).join(',')}]) x)))),
 refs AS MATERIALIZED (SELECT r.relname table_name,x.n FROM (SELECT nspname,relname,string_agg(format('EXISTS(SELECT 1 FROM unnest(%L::text[]) tok WHERE strpos(coalesce(r.%I::text,''''),tok)>0)',tokens.ids::text,attname),' OR ' ORDER BY attname) predicate FROM ref_columns CROSS JOIN tokens GROUP BY nspname,relname) r
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format('SELECT count(*)::bigint n FROM %I.%I r WHERE %s',r.nspname,r.relname,r.predicate),false,false,'') COLUMNS n bigint PATH 'n') x WHERE x.n>0),
 raw AS (SELECT (SELECT jsonb_object_agg(name,evidence) FROM rows) rows,
 jsonb_build_object('relations',(SELECT jsonb_object_agg(name,evidence) FROM catalog),'functions',(SELECT jsonb_object_agg(name,evidence) FROM funcs),
 'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolbypassrls) ORDER BY rolname COLLATE "C") FROM pg_roles),
 'members',(SELECT jsonb_agg(jsonb_build_array(roleid::regrole::text,member::regrole::text,admin_option) ORDER BY roleid::regrole::text COLLATE "C",member::regrole::text COLLATE "C") FROM pg_auth_members)) preserved,
 (SELECT jsonb_agg(jsonb_build_object('id',id,'matter_no',matter_no,'sha256',${digest('facts')}) ORDER BY matter_no COLLATE "C") FROM target_rows) targets,
 (SELECT count(*)=11 AND bool_and(facts IS NOT NULL) FROM target_rows) AND (SELECT count(*)=11 FROM public.advisory_matters WHERE matter_no IN(SELECT matter_no FROM targets)) targets_exact)
 SELECT jsonb_build_object('rows_sha256',${digest('rows')},'preserved_sha256',${digest('preserved')},'targets_sha256',${digest('targets')},
 'row_fingerprints',rows,'targets',targets,'targets_exact',targets_exact,
 'protected_count',(SELECT count(*) FROM public.advisory_matters WHERE matter_no=ANY(ARRAY[${reviewed.protected_numbers.map(q).join(',')}])),
 'external_references',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY table_name COLLATE "C"),'[]') FROM refs r),
 'reviewed_special_evidence',jsonb_build_object('time_023_minutes',(SELECT coalesce(sum(minutes),0) FROM public.advisory_time_logs WHERE advisory_matter_id=${q(reviewed.targets[10].id)}::uuid),
 'snapshot_matters',(SELECT coalesce(jsonb_agg(m.matter_no ORDER BY m.matter_no COLLATE "C"),'[]') FROM public.advisory_journey_snapshots s JOIN public.advisory_matters m ON m.id=s.matter_id WHERE m.matter_no=ANY(ARRAY[${reviewed.special_evidence.snapshot_matters.map(q).join(',')}])),
 'audit_014_count',(SELECT count(*) FROM public.case_audit_logs a WHERE a.table_name LIKE 'advisory_%' AND a.record_id IN(
 SELECT ${q(reviewed.targets[1].id)} ${Object.entries(owned).filter(([t])=>t!=='advisory_matters').map(([t,col])=>`UNION SELECT to_jsonb(x)->>'id' FROM public.${t} x WHERE x.${col}=${q(reviewed.targets[1].id)}::uuid`).join('\n')})))) FROM raw`;
}
function footprint(){return `SELECT jsonb_build_object('functions',(${functionsSql(true)}),'relations',(SELECT coalesce(jsonb_object_agg(c.relname,${relationEvidence('c',true)}),'{}') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v') AND ${isAdded}),
 'guards',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) ORDER BY c.relname COLLATE "C",t.tgname COLLATE "C"),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND t.tgname LIKE 'advisory095_%' AND c.relname<>'advisory_matter_archives'))`;}
function core(){
 const targets=`CREATE FUNCTION public.advisory095_targets() RETURNS TABLE(id uuid,matter_no text) LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $targets$ VALUES ${values()}; $targets$;\n`;
 const capture=`CREATE FUNCTION public.advisory095_capture() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $capture$ ${snapshot()}; $capture$;\n`;
 let sql=targets+capture+fs.readFileSync(root+'/scripts/sql/advisory_archive_095_contract.sql','utf8')+'\n';
 for(const [table,view] of Object.entries(views))sql+=`CREATE VIEW public.${view} WITH (security_invoker=true,security_barrier=true) AS SELECT b.* FROM public.${table} b WHERE public.advisory095_operational(b.${owned[table]});\nREVOKE ALL ON public.${view} FROM PUBLIC,anon,authenticated,service_role; GRANT SELECT ON public.${view} TO authenticated;\n`;
 for(const [table,col] of Object.entries(owned))sql+=`CREATE TRIGGER advisory095_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.advisory095_write_guard('${col}');\n`;
 for(const sig of changedFunctions){const original=G.afterContract.functions[sig].definition;
  // Change relation reads only: preserve %rowtype declarations, guards, output shape and workflow logic.
  const def=original.replaceAll(/(from|join) public\.advisory_matters\b/gi,'$1 public.advisory_operational_matters');assert.notEqual(def,original);sql+=def+';\n';}
 for(const signature of ['advisory095_targets()','advisory095_capture()','advisory095_operational(uuid)','advisory095_write_guard()','advisory095_archive_immutable()','advisory095_archive_uat(uuid,text,jsonb)']){
  sql+=`ALTER FUNCTION public.${signature} OWNER TO postgres; REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated,service_role;\n`;
 }
 sql+='GRANT EXECUTE ON FUNCTION public.advisory095_operational(uuid),public.advisory095_archive_uat(uuid,text,jsonb) TO authenticated;\n';return sql;
}
const expected=()=>fs.existsSync(contractPath)?JSON.parse(fs.readFileSync(contractPath)):null;
function migration(){return `-- 095 forward-only archive foundation. No archive/data mutation until separate Human Apply.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $guard$ DECLARE current_contract jsonb; foundation jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY095_OWNER_REQUIRED'; END IF;
 IF to_regclass('public.advisory_matter_archives') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'advisory095_%') OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${Object.values(views).map(q).join(',')})) THEN RAISE EXCEPTION 'ADVISORY095_ALREADY_PRESENT'; END IF;
 ${foundationSql()} INTO foundation; IF EXISTS(SELECT 1 FROM jsonb_each(foundation) v WHERE v.value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'ADVISORY095_ACCEPTED_FOUNDATION_DRIFT: %',foundation; END IF;
 ${functionsSql()} INTO current_contract;
 IF current_contract IS DISTINCT FROM ${j(priorFunctions)} THEN RAISE EXCEPTION 'ADVISORY095_ACCEPTED_CONTRACT_DRIFT'; END IF;
END $guard$;
CREATE TEMP TABLE advisory095_before ON COMMIT DROP AS ${snapshot()};
${core()}
DO $preserve$ DECLARE b jsonb; a jsonb; f jsonb; BEGIN
 SELECT * INTO b FROM advisory095_before; ${snapshot()} INTO a;
 IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'ADVISORY095_PRESERVATION_FAILED'; END IF;
 ${footprint()} INTO f;
 IF f IS DISTINCT FROM ${j(expected()||{})} THEN RAISE EXCEPTION 'ADVISORY095_INSTALLED_CONTRACT_DRIFT'; END IF;
END $preserve$;
COMMIT;\n`;}
function verifyPins(p){for(const k of ['rows_sha256','preserved_sha256','targets_sha256'])if(p[k])assert.match(p[k],/^[a-f0-9]{64}$/);if(p.candidate_sha256)assert.equal(p.candidate_sha256,A.hash(migration()));}
const baseline=p=>Object.fromEntries(['rows_sha256','preserved_sha256','targets_sha256'].map(k=>[k,p[k]||null]));
function gate(post,p={}){verifyPins(p);const sha=A.hash(migration());const archiveCte=`archived AS MATERIALIZED (SELECT (r->>'matter_id')::uuid matter_id,r->>'matter_no' matter_no,(r->>'archived_by')::uuid archived_by,(r->>'request_id')::uuid request_id,r->>'reviewed_matter_sha256' reviewed_matter_sha256,r->'reviewed_baseline' reviewed_baseline FROM (SELECT x.row_data::jsonb r FROM XMLTABLE('/table/row' PASSING query_to_xml(CASE WHEN to_regclass('public.advisory_matter_archives') IS NULL THEN 'SELECT NULL::text row_data WHERE false' ELSE 'SELECT to_jsonb(a)::text row_data FROM public.advisory_matter_archives a' END,false,false,'') COLUMNS row_data text PATH 'row_data') x) src)`;return `-- 095 ${post?'POST-ARCHIVE VERIFIER':'PREFLIGHT'}: ONE SELECT ONLY. No business/helper RPC execution.
WITH state AS MATERIALIZED (${snapshot()}), functions AS (${functionsSql()}), installed AS (${footprint()}),foundation AS (${post?"SELECT '{}'::jsonb":foundationSql()}),${archiveCte},
checks AS (SELECT jsonb_build_object('owner',current_user='postgres','targets_exact',(s->>'targets_exact')::boolean,'protected_nine_present',(s->>'protected_count')::int=9,
 'no_direct_finance_case_ownership',s->'external_references'='[]'::jsonb,
 'reviewed_time_023',(s#>>'{reviewed_special_evidence,time_023_minutes}')::bigint=90,
 'reviewed_audit_014',(s#>>'{reviewed_special_evidence,audit_014_count}')::bigint>0,
 'reviewed_snapshots_019_023',s#>'{reviewed_special_evidence,snapshot_matters}'=${j(reviewed.special_evidence.snapshot_matters)},
 ${post?`'installed_contract_exact',i=${j(expected()||{})},
 'reviewed_baseline_bound',${j(baseline(p))}->>'rows_sha256' IS NOT NULL AND ${j(baseline(p))}->>'preserved_sha256' IS NOT NULL AND ${j(baseline(p))}->>'targets_sha256' IS NOT NULL,
 'historical_shared_rows_unchanged',s->>'rows_sha256' IS NOT DISTINCT FROM ${p.rows_sha256?q(p.rows_sha256):'NULL::text'},
 'unrelated_objects_unchanged',s->>'preserved_sha256' IS NOT DISTINCT FROM ${p.preserved_sha256?q(p.preserved_sha256):'NULL::text'},
 'target_identity_unchanged',s->>'targets_sha256' IS NOT DISTINCT FROM ${p.targets_sha256?q(p.targets_sha256):'NULL::text'},
 'exact_eleven_archived',(SELECT count(*)=11 AND bool_and(m.matter_no=a.matter_no AND a.reviewed_matter_sha256=${digest('to_jsonb(m)')} AND a.reviewed_baseline=${j(baseline(p))}${p.admin_id?' AND a.archived_by='+q(p.admin_id)+'::uuid':''}${p.request_id?' AND a.request_id='+q(p.request_id)+'::uuid':''}) FROM archived a LEFT JOIN public.advisory_matters m ON m.id=a.matter_id WHERE a.matter_id=ANY(ARRAY[${reviewed.targets.map(t=>q(t.id)+'::uuid').join(',')}])),
 'no_other_archives',(SELECT count(*)=11 FROM archived),
 'protected_not_archived',NOT EXISTS(SELECT 1 FROM archived a JOIN public.advisory_matters m ON m.id=a.matter_id WHERE m.matter_no=ANY(ARRAY[${reviewed.protected_numbers.map(q).join(',')}])),
 'operational_matter_exclusion',NOT EXISTS(SELECT 1 FROM public.advisory_matters m WHERE m.id=ANY(ARRAY[${reviewed.targets.map(t=>q(t.id)+'::uuid').join(',')}]) AND NOT EXISTS(SELECT 1 FROM archived a WHERE a.matter_id=m.id))`
 :`'accepted_read_guard_contract',f=${j(priorFunctions)},'accepted_advisory_foundation',NOT EXISTS(SELECT 1 FROM jsonb_each(foundation) v WHERE v.value IS DISTINCT FROM 'true'::jsonb),'no_existing_archive_contract',to_regclass('public.advisory_matter_archives') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'advisory095_%') AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${Object.values(views).map(q).join(',')}))`}) value
 FROM state x(s),functions y(f),installed z(i),foundation w(foundation)),
failed AS(SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failed.value='[]'::jsonb,'failed_checks',failed.value,'checks',checks.value,
 'candidate_sha256','${sha}','rows_sha256',s->'rows_sha256','preserved_sha256',s->'preserved_sha256','targets_sha256',s->'targets_sha256',
 'row_fingerprints',s->'row_fingerprints','target_fingerprints',s->'targets','external_references',s->'external_references','reviewed_special_evidence',s->'reviewed_special_evidence',
 'eligible_human_apply_admins',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(staff_name,''),full_name)) ORDER BY id),'[]') FROM public.user_profiles WHERE role='admin' AND active AND NOT must_change_password),
 'production_mutation',false,'business_rpc_executed',false,'historical_migration',false,'broader_finance_differences_accepted',false)
FROM state x(s),checks,failed;\n`;}
function applySql(p={}){verifyPins(p);for(const k of ['admin_id','request_id'])if(p[k])assert.match(p[k],/^[a-f0-9-]{36}$/i);
 return `-- HUMAN APPLY ONLY: installs 095 and archives the exact reviewed 11 atomically.
-- FAIL CLOSED until Human-reviewed Preflight hashes, explicit Admin UUID and request ID are bound.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $review$ BEGIN
 IF ${j(p)}->>'admin_id' IS NULL OR ${j(p)}->>'request_id' IS NULL OR ${j(baseline(p))}->>'rows_sha256' IS NULL OR ${j(baseline(p))}->>'preserved_sha256' IS NULL OR ${j(baseline(p))}->>'targets_sha256' IS NULL THEN RAISE EXCEPTION 'ADVISORY095_HUMAN_BASELINE_AND_ACTOR_NOT_BOUND'; END IF;
END $review$;
${migration().replace('BEGIN;','').replace(/COMMIT;\s*$/,'')}
-- SQL Editor runs as postgres. Explicit reviewed actor, never automatic impersonation/first Admin.
SELECT set_config('request.jwt.claim.sub',${p.admin_id?q(p.admin_id):"''"},true),set_config('request.jwt.claims',${q(JSON.stringify({sub:p.admin_id||null,role:'authenticated'}))},true);
SET LOCAL ROLE authenticated;
SELECT public.advisory095_archive_uat(${p.request_id?q(p.request_id)+'::uuid':'NULL::uuid'},'Human-approved UAT operational archive: ADV-2026-013..023',${j(baseline(p))});
RESET ROLE;
COMMIT;\n`;}
function generate(){const p=JSON.parse(fs.readFileSync(pinsPath));fs.writeFileSync(candidate,migration());fs.writeFileSync(preflight,gate(false));fs.writeFileSync(verifier,gate(true,p));fs.writeFileSync(apply,applySql(p));}
module.exports={G,A,q,root,reviewed,candidate,preflight,apply,verifier,contractPath,pinsPath,changedFunctions,views,owned,priorFunctions,functionsSql,foundationSql,snapshot,footprint,core,migration,gate,applySql,generate,baseline};
if(require.main===module){const op=process.argv[2];if(op==='--generate')generate();else if(op==='--check'){const p=JSON.parse(fs.readFileSync(pinsPath));for(const [file,content]of [[candidate,migration()],[preflight,gate(false)],[verifier,gate(true,p)],[apply,applySql(p)]])assert.equal(fs.readFileSync(file,'utf8'),content,file);}else if(op==='--bind'){const [rows_sha256,preserved_sha256,targets_sha256,admin_id,request_id]=process.argv.slice(3);assert.equal(process.argv.length,8);const p={candidate_sha256:A.hash(migration()),rows_sha256,preserved_sha256,targets_sha256,admin_id,request_id};verifyPins(p);applySql(p);fs.writeFileSync(pinsPath,JSON.stringify(p,null,2)+'\n');generate();}else throw Error('Use --generate, --check, or --bind ROWS_SHA PRESERVED_SHA TARGETS_SHA ADMIN_UUID REQUEST_UUID');console.log('095 offline '+op+' SHA-256 '+A.hash(migration()));}
