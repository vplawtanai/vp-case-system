/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {setup:previous}=require('./customer-tax-profile-postgres.test.cjs');
const combined=require('./combined-document-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,ids,asActor,migration,financialState,flush}=require('./receipt-foundation.test.cjs');
async function setup(){await previous();await db.exec(migration('43'));}
async function source(paired=true,initialize=true){
 if(initialize)await setup();const s=await combined.source([{base:10000,vat:700,rate:7,applicable:true},{base:2000,vat:0,rate:0,applicable:false,treatment:'outside_scope'}],null,0,false);
 await rpc('save_finance_payment_wht_lines_draft',[s.p.id,'2026-07-01','bank_transfer',ids.bank,null,null,'Synthetic Payer','',
   s.items.map((item,index)=>({invoice_item_id:item.id,applicability:index===0?'applies':'does_not_apply',rate_percent:index===0?3:null}))]);
 await rpc('confirm_finance_payment',[s.p.id,true]);
 const profile=await scalar('select get_finance_customer_tax_profile($1)',[ids.client]);
 await scalar("select save_finance_customer_tax_profile($1,true,'head_office','00000','Fixture written evidence',true,$2,$3)",[ids.client,profile.identity,profile.profile?.updated_at||null]);
 let tid,cid=null;
 if(paired){cid=await combined.create(s.p.id);await combined.save(cid,{external_coverage_checked:true,no_earlier_event:true});await combined.issue(cid);tid=(await combined.combined(cid)).tax_invoice_id;}
 else{
  // Legitimate historical standalone Receipt fixture, followed by current Tax completion.
  const rid=await rpc('receipt_create_pre040',[s.p.id,true]);
  const r=await scalar('select draft_snapshot_json from finance_receipts where id=$1',[rid]);await rpc('receipt_issue_pre040',[rid,true,r]);
  tid=await rpc('create_finance_tax_invoice_draft',[s.p.id]);const t=await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[tid]);
  await rpc('save_finance_tax_invoice_draft',[tid,'2026-07-02',{external_coverage_checked:true,no_earlier_event:true},t.updated_at]);
  await rpc('issue_finance_tax_invoice',[tid,await scalar('select draft_snapshot_json from finance_tax_invoices where id=$1',[tid]),true,true]);
 }
 const item=await scalar('select id from finance_tax_invoice_items where tax_invoice_id=$1',[tid]);await flush();return {...s,tid,cid,item};
}
const row=id=>scalar('select (select to_jsonb(c) from finance_tax_document_corrections c where id=$1)',[id]);
const doc=id=>scalar('select (select to_jsonb(d) from finance_tax_correction_documents d where id=$1)',[id]);
function args(s,mode='credit_note',amount=1000,overrides={}){return [overrides.request||randomUUID(),s.tid,overrides.direct?null:s.cid,mode,'Synthetic correction reason',
 overrides.basis||({credit_note:'service_overcharge',debit_note:'service_undercharge',cancel_and_reissue:'documentary_identity_error',replacement_copy:'lost'})[mode],
 overrides.evidence||randomUUID(),'2026-07-03','2026-07-03',mode==='credit_note'||mode==='debit_note'?[{item_id:s.item,base_change:amount}]:[]];}
const create=a=>rpc('create_finance_tax_correction_draft',a);
async function approve(id){await rpc('approve_finance_tax_correction',[id,(await row(id)).draft_snapshot_json,true,'Reviewed legal/business evidence',true]);}
async function issue(id){await approve(id);await rpc('issue_finance_tax_correction',[id,(await row(id)).draft_snapshot_json,true,true]);await flush();}
async function originals(s){return {tax:await scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[s.tid]),
 combined:s.cid?await combined.combined(s.cid):null,receipts:await query('select * from finance_receipts where payment_id=$1',[s.p.id])};}
