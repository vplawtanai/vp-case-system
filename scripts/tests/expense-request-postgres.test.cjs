/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. No credentials or Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./expense-foundation-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {people}=require('./vp-formula.test.cjs');
const setup=async()=>{await prior.setup();try{await db.exec(migration('56'));}catch(e){throw new Error([e.message,e.position,e.internalPosition,e.internalQuery,e.where].filter(Boolean).join('\n'),{cause:e});}};
const items=(amounts=[300,120,450,1000],extra={})=>amounts.map((gross_amount,i)=>({id:randomUUID(),version:null,input:prior.input({gross_amount,expense_date:['2026-09-03','2026-09-05','2026-09-08','2026-09-12'][i%4],personally_paid:true,reimbursement_requested:gross_amount,...extra})}));
async function save(lines=items(),kind='employee_claim'){const id=randomUUID(),op=randomUUID();await rpc('save_finance_expense_request',[id,op,null,kind,'Weekly synthetic request',lines]);return{id,op,lines};}
const read=id=>scalar('select get_finance_expense_requests($1)',[id]);
test('056 weekly Claim: one envelope, original dates, exact totals, atomic submission and retry',async()=>{
 await setup();let r;await asActor(ids.staff,async()=>{
  r=await save();let doc=await read(r.id);assert.equal(doc.items.length,4);assert.equal(doc.items.reduce((n,e)=>n+e.gross_amount,0),1870);
  assert.deepEqual(doc.items.map(e=>e.expense_date),['2026-09-03','2026-09-05','2026-09-08','2026-09-12']);assert.ok(doc.items.every(e=>e.claimant_id===ids.staff));
  await rpc('save_finance_expense_request',[r.id,r.op,null,'employee_claim','Weekly synthetic request',r.lines]);assert.equal((await read(r.id)).version,1);
  await rpc('submit_finance_expense_request',[r.id,1]);doc=await read(r.id);assert.equal(doc.status,'submitted');assert.ok(doc.items.every(e=>e.submitted_at===doc.submitted_at&&e.status==='submitted'));
  await rpc('submit_finance_expense_request',[r.id,1]);assert.equal((await read(r.id)).submitted_at,doc.submitted_at);
  assert.equal((await scalar('select get_finance_expenses(null,true)')).rows.length,0);assert.equal((await scalar('select get_finance_expense_requests(null,true)')).rows.length,1);
 });
 assert.equal(await scalar("select count(*)::int from finance_expense_request_audit where event_type='submitted'"),1);
 for(const table of ['finance_cash_transactions','finance_expense_obligations','finance_expense_settlements'])assert.equal(await scalar('select count(*)::int from '+table),0);
});
test('056 partial review: three accepted, one rejected, 870 reimbursement, no duplicate obligation or cash',async()=>{
 await setup();let r;await asActor(ids.staff,async()=>{r=await save();await rpc('submit_finance_expense_request',[r.id,1]);});
 await rpc('save_finance_payee',[ids.staff,ids.staff,{destination:{bank_name:'Synthetic',account_name:'Staff',account_number:'12345678'}},null]);
 for(const [i,e] of (await read(r.id)).items.entries()){
  await rpc('review_finance_expense',[e.id,e.version,i<3,'Synthetic per-item decision']);
  if(i<3){await prior.settlement(e.id,'reimburse',ids.staff,e.gross_amount);await rejects('select decide_finance_expense_settlement($1,$2,\'reimburse\',$3,$4,null,\'duplicate\')',[randomUUID(),e.id,ids.staff,e.gross_amount],/ALREADY_DECIDED/);}
  else await rejects('select decide_finance_expense_settlement($1,$2,\'reimburse\',$3,$4,null,\'rejected\')',[randomUUID(),e.id,ids.staff,e.gross_amount],/ACCEPTED_REQUIRED/);
 }
 assert.deepEqual((await read(r.id)).items.map(e=>e.status),['accepted','accepted','accepted','rejected']);
 assert.equal(await scalar('select sum(gross_amount)::text from finance_expense_obligations'),'870.00');
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('056 multi-supplier: independent obligations/tax and unchanged standalone paths',async()=>{
 await setup();const a=people[0].id,b=people[1].id;
 for(const id of [a,b])await rpc('save_finance_payee',[id,id,{destination:{bank_name:'Synthetic',account_name:'Supplier',account_number:'12345678'}},null]);
 const lines=items([300,120,450],{personally_paid:false,reimbursement_requested:0});lines.forEach((l,i)=>l.input.supplier_payee_id=i<2?a:b);
 const r=await save(lines,'company_expense_batch');await rpc('submit_finance_expense_request',[r.id,1]);
 for(const [i,e] of (await read(r.id)).items.entries()){
  await rpc('review_finance_expense',[e.id,e.version,true,'Accept item']);
  await prior.review(e.id,i===0?{vat_base:280.37,vat_rate:7,wht_state:'withhold',wht_base:280.37,wht_rate:3}:i===1?{vat_state:'none',eligibility:'ineligible'}:{vat_state:'pending',eligibility:'pending'});
  await prior.settlement(e.id,'supplier_unpaid',e.supplier_payee_id,e.gross_amount);
 }
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),1);
 assert.equal(await scalar("select sum(tax_amount)::text from finance_tax_position_facts where tax_kind='input_vat'"),'19.63');
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 assert.deepEqual(await query('select payee_id,count(*)::int n from finance_expense_obligations group by payee_id order by payee_id'),[{payee_id:a,n:2},{payee_id:b,n:1}].sort((a,b)=>a.payee_id.localeCompare(b.payee_id)));
 const standalone=await prior.accepted();assert.equal((await scalar('select get_finance_expenses($1)',[standalone])).record.request_id,null);
 assert.equal((await scalar('select get_finance_expenses()')).rows.length,1);
});
test('056 permissions, stale versions, no adoption, direct child bypass and atomic invalid item rollback',async()=>{
 await setup();const standalone=await prior.accepted();const r=await save(items([100]));const doc=await read(r.id),e=doc.items[0];
 await rejects('select submit_finance_expense($1,$2)',[e.id,e.version],/REQUEST_SUBMIT_REQUIRED/);
 await rejects('select save_finance_expense($1,$2,$3)',[e.id,e.version,prior.input()],/REQUEST_EDIT_REQUIRED/);
 await rejects('select save_finance_expense_request($1,$2,0,\'employee_claim\',\'\',$3)',[r.id,randomUUID(),r.lines],/STALE/);
 await rejects('select save_finance_expense_request($1,$2,null,\'employee_claim\',\'\',$3)',[randomUUID(),randomUUID(),[{...r.lines[0],id:standalone}]],/ITEM_INVALID/);
 await rejects('select save_finance_expense_request($1,$2,null,\'employee_claim\',\'\',$3)',[randomUUID(),randomUUID(),[r.lines[0],r.lines[0]]],/DUPLICATE_ITEM/);
 await rejects('select save_finance_expense_request($1,$2,null,\'employee_claim\',\'different input\',$3)',[r.id,r.op,r.lines],/IDEMPOTENCY/);
 const invalid=items([100,0]),invalidId=randomUUID();await rejects('select save_finance_expense_request($1,$2,null,\'employee_claim\',\'\',$3)',[invalidId,randomUUID(),invalid],/check constraint/);
 assert.equal(await scalar('select count(*)::int from finance_expense_requests where id=$1',[invalidId]),0);assert.equal(await scalar('select count(*)::int from finance_expenses where id=$1',[invalid[0].id]),0);
 await asActor(ids.staff,async()=>{
  await rejects('select get_finance_expense_requests($1)',[r.id],/PERMISSION_DENIED/);
  await rejects('select submit_finance_expense_request($1,1)',[r.id],/PERMISSION_DENIED/);
  await rejects('select * from finance_expense_requests',[],/permission denied/);
  await rejects('select submit_finance_expense_before_requests($1,$2)',[e.id,e.version],/permission denied/);
 });
});
test('056 Draft replace/remove preserves history and locks edits after submission',async()=>{
 await setup();const r=await save(items([100,200,300]));const doc=await read(r.id),keep=doc.items[1];
 await rpc('save_finance_expense_request',[r.id,randomUUID(),1,'employee_claim','Revised',[{id:keep.id,version:keep.version,input:r.lines[1].input}]]);
 assert.equal((await read(r.id)).items.length,1);assert.equal(await scalar('select count(*)::int from finance_expenses'),3);
 assert.equal((await scalar('select get_finance_expenses()')).rows.length,0);
 await rpc('submit_finance_expense_request',[r.id,2]);
 await rejects('select save_finance_expense_request($1,$2,3,\'employee_claim\',\'\',$3)',[r.id,randomUUID(),r.lines],/STALE/);
 await rejects('update finance_expense_request_items set active=true where expense_id=$1',[doc.items[0].id],/ITEM_INVALID/);
 await rejects('delete from finance_expense_requests where id=$1',[r.id],/IMMUTABLE/);
});
module.exports={setup,items,save,read};
test('056 custodian entry account survives Draft reload; no payment, no permission widening',async()=>{
 await setup();await rpc('set_finance_treasury_authority',[ids.staff,ids.bank,null,{record_outflow:true},null,'Synthetic record-only assignment']);
 let r;await asActor(ids.staff,async()=>{
  await rejects('select save_finance_expense_request($1,$2,null,\'company_expense_batch\',\'\',$3)',[randomUUID(),randomUUID(),items([100],{personally_paid:false,reimbursement_requested:0})],/PERMISSION_DENIED/);
  r=await save(items([100],{personally_paid:false,reimbursement_requested:0,bank_account_id:ids.bank}),'company_expense_batch');
  let d=await read(r.id);assert.equal(d.items[0].request_entry_account.bank_account_id,ids.bank);
  const line={id:d.items[0].id,version:d.items[0].version,input:{...r.lines[0].input,...d.items[0].request_entry_account}};
  await rpc('save_finance_expense_request',[r.id,randomUUID(),d.version,'company_expense_batch','Changed note',[line]]);
  d=await read(r.id);await rpc('submit_finance_expense_request',[r.id,d.version]);assert.equal((await read(r.id)).items[0].request_entry_account,null);
 });
 assert.equal((await read(r.id)).items[0].request_entry_account,null);
 for(const table of ['finance_cash_transactions','finance_expense_obligations','finance_expense_settlements','finance_payouts'])assert.equal(await scalar('select count(*)::int from '+table),0);
});
test('056 standalone paid-entry remains explicit/idempotent; request submission failure is atomic',async()=>{
 await setup();const treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
 await treasury.opening({amount:30000});const paid=randomUUID();
 await rpc('record_finance_paid_expense',[paid,prior.input(),ids.bank,null,'2026-09-10',true]);await payout.flush();
 await rpc('record_finance_paid_expense',[paid,prior.input(),ids.bank,null,'2026-09-10',true]);await payout.flush();
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),1);
 const r=await save(items([100,200]));
 await db.exec("create function reject_request_audit_fixture() returns trigger language plpgsql as $$ begin if new.event_type='submitted' then raise exception 'FIXTURE_SUBMISSION_FAILURE'; end if; return new; end $$; create trigger reject_request_audit_fixture before insert on finance_expense_request_audit for each row execute function reject_request_audit_fixture();");
 await rejects('select submit_finance_expense_request($1,1)',[r.id],/FIXTURE_SUBMISSION_FAILURE/);
 const d=await read(r.id);assert.equal(d.status,'draft');assert.equal(d.submitted_at,null);assert.ok(d.items.every(e=>e.status==='draft'&&e.submitted_at===null));assert.equal(d.audit.length,1);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),1);
});
test('056 assigned child remains visible without leaking inaccessible request siblings',async()=>{
 await setup();const r=await save(items([10700,200],{personally_paid:false,reimbursement_requested:0}),'company_expense_batch');await rpc('submit_finance_expense_request',[r.id,1]);
 const e=(await read(r.id)).items[0];await rpc('review_finance_expense',[e.id,e.version,true,'Synthetic acceptance']);await prior.review(e.id);await prior.settlement(e.id,'company_bank');await prior.prepare(e.id);
 await rpc('set_finance_treasury_authority',[ids.staff,ids.bank,null,{record_outflow:true},null,'Assigned fixture account']);
 await asActor(ids.staff,async()=>{
  const rows=(await scalar('select get_finance_expenses()')).rows;assert.equal(rows.length,1);assert.equal(rows[0].id,e.id);assert.equal(rows[0].request_id,r.id);
  assert.equal((await scalar('select get_finance_expense_requests()')).rows.length,0);await rejects('select get_finance_expense_requests($1)',[r.id],/PERMISSION_DENIED/);
 });
});
test('056 exact catalog and SELECT-only rollback rehearsal',async()=>{
 const fs=require('node:fs'),a=require('./expense-request-artifacts.cjs');await prior.setup();const before=await query(a.priorSql());
 await db.exec('savepoint before056');await db.exec(migration('56'));
 const manifest={sha256:a.sha(),prior:before,functions:await query(a.postSql()),catalog:await query(a.catalogSql)};
 if(process.env.WRITE_056_MANIFEST==='1') {fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));
 const files=a.workflow();for(const [file,sql] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before056');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const results=await db.exec(files[a.filenames.dry]);const verified=results.flatMap(r=>r.rows).find(r=>'expense_request_foundation_verification_pass' in r);assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));
 assert.equal(await scalar("select to_regclass('public.finance_expense_requests')"),null);
 assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
