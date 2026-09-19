/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {fixture,monthlyFixture}=require('./tax-filing-fixture.cjs'),{adapter}=require('./tax-dashboard-fixture.cjs');
const {buildPermissions}=require('../../lib/permissions.ts');
const {readMonthlyTaxSources,summarizeMonthlyTaxFacts}=require('../../app/finance/tax-position/dashboard-data.ts');
const {VatFilingReview}=require('../../app/finance/tax-position/filings/vat-review.tsx');
const {UiLocaleProvider}=require('../../lib/i18n/provider.tsx'),{translate}=require('../../lib/i18n/catalog.ts');
const tr=(locale,key)=>translate(locale,'taxFiling.'+key);
function render(pool,monthlyFacts,locale='th',outgoingWht=0){return renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/finance/tax-position/filings'},React.createElement(VatFilingReview,{pool,monthlyFacts,outgoingWht})));}

test('VAT review uses authoritative monthly facts before filing materialization, without mutating evidence',async()=>{
 const data=monthlyFixture(),a=adapter(data),pool=fixture().pools[0],before=JSON.stringify({data,pool});
 const facts=summarizeMonthlyTaxFacts(await readMonthlyTaxSources(a.client,buildPermissions({role:'admin'}),'2026-09'),'2026-09');
 assert.equal(pool.output_vat,0);assert.equal(pool.source_count,0);
 for(const locale of ['th','en']){
  const html=render(pool,facts,locale);
  for(const value of ['700.00 THB','560.19 THB',tr(locale,'incomplete'),tr(locale,'unknown'),tr(locale,'vatNotReady'),tr(locale,'vatInputBlockReason'),tr(locale,'notCollected'),tr(locale,'noWht')])assert.ok(html.includes(value),value);
  assert.ok(!html.includes(translate(locale,'taxFiling.sourceCount',{count:0})));
  assert.ok(html.includes(tr(locale,'monthlyOutputKnown')));assert.ok(html.includes(tr(locale,'vatCreditHelp')));
  assert.doesNotMatch(html,/input_vat_incomplete|source_count|>0\.00 THB<|<pre/);
 }
 assert.equal(JSON.stringify({data,pool}),before);assert.ok(a.calls.every(c=>c.table&&!c.rpc));
});

test('VAT review unknown is never a zero or an unsupported success state',()=>{
 const pool=fixture().pools[0];
 for(const locale of ['th','en']){
  const html=render(pool,null,locale,null);
  assert.ok(html.includes(tr(locale,'monthlyOutputUnknown')));assert.ok(!html.includes(tr(locale,'monthlyOutputKnown')));
  assert.ok(!html.includes(tr(locale,'noWht')));assert.doesNotMatch(html,/0\.00 THB/);
  const zero=render(pool,{outputVat:0,incomingWht:0},locale,0);
  assert.equal((zero.match(/0\.00 THB/g)||[]).length,2);assert.ok(zero.includes(tr(locale,'unknown')));
 }
});

test('Incoming WHT remains secondary income-tax credit, never a VAT calculation or filing readiness input',()=>{
 const pool=fixture().pools[0],before=JSON.stringify(pool),html=render(pool,{outputVat:700,incomingWht:999999},'en');
 assert.ok(html.includes('999,999.00 THB'));assert.ok(html.includes('Not a VAT credit'));
 assert.ok(html.includes(tr('en','unknown')));assert.ok(html.includes(tr('en','vatNotReady')));
 assert.equal(JSON.stringify(pool),before);assert.equal(pool.tax_amount,null);assert.equal(pool.ready,false);
});

test('Partial source collection never implies complete filing evidence; raw issue codes stay technical',()=>{
 const pool=fixture().pools[0];pool.source_count=3;pool.issues.push({code:'future_private_code',count:1});
 const html=render(pool,{outputVat:700,incomingWht:560.19});
 assert.ok(html.includes(tr('th','incomplete')));assert.ok(!html.includes(tr('th','notCollected')));
 assert.ok(!html.includes(tr('th','evidenceReadyForReview')));assert.doesNotMatch(html,/future_private_code/);
});
