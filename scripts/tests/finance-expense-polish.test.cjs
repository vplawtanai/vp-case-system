/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {fixture}=require('./expense-foundation-fixture.cjs');
const {translate}=require('../../lib/i18n/catalog.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
const {activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const admin=workspaceFixture('app/finance/expenses/admin-tools.tsx',['ExpenseAdminTools']);
const workspace=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseWorkspace','ExpenseClaimList','ExpenseBadge'],{'./data':{},'./forms':{},'./admin-tools':{ExpenseAdminTools:admin.ExpenseAdminTools}});
const groups=workspaceFixture('app/finance/payables/groups.tsx',['PayableGroups']);
const queue=workspaceFixture('app/finance/payables/multi-source.tsx',['MultiSourcePayables'],{'../expenses/workspace':{ExpenseBadge:workspace.ExpenseBadge}});
const nav=workspaceFixture('app/finance/FinanceSidebar.tsx',['FinanceSidebar']);
for(const locale of ['th','en']) {
 const t=k=>translate(locale,'expenses.'+k);
 test(`Expense polish ${locale}: employee list/zero state has own workflow, truthful approval, no tax or Admin controls`,()=>{
  for(const flow of ['claims','claims-empty','claims-finance','claims-admin']){
   const f=fixture(flow),html=workspace.render(locale,{}, {claims:true,fixture:f.data,fixtureLookups:f.lookups},'ExpenseWorkspace');
   for(const key of ['authorities','vatBase','vatAmount','vatRate','eligibility','whtRate','movements'])assert.ok(!html.includes(t(key)),flow+' '+key);
   assert.equal(html.includes(t('adminTools')),flow==='claims-admin');assert.equal(html.includes(t('bridge')),flow==='claims-admin');
   assert.doesNotMatch(html,/<details[^>]*\bopen|<pre/);
   if(flow==='claims-empty'){assert.ok(html.includes(t('noClaims')));assert.ok(html.includes(t('noClaimsHelp')));assert.equal((html.match(/aria-haspopup="dialog"/g)||[]).length,2);}
   else {assert.ok(html.includes('4,500.00 THB'));assert.ok(html.includes('3,725.00 THB'));assert.ok(html.includes(t('awaitingDecision')));assert.ok(html.includes(t('approved')));}
  }
  const empty=workspace.render(locale,{}, {rows:[],canCreate:false,viewAll:false},'ExpenseClaimList');assert.doesNotMatch(empty,/href="\/finance\/expenses\/claims\/new"/);
 });
 test(`Expense polish ${locale}: bridge is Admin-only and authority controls never render on Claim`,()=>{
  const f=fixture('list'),props={access:f.data.access,accounts:f.data.accounts,lookups:f.lookups,run:()=>{throw Error('No mutations');},busy:false,fixture:true,onBridge:()=>{}};
  const claim=admin.render(locale,{}, {...props,showAuthorities:false},'ExpenseAdminTools');assert.ok(claim.includes(t('bridge')));assert.ok(!claim.includes(t('authorities')));assert.doesNotMatch(claim,/<details[^>]*\bopen/);
  assert.ok(admin.render(locale,{},props,'ExpenseAdminTools').includes(t('authorities')));
  for(const access of [{...f.data.access,is_admin:false},fixture('employee').data.access])assert.equal(admin.render(locale,{}, {...props,access},'ExpenseAdminTools'),'');
 });
 test(`Expense polish ${locale}: all nested Finance leaves are active inside named accent sections`,()=>{
  const permissions={...buildPermissions({role:'admin'}),expenseAccess:fixture('list').data.access};
  for(const [path,page] of [['/finance/expenses/a','expenses'],['/finance/expenses/claims/a','expense-claims'],['/finance/payables','payables'],['/finance/receipts/a/preview','receipts']]){
   assert.equal(activeFinancePage(path),page);
   const html=nav.render(locale,{}, {permissions,pathname:path,onNavigate:()=>{}},'FinanceSidebar');
   for(const section of ['incomeGroup','expenseGroup','moneyGroup','taxGroup','legacy'])assert.ok(html.includes(`data-finance-section="${section}"`));
   assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
   assert.equal(html.includes('aria-expanded="true"'),page==='receipts');
  }
 });
 test(`Expense polish ${locale}: stable icon avatars, visible sources and unchanged money/Payout routes`,()=>{
  const f=fixture('queue'),before=JSON.stringify(f),html=groups.render(locale,{}, {groups:f.revenue},'PayableGroups');
  assert.equal((html.match(/data-recipient-kind="person"/g)||[]).length,3);assert.match(html,/lucide-user-round/);assert.match(html,/data-payable-source="revenue_distribution"/);
  for(const group of f.revenue){assert.ok(html.includes('/finance/payouts/new?payee='+group.recipient_id));assert.ok(html.includes(group.open_amount.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})));}
  const external=structuredClone(f.revenue[0]);external.components.forEach(c=>c.recipient_type='payee');assert.match(groups.render(locale,{}, {groups:[external]},'PayableGroups'),/lucide-circle-user-round/);
  const combined=queue.render(locale,{}, {canReadRevenue:true,canReadExpense:true,isAdmin:false,fixture:{revenue:f.revenue,expenses:f.obligations}},'MultiSourcePayables');
  for(const family of ['revenue_distribution','employee_reimbursement','supplier_payable'])assert.ok(combined.includes(`data-source-family="${family}"`));
  assert.match(combined,/data-recipient-kind="supplier"/);assert.match(combined,/lucide-building-2/);assert.ok(combined.includes('20,245.00 THB'));assert.equal(JSON.stringify(f),before);
  const revenue=queue.render(locale,{}, {canReadRevenue:true,canReadExpense:true,isAdmin:false,fixture:{revenue:f.revenue,expenses:[]}},'MultiSourcePayables');
  assert.ok(revenue.includes('5,820.00 THB'));assert.doesNotMatch(revenue,/data-source-family="(?:employee_reimbursement|supplier_payable)"/);
 });
}
test('Expense polish preserves readers, financial helpers, RPCs, migrations and sidebar motion/reveal',()=>{
 const files=['app/finance/expenses/data.ts','app/finance/expenses/shared.ts','app/finance/payables/shared.ts','app/components/sidebar-reveal.ts','app/components/AppSidebar.module.css',...cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n')];
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
 const source=fs.readFileSync('app/finance/payables/groups.tsx','utf8');assert.doesNotMatch(source,/Array\.from\(group\.recipient_name|charAt\(|avatar_url|https:\/\//);
 const css=fs.readFileSync('app/finance/finance-sidebar.module.css','utf8');assert.match(css,/font-size:15px/);assert.match(css,/a\[aria-current\]::before/);
 assert.match(fs.readFileSync('app/finance/expenses/admin-tools.tsx','utf8'),/if \(!access.is_admin\) return null/);
});
