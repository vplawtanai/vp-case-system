/* eslint-disable @typescript-eslint/no-require-imports */
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,monthlyFixture}=require('./tax-filing-fixture.cjs');
const {adapter}=require('./tax-dashboard-fixture.cjs');
const {buildPermissions}=require('../../lib/permissions.ts');
const {readDashboard,readMonthlyTaxSources,summarizeDashboard,summarizeMonthlyTaxFacts}=require('../../app/finance/tax-position/dashboard-data.ts');
const {summarizeFilings,filingBaseAmount}=require('../../app/finance/tax-position/filings/shared.ts');
const admin=buildPermissions({role:'admin'}),month='2026-09';
async function monthly(f,permissions=admin,m=month){const a=adapter(f);return{facts:summarizeMonthlyTaxFacts(await readMonthlyTaxSources(a.client,permissions,m),m),calls:a.calls};}

test('Filing September facts match Overview before materialization: VAT 700, incoming WHT 560.19, outgoing 0, net unknown',async()=>{
 const f=monthlyFixture(),workflow=fixture(),before=JSON.stringify({f,workflow});
 const overview=summarizeDashboard(await readDashboard(adapter(f).client,admin,month),month);
 const {facts,calls}=await monthly(f),filing=summarizeFilings(workflow,facts);
 assert.equal(workflow.pools[0].output_vat,0);assert.equal(workflow.incoming_wht_credit,0);
 assert.equal(filing.outputVat,700);assert.equal(filing.outputVat,overview.outputVat);
 assert.equal(filing.incomingWht,560.19);assert.equal(filing.incomingWht,overview.wht);
 assert.equal(filing.outgoing,0);assert.equal(filing.outgoing,overview.outgoingHeld);
 assert.equal(filing.vat.input_vat_complete,false);assert.equal(filing.vat.tax_amount,null);assert.equal(filing.total,null);
 assert.equal(filingBaseAmount(filing.vat),null);assert.equal(filing.status,'needs_review');
 assert.deepEqual(workflow.filings,[]);assert.deepEqual(workflow.history,[]);
 assert.ok(calls.every(c=>c.table&&!['finance_payouts','finance_tax_position_facts','finance_tax_filing_allocations'].includes(c.table)));
 assert.equal(JSON.stringify({f,workflow}),before,'Read-only, no materialization or mutations');
});

test('Filing display never falls back to stale register zeros/totals or changes lifecycle pool evidence',async()=>{
 const f=monthlyFixture(),workflow=fixture(),{facts}=await monthly(f);
 workflow.incoming_wht_credit=999999;workflow.pools[0].output_vat=999999;workflow.pools[0].base_amount=123;
 const before=JSON.stringify(workflow),s=summarizeFilings(workflow,facts);
 assert.equal(s.outputVat,700);assert.equal(s.incomingWht,560.19);assert.equal(filingBaseAmount(s.vat),null);
 assert.equal(JSON.stringify(workflow),before);assert.strictEqual(s.vat,workflow.pools[0]);
 const missing=summarizeFilings(workflow,null);assert.equal(missing.outputVat,null);assert.equal(missing.incomingWht,null);
});

test('Filing unknown differs from genuine zero; permissions/read failures are never reported as zero',async()=>{
 const f=monthlyFixture();f.fail=true;assert.deepEqual((await monthly(f)).facts,{outputVat:null,incomingWht:null});
 f.fail=false;const restricted=await monthly(f,{canViewFinanceTaxInvoices:true});
 assert.deepEqual(restricted.facts,{outputVat:null,incomingWht:null});assert.equal(restricted.calls.length,0);
 const noTaxAccess=await monthly(f,{canViewFinancePayments:true});assert.equal(noTaxAccess.facts.outputVat,null);assert.equal(noTaxAccess.facts.incomingWht,560.19);
 for(const key of Object.keys(f.tables))f.tables[key]=[];
 const zero=summarizeFilings(fixture(),(await monthly(f)).facts);assert.equal(zero.outputVat,0);assert.equal(zero.incomingWht,0);
 assert.equal(zero.vat.tax_amount,null);assert.equal(zero.total,null);assert.equal(filingBaseAmount(zero.vat),null);
 assert.equal(filingBaseAmount(fixture().pools[1]),0,'Known zero WHT base is still zero');
 assert.deepEqual(summarizeMonthlyTaxFacts({money:{payments:[{id:'bad',status:'confirmed',received_on:'2026-09-01',currency:'THB'}],direct:[],components:[],certificates:[]},taxes:null},month),{outputVat:null,incomingWht:null});
});

test('Filing uses Overview source priority/month filters without tax double counting or cancelled-Payout liability',async()=>{
 const f=monthlyFixture();f.tables.finance_tax_invoices[0].status='issued';
 f.tables.finance_direct_money_receipts[0].classification_json={lines:[{...f.tables.finance_direct_money_receipts[0].confirmed_snapshot_json.lines[0],vat:350}]};
 for(const status of ['draft','cancelled','reversed'])f.tables.finance_payments.push({...f.tables.finance_payments[0],id:status,status,wht_amount:99999});
 f.register.facts=[{tax_kind:'output_vat',tax_amount:99999}];f.register.incoming_wht_total=99999;
 const before=JSON.stringify(f),a=await monthly(f),overview=summarizeDashboard(await readDashboard(adapter(f).client,admin,month),month);
 assert.equal(a.facts.outputVat,677.1);assert.equal(a.facts.outputVat,overview.outputVat);assert.equal(a.facts.incomingWht,560.19);
 assert.deepEqual((await monthly(f,admin,'2026-08')).facts,{outputVat:0,incomingWht:0});
 assert.equal(summarizeFilings(fixture(),a.facts).outgoing,0);assert.ok(!a.calls.some(c=>c.table==='finance_payouts'||c.rpc));
 assert.equal(JSON.stringify(f),before);
});
