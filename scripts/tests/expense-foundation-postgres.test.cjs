/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. Never reads credentials or connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const prior=require('./finance-hardening-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {people}=require('./vp-formula.test.cjs');
async function setup(apply=true){
 await prior.setup();
 await db.exec(`alter table user_profiles add column can_submit_expense_claim boolean default false,
  add column can_view_own_expense_claims boolean default false,add column can_view_all_expense_claims boolean default false,
  add column can_approve_expense_claims boolean default false;
 create table finance_expense_claims(id uuid primary key,claim_date date,claimant_user_id uuid,category text,amount numeric(14,2),
  client_id uuid,case_id bigint,advisory_matter_id uuid,description text,note text,status text,ledger_entry_id uuid);
 alter table finance_company_ledger add column source_expense_claim_id uuid;
 update user_profiles set can_submit_expense_claim=true,can_view_own_expense_claims=true where id='${ids.staff}';`);
 if(apply)await db.exec(migration('55'));
}
const input=(extra={})=>({origin:'company_purchase',expense_date:'2026-09-10',description:'Synthetic supplies',category:'Supplies',vendor_name:'Synthetic vendor',gross_amount:10700,...extra});
async function save(extra={},id=randomUUID()){await rpc('save_finance_expense',[id,null,input(extra)]);return id;}
const row=id=>scalar('select to_jsonb(e) from finance_expenses e where id=$1',[id]);
async function accepted(extra={}){const id=await save(extra);await rpc('submit_finance_expense',[id,(await row(id)).version]);await rpc('review_finance_expense',[id,(await row(id)).version,true,'Synthetic business acceptance']);return id;}
const tax=(extra={})=>({vat_state:'exists',vat_base:10000,vat_rate:7,eligibility:'eligible',supplier_tax_id:'1234567890123',tax_document_reference:'SYNTHETIC-VAT-001',tax_document_date:'2026-09-10',company_name_status:'yes',wht_state:'none',reason:'Synthetic reviewed tax facts',...extra});
const review=(id,extra={},previous=null)=>rpc('review_finance_expense_tax',[randomUUID(),id,previous,tax(extra)]);
const settlement=(id,mode,payee=null,amount=10700)=>rpc('decide_finance_expense_settlement',[randomUUID(),id,mode,payee,amount,'2026-09-20','Synthetic settlement decision']);
async function prepare(id,{bank=ids.bank,cash=null,wht=false}={}){const p=randomUUID();await rpc('prepare_finance_expense_payout',[p,id,null,'2026-09-10',bank,cash,wht,'Synthetic payment']);return p;}
async function confirm(id){const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]);
 const y=await scalar('select (select version from finance_payees where id=$1)',[p.payee_id]);
 const d=await scalar('select (select id from finance_payee_destinations where payee_id=$1 and is_active)',[p.payee_id]);
 return rpc('confirm_finance_payout',[id,p.version,y||null,d||null,true]);}
