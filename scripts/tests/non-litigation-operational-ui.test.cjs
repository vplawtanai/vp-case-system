/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react');const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {useI18n}=require('../../lib/i18n/provider.tsx'),{messages,translate}=require('../../lib/i18n/catalog.ts');
const {controlTicket,matterClosed,teamConflict,timeMinutes,workflowErrors}=require('../../lib/advisory-workflow.ts');
const {errorKey}=require('../../lib/advisory-control.ts');
const shared={useAdvisoryLabels(){const i=useI18n();return {...i,a:(k,p)=>i.t('advisory.'+k,p),label:v=>messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v||'—'};},Badge:({value})=>React.createElement('span',{'data-status':value},value)};
const dialog={default:({title,children})=>React.createElement('section',{'aria-label':title},children)};
const matter={id:'matter',matter_no:'ADV-DEMO',client_id:'client',version:2,status:'active',closed_at:null,stage_key:'analysis',matter_type:'general_advisory',stage_days:2,age_days:10,work_state:'working',lead_name:'Lead',next_owner_name:'Actor',next_action:'Actual next task',next_due:'2026-10-01'};
let checkValues={version:2,closed:false,current_visit_id:'visit',current_stage_key:'analysis',current_stage_open_tasks:0,open_tasks:0,has_next_action:false,pending_deliverables:0,uncompleted_stages:0,stage_ready:true,ready_to_close:true};
const hooks={useMatterWrite:()=>({busy:false,error:'',write(){throw Error('SSR never writes');}}),useWorkflowChecks:()=>({checks:checkValues,loading:false,error:false,reload(){}})};
const workflow=workspaceFixture('app/advisory/control/MatterWorkflowDialog.tsx',[],{'./shared':shared,'./workflow-shared':hooks,'../../components/DetailModal':dialog});
const overview=workspaceFixture('app/advisory/control/MatterOverview.tsx',[],{'./shared':shared});
const team=workspaceFixture('app/advisory/control/MatterTeam.tsx',['TeamDialog'],{'./shared':shared,'./workflow-shared':hooks,'../../components/DetailModal':dialog});
const props={matter,onClose(){},onSaved(){},onFinish(){},onTasks(){}};
for(const locale of ['th','en']){const a=k=>translate(locale,'advisory.'+k);
 test(locale+': current actor is derived separately from lead, empty next action has explicit CTA',()=>{
  const html=overview.render(locale,{}, {...props,canEdit:true,onEdit(){}});assert.match(html,/>Lead</);assert.match(html,/>Actor</);assert.ok(html.includes(a('completeStage')));
  const empty=overview.render(locale,{}, {...props,matter:{...matter,next_action:null,next_owner_name:null},canEdit:true,onEdit(){}});assert.ok(empty.includes(a('setNextAction')));assert.ok(empty.includes(a('unassigned')));
 });
 test(locale+': blocked stage, stale read and unresolved next action fail closed; ready stage can advance',()=>{
  for(const changes of [{current_stage_open_tasks:2},{version:1},{has_next_action:true}]){checkValues={...checkValues,version:2,current_stage_open_tasks:0,has_next_action:false,...changes};const html=workflow.render(locale,{}, {...props,mode:'stage_complete'});assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);if(changes.current_stage_open_tasks){assert.ok(html.includes(a('stageBlocked')));assert.ok(html.includes(a('stageTasksPending')));assert.ok(!html.includes(a('stageTasksClear')));}}
  checkValues={...checkValues,version:2,current_stage_open_tasks:0,has_next_action:false};const html=workflow.render(locale,{}, {...props,mode:'stage_complete'});assert.doesNotMatch(html,/<button[^>]*type="submit"[^>]*disabled/);
 });
 test(locale+': successful closing requires actual readiness; exceptional close requires resolution; reopen requires reason',()=>{
  checkValues={...checkValues,ready_to_close:false,open_tasks:2,has_next_action:true,stage_ready:false};const html=workflow.render(locale,{}, {...props,mode:'close'});assert.ok(html.includes(a('closeBlocked')));assert.ok(html.includes(a('tasksPending')));assert.ok(html.includes(a('nextPending')));assert.ok(!html.includes(a('tasksClear')));assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);
  const exceptional=workflow.render(locale,{'MatterWorkflowDialog.outcome':'client_stopped'},{...props,mode:'close'});assert.match(exceptional,/<textarea[^>]*name="unresolved_reason"[^>]*required/);
  const reopen=workflow.render(locale,{}, {...props,mode:'reopen'});assert.match(reopen,/<textarea[^>]*name="reason"[^>]*required/);assert.ok(reopen.includes(a('reopenHint')));
 });
 test(locale+': team edit retains identity and duplicate person/role cannot submit',()=>{
  const member={user_id:'p',team_role:'co_work',name:'Person'},roster=[member,{user_id:'p',team_role:'qa',name:'Person'}];
  const html=team.render(locale,{'TeamDialog.role':'qa'},{...props,edit:{mode:'edit',member},team:roster,people:[{id:'p',role:'lawyer',full_name:'Person'}]},'TeamDialog');assert.ok(html.includes(a('duplicateMember')));assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);assert.doesNotMatch(html,/role="combobox"/);
 });
 test(locale+': all workflow business guards have localized nontechnical messages',()=>{for(const [code,key]of Object.entries(workflowErrors)){assert.equal(errorKey('ADVISORY_'+code),key);assert.ok(messages['advisory.'+key]?.[locale],key);assert.doesNotMatch(a(key),/ADVISORY_|advisory\./);}});
}
test('retry ticket is stable only for the same matter/action/body/version',()=>{let n=0;const next=()=>String(++n),p={visit_id:'visit',resolve_next_action:true},one=controlTicket(null,'matter','stage_complete',p,2,next);assert.equal(controlTicket(one,'matter','stage_complete',p,2,next),one);for(const args of [['other','stage_complete',p,2],['matter','close',p,2],['matter','stage_complete',{...p,resolve_next_action:false},2],['matter','stage_complete',p,3]])assert.notEqual(controlTicket(one,...args,next).id,one.id);});
test('legacy closed lifecycle is closed even without a control timestamp; waiting is not closed',()=>{for(const status of ['completed','cancelled'])assert.equal(matterClosed({status,closed_at:null}),true);for(const status of ['active','waiting'])assert.equal(matterClosed({status,closed_at:null}),false);});
test('same person may hold distinct roles; exact duplicate is rejected',()=>{const t=[{user_id:'p',team_role:'assistant'}];assert.equal(teamConflict(t,'p','assistant'),true);assert.equal(teamConflict(t,'p','qa'),false);assert.equal(teamConflict(t,'other','assistant'),false);});
test('time input computes actual minutes; rejects empty, fractional, negative and nonnumeric duration',()=>{assert.equal(timeMinutes('2','30'),150);assert.equal(timeMinutes('0','1'),1);assert.equal(timeMinutes('25','0'),1500);for(const pair of [['0','0'],['-1','30'],['1','60'],['1.5','0'],['abc','1']])assert.equal(timeMinutes(...pair),null);});
const timeSummary=workspaceFixture('app/advisory/control/MatterTimeSummary.tsx',[],{'./shared':shared});
const time=workspaceFixture('app/advisory/control/MatterTime.tsx',['TimeDialog'],{'./MatterTimeSummary':{default:timeSummary.component('MatterTimeSummary')},'./shared':shared,'../../components/DetailModal':dialog});
for(const locale of ['th','en']){const a=k=>translate(locale,'advisory.'+k);
 test(locale+': add time derives Matter and current Stage, actor is read-only and override stays secondary',()=>{const html=time.render(locale,{'TimeDialog.actor':{id:'actor',name:'Actual recorder',email:'test@example.invalid'}},{matter,stages:[{id:'stage',stage_key:'analysis'}],onClose(){},onSaved(){}},'TimeDialog');assert.match(html,/>Actual recorder</);assert.match(html,/<option value="stage" selected/);assert.match(html,/<details/);assert.doesNotMatch(html,/<(?:input|select)[^>]*name="(?:advisory_matter_id|client_id|created_by_user_id)"/);});
 test(locale+': legacy no-stage time remains explicitly labeled without inferred stage',()=>{const html=time.render(locale,{'MatterTime.rows':[{id:'legacy',work_date:'2026-01-01',minutes:90,staff_name:'Legacy recorder',note:'Legacy effort',stage_id:null,billable:false,work_type:'Advisory'}],'MatterTime.loading':false},{matter,stages:[],time:{minutes:90,core:0,support:90,unclassified:1},canAdd:true,focused:true,onFocus(){},onSaved(){}});assert.ok(html.includes(a('legacyNoStage')));assert.match(html,/Legacy effort/);assert.doesNotMatch(html,/records#time/);});
}

test('finishing the last operational stage does not claim that recorded Journey has never started',()=>{for(const locale of ['th','en']){const a=k=>translate(locale,'advisory.'+k);const html=overview.render(locale,{}, {matter:{...matter,stage_key:null},stages:[{id:'s',stage_key:'analysis'}],canEdit:true,onEdit(){},onOpenMap(){}});assert.ok(html.includes(a('noCurrentStage')));assert.ok(!html.includes(a('startStagePlan')));assert.ok(!html.includes(a('unsetStageHelp')));}});
