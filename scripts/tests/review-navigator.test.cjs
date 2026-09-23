/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');
const {reviewProgress,reviewItemLabel,companyReviewDisplayStage,nextUndecided}=require('../../app/finance/expenses/review-progress.ts');
const {claimStatus}=require('../../app/finance/expenses/claim-review.tsx');
const {expense}=require('./expense-foundation-fixture.cjs');
const item=(id,status='submitted',paid=false)=>expense(id,{status,tax_review:null,settlement:status==='accepted'?{mode:'supplier_unpaid',amount:300}:null,obligation:status==='accepted'?{settled:paid,waived:false}:null,payout:paid?{status:'confirmed',net:291,wht:9}:null});
test('three-item progress derives decisions independently of payment and rejection',()=>{
 for(const [states,reviewed,approved,rejected,pending] of [
  [['submitted','submitted','submitted'],0,0,0,3],
  [['accepted','submitted','submitted'],1,1,0,2],
  [['accepted','rejected','submitted'],2,1,1,1],
  [['accepted','rejected','accepted'],3,2,1,0],
  [['rejected','rejected','rejected'],3,0,3,0]]){
  const items=states.map((s,n)=>item(n+1,s)),p=reviewProgress(items);
  assert.deepEqual([p.reviewed,p.approved,p.rejected,p.pending],[reviewed,approved,rejected,pending]);
  assert.equal(companyReviewDisplayStage({status:'submitted',items}),pending?'submitted':approved?'unpaid':'rejected');
  assert.equal(claimStatus(items),pending?'claimPending':approved?'claimAwaitingRefund':'claimRejected');
 }
});
test('paid approved items exclude rejections and WHT from completion',()=>{
 const mixed=[item(1,'accepted',true),item(2,'accepted'),item(3,'rejected')];
 assert.deepEqual([reviewProgress(mixed).paid,reviewProgress(mixed).unpaid],[1,1]);
 assert.equal(companyReviewDisplayStage({status:'submitted',items:mixed}),'partiallyPaid');
 const paid=[item(1,'accepted',true),item(2,'accepted',true),item(3,'rejected')];
 assert.equal(companyReviewDisplayStage({status:'submitted',items:paid}),'paid');assert.equal(claimStatus(paid),'claimRefunded');
 assert.equal(reviewItemLabel(paid[0],false),'paid');assert.equal(reviewItemLabel(paid[0],true),'claimRefunded');
});
test('next undecided skips completed items, wraps, and stops after the last decision',()=>{
 const items=[item(1),item(2,'rejected'),item(3)];
 assert.equal(nextUndecided(items,items[0].id),items[2].id);
 assert.equal(nextUndecided(items,items[2].id),items[0].id);
 assert.equal(nextUndecided(items.map(i=>({...i,status:'accepted'})),items[2].id),undefined);
});
