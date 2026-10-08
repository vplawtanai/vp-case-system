/* eslint-disable @typescript-eslint/no-require-imports */
const{test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
require('./receipt-render-fixture.cjs');const React=require('react');const{workspaceFixture}=require('./i18n-workspace-fixture.cjs');const A=require('./case-proceedings-099-artifacts.cjs');
const{canReportHearing,proceedingFacts,proceedingsError}=require('../../app/cases/[id]/proceedings-model.ts');const{detailText}=require('../../app/cases/[id]/labels.ts');
const modal={default:({title,children})=>React.createElement('section',{role:'dialog'},title,children)};
const f=workspaceFixture('app/cases/[id]/CaseProceedings.tsx',['ProceedingEditor','ProceedingDetail'],{'./CaseEditModal':modal});
const core={core:null,team:[],people:[{id:'eligible',name:'ทนายตัวอย่าง',full_name:'ชื่อจริง นามสกุล',eligible:true},{id:'uat',name:'UAT profile',eligible:false}],tasks:[{id:'task',task_type:'อื่นๆ',task_other:'Existing task',status:'Pending'}]};
const hearing={id:'hearing',event_type:'hearing',event_date:'2026-01-01',appointment_type:'นัดพร้อม',updated_at:null,status:'Scheduled'};
const record={id:'record',kind:'hearing_report',hearing_id:'hearing',event_date:'2026-01-01',title:'Actual hearing',details:'Observed facts',court_result:'Court decision',party_statement:'Party position',note:'Note',document_ref:'https://drive.google.com/example',version:1,next_hearing_id:'next',deadline_id:'deadline',handoff:{},author_name:'Writer',editor_name:'Editor',created_at:'2026-01-01',updated_at:'2026-01-02'};
test('candidate/artifacts are deterministic, no old migration edits, no Apply DML or business fingerprint blocker',()=>{
 assert.equal(A.read(A.candidate),A.migration());assert.equal(A.read('scripts/sql/preflight_case_proceedings_099.sql'),A.gate());assert.equal(A.read('scripts/sql/verify_case_proceedings_099.sql'),A.gate(true));
 assert.equal(A.hash(A.read('supabase/migrations/202610080098_case_accountability_next_action.sql')),'c9cf604b4e92eeb2dde685a00816cfc5770e7d02ba45a58ff76b744fee81570c');assert.equal(A.hash(A.read('supabase/migrations/202610080097_case_security_parity.sql')),'bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6');
 assert.equal(A.additiveApplySql(A.read(A.candidate)),true);assert.doesNotMatch(A.gate()+A.gate(true),/rows_sha256|row_fingerprints|query_to_xml|auth\.users/);
 assert.deepEqual(JSON.parse(A.read(A.reviewedPath)),{candidate_sha256:A.hash(A.read(A.candidate)),accepted_contract_sha256:A.acceptedContractSha});
 const contract=A.read('scripts/sql/case_proceedings_099_contract.sql');assert.doesNotMatch(contract,/UPDATE public\.(cases|case_tasks)|INSERT INTO public\.case_tasks|finance_|OWNER.*authenticated/);assert.match(contract,/case098_save/);assert.match(contract,/auth\.uid\(\)/);
});
test('historical hearings remain truthful; only elapsed non-cancelled hearings offer report action',()=>{
 assert.equal(canReportHearing(hearing,'2026-10-08'),true);for(const h of [{...hearing,event_date:null},{...hearing,event_date:'2027-01-01'},{...hearing,event_type:'filing'},{...hearing,status:'Cancelled'}])assert.equal(canReportHearing(h,'2026-10-08'),false);
 const facts=proceedingFacts(record);assert.equal(facts.details,record.details);assert.equal(facts.hearing_id,'hearing');assert.equal(Object.keys(facts).length,9);assert.equal(facts.version,undefined);
});
test('TH/EN simple hearing/event modal, optional follow-ups, existing Task link, no Work State or phantom automatic stage',()=>{
 for(const locale of ['th','en']){
  for(const h of [undefined,hearing]){const html=f.render(locale,{}, {caseId:1,core,hearing:h,onClose:()=>{},onSaved:()=>{}},'ProceedingEditor');assert.match(html,/role="dialog"/);assert.ok(html.includes(detailText('What happened',locale)));assert.ok(html.includes(detailText('Save',locale)));assert.ok(!html.includes(detailText('Explicit due date',locale)));assert.doesNotMatch(html,/work_state|CASE099/);}
  const expanded=f.render(locale,{'ProceedingEditor.withHearing':true,'ProceedingEditor.withDeadline':true,'ProceedingEditor.withNext':true,'ProceedingEditor.nextMode':'task','ProceedingEditor.withActor':true},{caseId:1,core,onClose:()=>{},onSaved:()=>{}},'ProceedingEditor');
  for(const label of ['Explicit due date','Hearing title','role.current_actor'])assert.ok(expanded.includes(detailText(label,locale)));assert.match(expanded,/Existing task/);assert.doesNotMatch(expanded,/UAT profile/);
  const edit=f.render(locale,{}, {caseId:1,core,record,onClose:()=>{},onSaved:()=>{}},'ProceedingEditor');assert.ok(edit.includes(detailText('Edits retain the original facts in history. Existing follow-ups are not recreated.',locale)));assert.ok(!edit.includes(detailText('Add next hearing',locale)));
 }
});
test('read-only details retain all facts, author, links, next hearing/deadline and respect audit history visibility',()=>{
 for(const locale of ['th','en']){const html=f.render(locale,{}, {record,canViewHistory:false,onClose:()=>{}},'ProceedingDetail');for(const text of ['Observed facts','Court decision','Party position','Writer','Editor','https://drive.google.com/example'])assert.ok(html.includes(text));assert.ok(!html.includes(detailText('Edit',locale)+'</button>'));assert.doesNotMatch(html,/href="#history"/);}
 const full=f.render('en',{}, {record,canViewHistory:true,onEdit:()=>{},onClose:()=>{}},'ProceedingDetail');assert.match(full,/href="#history"/);
});
test('merged timeline is newest first, original hearing has one report, and Viewer has no mutation actions',()=>{
 const props={caseId:1,hearings:[hearing],canEdit:false,canViewHistory:false,renderHearing:(h,report)=>React.createElement('article',null,h.appointment_type,report)};
 const html=f.render('en',{'CaseProceedings.core':core,'CaseProceedings.records':[record,{...record,id:'event',hearing_id:null,kind:'court_order',event_date:'2026-02-01',title:'Later order'}]},props);
 assert.ok(html.indexOf('Later order')<html.indexOf('Court decision'));assert.equal((html.match(/View report/g)||[]).length,1);assert.doesNotMatch(html,/Record motion|Record hearing result/);
});
test('all new literal labels and known business errors have real single-language translations',()=>{
 const source=A.read('app/cases/[id]/CaseProceedings.tsx'),ast=ts.createSourceFile('x.tsx',source,99,true,4);
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='tr'&&ts.isStringLiteral(node.arguments[0])){const key=node.arguments[0].text;assert.doesNotMatch(detailText(key,'en'),/[ก-๙]/,key);assert.doesNotMatch(detailText(key,'th'),/[A-Za-z]{3,}/,key);}ts.forEachChild(node,visit);}visit(ast);
 for(const code of ['FORBIDDEN','STALE','CORE_STALE','HEARING_STALE','HEARING_NOT_HELD','PERSON_INELIGIBLE','INVALID_INPUT','INVALID_HEARING','INVALID_DEADLINE','REQUEST_CONFLICT']){const key=proceedingsError('CASE099_'+code);assert.doesNotMatch(detailText(key,'en'),/CASE099|[ก-๙]/);assert.match(detailText(key,'th'),/[ก-๙]/);}
 assert.match(source,/loadAssignmentPeople/);assert.match(source,/filter\(p=>p.eligible\)/);assert.match(source,/personLabel/);assert.doesNotMatch(source,/createAuditLog|\.from\('case_tasks'\)|work_state\s*:/);
});
