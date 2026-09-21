/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only; no credentials or Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const a=require('./expense-two-flow-artifacts.cjs');
const setup=async(apply=true)=>{await requests.setup();await db.exec(migration('57'));if(apply)await db.exec(migration('58'));};
const count=(table,id)=>scalar(`select count(*)::int from ${table}${id?' where expense_id=$1':''}`,id?[id]:[]);
test('Two-flow contract: account context is Draft-owner-only, not submitted payment evidence; due date is not captured',async()=>{
 await setup();
 const r=await requests.save(requests.items([100],{personally_paid:false,reimbursement_requested:0,creator_payment_fact:'company_paid',bank_account_id:ids.bank,cash_location_id:null,due_on:'2026-09-30'}),'company_expense_batch');
 const draft=await requests.read(r.id);assert.equal(draft.items[0].request_entry_account.bank_account_id,ids.bank);assert.equal(draft.items[0].due_on,undefined);
 await rpc('submit_finance_expense_request',[r.id,draft.version]);const submitted=await requests.read(r.id);
 assert.equal(submitted.items[0].creator_payment_fact,'company_paid');assert.equal(submitted.items[0].request_entry_account,null);
 for(const table of ['finance_expense_settlements','finance_expense_obligations','finance_payouts','finance_cash_transactions'])assert.equal(await count(table),0);
 await asActor(ids.staff,()=>rejects('select input_json from finance_expense_request_audit',[],/permission denied/));
});
test('Two-flow contract: company-paid confirmation with pending tax creates one outflow, no payable; retry is idempotent',async()=>{
 await setup();await treasury.opening({amount:30000});const id=await expense.accepted({creator_payment_fact:'company_paid'});
 const settlement=randomUUID();await rpc('decide_finance_expense_settlement',[settlement,id,'company_bank',null,10700,null,'Synthetic paid channel']);
 await rpc('decide_finance_expense_settlement',[settlement,id,'company_bank',null,10700,null,'Synthetic paid channel']);
 assert.equal(await count('finance_expense_obligations',id),0);assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_expense_tax_reviews',id),0);
 await asActor(ids.staff,()=>rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,false,\'\')',[randomUUID(),id,ids.bank],/ACCOUNT_DENIED/));
 const payment=await expense.prepare(id);
 await asActor(ids.staff,()=>rejects('select confirm_finance_payout($1,1,null,null,true)',[payment],/ACCOUNT_DENIED/));
 await rpc('set_finance_treasury_authority',[ids.staff,ids.bank,null,{record_outflow:true,confirm_outflow:false},null,'Synthetic prepare only']);
 await asActor(ids.staff,()=>rejects('select confirm_finance_payout($1,1,null,null,true)',[payment],/ACCOUNT_DENIED/));
 await rejects('select confirm_finance_payout($1,1,null,null,false)',[payment],/ACK_REQUIRED/);
 await expense.confirm(payment);await expense.confirm(payment);await payout.flush();
 assert.equal(await count('finance_cash_transactions'),1);assert.equal(await count('finance_expense_obligations',id),0);assert.equal(await count('finance_expense_tax_reviews',id),0);
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[payment]),'10700.00');
 await rejects('select decide_finance_expense_settlement($1,$2,\'supplier_unpaid\',null,10700,null,\'duplicate\')',[randomUUID(),id],/ALREADY_DECIDED/);
});
test('Two-flow contract: unpaid supplier obligation without bank details creates no cash, exact retry creates no duplicate',async()=>{
 await setup();const supplier=randomUUID();await rpc('save_finance_payee',[supplier,null,{legal_name:'Synthetic unpaid vendor',entity_type:'juristic_person'},null]);
 const id=await expense.accepted({creator_payment_fact:'unpaid',supplier_payee_id:supplier}),settlement=randomUUID();
 const args=[settlement,id,'supplier_unpaid',supplier,10700,'2026-09-30','Synthetic unpaid obligation'];
 await rpc('decide_finance_expense_settlement',args);await rpc('decide_finance_expense_settlement',args);await payout.flush();
 assert.equal(await count('finance_expense_obligations',id),1);assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_payouts'),0);
 assert.equal(await scalar('select due_on::text from finance_expense_obligations where expense_id=$1',[id]),'2026-09-30');
});
test('Two-flow contract: authorized non-Finance creator saves paid/unpaid/incomplete without Treasury authority; no side effects',async()=>{
 await setup();await asActor(ids.staff,async()=>{
  const access=await scalar('select get_finance_expense_access()');assert.equal(access.can_create_company,true);assert.equal(access.can_record,false);assert.equal(access.can_confirm,false);assert.equal(access.can_manage,false);assert.equal(access.company_declaration_without_account_supported,true);
  for(const fact of ['unpaid','company_paid',null]){
   const r=await requests.save(requests.items([100],{personally_paid:false,reimbursement_requested:0,creator_payment_fact:fact}),'company_expense_batch');
   const doc=await requests.read(r.id);assert.equal(doc.items[0].creator_payment_fact,fact);assert.equal(doc.items[0].status,'draft');
   await rpc('save_finance_expense_request',[r.id,r.op,null,'company_expense_batch','Weekly synthetic request',r.lines]);assert.equal((await requests.read(r.id)).version,1);
   if(fact){await rpc('submit_finance_expense_request',[r.id,doc.version]);assert.equal((await requests.read(r.id)).items[0].creator_payment_fact,fact);}
  }
  const standalone=await rpc('save_finance_expense',[randomUUID(),null,expense.input({creator_payment_fact:'unpaid'})]);assert.equal((await scalar('select get_finance_expenses($1)',[standalone])).record.creator_payment_fact,'unpaid');
 });
 for(const table of ['finance_expense_settlements','finance_expense_obligations','finance_payouts','finance_cash_transactions','finance_expense_tax_reviews','finance_outgoing_wht_obligations'])assert.equal(await count(table),0,table);
});
test('Two-flow contract: unauthorized/inactive/viewer/partner/anonymous, cross-owner, personal impersonation and direct writes remain denied',async()=>{
 await setup();const owned=await requests.save(requests.items([100],{personally_paid:false,reimbursement_requested:0,creator_payment_fact:'unpaid'}),'company_expense_batch');
 await asActor(ids.staff,async()=>{
  await rejects('select save_finance_expense_request($1,$2,1,\'company_expense_batch\',\'\',$3)',[owned.id,randomUUID(),owned.lines],/PERMISSION_DENIED/);
  await rejects('select save_finance_expense($1,null,$2)',[randomUUID(),expense.input({creator_payment_fact:'personal_paid',personally_paid:true,claimant_id:ids.admin})],/PERMISSION_DENIED/);
  await rejects('select save_finance_expense_before_requests($1,null,$2)',[randomUUID(),expense.input()],/permission denied/);
  await rejects('insert into finance_expenses(id) values($1)',[randomUUID()],/permission denied/);
 });
 for(const clause of ["can_submit_expense_claim=false","can_submit_expense_claim=true,role='viewer'","role='partner'","role='staff',active=false"]){
  await query('update user_profiles set '+clause+' where id=$1',[ids.staff]);
  await asActor(ids.staff,async()=>{assert.equal((await scalar('select get_finance_expense_access()')).can_create_company,false);await rejects('select save_finance_expense($1,null,$2)',[randomUUID(),expense.input({creator_payment_fact:'company_paid'})],/PERMISSION_DENIED/);await rejects('select save_finance_expense_request($1,$2,null,\'company_expense_batch\',\'\',$3)',[randomUUID(),randomUUID(),owned.lines],/PERMISSION_DENIED/);});
 }
 await asActor(null,()=>rejects('select save_finance_expense($1,null,$2)',[randomUUID(),expense.input({creator_payment_fact:'unpaid'})],/PERMISSION_DENIED/));
});
test('Two-flow contract: historical personal/unknown/NULL preserved, employee Claim identity and permissions unchanged',async()=>{
 await setup(false);const histories=[];
 for(const fact of ['personal_paid','unknown',null]){const id=await rpc('save_finance_expense',[randomUUID(),null,expense.input({creator_payment_fact:fact,personally_paid:fact==='personal_paid',claimant_id:fact==='personal_paid'?ids.staff:null,reimbursement_requested:fact==='personal_paid'?100:0})]);histories.push(await scalar('select to_jsonb(e) from finance_expenses e where id=$1',[id]));}
 await db.exec(migration('58'));
 for(const row of histories){assert.deepEqual(await scalar('select to_jsonb(e) from finance_expenses e where id=$1',[row.id]),row);await rpc('submit_finance_expense',[row.id,row.version]);await rpc('review_finance_expense',[row.id,row.version+1,true,'Historical review']);}
 await asActor(ids.staff,async()=>{const r=await requests.save(requests.items([100]));let doc=await requests.read(r.id);assert.equal(doc.items[0].claimant_id,ids.staff);assert.equal(doc.items[0].creator_payment_fact,null);await rpc('submit_finance_expense_request',[r.id,doc.version]);doc=await requests.read(r.id);assert.equal(doc.items[0].status,'submitted');await rejects('select review_finance_expense($1,$2,true,\'Self approval\')',[doc.items[0].id,doc.items[0].version],/PERMISSION_DENIED/);});
 assert.equal(await count('finance_cash_transactions'),0);
});
test('Two-flow contract: exact 058 artifacts, no catalog/data changes, rollback-only rehearsal restores 057',async()=>{
 await setup(false);await expense.accepted({creator_payment_fact:'unknown'});
 const prior=await query(a.functionSql()),priorCatalog=await query(a.catalogSql);
 await db.exec('savepoint before058');await db.exec(migration('58'));
 const manifest={sha256:a.sha(),prior,functions:await query(a.functionSql()),priorCatalog,catalog:await query(a.catalogSql)};
 assert.deepEqual(manifest.catalog,priorCatalog);
 for(const f of manifest.functions.filter(f=>!a.changed.includes(f.name)))assert.deepEqual(f,prior.find(p=>p.signature===f.signature));
 if(process.env.WRITE_058_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));
 const files=a.workflow();for(const [file,sql]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before058');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const result=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'company_expense_two_flow_verification_pass'in r);
 assert.deepEqual(result.failed_checks,[],JSON.stringify(result));assert.equal(result.rehearsal_baseline_available,true);
 assert.deepEqual(await query(a.functionSql()),prior);assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
