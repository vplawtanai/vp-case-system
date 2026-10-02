/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {useI18n}=require('../../lib/i18n/provider.tsx'),{messages}=require('../../lib/i18n/catalog.ts');
const definition=require('./fixtures/advisory-controlled-journey.json');
const lib=require('../../lib/advisory-controlled-journey.ts'),{journeyName}=require('../../lib/advisory-flexible-journey.ts');
const {controlledText:t}=require('../../app/advisory/control/controlled-journey-labels.ts');
const shared={useAdvisoryLabels(){const i=useI18n();return{...i,a:(k,p)=>i.t('advisory.'+k,p),label:v=>messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v||'—',date:s=>s};}};
const {journeyText:adminText}=require('../../app/admin/journey-templates/labels.ts');
const editor=workspaceFixture('app/admin/journey-templates/JourneyRoutingEditor.tsx');
const fields=workspaceFixture('app/advisory/control/JourneyOutcomeFields.tsx');
const journey=workspaceFixture('app/advisory/control/ControlledJourney.tsx',[],{'./shared':shared,'../../components/DetailModal':{default:()=>null}});
const stage=definition.stages[1],stages=definition.stages.map((s,i)=>({...s,id:'s'+i,stage_key:s.key,position:i,visits:[],minutes:null}));
const path=[{id:'v1',kind:'visit',stage_id:'s0',entered_at:'2026-10-02T01:00:00Z',exited_at:'2026-10-02T02:00:00Z',exit_reason:'completed'},{id:'v2',kind:'visit',stage_id:'s1',entered_at:'2026-10-02T02:00:00Z',exited_at:null}];
const decision={id:'d1',kind:'stage_complete',actor_id:'actor',occurred_at:'2026-10-02T02:00:00Z',detail:{actor_name:'Frozen actor',from_visit_id:'v1',from_stage:definition.stages[0],target_stage:stage,outcome:definition.stages[0].outcomes[0],outcome_reason:'Stored <script>alert(1)</script> reason'}};
for(const locale of ['th','en']){
 test(locale+': Admin routes, reason requirement and conditional flags are separate from immutable stage labels',()=>{
  const html=editor.render(locale,{'JourneyRoutingEditor.selected':'review'},{definition,locale,onChange(){}});assert.equal((html.match(/<fieldset/g)||[]).length,3);assert.ok(html.includes(adminText(locale,'reasonRequired')));assert.ok(html.includes(t(locale,'conditional')));assert.match(html,/value="additional" selected/);
  const readOnly=editor.render(locale,{'JourneyRoutingEditor.selected':'review'},{definition,locale});assert.ok(readOnly.includes(journeyName(stage.outcomes[1],locale)));assert.doesNotMatch(readOnly,/<input|<select/);
 });
 test(locale+': completion chooses configured outcomes, shows required reason and correct target',()=>{
  const html=fields.render(locale,{}, {outcomes:stage.outcomes,stages:definition.stages,locale,choice:'information',reason:'Evidence',onChoice(){},onReason(){},disabled:false});assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.match(html,/aria-required="true"/);assert.ok(html.includes(journeyName(definition.stages[2],locale)));
  const single=fields.render(locale,{}, {outcomes:definition.stages[0].outcomes,stages:definition.stages,locale,choice:'',reason:'',onChoice(){},onReason(){},disabled:false});assert.doesNotMatch(single,/type="radio"/);assert.ok(single.includes(t(locale,'automatic')));
 });
 test(locale+': actual visits are distinct from possible branches; audit uses stored outcome/reason/actor/time safely',()=>{
  const html=journey.render(locale,{}, {snapshot:{definition,version:1},matter:{stage_key:'review',status:'active',id:'m'},stages,path,decisions:[decision],people:[{id:'actor',full_name:'Synthetic actor'}],canEdit:true,onEdit(){}});
  assert.ok(html.includes(t(locale,'actual')));assert.ok(html.includes(t(locale,'possibleHint')));assert.ok(html.includes('Frozen actor'));assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.equal((html.match(/data-current=/g)||[]).length,2);assert.ok(html.includes(t(locale,'reasonRequired')));
 });
}
test('safe FJ-1 conversion retains names/required flags and one linear route; rules reject disconnected/trapped targets',()=>{
 const old={name_th:'เดิม',name_en:'Old',stages:definition.stages.filter(s=>s.key!=='additional').map(({key,name_th,name_en,required})=>({key,name_th,name_en,required}))};const converted=lib.controlledDraft(old);assert.equal(converted.format,2);assert.equal(lib.routeProblem(converted),null);assert.equal(lib.routeProblem(definition),null);assert.equal(old.format,undefined);
 const bad=structuredClone(definition);bad.stages[2].outcomes[0].target='additional';assert.equal(lib.routeProblem(bad),'routeDisconnected');bad.stages[2].outcomes[0].target='missing';assert.equal(lib.routeProblem(bad),'routeMissing');
 assert.equal(lib.controlledSkipAllowed(definition,'delivery'),true);assert.equal(lib.controlledSkipAllowed({...definition,stages:definition.stages.map(s=>s.key==='review'?{...s,required:false}:s)},'review'),false);
});
test('verifier/artifacts exact; no substitute baseline; PG17/18-safe portable NOT NULL and C order',()=>{
 const G=require('./advisory-controlled-journey-artifacts.cjs');assert.equal(fs.readFileSync(G.candidate,'utf8'),G.migration());assert.equal(fs.readFileSync(G.preflight,'utf8'),G.preflightSql());assert.equal(fs.readFileSync(G.verifier,'utf8'),G.verifierSql(JSON.parse(fs.readFileSync(G.pinsPath))));
 for(const s of [G.preflightSql(),G.verifierSql()]){assert.match(s,/^--[^\n]*\nWITH /);assert.match(s,/a.attnotnull/);assert.match(s,/contype<>'n'/);assert.match(s,/collate "C"/i);assert.doesNotMatch(s,/select public\.advisory_(control_write|journey_manage)\(/i);}assert.match(G.verifierSql(),/'reviewed_baseline_bound',NULL::text/);
});
test('completion form blocks missing outcome/reason and discards an old visit selection after refresh',()=>{
 const React=require('react');let checks={version:1,journey_format:2,outcomes:stage.outcomes,route_stages:definition.stages,current_visit_id:'new-visit',current_stage_key:'review',closed:false,current_stage_open_tasks:0,has_next_action:false};
 const form=workspaceFixture('app/advisory/control/MatterWorkflowDialog.tsx',[],{'./shared':shared,'./workflow-shared':{useWorkflowChecks:()=>({checks,loading:false,error:false}),useMatterWrite:()=>({busy:false,error:'',write(){throw Error('No writes');}})},'../../components/DetailModal':{default:({children})=>React.createElement('section',null,children)}});
 const props={mode:'stage_complete',matter:{id:'m',matter_no:'SYNTHETIC',version:1,stage_key:'review'},onClose(){},onSaved(){},onFinish(){},onTasks(){}};
 for(const state of [{visitId:'new-visit',key:'',reason:''},{visitId:'new-visit',key:'information',reason:''},{visitId:'old-visit',key:'approved',reason:'Earlier choice'}])assert.match(form.render('th',{'MatterWorkflowDialog.decision':state},props),/<button[^>]*type="submit"[^>]*disabled/);
 assert.doesNotMatch(form.render('en',{'MatterWorkflowDialog.decision':{visitId:'new-visit',key:'information',reason:'Evidence'}},props),/<button[^>]*type="submit"[^>]*disabled/);
 checks={...checks,outcomes:definition.stages[0].outcomes};assert.doesNotMatch(form.render('en',{},props),/<button[^>]*type="submit"[^>]*disabled/);
});
