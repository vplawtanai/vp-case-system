/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
// In-memory PostgreSQL only: no credentials, network or Production transactions.
const root='./';
const prior=require(root+'employee-reimbursement-postgres.test.cjs'),company=require(root+'company-review-modal-postgres.test.cjs'),requests=require(root+'expense-request-postgres.test.cjs'),expense=require(root+'expense-foundation-postgres.test.cjs'),treasury=require(root+'treasury-postgres.test.cjs');
const {db,scalar,rpc,migration,rejects,asActor,ids}=require(root+'receipt-foundation.test.cjs');
test('Input VAT source review: four paid/refunded sources complete without money side effects',async()=>{
 await prior.setup();for(const n of ['62','63','64'])await db.exec(migration(n));await treasury.opening({amount:10000});
 const claims=await requests.save(requests.items([500,300,500]));await rpc('submit_finance_expense_request',[claims.id,1]);
 const rows=(await requests.read(claims.id)).items;
 for(const e of rows){await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,e.gross_amount,'']);await expense.confirm(await expense.prepare(e.id));}
 const choices=company.choices({wht_state:'none',wht_rate:0});
 const purchase=await requests.save(requests.items([300],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Synthetic Big C'}),'company_expense_batch');
 await rpc('submit_finance_expense_request',[purchase.id,1]);const c=(await requests.read(purchase.id)).items[0];await company.approve(c,choices);await expense.confirm(await expense.prepare(c.id));
 const queue=()=>scalar("select get_finance_tax_input_evidence('2026-09-01')");assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,4);
 const protectedTables=['finance_expenses','finance_expense_requests','finance_expense_request_items','finance_expense_claims','finance_payees','finance_expense_obligations','finance_expense_settlements','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_outgoing_wht_obligations','finance_tax_filings','finance_tax_remittances'];
 const hashes=()=>Promise.all(protectedTables.map(t=>scalar('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,\'[]\')) from '+t+' t')));const before=await hashes();
 for(const [i,e] of rows.entries()){
  const input=expense.tax({vat_state:i===2?'none':'exists',vat_base:i===0?467.29:280.37,vat_rate:7,eligibility:i===0?'eligible':'ineligible',tax_document_reference:'LOCAL-'+i,wht_state:'pending'});
  const id=randomUUID();await asActor(ids.staff,()=>rejects('select review_finance_expense_tax($1,$2,null,$3)',[id,e.id,input],/PERMISSION_DENIED/));await rpc('review_finance_expense_tax',[id,e.id,null,input]);await rpc('review_finance_expense_tax',[id,e.id,null,input]);
  assert.equal(await scalar('select count(*)::int from finance_expense_tax_reviews where expense_id=$1',[e.id]),1);
  assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,3-i);
 }
 const latest=(await scalar('select get_finance_expenses($1)',[c.id])).record.tax_review;
 const id=randomUUID(),input={...latest.request_json.raw_input,eligibility:'eligible',supplier_tax_id:'1234567890123',tax_document_reference:'LOCAL-BIGC',tax_document_date:'2026-09-10',company_name_status:'yes',reason:'Verified invoice'};
 await rpc('review_finance_expense_tax',[id,c.id,latest.id,input]);await rpc('review_finance_expense_tax',[id,c.id,latest.id,input]);
 assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,0);assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,52.34);
 assert.deepEqual(await hashes(),before);
 assert.equal(await scalar('select count(*)::int from finance_expense_tax_reviews where expense_id=$1',[c.id]),2,'One revision added to existing Company review');
 assert.equal(await scalar("select count(*)::int from finance_tax_source_revisions where source_type='expense'"),2,'Only eligible sources materialize tax facts, retries add nothing');
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),2);
 const after=(await scalar('select get_finance_expenses($1)',[c.id])).record;
 assert.deepEqual([after.tax_review.vat_base,after.tax_review.vat_amount,after.tax_review.wht_state,after.tax_review.wht_amount],[280.37,19.63,'none',null]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).input_vat_complete,false,'Queue review never certifies whole-pool filing completeness');
 // A stale second reviewer cannot append another review or duplicate the fact.
 await rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),c.id,latest.id,input],/STALE/);
 // Existing external evidence remains independently reviewable on the same tax source ledger.
 const external=randomUUID(),externalReview=randomUUID();await rpc('save_finance_external_input_vat',[external,{vendor:'Synthetic external',invoice_date:'2026-09-10',invoice_number:'EXTERNAL-LOCAL',tax_base:100,vat_amount:7,note:'Third party paid',funding_source:'third_party_no_reimbursement'},true]);
 await rpc('review_finance_external_input_vat',[externalReview,external,null,'eligible','Verified',true]);await rpc('review_finance_external_input_vat',[externalReview,external,null,'eligible','Verified',true]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,59.34);
 await rpc('review_finance_external_input_vat',[randomUUID(),external,externalReview,'ineligible','Not eligible',true]);assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,52.34);
 // Correcting the existing Company eligibility removes its active credit without touching money.
 await rpc('review_finance_expense_tax',[randomUUID(),c.id,id,{...input,eligibility:'ineligible',reason:'Do not claim this credit'}]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,32.71);assert.equal((await queue()).expenses.filter(e=>e.status==='pending').length,0);
 assert.deepEqual(await hashes(),before);
});
