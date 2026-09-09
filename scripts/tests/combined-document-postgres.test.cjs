/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only; exact applied predecessors and exact candidate 040.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setup: taxSetup } = require('./tax-invoice-foundation.test.cjs');
const { db, query, scalar, count, rpc, rejects, asActor, ids, payment, financialState, migration } = require('./receipt-foundation.test.cjs');
const combined = id => scalar('select to_jsonb(c) from finance_combined_documents c where id=$1', [id]);
const decisions = { buyer_vat_registered:true, no_earlier_event:true, external_coverage_checked:true };
async function setup(applyCandidate=true) {
  await taxSetup();
  await db.exec(`
    create table finance_quotations(id uuid primary key,status text);
    create table finance_quotation_items(id uuid primary key,quotation_id uuid,vat_applicable boolean,vat_rate numeric);
    create table finance_fee_agreement_items(id uuid primary key,source_quotation_item_id uuid,vat_applicable boolean,vat_rate numeric);
    create table finance_billing_installment_items(id uuid primary key,fee_agreement_item_id uuid,vat_applicable boolean,vat_rate numeric);
    alter table finance_billable_charges add column source_billing_installment_item_id uuid,add column vat_applicable boolean,add column vat_rate numeric;
    alter table finance_invoice_items add column source_billable_charge_id uuid,add column source_fee_agreement_item_id uuid,add column vat_applicable boolean,add column vat_rate numeric,
      add column description text,add column amount_before_vat numeric,add column vat_amount numeric,add column line_total numeric,add column sort_order integer;
    alter table finance_invoices add column customer_billing_address text,add column source_snapshot_json jsonb;
  `);
  try { if(applyCandidate)await db.exec(migration('40')); }
  catch(e) { throw new Error(`${e.message}; position=${e.position}; internal=${e.internalQuery}; context=${e.where}`,{cause:e}); }
}
async function source(lineSpecs=[{base:10000,vat:700,rate:7,applicable:true}], partial=null, wht=0) {
  const id=randomUUID(), number='VP-IV-LOCAL-'+id.slice(0,8);
  const items=lineSpecs.map((s,index)=>({id:randomUUID(),invoice_id:id,description:'Synthetic line '+(index+1),source_state:'active',
    amount_before_vat:s.base,vat_amount:s.vat,line_total:s.base+s.vat,vat_applicable:s.applicable,vat_rate:s.rate,
    ...(s.treatment?{vat_treatment_json:{schema_version:1,treatment:s.treatment,reason:'Explicit synthetic evidence'}}:{})}));
  const before=items.reduce((n,i)=>n+i.amount_before_vat,0),vat=items.reduce((n,i)=>n+i.vat_amount,0),total=before+vat;
  const snapshot={schema_version:2,source_model:'billable_charge_v2',invoice:{id,invoice_no:number,document_status:'issued',currency:'THB',amount_before_vat:before,vat_amount:vat,total_amount:total,issued_at:'2026-07-01T00:00:00Z'},
    customer:{name:'Synthetic Customer',address:'Fixture Road',tax_id:'0000000000002',branch:'Head Office'},items:items.map(invoice_item=>({invoice_item}))};
  await query('insert into finance_invoices(id,invoice_no,client_id,total_amount,amount_before_vat,vat_amount,issued_snapshot_json) values($1,$2,$3,$4,$5,$6,$7)',[id,number,ids.client,total,before,vat,snapshot]);
  for(const item of items) await query("insert into finance_invoice_items(id,invoice_id,source_state) values($1,$2,'active')",[item.id,id]);
  const settled=partial??total, cash=settled-wht;
  const p=await payment({cash,wht,allocations:[{invoice:{id,snapshot},cash,wht}]});
  return {id,p,items,total,snapshot};
}
const create=p=>rpc('create_finance_combined_document_draft',[p,true,true]);
async function save(id,d=decisions) {return rpc('save_finance_combined_document_draft',[id,'2026-07-02',d,(await combined(id)).updated_at]);}
async function issue(id) {return rpc('issue_finance_combined_document',[id,(await combined(id)).draft_snapshot_json,true,true,true,true]);}

