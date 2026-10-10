/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const M=require('../../app/cases/[id]/service-model.ts'),{detailText:T}=require('../../app/cases/[id]/labels.ts');
const modal={default:({children})=>React.createElement('section',{role:'dialog'},children)};
const f=workspaceFixture('app/cases/[id]/components/DeadlinesSection.tsx',['DeadlineCard'],{'../CaseEditModal':modal});
const a=workspaceFixture('app/cases/[id]/CaseService.tsx',['AnswerView'],{'./CaseCore':{CoreEditor:()=>null},'./CaseEditModal':modal});
const person=(n,status,due)=>({id:'p'+n,name:'Defendant '+n,control:{version:3,required:true,lawful_attempt_id:'a'+n,answer_deadline_id:'d'+n,default_deadline_id:null,answer_filed_on:status==='Done'?'2026-10-08':null},attempts:[{id:'a'+n,method:'posting',attempted_on:'2026-08-01',result:'served'}],answer_deadline:{id:'d'+n,status,current_due_date:due,original_due_date:'2026-10-09',updated_at:'2026-10-01'},extensions:n===2?[{id:'ex2',extension_no:1,granted_until_date:due,note:'Court order for defendant 2'}]:[],default_deadline:null});
const people=[person(1,'Done','2026-10-09'),person(2,'Active','2026-11-01'),person(3,'Active','2026-10-09')];
const links=people.map(p=>({...p.control,party_id:p.id,party:{entity_type:'individual',first_name:p.name,deleted_at:null},attempt:p.attempts[0]}));
const data={today:'2026-10-10',flow:{lifecycle:'active',current_stage:'defence'},defendants:people,history:[],deadlines:[],hearings:[]};
const noop=()=>{};
const props=p=>({item:{...p.answer_deadline,deadline_type:'answer'},extensions:p.extensions,extensionDeadlineId:null,editingExtensionId:null,extensionForm:{requested_date:'',granted_until_date:'',note:''},canEdit:true,canDelete:true,savingExtension:false,onAnswer:noop,onEdit:noop,onDelete:noop,onToggleDone:noop,onStartAddExtension:noop,onStartEditExtension:noop,onDeleteExtension:noop,onCancelExtension:noop,onChangeExtensionForm:noop,onCreateExtension:noop,onUpdateExtension:noop});
test('canonical links use actual deadline and Party IDs; a manual answer deadline stays manual',()=>{
 for(let n=1;n<=3;n++)assert.equal(M.linkedServiceDeadline(links,'d'+n).party_id,'p'+n);
 assert.equal(M.linkedServiceDeadline(links,'manual-answer'),null);
 const defaultLink={...links[2],default_deadline_id:'motion3'};assert.equal(M.linkedServiceDeadline([...links.slice(0,2),defaultLink],'motion3').party_id,'p3');
});
test('linked deadlines are read-only for every status; source, defendant, date/history and navigation remain',()=>{
 for(const lang of ['th','en'])for(const p of people){
  const html=f.render(lang,{}, {...props(p),link:M.linkedServiceDeadline(links,p.answer_deadline.id)},'DeadlineCard');
  assert.ok(html.includes(p.name));assert.ok(html.includes(T('answer.deadlineSource',lang)));assert.ok(html.includes(T('service.method.posting',lang)));assert.ok(html.includes(T('answer.goToAnswer',lang)));
  for(const k of ['Done','Undo','Edit','Delete','+ Extension'])assert.ok(!html.includes('>'+T(k,lang)+'</button>')&&!new RegExp('>'+T(k,lang).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*</button>').test(html),k);
  assert.equal((html.match(/<button/g)||[]).length,1);
 }
});
test('manual/legacy deadline retains edit, extend, complete and extension actions',()=>{
 for(const lang of ['th','en']){
  const html=f.render(lang,{},props(people[1]),'DeadlineCard');
  for(const key of ['Done','Edit','Delete','+ Extension'])assert.ok(html.includes(T(key,lang)),key);
  assert.ok(!html.includes(T('answer.goToAnswer',lang)));
 }
});
test('three defendants stay independent: filed, extended, overdue; confirmation and +15 only for third',()=>{
 assert.deepEqual(people.map(p=>M.answerStatus(p,data.today)),['answered','awaitingAnswer','overdue']);
 assert.deepEqual(people.map(p=>M.defaultSuggestion(p,data.today)),[null,null,'2026-10-24']);
 for(const lang of ['th','en']){
  const html=a.render(lang,{}, {data,canRecord:true,canConfirm:true,onEdit:noop,onExtensions:noop,onReview:noop},'AnswerView');
  assert.equal((html.match(/data-state="answered"/g)||[]).length,1);assert.equal((html.match(/data-state="awaitingAnswer"/g)||[]).length,1);assert.equal((html.match(/data-state="overdue"/g)||[]).length,1);
  const third=a.render(lang,{}, {data,canRecord:true,canConfirm:true,onEdit:noop,onExtensions:noop,onReview:noop,partyId:'p3'},'AnswerView');assert.ok(third.includes('Defendant 3'));assert.ok(!third.includes('Defendant 1'));assert.ok(!third.includes('Court order for defendant 2'));
  const viewer=a.render(lang,{}, {data,canRecord:false,canConfirm:false,onEdit:noop,onExtensions:noop,onReview:noop},'AnswerView');assert.doesNotMatch(viewer,/<button/);
 }
 assert.equal(data.flow.current_stage,'defence');assert.deepEqual(M.serviceFlowSuggestions(data),{advance:false,branch:false});
});
test('Answer opens the existing extension modal; linked mutations are guarded and Deadline read model refreshes after filing',()=>{
 const source=fs.readFileSync('app/cases/[id]/components/DeadlinesSection.tsx','utf8'),service=fs.readFileSync('app/cases/[id]/CaseService.tsx','utf8'),page=fs.readFileSync('app/cases/[id]/page.tsx','utf8');
 assert.match(source,/\[caseId, revision\]/);assert.match(page,/DeadlinesSection[\s\S]*revision=\{revision\}/);
 assert.match(service,/onExtensions\(p.id,due.id\)/);assert.doesNotMatch(service,/onSection\('deadlines'\)/);
 for(const name of ['startEdit','deleteDeadline','toggleDone','startAddExtension','startEditExtension','deleteExtension'])assert.match(source,new RegExp('const '+name+' = [^\\n]+\\n    if \\(!linksReady \\|\\| linked\\('),name);
 assert.match(source,/source\.party_id !== extensionRequest\.partyId/);assert.match(source,/source\.answer_filed_on/);assert.match(source,/source\.party_id !== extensionRequest\?\.partyId/);
 assert.match(source,/party:parties!party_id/);assert.match(source,/attempt:case_service_attempts!case102_lawful_party/);
 assert.doesNotMatch(service,/case101_save|\.from\(["']case_tasks/);
});
