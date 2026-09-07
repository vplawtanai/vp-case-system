/* eslint-disable @typescript-eslint/no-require-imports */
// Exact 037/038/039 migrations; in-memory PostgreSQL only, never Supabase.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {db,query,scalar,count,rpc,rejects,asActor,ids,invoice,payment,financialState,createReceipt,issueReceipt,migration,root}=require('./receipt-foundation.test.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const day='2026-07-02';
const decisions={tax_treatment:'standard_rated',buyer_vat_registered:true,no_earlier_event:true,external_coverage_checked:true};
const taxRow=id=>scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[id]);
const save=async(id,d=decisions,date=day)=>rpc('save_finance_tax_invoice_draft',[id,date,d,(await taxRow(id)).updated_at]);
const issue=async(id,delayed=true)=>rpc('issue_finance_tax_invoice',[id,(await taxRow(id)).draft_snapshot_json,true,delayed]);
async function setup(applyFoundation=true){
  await db.exec(`create schema storage; create table storage.buckets(id text primary key,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,version text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
    insert into storage.buckets values('vp-document-assets',false);
    insert into storage.objects(bucket_id,name,metadata,version) values('vp-document-assets','company/logo/test.png','{"mimetype":"image/png"}','test-version');
    alter table finance_company_profiles add column logo_storage_path text;
    update finance_company_profiles set logo_storage_path='company/logo/test.png',branch_th='สำนักงานใหญ่';`);
  const prior=fs.readFileSync(path.join(root,'supabase/migrations/202607090005_document_settings_and_vp_qt_prefix.sql'),'utf8');
  await db.exec(definition(prior,'current_user_is_admin'));
  await db.exec(prior.slice(prior.indexOf('drop policy if exists "finance document asset managers read"'),prior.indexOf('create or replace function public.set_finance_authorized_signer_default')));
  await db.exec(migration('38'));
  try { if(applyFoundation)await db.exec(migration('39')); }
  catch(error){throw new Error(`${error.message}; position=${error.position}; internal=${error.internalQuery}; context=${error.where}`,{cause:error});}
}
async function source(options={}){
  const i=await invoice(5000);
  i.snapshot.items[0].invoice_item.vat_rate=7;
  Object.assign(i.snapshot.customer,options.customer||{});
  if(options.multi)i.snapshot.items.push({...i.snapshot.items[0]});
  await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[i.id,i.snapshot]);
  const cash=options.partial?2000:4859.81,wht=options.partial?0:140.19;
  const p=await payment({cash,wht,allocations:[{invoice:i,cash,wht}]});return {i,p};
}
test('039 applies, full structured WHT flow preserves financial and Receipt evidence, issue retry is idempotent',async()=>{
  await setup();const {p}=await source();const receipt=await createReceipt(p.id);await issueReceipt(receipt);
  const before=await financialState();const receipts=await scalar('select jsonb_agg(to_jsonb(r)) from finance_receipts r');
  const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  assert.equal(await rpc('create_finance_tax_invoice_draft',[p.id]),id);
  assert.equal((await taxRow(id)).tax_invoice_no,null);
  await save(id);await issue(id);const issued=await taxRow(id);
  assert.equal(issued.tax_invoice_no,'VP-TI-202607-000001');
  assert.equal(issued.issued_snapshot_json.invoice_item.vat_amount,327.10);
  assert.equal(issued.issued_snapshot_json.payment.cash_amount,4859.81);
  assert.equal(issued.issued_snapshot_json.payment.wht_amount,140.19);
  assert.equal(issued.issued_snapshot_json.tax_point.date,'2026-07-01');
  assert.equal(require('./tax-invoice-render-fixture.cjs').shared.taxPresentation(issued).ok,true,'Actual PostgreSQL issued snapshot decodes in the customer renderer');
  await issue(id);assert.deepEqual(await taxRow(id),issued);
  assert.equal(await count('finance_tax_invoice_items'),1);assert.equal(await scalar("select count(*) from finance_tax_invoice_source_coverages where status='issued'"),1);
  assert.deepEqual(await financialState(),before);assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(r)) from finance_receipts r'),receipts);
});
test('039 missing address/unknown buyer VAT status blocks Issue; supplement is explicit and never changes Client or Invoice',async()=>{
  await setup();const {p}=await source({customer:{address:null,tax_id:null,branch:null}});const before=await financialState();
  const id=await rpc('create_finance_tax_invoice_draft',[p.id]);await save(id);
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/CUSTOMER_IDENTITY_REQUIRED/);
  assert.equal(await count('finance_document_counters'),0);
  await save(id,{...decisions,buyer_vat_registered:false,customer_address:'Verified fixture address',identity_evidence:'Customer written instruction, fixture only'});
  await issue(id);assert.deepEqual(await financialState(),before);
});
test('039 explicit decisions and delayed issuance are required, no silent date change or number allocation',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  for(const [key,message] of [['no_earlier_event','TAX_POINT_APPROVAL'],['external_coverage_checked','EXTERNAL_COVERAGE'],['tax_treatment','VAT_TREATMENT']]){
    const d={...decisions};delete d[key];await save(id,d);
    await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],new RegExp(message));
  }
  await save(id);
  await rejects('select issue_finance_tax_invoice($1,$2,true,false)',[id,(await taxRow(id)).draft_snapshot_json],/DELAY_ACK/);
  await rejects('select save_finance_tax_invoice_draft($1,$2,$3,$4)',[id,'2026-06-30',decisions,(await taxRow(id)).updated_at],/ISSUE_DATE_INVALID/);
  await rejects('select save_finance_tax_invoice_draft($1,$2,$3,$4)',[id,'2999-01-01',decisions,(await taxRow(id)).updated_at],/ISSUE_DATE_INVALID/);
  assert.equal(await count('finance_document_counters'),0);assert.equal((await taxRow(id)).issue_date,day);
});
test('039 partial, multi-line and V1 sources cannot reserve or issue',async()=>{
  await setup();const {p}=await source({partial:true});
  await rejects('select create_finance_tax_invoice_draft($1)',[p.id],/PARTIAL_PAYMENT/);
  const i=await invoice(5000);i.snapshot.items.push(i.snapshot.items[0]);await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[i.id,i.snapshot]);
  const multi=await payment({allocations:[{invoice:i,cash:5000,wht:0}]});
  await rejects('select create_finance_tax_invoice_draft($1)',[multi.id],/MULTILINE/);
  await query("update finance_invoices set source_model='installment_v1' where id=$1",[i.id]);
  await rejects('select create_finance_tax_invoice_draft($1)',[multi.id],/V2_ISSUED/);
  assert.equal(await count('finance_tax_invoices'),0);
});
test('039 frozen identity cannot be rewritten; VAT never inferred from economic classification',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  await rejects('select save_finance_tax_invoice_draft($1,$2,$3,$4)',[id,day,{...decisions,customer_address:'Rewritten'},(await taxRow(id)).updated_at],/FROZEN_IDENTITY/);
  await save(id,{...decisions,tax_treatment:'zero_rated',treatment_reason:'Fixture'});
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/VAT_TREATMENT/);
});
test('039 cancellation releases coverage, preserves history, and allows a new unnumbered Draft',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  await rpc('cancel_finance_tax_invoice_draft',[id,'Fixture cancellation']);
  const next=await rpc('create_finance_tax_invoice_draft',[p.id]);assert.notEqual(next,id);
  assert.equal(await count('finance_document_counters'),0);
  assert.equal(await scalar("select count(*) from finance_tax_invoice_source_coverages where status='released'"),1);
  await save(next);await issue(next);await rejects('select cancel_finance_tax_invoice_draft($1,$2)',[next,'Fixture'],/DRAFT_REQUIRED/);
  await rejects('delete from finance_tax_invoices where id=$1',[next],/HISTORY_IMMUTABLE/);
  await rejects("update finance_tax_invoices set issue_date='2026-07-03' where id=$1",[next],/HISTORY_IMMUTABLE/);
});
test('039 authority, RLS, internal-helper denial and non-escalating profile permissions',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  await db.exec('grant select,update on user_profiles to authenticated');
  await asActor(ids.staff,async()=>{
    assert.equal((await query('select * from finance_tax_invoices')).length,0);
    await rejects('select create_finance_tax_invoice_draft($1)',[p.id],/PERMISSION_DENIED/);
    await rejects('select build_finance_tax_invoice_source($1)',[p.id],/permission denied/);
    await rejects("select generate_finance_document_no('tax_invoice',current_date)",[],/permission denied/);
    await rejects('delete from finance_tax_invoices',[],/permission denied/);
    await rejects('update user_profiles set can_issue_finance_tax_invoices=true where id=$1',[ids.staff],/ADMIN_REQUIRED/);
  });
  await query('update user_profiles set can_view_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{
    assert.equal((await query('select id from finance_tax_invoices where id=$1',[id])).length,1);
    assert.equal((await query("select id from storage.objects where name='company/logo/test.png'")).length,1);
    await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/PERMISSION_DENIED/);
  });
});
test('039 active tax evidence blocks upstream reversal/reallocation/Invoice Void and releases Draft-only dependency after cancel',async()=>{
  await setup();const {p,i}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);
  for(const fn of ['assert_finance_payment_has_no_downstream_dependencies','assert_finance_erroneous_payment_correction_dependencies'])
    await rejects(`select ${fn}($1)`,[p.id],/TAX_INVOICE_ACTIVE_DEPENDENCY/);
  await rejects('select assert_finance_invoice_has_no_void_dependencies($1)',[i.id],/TAX_INVOICE_ACTIVE_DEPENDENCY/);
  await rejects('select assert_finance_payment_reallocation_dependencies($1,$2,$2)',[p.id,i.id],/TAX_INVOICE_ACTIVE_DEPENDENCY/);
  await rpc('cancel_finance_tax_invoice_draft',[id,'Fixture cancellation']);
  await query('select assert_finance_payment_has_no_downstream_dependencies($1)',[p.id]);
});
test('039 stale review/source and missing logo fail without number consumption; issued evidence ignores current logo',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);const old=await taxRow(id);await save(id);
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,old.draft_snapshot_json],/STALE_REVIEW/);
  await query("update finance_company_profiles set phone='Changed fixture'");
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/SOURCE_CHANGED/);
  await rpc('refresh_finance_tax_invoice_draft',[id,(await taxRow(id)).updated_at]);await save(id);await issue(id);
  const issued=await taxRow(id);await query("update finance_company_profiles set logo_storage_path='company/logo/other.png'");
  await issue(id);assert.deepEqual(await taxRow(id),issued);
});
module.exports={setup,source,taxRow,save,issue};

