/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL WASM only. No network, Supabase client or Production credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./employee-reimbursement-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,ids,migration,asActor}=require('./receipt-foundation.test.cjs');
async function setup(apply=true){await prior.setup();await db.exec(require('./direct-money-documents-security.cjs').fixtureSecuritySql());for(const n of ['62','63','64','65',...(apply?['66']:[])])try{await db.exec(migration(n));}catch(e){throw new Error(`${n}: ${e.message}; ${e.where}; ${e.internalQuery}; position=${e.position}; near=${migration(n).slice(Number(e.position)-150,Number(e.position)+100)}`,{cause:e});}}
async function customer(){const p=await scalar('select get_finance_customer_tax_profile($1)',[ids.client]);await scalar('select save_finance_customer_tax_profile($1,$2,$3,$4,$5,$6,$7,$8)',[ids.client,false,null,null,'Written customer identity evidence',true,p.identity,p.profile?.updated_at??null]);}
async function source(tax=true){await treasury.opening();await customer();const id=randomUUID();const input=direct.input([direct.line(tax?{}:{vat_applicable:false,vat_rate:0,vat_treatment_json:{schema_version:1,treatment:'exempt',reason:'Explicit exempt evidence'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})],tax?10400:10000);input.received_on='2026-09-15';await direct.save(id,input);await direct.transition(id,1,'confirm');return id;}
const decision=id=>scalar('select get_finance_received_document_decision($1,$2)',['direct_money_receipt',id]);
const create=id=>rpc('create_finance_received_document_draft',['direct_money_receipt',id,true,true]);
const combined=id=>scalar('select to_jsonb(c) from finance_combined_documents c where id=$1',[id]);
const tax=id=>scalar('select to_jsonb(t) from finance_tax_invoices t where id=$1',[id]);
async function save(id){const c=await combined(id);await rpc('save_finance_combined_document_draft',[id,'2026-09-15',{no_earlier_event:true,external_coverage_checked:true},c.updated_at]);}
async function issue(id){await rpc('issue_finance_combined_document',[id,(await combined(id)).draft_snapshot_json,true,true,true,true]);}
async function money(){const tables=(await query("select tablename from pg_tables where schemaname='public' and (tablename in ('finance_payments','finance_invoices','finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_filings','finance_tax_position_audit') or tablename ~ '^finance_(cash_|account_|payout|payable|expense|vp_|compensation)') order by tablename")).map(r=>r.tablename);return Object.fromEntries(await Promise.all(tables.map(async t=>[t,await scalar('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,\'[]\')) from '+t+' t')])));}
const monthly=()=>scalar("select tax_filing_monthly_facts('2026-09-01')");
function capture(key,value){if(process.env.CAPTURE_066_RENDER){const fs=require('node:fs'),path='/private/tmp/066-render.json';const f=fs.existsSync(path)?JSON.parse(fs.readFileSync(path)):{};f[key]=value;fs.writeFileSync(path,JSON.stringify(f));}}
for(const taxable of [true,false])test(`066 authenticated Admin issues ${taxable?'Combined':'Receipt'} through definer RPCs while direct calculation-helper access stays denied`,async()=>{
 await setup();const signature=require('./direct-money-documents-security.cjs').signature;
 assert.deepEqual(await scalar(`select jsonb_build_object('anon',has_function_privilege('anon',$1,'EXECUTE'),'authenticated',has_function_privilege('authenticated',$1,'EXECUTE'),'service_role',has_function_privilege('service_role',$1,'EXECUTE'),'postgres',has_function_privilege('postgres',$1,'EXECUTE'))`,[signature]),{anon:false,authenticated:false,service_role:true,postgres:true});
 await asActor(ids.admin,()=>rejects("select * from calculate_finance_billable_charge_amounts(1,10000,'vat_exclusive',7)",[],/permission denied for function/));
  const sid=await source(taxable),before=await money();
  await asActor(ids.admin,async()=>{
   assert.equal(await scalar('select current_user'),'authenticated');
   assert.equal((await decision(sid)).decision,taxable?'combined_receipt_tax_invoice':'receipt_only');
   const id=await create(sid);assert.equal(await create(sid),id);
   if(taxable){await save(id);await issue(id);await issue(id);assert.equal((await combined(id)).status,'issued');}
   else {const snapshot=await scalar('select draft_snapshot_json from finance_receipts where id=$1',[id]);await rpc('issue_finance_receipt',[id,true,snapshot]);await rpc('issue_finance_receipt',[id,true,snapshot]);assert.equal(await scalar('select status from finance_receipts where id=$1',[id]),'issued');}
   assert.equal((await decision(sid)).decision,'complete');
  });
  assert.deepEqual(await money(),before);
});
test('066 taxable Direct uses existing Combined, VAT/WHT/cash once, frozen snapshot and idempotent numbering',async()=>{
 await setup();const initial=await monthly();const sourceId=await source();const before=await money(),m=await monthly();assert.equal((await decision(sourceId)).decision,'combined_receipt_tax_invoice');
 const id=await create(sourceId);assert.equal(await create(sourceId),id);await save(id);await issue(id);const c=await combined(id),t=await tax(c.tax_invoice_id);
 assert.equal(c.status,'issued');assert.equal(c.combined_no,'VP-RTI-202609-000001');assert.equal(c.payment_id,null);assert.equal(t.invoice_id,null);assert.equal(t.payment_id,null);
 assert.equal(t.direct_money_receipt_id,sourceId);assert.equal(t.issued_snapshot_json.money.cash_amount,10400);assert.equal(t.issued_snapshot_json.money.wht_amount,300);
 assert.equal(t.issued_snapshot_json.money.vat_amount,700);assert.equal(t.issued_snapshot_json.money.settlement_amount,10700);
 assert.equal(t.issued_snapshot_json.invoice,undefined);assert.equal(t.issued_snapshot_json.payment,undefined);
 await issue(id);assert.deepEqual(await combined(id),c);assert.deepEqual(await money(),before);assert.deepEqual(await monthly(),m);assert.equal(m.output_vat-initial.output_vat,700);
 assert.deepEqual((await scalar("select tax_position_source('tax_invoice',$1)",[t.id])).lines,[]);
 const register=await scalar('select get_finance_tax_position()'),facts=register.facts.filter(f=>f.source_id===sourceId);
 assert.deepEqual(facts.map(f=>[f.tax_kind,f.tax_amount]).sort(),[['incoming_wht',300],['output_vat',700]]);
 assert.equal(register.facts.filter(f=>f.source_id===t.id).length,0);
 assert.equal(register.pending_sources.filter(f=>f.source_id===t.id||f.id===t.id).length,0);
 assert.equal(await scalar('select count(*)::int from finance_tax_source_revisions where source_id=$1',[t.id]),0);
 assert.equal((await decision(sourceId)).decision,'complete');
 require('./combined-document-render-fixture.cjs');
 assert.ok(require('../../app/finance/combined-documents/shared.ts').combinedTaxRow(c,t),'Actual 066 PostgreSQL snapshots use the existing renderer');
 if(process.env.CAPTURE_066_RENDER)require('node:fs').writeFileSync('/private/tmp/066-render.json',JSON.stringify({combined:c,tax:t,receipt:await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[c.receipt_id])}));
 await rejects("update finance_tax_invoices set issued_snapshot_json='{}' where id=$1",[t.id],/IMMUTABLE/);
 await rejects("select transition_finance_direct_money_receipt($1,2,'reverse',true,'Correction required')",[sourceId],/DOCUMENT_DEPENDENCY|TREASURY_CASH_CORRECTION/);
});
test('066 non-tax Receipt uses existing RC lifecycle and preserves money; tax route is not arbitrary',async()=>{
 await setup();const sourceId=await source(false),before=await money();assert.equal((await decision(sourceId)).decision,'receipt_only');
 const id=await create(sourceId),r=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[id]);
 await rpc('issue_finance_receipt',[id,true,r.draft_snapshot_json]);const issued=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[id]);
 assert.equal(issued.receipt_no,'VP-RC-202609-000001');await rpc('issue_finance_receipt',[id,true,r.draft_snapshot_json]);
 capture('standalone_receipt',issued);
 await rpc('void_finance_receipt',[id,'Erroneous documentary receipt',true]);const next=await create(sourceId);assert.notEqual(next,id);
 assert.equal(await scalar('select replaces_receipt_id from finance_receipts where id=$1',[next]),id);assert.deepEqual(await money(),before);
});
test('066 permissions, missing acknowledgements, stale review and cancelled coverage fail safely',async()=>{
 await setup();const sourceId=await source();await asActor(ids.staff,()=>rejects('select create_finance_received_document_draft($1,$2,true,true)',['direct_money_receipt',sourceId],/PERMISSION_DENIED/));
 await rejects('select create_finance_received_document_draft($1,$2,false,false)',['direct_money_receipt',sourceId],/EXTERNAL_CHECK/);
 const id=await create(sourceId),c=await combined(id);await rejects('select issue_finance_receipt($1,true,$2)',[c.receipt_id,{}],/COMBINED_WORKFLOW/);
 await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,{}],/STALE_REVIEW/);
 await rpc('cancel_finance_combined_document_draft',[id,'Cancelled local test draft']);assert.equal(await scalar("select count(*)::int from finance_tax_invoice_source_coverages where status='reserved'"),0);
 const next=await create(sourceId);assert.notEqual(next,id);await save(next);await issue(next);
});
module.exports={setup,source,customer,decision,create,combined,tax,save,issue,money,monthly};