for(const paired of [false,true])for(const mode of ['credit_note','debit_note'])test(`043 ${paired?'Combined':'standalone'} ${mode}: linked source components, tax-only movement and immutable originals`,async()=>{
 const s=await source(paired),before=await financialState(),frozen=await originals(s),a=args(s,mode),id=await create(a);
 assert.equal(await create(a),id);assert.equal((await row(id)).status,'draft');assert.equal(await doc(id),null);
 await issue(id);const d=await doc(id);assert.match(d.document_no,mode==='credit_note'?/^VP-CN-202607-000001$/:/^VP-DN-202607-000001$/);
 assert.equal(Number(d.issued_snapshot_json.totals.base_change),1000);assert.equal(Number(d.issued_snapshot_json.totals.vat_change),70);
 assert.equal(Number(d.issued_snapshot_json.totals.resulting_base),mode==='credit_note'?9000:11000);
 assert.equal(d.issued_snapshot_json.tax.payment.wht_amount,300);
 assert.deepEqual(await financialState(),before);assert.deepEqual(await originals(s),frozen);
 await rpc('issue_finance_tax_correction',[id,(await row(id)).draft_snapshot_json,true,true]);assert.deepEqual(await doc(id),d);
});
for(const paired of [false,true])test(`043 ${paired?'Combined':'standalone'} large cumulative debits have no original-base cap; credit zero-floor and financial boundary remain`,async()=>{
 const s=await source(paired),before=await financialState(),frozen=await originals(s);
 for(const [amount,vatChange,previousBase,resultingBase,resultingVat] of [[25000,1750,10000,35000,2450],[5000,350,35000,40000,2800]]){
  const a=args(s,'debit_note',amount),id=await create(a);
  assert.equal(await create(a),id);
  await issue(id);const d=await doc(id),totals=d.issued_snapshot_json.totals;
  assert.equal(Number(totals.base_change),amount);assert.equal(Number(totals.vat_change),vatChange);
  assert.equal(Number(totals.resulting_base),resultingBase);assert.equal(Number(totals.resulting_vat),resultingVat);
  const line=await scalar('select to_jsonb(l) from finance_tax_correction_lines l where correction_id=$1',[id]);
  assert.equal(line.original_tax_invoice_item_id,s.item);assert.equal(Number(line.previous_base),previousBase);
  assert.equal((await row(id)).original_tax_invoice_id,s.tid);assert.equal((await row(id)).original_combined_document_id,s.cid);
  await rpc('issue_finance_tax_correction',[id,(await row(id)).draft_snapshot_json,true,true]);
  assert.deepEqual(await doc(id),d);
  assert.equal(await scalar("select count(*) from finance_tax_correction_audit_events where correction_id=$1 and event_type='issued'",[id]),1);
  await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'debit_note',amount,{evidence:a[6]}),/tax_correction_evidence_once/);
 }
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'credit_note',40000.01),/COVERAGE_EXCEEDED/);
 const credit=await create(args(s,'credit_note',40000));await issue(credit);const totals=(await doc(credit)).issued_snapshot_json.totals;
 assert.equal(Number(totals.vat_change),2800);assert.equal(Number(totals.resulting_base),0);assert.equal(Number(totals.resulting_vat),0);
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'credit_note',0.01),/COVERAGE_EXCEEDED/);
 assert.deepEqual(await financialState(),before);assert.deepEqual(await originals(s),frozen);
});
test('043 documentary reissue freezes corrected buyer with new shared RTI; old rows, tax point, money and date retained',async()=>{
 const s=await source(),before=await financialState(),frozen=await originals(s);
 await query("update clients set address='Corrected buyer address' where id=$1",[ids.client]);
 const profile=await scalar('select get_finance_customer_tax_profile($1)',[ids.client]);
 await scalar("select save_finance_customer_tax_profile($1,true,'head_office','00000','New written buyer evidence',true,$2,$3)",[ids.client,profile.identity,profile.profile.updated_at]);
 const id=await create(args(s,'cancel_and_reissue'));await issue(id);const d=await doc(id),snap=d.issued_snapshot_json;
 assert.notEqual(d.document_no,frozen.tax.tax_invoice_no);assert.equal(d.document_no,'VP-RTI-202607-000002');
 assert.equal(d.document_date,'2026-07-02');assert.equal(snap.issue_date,'2026-07-03');
 assert.equal(snap.tax.customer.address,'Corrected buyer address');assert.equal(snap.receipt.customer.address,'Corrected buyer address');
 assert.equal(snap.tax.document.tax_invoice_no,d.document_no);assert.equal(snap.receipt.receipt.receipt_no,d.document_no);
 assert.deepEqual(snap.tax.tax_point,frozen.tax.issued_snapshot_json.tax_point);assert.deepEqual(await originals(s),frozen);assert.deepEqual(await financialState(),before);
 const context=await scalar('select get_finance_tax_correction_context($1,$2)',[s.tid,s.cid]);assert.equal(context.source.source_correction_id,id);
 const next=await create(args(s,'cancel_and_reissue'));await issue(next);assert.equal((await doc(next)).document_no,'VP-RTI-202607-000003');
 assert.equal((await row(next)).source_correction_id,id);assert.equal((await scalar('select get_finance_tax_correction_context($1,$2)',[s.tid,s.cid])).source.source_correction_id,next);
});
test('043 replacement copy retains number, identity, VAT and WHT; no permanent counter or taxable event',async()=>{
 const s=await source(),before=await financialState(),counts=await query('select * from finance_document_counters');
 const a=await create(args(s,'replacement_copy'));await issue(a);const first=await doc(a);
 assert.equal(first.document_no,(await originals(s)).tax.tax_invoice_no);assert.equal(first.copy_sequence,1);
 assert.deepEqual(first.issued_snapshot_json.tax,(await originals(s)).tax.issued_snapshot_json);
 const b=await create(args(s,'replacement_copy'));await issue(b);assert.equal((await doc(b)).copy_sequence,2);
 assert.deepEqual(await query('select * from finance_document_counters'),counts);assert.deepEqual(await financialState(),before);
});
test('043 fail closed: draft original, direct Combined child, unsupported mode/basis, evidence, coverage, duplicate, review and authority',async()=>{
 const s=await source();await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'credit_note',1000,{direct:true}),/COMBINED_WORKFLOW/);
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'credit_note',10001),/COVERAGE_EXCEEDED/);
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'cancel_and_reissue',0,{basis:'any_error'}),/INCOMPATIBLE/);
 const a=args(s),id=await create(a);await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s),/OPEN_CASE/);
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,(await row(id)).draft_snapshot_json],/APPROVAL_REQUIRED/);
 await rejects('select approve_finance_tax_correction($1,$2,false,\'Some evidence\',true)',[id,(await row(id)).draft_snapshot_json],/LEGAL_REVIEW/);
 await rejects('select approve_finance_tax_correction($1,\'{}\',true,\'Some evidence\',true)',[id],/STALE_REVIEW/);
 await asActor(ids.staff,async()=>{assert.equal((await query('select * from finance_tax_document_corrections')).length,0);await rejects('select approve_finance_tax_correction($1,$2,true,\'Evidence\',true)',[id,(await row(id))?.draft_snapshot_json||{}],/PERMISSION|no rows/);
 await rejects('select tax_correction_source($1,$2)',[s.tid,s.cid],/permission denied/);await rejects('insert into finance_tax_correction_documents(id) values($1)',[id],/permission denied/);});
 await issue(id);await rejects("update finance_tax_document_corrections set reason='Overwrite original correction' where id=$1",[id],/IMMUTABLE/);
 await rejects("update finance_tax_correction_documents set issued_snapshot_json='{}' where id=$1",[id],/IMMUTABLE/);
 await rejects('delete from finance_tax_correction_audit_events where correction_id=$1',[id],/IMMUTABLE/);
 const same=args(s,'credit_note',1000,{evidence:a[6]});await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',same,/tax_correction_evidence_once/);
});
test('043 rollback of late audit failure restores case, issued document and number; cumulative credit coverage is bounded',async()=>{
 const s=await source(),id=await create(args(s,'credit_note',9000));await approve(id);const before=await financialState(),counters=await query('select * from finance_document_counters');
 await db.exec("create function fail_correction_audit() returns trigger language plpgsql as $$begin if new.event_type='issued' then raise exception 'SYNTHETIC_CORRECTION_FAILURE';end if;return new;end$$;create trigger fixture_fail before insert on finance_tax_correction_audit_events for each row execute function fail_correction_audit()");
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,(await row(id)).draft_snapshot_json],/SYNTHETIC/);
 assert.equal((await row(id)).status,'approved');assert.equal(await doc(id),null);assert.deepEqual(await query('select * from finance_document_counters'),counters);assert.deepEqual(await financialState(),before);
 await db.exec('drop trigger fixture_fail on finance_tax_correction_audit_events');await rpc('issue_finance_tax_correction',[id,(await row(id)).draft_snapshot_json,true,true]);await flush();
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,'credit_note',1000.01),/COVERAGE_EXCEEDED/);
 const last=await create(args(s,'credit_note',1000));await issue(last);assert.equal(Number((await doc(last)).issued_snapshot_json.totals.resulting_vat),0);
});
module.exports={setup,source,create,args,row,doc,issue,approve};

