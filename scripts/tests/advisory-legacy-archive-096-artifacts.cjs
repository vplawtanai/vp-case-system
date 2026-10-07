/* eslint-disable @typescript-eslint/no-require-imports */
// Offline only. Reuse accepted 095 catalog normalization; never regenerate 095.
const fs=require('node:fs'),assert=require('node:assert/strict');
const H=require('./advisory-archive-artifacts.cjs'),{A,q,root}=H;
const candidate=root+'/supabase/migrations/202610070096_advisory_legacy_operational_archive.sql';
const preflight=root+'/scripts/sql/preflight_advisory_archive_096.sql',apply=root+'/scripts/sql/apply_advisory_archive_096.sql',verifier=root+'/scripts/sql/verify_advisory_archive_096.sql';
const contractPath=__dirname+'/fixtures/advisory-096-contract.json',pinsPath=__dirname+'/fixtures/advisory-096-reviewed-baseline.json';
const numbers=Array.from({length:9},(_,i)=>'ADV-2026-'+String(i+4).padStart(3,'0'));
const numberSql=`ARRAY[${numbers.map(q).join(',')}]`,j=x=>q(JSON.stringify(x))+'::jsonb';
const digest=x=>`encode(sha256(convert_to((${x})::text,'UTF8')),'hex')`;
const accepted095=JSON.parse(fs.readFileSync(H.contractPath)),reviewed095=JSON.parse(fs.readFileSync(H.pinsPath));
assert.equal(A.hash(fs.readFileSync(H.candidate,'utf8')),'411182e4bed6f1ca2b4505aa765a1ef7aa0774f22f00e0769e5dffd72cec63c7');
const priorValues=H.reviewed.targets.map(t=>`(${q(t.id)}::uuid,${q(t.matter_no)})`).join(',');
const priorBaseline=H.baseline(reviewed095);
const keys=['rows_sha256','preserved_sha256','targets_sha256','prior_archives_sha256','targets','external_references'];
const baseline=p=>Object.fromEntries(keys.map(k=>[k,p[k]??null]));
// Reuse the installed archive guards/views, not 095's whole-database capture.
const archive095=structuredClone(accepted095);
for(const sig of ['advisory095_capture()','advisory095_targets()','advisory095_archive_uat(uuid,text,jsonb)'])delete archive095.functions[sig];
function archiveFootprint(){return H.footprint().replace("p.proname LIKE 'advisory095_%'", "p.proname IN ('advisory095_operational','advisory095_write_guard','advisory095_archive_immutable')");}
const historyTables=['advisory_control_requests','advisory_journey_requests','case_audit_logs'];
const related={...H.owned,office_work_logs:'related_advisory_matter_id'};
const scopedTables=[...Object.keys(related),...historyTables];
function foundationSql(){
 const accepted=JSON.parse(fs.readFileSync(H.G.footprintPath));
 // Only the Admin check and immutable snapshot/request history used by this operation.
 const funcs=['advisory086_admin()','advisory086_immutable()'];
 const tables=['advisory_journey_snapshots','advisory_journey_requests'];
 const sql=H.G.footprint().replaceAll("and not tgisinternal)","and not tgisinternal and tgname not like 'advisory095_%')");
 return `WITH journey AS (${sql}) SELECT jsonb_build_object(
 ${funcs.map(k=>q(k)+`,j#>ARRAY['functions',${q(k)}]=${j(accepted.functions[k])}`).concat(tables.map(k=>q(k)+`,j#>ARRAY['tables',${q(k)}]=${j(accepted.tables[k])}`)).join(',')}) FROM journey x(j)`;
}
function snapshot(){
 const children=Object.entries(related).map(([table,col])=>`SELECT t.matter_no,${q(table)} table_name,to_jsonb(c) facts FROM public.${table} c JOIN targets t ON c.${col}=t.id`).join(' UNION ALL\n');
 // Keep the existing reference discovery, but fingerprint only matching Finance rows.
 const old=H.snapshot();
 const refs=old.slice(old.indexOf('ref_columns AS ('),old.indexOf(',\n refs AS MATERIALIZED'))
  .replace("(c.relname LIKE 'finance_%' OR c.relname='cases' OR c.relname LIKE 'case_%') AND c.relname<>'case_audit_logs'", "c.relname LIKE 'finance_%'");
 return `WITH targets AS MATERIALIZED (SELECT id,matter_no FROM public.advisory_matters WHERE matter_no=ANY(${numberSql})),
 child_rows AS MATERIALIZED (${children}),
 tokens AS MATERIALIZED (SELECT array_agg(DISTINCT token) ids FROM (
  SELECT id::text token FROM targets UNION SELECT matter_no FROM targets UNION SELECT facts->>'id' FROM child_rows) x WHERE token IS NOT NULL),
 extra_history AS MATERIALIZED (
 ${historyTables.map(table=>`SELECT t.matter_no,${q(table)} table_name,to_jsonb(a) facts FROM public.${table} a CROSS JOIN targets t
 WHERE ${table==='case_audit_logs'?"a.table_name LIKE 'advisory_%' AND ":''}EXISTS(SELECT 1 FROM child_rows c WHERE c.matter_no=t.matter_no AND (
 strpos(to_jsonb(a)::text,t.id::text)>0 OR strpos(to_jsonb(a)::text,t.matter_no)>0 OR strpos(to_jsonb(a)::text,c.facts->>'id')>0))`).join(' UNION ALL\n')}
 ), all_rows AS MATERIALIZED (SELECT * FROM child_rows UNION ALL SELECT * FROM extra_history),
 counts AS MATERIALIZED (SELECT t.matter_no,k.table_name,count(c.facts) count,
 ${digest("coalesce(jsonb_agg(c.facts ORDER BY c.facts::text COLLATE \"C\") FILTER(WHERE c.facts IS NOT NULL),'[]'::jsonb)")} sha256
 FROM targets t CROSS JOIN unnest(ARRAY[${scopedTables.map(q).join(',')}]) k(table_name)
 LEFT JOIN all_rows c ON c.matter_no=t.matter_no AND c.table_name=k.table_name GROUP BY t.matter_no,k.table_name),
 ${refs},
 refs AS MATERIALIZED (SELECT r.relname table_name,x.evidence::jsonb evidence FROM (SELECT nspname,relname,string_agg(format('EXISTS(SELECT 1 FROM unnest(%L::text[]) tok WHERE strpos(coalesce(r.%I::text,''''),tok)>0)',tokens.ids::text,attname),' OR ' ORDER BY attname) predicate FROM ref_columns CROSS JOIN tokens GROUP BY nspname,relname) r
 CROSS JOIN LATERAL XMLTABLE('/table/row' PASSING query_to_xml(format(
 'SELECT jsonb_build_object(''n'',count(*),''sha256'',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text COLLATE "C"),''[]''::jsonb)::text,''UTF8'')),''hex''))::text evidence FROM %I.%I r WHERE %s',r.nspname,r.relname,r.predicate),false,false,'') COLUMNS evidence text PATH 'evidence') x WHERE (x.evidence::jsonb->>'n')::bigint>0),
 prior(id,matter_no) AS (VALUES ${priorValues}),installed AS (${archiveFootprint()}),foundation AS (${foundationSql()}),
 raw AS (SELECT (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY matter_no COLLATE "C",table_name COLLATE "C"),'[]') FROM counts c) rows,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'matter_no',t.matter_no,'sha256',${digest('to_jsonb(m)')}) ORDER BY t.matter_no COLLATE "C"),'[]') FROM targets t JOIN public.advisory_matters m ON m.id=t.id) targets,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('table_name',table_name)||evidence ORDER BY table_name COLLATE "C"),'[]') FROM refs) external_references)
 SELECT jsonb_build_object(
 'rows_sha256',${digest("jsonb_build_object('targets_and_history',rows,'finance_references',external_references)")},
 'preserved_sha256',${digest("jsonb_build_object('archive_contract',f,'history_guards',foundation)")},'targets_sha256',${digest('targets')},
 'row_fingerprints',rows,'targets',targets,'external_references',external_references,
 'targets_exact',(SELECT count(*)=9 AND array_agg(matter_no ORDER BY matter_no COLLATE "C")=${numberSql} FROM public.advisory_matters WHERE matter_no=ANY(${numberSql})),
 'legacy_origin_readable',NOT EXISTS(SELECT 1 FROM public.advisory_matter_activities a JOIN public.advisory_matters m ON m.id=a.matter_id WHERE m.matter_no=ANY(${numberSql}) AND a.kind='create'),
 'contract095_exact',f=${j(archive095)},
 'foundation_exact',NOT EXISTS(SELECT 1 FROM jsonb_each(foundation) x WHERE x.value IS DISTINCT FROM 'true'::jsonb),
 'prior_archives_sha256',${digest("(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.matter_id),'[]') FROM public.advisory_matter_archives a JOIN prior p ON p.id=a.matter_id)")},
 'prior_archive_exact',(SELECT count(*)=11 AND coalesce(bool_and(a.matter_no=p.matter_no AND a.reviewed_baseline=${j(priorBaseline)} AND a.archived_by=${q(reviewed095.admin_id)}::uuid AND a.request_id=${q(reviewed095.request_id)}::uuid),false) FROM prior p JOIN public.advisory_matter_archives a ON a.matter_id=p.id)
 ) FROM raw,installed y(f),foundation z(foundation)`;
}
function footprint(){return `SELECT coalesce(jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))),'{}') FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname LIKE 'advisory096_%'`;}
const expected=()=>fs.existsSync(contractPath)?JSON.parse(fs.readFileSync(contractPath)):{};
function core(){return `CREATE FUNCTION public.advisory096_capture() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $capture$ ${snapshot()}; $capture$;
${fs.readFileSync(root+'/scripts/sql/advisory_archive_096_contract.sql','utf8')}
ALTER FUNCTION public.advisory096_capture() OWNER TO postgres;
ALTER FUNCTION public.advisory096_archive_legacy(uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.advisory096_capture(),public.advisory096_archive_legacy(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.advisory096_archive_legacy(uuid,text,jsonb) TO authenticated;
`;}
function migration(){return `-- 096 fixed Legacy batch contract only. Human Apply is a separate reviewed artifact.
-- 095 and its eleven archive receipts remain immutable. No new table/column or backfill.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $guard$ DECLARE f jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY096_OWNER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'advisory096_%') THEN RAISE EXCEPTION 'ADVISORY096_ALREADY_PRESENT'; END IF;
 ${archiveFootprint()} INTO f;
 IF f IS DISTINCT FROM ${j(archive095)} THEN RAISE EXCEPTION 'ADVISORY096_ACCEPTED095_DRIFT'; END IF;
END $guard$;
CREATE TEMP TABLE advisory096_before ON COMMIT DROP AS ${snapshot()};
DO $foundation$ DECLARE s jsonb; BEGIN SELECT * INTO s FROM advisory096_before;
 IF NOT coalesce((s->>'foundation_exact')::boolean,false) THEN RAISE EXCEPTION 'ADVISORY096_ACCEPTED_FOUNDATION_DRIFT'; END IF;
END $foundation$;
${core()}
DO $preserve$ DECLARE v_before096 jsonb; v_after096 jsonb; v_contract096 jsonb; BEGIN
 SELECT * INTO v_before096 FROM advisory096_before; ${snapshot()} INTO v_after096;
 IF v_after096 IS DISTINCT FROM v_before096 THEN RAISE EXCEPTION 'ADVISORY096_PRESERVATION_FAILED'; END IF;
 ${footprint()} INTO v_contract096;
 IF v_contract096 IS DISTINCT FROM ${j(expected())} THEN RAISE EXCEPTION 'ADVISORY096_INSTALLED_CONTRACT_DRIFT'; END IF;
END $preserve$;
COMMIT;
`;}
function validate(p){
 for(const k of keys.filter(k=>k.endsWith('sha256')))if(p[k]!=null)assert.match(p[k],/^[0-9a-f]{64}$/);
 if(p.targets!=null){assert.deepEqual(p.targets.map(t=>t.matter_no),numbers);assert.equal(new Set(p.targets.map(t=>t.id)).size,9);for(const t of p.targets){assert.match(t.id,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);assert.match(t.sha256,/^[0-9a-f]{64}$/);assert.ok(!H.reviewed.targets.some(u=>u.id===t.id));}}
 if(p.external_references!=null)assert.ok(Array.isArray(p.external_references));
 for(const k of ['admin_id','request_id'])if(p[k]!=null)assert.match(p[k],/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
 if(p.request_id)assert.notEqual(p.request_id,reviewed095.request_id);
 if(p.candidate_sha256)assert.equal(p.candidate_sha256,A.hash(migration()));
}
function gate(post,p={}){validate(p);return `-- 096 ${post?'POST-ARCHIVE VERIFIER (supersedes 095 operation-specific assertions)':'PREFLIGHT'}: ONE SELECT ONLY; no helper/business RPC execution.
WITH state AS MATERIALIZED (${snapshot()}),installed AS (${footprint()}),checks AS (
 SELECT jsonb_build_object('owner',current_user='postgres','targets_exact',(s->>'targets_exact')::boolean,'legacy_origin_readable',(s->>'legacy_origin_readable')::boolean,
 'accepted095_contract_preserved',(s->>'contract095_exact')::boolean,'accepted_foundation_preserved',(s->>'foundation_exact')::boolean,'prior_eleven_receipts_preserved',(s->>'prior_archive_exact')::boolean,
 ${post?`'installed096_exact',f=${j(expected())},'review_bound',${keys.map(k=>`${j(baseline(p))}->>${q(k)} IS NOT NULL`).join(' AND ')} AND ${p.admin_id?'true':'false'} AND ${p.request_id?'true':'false'},
 ${keys.map(k=>q(k+'_unchanged')+`,s->${q(k)} IS NOT DISTINCT FROM ${j(baseline(p))}->${q(k)}`).join(',\n ')},
 'exact_twenty_archived',(SELECT count(*)=20 FROM public.advisory_matter_archives),
 'exact_nine_receipts',(SELECT count(*)=9 AND coalesce(bool_and(a.matter_no=m.matter_no AND a.request_id=${p.request_id?q(p.request_id):'NULL'}::uuid AND a.archived_by=${p.admin_id?q(p.admin_id):'NULL'}::uuid AND a.archive_reason='Human-approved Legacy operational archive: ADV-2026-004..012' AND a.reviewed_baseline=${j(baseline(p))} AND a.reviewed_matter_sha256=${digest('to_jsonb(m)')}),false) FROM public.advisory_matter_archives a JOIN public.advisory_matters m ON m.id=a.matter_id WHERE m.matter_no=ANY(${numberSql})),
 'all_archived_operationally_excluded',NOT EXISTS(SELECT 1 FROM public.advisory_operational_matters m JOIN public.advisory_matter_archives a ON a.matter_id=m.id),
 ${Object.entries(H.views).filter(([base])=>base!=='advisory_matters').map(([base,view])=>q(view+'_clean')+`,NOT EXISTS(SELECT 1 FROM public.${view} v JOIN public.advisory_matter_archives a ON a.matter_id=v.${H.owned[base]})`).join(',\n ')}`:
 `'no096_contract',f='{}'::jsonb,'exact_prior_eleven_only',(SELECT count(*)=11 FROM public.advisory_matter_archives),
 'targets_not_archived',NOT EXISTS(SELECT 1 FROM public.advisory_matter_archives WHERE matter_no=ANY(${numberSql}))`}
 ) c FROM state x(s),installed y(f)),failed AS(SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') v FROM checks,jsonb_each(c) z(key,value) WHERE value IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',v='[]'::jsonb,'failed_checks',v,'checks',c,'candidate_sha256',${q(A.hash(migration()))},'accepted095_sha256',${q(reviewed095.candidate_sha256)},
 ${keys.map(k=>q(k)+`,s->${q(k)}`).join(',')},'row_fingerprints',s->'row_fingerprints',
 'eligible_human_apply_admins',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(staff_name,''),full_name)) ORDER BY id),'[]') FROM public.user_profiles WHERE role='admin' AND active AND NOT must_change_password),
 'verification_scope','096: nine targets, related history, linked Finance rows, archive guards and receipts; no auth/shared whole-table fingerprints','production_mutation',false,'business_rpc_executed',false)
FROM state x(s),checks,failed;
`;}
function applySql(p={}){validate(p);return `-- HUMAN APPLY ONLY: install 096 + archive exact nine atomically. Requires a NEW reviewed Preflight.
BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
DO $review$ BEGIN
 IF ${keys.map(k=>`${j(baseline(p))}->>${q(k)} IS NULL`).join(' OR ')} OR ${p.admin_id?'false':'true'} OR ${p.request_id?'false':'true'} THEN RAISE EXCEPTION 'ADVISORY096_HUMAN_BASELINE_AND_ACTOR_NOT_BOUND'; END IF;
END $review$;
${migration().replace('BEGIN;','').replace(/COMMIT;\s*$/,'')}
SELECT set_config('request.jwt.claim.sub',${q(p.admin_id||'')},true),set_config('request.jwt.claims',${q(JSON.stringify({sub:p.admin_id||null,role:'authenticated'}))},true);
SET LOCAL ROLE authenticated;
SELECT public.advisory096_archive_legacy(${p.request_id?q(p.request_id):'NULL'}::uuid,'Human-approved Legacy operational archive: ADV-2026-004..012',${j(baseline(p))});
RESET ROLE;
COMMIT;
`;}
function generate(){const p=JSON.parse(fs.readFileSync(pinsPath));for(const [file,text]of [[candidate,migration()],[preflight,gate(false)],[apply,applySql(p)],[verifier,gate(true,p)]])fs.writeFileSync(file,text);}
module.exports={H,A,q,root,scopedTables,archiveFootprint,candidate,preflight,apply,verifier,contractPath,pinsPath,numbers,numberSql,keys,baseline,snapshot,footprint,core,migration,gate,applySql,generate,validate};
if(require.main===module){const op=process.argv[2];if(op==='--generate')generate();else if(op==='--check'){const p=JSON.parse(fs.readFileSync(pinsPath));for(const [f,s]of [[candidate,migration()],[preflight,gate(false)],[apply,applySql(p)],[verifier,gate(true,p)]])assert.equal(fs.readFileSync(f,'utf8'),s,f);}else if(op==='--bind'){
 // Only a Human-reviewed saved Preflight result; never infer actor or generate targets.
 const [file,admin_id,request_id]=process.argv.slice(3);assert.equal(process.argv.length,6);const result=JSON.parse(fs.readFileSync(file));assert.equal(result.gate_pass,true);assert.deepEqual(result.failed_checks,[]);assert.equal(result.candidate_sha256,A.hash(migration()));assert.equal(result.accepted095_sha256,reviewed095.candidate_sha256);assert.ok(result.eligible_human_apply_admins.some(a=>a.id===admin_id));const p={candidate_sha256:result.candidate_sha256,...baseline(result),admin_id,request_id};validate(p);assert.ok(keys.every(k=>p[k]!=null));fs.writeFileSync(pinsPath,JSON.stringify(p,null,2)+'\n');fs.writeFileSync(apply,applySql(p));fs.writeFileSync(verifier,gate(true,p));
 }else throw Error('Use --generate, --check, --bind REVIEWED_PREFLIGHT_JSON ADMIN_UUID REQUEST_UUID');console.log('096 '+op+' SHA-256 '+A.hash(migration()));}
