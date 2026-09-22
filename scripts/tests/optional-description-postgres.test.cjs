/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated synthetic PostgreSQL only; never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict');
const prior=require('./employee-reimbursement-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,migration}=require('./receipt-foundation.test.cjs');
const artifacts=require('./optional-description-artifacts.cjs');
const lines=(claim,description)=>requests.items([300,120],{description,...(claim?{}:{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:{vat_mode:'none',vat_rate:7,wht_state:'none',wht_rate:3},supplier_payee_id:null,vendor_name:'Synthetic supplier'})});
for(const claim of [false,true])test(`062 ${claim?'Reimbursement':'Company'} empty/nonempty multi-item Draft and Submit; upper limit and NOT NULL preserved`,async()=>{
 await prior.setup();await rejects('select save_finance_expense_request($1,$2,null,$3,\'\',$4)',[require('node:crypto').randomUUID(),require('node:crypto').randomUUID(),claim?'employee_claim':'company_expense_batch',JSON.stringify(lines(claim,''))],/description_check/);
 await db.exec(migration('62'));const kind=claim?'employee_claim':'company_expense_batch',items=lines(claim,'');items[1].input.description='Existing details kept';
 const r=await requests.save(items,kind);const draft=await requests.read(r.id);assert.deepEqual(draft.items.map(e=>e.description),['','Existing details kept']);
 await rpc('submit_finance_expense_request',[r.id,draft.version]);const submitted=await requests.read(r.id);assert.equal(submitted.status,'submitted');assert.deepEqual(submitted.items.map(e=>e.description),['','Existing details kept']);assert.ok(submitted.items.every(e=>e.status==='submitted'));
 for(const description of ['x'.repeat(2001),null])await rejects('select save_finance_expense_request($1,$2,null,$3,\'\',$4)',[require('node:crypto').randomUUID(),require('node:crypto').randomUUID(),kind,JSON.stringify(lines(claim,description))],/description_check|not-null/);
 for(const table of ['finance_cash_transactions','finance_payouts','finance_expense_obligations'])assert.equal(await scalar('select count(*)::int from '+table),0);
});
test('062 exact preflight, rollback-only dry-run, verifier; preserve all historical data and functions',async()=>{
 await prior.setup();const old=await requests.save(lines(true,'Historical description'));
 const baseline=await requests.read(old.id),files=artifacts.workflow();
 for(const[file,sql]of Object.entries(files))assert.equal(require('node:fs').readFileSync(file,'utf8'),sql);
 assert.deepEqual((await query(files[artifacts.filenames.pre]))[0].failed_checks,[]);
 await db.exec('commit');const rehearsal=(await db.exec(files[artifacts.filenames.dry])).flatMap(r=>r.rows).find(r=>'optional_description_verification_pass'in r);
 assert.deepEqual(rehearsal.failed_checks,[]);assert.equal(rehearsal.rehearsal_baseline_available,true);
 assert.deepEqual((await query(files[artifacts.filenames.pre]))[0].failed_checks,[]);
 await db.exec('begin');await db.exec(migration('62'));
 assert.deepEqual((await query(files[artifacts.filenames.verify]))[0].failed_checks,[]);assert.deepEqual(await requests.read(old.id),baseline);
});
