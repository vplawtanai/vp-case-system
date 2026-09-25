/* eslint-disable @typescript-eslint/no-require-imports */
// Offline generation/validation only. No database/network execution.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {candidatePath,contractPath}=require('./company-statement-contract.cjs');
const prior=require('./revenue-distribution-artifacts.cjs'),{sha}=require('./direct-money-documents-artifacts.cjs'),{fingerprint}=require('./direct-money-documents-dry-run.cjs');
const files={preflight:'scripts/sql/preflight_company_share_statement_069.sql',dryRun:'scripts/sql/dry_run_company_share_statement_069.sql',verifier:'scripts/sql/verify_company_share_statement_069.sql'};
const pinsPath='scripts/tests/company-statement-approved-hashes.json';
const q=s=>"'"+s.replaceAll("'","''")+"'",hash=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
const source=()=>fs.readFileSync(candidatePath,'utf8');
const policyCheck=`not exists(select 1 from public.finance_vp_revenue_distributions d where d.source_snapshot_json->>'policy_version' not in ('vp_distribution_v1','vp_distribution_v2') or public.vp_received_frozen(d.source_snapshot_json) is distinct from d.source_snapshot_json)`;
const projectionCheck=`public.company_statement_frozen_share('{"policy_version":"vp_distribution_v1","blockers":[],"lines":[{"invoice_item_id":"frozen","classification":"professional_fee","professional_pool":4672.90,"vat":700,"wht":300,"company_economic":99999}]}'::jsonb,'[{"invoice_item_id":"frozen","company_share_amount":934.58,"referral_amount":0,"work_compensation_amount":3738.32}]'::jsonb) = '{"amount":934.58,"basis":4672.90}'::jsonb`;
const cte=(c,post)=>`expected as(select ${q(JSON.stringify(post?c.after:c.before))}::jsonb value),actual as materialized(${prior.captureSql(c)}),diff as(select (${prior.differences("(actual.value-'rows')","expected.value")}) value from actual,expected)`;
function preflight(c){return `-- 069 SELECT-only Preflight. Copy this entire file into Supabase SQL Editor.
-- Return only compact hashes; no JSON/CSV transfer. Preserve the PASS result.
-- Broader 490 differences remain unresolved outside this dependency surface.
WITH ${cte(c,false)}, checks AS (select * from (values
 ('candidate_sha256_exact',${hash(q(source()))}=${q(c.candidateSha)}),
 ('dependency_functions_catalog_security_exact',(select value='[]'::jsonb from diff)),
 ('target_names_absent',not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in (${c.scope.created.map(q).join(',')}))),
 ('v1_v2_preserved',${policyCheck}),('v2_basis',${prior.v2Check})
 ) checks(name,pass))
SELECT bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name) filter(where pass is distinct from true),'[]') failed_checks,
 ${q(c.candidateSha)} candidate_sha256,${q(c.manifestSha)} manifest_sha256,(select ${hash('value')} from actual) state_sha256,
 (select ${hash("value->'rows'")} from actual) historical_rows_sha256,
 (select value from diff) object_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section'='functions') function_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section' in('catalog','views')) catalog_differences,
 490 broader_unresolved_differences FROM checks;
`;}
function normalize(c,actual){const remove=Object.keys(c.after.functions).filter(s=>c.scope.created.includes(s.split('(')[0]));const restore=Object.fromEntries(Object.entries(c.before.functions).filter(([s])=>c.scope.changed.includes(s.split('(')[0])));return `${actual}||jsonb_build_object('functions',((${actual}->'functions')-ARRAY[${remove.map(q).join(',')}]::text[])||${q(JSON.stringify(restore))}::jsonb)`;}
function verifier(c,pins){return `-- 069 SELECT-only Post-Apply Verifier. No DDL/DML or mutable RPC calls.
-- Fail closed until the Production PASS Preflight state/row hashes are pinned.
-- Normalization replaces only the exact verified 069 function delta in memory.
WITH ${cte(c,true)}, normalized AS(select ${normalize(c,'value')} value from actual),checks AS(select * from (values
 ('approved_preflight_pinned',${/^[a-f0-9]{64}$/.test(pins.stateSha)&&/^[a-f0-9]{64}$/.test(pins.rowsSha)}),
 ('applied_state_exact',(select value='[]'::jsonb from diff)),
 ('frozen_share_projection',${projectionCheck}),
 ('exact_approved_baseline_matched',(select ${hash('value')}=${q(pins.stateSha)} from normalized)),
 ('historical_rows_unchanged',(select ${hash("value->'rows'")}=${q(pins.rowsSha)} from actual)),
 ('v1_v2_preserved',${policyCheck}),('v2_basis',${prior.v2Check})
 ) checks(name,pass))
SELECT bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name) filter(where pass is distinct from true),'[]') failed_checks,
 ${q(c.candidateSha)} candidate_sha256,${q(c.manifestSha)} manifest_sha256,${q(pins.stateSha)} approved_baseline_sha256,
 (select ${hash('value')}=${q(pins.stateSha)} from normalized) exact_approved_baseline_matched,
 (select ${hash("value->'rows'")}=${q(pins.rowsSha)} from actual) historical_rows_unchanged,
 (select value='[]'::jsonb from diff) applied_state_exact,(select value from diff) object_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section'='functions') function_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section' in('catalog','views')) catalog_differences
FROM checks;
`;}
function dryRun(c,pins){return `-- 069 ROLLBACK-ONLY. Run COMPLETE file; any SQL error is a failed gate.
-- Fail closed until the Production PASS Preflight hashes are pinned. No JSON export.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${c.scope.rowTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
DO $gate069$
DECLARE actual jsonb; baseline jsonb; failures jsonb; expected jsonb;
 capture_sql text:=${q(prior.captureSql(c))}; candidate_sql text:=$candidate069$${source()}$candidate069$;
BEGIN
 IF ${hash('candidate_sql')}<>${q(c.candidateSha)} THEN RAISE EXCEPTION '069_CANDIDATE_HASH_MISMATCH'; END IF;
 EXECUTE capture_sql INTO baseline;
 IF ${hash('baseline')}<>${q(pins.stateSha)} OR ${hash("baseline->'rows'")}<>${q(pins.rowsSha)} THEN RAISE EXCEPTION '069_APPROVED_PREFLIGHT_REQUIRED_OR_BASELINE_CHANGED'; END IF;
 actual:=baseline; expected:=${q(JSON.stringify(c.before))}::jsonb||jsonb_build_object('rows',baseline->'rows');
 ${prior.differences('actual','expected')} INTO failures;
 IF failures<>'[]'::jsonb OR NOT (${policyCheck}) OR NOT (${prior.v2Check}) THEN RAISE EXCEPTION '069_PRECONDITION_FAILED: %',failures; END IF;
 EXECUTE candidate_sql;
 SET CONSTRAINTS ALL IMMEDIATE;
 EXECUTE capture_sql INTO actual;expected:=${q(JSON.stringify(c.after))}::jsonb||jsonb_build_object('rows',baseline->'rows');
 ${prior.differences('actual','expected')} INTO failures;
 IF failures<>'[]'::jsonb OR NOT (${policyCheck}) OR NOT (${prior.v2Check}) OR NOT (${projectionCheck}) THEN RAISE EXCEPTION '069_POSTCONDITION_FAILED: %',failures; END IF;
END;
$gate069$;
ROLLBACK;
-- Independently capture restored definitions/security/business rows after rollback.
WITH actual AS (${prior.captureSql(c)}),checks AS(select ${hash('value')}=${q(pins.stateSha)} restored,${hash("value->'rows'")}=${q(pins.rowsSha)} rows_unchanged from actual)
SELECT restored AND rows_unchanged gate_pass,restored AND rows_unchanged rollback_verified,
 case when restored AND rows_unchanged then '[]'::jsonb else '["restored_state_mismatch"]'::jsonb end failed_checks,
 rows_unchanged historical_rows_unchanged,${q(c.candidateSha)} candidate_sha256,${q(c.manifestSha)} manifest_sha256,${q(pins.stateSha)} approved_baseline_sha256
FROM checks;
`;}
function artifacts(c,pins){
 // Approve each manual gate separately; Dry-run pins must not prepare Verifier.
 if(pins.dryRun){assert.equal(pins.dryRun.candidateSha,c.candidateSha);assert.equal(pins.dryRun.manifestSha,c.manifestSha);}
 return {[files.preflight]:preflight(c),[files.dryRun]:dryRun(c,pins.dryRun||pins),[files.verifier]:verifier(c,pins)};
}
function validate(){const c=JSON.parse(fs.readFileSync(contractPath)),{manifestSha,...body}=c,pins=JSON.parse(fs.readFileSync(pinsPath));assert.equal(fingerprint(body),manifestSha);assert.equal(sha(source()),c.candidateSha);for(const [p,h] of Object.entries(c.appliedMigrationHashes))assert.equal(sha(fs.readFileSync(p)),h,p);for(const [file,sql] of Object.entries(artifacts(c,pins))){assert.equal(fs.readFileSync(file,'utf8'),sql,file);assert.ok(Buffer.byteLength(sql)<250000,file+' too large');}return c;}
if(require.main===module){const c=JSON.parse(fs.readFileSync(contractPath)),pins=JSON.parse(fs.readFileSync(pinsPath));if(process.argv[2]==='--write')for(const [file,sql] of Object.entries(artifacts(c,pins)))fs.writeFileSync(file,sql);validate();console.log('069 candidate / applied migration hashes / static gates PASS '+c.candidateSha);}
module.exports={source,files,preflight,dryRun,verifier,validate,policyCheck};
