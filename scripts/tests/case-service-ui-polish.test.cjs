/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {detailText}=require('../../app/cases/[id]/labels.ts');
const f=workspaceFixture('app/cases/[id]/CaseService.tsx',['ServiceView','AnswerView'],{'./CaseCore':{CoreEditor:()=>null},'./CaseEditModal':{default:({children})=>React.createElement('div',null,children)}});
const current={id:'a-current',method:'normal',attempted_on:'2026-10-03',result:'served',note:'Current evidence'};
const old={...current,id:'a-old',result:'pending',note:'Earlier pending evidence'};
const before={...current,id:'a-void',result:'failed',failure_reason:'Original failed report',note:'Original note'};
const voided={...before,result:'void',void_reason:'Incorrect source report'};
const person={id:'p1',name:'Example defendant',control:{version:4,required:true,lawful_attempt_id:'a-current',lawful_at:'2026-10-03'},attempts:[voided,current,old],answer_deadline:null,default_deadline:null,extensions:[]};
const event={id:'e-void',party_id:'p1',action:'void',actor_name:'Recorded actor',occurred_at:'2026-10-04',before_data:{attempts:[before]},after_data:{attempts:[voided]}};
const data={today:'2026-10-10',flow:{current_stage:'service',lifecycle:'active',version:1},defendants:[person],deadlines:[],hearings:[],history:[event,{...event,id:'e-correct',action:'attempt',before_data:{attempts:[old]},after_data:{attempts:[{...old,note:'Corrected note'}]}}]};
test('TH/EN operational view has no lawful-confirm action or label and uses exact answer-deadline wording',()=>{
 for(const locale of ['th','en'])for(const p of [person,{...person,control:null}]){const html=f.render(locale,{}, {data:{...data,defendants:[p]},canRecord:true,canConfirm:true,onEdit:()=>{},onDeadlines:()=>{}},'ServiceView');assert.ok(!html.includes(detailText('service.confirmLawful',locale)+'</button>'));assert.ok(!html.includes('<dt>'+detailText('service.lawful',locale)+'</dt>'));const answer=f.render(locale,{}, {data,canRecord:true,canConfirm:true,onEdit:()=>{},onDeadlines:()=>{},onReview:()=>{}},'AnswerView');assert.ok(answer.includes(detailText('service.noDeadline',locale)));}
 assert.equal(detailText('service.noDeadline','th'),'ยังไม่ได้ยืนยันกำหนดยื่นคำให้การ');assert.equal(detailText('service.status.void','th'),'ยกเลิกแล้ว');
});
test('void and older results stay readable, current result alone is emphasized; complete displayed audit evidence remains',()=>{
 for(const locale of ['th','en']){const html=f.render(locale,{}, {data,canRecord:true,canConfirm:true,onEdit:()=>{},onDeadlines:()=>{}},'ServiceView');assert.match(html,/data-current="false" data-void="true"/);assert.match(html,/data-current="true" data-void="false"/);assert.match(html,/data-current="false" data-void="false"/);assert.equal(html.split(detailText('service.currentResult',locale)).length-1,1);for(const text of ['Current evidence','Earlier pending evidence','Original failed report','Original note','Incorrect source report','Recorded actor','Corrected note',detailText('service.audit.before',locale),detailText('service.audit.after',locale),detailText('service.historyCorrection',locale),detailText('service.status.void',locale)])assert.ok(html.includes(text),text);assert.match(html,/data-side="before"/);assert.match(html,/data-side="after"/);}
 const css=fs.readFileSync('app/cases/[id]/case-service.module.css','utf8');assert.match(css,/\.history\[data-current=false\]/);assert.doesNotMatch(css,/display:none|visibility:hidden|opacity:/);
});
