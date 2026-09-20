/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{test}=require('node:test');
require('./receipt-render-fixture.cjs');
const {fixture,expense}=require('./expense-foundation-fixture.cjs'),{workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {expenseSummary,expensePaymentState,pendingExpenseTax,expenseHref}=require('../../app/finance/expenses/shared.ts');
const {buildPermissions}=require('../../lib/permissions.ts'),{financeNavigationItems,financeNavigationLinks,activeFinancePage}=require('../../app/finance/finance-navigation.ts');
const {translate}=require('../../lib/i18n/catalog.ts'),{expenseMessages}=require('../../lib/i18n/messages/expenses.ts');
const list=workspaceFixture('app/finance/expenses/workspace.tsx',['ExpenseList','ExpenseBadge'],{'./data':{},'./forms':{},'./admin-tools':{}});
const multi=workspaceFixture('app/finance/payables/multi-source.tsx',['MultiSourcePayables'],{'../expenses/workspace':{ExpenseBadge:list.ExpenseBadge}});
const forms=workspaceFixture('app/finance/expenses/forms.tsx',['ExpenseFactsForm','ExpenseSettlementForm']);
const nav=workspaceFixture('app/finance/FinanceSidebar.tsx',['FinanceSidebar']);
test('055 expense axes are independent; personally paid is not company paid; waived is not cash; pending tax is unknown',()=>{
 const rows=fixture('list').data.rows,summary=expenseSummary(rows);
 assert.equal(summary.review.count,2);assert.equal(summary.unpaid.count,1);assert.equal(summary.paid.count,1);assert.equal(summary.tax.count,4);
 assert.equal(expensePaymentState(rows[1]),'undecided');assert.equal(expensePaymentState(rows[5]),'no_reimbursement');
 assert.equal(pendingExpenseTax(expense()),true);assert.equal(expensePaymentState({...rows[3],obligation:{...rows[3].obligation,waived:true}}),'waived');
 assert.ok(expenseHref(rows[1]).includes('/claims/'));assert.ok(!expenseHref(rows[0]).includes('/claims/'));
 const partial={...rows[3],obligation:{...rows[3].obligation,gross_amount:1250}};
 assert.equal(expenseSummary([partial]).unpaid.amount,1250,'Use approved liability, not original expense gross');
 assert.equal(expenseSummary([{...rows[4],payout:{...rows[4].payout,gross:1250}}]).paid.amount,1250,'Use confirmed settlement, not original expense gross');
});
for(const locale of ['th','en'])test(`055 ${locale}: real Expense summaries, minimal employee facts, noncash decision and role-aware final navigation`,()=>{
 const f=fixture('list'),t=k=>translate(locale,'expenses.'+k);
 const html=list.render(locale,{}, {rows:f.data.rows,claims:false},'ExpenseList');assert.ok(html.includes('10,700.00'));assert.ok(html.includes(t('no_reimbursement')));assert.doesNotMatch(html,/<pre|type="file"/);
 const employee=fixture('employee'),form=forms.render(locale,{}, {claim:true,access:employee.data.access,accounts:[],lookups:employee.lookups,run:()=>{throw Error('No writes');},busy:false},'ExpenseFactsForm');
 for(const key of ['date','category','amount','description','requested','vatAwareness','whtAwareness'])assert.ok(form.includes(t(key)),key);
 assert.ok(!form.includes(t('personallyPaid')));assert.match(form,/<select[^>]*id="expense-category"/);assert.doesNotMatch(form,/<details[^>]*\bopen/);
 for(const key of ['vatRate','eligibility','whtRate','confirmPayment'])assert.ok(!form.includes(t(key)),key);
 assert.doesNotMatch(form,/<pre|type="file"/);
 const admin={...buildPermissions({role:'admin'}),expenseAccess:f.data.access},items=financeNavigationItems(admin,locale);
 assert.deepEqual(items.map(i=>i.group||i.page),['quotations','fee-agreements','billable-charges','invoices','payments','payment-documents','expenses','expense-claims','payables','treasury','tax-position','legacy']);
 assert.deepEqual(items.at(-1).children.map(i=>i.href),['/finance/expense-claims','/finance/compensation','/finance/ledger']);
 const staff={...buildPermissions({role:'staff',can_submit_expense_claim:true,can_view_own_expense_claims:true}),expenseAccess:employee.data.access};
 assert.deepEqual(financeNavigationLinks(staff,locale).map(l=>l.page),['expense-claims','claims']);
 const custodian={...staff,expenseAccess:{...employee.data.access,can_view_accounts:true}};assert.ok(financeNavigationLinks(custodian,locale).some(l=>l.page==='expenses'));assert.ok(!financeNavigationLinks(custodian,locale).some(l=>l.page==='payables'));
 const sidebar=nav.render(locale,{}, {permissions:admin,pathname:'/finance/receipts/synthetic',onNavigate:()=>{}},'FinanceSidebar');assert.match(sidebar,/aria-expanded="true"/);assert.match(sidebar,/aria-current="page"/);
 assert.equal(activeFinancePage('/finance/expenses/claims/new'),'expense-claims');assert.equal(activeFinancePage('/finance/expenses/synthetic'),'expenses');
});
test('055 actual multi-source queue preserves source identities, canonical recipients and independent currencies',()=>{
 const f=fixture('queue'),before=JSON.stringify(f);
 for(const locale of ['th','en']){
  const html=multi.render(locale,{}, {canReadRevenue:true,canReadExpense:true,isAdmin:false,fixture:{revenue:f.revenue,expenses:f.obligations}},'MultiSourcePayables');
  assert.ok(html.includes('20,245.00 THB'));assert.ok(html.includes('5 '));
  for(const key of ['revenue_distribution','employee_reimbursement','supplier_payable'])assert.ok(html.includes(translate(locale,'expenses.'+key)));
  assert.ok(html.includes('/finance/payouts/new?payee='));assert.ok(html.includes('/finance/expenses/'+f.obligations[0].expense_id+'#payment'));assert.doesNotMatch(html,/<pre/);
  const usd=structuredClone(f.revenue[0]);usd.currency='USD';usd.components.forEach(c=>c.currency='USD');
  const currencies=multi.render(locale,{}, {canReadRevenue:true,canReadExpense:true,isAdmin:false,fixture:{revenue:[usd],expenses:f.obligations}},'MultiSourcePayables');
  assert.ok(currencies.includes('3,104.00 USD'));assert.ok(currencies.includes('14,425.00 THB'));
 }
 assert.equal(JSON.stringify(f),before);
});
test('055 reviewed Input VAT is a separate subtotal, never Output VAT, WHT, cash or complete-period net VAT',async()=>{
 const {fixture:f,adapter}=require('./tax-dashboard-fixture.cjs'),{readDashboard,summarizeDashboard}=require('../../app/finance/tax-position/dashboard-data.ts');
 const a=adapter(f()),data=await readDashboard(a.client,buildPermissions({role:'admin'}),'2026-09'),before=summarizeDashboard(data,'2026-09');
 data.register.facts.push({id:'expense-input',tax_kind:'input_vat',period_month:'2026-09-01',tax_amount:700},{id:'other-period',tax_kind:'input_vat',period_month:'2026-10-01',tax_amount:900});
 const after=summarizeDashboard(data,'2026-09');assert.equal(after.reviewedInputVat,700);
 for(const k of ['outputVat','wht','cash','outgoingDue'])assert.equal(after[k],before[k],k);
 assert.equal(summarizeDashboard({...data,register:null},'2026-09').reviewedInputVat,null);
});
test('055 approved SQL artifacts are SELECT-only/single result, exact embedded candidate, rollback-only and no top-level data writes',()=>{
 const lexicalSource=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
 const lexical=require('node:vm').runInNewContext(lexicalSource.slice(lexicalSource.indexOf('function lexical('),lexicalSource.indexOf('module.exports'))+';lexical',{assert});
 const a=require('./expense-foundation-artifacts.cjs');
 for(const [file,sql] of Object.entries(a.workflow()))assert.equal(fs.readFileSync(file,'utf8'),sql);
 for(const file of [a.filenames.pre,a.filenames.verify]){const s=lexical(fs.readFileSync(file,'utf8'));assert.equal(s.split(';').filter(x=>x.trim()).length,1);assert.match(s.trim(),/^with /i);assert.doesNotMatch(s,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);}
 const migration=fs.readFileSync(a.migrationPath,'utf8'),dry=fs.readFileSync(a.filenames.dry,'utf8');assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 055\n')[1].split('-- END EMBEDDED MIGRATION 055')[0],migration);
 assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 for(const statement of lexical(migration).split(';'))assert.doesNotMatch(statement.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
});
test('055 applied migrations and legacy claim UI remain byte-identical; UI only dispatches explicit controlled RPCs',()=>{
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 files.push('app/finance/expense-claims/page.tsx','app/components/AppSidebar.module.css','app/components/sidebar-reveal.ts');
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
 for(const file of ['workspace.tsx','forms.tsx','admin-tools.tsx'])assert.doesNotMatch(fs.readFileSync('app/finance/expenses/'+file,'utf8'),/\.(insert|update|upsert|delete)\(/);
 const s=fs.readFileSync('app/finance/expenses/workspace.tsx','utf8');assert.match(s,/busy \|\| dirty/);assert.match(s,/access.is_admin && a.evidence_json/);assert.match(s,/if \(lock.current \|\| fixture\)/);
 for(const [key,entry] of Object.entries(expenseMessages))for(const locale of ['th','en'])assert.ok(entry[locale]?.trim(),key);
});
