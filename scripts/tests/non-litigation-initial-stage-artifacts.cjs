/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 081 artifacts. Never reads credentials or connects to any database.
const fs=require('node:fs'),assert=require('node:assert/strict');
const A=require('./non-litigation-artifacts.cjs'),B=require('./non-litigation-workflow-artifacts.cjs');
const signature='advisory_control_write(uuid,text,jsonb,uuid,bigint)';
const sha076='c67ac32ef0572964fcacc31bfc54dbe73544b76a4719436b6afa4a4c67a61afe';
const sha077='b612e944cfd9334e3366bc1c74b116fd2e69b731aaee2018e9385bb226c31b0b';
const oldArtifact=require('./fixtures/non-litigation-077-applied-functions.json');
assert.equal(A.hash(fs.readFileSync(A.candidate)),sha076,'Applied 076 is immutable');
assert.equal(A.hash(fs.readFileSync(B.candidate)),sha077,'Applied 077 is immutable');
assert.equal(oldArtifact.candidate_sha256,sha077);
const beforeContract={...require('./fixtures/non-litigation-076-applied-contract.json').contract};
beforeContract.functions={...beforeContract.functions,...oldArtifact.functions};
const beforeDefinition=beforeContract.functions[signature].definition;
const anchor="  if p_action in ('stage','stage_skip') then\n";
const initialization=`  if p_action='create' then
   -- Start only this newly created Matter, using its actual ordered plan.
   select * into stage from public.advisory_matter_stages
    where matter_id=m.id and stage_key<>'close' order by position asc limit 1;
   if not found then raise exception 'ADVISORY_INITIAL_STAGE_NOT_FOUND'; end if;
   insert into public.advisory_stage_visits(matter_id,stage_id,kind,entered_at,actor_id)
    values(m.id,stage.id,'visit',moment,actor)
    returning jsonb_build_object('initial_stage',jsonb_build_object(
     'stage_id',stage.id,'stage_key',stage.stage_key,'template_key',stage.template_key,
     'visit_id',id,'kind',kind,'entered_at',entered_at)) into event_detail;
  elsif p_action in ('stage','stage_skip') then
`;
assert.equal(beforeDefinition.split(anchor).length,2,'Unique create/Stage insertion point');
const afterDefinition=beforeDefinition.replace(anchor,initialization);
const afterContract={...beforeContract,functions:{...beforeContract.functions,[signature]:{...beforeContract.functions[signature],definition:afterDefinition}}};
const candidate=A.root+'/supabase/migrations/202609300081_advisory_create_initial_stage.sql';
const preflight=A.root+'/scripts/sql/preflight_advisory_create_initial_stage_081.sql';
const verifier=A.root+'/scripts/sql/verify_advisory_create_initial_stage_081.sql';
const pinsPath=__dirname+'/fixtures/non-litigation-081-verifier-baseline.json';
const q=A.quote,hash=A.hash,jsonHash=x=>hash(A.pgJson(x));
const digest=expression=>`encode(sha256(convert_to((${expression})::text,'UTF8')),'hex')`;
// Reuse the already accepted C-ordered 076/077 contract projection. Additionally
// preserve the complete catalogs of Advisory tables (not just 076 column deltas).
// Omit unused legacy snapshot CTEs and unrelated relation roots. The accepted
// contract output is unchanged; 081 reads only scoped Advisory rows/catalogs.
const acceptedSql=B.contractSql(),rawStart=acceptedSql.indexOf('raw(table_name,j) AS MATERIALIZED ('),catalogStart=acceptedSql.indexOf('catalog AS (');
assert.ok(rawStart>0&&catalogStart>rawStart);
const unrelatedRoots=" ('clients'), ('user_profiles'), ('case_audit_logs'),";
assert.ok(acceptedSql.includes(unrelatedRoots));
const contractSql=(acceptedSql.slice(0,rawStart)+acceptedSql.slice(catalogStart)).replace(unrelatedRoots,'');
const marker=" select jsonb_build_object('tables',";
assert.equal(contractSql.split(marker).length,2);
const catalogAndContract=contractSql.replace(marker,` select jsonb_build_object('catalog',
 (select jsonb_object_agg(name,evidence) from catalog where name in (${B.tables.map(q).join(',')})),
 'contract',jsonb_build_object('tables',`)+')';
