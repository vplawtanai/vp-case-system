/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable fixture adaptation ONLY. Never runs from a candidate or gate.
// Install independently reconciled ACLs INTO the fixture; never export fixture
// permissions into the accepted Production contract.
const assert=require('node:assert/strict');
const R=require('./finance-payable-bulk-reconcile.cjs');
const A=require('./finance-payable-bulk-artifacts.cjs');
async function installAcceptedSecurity(db,query,scalar){
 assert.match(process.env.VP068_TEST_SOCKET||'',/^\/private\/tmp\/vp068-pg-088-[A-Za-z0-9_-]+$/);
 R.validate();const evidence=require('./fixtures/finance-payable-bulk-accepted-evidence.json');
 for(const f of evidence.functions){
  assert.equal(await scalar('select pg_get_functiondef(to_regprocedure($1))',[f.signature]),f.definition,'Fixture definition must independently match: '+f.signature);
  await query('update pg_proc set proacl=$1::aclitem[] where oid=to_regprocedure($2)',[f.acl,f.signature]);
 }
 for(const t of evidence.tables)await query('update pg_class set relacl=$1::aclitem[] where oid=to_regclass($2)',[t.acl,t.name]);
 const state=await scalar(A.snapshot());
 assert.deepEqual(state.functions,A.contract().functions,'All accepted function metadata/grants exact');
 assert.deepEqual(state.tables,A.contract().tables,'All accepted table components/column ACLs exact');
}
module.exports={installAcceptedSecurity};
