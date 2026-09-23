/* eslint-disable @typescript-eslint/no-require-imports */
// Local fixture only; installs through 063. Never executes candidate 064 or its dry-run.
const {test}=require('node:test'),assert=require('node:assert/strict');
const prior=require('./employee-reimbursement-postgres.test.cjs');
const {db,query,migration}=require('./receipt-foundation.test.cjs');
const {captureSql}=require('./tax-064-baseline-capture.cjs');
test('064 baseline capture executes read-only on post-063 fixture, never endorses fixture as Production',async()=>{
 await prior.setup();await db.exec(migration('62'));await db.exec(migration('63'));
 await db.exec('SET TRANSACTION READ ONLY');
 const result=(await query(captureSql()))[0].baseline_evidence;
 assert.equal(result.classification_required,true);assert.equal(result.apply_or_dry_run_authorized,false);
 assert.deepEqual(result.accepted_063_verifier.failed_checks,[]);
 assert.ok(result.all_public_function_definitions.length>0);
 assert.ok(result.relation_security.length>0);
 assert.equal(result.catalog.some(t=>t.name==='finance_external_input_vat'),false);
});