test('039 catalog manifest from exact isolated DDL',async()=>{
  await setup();
  const manifest=await query(`select c.relname as name,
    (select jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
      'has_default',d.oid is not null,'default_expression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'valid',con.convalidated,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype <> 'n') as constraints,
    (select jsonb_agg(jsonb_build_object('name',idx.relname,'unique',i.indisunique,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) order by idx.relname) from pg_index i join pg_class idx on idx.oid=i.indexrelid where i.indrelid=c.oid) as indexes
    from pg_class c where c.relnamespace='public'::regnamespace and c.relname=any($1) order by c.relname`,[require('./tax-invoice-workflow.cjs').tableNames]);
  if(process.env.TAX_INVOICE_MANIFEST==='1')console.log('CATALOG_JSON='+JSON.stringify(manifest));
  else assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(root,'scripts/tests/tax-invoice-catalog.json'),'utf8')));
});

test('039 PostgreSQL 17-style catalog projection reproduces the old NOT NULL mismatch without weakening column checks',async()=>{
  await setup();
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/tests/tax-invoice-catalog.json'),'utf8'));
  const live=await query(`select cl.relname as name,
    jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'valid',c.convalidated,'definition',pg_get_constraintdef(c.oid)) order by c.conname) as constraints
    from pg_constraint c join pg_class cl on cl.oid=c.conrelid
    where c.conrelid=any($1::regclass[]) group by cl.relname order by cl.relname`,[manifest.map(t=>'public.'+t.name)]);
  const version=Number(await scalar("select current_setting('server_version_num')"));
  // This is a catalog-shape projection, not a claim that PGlite runs PostgreSQL 17.
  const pg17=live.map(t=>({...t,constraints:t.constraints.filter(c=>c.type!=='n')}));
  assert.deepEqual(pg17,manifest.map(({name,constraints})=>({name,constraints})));
  const notNull=live.flatMap(t=>t.constraints.filter(c=>c.type==='n'));
  assert.equal(notNull.length,version>=180000?40:0);
  assert.equal(manifest.flatMap(t=>t.columns).filter(c=>c.not_null).length,40);
  if(version>=180000){
    const oldExact=await scalar(`select bool_and(e.value->'constraints'=a.value->'constraints')
      from jsonb_array_elements($1::jsonb) e join jsonb_array_elements($2::jsonb) a on e.value->>'name'=a.value->>'name'`,[live,pg17]);
    assert.equal(oldExact,false,'The old exact-array check rejects unchanged DDL under the older catalog shape');
  }
});

