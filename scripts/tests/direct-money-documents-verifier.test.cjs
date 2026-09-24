/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL/WASM only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./direct-money-documents-postgres.test.cjs');
const {db,query,scalar,ids,migration}=require('./receipt-foundation.test.cjs');
const a=require('./direct-money-documents-artifacts.cjs'),compact=require('./direct-money-documents-dry-run.cjs');
const c=a.validate();
const state=()=>scalar(a.captureSql(c));
const verify=async sql=>(await query(sql))[0];
async function setup(apply=true){
 await fixture.setup(false);
 const pre=await verify(a.preflight(c));assert.equal(pre.gate_pass,true);
 const sql=a.verifier(c,JSON.stringify(pre.baseline));
 if(apply)await db.exec(migration('66'));
 return {pre,sql};
}

test('066 compact verifier artifact pins approved evidence and is a bounded single SELECT',()=>{
 const sql=fs.readFileSync(a.files.verifier,'utf8'),m=JSON.parse(fs.readFileSync(compact.manifestPath));
 assert.equal(sql,a.verifier(c));assert.ok(Buffer.byteLength(sql)<100000);
 assert.ok(!sql.includes(a.source()));assert.ok(!sql.includes('CREATE OR REPLACE FUNCTION'));
 assert.ok(!sql.includes('__APPROVED_066_BASELINE_JSON__'));
 const executable=sql.replace(/--[^\n]*/g,'').replace(/'(?:[^']|'')*'/g,"''");
 assert.match(executable.trim(),/^WITH expected AS/);assert.equal(executable.split(';').length,2);
 assert.ok(!/\b(?:insert|update|delete|truncate|alter|create|drop|grant|revoke|execute|call|do|begin|commit|rollback|set)\b/i.test(executable));
 assert.ok(!/public\.\w+\s*\(/i.test(executable),'No application function invocation');
 assert.equal(m.approvedBaselineSha,'3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e');
 assert.ok(sql.includes(m.approvedBaselineSha));assert.ok(sql.includes(c.candidateSha));
 assert.match(sql,/490 broader differences remain unresolved/);
});

test('066 compact verifier rejects an absent migration and missing new source-aware functions',async()=>{
 const {sql}=await setup(false),before=await state(),r=await verify(sql);
 assert.equal(r.gate_pass,false);assert.equal(r.applied_state_exact,false);
 assert.ok(r.failed_checks.includes('target_state_exact'));
 assert.equal(r.historical_rows_unchanged,true);assert.deepEqual(await state(),before);
 assert.ok(r.function_differences.some(f=>f.object==='document_direct_source(uuid)'));
});

test('066 compact verifier exact apply passes repeatedly without changing any catalog/security/business state',async()=>{
 const {pre,sql}=await setup(),before=await state();
 for(let i=0;i<2;i++){
  const r=await verify(sql);assert.equal(r.gate_pass,true);assert.equal(r.applied_state_exact,true);
  assert.equal(r.historical_rows_unchanged,true);assert.deepEqual(r.failed_checks,[]);assert.deepEqual(r.object_differences,[]);
  assert.equal(r.candidate_sha256,c.candidateSha);assert.equal(r.approved_baseline_sha256,pre.baseline.state_sha256);
 }
 assert.deepEqual(await state(),before);
});

test('066 compact verifier rejects function, ACL, owner, RLS, policy, trigger and uniqueness drift',async()=>{
 const {sql}=await setup(),before=await state();
 for(const drift of [
  'grant execute on function public.document_direct_source(uuid) to anon',
  'revoke execute on function public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric) from service_role',
  'alter function public.document_direct_source(uuid) owner to service_role',
  'alter function public.document_direct_source(uuid) security invoker',
  "alter function public.document_direct_source(uuid) set search_path to public,pg_catalog",
  'grant select on public.finance_receipts to anon',
  'alter table public.finance_receipts disable row level security',
  'create policy unexpected066 on public.finance_receipts for select to anon using(true)',
  'alter table public.finance_receipts disable trigger user',
  'drop index public.receipt_active_direct_066',
  'create index unexpected_duplicate066 on public.finance_receipts(direct_money_receipt_id)',
  "create function public.document_direct_source(text) returns text language sql as 'select $1'",
  'drop function public.get_finance_received_document_decision(text,uuid)',
  'alter table public.finance_document_counters add column unexpected066 text'
 ]){
  await db.exec('savepoint drift066');
  try{await db.exec(drift);const r=await verify(sql);assert.equal(r.gate_pass,false,drift);assert.ok(r.object_differences.length>0,drift);}
  finally{await db.exec('rollback to savepoint drift066;release savepoint drift066');}
 }
 assert.deepEqual(await state(),before);
});

test('066 compact verifier rejects protected historical changes and new Direct Money business activity',async()=>{
 const {sql}=await setup();
 await db.exec('savepoint historical066');
 await query('update public.clients set name=$1 where id=$2',['Unexpected historical mutation',ids.client]);
 let r=await verify(sql);assert.equal(r.gate_pass,false);assert.equal(r.historical_rows_unchanged,false);
 assert.ok(r.object_differences.some(f=>f.section==='rows'&&f.object==='clients'));
 await db.exec('rollback to savepoint historical066;release savepoint historical066');
 await fixture.source();r=await verify(sql);
 assert.equal(r.gate_pass,false);assert.equal(r.historical_rows_unchanged,false);
 assert.ok(r.object_differences.some(f=>f.section==='rows'&&f.object==='finance_direct_money_receipts'));
 assert.ok(r.object_differences.some(f=>f.section==='rows'&&f.object==='finance_cash_transactions'));
});

test('066 compact verifier preserves Supabase default ACLs but never silently accepts new-function exposure',async()=>{
 await fixture.setup(false);
 await db.exec('alter default privileges in schema public grant execute on functions to anon,authenticated,service_role');
 const pre=await verify(a.preflight(c));assert.equal(pre.gate_pass,true);
 const sql=a.verifier(c,JSON.stringify(pre.baseline));await db.exec(migration('66'));
 assert.equal((await verify(sql)).gate_pass,true);
 await db.exec('grant execute on function public.document_direct_source(uuid) to public');
 const r=await verify(sql);assert.equal(r.gate_pass,false);assert.ok(r.failed_checks.includes('required_security'));
});

test('066 compact verifier rejects corrupted approved baseline and altered expected hashes',async()=>{
 const {pre,sql}=await setup();const bad=structuredClone(pre.baseline);bad.state.rows.finance_expenses.count++;
 assert.throws(()=>a.verifier(c,JSON.stringify(bad)),/baseline SHA-256/);
 const notPassed=structuredClone(pre.baseline);notPassed.gate_pass=false;
 assert.throws(()=>a.verifier(c,JSON.stringify(notPassed)));
 const m=compact.buildManifest(a,c,pre.baseline),hash=m.after.functions['document_direct_source(uuid)'];
 const r=await verify(sql.replace(hash,'0'.repeat(64)));
 assert.equal(r.gate_pass,false);assert.ok(r.failed_checks.includes('expected_manifest_exact'));
});

// Last: commit only this disposable fixture to exercise a real READ ONLY
// transaction. No test opens a network connection or uses Production data.
test('066 compact verifier runs as one SELECT inside a READ ONLY transaction',async()=>{
 const {sql}=await setup(),before=await state();
 await db.exec('commit;begin read only');
 const results=await db.exec(sql);assert.equal(results.length,1);assert.equal(results[0].rows[0].gate_pass,true);
 assert.deepEqual(await state(),before);assert.equal(await scalar('show transaction_read_only'),'on');
 await db.exec('rollback;begin');
});