test('043 standalone identity replacement, stale identity refusal, issue-only number and frozen copy',async()=>{
 const s=await source(false),id=await create(args(s,'cancel_and_reissue')),snapshot=(await row(id)).draft_snapshot_json;
 const counters=await query('select * from finance_document_counters');
 await rejects('select approve_finance_tax_correction($1,$2,true,\'Reviewed evidence\',false)',[id,snapshot],/LEGAL_REVIEW/);
 await approve(id);
 await query("update clients set address='Profile changed after approval' where id=$1",[ids.client]);
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,snapshot],/BUYER/);
 assert.deepEqual(await query('select * from finance_document_counters'),counters);
 await query('update clients set address=$2 where id=$1',[ids.client,snapshot.tax.customer.address]);
 await rpc('issue_finance_tax_correction',[id,snapshot,true,true]);await flush();
 assert.equal((await doc(id)).document_no,'VP-TI-202607-000002');
 const copy=await create(args(s,'replacement_copy'));await issue(copy);
 assert.equal((await doc(copy)).document_no,(await doc(id)).document_no);
 assert.deepEqual((await doc(copy)).issued_snapshot_json.tax,(await doc(id)).issued_snapshot_json.tax);
});

test('043 draft original refused; bad input, duplicate request and cancelled case cannot consume numbers',async()=>{
 const s=await source(),draftSource=await combined.source();const draft=await combined.create(draftSource.p.id),draftRow=await combined.combined(draft);
 await rejects('select get_finance_tax_correction_context($1,$2)',[draftRow.tax_invoice_id,draft],/ISSUED_ORIGINAL/);
 for(const mode of ['credit_note','debit_note'])for(const value of [-1,0,0.001,'NaN','Infinity'])await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s,mode,value),/AMOUNT_INVALID/);
 const missing=args(s);missing[6]='';await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',missing,/REASON_EVIDENCE/);
 const late=args(s);late[7]='2026-09-01';await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',late,/PERIOD_REVIEW/);
 const duplicate=args(s);duplicate[9].push({...duplicate[9][0]});await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',duplicate,/COVERAGE_INVALID/);
 const wrong=args(s);wrong[9][0].item_id=randomUUID();await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',wrong,/COVERAGE_INVALID/);
 const a=args(s),id=await create(a),conflict=structuredClone(a);conflict[4]='Different reason';
 await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',conflict,/IDEMPOTENCY_CONFLICT/);
 await approve(id);await rpc('cancel_finance_tax_correction_draft',[id,'Reviewed cancellation']);
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,(await row(id)).draft_snapshot_json],/APPROVAL_REQUIRED/);
 assert.equal(await doc(id),null);assert.equal(await scalar("select count(*) from finance_document_counters where doc_type in ('credit_note','debit_note')"),0);
});