test('066 serialized PGlite duplicate submissions return one document and number; uniqueness protects coverage (not independent sessions)',async()=>{
 await setup();const sid=await source();const attempts=await Promise.all(Array.from({length:8},()=>create(sid)));assert.equal(new Set(attempts).size,1);
 const id=attempts[0];await save(id);await Promise.all(Array.from({length:8},()=>issue(id)));
 assert.equal(await scalar("select count(*)::int from finance_combined_documents where direct_money_receipt_id=$1",[sid]),1);
 assert.equal(await scalar("select sum(last_no)::int from finance_document_counters where doc_type='receipt_tax_invoice'"),1);
 const c=await combined(id),item=await scalar('select to_jsonb(i) from finance_tax_invoice_items i where tax_invoice_id=$1',[c.tax_invoice_id]);
 await rejects(`insert into finance_tax_invoice_source_coverages(tax_invoice_id,tax_invoice_item_id,direct_money_receipt_id,direct_source_line_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
 select tax_invoice_id,tax_invoice_item_id,direct_money_receipt_id,direct_source_line_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json from finance_tax_invoice_source_coverages where tax_invoice_id=$1`,[c.tax_invoice_id],/unique|duplicate/);
 assert.equal(item.direct_money_receipt_id,sid);
});

test('066 missing identity, unclassified source and source changes block without inventing evidence',async()=>{
 await setup();const sid=await source();await query('update clients set address=$1 where id=$2',['Changed since verified',ids.client]);
 assert.ok((await decision(sid)).blockers.includes('TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED'));
 const id=await create(sid);await save(id);await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[id,(await combined(id)).draft_snapshot_json],/CUSTOMER_IDENTITY/);
 await rpc('cancel_finance_combined_document_draft',[id,'Refresh reviewed customer identity']);await customer();
 const next=await create(sid);await save(next);
 const d=await scalar('select to_jsonb(d) from finance_direct_money_receipts d where id=$1',[sid]);
 const choices=d.lines_json.map(l=>({source_line_id:l.source_line_id,money_nature:l.money_nature,classification:'additional_service'}));
 await rejects('select classify_finance_direct_money_receipt($1,$2,$3,true,$4)',[sid,d.version,choices,'Reclassify documented source'],/DOCUMENT_DEPENDENCY|INVALID/);
 await query('update clients set address=$1 where id=$2',['Another change',ids.client]);
 await rejects('select issue_finance_combined_document($1,$2,true,true,true,true)',[next,(await combined(next)).draft_snapshot_json],/SOURCE_CHANGED/);
});

