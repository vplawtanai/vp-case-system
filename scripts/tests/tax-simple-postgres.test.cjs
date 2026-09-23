/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./employee-reimbursement-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const a=require('./tax-simple-artifacts.cjs');
async function setup(){await prior.setup();await db.exec(migration('62'));await db.exec(migration('63'));}
const input={vendor:'Synthetic third party supplier',invoice_date:'2026-09-10',invoice_number:'TEST-064',tax_base:1000,vat_amount:70,note:'Third party paid; no reimbursement',funding_source:'third_party_no_reimbursement'};
const cashTables=['finance_expenses','finance_expense_requests','finance_expense_request_items','finance_expense_obligations','finance_expense_settlements','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_tax_remittances'];
const counts=async()=>Promise.all(cashTables.map(t=>scalar('select count(*)::int from '+t)));
test('064 external VAT creates only evidence and reviewed tax facts; immutable, authorized, idempotent',async()=>{
 await setup();await db.exec(migration('64'));const before=await counts(),id=randomUUID(),review=randomUUID();
 await asActor(ids.staff,()=>rejects('select save_finance_external_input_vat($1,$2,true)',[id,input],/PERMISSION_DENIED/));
 await rpc('save_finance_external_input_vat',[id,input,true]);await rpc('save_finance_external_input_vat',[id,input,true]);
 assert.equal((await scalar("select get_finance_tax_input_evidence('2026-09-01')")).external[0].review,null);
 await rejects('select save_finance_external_input_vat($1,$2,true)',[id,{...input,vat_amount:71}],/IDEMPOTENCY/);
 await rejects('select save_finance_external_input_vat($1,$2,true)',[randomUUID(),input],/unique/);
 await rpc('review_finance_external_input_vat',[review,id,null,'eligible','Invoice reviewed',true]);await rpc('review_finance_external_input_vat',[review,id,null,'eligible','Invoice reviewed',true]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,70);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).input_vat_complete,false);
 await rejects('select review_finance_external_input_vat($1,$2,null,$3,$4,true)',[randomUUID(),id,'ineligible','Correction'],/SOURCE_CHANGED/);
 await rpc('review_finance_external_input_vat',[randomUUID(),id,review,'ineligible','Not eligible after review',true]);
 assert.equal((await scalar("select tax_filing_monthly_facts('2026-09-01')")).reviewed_input_vat,0);
 assert.deepEqual(await counts(),before);
 await rejects('update finance_external_input_vat set vendor=$1 where id=$2',['changed',id],/IMMUTABLE/);
 const grants=await scalar("select has_table_privilege('authenticated','finance_external_input_vat','INSERT')");assert.equal(grants,false);
});

test('064 confirmed Company WHT 90 remains a fact pending classification; expense cash and claim flow unchanged',async()=>{
 await setup();await db.exec(migration('64'));
 const company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
 await treasury.opening({amount:10000});const choices=company.choices({vat_mode:'none'});
 const lines=requests.items([3000],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices,supplier_payee_id:null,vendor_name:'Synthetic supplier'});
 const doc=await requests.save(lines,'company_expense_batch');await rpc('submit_finance_expense_request',[doc.id,1]);const e=(await requests.read(doc.id)).items[0];await company.approve(e,choices);
 const p=await expense.prepare(e.id,{wht:true});await expense.confirm(p);await expense.confirm(p);await payout.flush();
 assert.equal(await scalar('select withheld_amount::text from finance_outgoing_wht_obligations where payout_source_id=$1',[p]),'90.00');
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'2910.00');
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[p]),1);
 const filing=await scalar("select get_finance_tax_filings('2026-09-01')");const review=filing.pools.filter(p=>p.filing_type!=='vat').flatMap(p=>p.review_sources||[]);assert.ok(review.some(r=>r.amount===90));
 const historical=await query(a.evidenceSql);const id=randomUUID();await rpc('save_finance_external_input_vat',[id,input,true]);await rpc('review_finance_external_input_vat',[randomUUID(),id,null,'eligible','Verified supplier invoice',true]);
 const after=await query(a.evidenceSql);for(const key of ['expenses','payouts','cashbook','filings'])assert.equal(after[0].hash[key],historical[0].hash[key]);
});

