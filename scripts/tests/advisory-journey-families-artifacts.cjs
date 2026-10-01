/* eslint-disable @typescript-eslint/no-require-imports */
// Offline 085 artifacts. No credentials, network or database execution.
const fs = require('node:fs'), assert = require('node:assert/strict');
const D = require('./non-litigation-overdue-artifacts.cjs');
const { A, B, C, jsonHash } = D, q = A.quote;
const catalog = require('./fixtures/advisory-085-journey-catalog.json');
const signature = 'advisory076_template(text)';
const sha082 = '3fc98b29012babcb9aa1a2246e449da371fa82e63144b2b19182ec58318aa261';
assert.equal(A.hash(fs.readFileSync(D.candidate)), sha082, 'Applied 082 is immutable');
const beforeContract = D.afterContract;
const beforeDefinition = beforeContract.functions[signature].definition;
const branches = catalog.families.map(f => ` when ${q(f.key)} then array[${f.stages.map(q).join(',')}]`).join('\n');
assert.equal(beforeDefinition.split(' end;').length, 2);
const afterDefinition = beforeDefinition.replace(' end;', '\n' + branches + ' end;');
const afterContract = { ...beforeContract, functions: { ...beforeContract.functions,
  [signature]: { ...beforeContract.functions[signature], definition: afterDefinition },
} };
const candidate = A.root + '/supabase/migrations/202610010085_advisory_journey_families.sql';
const preflight = A.root + '/scripts/sql/preflight_advisory_journey_families_085.sql';
const verifier = A.root + '/scripts/sql/verify_advisory_journey_families_085.sql';
const pinsPath = __dirname + '/fixtures/advisory-085-verifier-baseline.json';
const digest = s => `encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
// Accepted C-ordered Advisory projection; NOT NULL is read via attnotnull,
// excluding PG18-only contype=n constraints, as in the accepted 082 gates.
const snapshot = D.snapshot;
const beforeHash = jsonHash(beforeContract), afterHash = jsonHash(afterContract);
function migration() {
  return `-- Advisory 085: ten linear Journey families; HUMAN APPLY ONLY.
-- Only one pure template function changes. Five legacy patterns remain exact.
-- No business-row DML, backfill, new tables, permissions, or application release.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${B.tables.map(n => 'public.' + n).join(',')} IN SHARE MODE;
CREATE TEMP TABLE advisory085_before(state jsonb) ON COMMIT DROP;
INSERT INTO advisory085_before ${snapshot()};
DO $baseline$ DECLARE s jsonb; BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'ADVISORY085_OWNER_REQUIRED'; END IF;
 SELECT state INTO s FROM advisory085_before;
 IF ${digest("s->'contract'")} IS DISTINCT FROM '${beforeHash}' THEN
  RAISE EXCEPTION 'ADVISORY085_BASELINE_MISMATCH: accepted082'; END IF;
