/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadStatementOverview,overviewTotals}=require('../../app/finance/statement/overview-data.ts');
const {expandOverviewActivity,activityOrder}=require('../../app/finance/statement/overview-activity.ts');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const {financeNavigationItems,financeNavigationLinks,activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
const shared=workspaceFixture('app/finance/statement/shared.ts',['accountHref','accountName','monthRange','bangkokToday']);
const overview=workspaceFixture('app/finance/statement/overview.tsx',['StatementOverview'],{'./shared':shared});
const accounts=['KBANK','Future bank'].map((name,i)=>({kind:'bank',account_id:'a'+i,bank_account_id:'a'+i,cash_location_id:null,name_th:name,name_en:name,is_active:true}));
function cashFixture(){
 const calls=[];
 const source=[['payment',10400,'inflow'],['payment',4859.81,'inflow'],['company_purchase',1070,'outflow'],['company_purchase',300,'outflow'],['employee_claim',535,'outflow'],['participant_payout',2493,'outflow'],['participant_payout',1168.22,'outflow'],['tax_remittance',77.10,'outflow']];
 let balance=100000;
 const external=source.map(([kind,cash_amount,direction],i)=>{
  balance=Math.round((balance+(direction==='inflow'?cash_amount:-cash_amount))*100)/100;
  return {id:'cash'+i,account:0,kind,cash_amount,direction,balance,occurred_at:`2026-09-${String(i+1).padStart(2,'0')}T12:00:00Z`,confirmed_at:'2026-09-25T12:00:00Z',vat_amount:70,wht_amount:140.19,economic_amount:1000};
 });
 const closing=balance;
 const legs=['outflow','inflow'].map((direction,account)=>({id:'leg'+account,account,kind:'transfer',transfer_id:'t1',cash_amount:30000,direction,occurred_at:'2026-09-25T12:00:00Z',confirmed_at:'2026-09-25T12:00:01Z',balance:account?80000:closing-30000}));
 const all=[...external,...legs].sort(activityOrder);
 const read=async(name,args)=>{
  calls.push(name);
  if(name==='get_finance_statement_accounts')return {data:{accounts,can_transfer:true,can_manage_openings:true}};
  if(name==='get_finance_treasury')return {data:{accounts:accounts.map((a,i)=>({...a,currency:'THB',opening_id:'o'+i,opening_as_of:'2026-08-31T16:59:59Z',system_balance:i?80000:closing-30000}))}};
  assert.equal(name,'get_finance_account_statement','cash overview never calls an economic, tax or write RPC');
  const rows=all.filter(r=>accounts[r.account].account_id===args.p_bank);
  const selected=rows.filter(r=>args.p_type==='all'||r.kind==='transfer');
  const sum=direction=>rows.filter(r=>r.direction===direction).reduce((n,r)=>n+Math.round(r.cash_amount*100),0)/100;
  return {data:{rows:selected.slice(args.p_offset,args.p_offset+50),count:selected.length,inflow:sum('inflow'),outflow:sum('outflow')}};
 };
 return {read,calls,external,closing};
}
const options={canCash:true,from:'2026-09-01',to:'2026-09-25',today:'2026-09-25'};
test('Gross purchase, net cash receipt/payout, later remittance and opening balances stay actual money',async()=>{
 const f=cashFixture(),data=await loadStatementOverview(f.read,options),totals=overviewTotals(data.accounts);
 assert.deepEqual(totals,{total:159616.49,bank:159616.49,cash:0,externalIn:15259.81,externalOut:5643.32,internal:30000,unknown:0});
 assert.equal(data.accounts.find(a=>a.account.account_id==='a0').current.closing,79616.49);assert.equal(data.company,undefined);
 const final=await expandOverviewActivity(f.read,data.activity);assert.deepEqual(overviewTotals(data.accounts),totals);
 assert.equal(final.count,9);assert.equal(final.rows.filter(r=>r.toAccount).length,1);
 for(const original of f.external)assert.equal(final.rows.find(r=>r.id===original.id).cash_amount,original.cash_amount);
 assert.ok(!f.calls.some(name=>/company_statement|tax_position|save|confirm|create/.test(name)));
});
for(const locale of ['th','en'])test(`${locale}: money-only overview and shared desktop/mobile navigation`,async()=>{
 const data=await loadStatementOverview(cashFixture().read,options),range=shared.monthRange();
 const key=`${range.from}:${range.to}:0:true:${shared.bangkokToday()}`;
 const html=overview.render(locale,{'StatementOverview.result':{key,data}},{canCash:true},'StatementOverview');
 for(const message of ['statement.income','statement.expense','statement.overview.economic','statement.overview.viewCompany','statement.unclassified'])assert.ok(!html.includes(translate(locale,message)),message);
 for(const message of ['statement.overview.liquidity','statement.overview.externalIn','statement.overview.externalOut','statement.overview.internal','statement.manageOpenings'])assert.ok(html.includes(translate(locale,message)),message);
 assert.doesNotMatch(html,/company-economics|economic-heading|href="\/finance\/statement\/company"/);
 for(const profile of [{role:'admin'},{role:'partner'},{role:'staff'},{role:'staff',can_view_finance_cash_transactions:true},{role:'staff',can_view_finance_payments:true}]){
  const p=buildPermissions(profile),items=financeNavigationItems(p,locale),group=items.find(i=>i.group==='statement');
  assert.equal(Boolean(group),p.canViewFinanceCashTransactions);
  assert.ok(!financeNavigationLinks(p,locale).some(l=>l.href==='/finance/statement/company'));
  const nav=workspaceFixture('app/finance/FinanceSidebar.tsx',['FinanceSidebar'],{'./statement/navigation':{StatementAccountNavigation:({enabled})=>enabled?require('react').createElement('a',{href:shared.accountHref(accounts[1])},accounts[1].name_en):null}});
  const sidebar=nav.render(locale,{}, {permissions:p,pathname:'/finance/statement',onNavigate(){}},'FinanceSidebar');
  assert.doesNotMatch(sidebar,/\/finance\/statement\/company/);
  assert.equal(sidebar.includes(shared.accountHref(accounts[1])),p.canViewFinanceCashTransactions);
 }
});
test('Retired bookmarks redirect, account routes keep their read contract and management paths stay protected',()=>{
 for(const path of ['app/finance/treasury/page.tsx','app/finance/statement/company/page.tsx']){
  const route=workspaceFixture(path,[],{'next/navigation':{redirect:href=>{throw Error('redirect:'+href);}}});
  assert.throws(()=>route.render('th'),/redirect:\/finance\/statement$/);
 }
 assert.equal(activeFinancePage('/finance/statement/company','quotations'),'statement');
 const index=fs.readFileSync('app/finance/statement/page.tsx','utf8');assert.match(index,/permissions.canViewFinanceCashTransactions/);assert.doesNotMatch(index,/canViewFinancePayments/);
 const files=['app/finance/statement/account/[kind]/[id]/page.tsx','app/finance/statement/transfers/page.tsx','app/finance/statement/opening-balances/page.tsx'];
 for(const file of files)assert.ok(fs.existsSync(file),file);
 assert.match(fs.readFileSync(files[0],'utf8'),/<UnifiedStatement[^\n]+account=\{account\}/);
 assert.match(fs.readFileSync(files[2],'utf8'),/permissions.canManageFinanceCashTransactions/);
 const economic=fs.readFileSync('app/finance/statement/workspace.tsx','utf8');assert.match(economic,/get_finance_unified_company_statement/);
 const classification=fs.readFileSync('app/finance/expenses/economics.tsx','utf8');for(const value of ['COMPANY_COST','CLIENT_RECOVERABLE','UNCLASSIFIED'])assert.ok(classification.includes(value));
});
