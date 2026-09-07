/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {db,query,scalar,row,count,rpc,rejects,asActor,ids,invoice,payment,financialState,createReceipt,issueReceipt,voidReceipt,migration,root} = require('./receipt-foundation.test.cjs');
const a='company/logo/fixture-a.png', b='company/logo/fixture-b.png';
async function storage() {
  await db.exec(`
    create schema storage;
    create table storage.buckets(id text primary key,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,
      metadata jsonb,version text,last_accessed_at timestamptz,updated_at timestamptz,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    insert into storage.buckets values('vp-document-assets',false);
    insert into storage.objects(bucket_id,name,metadata,version) values
      ('vp-document-assets','${a}','{"mimetype":"image/png"}','version-a'),
      ('vp-document-assets','${b}','{"mimetype":"image/png"}','version-b'),
      ('vp-document-assets','signers/test/signature.png','{"mimetype":"image/png"}','signer');
    alter table finance_company_profiles add column logo_storage_path text;
    update finance_company_profiles set logo_storage_path='${a}';
  `);
  // Use the actual established Storage policies, not a more permissive approximation.
  const baseline=fs.readFileSync(path.join(root,'supabase/migrations/202607090005_document_settings_and_vp_qt_prefix.sql'),'utf8');
  const adminFunction=baseline.slice(baseline.indexOf('create or replace function public.current_user_is_admin()'));
  await db.exec(adminFunction.slice(0,adminFunction.indexOf('$$;')+3));
  await db.exec(baseline.slice(baseline.indexOf('drop policy if exists "finance document asset managers read"'),baseline.indexOf('create or replace function public.set_finance_authorized_signer_default')));
}
const switchLogo = () => query('update finance_company_profiles set logo_storage_path=$1',[b]);
const loadSQL = name => fs.readFileSync(path.join(root,`scripts/sql/${name}_document_logo_immutability.sql`),'utf8');

test('038 create/refresh/issue freezes exact logo; stale logo or stale operator review fails without numbering',async()=>{
  await storage(); await db.exec(migration('38'));
  const p=await payment({cash:4859.81,wht:140.19}); const before=await financialState();
  const id=await createReceipt(p.id); const reviewed=(await row(id)).draft_snapshot_json;
  assert.equal(reviewed.schema_version,2);assert.equal(reviewed.seller.logo_asset.path,a);
  assert.equal(reviewed.seller.logo_asset.storage_version,'version-a');
  assert.equal(reviewed.seller.logo_asset.object_id,await scalar('select id from storage.objects where name=$1',[a]));
  await switchLogo();
  await rejects('select issue_finance_receipt($1,true,$2)',[id,reviewed],/RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED/);
  assert.equal(await count('finance_document_counters'),0);
  await rpc('refresh_finance_receipt_draft',[id]);
  await rejects('select issue_finance_receipt($1,true,$2)',[id,reviewed],/RECEIPT_REVIEW_REQUIRED/);
  await issueReceipt(id);const issued=await row(id);
  assert.equal(issued.issued_snapshot_json.seller.logo_asset.path,b);
  await rejects('select reverse_finance_payment($1,$2)',[p.id,'Synthetic reversal'],/FINANCE_ISSUED_RECEIPT_DEPENDENCY/);
  await query('update finance_company_profiles set logo_storage_path=$1',[a]);
  await issueReceipt(id);assert.deepEqual(await row(id),issued);
  await voidReceipt(id);
  assert.deepEqual((await row(id)).issued_snapshot_json,issued.issued_snapshot_json);
  assert.deepEqual(await financialState(),before);
});

test('038 pre-existing Draft is untouched, requires explicit Refresh, never requires cancellation/recreation',async()=>{
  await storage(); const p=await payment();const id=await createReceipt(p.id);const old=await row(id);
  await db.exec(migration('38'));assert.deepEqual(await row(id),old);
  await rejects('select issue_finance_receipt($1,true,$2)',[id,old.draft_snapshot_json],/RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED/);
  await rpc('refresh_finance_receipt_draft',[id]);const refreshed=await row(id);
  assert.equal(refreshed.id,id);assert.equal(refreshed.draft_snapshot_json.schema_version,2);
  assert.deepEqual({...refreshed.draft_snapshot_json,schema_version:1,seller:old.draft_snapshot_json.seller},old.draft_snapshot_json);
  await issueReceipt(id);assert.equal((await row(id)).status,'issued');
});

