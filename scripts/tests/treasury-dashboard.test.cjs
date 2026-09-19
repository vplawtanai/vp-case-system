/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),fs=require('node:fs'),cp=require('node:child_process');
const {fixture}=require('./treasury-dashboard-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const {treasuryOverview,filterMovements,movementDate,movementSource,emptyMovementFilters}=require('../../app/finance/treasury/dashboard.ts');
const {locationKey}=require('../../app/finance/treasury/shared.ts');
const view=workspaceFixture('app/finance/treasury/dashboard-view.tsx',['TreasuryDashboard'],{'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-test-detail':true},children):null}});
const f=fixture();
const render=(locale,data=f,states={})=>view.render(locale,states,{data,isAdmin:true,offset:0,loading:false,busy:false,onPage:()=>{},onOpening:()=>{},onMaterialize:()=>{}},'TreasuryDashboard');
test('Known system total and pending cash use authoritative values; unknown is not zero; source data untouched',()=>{
 const before=JSON.stringify(f),o=treasuryOverview(f);assert.deepEqual(o.balances,[{currency:'THB',amount:49560}]);assert.deepEqual(o.pending,{count:0,totals:[]});assert.equal(o.historical.length,5);
 assert.deepEqual(o.unknown.map(a=>a.name_en),['BAY','KTB']);assert.equal(JSON.stringify(f),before);
 const zero=treasuryOverview({...f,accounts:[{...f.accounts[0],system_balance:0}]});assert.equal(zero.known.length,1);assert.deepEqual(zero.balances,[{currency:'THB',amount:0}]);
 const unknown=treasuryOverview({...f,accounts:[{...f.accounts[0],system_balance:null}]});assert.equal(unknown.known.length,0);assert.deepEqual(unknown.balances,[]);
 assert.equal(treasuryOverview({...f,can_manage:false}).pending,null);
});
test('Presentation totals separate currencies, keep negative known balances, and never add WHT to cash',()=>{
 const d={...f,accounts:[...f.accounts,{...f.accounts[0],currency:'USD',system_balance:-10.01}],pending_sources:[...f.pending_sources,{...f.pending_sources[0],received_on:'2026-09-15',currency:'USD',cash_amount:0.1,wht_amount:999}]};
 assert.deepEqual(treasuryOverview(d).balances,[{currency:'THB',amount:49560},{currency:'USD',amount:-10.01}]);assert.deepEqual(treasuryOverview(d).pending.totals,[{currency:'USD',amount:0.1}]);
});
test('Movement filters use stable account/date/direction values without deriving balances or mutating rows',()=>{
 assert.equal(filterMovements(f.transactions,emptyMovementFilters).length,2);
 assert.equal(filterMovements(f.transactions,{...emptyMovementFilters,account:locationKey(f.accounts[1])}).length,0);
 assert.equal(filterMovements(f.transactions,{...emptyMovementFilters,from:'2026-09-12',to:'2026-09-15'}).length,1);
 const outflow={...f.transactions[0],direction:'outflow',source_snapshot_json:null,occurred_at:'2026-09-17T18:00:00Z'};
 assert.equal(movementDate(outflow),'2026-09-18');assert.equal(movementSource(outflow),null);assert.equal(filterMovements([outflow],{...emptyMovementFilters,direction:'outflow'}).length,1);
 assert.equal(movementSource({...outflow,source_snapshot_json:{schema_version:1}}),null);
});
for(const locale of ['th','en']){
 const t=k=>translate(locale,'treasury.'+k);
 test(`${locale}: owner summary, compact account states, queue/table hierarchy and collapsed maintenance`,()=>{
  const html=render(locale);for(const text of ['49,560.00','29,560.00 THB','20,000.00 THB','10,400.00 THB','19,160.00 THB',t('knownTotal'),t('pendingTotal'),t('unknownAccounts'),t('preCutoff')])assert.ok(html.includes(text),text);
  assert.equal((html.match(/data-balance="unknown"/g)||[]).length,2);assert.equal((html.match(/data-balance="known"/g)||[]).length,2);
  assert.equal((html.match(/<table\b/g)||[]).length,1);assert.ok(html.indexOf('treasury-accounts')<html.indexOf('treasury-pending'));assert.ok(html.indexOf('treasury-pending')<html.indexOf('treasury-movements'));
  assert.equal((html.match(/<details/g)||[]).length,4);assert.doesNotMatch(html,/<details[^>]*\sopen/);assert.doesNotMatch(html,/<pre/);
  const unknownCards=html.match(/<article[^>]*data-balance="unknown"[\s\S]*?<\/article>/g);for(const card of unknownCards){assert.ok(card.includes(t('unknown')));assert.ok(!card.includes('0.00'));assert.ok(card.includes(t('opening')));}
  assert.ok(html.includes(t('replacement')));assert.ok(html.includes('/finance/payments/'+f.pending_sources[0].source_id));
 });
 test(`${locale}: read-only queue restrictions are not displayed as zero; empty and no-known states stay honest`,()=>{
  const readonly=render(locale,{...f,can_manage:false});assert.ok(readonly.includes(t('pendingRestricted')));assert.ok(!readonly.includes('31,409.81'));assert.ok(!readonly.includes(t('replacement')));assert.ok(!readonly.includes(t('materialize')));
  const empty=render(locale,{...f,accounts:[],transactions:[],pending_sources:[]});for(const key of ['noKnown','accountsEmpty','pendingEmpty','empty'])assert.ok(empty.includes(t(key)),key);
 });
 test(`${locale}: Cashbook outflow rendering and technical detail retain original evidence`,()=>{
  const row={...f.transactions[0],direction:'outflow',reference_no:'SYNTHETIC-PAYOUT',source_snapshot_json:null};
  const html=render(locale,{...f,transactions:[row]},{'TreasuryDashboard.detail':row});assert.ok(html.includes(t('outflow')));assert.ok(html.includes('SYNTHETIC-PAYOUT'));assert.ok(html.includes(t('technical')));assert.ok(html.includes(row.id));assert.doesNotMatch(html,/<details[^>]*\sopen/);
 });
}
test('Mutation RPC contracts, modal implementation and navigation wiring remain unchanged',()=>{
 const path='app/finance/treasury/page.tsx',before=cp.execFileSync('git',['show','309b867:'+path],{encoding:'utf8'}),after=fs.readFileSync(path,'utf8');
 const contract=s=>s.slice(s.indexOf(' function close()'),s.indexOf(' return <PageShell'));
 assert.equal(contract(after),contract(before));assert.equal(after.slice(after.indexOf('  <DetailModal open={!!opening}')),before.slice(before.indexOf('  <DetailModal open={!!opening}')));
 const dashboard=fs.readFileSync('app/finance/treasury/dashboard-view.tsx','utf8');assert.doesNotMatch(dashboard,/supabase|\.rpc\(|\.from\(/);
 assert.ok(after.includes('<FinanceSubNav activePage="treasury" permissions={a.permissions} />'));
 for(const file of ['app/finance/finance-sidebar.module.css','app/finance/FinanceSubNav.tsx','app/finance/finance-navigation.ts'])assert.equal(fs.readFileSync(file,'utf8'),cp.execFileSync('git',['show','309b867:'+file],{encoding:'utf8'}));
});
