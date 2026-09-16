/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./payout-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {payoutMath,payoutBlock,mask}=require('../../app/finance/payouts/shared.ts');
const {resolved,people}=require('./vp-formula.test.cjs'),{calculateFormula,restoreFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const {financeNavigationItems,activeFinancePage}=require('../../app/finance/finance-navigation.ts'),{buildPermissions}=require('../../lib/permissions.ts');
const {translate}=require('../../lib/i18n/catalog.ts'),{payoutMessages}=require('../../lib/i18n/messages/payouts.ts');
const page=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null}});
test('Payout exact-cent math is full-component and rate-explicit; heterogeneous rates stay separate',()=>{
 const f=fixture(),rows=f.components;assert.equal(payoutMath(rows,{}).valid,false);
 const rates=Object.fromEntries(rows.map(r=>[r.id,'3'])),before=JSON.stringify(rows),v=payoutMath(rows,rates);
 assert.deepEqual([v.gross,v.wht,v.net],[3104,93.12,3010.88]);assert.equal(v.choices.length,2);
 assert.equal(payoutMath(rows,{...rates,[rows[1].id]:'0'}).wht,58.2);
 assert.equal(payoutMath(rows,{...rates,[rows[0].id]:'100'}).valid,false);assert.equal(JSON.stringify(rows),before);
 assert.equal(payoutBlock(f.payees[0],f.accounts[0],93.12,'2026-09-01'),null);
 assert.equal(payoutBlock(f.payees[0],{...f.accounts[0],system_balance:null},0,'2026-09-01'),'unknown');
 assert.equal(payoutBlock({...f.payees[0],destination:null},f.accounts[0],0,'2026-09-01'),'bankMissing');
 assert.equal(payoutBlock({...f.payees[0],tax_id:null},f.accounts[0],1,'2026-09-01'),'taxMissing');
 assert.equal(payoutBlock(f.payees[0],f.accounts[0],0,'2026-08-31'),'cutoff');assert.equal(mask('1234567890'),'••••7890');
});
for(const locale of ['th','en'])test(`Payout ${locale}: compact source facts, disabled final action until saved; confirmed frozen read-only`,()=>{
 const f=fixture(),state={'PayoutWorkspace.selected':f.components.map(r=>r.id),'PayoutWorkspace.rates':Object.fromEntries(f.components.map(r=>[r.id,'3'])),'PayoutWorkspace.accountKey':'bank:'+f.accounts[0].account_id};
 const html=page.render(locale,state,{id:'new',payeeId:f.payees[0].id,fixture:f},'PayoutWorkspace');
 for(const key of ['title','rights','wht','account','summary','history'])assert.ok(html.includes(translate(locale,'payout.'+key)),key);
 for(const value of ['3,104.00','93.12','3,010.88','26,549.12'])assert.ok(html.includes(value),value);
 assert.ok(!html.includes('1234567890'));assert.ok(!html.includes('1234567890123'));assert.match(html,/disabled=""/);
 f.payout={id:'synthetic',payee_id:f.payees[0].id,status:'confirmed',paid_on:'2026-09-01',version:2,choices_json:f.components.map(r=>({entitlement_id:r.id,entitlement:r,rate:3})),gross_amount:3104,wht_amount:93.12,net_amount:3010.88,note:'',confirmed_snapshot_json:{payee:{...f.payees[0],legal_name:'Frozen recipient'},destination:f.payees[0].destination,account:f.accounts[0]}};
 const readonly=page.render(locale,state,{id:'synthetic',payeeId:f.payees[0].id,fixture:f},'PayoutWorkspace');assert.ok(readonly.includes('Frozen recipient'));assert.ok(!readonly.includes(translate(locale,'payout.save')));assert.ok(!readonly.includes(translate(locale,'payout.confirm')));
 for(const e of Object.values(payoutMessages)){assert.ok(e.th);assert.ok(e.en);}
});
test('Sidebar exact Finance order and exposed Legacy; horizontal nav renders nothing',()=>{
 for(const locale of ['th','en']){const items=financeNavigationItems(buildPermissions({role:'admin'}),locale);assert.deepEqual(items.map(i=>i.group||i.page),['quotations','fee-agreements','billable-charges','invoices','payments','payment-documents','treasury','tax-position','payables','legacy']);assert.deepEqual(items.at(-1).children.map(i=>i.href),['/finance/expense-claims','/finance/compensation','/finance/ledger']);}
 assert.equal(activeFinancePage('/finance/payouts/new','payments'),'payables');
 assert.match(fs.readFileSync('app/finance/FinanceSubNav.tsx','utf8'),/return null/);
 const source=fs.readFileSync('app/finance/payouts/workspace.tsx','utf8');assert.doesNotMatch(source,/\.from\(|\.insert\(|\.update\(|\.delete\(/);assert.match(source,/p_expected_payee_version/);assert.match(source,/p_expected_destination_id/);
});
test('External canonical Payee survives formula freeze/restore and is never reduced to a display-name identity',()=>{
 const input=resolved('source_worker_qc',10000),external='40000000-0000-4000-8000-000000000007';
 Object.assign(input.rows[0],{recipient_user_id:'__other__',recipient_payee_id:external,recipient_name:'Synthetic outside broker'});
 const {result,errors}=calculateFormula(10000,input,people);assert.deepEqual(errors,[]);assert.equal(result.recipients[0].recipient_payee_id,external);assert.equal(result.recipients[0].recipient_user_id,null);
 assert.equal(restoreFormula(result).rows[0].recipient_payee_id,external);
});
test('Office Cash confirmation does not imply transfer to the stored recipient bank',()=>{
 const React=require('react'),f=fixture();f.accounts[0]={...f.accounts[0],kind:'cash',account_id:'office',bank_account_id:null,cash_location_id:'office',name_th:'เงินสดสำนักงาน',name_en:'Office Cash'};
 const modal=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null},'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-test-modal':true},children):null}});
 const html=modal.render('en',{'PayoutWorkspace.accountKey':'cash:office','PayoutWorkspace.modal':'confirm'},{id:'new',payeeId:f.payees[0].id,fixture:f},'PayoutWorkspace');
 const confirmation=html.split('data-test-modal="true"')[1];assert.ok(confirmation);assert.doesNotMatch(confirmation,/KBANK|7890/);assert.ok(confirmation.includes(f.payees[0].legal_name));
});
