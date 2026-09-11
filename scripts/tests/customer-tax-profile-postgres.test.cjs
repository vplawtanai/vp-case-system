/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only; no network or Production credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const prior=require('./combined-document-postgres.test.cjs');
const {db,query,scalar,count,rpc,rejects,asActor,ids,migration,financialState,flush,createReceipt,issueReceipt}=require('./receipt-foundation.test.cjs');
async function setup(apply=true) {
  await prior.setup(); await db.exec(migration('41'));
  await clientSchema();
  if(apply)await db.exec(migration('42'));
}
async function clientSchema() {
  // Original Client DDL predates checked-in migrations; use the exact columns
  // read/written by the current Client page, validated again by preflight.
  await db.exec("alter table clients add column address text,add column client_type text,add column status text; update clients set address='Reviewed Client Address',client_type='individual',status='active'");
  await db.exec('alter table clients drop column billing_address');
}
const get=()=>scalar('select get_finance_customer_tax_profile($1)',[ids.client]);
async function saveArgs(args) { const result=await scalar('select save_finance_customer_tax_profile($1,$2,$3,$4,$5,$6,$7,$8)',args);await flush();return result; }
async function save(overrides={}) {
  const current=await get();
  return saveArgs([ids.client,overrides.vat??false,overrides.branch??null,overrides.code??null,
    overrides.evidence??'Customer written tax identity evidence',overrides.verified??true,current.identity,current.profile?.updated_at??null]);
}
const decision=p=>scalar('select get_finance_document_decision($1)',[p.id]);
const buyerBlocked=d=>d.blockers.includes('TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED');

