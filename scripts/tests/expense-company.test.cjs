/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),cp=require('node:child_process');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id,tax,obligation}=require('./expense-foundation-fixture.cjs');
const {companyRequests,companySummary,companyQueue,companyReviewComplete,companyProgress,companyTimeline,companyPayee,noTaxReviewArgs}=require('../../app/finance/expenses/company-workflow.ts');
const {companyCategories,companyCategoryGroups}=require('../../app/finance/expenses/company-categories.ts');
const f=fixture('list'),noop=()=>{},run=()=>{throw Error('No writes');};
const request=(items,extra={})=>({id:id(900),kind:'company_expense_batch',status:'submitted',version:1,note:'',created_by:f.data.access.user_id,created_at:'2026-09-18T01:00:00Z',submitted_at:'2026-09-20T04:00:00Z',requester_name:'Synthetic creator',audit:[],items,...extra});
const reviewed=expense(11,{tax_review:tax,settlement:{mode:'supplier_unpaid',amount:100,payee_id:id(4)},obligation:obligation(40,id(11))});
const props={access:f.data.access,lookups:f.lookups,run,busy:false,error:'',onClose:noop,onEdit:noop};
const list=workspaceFixture('app/finance/expenses/company-list.tsx',['CompanyExpenseList']);
const review=workspaceFixture('app/finance/expenses/company-review.tsx',['CompanyRequestReview','CompanyItemReview'],{'../../components/DetailModal':{default:({children,footer})=>React.createElement('div',null,children,footer)}});
test('Authoritative kind filters Company requests only, including search and workflow ordering',()=>{
 const r=request([expense(10,{status:'submitted',description:'Needles',expense_date:'2020-01-01'})]),claim={...r,id:id(901),kind:'employee_claim'};
 assert.deepEqual(companyRequests([r,claim]),[r]);
 const options={claims:false,status:'all',search:'Synthetic creator',locale:'en',order:'newest'};
 assert.deepEqual(companyQueue([claim,r],options).map(e=>e.id),[r.id]);
 const later={...r,id:id(902),submitted_at:'2026-09-21T04:00:00Z'};
 assert.deepEqual(companyQueue([r,later],options).map(e=>e.id),[later.id,r.id]);
 assert.equal(companyQueue([r],{...options,search:'Needles'}).length,1);
 assert.equal(companyQueue([r],{...options,search:'Synthetic supplier'}).length,1);
});
test('Exclusive item lanes; separate request/item counts and no tax KPI',()=>{
 const a=request([expense(10,{status:'submitted',gross_amount:100}),expense(12,{status:'submitted',gross_amount:200})]);
 const b=request([{...reviewed,gross_amount:400},expense(13,{status:'rejected',gross_amount:50}),expense(14,{payout:{status:'confirmed'},gross_amount:300})],{id:id(901)});
 const s=companySummary([a,b,{...a,kind:'employee_claim'}]);
 assert.deepEqual(s,[{lane:'review',requests:1,items:2,amount:300},{lane:'unpaid',requests:1,items:1,amount:400},{lane:'paid',requests:1,items:1,amount:300},{lane:'rejected',requests:1,items:1,amount:50}]);
 assert.equal(s.reduce((n,s)=>n+s.items,0),5);
});
test('Company list has seven request-level columns, no origin/tax/payment columns or Claim leakage',()=>{
 for(const locale of ['th','en']){
  const html=list.render(locale,{}, {requests:[request([expense(10)]),request([expense(11)],{id:id(901),kind:'employee_claim',requester_name:'CLAIM MUST NOT LEAK'})],access:f.data.access,onRequest:noop},'CompanyExpenseList');
  assert.equal((html.match(/<th>/g)||[]).length,7);assert.doesNotMatch(html,/CLAIM MUST NOT LEAK|expense-origin-filter|company-origin/);assert.match(html,/data-request-row/);assert.doesNotMatch(html,/expenses\./);
 }
});
test('Atomic Company vocabulary grouped, unique, free-text compatible; historical and Claim unchanged',()=>{
 assert.equal(companyCategoryGroups.length,7);assert.equal(new Set(companyCategories.map(c=>c.value)).size,companyCategories.length);
 assert.ok(companyCategories.every(c=>c.value.length<=150&&c.label.th&&c.label.en));
 assert.ok(companyCategories.some(c=>c.value==='company.accommodation'));assert.ok(companyCategories.some(c=>c.value==='company.hosting'));
 const {expenseCategoryOptions,expenseCategoryLabel}=require('../../app/finance/expenses/categories.ts');
 assert.equal(expenseCategoryOptions('claim').length,8);assert.equal(expenseCategoryLabel('ค่าเดินทาง','th'),'ค่าเดินทาง / ที่พัก');assert.equal(expenseCategoryLabel('company.travel','th'),'ค่าเดินทาง');
});
test('Progress 0/2 -> 1/2 -> 2/2; approval alone is not complete tax/settlement',()=>{
 const e=expense(10,{status:'submitted'}),r=request([e,{...e,id:id(12)}]);
 assert.equal(companyProgress(r),0);assert.equal(companyProgress({...r,items:[reviewed,e]}),1);assert.equal(companyProgress({...r,items:[reviewed,{...e,status:'rejected'}]}),2);
 assert.equal(companyReviewComplete({...reviewed,tax_review:null}),false);assert.equal(companyReviewComplete({...reviewed,settlement:null}),false);assert.equal(companyReviewComplete(reviewed),true);
 assert.equal(companyProgress(request([{...reviewed,tax_review:null}])),0);
 assert.equal(companyProgress(request([{...reviewed,settlement:null}])),0);
});
test('Known payee derived by exact supplier ID or unique personal payer; ambiguous remains unresolved',()=>{
 assert.equal(companyPayee(expense(10),f.lookups).id,id(4));
 const personal=expense(10,{personally_paid:true,claimant_id:id(1)});assert.equal(companyPayee(personal,f.lookups).id,id(1));
 assert.equal(companyPayee(personal,{...f.lookups,payees:[...f.lookups.payees,{id:id(88),profile_id:id(1),legal_name:'Duplicate'}]}),null);
 assert.equal(companyPayee(expense(10,{supplier_payee_id:null}),f.lookups),null);
});
test('No-tax payload uses existing explicit tax contract, no monetary inference',()=>{
 const a=noTaxReviewArgs(expense(10),'operation','Explicit review');assert.equal(a.p_previous,null);assert.deepEqual([a.p_input.vat_state,a.p_input.wht_state,a.p_input.eligibility],['none','none','ineligible']);assert.equal(a.p_input.vat_base,null);assert.equal(a.p_input.wht_rate,null);assert.equal(a.p_input.reason,'Explicit review');
});
test('Company review three sections, permission guards, no payment execution/admin and TH/EN labels',()=>{
 for(const locale of ['th','en']){
  const e=expense(10,{status:'submitted',vat_awareness:'no',wht_awareness:'no'}),html=review.render(locale,{}, {...props,row:e},'CompanyItemReview');
  assert.equal((html.match(/<section>/g)||[]).length,3);assert.match(html,/company-review-reason/);assert.doesNotMatch(html,/expenses\.|prepare_finance|#payment|หลักฐานทางเทคนิค|Technical evidence/);
  const denied=review.render(locale,{}, {...props,row:e,access:{...f.data.access,can_manage:false,can_tax_review:false}},'CompanyItemReview');assert.doesNotMatch(denied,/company-review-reason|type="checkbox"/);
 }
});
test('Submitted timeline hides implicit draft; actual timestamps and review events retained',()=>{
 const r=request([reviewed]);assert.ok(!companyTimeline(r).some(e=>e.key==='created'));assert.ok(companyTimeline(r).some(e=>e.key==='submitted'));
 assert.ok(companyTimeline({...r,status:'draft',submitted_at:null}).some(e=>e.key==='created'));
});
test('Reimbursement summary absent when irrelevant; requested and approved remain distinct',()=>{
 const r=request([reviewed]),html=review.render('th',{}, {...props,request:r},'CompanyRequestReview');assert.ok(!html.includes('ยอดขอคืนให้ผู้สำรองจ่าย'));assert.ok(!html.includes('ยอดที่ต้องคืนบุคลากร'));
 const personal={...reviewed,personally_paid:true,reimbursement_requested:100,settlement:null};
 const pending=review.render('th',{}, {...props,request:request([personal])},'CompanyRequestReview');assert.ok(pending.includes('ยอดขอคืนให้ผู้สำรองจ่าย'));assert.ok(!pending.includes('ยอดที่ต้องคืนบุคลากร'));
 const decided=review.render('th',{}, {...props,request:request([{...personal,settlement:{mode:'reimburse',amount:80}}])},'CompanyRequestReview');assert.ok(decided.includes('ยอดที่ต้องคืนบุคลากร'));assert.ok(decided.includes('80.00 THB'));
});
test('Company Admin tools removed; query selection cannot open Claim; backend and Claim review unchanged',()=>{
 const source=fs.readFileSync('app/finance/expenses/workspace.tsx','utf8');assert.match(source,/claims && access.is_admin/);assert.match(source,/r.kind === \(claims \? "employee_claim" : "company_expense_batch"\)/);
 for(const file of ['app/finance/expenses/request-view.tsx','app/finance/expenses/request-operations.ts','app/finance/expenses/data.ts','app/finance/expenses/requests.ts'])assert.equal(fs.readFileSync(file,'utf8'),cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),file);
});
test('Company request capture does not invent an Item Type or persist unsupported paid/unpaid states',()=>{
 const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm']);
 for(const locale of ['th','en']){
  const html=forms.render(locale,{}, {...props,accounts:f.data.accounts,claim:false,onCapture:noop,row:expense(10,{status:'draft',personally_paid:false})},'ExpenseFactsForm');
  assert.match(html,/<option value="unknown" selected="">/);assert.doesNotMatch(html,/<option value="(?:unpaid|company_paid)"/);
  assert.doesNotMatch(html,/name="item_type"|id="expense-item-type"/);assert.match(html,/expense-vendor_name/);
 }
});
test('Finance plans use existing controls before approval without separate mutation buttons',()=>{
 const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseTaxForm','ExpenseSettlementForm']);
 for(const component of ['ExpenseTaxForm','ExpenseSettlementForm']){
  const html=forms.render('en',{}, {...props,row:expense(10,{status:'submitted'}),companyReview:true,plan:{onPlan:noop,reason:'Explicit review'}},component);
  assert.match(html,/data-review-plan=/);assert.doesNotMatch(html,/type="submit"|id="(?:tax|settlement)-reason"/);
  const standalone=forms.render('en',{}, {...props,row:expense(10)},component);assert.match(standalone,/type="submit"/);assert.doesNotMatch(standalone,/data-review-plan/);
 }
});
test('Only confirmed payout is displayed as company paid; settlement instructions are not money movement',()=>{
 for(const mode of ['company_bank','company_cash','supplier_unpaid']){
  const html=review.render('en',{}, {...props,row:{...reviewed,settlement:{...reviewed.settlement,mode},payout:null}},'CompanyItemReview');
  assert.doesNotMatch(html,/Company has already paid/);
 }
 const paid=review.render('en',{}, {...props,row:{...reviewed,payout:{status:'confirmed'}}},'CompanyItemReview');assert.match(paid,/<p>Paid<\/p>/);assert.match(paid,/Unknown \/ Finance to review/);
});
