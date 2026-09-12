/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. Never reads credentials or Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {setup}=require('./customer-tax-profile-postgres.test.cjs');
const prior=require('./combined-document-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,ids,payment,financialState,flush,root}=require('./receipt-foundation.test.cjs');
const {artifacts}=require('./combined-issue-uat-artifacts.cjs');
const {lexical}=require('./receipt-sql-static.test.cjs');
async function source(){
  await setup();
  const id=randomUUID(),number='VP-IV-LOCAL-'+id.slice(0,8);
  const specs=[['ค่าแปลเอกสาร',4000,280,true,7],['ค่าวิชาชีพทนาย งวดที่ 1',10000,0,false,0],['ค่าเดินทางไปศาล',4672.90,327.10,true,7]];
  const items=specs.map(([description,base,vat,vat_applicable,vat_rate])=>({id:randomUUID(),invoice_id:id,source_state:'active',description,
    amount_before_vat:base,vat_amount:vat,line_total:base+vat,vat_applicable,vat_rate,
    ...(!vat_applicable?{vat_treatment_json:{schema_version:1,treatment:'outside_scope',reason:'Synthetic approved non-VAT evidence'}}:{})}));
  const snapshot={schema_version:2,source_model:'billable_charge_v2',invoice:{id,invoice_no:number,document_status:'issued',currency:'THB',
    amount_before_vat:18672.90,vat_amount:607.10,total_amount:19280,issued_at:'2026-06-30T00:00:00Z'},
    customer:{name:'Synthetic Buyer',address:'Fixture address',tax_id:'0000000000002',branch:null},items:items.map(invoice_item=>({invoice_item}))};
  await query('insert into finance_invoices(id,invoice_no,client_id,total_amount,amount_before_vat,vat_amount,issued_snapshot_json,issued_at) values($1,$2,$3,19280,18672.90,607.10,$4,\'2026-06-30\')',[id,number,ids.client,snapshot]);
  for(const item of items)await query("insert into finance_invoice_items(id,invoice_id,source_state) values($1,$2,'active')",[item.id,id]);
  const p=await payment({cash:19280,confirmed:false,allocations:[{invoice:{id,snapshot},cash:19280,wht:0}]});
  await rpc('save_finance_payment_wht_lines_draft',[p.id,'2026-07-01','bank_transfer',ids.bank,null,null,'Synthetic Payer','',
    items.map((item,index)=>({invoice_item_id:item.id,applicability:index===0?'applies':'does_not_apply',rate_percent:index===0?3:null}))]);
  await rpc('confirm_finance_payment',[p.id,true]);
  const profile=await scalar('select get_finance_customer_tax_profile($1)',[ids.client]);
  await scalar('select save_finance_customer_tax_profile($1,true,\'head_office\',\'00000\',\'Synthetic written head-office evidence\',true,$2,null)',[ids.client,profile.identity]);
  await flush();const cid=await prior.create(p.id);
  await prior.save(cid,{no_earlier_event:true,external_coverage_checked:true});
  return {id,number,p,cid,items};
}
function fixtureSql(sql,s){return sql.replaceAll('d903b209-1e29-4a60-a453-032611a7202f',s.cid)
  .replaceAll('95e22d0e-1996-4f16-98e4-218db1cbd857',s.p.id).replaceAll('a392a5ec-cc84-4c74-bd7a-5636a984f9c6',s.id)
  .replaceAll('c8132235-f5df-47ad-b0a8-8d60ad335bf5',ids.client).replaceAll('VP-IV-202609-000004',s.number)
  .replaceAll('2026-09-11','2026-07-01').replaceAll('2026-09-12','2026-07-02');}
async function verify(s,issued=false){const sql=artifacts()[issued?'scripts/sql/verify_combined_vp_rti_issue.sql':'scripts/sql/preflight_combined_vp_rti_issue.sql'];
  const rows=await query(fixtureSql(sql,s));assert.equal(rows.length,1);return rows[0];}
test('Combined UAT artifacts are exact, one SELECT-only statement and have no lifecycle or helper RPC calls',()=>{
  for(const [file,sql]of Object.entries(artifacts())){
    assert.equal(fs.readFileSync(path.join(root,file),'utf8'),sql);
    assert.doesNotMatch(sql,/[ \t]+$/m);
    const clean=lexical(sql);assert.match(clean.trim(),/^with\b/i);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);
    assert.doesNotMatch(clean,/\b(insert|update|delete|alter|create|drop|grant|revoke|call|do|execute|into|set_config)\b/i);
    assert.doesNotMatch(clean,/\b(?:get|build|save|issue|refresh|confirm|cancel|void|generate)_finance_\w+\s*\(/i);
    assert.match(sql,/combined_vp_rti_(?:preissue_pass|issue_verification_pass)/);
  }
});
test('Exact mixed WHT UAT preflight and issued verifier pass; one RTI counter, same parent/child number, no financial effect',async()=>{
  const s=await source(),before=await financialState();
  await db.exec("insert into finance_document_counters(doc_type,year,month,prefix,last_no) values('receipt',2026,7,'VP-RC-202607-',11),('tax_invoice',2026,7,'VP-TI-202607-',7),('receipt_tax_invoice',2026,7,'VP-RTI-202607-',2)");
  const pre=await verify(s);assert.deepEqual(pre.failed_checks,[]);assert.equal(pre.combined_vp_rti_preissue_pass,true);
  const baseline=await query('select * from finance_document_counters where doc_type<>\'receipt_tax_invoice\' order by doc_type');
  await prior.issue(s.cid);const post=await verify(s,true);
  assert.deepEqual(post.failed_checks,[]);assert.equal(post.combined_vp_rti_issue_verification_pass,true);
  assert.equal(post.numbering_observability.combined_no,'VP-RTI-202607-000003');
  assert.deepEqual(await financialState(),before);
  assert.deepEqual(await query('select * from finance_document_counters where doc_type<>\'receipt_tax_invoice\' order by doc_type'),baseline);
  const issued=await prior.combined(s.cid),counters=await query('select * from finance_document_counters order by doc_type');
  await prior.issue(s.cid);assert.deepEqual(await prior.combined(s.cid),issued);assert.deepEqual(await query('select * from finance_document_counters order by doc_type'),counters);
  assert.deepEqual((await verify(s,true)).failed_checks,[]);assert.equal((await verify(s)).combined_vp_rti_preissue_pass,false);
  await query("update clients set address='Later Client address' where id=$1",[ids.client]);
  await query("update finance_company_profiles set company_name_th='Later Seller' where id='default'");
  assert.deepEqual((await verify(s,true)).failed_checks,[],'Issued identity must not follow current master data');
});
test('Late child audit failure rolls back parent, children, allocation, coverage and counter; retry is atomic',async()=>{
  const s=await source();const before=await scalar('select to_jsonb(c) from finance_combined_documents c where id=$1',[s.cid]);
  const finance=await financialState();
  await db.exec("create function fail_local_tax_audit() returns trigger language plpgsql as $$begin if new.event_type='issued' then raise exception 'synthetic late failure';end if;return new;end;$$; create trigger fail_local before insert on finance_tax_invoice_audit_events for each row execute function fail_local_tax_audit()");
  await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[s.cid,before.draft_snapshot_json],/synthetic late failure/);
  assert.deepEqual(await prior.combined(s.cid),before);assert.deepEqual((await verify(s)).failed_checks,[]);
  assert.equal(await scalar("select count(*) from finance_document_counters where doc_type='receipt_tax_invoice'"),0);
  assert.deepEqual(await financialState(),finance);
  await db.exec('drop trigger fail_local on finance_tax_invoice_audit_events');await prior.issue(s.cid);assert.deepEqual((await verify(s,true)).failed_checks,[]);
});
test('Issued correction restrictions and immutability are real, not a presumed future replacement workflow',async()=>{
  const s=await source();await prior.issue(s.cid);const c=await prior.combined(s.cid);
  await rejects('select cancel_finance_combined_document_draft($1,\'Wrong identity\')',[s.cid],/DOCUMENT_CORRECTION_WORKFLOW_REQUIRED/);
  await rejects('select void_finance_receipt($1,\'Accidental issue\',true)',[c.receipt_id],/DOCUMENT_USE_COMBINED_WORKFLOW/);
  await rejects('select cancel_finance_tax_invoice_draft($1,\'Wrong tax point\')',[c.tax_invoice_id],/DOCUMENT_USE_COMBINED_WORKFLOW/);
  for(const field of ['issue_date=\'2026-07-03\'','issued_snapshot_json=\'{}\'','combined_no=\'VP-RTI-202607-999999\''])
    await rejects('update finance_combined_documents set '+field+' where id=$1',[s.cid],/DOCUMENT_HISTORY_IMMUTABLE/);
  assert.equal(await scalar("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname ~ '(void.*(combined|tax_invoice)|create.*(credit_note|debit_note)|replace.*combined)'"),0);
  assert.equal(await prior.create(s.p.id),s.cid,'Create retry cannot create a replacement for issued Combined');
  assert.deepEqual(await prior.combined(s.cid),c);
});
test('Verifiers fail closed for wrong amounts, missing target, function drift and linked financial effects; global counts are not gates',async()=>{
  const s=await source();
  const raw=artifacts()['scripts/sql/preflight_combined_vp_rti_issue.sql'];
  const absent=await query(raw);assert.equal(absent.length,1);assert.equal(absent[0].combined_vp_rti_preissue_pass,false);
  const wrong=await query(fixtureSql(raw,s).replaceAll('19160','19161'));assert.equal(wrong[0].combined_vp_rti_preissue_pass,false);
  await db.exec("insert into finance_company_ledger(id) values(gen_random_uuid());insert into finance_compensation_batches(id) values(gen_random_uuid())");
  assert.deepEqual((await verify(s)).failed_checks,[]);
  await query('insert into finance_company_ledger(id,source_payment_id) values(gen_random_uuid(),$1)',[s.p.id]);
  assert.ok((await verify(s)).failed_checks.includes('no_detectable_linked_cash_ledger_compensation_revenue_effect'));
  const changed=fixtureSql(raw,s).replace(/('issue_finance_combined_document',')[a-f0-9]{32}/,"$100000000000000000000000000000000");
  assert.ok((await query(changed))[0].failed_checks.includes('exact_deployed_issue_numbering_guard_and_source_bodies'));
});
test('Preflight detects stale seller/bank evidence and an exhausted RTI counter without consulting live identity after Issue',async()=>{
  const s=await source();assert.deepEqual((await verify(s)).failed_checks,[]);
  const company=await scalar("select company_name_th from finance_company_profiles where id='default'");
  await query("update finance_company_profiles set company_name_th='Changed seller' where id='default'");
  assert.ok((await verify(s)).failed_checks.includes('live_seller_bank_and_payment_match_draft_before_issue_only'));
  await query("update finance_company_profiles set company_name_th=$1 where id='default'",[company]);
  const account=await scalar('select account_number from finance_bank_accounts where id=$1',[ids.bank]);
  await query("update finance_bank_accounts set account_number='Changed account' where id=$1",[ids.bank]);
  assert.ok((await verify(s)).failed_checks.includes('live_seller_bank_and_payment_match_draft_before_issue_only'));
  await query('update finance_bank_accounts set account_number=$1 where id=$2',[account,ids.bank]);
  await db.exec("insert into finance_document_counters(doc_type,year,month,prefix,last_no) values('receipt_tax_invoice',2026,7,'VP-RTI-202607-',999999)");
  assert.ok((await verify(s)).failed_checks.includes('active_rti_numbering_profile'));
  await db.exec("update finance_document_counters set last_no=999998 where doc_type='receipt_tax_invoice'");
  assert.deepEqual((await verify(s)).failed_checks,[]);
  await prior.issue(s.cid);assert.deepEqual((await verify(s,true)).failed_checks,[]);
});
