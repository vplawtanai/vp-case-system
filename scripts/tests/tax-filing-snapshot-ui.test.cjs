/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {snapshotFixture,fixture}=require('./tax-filing-fixture.cjs');
const {UiLocaleProvider}=require('../../lib/i18n/provider.tsx'),{translate}=require('../../lib/i18n/catalog.ts');
const {VatFilingReview}=require('../../app/finance/tax-position/filings/vat-review.tsx'),{FilingTechnicalEvidence}=require('../../app/finance/tax-position/filings/technical-evidence.tsx');
const {summarizeFilings,filingBaseAmount,filingTechnicalEvidence}=require('../../app/finance/tax-position/filings/shared.ts');
const render=(type,props,locale)=>renderToStaticMarkup(React.createElement(UiLocaleProvider,{initialLocale:locale,pathname:'/finance/tax-position/filings'},React.createElement(type,props)));
test('053 TH/EN review and technical evidence separate frozen monthly 700 from allocated 0 without rewriting either',()=>{
 for(const locale of ['th','en']){
  const data=snapshotFixture(),pool=data.pools[0],before=JSON.stringify(pool),tr=k=>translate(locale,'taxFiling.'+k);
  const live={outputVat:999,incomingWht:560.19};
  const summary=summarizeFilings(data,live);assert.equal(summary.outputVat,700);assert.equal(summary.incomingWht,560.19);assert.equal(summary.outgoing,0);assert.equal(summary.total,null);assert.equal(filingBaseAmount(pool),null);
  const html=render(VatFilingReview,{pool,monthlyFacts:live,outgoingWht:0},locale);
  assert.ok(html.includes('700.00 THB'));assert.ok(!html.includes('999.00 THB'));assert.ok(html.includes('560.19 THB'));
  assert.ok(html.includes(tr('unknown')));assert.ok(html.includes(tr('incomplete')));assert.ok(html.includes(tr('vatNotReady')));
  const technical=render(FilingTechnicalEvidence,{pool},locale);for(const key of ['monthlyFacts','allocationCoverage','allocatedOutput','allocatedBase'])assert.ok(technical.includes(tr(key)));
  assert.ok(technical.includes('700.00 THB'));assert.ok(technical.includes('0.00 THB'));assert.equal('output_vat' in pool,false);
  const changed=snapshotFixture().pools[0];changed.monthly_facts.output_vat=999;
  const stored=render(FilingTechnicalEvidence,{pool:changed,filing:{source_snapshot_json:pool}},locale);assert.ok(stored.includes(tr('frozenMonthlyFacts')));assert.ok(!stored.includes('999.00 THB'));
  assert.equal(JSON.stringify(pool),before);assert.strictEqual(filingTechnicalEvidence(pool),pool);
 }
});
test('053 unknown stays null, genuine zero stays zero, schema-1 allocation evidence never becomes monthly facts',()=>{
 const pool=snapshotFixture().pools[0];pool.monthly_facts.output_vat=null;
 assert.equal(summarizeFilings({...snapshotFixture(),pools:[pool]}, {outputVat:700,incomingWht:560.19}).outputVat,null);
 let html=render(VatFilingReview,{pool,monthlyFacts:{outputVat:700,incomingWht:null},outgoingWht:0},'en');assert.ok(!html.includes('700.00'));assert.ok(!html.includes('0.00 THB'));
 pool.monthly_facts.output_vat=0;html=render(VatFilingReview,{pool,monthlyFacts:null,outgoingWht:0},'en');assert.ok(html.includes('0.00 THB'));
 const legacy=fixture().pools[0],raw=JSON.stringify(legacy),labelled=filingTechnicalEvidence(legacy);assert.equal(labelled.monthly_facts,null);assert.strictEqual(labelled.allocation_coverage,legacy);assert.equal(JSON.stringify(legacy),raw);
 for(const locale of ['th','en'])assert.ok(render(FilingTechnicalEvidence,{pool:legacy},locale).includes(translate(locale,'taxFiling.legacyAllocationOnly')));
});
