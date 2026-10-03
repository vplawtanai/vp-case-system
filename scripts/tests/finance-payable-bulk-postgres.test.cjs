/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL, synthetic data ONLY. Never reads .env.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const fixture=require('./finance-authority-fixture.cjs'),A=require('./finance-payable-bulk-artifacts.cjs');
const {db,query,scalar,rpc,ids}=require('./receipt-foundation.test.cjs');
const expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
async function reject(fn,pattern){await db.exec('savepoint rejected088');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to rejected088;release rejected088');}}
async function make(amount=200,payeeId,wht=false){
 const id=await expense.accepted({gross_amount:amount});
 await expense.review(id,{vat_state:'none',eligibility:'ineligible',wht_state:wht?'withhold':'none',wht_base:wht?amount:undefined,wht_rate:wht?3:undefined});
 await expense.settlement(id,'supplier_unpaid',payeeId,amount);
 const e=await scalar('select to_jsonb(e) from finance_expenses e where id=$1',[id]);
 const o=await scalar('select id from finance_expense_obligations where expense_id=$1',[id]);
 return {obligation_id:o,payout_id:randomUUID(),expense_version:e.version,payout_version:null,paid_on:'2026-09-10',bank_account_id:ids.bank,cash_location_id:null,actual_wht:wht,note:''};
}
async function confirmation(items){return Promise.all(items.map(async x=>{const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[x.payout_id]);return {obligation_id:x.obligation_id,payout_id:p.id,payout_version:p.version,payee_version:await scalar('select (select version from finance_payees where id=$1)',[p.payee_id]),destination_id:p.bank_account_id?await scalar('select (select id from finance_payee_destinations where payee_id=$1 and is_active)',[p.payee_id]):null};}));}
const batch=(action,items,ack=true)=>scalar('select finance_expense_payout_batch($1,$2::jsonb,$3)',[action,items,ack]);
const state=()=>scalar(A.snapshot());
const gate=(...args)=>query(A.gate(...args).replace(/^--.*$/gm,""));
const count=()=>scalar('select count(*)::int from finance_cash_transactions');
test('088 additive bulk payout contract and atomicity',async t=>{
 const check=async(name,fn)=>{await fn();t.diagnostic('PASS '+name);};
 await fixture.setup();await fixture.apply();await db.exec('set client_min_messages=warning');
 if(process.env.CAPTURE_088_EVIDENCE){
  const D=require('./direct-money-documents-artifacts.cjs'),F=require('./finance-authority-artifacts.cjs');
  const catalog=D.catalogSql.replace(/order by (conname|indexname|policyname|tgname|c.relname)\b/g,'order by $1 COLLATE "C"').replace('where conrelid=c.oid',"where conrelid=c.oid and contype<>'n'").replace("'generated',a.attgenerated","'acl',a.attacl::text,'generated',a.attgenerated");
  fs.writeFileSync('/private/tmp/finance088-local-evidence.json',JSON.stringify({functions:await scalar(F.functionEvidence),tables:await scalar(catalog)},null,2));return;
 }
 assert.equal((await gate())[0].gate_pass,false,'Unreconciled synthetic ACLs must not be accepted as Production truth');
 await require('./finance-payable-bulk-fixture.cjs').installAcceptedSecurity(db,query,scalar);
 const before=await state();
 assert.equal(Object.keys(before.tables).length,A.tables.length,'all dependency tables must exist');
 await db.exec(A.body());const added=await state();assert.deepEqual(added.batch,A.contract().batch,'Batch business/security contract unchanged');
 await db.exec('drop function finance_expense_payout_batch(text,jsonb,boolean)');
 const pre=(await gate())[0];assert.equal(pre.gate_pass,true,JSON.stringify(pre.object_differences));
 const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await check('Preflight rejects table/security/NOT NULL/function drift',async()=>{
  for(const sql of ["alter table finance_payouts add column drift text","alter table finance_payouts disable row level security","alter table finance_payouts alter column paid_on drop not null","alter function expense_payout_choice(uuid,boolean) security invoker",
   "grant select(id) on finance_payouts to authenticated","revoke select on finance_payouts from service_role",
   "revoke execute on function expense_integrity() from service_role","grant execute on function expense_integrity() to authenticated",
   "revoke execute on function get_finance_expense_obligations(integer) from authenticated",
   "alter function get_finance_expense_obligations(integer) set search_path=pg_catalog",
   "create policy unexpected088 on finance_payouts for select to authenticated using(true)"]){await db.exec('savepoint preflight088');await db.exec(sql);assert.equal((await gate())[0].gate_pass,false,sql);await db.exec('rollback to preflight088;release preflight088');}
 });
 await check('accepted source-derived bodies, deterministic fingerprints and catalog-only diagnostic',async()=>{
  const R=require('./finance-payable-bulk-reconcile.cjs');
  for(const name of ['expense_integrity','get_finance_expense_obligations'])assert.equal(await scalar('select pg_get_functiondef(to_regprocedure($1))',[R.sourceFunction(name).signature]),R.sourceFunction(name).definition);
  for(const name of ['expense_integrity','get_finance_expense_obligations']){
   await db.exec('savepoint body088');await db.exec(R.sourceFunction(name).definition.replace(/EXPENSE_(AUDIT_INTEGRITY|PERMISSION_DENIED)/,'UNEXPECTED_CONTRACT_CHANGE'));
   assert.equal((await gate())[0].gate_pass,false,'Unexpected body must fail: '+name);await db.exec('rollback to body088;release body088');
  }
  await db.exec('savepoint deterministic088;set local enable_hashagg=off;set local enable_sort=off');
  assert.deepEqual(await state(),before);assert.equal((await gate())[0].gate_pass,true);
  await db.exec('rollback to deterministic088;release deterministic088');
  const diagnostic=(await query(fs.readFileSync('scripts/sql/diagnose_finance_payable_bulk_088_contract.sql','utf8').replace(/^--.*$/gm,'')))[0].diagnostic;
  assert.equal(diagnostic.business_rows_read,false);
  assert.equal(diagnostic.functions.filter(f=>f.finding==='MATCHES_ACCEPTED_CONTRACT_BUT_088_BASELINE_DIFFERS').length,10);
  assert.equal(diagnostic.tables.filter(t=>t.additions_078_exact&&t.column_evidence_differences.length===0).length,16);
 });
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await state(),before,'candidate rollback restores exact state');await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');
 assert.equal((await gate(true,pins))[0].gate_pass,true);
 assert.equal((await gate(true,{}))[0].gate_pass,false,'unbound verifier fails closed');
 assert.equal((await gate(true))[0].gate_pass,false,'Human-reviewed Production baseline rejects synthetic fixture rows');
 assert.deepEqual((await state()).rows,before.rows);assert.deepEqual((await state()).preserved,before.preserved);
 await check('verifier rejects row/catalog/security/function drift',async()=>{
  for(const sql of ["update user_profiles set full_name='drift' where id='"+ids.admin+"'","alter table finance_payouts add column unexpected text","grant execute on function finance_expense_payout_batch(text,jsonb,boolean) to anon"]){
   await db.exec('savepoint drift088');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false);await db.exec('rollback to drift088;release drift088');
  }
 });
 await treasury.opening({amount:50000});const y=await payout.payee({external:true,id:randomUUID()}),z=await payout.payee({external:true,id:randomUUID()});
 const oldest=await make(100,y),items=[await make(200,y),await make(220,z),await make(817.20,y)];
 await check('prepare is atomic and non-oldest items are independently selectable',async()=>{
  const r=await batch('prepare',items);assert.equal(r.items.length,3);assert.equal(await count(),0);
  assert.equal(await scalar('select count(*)::int from finance_payouts where id=$1',[oldest.payout_id]),0);
  const a=await scalar('select count(*)::int from finance_payout_audit');await batch('prepare',items);assert.equal(await scalar('select count(*)::int from finance_payout_audit'),a);
  await reject(()=>batch('prepare',[{...items[0],note:'changed'}]),/RETRY_CHANGED/);
 });
 const confirm=await confirmation(items);
 await check('one invalid item rolls back ALL confirmations even after a prior successful item',async()=>{
  const sorted=[...confirm].sort((a,b)=>a.payout_id.localeCompare(b.payout_id));sorted[2]={...sorted[2],payout_version:999};
  const s=await state();await reject(()=>batch('confirm',sorted),/STALE/);assert.deepEqual((await state()).rows,s.rows);
 });
 await check('200 + 220 + 817.20 produce THREE immutable cash outflows; exact retry is no-op',async()=>{
  await batch('confirm',confirm);await payout.flush();assert.equal(await count(),3);
  assert.deepEqual((await query('select cash_amount::text amount from finance_cash_transactions order by cash_amount')).map(x=>x.amount),['200.00','220.00','817.20']);
  const statement=await scalar('select get_finance_account_statement($1,null,$2,$3)',[ids.bank,'2026-09-10','2026-09-10']);assert.equal(statement.count,3);assert.deepEqual(statement.rows.map(r=>Number(r.cash_amount)).sort((a,b)=>a-b),[200,220,817.2]);
  const s=await state();await batch('confirm',confirm);assert.deepEqual((await state()).rows,s.rows);
  await reject(()=>batch('confirm',[{...confirm[0],payout_version:55},...confirm.slice(1)]),/RETRY_CHANGED/);
 });
 await check('single selected item and existing single-item RPC remain unchanged',async()=>{
  await batch('prepare',[oldest]);await batch('confirm',await confirmation([oldest]));await payout.flush();assert.equal(await count(),4);
  const x=await make(90,y);await rpc('prepare_finance_expense_payout',[x.payout_id,(await scalar('select expense_id from finance_expense_obligations where id=$1',[x.obligation_id])),null,x.paid_on,ids.bank,null,false,'']);await expense.confirm(x.payout_id);await payout.flush();assert.equal(await count(),5);
 });
 await check('mixed WHT/non-WHT stays per-item with distinct recipients',async()=>{
  const xs=[await make(1000,y,true),await make(1000,z)];await batch('prepare',xs);await batch('confirm',await confirmation(xs));await payout.flush();
  assert.deepEqual((await query('select cash_amount::text amount from finance_cash_transactions where source_payout_id in ($1,$2) order by cash_amount',[...xs.map(x=>x.payout_id)])).map(x=>x.amount),['970.00','1000.00']);
  assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations where payout_source_id in ($1,$2)',xs.map(x=>x.payout_id)),1);
 });
 await check('non-Admin denied, duplicate IDs denied, confirmation acknowledgement required',async()=>{
  const xs=[await make(40,y)];
  await db.exec('savepoint actor088');await query("select set_config('test.actor',$1,true)",[ids.staff]);await reject(()=>batch('prepare',xs),/ADMIN_REQUIRED/);await db.exec('rollback to actor088;release actor088');
  await reject(()=>batch('prepare',[xs[0],xs[0]]),/DUPLICATE_ITEM/);
  await batch('prepare',xs);await reject(async()=>batch('confirm',await confirmation(xs),false),/ACK_REQUIRED/);
 });

 await check('cancelled / processing / stale / mixed paid batches fail closed; prepare rolls back',async()=>{
  const xs=[await make(60,y),await make(70,z)],sorted=[...xs].sort((a,b)=>a.payout_id.localeCompare(b.payout_id));
  const s=await state();await reject(()=>batch('prepare',[sorted[0],{...sorted[1],expense_version:999}]),/SOURCE_CHANGED/);assert.deepEqual((await state()).rows,s.rows);
  await batch('prepare',xs);const cs=await confirmation(xs);
  await reject(()=>batch('prepare',[{...xs[0],payout_id:randomUUID()}]),/DRAFT_EXISTS/);
  await rpc('cancel_finance_payout',[xs[1].payout_id,1,true]);await reject(()=>batch('confirm',cs),/NOT_CONFIRMABLE/);
  await reject(()=>batch('confirm',[confirm[0],cs[0]]),/MIXED_CONFIRMED_BATCH/);
  await batch('confirm',[cs[0]]);await payout.flush();
  await reject(()=>rpc('cancel_finance_payout',[xs[0].payout_id,2,true]),/PAYOUT_/);
 });
 await check('resuming an existing single-item draft preserves its note and remains retry-safe',async()=>{
  const x=await make(30,y);const e=await scalar('select expense_id from finance_expense_obligations where id=$1',[x.obligation_id]);await rpc('prepare_finance_expense_payout',[x.payout_id,e,null,x.paid_on,ids.bank,null,false,'Preserved individual draft note']);
  const prepared={...x,payout_version:1};await batch('prepare',[prepared]);await batch('prepare',[prepared]);assert.equal(await scalar('select note from finance_payouts where id=$1',[x.payout_id]),'Preserved individual draft note');assert.equal(await scalar('select version from finance_payouts where id=$1',[x.payout_id]),2);await batch('confirm',await confirmation([x]));await payout.flush();
 });
 await check('Opening Balance/cutoff/account guards and different accounts remain per-item',async()=>{
  const bank=randomUUID();await query("insert into finance_bank_accounts(id,short_name,bank_name,account_number,is_active) values($1,'Other test','Synthetic','2222',true)",[bank]);
  const xs=[await make(80,y),{...await make(90,z),bank_account_id:bank}];await batch('prepare',xs);const cs=await confirmation(xs),s=await state();
  await reject(()=>batch('confirm',cs),/OPENING_BALANCE_REQUIRED/);assert.deepEqual((await state()).rows,s.rows);
  await treasury.opening({bank,amount:10000});await batch('confirm',cs);await payout.flush();
  assert.equal(await scalar('select count(distinct bank_account_id)::int from finance_cash_transactions where source_payout_id in ($1,$2)',xs.map(x=>x.payout_id)),2);
  const late=randomUUID();await query("insert into finance_bank_accounts(id,short_name,bank_name,account_number,is_active) values($1,'Cutoff test','Synthetic','3333',true)",[late]);await treasury.opening({bank:late,start:'2026-09-11'});
  const x={...await make(10,y),bank_account_id:late};await batch('prepare',[x]);await reject(async()=>batch('confirm',await confirmation([x])),/BEFORE_CUTOVER/);
  await query('update finance_bank_accounts set is_active=false where id=$1',[late]);await reject(async()=>batch('confirm',await confirmation([x])),/ACCOUNT_DENIED/);
 });
 await check('inactive Admin and Finance Operator/account custodian cannot use the Admin bulk RPC',async()=>{
  const x=await make(10,y);for(const [role,active]of [['admin',false],['staff',true],['partner',true]]){
   const actor=randomUUID();await query('insert into user_profiles(id,role,active,full_name,must_change_password,finance_operator) values($1,$2,$3,$4,false,$5)',[actor,role,active,'Synthetic scope',role==='staff']);
   await db.exec('savepoint role088');await query("select set_config('test.actor',$1,true)",[actor]);await db.exec('set local role authenticated');await reject(()=>batch('prepare',[x]),/ADMIN_REQUIRED/);await db.exec('rollback to role088;release role088');
  }
  assert.equal(await scalar("select has_function_privilege('anon','finance_expense_payout_batch(text,jsonb,boolean)','execute')"),false);
 });
 await check('employee reimbursement, waiver denial and Office Cash exact retries retain individual rules',async()=>{
  await payout.payee({id:ids.staff,bank:false});
  async function reimbursement(){
   await query("select set_config('test.actor',$1,true)",[ids.staff]);const e=randomUUID();await rpc('save_finance_expense',[e,null,{origin:'employee_claim',expense_date:'2026-09-10',description:'Synthetic reimbursement',category:'Travel',personally_paid:true,reimbursement_requested:123,gross_amount:123}]);await rpc('submit_finance_expense',[e,await scalar('select version from finance_expenses where id=$1',[e])]);await query("select set_config('test.actor',$1,true)",[ids.admin]);
   await rpc('review_finance_expense',[e,await scalar('select version from finance_expenses where id=$1',[e]),true,'Synthetic acceptance']);await expense.review(e,{vat_state:'none',eligibility:'ineligible',wht_state:'none'});await expense.settlement(e,'reimburse',ids.staff,123);
   return {...await scalar("select jsonb_build_object('obligation_id',o.id,'expense_version',e.version) from finance_expense_obligations o join finance_expenses e on e.id=o.expense_id where e.id=$1",[e]),payout_id:randomUUID(),payout_version:null,paid_on:'2026-09-10',bank_account_id:ids.bank,cash_location_id:null,actual_wht:false,note:''};
  }
  const x=await reimbursement();await batch('prepare',[x]);const cs=await confirmation([x]);assert.equal(cs[0].destination_id,null);await batch('confirm',cs);await batch('confirm',cs);await payout.flush();
  const waived=await reimbursement();await rpc('waive_finance_expense_reimbursement',[waived.obligation_id,'Synthetic waiver',true]);await reject(()=>batch('prepare',[waived]),/EXPENSE_PAYMENT_UNAVAILABLE/);
  const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});const cashItem={...await make(10,y),bank_account_id:null,cash_location_id:cash};await batch('prepare',[cashItem]);const cashConfirm=await confirmation([cashItem]);await batch('confirm',cashConfirm);await batch('confirm',cashConfirm);await payout.flush();
 });
 await check('actual list/detail read payloads round-trip through application prepare/confirm serializers',async()=>{
  const model=require('../../app/finance/payables/bulk-payment-model.ts');const x=await make(25,y),list=await scalar('select get_finance_expense_obligations()');const obligation=list.rows.find(o=>o.id===x.obligation_id);assert.ok(model.eligiblePayable(obligation));
  const data=await scalar('select get_finance_expenses($1)',[obligation.expense_id]);assert.equal(data.record.obligation.settled,false);assert.equal(data.record.obligation.waived,false);
  const entry={obligation:{...obligation,...data.record.obligation},row:data.record,accounts:data.accounts,payoutId:x.payout_id,accountId:ids.bank,paidOn:x.paid_on,withhold:false};await batch('prepare',model.prepareItems([entry]));
  const reloaded=await scalar('select get_finance_expenses($1)',[obligation.expense_id]);assert.equal(reloaded.record.payout.id,x.payout_id);await batch('confirm',model.confirmItems([{...entry,row:reloaded.record}]));await payout.flush();
 });
 await check('independent-session double submission is idempotent and does not deadlock',async()=>{
  const xs=[await make(11,y),await make(12,z)];await payout.flush();await db.exec('commit');
  const {PGlite}=require('./finance-authority-pg-adapter.cjs');
  async function independent(action,items){const client=new PGlite();try{await client.exec('begin');await client.query("select set_config('test.actor',$1,true)",[ids.admin]);await client.exec("set local role authenticated;set local statement_timeout='10s'");const r=await client.query('select finance_expense_payout_batch($1,$2::jsonb,true)',[action,items]);await client.exec('commit');return r;}finally{await client.close();}}
  await Promise.all([independent('prepare',xs),independent('prepare',[...xs].reverse())]);await db.exec('begin');const cs=await confirmation(xs);await db.exec('commit');
  await Promise.all([independent('confirm',cs),independent('confirm',[...cs].reverse())]);await db.exec('begin');
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id in ($1,$2)',xs.map(x=>x.payout_id)),2);
  assert.equal(await scalar("select count(*)::int from finance_payout_audit where event_type='confirmed' and payout_id in ($1,$2)",xs.map(x=>x.payout_id)),2);
 });
 A.validate();
});
