/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{test}=require('node:test');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{monthlyFixture,snapshotFixture}=require('./tax-filing-fixture.cjs'),{adapter}=require('./tax-dashboard-fixture.cjs');
const {readDashboard,summarizeDashboard,summarizeMonthlyTaxFacts}=require('../../app/finance/tax-position/dashboard-data.ts');
const {buildPermissions}=require('../../lib/permissions.ts'),{translate}=require('../../lib/i18n/catalog.ts'),{UiLocaleProvider}=require('../../lib/i18n/provider.tsx');
const {TaxAudit}=require('../../app/finance/tax-position/tax-audit.tsx'),{TreasuryRelationship}=require('../../app/finance/treasury/relationship.tsx'),{treasuryOverview}=require('../../app/finance/treasury/dashboard.ts');
const {fixture:treasuryFixture}=require('./treasury-dashboard-fixture.cjs');
const dashboard=workspaceFixture('app/finance/tax-position/dashboard.tsx',['TaxDashboard'],{'../../components/DetailModal':{default:({open,children})=>open?React.createElement('div',{'data-modal':true},children):null}});
const render=(locale,component)=>renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/finance/tax-position'},component));
for(const locale of ['th','en'])test(`Consolidation ${locale}: four owner cards, no monthly cash/inline register; only Admin can open audit`,async()=>{
 const f=monthlyFixture(),before=JSON.stringify(f),a=adapter(f),admin=buildPermissions({role:'admin'}),data=await readDashboard(a.client,admin,'2026-09');
 const state={'TaxDashboard.month':'2026-09','TaxDashboard.data':data,'TaxDashboard.loading':false};
 for(const role of ['admin','staff','partner']){
  const html=dashboard.render(locale,state,{permissions:buildPermissions({role})},'TaxDashboard');
  assert.equal((html.match(/data-metric=/g)||[]).length,4);assert.doesNotMatch(html,/data-metric="received"|34,419\.81|46,419\.81|taxDetails|<pre|<details/);
  for(const amount of ['49,560.00','700.00','560.19','5,820.00'])assert.ok(html.includes(amount),amount);
  assert.ok(html.includes(translate(locale,'taxDashboard.balanceBasis')));assert.equal(html.includes('href="/finance/treasury"'),buildPermissions({role}).canViewFinanceCashTransactions);
  assert.equal(html.includes(translate(locale,'taxDashboard.adminAudit')),role==='admin');
 }
 const s=summarizeDashboard(data,'2026-09'),facts=summarizeMonthlyTaxFacts(data,'2026-09'),pool=snapshotFixture().pools[0];
 assert.deepEqual([s.outputVat,s.wht,s.outgoingDue],[700,560.19,0]);assert.deepEqual(facts,{outputVat:700,incomingWht:560.19});
 assert.equal(s.outputVat,pool.monthly_facts.output_vat);assert.equal(pool.monthly_facts.net_vat,null);assert.equal(pool.monthly_facts.input_vat_complete,false);assert.equal(pool.ready,false);
 assert.equal(JSON.stringify(f),before);assert.ok(a.calls.every(c=>c.table||['get_finance_treasury','get_finance_tax_position','get_finance_payable_entitlements'].includes(c.rpc)));
 data.register.history=[{id:'private-uuid',fingerprint:'private-fingerprint'}];
 for(const role of ['admin','staff','partner']){
  const html=render(locale,React.createElement(TaxAudit,{permissions:buildPermissions({role}),data,summary:s,month:'2026-09'}));
  if(role!=='admin'){assert.equal(html,'');continue;}
  assert.ok(html.includes('700.00'));assert.ok(html.includes('private-fingerprint'));
  assert.match(html,/<details[\s\S]*<details[\s\S]*<pre/);assert.doesNotMatch(html,/<details[^>]*\sopen|<form|<textarea|type="file"/);
 }
 data.treasury.accounts.forEach(a=>a.system_balance=null);
 const unknown=dashboard.render(locale,state,{permissions:admin},'TaxDashboard');assert.match(unknown,new RegExp('data-metric="treasury">'+translate(locale,'taxDashboard.unavailable')));
});
for(const locale of ['th','en'])test(`Consolidation ${locale}: current Cashbook equation only; historical queue does not alter balances`,()=>{
 const f=treasuryFixture(),before=JSON.stringify(f),o=treasuryOverview(f),html=render(locale,React.createElement(TreasuryRelationship,{data:f}));
 for(const amount of ['49,560.00','20,000.00','29,560.00','0.00'])assert.ok(html.includes(amount));
 assert.doesNotMatch(html,/46,419|16,859|type="month"/);assert.ok(!html.includes(translate(locale,'treasury.monthlyCash')));
 assert.equal(o.eligible.length,0);assert.equal(o.historical.length,5);assert.equal(o.historical.reduce((s,r)=>s+Math.round(r.cash_amount*100),0),3140981);
 assert.equal(o.unknown.length,2);assert.equal(JSON.stringify(f),before);
 const allUnknown=render(locale,React.createElement(TreasuryRelationship,{data:{...f,accounts:f.accounts.map(a=>({...a,system_balance:null}))}}));assert.ok(allUnknown.includes(translate(locale,'treasury.noKnown')));assert.ok(!allUnknown.includes('0.00 THB'));
});
test('Consolidation: applied migrations/readers/sidebar/filing contracts unchanged; no new RPC or audit mutation path',()=>{
 const ref='43c0a61c87f0654d2734221bc690091a5bf64e8e';
 const dirs=['supabase/migrations','app/finance/tax-position/filings','app/finance/payouts','app/finance/payables'];
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only',ref,...dirs],{encoding:'utf8'}).trim().split('\n');
 files.push('app/finance/tax-position/dashboard-data.ts','app/finance/treasury/dashboard.ts','app/finance/treasury/shared.ts','app/components/AppTopNav.tsx','app/components/AppSidebar.module.css','app/components/sidebar-reveal.ts','app/finance/finance-navigation.ts','app/finance/FinanceSidebar.tsx');
 for(const f of files)assert.deepEqual(fs.readFileSync(f),cp.execFileSync('git',['show',ref+':'+f]),f);
 const audit=fs.readFileSync('app/finance/tax-position/tax-audit.tsx','utf8');assert.doesNotMatch(audit,/supabase|\.rpc\(|\.from\(|<form/);
 const page=fs.readFileSync('app/finance/tax-position/page.tsx','utf8');assert.doesNotMatch(page,/<TaxPositionWorkspace|taxDetails=/);
});