for(const mode of ['replacement_copy','cancel_and_reissue','credit_note','debit_note'])test(`066 Direct ${mode} uses existing correction lifecycle; originals/money remain frozen`,async()=>{
 await setup();const sid=await source(),id=await create(sid);await save(id);await issue(id);const c=await combined(id),t=await tax(c.tax_invoice_id),before=await money(),m=await monthly();
 const item=await scalar('select id from finance_tax_invoice_items where tax_invoice_id=$1',[t.id]);
 const args=[randomUUID(),t.id,c.id,mode,'Document correction with actual evidence',({replacement_copy:'lost',cancel_and_reissue:'documentary_identity_error',credit_note:'service_overcharge',debit_note:'service_undercharge'})[mode],randomUUID(),'2026-09-16','2026-09-16',mode.endsWith('_note')?[{item_id:item,base_change:1000}]:[]];
 const cid=await rpc('create_finance_tax_correction_draft',args);assert.equal(await rpc('create_finance_tax_correction_draft',args),cid);
 const cr=await scalar('select to_jsonb(c) from finance_tax_document_corrections c where id=$1',[cid]);assert.equal(cr.direct_money_receipt_id,sid);assert.equal(cr.invoice_id,null);assert.equal(cr.payment_id,null);
 await rpc('approve_finance_tax_correction',[cid,cr.draft_snapshot_json,true,'Reviewed documentary correction',true]);
 await rpc('issue_finance_tax_correction',[cid,cr.draft_snapshot_json,true,true]);await rpc('issue_finance_tax_correction',[cid,cr.draft_snapshot_json,true,true]);
 assert.deepEqual(await tax(t.id),t);assert.deepEqual(await combined(c.id),c);
 const after=await money();for(const name of Object.keys(before).filter(n=>!n.startsWith('finance_tax_')))assert.equal(after[name],before[name],name);
 assert.equal((await monthly()).output_vat,m.output_vat+(mode==='credit_note'?-70:mode==='debit_note'?70:0));
 require('./tax-correction-render-fixture.cjs');const issued=await scalar('select to_jsonb(d) from finance_tax_correction_documents d where id=$1',[cid]);
 assert.ok(require('../../app/finance/tax-corrections/document.tsx').correctionTaxProjection(cr,issued).presentation.ok);
});

