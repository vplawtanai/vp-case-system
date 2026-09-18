/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs');
const {fixture}=require('./payout-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {validPayeeContextId,validPayoutEntry,hasPayoutEntrySelections}=require('../../app/finance/payouts/entry-context.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const f=fixture(),payee=f.payees[0],other='40000000-0000-4000-8000-000000000099';
const modal={default:({open,children})=>open?React.createElement('div',{'data-dialog':true},children):null};
const page=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null},'../../components/DetailModal':modal});
const props={id:'new',payeeId:payee.id,fixture:f};

test('Context requires a canonical Payee returned by the permission-checked read; no fallback',()=>{
 assert.equal(validPayeeContextId(payee.id),true);
 for(const id of ['', 'Pam', 'null', payee.id+'?other=1'])assert.equal(validPayeeContextId(id),false);
 assert.equal(validPayoutEntry(f,payee.id,'new'),true);
 assert.equal(validPayoutEntry(f,payee.id.toUpperCase(),'new'),true);
 assert.equal(validPayoutEntry(f,other,'new'),false);
 assert.equal(validPayoutEntry({...f,components:[{...f.components[0],recipient_id:other}]},payee.id,'new'),false);
 const generic={...f,components:[],history:[]};
 assert.equal(validPayoutEntry(generic,null,'new'),true);
 assert.equal(validPayoutEntry(generic,'','new'),false);
 assert.equal(validPayoutEntry(f,null,'new'),false);
 assert.equal(validPayoutEntry(generic,null,'existing'),false);
 const draft={id:'draft-id',payee_id:payee.id,choices_json:[{entitlement:f.components[0]}]};
 assert.equal(validPayoutEntry({...f,payout:draft},payee.id,'draft-id'),true);
 assert.equal(validPayoutEntry({...f,payout:draft},payee.id,'other-draft'),false);
 assert.equal(validPayoutEntry({...f,payout:{...draft,payee_id:other}},payee.id,'draft-id'),false);
 assert.equal(validPayoutEntry({...f,payout:{...draft,confirmed_snapshot_json:{payee:{id:other}}}},payee.id,'draft-id'),false);
 assert.equal(validPayoutEntry({...f,payout:{...draft,choices_json:[{entitlement:{recipient_id:other}}]}},payee.id,'draft-id'),false);
});
test('Change recipient warns for each entered recipient-scoped choice, but not the automatic date alone',()=>{
 const initial=[[],{},'','2026-09-18','2026-09-18',''];
 assert.equal(hasPayoutEntrySelections(...initial),false);
 for(const [i,value] of [[0,[f.components[0].id]],[1,{[f.components[0].id]:'0'}],[2,'bank:1'],[3,'2026-09-17'],[3,''],[5,'A note']]){const state=[...initial];state[i]=value;assert.equal(hasPayoutEntrySelections(...state),true);}
});
for(const locale of ['th','en'])test(`${locale}: contextual summary vs generic selector, readiness distinct from identity, same scoped workflow`,()=>{
 const t=k=>translate(locale,'payout.'+k),html=page.render(locale,{},props,'PayoutWorkspace');
 assert.match(html,/data-entry-mode="contextual"/);assert.doesNotMatch(html,/<select[^>]+id="payout-payee"/);assert.ok(!html.includes(t('add')));
 for(const key of ['checkRecipient','fixPayee','changeRecipient','taxId','destination'])assert.ok(html.includes(t(key)),key);
 assert.ok(html.includes(payee.legal_name));assert.match(html,/data-check="checkRecipient" data-state="ready"/);
 const external={...payee,id:other,kind:'external',legal_name:'Synthetic external',profile_id:null};
 const generic=page.render(locale,{}, {...props,payeeId:null,fixture:{...f,payees:[payee,external],components:[],history:[]}},'PayoutWorkspace');
 assert.match(generic,/data-entry-mode="generic"/);assert.match(generic,/<select[^>]+id="payout-payee"/);
 for(const value of [payee.legal_name,'Synthetic external',t('internal'),t('external'),t('add')])assert.ok(generic.includes(value),value);
 assert.ok(!generic.includes('1,940.00'));assert.ok(!generic.includes('••••7890'));
 const wrongRow={...f.components[0],id:other,recipient_id:other,role_label:'DO NOT EXPOSE ANOTHER PAYEE'};
 const scoped=page.render(locale,{}, {...props,fixture:{...f,components:[...f.components,wrongRow]}},'PayoutWorkspace');
 assert.ok(!scoped.includes(wrongRow.role_label));
 const warning=page.render(locale,{'PayoutWorkspace.changeRecipient':true},props,'PayoutWorkspace');
 assert.ok(warning.includes(t('changeRecipientWarning')));assert.ok(warning.includes(t('backChooseRecipient')));assert.ok(warning.includes(translate(locale,'common.actions.cancel')));
 const denied=page.render(locale,{'PayoutWorkspace.data':null,'PayoutWorkspace.error':'contextUnavailable'},props,'PayoutWorkspace');assert.ok(!denied.includes(payee.legal_name));assert.ok(!denied.includes('••••7890'));assert.match(denied,/role="alert"/);
 const viewer=page.render(locale,{}, {...props,fixture:{...f,can_manage:false}},'PayoutWorkspace');for(const key of ['fixPayee','changeRecipient','add','save'])assert.ok(!viewer.includes(t(key)),key);
});
test('Existing Payables UUID link and keyed route reset remain wired; view permission and read RPC are retained',()=>{
 const groups=workspaceFixture('app/finance/payables/page.tsx',['PayableGroups'],{'../quotations/shared':{QuotationGuard:()=>null},'../FinanceSubNav':{default:()=>null}});
 const html=groups.render('en',{}, {groups:[{recipient_id:payee.id,recipient_name:payee.legal_name,currency:'THB',open_amount:3104,components:f.components}]},'PayableGroups');
 assert.ok(html.includes(`/finance/payouts/new?payee=${payee.id}`));
 const route=fs.readFileSync('app/finance/payouts/[id]/page.tsx','utf8');assert.match(route,/permissions.canViewFinancePayments/);assert.match(route,/key=\{`\$\{params.id\}:\$\{search.get\("payee"\)\}/);assert.match(route,/payeeId=\{search.get\("payee"\)\}/);
 const source=fs.readFileSync('app/finance/payouts/workspace.tsx','utf8');assert.match(source,/validPayoutEntry\(r.data as Workspace, payeeId, id\)/);assert.match(source,/p_payee_id: payeeId \|\| null/);assert.doesNotMatch(source,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
