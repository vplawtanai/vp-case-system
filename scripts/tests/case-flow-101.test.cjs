/* eslint-disable @typescript-eslint/no-require-imports */
const{test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
require('./receipt-render-fixture.cjs');const React=require('react');const{workspaceFixture}=require('./i18n-workspace-fixture.cjs');const A=require('./case-flow-101-artifacts.cjs');const{detailText}=require('../../app/cases/[id]/labels.ts');const{hasCourtRecord,validCutInFiling,flowPermissions,stageEvidence,needsFlowReason,flowError}=require('../../app/cases/[id]/flow-model.ts');
const modal={default:({title,children})=>React.createElement('section',{role:'dialog'},title,children)};
const f=workspaceFixture('app/cases/[id]/CaseFlow.tsx',['FlowEditor','FlowView'],{'./CaseEditModal':modal});
const seed=JSON.parse(A.read(A.afterPath)).seed;
const event={id:'start',sequence_no:1,event_kind:'start',transition_code:null,from_stage:null,to_stage:'service',from_lifecycle:null,to_lifecycle:'active',reason:null,corrects_id:null,actor_name:'Actual recorder',occurred_at:'2026-10-09T03:00:00Z'};
const data={template:seed.versions[0],stages:seed.stages,instance:{id:'instance',case_id:1,track_key:'main',current_stage:'service',started_stage:'service',filing_method:'efiling_v3',lifecycle:'active',version:1,start_kind:'cut_in',started_at:event.occurred_at},history:[event]};
test('deterministic scoped artifacts; only immutable configuration seeded; accepted 097–100 unchanged; verifier reviewed binding',()=>{assert.equal(A.read(A.candidate),A.migration());assert.equal(A.read('scripts/sql/preflight_case_flow_101.sql'),A.gate());assert.equal(A.read('scripts/sql/verify_case_flow_101.sql'),A.gate(true));assert.deepEqual(JSON.parse(A.read(A.reviewedPath)),{candidate_sha256:A.hash(A.read(A.candidate)),accepted_contract_sha256:A.acceptedContractSha});assert.equal(A.additiveApplySql(A.read(A.candidate)),true);for(const dml of ['UPDATE public.cases SET title=title;','DELETE FROM public.case_timeline;','INSERT INTO public.finance_invoices DEFAULT VALUES;','TRUNCATE public.case_tasks;'])assert.equal(A.additiveApplySql(A.read(A.candidate)+dml),false,dml);assert.doesNotMatch(A.gate()+A.gate(true),/rows_sha256|query_to_xml|auth\.users|row_fingerprints/);assert.equal(seed.stages.length,12);assert.deepEqual(seed.stages.map(s=>s.ordinal),Array.from({length:12},(_,i)=>i+1));
 const accepted=[['097_case_security_parity','bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6'],['098_case_accountability_next_action','c9cf604b4e92eeb2dde685a00816cfc5770e7d02ba45a58ff76b744fee81570c'],['099_case_hearing_proceedings','3756a06a439210310ea6efb84003d5de1d722abadccb4f9e15e72834c03103f1'],['100_case_engagement_review','5680dee06e16a668cbb55784c69055c7f7c8447a30ed5d003be0474d58dda0f1']];for(const[n,h]of accepted)assert.equal(A.hash(A.read('supabase/migrations/202610080'+n+'.sql')),h);
 const contract=A.read('scripts/sql/case_flow_101_contract.sql');assert.doesNotMatch(contract,/UPDATE public\.(cases|case_work_core|case_tasks|case_timeline)|INSERT INTO public\.(case_tasks|case_timeline)|finance_|owner_name|INTERVAL/i);
});
test('role parity: Lawyer/Partner/Admin start; Assistant transitions; Staff and Viewer read-only',()=>{for(const role of ['admin','partner','lawyer','assistant_lawyer','staff','viewer']){const p=flowPermissions(role);assert.equal(p.start,['admin','partner','lawyer'].includes(role));assert.equal(p.transition,['admin','partner','lawyer','assistant_lawyer'].includes(role));const html=f.render('en',{'CaseFlow.data':{...data,instance:null,history:[]}},{caseId:1,revision:0,canStart:p.start,canTransition:p.transition});assert.equal(html.includes('Start flow from current state</button>'),p.start);const view=f.render('en',{}, {data,canTransition:p.transition,onEdit:()=>{}},'FlowView');assert.equal(view.includes('Record next stage</button>'),p.transition);}});
test('cut-in shows current stage and 11 unrecorded stages, never fabricated completed history; correction supersedes display evidence only',()=>{assert.equal(stageEvidence(data,'service'),'current');for(const s of data.stages.filter(s=>s.stage_key!=='service'))assert.equal(stageEvidence(data,s.stage_key),'unrecorded');const correction={...event,id:'correction',sequence_no:2,event_kind:'correction',to_stage:'defence',corrects_id:'start'};const corrected={...data,instance:{...data.instance,current_stage:'defence'},history:[correction,event]};assert.equal(stageEvidence(corrected,'service'),'unrecorded');for(const locale of ['th','en']){const html=f.render(locale,{}, {data,canTransition:true,onEdit:()=>{}},'FlowView');assert.equal((html.match(/data-evidence="current"/g)||[]).length,1);assert.equal((html.match(/data-evidence="unrecorded"/g)||[]).length,11);assert.match(html,/Actual recorder/);assert.ok(html.includes(detailText('Flow starts at the recorded point. Earlier stages are not marked complete.',locale)));assert.doesNotMatch(html,/data-evidence="completed"/);}});
test('same concise modal for cut-in and manual transitions; no technical semantics picker or invented deadlines',()=>{for(const locale of ['th','en']){const props={action:'start',data:{...data,instance:null,history:[]},caseId:1,onClose:()=>{},onSaved:()=>{}};const html=f.render(locale,{},props,'FlowEditor');assert.equal((html.match(/<select/g)||[]).length,4);assert.match(html,/type="checkbox" required/);assert.doesNotMatch(html,/type="date"|NEXT|SKIP|PARALLEL|BRANCH/);assert.ok(html.includes(detailText('Start a new flow from this stage. Only events from now onward will be recorded; no history is backfilled.',locale)));const correction=f.render(locale,{}, {...props,action:'correct',data},'FlowEditor');assert.match(correction,/<textarea required/);assert.equal((correction.match(/<select/g)||[]).length,1);}
 assert.equal(needsFlowReason(data,'advance','defence'),false);for(const target of ['service','prepare_claim','evidence'])assert.equal(needsFlowReason(data,'advance',target),true);
});
test('all new fixed labels and known business errors are localized through shared Case language mechanism',()=>{const src=A.read('app/cases/[id]/CaseFlow.tsx'),ast=ts.createSourceFile('x.tsx',src,99,true,4);function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='tr'&&ts.isStringLiteral(n.arguments[0])){const key=n.arguments[0].text;assert.match(detailText(key,'th'),/[ก-๙]/,key);assert.doesNotMatch(detailText(key,'en'),/[ก-๙]/,key);}ts.forEachChild(n,visit);}visit(ast);for(const code of ['FORBIDDEN','NOT_FOUND','STALE','REQUEST_CONFLICT','INVALID_INPUT','REASON_REQUIRED','CUT_IN_REQUIRED','STATE','IMMUTABLE']){const key=flowError('CASE101_'+code);assert.match(detailText(key,'th'),/[ก-๙]/);assert.doesNotMatch(detailText(key,'en'),/CASE101|[ก-๙]/);}assert.match(src,/case101_save/);assert.doesNotMatch(src,/\.(?:insert|update|delete|upsert)\(|case098_save|case099_save|case100_save|createAuditLog/);});

