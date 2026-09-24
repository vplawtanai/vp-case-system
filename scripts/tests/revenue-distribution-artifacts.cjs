/* eslint-disable @typescript-eslint/no-require-imports */
// Offline exporters only. Nothing here opens a database connection.
const fs=require('node:fs'),assert=require('node:assert/strict');
const prior=require('./direct-money-documents-artifacts.cjs');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
const {candidatePath,contractPath}=require('./revenue-distribution-contract.cjs');
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const source=()=>fs.readFileSync(candidatePath,'utf8');
const files={preflight:'scripts/sql/preflight_revenue_distribution_067.sql',dryRun:'scripts/sql/dry_run_revenue_distribution_067.sql',verifier:'scripts/sql/verify_revenue_distribution_067.sql'};
const hash=sql=>`encode(sha256(convert_to((${sql})::text,'UTF8')),'hex')`;
function rowsSql(tables){return `select jsonb_object_agg(name,value order by name) value from (values ${tables.map(t=>`(${q(t)},(select jsonb_build_object('count',count(*),'sha256',${hash("coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text collate \"C\"),'[]')")}) from public.${t} r))`).join(',')}) r(name,value)`;}
function captureSql(c){
 const f=prior.functionsSql.replace("and p.prokind='f'",`and p.prokind='f' and p.proname in (${list(c.scope.functionNames)})`);
 const t=prior.catalogSql.replace("and c.relkind in ('r','p','v')",`and c.relkind in ('r','p','v') and c.relname in (${list(c.scope.tableNames)})`);
 const compact=(s,k)=>`select coalesce(jsonb_object_agg(v->>${q(k)},${hash('v')}),'{}') value from (${s}) d cross join lateral jsonb_array_elements(d.value) v`;
 return `select jsonb_build_object('functions',f.value,'catalog',c.value,'views',(select coalesce(jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)),'{}') from pg_class where relnamespace='public'::regnamespace and relkind='v' and relname in (${list(c.scope.tableNames)})),'rows',r.value) value from (${compact(f,'signature')}) f cross join (${compact(t,'name')}) c cross join (${rowsSql(c.scope.rowTables)}) r`;
}
const v1Check=`not exists(select 1 from public.finance_vp_revenue_distributions d where d.source_snapshot_json->>'policy_version' is distinct from 'vp_distribution_v1' or public.vp_received_frozen(d.source_snapshot_json) is distinct from d.source_snapshot_json)`;
const v2Check=`public.vp_distribution_policy('{"policy_version":"vp_distribution_v1","lines":[{"classification":"professional_fee","base":10000,"vat":700,"wht":300,"professional_pool":9700},{"classification":"additional_service","base":4000,"vat":280,"wht":120,"professional_pool":0,"company_economic":4000,"company_cash":3880}],"totals":{"professional_pool":9700},"blockers":[]}'::jsonb,'vp_distribution_v2') = '{"policy_version":"vp_distribution_v2","lines":[{"classification":"professional_fee","base":10000,"vat":700,"wht":300,"professional_pool":10000},{"classification":"additional_service","base":4000,"vat":280,"wht":120,"professional_pool":0,"company_economic":4000,"company_cash":3880}],"totals":{"professional_pool":10000},"blockers":[]}'::jsonb`;
function differences(a,e){return `select coalesce(jsonb_agg(jsonb_build_object('section',s,'object',k,'expected',${e}->s->k,'actual',${a}->s->k) order by s,k),'[]') from unnest(array['functions','catalog','views','rows']) s cross join lateral (select jsonb_object_keys(${e}->s) k union select jsonb_object_keys(${a}->s) k) keys where ${a}->s->k is distinct from ${e}->s->k`;}
function checkSql(c,post=false,b=null){
 const expected={...(post?c.after:c.before),...(b?{rows:b.state.rows}:{})},es=q(JSON.stringify(expected));
 return `with expected as(select ${es}::jsonb value), actual as materialized(${captureSql(c)}),
 compared as(select actual.value actual,expected.value||jsonb_build_object('rows',coalesce(expected.value->'rows',actual.value->'rows')) expected from actual,expected),
 differences as(select (${differences('actual','expected')}) value from compared),
 checks as(select * from (values
 ('candidate_sha256_exact',${post?'true':hash(q(source()))+'='+q(c.candidateSha)}),
 ('expected_manifest_exact',(select ${hash('value')}=${q(fingerprint(expected))} from expected)),
 ('dependency_functions_exact',not exists(select 1 from differences,jsonb_array_elements(value) v where v->>'section'='functions')),
 ('dependency_catalog_security_exact',not exists(select 1 from differences,jsonb_array_elements(value) v where v->>'section' in('catalog','views'))),
 ('target_state_exact',(select count(*)=${post?c.scope.created.length:0} from actual,jsonb_object_keys(value->'functions') k where split_part(k,'(',1) in (${list(c.scope.created)}))),
 ('historical_rows_unchanged',${b?'(select actual->\'rows\'=expected->\'rows\' from compared)':'true'}),
 ('historical_v1_reconstructs',${v1Check}),
 ('v2_authoritative_basis',${post?v2Check:'true'})
 ) checks(name,pass))
 select bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name) filter(where pass is distinct from true),'[]') failed_checks,
 ${q(c.candidateSha)}::text candidate_sha256,${b?q(b.state_sha256):'null::text'} approved_baseline_sha256,
 ${b?"(select actual->'rows'=expected->'rows' from compared)":'null::boolean'} historical_rows_unchanged,
 (select coalesce(jsonb_agg(v),'[]') from differences,jsonb_array_elements(value) v where v->>'section'='functions') function_differences,
 (select coalesce(jsonb_agg(v),'[]') from differences,jsonb_array_elements(value) v where v->>'section' in('catalog','views')) catalog_differences,
 (select value from differences) object_differences,
 (select jsonb_build_object('candidate_sha256',${q(c.candidateSha)},'manifest_sha256',${q(c.manifestSha)},'captured_at',statement_timestamp(),'gate_pass',(select bool_and(coalesce(pass,false)) from checks),'state_sha256',${hash('value')},'state',value,'broader_unresolved_differences',490) from actual) baseline
 from checks`;
}
function preflight(c){return '-- 067 SELECT-only Preflight. Preserve the entire result JSON locally. No candidate execution.\n-- Exact post-066 dependencies; the 490 broader differences remain unresolved, not accepted.\n'+checkSql(c)+';\n';}
function verifier(c,b){assert.ok(b,'Approved 067 PASS baseline required');return '-- 067 SELECT-only Post-Apply Verifier. No DDL/DML or mutable application RPC.\n-- Exact candidate bytes verified offline; immutable policy reconstruction only.\n'+checkSql(c,true,b)+';\n';}
function dryRun(c,b){assert.ok(b,'Approved 067 PASS baseline required');const before={...c.before,rows:b.state.rows},after={...c.after,rows:b.state.rows};return `-- 067 compact ROLLBACK-ONLY rehearsal. Execute the complete file.
-- Any exception/SQL error is a FAILED gate even if a client continues to later statements.
-- Approved baseline ${b.state_sha256}; broader 490 differences remain unresolved.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${c.scope.rowTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
DO $gate067$
DECLARE actual jsonb; expected jsonb:=${q(JSON.stringify(before))}::jsonb; failures jsonb;
 capture_sql text:=${q(captureSql(c))}; candidate_sql text:=$candidate067$${source()}$candidate067$;
BEGIN
 IF ${hash('candidate_sql')}<>${q(c.candidateSha)} THEN RAISE EXCEPTION '067 CANDIDATE HASH MISMATCH'; END IF;
 EXECUTE capture_sql INTO actual;
 ${differences('actual','expected')} INTO failures;
 IF failures<>'[]'::jsonb OR NOT (${v1Check}) THEN RAISE EXCEPTION '067 PRECONDITIONS FAILED: %',failures; END IF;
 EXECUTE candidate_sql;
 SET CONSTRAINTS ALL IMMEDIATE;
 expected:=${q(JSON.stringify(after))}::jsonb;
 EXECUTE capture_sql INTO actual;
 ${differences('actual','expected')} INTO failures;
 IF failures<>'[]'::jsonb OR NOT (${v1Check}) OR NOT (${v2Check}) THEN RAISE EXCEPTION '067 POSTCONDITIONS FAILED: %',failures; END IF;
END;
$gate067$;
ROLLBACK;
-- Independently verify restored state after explicit rollback.
WITH actual AS (${captureSql(c)}), expected AS (SELECT ${q(JSON.stringify(before))}::jsonb value),
audit AS (SELECT (${differences('actual.value','expected.value')}) failures FROM actual,expected)
SELECT failures='[]'::jsonb gate_pass,failures='[]'::jsonb rollback_verified,failures failed_checks,
${q(c.candidateSha)}::text candidate_sha256,${q(b.state_sha256)}::text approved_baseline_sha256,
not exists(select 1 from jsonb_array_elements(failures) v where v->>'section'='rows') historical_rows_unchanged FROM audit;
`;}
// Production manually completed this gate. Preserve the exact reviewed static
// SQL bytes; runtime generators below remain available only for local fixtures.
const approved={candidateSha:'7abd546c20e0a5e7d8fc14e72bfbefd0f4349617ead54f1bb51a8e15d79e5589',
 manifestSha:'5e606ae7149380dd546cd03f1217f874935b90395c67a01ba117e997daa524c4',
 stateSha:'0638051f9a8422a4930bea2a0f1a97aa190b42c2cdf204a556b1809335336448'};
