/* eslint-disable @typescript-eslint/no-require-imports */
// Offline, dependency-scoped Dry-run exporter. No connection or execution mode.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const manifestPath='scripts/tests/direct-money-documents-dry-run-contract.json';
const candidateSha='010093343be8675823b8e9459c979d1dc6efe75959c7f12c0268eecb17db3f9e';
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const sha=s=>createHash('sha256').update(s).digest('hex');
// Match PostgreSQL jsonb::text exactly; verified against the approved state hash
// and independently against PostgreSQL in the local gate tests.
function jsonbText(v){
 if(Array.isArray(v))return '['+v.map(jsonbText).join(', ')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>JSON.stringify(k)+': '+jsonbText(v[k])).join(', ')+'}';
 return JSON.stringify(v);
}
const fingerprint=v=>sha(jsonbText(v));
const omit=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([key])=>!keys.includes(key)));
const hashes=(xs,key)=>Object.fromEntries(xs.map(v=>[v[key],fingerprint(v)]));

function buildManifest(a,c,input){
 const raw=typeof input==='string'?JSON.parse(input):input;
 const r=Array.isArray(raw)?raw[0]:raw,b=r.baseline||r;
 assert.equal(c.candidateSha,candidateSha);assert.equal(sha(a.source()),candidateSha);
 assert.equal(b.gate_pass,true);assert.equal(b.candidate_sha256,candidateSha);
 assert.equal(fingerprint(b.state),b.state_sha256,'Approved full baseline SHA-256 must verify offline');
 const beforeFunctions=c.before.functions.map(e=>{
  const f=b.state.functions.find(x=>x.signature===e.signature);assert.ok(f,e.signature);
  assert.deepEqual(omit(f,['acl','service_execute']),omit(e,['acl','service_execute']),e.signature);
  return f;
 });
 require('./direct-money-documents-security.cjs').assertPinnedHelper(beforeFunctions);
 for(const e of c.before.catalog){
  const t=b.state.catalog.find(x=>x.name===e.name);assert.ok(t,e.name);
  assert.deepEqual(omit(t,['acl','service_select']),omit(e,['acl','service_select']),e.name);
 }
 for(const name of c.created)assert.ok(!b.state.functions.some(f=>f.name===name),'New function already exists: '+name);
 const dependencyNames=new Set([...a.source().matchAll(/public\.(\w+)/g)].map(m=>m[1]));
 for(const f of [...c.before.functions,...c.after.functions])for(const m of f.definition.matchAll(/public\.(\w+)/g))dependencyNames.add(m[1]);
 // Include only tables/views referenced by the candidate or its accepted call graph.
 const beforeCatalog=b.state.catalog.filter(t=>dependencyNames.has(t.name));
 for(const name of a.tables)assert.ok(beforeCatalog.some(t=>t.name===name));
 const afterFunctions=c.after.functions.map(e=>{
  const f=beforeFunctions.find(x=>x.signature===e.signature);
  return f?{...f,definition:e.definition}:e;
 });
 const afterCatalog=beforeCatalog.map(t=>{
  const e=c.after.catalog.find(x=>x.name===t.name);if(!e)return t;
  return {...t,...Object.fromEntries(['columns','constraints','indexes','triggers'].map(k=>[k,e[k]]))};
 });
 const rows=Object.fromEntries(c.rowTables.map(name=>{assert.ok(b.state.rows[name],name);return [name,b.state.rows[name]];}));
 const newColumns={};
 for(const t of c.after.catalog){
  const old=c.before.catalog.find(x=>x.name===t.name);
  const added=t.columns.filter(x=>!old.columns.some(y=>y.name===x.name)).map(x=>x.name);
  if(added.length)newColumns[t.name]=added;
 }
 const m={version:1,candidateSha,approvedBaselineSha:b.state_sha256,capturedAt:b.captured_at,
  broaderEvidence:'Prior 490 differences remain unresolved; this gate neither embeds nor accepts their catalog.',
  functionNames:[...new Set(c.after.functions.map(f=>f.name))].sort(),
  tableNames:beforeCatalog.map(t=>t.name).sort(),rowTables:c.rowTables,newColumns,
  before:{functions:hashes(beforeFunctions,'signature'),catalog:hashes(beforeCatalog,'name'),rows},
  after:{functions:hashes(afterFunctions,'signature'),catalog:hashes(afterCatalog,'name')}};
 return {...m,manifestSha:fingerprint(m)};
}

function validateManifest(c,m){
 assert.equal(m.version,1);assert.equal(m.candidateSha,candidateSha);assert.equal(c.candidateSha,candidateSha);
 assert.equal(m.manifestSha,fingerprint(omit(m,['manifestSha'])));
 assert.match(m.approvedBaselineSha,/^[a-f0-9]{64}$/);
 assert.deepEqual(m.functionNames,[...new Set(c.after.functions.map(f=>f.name))].sort());
 assert.deepEqual(m.rowTables,c.rowTables);
 assert.deepEqual(Object.keys(m.before.functions).sort(),c.before.functions.map(f=>f.signature).sort());
 assert.deepEqual(Object.keys(m.after.functions).sort(),c.after.functions.map(f=>f.signature).sort());
 for(const section of [m.before.functions,m.after.functions,m.before.catalog,m.after.catalog])for(const value of Object.values(section))assert.match(value,/^[a-f0-9]{64}$/);
 return m;
}

