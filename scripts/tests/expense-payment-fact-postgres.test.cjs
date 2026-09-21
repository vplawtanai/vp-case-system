/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL fixtures only; no Production credentials or connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const prior=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const a=require('./expense-payment-fact-artifacts.cjs');
const setup=async()=>{await prior.setup();await db.exec(migration('57'));};
const count=t=>scalar('select count(*)::int from '+t);
test('057 four declarations persist per item through save, reload, submit and audit with no financial effect',async()=>{
 await setup();const facts=['unpaid','company_paid','personal_paid','unknown'];
 const lines=facts.map(fact=>prior.items([100],{creator_payment_fact:fact,personally_paid:fact==='personal_paid',claimant_id:fact==='personal_paid'?ids.staff:null,reimbursement_requested:fact==='personal_paid'?75:0})[0]);
 const r=await prior.save(lines,'company_expense_batch');
 assert.equal((await scalar('select get_finance_expense_access()')).creator_payment_fact_supported,true);
 assert.deepEqual((await prior.read(r.id)).items.map(i=>i.creator_payment_fact),facts);
 await rpc('save_finance_expense_request',[r.id,r.op,null,'company_expense_batch','Weekly synthetic request',r.lines]);
 await rpc('submit_finance_expense_request',[r.id,1]);await rpc('submit_finance_expense_request',[r.id,1]);
 const doc=await prior.read(r.id);assert.deepEqual(doc.items.map(i=>i.creator_payment_fact),facts);
 for(const i of doc.items){assert.equal(i.status,'submitted');assert.equal(await scalar("select evidence_json->>'creator_payment_fact' from finance_expense_audit where expense_id=$1 and event_type='saved' order by created_at desc limit 1",[i.id]),i.creator_payment_fact);}
 for(const table of ['finance_cash_transactions','finance_expense_obligations','finance_expense_settlements','finance_expense_tax_reviews','finance_outgoing_wht_obligations','finance_payouts'])assert.equal(await count(table),0,table);
 await rejects("update finance_expenses set creator_payment_fact='company_paid',version=version+1 where id=$1",[doc.items[0].id],/IMMUTABLE/);
 await rejects('select save_finance_expense_request($1,$2,$3,$4,$5,$6)',[r.id,randomUUID(),doc.version,'company_expense_batch','',r.lines],/STALE/);
});
test('057 nullable history, old callers, Claim compatibility, permissions and invalid fact atomic rollback',async()=>{
 await prior.setup();const historical=await expense.accepted();const before=await scalar("select to_jsonb(e) from finance_expenses e where id=$1",[historical]);
 await db.exec(migration('57'));assert.deepEqual(await scalar("select to_jsonb(e)-'creator_payment_fact' from finance_expenses e where id=$1",[historical]),before);
 assert.equal(await scalar('select creator_payment_fact from finance_expenses where id=$1',[historical]),null);
 const id=randomUUID(),read=()=>scalar('select to_jsonb(e) from finance_expenses e where id=$1',[id]);await rpc('save_finance_expense',[id,null,expense.input({creator_payment_fact:'unpaid'})]);let row=await read();
 await rpc('save_finance_expense',[id,row.version,expense.input()]);row=await read();assert.equal(row.creator_payment_fact,'unpaid');
 await asActor(ids.staff,async()=>{const c=await prior.save(prior.items([100]));assert.equal((await prior.read(c.id)).items[0].creator_payment_fact,null);
  await rejects("select save_finance_expense_before_requests($1,null,$2)",[randomUUID(),expense.input()],/permission denied/);
  await rejects("update finance_expenses set creator_payment_fact='unpaid' where id=$1",[id],/permission denied/);
  await rejects('select save_finance_expense($1,null,$2)',[randomUUID(),expense.input({creator_payment_fact:'unpaid'})],/PERMISSION_DENIED/);
 });
 for(const extra of [{creator_payment_fact:'paid'},{creator_payment_fact:'personal_paid',personally_paid:false},{creator_payment_fact:'company_paid',personally_paid:true,claimant_id:ids.staff}]){
  const invalid=randomUUID();await rejects('select save_finance_expense($1,null,$2)',[invalid,expense.input(extra)],/PAYMENT_FACT/);assert.equal(await scalar('select count(*)::int from finance_expenses where id=$1',[invalid]),0);
 }
 const batch=randomUUID(),lines=prior.items([100,200],{personally_paid:false,reimbursement_requested:0});lines[0].input.creator_payment_fact='unpaid';lines[1].input.creator_payment_fact='invalid';
 await rejects('select save_finance_expense_request($1,$2,null,$3,$4,$5)',[batch,randomUUID(),'company_expense_batch','',lines],/PAYMENT_FACT/);assert.equal(await scalar('select count(*)::int from finance_expense_requests where id=$1',[batch]),0);
});
test('057 existing supplier/reimbursement/company-channel consequences and tax contracts remain explicit',async()=>{
 await setup();const supplier=randomUUID();await rpc('save_finance_payee',[supplier,null,{legal_name:'Synthetic external vendor',entity_type:'juristic_person'},null]);
 await rpc('save_finance_payee',[ids.staff,ids.staff,{},null]);
 const parties=await scalar('select get_finance_expense_parties()');assert.equal(parties.payees.find(p=>p.id===supplier).profile_id,null);assert.equal(parties.payees.find(p=>p.id===ids.staff).profile_id,ids.staff);
 for(const [fact,mode,payee] of [['unpaid','supplier_unpaid',supplier],['company_paid','company_bank',null],['personal_paid','reimburse',ids.staff]]){
  const id=await expense.accepted({creator_payment_fact:fact,personally_paid:fact==='personal_paid',claimant_id:fact==='personal_paid'?ids.staff:null,reimbursement_requested:fact==='personal_paid'?10700:0,supplier_payee_id:fact==='unpaid'?supplier:null});
  await expense.review(id,{vat_state:'none',eligibility:'ineligible',wht_state:'none'});await expense.settlement(id,mode,payee);
  assert.equal(await scalar('select count(*)::int from finance_expense_obligations where expense_id=$1',[id]),mode==='company_bank'?0:1);
  const tax=await scalar('select to_jsonb(t) from finance_expense_tax_reviews t where expense_id=$1',[id]);assert.equal(tax.vat_state,'none');assert.equal(tax.eligibility,'ineligible');assert.equal(tax.wht_exception,false);
 }
 for(const table of ['finance_cash_transactions','finance_outgoing_wht_obligations','finance_payouts'])assert.equal(await count(table),0,table);
});
test('057 exact artifacts, SELECT-only checks, existing evidence unchanged and rollback-only rehearsal',async()=>{
 await prior.setup();await expense.accepted();const before=await query(a.priorSql());
 await db.exec('savepoint before057');await db.exec(migration('57'));
 const manifest={sha256:a.sha(),prior:before,functions:await query(a.postSql()),catalog:await query(a.catalogSql)};
 if(process.env.WRITE_057_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));
 const files=a.workflow();for(const [file,sql]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before057');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const result=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'expense_payment_fact_verification_pass'in r);assert.deepEqual(result.failed_checks,[],JSON.stringify(result));
 assert.equal(await scalar("select count(*)::int from pg_attribute where attrelid='finance_expenses'::regclass and attname='creator_payment_fact' and not attisdropped"),0);
 assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
