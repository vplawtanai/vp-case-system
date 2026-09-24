/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL/WASM only. No network or Production credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./direct-money-documents-postgres.test.cjs');
const {db,query,scalar,ids}=require('./receipt-foundation.test.cjs');
const a=require('./direct-money-documents-artifacts.cjs'),compact=require('./direct-money-documents-dry-run.cjs');
const c=a.validate();
const savepoint=sql=>sql.replace(/^BEGIN;/m,'SAVEPOINT compact066;').replace(/^ROLLBACK;/m,'ROLLBACK TO SAVEPOINT compact066; RELEASE SAVEPOINT compact066;');
const state=()=>scalar(a.captureSql(c));
const result=results=>results.at(-1).rows[0];
async function setup(){
 await fixture.setup(false);
 const pre=(await query(a.preflight(c)))[0];assert.equal(pre.gate_pass,true);
 assert.equal(compact.fingerprint(pre.baseline.state),pre.baseline.state_sha256,'Node canonical JSON equals PostgreSQL jsonb hashing');
 return {pre,before:await state(),sql:a.dryRun(c,JSON.stringify(pre.baseline))};
}
async function rejectedBatch(sql,pattern){
 await db.exec('savepoint failure066');
 try{await assert.rejects(db.exec(savepoint(sql)),pattern);}
 finally{await db.exec('rollback to savepoint failure066;release savepoint failure066');}
}

test('066 compact artifact is bounded, contains exact candidate once, and preserves approved evidence linkage',()=>{
 const m=compact.validateManifest(c,JSON.parse(fs.readFileSync(compact.manifestPath)));
 const sql=fs.readFileSync(a.files.dryRun,'utf8');assert.equal(sql,a.dryRun(c));
 assert.equal(sql.split(a.source()).length,2);assert.ok(Buffer.byteLength(sql)<300000);
 assert.ok(Buffer.byteLength(sql)<fs.statSync(a.files.preflight).size);
 assert.equal(Object.keys(m.before.functions).length,82);assert.equal(Object.keys(m.after.functions).length,91);
 assert.equal(m.tableNames.length,34);assert.equal(m.rowTables.length,89);
 for(const name of ['finance_expenses','finance_expense_claims','finance_expense_obligations','finance_expense_settlements','finance_payable_entitlements','finance_payouts','finance_cash_transactions','finance_direct_money_receipts','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_filings'])assert.ok(m.rowTables.includes(name),name);
 assert.ok(!m.tableNames.includes('finance_quotations'),'Unrelated quotation schema is not an exactness prerequisite');
 assert.ok(/prior 490 broader differences remain unresolved/i.test(sql),'Broader evidence remains unresolved');
 assert.ok(/ROLLBACK;\n-- Independently read the restored state/.test(sql),'Final check follows explicit rollback');
 assert.ok(/AS rollback_verified/.test(sql),'Final result exposes restoration status');
 assert.equal(m.approvedBaselineSha,'3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e');
});

test('066 compact exact scopes and row hashes pass, then all local catalog/security/data restore',async()=>{
 const {before,sql}=await setup();const r=result(await db.exec(savepoint(sql)));
 assert.equal(r.gate_pass,true);assert.equal(r.rollback_verified,true);assert.deepEqual(r.failed_checks,[]);
 assert.deepEqual(await state(),before);
 assert.equal(await scalar("select to_regprocedure('public.document_direct_source(uuid)')::text"),null);
});

test('066 compact baseline corruption and altered embedded candidate fail before any candidate execution',async()=>{
 const {pre,before,sql}=await setup();const bad=structuredClone(pre.baseline);bad.state.rows.finance_expenses.count++;
 assert.throws(()=>a.dryRun(c,JSON.stringify(bad)),/baseline SHA-256/);
 await rejectedBatch(sql.replace('$candidate066$'+a.source(),()=>'$candidate066$-- tampered\n'+a.source()),/CANDIDATE SHA MISMATCH/);
 assert.deepEqual(await state(),before);
});

test('066 compact preconditions reject helper privilege, dependency schema and business-row drift',async()=>{
 const {before,sql}=await setup();
 for(const drift of [
  'grant execute on function public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric) to authenticated',
  'alter table public.finance_document_counters add column unexpected text',
  "create function public.document_direct_source(text) returns text language sql as 'select $1'",
  `update public.clients set name='Unexpected real-record change' where id='${ids.client}'`
 ]){
  await db.exec('savepoint drift066');await db.exec(drift);
  await rejectedBatch(sql,/SCOPED PRECONDITIONS FAILED/);
  await db.exec('rollback to savepoint drift066;release savepoint drift066');
 }
 assert.deepEqual(await state(),before);
});

test('066 compact post assertions detect RLS, ACL, definition and economic-data side effects; all roll back',async()=>{
 const {before,sql}=await setup();
 for(const drift of [
  'ALTER TABLE public.finance_receipts DISABLE ROW LEVEL SECURITY;',
  'GRANT SELECT ON public.finance_receipts TO anon;',
  'REVOKE EXECUTE ON FUNCTION public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric) FROM service_role;',
  "ALTER FUNCTION public.document_direct_source(uuid) SET search_path TO public,pg_catalog;",
  `UPDATE public.clients SET name='Unintended business mutation' WHERE id='${ids.client}';`
 ])await rejectedBatch(sql.replace(' EXECUTE candidate_sql;',' EXECUTE candidate_sql;\n '+drift),/POST-MIGRATION ASSERTIONS FAILED/);
 assert.deepEqual(await state(),before);
});

test('066 compact explicit new-function ACLs survive Supabase-style default EXECUTE grants',async()=>{
 await fixture.setup(false);
 await db.exec('alter default privileges in schema public grant execute on functions to anon,authenticated,service_role');
 const pre=(await query(a.preflight(c)))[0];assert.equal(pre.gate_pass,true);
 const before=await state(),sql=a.dryRun(c,JSON.stringify(pre.baseline));
 const r=result(await db.exec(savepoint(sql)));assert.equal(r.rollback_verified,true);
 assert.deepEqual(await state(),before);
});

test('066 compact final read returns rollback_verified=false and object failures on restored-state mismatch',async()=>{
 const {sql}=await setup();
 const injected=savepoint(sql).replace('-- Independently read the restored state',`UPDATE public.clients SET name='Restored state mismatch' WHERE id='${ids.client}';\n-- Independently read the restored state`);
 const r=result(await db.exec(injected));assert.equal(r.gate_pass,false);assert.equal(r.rollback_verified,false);
 assert.ok(r.failed_checks.some(f=>f.section==='rows'&&f.object==='clients'));
});

// Last test commits only the synthetic pre-066 fixture so the REAL BEGIN/ROLLBACK
// can be exercised. Earlier tests use savepoints to keep their fixture isolated.
test('066 compact complete unchanged batch executes real BEGIN/ROLLBACK and returns verified restoration',async()=>{
 const {before,sql}=await setup();await db.exec('commit');
 const r=result(await db.exec(sql));assert.equal(r.rollback_verified,true);assert.deepEqual(r.failed_checks,[]);
 assert.deepEqual(await state(),before);
 await db.exec('begin');
});
