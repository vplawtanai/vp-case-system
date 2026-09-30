/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const indicators=workspaceFixture('app/advisory/control/MatterOverdue.tsx',['OverdueDays','OverdueIndicator','OverduePreview']);
const shared=workspaceFixture('app/advisory/control/shared.tsx',['Badge','useAdvisoryLabels']);
const overrides={'./shared':{Badge:shared.component('Badge'),useAdvisoryLabels:shared.useAdvisoryLabels,Pagination:()=>null}};
const sections=workspaceFixture('app/advisory/control/MatterSections.tsx',[],overrides);
const overview=workspaceFixture('app/advisory/control/MatterOverview.tsx',[],overrides);
const matter={id:'fixture',matter_no:'ADV-2026-014',status:'active',closed_at:null,stage_key:null,stage_days:null,age_days:4,next_action:null,work_state:null,version:0,
 has_overdue_work:true,overdue_item_count:4,oldest_overdue_days:3,overdue_preview:[
 {source:'task',source_id:'1',title:'Same title',overdue_days:3,assignee_name:'Demo Lawyer',due_date:'2026-09-27'},
 {source:'task',source_id:'2',title:'Same title',overdue_days:2,assignee_name:null,due_date:'2026-09-28'},
 {source:'next_action',source_id:'fixture',title:'Standalone action',overdue_days:1,assignee_name:'Demo Lead',due_date:'2026-09-29'},
 ]};
for(const locale of ['th','en']){
 const a=(k,p)=>translate(locale,'advisory.'+k,p);
 test(locale+': count/oldest indicator comes only from server evidence and exposes keyboard disclosure',()=>{
  const html=indicators.render(locale,{}, {matter,expanded:false,controls:'preview-fixture',onToggle(){}},'OverdueIndicator');
  assert.ok(html.includes(a('overdueItems',{n:4})));assert.ok(html.includes(a('oldestOverdueDays',{n:3})));
  assert.match(html,/type="button"[^>]*aria-expanded="false" aria-controls="preview-fixture"/);
  assert.equal(indicators.render(locale,{}, {matter:{...matter,has_overdue_work:false,overdue_item_count:0},expanded:false,onToggle(){}},'OverdueIndicator'),'');
 });
 test(locale+': compact preview preserves distinct same-title identities, owners and remaining count',()=>{
  const html=indicators.render(locale,{}, {matter},'OverduePreview');
  assert.equal((html.match(/<li>/g)||[]).length,3);assert.equal((html.match(/Same title/g)||[]).length,2);
  assert.ok(html.includes('Demo Lawyer'));assert.ok(html.includes(a('unassigned')));assert.ok(html.includes(a('moreOverdueItem',{n:1})));
  for(const n of [2,3])assert.ok(html.includes(a('overdueDays',{n})));
  assert.ok(html.includes(a('overdueDay',{n:1})));assert.match(html,/href="\/advisory\/fixture"/);
 });
 test(locale+': overdue Task keeps workflow status and replaces normal priority; resolved Task stays resolved',()=>{
  const props={matter,people:[],section:'tasks',overview:true,canEdit:false,canDelete:false,onEdit(){},onAction(){},busy:false,onFocus(){}};
  const base={'MatterSections.loadedKey':JSON.stringify(['fixture',0,'tasks',0,undefined,false]),'MatterSections.total':1};
  const task={id:'task',title:'Overdue task',status:'pending',priority:'normal',due_date:'2026-09-27',overdue_days:3};
  const html=sections.render(locale,{...base,'MatterSections.rows':[task]},props);
  assert.ok(html.includes(a('overdueDays',{n:3})));assert.ok(html.includes(a('enum.pending')));assert.ok(!html.includes(a('enum.normal')));
  const done=sections.render(locale,{...base,'MatterSections.rows':[{...task,status:'completed',completed_at:'2026-09-28',overdue_days:0}]},props);
  assert.ok(done.includes(a('enum.completed')));assert.ok(!done.includes(a('overdueDays',{n:3})));
 });
 test(locale+': Next Action uses supplied overdue days; legacy unset Stage is never invented',()=>{
  const props={matter:{...matter,next_action:'Linked task',next_due:'2026-09-27',next_action_overdue_days:3},canEdit:false,onEdit(){}};
  const html=overview.render(locale,{},props);assert.ok(html.includes(a('overdueDays',{n:3})));assert.ok(html.includes(a('unset')));
  const unset=overview.render(locale,{}, {...props,matter});assert.ok(unset.includes(a('noNext')));assert.ok(!unset.includes(a('overdueDays',{n:3})));
 });
}
