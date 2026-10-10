/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
require('./receipt-render-fixture.cjs');const React=require('react'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs'),A=require('./case-service-103-artifacts.cjs');
const {detailText}=require('../../app/cases/[id]/labels.ts'),M=require('../../app/cases/[id]/service-model.ts');
const f=workspaceFixture('app/cases/[id]/CaseService.tsx',['ServiceEditor','ServiceView'],{'./CaseEditModal':{default:({title,children})=>React.createElement('section',{role:'dialog'},title,children)}});
const person={id:'p1',name:'Local defendant',control:null,attempts:[],answer_deadline:null,default_deadline:null,extensions:[]};
const data={today:'2026-10-10',flow:{current_stage:'service',lifecycle:'active',version:1},defendants:[person],deadlines:[],hearings:[],history:[]};
const props={action:'attempt',person,data,caseId:1,canConfirm:true,onClose:()=>{},onSaved:()=>{}};
test('103 artifacts deterministic; reviewed post verifier binding; immutable 102 and scoped schema-only gate',()=>{
 assert.equal(A.read(A.candidate),A.migration());assert.equal(A.read('scripts/sql/preflight_case_service_103.sql'),A.gate());assert.equal(A.read('scripts/sql/verify_case_service_103.sql'),A.gate(true));assert.deepEqual(JSON.parse(A.read(A.reviewedPath)),{candidate_sha256:A.hash(A.read(A.candidate)),accepted_contract_sha256:A.acceptedContractSha});
 assert.equal(A.hash(A.read(require('./case-service-102-artifacts.cjs').candidate)),'d88d3b513a9f574d7a03868e583fe0ead2a12056d95e6e621c853dde48df228e');assert.equal(A.additiveApplySql(A.read(A.candidate)),true);for(const dml of ['UPDATE public.cases SET title=title;','DELETE FROM public.case_service_attempts;','INSERT INTO public.case_service_controls DEFAULT VALUES;','TRUNCATE public.case_tasks;'])assert.equal(A.additiveApplySql(A.read(A.candidate)+dml),false);
 assert.doesNotMatch(A.gate()+A.gate(true),/auth\.users|rows_sha256|query_to_xml/);
 const actual=JSON.parse(A.read(A.afterPath)),changed=[];for(const kind of ['tables','functions'])for(const [name,obj]of Object.entries(A.accepted[kind]))if(JSON.stringify(actual[kind][name])!==JSON.stringify(obj))changed.push(name);assert.deepEqual(changed.sort(),['case102_save(bigint,uuid,integer,uuid,text,jsonb)','case_service_attempts'].sort());assert.deepEqual(actual.seed,A.accepted.seed);
 // Every pre-existing action after the attempt branch remains byte-identical.
 const old=A.read('scripts/sql/case_service_102_contract.sql'),next=A.read('scripts/sql/case_service_103_contract.sql');const tail=s=>s.slice(s.indexOf("  ELSIF p_action='lawful'"),s.indexOf('END $fn$;',s.indexOf("  ELSIF p_action='lawful'"))+10);assert.equal(tail(next),tail(old));
});
test('103 TH/EN result-first form; failed fields optional, served/pending require real facts; no lawful checkbox',()=>{
 for(const lang of ['th','en'])for(const result of ['served','failed','pending']){
  const html=f.render(lang,{'ServiceEditor.result':result},props,'ServiceEditor');assert.ok(html.indexOf(detailText('service.result',lang))<html.indexOf(detailText(result==='failed'?'service.methodOptional':'service.method',lang)));assert.doesNotMatch(html,/type="checkbox"/);
  if(result==='failed'){assert.doesNotMatch(html,/select required=""|type="date" required=""/);assert.match(html,/textarea required=""/);assert.ok(html.includes(detailText('service.dateOptional',lang)));assert.doesNotMatch(html,/value="(?:normal|2026-10-10)" selected/);}else {assert.match(html,/select required=""/);assert.match(html,/type="date" required="" max="2026-10-10" value=""/);}
  if(result==='pending')assert.ok(html.includes(detailText('service.pendingFactsHint',lang)));if(result==='served')assert.ok(html.includes(detailText('service.servedSaveHint',lang)));
 }
});
test('103 unknown facts readable in card/history, no invalid translated keys or suggested legal date',()=>{
 const a={id:'a',result:'failed',method:null,attempted_on:null,failure_kind:'not_found',failure_reason:'Known failure'},p={...person,attempts:[a]};assert.equal(M.answerSuggestion(p),null);assert.equal(M.serviceStatus(p),'failed');
 for(const lang of ['th','en']){const html=f.render(lang,{}, {data:{...data,defendants:[p]},canRecord:true,canConfirm:true,onEdit:()=>{},onDeadlines:()=>{}},'ServiceView');assert.ok(html.includes(detailText('service.methodUnknown',lang)));assert.doesNotMatch(html,/Invalid Date|service.method.null/);const old=f.render(lang,{}, {...props,action:'lawful',attempt:{...a,result:'served',method:'normal',attempted_on:'2026-10-01'}},'ServiceEditor');assert.doesNotMatch(old,/type="checkbox"/);}
});
test('103 rule suggestions remain +15/+30 for served and none for failed/pending/void/other; permissions stay distinct',()=>{
 for(const [method,day]of [['normal','2026-10-18'],['posting','2026-11-02'],['electronic','2026-11-02'],['other',null]])for(const result of ['served','failed','pending','void']){const p={...person,control:{lawful_attempt_id:'a'},attempts:[{id:'a',method,attempted_on:'2026-10-03',result}]};assert.equal(M.answerSuggestion(p),result==='served'?day:null);}
 for(const lang of ['th','en']){const assistant=f.render(lang,{}, {...props,canConfirm:false},'ServiceEditor');assert.ok(assistant.includes(detailText('service.notLawfulHint',lang)));const viewer=f.render(lang,{}, {data,canRecord:false,canConfirm:false,onEdit:()=>{},onDeadlines:()=>{}},'ServiceView');assert.doesNotMatch(viewer,/<button/);}
});
