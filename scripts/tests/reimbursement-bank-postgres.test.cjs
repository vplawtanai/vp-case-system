/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic local PostgreSQL only; no Production connection or transactions.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const prior=require('./employee-reimbursement-postgres.test.cjs'),company=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const setup=async()=>{await prior.setup();await db.exec(migration('62'));};
async function claim(){let r;await asActor(ids.staff,async()=>{r=await requests.save(requests.items([700]));await rpc('submit_finance_expense_request',[r.id,1]);});const e=(await requests.read(r.id)).items[0];await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,500,'Approved 500']);return e;}
test('063 reproduces bank block then confirms existing 500 draft without tax/bank profile; cash and retries exactly once',async()=>{
 await setup();await treasury.opening({amount:10000});const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});const e=await claim(),p=await expense.prepare(e.id);
 await rejects('select confirm_finance_payout($1,1,1,null,true)',[p],/DESTINATION_REQUIRED/);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 await db.exec(migration('63'));
 for(const [index,payment]of [p,await expense.prepare((await claim()).id,{bank:null,cash})].entries()){
  const row=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[payment]);assert.equal(row.gross_amount,500);assert.equal(row.net_amount,500);assert.equal(row.wht_amount,0);assert.equal(row.payee_id,ids.staff);
  await rejects('select confirm_finance_payout($1,1,1,null,false)',[payment],/ACK_REQUIRED/);
  await rejects('select confirm_finance_payout($1,99,1,null,true)',[payment],/STALE/);
  await rejects('select confirm_finance_payout($1,1,99,null,true)',[payment],/PAYEE_INVALID/);
  await expense.confirm(payment);await expense.confirm(payment);await payout.flush();
  const movement=(await query('select cash_amount,bank_account_id,cash_location_id,direction from finance_cash_transactions where source_payout_id=$1',[payment]));assert.equal(movement.length,1);assert.equal(movement[0].cash_amount,'500.00');assert.equal(movement[0].direction,'outflow');assert.equal(movement[0].bank_account_id,index?null:ids.bank);assert.equal(movement[0].cash_location_id,index?cash:null);
  const snapshot=await scalar('select confirmed_snapshot_json from finance_payouts where id=$1',[payment]);assert.equal(snapshot.payee.profile_id,ids.staff);assert.equal(snapshot.destination?.id ?? null,null);assert.equal(snapshot.payee.tax_id,null);assert.equal(snapshot.confirmed_by,ids.admin);assert.equal(snapshot.actual_company_cash_moved,true);
  const doc=await scalar('select expense_document($1)',[row.choices_json[0].expense_id]);assert.equal(doc.payout.status,'confirmed');
 }
 assert.equal(await scalar('select count(*)::int from finance_payee_destinations'),0);assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0);
});
test('063 Company bank/cash and WHT cashbook behavior unchanged',async()=>{
 await setup();await db.exec(migration('63'));await treasury.opening({amount:10000});const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});const r=await company.request();
 for(const[i,e]of r.items.entries()){await company.approve(e);const p=await expense.prepare(e.id,{bank:i?null:ids.bank,cash:i?cash:null,wht:true});await expense.confirm(p);await expense.confirm(p);await payout.flush();const rows=await query('select cash_amount,bank_account_id,cash_location_id from finance_cash_transactions where source_payout_id=$1',[p]);assert.equal(rows.length,1);assert.equal(rows[0].cash_amount,i?'116.64':'291.59');assert.equal(rows[0].bank_account_id,i?null:ids.bank);}
});
test('063 preserves identity and account guards',async()=>{
 await setup();await db.exec(migration('63'));await treasury.opening({amount:10000});const p=await expense.prepare((await claim()).id);
 await query('update user_profiles set active=false where id=$1',[ids.staff]);await rejects('select confirm_finance_payout($1,1,1,null,true)',[p],/PAYEE_INVALID/);await query('update user_profiles set active=true where id=$1',[ids.staff]);
 await asActor(ids.staff,()=>rejects('select confirm_finance_payout($1,1,1,null,true)',[p],/ACCOUNT_DENIED/));assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('063 exact functions, unchanged catalog/data and rollback-only gate artifacts',async()=>{
 await setup();const a=require('./reimbursement-bank-artifacts.cjs'),before=await query(a.functionSql());await db.exec(migration('63'));const after=await query(a.functionSql());
 const changed=after.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(before[i]));assert.deepEqual(changed.map(f=>f.name),['confirm_finance_expense_payout']);
 if(process.env.WRITE_063_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify({sha256:a.sha(),function:changed[0]},null,2)+'\n');return;}
 await db.exec('rollback');await db.exec('begin');await setup();const files=a.workflow();for(const[file,sql]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[]);await db.exec('commit');const dry=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'reimbursement_bank_verification_pass'in r);assert.deepEqual(dry.failed_checks,[]);assert.equal(dry.rehearsal_baseline_available,true);assert.deepEqual((await query(files[a.filenames.pre]))[0].failed_checks,[]);
 await db.exec('begin');await db.exec(migration('63'));const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[]);assert.deepEqual(post.business_evidence_hashes,pre.business_evidence_hashes);
});
