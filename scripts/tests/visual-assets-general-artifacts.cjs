/* eslint-disable @typescript-eslint/no-require-imports */
// Offline artifact generation only. Production preservation pins require Human review.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = require('./visual-assets-artifacts.cjs');
const {hash, q, digest} = base;
const root = path.resolve(__dirname, '../..');
const candidate = root + '/supabase/migrations/202610010084_visual_assets_general_library.sql';
const preflight = root + '/scripts/sql/preflight_visual_assets_general_084.sql';
const verifier = root + '/scripts/sql/verify_visual_assets_general_084.sql';
const pinsPath = __dirname + '/fixtures/visual-assets-084-reviewed-baseline.json';
const accepted083 = '3682c449f708f600468f6cbd36d3b6de60fd7cc5850f6e9802f38b898481edfa';

function expectedContract(applied) {
  assert.equal(hash(fs.readFileSync(base.candidate)), accepted083);
  const raw = JSON.parse(fs.readFileSync(base.contractPath));
  assert.equal(raw.candidate_sha256, accepted083);
  const contract = base.portableTableContract(raw.contract);
  if (applied) {
    const table = contract.tables.visual_assets;
    const check = table.constraints.filter(([name]) => name === 'visual_assets_overlay_ready_check');
    assert.deepEqual(check, [['visual_assets_overlay_ready_check', 'CHECK (overlay_ready)']]);
    table.constraints = table.constraints.filter(([name]) => name !== 'visual_assets_overlay_ready_check');
    const overlay = table.columns.find(([name]) => name === 'overlay_ready');
    assert.deepEqual(overlay, ['overlay_ready', 'boolean', true, null]);
    overlay[3] = 'false';
  }
  return contract;
}

function snapshot() {
  return `WITH original AS MATERIALIZED (${base.snapshot({portableNotNull: true})})
SELECT jsonb_build_object('contract',value->'contract','security',value->'security',
 'rows',jsonb_build_object('preserved_083_rows',value->'rows',
  'assets',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,${digest('to_jsonb(a)')}) ORDER BY id),'[]') FROM public.visual_assets a),
  'mappings',(SELECT coalesce(jsonb_agg(jsonb_build_array(scope,family_key,${digest('to_jsonb(m)')}) ORDER BY scope COLLATE "C",family_key COLLATE "C"),'[]') FROM public.visual_asset_mappings m),
  'visual_storage_objects',(SELECT coalesce(jsonb_agg(jsonb_build_array(id,${digest('to_jsonb(o)')}) ORDER BY id),'[]') FROM storage.objects o WHERE bucket_id='vp-visual-assets')))
FROM original s(value)`;
}

function gateSql(applied, pins = {}) {
  const sha = hash(fs.readFileSync(candidate));
  for (const k of ['rows_sha256', 'security_sha256']) if (pins[k]) assert.match(pins[k], /^[a-f0-9]{64}$/);
  if (pins.candidate_sha256) assert.equal(pins.candidate_sha256, sha);
  const pin = k => pins[k] ? q(pins[k]) : 'NULL::text';
  return `-- 084 STATIC SELECT ONLY. No business RPC or Storage mutation.
-- ${applied ? 'Post-Apply: fails closed until exact Human-reviewed Preflight pins are bound.' : 'Preflight: review returned preservation hashes before Human Apply.'}
-- Portable PG17/18 NOT NULL evidence remains in pg_attribute.attnotnull.
WITH state AS MATERIALIZED (${snapshot()}),
expected AS (SELECT ${q(JSON.stringify(expectedContract(applied)))}::jsonb value),
checks AS (SELECT jsonb_build_object('owner',current_user='postgres',
 '${applied ? 'applied_state_exact' : 'accepted_083_contract'}',state->'contract'=expected.value${applied ? `,
 'reviewed_baseline_bound',${pin('rows_sha256')} IS NOT NULL AND ${pin('security_sha256')} IS NOT NULL,
 'historical_rows_unchanged',${digest("state->'rows'")} IS NOT DISTINCT FROM ${pin('rows_sha256')},
 'security_unchanged',${digest("state->'security'")} IS NOT DISTINCT FROM ${pin('security_sha256')}` : ''}) value
 FROM state s(state),expected),
failures AS (SELECT coalesce(jsonb_agg(key ORDER BY key COLLATE "C"),'[]') value FROM checks,jsonb_each(checks.value) c(key,passed) WHERE passed IS DISTINCT FROM 'true'::jsonb),
table_differences AS (SELECT 'public.'||t.key AS object_name,c.key AS component,c.value AS expected,state->'contract'->'tables'->t.key->c.key AS actual
 FROM state s(state),expected e CROSS JOIN LATERAL jsonb_each(e.value->'tables') t CROSS JOIN LATERAL jsonb_each(t.value) c
 WHERE c.value IS DISTINCT FROM state->'contract'->'tables'->t.key->c.key)
SELECT jsonb_build_object('gate_pass',failures.value='[]'::jsonb,'failed_checks',failures.value,'checks',checks.value,
 'candidate_sha256','${sha}','accepted_083_sha256','${accepted083}',
 'rows_sha256',${digest("state->'rows'")},'security_sha256',${digest("state->'security'")},
 'object_differences',(SELECT coalesce(jsonb_agg(k ORDER BY k COLLATE "C"),'[]') FROM jsonb_object_keys(expected.value||(state->'contract')) k WHERE expected.value->k IS DISTINCT FROM state->'contract'->k),
 'table_differences',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY object_name COLLATE "C",component COLLATE "C"),'[]') FROM table_differences d),
 'asset_count',(SELECT count(*) FROM public.visual_assets),'mapping_count',(SELECT count(*) FROM public.visual_asset_mappings),
 'business_rpc_executed',false,'backfill',false)
FROM state s(state),expected,checks,failures;
`;
}

const preflightSql = () => gateSql(false);
const verifierSql = (pins = {}) => gateSql(true, pins);
function generate() {
  const pins = JSON.parse(fs.readFileSync(pinsPath));
  fs.writeFileSync(preflight, preflightSql());
  fs.writeFileSync(verifier, verifierSql(pins));
}
module.exports = {root, candidate, preflight, verifier, pinsPath, accepted083, expectedContract, snapshot, preflightSql, verifierSql, generate};
if (require.main === module) {
  const op = process.argv[2];
  if (op === '--generate') generate();
  else if (op === '--check') {
    assert.equal(fs.readFileSync(preflight, 'utf8'), preflightSql());
    assert.equal(fs.readFileSync(verifier, 'utf8'), verifierSql(JSON.parse(fs.readFileSync(pinsPath))));
  } else if (op === '--bind') {
    const pins = {candidate_sha256: hash(fs.readFileSync(candidate)), rows_sha256: process.argv[3], security_sha256: process.argv[4]};
    assert.ok(pins.rows_sha256 && pins.security_sha256);
    verifierSql(pins);
    fs.writeFileSync(pinsPath, JSON.stringify(pins, null, 2) + '\n');
    generate();
  } else throw Error('Use --generate, --check or --bind ROWS_SHA SECURITY_SHA');
}
