/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL only. The superseded paid-WHT candidate is not installed.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const previous=require('./company-tax-review-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const supplierId='60606060-6060-4060-8060-606060606060';
const setup=async()=>{await previous.setup();try{await db.exec(migration('60'));}catch(e){throw new Error([e.message,e.position,e.internalPosition,e.internalQuery,e.where].filter(Boolean).join('\n'));}};
const choices=(extra={})=>({vat_mode:'inclusive',vat_rate:7,wht_state:'withhold',wht_rate:3,...extra});
const lines=(extra={})=>requests.items([300,120],{personally_paid:false,reimbursement_requested:0,company_request_version:1,creator_payment_fact:'unpaid',creator_tax:choices(),supplier_payee_id:null,vendor_name:"Typed supplier",...extra});
async function request(extra={}){const r=await requests.save(lines(extra),'company_expense_batch');await rpc('submit_finance_expense_request',[r.id,1]);return requests.read(r.id);}
const approve=(e,c=choices(),op=randomUUID(),accept=true,reason='')=>rpc('review_finance_company_purchase_request',[op,e.id,e.version,accept,{...c,recipient_name:"Finance corrected supplier"},reason]);
test('060 prospective requests persist creator choices through save/submit; unpaid enforced; Claim unchanged',async()=>{
 await setup();await payout.payee({id:supplierId,external:true});const r=await requests.save(lines(),'company_expense_batch');
 await rpc('save_finance_expense_request',[r.id,r.op,null,'company_expense_batch','Weekly synthetic request',r.lines]);
 for(const e of (await requests.read(r.id)).items){assert.deepEqual(e.creator_tax,choices());assert.equal(e.creator_payment_fact,'unpaid');}
 await rpc('submit_finance_expense_request',[r.id,1]);assert.ok((await requests.read(r.id)).items.every(e=>e.status==='submitted'&&e.creator_tax.wht_rate===3));
 for(const override of [{creator_payment_fact:'company_paid'},{bank_account_id:ids.bank},{personally_paid:true},{company_request_version:null}]){
  await rejects('select save_finance_expense_request($1,$2,null,\'company_expense_batch\',\'\',$3)',[randomUUID(),randomUUID(),lines(override)],/UNPAID_ONLY/);
 }
 await rejects('select save_finance_expense_request($1,$2,null,\'company_expense_batch\',\'Weekly synthetic request\',$3)',[r.id,r.op,lines({creator_tax:choices({wht_rate:5})})],/IDEMPOTENCY/);
 await asActor(ids.staff,async()=>{const claim=await requests.save();assert.equal((await requests.read(claim.id)).items[0].creator_tax,null);});
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('060 reviewer corrects VAT/WHT, blank note accepted, atomic payable only, exact retry and bypass blocked',async()=>{
 await setup();await payout.payee({id:supplierId,external:true});const doc=await request(),e=doc.items[0],op=randomUUID(),corrected=choices({vat_mode:'exclusive',wht_rate:5});
 await rejects('select review_finance_expense($1,$2,true,\'\')',[e.id,e.version],/REQUEST_REVIEW_REQUIRED/);
 await approve(e,corrected,op);await approve(e,corrected,op);
 const after=(await requests.read(doc.id)).items[0];assert.deepEqual(after.creator_tax,choices());
 assert.deepEqual([after.tax_review.vat_base,after.tax_review.vat_amount,after.gross_amount,after.tax_review.wht_amount],[300,21,321,15]);
 assert.equal(after.obligation.gross_amount,321);assert.equal(after.obligation.payee_id,null);assert.equal(after.obligation.settled,false);assert.equal(after.review_reason,'');
 const queue=(await scalar('select get_finance_expense_obligations()')).rows;assert.equal(queue.length,1);assert.equal(queue[0].payee_name,'Finance corrected supplier');assert.equal(after.vendor_name,'Typed supplier');assert.equal(after.reviewed_recipient_name,'Finance corrected supplier');assert.equal(queue[0].expense_id,e.id);assert.equal(queue[0].payee_id,null);assert.equal(queue[0].gross_amount,321);assert.equal(queue[0].status,'open');
 for(const table of ['finance_cash_transactions','finance_payouts','finance_outgoing_wht_obligations'])assert.equal(await scalar('select count(*)::int from '+table),0);
 assert.equal(await scalar('select count(*)::int from finance_expense_obligations'),1);
 await rejects('select review_finance_company_purchase_request($1,$2,$3,true,$4,\'\')',[op,e.id,e.version,choices()],/IDEMPOTENCY/);
 await rejects('select review_finance_company_purchase_request($1,$2,$3,true,$4,\'\')',[randomUUID(),e.id,e.version,choices()],/STALE/);
 await payout.flush();
});
test('060 actual payment chooses bank or office cash later; cash decreases exactly once per confirmation',async()=>{
 await setup();await treasury.opening({amount:10000});
 const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});
 const doc=await request();for(const [i,e]of doc.items.entries()){
  await approve(e);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),i);
  const p=await expense.prepare(e.id,{bank:i===0?ids.bank:null,cash:i===0?null:cash,wht:true});
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),i);
  await rejects('select confirm_finance_payout($1,1,null,null,false)',[p],/ACK_REQUIRED/);
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[p]),0);
  await expense.confirm(p);await expense.confirm(p);await payout.flush();
  const snapshot=await scalar('select confirmed_snapshot_json from finance_payouts where id=$1',[p]);
  assert.equal(snapshot.payee.legal_name,'Finance corrected supplier');assert.equal(snapshot.confirmed_by,ids.admin);assert.equal(snapshot.actual_company_cash_moved,true);assert.equal(snapshot.paid_on,'2026-09-10');
  assert.equal(await scalar('select count(*)::int from finance_payees'),0);
  const c=(await query('select cash_amount,bank_account_id,cash_location_id from finance_cash_transactions where source_payout_id=$1',[p]))[0];
  assert.equal(c.cash_amount,i===0?'291.59':'116.64');assert.equal(c.bank_account_id,i===0?ids.bank:null);assert.equal(c.cash_location_id,i===0?null:cash);
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[p]),1);
 }
});
test('060 missing recipient/permissions/rejection and transactional failure preserve submitted request',async()=>{
 await setup();const doc=await request({supplier_payee_id:null}),e=doc.items[0];
 await rejects('select review_finance_company_purchase_request($1,$2,$3,true,$4,\'\')',[randomUUID(),e.id,e.version,choices()],/PAYEE_REQUIRED/);
 await rejects('select review_finance_company_purchase_request($1,$2,$3,false,$4,\'\')',[randomUUID(),e.id,e.version,choices()],/REASON_REQUIRED/);
 await asActor(ids.staff,()=>rejects('select review_finance_company_purchase_request($1,$2,$3,true,$4,\'\')',[randomUUID(),e.id,e.version,choices()],/PERMISSION_DENIED/));
 assert.equal((await requests.read(doc.id)).items[0].status,'submitted');await approve(e,choices(),randomUUID(),false,'Not approved');
 await payout.payee({id:supplierId,external:true});const good=(await request()).items[0];
 await db.exec("create function fail060() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_FAILURE';end $$;create trigger fail060 before insert on finance_expense_obligations for each row execute function fail060();");
 await rejects('select review_finance_company_purchase_request($1,$2,$3,true,$4,\'\')',[randomUUID(),good.id,good.version,{...choices(),recipient_name:'Typed supplier'}],/FIXTURE_FAILURE/);
 assert.equal(await scalar('select status from finance_expenses where id=$1',[good.id]),'submitted');assert.equal(await scalar('select count(*)::int from finance_expense_tax_reviews'),0);assert.equal(await scalar('select count(*)::int from finance_expense_settlements'),0);
});
test('060 historical paid remains readable, calculation and retrospective-WHT/correction guards unchanged',async()=>{
 await previous.setup();await treasury.opening({amount:10000});const id=await previous.submitted({creator_payment_fact:'company_paid'});
 const before=(await scalar('select get_finance_expenses($1)',[id])).record;
 await db.exec(migration('60'));const after=(await scalar('select get_finance_expenses($1)',[id])).record;assert.deepEqual(after,{...before,creator_tax:null,reviewed_recipient_name:null});
 await rpc('review_finance_expense',[id,after.version,true,'']);const op=await previous.review(id,previous.input({vat_mode:'none',wht_state:'none'}));await expense.settlement(id,'company_bank',null,300);
 const p=await expense.prepare(id);await expense.confirm(p);await payout.flush();
 await rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),id,op,previous.input({vat_mode:'none',paid_withholding_ack:true,reason:'Actual payment unchanged'})],/companyWhtExceptionBlock/);
 assert.equal(await scalar('select wht_amount::text from finance_payouts where id=$1',[p]),'0.00');
});
test('060 exact function/catalog artifacts; unchanged calculator/posting/permissions; rollback restores 059',async()=>{
 const fs=require('node:fs'),a=require('./company-review-modal-artifacts.cjs');await previous.setup();
 const prior=await query(a.functionSql()),catalog=await query(a.catalogSql);await db.exec('savepoint before060');await db.exec(migration('60'));
 const manifest={sha256:a.sha(),prior,functions:await query(a.functionSql()),catalog:await query(a.catalogSql)};
 for(const row of catalog.filter(r=>!['finance_expense_settlements','finance_expense_obligations'].includes(r.name)))assert.deepEqual(manifest.catalog.find(r=>r.name===row.name),row);
 for(const f of prior.filter(f=>!a.changed.includes(f.name)))assert.deepEqual(manifest.functions.find(p=>p.signature===f.signature),f);
 for(const f of manifest.functions.filter(f=>f.name.endsWith('_before_purchase_flow')||f.name.startsWith('company_purchase_')))assert.equal(f.authenticated_execute||f.anon_execute||f.public_execute,false);
 if(process.env.WRITE_060_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));const files=a.workflow();
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before060');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const result=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'company_purchase_request_verification_pass'in r);
 assert.deepEqual(result.failed_checks,[],JSON.stringify(result));assert.equal(result.rehearsal_baseline_available,true);assert.deepEqual(await query(a.functionSql()),prior);
 assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
module.exports={setup,choices,lines,request,approve};
