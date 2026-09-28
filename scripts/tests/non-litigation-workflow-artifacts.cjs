/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 077 artifacts. Never reads credentials or connects to any database.
const fs=require('node:fs');
const A=require('./non-litigation-artifacts.cjs');
const applied=require('./fixtures/non-litigation-076-applied-contract.json').contract;
const candidate=A.root+'/supabase/migrations/202607180077_non_litigation_operational_workflow.sql';
const verifier=A.root+'/scripts/sql/verify_non_litigation_operational_workflow_077.sql';
const verifierPins=A.root+'/scripts/tests/fixtures/non-litigation-077-verifier-baseline.json';
const preflight=A.root+'/scripts/sql/preflight_non_litigation_operational_workflow_077.sql';
const oldSql=A.snapshotSql(true);
const rawAppliedSql=A.appliedSql();
// Match the accepted human-run 076 attempt-state verifier exactly. Its C-order
// catalog sorting must not regress to the older builder's database collation.
function deterministicAppliedSql(sql){
 const replacements=[
  ['ORDER BY c.conname)', 'ORDER BY c.conname COLLATE "C")'],
  ['ORDER BY c.conrelid::regclass::text,c.conname)', 'ORDER BY c.conrelid::regclass::text COLLATE "C",c.conname COLLATE "C")'],
  ['ORDER BY i.indexrelid::regclass::text)', 'ORDER BY i.indexrelid::regclass::text COLLATE "C")'],
  ['ORDER BY g.tgname)', 'ORDER BY g.tgname COLLATE "C")'],
  ['ORDER BY p.polname)', 'ORDER BY p.polname COLLATE "C")'],
  ["order by x->>'name')", "order by (x->>'name') COLLATE \"C\")"],
  ["order by x->>'definition')", "order by (x->>'definition') COLLATE \"C\")"],
 ];
 for(const [from,to] of replacements){if(!sql.includes(from))throw Error('076 catalog sort anchor missing: '+from);sql=sql.replaceAll(from,to);}
 return sql;
}
const appliedSql=deterministicAppliedSql(rawAppliedSql);
const tables=['advisory_matters','advisory_issues','advisory_issue_tasks','advisory_advice_records','advisory_time_logs','advisory_matter_counters',...A.newTables];
const rowSql=`with raw(name,j) as (${tables.map(n=>`select '${n}',to_jsonb(t) from public.${n} t`).join(' union all ')}), scope(name) as (values ${tables.map(n=>`('${n}')`).join(',')})
 select jsonb_object_agg(name,evidence) from (select s.name,jsonb_build_object('count',count(j),'sha256',encode(sha256(convert_to(coalesce(string_agg(j::text,E'\\n' order by j::text COLLATE "C"),''),'UTF8')),'hex')) evidence from scope s left join raw r using(name) group by s.name) fingerprints`;