function snapshot(){return `WITH structure AS (${catalogAndContract}), rows AS (${B.rowSql})
 SELECT s.state||jsonb_build_object('rows',(select * from rows)) AS state FROM structure s(state)`;}
const beforeHash=jsonHash(beforeContract),afterHash=jsonHash(afterContract);
function migration(){return `-- Advisory 081: atomic first Stage for NEW Matters only. HUMAN APPLY ONLY.
-- Applied 076/077 source bytes remain immutable; no row/backfill DML is executed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${B.tables.map(n=>'public.'+n).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory081_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory081_before ${snapshot()};
DO $baseline$ DECLARE s jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY081_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory081_before;
 IF ${digest("s->'contract'")} IS DISTINCT FROM '${beforeHash}' THEN
  RAISE EXCEPTION 'ADVISORY081_BASELINE_MISMATCH: accepted077'; END IF;
END; $baseline$;
-- BEGIN 081 CONTRACT: identical to accepted 077 except create initialization.
${afterDefinition.trimEnd()};
-- END 081 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory081_before;
 ${snapshot()} INTO a;
 IF a->'rows' IS DISTINCT FROM b->'rows' OR a->'catalog' IS DISTINCT FROM b->'catalog'
  OR ${digest("a->'contract'")} IS DISTINCT FROM '${afterHash}'
  OR (a#>ARRAY['contract','functions',${q(signature)}])-'definition'
   IS DISTINCT FROM (b#>ARRAY['contract','functions',${q(signature)}])-'definition'
 THEN RAISE EXCEPTION 'ADVISORY081_PRESERVATION_FAILED'; END IF;
END; $preservation$;
COMMIT;
`;}
// Compact per-object hashes isolate drift without copying complete definitions
// into every SQL Editor artifact. Exact definition/security is included in hashes.
function expectedMap(contract){return Object.fromEntries(['tables','functions','deltas'].map(group=>[group,Object.fromEntries(Object.entries(contract[group]).map(([key,value])=>[key,jsonHash(value)]))]));}
function comparison(contract){return `expected AS (SELECT ${q(JSON.stringify(expectedMap(contract)))}::jsonb value),
 differences AS (SELECT coalesce(jsonb_agg(jsonb_build_object('component',g.name,'object',k.name,
 'expected_sha256',e.value#>>ARRAY[g.name,k.name],'actual_sha256',${digest("s.state#>ARRAY['contract',g.name,k.name]")})
 ORDER BY g.name COLLATE "C",k.name COLLATE "C"),'[]'::jsonb) value
 FROM state s,expected e,CROSS_GROUP_PLACEHOLDER
 WHERE (e.value#>>ARRAY[g.name,k.name]) IS DISTINCT FROM ${digest("s.state#>ARRAY['contract',g.name,k.name]")})`.replace('CROSS_GROUP_PLACEHOLDER',`LATERAL (SELECT unnest(ARRAY['tables','functions','deltas']) name) g,
 LATERAL (SELECT jsonb_object_keys(coalesce(e.value->g.name,'{}')||coalesce(s.state#>ARRAY['contract',g.name],'{}')) name) k`);}
function preflightSql(){return `-- 081 SELECT-only Production Preflight. Does not execute create/Stage RPCs.
-- Existing operational UAT rows are captured fresh, never treated as schema drift.
WITH state AS MATERIALIZED (${snapshot()}), ${comparison(beforeContract)},
 checks AS (SELECT jsonb_build_object(
 'owner',current_user='postgres',
 'accepted_077_contract_exact',${digest("state->'contract'")}='${beforeHash}',
 'create_rpc_definition_exact',${digest(`state#>ARRAY['contract','functions',${q(signature)},'definition']`)}='${jsonHash(beforeDefinition)}',
 'stage_ordering_security_and_templates_exact',state#>'{contract,tables,advisory_matter_stages}' IS NOT NULL AND
  ${digest("state->'contract'")}='${beforeHash}',
 'current_create_contract_has_no_initial_visit',${digest(`state#>ARRAY['contract','functions',${q(signature)},'definition']`)}='${jsonHash(beforeDefinition)}'
 ) value FROM state s(state)),
 failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,
 'candidate_sha256','${hash(migration())}','accepted_076_candidate_sha256','${sha076}','accepted_077_candidate_sha256','${sha077}',
 'accepted_077_contract_sha256','${beforeHash}','checks',checks.value,'object_differences',differences.value,
 'catalog_sha256',${digest("state->'catalog'")},'rows_sha256',${digest("state->'rows'")},'row_fingerprints',state->'rows',
 'business_rpc_executed',false,'broader_finance_differences_accepted',false) advisory081_preflight
