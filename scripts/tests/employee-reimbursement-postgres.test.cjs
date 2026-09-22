/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./company-review-modal-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const setup=async()=>{await prior.setup();await db.exec(migration('61'));};
const approve=(e,amount=e.reimbursement_requested,op=randomUUID(),accept=true,note='')=>rpc('review_finance_employee_reimbursement',[op,e.id,e.version,accept,accept?amount:null,note]);
async function claim(amounts=[3000],extra={}){let r;await asActor(ids.staff,async()=>{r=await requests.save(requests.items(amounts,extra));await rpc('submit_finance_expense_request',[r.id,1]);});return requests.read(r.id);}
test('061 claimant identity, one/multi item Draft reopen and optional client/case/advisory links',async()=>{
 await setup();const advisory=randomUUID();await db.query('insert into cases(id,client_id) values(6161,$1)',[ids.client]);await db.query('insert into advisory_matters(id,client_id) values($1,$2)',[advisory,ids.client]);
 for(const context of [{client_id:null,case_id:null,advisory_matter_id:null},{client_id:ids.client,case_id:null,advisory_matter_id:null},{client_id:ids.client,case_id:6161,advisory_matter_id:null},{client_id:ids.client,case_id:null,advisory_matter_id:advisory}]){
  await asActor(ids.staff,async()=>{const r=await requests.save(requests.items([3000,850],{...context,claimant_id:ids.admin}));const draft=await requests.read(r.id);assert.equal(draft.items.length,2);
   for(const item of draft.items){assert.equal(item.claimant_id,ids.staff);for(const[k,v]of Object.entries(context))assert.equal(item[k],v);}
   await rpc('save_finance_expense_request',[r.id,randomUUID(),draft.version,'employee_claim','Reopened',r.lines.map((l,i)=>({...l,version:draft.items[i].version}))]);
   const reopened=await requests.read(r.id);assert.equal(reopened.items.length,2);assert.equal(reopened.items[0].reimbursement_requested,3000);await rpc('submit_finance_expense_request',[r.id,reopened.version]);assert.ok((await requests.read(r.id)).items.every(i=>i.status==='submitted'));
  });
 }
 assert.equal((await claim()).items.length,1);
});
test('061 full/lower approval creates claimant payable atomically, no tax/cash, exact retry',async()=>{
 await setup();const r=await claim([3000,3000]);
 for(const [i,e] of r.items.entries()) {const op=randomUUID(),amount=i?2500:3000;await approve(e,amount,op);await approve(e,amount,op);const item=(await requests.read(r.id)).items[i];assert.equal(item.obligation.gross_amount,amount);assert.equal(item.obligation.payee_id,ids.staff);assert.equal(item.review_reason,'Approved reimbursement of personally paid expense');assert.equal(item.tax_review,null);await rejects('select review_finance_employee_reimbursement($1,$2,$3,true,$4,\'different\')',[op,e.id,e.version,amount],/IDEMPOTENCY/);}
 assert.equal(await scalar('select count(*)::int from finance_payees'),1);assert.equal(await scalar('select count(*)::int from finance_expense_obligations'),2);
 for(const table of ['finance_cash_transactions','finance_payouts','finance_outgoing_wht_obligations'])assert.equal(await scalar('select count(*)::int from '+table),0);
 assert.ok((await scalar('select get_finance_expense_obligations()')).rows.every(o=>o.payee_id===ids.staff&&o.source_type==='employee_reimbursement'));
 await payout.flush();
});
test('061 actual cash and bank refunds post exactly once; historical WHT never deducted',async()=>{
 await setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});await treasury.opening({amount:10000});const r=await claim([3000,3000]);
 for(const[i,e]of r.items.entries()){
  await approve(e);if(i){await rpc('save_finance_payee',[ids.staff,ids.staff,{destination:{bank_name:'Synthetic',account_name:'Staff',account_number:'12345678'}},1]);await expense.review(e.id,{vat_state:'none',eligibility:'ineligible',wht_state:'withhold',wht_base:3000,wht_rate:3});}
  await rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,true,\'\')',[randomUUID(),e.id,ids.bank],/WHT_ACTUAL/);
  const p=await expense.prepare(e.id,{bank:i?ids.bank:null,cash:i?null:cash});assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),i);await expense.confirm(p);await expense.confirm(p);await payout.flush();
  assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'3000.00');assert.equal(await scalar('select wht_amount::text from finance_payouts where id=$1',[p]),'0.00');assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[p]),1);
 }
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0);
});
test('061 permissions, invalid amount, required rejection reason and failure rollback',async()=>{
 await setup();const r=await claim(),e=r.items[0];await asActor(ids.staff,()=>rejects('select review_finance_employee_reimbursement($1,$2,$3,true,3000,\'\')',[randomUUID(),e.id,e.version],/PERMISSION/));
 for(const amount of [0,-1,3001,1.111])await rejects('select review_finance_employee_reimbursement($1,$2,$3,true,$4,\'\')',[randomUUID(),e.id,e.version,amount],/SETTLEMENT_INVALID/);
 await rejects('select review_finance_employee_reimbursement($1,$2,$3,false,null,\'\')',[randomUUID(),e.id,e.version],/REASON_REQUIRED/);
 await db.exec("create function fail061() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_FAILURE';end $$;create trigger fail061 before insert on finance_expense_obligations for each row execute function fail061();");
 await rejects('select review_finance_employee_reimbursement($1,$2,$3,true,3000,\'\')',[randomUUID(),e.id,e.version],/FIXTURE_FAILURE/);
 assert.equal((await requests.read(r.id)).items[0].status,'submitted');assert.equal(await scalar('select count(*)::int from finance_payees'),0);await approve(e,null,randomUUID(),false,'Not reimbursable');assert.equal((await requests.read(r.id)).items[0].status,'rejected');
});
test('061 historical claims read identically and company payment functions unchanged',async()=>{
 await prior.setup();const r=await claim();const before=await requests.read(r.id);const sql="select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace order by 1";const functions=await query(sql);await db.exec(migration('61'));assert.deepEqual(await requests.read(r.id),before);const after=await query(sql);for(const f of functions.filter(f=>f.signature!=='get_finance_expense_access()'))assert.deepEqual(after.find(a=>a.signature===f.signature),f);assert.equal(after.length,functions.length+1);
});
module.exports={setup};