test('040 standard full payment: one RTI number, atomic two domains, frozen evidence and no financial effects',async()=>{
  await setup(); const {p}=await source(); const before=await financialState();
  const id=await create(p.id); assert.equal(await create(p.id),id); assert.equal(await count('finance_document_counters'),0);
  await save(id); await issue(id); const row=await combined(id);
  assert.equal(row.combined_no,'VP-RTI-202607-000001');assert.equal(row.status,'issued');
  assert.equal(await scalar('select receipt_no from finance_receipts where id=$1',[row.receipt_id]),row.combined_no);
  assert.equal(await scalar('select tax_invoice_no from finance_tax_invoices where id=$1',[row.tax_invoice_id]),row.combined_no);
  assert.deepEqual(await query('select doc_type,last_no from finance_document_counters'),[{doc_type:'receipt_tax_invoice',last_no:1}]);
  require('./combined-document-render-fixture.cjs');
  const tax=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[row.tax_invoice_id]);
  assert.ok(require('../../app/finance/combined-documents/shared.ts').combinedTaxRow(row,tax),'Actual issued PostgreSQL paired evidence decodes in renderer');
  await issue(id); assert.deepEqual(await combined(id),row); assert.deepEqual(await financialState(),before);
  assert.equal((await scalar('select get_finance_document_decision($1)',[p.id])).decision,'complete');
});
test('040 mixed full payment: Receipt full total, Tax only relevant lines, WHT never reduces VAT',async()=>{
  await setup();const {p}=await source([{base:10000,vat:700,rate:7,applicable:true},{base:2000,vat:0,rate:0,applicable:false,treatment:'outside_scope'}]);
  const id=await create(p.id);await save(id);await issue(id);const row=await combined(id);
  assert.equal(await scalar('select settlement_amount from finance_receipts where id=$1',[row.receipt_id]),'12700.00');
  assert.equal(await scalar('select sum(total_amount) from finance_tax_invoice_items where tax_invoice_id=$1',[row.tax_invoice_id]),'10700.00');
  assert.equal(await count('finance_tax_invoice_items'),1);
  assert.equal(row.issued_snapshot_json.tax_invoice.document_lines.length,2);
});
test('040 explicit zero rated combines; explicit non-tax partial is Receipt only; unknown and taxable partial fail closed',async()=>{
  await setup();
  const zero=await source([{base:1000,vat:0,rate:0,applicable:true,treatment:'zero_rated'}]);
  const id=await create(zero.p.id);await save(id);await issue(id);
  const non=await source([{base:2000,vat:0,rate:0,applicable:false,treatment:'exempt'}],1000);
  assert.equal((await scalar('select get_finance_document_decision($1)',[non.p.id])).decision,'receipt_only');
  await rpc('create_finance_receipt_draft_from_payment',[non.p.id,true]);
  await rejects('select create_finance_tax_invoice_draft($1)',[non.p.id],/DOCUMENT_ROUTE_RECEIPT_ONLY/);
  const unknown=await source([{base:2000,vat:0,rate:0,applicable:false}]);
  await rejects('select create_finance_receipt_draft_from_payment($1,true)',[unknown.p.id],/BLOCKED_UNKNOWN/);
  const partial=await source(undefined,5000);
  await rejects('select create_finance_receipt_draft_from_payment($1,true)',[partial.p.id],/BLOCKED_PARTIAL/);
  await rejects('select create_finance_combined_document_draft($1,true,true)',[partial.p.id],/BLOCKED_PARTIAL/);
});
test('040 failed second-side audit rolls back all issued states and counter, retry remains possible',async()=>{
  await setup(); const {p}=await source();const id=await create(p.id);await save(id);
  await db.exec(`create function fixture_fail_audit() returns trigger language plpgsql as $$begin if new.event_type='issued' then raise exception 'FIXTURE_SECOND_SIDE_FAILURE'; end if; return new; end$$;
    create trigger fixture_audit before insert on finance_tax_invoice_audit_events for each row execute function fixture_fail_audit();`);
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,(await combined(id)).draft_snapshot_json],/FIXTURE_SECOND_SIDE/);
  assert.equal((await combined(id)).status,'draft');assert.equal(await count('finance_document_counters'),0);
  assert.equal(await scalar("select count(*) from finance_receipts where status='issued'"),0);
  await db.exec('drop trigger fixture_audit on finance_tax_invoice_audit_events');await issue(id);
});
test('040 permission/private helper boundaries, paired direct Issue/Cancel bypasses, immutable paired history',async()=>{
  await setup();const {p}=await source();const id=await create(p.id);let row=await combined(id);
  await rejects('select issue_finance_receipt($1,true,$2)',[row.receipt_id,{}],/COMBINED_WORKFLOW/);
  await rejects('select cancel_finance_tax_invoice_draft($1,$2)',[row.tax_invoice_id,'Fixture'],/COMBINED_WORKFLOW/);
  await asActor(ids.staff,async()=>{
    await rejects('select create_finance_combined_document_draft($1,true,true)',[p.id],/PERMISSION_DENIED/);
    await rejects('select receipt_create_pre040($1,true)',[p.id],/permission denied/);
    assert.equal((await query('select * from finance_combined_documents')).length,0);
    await rejects('delete from finance_combined_documents',[],/permission denied/);
  });
  await save(id);await issue(id);row=await combined(id);
  await rejects("update finance_combined_documents set combined_no='VP-RTI-202607-999999' where id=$1",[id],/IMMUTABLE/);
  await rejects('select void_finance_receipt($1,$2,true)',[row.receipt_id,'Fixture'],/COMBINED_WORKFLOW/);
});
module.exports={setup,source,create,save,issue,combined};

