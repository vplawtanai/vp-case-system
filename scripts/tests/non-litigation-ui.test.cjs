/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const React=require('react');const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {useI18n}=require('../../lib/i18n/provider.tsx'),{messages,translate}=require('../../lib/i18n/catalog.ts');
const model=require('../../lib/advisory-control.ts');
const shared={useAdvisoryLabels(){const i=useI18n();return {...i,a:(key,p)=>i.t('advisory.'+key,p),label:v=>messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v};},Badge:({value})=>React.createElement('span',null,value),Pagination:()=>null};
const journey=workspaceFixture('app/advisory/control/Journey.tsx',['Journey'],{'./shared':shared});
const editor=workspaceFixture('app/advisory/control/MatterEditor.tsx',['MatterEditor'],{'./shared':shared,'../../components/DetailModal':{default:({children,title})=>React.createElement('section',{'aria-label':title},children)}});
const sections=workspaceFixture('app/advisory/control/MatterSections.tsx',['MatterSections'],{'./shared':shared});
const matter={id:'synthetic',matter_type:'legacy arbitrary text',stage_key:null,closed_at:null,next_action:null,next_owner_name:null,next_due:null,version:0};
for(const locale of ['th','en']){
 const a=k=>translate(locale,'advisory.'+k);
 test(locale+' legacy Journey renders no claimed past visits, dates or current stage',()=>{
  const html=journey.render(locale,{}, {matter,stages:[],canEdit:true,onEdit(){}});
  assert.ok(html.includes(a('unset')));assert.equal((html.match(/<button[^>]*data-state="planned"/g)||[]).length,6);assert.doesNotMatch(html,/<button[^>]*data-state="(?:current|visited)"|NaN|undefined/);
  const readOnly=journey.render(locale,{}, {matter,stages:[],canEdit:false,onEdit(){}});assert.ok(!readOnly.includes('>'+a('activate')+'<'));
 });
 test(locale+' explicit Stage shows separate calendar duration, actual minutes, task completion and safe selected template',()=>{
  const stage={id:'s',stage_key:'analysis',template_key:'general',position:0,minutes:95,elapsed_seconds:172800,task_completed:1,task_total:3,visits:[{kind:'visit',entered_at:'2026-09-20T03:00:00Z',exited_at:null}]};
  const html=journey.render(locale,{}, {matter:{...matter,stage_key:'analysis',entered_at:'2026-09-20T03:00:00Z'},stages:[stage],canEdit:true,onEdit(){}});
  for(const key of ['stageDays','actual','taskCompletion'])assert.ok(html.includes(a(key)));assert.match(html,/95|1 \/ 3/);assert.match(html,/data-state="current"/);
  const modal=editor.render(locale,{}, {request:{action:'stage',title:a('activate'),values:{template:'license',stage_key:'submission'}},matter,people:[],stages:[],onClose(){},onSaved:async()=>{}});assert.ok(modal.includes(translate(locale,'advisory.enum.license')));assert.doesNotMatch(modal,/name="template"/);
 });
 test(locale+' canonical Matter Task UI keeps historical assignee and completion anomaly; permissions hide writes',()=>{
  const task={id:'t',title:'Historical synthetic task',status:'in_progress',priority:'normal',assignee_name:'Original historical name',assignee_user_id:null,completed_at:'2020-01-01',due_date:null,advisory_issue_id:null};
  const props={matter,section:'tasks',people:[],canEdit:false,onEdit(){},onAction:async()=>{},busy:false};
  const html=sections.render(locale,{'MatterSections.rows':[task],'MatterSections.total':1},props);
  assert.ok(html.includes('Original historical name'));assert.ok(html.includes(a('legacyCompletion')));assert.ok(!html.includes('>'+a('setNext')));assert.ok(!html.includes('>'+a('addTask')));
  const form=editor.render(locale,{}, {request:{action:'task_save',title:a('addTask')},matter,people:[],stages:[],onClose(){},onSaved:async()=>{}});
  assert.match(form,/name="issue_id"/);assert.doesNotMatch(form,/name="issue_id"[^>]*required/);assert.match(form,/name="stage_id"/);
 });
}
test('five templates are distinct; unknown free text never maps by title; identity fallback is display-only',()=>{
 assert.deepEqual(Object.values(model.templates).map(x=>x.length),[9,8,7,7,6]);assert.equal(model.defaultTemplate('contract_review'),'contract');assert.equal(model.defaultTemplate('license_regulatory'),'license');assert.equal(model.defaultTemplate('สัญญา licensing'),'general');
 assert.equal(model.personName([],null,'Ambiguous historical name'),'Ambiguous historical name');assert.equal(model.personName([{id:'a',staff_name:'Real',full_name:'Person'}],'a','Old'),'Real');
 assert.equal(model.stageState({stage_key:'intake',visits:[]},null,false),'planned');assert.equal(model.stageState({stage_key:'intake',visits:[{kind:'skip'}]},null,false),'skipped');
});
test('new UI labels and enum options have complete TH/EN messages; no Finance writes in control UI',()=>{
 const keys=require('../../lib/i18n/messages/advisory-control.ts').advisoryControlMessages;
 for(const [key,v]of Object.entries(keys))for(const lang of ['th','en'])assert.ok(v[lang]&&translate(lang,key)!==key,key);
 for(const value of [...model.types,...model.workStates,...Object.keys(model.templates),...Object.values(model.templates).flat()])assert.ok(keys['advisory.enum.'+value],value);
 for(const file of fs.readdirSync('app/advisory/control').filter(x=>x.endsWith('.tsx'))){const s=fs.readFileSync('app/advisory/control/'+file,'utf8');assert.doesNotMatch(s,/from\(['"]finance_|rpc\(['"](?:create|update|confirm)_finance/);}
});