test('039 verifier reports exact nullability, default, type, column, FK, check, unique, PK and index differences',async()=>{
  await setup();
  const sql=fs.readFileSync(path.join(root,'scripts/sql/verify_finance_tax_invoice_foundation.sql'),'utf8');
  const original=(await query(sql))[0];
  assert.equal(original.checks.exact_tables_columns_constraints_indexes,true);
  assert.deepEqual(original.catalog_differences,[]);
  const cases=[
    ['alter table finance_tax_invoices alter column status drop not null',
      {table_name:'finance_tax_invoices',category:'columns',object_name:'status',property:'not_null',expected:true,actual:false,reason:'property_mismatch'}],
    ["alter table finance_tax_invoices alter column status set default 'issued'",
      {table_name:'finance_tax_invoices',category:'columns',object_name:'status',property:'default_expression',expected:"'draft'::text",actual:"'issued'::text",reason:'property_mismatch'}],
    ['alter table finance_tax_invoices alter column status drop default',
      {table_name:'finance_tax_invoices',category:'columns',object_name:'status',property:'has_default',expected:true,actual:false,reason:'property_mismatch'}],
    ['alter table finance_tax_invoices alter column tax_invoice_no type varchar(80)',
      {table_name:'finance_tax_invoices',category:'columns',object_name:'tax_invoice_no',property:'type',expected:'text',actual:'character varying(80)',reason:'property_mismatch'}],
    ['alter table finance_tax_invoices rename column issue_date to fixture_issue_date',
      {table_name:'finance_tax_invoices',category:'columns',object_name:'issue_date',property:null,actual:null,reason:'missing_object'}],
    ['alter table finance_tax_invoices add column fixture_extra text',
      {table_name:'finance_tax_invoices',category:'columns',object_name:'fixture_extra',property:null,expected:null,reason:'unexpected_object'}],
    ['alter table finance_tax_invoice_audit_events drop constraint finance_tax_invoice_audit_events_actor_user_id_fkey',
      {table_name:'finance_tax_invoice_audit_events',category:'constraints',object_name:'finance_tax_invoice_audit_events_actor_user_id_fkey',property:null,actual:null,reason:'missing_object'}],
    ['alter table finance_tax_invoice_items drop constraint finance_tax_invoice_items_vat_amount_check',
      {table_name:'finance_tax_invoice_items',category:'constraints',object_name:'finance_tax_invoice_items_vat_amount_check',property:null,actual:null,reason:'missing_object'}],
    ['alter table finance_tax_point_events drop constraint finance_tax_point_events_tax_invoice_id_key',
      {table_name:'finance_tax_point_events',category:'constraints',object_name:'finance_tax_point_events_tax_invoice_id_key',property:null,actual:null,reason:'missing_object'}],
    ['alter table finance_tax_invoice_audit_events drop constraint finance_tax_invoice_audit_events_pkey',
      {table_name:'finance_tax_invoice_audit_events',category:'constraints',object_name:'finance_tax_invoice_audit_events_pkey',property:null,actual:null,reason:'missing_object'}],
    ['drop index tax_invoice_full_line_coverage',
      {table_name:'finance_tax_invoice_source_coverages',category:'indexes',object_name:'tax_invoice_full_line_coverage',property:null,actual:null,reason:'missing_object'}],
    ['create index fixture_extra_index on finance_tax_invoice_audit_events(created_at)',
      {table_name:'finance_tax_invoice_audit_events',category:'indexes',object_name:'fixture_extra_index',property:null,expected:null,reason:'unexpected_object'}],
  ];
  for(const [ddl,expected] of cases){
    await db.exec('savepoint catalog_difference_fixture');
    try{
      await db.exec(ddl);
      const result=(await query(sql))[0];
      assert.equal(result.checks.exact_tables_columns_constraints_indexes,false,ddl);
      assert.ok(result.failed_checks.includes('exact_tables_columns_constraints_indexes'),ddl);
      assert.ok(result.catalog_differences.some(d=>Object.entries(expected).every(([key,value])=>d[key]===value)),JSON.stringify({ddl,expected,actual:result.catalog_differences}));
      assert.equal(result.tax_invoice_foundation_verification_pass,false,ddl);
    }finally{await db.exec('rollback to savepoint catalog_difference_fixture; release savepoint catalog_difference_fixture');}
    assert.deepEqual((await query(sql))[0].catalog_differences,[],ddl+' rolled back');
  }
  assert.ok(Object.values((await query(sql))[0].tax_foundation_rows).every(n=>Number(n)===0));
});