test('042 individual unregistered profile clears only the identity blocker without changing existing Client/Invoice/Payment or creating documents',async()=>{
  await setup(); const {p,id}=await prior.source(); const before=await financialState();
  const original=await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[id]);
  const client=await scalar('select to_jsonb(c) from clients c where id=$1',[ids.client]);
  assert.ok(buyerBlocked(await decision(p)));
  const result=await save(); assert.equal(result.status,'verified');assert.equal(result.profile.branch_type,null);
  const d=await decision(p); assert.equal(d.decision,'combined_receipt_tax_invoice');assert.equal(buyerBlocked(d),false);
  assert.deepEqual(d.blockers,['TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED','TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED']);
  assert.deepEqual(await financialState(),before); assert.deepEqual(await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[id]),original);
  assert.deepEqual(await scalar('select to_jsonb(c) from clients c where id=$1',[ids.client]),client);
  for(const t of ['finance_combined_documents','finance_receipts','finance_tax_invoices'])assert.equal(await count(t),0);
});
test('042 registered branch requirements depend on VAT status, including registered individuals, never fabricated entity semantics',async()=>{
  await setup(); const {p}=await prior.source();
  await rejects('select save_finance_customer_tax_profile($1,true,null,null,null,true,$2,null)',[ids.client,(await get()).identity],/REGISTERED_IDENTITY_REQUIRED/);
  await save({vat:true,branch:'head_office',code:'00000'});assert.equal(buyerBlocked(await decision(p)),false);
  await query("update clients set client_type='limited_company' where id=$1",[ids.client]);assert.equal((await get()).status,'stale');
  assert.ok(buyerBlocked(await decision(p)));
  for(const code of ['00000','001','123456','ABCDE'])await rejects('select save_finance_customer_tax_profile($1,true,\'branch\',$2,null,true,$3,$4)',[ids.client,code,(await get()).identity,(await get()).profile.updated_at],/BRANCH_INVALID/);
  for(const [branch,code] of [['branch',null],[null,'00000'],['invalid','12345']])await rejects('select save_finance_customer_tax_profile($1,true,$2,$3,null,false,$4,$5)',[ids.client,branch,code,(await get()).identity,(await get()).profile.updated_at],/BRANCH_INVALID/);
  await save({vat:true,branch:'branch',code:'00012'});assert.equal(buyerBlocked(await decision(p)),false);
  await query("update clients set tax_id='bad' where id=$1",[ids.client]);
  await rejects('select save_finance_customer_tax_profile($1,true,\'head_office\',\'00000\',null,true,$2,$3)',[ids.client,(await get()).identity,(await get()).profile.updated_at],/REGISTERED_IDENTITY_REQUIRED/);
});
test('042 unknown/unverified profile and missing supplemental evidence remain blocked; no document-level override',async()=>{
  await setup(); const s=await prior.source();
  await saveArgs([ids.client,null,null,null,null,false,(await get()).identity,null]);
  assert.ok(buyerBlocked(await decision(s.p))); await save({verified:false}); assert.ok(buyerBlocked(await decision(s.p)));
  const source=await scalar('select build_finance_document_tax_source($1)',[s.p.id]);
  await rejects('select finance_tax_invoice_draft_snapshot($1,$2,current_date)',[source,{buyer_vat_registered:false}],/OVERRIDE_BLOCKED/);
  s.snapshot.customer.address=null;s.snapshot.customer.tax_id=null;s.snapshot.customer.branch=null;
  await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[s.id,s.snapshot]);
  await save({evidence:''});assert.ok(buyerBlocked(await decision(s.p)),'039 supplemental evidence guard remains authoritative');
  await save();assert.equal(buyerBlocked(await decision(s.p)),false);
});
test('042 profile changes freeze separately, stale review blocks Issue, refresh uses new profile, issued snapshots remain immutable',async()=>{
  await setup(); const s=await prior.source();await save();
  const invoiceBefore=await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[s.id]);
  const id=await prior.create(s.p.id);await prior.save(id,{no_earlier_event:true,external_coverage_checked:true});
  const draft=await prior.combined(id);assert.equal(draft.draft_snapshot_json.customer.address,'Reviewed Client Address');
  assert.deepEqual(draft.source_snapshot_json.invoice_snapshot,s.snapshot);
  await save({evidence:'Updated evidence reference'});
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,draft.draft_snapshot_json],/DOCUMENT_SOURCE_CHANGED/);
  await rpc('refresh_finance_combined_document_draft',[id,draft.updated_at]);
  await prior.save(id,{no_earlier_event:true,external_coverage_checked:true});await prior.issue(id);
  const issued=await prior.combined(id);await save({evidence:'Later review'});
  assert.deepEqual(await prior.combined(id),issued);
  assert.deepEqual(await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[s.id]),invoiceBefore);
  assert.equal(issued.issued_snapshot_json.tax_invoice.buyer_tax_profile.profile.identity_evidence,'Updated evidence reference');
});
test('042 old frozen tax sources and historical Receipt behavior retain predecessor semantics',async()=>{
  await setup(false);const s=await prior.source();const oldSource=await scalar('select build_finance_document_tax_source($1)',[s.p.id]);
  const choices={buyer_vat_registered:true,no_earlier_event:true,external_coverage_checked:true};
  const oldSnapshot=await scalar('select finance_tax_invoice_draft_snapshot($1,$2,\'2026-07-02\')',[oldSource,choices]);
  const receiptSource=await scalar('select build_finance_receipt_source($1)',[s.p.id]);
  await db.exec(migration('42'));await save();
  assert.deepEqual(await scalar('select finance_tax_invoice_draft_snapshot($1,$2,\'2026-07-02\')',[oldSource,choices]),oldSnapshot);
  assert.deepEqual(await scalar('select build_finance_receipt_source($1)',[s.p.id]),receiptSource);
});
test('042 authorized save is atomic/idempotent, concurrent stale edits fail, audit immutable, RLS and private helpers closed',async()=>{
  await setup();const old=await get();const saved=await save();await save();assert.equal(await count('finance_customer_tax_profile_audit_events'),1);
  await rejects('select save_finance_customer_tax_profile($1,false,null,null,null,true,$2,null)',[ids.client,old.identity],/STALE/);
  await rejects('update finance_customer_tax_profile_audit_events set event_payload_json=\'{}\'',[],/AUDIT_IMMUTABLE/);
  await asActor(ids.staff,async()=>{
    await rejects('select get_finance_customer_tax_profile($1)',[ids.client],/PERMISSION_DENIED/);
    assert.equal((await query('select * from finance_customer_tax_profiles')).length,0);
  });
  await query('update user_profiles set can_view_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{
    assert.equal((await get()).status,'verified');
    await rejects('select save_finance_customer_tax_profile($1,false,null,null,null,true,$2,$3)',[ids.client,saved.identity,saved.profile.updated_at],/PERMISSION_DENIED/);
    await rejects('select finance_customer_tax_identity($1)',[ids.client],/permission denied/);
    await rejects('delete from finance_customer_tax_profiles',[],/permission denied/);
  });
  await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{await save({evidence:'Authorized reviewer'});await rejects('update finance_customer_tax_profiles set vat_registered=true',[],/permission denied/);});
  await query("update clients set address='Changed while editor open' where id=$1",[ids.client]);
  await rejects('select save_finance_customer_tax_profile($1,false,null,null,null,true,$2,$3)',[ids.client,saved.identity,(await get()).profile.updated_at],/CLIENT_CHANGED/);
});