test('040 exact catalog for operator verification',async()=>{
  await setup();const result=await query(require('./combined-document-workflow.cjs').catalogSql);
  if(process.env.COMBINED_CATALOG==='1')console.log('COMBINED_CATALOG='+JSON.stringify(result));
  else assert.deepEqual(result,require('./combined-document-catalog.json'));
});

test('040 upstream VAT propagates, historical null is preserved, and new unresolved Invoice Issue is blocked',async()=>{
  await setup();
  const q=randomUUID(),f=randomUUID(),b=randomUUID(),c=randomUUID(),i=randomUUID();
  await query('insert into finance_quotation_items(id,vat_applicable,vat_rate,vat_treatment_json) values($1,false,0,$2)',[q,{treatment:'outside_scope',reason:'Written source evidence'}]);
  await query('insert into finance_fee_agreement_items(id,source_quotation_item_id,vat_applicable,vat_rate) values($1,$2,false,0)',[f,q]);
  await query('insert into finance_billing_installment_items(id,fee_agreement_item_id,vat_applicable,vat_rate) values($1,$2,false,0)',[b,f]);
  await query('insert into finance_billable_charges(id,source_billing_installment_item_id,vat_applicable,vat_rate) values($1,$2,false,0)',[c,b]);
  await query('insert into finance_invoice_items(id,source_billable_charge_id,vat_applicable,vat_rate) values($1,$2,false,0)',[i,c]);
  const expected=await scalar('select vat_treatment_json from finance_quotation_items where id=$1',[q]);
  for(const[table,id]of [['finance_fee_agreement_items',f],['finance_billing_installment_items',b],['finance_billable_charges',c],['finance_invoice_items',i]])
    assert.deepEqual(await scalar(`select vat_treatment_json from ${table} where id=$1`,[id]),expected);
  const v1=randomUUID();await query('insert into finance_invoice_items(id,source_fee_agreement_item_id,vat_applicable,vat_rate) values($1,$2,false,0)',[v1,f]);
  assert.deepEqual(await scalar('select vat_treatment_json from finance_invoice_items where id=$1',[v1]),expected);
  await rejects("select finance_vat_treatment($1,true,7)",[{treatment:'outside_scope',reason:'Not compatible'}],/VAT_CONFLICT/);
  const sourceRow=await source([{base:2000,vat:0,rate:0,applicable:false}]);
  assert.equal(await scalar('select vat_treatment_json from finance_invoice_items where id=$1',[sourceRow.items[0].id]),null);
  const charge=randomUUID(); await query('insert into finance_billable_charges(id,vat_applicable,vat_rate) values($1,false,0)',[charge]);
  await query("update finance_invoices set document_status='draft' where id=$1",[sourceRow.id]);
  await query('update finance_invoice_items set source_billable_charge_id=$2,vat_applicable=false,vat_rate=0 where id=$1',[sourceRow.items[0].id,charge]);
  await rejects("update finance_invoices set document_status='issued' where id=$1",[sourceRow.id],/UNKNOWN_TREATMENT_BEFORE_ISSUE/);
});
test('040 historical Receipt and existing Tax coverage recover independently without allocating RTI',async()=>{
  await setup();const {p}=await source();
  const rid=await rpc('receipt_create_pre040',[p.id,true]);
  const rr=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[rid]);
  await rpc('receipt_issue_pre040',[rid,true,rr.draft_snapshot_json]);
  const before=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[rid]);
  assert.equal((await scalar('select get_finance_document_decision($1)',[p.id])).decision,'tax_invoice_completion_only');
  const tid=await rpc('create_finance_tax_invoice_draft',[p.id]);
  let t=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[tid]);
  await rpc('save_finance_tax_invoice_draft',[tid,'2026-07-02',decisions,t.updated_at]);
  t=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[tid]);
  await rpc('issue_finance_tax_invoice',[tid,t.draft_snapshot_json,true,true]);
  assert.deepEqual(await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[rid]),before);
  assert.equal(await scalar("select count(*) from finance_document_counters where doc_type='receipt_tax_invoice'"),0);
  // A trusted historical Tax-only fixture exercises the reverse completion route.
  const other=await source();const taxId=await rpc('prepare_finance_document_tax_draft',[other.p.id]);
  t=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[taxId]);
  await rpc('tax_save_pre040',[taxId,'2026-07-02',decisions,t.updated_at]);
  t=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[taxId]);
  await rpc('tax_issue_pre040',[taxId,t.draft_snapshot_json,true,true]);
  assert.equal((await scalar('select get_finance_document_decision($1)',[other.p.id])).decision,'receipt_completion_only');
  const receiptId=await rpc('create_finance_receipt_draft_from_payment',[other.p.id,true]);
  const receiptRow=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[receiptId]);
  await rpc('issue_finance_receipt',[receiptId,true,receiptRow.draft_snapshot_json]);
});
test('040 external coverage, buyer identity, tax point, stale review and cancellation guard both domains',async()=>{
  await setup();const {p}=await source();
  await rejects('select create_finance_combined_document_draft($1,true,false)',[p.id],/EXTERNAL_CHECK/);
  const id=await create(p.id);
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,(await combined(id)).draft_snapshot_json],/CUSTOMER_IDENTITY|TAX_POINT|EXTERNAL_COVERAGE/);
  const old=(await combined(id)).draft_snapshot_json;await save(id);
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,old],/STALE_REVIEW/);
  await rpc('cancel_finance_combined_document_draft',[id,'Synthetic no longer needed']);
  assert.equal((await combined(id)).status,'cancelled');assert.equal(await count('finance_document_counters'),0);
  const next=await create(p.id);assert.notEqual(next,id);await save(next);await issue(next);
  await rejects('select cancel_finance_combined_document_draft($1,$2)',[next,'Not allowed'],/CORRECTION_WORKFLOW/);
});

