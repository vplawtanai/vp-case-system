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
test('visual views retain frozen filing values, negative net VAT and unknown amounts without mutating source data',async()=>{
 const d=await data();d.filing.filings=[{filing_type:'vat',status:'filed',tax_amount:-70,remittance:{status:'confirmed'}}];
 const before=structuredClone(d),month=taxMonthSummary(d),year=taxYearSummary(Array.from({length:12},(_,i)=>({...d,month:`2026-${String(i+1).padStart(2,'0')}`})));
 assert.equal(month.net,-70);assert.equal(month.estimate,630,'An estimate must not replace a filed amount');assert.equal(year.net,-840);
 assert.equal(month.incoming,560.19,'Customer WHT stays separate from outgoing tax');assert.equal(month.outgoing,186.24);
 assert.deepEqual(d,before,'Month/history/year presentation must never modify existing evidence');
 d.filing.filings=[];d.filing.pools[0].monthly_facts.reviewed_input_vat=null;
 assert.equal(taxMonthSummary(d).estimate,null);assert.equal(taxYearSummary([d]).net,null,'Unavailable totals remain unavailable, not zero');
});
const {taxPeriodForFilingMonth,filingMonthForTaxPeriod,taxPeriodsForView,filingYearView,filingObligationsForDisplay}=require('../../app/finance/tax-position/filing-period-view.ts');
const {readTaxMonth}=require('../../app/finance/tax-position/period-data.ts');
test('filing September 2569 reads August; filing October 2569 reads September; deadlines remain calendar-owned',async()=>{
 for(const [filingMonth,taxPeriod,deadline] of [['2026-09','2026-08','2026-09-21'],['2026-10','2026-09','2026-10-20']]){
  assert.equal(taxPeriodForFilingMonth(filingMonth),taxPeriod);assert.equal(filingMonthForTaxPeriod(taxPeriod),filingMonth);
  assert.deepEqual(taxPeriodsForView(filingMonth),[taxPeriod]);
  const calls=[],base=adapter(monthlyFixture());
  const client={from:base.client.from,async rpc(name,args){calls.push({name,args});if(name==='get_finance_tax_filings'){const result=snapshotFixture(true);result.period_month=args.p_month;result.pools.forEach(p=>p.period_month=args.p_month);return{data:result};}if(name==='get_finance_tax_input_evidence')return{data:{external:[],expenses:[],can_manage:true}};if(name==='get_finance_tax_deadline')return{data:{schema_version:1,period_month:args.p_month,filing_type:args.p_type,channel:'online',status:'calculated',due_date:deadline,rule:{reference:'SYNTHETIC reviewed calendar'}}};throw Error(name);}};
  const row=await readTaxMonth(client,buildPermissions({role:'admin'}),taxPeriodForFilingMonth(filingMonth));
  assert.equal(row.filing.period_month,taxPeriod+'-01');assert.equal(row.deadlines.vat.due_date,deadline);assert.equal(row.deadlines.wht_juristic.due_date,deadline);
  assert.ok(calls.every(c=>c.args.p_month===taxPeriod+'-01'),'All existing RPCs must receive the actual tax period');
  assert.ok(base.calls.filter(c=>c.filters?.some(f=>f[0]==='gte')).every(c=>c.filters.find(f=>f[0]==='gte')[2]===taxPeriod+'-01'),'Source reads use the same period');
 }
 assert.equal(taxPeriodForFilingMonth('2026-01'),'2025-12');assert.equal(filingMonthForTaxPeriod('2025-12'),'2026-01');
 assert.throws(()=>taxPeriodForFilingMonth('2026-13'));
});
test('operational filing year uses previous December–November without shifting January–December monetary totals',async()=>{
 const periods=await Promise.all(taxPeriodsForView('2026').map(m=>data(m)));
 assert.equal(filingYearView(periods.slice(1),'2026','2026-09'),null,'Incomplete data during tab/year navigation waits for the read');
 assert.equal(filingYearView(periods,'2027','2026-09'),null);
 assert.equal(periods.length,13);assert.equal(periods[0].month,'2025-12');assert.equal(periods[12].month,'2026-12');
 const januaryToDecember=periods.filter(p=>p.month.startsWith('2026-')),before=taxYearSummary(januaryToDecember);
 periods[0].filing.pools[0].monthly_facts.output_vat=99000;
 periods[0].filing.filings=periods[0].filing.pools.map(p=>({filing_type:p.filing_type,status:'filed',tax_amount:10,remittance:null}));
 const operational=filingYearView(periods,'2026','2026-09');
 assert.deepEqual([operational.rows[0].filingMonth,operational.rows[0].taxPeriod],['2026-01','2025-12']);
 assert.deepEqual([operational.rows[11].filingMonth,operational.rows[11].taxPeriod],['2026-12','2026-11']);
 assert.equal(operational.complete,1);assert.equal(operational.rows[0].net,10);
 assert.deepEqual(taxYearSummary(periods.filter(p=>p.month.startsWith('2026-'))),before,'Existing annual monetary totals and chart periods do not change');
 const future=await data('2026-09');future.sources=(await data('2099-01')).sources;future.inputs={external:[],expenses:[]};future.filing=snapshotFixture();
 periods[9]=future;assert.equal(filingYearView(periods,'2026','2026-09').rows[9].status,'future','October is a future filing month even when its September period is current');
});
test('each resolved WHT form has independent actions; unknown classification/evidence stays in review',async()=>{
 const d=await data();let view=filingObligationsForDisplay(d);
 assert.deepEqual(view.pools.map(p=>p.filing_type),['vat','wht_natural','wht_juristic']);assert.equal(view.whtNeedsReview,false);
 d.filing.filings=[{filing_type:'vat',status:'filed',tax_amount:630,remittance:{status:'confirmed'}}];
 assert.equal(d.filing.filings.some(f=>f.filing_type==='wht_natural'),false,'A VAT filing never represents WHT filing');
 d.filing.pools.slice(1).forEach(p=>{p.ready=false;p.issues=[{code:'unclassified_wht',count:1}];p.review_sources=[{...p.sources[0],entity_type:undefined}];p.sources=[];p.source_count=0;});
 view=filingObligationsForDisplay(d);assert.equal(view.whtNeedsReview,true);assert.deepEqual(view.pools.map(p=>p.filing_type),['vat']);
 d.filing.pools[1].issues=[{code:'source_evidence_incomplete',count:1}];d.filing.pools[1].review_sources[0].entity_type='natural_person';
 view=filingObligationsForDisplay(d);assert.equal(view.whtNeedsReview,true);assert.deepEqual(view.pools.map(p=>p.filing_type),['vat'],'Incomplete evidence must not expose WHT filing actions');
});