test('038 retains old issued schema-1 history without a guessed logo',async()=>{
  await storage();const p=await payment();const id=await createReceipt(p.id);await issueReceipt(id);const old=await row(id);
  await db.exec(migration('38'));await switchLogo();await issueReceipt(id);
  assert.deepEqual(await row(id),old);await voidReceipt(id);
  assert.deepEqual((await row(id)).issued_snapshot_json,old.issued_snapshot_json);
});

test('038 Storage RLS blocks Admin overwrite/delete/rename; new version uploads and signer operations still work',async()=>{
  await storage();await db.exec(migration('38'));
  await asActor(ids.admin,async()=>{
    assert.deepEqual(await query('delete from storage.objects where name=$1 returning id',[a]),[]);
    assert.deepEqual(await query("update storage.objects set metadata='{}' where name=$1 returning id",[a]),[]);
    await rejects("insert into storage.objects(bucket_id,name,metadata) values('vp-document-assets',$1,'{}') on conflict(bucket_id,name) do update set metadata=excluded.metadata",[a],/row-level security/);
    await rejects("update storage.objects set name='company/logo/renamed.png' where name like 'signers/%'",[],/row-level security/);
    assert.deepEqual(await query("update storage.objects set name='other/path' where name=$1 returning id",[a]),[]);
    await rejects('truncate storage.objects',[],/permission denied/);
    await query("insert into storage.objects(bucket_id,name,metadata) values('vp-document-assets','company/logo/new-version.png','{\"mimetype\":\"image/png\"}')");
    assert.equal((await query("delete from storage.objects where name like 'signers/%' returning id")).length,1);
  });
  assert.equal(await scalar('select count(*) from storage.objects where name=$1',[a]),1);
});

test('038 uses no managed Storage triggers; privileged out-of-band mutation is explicitly outside retention guarantees',async()=>{
  await storage();await db.exec(migration('38'));
  assert.equal(await scalar("select count(*) from pg_trigger where tgrelid='storage.objects'::regclass and not tgisinternal"),0);
  const p=await payment();const id=await createReceipt(p.id);const review=(await row(id)).draft_snapshot_json;
  await query("update storage.objects set version='out-of-band' where name=$1",[a]);
  await rejects('select issue_finance_receipt($1,true,$2)',[id,review],/RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED/);
  await query('delete from storage.objects where name=$1',[a]);
  await rejects('select document_logo_evidence($1)',[a],/RECEIPT_LOGO_EVIDENCE_REQUIRED/);
  assert.equal(await count('finance_document_counters'),0);
});

test('038 policy capability fails closed for a non-owner without a real platform grant; Storage reader needs SELECT only',async()=>{
  await storage();
  await db.exec('create role fixture_sql_editor nologin; grant usage on schema public,storage to fixture_sql_editor; grant select on storage.objects to fixture_sql_editor');
  await db.exec('set local role fixture_sql_editor');
  const capability=migration('38').split('-- BEGIN STORAGE POLICY CAPABILITY SELECT\n')[1].split('\n-- END STORAGE POLICY CAPABILITY SELECT')[0];
  assert.equal(await scalar(capability),false);
  await db.exec(`set local "supautils.policy_grants"='{"fixture_sql_editor":["storage.objects"]}'`);
  assert.equal(await scalar(capability),false,'a client-set placeholder is not a real Supabase policy grant');
  await db.exec('reset role');
  await db.exec('savepoint denied_policy');
  await db.exec('set local role fixture_sql_editor');
  await assert.rejects(()=>db.exec(migration('38')),/DOCUMENT_LOGO_STORAGE_POLICY_PERMISSION_REQUIRED/);
  await db.exec('rollback to savepoint denied_policy');
  assert.equal(await scalar("select count(*) from pg_policy where polname='document_logos_no_update'"),0);
  await db.exec(migration('38'));
  // A non-owner helper with only SELECT can capture a permitted logo; no FOR SHARE privilege dependency.
  await db.exec('alter function public.document_logo_evidence(text) owner to fixture_sql_editor; create policy fixture_catalog_read on storage.objects for select to fixture_sql_editor using(true)');
  assert.equal((await scalar('select document_logo_evidence($1)',[a])).path,a);
});