const count=table=>scalar('select count(*)::int from '+table);
test('055 company purchase: independent review, one Input VAT fact, exactly one cash leg, retry',async()=>{
 await setup();await treasury.opening({amount:30000});const id=await accepted();await review(id);await settlement(id,'company_bank');
 assert.equal(await count('finance_expense_obligations'),0);assert.equal(await count('finance_cash_transactions'),0);
 const p=await prepare(id);await confirm(p);await payout.flush();
 assert.equal(await count('finance_cash_transactions'),1);assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'10700.00');
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),1);
 assert.equal(await scalar("select tax_amount::text from finance_tax_position_facts where tax_kind='input_vat'"),'700.00');
 assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='bank'"),'19300.00');
 await confirm(p);await payout.flush();assert.equal(await count('finance_cash_transactions'),1);
 const facts=await scalar("select tax_filing_monthly_facts('2026-09-01')");assert.equal(facts.output_vat,700);assert.equal(facts.reviewed_input_vat,700);assert.equal(facts.input_vat,null);assert.equal(facts.input_vat_complete,false);assert.equal(facts.net_vat,null);
});
test('055 unpaid supplier: actual WHT only on confirmed payment, base independent from VAT, old payout regression',async()=>{
 await setup();const payee=people[0].id;await payout.payee();await treasury.opening({amount:60000});
 const id=await accepted({supplier_payee_id:payee});await review(id,{wht_state:'withhold',wht_base:10000,wht_rate:3});await settlement(id,'supplier_unpaid',payee);
 assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_outgoing_wht_obligations'),0);
 const p=await prepare(id,{wht:true});assert.equal(await count('finance_outgoing_wht_obligations'),0);await confirm(p);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'10400.00');
 assert.equal(await scalar('select withheld_amount::text from finance_outgoing_wht_obligations where payout_source_id=$1',[p]),'300.00');
 const rights=await payout.rights(),old=await payout.save(rights);await payout.confirm(old);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[old]),'3010.88');
 assert.equal((await scalar('select get_finance_expense_obligations()')).rows[0].status,'settled');
});
test('055 employee claims privacy, reimbursement and no retroactive WHT; own approval denied',async()=>{
 await setup();let id;
 await asActor(ids.staff,async()=>{id=await save({origin:'employee_claim',personally_paid:true,reimbursement_requested:3725,gross_amount:3725});await rpc('submit_finance_expense',[id,(await rowAsOwner(id)).version]);
  await rejects('select review_finance_expense($1,3,true,\'denied\')',[id],/PERMISSION_DENIED/);
  await rejects('select * from finance_expenses',[],/permission denied/);
 });
 await rpc('review_finance_expense',[id,(await row(id)).version,true,'Accept reimbursement']);
 await rpc('save_finance_payee',[ids.staff,ids.staff,{destination:{bank_name:'Synthetic',account_name:'Staff',account_number:'12345678'}},null]);
 await review(id,{vat_state:'none',eligibility:'ineligible',wht_state:'withhold',wht_base:3725,wht_rate:3});await settlement(id,'reimburse',ids.staff,3725);
 assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_outgoing_wht_obligations'),0);
 assert.equal(await scalar('select wht_exception from finance_expense_tax_reviews where expense_id=$1',[id]),true);
 await rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,true,\'\')',[randomUUID(),id,ids.bank],/WHT_ACTUAL/);
 await treasury.opening({amount:10000});const p=await prepare(id);await confirm(p);await payout.flush();
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[p]),'3725.00');
 const other=await accepted();await asActor(ids.staff,()=>rejects('select get_finance_expenses($1)',[other],/PERMISSION_DENIED/));
});
const rowAsOwner=async id=>(await scalar('select get_finance_expenses($1)',[id])).record;
test('055 no reimbursement and later waiver preserve history; paid/active-draft waiver denied',async()=>{
 await setup();await payout.payee();const extra={personally_paid:true,claimant_id:people[0].id,reimbursement_requested:10700};
 const noncash=await accepted(extra);await review(noncash);await settlement(noncash,'no_reimbursement',null,0);
 assert.equal(await count('finance_expense_obligations'),0);assert.equal(await count('finance_cash_transactions'),0);
 const owed=await accepted(extra);const obligation=await settlement(owed,'reimburse',people[0].id);
 await rpc('waive_finance_expense_reimbursement',[obligation,'Person explicitly waived reimbursement',true]);await payout.flush();
 assert.equal(await count('finance_expense_obligations'),1);assert.equal(await count('finance_expense_obligation_waivers'),1);
 assert.equal(await count('finance_cash_transactions'),0);
 await rejects('select prepare_finance_expense_payout($1,$2,null,\'2026-09-10\',$3,null,false,\'\')',[randomUUID(),owed,ids.bank],/UNAVAILABLE/);
});
test('055 assigned account custodian: immediate pending-tax purchase, scoped balance/movements, no Opening or Finance escalation',async()=>{
 await setup();const bank=randomUUID();await query("insert into finance_bank_accounts(id,short_name,bank_name,account_number,is_active) values($1,'KTB fixture','Synthetic','1111',true)",[bank]);
 await treasury.opening({bank,amount:20000});await treasury.opening({amount:99999});
 await rpc('set_finance_treasury_authority',[ids.staff,bank,null,{view_balance:true,view_movements:true,record_outflow:true,confirm_outflow:true},null,'Synthetic KTB assignment']);
 const id=randomUUID();await asActor(ids.staff,async()=>{
  const accounts=await scalar('select get_finance_expense_accounts()');assert.equal(accounts.length,1);assert.equal(accounts[0].id,bank);assert.equal(accounts[0].balance,20000);
  await rejects('select record_finance_paid_expense($1,$2,$3,null,\'2026-09-10\',true)',[id,input(),ids.bank],/ACCOUNT_DENIED/);
  await rpc('record_finance_paid_expense',[id,input(),bank,null,'2026-09-10',true]);
  await rpc('record_finance_paid_expense',[id,input(),bank,null,'2026-09-10',true]);
  assert.equal((await scalar('select get_finance_expense_accounts()'))[0].balance,9300);
  assert.equal((await scalar('select get_finance_assigned_account_movements($1,null)',[bank])).length,1);
  await rejects('select get_finance_assigned_account_movements($1,null)',[ids.bank],/ACCOUNT_DENIED/);
  await rejects('select set_finance_treasury_authority($1,$2,null,\'{}\',null,\'denied\')',[ids.staff,ids.bank],/ADMIN_REQUIRED/);
  await rejects('select review_finance_expense_tax($1,$2,null,$3)',[randomUUID(),id,tax()],/PERMISSION_DENIED/);
  await rejects('select expense_account_balance_private($1,null)',[ids.bank],/permission denied/);
 });await payout.flush();assert.equal((await row(id)).status,'submitted');assert.equal(await count('finance_expense_obligations'),0);
 assert.equal(await count('finance_expense_tax_reviews'),0);assert.equal(await count('finance_outgoing_wht_obligations'),0);
 await rpc('review_finance_expense',[id,(await row(id)).version,true,'Finance accepted paid purchase']);await review(id);await payout.flush();assert.equal(await count('finance_cash_transactions'),1);
});
test('055 Office Cash, tax-pending cash reality, no-opening rollback, tax ineligible/none/pending no facts',async()=>{
 await setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");const id=randomUUID();
 await rejects('select record_finance_paid_expense($1,$2,null,$3,\'2026-09-10\',true)',[id,input(),cash],/OPENING_BALANCE_REQUIRED/);
 assert.equal(await count('finance_expenses'),0);await treasury.opening({bank:null,cash,amount:20000});
 await rpc('record_finance_paid_expense',[id,input(),null,cash,'2026-09-10',true]);await payout.flush();assert.equal(await count('finance_cash_transactions'),1);
 for(const spec of [{eligibility:'ineligible'},{vat_state:'none',eligibility:'ineligible'},{vat_state:'pending',eligibility:'pending'}]){const e=await accepted();await review(e,spec);}
 assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),0);
});
test('055 Legacy paid rows inert, unpaid explicit bridge idempotent and protected from double payment',async()=>{
 await setup();const paid=randomUUID(),unpaid=randomUUID();
 for(const [id,status] of [[paid,'paid'],[unpaid,'approved']])await query("insert into finance_expense_claims(id,claim_date,claimant_user_id,category,amount,description,status) values($1,'2026-09-10',$2,'travel',500,'Legacy fixture',$3)",[id,ids.staff,status]);
 assert.equal(await count('finance_expenses'),0);assert.equal(await count('finance_expense_obligations'),0);assert.equal(await count('finance_cash_transactions'),0);
 await rejects('select bridge_finance_legacy_expense($1,$2,\'Explicit transition\',true)',[paid,randomUUID()],/INELIGIBLE/);
 const id=await rpc('bridge_finance_legacy_expense',[unpaid,randomUUID(),'Explicit one-row transition',true]);
 assert.equal(await rpc('bridge_finance_legacy_expense',[unpaid,randomUUID(),'Retry',true]),id);assert.equal(await count('finance_expenses'),1);
 await rejects("update finance_expense_claims set status='paid' where id=$1",[unpaid],/BRIDGED/);
 await query("update finance_expense_claims set note='Legacy still operates' where id=$1",[paid]);
 assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_expense_obligations'),0);
});
module.exports={setup,input,accepted,review,tax,settlement,prepare,confirm};

