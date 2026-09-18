/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./tax-filing-fixture.cjs'),{summarizeFilings,filingState,filingErrorKey}=require('../../app/finance/tax-position/filings/shared.ts');
const {taxFilingMessages}=require('../../lib/i18n/messages/tax-filings.ts');
test('052 UI unknown VAT, no cancelled Draft liability, incoming credit excluded, classified buckets only',()=>{
 const s=fixture(),a=summarizeFilings(s);assert.equal(a.total,null);assert.equal(a.outgoing,0);assert.equal(a.obligations.length,1);assert.equal(a.status,'needs_review');
 const b=fixture(true);b.pools[0].ready=true;b.pools[0].tax_amount=100;assert.equal(summarizeFilings(b).total,286.24);b.incoming_wht_credit=100000;assert.equal(summarizeFilings(b).total,286.24);
 b.pools[1].ready=false;b.pools[1].issues=[{code:'unclassified_wht',count:1}];assert.equal(summarizeFilings(b).outgoing,null);assert.equal(summarizeFilings(b).total,null);
});
test('052 UI filed is not paid, zero is not paid-zero, immutable history and error messages',()=>{
 const p=fixture(true).pools[1],f={status:'filed',tax_amount:93.12};assert.equal(filingState(f,p),'awaiting_payment');assert.equal(filingState({...f,tax_amount:0},p),'no_payment_required');assert.equal(filingState({...f,remittance:{status:'confirmed'}},p),'remitted');
 assert.equal(filingState({status:'draft',source_changed:true},p),'source_changed');for(const code of ['SOURCE_CHANGED','ACCOUNT_CHANGED','STALE'])assert.equal(filingErrorKey({message:'TAX_FILING_'+code}),'changed');
 for(const [k,v]of Object.entries(taxFilingMessages))for(const lang of ['th','en'])assert.ok(v[lang]?.trim(),k+lang);
});
test('052 UI scope: only controlled RPCs; legacy untyped filing action removed; dashboard retained',()=>{
 const page=fs.readFileSync('app/finance/tax-position/page.tsx','utf8'),ui=fs.readFileSync('app/finance/tax-position/filings/workspace.tsx','utf8');
 assert.match(page,/<TaxDashboard/);assert.match(page,/record_finance_incoming_wht_evidence/);assert.doesNotMatch(page,/transition_finance_tax_period/);
 assert.doesNotMatch(ui,/supabase\.from\(|\.insert\(|\.update\(|\.delete\(/);assert.match(ui,/get_finance_tax_filings/);assert.match(ui,/<Disclosure title=\{tr\("technical"\)\}/);
});