test('064 explicit new security works without broad defaults and denies direct client writes',async()=>{
 await setup();await db.exec('alter role service_role bypassrls; grant usage on schema public,auth to service_role');
 await db.exec(migration('64'));
 const before=await counts(),id=randomUUID();
 await asActor(ids.admin,()=>rpc('save_finance_external_input_vat',[id,input,true]));
 await asActor(ids.staff,()=>rejects('select * from finance_external_input_vat',[],/permission denied/));
 await db.exec('set local role anon');
 await rejects('select * from finance_external_input_vat_reviews',[],/permission denied/);
 await rejects("select tax_position_source('external_input_vat',$1)",[id],/permission denied/);
 await db.exec('reset role; set local role service_role');
 assert.equal(await scalar('select count(*)::int from finance_external_input_vat'),1);
 assert.equal((await scalar("select tax_position_source('external_input_vat',$1)",[id])).source_id,id);
 await rejects('delete from finance_external_input_vat where id=$1',[id],/permission denied/);
 await db.exec('reset role');
 assert.deepEqual(await counts(),before);
 for(const name of a.newTables){
  assert.equal(await scalar('select pg_get_userbyid(relowner) from pg_class where oid=$1::regclass',[name]),'postgres');
  for(const role of ['anon','authenticated'])assert.equal(await scalar('select has_table_privilege($1,$2,$3)',[role,name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN']),false);
  for(const privilege of ['SELECT','INSERT'])assert.equal(await scalar('select has_table_privilege($1,$2,$3)',['service_role',name,privilege]),true);
 }
});

// This final test crosses a transaction boundary only in the disposable fixture.
test('064 scoped security contract, negative checks and complete rollback',async()=>{
 await setup();
 // Supabase-style defaults ONLY in disposable local PostgreSQL. Not candidate DDL.
 await db.exec(`alter role service_role bypassrls;
 grant usage on schema public,auth to service_role;
 grant execute on function tax_position_source(text,uuid) to service_role;
 grant all on finance_tax_source_revisions,finance_tax_position_facts to service_role;
 alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;`);
 const before={functions:await query(a.functionSql),catalog:await query(a.catalogSql)};
 const profile_security=(await query(a.profileSecuritySql))[0],defaults=await query(a.defaultsSql);
 const evidence=await query(a.rowSql);
 await db.exec('savepoint candidate');await db.exec(migration('64'));
 const after={functions:await query(a.functionSql),catalog:await query(a.catalogSql)};
 assert.deepEqual(await query(a.rowSql),evidence);
 const changed=before.functions.filter(f=>!after.functions.some(n=>n.signature===f.signature&&n.definition_hash===f.definition_hash));
 assert.deepEqual(changed.map(f=>f.signature),['tax_position_source(text,uuid)']);
 if(process.env.WRITE_064_MANIFEST==='1')throw new Error('Synthetic PGlite state is not a Production baseline. Capture and classify accepted post-063 evidence first.');
 const production=require('./tax-064-build-contract.cjs').build(before,after);
 const fs=require('node:fs');
 if(process.env.WRITE_064_SCOPED_CONTRACT==='1')fs.writeFileSync(a.manifestPath,JSON.stringify(production,null,2)+'\n');
 else assert.deepEqual(JSON.parse(fs.readFileSync(a.manifestPath,'utf8')),production);
 // Synthetic fixture stays local. It must never replace captured existing-object contracts.
 const local={...production,before,after,profile_security,defaults};
 const files=a.workflow(local);
 await db.exec('rollback to savepoint candidate; release savepoint candidate');
 const check=async sql=>(await query(sql))[0];
 assert.deepEqual((await check(files[a.files.pre])).failed_checks,[]);
 // Preserve current raw ACL changes, but do not accept newly introduced drift.
 await db.exec('savepoint bad_acl; grant insert on finance_tax_source_revisions to authenticated');
 assert.equal((await check(files[a.files.pre])).gate_pass,false);
 await db.exec('rollback to savepoint bad_acl; release savepoint bad_acl');
 // Execute rollback rehearsal entirely in this disposable database.
 await db.exec('commit');
 const rehearsal=(await db.exec(files[a.files.dry])).flatMap(r=>r.rows).filter(r=>'gate_pass' in r);
 assert.ok(rehearsal.length>=2);for(const r of rehearsal)assert.deepEqual(r.failed_checks,[]);
 assert.equal(await scalar("select to_regclass('public.finance_external_input_vat') is null"),true);
 assert.deepEqual(await query(a.rowSql),evidence);
 await db.exec('begin');await db.exec(migration('64'));
 assert.deepEqual((await check(files[a.files.verify])).failed_checks,[]);
 for(const sql of [
  'grant update on finance_external_input_vat to service_role',
  'grant select on finance_external_input_vat_reviews to anon',
  'alter table finance_external_input_vat disable row level security',
  'grant execute on function tax_position_source(text,uuid) to authenticated',
  'revoke execute on function tax_position_source(text,uuid) from service_role',
  'grant insert on finance_tax_position_facts to authenticated'
 ]){await db.exec('savepoint bad_security');await db.exec(sql);assert.equal((await check(files[a.files.verify])).gate_pass,false,sql);await db.exec('rollback to savepoint bad_security; release savepoint bad_security');}
 await db.exec('savepoint missing_history');await query("select set_config('vp.tax064_before_b64','',true)");
 assert.ok((await check(files[a.files.verify])).failed_checks.includes('historical_rows_unchanged'));
 await db.exec('rollback to savepoint missing_history; release savepoint missing_history');
 await db.exec('savepoint bad_history');await query("select set_config('vp.tax064_before_b64',encode(convert_to('{}','UTF8'),'base64'),true)");
 assert.ok((await check(files[a.files.verify])).failed_checks.includes('historical_rows_unchanged'));
 await db.exec('rollback to savepoint bad_history; release savepoint bad_history');
 assert.deepEqual((await check(files[a.files.verify])).failed_checks,[]);
});
