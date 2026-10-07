/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {createClient}=require('@supabase/supabase-js');
const {readLegacyMatters,readLegacyDetail,legacyArchiveExcludedMatterIds}=require('../../lib/advisory-legacy-archive.ts');
const {useI18n}=require('../../lib/i18n/provider.tsx');
const {messages}=require('../../lib/i18n/catalog.ts');
function backend({count=2,denied=false,fail=false}={}){
 const calls=[];const rows=Array.from({length:count},(_,i)=>({id:'old-'+i,title:'Original matter '+i,matter_no:'ADV-OLD-'+i,status:'active',client_id:'client',client:{name:'Historical client'},created_at:'2026-01-01',hasControl:i===1,hasSnapshot:false,archived:true}));
 rows.push({id:'new',title:'New matter with no snapshot',newCreate:true,hasSnapshot:false});
 for(const id of legacyArchiveExcludedMatterIds)rows.push({id,title:'UAT without create evidence',newCreate:false,archived:true});
 const children={advisory_issues:[{id:'issue',advisory_matter_id:'old-0',title:'Historical issue',next_action:'Original issue next action',deleted_at:'2026-01-02'}],advisory_issue_tasks:[{id:'task',advisory_matter_id:'old-0',advisory_issue_id:'issue',title:'Task added from New UI',status:'pending'}],advisory_time_logs:[{id:'time',advisory_matter_id:'old-0',advisory_issue_id:'issue',minutes:90,note:'Preserved time',deleted_at:'2026-01-02'}],advisory_advice_records:[{id:'advice',advisory_matter_id:'old-0',advisory_issue_id:'issue',question:'Original question',advice_given:'Original advice'}],case_audit_logs:[]};
 const db=createClient('https://archive-test.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
  const u=new URL(input),table=u.pathname.split('/').pop();calls.push({table,method:init.method,query:u.searchParams});
  assert.equal(init.method,table==='advisory076_allowed'?'POST':'GET','No mutation is allowed');
  if(table==='advisory076_allowed')return Response.json(!denied);
  if(fail)return Response.json({message:'Evidence unavailable'},{status:503});
  let data;
  if(table==='advisory_matters'){
   assert.match(u.searchParams.get('select'),/new_creation:advisory_matter_activities\(\)/);
   assert.equal(u.searchParams.get('new_creation.kind'),'eq.create');assert.equal(u.searchParams.get('new_creation'),'is.null');
   assert.equal(u.searchParams.get('id')?.startsWith('not.in.'),true);
   const excluded=u.searchParams.get('id').slice(8,-1).split(',');
   const exactId=u.searchParams.getAll('id').find(v=>v.startsWith('eq.'));
   data=rows.filter(r=>!excluded.includes(r.id)&&!r.newCreate&&(!exactId||'eq.'+r.id===exactId));
  }else{data=children[table];assert.ok(data,'Unexpected read '+table);}
  const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||1000);data=data.slice(offset,offset+limit);
  const accept=new Headers(init.headers).get('accept');return Response.json(accept?.includes('vnd.pgrst.object')?data[0]??null:data);
 }}});return {db,calls};
}
test('Matter origin query excludes New creation and retains an adopted Legacy matter; no snapshot/date/number cutoff',async()=>{
 const {db,calls}=backend();assert.deepEqual((await readLegacyMatters(db)).map(r=>r.id),['old-0','old-1']);
 assert.deepEqual(calls.map(c=>c.table),['advisory076_allowed','advisory_matters']);
});
test('archive listing paginates beyond server page size without dropping origin evidence',async()=>{
 const {db,calls}=backend({count:501});assert.equal((await readLegacyMatters(db)).length,501);assert.equal(calls.filter(c=>c.table==='advisory_matters').length,3);
});
test('permission/evidence failures fail closed, never show all matters',async()=>{
 const b=backend({denied:true});await assert.rejects(readLegacyMatters(b.db),/READ_DENIED/);assert.equal(b.calls.length,1);
 await assert.rejects(readLegacyMatters(backend({fail:true}).db),/READ_FAILED/);
});
test('New-origin deep link cannot load related Legacy records',async()=>{
 const {db,calls}=backend();assert.equal(await readLegacyDetail(db,'new'),null);assert.equal(calls.length,2);
});
test('Legacy detail retains all children, including New-added Task and deleted history, without origin inference',async()=>{
 const {db,calls}=backend();const d=await readLegacyDetail(db,'old-0');assert.ok(d);assert.equal(d.records.tasks[0].title,'Task added from New UI');assert.equal(d.records.time[0].minutes,90);assert.ok(d.records.time[0].deleted_at);assert.equal(d.records.issues[0].next_action,'Original issue next action');
 for(const c of calls.filter(c=>Object.keys(d.records).some(k=>({issues:'advisory_issues',tasks:'advisory_issue_tasks',time:'advisory_time_logs',advice:'advisory_advice_records'})[k]===c.table))){assert.equal(c.query.get('advisory_matter_id'),'eq.old-0');assert.equal(c.query.has('deleted_at'),false);}
});
const shared={useAdvisoryLabels(){const i=useI18n();return {...i,a:k=>i.t('advisory.'+k),label:v=>messages['advisory.enum.'+v]?i.t('advisory.enum.'+v):v};}};
const archive=workspaceFixture('app/advisory/archive/LegacyArchive.tsx',[],{'../control/shared':shared,'next/navigation':{useParams:()=>({id:'old-0',issueId:'issue'})}});
for(const locale of ['th','en'])test(locale+': archive/issue display preserves history and has no mutation forms or controls',async()=>{
 const d=await readLegacyDetail(backend().db,'old-0');for(const view of ['matter','issue']){
  const html=archive.render(locale,{'LegacyArchive.state':{detail:d}},{view});
  assert.ok(html.includes(locale==='th'?'ข้อมูลระบบเก่า — อ่านอย่างเดียว':'Legacy Data — Read Only'));assert.match(html,/Task added from New UI/);assert.match(html,/Preserved time/);assert.match(html,/Original advice/);assert.match(html,/Original issue next action/);
  assert.doesNotMatch(html,/<form|<textarea|type="submit"|contenteditable|>Restore<|>Add Time<|>Add Issue<|>Close Issue<|>Reopen/);
  assert.doesNotMatch(html,/onClick=/);assert.ok(html.includes(locale==='th'?'ลบแล้ว (ประวัติ)':'Deleted (history)'));
 }
});
test('create witness and private request are atomic from 076 through current 087; no ordinary write access',()=>{
 for(const file of ['202607180076_non_litigation_matter_control_core.sql','202607180077_non_litigation_operational_workflow.sql','202609300081_advisory_create_initial_stage.sql','202610010086_advisory_flexible_journey.sql','202610020087_advisory_controlled_journey.sql']){
  const s=fs.readFileSync('supabase/migrations/'+file,'utf8');const body=s.slice(s.indexOf('FUNCTION public.advisory_control_write')>=0?s.indexOf('FUNCTION public.advisory_control_write'):s.indexOf('function public.advisory_control_write'));
  assert.match(body,/event_kind:=p_action;/);assert.match(body,/insert into public.advisory_matter_activities/);assert.match(body,/insert into public.advisory_control_requests/);assert.doesNotMatch(body.slice(0,body.indexOf('insert into public.advisory_control_requests')),/exception when/);
 }
});
test('retired routes have no editing imports/handlers; current operational components remain available',()=>{
 for(const path of ['app/advisory/AdvisoryRegister.tsx','app/advisory/[id]/LegacyMatterRecords.tsx','app/advisory/[id]/issues/[issueId]/page.tsx','app/advisory/archive/LegacyArchive.tsx','lib/advisory-legacy-archive.ts'])assert.doesNotMatch(fs.readFileSync(path,'utf8'),/\.insert\(|\.update\(|\.delete\(|\.upsert\(|advisory_control_write|createAuditLog|MatterEditor|FinanceQuotationsSection/);
 assert.doesNotMatch(fs.readFileSync('app/advisory/control/MatterDetail.tsx','utf8'),/tab.records|\/records/);
 assert.doesNotMatch(fs.readFileSync('app/advisory/control/MatterSections.tsx','utf8'),/href=.*\/issues\//);
 assert.equal((fs.readFileSync('app/advisory/control/MatterList.tsx','utf8').match(/href="\/advisory\/records"/g)||[]).length,1);
 assert.match(fs.readFileSync('app/advisory/control/MatterEditor.tsx','utf8'),/advisory_control_write/);assert.match(fs.readFileSync('app/advisory/control/MatterTime.tsx','utf8'),/\.insert\(payload\)/);
});
test('English covers only the translated archive routes and retains unrelated route coverage',()=>{
 const {effectiveUiLocale,uiModule}=require('../../lib/i18n/core.ts');
 for(const route of ['/advisory/records','/advisory/00000000-0000-4000-8000-000000000101/records','/advisory/00000000-0000-4000-8000-000000000101/issues/issue'])assert.equal(effectiveUiLocale('en',route),'en');
 assert.equal(uiModule('/advisory/reports'),'other');assert.equal(uiModule('/finance'),'finance');
});

test('095 UAT identities stay excluded from listing and deep links, including rows without create Activity',async()=>{
 assert.deepEqual([...legacyArchiveExcludedMatterIds],require('./fixtures/advisory-095-reviewed-targets.json').targets.map(t=>t.id));
 for(const id of legacyArchiveExcludedMatterIds){const {db,calls}=backend();assert.equal(await readLegacyDetail(db,id),null);assert.equal(calls.length,2);}
 const {db}=backend();const matters=await readLegacyMatters(db);assert.equal(matters.length,2);assert.ok(matters.every(m=>m.archived));
});
