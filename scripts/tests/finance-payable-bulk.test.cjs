/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture,expense,obligation,id}=require('./expense-foundation-fixture.cjs');
const {prepareItems,confirmItems,eligiblePayable,validBatchResult,submissionLatch}=require('../../app/finance/payables/bulk-payment-model.ts');
const {bulkCopy}=require('../../app/finance/payables/bulk-payment-copy.ts');
const A=require('./finance-payable-bulk-artifacts.cjs');
const base=fixture('list'),account=base.data.accounts[0];
const entry=n=>({obligation:obligation(n+40,id(n)),row:expense(n,{tax_review:{request_json:{schema_version:2},wht_state:'none'}}),accounts:[account],payoutId:id(n+100),accountId:account.id,paidOn:'2026-09-20',withhold:false});
const modal={default:({children})=>React.createElement('section',null,children)};
const view=workspaceFixture('app/finance/payables/bulk-payment.tsx',['BulkPayment'],{'../../components/DetailModal':modal,'../expenses/data':{readExpenses:()=>{throw Error('No network');}}});
test('selected IDs are explicit, independent; WHT uses existing structured decision; no oldest assumption',()=>{
 const entries=[entry(11),entry(13)];entries[1].row.tax_review.wht_state='withhold';
 const items=prepareItems(entries);assert.deepEqual(items.map(i=>i.obligation_id),entries.map(e=>e.obligation.id));assert.equal(items[0].actual_wht,false);assert.equal(items[1].actual_wht,true);
 entries[1].row.personally_paid=true;assert.equal(prepareItems(entries)[1].actual_wht,false);
 assert.equal(eligiblePayable({...entries[0].obligation,status:'settled'}),false);assert.equal(eligiblePayable({...entries[0].obligation,waived:true}),false);assert.equal(eligiblePayable({...entries[0].obligation,settled:true}),false);
});
test('confirmation binds exact payout/payee/destination versions and requires every draft',()=>{
 const entries=[entry(11),entry(13)];for(const e of entries)e.row.payout={id:e.payoutId,version:3,status:'draft',can_confirm:true,bank_account_id:account.id,payee_version:7,destination:{id:id(999)}};
 assert.deepEqual(confirmItems(entries).map(i=>[i.payout_version,i.payee_version,i.destination_id]),[[3,7,id(999)],[3,7,id(999)]]);
 entries[1].row.payout.status='confirmed';assert.throws(()=>confirmItems(entries),/changed/);
});
test('double click is latched synchronously; batch success must match all exact IDs/statuses',()=>{
 const latch=submissionLatch();assert.equal(latch.enter(),true);assert.equal(latch.enter(),false);latch.leave();assert.equal(latch.enter(),true);
 const es=[entry(11),entry(13)],r={action:'prepare',items:es.map(e=>({payout_id:e.payoutId,obligation_id:e.obligation.id,version:1,status:'draft'}))};assert.equal(validBatchResult(r,'prepare',es),true);
 for(const bad of [null,{...r,items:r.items.slice(0,1)},{...r,items:[r.items[0],r.items[0]]},{...r,action:'confirm'}])assert.equal(validBatchResult(bad,'prepare',es),false);
});
test('TH/EN shows separate rows, amounts/accounts and two distinct prepare/confirm steps',()=>{
 const entries=[entry(11),entry(13)];
 for(const locale of ['th','en']){
  const c=bulkCopy[locale],props={rows:entries.map(e=>e.obligation),onClose:()=>{},onDone:()=>{}};
  const html=view.render(locale,{'BulkPayment.entries':entries,'BulkPayment.loading':false},props,'BulkPayment');assert.ok(html.includes(c.prepare));assert.ok(html.includes(c.separate));assert.ok(!html.includes(c.ack));assert.equal((html.match(/<article/g)||[]).length,2);
  const ready=entries.map(e=>({...e,row:{...e.row,payout:{id:e.payoutId,status:'draft',version:1,gross:200,net:200,wht:0,bank_account_id:account.bank_account_id,cash_location_id:null,paid_on:e.paidOn,can_confirm:true}}}));
  const review=view.render(locale,{'BulkPayment.entries':ready,'BulkPayment.loading':false,'BulkPayment.phase':'prepared','BulkPayment.ready':true},props,'BulkPayment');assert.ok(review.includes(c.ack));assert.ok(review.includes(c.confirm));assert.ok(review.includes(account.name));assert.equal((review.match(/<article/g)||[]).length,2);
 }
});
test('088 static artifacts are consistent, SELECT-only gates and portable NOT NULL checks',()=>{
 assert.match(A.validate(),/^[0-9a-f]{64}$/);
 for(const sql of [A.gate(),A.gate(true)]){assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from|create function|alter table|call )/i);assert.match(sql,/COLLATE "C"/);assert.match(sql,/attnotnull/);assert.match(sql,/contype<>'n'/);}
 const reviewed=JSON.parse(fs.readFileSync(A.baselinePath));
 assert.deepEqual([reviewed.candidate_sha256,reviewed.rows_sha256,reviewed.preserved_sha256],[
  '79ebc328357144bc11ce3884924fc9361f1889fe8609adc602c05062ff8828cd',
  'f729f91c43b25dc5103e267139444243fdc07cd34c6c1bca3813d7523e91ebff',
  '6762f93d45ac5ffa51633fbce5f72eb9ce1b3b907492036dfa5da7fcd308fb63']);
 assert.equal(A.sha(fs.readFileSync(A.candidate)),reviewed.candidate_sha256);
 assert.equal(A.gate(true).replaceAll(A.q(reviewed.rows_sha256),'NULL::text').replaceAll(A.q(reviewed.preserved_sha256),'NULL::text'),A.gate(true,{}),'Binding only replaces the reviewed preservation pins');
 assert.match(A.gate(true,{}),/NULL::text IS NOT NULL/,'Unbound verification remains fail-closed');
 assert.match(A.gate(true,{rows_sha256:reviewed.rows_sha256}),/NULL::text IS NOT NULL/,'Partial binding remains fail-closed');
 assert.doesNotMatch(A.gate(true),/NULL::text/);
 for(const name of ['reviewed_baseline_bound','historical_rows_unchanged','unrelated_contracts_unchanged','contract_exact'])assert.ok(A.gate(true).includes(name));
 const sql=fs.readFileSync(A.candidate,'utf8');assert.equal((sql.match(/CREATE FUNCTION public\./g)||[]).length,1);assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.|ALTER TABLE public\.|INSERT INTO public\./i);
});
