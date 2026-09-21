/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id}=require('./expense-foundation-fixture.cjs');
const {companyMoneyModes,companyMoneyIncomplete,companyHistoricalMoney}=require('../../app/finance/expenses/company-money.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm','ExpenseSettlementForm']);
const modalStub={default:({children,footer})=>React.createElement('div',null,children,footer)};
const modal=workspaceFixture('app/finance/expenses/request-modal.tsx',['ExpenseRequestModal'],{'../../components/DetailModal':modalStub});
const review=workspaceFixture('app/finance/expenses/company-review.tsx',['CompanyItemReview']);
const f=fixture('list'),props={access:{...f.data.access,creator_payment_fact_supported:true,company_declaration_without_account_supported:true,can_create_company:true},lookups:f.lookups,accounts:f.data.accounts,run:()=>{throw Error('No writes');},busy:false,claim:false,onCapture:()=>{}};
test('Two-flow UI: new Company item has exactly paid/unpaid radios, no personal/unknown selection; Claim unchanged',()=>{
 for(const locale of ['th','en']){
  const html=forms.render(locale,{},props,'ExpenseFactsForm');assert.equal((html.match(/type="radio"/g)||[]).length,2);
  assert.match(html,/value="company_paid"/);assert.match(html,/value="unpaid"/);assert.doesNotMatch(html,/id="expense-handling"|<option value="personal"/);
  assert.match(html,/href="\/finance\/expenses\/claims"/);
  const claim=forms.render(locale,{}, {...props,claim:true},'ExpenseFactsForm');assert.doesNotMatch(claim,/type="radio"|id="expense-handling"/);assert.ok(claim.includes(translate(locale,'expenses.claimRequestHelp')));
 }
});
test('Two-flow UI: incomplete money declaration can stay Draft, cannot silently submit; historical exceptions retained',()=>{
 assert.equal(companyMoneyIncomplete([{creator_payment_fact:null}]),true);assert.equal(companyMoneyIncomplete([{creator_payment_fact:'unpaid'}]),false);
 for(const fact of ['personal_paid','unknown']){
  const row=expense(10,{creator_payment_fact:fact,personally_paid:fact==='personal_paid',claimant_id:fact==='personal_paid'?id(1):null});
  assert.equal(companyHistoricalMoney(row),true);assert.equal(companyHistoricalMoney({...row,version:0}),false);
  const html=forms.render('th',{}, {...props,row},'ExpenseFactsForm');assert.match(html,/id="expense-handling"/);assert.match(html,new RegExp('value="'+(fact==='personal_paid'?'personal':fact)+'" selected=""'));
  const copy=forms.render('th',{}, {...props,row:{...row,version:0}},'ExpenseFactsForm');assert.doesNotMatch(copy,/expense-handling|expense-claimant_id|expense-reimbursement_requested/);
 }
 const r={id:id(900),kind:'company_expense_batch',status:'draft',version:1,note:'',created_by:id(1),created_at:'2026-09-20',submitted_at:null,requester_name:'Synthetic',audit:[],items:[expense(10,{status:'draft',creator_payment_fact:null})]};
 const html=modal.render('en',{}, {...props,request:r,error:'',onClose:()=>{},onSaved:()=>{}},'ExpenseRequestModal');
 assert.match(html,/<button[^>]*disabled=""[^>]*>[^]*?Send for review<\/button>/);assert.ok(html.includes('Save for later'));assert.ok(html.includes(translate('en','expenses.companyMoneyIncomplete').replaceAll("'",'&#x27;')));
});
test('Two-flow UI: pre-declaration personal rows stay editable; 058 staff creation needs no account; older backend retains its guard',()=>{
 const row=expense(10,{creator_payment_fact:null,personally_paid:true,claimant_id:id(1)});
 assert.equal(companyHistoricalMoney(row),true);
 assert.match(forms.render('th',{}, {...props,row},'ExpenseFactsForm'),/id="expense-claimant_id"/);
 const html=forms.render('en',{}, {...props,access:{...props.access,can_manage:false}},'ExpenseFactsForm');
 assert.doesNotMatch(html,/<button[^>]*disabled=""|expense-payment-account/);
 const prior=forms.render('en',{}, {...props,access:{...props.access,can_manage:false,company_declaration_without_account_supported:undefined}},'ExpenseFactsForm');assert.match(prior,/expense-payment-account/);assert.doesNotMatch(prior,/type="radio"/);
});
test('Two-flow UI: unpaid Review fixes the existing supplier mode; paid and historical controls cannot create irrelevant payables',()=>{
 const row=expense(10,{status:'submitted',creator_payment_fact:'unpaid'});
 assert.deepEqual(companyMoneyModes(row),['supplier_unpaid']);assert.deepEqual(companyMoneyModes({...row,creator_payment_fact:'company_paid'}),['undecided','company_bank','company_cash']);
 for(const locale of ['th','en']){
  const unpaid=forms.render(locale,{}, {...props,row,companyReview:true,plan:{reason:'Synthetic',onPlan:()=>{}}},'ExpenseSettlementForm');assert.doesNotMatch(unpaid,/id="expense-settlement-mode"/);assert.match(unpaid,/id="settlement-payee"/);assert.match(unpaid,/id="settlement-due"/);assert.doesNotMatch(unpaid,/expense-payment-account/);
  const legacy=forms.render(locale,{}, {...props,row:{...row,creator_payment_fact:'unknown'},companyReview:true},'ExpenseSettlementForm');assert.match(legacy,/id="expense-settlement-mode"/);
  const paid=forms.render(locale,{}, {...props,row:{...row,creator_payment_fact:'company_paid'},companyReview:true},'ExpenseSettlementForm');assert.ok(paid.includes(translate(locale,'expenses.companyPaidChannel')));assert.ok(!paid.includes(translate(locale,'expenses.companyMoneyDecision')));assert.doesNotMatch(paid,/<option value="supplier_unpaid"/);
 }
});
test('Two-flow UI: paid Review reuses controlled account/payment panel only after settlement, even with tax pending',()=>{
 for(const locale of ['th','en']){
  const row=expense(10,{status:'accepted',creator_payment_fact:'company_paid',tax_review:null,settlement:{id:id(99),mode:'company_bank',payee_id:null,amount:100,reason:'Reviewed'}});
  const html=review.render(locale,{}, {...props,row},'CompanyItemReview');assert.match(html,/expense-payment-account/);assert.ok(html.includes(translate(locale,'expenses.recordPaidOutflow')));assert.ok(html.includes(translate(locale,'expenses.pending')));
  const unpaid=review.render(locale,{}, {...props,row:{...row,creator_payment_fact:'unpaid',settlement:{...row.settlement,mode:'supplier_unpaid'}}},'CompanyItemReview');assert.doesNotMatch(unpaid,/expense-payment-account/);
 }
});
test('Two-flow UI: creator paid/unpaid statement remains visible while Finance tax is pending',()=>{
 for(const fact of ['company_paid','unpaid'])for(const locale of ['th','en']){
  const html=review.render(locale,{}, {...props,row:expense(10,{status:'submitted',creator_payment_fact:fact,tax_review:null,vat_awareness:'unknown',wht_awareness:'unknown'})},'CompanyItemReview');
  assert.ok(html.includes(translate(locale,fact==='company_paid'?'expenses.handlingCompanyPaid':'expenses.companyUnpaid')));assert.match(html,/data-finance-tax/);assert.ok(html.includes(translate(locale,'expenses.pending')));
 }
});