test('061 expense reviewer without payment authority can approve; existing claimant Payee is preserved',async()=>{
 await setup();await query('update user_profiles set can_approve_expense_claims=true where id=$1',[ids.staff]);
 const r=await claim([3000,3000]);await asActor(ids.staff,()=>approve(r.items[0]));
 const before=await scalar('select to_jsonb(p) from finance_payees p where id=$1',[ids.staff]);
 await asActor(ids.staff,()=>approve(r.items[1]));assert.deepEqual(await scalar('select to_jsonb(p) from finance_payees p where id=$1',[ids.staff]),before);
 assert.equal(await scalar('select count(*)::int from finance_payee_audit'),1);
});
test('061 exact migration artifacts, SELECT preflight/verifier and rollback-only rehearsal',async()=>{
 const fs=require('node:fs'),a=require('./employee-reimbursement-artifacts.cjs');await prior.setup();
 const baseline=await query(a.functionSql());await db.exec('savepoint before061');await db.exec(migration('61'));
 const manifest={sha256:a.sha(),prior:baseline,functions:await query(a.functionSql()),catalog:await query(a.catalogSql)};
 if(process.env.WRITE_061_MANIFEST==='1'){fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');return;}
 assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));const files=a.workflow();
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to before061');const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));assert.deepEqual(pre.upstream_evidence_hashes,post.upstream_evidence_hashes);
 await db.exec('commit');const result=(await db.exec(files[a.filenames.dry])).flatMap(r=>r.rows).find(r=>'employee_reimbursement_verification_pass'in r);
 assert.deepEqual(result.failed_checks,[],JSON.stringify(result));assert.equal(result.rehearsal_baseline_available,true);assert.deepEqual(await query(a.functionSql()),baseline);
 assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