test('066 existing Invoice/Payment Combined and standalone completion remain unchanged',async()=>{
 await setup();const old=require('./tax-correction-postgres.test.cjs');
 for(const paired of [true,false]){const s=await old.source(paired,false);assert.equal((await tax(s.tid)).direct_money_receipt_id,null);assert.equal((await tax(s.tid)).status,'issued');}
});

test('066 existing Direct standalone Receipt completes only Tax Invoice with the same source coverage',async()=>{
 await setup();const sid=await source();const s=await scalar('select document_direct_source($1)',[sid]),rid=randomUUID();
 // Seed an already-existing standalone documentary counterpart, not an Invoice/Payment surrogate.
 await query(`insert into finance_receipts(id,direct_money_receipt_id,client_id,receipt_date,currency,cash_amount,wht_amount,draft_snapshot_json,external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id)
 values($1,$2,$3,'2026-09-15','THB',10400,300,document_direct_source($2)||jsonb_build_object('document_kind','receipt'),now(),$4,$4)`,[rid,sid,ids.client,ids.admin]);
 await scalar("select record_finance_receipt_audit($1,'draft_created',$2)",[rid,{direct_money_receipt_id:sid,external_receipt_checked:true}]);
 await rpc('issue_finance_receipt',[rid,true,{...s,document_kind:'receipt'}]);const before=await money();
 assert.equal((await decision(sid)).decision,'tax_invoice_completion_only');const tid=await create(sid),t=await tax(tid);
 assert.equal(t.combined_document_id,null);assert.equal(t.source_snapshot_json.receipt_reference.id,rid);
 await rpc('save_finance_tax_invoice_draft',[tid,'2026-09-15',{no_earlier_event:true,external_coverage_checked:true},t.updated_at]);
 await asActor(ids.admin,async()=>rpc('issue_finance_tax_invoice',[tid,(await tax(tid)).draft_snapshot_json,true,true]));assert.equal((await decision(sid)).decision,'complete');
 assert.equal((await tax(tid)).tax_invoice_no,'VP-TI-202609-000001');assert.deepEqual(await money(),before);
 capture('standalone_tax',await tax(tid));
});

