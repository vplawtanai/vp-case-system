/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const M=require('../../app/cases/[id]/service-model.ts'),{detailText:T}=require('../../app/cases/[id]/labels.ts');
const modal={default:({children})=>React.createElement('section',{role:'dialog'},children)};
const service=workspaceFixture('app/cases/[id]/CaseService.tsx',['AnswerView'],{'./CaseCore':{CoreEditor:()=>null},'./CaseEditModal':modal,'./use-case-business-date':{useCaseBusinessDate:()=> '2026-10-10'}});
const deadlines=workspaceFixture('app/cases/[id]/components/DeadlinesSection.tsx',['DeadlineCard'],{'../CaseEditModal':modal});
const person=(id,due)=>({id,name:'Defendant '+id,control:{version:1,required:true,lawful_attempt_id:'attempt-'+id,answer_deadline_id:due?'due-'+id:null,answer_filed_on:null},attempts:[{id:'attempt-'+id,result:'served',method:'posting',attempted_on:'2026-08-30'}],answer_deadline:due?{id:'due-'+id,status:'Active',current_due_date:due,original_due_date:'2026-09-29'}:null,default_deadline:null,extensions:[]});
const A=person('A','2026-09-29'),B=person('B','2026-10-20'),C=person('C',null);
B.extensions=[{id:'ext-B',extension_no:1,granted_until_date:'2026-10-20',note:'Court order'}];
const data={today:'2026-10-10',flow:{lifecycle:'active',current_stage:'defence'},defendants:[A,B,C],history:[],deadlines:[],hearings:[]};
const noop=()=>{},answerProps={data,today:data.today,canRecord:true,canConfirm:true,onEdit:noop,onExtensions:noop,onReview:noop};
const link=p=>M.linkedServiceDeadline([{...p.control,party_id:p.id,party:{entity_type:'individual',first_name:p.name},attempt:p.attempts[0]}],p.answer_deadline?.id);
const deadlineProps=p=>({item:{...p.answer_deadline,deadline_type:'answer'},businessDate:data.today,link:link(p),extensions:p.extensions,extensionDeadlineId:null,editingExtensionId:null,extensionForm:{},canEdit:true,canDelete:true,onAnswer:noop});
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(data);
test('three Party IDs: 11 days overdue, extended future date, and unconfirmed legacy; derived only',()=>{
 const before=JSON.stringify(data);
 assert.deepEqual(data.defendants.map(p=>M.answerDeadlineState(p.control,p.answer_deadline,data.today)),[{status:'overdue',overdueDays:11},{status:'awaitingAnswer',overdueDays:0},{status:'unconfirmed',overdueDays:0}]);
 assert.deepEqual(data.defendants.map(p=>M.answerStatus(p,data.today)),['overdue','awaitingAnswer','pendingDeadline']);
 assert.equal(M.answerDeadlineState(A.control,B.answer_deadline,data.today).overdueDays,0);
 assert.equal(M.answerDeadlineState({...A.control,answer_deadline_id:null},A.answer_deadline,data.today).status,'unconfirmed');
 assert.equal(M.defaultSuggestion(A,data.today),'2026-10-14');assert.equal(M.defaultSuggestion(B,data.today),null);assert.equal(M.defaultSuggestion(C,data.today),null);
 assert.equal(data.flow.current_stage,'defence');assert.equal(JSON.stringify(data),before);
});
test('Business Date uses Bangkok midnight; same day is not overdue and updates without stored counters',()=>{
 assert.equal(M.caseBusinessDate(new Date('2026-10-09T16:59:59Z')),'2026-10-09');
 assert.equal(M.caseBusinessDate(new Date('2026-10-09T17:00:00Z')),'2026-10-10');
 assert.equal(M.answerDeadlineState(A.control,A.answer_deadline,'2026-10-11').overdueDays,12);
 assert.equal(M.answerDeadlineState(A.control,A.answer_deadline,'2026-09-29').overdueDays,0);
 for(const status of ['Done','Cancelled'])assert.equal(M.answerDeadlineState(A.control,{...A.answer_deadline,status},data.today).overdueDays,0);
 assert.equal(M.answerDeadlineState({...A.control,answer_filed_on:'2026-10-10'},A.answer_deadline,data.today).overdueDays,0);
 assert.equal(M.confirmedDeadlineOverdueDays({...A.answer_deadline,deleted_at:'2026-10-01'},'due-A',data.today),0);
 for(const due of ['2026-02-30','invalid',null])assert.equal(M.confirmedDeadlineOverdueDays({...A.answer_deadline,current_due_date:due},'due-A',data.today),0);
});
test('TH/EN Answer card, modal and linked Deadline agree; legacy and extended defendants have no overdue warning',()=>{
 for(const lang of ['th','en']){
  const count=T('answer.overdueDays',lang).replace('{days}','11'),warning=T('answer.overdueHint',lang);
  const card=service.render(lang,{'CaseService.data':data},{caseId:1,revision:0,canRecord:true,canConfirm:true,onExtend:noop});
  assert.ok(card.includes(count));assert.equal(card.split(warning).length-1,1);
  const html=service.render(lang,{},answerProps,'AnswerView');assert.equal(html.split(warning).length-1,1);
  assert.ok(html.includes(T('answer.status.overdue',lang)));assert.ok(html.includes(count));assert.ok(html.includes(T('service.confirmAnswerDue',lang)));
  for(const p of [A,B]){
   const d=deadlines.render(lang,{},deadlineProps(p),'DeadlineCard');assert.ok(d.includes(p.name));assert.ok(d.includes(T('answer.goToAnswer',lang)));assert.ok(d.includes(T('service.method.posting',lang)));
   assert.equal(d.includes(count),p===A);assert.equal(d.includes(warning),p===A);
   assert.equal(d.includes(T('Original Due Date',lang)),p===B);assert.equal(d.includes(T('Current Due Date',lang)),p===B);
   assert.equal((d.match(/<button/g)||[]).length,1);
  }
  const legacy=service.render(lang,{}, {...answerProps,partyId:'C'},'AnswerView');assert.ok(legacy.includes(T('service.noDeadline',lang)));assert.ok(!legacy.includes(warning));assert.ok(!legacy.includes(T('answer.confirmNotFiled',lang)));
  const viewer=service.render(lang,{}, {...answerProps,canRecord:false,canConfirm:false},'AnswerView');assert.doesNotMatch(viewer,/<button/);assert.ok(viewer.includes(count));
 }
});