test('038 Receipt-only viewer can download logo evidence but cannot access signer assets or helper RPCs',async()=>{
  await storage();await db.exec(migration('38'));
  await query('update user_profiles set can_view_finance_receipts=true where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{
    assert.equal((await query('select id from storage.objects where name=$1',[a])).length,1);
    assert.equal((await query("select id from storage.objects where name like 'signers/%'")).length,0);
    await rejects('select document_logo_evidence($1)',[a],/permission denied/);
    await rejects("insert into storage.objects(bucket_id,name) values('vp-document-assets','company/logo/forged.png')",[],/row-level security/);
  });
});

test('038 missing/unsafe current logo fails closed without Receipt/audit/number changes',async()=>{
  await storage();await db.exec(migration('38'));const p=await payment();
  for(const value of [null,'company/logo/absent.png','signers/test/signature.png','company/logo/../bad.png']) {
    await query('update finance_company_profiles set logo_storage_path=$1',[value]);
    await rejects('select create_finance_receipt_draft_from_payment($1,true)',[p.id],/RECEIPT_LOGO_EVIDENCE_REQUIRED/);
  }
  assert.equal(await count('finance_receipts'),0);assert.equal(await count('finance_document_counters'),0);
});

test('038 SQL workflow compiles, returns one row, passes on exact synthetic target; detects missing protection',async()=>{
  await storage();
  const i=await invoice(5000,{fixtureId:'74461042-e3ba-4922-9b64-55aac9ebd8aa',fixtureNumber:'VP-IV-202609-000003'});
  const p=await payment({fixtureId:'9e2f601e-13ef-4165-8e2c-1887c3ad8861',cash:4859.81,wht:140.19,allocations:[{invoice:i,cash:4859.81,wht:140.19}]});
  const id=await createReceipt(p.id);
  // Fixture ID only, before any references or applied 038. Never Production.
  await db.exec('alter table finance_receipt_audit_events disable trigger all; alter table finance_receipts disable trigger all');
  await query("update finance_receipt_audit_events set receipt_id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf' where receipt_id=$1",[id]);
  await query("update finance_receipts set id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf' where id=$1",[id]);
  await db.exec('alter table finance_receipt_audit_events enable trigger all; alter table finance_receipts enable trigger all');
  const before=await financialState();const receiptBefore=await query('select to_jsonb(r) from finance_receipts r');
  let result=await query(loadSQL('preflight'));assert.equal(result.length,1);assert.deepEqual(result[0].failed_checks,[],JSON.stringify(result[0]));
  await db.exec(migration('38'));
  result=await query(loadSQL('verify'));assert.equal(result.length,1);assert.deepEqual(result[0].failed_checks,[],JSON.stringify(result[0]));
  assert.deepEqual(await financialState(),before);assert.deepEqual(await query('select to_jsonb(r) from finance_receipts r'),receiptBefore);
  await db.exec('drop policy document_logos_no_update on storage.objects');
  assert.ok((await query(loadSQL('verify')))[0].failed_checks.includes('storage_api_overwrite_delete_blocked'));
  await db.exec('set local transaction_read_only=on');
  assert.equal((await query(loadSQL('verify'))).length,1);
  assert.equal((await query(loadSQL('preflight'))).length,1);
});

test('038 exact operator dry-run executes locally and rolls back all new DDL without business operations',async()=>{
  const before=await financialState();
  await storage();
  await db.exec(loadSQL('dry_run'));
  assert.equal(await scalar("select to_regprocedure('public.document_logo_evidence(text)')::text"),null);
  assert.deepEqual(await financialState(),before);
  assert.equal(await count('finance_receipts'),0);
});

test('038 refuses unexpected predecessor source definitions before changing policies',async()=>{
  await storage();
  await db.exec("create or replace function public.build_finance_receipt_source(p_payment_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$");
  await db.exec('savepoint wrong_source');
  await assert.rejects(()=>db.exec(migration('38')),/DOCUMENT_LOGO_UNEXPECTED_RECEIPT_SOURCE_CONTRACT/);
  await db.exec('rollback to savepoint wrong_source');
  assert.equal(await scalar("select count(*) from pg_policy where polname='document_logos_no_update'"),0);
});
