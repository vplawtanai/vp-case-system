/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture,distributionId}=require('./payable-fixture.cjs');
const {buildPermissions}=require('../../lib/permissions.ts');
const {financeNavigationLinks,activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const {payableMessages}=require('../../lib/i18n/messages/payables.ts');
const {payableError,payableGroupKey,payableRoleLabel}=require('../../app/finance/payables/shared.ts');
const page=workspaceFixture('app/finance/payables/page.tsx',['PayablesWorkspace','PayableGroups'],{'../quotations/shared':{QuotationGuard:()=>null},'../FinanceSubNav':{default:()=>null}});
const materialize=workspaceFixture('app/finance/payables/materialize-action.tsx',['MaterializeEntitlements']);
for(const locale of ['th','en'])test(`Payables ${locale}: initial zero-state is neutral and offers no payout or materialization action`,()=>{
 const html=page.render(locale,{'PayablesWorkspace.loading':false,'PayablesWorkspace.data':{groups:[],has_next:false}},{},'PayablesWorkspace');
 assert.ok(html.includes(translate(locale,'payables.empty')));
 assert.doesNotMatch(html,/role="alert"|data-recipient=|type="checkbox"/);
 assert.ok(!html.includes(translate(locale,'payables.materialize')));
 assert.equal(translate(locale,'payables.superseded'),locale==='th'?'ถูกแทนที่':'Superseded');
 assert.equal(translate(locale,'payables.open'),locale==='th'?'รอจ่าย':'Open');
});
for(const locale of ['th','en'])test(`Payables ${locale}: recipient/currency groups retain role components, frozen facts and closed technical evidence`,()=>{
 const data=fixture(),before=JSON.stringify(data);
 const html=page.render(locale,{'PayablesWorkspace.loading':false,'PayablesWorkspace.data':data},{},'PayablesWorkspace');
 assert.equal((html.match(/data-recipient=/g)||[]).length,3);assert.equal((html.match(/<h2>Pam<\/h2>/g)||[]).length,1);
 for(const amount of ['3,104.00 THB','1,940.00 THB','776.00 THB','1,164.00 THB'])assert.ok(html.includes(amount));
 for(const key of ['title','referral','work','open','technical'])assert.ok(html.includes(translate(locale,'payables.'+key)));
 assert.doesNotMatch(html,/<details[^>]*\bopen|\/finance\/compensation|<button[^>]*>Pay<\/button>/);
 assert.equal(JSON.stringify(data),before);
 const superseded=structuredClone(data);superseded.groups.forEach(g=>{g.open_amount=0;g.components.forEach(r=>r.status='superseded');});
 assert.ok(page.render(locale,{},superseded,'PayableGroups').includes(translate(locale,'payables.superseded')));
});
test('Canonical identity plus currency, never a display-name grouping; immutable custom role is not translated into a different fact',()=>{
 const g=fixture().groups[0];assert.equal(payableGroupKey(g),g.recipient_id+':THB');
 assert.notEqual(payableGroupKey(g),payableGroupKey({...g,currency:'USD'}));
 assert.notEqual(payableGroupKey(g),payableGroupKey({...g,recipient_id:'different',recipient_name:g.recipient_name}));
 assert.equal(payableRoleLabel('Custom human role','th'),'Custom human role');
});
test('Historical action is explicit, Admin-only, and absent after materialization; failure requires read before retry',()=>{
 for(const locale of ['th','en']){
  const props={distributionId,version:3,canManage:true};
  const missing=materialize.render(locale,{'MaterializeEntitlements.state':'missing'},props,'MaterializeEntitlements');
  assert.ok(missing.includes(translate(locale,'payables.materialize')));assert.match(missing,/type="checkbox"/);
  for(const state of ['ready','failed'])assert.doesNotMatch(materialize.render(locale,{'MaterializeEntitlements.state':state},props,'MaterializeEntitlements'),/type="checkbox"/);
  const viewer=materialize.render(locale,{'MaterializeEntitlements.state':'missing'},{...props,canManage:false},'MaterializeEntitlements');
  assert.doesNotMatch(viewer,/<button|type="checkbox"/);assert.ok(viewer.includes(translate(locale,'payables.readOnly')));
  for(const code of ['CANONICAL_RECIPIENT_REQUIRED','FORMULA_EVIDENCE_REQUIRED','PAYOUT_INTEGRATION_REQUIRED'])assert.equal(payableError({message:'PAYABLE_'+code},locale),translate(locale,'payables.error.'+code));
 }
});
test('TH/EN catalog complete; existing Finance read policy and navigation order retained; no automatic mutation path',()=>{
 for(const entry of Object.values(payableMessages)){assert.ok(entry.th);assert.ok(entry.en);}
 for(const role of ['admin','partner','staff']){
  const p=buildPermissions({role}),links=financeNavigationLinks(p,'en');
  assert.equal(links.some(l=>l.page==='payables'),p.canViewFinancePayments);
  if(role==='admin'){assert.ok(links.findIndex(l=>l.page==='payables')<links.findIndex(l=>l.page==='compensation'));assert.ok(links.some(l=>l.page==='compensation'));}
 }
 assert.equal(activeFinancePage('/finance/payables','payments'),'payables');
 const source=fs.readFileSync('app/finance/payables/page.tsx','utf8');assert.match(source,/get_finance_payable_entitlements/);assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|ensure_finance|payout/i);
 const action=fs.readFileSync('app/finance/payables/materialize-action.tsx','utf8');assert.match(action,/if \(lock.current/);assert.match(action,/p_expected_version: version/);
 const panel=fs.readFileSync('app/finance/payments/vp-distribution-panel.tsx','utf8');assert.match(panel,/current\?\.status === "finalized" \? <MaterializeEntitlements/);
});
