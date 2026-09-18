/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {fixture}=require('./payout-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {payoutReviewState:review,payoutComponentPreview:component,validPayoutDate}=require('../../app/finance/payouts/review.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const f=fixture(),payee=f.payees[0],bank=f.accounts[0],rows=f.components,rates={[rows[0].id]:'3',[rows[1].id]:'0'},paidOn='2026-09-01';
const missing={...payee,destination:null,tax_id:null};
const cash={...bank,kind:'cash',account_id:'office',bank_account_id:null,cash_location_id:'office',name_th:'เงินสดสำนักงาน',name_en:'Office Cash'};
const state=(p=payee,a=bank,r=rows,w=rates,d=paidOn,status)=>review(p,a,r,w,d,status,'2026-09-18');
const page=workspaceFixture('app/finance/payouts/workspace.tsx',['PayoutWorkspace'],{'./payee-modal':{PayeeModal:()=>null},'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-test-modal':true},children):null}});
const controls={'PayoutWorkspace.selected':rows.map(r=>r.id),'PayoutWorkspace.rates':rates,'PayoutWorkspace.accountKey':'bank:'+bank.account_id,'PayoutWorkspace.paidOn':paidOn};
const render=(locale,data=f,extra={})=>page.render(locale,{...controls,...extra},{id:data.payout?.id||'new',payeeId:payee.id,fixture:data},'PayoutWorkspace');