test('039 manual preflight/verifier compile, detect tampering, and exact dry-run rolls back schema',async()=>{
  await setup(false);
  const pre=await query(fs.readFileSync(path.join(root,'scripts/sql/preflight_finance_tax_invoice_foundation.sql'),'utf8'));
  assert.equal(pre.length,1);assert.deepEqual(pre[0].failed_checks.filter(name=>!name.startsWith('protected_')),[]);
  await db.exec('savepoint rehearsal');
  const dry=fs.readFileSync(path.join(root,'scripts/sql/dry_run_finance_tax_invoice_foundation.sql'),'utf8');
  const results=await db.exec(dry.replace(/^BEGIN;/,'').replace(/ROLLBACK;\s*$/,'ROLLBACK TO SAVEPOINT rehearsal;'));
  const result=results.find(result=>result.rows?.[0]?.tax_invoice_foundation_verification_pass!==undefined)?.rows[0];
  assert.ok(result);assert.deepEqual(result.failed_checks.filter(name=>!name.startsWith('protected_')),[]);
  assert.deepEqual(result.catalog_differences,[]);
  assert.ok(result.catalog_server_version_num>=170000);
  assert.ok(Object.values(result.tax_foundation_rows).every(n=>Number(n)===0));
  assert.equal(await scalar("select to_regclass('public.finance_tax_invoices')"),null);
  await db.exec(migration('39'));
  await db.exec('alter table finance_tax_invoices disable row level security');
  const bad=(await query(fs.readFileSync(path.join(root,'scripts/sql/verify_finance_tax_invoice_foundation.sql'),'utf8')))[0];
  assert.ok(bad.failed_checks.includes('rls_and_browser_direct_mutation_blocked'));
});

