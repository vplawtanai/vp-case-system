/* eslint-disable @typescript-eslint/no-require-imports */
// Offline SELECT-only verifier exporter. Reuse the approved compact Dry-run scope.
const fs=require('node:fs'),assert=require('node:assert/strict');
const compact=require('./direct-money-documents-dry-run.cjs');
const q=s=>"'"+s.replaceAll("'","''")+"'";

function verifier(a,c,baseline){
 const m=compact.validateManifest(c,baseline?compact.buildManifest(a,c,baseline):JSON.parse(fs.readFileSync(compact.manifestPath,'utf8')));
 // Candidate bytes are validated offline; only their exact expected object hashes
 // reach SQL. No candidate SQL or application RPC is executed by this verifier.
 assert.equal(a.sha(a.source()),m.candidateSha);
 const expected={...m.after,rows:m.before.rows};
 const newValues=Object.entries(m.newColumns).map(([table,cols])=>`exists(select 1 from public.${table} r where ${cols.map(col=>`coalesce(to_jsonb(r)->${q(col)},'null'::jsonb)<>'null'::jsonb`).join(' or ')})`).join(' or ');
 const existing=Object.keys(m.before.functions).map(q).join(',');
 const created=c.created.map(q).join(',');
 const targets=a.tables.map(q).join(',');
 const sql=`-- 066 COMPACT SELECT-only Post-Apply Verifier. Execute the complete statement.
-- Candidate SHA-256 (validated offline): ${m.candidateSha}
-- Approved PASS baseline SHA-256 (validated offline): ${m.approvedBaselineSha}
-- Approved captured_at: ${m.capturedAt}
-- Scope: ${Object.keys(m.after.functions).length} exact functions; ${m.tableNames.length} dependency tables/views; ${m.rowTables.length} protected row count/hash pairs.
-- Prior 490 broader differences remain unresolved and are NOT accepted here.
-- Verifies the exact single post-066 object set, not a manual execution-count ledger.
-- Missing objects, SQL errors, NULL checks or any mismatch are failures, never PASS.
-- No application functions, DDL, DML, candidate execution or full baseline payload.
WITH expected AS (SELECT ${q(JSON.stringify(expected))}::jsonb value),
actual AS MATERIALIZED (${compact.captureSql(a,m)}),
differences AS (SELECT (${compact.differences('actual.value','expected.value')}) value FROM actual,expected),
function_differences AS (SELECT v FROM differences,jsonb_array_elements(value) v WHERE v->>'section'='functions'),
catalog_differences AS (SELECT v FROM differences,jsonb_array_elements(value) v WHERE v->>'section'='catalog'),
checks AS (SELECT * FROM (VALUES
 ('expected_manifest_exact',(SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')=${q(compact.fingerprint(expected))} FROM expected)),
 ('dependency_functions_exact',NOT EXISTS(SELECT 1 FROM function_differences)),
 ('dependency_catalog_exact',NOT EXISTS(SELECT 1 FROM catalog_differences)),
 ('target_state_exact',NOT EXISTS(SELECT 1 FROM function_differences WHERE split_part(v->>'object','(',1) IN (${created}))
   AND (SELECT count(*)=${c.created.length} FROM actual,jsonb_object_keys(value->'functions') k WHERE split_part(k,'(',1) IN (${created}))
   AND NOT EXISTS(SELECT 1 FROM catalog_differences WHERE v->>'object' IN (${targets}))),
 ('required_security',NOT EXISTS(SELECT 1 FROM function_differences) AND NOT EXISTS(SELECT 1 FROM catalog_differences)),
 ('preserved_functions',NOT EXISTS(SELECT 1 FROM function_differences WHERE v->>'object' IN (${existing}))),
 ('preserved_catalog_security',NOT EXISTS(SELECT 1 FROM catalog_differences)),
 ('historical_rows_unchanged',(SELECT actual.value->'rows'=expected.value->'rows' FROM actual,expected)),
 ('historical_new_source_columns_null',NOT (${newValues}))
 ) x(name,pass))
SELECT bool_and(coalesce(pass,false)) AS gate_pass,
 coalesce(jsonb_agg(name ORDER BY name) FILTER(WHERE pass IS DISTINCT FROM true),'[]') AS failed_checks,
 (SELECT coalesce(bool_and(coalesce(pass,false)),false) FROM checks WHERE name IN ('historical_rows_unchanged','historical_new_source_columns_null')) AS historical_rows_unchanged,
 ${q(m.candidateSha)}::text AS candidate_sha256,
 ${q(m.approvedBaselineSha)}::text AS approved_baseline_sha256,
 (SELECT coalesce(pass,false) FROM checks WHERE name='target_state_exact') AS applied_state_exact,
 (SELECT coalesce(jsonb_agg(v),'[]') FROM function_differences) AS function_differences,
 (SELECT coalesce(jsonb_agg(v),'[]') FROM catalog_differences) AS catalog_differences,
 (SELECT value FROM differences) AS object_differences
FROM checks;
`;
 assert.ok(Buffer.byteLength(sql)<150000,'Compact SELECT-only verifier must stay below 150 KB');
 return sql;
}
module.exports={verifier};