test('043 combined permissions require both domains; original number collision rolls back after debit issue',async()=>{
 const s=await source();await query('update user_profiles set can_view_finance_tax_invoices=true,can_manage_finance_tax_invoices=true,can_issue_finance_tax_invoices=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>{
   await rejects('select get_finance_tax_correction_context($1,$2)',[s.tid,s.cid],/PERMISSION/);
   await rejects('select create_finance_tax_correction_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args(s),/PERMISSION/);
 });
 const dn=await create(args(s,'debit_note',10000));await issue(dn);
 const id=await create(args(s,'cancel_and_reissue'));await approve(id);
 await query("update finance_document_counters set last_no=0 where doc_type='receipt_tax_invoice'");
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,(await row(id)).draft_snapshot_json],/NUMBER_COLLISION/);
 assert.equal(await doc(id),null);assert.equal((await row(id)).status,'approved');
});

test('043 deferred lines and approved evidence cannot be rewritten through trusted SQL mistakes',async()=>{
 const s=await source(),id=await create(args(s));await approve(id);await flush();
 await rejects("update finance_tax_document_corrections set status='issued',issued_at=now(),issued_by_user_id=$2,approval_evidence='Different evidence' where id=$1",[id,ids.admin],/IMMUTABLE/);
 await rejects('delete from finance_tax_correction_lines where correction_id=$1',[id],/IMMUTABLE/);
 await db.exec('savepoint tampered_line');
 const foreign=await source(false,false); // Another synthetic legal original, not a reset.
 await query('insert into finance_tax_correction_lines(correction_id,original_tax_invoice_item_id,base_change,vat_change,previous_base,previous_vat,resulting_base,resulting_vat,source_snapshot_json) values($1,$2,1,0,1,0,0,0,\'{}\')',[id,foreign.item]);
 await rejects('set constraints all immediate',[],/LINE_INTEGRITY/);
 await db.exec('rollback to savepoint tampered_line');
});

