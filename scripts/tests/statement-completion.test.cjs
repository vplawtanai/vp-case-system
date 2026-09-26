/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {loadStatementOverview,overviewTotals}=require('../../app/finance/statement/overview-data.ts');
const {activityOrder,expandOverviewActivity}=require('../../app/finance/statement/overview-activity.ts');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const {fixture:maintenanceFixture}=require('./treasury-dashboard-fixture.cjs');
const options={canCash:true,from:'2026-09-01',to:'2026-09-25',today:'2026-09-25'};
function activityFixture(count=125,transfers=3){
 const calls=[],accounts=[0,1,2].map(i=>({kind:'bank',account_id:'a'+i,bank_account_id:'a'+i,cash_location_id:null,name_th:'Bank '+i,name_en:'Bank '+i,is_active:true}));
 const external=Array.from({length:count},(_,i)=>({id:String(i).padStart(6,'0'),kind:i%2?'payment':'company_purchase',direction:i%2?'inflow':'outflow',cash_amount:100,occurred_at:`2026-09-${String(24-i%20).padStart(2,'0')}T12:00:00+00:00`,confirmed_at:'2026-09-25T12:00:00+00:00',balance:2000,accountIndex:i%3}));
 const legs=Array.from({length:transfers},(_,i)=>['inflow','outflow'].map((direction,j)=>({id:'transfer-'+i+'-'+j,transfer_id:'t'+i,kind:'transfer',direction,cash_amount:30000,occurred_at:'2026-09-25T00:00:00+00:00',confirmed_at:'2026-09-25T01:00:00+00:00',accountIndex:j,balance:2000}))).flat();
 const all=[...external,...legs].sort(activityOrder);
 const read=async(name,args)=>{
  calls.push({name,args});
  if(name==='get_finance_statement_accounts')return {data:{accounts,can_transfer:true,can_manage_openings:true}};
  if(name==='get_finance_treasury')return {data:{accounts:accounts.map(a=>({...a,currency:'THB',opening_id:'opening',opening_as_of:'2026-08-31T16:59:59Z',system_balance:2000}))}};
  if(name==='get_finance_unified_company_statement')return {data:{rows:[],count:1,income:500,expense:70}};
  assert.equal(name,'get_finance_account_statement');
  const rows=all.filter(r=>accounts[r.accountIndex].account_id===args.p_bank&&r.occurred_at.slice(0,10)>=args.p_from&&r.occurred_at.slice(0,10)<=args.p_to);
  const selected=rows.filter(r=>args.p_type==='all'||r.kind==='transfer');
  return {data:{rows:selected.slice(args.p_offset,args.p_offset+50),count:selected.length,inflow:rows.filter(r=>r.direction==='inflow').reduce((s,r)=>s+r.cash_amount,0),outflow:rows.filter(r=>r.direction==='outflow').reduce((s,r)=>s+r.cash_amount,0)}};
 }; return {read,calls,external,legs,all};
}
for(const count of [0,1,10,11,21,175])test(`Activity ${count}: progressive pages, exact count/order, totals and balances independent`,async()=>{
 const f=activityFixture(count,0),data=await loadStatementOverview(f.read,options),before=JSON.stringify(data.accounts),totals=overviewTotals(data.accounts);
 let activity=data.activity;assert.equal(activity.rows.length,Math.min(10,count));assert.equal(activity.count,count);
 if(count>150)assert.equal(f.calls.filter(c=>c.args?.p_type==='all'&&c.args.p_offset>0).length,0,'first render does not fetch entire history');
 while(activity.rows.length<count){const previous=activity,serialized=JSON.stringify(previous);activity=await expandOverviewActivity(f.read,previous);assert.equal(JSON.stringify(previous),serialized,'cursor is immutable');assert.equal(activity.rows.length,Math.min(previous.rows.length+10,count));assert.deepEqual(overviewTotals(data.accounts),totals);}
 assert.deepEqual(activity.rows.map(r=>r.id),f.external.sort(activityOrder).map(r=>r.id));assert.equal(new Set(activity.rows.map(r=>r.id)).size,count);assert.equal(JSON.stringify(data.accounts),before);
 if(count>150)assert.ok(f.calls.some(c=>c.args?.p_type==='all'&&c.args.p_offset===50));
});
test('Transfers appear once with both accounts; no external flow/company/liquidity inflation',async()=>{
 const f=activityFixture(21,3),data=await loadStatementOverview(f.read,options);let activity=data.activity;
 while(activity.rows.length<activity.count)activity=await expandOverviewActivity(f.read,activity);
 const t=overviewTotals(data.accounts);assert.equal(t.internal,90000);assert.equal(t.externalIn,1000);assert.equal(t.externalOut,1100);assert.equal(t.total,6000);assert.ok(!f.calls.some(c=>c.name==='get_finance_unified_company_statement'));
 assert.equal(activity.count,24);assert.equal(activity.rows.filter(r=>r.toAccount).length,3);
 for(const row of activity.rows.filter(r=>r.toAccount)){assert.equal(row.account.account_id,'a1');assert.equal(row.toAccount.account_id,'a0');assert.equal(row.cash_amount,30000);}
});
test('Date reload resets count and visible batch; stale expansion cannot publish',async()=>{
 const f=activityFixture(),data=await loadStatementOverview(f.read,options);const more=await expandOverviewActivity(f.read,data.activity);assert.equal(more.rows.length,20);
 const narrowed=await loadStatementOverview(f.read,{...options,from:'2026-09-20',to:'2026-09-24'});assert.equal(narrowed.activity.rows.length,10);assert.equal(narrowed.activity.count,f.external.filter(r=>r.occurred_at.slice(0,10)>='2026-09-20').length);
 const empty=await loadStatementOverview(f.read,{...options,from:'2026-09-01',to:'2026-09-02'});assert.equal(empty.activity.count,0);
 await assert.rejects(expandOverviewActivity(f.read,more,()=>false),/Stale/);
});
test('Independent pages fail closed on changed count, amounts, duplicate/reordered rows or empty page',async()=>{
 for(const fault of ['count','amount','duplicate','empty']){
  const f=activityFixture(175,0),data=await loadStatementOverview(f.read,options);let activity=data.activity;
  const broken=async(n,a)=>{const result=await f.read(n,a);if(a?.p_offset===50){if(fault==='count')result.data.count++;if(fault==='amount')result.data.inflow++;if(fault==='duplicate')result.data.rows[0]=f.all.find(r=>r.accountIndex===Number(a.p_bank.slice(1)));if(fault==='empty')result.data.rows=[];}return result;};
  await assert.rejects(async()=>{while(activity.rows.length<activity.count)activity=await expandOverviewActivity(broken,activity);},/Activity changed/);
 }
});
test('Ordering keeps PostgreSQL microseconds and stable IDs independent of timezone/locale',()=>{
 const a={id:'a',occurred_at:'2026-09-25T12:00:00.000001Z',confirmed_at:'2026-09-25T12:00:01Z'},b={...a,id:'b',occurred_at:'2026-09-25T19:00:00.000002+07:00'};
 assert.ok(activityOrder(b,a)<0);assert.ok(activityOrder({...a,id:'z'},a)<0);
});
const shared=workspaceFixture('app/finance/statement/shared.ts',['accountHref','accountName','monthRange','bangkokToday']);
const view=workspaceFixture('app/finance/statement/overview.tsx',['StatementOverview'],{'./shared':shared});
const maintenance=workspaceFixture('app/finance/treasury/maintenance-view.tsx',['StatementMaintenanceView']);
for(const locale of ['th','en'])test(`${locale}: counts, show-more, transfer row, controlled maintenance and no legacy dashboard`,async()=>{
 const data=await loadStatementOverview(activityFixture(21).read,options),range=shared.monthRange(),key=`${range.from}:${range.to}:0:true:${shared.bangkokToday()}`;
 const html=view.render(locale,{'StatementOverview.result':{key,data}},{canCash:true},'StatementOverview');
 assert.ok(html.includes(translate(locale,'statement.overview.rowCount',{shown:10,count:24})));assert.ok(html.includes(translate(locale,'statement.overview.showMore')));assert.equal((html.split("<tbody>")[1].split("</tbody>")[0].match(/<tr>/g)||[]).length,10);assert.ok(html.includes('/finance/statement/opening-balances'));assert.doesNotMatch(html,/href="\/finance\/treasury"/);
 const more=await expandOverviewActivity(activityFixture(21).read,data.activity);const expanded=view.render(locale,{'StatementOverview.result':{key,data},'StatementOverview.activityResult':{data,activity:more}},{canCash:true},'StatementOverview');assert.ok(expanded.includes(translate(locale,'statement.overview.rowCount',{shown:20,count:24})));
 const fresh=await loadStatementOverview(activityFixture(21).read,options);const reset=view.render(locale,{'StatementOverview.result':{key,data:fresh},'StatementOverview.activityResult':{data,activity:more}},{canCash:true},'StatementOverview');assert.ok(reset.includes(translate(locale,'statement.overview.rowCount',{shown:10,count:24})), 'returning to an earlier date range resets the batch');
 const f=maintenanceFixture(),m=maintenance.render(locale,{}, {data:f,busy:false,onOpening(){},onMaterialize(){}},'StatementMaintenanceView');
 assert.ok(m.includes(translate(locale,'treasury.opening')));assert.ok(m.includes(translate(locale,'treasury.replacement')));assert.ok(m.includes(translate(locale,'treasury.openingHistory')));assert.ok(m.includes(translate(locale,'statement.receiptMaintenance')));assert.doesNotMatch(m,/<table|data-treasury-summary|treasury-movements|<details[^>]*\sopen/);
 const denied=maintenance.render(locale,{}, {data:{...f,can_manage:false},busy:false},'StatementMaintenanceView');assert.doesNotMatch(denied,/<button|<form/);assert.ok(denied.includes(translate(locale,'treasury.error.permission')));
});
test('Native redirect, no legacy links, original opening/source RPC handlers and modal contracts preserved exactly',()=>{
 assert.match(fs.readFileSync('app/finance/treasury/page.tsx','utf8'),/import \{ redirect \} from "next\/navigation"[\s\S]*redirect\("\/finance\/statement"\)/);
 const before=cp.execFileSync('git',['show','bd3acef:app/finance/treasury/page.tsx'],{encoding:'utf8'}),after=fs.readFileSync('app/finance/treasury/maintenance.tsx','utf8');
 const handlers=s=>s.slice(s.indexOf(' function close()'),s.indexOf(' return <PageShell'));
 assert.equal(handlers(after),handlers(before));assert.equal(after.replace(/<DetailModal variant="(?:detail|source)"/g,'<DetailModal').slice(after.replace(/<DetailModal variant="(?:detail|source)"/g,'<DetailModal').indexOf('  <DetailModal open={!!opening}')),before.slice(before.indexOf('  <DetailModal open={!!opening}')));
 const guard=fs.readFileSync('app/finance/statement/opening-balances/page.tsx','utf8');assert.match(guard,/permissions.canManageFinanceCashTransactions/);
 const files=cp.execFileSync('rg',['--files','app'],{encoding:'utf8'}).split('\n').filter(f=>/\.tsx$/.test(f));
 for(const file of files)assert.doesNotMatch(fs.readFileSync(file,'utf8'),/href=["']\/finance\/treasury/,file);
 const {financeNavigationLinks}=require('../../app/finance/finance-navigation.ts'),{buildPermissions}=require('../../lib/permissions.ts');
 for(const role of ['admin','partner','staff'])assert.ok(financeNavigationLinks(buildPermissions({role})).every(l=>l.href!=='/finance/treasury'));
});