test('cut-in filing method requires an explicit choice for court evidence; never guesses or stores the placeholder',()=>{
 for(const record of [{court_name:'ศาลแพ่ง'},{case_number:'พ 2988/2569'}])assert.equal(hasCourtRecord(record),true);
 for(const record of [{},{court_name:null,case_number:null},{court_name:'  ',case_number:''}])assert.equal(hasCourtRecord(record),false);
 for(const method of ['paper','efiling_v3','efiling_v4'])assert.equal(validCutInFiling(method,true),true);
 for(const method of ['','not_filed','unknown'])assert.equal(validCutInFiling(method,true),false);
 assert.equal(validCutInFiling('not_filed',false),true);assert.equal(validCutInFiling('',false),false);
 for(const locale of ['th','en'])for(const requiresFilingMethod of [true,false]){
  const html=f.render(locale,{}, {action:'start',data:{...data,instance:null,history:[]},caseId:1,requiresFilingMethod,onClose:()=>{},onSaved:()=>{}},'FlowEditor');
  assert.equal(html.includes('value="not_filed"'),!requiresFilingMethod);
  if(requiresFilingMethod)assert.match(html,/<option value="" disabled="" selected="">/);
  else assert.match(html,/<option value="not_filed" selected="">/);
  for(const value of ['paper','efiling_v3','efiling_v4'])assert.ok(html.includes('value="'+value+'"'));
  assert.equal(html.includes(detailText('Filing method not specified',locale)),requiresFilingMethod);
 }
 const src=A.read('app/cases/[id]/CaseFlow.tsx');
 assert.match(src,/requiresFilingMethod=\{courtRecorded\|\|datedCourtEvent\}/);
 assert.match(src,/\.from\('case_timeline'\)\.select\('id'\)\.eq\('case_id',caseId\)\.is\('deleted_at',null\)\.in\('event_type',\['filing','hearing'\]\)\.not\('event_date','is',null\)\.limit\(1\)/);
 assert.match(src,/if\(events.error\)throw events.error/);
 assert.match(A.read('app/cases/[id]/page.tsx'),/<CaseFlow caseRecord=\{caseItem\}/);
});

test('approved operational stage terminology is display-only; immutable stages/history remain exact',()=>{
 const {flowStageTitle}=require('../../app/cases/[id]/flow-model.ts');const before=JSON.stringify(data);
 const defence=data.stages.find(s=>s.stage_key==='defence');
 assert.equal(flowStageTitle(defence,'th'),'รอคำให้การจำเลย / นัดแรก');assert.equal(flowStageTitle(defence,'en'),'Await defendant’s answer / first hearing');
 for(const lang of ['th','en']){
  const view=f.render(lang,{}, {data,canTransition:true,onEdit:()=>{}},'FlowView');assert.ok(view.includes(flowStageTitle(defence,lang)));
  const editor=f.render(lang,{}, {action:'advance',data,caseId:1,onClose:()=>{},onSaved:()=>{}},'FlowEditor');assert.ok(editor.includes(flowStageTitle(defence,lang)));
 }
 assert.equal(JSON.stringify(data),before);assert.equal(defence.title_th,'รอคำให้การ / นัดแรก');
});
