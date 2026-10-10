/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {detailText:T}=require('../../app/cases/[id]/labels.ts'),M=require('../../app/cases/[id]/service-model.ts');
const f=workspaceFixture('app/cases/[id]/CaseService.tsx',['ServiceView','AnswerView','DefaultMotionReview','ServiceEditor'],{'./CaseCore':{CoreEditor:()=>null},'./CaseEditModal':{default:({children})=>React.createElement('section',{role:'dialog'},children)}});
const attempt={id:'a',result:'served',method:'normal',attempted_on:'2026-09-01'};
const p={id:'p1',name:'Defendant One',control:{version:1,required:true,lawful_attempt_id:'a',answer_deadline_id:'d1'},attempts:[attempt],answer_deadline:{id:'d1',current_due_date:'2026-10-09',status:'Active',updated_at:'2026-10-01',deleted_at:null},default_deadline:null,extensions:[]};
const extended={...p,id:'p2',name:'Defendant Two',control:{...p.control,answer_deadline_id:'d2'},answer_deadline:{...p.answer_deadline,id:'d2',current_due_date:'2026-11-01'},extensions:[{id:'ex',extension_no:1,granted_until_date:'2026-11-01',note:'Reviewed court order'}]};
const filed={...p,id:'p3',name:'Defendant Three',control:{...p.control,answer_deadline_id:'d3',answer_filed_on:'2026-10-07'},answer_deadline:{...p.answer_deadline,id:'d3',status:'Done'}};
const data={today:'2026-10-10',flow:{lifecycle:'active',current_stage:'service'},defendants:[p,extended,filed],deadlines:[],hearings:[],history:[{id:"event1",party_id:"p1",action:"answer",actor_name:"Recorded lawyer",occurred_at:"2026-10-09"}]};
const props={data,canRecord:true,canConfirm:true,onEdit:()=>{},onExtensions:()=>{},onReview:()=>{}};
test('service completion is independent of answer overdue, extension, or filing; all defendants retain real method/date',()=>{
 for(const person of [p,extended,filed])assert.equal(M.serviceStatus(person),'served');
 for(const lang of ['th','en']){
  const service=f.render(lang,{},props,'ServiceView');
  for(const key of ['service.answerDue','service.recordAnswer','service.manageExtensions','service.confirmDefaultDue','answer.confirmNotFiled','service.defaultMotionNext'])assert.ok(!service.includes(T(key,lang)),key);
  assert.ok(service.includes(T('service.method.normal',lang)));assert.ok(service.includes(T('service.record',lang)));assert.equal((service.match(/data-state="served"/g)||[]).length,6);
  const cards=f.render(lang,{'CaseService.data':data},{caseId:1,revision:0,canRecord:true,canConfirm:true,onSection:()=>{}});
  assert.ok(cards.includes(T('service.title',lang)));assert.ok(cards.includes(T('answer.title',lang)));
 }
});
test('separate answers show each current extended due date and actual filing fact; overdue is never an inferred no-answer fact',()=>{
 assert.equal(M.answerStatus(p,data.today),'overdue');assert.equal(M.answerStatus(extended,data.today),'awaitingAnswer');assert.equal(M.answerStatus(filed,data.today),'answered');assert.equal(M.defaultSuggestion(filed,data.today),null);
 for(const lang of ['th','en'])for(const defendants of [[p],[p,extended,filed]]){
  const html=f.render(lang,{}, {...props,data:{...data,defendants}},'AnswerView');
  for(const person of defendants)assert.ok(html.includes(person.name));
  assert.equal((html.match(/data-state="overdue"/g)||[]).length,2);assert.ok(html.includes(T('answer.overdueHint',lang)));assert.ok(html.includes(T('answer.confirmNotFiled',lang)));
  assert.ok(!html.includes(T('service.defaultMotionNext',lang)));assert.ok(!html.includes(T('service.ruleDefault',lang)));
  if(defendants.length===3){assert.match(html,/data-state="awaitingAnswer"/);assert.match(html,/data-state="answered"/);assert.ok(html.includes('Reviewed court order'));}
 }
});
test('no filing confirmation, no motion question; explicit no creates nothing; explicit yes unlocks deadline review',()=>{
 for(const lang of ['th','en']){
  const props={person:p,data,onClose:()=>{},onProceed:()=>{}};
  const initial=f.render(lang,{},props,'DefaultMotionReview');assert.ok(!initial.includes(T('answer.motionQuestion',lang)));assert.ok(!initial.includes(T('service.confirmDefaultDue',lang)));assert.doesNotMatch(initial,/checked=""/);
  const checked=f.render(lang,{'DefaultMotionReview.notFiled':true},props,'DefaultMotionReview');assert.ok(checked.includes(T('answer.motionQuestion',lang)));assert.ok(!checked.includes(T('service.confirmDefaultDue',lang)));
  const no=f.render(lang,{'DefaultMotionReview.notFiled':true,'DefaultMotionReview.choice':'no'},props,'DefaultMotionReview');assert.ok(no.includes(T('answer.noMotionHint',lang)));assert.ok(!no.includes(T('service.confirmDefaultDue',lang)));
  const yes=f.render(lang,{'DefaultMotionReview.notFiled':true,'DefaultMotionReview.choice':'yes'},props,'DefaultMotionReview');assert.ok(yes.includes(T('service.confirmDefaultDue',lang)));
  const already=f.render(lang,{'DefaultMotionReview.notFiled':true,'DefaultMotionReview.choice':'yes'},{...props,person:{...p,control:{...p.control,default_deadline_id:'existing'}}},'DefaultMotionReview');assert.ok(already.includes(T('answer.existingMotionNext',lang)));assert.ok(!already.includes(T('service.confirmDefaultDue',lang)));
 }
});
test('confirmed default review suggests trigger+15 with no automatic actual deadline or task; server stale guards retained',()=>{
 assert.equal(M.defaultSuggestion(p,data.today),'2026-10-24');assert.equal(M.addCalendarDays('2026-12-31',15),'2027-01-15');
 for(const lang of ['th','en']){
  const html=f.render(lang,{}, {action:'deadline',kind:'default',defaultMotion:true,person:p,data,canConfirm:true,caseId:1,onClose:()=>{},onSaved:()=>{}},'ServiceEditor');
  assert.match(html,/type="date" required="" value="2026-10-24"/);assert.match(html,/type="checkbox" required=""/);assert.doesNotMatch(html,/checked=""/);assert.ok(html.includes(T('service.ruleDefault',lang)));
 }
 const source=fs.readFileSync('app/cases/[id]/CaseService.tsx','utf8');
 assert.match(source,/kind==='default'&&\(!defaultMotion\|\|!canConfirm/);assert.match(source,/expected_due:d\?\.current_due_date/);assert.match(source,/expected_updated_at:d\?\.updated_at/);assert.match(source,/p_version:person\?\.control\?\.version/);assert.match(source,/onExtensions\(p.id,due.id\)/);
 assert.doesNotMatch(source,/\.(?:insert|update|delete|upsert)\(|case101_save|case_tasks['"]|createAuditLog/);
});
test('Viewer has read-only service and answers; assistant cannot confirm non-filing or create default deadline',()=>{
 for(const lang of ['th','en']){
  for(const name of ['ServiceView','AnswerView'])assert.doesNotMatch(f.render(lang,{}, {...props,canRecord:false,canConfirm:false},name),/<button/);
  const assistant=f.render(lang,{}, {...props,canConfirm:false},'AnswerView');assert.ok(!assistant.includes(T('answer.confirmNotFiled',lang)));assert.ok(!assistant.includes(T('service.recordAnswer',lang)+'</button>'));
 }
});
test('default next action reuses single primary action and existing task linkage; Current Actor uses existing team editor',()=>{
 const core={core:null,team:[{team_role:'current_actor',person_id:'lawyer'}],people:[{id:'lawyer',name:'Existing current actor',eligible:true}],tasks:[]};
 for(const lang of ['th','en']){
  const html=f.render(lang,{'ServiceEditor.core':core},{action:'next',defaultMotion:true,person:p,data,canConfirm:true,caseId:1,onClose:()=>{},onSaved:()=>{}},'ServiceEditor');
  for(const key of ['service.defaultMotionNext','service.linkTask','service.nextHint','Manage team'])assert.ok(html.includes(T(key,lang)),key);
  assert.ok(html.includes('Existing current actor'));assert.match(html,/type="date" value=""/);
 }
});

test('answer labels are available in both locales without mixed translated labels',()=>{const labels=JSON.parse(fs.readFileSync('app/cases/[id]/detail-labels.json','utf8'));for(const [key,value]of Object.entries(labels).filter(([k])=>k.startsWith('answer.'))){assert.match(value.th,/[ก-๙]/,key);assert.doesNotMatch(value.en,/[ก-๙]/,key);}});

test('final cleanup: service has no answer stage action; answer UI has no attendance control and retains historical audit',()=>{
 for(const lang of ['th','en']){
  const history={id:'attendance',party_id:'p1',action:'absence',actor_name:'Historical recorder',occurred_at:'2026-10-01'};
  const view=f.render(lang,{}, {...props,data:{...data,history:[history]}},'AnswerView');
  assert.ok(!view.includes(T('service.recordAbsence',lang)+'</button>'));assert.ok(view.includes('Historical recorder'));
  const service=f.render(lang,{},props,'ServiceView');assert.ok(!service.includes(T('service.advance',lang)));
  const filedView=f.render(lang,{}, {...props,data:{...data,defendants:[filed]}},'AnswerView');
  assert.match(filedView,/data-state="answered"/);
  for(const key of ['answer.overdueHint','answer.confirmNotFiled','service.recordAnswer','service.manageExtensions'])assert.ok(!filedView.includes(T(key,lang)),key);
 }
 const src=fs.readFileSync('app/cases/[id]/CaseService.tsx','utf8');assert.doesNotMatch(src,/action:'absence'|action==='absence'/);
 // The same answer RPC completes the existing linked deadline atomically; no added client-side deadline/flow writes.
 assert.match(src,/if\(action==='answer'\)payload=\{date:day,\.\.\.expected\}/);
 const sql=fs.readFileSync('scripts/sql/case_service_103_contract.sql','utf8');const answer=sql.split("ELSIF p_action='answer' THEN")[1].split("ELSIF p_action='absence'")[0];
 assert.match(answer,/UPDATE public.case_deadlines SET status='Done'/);assert.match(answer,/SET answer_filed_on=event_day/);assert.doesNotMatch(answer,/case101_save|INSERT INTO|case_flow/);
});
test('current labels use full defendant-answer terminology; stored free text remains unchanged',()=>{
 const labels=JSON.parse(fs.readFileSync('app/cases/[id]/detail-labels.json','utf8'));
 for(const[key,value]of Object.entries(labels))if(/คำให้การ/.test(value.th)){assert.doesNotMatch(value.th,/คำให้การ(?!จำเลย)/,key);if(!/นัดสอบคำให้การ/.test(value.th))assert.match(value.en.toLowerCase(),/defendant/,key);}
 assert.equal(T('View case flow','th'),'ดูขั้นตอนคดี');assert.equal(T('View case flow','en'),'View case stages');
 const {caseTerm}=require('../../app/cases/labels.ts');
 for(const key of ['answer','ครบกำหนดยื่นคำให้การ']){assert.equal(caseTerm(key,'th'),'ครบกำหนดยื่นคำให้การจำเลย');assert.equal(caseTerm(key,'en'),'Defendant’s answer due');}
 for(const lang of ['th','en'])assert.equal(T('ข้อความเดิม: คำให้การตามเอกสารต้นฉบับ',lang),'ข้อความเดิม: คำให้การตามเอกสารต้นฉบับ');
});