test('043 operator artifacts compile, exact catalog includes RLS/triggers, rollback leaves no candidate objects',async()=>{
 const fs=require('node:fs'),path=require('node:path');await previous();
 const {workflow,catalogSql,filenames}=require('./tax-correction-artifacts.cjs');
 const pre=(await query(workflow()[filenames.pre]))[0];assert.equal(pre.checks['043_objects_unused'],true);
 assert.equal(pre.checks.predecessor_contracts_exact,true,JSON.stringify(pre.function_differences));
 assert.equal(pre.checks.manual_external_number_gate,true);
 const before=await financialState();await db.exec('savepoint candidate043');await db.exec(migration('43'));
 const actual=await query(catalogSql),manifest=path.join(__dirname,'tax-correction-catalog.json');
 if(process.env.UPDATE_TAX_CORRECTION_MANIFEST==='1')fs.writeFileSync(manifest,JSON.stringify(actual,null,2)+'\n');
 assert.deepEqual(actual,JSON.parse(fs.readFileSync(manifest,'utf8')));
 const artifacts=workflow(),verified=(await query(artifacts[filenames.verify]))[0];
 for(const [name,passed] of Object.entries(verified.checks))if(!name.startsWith('protected_'))assert.equal(passed,true,name+JSON.stringify(verified.function_differences));
 assert.deepEqual(verified.catalog_differences,[]);assert.deepEqual(await financialState(),before);
 await db.exec('alter table finance_tax_correction_lines add column unexpected text');
 const drift=(await query(artifacts[filenames.verify]))[0];assert.equal(drift.checks.exact_tables_policies_triggers,false);assert.equal(drift.catalog_differences[0].table_name,'finance_tax_correction_lines');
 await db.exec('rollback to savepoint candidate043');
 await db.exec(artifacts[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator_dry_run;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator_dry_run;'));
 assert.equal(await scalar("select to_regclass('public.finance_tax_document_corrections')"),null);assert.deepEqual(await financialState(),before);
});
