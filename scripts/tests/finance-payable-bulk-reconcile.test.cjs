/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('./finance-payable-bulk-reconcile.cjs');
const evidence=require('./fixtures/finance-payable-bulk-accepted-evidence.json');
const contract=require('./fixtures/finance-payable-bulk-contract.json');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
test('088 dependency evidence derives from accepted contracts, not synthetic security',()=>{
 assert.equal(R.validate(),true);
 assert.equal(contract.provenance.functionPinsFrom078,13);assert.equal(contract.provenance.functionPinsFrom071,10);
 for(const name of ['expense_integrity','get_finance_expense_obligations'])assert.deepEqual(evidence.functions.find(f=>f.name===name),R.sourceFunction(name));
 assert.match(R.sourceFunction('expense_integrity').definition,/EXPENSE_REQUEST_RECIPIENT_INTEGRITY/);
 assert.match(R.sourceFunction('get_finance_expense_obligations').definition,/left join public.finance_payees/);
 assert.doesNotMatch(fs.readFileSync('scripts/tests/finance-payable-bulk-postgres.test.cjs','utf8'),/writeFileSync\(A.contractPath/);
});
for(const field of ['definition','acl','owner','security_definer','config'])test('088 rejects self-consistent forged function evidence: '+field,()=>{
 const e=structuredClone(evidence),c=structuredClone(contract),f=e.functions.find(f=>f.name==='expense_integrity');
 f[field]=field==='config'?['search_path=pg_catalog']:field==='security_definer'?false:field==='definition'?f.definition.replace('EXPENSE_AUDIT_INTEGRITY','UNEXPECTED'):field==='owner'?'authenticated':'{postgres=X/postgres}';
 c.functions[f.signature]=fingerprint(f);assert.throws(()=>R.validateEvidence(e,c));
});
for(const field of ['acl','column_acl','policies','triggers','not_null'])test('088 rejects table drift even if replacement full-object hash agrees: '+field,()=>{
 const e=structuredClone(evidence),c=structuredClone(contract),t=e.tables.find(t=>t.name==='finance_cash_transactions');
 if(field==='acl')t.acl='{postgres=arwdDxtm/postgres}';
 if(field==='column_acl')t.columns[0].acl='{authenticated=r/postgres}';
 if(field==='policies')t.policies.find(p=>p.policyname==='finance078_cash_movements_scope').qual='true';
 if(field==='triggers')t.triggers.find(p=>p.name==='finance078_effective_lifecycle_guard').enabled='D';
 if(field==='not_null')t.columns[0].not_null=false;
 c.tables[t.name]=fingerprint(t);assert.throws(()=>R.validateEvidence(e,c));
});
test('088 accepted evidence is independent of object list order',()=>{
 const e=structuredClone(evidence);e.functions.reverse();e.tables.reverse();assert.equal(R.validateEvidence(e,contract),true);
});
test('088 candidate changes ONLY the original dependency guard hashes',()=>{
 const {createHash}=require('node:crypto');
 const diagnostic=fs.readFileSync('scripts/sql/diagnose_finance_payable_bulk_088_contract.sql','utf8');
 const f=/'([^'\n]+)'::jsonb fixture_functions/.exec(diagnostic)[1],t=/'([^'\n]+)'::jsonb fixture_tables/.exec(diagnostic)[1];
 const sql=fs.readFileSync('supabase/migrations/202610030088_finance_payable_bulk_payment.sql','utf8');
 const original=sql.replace(/ IF s->'functions'[^\n]+/,` IF s->'functions' IS DISTINCT FROM '${f}'::jsonb OR s->'tables' IS DISTINCT FROM '${t}'::jsonb THEN RAISE EXCEPTION 'FINANCE088_CONTRACT_DRIFT'; END IF;`);
 assert.equal(createHash('sha256').update(original).digest('hex'),'02010ab7b56100146c455d582e40e43e28ebf761beb7068e220dd95a1184487c');
});