module.exports={setup};

test('042 standalone completion after issued Receipt freezes current tax profile separately; no rewrite of Receipt or Invoice',async()=>{
  // Historical standalone Receipt was legitimately issued before the 040 route guard.
  await prior.setup(false);const s=await prior.source();const receiptId=await createReceipt(s.p.id);await issueReceipt(receiptId);
  await db.exec(migration('40'));await db.exec(migration('41'));await clientSchema();await db.exec(migration('42'));
  const receiptBefore=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[receiptId]);
  const invoiceBefore=await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[s.id]);
  const financialBefore=await financialState();
  await save({vat:true,branch:'branch',code:'00012'});assert.equal((await decision(s.p)).decision,'tax_invoice_completion_only');
  const tax=await rpc('create_finance_tax_invoice_draft',[s.p.id]);
  const getTax=()=>scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[tax]);
  await rpc('save_finance_tax_invoice_draft',[tax,'2026-07-02',{no_earlier_event:true,external_coverage_checked:true},(await getTax()).updated_at]);
  await rpc('issue_finance_tax_invoice',[tax,(await getTax()).draft_snapshot_json,true,true]);
  const issued=await getTax();assert.equal(issued.issued_snapshot_json.customer.branch_code,'00012');
  await save({vat:false});assert.deepEqual(await getTax(),issued);
  assert.deepEqual(await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[receiptId]),receiptBefore);
  assert.deepEqual(await scalar('select to_jsonb(i) from finance_invoices i where id=$1',[s.id]),invoiceBefore);
  assert.deepEqual(await financialState(),financialBefore);
});

test('042 exact operator artifacts compile, report catalog/function drift and roll back without touching protected data',async()=>{
  await setup(false);
  const {workflow,catalogSql}=require('./customer-tax-profile-artifacts.cjs');
  const pre=workflow()['scripts/sql/preflight_customer_tax_identity.sql'];
  const before=await query(pre);assert.equal(before.length,1);
  assert.equal(before[0].checks['042_unused'],true);
  assert.equal(before[0].checks.predecessor_contracts_exact,true,JSON.stringify(before[0].function_differences));
  assert.equal(before[0].checks.no_competing_profile_to_review,true);
  await db.exec('alter table clients add column billing_address text');
  assert.ok((await query(pre))[0].competing_client_fields.includes('billing_address'),'Unknown competing Client fields must stop for review');
  await rejects(migration('42').split('$preflight$;')[0]+'$preflight$;',[],/COMPETING_SCHEMA_REVIEW_REQUIRED/);
  await db.exec('alter table clients drop column billing_address');
  const financialBefore=await financialState();
  await db.exec('savepoint candidate042');await db.exec(migration('42'));
  const actual=await query(catalogSql);
  const manifest=path.resolve(__dirname,'customer-tax-profile-catalog.json');
  if(process.env.UPDATE_CUSTOMER_TAX_MANIFEST==='1')fs.writeFileSync(manifest,JSON.stringify(actual,null,2)+'\n');
  assert.deepEqual(actual,JSON.parse(fs.readFileSync(manifest,'utf8')));
  const artifacts=workflow(),verified=(await query(artifacts['scripts/sql/verify_customer_tax_identity.sql']))[0];
  for(const [name,passed] of Object.entries(verified.checks))if(!name.startsWith('protected_')&&name!=='no_competing_profile_to_review')assert.equal(passed,true,name+': '+JSON.stringify(verified.function_differences));
  assert.deepEqual(verified.catalog_differences,[]);assert.deepEqual(await financialState(),financialBefore);
  await db.exec('alter table finance_customer_tax_profiles add column unexpected text');
  const drift=(await query(artifacts['scripts/sql/verify_customer_tax_identity.sql']))[0];assert.equal(drift.checks.exact_catalog,false);assert.equal(drift.catalog_differences[0].table_name,'finance_customer_tax_profiles');
  await db.exec('rollback to savepoint candidate042');
  const dry=artifacts['scripts/sql/dry_run_customer_tax_identity.sql'];
  assert.ok(dry.startsWith('BEGIN;'));assert.ok(dry.endsWith('ROLLBACK;\n'));
  // Test framework owns the outer transaction; translate only the two wrapper commands to a savepoint.
  await db.exec(dry.replace(/^BEGIN;/,'SAVEPOINT operator_dry_run;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator_dry_run;'));
  assert.equal(await scalar("select to_regclass('public.finance_customer_tax_profiles')"),null);assert.deepEqual(await financialState(),financialBefore);
});
