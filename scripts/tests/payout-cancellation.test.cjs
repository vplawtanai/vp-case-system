/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs');
const {fixture}=require('./payout-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const page=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null},'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-test-modal':true},children):null}});
const f=fixture(),payee=f.payees[0],rows=f.components,id='40000000-0000-4000-8000-000000000077';
const choices=rows.map(r=>({entitlement_id:r.id,entitlement:r,treatment:'withhold',rate:3,gross:r.gross_amount,wht:Math.round(r.gross_amount*3)/100}));
const payout={id,payee_id:payee.id,status:'draft',version:1,choices_json:choices,paid_on:'2026-09-18',bank_account_id:f.accounts[0].account_id,cash_location_id:null,gross_amount:3104,wht_amount:93.12,net_amount:3010.88,note:'Saved evidence',confirmed_snapshot_json:null};
const data={...f,payout,history:[{id,paid_on:payout.paid_on,status:'draft',gross:3104,wht:93.12,net:3010.88}]};
const state={'PayoutWorkspace.selected':rows.map(r=>r.id),'PayoutWorkspace.rates':Object.fromEntries(rows.map(r=>[r.id,'3'])),'PayoutWorkspace.accountKey':'bank:'+f.accounts[0].account_id};
const render=(locale,override={},source=data)=>page.render(locale,{...state,...override},{id:source.payout?.id||'new',payeeId:payee.id,fixture:source},'PayoutWorkspace');
const buttons=html=>html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[];
for(const locale of ['th','en']){
 const t=k=>translate(locale,'payout.'+k);
 test(`${locale}: persisted Draft has one prominent cancel action independent of readiness/unsaved choices`,()=>{
  const html=render(locale,{'PayoutWorkspace.dirty':true,'PayoutWorkspace.accountKey':'','PayoutWorkspace.rates':{}},{...data,payees:[{...payee,tax_id:null,destination:null}]});
  const cancel=buttons(html).filter(b=>b.includes(t('cancel')));assert.equal(cancel.length,1);assert.ok(!cancel[0].includes('disabled=""'));
  assert.match(html,/data-payout-lifecycle="draft"/);assert.ok(html.indexOf(cancel[0])<html.indexOf('data-entry-mode'));
  for(const key of ['save','review'])assert.ok(html.includes(t(key)));
  const viewer=render(locale,{}, {...data,can_manage:false});for(const key of ['save','review','cancel','fixPayee'])assert.equal(buttons(viewer).some(b=>b.includes(t(key))),false,key);
 });
 test(`${locale}: history/new-entry reopens the same saved Draft by canonical UUID; no duplicate creation`,()=>{
  const html=render(locale,{}, {...data,payout:null}),href=`/finance/payouts/${id}?payee=${payee.id}`;
  assert.ok(html.includes(t('existingDrafts')));assert.ok(html.includes(`${t('openDraft')} ${id.slice(0,8).toUpperCase()}`));
  assert.ok(html.includes(href));assert.equal(buttons(html).some(b=>b.includes(t('cancel'))),false);
 });
 test(`${locale}: explicit cancellation modal, Back and acknowledgement, not real-payment acknowledgement`,()=>{
  const html=render(locale,{'PayoutWorkspace.modal':'cancel','PayoutWorkspace.dirty':true}).split('data-test-modal="true"')[1];
  for(const key of ['cancelIntro','cancelNoEffects','cancelNoSettlement','cancelNoCash','cancelNoWht','cancelRightsRemain','cancelAck','cancelBack','cancelConfirm','cancelUnsaved'])assert.ok(html.includes(t(key)),key);
  assert.ok(html.includes(id.slice(0,8).toUpperCase()));assert.ok(html.includes(payee.legal_name));
  assert.ok(buttons(html).find(b=>b.includes(t('cancelConfirm'))).includes('disabled=""'));
  assert.ok(!html.includes(t('ackReviewed')));assert.ok(!html.includes('data-confirmation-effects'));
 });
 test(`${locale}: cancelled history retains amounts/choices/date but exposes no mutations or false cash impact`,()=>{
  const cancelled={...data,payout:{...payout,status:'cancelled',version:2,cancelled_at:'2026-09-18T02:00:00Z'},history:[{...data.history[0],status:'cancelled'}]};
  const html=render(locale,{},cancelled);
  for(const key of ['cancelledDraft','cancelledResult','cancelledEvidence','cancelledAt','cancelRightsRemain','backPayables','history','draftNet'])assert.ok(html.includes(t(key)),key);
  for(const key of ['save','review','cancel','fixPayee'])assert.equal(buttons(html).some(b=>b.includes(t(key))),false,key);
  assert.ok(!html.includes(t('after')));assert.ok(!html.includes(t('before')));
  assert.ok(!html.includes(`aria-label="${t('progress')}"`));
  for(const value of ['3,104.00','3,010.88','93.12','1,940.00','1,164.00',id.slice(0,8).toUpperCase()])assert.ok(html.includes(value),value);
  const inputs=html.match(/<(?:input|select)\b[^>]*>/g)||[];assert.ok(inputs.length);assert.ok(inputs.every(e=>e.includes('disabled=""')));
  const confirmed=render(locale,{}, {...data,payout:{...payout,status:'confirmed',confirmed_snapshot_json:{payee,destination:payee.destination,account:f.accounts[0]}}});
  for(const key of ['save','review','cancel'])assert.equal(buttons(confirmed).some(b=>b.includes(t(key))),false,key);
 });
}
test('Cancellation uses only the existing UUID/version/ack RPC with a Draft-only UI guard',()=>{
 const source=fs.readFileSync('app/finance/payouts/workspace.tsx','utf8');
 assert.match(source,/if \(action === "cancel" && \(!ack \|\| p\?\.status !== "draft"\)\) return;/);
 assert.match(source,/cancel_finance_payout", \{ p_id: p!\.id, p_expected_version: p!\.version, p_acknowledged: ack \}/);
 assert.doesNotMatch(source,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
