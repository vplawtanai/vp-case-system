/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');
const {distributionSourceProven,initialDistributionChoices,distributionPayload}=require('../../app/finance/payments/vp-distribution.ts');
const {distributionTotals,revenueHref}=require('../../app/finance/revenue-distribution/shared.ts');
const {financeNavigationItems,activeFinancePage}=require('../../app/finance/finance-navigation.ts'),{buildPermissions}=require('../../lib/permissions.ts');
const {translate}=require('../../lib/i18n/catalog.ts');
const fixture=require('./revenue-distribution-fixture.json');
test('067 v1/v2 UI compatibility fails closed on unknown policy or cash-derived pool',()=>{
 const c=structuredClone(fixture);assert.equal(c.source.policy_version,'vp_distribution_v2');assert.equal(distributionSourceProven(c.source),true);
 assert.deepEqual(distributionTotals(initialDistributionChoices(c)),{company:4000,individuals:6000,total:10000});
 assert.equal(distributionPayload(c.source,initialDistributionChoices(c))[0].formula_result.pool,10000);
 c.source.lines[0].professional_pool=9700;assert.equal(distributionSourceProven(c.source),false);
 c.source.policy_version='vp_distribution_v1';assert.equal(distributionSourceProven(c.source),true);
 c.source.policy_version='unknown';assert.equal(distributionSourceProven(c.source),false);
});
test('067 navigation after Payments before documents, with inherited read permission and untouched Legacy paths',()=>{
 for(const locale of ['th','en'])for(const role of ['admin','partner','staff']){const p=buildPermissions({role}),items=financeNavigationItems(p,locale),names=items.map(i=>i.page||i.group),has=names.includes('revenue-distribution');assert.equal(has,p.canViewFinancePayments);if(has){assert.equal(names[names.indexOf('payments')+1],'revenue-distribution');if(names.includes('payment-documents'))assert.ok(names.indexOf('revenue-distribution')<names.indexOf('payment-documents'));}
 const legacy=items.find(i=>i.group==='legacy');if(role==='admin')assert.deepEqual(legacy.children.map(i=>i.href),['/finance/expense-claims','/finance/compensation','/finance/ledger']);}
 assert.equal(activeFinancePage(revenueHref('payment',fixture.summary.source_id),'quotations'),'revenue-distribution');
});
test('067 complete Thai/English workspace language and no posting/payout action or table write',()=>{
 const {revenueDistributionMessages}=require('../../lib/i18n/messages/revenue-distribution.ts');for(const [key,v] of Object.entries(revenueDistributionMessages))for(const locale of ['th','en']){assert.ok(v[locale]);assert.equal(translate(locale,key),v[locale]);}
 const ui=['workspace.tsx','detail.tsx'].map(n=>fs.readFileSync('app/finance/revenue-distribution/'+n,'utf8')).join('\n');assert.doesNotMatch(ui,/\.from\(|confirm_finance_payout|save_finance_payout|finance_company_ledger|finance_compensation_batches|finance_compensation_allocations/);assert.match(ui,/confirm_finance_vp_received_distribution/);assert.doesNotMatch(ui,/p_action: "review"|p_action: "finalize"/);
});
test('067 candidate only changes two policy helpers and adds five scoped functions; no schema/backfill',()=>{
 const c=JSON.parse(fs.readFileSync('scripts/tests/revenue-distribution-contract.json')),sql=fs.readFileSync('supabase/migrations/202607180067_add_revenue_distribution_workspace.sql','utf8');assert.deepEqual(c.scope.changed,['vp_received_source','vp_received_frozen']);assert.equal(c.scope.created.length,5);assert.equal(c.broaderUnresolvedDifferences,490);assert.ok(c.reconciliation.every(r=>r.definition_matches_repository));assert.doesNotMatch(sql,/\b(?:insert into|delete from|update public\.|alter table|create table|create policy|alter policy)\b/i);
 assert.match(sql,/perform public\.vp_received_lock/);assert.match(sql,/for update/);assert.match(sql,/from public,anon,authenticated,service_role/);
});