test('040 editing upstream VAT facts clears stale treatment but never becomes historical null',async()=>{
  await setup();const id=randomUUID();
  await query('insert into finance_quotation_items(id,vat_applicable,vat_rate) values($1,true,7)',[id]);
  await query('update finance_quotation_items set vat_applicable=false,vat_rate=0 where id=$1',[id]);
  assert.equal((await scalar('select vat_treatment_json from finance_quotation_items where id=$1',[id])).treatment,'unknown');
  await query('update finance_quotation_items set vat_treatment_json=$2 where id=$1',[id,{schema_version:1,treatment:'exempt',reason:'Explicit review'}]);
  assert.equal((await scalar('select vat_treatment_json from finance_quotation_items where id=$1',[id])).treatment,'exempt');
  await query('update finance_quotation_items set vat_applicable=true,vat_rate=7 where id=$1',[id]);
  assert.equal((await scalar('select vat_treatment_json from finance_quotation_items where id=$1',[id])).treatment,'standard_rate');
});
test('040 multiple relevant lines freeze exact full tax coverage and separate WHT remains settlement only',async()=>{
  await setup();const multi=await source([{base:1000,vat:70,rate:7,applicable:true},{base:500,vat:0,rate:0,applicable:true,treatment:'zero_rated'}]);
  const id=await create(multi.p.id);await save(id);await issue(id);
  assert.equal(await count('finance_tax_invoice_items'),2);
  assert.equal(await scalar("select count(*) from finance_tax_invoice_source_coverages where status='issued'"),2);
  const wht=await source([{base:4672.90,vat:327.10,rate:7,applicable:true}],null,140.19);
  const before=await financialState(),w=await create(wht.p.id);await save(w);await issue(w);
  const row=await combined(w);
  assert.equal(Number(row.issued_snapshot_json.receipt.payment.cash_amount),4859.81);
  assert.equal(Number(row.issued_snapshot_json.tax_invoice.invoice_item.vat_amount),327.10);
  assert.deepEqual(await financialState(),before);
});
test('040 refresh resets stale decisions and preserves pairing without allocating numbers',async()=>{
  await setup();const {p}=await source(),id=await create(p.id);await save(id);
  const previous=await combined(id);
  await rpc('refresh_finance_combined_document_draft',[id,previous.updated_at]);
  assert.deepEqual(await combined(id),previous,'Unchanged refresh is a true no-op');
  await db.exec("update finance_company_profiles set phone='02-999-9999' where id='default'");
  await rpc('refresh_finance_combined_document_draft',[id,previous.updated_at]);
  const current=await combined(id);assert.equal(current.receipt_id,previous.receipt_id);assert.equal(current.tax_invoice_id,previous.tax_invoice_id);
  assert.deepEqual(current.decisions_json,{});assert.equal(await count('finance_document_counters'),0);
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,previous.draft_snapshot_json],/STALE_REVIEW/);
});
test('040 post-apply operator query returns one row and all local catalog/security checks pass',async()=>{
  await setup();const fs=require('node:fs');
  const rows=await query(fs.readFileSync(require('node:path').join(__dirname,'../sql/verify_combined_receipt_tax_invoice.sql'),'utf8'));
  assert.equal(rows.length,1);assert.deepEqual(rows[0].catalog_differences,[]);assert.deepEqual(rows[0].function_differences,[]);
  // This isolated database deliberately does not contain the protected Production IDs.
  assert.deepEqual(rows[0].failed_checks,['protected_invoice','protected_payment','protected_receipt']);
});
test('040 rollback-only operator rehearsal leaves the exact predecessor catalog intact',async()=>{
  await setup(false);const fs=require('node:fs'),path=require('node:path');
  const read=n=>fs.readFileSync(path.join(__dirname,'../sql/'+n),'utf8');
  const pre=await query(read('preflight_combined_receipt_tax_invoice.sql'));
  assert.equal(pre.length,1);assert.equal(pre[0].checks.external_manual_vp_rti_gate,false);
  const result=await db.exec(read('dry_run_combined_receipt_tax_invoice.sql'));
  const verification=result.find(r=>r.rows[0]?.combined_receipt_tax_invoice_foundation_verification_pass!==undefined);
  assert.ok(verification);assert.deepEqual(verification.rows[0].catalog_differences,[]);
  assert.equal(await scalar("select to_regclass('public.finance_combined_documents')::text"),null);
  assert.equal(await scalar("select count(*) from information_schema.columns where column_name='vat_treatment_json' and table_schema='public'"),0);
});
test('040 delegated authority requires both domains and allocator cannot be called directly',async()=>{
  await setup();const {p}=await source();
  await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{await rejects('select create_finance_combined_document_draft($1,true,true)',[p.id],/PERMISSION_DENIED/);});
  await query('update user_profiles set can_manage_finance_receipts=true where id=$1',[ids.staff]);
  let id;await asActor(ids.staff,async()=>{id=await create(p.id);await save(id);await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,(await combined(id)).draft_snapshot_json],/PERMISSION_DENIED/);});
  await query('update user_profiles set can_issue_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,(await combined(id)).draft_snapshot_json],/PERMISSION_DENIED/);});
  await query('update user_profiles set can_issue_finance_receipts=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{
    await rejects("select generate_finance_document_no('receipt_tax_invoice','2026-07-02')",[],/permission denied/);
    await issue(id);
  });
  assert.equal((await combined(id)).status,'issued');
});