test('Stepper derives completeness, not Draft existence or scrolling',()=>{
 assert.deepEqual(state(payee,bank,[],{}).completed,[false,false,false,false]);
 assert.equal(state(null,bank,[],{}).activeStep,0);
 const step2=state(payee,null,rows,{});assert.equal(step2.activeStep,1);assert.deepEqual(step2.completed,[true,false,false,false]);
 for(const status of [undefined,'draft','cancelled']){const s=state(missing,bank,rows,rates,paidOn,status);assert.equal(s.activeStep,2);assert.deepEqual(s.completed,[true,true,false,false]);assert.deepEqual(s.recipientIssues,['bankMissing','taxMissing']);}
 assert.deepEqual(state(payee,bank,rows,rates,paidOn,'confirmed').completed,[true,true,true,true]);
 assert.equal(state(payee,bank,rows,rates,paidOn,'confirmed').activeStep,3);
 assert.equal(state({...payee,is_active:false}).completed[0],false);
 assert.equal(state(payee,bank,[{...rows[0],status:'settled'}]).completed[0],false);
 assert.equal(state(payee,bank,[{...rows[0],recipient_id:'another-payee'}]).completed[0],false);
 assert.equal(state(payee,{...bank,is_active:false}).completed[1],false);
});
test('Existing per-component cent math: mixed WHT and unchanged outbound choices',()=>{
 assert.deepEqual(component(rows[0],rates),{gross:1940,wht:58.2,net:1881.8});
 assert.deepEqual(component(rows[1],rates),{gross:1164,wht:0,net:1164});
 const {math}=state();assert.deepEqual([math.gross,math.wht,math.net,bank.system_balance-math.net],[3104,58.2,3045.8,26514.2]);
 assert.deepEqual(math.choices,[{entitlement_id:rows[0].id,treatment:'withhold',rate:3},{entitlement_id:rows[1].id,treatment:'none',rate:0}]);
 assert.deepEqual(component(rows[0],{}),{gross:1940,wht:null,net:null});
 assert.equal(component({...rows[0],gross_amount:.05},{[rows[0].id]:'10'}).wht,.01);
});
test('Only actual 051 recipient and Treasury guards: no invented Tax ID requirement',()=>{
 const noTax={[rows[0].id]:'0',[rows[1].id]:'0'};
 assert.deepEqual(state(missing,cash,rows,noTax).recipientIssues,[]);
 assert.deepEqual(state(missing,bank,rows,noTax).recipientIssues,['bankMissing']);
 assert.deepEqual(state(missing,cash).recipientIssues,['taxMissing']);
 assert.deepEqual(state(missing,null,rows,{}).recipientIssues,[]);
 assert.equal(state(payee,null).blockers.includes('unknown'),false);
 assert.ok(state(payee,null).blockers.includes('chooseAccount'));
 assert.ok(state(payee,{...bank,system_balance:null}).blockers.includes('unknown'));
 assert.equal(state(payee,{...bank,system_balance:0}).blockers.includes('unknown'),false);
 assert.ok(state(payee,bank,rows,rates,'2026-08-31').blockers.includes('cutoff'));
 assert.deepEqual(state().blockers,[]);
});
test('Explicit valid date required, including real calendar date and existing future/cutoff guards',()=>{
 for(const value of ['','2026-02-30','not-a-date','2026-09-19']){assert.equal(validPayoutDate(value,'2026-09-18'),false);assert.equal(state(payee,bank,rows,rates,value).completed[1],false);}
 assert.equal(validPayoutDate('2026-09-18','2026-09-18'),true);
});
for(const locale of ['th','en'])test(`${locale}: blocked UAT state, live checklist, disabled reason, explicit account labels and final modal`,()=>{
 const t=k=>translate(locale,'payout.'+k),data={...fixture(),payees:[missing]},html=render(locale,data);
 assert.match(html,/data-state="active" aria-current="step"/);
 for(const key of ['stepRecipient','stepTax','review','bankMissing','taxMissing','fixPayee','account','destination','saveFirst'])assert.ok(html.includes(t(key)),key);
 for(const value of ['1,940.00','58.20','1,881.80','1,164.00','0.00','3,104.00','3,045.80','29,560.00','26,514.20'])assert.ok(html.includes(value),value);
 for(const key of ['destination','requiredTax'])assert.match(html,new RegExp(`data-check="${key}" data-state="missing"`));
 for(const key of ['checkRecipient','selectedRights','withheld','account','net'])assert.match(html,new RegExp(`data-check="${key}" data-state="ready"`));
 assert.match(html,/disabled="" aria-describedby="payout-review-blockers"/);
 const fixed=render(locale);assert.match(fixed,/data-check="destination" data-state="ready"/);assert.match(fixed,/data-check="requiredTax" data-state="ready"/);assert.ok(!fixed.includes(t('bankMissing')));
 const noAccount=render(locale,data,{'PayoutWorkspace.accountKey':''});assert.ok(noAccount.includes(t('chooseAccount')));assert.ok(!noAccount.includes(t('unknown')));
 const unknown=render(locale,{...f,accounts:[{...bank,system_balance:null,opening_as_of:null}]});assert.ok(unknown.includes(t('unknown')));
 const draft={id:'synthetic-draft',status:'draft',payee_id:payee.id,paid_on:paidOn,choices_json:[],note:''};
 const saved=render(locale,{...f,payout:draft});assert.ok(!saved.includes('payout-review-blockers'));
 const dirty=render(locale,{...f,payout:draft},{'PayoutWorkspace.dirty':true});assert.ok(dirty.includes(t('dirty')));assert.ok(dirty.includes('payout-review-blockers'));
 const modal=render(locale,{...f,payout:draft},{'PayoutWorkspace.modal':'confirm'}).split('data-test-modal="true"')[1];
 for(const key of ['account','destination','date','ackReviewed'])assert.ok(modal.includes(t(key)),key);
 for(const value of ['1,940.00','58.20','1,881.80','1,164.00','3,045.80'])assert.ok(modal.includes(value),value);
 assert.equal((modal.match(/data-component-preview=/g)||[]).length,2);
});
test('Confirmed component detail uses stored evidence, not a live-rate calculation',()=>{
 const frozen={status:'confirmed',choices_json:[{entitlement_id:rows[0].id,gross:1940,wht:58.2}]};
 assert.deepEqual(component({...rows[0],gross_amount:9999},{[rows[0].id]:'5'},frozen),{gross:1940,wht:58.2,net:1881.8});
 const data={...f,payout:{...frozen,id:'frozen',payee_id:payee.id,paid_on:paidOn,gross_amount:3104,wht_amount:58.2,net_amount:3045.8,confirmed_snapshot_json:{payee:{...payee,legal_name:'Frozen Pam'},destination:payee.destination,account:bank}}};
 const html=render('en',data);assert.ok(html.includes('Frozen Pam'));assert.equal((html.match(/data-state="complete"/g)||[]).length,4);assert.ok(!html.includes('payout-review-blockers'));
});