FROM state s(state),checks,failures,differences;
`;}
function verifierSql(pins={}){
 for(const key of ['rows_sha256','catalog_sha256'])if(pins[key]&&!/^[a-f0-9]{64}$/.test(pins[key]))throw Error('Invalid reviewed '+key);
 if(pins.candidate_sha256&&pins.candidate_sha256!==hash(migration()))throw Error('Reviewed candidate changed');
 const literal=key=>pins[key]?q(pins[key]):'NULL::text';
 return `-- 081 SELECT-only Post-Apply Verifier. Never calls a business/write RPC.
-- FAILS CLOSED until reviewed Production Preflight rows/catalog hashes are bound.
-- An exact row hash proves no backfill; legitimate later UAT writes require review.
WITH state AS MATERIALIZED (${snapshot()}), ${comparison(afterContract)},
 checks AS (SELECT jsonb_build_object(
 'owner',current_user='postgres',
 'reviewed_baseline_bound',${literal('rows_sha256')} IS NOT NULL AND ${literal('catalog_sha256')} IS NOT NULL,
 'applied_state_exact',${digest("state->'contract'")}='${afterHash}',
 'rpc_security_unchanged',${digest(`(state#>ARRAY['contract','functions',${q(signature)}])-'definition'`)}='${jsonHash(Object.fromEntries(Object.entries(beforeContract.functions[signature]).filter(([key])=>key!=='definition')))}',
 'historical_rows_unchanged',${digest("state->'rows'")} IS NOT DISTINCT FROM ${literal('rows_sha256')},
 'no_schema_table_column_changes',${digest("state->'catalog'")} IS NOT DISTINCT FROM ${literal('catalog_sha256')}
 ) value FROM state s(state)),
 failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,
 'candidate_sha256','${hash(migration())}','accepted_076_candidate_sha256','${sha076}','accepted_077_candidate_sha256','${sha077}',
 'applied_state_exact',checks.value->'applied_state_exact','historical_rows_unchanged',checks.value->'historical_rows_unchanged',
 'checks',checks.value,'object_differences',differences.value,'row_fingerprints',state->'rows',
 'approved_rows_sha256',${literal('rows_sha256')},'approved_catalog_sha256',${literal('catalog_sha256')},
 'rows_sha256',${digest("state->'rows'")},'catalog_sha256',${digest("state->'catalog'")},
 'business_rpc_executed',false,'broader_finance_differences_accepted',false) advisory081_verification
FROM state s(state),checks,failures,differences;
`;
}
module.exports={A,B,signature,sha076,sha077,beforeContract,afterContract,beforeDefinition,afterDefinition,anchor,initialization,candidate,preflight,verifier,pinsPath,snapshot,migration,preflightSql,verifierSql,jsonHash};
if(require.main===module){
 const option=process.argv[2];
 if(option==='--generate'){
  const pins=fs.existsSync(pinsPath)?JSON.parse(fs.readFileSync(pinsPath)):{};
  fs.writeFileSync(candidate,migration());fs.writeFileSync(preflight,preflightSql());fs.writeFileSync(verifier,verifierSql(pins));
 }else if(option==='--check'){
  const pins=JSON.parse(fs.readFileSync(pinsPath));
  assert.equal(fs.readFileSync(candidate,'utf8'),migration());assert.equal(fs.readFileSync(preflight,'utf8'),preflightSql());assert.equal(fs.readFileSync(verifier,'utf8'),verifierSql(pins));
  assert.equal(afterDefinition.replace(initialization,anchor),beforeDefinition,'Only create initialization changes');
 }else if(option==='--bind-verifier'){
  assert.equal(process.argv.length,5,'Pass reviewed rows_sha256 then catalog_sha256');
  const pins={candidate_sha256:hash(migration()),rows_sha256:process.argv[3],catalog_sha256:process.argv[4]};
  const sql=verifierSql(pins);fs.writeFileSync(pinsPath,JSON.stringify(pins,null,2)+'\n');fs.writeFileSync(verifier,sql);
 }else throw Error('Expected --generate, --check, or --bind-verifier');
 console.log('081 offline artifacts: '+option+'; candidate SHA-256 '+hash(migration())+'; NO database execution.');
}
