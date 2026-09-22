/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {companyItemPaymentStatus,companyRequestPayment}=require('../../app/finance/expenses/company-payment-status.ts');
const {companySummary}=require('../../app/finance/expenses/company-workflow.ts');
const {expense,tax,obligation}=require('./expense-foundation-fixture.cjs');
const waiting=n=>expense(n,{gross_amount:3000,tax_review:tax,settlement:{mode:'supplier_unpaid',amount:3000},obligation:obligation(n+100,'expense',{gross_amount:3000})});
const paid=n=>({...waiting(n),obligation:{...waiting(n).obligation,settled:true},payout:{status:'confirmed',gross:3000,net:2910,wht:90}});
const request=items=>({kind:'company_expense_batch',status:'submitted',items});
test('company request payment counts completion flags, not cash or WHT',()=>{
 for(const [items,stage,p,u]of [[[waiting(1),waiting(2)],'unpaid',0,2],[[paid(1),waiting(2)],'partiallyPaid',1,1],[[paid(1),paid(2)],'paid',2,0]])assert.deepEqual(companyRequestPayment(request(items)),{stage,paid:p,unpaid:u,total:2});
 const wht=paid(1);wht.tax_review={...tax,wht_state:'withhold',wht_amount:90,eligibility:'pending'};
 assert.equal(companyItemPaymentStatus(wht),'paid');
 assert.equal(companyItemPaymentStatus({...waiting(1),payout:{status:'draft',net:3000}}),'unpaid');
 assert.equal(companyItemPaymentStatus({...waiting(1),obligation:{settled:true},payout:null}),'paid');
 assert.equal(companyRequestPayment(request([paid(1),expense(2,{status:'rejected'}),expense(3,{settlement:{mode:'no_reimbursement'}})])).stage,'paid');
 assert.equal(companyItemPaymentStatus({...waiting(1),obligation:{waived:true}}),null);
});
test('company KPI remains the existing four item lanes with gross amounts',()=>{
 const r=request([paid(1),waiting(2)]),before=companySummary([r]);companyRequestPayment(r);
 assert.deepEqual(companySummary([r]),before);
 assert.deepEqual(before,[{lane:'review',requests:0,items:0,amount:0},{lane:'unpaid',requests:1,items:1,amount:3000},{lane:'paid',requests:1,items:1,amount:3000},{lane:'rejected',requests:0,items:0,amount:0}]);
});