test('055 Finance-prepared payment confirmed by assigned custodian only; changed tax evidence blocks stale payment',async()=>{
 await setup();await treasury.opening({amount:40000});await payout.payee();
 const id=await accepted({supplier_payee_id:people[0].id});await settlement(id,'supplier_unpaid',people[0].id);const p=await prepare(id);
 await asActor(ids.staff,()=>rejects('select confirm_finance_payout($1,1,1,null,true)',[p],/ACCOUNT_DENIED/));
 await rpc('set_finance_treasury_authority',[ids.staff,ids.bank,null,{view_balance:true,view_movements:true,record_outflow:true,confirm_outflow:true},null,'Assigned payment only']);
 await asActor(ids.staff,async()=>{
  const d=await rowAsOwner(id);assert.equal(d.payout.can_confirm,true);assert.equal(d.audit.every(a=>a.evidence_json==null),true);
  await rpc('confirm_finance_payout',[p,d.payout.version,d.payout.payee_version,d.payout.destination.id,true]);
  assert.equal((await query('select * from finance_account_opening_balances')).length,0,'Existing Opening RLS does not grant custody access');
  await rejects('update finance_account_opening_balances set balance_amount=1',[],/permission denied/);
 });await payout.flush();assert.equal(await scalar('select confirmed_by from finance_payouts where id=$1',[p]),ids.staff);
 assert.equal((await scalar('select get_finance_payout_workspace($1)',[people[0].id])).history.length,0,'Expense never opens entitlement editor');
 const next=await accepted();await settlement(next,'company_bank');const stale=await prepare(next);await review(next);
 await rejects('select confirm_finance_payout($1,1,null,null,true)',[stale],/SOURCE_CHANGED/);
 assert.equal(await count('finance_cash_transactions'),1);
});
test('055 duplicate VAT source rejected, exact tax retry, reimbursement VAT once and active Draft blocks waiver',async()=>{
 await setup();await payout.payee();await treasury.opening({amount:50000});
 const id=await accepted({personally_paid:true,claimant_id:people[0].id,reimbursement_requested:10700});const reviewId=randomUUID();
 await rpc('review_finance_expense_tax',[reviewId,id,null,tax()]);await rpc('review_finance_expense_tax',[reviewId,id,null,tax()]);
 await rejects('select review_finance_expense_tax($1,$2,null,$3)',[reviewId,id,tax({reason:'Changed retry'})],/IDEMPOTENCY/);
 const duplicate=await accepted();await rejects('select review_finance_expense_tax($1,$2,null,$3)',[randomUUID(),duplicate,tax()],/ALREADY_REVIEWED/);
 const obligation=await settlement(id,'reimburse',people[0].id),p=await prepare(id);
 await rejects('select waive_finance_expense_reimbursement($1,\'waive\',true)',[obligation],/DRAFT|UNAVAILABLE|PAYMENT/);
 await confirm(p);await payout.flush();assert.equal(await scalar("select count(*)::int from finance_tax_position_facts where tax_kind='input_vat'"),1);
 assert.equal(await count('finance_outgoing_wht_obligations'),0);
 await rejects('select waive_finance_expense_reimbursement($1,\'waive\',true)',[obligation],/PAYMENT_EXISTS/);
});
test('055 failed audit rolls back cash/allocation/WHT; partner and revoked employee cannot mutate',async()=>{
 await setup();await payout.payee();await treasury.opening({amount:50000});
 const id=await accepted({supplier_payee_id:people[0].id});await review(id,{wht_state:'withhold',wht_base:10000,wht_rate:3});await settlement(id,'supplier_unpaid',people[0].id);const p=await prepare(id,{wht:true});
 await db.exec("create function fixture_expense_audit_failure() returns trigger language plpgsql as $$begin if new.event_type='payment_confirmed' then raise exception 'SYNTHETIC_AUDIT_FAILURE';end if;return new;end$$;create trigger fixture_expense_audit_failure before insert on finance_expense_audit for each row execute function fixture_expense_audit_failure()");
 const y=await scalar('select version from finance_payees where id=$1',[people[0].id]),dest=await scalar('select id from finance_payee_destinations where payee_id=$1 and is_active',[people[0].id]);
 await rejects('select confirm_finance_payout($1,1,$2,$3,true)',[p,y,dest],/SYNTHETIC_AUDIT_FAILURE/);
 assert.equal(await count('finance_cash_transactions'),0);assert.equal(await count('finance_payout_allocations'),0);assert.equal(await count('finance_outgoing_wht_obligations'),0);
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await asActor(ids.staff,()=>rejects('select review_finance_expense_tax($1,$2,$3,$4)',[randomUUID(),id,null,tax()],/PERMISSION_DENIED/));
 await query("update user_profiles set role='staff' where id=$1",[ids.staff]);let claim;await asActor(ids.staff,async()=>{claim=await save({origin:'employee_claim'});});
 await query('update user_profiles set can_submit_expense_claim=false where id=$1',[ids.staff]);const version=(await row(claim)).version;
 await asActor(ids.staff,()=>rejects('select submit_finance_expense($1,$2)',[claim,version],/PERMISSION_DENIED/));
 await query('update user_profiles set can_approve_expense_claims=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>{const access=await scalar('select get_finance_expense_access()');assert.equal(access.can_manage,true);assert.equal(access.can_view_all,true);assert.equal(access.can_record,false);assert.equal(access.can_view_accounts,false);});
});
test('055 exact catalog fixture',async()=>{
 const fs=require('node:fs'),a=require('./expense-foundation-artifacts.cjs');await setup(false);const priorFunctions=await query(a.priorFunctionSql());await db.exec(migration('55'));
 const manifest={sha256:a.sha(),priorFunctions,functions:await query(a.postFunctionSql()),catalog:await query(a.catalogSql),view:(await query(a.viewSql))[0]};
 if(process.env.WRITE_055_MANIFEST==='1')fs.writeFileSync(a.manifestPath,JSON.stringify(manifest,null,2)+'\n');
 else assert.deepEqual(manifest,JSON.parse(fs.readFileSync(a.manifestPath,'utf8')));
});
test('055 exact SELECT artifacts and literal rollback-only rehearsal preserve all upstream rows',async()=>{
 const fs=require('node:fs'),a=require('./expense-foundation-artifacts.cjs');await setup(false);const files=a.workflow();
 for(const [file,sql] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const pre=(await query(files[a.filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 await db.exec('savepoint before055');await db.exec(migration('55'));
 const post=(await query(files[a.filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));assert.deepEqual(post.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 await db.exec('alter table finance_expenses add column unexpected text');assert.ok((await query(files[a.filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to before055');await db.exec('commit');
 const results=await db.exec(files[a.filenames.dry]),verified=results.flatMap(r=>r.rows).find(r=>'expense_purchase_settlement_foundation_verification_pass' in r);
 assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));assert.deepEqual(verified.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 assert.equal(await scalar("select to_regclass('public.finance_expenses')"),null);
 assert.deepEqual((await query(files[a.filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