test('066 existing Direct standalone Tax Invoice completes only Receipt; mixed real source lines retain exact coverage',async()=>{
 await setup();await treasury.opening();await customer();const sid=randomUUID();
 const payload=direct.input([direct.line(),direct.line({description:'Exempt service',vat_applicable:false,vat_rate:0,vat_treatment_json:{schema_version:1,treatment:'exempt',reason:'Explicit exempt evidence'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})],20400);
 payload.received_on='2026-09-15';await direct.save(sid,payload);await direct.transition(sid,1,'confirm');
 const tid=randomUUID(),point=randomUUID();
 // Existing standalone TI counterpart is seeded as genuine Direct coverage only.
 await query(`insert into finance_tax_invoices(id,direct_money_receipt_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id)
 values($1,$2,$3,'2026-09-15',document_direct_source($2),document_direct_snapshot(document_direct_source($2),'{}','2026-09-15'),$4)`,[tid,sid,ids.client,ids.admin]);
 await query(`insert into finance_tax_point_events(id,tax_invoice_id,event_type,occurred_on,evidence_json)
 select $1,id,'direct_money_received','2026-09-15',jsonb_build_object('source',source_snapshot_json->'source','money',source_snapshot_json->'money','policy_version','vp_v1') from finance_tax_invoices where id=$2`,[point,tid]);
 await query(`insert into finance_tax_invoice_items(tax_invoice_id,direct_money_receipt_id,direct_source_line_id,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
 select $1,$2,(l->>'source_line_id')::uuid,(l->>'base')::numeric,(l->>'vat')::numeric,(l->>'gross')::numeric,l from jsonb_array_elements(document_direct_source($2)->'tax_lines') l`,[tid,sid]);
 await query(`insert into finance_tax_invoice_source_coverages(tax_invoice_id,tax_invoice_item_id,direct_money_receipt_id,direct_source_line_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
 select tax_invoice_id,id,direct_money_receipt_id,direct_source_line_id,$2,'reserved',amount_before_vat,vat_amount,total_amount,source_snapshot_json from finance_tax_invoice_items where tax_invoice_id=$1`,[tid,point]);
 await scalar("select record_finance_tax_invoice_audit($1,'draft_created','{}')",[tid]);
 await rpc('save_finance_tax_invoice_draft',[tid,'2026-09-15',{no_earlier_event:true,external_coverage_checked:true},(await tax(tid)).updated_at]);
 await rpc('issue_finance_tax_invoice',[tid,(await tax(tid)).draft_snapshot_json,true,true]);
 assert.equal((await decision(sid)).decision,'receipt_completion_only');const before=await money(),m=await monthly(),rid=await create(sid);
 await rpc('issue_finance_receipt',[rid,true,await scalar('select draft_snapshot_json from finance_receipts where id=$1',[rid])]);
 assert.equal((await decision(sid)).decision,'complete');assert.equal(await scalar('select count(*)::int from finance_receipt_invoice_allocations where receipt_id=$1',[rid]),2);
 assert.equal(await scalar('select count(*)::int from finance_tax_invoice_source_coverages where tax_invoice_id=$1',[tid]),1);
 assert.deepEqual(await money(),before);assert.deepEqual(await monthly(),m);
});
