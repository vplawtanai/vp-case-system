/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapshotFixture,monthlyFixture}=require('./tax-filing-fixture.cjs');
const {adapter}=require('./tax-dashboard-fixture.cjs');
const {readMonthlyTaxSources}=require('../../app/finance/tax-position/dashboard-data.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
const {taxMonthSummary,taxYearSummary,withholdingTrace}=require('../../app/finance/tax-position/period-data.ts');
async function data(month='2026-09'){
 const sources=await readMonthlyTaxSources(adapter(monthlyFixture()).client,buildPermissions({role:'admin'}),month);
 const filing=snapshotFixture(true);filing.pools[0].monthly_facts.reviewed_input_vat=70;
 return {month,filing,inputs:{external:[],expenses:[{vat_amount:20,status:'pending'}]},sources:{...sources,treasury:null,payables:null,register:null},deadlines:{}};
}
test('064 monthly amounts separate output/eligible/pending/input estimates/customer credit and outgoing withholding',async()=>{
 const d=await data(),s=taxMonthSummary(d);assert.deepEqual([s.output,s.input,s.pendingVat,s.estimate,s.net,s.incoming,s.outgoing],[700,70,20,630,null,560.19,186.24]);assert.equal(s.incomplete,true);
 d.inputs.expenses[0].vat_amount=null;assert.equal(taxMonthSummary(d).pendingVat,null);
 const unclassified={...d.filing.pools[1].sources[0],id:'unclassified',entity_type:undefined,base:3000,amount:90,evidence:{evidence_json:{expense_id:'expense',gross:3000,wht:90,expense:{description:'Confirmed company payment'}}}};
 for(const pool of d.filing.pools.slice(1)){pool.sources=[];pool.source_count=0;pool.review_sources=[unclassified];pool.ready=false;pool.issues=[{code:'unclassified_wht',count:1}];}
 const next=taxMonthSummary(d);assert.equal(next.outgoing,90,'Deduplicate shared review sources across PND3/53');assert.equal(next.unclassified.length,1);assert.equal(next.status,'outstanding');assert.equal(withholdingTrace(unclassified).cash,2910);
});
test('064 history and annual totals use twelve periods, preserve frozen filings, distinguish paid and filed',async()=>{
 const rows=await Promise.all(Array.from({length:12},(_,i)=>data('2026-'+String(i+1).padStart(2,'0'))));
 rows[0].filing.filings=rows[0].filing.pools.map(p=>({filing_type:p.filing_type,status:'filed',tax_amount:p.filing_type==='vat'?630:p.tax_amount,remittance:null}));
 assert.equal(taxMonthSummary(rows[0]).status,'complete');assert.equal(taxMonthSummary(rows[0]).net,630);
 const year=taxYearSummary(rows);assert.equal(year.rows.length,12);assert.equal(year.output,8400);assert.equal(year.input,840);assert.equal(year.net,null);assert.equal(year.complete,1);assert.equal(year.outgoing,2234.88);
 assert.equal(taxYearSummary(rows.slice(1)).output,null,'Partial year cannot silently become a full-year total');
 const future=await data('2099-01');future.filing=snapshotFixture();future.inputs={external:[],expenses:[]};assert.equal(taxMonthSummary(future,'2026-09').status,'future');
});