test('039 deferred integrity rejects orphaned/altered coverage and failed Issue rolls back its number',async()=>{
  await setup();const {p}=await source();const id=await rpc('create_finance_tax_invoice_draft',[p.id]);await save(id);
  await rejects("update finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=$1",[id],/COVERAGE_INVALID/);
  await rejects("update finance_tax_invoice_source_coverages set total_amount=4999 where tax_invoice_id=$1",[id],/SOURCE_IMMUTABLE|check constraint/);
  await db.exec(`create function fixture_block_tax_issue() returns trigger language plpgsql as $$begin if new.status='issued' then raise exception 'FIXTURE_ISSUE_FAILURE';end if;return new;end$$;
    create trigger fixture_block_tax_issue before update on finance_tax_invoices for each row execute function fixture_block_tax_issue()`);
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/FIXTURE_ISSUE_FAILURE/);
  assert.equal(await count('finance_document_counters'),0);assert.equal((await taxRow(id)).status,'draft');
  await db.exec('drop trigger fixture_block_tax_issue on finance_tax_invoices');await issue(id);
  assert.equal((await taxRow(id)).tax_invoice_no,'VP-TI-202607-000001');
});

test('039 zero VAT requires explicit zero-rated source and evidence; missing seller branch never inferred',async()=>{
  await setup();const {p,i}=await source();
  const sourceSnapshot=await scalar('select build_finance_tax_invoice_source($1)',[p.id]);
  const candidate=structuredClone(sourceSnapshot);candidate.invoice_item.vat_rate=0;candidate.invoice_item.vat_amount=0;
  const check=d=>scalar('select finance_tax_invoice_issue_blockers(finance_tax_invoice_draft_snapshot($1,$2,$3))',[candidate,d,day]);
  assert.ok((await check({...decisions,tax_treatment:'zero_rated'})).includes('TAX_INVOICE_VAT_TREATMENT_UNRESOLVED'));
  assert.deepEqual(await check({...decisions,tax_treatment:'zero_rated',treatment_reason:'Explicit export evidence fixture'}),[]);
  candidate.invoice_item.vat_applicable=false;
  assert.ok((await check({...decisions,tax_treatment:'zero_rated',treatment_reason:'Fixture'})).includes('TAX_INVOICE_VAT_TREATMENT_UNRESOLVED'));
  await query("update finance_company_profiles set branch_th=null");
  const id=await rpc('create_finance_tax_invoice_draft',[p.id]);await save(id);
  await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/SELLER_IDENTITY/);
  assert.equal(await scalar('select document_status from finance_invoices where id=$1',[i.id]),'issued');
});

test('039 delegated manage/issue authority is independent, active coverage is unique, and numbers advance across different sources',async()=>{
  await setup();const {p}=await source();let id;
  await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{
    id=await rpc('create_finance_tax_invoice_draft',[p.id]);await save(id);
    await rejects('select issue_finance_tax_invoice($1,$2,true,true)',[id,(await taxRow(id)).draft_snapshot_json],/PERMISSION_DENIED/);
  });
  await rejects(`insert into finance_tax_invoices(payment_id,invoice_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id)
    select payment_id,invoice_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id from finance_tax_invoices where id=$1`,[id],/tax_invoice_active_payment/);
  await query('update user_profiles set can_manage_finance_tax_invoices=false,can_issue_finance_tax_invoices=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{await issue(id);});
  assert.equal((await taxRow(id)).tax_invoice_no,'VP-TI-202607-000001');
  const other=await source();const second=await rpc('create_finance_tax_invoice_draft',[other.p.id]);await save(second);await issue(second);
  assert.equal((await taxRow(second)).tax_invoice_no,'VP-TI-202607-000002');
  await issue(id);assert.equal(await scalar("select last_no from finance_document_counters where doc_type='tax_invoice'"),2);
});
