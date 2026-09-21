/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id}=require('./expense-foundation-fixture.cjs');
const {matchingSupplierPayees}=require('../../app/finance/payouts/payee-matching.ts');
const {companyMoneyCandidates,companyApprovalMissing}=require('../../app/finance/expenses/company-money.ts');
const {companyPayee,noTaxReviewArgs}=require('../../app/finance/expenses/company-workflow.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const {payoutBlock}=require('../../app/finance/payouts/shared.ts');
const f=fixture('list'),supplier={id:id(4),kind:'external',profile_id:null,legal_name:'Synthetic Supplier',entity_type:'juristic_person',tax_id:'1234567890123',version:1,is_active:true,destination:null};
const internal={...supplier,id:id(1),kind:'internal',profile_id:id(1)},row=expense(10,{status:'submitted',creator_payment_fact:'unpaid',vat_awareness:'no',wht_awareness:'no',supplier_payee_id:null});
const modal=workspaceFixture('app/finance/payouts/payee-modal.tsx',['PayeeModal'],{'../../components/DetailModal':{default:({title,children})=>React.createElement('section',null,React.createElement('h2',null,title),children)}});
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseSettlementForm']);
const props={onClose:()=>{},onSaved:()=>{},supplierContext:{name:'Synthetic Supplier'}};
test('Supplier matches exact Tax ID or conservative case/trim name; no fuzzy or employee match',()=>{
 assert.deepEqual(matchingSupplierPayees([supplier,internal],'  SYNTHETIC SUPPLIER  ',''),[supplier]);
 assert.deepEqual(matchingSupplierPayees([supplier,internal],'Different name',supplier.tax_id),[supplier]);
 for(const name of ['Synthetic-Supplier','Synthetic  Supplier','Synthetic',''])assert.deepEqual(matchingSupplierPayees([supplier],name,''),[]);
 assert.deepEqual(matchingSupplierPayees([{...supplier,is_active:false}],supplier.legal_name,''),[{...supplier,is_active:false}],'Inactive identity still prevents duplicate creation');
});
test('TH/EN supplier modal is prefilled, optional Tax ID, closed bank disclosure; duplicates offer explicit reuse',()=>{
 for(const locale of ['th','en']){
  const t=k=>translate(locale,k),html=modal.render(locale,{},props,'PayeeModal');
  assert.ok(html.includes(t('expenses.companyAddSupplier')));assert.ok(html.includes('value="Synthetic Supplier"'));
  assert.ok(html.includes(t('expenses.companySupplierTaxOptional')));assert.match(html,/<details><summary>/);assert.doesNotMatch(html,/<details[^>]*open/);
  assert.match(html,/<input[^>]*id="payee-tax"/);assert.doesNotMatch(html,/<input[^>]*required[^>]*id="payee-(tax|bank|accountName|accountNumber)"/);
  const match=modal.render(locale,{'PayeeModal.matches':[supplier]},props,'PayeeModal');assert.ok(match.includes(t('expenses.companySupplierExists')));assert.ok(match.includes(t('expenses.companyUseSupplier')));
  for(const state of [{'PayeeModal.matches':[{...supplier,is_active:false}]},{'PayeeModal.matches':[supplier],'PayeeModal.tax':'9999999999999'}])assert.ok(!modal.render(locale,state,props,'PayeeModal').includes(t('expenses.companyUseSupplier')));
 }
});
test('Shared Payee modal default and personal payer keep original labels, bank fields and locked identity',()=>{
 for(const locale of ['th','en']){
  const html=modal.render(locale,{}, {...props,supplierContext:undefined},'PayeeModal');assert.ok(html.includes(translate(locale,'payout.add')));assert.doesNotMatch(html,/<details/);
  const person=modal.render(locale,{}, {...props,supplierContext:undefined,payee:internal},'PayeeModal');assert.ok(person.includes(translate(locale,'payout.edit')));assert.doesNotMatch(person,/<details/);assert.match(person,/<input[^>]*disabled=""[^>]*id="payee-name"/);assert.match(person,/<select[^>]*disabled=""[^>]*id="payee-type"/);
 }
});
test('Known supplier read-only; missing supplier selects external only; readiness clears without bank or financial effects',()=>{
 const lookups={...f.lookups,payees:[supplier,internal]},access={...f.data.access,creator_payment_fact_supported:true};
 const base={row,lookups,access,accounts:f.data.accounts,companyReview:true,run:()=>{throw Error('No mutation');},busy:false,plan:{onPlan:()=>{},reason:'Reviewed'}};
 const missing=forms.render('th',{},base,'ExpenseSettlementForm');assert.match(missing,/<select[^>]*id="settlement-payee"/);assert.ok(missing.includes(`value="${supplier.id}"`));assert.ok(!missing.includes(`value="${internal.id}"`));
 const selected=forms.render('th',{'ExpenseSettlementForm.payee':supplier.id},base,'ExpenseSettlementForm');assert.ok(!selected.includes(translate('th','expenses.companyAddSupplier')));
 const known={...row,supplier_payee_id:supplier.id};assert.equal(companyPayee(known,lookups).id,supplier.id);
 const readonly=forms.render('th',{}, {...base,row:known},'ExpenseSettlementForm');assert.match(readonly,/<input[^>]*readOnly=""[^>]*id="settlement-payee"/);assert.doesNotMatch(readonly,/<select[^>]*id="settlement-payee"/);
 const tax=noTaxReviewArgs(row,id(60),'Reviewed').p_input;
 const money={p_mode:'supplier_unpaid',p_payee:null,p_amount:row.gross_amount};assert.ok(companyApprovalMissing(row,money,tax,'Reviewed',lookups).includes('companyNeedSupplier'));
 assert.deepEqual(companyApprovalMissing(row,{...money,p_payee:supplier.id},tax,'Reviewed',lookups),[]);
 assert.deepEqual(companyMoneyCandidates({...row,personally_paid:true,claimant_id:internal.id},lookups,'reimburse'),[internal]);
 assert.deepEqual(companyMoneyCandidates({...row,personally_paid:true,claimant_id:id(99)},lookups,'reimburse'),[]);
});
test('Actual Payout still requires bank destination and WHT Tax ID, independent of expense readiness',()=>{
 const account={is_active:true,kind:'bank',system_balance:50000,opening_as_of:'2026-09-01T00:00:00+07:00'};
 assert.equal(payoutBlock(supplier,account,0,'2026-09-21'),'bankMissing');
 assert.equal(payoutBlock({...supplier,tax_id:null,destination:{id:id(80)}},account,30,'2026-09-21'),'taxMissing');
});
