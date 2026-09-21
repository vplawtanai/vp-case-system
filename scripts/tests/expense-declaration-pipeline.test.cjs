/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL and rendered local DTOs only. No Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./expense-request-postgres.test.cjs');
const {db,query,scalar,rpc,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture}=require('./expense-foundation-fixture.cjs');
const {companyDeclarationsMatch}=require('../../app/finance/expenses/company-declarations.ts');
const {creatorPaymentLabel}=require('../../app/finance/expenses/company-money.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const review=workspaceFixture('app/finance/expenses/company-review.tsx',['CompanyItemReview']);
const modal=workspaceFixture('app/finance/expenses/request-modal.tsx',['requestItemFromExpense']);

test('Declaration pipeline: warm 056 readers, apply 057 unchanged, save/edit/submit/read/render four exact facts',async()=>{
 await prior.setup();
 const warm=await prior.save(prior.items([1],{personally_paid:false,reimbursement_requested:0}),'company_expense_batch');
 await prior.read(warm.id);await rpc('submit_finance_expense_request',[warm.id,1]);await prior.read(warm.id);
 await db.exec(migration('57'));
 const facts=['unpaid','company_paid','personal_paid','unknown'],awareness=['no','yes','unknown','no'];
 const lines=facts.map((fact,i)=>prior.items([(i+1)*100],{creator_payment_fact:fact,vat_awareness:awareness[i],wht_awareness:awareness[(i+1)%4],personally_paid:fact==='personal_paid',claimant_id:fact==='personal_paid'?ids.staff:null,reimbursement_requested:fact==='personal_paid'?200:0})[0]);
 const r=await prior.save(lines,'company_expense_batch');let doc=await prior.read(r.id);
 assert.ok(companyDeclarationsMatch(lines,doc));
 // Reopened editor payload is rebuilt from the actual server response, not retained local values.
 const edited=doc.items.map(modal.requestItemFromExpense);
 await rpc('save_finance_expense_request',[r.id,randomUUID(),doc.version,'company_expense_batch','Edited synthetic request',edited]);
 doc=await prior.read(r.id);assert.ok(companyDeclarationsMatch(edited,doc));
 const stored=await query('select e.id,e.creator_payment_fact,e.vat_awareness,e.wht_awareness,e.claimant_id,e.reimbursement_requested from finance_expense_request_items i join finance_expenses e on e.id=i.expense_id where i.request_id=$1 and i.active order by i.item_no',[r.id]);
 assert.deepEqual(stored.map(i=>i.creator_payment_fact),facts);
 await rpc('submit_finance_expense_request',[r.id,doc.version]);doc=await prior.read(r.id);
 assert.ok(companyDeclarationsMatch(edited,doc));assert.equal(doc.items.reduce((n,i)=>n+i.gross_amount,0),1000);
 assert.deepEqual(doc.items.map(i=>i.creator_payment_fact),facts);
 assert.equal(doc.items[2].claimant_id,ids.staff);assert.equal(doc.items[2].reimbursement_requested,200);
 for(const [i,row]of doc.items.entries()){
  assert.equal(row.status,'submitted');assert.equal(row.vat_awareness,awareness[i]);assert.equal(row.wht_awareness,awareness[(i+1)%4]);
  const audit=await scalar("select evidence_json from finance_expense_audit where expense_id=$1 and event_type='submitted'",[row.id]);
  assert.equal(audit.creator_payment_fact,facts[i]);assert.equal(audit.vat_awareness,row.vat_awareness);assert.equal(audit.wht_awareness,row.wht_awareness);
  for(const locale of ['th','en']){
   const f=fixture('list'),html=review.render(locale,{}, {row,access:{...f.data.access,can_manage:false,can_tax_review:false},lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false},'CompanyItemReview');
   assert.ok(html.includes(translate(locale,'expenses.'+creatorPaymentLabel(row))));
   const creator=html.split('data-creator-tax="true"')[1].split('</div>')[0];
   assert.ok(creator.includes(translate(locale,'expenses.'+row.vat_awareness)));
   assert.ok(creator.includes(translate(locale,'expenses.'+row.wht_awareness)));
  }
 }
 await db.exec(`update user_profiles set can_view_all_expense_claims=true where id='${ids.staff}'`);
 await asActor(ids.staff,async()=>assert.ok(companyDeclarationsMatch(edited,await prior.read(r.id))));
 for(const table of ['finance_cash_transactions','finance_expense_obligations','finance_expense_settlements','finance_expense_tax_reviews','finance_outgoing_wht_obligations','finance_payouts'])assert.equal(await scalar('select count(*)::int from '+table),0,table);
});

test('Declaration read-back: absent/changed facts, payer, amount, membership block; explicit unknown is not absence',()=>{
 const input={creator_payment_fact:'unpaid',vat_awareness:'no',wht_awareness:'yes',personally_paid:false,claimant_id:'',reimbursement_requested:0};
 const lines=[{id:'synthetic',input}],doc={items:[{id:'synthetic',...input,claimant_id:null}]};
 assert.ok(companyDeclarationsMatch(lines,doc));
 for(const [key,value]of Object.entries({creator_payment_fact:undefined,vat_awareness:'unknown',wht_awareness:'pending',personally_paid:true,claimant_id:'another',reimbursement_requested:200}))assert.equal(companyDeclarationsMatch(lines,{items:[{...doc.items[0],[key]:value}]}),false,key);
 assert.equal(companyDeclarationsMatch(lines,{items:[]}),false);
 assert.equal(companyDeclarationsMatch(lines,{items:[{...doc.items[0],id:'another'}]}),false);
 assert.notEqual(creatorPaymentLabel({creator_payment_fact:null}),creatorPaymentLabel({creator_payment_fact:'unknown'}));
});

test('Declaration tax display remains separate from a differing Finance review',()=>{
 const f=fixture('list'),row={...f.data.rows[0],vat_awareness:'no',wht_awareness:'yes',tax_review:{vat_state:'exists',wht_state:'none',eligibility:'ineligible'}};
 for(const locale of ['th','en']){
  const html=review.render(locale,{}, {row,access:{...f.data.access,can_manage:false,can_tax_review:false},lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false},'CompanyItemReview');
  const creator=html.split('data-creator-tax="true"')[1].split('</div>')[0],finance=html.split('data-finance-tax="true"')[1].split('</div>')[0];
  assert.ok(creator.includes(translate(locale,'expenses.no')));assert.ok(creator.includes(translate(locale,'expenses.yes')));
  assert.ok(finance.includes(translate(locale,'expenses.exists')));assert.ok(finance.includes(translate(locale,'expenses.none')));
 }
});