const baseline={applied:A.hash(A.pgJson(applied)),catalog:A.hash(A.pgJson(A.approvedState().catalog)),functions:A.hash(A.pgJson(A.approvedState().functions))};
const changed=['advisory_control_write(uuid,text,jsonb,uuid,bigint)','advisory076_task_guard()'];
function snapshot(){return `select jsonb_build_object('old',(${oldSql}),'applied',(${appliedSql}),'rows',(${rowSql}))`;}
function contractSql(){return appliedSql.replace("'advisory_control_section')))","'advisory_control_section','advisory_workflow_checks')))");}
// Candidate preconditions/preservation and both read gates share one C-order
// projection. The raw projection is retained only to reproduce diagnostic evidence.
function generate(body){return `-- Phase 8C.1 / 077 OPERATIONAL WORKFLOW CANDIDATE. HUMAN MIGRATION GATE.
-- Applied 076 is immutable. No DML, no identity/stage/time backfill.
-- Requires exact accepted 076 catalog/security; rows captured fresh, not stale UAT counts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${[...tables,'clients','user_profiles','case_audit_logs',...Object.keys(A.approved.finance_matter_references)].map(n=>'public.'+n).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory077_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory077_before ${snapshot()};
DO $baseline$ DECLARE s jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY077_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory077_before;
 IF encode(sha256(convert_to((s->'applied')::text,'UTF8')),'hex')<>'${baseline.applied}' THEN RAISE EXCEPTION 'ADVISORY077_BASELINE_MISMATCH: applied076'; END IF;
 IF encode(sha256(convert_to((s#>'{old,catalog}')::text,'UTF8')),'hex')<>'${baseline.catalog}' THEN RAISE EXCEPTION 'ADVISORY077_BASELINE_MISMATCH: legacy_catalog'; END IF;
 IF encode(sha256(convert_to((s#>'{old,functions}')::text,'UTF8')),'hex')<>'${baseline.functions}' THEN RAISE EXCEPTION 'ADVISORY077_BASELINE_MISMATCH: legacy_functions'; END IF;
 IF to_regprocedure('public.advisory_workflow_checks(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'ADVISORY077_ALREADY_PRESENT'; END IF;
END; $baseline$;
-- BEGIN 077 CONTRACT
${body}
-- END 077 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory077_before;
 ${snapshot()} INTO a;
 IF a->'old' IS DISTINCT FROM b->'old' OR a->'rows' IS DISTINCT FROM b->'rows'
  OR a#>'{applied,tables}' IS DISTINCT FROM b#>'{applied,tables}'
  OR a#>'{applied,deltas}' IS DISTINCT FROM b#>'{applied,deltas}'
  OR (a#>'{applied,functions}')-ARRAY[${changed.map(A.quote).join(',')}]
    IS DISTINCT FROM (b#>'{applied,functions}')-ARRAY[${changed.map(A.quote).join(',')}]
 THEN RAISE EXCEPTION 'ADVISORY077_PRESERVATION_FAILED'; END IF;
 -- Replaced functions keep their exact security. Only definition bodies change.
 IF EXISTS(SELECT 1 FROM jsonb_each(b#>'{applied,functions}') f
  WHERE (a#>ARRAY['applied','functions',f.key])-'definition' IS DISTINCT FROM f.value-'definition')
 THEN RAISE EXCEPTION 'ADVISORY077_EXISTING_SECURITY_CHANGED'; END IF;
END; $preservation$;
COMMIT;
`;
}
function diagnostic(){return `-- 077 manual SELECT-only preflight. Does NOT invoke write/business RPCs.
-- Returns current historical fingerprints for Human Gate; no stale 076 row baseline.
-- Broader 490 Finance catalog differences are outside scoped acceptance.
WITH state AS (${snapshot()}), checks AS (
 SELECT state, jsonb_build_object(
 'owner',current_user='postgres',
 'accepted_076_contract',encode(sha256(convert_to((state->'applied')::text,'UTF8')),'hex')='${baseline.applied}',
 'accepted_legacy_catalog',encode(sha256(convert_to((state#>'{old,catalog}')::text,'UTF8')),'hex')='${baseline.catalog}',
 'accepted_legacy_functions',encode(sha256(convert_to((state#>'{old,functions}')::text,'UTF8')),'hex')='${baseline.functions}',
 'candidate_not_applied',to_regprocedure('public.advisory_workflow_checks(uuid)') is null
 ) result FROM state s(state)), failures AS (
 SELECT coalesce(jsonb_agg(key order by key COLLATE "C"),'[]') failed_checks FROM checks,jsonb_each(result) WHERE value IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failed_checks='[]'::jsonb,'failed_checks',failed_checks,
 'candidate_sha256','${A.hash(fs.readFileSync(candidate))}',
 'approved_076_contract_sha256','${baseline.applied}',
 'historical_rows',state->'rows','historical_rows_sha256',encode(sha256(convert_to((state->'rows')::text,'UTF8')),'hex'),
 'finance_references',state#>'{old,finance}',
 'legacy_rows',state#>'{old,rows}',
 'legacy_rows_sha256',encode(sha256(convert_to((state#>'{old,rows}')::text,'UTF8')),'hex'),
 'finance_references_sha256',encode(sha256(convert_to((state#>'{old,finance}')::text,'UTF8')),'hex'),
 'broader_finance_differences_accepted',false) advisory077_preflight FROM checks,failures;
`;}
function verify(pins={}){
 const artifact=JSON.parse(fs.readFileSync(__dirname+'/fixtures/non-litigation-077-applied-functions.json','utf8'));
 const candidateSha=A.hash(fs.readFileSync(candidate));
 if(artifact.candidate_sha256!==candidateSha)throw Error('077 applied functions stale');
 const post={...applied,functions:{...applied.functions,...artifact.functions}};
 const literal=k=>pins[k]?A.quote(pins[k]):'NULL::text';
 for(const key of ['historical_rows_sha256','legacy_rows_sha256','finance_references_sha256'])if(pins[key]&&!/^[a-f0-9]{64}$/.test(pins[key]))throw Error('Invalid approved fingerprint '+key);
 return `-- 077 SELECT-only post-apply verifier. NEVER executes business/write RPCs.
-- FAILS CLOSED until passed Production Preflight fingerprints are bound offline.
-- No manual SQL editing: use artifact builder --bind-verifier with reviewed hashes.
WITH preserved AS (${snapshot()}), applied AS (${contractSql()}), checks AS (
 SELECT jsonb_build_object(
 'owner',current_user='postgres',
 'approved_row_baseline_bound',${literal('historical_rows_sha256')} IS NOT NULL AND ${literal('legacy_rows_sha256')} IS NOT NULL AND ${literal('finance_references_sha256')} IS NOT NULL,
 'applied_state_exact',encode(sha256(convert_to((SELECT * FROM applied)::text,'UTF8')),'hex')='${A.hash(A.pgJson(post))}',
 'existing_catalog_preserved',encode(sha256(convert_to((state#>'{old,catalog}')::text,'UTF8')),'hex')='${baseline.catalog}',
 'existing_helpers_preserved',encode(sha256(convert_to((state#>'{old,functions}')::text,'UTF8')),'hex')='${baseline.functions}',
 'historical_rows_unchanged',encode(sha256(convert_to((state->'rows')::text,'UTF8')),'hex') IS NOT DISTINCT FROM ${literal('historical_rows_sha256')},
 'legacy_rows_unchanged',encode(sha256(convert_to((state#>'{old,rows}')::text,'UTF8')),'hex') IS NOT DISTINCT FROM ${literal('legacy_rows_sha256')},
 'finance_references_unchanged',encode(sha256(convert_to((state#>'{old,finance}')::text,'UTF8')),'hex') IS NOT DISTINCT FROM ${literal('finance_references_sha256')}
 ) result FROM preserved p(state)), failures AS (
 SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') failed_checks FROM checks,jsonb_each(result) WHERE value IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failed_checks='[]'::jsonb,'failed_checks',failed_checks,
 'candidate_sha256','${candidateSha}','checks',result,
 'historical_rows_unchanged',result->'historical_rows_unchanged','applied_state_exact',result->'applied_state_exact') advisory077_verification FROM checks,failures;
`;
}
module.exports={rawAppliedSql,deterministicAppliedSql,appliedSql,verifier,verifierPins,verify,candidate,preflight,generate,diagnostic,snapshot,contractSql,baseline,rowSql,tables,changed};
if(require.main===module){
 const s=fs.readFileSync(candidate,'utf8');
 const body=s.split('-- BEGIN 077 CONTRACT\n')[1].split('\n-- END 077 CONTRACT')[0];
 if(process.argv[2]==='--generate-preflight'){fs.writeFileSync(preflight,diagnostic());console.log('077 SELECT-only preflight generated offline.');}
 else if(process.argv[2]==='--check'){
  if(s!==generate(body)||fs.readFileSync(preflight,'utf8')!==diagnostic()||fs.readFileSync(verifier,'utf8')!==verify(JSON.parse(fs.readFileSync(verifierPins,'utf8'))))throw Error('077 artifacts stale');
  if(A.hash(fs.readFileSync(A.candidate))!=='c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe')throw Error('076 changed');
  console.log('077 candidate/Preflight/Verifier use the same accepted C-order contract; applied 076 unchanged. Human Preflight required; no Production execution. Candidate SHA-256 '+A.hash(s));
 }else if(process.argv[2]==='--bind-verifier'){
  const keys=['historical_rows_sha256','legacy_rows_sha256','finance_references_sha256'];
  if(process.argv.length!==6)throw Error('Pass the three reviewed PASS Preflight hashes in order: historical rows, legacy rows, Finance references');
  const pins=Object.fromEntries(keys.map((k,i)=>[k,process.argv[i+3]]));
  const sql=verify(pins);fs.writeFileSync(verifierPins,JSON.stringify(pins,null,2)+'\n');fs.writeFileSync(verifier,sql);
  console.log('077 SELECT-only verifier bound offline; no database execution.');
 }else throw Error('Expected --check, --generate-preflight, or --bind-verifier');
}
