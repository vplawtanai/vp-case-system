/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {expense,tax}=require('./expense-foundation-fixture.cjs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const generic=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseTaxForm']);
const company=workspaceFixture('app/finance/expenses/company-tax.tsx',['CompanyTaxForm']);
for(const locale of ['th','en'])test(`Input VAT source review ${locale}: existing forms isolate WHT; ordinary review unchanged`,()=>{
 const props={row:expense(1,{origin:'employee_claim',personally_paid:true}),busy:false,run:()=>{throw Error('No writes');}};
 const full=generic.render(locale,{},props,'ExpenseTaxForm'),vat=generic.render(locale,{},{...props,inputVatOnly:true},'ExpenseTaxForm');
 assert.match(full,/id="tax-wht_state"/);assert.doesNotMatch(vat,/id="tax-wht_state"|id="tax-wht_base"|id="tax-wht_rate"/);
 for(const html of [full,vat])assert.match(html,/id="tax-vat_state"/);
 const reviewed=generic.render(locale,{},{...props,row:expense(2,{tax_review:tax}),inputVatOnly:true},'ExpenseTaxForm');
 assert.match(reviewed,/SYNTHETIC-001/);assert.match(reviewed,/value="eligible" selected/);
 const structured={...props,row:expense(3,{tax_review:{...tax,request_json:{schema_version:2,raw_input:{vat_mode:'inclusive',vat_rate:7,wht_rate:0}}}}),planning:false,reason:'',onPlan:()=>{},onCalculation:()=>{}};
 const regular=company.render(locale,{},structured,'CompanyTaxForm'),focused=company.render(locale,{},{...structured,inputVatOnly:true},'CompanyTaxForm');
 assert.match(regular,/id="company-tax-wht_state"/);assert.doesNotMatch(focused,/id="company-tax-wht_state"|id="company-tax-wht_rate"/);
 assert.match(focused,/<select[^>]*disabled=""[^>]*id="company-tax-vat_mode"/);assert.match(focused,/<select[^>]*disabled=""[^>]*id="company-tax-vat_rate"/);
 assert.match(focused,/value="inclusive" selected/);assert.match(focused,/id="company-tax-eligibility"/);
});