function captureSql(a,m){
 const functions=a.functionsSql.replace("and p.prokind='f'",`and p.prokind='f' and p.proname in (${list(m.functionNames)})`);
 const catalog=a.catalogSql.replace("and c.relkind in ('r','p','v')",`and c.relkind in ('r','p','v') and c.relname in (${list(m.tableNames)})`);
 const compact=(sql,key)=>`select coalesce(jsonb_object_agg(v->>${q(key)},encode(sha256(convert_to(v::text,'UTF8')),'hex')),'{}') value from (${sql}) s cross join lateral jsonb_array_elements(s.value) v`;
 return `select jsonb_build_object('functions',f.value,'catalog',c.value,'rows',r.value) value
from (${compact(functions,'signature')}) f
cross join (${compact(catalog,'name')}) c
cross join (${a.rowsSql(m.rowTables)}) r`;
}

function differences(actual,expected){return `select coalesce(jsonb_agg(jsonb_build_object('section',s,'object',k,'expected',${expected}->s->k,'actual',${actual}->s->k) order by s,k),'[]')
from unnest(array['functions','catalog','rows']) s
cross join lateral (select jsonb_object_keys(${expected}->s) k union select jsonb_object_keys(${actual}->s) k) keys
where ${actual}->s->k is distinct from ${expected}->s->k`;}

function dryRun(a,c,baseline){
 const m=validateManifest(c,baseline?buildManifest(a,c,baseline):JSON.parse(fs.readFileSync(manifestPath,'utf8')));
 const source=a.source();assert.equal(sha(source),candidateSha);
 assert.ok(!source.includes('$candidate066$'));
 const capture=captureSql(a,m),before=JSON.stringify(m.before),after=JSON.stringify(m.after);
 const newValues=Object.entries(m.newColumns).map(([table,cols])=>`exists(select 1 from public.${table} where ${cols.map(col=>col+' is not null').join(' or ')})`).join(' or ');
 const sql=`-- 066 COMPACT ROLLBACK-ONLY REHEARSAL. Execute this COMPLETE batch, never a selection.
-- Candidate SHA-256: ${candidateSha}
-- Approved PASS baseline SHA-256: ${m.approvedBaselineSha}
-- Approved captured_at: ${m.capturedAt}
-- Scope: ${Object.keys(m.before.functions).length} existing + ${c.created.length} new functions; ${m.tableNames.length} dependency tables/views; ${m.rowTables.length} protected row count/hash pairs.
-- The prior 490 broader differences remain unresolved and are NOT accepted here.
-- No complete Production catalog/definitions or business rows are embedded.
-- An assertion/SQL error aborts the transaction and is a failed gate, never a PASS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE ${m.rowTables.map(t=>'public.'+t).join(',')} IN SHARE ROW EXCLUSIVE MODE;
DO $rehearsal066$
DECLARE
 expected_before jsonb := ${q(before)}::jsonb;
 expected_after jsonb := expected_before || ${q(after)}::jsonb;
 actual_state jsonb;
 failures jsonb;
 capture_sql text := ${q(capture)};
 -- The following dollar-quoted content is the exact, unchanged candidate bytes.
 candidate_sql text := $candidate066$${source}$candidate066$;
BEGIN
 IF encode(sha256(convert_to(candidate_sql,'UTF8')),'hex') <> '${candidateSha}' THEN
  RAISE EXCEPTION '066 CANDIDATE SHA MISMATCH';
 END IF;
 EXECUTE capture_sql INTO actual_state;
 ${differences('actual_state','expected_before')} INTO failures;
 IF failures <> '[]'::jsonb THEN RAISE EXCEPTION '066 SCOPED PRECONDITIONS FAILED: %',failures; END IF;
 -- Exact candidate execution: no wrapper edits, reconstructed DDL or UAT writes.
 EXECUTE candidate_sql;
 SET CONSTRAINTS ALL IMMEDIATE;
 EXECUTE capture_sql INTO actual_state;
 ${differences('actual_state','expected_after')} INTO failures;
 IF ${newValues} THEN failures:=failures||jsonb_build_array(jsonb_build_object('section','rows','object','historical_new_source_columns','expected','all null')); END IF;
 IF failures <> '[]'::jsonb THEN RAISE EXCEPTION '066 POST-MIGRATION ASSERTIONS FAILED: %',failures; END IF;
END;
$rehearsal066$;
ROLLBACK;
-- Independently read the restored state AFTER the explicit ROLLBACK.
WITH restored AS (${capture}), expected AS (SELECT ${q(before)}::jsonb value),
audit AS (SELECT (${differences('restored.value','expected.value')}) failures FROM restored,expected)
SELECT failures='[]'::jsonb AS gate_pass, failures='[]'::jsonb AS rollback_verified,
 failures AS failed_checks, '${candidateSha}'::text AS candidate_sha256,
 '${m.approvedBaselineSha}'::text AS approved_baseline_sha256
FROM audit;
`;
 assert.ok(Buffer.byteLength(sql)<300000,'Compact Dry-run must remain below 300 KB, below the already-passed 420871-byte Preflight');
 return sql;
}
module.exports={manifestPath,jsonbText,fingerprint,buildManifest,validateManifest,captureSql,differences,dryRun};
