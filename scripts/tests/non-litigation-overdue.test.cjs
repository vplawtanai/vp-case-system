/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const shared=workspaceFixture('app/advisory/control/shared.tsx',['Badge','useAdvisoryLabels']);
let state;
const list=workspaceFixture('app/advisory/control/MatterList.tsx',[],{
 './shared':{Badge:shared.component('Badge'),useAdvisoryLabels:shared.useAdvisoryLabels,Pagination:()=>null,usePeople:()=>[],useControl:()=>state},
 './MatterEditor':{default:()=>null},
});
const data={items:[{id:'overdue',matter_no:'ADV-2026-009',status:'active',client_id:'client',client_name:'Synthetic',title:'Overdue matter',matter_type:'general_advisory',stage_days:null,age_days:5,next_due:'2026-09-28'}],total:1,summary:{open:2,overdue:1,overdue_items:1,waiting:0,closed_week:0},permissions:{manage:false}};
for(const locale of ['th','en']){
 test(locale+': only overdue metric is a semantic button with count, localized label and results target',()=>{
  state={data,loading:false,error:false,reload(){}};
  const html=list.render(locale),card=html.match(/<button[^>]*aria-controls="advisory-results"[\s\S]*?<\/button>/)?.[0];
  assert.ok(card);assert.match(card,/type="button"/);assert.match(card,/aria-pressed="false"/);assert.ok(card.includes(translate(locale,'advisory.overdueTotalsOneItem',{matters:1,items:1})));
  assert.ok(card.includes(translate(locale,'advisory.overdue')));assert.equal((html.match(/<article [^>]*data-tone=/g)||[]).length,3);
  assert.equal((html.match(/aria-controls="advisory-results"/g)||[]).length,1);
  assert.doesNotMatch(card,/<(?:a|input|select)\b|disabled/);
 });
 test(locale+': overdue metric and existing tab derive selected state from the same tab value',()=>{
  state={data,loading:false,error:false,reload(){}};
  const active=list.render(locale,{'MatterList.filters':{tab:'overdue'}});
  assert.equal((active.match(/aria-pressed="true"/g)||[]).length,2);
  const closed=list.render(locale,{'MatterList.filters':{tab:'closed'}});
  assert.match(closed,/<button[^>]*aria-pressed="false"[^>]*aria-controls="advisory-results"/);
  assert.equal((closed.match(/aria-pressed="true"/g)||[]).length,1);
 });
 test(locale+': loading hides stale rows and unknown/error metrics cannot be activated',()=>{
  for(const value of [{data,loading:true,error:false},{data:null,loading:false,error:true}]){
   state={...value,reload(){}};const html=list.render(locale);
   assert.match(html,/<button[^>]*aria-controls="advisory-results"[^>]*disabled/);assert.doesNotMatch(html,/ADV-2026-009/);
   if(value.loading){assert.match(html,/id="advisory-results" aria-busy="true"/);assert.ok(html.includes(translate(locale,'advisory.loading')));}
  }
 });
 test(locale+': zero metric safely supports the empty overdue view',()=>{
  state={data:{...data,items:[],total:0,summary:{...data.summary,overdue:0,overdue_items:0}},loading:false,error:false,reload(){}};
  const html=list.render(locale,{'MatterList.filters':{tab:'overdue'}}),card=html.match(/<button[^>]*aria-controls="advisory-results"[\s\S]*?<\/button>/)[0];
  assert.ok(card.includes(translate(locale,'advisory.overdueTotals',{matters:0,items:0})));assert.doesNotMatch(card,/disabled/);assert.ok(html.includes(translate(locale,'advisory.empty')));
 });
}
