/* eslint-disable @typescript-eslint/no-require-imports */
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');const React=require('react');const{workspaceFixture}=require('./i18n-workspace-fixture.cjs');const A=require('./case-core-098-artifacts.cjs');
const{primaryAction,personLabel,coreError}=require('../../app/cases/[id]/core-model.ts');const{detailText}=require('../../app/cases/[id]/labels.ts');
const person={id:'11111111-1111-1111-1111-111111111111',name:'Person',full_name:'Person identity',eligible:true};
const data={core:null,team:[],people:[person],tasks:[]};
const {assignmentPeople,loadAssignmentPeople}=require('../../app/cases/[id]/core-people.ts');
const {filterSearchOptions}=require('../../app/finance/expenses/searchable-combobox.tsx');
test('assignment picker requires classified operational, active, password-ready, assignable internal non-Viewer People',()=>{
 const base={id:person.id,staff_name:'ทนายเป้า',full_name:'นายทดสอบ นามสกุล',active:true,account_type:'operational',assignable:true,must_change_password:false,role:'lawyer'};
 const variations=[{}, {active:false},{account_type:'uat'},{account_type:null},{assignable:false},{must_change_password:true},{must_change_password:null},{role:'viewer'},{role:'external'},{role:'partner'},{role:'staff'}];
 const profiles=variations.map((change,i)=>({...base,id:String(i),...change}));
 const source={...data,people:profiles.map(p=>({...person,id:p.id})),team:[{person_id:'1',team_role:'lead'}]};
 const result=assignmentPeople(source,profiles);
 assert.deepEqual(result.people.filter(p=>p.eligible).map(p=>p.id),['0','9','10']);
 assert.equal(result.people.length,source.people.length,'ineligible historical identities remain readable');
 assert.deepEqual(result.team,source.team);
 assert.equal(assignmentPeople(data,[]).people[0].eligible,false,'missing profile facts fail closed');
 const selected=result.people[0];assert.equal(selected.name,'ทนายเป้า');
 const options=[{value:selected.id,label:{th:personLabel(selected),en:personLabel(selected)},keywords:[selected.name,selected.full_name].join(' ')}];
 for(const query of ['ทนายเป้า','นายทดสอบ','นามสกุล'])assert.equal(filterSearchOptions(options,query).length,1);
 assert.doesNotMatch(options[0].label.th,/@|11111111/);
 const duplicate={...selected,id:'different',full_name:'อีกคน นามสกุลอื่น'};
 assert.notEqual(personLabel(selected,[selected,duplicate]),personLabel(duplicate,[selected,duplicate]));
 assert.equal(assignmentPeople({...source,people:[selected,duplicate]},[base,{...base,id:'different'}]).people.length,2,'never deduplicate by name');
});
test('People enrichment reads only returned IDs through the caller; errors never fall back to broad RPC eligibility',async()=>{
 let selected,ids;
 const client={from(table){assert.equal(table,'user_profiles');return{select(fields){selected=fields;return{in(key,values){assert.equal(key,'id');ids=values;return Promise.resolve({data:[],error:null});}}}}}};
 const result=await loadAssignmentPeople(data,client);
 assert.deepEqual(ids,[person.id]);assert.doesNotMatch(selected,/email|password_hash|\*/);
 assert.equal(result.people[0].eligible,false);
 const denied={from(){return{select(){return{in(){return Promise.resolve({error:new Error('denied')});}}}}}};
 await assert.rejects(loadAssignmentPeople(data,denied),/denied/);
});
test('old assignment stays visible without becoming an eligible new option; Work State has no operational editor or writes',()=>{
 const modal={default:({title,children})=>React.createElement('section',{role:'dialog'},title,children)};
 const f=workspaceFixture('app/cases/[id]/CaseCore.tsx',['CoreEditor'],{'./CaseEditModal':modal,'./CaseSummary':{default:()=>null},'./CaseEngagement':{default:()=>null}});
 const historical={...data,people:[{...person,eligible:false}],team:[{person_id:person.id,team_role:'lead'}],core:{version:1,next_mode:'none',work_state:'waiting_court'}};
 for(const locale of ['th','en']){
  const page=f.render(locale,{'CaseCore.data':historical},{caseId:1,revision:0,canManage:true,canNext:true,onSection:()=>{}});
  assert.match(page,/Person/);assert.ok(!page.includes(detailText('waiting_court',locale)));
  const editor=f.render(locale,{}, {mode:'team',data:historical,caseId:1,onClose:()=>{},onSaved:()=>{}},'CoreEditor');
  assert.ok(editor.includes(detailText('Existing assignment is kept. This person is unavailable for new assignments.',locale)));
  assert.doesNotMatch(editor,/11111111/);
 }
 const source=fs.readFileSync('app/cases/[id]/CaseCore.tsx','utf8');
 assert.doesNotMatch(source,/setWork|work_state\s*:|setEditing\('work'\)|WORK_STATES|from\('case_tasks'\)/);
 const summary=fs.readFileSync('app/cases/[id]/CaseSummary.tsx','utf8');assert.doesNotMatch(summary,/Work state|onWork/);assert.match(summary,/role\.current_actor/);
 const peopleRead=fs.readFileSync('app/cases/[id]/core-people.ts','utf8');
 assert.doesNotMatch(peopleRead,/email|service_role|auth\.users|\.update\(|\.insert\(/);
});
test('artifacts match candidate, preserve 097 SHA and verifier binding is explicit',()=>{assert.equal(A.read(A.candidate),A.migration());assert.equal(A.read('scripts/sql/preflight_case_core_098.sql'),A.gate());assert.equal(A.read('scripts/sql/verify_case_core_098.sql'),A.gate(true));assert.equal(A.hash(A.read('supabase/migrations/202610080097_case_security_parity.sql')),'bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6');const binding=JSON.parse(A.read(A.reviewedPath));assert.deepEqual(Object.keys(binding).sort(),['accepted_contract_sha256','candidate_sha256']);if(binding.candidate_sha256!==null)assert.deepEqual(binding,{candidate_sha256:A.approvedCandidateSha,accepted_contract_sha256:A.acceptedContractSha});assert.equal(A.hash(A.read(A.candidate)),A.approvedCandidateSha);assert.equal(A.additiveApplySql(),true);assert.equal(A.additiveApplySql(A.read(A.candidate)+'\nUPDATE public.cases SET title=title;'),false);assert.doesNotMatch(A.gate()+A.gate(true),/row_fingerprints|rows_sha256|historical_rows_preserved|no_backfill/);});
test('no action is truly empty; linked task facts derive without name identity guessing',()=>{assert.equal(primaryAction(data),null);const task={id:'task',task_type:'อื่นๆ',task_other:'Prepare',assignee_name:'Legacy text',due_date:'2026-10-20',status:'Pending',deleted_at:null};const d={...data,core:{next_mode:'task',next_task_id:'task'},tasks:[task]};assert.deepEqual(primaryAction(d),{title:'Prepare',assignee:'Legacy text',due:'2026-10-20',linked:true});task.status='Done';assert.equal(primaryAction(d),null);task.status='Pending';task.deleted_at='2026-10-08';assert.equal(primaryAction(d),null);assert.equal(personLabel(person),'Person');});
test('empty/assigned core and both operational editors render TH/EN with standard modal and no inferred stage',()=>{const modal={default:({title,children})=>React.createElement('section',{role:'dialog'},title,children)};const f=workspaceFixture('app/cases/[id]/CaseCore.tsx',['CoreEditor'],{'./CaseEditModal':modal,'./CaseSummary':{default:()=>null},'./CaseEngagement':{default:()=>null}});for(const locale of ['th','en']){const html=f.render(locale,{'CaseCore.data':data},{caseId:1,revision:0,canManage:true,canNext:true,onSection:()=>{}});assert.ok(html.includes(detailText('No primary next action',locale)));assert.ok(!html.includes(detailText('Work state',locale)));for(const mode of ['team','next']){const out=f.render(locale,{}, {mode,data,caseId:1,onClose:()=>{},onSaved:()=>{}},'CoreEditor');assert.match(out,/role="dialog"/);assert.ok(out.includes(detailText('Save',locale)));}for(const mode of ['manual','task']){const out=f.render(locale,{'CoreEditor.nextMode':mode},{mode:'next',data,caseId:1,onClose:()=>{},onSaved:()=>{}},'CoreEditor');assert.ok(out.includes(detailText('Due date',locale))||mode==='task');}const readonly=f.render(locale,{'CaseCore.data':data},{caseId:1,revision:0,canManage:false,canNext:false,onSection:()=>{}});assert.ok(!readonly.includes(detailText('Manage team',locale)));assert.ok(!readonly.includes(detailText('Set primary next action',locale)));}});
test('known errors useful in both languages; staff task permission distinct from process permission',()=>{for(const code of ['CASE098_FORBIDDEN','CASE098_STALE','CASE098_INVALID_INPUT','CASE098_PERSON_INELIGIBLE','CASE098_TASK_UNAVAILABLE']){assert.equal(coreError('error '+code),code);assert.notEqual(detailText(code,'en'),code);assert.doesNotMatch(detailText(code,'th'),/CASE098/);}const source=fs.readFileSync('app/cases/[id]/page.tsx','utf8');assert.match(source,/canManage=\{permissions.canEditCaseInfo\}/);assert.match(source,/canNext=\{permissions.canEditTasks\}/);const contract=A.read('scripts/sql/case_core_098_contract.sql');assert.doesNotMatch(contract,/UPDATE public\.(cases|case_tasks)|INSERT INTO public\.case_tasks|UPDATE public\.finance_/);});