const reviewedGateHashes={
 [files.dryRun]:'d1e15f14ffa921e0a13ddc2046ffce5c1f5a457364acfa46b3e17040d0daea31',
 [files.verifier]:'2de38abf0d4d510a698257a80208fdad31be9becaef2b2b2c35bfca60a0c3776'
};
function validate(){
 const c=JSON.parse(fs.readFileSync(contractPath)),{manifestSha,...body}=c;
 assert.equal(fingerprint(body),manifestSha);assert.equal(manifestSha,approved.manifestSha);
 assert.equal(c.candidateSha,approved.candidateSha);assert.equal(prior.sha(source()),approved.candidateSha);
 for(const [p,h] of Object.entries(c.appliedMigrationHashes))assert.equal(prior.sha(fs.readFileSync('supabase/migrations/'+p)),h,p+' changed');
 assert.equal(fs.readFileSync(files.preflight,'utf8'),preflight(c),'Approved Preflight changed');
 for(const [p,h] of Object.entries(reviewedGateHashes)){
  const sql=fs.readFileSync(p,'utf8');assert.equal(prior.sha(sql),h,'Reviewed static gate changed: '+p);
  for(const pin of Object.values(approved))assert.ok(sql.includes(pin),'Missing approved hash: '+p);
  assert.ok(Buffer.byteLength(sql)<250000);assert.ok(!sql.includes('REQUIRES_APPROVED_067_PASS_BASELINE'));
 }
 const embedded=fs.readFileSync(files.dryRun,'utf8').split('$candidate067$');
 assert.equal(embedded.length,3);assert.equal(embedded[1],source(),'Embedded candidate changed');
 return c;
}
function baselineFrom(p,c){let b=JSON.parse(fs.readFileSync(p));b=Array.isArray(b)?b[0]:b;b=b.baseline||b;assert.equal(b.gate_pass,true);assert.equal(b.candidate_sha256,c.candidateSha);assert.equal(b.manifest_sha256,c.manifestSha);assert.equal(fingerprint(b.state),b.state_sha256);for(const k of ['functions','catalog','views'])assert.deepEqual(b.state[k],c.before[k]);assert.deepEqual(Object.keys(b.state.rows).sort(),c.scope.rowTables);return b;}
if(require.main===module){
 const args=process.argv.slice(2),mode=args[0];
 assert.ok(args.length<=1&&[undefined,'--preflight','--dry-run','--verify'].includes(mode),'Use --preflight, --dry-run or --verify without a baseline file; completed gates are read-only artifacts');
 const c=validate();
 if(mode)process.stdout.write(fs.readFileSync(mode==='--preflight'?files.preflight:mode==='--dry-run'?files.dryRun:files.verifier,'utf8'));
 else console.log('067 approved candidate / manifest / static gates / applied migration hashes PASS '+c.candidateSha);
}
module.exports={files,source,captureSql,rowsSql,v1Check,v2Check,checkSql,differences,preflight,dryRun,verifier,validate,baselineFrom};