END; $baseline$;
-- BEGIN 085 CONTRACT: signature, owner, invoker security, ACL and volatility preserved.
${afterDefinition.trimEnd()};
-- END 085 CONTRACT
DO $preservation$ DECLARE b jsonb; a jsonb; BEGIN
 SELECT state INTO b FROM advisory085_before;
 ${snapshot()} INTO a;
 IF a->'rows' IS DISTINCT FROM b->'rows' OR a->'catalog' IS DISTINCT FROM b->'catalog'
  OR ${digest("a->'contract'")} IS DISTINCT FROM '${afterHash}'
  OR EXISTS(SELECT 1 FROM jsonb_each(b#>'{contract,functions}') f
   WHERE (a#>ARRAY['contract','functions',f.key])-'definition' IS DISTINCT FROM f.value-'definition')
 THEN RAISE EXCEPTION 'ADVISORY085_PRESERVATION_FAILED'; END IF;
END; $preservation$;
COMMIT;
`;
}
function comparison(contract) {
  const expected = Object.fromEntries(['tables', 'functions', 'deltas'].map(g => [g,
    Object.fromEntries(Object.entries(contract[g]).map(([k, v]) => [k, jsonHash(v)]))]));
  return `expected AS (SELECT ${q(JSON.stringify(expected))}::jsonb value),
 differences AS (SELECT coalesce(jsonb_agg(jsonb_build_object('component',g.name,'object',k.name,
 'expected_sha256',e.value#>>ARRAY[g.name,k.name],'actual_sha256',${digest("s.state#>ARRAY['contract',g.name,k.name]")})
 ORDER BY g.name COLLATE "C",k.name COLLATE "C"),'[]'::jsonb) value
 FROM state s,expected e,LATERAL (SELECT unnest(ARRAY['tables','functions','deltas']) name) g,
 LATERAL (SELECT jsonb_object_keys(coalesce(e.value->g.name,'{}')||coalesce(s.state#>ARRAY['contract',g.name],'{}')) name) k
 WHERE (e.value#>>ARRAY[g.name,k.name]) IS DISTINCT FROM ${digest("s.state#>ARRAY['contract',g.name,k.name]")})`;
}
function gate(post, pins = {}) {
  for (const k of ['rows_sha256', 'catalog_sha256']) if (pins[k]) assert.match(pins[k], /^[a-f0-9]{64}$/);
  if (pins.candidate_sha256) assert.equal(pins.candidate_sha256, A.hash(migration()));
  const literal = k => pins[k] ? q(pins[k]) : 'NULL::text';
  return `-- 085 STATIC SELECT-ONLY ${post ? 'Post-Apply Verifier' : 'Preflight'}; no business/helper RPC execution.
-- Exact function definition proves the linear family arrays. No new Matter is created.
-- Verifier fails closed until NEW Human-reviewed Production row/catalog pins are bound.
WITH state AS MATERIALIZED (${snapshot()}), ${comparison(post ? afterContract : beforeContract)},
 checks AS (SELECT jsonb_build_object('owner',current_user='postgres',
 '${post ? 'applied_state_exact' : 'accepted_082_contract_exact'}',${digest("state->'contract'")}='${post ? afterHash : beforeHash}',
 'template_security_unchanged',${digest(`(state#>ARRAY['contract','functions',${q(signature)}])-'definition'`)}='${jsonHash(Object.fromEntries(Object.entries(beforeContract.functions[signature]).filter(([k]) => k !== 'definition')))}'${post ? `,
 'reviewed_baseline_bound',${literal('rows_sha256')} IS NOT NULL AND ${literal('catalog_sha256')} IS NOT NULL,
 'historical_rows_unchanged',${digest("state->'rows'")} IS NOT DISTINCT FROM ${literal('rows_sha256')},
 'catalog_security_unchanged',${digest("state->'catalog'")} IS NOT DISTINCT FROM ${literal('catalog_sha256')}` : ''}) value FROM state s(state)),
 failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,
 'candidate_sha256','${A.hash(migration())}','accepted_082_candidate_sha256','${sha082}',
 'checks',checks.value,'object_differences',differences.value,
 'rows_sha256',${digest("state->'rows'")},'catalog_sha256',${digest("state->'catalog'")},'row_fingerprints',state->'rows',
 'approved_rows_sha256',${literal('rows_sha256')},'approved_catalog_sha256',${literal('catalog_sha256')},
 'new_family_count',10,'preserved_legacy_pattern_count',5,
 'business_rpc_executed',false,'backfill',false,'broader_finance_differences_accepted',false) advisory085_${post ? 'verification' : 'preflight'}
FROM state s(state),checks,failures,differences;
`;
}
const preflightSql = () => gate(false), verifierSql = pins => gate(true, pins);
module.exports = { D, A, B, C, q, jsonHash, catalog, signature, beforeContract, afterContract, beforeDefinition, afterDefinition, branches, candidate, preflight, verifier, pinsPath, snapshot, migration, preflightSql, verifierSql };
if (require.main === module) {
  const op = process.argv[2], pins = JSON.parse(fs.readFileSync(pinsPath));
  if (op === '--generate') {
    // Never overwrite a subsequently reviewed/applied candidate accidentally.
    if (fs.existsSync(candidate)) assert.equal(fs.readFileSync(candidate, 'utf8'), migration());
    else fs.writeFileSync(candidate, migration());
    fs.writeFileSync(preflight, preflightSql()); fs.writeFileSync(verifier, verifierSql(pins));
  } else if (op === '--check') {
    assert.equal(fs.readFileSync(candidate, 'utf8'), migration());
    assert.equal(fs.readFileSync(preflight, 'utf8'), preflightSql());
    assert.equal(fs.readFileSync(verifier, 'utf8'), verifierSql(pins));
  } else if (op === '--bind-verifier') {
    assert.equal(process.argv.length, 5, 'Pass Human-reviewed rows_sha256 and catalog_sha256');
    assert.equal(fs.readFileSync(candidate, 'utf8'), migration());
    const reviewed = { candidate_sha256: A.hash(migration()), rows_sha256: process.argv[3], catalog_sha256: process.argv[4] };
    const result = verifierSql(reviewed);
    fs.writeFileSync(pinsPath, JSON.stringify(reviewed, null, 2) + '\n'); fs.writeFileSync(verifier, result);
  } else throw Error('Use --generate, --check or --bind-verifier ROWS_SHA CATALOG_SHA');
  console.log('085 offline ' + op + '; candidate SHA-256 ' + A.hash(migration()) + '; NO Production execution.');
}
