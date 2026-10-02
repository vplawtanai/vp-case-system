/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {useI18n}=require('../../lib/i18n/provider.tsx'),{messages}=require('../../lib/i18n/catalog.ts');
const {loadStageSkipReasons}=require('../../lib/advisory-skip-reasons.ts');
const shared={useAdvisoryLabels(){const i=useI18n();return {...i,a:(k,p)=>i.t('advisory.'+k,p),label:v=>messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v||'—'};},Badge:({value})=>React.createElement('span',null,value),Pagination:()=>null};
const overview=workspaceFixture('app/advisory/control/MatterJourney.tsx',[],{'./shared':shared,'./Journey':{default:()=>null},'../../components/DetailModal':{default:()=>null}});
const map=workspaceFixture('app/advisory/control/Journey.tsx',[],{'./shared':shared});
const activity=workspaceFixture('app/advisory/control/MatterSections.tsx',[],{'./shared':shared});
const matter={id:'matter-a',version:2,status:'active',stage_key:'intake',template_key:'contract_business_documents',matter_type:'contract_business_documents'};
const skipped={id:'optional-id',stage_key:'review',template_key: matter.template_key,name_th:'ตรวจทาน',name_en:'Review',position:1,required:false,visits:[{kind:'skip'}],minutes:null};
const stages=[{...skipped,id:'first',stage_key:'intake',position:0,required:true,visits:[]},skipped];
const reason='ลูกค้ายืนยันแล้ว / Confirmed\n<script>alert(1)</script>';
const snapshot={version:1,definition:{name_th:'มาตรฐาน',name_en:'Standard'},captured_at:'2026-10-01T00:00:00Z'};
for(const locale of ['th','en']){
 test(locale+': skipped Stage and map show stored reason as escaped multiline text',()=>{
  const props={matter,stages,snapshot,canEdit:false,onEdit(){},compact:true};
  const key=JSON.stringify([matter.id,matter.version,['review'],0]);
  const html=overview.render(locale,{'MatterJourney.reasonState':{key,reasons:{review:reason},error:false}},props);
  const detail=map.render(locale,{}, {...props,initialStage:'review',skipReasons:{review:reason}});
  for(const rendered of [html,detail]){assert.ok(rendered.includes(messages['advisory.fjSkipReason'][locale]));assert.match(rendered,/Confirmed\n&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(rendered,/<script>/);}
  assert.doesNotMatch(map.render(locale,{}, {...props,initialStage:'intake',skipReasons:{review:reason}}),/Confirmed/);
 });
 test(locale+': stale requests, missing legacy reason and read failure remain honest',()=>{
  const props={matter,stages,snapshot,canEdit:false,onEdit(){}};
  const key=JSON.stringify([matter.id,matter.version,['review'],0]);
  const render=state=>overview.render(locale,{'MatterJourney.reasonState':state},props);
  assert.ok(render({key:'old-matter',reasons:{review:'WRONG MATTER'},error:false}).includes(messages['advisory.loading'][locale]));
  assert.ok(!render({key:'old-matter',reasons:{review:'WRONG MATTER'},error:false}).includes('WRONG MATTER'));
  assert.ok(render({key,reasons:{},error:false}).includes(messages['advisory.fjSkipReasonMissing'][locale]));
  const failed=render({key,reasons:{},error:true});assert.match(failed,/role="alert"/);assert.ok(failed.includes(messages['advisory.refresh'][locale]));
 });
 test(locale+': Activity reason cannot be hidden by title/text and retains actor/date/stage',()=>{
  const row={id:'activity',kind:'stage_skip',actor_id:'actor',occurred_at:'2026-10-01T00:00:00Z',detail:{title:'MASKED TITLE',input:{stage_key:'review',reason,text:'MASKED TEXT'}}};
  const html=activity.render(locale,{'MatterSections.rows':[row],'MatterSections.total':1},{matter,stages,section:'activity',people:[{id:'actor',full_name:'Recorded Actor'}],canEdit:false,onEdit(){},onAction(){},busy:false});
  assert.ok(html.includes(messages['advisory.fjSkipReason'][locale]));assert.ok(html.includes('Recorded Actor'));assert.ok(html.includes(locale==='th'?'ตรวจทาน':'Review'));assert.match(html,/Confirmed\n&lt;script&gt;/);assert.doesNotMatch(html,/MASKED|<script>/);
 });
}
test('reason read is caller-scoped, skip-only, paginated and newest evidence wins',async()=>{
 const calls=[],rows=[...Array.from({length:100},(_,i)=>({detail:{input:{stage_key:'review',reason:i?'old':'new'}}})),{detail:{input:{stage_key:'delivery',reason:'later page'}}}];
 const q={select(v){calls.push(['select',v]);return q;},eq(...v){calls.push(['eq',...v]);return q;},order(...v){calls.push(['order',...v]);return q;},async range(a,b){calls.push(['range',a,b]);return{data:rows.slice(a,b+1),error:null};}};
 const client={from(t){calls.push(['from',t]);return q;}};
 const result=await loadStageSkipReasons(client,'matter-a',['review','delivery']);
 assert.deepEqual({...result},{review:'new',delivery:'later page'});
 assert.equal(calls.filter(c=>c[0]==='range').length,2);
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','matter_id','matter-a'])));
 assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','kind','stage_skip'])));
 assert.ok(calls.filter(c=>c[0]==='select').every(c=>c[1]==='detail'));
 assert.deepEqual({...await loadStageSkipReasons({from(){throw Error('unneeded read');}},'matter-a',[])},{});
 q.range=async()=>({data:null,error:Error('denied')});await assert.rejects(loadStageSkipReasons(client,'matter-a',['review']),/denied/);
});
