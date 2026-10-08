/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');
const {buildPermissions}=require('../../lib/permissions.ts'),{canOverview,loadOverview,liquidity,economics,aggregate}=require('../../app/finance/overview/data.ts');
const {fixture,adapter,taxAdapter}=require('./executive-dashboard-fixture.cjs');
const {readTaxMonth,taxMonthSummary}=require('../../app/finance/tax-position/period-data.ts');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const shared=workspaceFixture('app/finance/statement/shared.ts',['accountHref','accountName','bangkokToday']);
const view=workspaceFixture('app/finance/overview/workspace.tsx',['OverviewView'],{'../statement/shared':shared});
const {translate}=require('../../lib/i18n/catalog.ts'),{financeNavigationLinks,financeNavigationItems,activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const p=buildPermissions({role:'admin'}),today='2026-09-25';
async function load(f=fixture(),permissions=p){const a=adapter(f,taxAdapter);const data=await loadOverview(a.client.rpc,permissions,'2026-09',today,()=>readTaxMonth(a.client,permissions,'2026-09'));return{data,a,f};}
function render(data,locale='th'){return view.render(locale,{}, {data,month:'2026-09',today,detail:null,setMonth(){throw Error('No writes');},refresh(){},setDetail(){}},'OverviewView');}
test('Dashboard consumes four 071 summaries and existing economic/tax/Treasury contracts without row aggregation or writes',async()=>{
 const {data,a}=await load();for(const key of ['cash','treasury','economic','receivables','payables','participants','distribution','tax'])assert.equal(data[key].status,'ready',key);
 for(const name of ['cash_flow','receivables','general_payables','unpaid_participants'])assert.equal(a.calls.filter(c=>c.name===`get_finance_${name}_summary`).length,1);
 assert.ok(a.calls.every(c=>c.name.startsWith('get_')));assert.ok(a.calls.every(c=>!c.args?.p_offset));
 assert.equal(liquidity(data.treasury.value,today).totals[0].total,49560);
 assert.deepEqual(economics(data.economic.value),[{currency:'THB',income:2000,expense:1000,net:1000}]);
 assert.equal(data.cash.value.currencies[0].external_outflow,1070);assert.equal(taxMonthSummary(data.tax.value.month).input,70);
 assert.equal(data.payables.value.currencies[0].outstanding_amount,1200);assert.equal(data.participants.value.currencies[0].unpaid_amount,2910);
 assert.equal(data.receivables.value.currencies[0].no_due_date_amount,1500);assert.equal(data.receivables.value.currencies[0].overdue_amount,1000);
});
test('Transfer moves account balance, not total liquidity or 071 external flows; customer WHT stays tax credit',async()=>{
 const first=await load(),f=fixture();f.treasury.accounts[0].system_balance-=100;f.treasury.accounts[1].system_balance+=100;
 const next=await load(f);assert.equal(liquidity(first.data.treasury.value,today).totals[0].total,liquidity(next.data.treasury.value,today).totals[0].total);
 assert.deepEqual(first.data.cash,next.data.cash);assert.equal(taxMonthSummary(next.data.tax.value.month).incoming,560.19);
 assert.equal(next.data.cash.value.currencies[0].external_inflow,10400);
});
test('Separate currencies across balances, economic income, cash and liabilities; unknown opening poisons only its currency',async()=>{
 const f=fixture();f.treasury.accounts.push({...f.treasury.accounts[0],account_id:'usd',currency:'USD',system_balance:25});
 f.rpc.get_finance_company_statement.totals.push({currency:'USD',amount:50});
 f.rpc.get_finance_receivables_summary.currencies.push({...f.rpc.get_finance_receivables_summary.currencies[0],currency:'USD',outstanding_amount:99});
 const {data}=await load(f);assert.deepEqual(liquidity(data.treasury.value,today).totals.map(r=>r.total),[49560,25]);
 assert.deepEqual(economics(data.economic.value),[{currency:'THB',income:2000,expense:1000,net:1000},{currency:'USD',income:50,expense:0,net:50}]);
 f.treasury.accounts[0].opening_id=null;const unknown=await load(f);const total=liquidity(unknown.data.treasury.value,today).totals;
 assert.equal(total[0].total,null);assert.equal(total[0].cash,20000);assert.equal(total[1].total,25);
 assert.match(render(unknown.data,'en'),/Incomplete: some accounts/);assert.match(render(data,'en'),/USD/);
});
test('Failed/malformed/denied reads never appear as zero; no unauthorized aggregate fetch or partial economic result',async()=>{
 for(const name of ['get_finance_cash_flow_summary','get_finance_general_payables_summary','get_finance_unified_company_statement']){const f=fixture();f.fail=name;const {data}=await load(f);assert.match(render(data,'en'),/Data unavailable/);}
 const f=fixture();f.rpc.get_finance_general_payables_summary.currencies[0].outstanding_amount=null;assert.equal((await load(f)).data.payables.status,'error');
 const restricted=buildPermissions({role:'staff',active:true});
 f.rpc.get_finance_expense_access.can_view_all=false;const {data,a}=await load(f,restricted);
 assert.equal(data.economic.status,'denied');assert.equal(data.cash.status,'denied');assert.equal(data.payables.status,'denied');assert.deepEqual(a.calls.map(c=>c.name),['get_finance_expense_access']);
 assert.match(render(data,'en'),/Access to this section is restricted/);
 assert.throws(()=>aggregate({...fixture().rpc.get_finance_cash_flow_summary,currencies:[{currency:'THB'}]},'cash'));
});
test('Empty source sets remain explicit, unresolved distribution basis is unknown, not a partial known total',async()=>{
 const f=fixture();for(const rpc of Object.values(f.rpc))if(rpc.currencies)rpc.currencies=[];
 f.treasury.accounts=[];f.rpc.get_finance_revenue_distribution_workspace.summary[0].unresolved=1;
 const {data}=await load(f);assert.match(render(data,'en'),/No records/);
 assert.match(render(data,'en'),/data-metric="distribution-pending"><div><strong>—<\/strong>/);
});
for(const locale of ['th','en'])test(`${locale} presentation separates 1070 cash / 1000 expense / 70 Input VAT, per-form readiness, navigation and sources`,async()=>{
 const {data}=await load(),html=render(data,locale);
 for(const section of ['cash','economic','receivables','payables','tax','distribution','alerts','trace'])assert.match(html,new RegExp(`data-section="${section}"`));
 for(const [key,value]of Object.entries({'cash-out':'1,070.00','economic-expense':'1,000.00','tax-vat':'630.00','tax-wht':'60.00','tax-credit':'560.19'}))assert.match(html,new RegExp(`data-metric="${key}"><div><strong>${value}`));
 assert.ok(html.includes(translate(locale,'taxHome.dataReady')));assert.ok(!html.includes(translate(locale,'taxHome.ready')));
 assert.ok(!html.includes('987,654,321'));assert.ok(!html.includes('executive.'));assert.ok(!html.includes('Statement — บริษัท'));
 for(const route of ['/finance/statement','/finance/invoices','/finance/expenses','/finance/expenses/claims','/finance/tax-position','/finance/revenue-distribution'])assert.ok(html.includes(`href="${route}"`));
 assert.ok(!html.includes('/credits'));assert.equal((html.match(/<select/g)||[]).length,1);assert.equal((html.match(/<form/g)||[]).length,0);
 const links=financeNavigationLinks(p,locale);assert.ok(links.some(link=>link.href==='/finance/overview'));assert.equal(activeFinancePage('/finance/overview','payments'),'overview');
 assert.ok(financeNavigationItems(p,locale).some(i=>i.group==='statement'));assert.ok(!links.some(i=>i.href==='/finance/statement/company'));
});
test('Existing money-only Statement and Tax/Payables/Distribution implementation stay outside Dashboard writes',()=>{
 const source=fs.readFileSync('app/finance/overview/workspace.tsx','utf8')+fs.readFileSync('app/finance/overview/data.ts','utf8');
 assert.doesNotMatch(source,/supabase\.from\(|\.(insert|update|delete)\(|(?:confirm|create|save)_finance_/);assert.match(source,/readTaxMonth/);assert.match(source,/taxMonthSummary/);assert.match(source,/summarizeDashboard/);
});

const React=require('react');
for(const locale of ['th','en'])test(`${locale}: Finance sidebar hierarchy localizes money navigation and preserves account links`,()=>{
 const accounts=['BAY','KBANK','KTB','cash'].map(id=>({kind:id==='cash'?'cash':'bank',account_id:id,is_active:true,name_th:id==='cash'?'เงินสดสำนักงาน':id,name_en:id==='cash'?'Office Cash':id}));
 const accountNav=workspaceFixture('app/finance/statement/navigation.tsx',['StatementAccountNavigation'],{'./shared':{...shared,useStatementAccounts:()=>({data:{accounts,can_transfer:true},failed:false})}});
 const sidebar=workspaceFixture('app/finance/FinanceSidebar.tsx',['FinanceSidebar'],{'./statement/navigation':{StatementAccountNavigation:accountNav.component('StatementAccountNavigation')}});
 const html=sidebar.render(locale,{}, {permissions:p,pathname:'/finance/statement',onNavigate(){}},'FinanceSidebar');
 assert.match(html,/href="\/finance\/overview" class="finance-sidebar_module_css_overview"/);
 assert.ok(html.includes(locale==='th'?'ภาพรวมการเงิน':'Finance Overview'));
 assert.ok(html.includes(`href="/finance/statement" aria-current="page">${locale==='th'?'ภาพรวมเงิน':'Statement Overview'}</a>`));
 assert.ok(html.includes(`href="/finance/statement/transfers">${locale==='th'?'โอนระหว่างบัญชี':'Transfers'}</a>`));
 for(const a of accounts)assert.ok(html.includes(`href="/finance/statement/account/${a.kind}/${a.account_id}">${locale==='th'?a.name_th:a.name_en}</a>`));
 const order=['incomeGroup','expenseGroup','moneyGroup','taxGroup','legacy'].map(key=>html.indexOf(`data-finance-section="${key}"`));
 assert.ok(order.every((position,index)=>position>=0&&(!index||position>order[index-1])));
 if(locale==='th')assert.doesNotMatch(html,/Statement|Office Cash|Transfers/);
});
const routeGuard=workspaceFixture('app/finance/quotations/shared.tsx',['QuotationGuard']);
function guardedRoute(file,profile,overrides){
 const access={profile,permissions:buildPermissions(profile)};
 return workspaceFixture(file,[],{
  '../quotations/shared':{QuotationGuard:routeGuard.component('QuotationGuard',{'QuotationGuard.loading':false,'QuotationGuard.access':access})},
  ...overrides,
 });
}
for(const locale of ['th','en'])test(`${locale}: management-only Overview menu and direct route share the existing denial pattern`,()=>{
 for(const role of ['admin','partner','lawyer','assistant_lawyer','staff','viewer',''])for(const finance_operator of [false,true]){
  const profile={role,active:true,finance_operator},permissions=buildPermissions(profile),before=JSON.stringify(permissions);
  const allowed=role==='admin'||role==='partner';
  // Even broad operational/account visibility must not grant Overview by itself.
  const custody={...permissions,canViewFinanceCashTransactions:true,expenseAccess:{can_view_accounts:true,can_record:true}};
  assert.equal(canOverview(custody),allowed,role);
  const items=financeNavigationItems(custody,locale);
  assert.equal(items.some(i=>i.page==='overview'),allowed,role);
  assert.deepEqual(items.filter(i=>!['overview','payroll'].includes(i.page)),financeNavigationItems({...custody,role:''},locale));
  let mounts=0;
  const page=guardedRoute('app/finance/overview/page.tsx',profile,{
   './workspace':{ExecutiveOverview:()=>{mounts++;return React.createElement('div',{'data-overview-mounted':true});}},
  });
  const html=page.render(locale);
  assert.equal(mounts,allowed?1:0,role+' must not mount/fetch the dashboard when denied');
  assert.equal(html.includes(translate(locale,'finance.quotation.guard.denied')), !allowed);
  assert.equal(JSON.stringify(permissions),before);
 }
});
test('Inactive or password-change-required management cannot regain Overview through role or Finance flags',()=>{
 for(const role of ['admin','partner'])for(const patch of [{active:false},{active:null},{active:true,must_change_password:true}]){
  const profile={role,finance_operator:true,can_view_finance_cash_transactions:true,...patch};
  const permissions=buildPermissions(profile);
  assert.equal(canOverview(permissions),false);
  assert.equal(financeNavigationLinks(permissions).some(i=>i.page==='overview'),false);
  const page=guardedRoute('app/finance/overview/page.tsx',profile,{'./workspace':{ExecutiveOverview:()=>{throw Error('Unauthorized Overview mounted');}}});
  assert.ok(page.render('en').includes(translate('en','finance.quotation.guard.denied')));
 }
});
test('Operator keeps operational links and KTB-only Statement access when Overview is denied',()=>{
 const profile={role:'lawyer',active:true,finance_operator:true},permissions=buildPermissions(profile);
 assert.equal(canOverview(permissions),false);
 for(const key of ['canViewFinanceQuotations','canManageFinancePayments','canViewFinancePayables','canViewFinanceTaxInvoices','canFileFinanceTax','canViewFinanceCashTransactions','canUseNewFinanceExpenses'])assert.equal(permissions[key],true,key);
 const links=financeNavigationLinks(permissions).map(l=>l.page);
 for(const page of ['quotations','payments','expenses','tax-position','expense-claims'])assert.ok(links.includes(page),page);
 for(const locale of ['th','en'])for(const accountId of ['ktb','kbank','bay']){
  const access={profile,permissions};let mounts=0;
  const page=workspaceFixture('app/finance/statement/account/[kind]/[id]/page.tsx',[],{
   '../../../../quotations/shared':{QuotationGuard:routeGuard.component('QuotationGuard',{'QuotationGuard.loading':false,'QuotationGuard.access':access})},
   'next/navigation':{useParams:()=>({kind:'bank',id:accountId})},
   '../../../shared':{useStatementAccounts:()=>({data:{accounts:[{kind:'bank',account_id:'ktb'}]},failed:false})},
   '../../../workspace':{UnifiedStatement:({account})=>{mounts++;assert.equal(account.account_id,'ktb');return React.createElement('div',null,'KTB');}},
  });
  const html=page.render(locale);
  assert.equal(mounts,accountId==='ktb'?1:0);
  if(accountId!=='ktb')assert.ok(html.includes(translate(locale,'statement.failure')));
 }
});
