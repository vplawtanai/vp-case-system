/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs'),{translate}=require('../../lib/i18n/catalog.ts');
const {financeNavigationItems,activeFinancePage}=require('../../app/finance/finance-navigation.ts'),{buildPermissions}=require('../../lib/permissions.ts');
const data=require('./company-statement-fixture.json');
const fixture=workspaceFixture('app/finance/statement/company/workspace.tsx',['CompanyStatement','CompanyShareDetails']);
for(const locale of ['th','en'])test('069 '+locale+' Statement rows, total, frozen trace, date, read-only actions and navigation permission',()=>{
 const w=k=>translate(locale,'companyStatement.'+k),html=fixture.render(locale,{'CompanyStatement.data':data,'CompanyStatement.loading':false},{},'CompanyStatement');
 for(const key of ['title','total','scope','rowTitle'])assert.ok(html.includes(w(key)),key);assert.match(html,/4,000\.00 THB/);assert.doesNotMatch(html,/undefined|NaN|companyStatement\./);
 const detail=fixture.render(locale,{}, {row:data.rows[0]},'CompanyShareDetails');for(const key of ['received','finalized','revision','policy','basis','frozenNote'])assert.ok(detail.includes(w(key)));assert.match(detail,/10,000\.00 THB/);assert.doesNotMatch(detail,new RegExp(data.rows[0].distribution_id));
 for(const role of ['admin','partner','finance','staff']){const p=buildPermissions({role}),items=financeNavigationItems(p,locale),statement=items.find(i=>i.group==='statement');assert.equal(Boolean(statement),p.canViewFinanceCashTransactions);if(statement)assert.deepEqual(statement.children,[]);}
 assert.equal(activeFinancePage('/finance/statement/company','quotations'),'statement');
 const empty=fixture.render(locale,{'CompanyStatement.data':{...data,rows:[],count:0,totals:[],excluded_count:1},'CompanyStatement.loading':false},{},'CompanyStatement');assert.ok(empty.includes(w('empty')));assert.ok(empty.includes(w('excluded')));assert.ok(empty.includes(w('noIncome')));
});
test('069 all Statement language has Thai/English; source links and RPC are read only',()=>{
 const messages=require('../../lib/i18n/messages/company-statement.ts').companyStatementMessages;for(const [key,value] of Object.entries(messages))for(const locale of ['th','en'])assert.equal(translate(locale,key),value[locale]);
 const ui=fs.readFileSync('app/finance/statement/company/workspace.tsx','utf8');assert.deepEqual([...ui.matchAll(/supabase\.rpc\("([^"]+)"/g)].map(m=>m[1]),['get_finance_company_statement']);assert.match(ui,/revenueHref\(selected.source_type, selected.source_id\)/);assert.doesNotMatch(ui,/\.from\(|\.insert\(|\.update\(|\.delete\(|payout|company_ledger|running_balance/);
});
test('069 additive read functions only; immutable applied migrations and exact compact gates',()=>{
 const {validate,source,files}=require('./company-statement-artifacts.cjs'),c=validate(),sql=source();assert.equal(c.scope.created.length,2);assert.deepEqual(c.scope.changed,[]);assert.deepEqual(c.scope.writeTables,[]);assert.equal(c.broaderUnresolvedDifferences,490);
 const code=sql.replace(/--[^\n]*/g,'');assert.doesNotMatch(code,/\b(insert|update|delete|truncate|create table|alter table|create policy|create or replace|for update)\b/i);
 assert.match(code,/stable security definer set search_path=public/);assert.match(code,/current_user_can_view_finance_payments/);assert.doesNotMatch(code,/sum\(.*company_economic|vp_formula_calculate/);
 for(const p of Object.values(files))assert.ok(fs.statSync(p).size<250000);for(const p of [files.preflight,files.verifier])assert.doesNotMatch(fs.readFileSync(p,'utf8').replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,''),/\b(create|alter|insert|update|delete|truncate)\b/i);
});
