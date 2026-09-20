/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{fixture,expense,id,obligation,tax}=require('./expense-foundation-fixture.cjs');
const {requestStage,requestNextAction,requestTimeline,requestWaiting,hasReimbursement}=require('../../app/finance/expenses/request-operations.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const f=fixture('list'),creator={...f.data.access,can_manage:false,can_tax_review:false,can_record:false,can_confirm:false,is_admin:false};
const request=(items,status='submitted')=>({id:id(900),kind:'employee_claim',status,version:1,note:'',created_by:creator.user_id,created_at:'2026-09-19T01:00:00Z',submitted_at:status==='submitted'?'2026-09-20T04:42:00Z':null,requester_name:'Synthetic claimant',audit:[],items});
const view=workspaceFixture('app/finance/expenses/request-view.tsx',['ExpenseRequestReview','ExpenseRequestRow'],{'../../components/DetailModal':{default:({title,children,footer})=>React.createElement('section',{role:'dialog'},title,children,footer)}});
const props={access:creator,busy:false,error:'',run:()=>{throw Error('No writes');},onClose(){},onEdit(){},renderItem:()=>React.createElement('div',null,'FINANCE CONTROLS')};
test('Truthful stages: draft, review, accepted, rejected, waiting, paid; no fake paid for noncash or mixed decisions',()=>{
 const e=expense(10,{status:'accepted',tax_review:tax});
 assert.equal(requestStage(request([e],'draft')),'draft');
 assert.equal(requestStage(request([{...e,status:'submitted'}])),'submitted');
 assert.equal(requestStage(request([e])),'accepted');
 assert.equal(requestStage(request([{...e,status:'rejected'}])),'rejected');
 assert.equal(requestStage(request([{...e,obligation:obligation(11,e.id)}])),'unpaid');
 assert.equal(requestStage(request([{...e,payout:{status:'confirmed'}}])),'paid');
 assert.equal(requestStage(request([{...e,payout:{status:'draft'}}])),'accepted');
 assert.equal(requestStage(request([{...e,settlement:{mode:'no_reimbursement'}},{...e,status:'rejected'}])),'requestReviewedMixed');
});
test('Review permission reused, including own request; read-only creator cannot see finance controls',()=>{
 const r=request([expense(10,{status:'submitted'})]);
 for(const access of [creator,f.data.access]){
  const html=view.render('th',{}, {...props,request:r,access},'ExpenseRequestReview');
  assert.equal(html.includes('FINANCE CONTROLS'),access.can_manage);
  assert.equal(requestNextAction(r,access),access.can_manage?'nextReview':'nextWaitingReview');
  const row=view.render('th',{}, {request:r,access,onOpen(){}},'ExpenseRequestRow');
  assert.equal(row.includes('ตรวจคำขอ'),access.can_manage);
  assert.ok(!html.includes('รอผู้ตรวจรายอื่น'));
 }
});
test('Rejected remains terminal; no edit/resubmit/returned fiction',()=>{
 const html=view.render('th',{}, {...props,request:request([expense(10,{status:'rejected'})])},'ExpenseRequestReview');
 assert.ok(html.includes('รายการนี้ไม่อนุมัติ'));assert.ok(html.includes('ให้สร้างรายการใหม่'));
 assert.ok(!html.includes('ส่งกลับแก้ไข'));assert.ok(!html.includes('แก้ไขร่างคำขอ'));assert.ok(!html.includes('FINANCE CONTROLS'));
});
test('Timeline and age use event timestamps only, never business date or last update',()=>{
 const e=expense(10,{status:'accepted',audit:[{id:id(91),event_type:'accepted',created_at:'2026-09-20T05:00:00Z'},{id:id(92),event_type:'payment_confirmed',created_at:null}],obligation:obligation(20,id(10),{created_at:'2026-09-21T00:00:00Z'})});
 const r=request([e]),events=requestTimeline(r);
 assert.deepEqual(events.map(e=>e.label),['draftCreatedAt','requestSubmittedAt','accepted','readyToPayEvent']);
 assert.equal(requestWaiting(r,Date.parse('2026-09-23T00:00:00Z')).days,2);
 assert.equal(requestWaiting(request([{...e,obligation:{...e.obligation,created_at:null}}]),Date.now()),null);
 assert.ok(events.every(e=>e.at!==r.items[0].expense_date));
});
test('Company requested reimbursement hidden unless relevant; Claim always visible, never called approved obligation',()=>{
 assert.equal(hasReimbursement(false,[{personally_paid:false,reimbursement_requested:0}]),false);
 assert.equal(hasReimbursement(false,[{personally_paid:true,reimbursement_requested:0}]),true);
 assert.equal(hasReimbursement(true,[]),true);
 const r={...request([expense(10)]),kind:'company_expense_batch'};
 const html=view.render('th',{}, {...props,request:r},'ExpenseRequestReview');
 assert.ok(!html.includes('ยอดขอคืนรวม'));assert.ok(!html.includes('ยอดขอคืนให้ผู้สำรองจ่าย'));
 assert.ok(translate('en','expenses.staffRequestedTotal').includes('requested'));
});
test('Accepted without settlement is not described as waiting for payment; paid message needs confirmed payout',()=>{
 const e=expense(10,{status:'accepted'});
 assert.equal(requestNextAction(request([e]),creator),'nextFinanceProcessing');
 assert.equal(requestNextAction(request([e]),f.data.access),'nextFinanceReview');
 assert.equal(requestNextAction(request([{...e,payout:{status:'confirmed'}}]),creator),'nextPaid');
});
test('EN status/identity/timeline smoke; Admin tools remain collapsed and denied to creator',()=>{
 const html=view.render('en',{}, {...props,request:request([expense(10,{status:'rejected'})])},'ExpenseRequestReview');
 for(const label of ['Claimant','Draft created','Request submitted at','Request timeline','Not approved','create a new item'])assert.ok(html.includes(label),label);
 assert.ok(!html.includes('expenses.'));
 const admin=workspaceFixture('app/finance/expenses/admin-tools.tsx',['ExpenseAdminTools']);
 const args={...props,accounts:f.data.accounts,lookups:f.lookups,fixture:true,onBridge(){}};
 assert.equal(admin.render('th',{},args,'ExpenseAdminTools'),'');
 const adminHtml=admin.render('th',{}, {...args,access:f.data.access},'ExpenseAdminTools');
 assert.match(adminHtml,/<details[^>]*><summary>เครื่องมือผู้ดูแลระบบ/);assert.doesNotMatch(adminHtml,/<details[^>]*\bopen/);
});
