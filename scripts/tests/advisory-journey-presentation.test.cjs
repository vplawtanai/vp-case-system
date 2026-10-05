/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {stageVisitNumbers,journeyIssues,journeyLayout}=require('../../lib/advisory-journey-presentation.ts');
const definition=require('./fixtures/advisory-controlled-journey.json');
const {journeyText:adminText}=require('../../app/admin/journey-templates/labels.ts');
const {controlledText:t}=require('../../app/advisory/control/controlled-journey-labels.ts');
const stages=definition.stages.map((s,i)=>({...s,id:'stage-'+i,stage_key:s.key,visits:[]}));
const path=[0,1,2,1].map((index,i)=>({id:'visit-'+i,stage_id:'stage-'+index,entered_at:'2026-10-02T01:00:00Z',exited_at:i===3?null:'2026-10-02T02:00:00Z',exit_reason:i===3?null:'completed',kind:'visit'}));
const actual=workspaceFixture('app/advisory/control/JourneyActualMap.tsx');
const route=workspaceFixture('app/advisory/control/JourneyRouteMap.tsx');
const editor=workspaceFixture('app/admin/journey-templates/JourneyRoutingEditor.tsx');
// This contract test explicitly exercises the resolved non-artwork fallback, not pending loading.
const fallback=workspaceFixture('app/advisory/control/StrategicJourneyMap.tsx',[],{'./useJourneyArtwork':{useJourneyArtwork:()=>({asset:null,pending:false})}}).component();
const pending=workspaceFixture('app/advisory/control/StrategicJourneyMap.tsx',[],{'./useJourneyArtwork':{useJourneyArtwork:()=>({asset:null,pending:true})}});
const matter=workspaceFixture('app/advisory/control/ControlledJourney.tsx',[],{'../../components/DetailModal':{default:({children})=>React.createElement('dialog',{open:true},children)},'./StrategicJourneyMap':{default:fallback}});

test('each stage begins at visit 1; loops count only that stage; records stay unchanged',()=>{
 const before=JSON.stringify(path);assert.deepEqual(stageVisitNumbers(path),[1,1,1,2]);assert.equal(JSON.stringify(path),before);assert.deepEqual(stageVisitNumbers([]),[]);
});
test('preview layout retains every stage and derives branches from frozen outcomes without mutation',()=>{
 const before=JSON.stringify(definition),layout=journeyLayout(definition);assert.equal(layout.nodes.length,5);assert.equal(layout.nodes[2].rank,layout.nodes[3].rank);assert.ok(layout.nodes[4].rank>layout.nodes[3].rank);assert.equal(JSON.stringify(definition),before);
});
test('exact stage/outcome diagnostics distinguish invalid targets, unreachable stages, trapped loops and labels',()=>{
 assert.deepEqual(journeyIssues(definition),[]);
 const broken=structuredClone(definition);broken.stages[1].outcomes[1].target='missing';
 assert.ok(journeyIssues(broken).some(i=>i.stage==='review'&&i.outcome===2&&i.problem==='invalidTarget'));
 assert.ok(journeyIssues(broken).some(i=>i.stage==='additional'&&i.problem==='unreachableStage'));
 const trapped=structuredClone(definition);trapped.stages[2].outcomes[0].target='additional';
 assert.ok(journeyIssues(trapped).some(i=>i.stage==='additional'&&i.problem==='noClosingRoute'));
 const names=structuredClone(definition);names.stages[2].name_en='';names.stages[1].outcomes[1].name_th='';
 assert.ok(journeyIssues(names).some(i=>i.stage==='additional'&&i.problem==='missingStageName'));
 assert.ok(journeyIssues(names).some(i=>i.stage==='review'&&i.outcome===2&&i.problem==='missingOutcomeName'));
 assert.deepEqual(journeyIssues({...definition,format:undefined}),[]);
});
for(const locale of ['th','en']){
 test(locale+': pending artwork renders neutral feedback without mounting legacy map or stage detail',()=>{
  const html=pending.render(locale,{}, {snapshot:{definition,version:1},matter:{id:'m'},stages,path,locale,selected:'review',onSelect(){},children:React.createElement('div',null,'LEGACY ARTWORK'),detail:React.createElement('div',null,'FULL DETAIL')});
  assert.match(html,/role="status"/);assert.ok(html.includes(locale==='th'?'กำลังโหลดแผนที่งาน':'Loading journey map'));assert.doesNotMatch(html,/LEGACY ARTWORK|FULL DETAIL/);
 });
 test(locale+': actual map is recorded visits only with per-stage numbering, loop and current state',()=>{
  const html=actual.render(locale,{}, {definition,locale,stages,path,decisions:[],closed:false,selectedVisit:'visit-3',onSelect(){},date:v=>v});
  assert.equal((html.match(/data-current="true"/g)||[]).length,1);assert.equal((html.match(/data-loop="true"/g)||[]).length,1);
  assert.equal((html.match(new RegExp(t(locale,'visit')+' 1','g'))||[]).length,3);assert.equal((html.match(new RegExp(t(locale,'visit')+' 2','g'))||[]).length,1);
  assert.ok(!html.includes(t(locale,'skipped')));assert.ok(html.includes(t(locale,'visitHint')));
 });
 test(locale+': possible map shows conditional and loop arrows without inventing skipped visits',()=>{
  const html=route.render(locale,{}, {definition,locale,selected:'review',onSelect(){},matter:true,current:'review',completed:['intake']});
  assert.equal((html.match(/data-route=/g)||[]).length,6);assert.match(html,/data-loop="true"/);assert.ok(html.includes(t(locale,'notActivated')));assert.ok(!html.includes(t(locale,'skipped')));assert.ok(html.includes(t(locale,'possibleHint')));
 });
 test(locale+': exact issue is readable and actionable even when a different stage is selected',()=>{
  const broken=structuredClone(definition);broken.stages[2].outcomes[0].target='additional';
  const html=editor.render(locale,{'JourneyRoutingEditor.selected':'review'},{definition:broken,locale,onChange(){}});
  assert.match(html,/role="alert"/);assert.ok(html.includes(t(locale,'noClosingRoute')));assert.ok(html.includes(definition.stages[2][locale==='en'?'name_en':'name_th']));assert.ok(html.includes(adminText(locale,'completionQuestion')));assert.ok(html.includes(t(locale,'preview')));
 });
 test(locale+': map details use immutable outcome/reason/actor and never execute a write',()=>{
  const decision={id:'decision',actor_id:'actor',occurred_at:'2026-10-02T02:00:00Z',detail:{from_visit_id:'visit-1',outcome:definition.stages[1].outcomes[1],outcome_reason:'Stored <unsafe> reason',actor_name:'Recorded actor'}};
  const html=matter.render(locale,{'ControlledJourney.open':true,'ControlledJourney.selected':'review','ControlledJourney.selectedVisit':'visit-1'},{snapshot:{definition,version:1},matter:{id:'m',matter_no:'SYNTHETIC',stage_key:'review',status:'active'},stages,path,decisions:[decision],people:[],canEdit:true,onEdit(){throw Error('No write');}});
  assert.ok(html.includes('Stored &lt;unsafe&gt; reason'));assert.ok(html.includes('Recorded actor'));assert.ok(html.includes(t(locale,'allRoutes')));assert.ok(html.includes(t(locale,'visitHint')));
 });
}
