/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');
const {fixture}=require('./money-allocation-fixture.cjs');
const {initialMoneyChoices,moneyReviewComplete,moneyStatus,moneyAllocationError}=require('../../app/finance/payments/money-allocation.ts');
const {moneyAllocationMessages}=require('../../lib/i18n/messages/money-allocation.ts');
const {lexical}=require('./receipt-sql-static.test.cjs');
test('044 UI categories never inferred from description, VAT, WHT or matching amounts',()=>{
 const c=fixture(),d=initialMoneyChoices(c);assert.equal(d.length,3);assert.ok(d.every(x=>x.category==='unallocated'));
 assert.equal(moneyReviewComplete(c.source,d),false);assert.equal(moneyStatus(c),'unallocated');
 d.forEach(x=>{x.category='company_revenue';x.reason='Reviewed contract'});assert.equal(moneyReviewComplete(c.source,d),true);
 c.source.blockers=['partial_line_evidence_missing'];assert.equal(moneyReviewComplete(c.source,d),false);c.source.blockers=[];
 assert.equal(moneyReviewComplete(c.source,[d[0],d[0],d[2]]),false);assert.equal(moneyReviewComplete(c.source,d.map(x=>({...x,reason:''}))),false);
 c.current={decisions_json:d,status:'finalized'};c.source_current=true;assert.deepEqual(initialMoneyChoices(c),d);assert.equal(moneyStatus(c),'finalized');
 c.source_current=false;assert.ok(initialMoneyChoices(c).every(x=>x.category==='unallocated'));assert.equal(moneyStatus(c),'reviewRequired');
});
test('044 TH/EN strings and safe upstream-blocker errors; no private database details shown',()=>{
 for(const [key,value] of Object.entries(moneyAllocationMessages)){assert.ok(value.th,key);assert.ok(value.en,key);}
 assert.match(moneyAllocationError({message:'MONEY_ALLOCATION_SUPERSEDE_REQUIRED'},'en'),/supersede/);
 assert.match(moneyAllocationError({message:'MONEY_ALLOCATION_REVIEW_REQUIRED'},'th'),/ประเภท/);
 assert.doesNotMatch(moneyAllocationError({message:'secret token stack'},'en'),/secret|token|stack/);
 const {paymentErrorMessage,paymentReallocationErrorMessage}=require('../../app/finance/payments/shared.ts');
 assert.equal(paymentErrorMessage({message:'MONEY_ALLOCATION_SUPERSEDE_REQUIRED'},'fallback').key,'moneyAllocation.error.SUPERSEDE_REQUIRED');
 assert.equal(paymentReallocationErrorMessage({message:'MONEY_ALLOCATION_SUPERSEDE_REQUIRED'}).key,'moneyAllocation.error.SUPERSEDE_REQUIRED');
 const {correctionError}=require('../../app/finance/tax-corrections/shared.ts');assert.match(correctionError({message:'MONEY_ALLOCATION_SUPERSEDE_REQUIRED'},'en'),/supersede/);
});
test('044 source totals render without calling financial actions; focused modal reuses DetailModal',()=>{
 const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
 const f=workspaceFixture('app/finance/payments/money-allocation-panel.tsx',['MoneyAllocationFacts']);
 for(const locale of ['th','en']){const html=f.render(locale,{}, {source:fixture().source},'MoneyAllocationFacts');
  for(const value of ['19,280.00','19,160.00','120.00','607.10','18,672.90'])assert.ok(html.includes(value),value);
 }
 const ui=fs.readFileSync('app/finance/payments/money-allocation-panel.tsx','utf8');assert.match(ui,/<DetailModal/);
 assert.doesNotMatch(ui,/\.from\(|confirm_finance_payment|issue_finance_|post_confirmed|window\.alert/);
});
test('044 SELECT-only artifacts, one statement and exact rollback-only migration; no financial writes',()=>{
 const {workflow,filenames,migrationPath}=require('./money-allocation-artifacts.cjs');
 for(const [file,text] of Object.entries(workflow()))assert.equal(fs.readFileSync(file,'utf8'),text,file);
 for(const file of [filenames.pre,filenames.verify]){const clean=lexical(fs.readFileSync(file,'utf8'));
  assert.equal(clean.split(';').filter(x=>x.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|call|do|execute|into|set_config)\b/i);
 }
 const migration=fs.readFileSync(migrationPath,'utf8'),dry=fs.readFileSync(filenames.dry,'utf8'),clean=lexical(dry);
 assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 044\n')[1].split('-- END EMBEDDED MIGRATION 044')[0],migration);
 for(const table of ['finance_payments','finance_invoices','finance_company_ledger','finance_compensation_batches','finance_cash_transactions','finance_account_opening_balances','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_document_counters'])
  assert.doesNotMatch(migration,new RegExp('(?:update|insert into|delete from) public\\.'+table+'\\b','i'));
 assert.doesNotMatch(migration,/create or replace function|alter table public\.(?!finance_payment_money_)/i);
});
