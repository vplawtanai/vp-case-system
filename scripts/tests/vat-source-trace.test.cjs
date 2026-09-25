/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,input}=require('./vat-source-fixture.cjs');
const {vatSourceTrace}=require('../../app/finance/tax-position/vat-source-data.ts');
const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const {taxMonthSummary}=require('../../app/finance/tax-position/period-data.ts');
const ui=workspaceFixture('app/finance/tax-position/vat-sources.tsx',['VatSources']);
test('same monthly authoritative evidence reconciles multiple purchases; rendering does not change any facts or card amounts',()=>{
 const d=fixture(),before=structuredClone(d),summary=structuredClone(taxMonthSummary(d)),r=vatSourceTrace(d);
 assert.deepEqual([r.outputTotal,r.inputTotal,r.net,r.reconciled],[700,89.63,610.37,true]);
 assert.deepEqual(r.input.map(s=>[s.base,s.vat]),[[280.37,19.63],[1000,70]]);
 assert.equal(r.input[1].href,'/finance/expenses/purchase-2');assert.equal(r.output[0].href,'/finance/direct-money/direct-sample');
 d.filing.pools[0].monthly_facts.input_sources[1].source.source_evidence.expense.gross_amount=1000;
 assert.equal(vatSourceTrace(d).input[1].base,1000,'Add-on source gross field is not the final settlement and must not be reinterpreted');
 assert.match(r.output[0].party,/Sample customer/);assert.match(r.input[1].reference,/EXP-/);
 // UI must not add current queue entries/materialized facts to the authoritative set.
 d.inputs.expenses.push({id:'pending',status:'pending',vat_amount:999});d.sources.register={periods:[],facts:[{tax_kind:'input_vat',tax_amount:999}]};
 assert.equal(vatSourceTrace(d).inputTotal,89.63);
 for(const locale of ['th','en'])ui.render(locale,{},{data:before},'VatSources');
 assert.deepEqual(taxMonthSummary(before),summary);assert.deepEqual(before,fixture());
});
test('zero input, zero output and both empty remain explicit and correctly reconcile, including negative net',()=>{
 for(const [outputVat,inputVat] of [[700,0],[0,89.63],[0,0]]){
  const d=fixture(),f=d.filing.pools[0].monthly_facts;
  if(!outputVat)f.source_evidence=[];if(!inputVat)f.input_sources=[];
  Object.assign(f,{output_vat:outputVat,input_vat:inputVat,net_vat:outputVat-inputVat});
  const r=vatSourceTrace(d);assert.equal(r.reconciled,true);
  const html=ui.render('en',{},{data:d},'VatSources');
  if(!outputVat)assert.match(html,/No Output VAT sources/);if(!inputVat)assert.match(html,/No eligible Input VAT sources/);
 }
});
test('missing/malformed/duplicate/wrong-period evidence fails visibly; stale card or frozen net mismatch shows both totals',()=>{
 for(const change of [f=>delete f.input_sources,f=>f.input_sources.push(f.input_sources[0]),f=>f.source_evidence[0].effective_on='2026-08-15',f=>f.input_sources[0].source.effective_on='2026-08-15',f=>f.input_sources[0].amount=999,f=>f.source_evidence[0].lines[0].tax=null,f=>f.source_evidence[0].lines.push(f.source_evidence[0].lines[0])]){
  const d=fixture();change(d.filing.pools[0].monthly_facts);assert.equal(vatSourceTrace(d).unavailable,true);
  assert.match(ui.render('en',{},{data:d},'VatSources'),/role="alert"/);
 }
 for(const field of ['output_vat','input_vat','net_vat']){
  const d=fixture();d.filing.pools[0].monthly_facts[field]=999;
  const r=vatSourceTrace(d);assert.equal(r.reconciled,false);assert.equal(r.unavailable,false);
  assert.match(ui.render('en',{},{data:d},'VatSources'),/Source totals do not match/);
 }
 const d=fixture(),frozen=structuredClone(d.filing.pools[0]);frozen.monthly_facts.net_vat=123;
 d.filing.filings=[{filing_type:'vat',status:'filed',source_snapshot_json:frozen,tax_amount:123}];
 assert.equal(vatSourceTrace(d).reconciled,false);assert.equal(vatSourceTrace(d).summary.net,123,'Do not replace the existing frozen filing amount');
});
test('claims, legacy claims, external evidence, tax invoices and signed credit notes use existing sources without VAT inference',()=>{
 const d=fixture(),f=d.filing.pools[0].monthly_facts;
 f.input_sources=[input('claim',70,1000,'employee_claim'),input('legacy',19.63,280.37,'legacy_claim')];
 assert.deepEqual(vatSourceTrace(d).input.map(r=>r.href),['/finance/expenses/claims/claim','/finance/expenses/claims/legacy']);
 f.input_sources=[{source_type:'external_input_vat',source_id:'ext',amount:89.63,source:{source_type:'external_input_vat',source_id:'ext',active:true,currency:'THB',reference:'INV-EXT',effective_on:'2026-09-20',payer:{name:'External supplier'},lines:[{line_id:'ext',kind:'input_vat',base:2000,tax:89.63}],source_evidence:{document:{id:'ext',note:'Third party document'}}}}];
 let r=vatSourceTrace(d);assert.equal(r.reconciled,true);assert.equal(r.input[0].href,null);assert.equal(r.input[0].note,'Third party document');
 f.source_evidence=[{...f.source_evidence[0],source_type:'tax_invoice',source_id:'tax',reference:'TAX-SAMPLE',lines:[{line_id:'tax1',kind:'output_vat',base:12000,tax:800}]},{source_type:'tax_correction',source_id:'correction',reference:'CN-SAMPLE',effective_on:'2026-09-22',lines:[{line_id:'cn1',kind:'output_vat',base:-1000,tax:-100}]}];
 r=vatSourceTrace(d);assert.equal(r.reconciled,true);assert.deepEqual(r.output.map(s=>s.href),['/finance/tax-invoices/tax','/finance/tax-corrections/correction']);
});
for(const locale of ['th','en'])test(`${locale}: both groups, period, source labels, link and reconciliation are rendered via the existing VAT modal`,()=>{
 const React=require('react'),home=workspaceFixture('app/finance/tax-position/tax-home.tsx',[],{'../../components/DetailModal':{default:({children})=>React.createElement('div',{role:'dialog'},children)}});
 const {buildPermissions}=require('../../lib/permissions.ts'),d=fixture();
 const html=home.render(locale,{'TaxHome.month':'2026-10','TaxHome.months':[d],'TaxHome.loading':false,'TaxHome.source':'vat'},{permissions:buildPermissions({role:'admin'})});
 assert.match(html,/610\.37/);assert.match(html,/89\.63/);assert.match(html,/1,000\.00/);assert.doesNotMatch(html,/Gross amount|ยอดก่อนหัก WHT/);assert.match(html,/href="\/finance\/expenses\/purchase-2"/);
 assert.match(html,locale==='th'?/ยอดต้นทางตรงกับยอดสรุป/:/Source totals match the summary/);
 assert.match(html,locale==='th'?/กันยายน 2569/:/September 2026/);assert.doesNotMatch(html,/taxHome\.|role="alert"/);
});
test('traceability adds no network, write RPC, Cashbook or Statement path',()=>{
 const files=['vat-source-data.ts','vat-sources.tsx'].map(p=>fs.readFileSync('app/finance/tax-position/'+p,'utf8')).join('\n');
 assert.doesNotMatch(files,/supabase|\.rpc\(|\.from\(|fetch\(|finance_cash|finance_statement|tax_position_sync/);
});
