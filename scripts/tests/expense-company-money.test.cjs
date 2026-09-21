/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id}=require('./expense-foundation-fixture.cjs');
const {creatorPaymentLabel,companyMoneyModes,recommendedMoneyMode,companyMoneyCandidates,companyApprovalMissing}=require('../../app/finance/expenses/company-money.ts');
const {companyPayee,noTaxReviewArgs}=require('../../app/finance/expenses/company-workflow.ts');
const f=fixture('list'),row=expense(10,{status:'submitted',creator_payment_fact:'unpaid',vat_awareness:'no',wht_awareness:'no'}),tax=noTaxReviewArgs(row,id(60),'Reviewed').p_input;
const money={p_mode:'supplier_unpaid',p_payee:id(4),p_amount:10700},missing=(r=row,m=money,t=tax)=>companyApprovalMissing(r,m,t,'Reviewed',f.lookups);
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm','ExpenseSettlementForm']);
const review=workspaceFixture('app/finance/expenses/company-review.tsx',['CompanyItemReview']);
const props={row,access:{...f.data.access,creator_payment_fact_supported:true,company_declaration_without_account_supported:true,can_create_company:true},accounts:f.data.accounts,lookups:f.lookups,run:()=>{throw Error('No writes');},busy:false};
test('Four declared facts are independently readable; NULL does not infer from category, account, supplier or confirmed payout',()=>{
 for(const [fact,key]of [['unpaid','companyUnpaid'],['company_paid','handlingCompanyPaid'],['personal_paid','companyPersonalPaid'],['unknown','companyPaymentUnknown']])assert.equal(creatorPaymentLabel({...row,creator_payment_fact:fact}),key);
 assert.equal(creatorPaymentLabel({...row,creator_payment_fact:null,personally_paid:true,payout:{status:'confirmed'}}),'companyDeclarationUnavailable');
 assert.equal(recommendedMoneyMode(row),'supplier_unpaid');assert.equal(recommendedMoneyMode({...row,creator_payment_fact:'unknown'}),'undecided');
 assert.equal(recommendedMoneyMode({...row,personally_paid:true,creator_payment_fact:'personal_paid'}),'reimburse');
 assert.deepEqual(companyMoneyModes({...row,creator_payment_fact:'company_paid'}),['undecided','company_bank','company_cash']);
 assert.ok(missing({...row,creator_payment_fact:'company_paid'}).includes('companyNeedPaidChannel'));
});
test('Pam-only regression: stored employees excluded from supplier candidates; exact personal payer required',()=>{
 const pam={id:id(1),profile_id:id(1),legal_name:'Pam'},only={...f.lookups,payees:[pam]};
 assert.deepEqual(companyMoneyCandidates({...row,supplier_payee_id:null},only,'supplier_unpaid'),[]);
 assert.equal(companyPayee({...row,supplier_payee_id:pam.id},only),null);
 assert.equal(companyMoneyCandidates({...row,personally_paid:true,claimant_id:pam.id},only,'reimburse')[0].id,pam.id);
 assert.deepEqual(companyMoneyCandidates({...row,personally_paid:true,claimant_id:id(99)},only,'reimburse'),[]);
 assert.ok(companyApprovalMissing(row,money,tax,'Reviewed',only).includes('companyNeedSupplier'));
 assert.equal(companyPayee(row,f.lookups).id,id(4));
});
test('Readiness: no-tax explicitly acknowledged, money/payee/reason required, VAT and WHT resolved',()=>{
 assert.deepEqual(missing(),[]);assert.ok(missing(row,money,null).includes('companyNeedVat'));assert.ok(missing(row,{p_mode:'undecided'}).includes('companyNeedMoney'));
 assert.ok(missing(row,{...money,p_payee:null}).includes('companyNeedSupplier'));assert.ok(companyApprovalMissing(row,money,tax,'',f.lookups).includes('companyNeedReason'));
 const vat={...tax,vat_state:'exists',vat_base:10000,vat_rate:7,eligibility:'pending'};assert.ok(missing(row,money,vat).includes('companyNeedVat'));
 assert.deepEqual(missing(row,money,{...vat,eligibility:'ineligible'}),[]);
 assert.ok(missing(row,money,{...vat,eligibility:'eligible'}).includes('companyNeedVatEvidence'));
 assert.deepEqual(missing(row,money,{...vat,eligibility:'eligible',company_name_status:'yes',supplier_tax_id:'1234567890123',tax_document_reference:'SYN-1'}),[]);
 assert.ok(missing(row,money,{...vat,vat_base:9999}).includes('companyNeedVatAmounts'));
 assert.ok(missing(row,money,{...tax,wht_state:'pending'}).includes('companyNeedWht'));
 assert.deepEqual(missing(row,money,{...tax,wht_state:'withhold',wht_base:10000,wht_rate:3}),[]);
 assert.ok(missing({...row,personally_paid:true},money,{...tax,wht_state:'withhold',wht_base:10000,wht_rate:3}).includes('companyWhtExceptionBlock'));
 assert.deepEqual(missing({...row,creator_payment_fact:'company_paid'},{p_mode:'company_bank',p_amount:10700,p_payee:null}),[]);
});
test('TH/EN capture capability gated, declaration read-only and money controls contextual',()=>{
 for(const locale of ['th','en']){
  const html=forms.render(locale,{}, {...props,claim:false,onCapture:()=>{}},'ExpenseFactsForm');
  for(const value of ['unpaid','company_paid'])assert.ok(html.includes(`value="${value}"`),value);
  assert.doesNotMatch(html,/id="expense-handling"|<option value="personal"/);
  assert.doesNotMatch(html,/expense-paid-on|paymentAck|item_type/);
  const old=forms.render(locale,{}, {...props,access:f.data.access,claim:false,onCapture:()=>{}},'ExpenseFactsForm');assert.doesNotMatch(old,/<option value="(?:unpaid|company_paid)"/);
  const readonly=review.render(locale,{}, {...props,row:{...row,status:'accepted',creator_payment_fact:'company_paid'},access:{...props.access,can_manage:false,can_tax_review:false}},'CompanyItemReview');assert.doesNotMatch(readonly,/<input|<select|<form/);
  const bank=forms.render(locale,{}, {...props,companyReview:true,row:{...row,creator_payment_fact:'company_paid'},plan:{onPlan:()=>{},reason:'Reviewed'}},'ExpenseSettlementForm');assert.doesNotMatch(bank,/<option value="supplier_unpaid"|id="settlement-payee"/);
 }
});
test('057 workflow artifacts SELECT-only and exactly embedded; 001-056 and protected UI/contracts unchanged',()=>{
 const a=require('./expense-payment-fact-artifacts.cjs'),lexSource=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
 const lexical=require('node:vm').runInNewContext(lexSource.slice(lexSource.indexOf('function lexical('),lexSource.indexOf('module.exports'))+';lexical',{assert});
 for(const file of [a.filenames.pre,a.filenames.verify]){const sql=lexical(fs.readFileSync(file,'utf8'));assert.equal(sql.split(';').filter(s=>s.trim()).length,1);assert.match(sql.trim(),/^with /i);assert.doesNotMatch(sql,/\b(insert|update|delete|merge|call|execute|do|create|alter|drop|truncate|copy|into)\b/i);}
 const dry=fs.readFileSync(a.filenames.dry,'utf8');assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 057\n')[1].split('-- END EMBEDDED MIGRATION 057')[0],a.source());assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 for(const statement of lexical(a.source()).split(';'))assert.doesNotMatch(statement.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 files.push(...['company-list.tsx','company-categories.ts','company.module.css','request-view.tsx','request-operations.ts','requests.ts','data.ts'].map(p=>'app/finance/expenses/'+p));
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
});
