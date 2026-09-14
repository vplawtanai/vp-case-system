/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');
const direct=require('../../app/finance/direct-money/shared.ts');
const vp=require('../../app/finance/payments/vp-distribution.ts');
const {translate,messages}=require('../../lib/i18n/catalog.ts');
const {activeFinancePage,financeNavigationLinks}=require('../../app/finance/finance-navigation.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
function sample(){const p=direct.newDirectInput();return {...p,received_on:'2026-07-01',payer_name:'Synthetic Payer',receiving_bank_account_id:'synthetic-bank',cash_amount:10400,lines:[{...p.lines[0],description:'Legal fee',reason:'Work paid directly',money_nature:'business_revenue',classification:'professional_fee',base:10000,vat_applicable:true,vat_rate:7,wht_applicability:'applies',wht_base:10000,wht_rate:3}]};}
test('Direct VAT/WHT uses shared helpers and reconciles the professional example without Invoice settlement',()=>{
 const p=sample();assert.deepEqual(direct.directTotals(p.lines),{base:10000,vat:700,gross:10700,wht:300,cash:10400});
 assert.deepEqual(direct.validateDirectInput(p,'2026-09-14'),{});assert.equal(p.invoice_id,undefined);assert.equal(p.payment_id,undefined);
 assert.ok(direct.validateDirectInput({...p,cash_amount:10400.01},'2026-09-14').reconcile);
});
test('multi-line and non-VAT evidence remain explicit; cash alone does not infer WHT or nature',()=>{
 const p=sample();p.lines.push({...direct.newDirectLine(),description:'Additional service',reason:'Separate service',money_nature:'business_revenue',classification:'additional_service',base:1000,wht_applicability:'does_not_apply',vat_treatment_json:{schema_version:1,treatment:'exempt',reason:'Documented exemption'}});p.cash_amount+=1000;
 assert.deepEqual(direct.validateDirectInput(p,'2026-09-14'),{});assert.equal(direct.directTotals(p.lines).cash,11400);
 p.lines[1].vat_treatment_json=null;assert.ok(direct.validateDirectInput(p,'2026-09-14')['line.1.vat']);
 const empty=direct.newDirectInput();assert.equal(empty.lines[0].money_nature,'unclassified');assert.equal(empty.lines[0].wht_applicability,'unknown');assert.ok(Object.keys(direct.validateDirectInput(empty,'2026-09-14')).length>=6);
});
test('shared distribution identities never masquerade as Invoice items and preserve Payment shape',()=>{
 assert.deepEqual(vp.distributionIdentity({source_line_id:'direct-line'}),{source_line_id:'direct-line'});
 assert.deepEqual(vp.distributionIdentity({invoice_item_id:'invoice-line'}),{invoice_item_id:'invoice-line'});
 assert.throws(()=>vp.distributionLineId({invoice_item_id:'x',source_line_id:'x'}),/SOURCE_UNPROVEN/);
 const source={schema_version:1,policy_version:'vp_distribution_v1',money_source:null,money_allocation:null,received_money_source:{status:'confirmed',currency:'THB'},
  lines:[{source_line_id:'line',classification:'professional_fee',base:10000,wht:300,professional_pool:9700}],totals:{},blockers:[]};
 assert.equal(vp.distributionSourceProven(source),true);
 const choices=vp.initialDistributionChoices({source,source_current:true,current:null});assert.equal(choices[0].invoice_item_id,undefined);
 assert.deepEqual(vp.distributionPayload(source,choices)[0],{source_line_id:'line',referral_amount:0,company_share_amount:0,work_compensation_amount:0});
 assert.equal(vp.distributionSourceProven({...source,blockers:['direct_client_money']}),false);
});
test('new incoming-money routes and all Direct labels support TH/EN',()=>{
 for(const locale of ['th','en'])for(const key of Object.keys(messages).filter(k=>k.startsWith('directMoney.')))assert.ok(translate(locale,key)&&translate(locale,key)!==key,key);
 for(const path of ['/finance/direct-money/new','/finance/direct-money/synthetic'])assert.equal(activeFinancePage(path,'invoices'),'payments');
 const page=fs.readFileSync('app/finance/payments/page.tsx','utf8');assert.match(page,/direct-money\/new/);assert.match(page,/readIncomingMoneyPage/);
 for(const file of ['app/finance/direct-money/form.tsx','app/finance/direct-money/classification.tsx']){const s=fs.readFileSync(file,'utf8');assert.doesNotMatch(s,/window.alert|confirm_finance_payment|issue_finance|create_finance_invoice/);}
});
module.exports={sample};
test('Partner can find/read incoming money without acquiring lifecycle mutation permissions',()=>{
 const partner=buildPermissions({role:'partner'}),staff=buildPermissions({role:'staff'});
 assert.equal(partner.canViewFinancePayments,true);assert.equal(partner.canManageFinancePayments,false);assert.equal(partner.canConfirmFinancePayments,false);assert.equal(partner.canReverseFinancePayments,false);
 assert.ok(financeNavigationLinks(partner).some(l=>l.page==='payments'));
 assert.equal(staff.canViewFinancePayments,false);assert.equal(financeNavigationLinks(staff).some(l=>l.page==='payments'),false);
});
