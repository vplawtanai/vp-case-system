/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs');
require('./receipt-render-fixture.cjs');
const {fixture,adapter}=require('./tax-dashboard-fixture.cjs');
const {readDashboard,summarizeDashboard,readAll,currentBangkokMonth,shiftMonth}=require('../../app/finance/tax-position/dashboard-data.ts');
const {buildPermissions}=require('../../lib/permissions.ts');
const month='2026-09',admin=buildPermissions({role:'admin'});
async function read(f=fixture(),permissions=admin,m=month){const a=adapter(f);return {data:await readDashboard(a.client,permissions,m),calls:a.calls};}
test('Dashboard: upstream reads show cash/VAT/WHT before any historical materialization; no cash or register double count',async()=>{
 const f=fixture(),before=JSON.stringify(f),{data,calls}=await read(f),s=summarizeDashboard(data,month);
 assert.equal(s.cash,34419.81);assert.equal(s.receiptCount,3);assert.equal(s.wht,560.19);assert.equal(s.whtSources,3);assert.equal(s.outputVat,1027.1);
 assert.equal(s.systemBalance,49560);assert.equal(s.payable,5820);assert.equal(s.recipients,3);assert.equal(s.period,null);
 assert.equal(s.movements.length,3);assert.equal(s.movements.find(r=>r.source==='direct_money_receipt').gross,10700);
 assert.equal(s.movements.find(r=>r.id===f.tables.finance_payments[0].id).vat,null);
 assert.equal(s.credits.find(c=>c.sourceId===f.tables.finance_payments[1].id).base,4672.9);
 assert.equal(s.credits.find(c=>c.sourceId===f.tables.finance_payments[1].id).rate,3);
 assert.equal(JSON.stringify(f),before);assert.ok(calls.every(c=>c.table||['get_finance_tax_position','get_finance_treasury','get_finance_payable_entitlements'].includes(c.rpc)));
 data.register.facts=[{tax_amount:999999,tax_kind:'output_vat',source_type:'tax_invoice',source_id:'ignored'}];
 data.register.incoming_wht_total=999999;data.register.periods=[{period_month:month+'-01',known_output_vat:999999,status:'filed'}];
 assert.equal(summarizeDashboard(data,month).outputVat,1027.1);assert.equal(summarizeDashboard(data,month).wht,560.19);
});
test('Dashboard: drafts, reversals, other months/currencies and non-open/non-payable rights never enter totals',async()=>{
 const f=fixture();for(const status of ['draft','reversed','cancelled'])f.tables.finance_payments.push({...f.tables.finance_payments[0],id:status,status});
 f.tables.finance_payments.push({...f.tables.finance_payments[0],id:'prior',received_on:'2026-08-31'},{...f.tables.finance_payments[0],id:'foreign',currency:'USD'});
 f.groups[0].components.push({id:'superseded',status:'superseded',bucket:'work',currency:'THB',gross_amount:99999},{id:'company',status:'open',bucket:'company',currency:'THB',gross_amount:99999});
 const {data}=await read(f),s=summarizeDashboard(data,month);assert.equal(s.cash,34419.81);assert.equal(s.foreign,1);assert.equal(s.payable,5820);
 const prior=await read(f,admin,'2026-08');assert.equal(summarizeDashboard(prior.data,'2026-08').receiptCount,1);
});
test('Dashboard: approved tax-point month, one tax child, signed CN/DN only; no VAT from copy/reissue',async()=>{
 const {data}=await read();data.taxes.documents.push(structuredClone(data.taxes.documents[0]));
 data.taxes.corrections=['credit_note','debit_note','replacement_copy','cancel_and_reissue'].map((mode,i)=>({id:mode,status:'issued',correction_mode:mode,adjustment_date:'2026-09-10',lines:[{id:'line-'+i,base_change:100,vat_change:mode==='credit_note'?7:14}]}));
 assert.equal(summarizeDashboard(data,month).outputVat,1034.1);
 data.taxes.documents.forEach(d=>d.point.occurred_on='2026-08-31');assert.equal(summarizeDashboard(data,month).outputVat,707);
 data.taxes.documents.forEach(d=>{d.point.occurred_on='2026-09-05';d.point.approved_at=null;});assert.equal(summarizeDashboard(data,month).outputVat,707);
});
test('Dashboard: Direct classification overlay is authoritative; unknown tax is excluded with a warning',async()=>{
 const f=fixture(),d=f.tables.finance_direct_money_receipts[0];d.classification_json={lines:[{...d.confirmed_snapshot_json.lines[0],vat_treatment_json:{treatment:'unknown'}}]};
 const {data}=await read(f),s=summarizeDashboard(data,month);assert.equal(s.outputVat,327.1);assert.equal(s.unresolved,1);assert.equal(s.movements.find(m=>m.source==='direct_money_receipt').vat,null);assert.equal(s.wht,560.19);
});
test('Dashboard: legacy WHT never infers base/rate; certificate evidence and matching review remain separate from claims',async()=>{
 const f=fixture(),p=f.tables.finance_payments[0];f.tables.finance_payment_wht_components=[];
 f.tables.finance_payment_evidence=[{id:'cert',payment_id:p.id,evidence_type:'wht_certificate'}];
 const {data}=await read(f);let credit=summarizeDashboard(data,month).credits.find(c=>c.sourceId===p.id);
 assert.equal(credit.base,null);assert.equal(credit.rate,null);assert.equal(credit.amount,120);assert.equal(credit.evidence,'received');
 data.register.facts=[{source_type:'payment',source_id:p.id,source_line_id:p.id,tax_kind:'incoming_wht',effective_on:p.received_on,tax_amount:120,base_amount:null,rate_percent:null,evidence_status:'verified'}];
 credit=summarizeDashboard(data,month).credits.find(c=>c.sourceId===p.id);assert.equal(credit.evidence,'verified');
 data.register.facts[0].tax_amount=121;assert.equal(summarizeDashboard(data,month).credits.find(c=>c.sourceId===p.id).evidence,'received');
});
test('Dashboard: missing openings, restricted RLS domains and read failures are unknown, not zero',async()=>{
 const f=fixture();f.treasury.accounts[0].system_balance=null;const {data}=await read(f);let s=summarizeDashboard(data,month);
 assert.equal(s.systemBalance,20000);assert.equal(s.unknownAccounts,1);data.treasury.accounts[1].system_balance=null;assert.equal(summarizeDashboard(data,month).systemBalance,null);
 const restricted=await read(f,{canViewFinanceTaxInvoices:true});s=summarizeDashboard(restricted.data,month);
 for(const k of ['cash','outputVat','wht','systemBalance','payable'])assert.equal(s[k],null,k);
 assert.ok(!restricted.calls.some(c=>c.table));
 f.fail=true;const failed=await read(f);for(const v of Object.values(failed.data))assert.equal(v,null);
 const empty=fixture();for(const key in empty.tables)empty.tables[key]=[];empty.groups=[];s=summarizeDashboard((await read(empty)).data,month);assert.equal(s.cash,0);assert.equal(s.wht,0);assert.equal(s.outputVat,0);assert.equal(s.payable,0);
});
test('Dashboard: full pagination, cents arithmetic and Bangkok month boundaries',async()=>{
 const rows=Array.from({length:1201},(_,id)=>({id})),calls=[];
 assert.equal((await readAll((start,end)=>{calls.push([start,end]);return Promise.resolve({data:rows.slice(start,end+1),error:null});})).length,1201);assert.equal(calls.length,3);
 assert.equal((await readAll(start=>Promise.resolve({data:rows.slice(start,start+100),count:1201,error:null}))).length,1201);
 await assert.rejects(()=>readAll(()=>Promise.resolve({data:null,error:Error('denied')})));
 assert.equal(currentBangkokMonth(new Date('2026-08-31T17:00:00Z')),'2026-09');assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
 const f=fixture();f.tables.finance_payments.forEach((p,i)=>{p.cash_amount=i?0.2:0.1;p.wht_amount=0;p.settlement_amount=p.cash_amount;});f.tables.finance_direct_money_receipts=[];
 assert.equal(summarizeDashboard((await read(f)).data,month).cash,0.3);
 const many=fixture();many.groups=Array.from({length:27},(_,i)=>({...many.groups[0],recipient_id:'r'+i,components:[{id:'r'+i,recipient_id:'r'+i,bucket:'work',status:'open',currency:'THB',gross_amount:1}]}));
 const paged=await read(many);assert.equal(summarizeDashboard(paged.data,month).payable,27);assert.equal(paged.calls.filter(c=>c.rpc==='get_finance_payable_entitlements').length,2);
});
test('Dashboard: outgoing WHT is separate, monthly, unremitted and never offsets cash/VAT/incoming credit',async()=>{
 const data=fixture();data.register.outgoing_workflow_available=true;data.register.outgoing=[{id:'one',payout_id:'synthetic',withheld_on:'2026-09-01',withheld_amount:93.12,remitted_amount:0}];
 const a=adapter(data),loaded=await readDashboard(a.client,buildPermissions({role:'admin'}),'2026-09');const result=summarizeDashboard(loaded,'2026-09');
 assert.equal(result.outgoingHeld,93.12);assert.equal(result.outgoingDue,93.12);assert.equal(result.wht,560.19);assert.equal(result.cash,34419.81);assert.equal(result.outputVat,1027.1);
 assert.equal(summarizeDashboard(loaded,'2026-10').outgoingHeld,0);
});
test('Dashboard: read model has no writes/private RPC and all translated labels exist',()=>{
 const source=fs.readFileSync('app/finance/tax-position/dashboard-data.ts','utf8');assert.doesNotMatch(source,/\.(insert|update|delete|upsert)\(/);
 assert.deepEqual([...source.matchAll(/\.rpc\("([^"]+)"/g)].map(m=>m[1]).sort(),['get_finance_payable_entitlements','get_finance_tax_position','get_finance_treasury']);
 const {taxPositionMessages}=require('../../lib/i18n/messages/tax-position.ts');for(const [key,locales]of Object.entries(taxPositionMessages)){assert.ok(locales.th,key);assert.ok(locales.en,key);}
 const ui=fs.readFileSync('app/finance/tax-position/dashboard.tsx','utf8');for(const [,key]of ui.matchAll(/tr\("([^"]+)"/g))assert.ok(taxPositionMessages['taxDashboard.'+key],key);
});
