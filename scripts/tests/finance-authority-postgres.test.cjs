/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL only. Synthetic identities and money; no .env or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const fixture=require('./finance-authority-fixture.cjs'),A=require('./finance-authority-artifacts.cjs');
const {db,query,scalar,rpc,rejects,ids}=require('./receipt-foundation.test.cjs');
const phase=require('./distribution-payout-postgres.test.cjs'),dist=require('./revenue-distribution-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),docs=require('./direct-money-documents-postgres.test.cjs');
// Preserve the original RPC error while restoring the caller after a failure.
async function asActor(id,callback){const prior=await scalar("select current_setting('test.actor',true)");await db.exec('savepoint actor078');await query("select set_config('test.actor',$1,true)",[id]);await db.exec('set local role authenticated');try{const r=await callback();await db.exec('reset role');await query("select set_config('test.actor',$1,true)",[prior]);await db.exec('release savepoint actor078');return r;}catch(e){await db.exec('rollback to savepoint actor078; release savepoint actor078');throw e;}}
async function asIdentity(id,callback){const prior=await scalar("select current_setting('test.actor',true)");await query("select set_config('test.actor',$1,true)",[id]);try{return await callback();}finally{await query("select set_config('test.actor',$1,true)",[prior]);}}
const q=v=>v==null?'NULL':typeof v==='number'?String(v):typeof v==='boolean'?String(v):A.q(typeof v==='object'?JSON.stringify(v):v);
const statement=(name,args)=>`select ${name}(${args.map(q).join(',')});`;
const independent=(actor,sql)=>new Promise(resolve=>{
 const {bin,connection}=require('./distribution-payout-pg-adapter.cjs'),p=spawn(bin,connection(),{stdio:['pipe','pipe','pipe']});let out='',error='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>error+=b);p.on('exit',code=>resolve({code,out,error}));p.stdin.end(`BEGIN;select set_config('test.actor',${q(actor)},true);SET LOCAL ROLE authenticated;${sql}\nCOMMIT;`);
});

test('078 PostgreSQL authority matrix, preservation, direct RPC/RLS, atomicity and independent-session retry',async t=>{
 let checks=0;const check=async(name,fn)=>{await fn();checks++;t.diagnostic('PASS '+name);};
 await fixture.setup();await db.exec('set client_min_messages=warning');
 const partner=randomUUID(),operator=randomUUID(),lawyer=randomUUID(),inactive=randomUUID(),other=randomUUID(),bank=randomUUID();
 for(const [id,role,active]of [[partner,'partner',true],[operator,'staff',true],[lawyer,'lawyer',true],[inactive,'admin',false],[other,'partner',true]])await query('insert into user_profiles(id,role,active,full_name,must_change_password) values($1,$2,$3,$4,false)',[id,role,active,'Synthetic '+role]);
 await query("insert into finance_bank_accounts(id,short_name,bank_name,account_number,is_active) values($1,'KTB fixture','Synthetic','1111',true)",[bank]);
 await treasury.opening({bank,amount:50000});
 const source=await phase.source();
 // A second confirmed source has no referral evidence and must stay denied.
 const direct=require('./direct-money-postgres.test.cjs'),unproven=randomUUID();const incoming=direct.input([direct.line({vat_applicable:false,vat_rate:0,vat_treatment_json:{treatment:'exempt',reason:'Synthetic'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})],10000);incoming.received_on='2026-09-15';await direct.save(unproven,incoming);await direct.transition(unproven,1,'confirm');
 const createExpense=async()=>{const id=await expense.accepted();await expense.review(id,{vat_state:'none',eligibility:'ineligible',wht_state:'none'});await expense.settlement(id,'company_bank');return id;};
 const confirmExpense=async(id)=>{const p=(await scalar('select get_finance_expenses($1)',[id])).record.payout;return rpc('confirm_finance_payout',[p.id,p.version,p.payee_version,p.destination?.id||null,true]);};
 const approved=await createExpense();
 const pre=(await query(fs.readFileSync(A.preflight,'utf8').replace(/^--.*$/gm,'').trim()))[0];
 assert.equal(pre.gate_pass,true,JSON.stringify(pre));
 const before=await scalar(A.snapshot());
 await check('full candidate rollback restores exact pre-078 state',async()=>{
  await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));await db.exec('begin');
  assert.deepEqual(await scalar(A.snapshot()),before);assert.equal(await scalar("select count(*)::int from pg_attribute where attrelid='user_profiles'::regclass and attname='finance_operator' and not attisdropped"),0);
 });
 await fixture.apply();const after=await scalar(A.snapshot());
 await check('full exact candidate preserves existing rows/contracts and never assigns anyone',async()=>{assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);assert.equal(before.rows.finance_treasury_account_authorities.count,0);assert.equal(after.rows.finance_treasury_account_authorities.count,0);assert.equal(await scalar('select count(*)::int from user_profiles where finance_operator'),0);});
 const applied={functions:after.functions,security:after.security,additions:after.additions};
 if(process.env.CAPTURE_078)fs.writeFileSync(A.contractPath,JSON.stringify(applied,null,2)+'\n');else assert.deepEqual(applied,JSON.parse(fs.readFileSync(A.contractPath)));
 const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 const verify=async(p=pins)=>(await query(A.readGate(true,p).replace(/^--.*$/gm,'')))[0];
 await check('reviewed binding: synthetic PASS, unbound/partial/wrong/Production pins reject synthetic rows',async()=>{
  const passed=await verify();assert.equal(passed.gate_pass,true,JSON.stringify(passed));assert.equal(passed.historical_rows_unchanged,true);assert.equal(passed.broader_finance_differences_accepted,false);
  for(const p of [{},{rows_sha256:pins.rows_sha256},{preserved_sha256:pins.preserved_sha256},{...pins,rows_sha256:'0'.repeat(64)},{...pins,preserved_sha256:'0'.repeat(64)}])assert.equal((await verify(p)).gate_pass,false,JSON.stringify(p));
  // Execute the actual checked-in SELECT-only verifier only on the disposable
  // fixture: it MUST reject these synthetic rows instead of replacing the human pins.
  const productionPinned=(await query(fs.readFileSync(A.verifier,'utf8').replace(/^--.*$/gm,'')))[0];
  assert.equal(productionPinned.gate_pass,false);assert.ok(productionPinned.failed_checks.includes('historical_rows_unchanged'));assert.ok(!productionPinned.failed_checks.includes('reviewed_baseline_bound'));
  assert.equal(productionPinned.candidate_sha256,A.reviewedPreflight.candidate_sha256);assert.equal(productionPinned.broader_finance_differences_accepted,false);
  assert.deepEqual(productionPinned.function_differences,[]);assert.deepEqual(productionPinned.security_differences,[]);
 });
 await check('verifier rejects row deletion, schema/function/ACL/policy/trigger drift and auto-assignment',async()=>{
  const cases=[
   ["update user_profiles set full_name='unexpected drift' where id='"+ids.staff+"'",'historical_rows_unchanged'],
   ["delete from user_profiles where id='"+other+"'",'historical_rows_unchanged'],
   ['alter table finance_bank_accounts add column unexpected078 text','protected_contracts_unchanged'],
   ['grant execute on function finance078_execution_account(uuid,uuid) to authenticated','functions_exact'],
   ['alter function finance078_admin() set search_path=public,pg_temp','functions_exact'],
   ['create or replace function finance078_self_service() returns boolean language sql stable security definer set search_path=public as $$select false$$','functions_exact'],
   ['alter policy finance078_cash_movements_scope on finance_cash_transactions using(true)','added_policies_triggers_exact'],
   ['drop trigger finance078_profile_guard on user_profiles','added_policies_triggers_exact'],
   ['alter table user_profiles alter column finance_operator set default true','finance_operator_column'],
   ["update user_profiles set finance_operator=true where id='"+operator+"'",'no_assignment_backfill'],
  ];
  for(const [sql,failed]of cases){await db.exec('savepoint drift078');await db.exec(sql);const r=await verify();assert.equal(r.gate_pass,false,sql);assert.ok(r.failed_checks.includes(failed),sql+' '+JSON.stringify(r.failed_checks));await db.exec('rollback to savepoint drift078');}
  assert.equal((await verify()).gate_pass,true,'Every drift simulation rolled back');
 });
 await check('verifier rejects unexpected custody and orphan Finance references in isolated fixtures',async()=>{
  await db.exec('savepoint custody078');
  await rpc('set_finance_treasury_authority',[operator,bank,null,{view_balance:true,view_movements:false,record_outflow:false,confirm_outflow:false},null,'Synthetic unexpected assignment']);
  const assigned=await verify();assert.equal(assigned.gate_pass,false);assert.ok(assigned.failed_checks.includes('historical_rows_unchanged'));assert.equal(assigned.historical_rows.finance_treasury_account_authorities.count,1);
  // Simulated corruption only in disposable PostgreSQL, never in a manual gate.
  await db.exec("set local session_replication_role=replica;update finance_treasury_account_authorities set user_id='"+randomUUID()+"';set local session_replication_role=origin");
  const custody=await verify();assert.equal(custody.gate_pass,false);assert.ok(custody.failed_checks.includes('authority_references_valid'));
  await db.exec('rollback to savepoint custody078');
  await db.exec('savepoint reference078');
  await db.exec("set local session_replication_role=replica;update finance_payable_entitlements set recipient_id='"+randomUUID()+"' where recipient_type='user';set local session_replication_role=origin");
  const orphan=await verify();assert.equal(orphan.gate_pass,false);assert.ok(orphan.failed_checks.includes('entitlement_references_valid'));
  await db.exec('rollback to savepoint reference078');assert.equal((await verify()).gate_pass,true);
 });
 await check('verifier SELECT leaves all fingerprints unchanged and is independent of planner row order',async()=>{
  const original=await scalar(A.snapshot());await db.exec('savepoint ordering078');await db.exec('set local enable_seqscan=off;set local enable_hashagg=off');
  assert.deepEqual(await scalar(A.snapshot()),original);assert.equal((await verify()).gate_pass,true);
  await db.exec('rollback to savepoint ordering078');assert.deepEqual(await scalar(A.snapshot()),original);
 });
 // Assignment and flags are synthetic test data only, after preservation proof.
 await check('Admin assigns and revokes Operator through existing optimistic/audited People RPC',async()=>{
  await query('update user_profiles set assignable=false where id=$1',[operator]);
  for(const assigned of [true,false,true]){const prior=await scalar('select to_jsonb(u) from user_profiles u where id=$1',[operator]);const result=await asActor(ids.admin,()=>scalar('select people_admin_save_profile($1,$2,$3,null)',[operator,{finance_operator:assigned},prior]));assert.equal(result.finance_operator,assigned);assert.equal(result.role,'staff');assert.equal(result.can_confirm_finance_payments,prior.can_confirm_finance_payments);}
  assert.equal(await scalar("select count(*)::int from case_audit_logs where table_name='user_profiles' and record_id=$1",[operator]),3);
 });
 const legacyFlags=Object.keys(A.B.profile.columns.reduce((o,c)=>(o[c.name]=true,o),{})).filter(n=>/^can_.*finance|^can_approve_expense|^can_pay_expense/.test(n));
 for(const id of [partner,operator,lawyer,ids.staff,inactive])await query(`update user_profiles set ${legacyFlags.map(n=>n+'=true').join(',')} where id=$1`,[id]);
 const matrix=()=>scalar(`select jsonb_build_object('routine',current_user_can_manage_finance_quotations(),'receipt',current_user_can_issue_finance_receipts(),'tax_invoice',current_user_can_issue_finance_tax_invoices(),'incoming',current_user_can_confirm_finance_payments(),'reverse',current_user_can_reverse_finance_payments(),'approval',expense_can_manage(),'generic_cash',current_user_can_manage_finance_cash_transactions(),'void',current_user_can_void_finance_receipts(),'transfer',statement_transfer_allowed(null,null,null,null),'tax_view',tax_position_can_view(),'tax_remit',tax_filing_can_remit(),'self',expense_can_claim())`);
 await check('Admin / Partner / Operator / Lawyer / Staff / inactive role matrix defeats old flags',async()=>{
  for(const [id,ops,admin,op,self]of [[ids.admin,true,true,false,true],[partner,true,false,false,true],[operator,true,false,true,true],[lawyer,false,false,false,true],[ids.staff,false,false,false,true],[inactive,false,false,false,false]])await asIdentity(id,async()=>{
   const r=await matrix();assert.deepEqual(r,{routine:ops,receipt:ops,tax_invoice:ops,incoming:admin,reverse:admin,approval:admin,generic_cash:admin,void:admin,transfer:admin,tax_view:ops,tax_remit:admin||op,self});
  });
 });
 const rights={view_balance:true,view_movements:true,record_outflow:true,confirm_outflow:true};
 await rpc('set_finance_treasury_authority',[operator,bank,null,rights,null,'Synthetic account custody']);
 await check('Partner read-all but no execution; Operator only assigned KTB',async()=>{
  await asActor(partner,async()=>{assert.equal(await scalar("select expense_account_allowed($1,null,'view_balance')",[ids.bank]),true);assert.equal(await scalar("select expense_account_allowed($1,null,'record_outflow')",[bank]),false);});
  await asActor(operator,async()=>{const a=await scalar('select get_finance_expense_accounts()');assert.deepEqual(a.map(r=>r.id),[bank]);assert.equal(a[0].balance,50000);await rejects('select get_finance_assigned_account_movements($1,null)',[ids.bank],/ACCOUNT_DENIED/);await rejects('select expense_account_balance($1,null)',[ids.bank],/ACCOUNT_DENIED/);});
 });
 await check('direct incoming/reverse/void/control RPCs deny non-Admins before mutation',async()=>{
  for(const id of [partner,operator,lawyer,ids.staff,inactive])await asActor(id,async()=>{
   await rejects('select confirm_finance_payment($1,true)',[randomUUID()],/Not allowed to confirm Payment/);
   await rejects('select reverse_finance_payment($1,$2)',[randomUUID(),'Reason'],/PERMISSION_DENIED|Not allowed/);
   await rejects('select void_finance_receipt($1,$2,true)',[randomUUID(),'Reason'],/PERMISSION_DENIED|Not allowed/);
   await rejects('select void_finance_invoice($1,$2,true)',[randomUUID(),'Reason'],/ADMIN_REQUIRED/);
   await rejects("select transition_finance_direct_money_receipt($1,1,'confirm',true,'')",[unproven],/ADMIN_REQUIRED/);
   await rejects('select set_finance_treasury_authority($1,$2,null,$3,null,$4)',[id,ids.bank,rights,'Escalation attempt'],/ADMIN_REQUIRED/);
   await rejects("select confirm_finance_treasury_transfer($1,$2,null,$3,null,10,'2026-09-10','Reason',true)",[randomUUID(),ids.bank,bank],/PERMISSION_DENIED/);
   await rejects('select record_finance_paid_expense($1,$2,$3,null,$4,true)',[randomUUID(),expense.input(),bank,'2026-09-10'],/ADMIN_REQUIRED/);
  });
 });
 await check('non-Admin cannot self-assign Finance Operator through direct UPDATE',async()=>{await asActor(lawyer,()=>rejects('update user_profiles set finance_operator=true where id=$1',[lawyer],/ADMIN_REQUIRED|permission denied/));});
 let submitted;
 await asActor(operator,async()=>{submitted=randomUUID();await rpc('save_finance_expense',[submitted,null,expense.input()]);await rpc('submit_finance_expense',[submitted,(await scalar('select get_finance_expenses($1)',[submitted])).record.version]);});
 await check('Admin-only approval; unapproved source cannot be paid even on assigned account',async()=>{
  for(const id of [partner,operator,lawyer])await asActor(id,()=>rejects("select review_finance_expense($1,2,true,'Approve')",[submitted],/PERMISSION_DENIED/));
  // Old submitted + settlement path must now stop before preparation.
  await asActor(operator,()=>rejects("select prepare_finance_expense_payout($1,$2,null,'2026-09-10',$3,null,false,'pay')",[randomUUID(),submitted,bank],/APPROVED_SOURCE_REQUIRED/));
 });
 await check('approved source executes from authorized account only, exactly one cash leg and retry',async()=>{
  let paid;await asActor(operator,async()=>{await rejects("select prepare_finance_expense_payout($1,$2,null,'2026-09-10',$3,null,false,'pay')",[randomUUID(),approved,ids.bank],/ACCOUNT_DENIED/);paid=await expense.prepare(approved,{bank});await confirmExpense(approved);await confirmExpense(approved);});assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[paid]),1);
 });
 await check('four account rights remain distinct (balance-only, movement-only, record-only)',async()=>{
  const id=await createExpense();
  async function grant(r){const v=await scalar('select version from finance_treasury_account_authorities where user_id=$1 and bank_account_id=$2',[operator,bank]);await rpc('set_finance_treasury_authority',[operator,bank,null,r,v,'Synthetic rights separation']);}
  await grant({...rights,view_movements:false,record_outflow:false,confirm_outflow:false});
  await asActor(operator,async()=>{const state=await scalar('select get_finance_treasury()');assert.equal(state.transactions.length,0);assert.equal(state.accounts[0].inflow,null);assert.equal(state.accounts[0].outflow,null);await rejects("select get_finance_account_statement($1,null,'2026-09-01','2026-09-30')",[bank],/PERMISSION_DENIED/);await rejects("select prepare_finance_expense_payout($1,$2,null,'2026-09-10',$3,null,false,'pay')",[randomUUID(),id,bank],/ACCOUNT_DENIED/);});
  await grant({...rights,view_balance:false,record_outflow:false,confirm_outflow:false});
  await asActor(operator,async()=>{const a=await scalar('select get_finance_statement_accounts()');assert.equal(a.accounts.length,1);const s=await scalar("select get_finance_account_statement($1,null,'2026-09-01','2026-09-30')",[bank]);assert.equal(s.opening,null);assert.equal(s.closing,null);assert.ok(s.rows.every(x=>!('balance'in x)));await rejects('select expense_account_balance($1,null)',[bank],/ACCOUNT_DENIED/);});
  await grant({...rights,view_balance:false,view_movements:false,confirm_outflow:false});let p;
  await asActor(operator,async()=>{p=await expense.prepare(id,{bank});await rejects('select confirm_finance_payout($1,1,null,null,true)',[p],/ACCOUNT_DENIED/);assert.equal((await scalar('select get_finance_treasury()')).accounts.length,0);});
  await grant({...rights,view_balance:false,view_movements:false});await asActor(operator,()=>confirmExpense(id));
  await grant(rights);
 });
 await check('Distribution denies Operator, staff, unproven Partner; canonical referral UUID permits matching Partner only',async()=>{
  for(const id of [operator,lawyer,ids.staff])await asActor(id,()=>rejects('select get_finance_revenue_distribution_workspace()',[],/PERMISSION_DENIED/));
  await asActor(partner,async()=>{assert.equal((await scalar('select get_finance_revenue_distribution_workspace()')).count,0);await rejects('select get_finance_revenue_distribution_detail($1,$2)',[source.type,source.sid],/PERMISSION_DENIED/);});
  // Canonical fixture referral is ids.admin. Change this synthetic person's role
  // only for read tests, then restore. Never edit frozen entitlement evidence.
  const ref=source.rows.find(r=>r.bucket==='referral');assert.ok(ref);const previous=await scalar('select role from user_profiles where id=$1',[ref.recipient_id]);await query("update user_profiles set role='partner' where id=$1",[ref.recipient_id]);
  await asActor(ref.recipient_id,async()=>{assert.equal(await scalar('select finance078_distribution_allowed(null,$1)',[source.sid]),true);const d=await dist.context(source.type,source.sid);assert.equal(d.can_manage,true);assert.equal(d.can_pay,false);await rejects('select get_finance_revenue_distribution_detail($1,$2)',['direct_money_receipt',unproven],/PERMISSION_DENIED/);assert.equal(await scalar('select count(*)::int from finance_vp_revenue_distributions'),1);});
  await query('update user_profiles set role=$2 where id=$1',[ref.recipient_id,previous]);
 });
 await check('own compensation and Operator minimal execution projection; raw allocation RPC/table inaccessible',async()=>{
  await asActor(ids.staff,async()=>{const d=await scalar('select get_finance_participant_payments()');assert.ok(d.rows.length);assert.ok(d.rows.every(x=>x.recipient_id===ids.staff));assert.equal(d.access.can_execute,false);});
  await asActor(operator,async()=>{const d=await scalar('select get_finance_participant_payments()');assert.equal(d.rows.length,source.rows.length);assert.doesNotMatch(JSON.stringify(d),/formula|source_snapshot|decisions_json|bucket|percent/);assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),0);await rejects('select get_finance_payable_entitlements()',[],/ADMIN_REQUIRED/);const c=await phase.context(source.d,source.rows[0].id);assert.doesNotMatch(JSON.stringify(c),/formula|source_snapshot|decisions_json|bucket|percent/);assert.deepEqual(c.accounts.map(a=>a.bank_account_id),[bank]);});
 });
 let claim;
 await asActor(lawyer,async()=>{claim=randomUUID();await rpc('save_finance_expense',[claim,null,expense.input({origin:'employee_claim',personally_paid:true,reimbursement_requested:10700,note:'Own note'})]);await rpc('submit_finance_expense',[claim,(await scalar('select get_finance_expenses($1)',[claim])).record.version]);});
 await rpc('review_finance_expense',[claim,await scalar('select version from finance_expenses where id=$1',[claim]),true,'Accepted own claim']);await expense.review(claim);
 await check('self-service payload keeps own facts/status, removes internal Tax/evidence; other requests denied',async()=>{
  await asActor(lawyer,async()=>{const r=(await scalar('select get_finance_expenses($1)',[claim])).record;assert.equal(r.note,'Own note');assert.equal(r.status,'accepted');assert.equal(r.gross_amount,10700);assert.ok(!('tax_review'in r));assert.deepEqual(r.audit,[]);await rejects('select get_finance_expense_economics($1)',[claim],/PERMISSION_DENIED/);await rejects('select get_finance_expenses($1)',[approved],/PERMISSION_DENIED/);});
 });
 await check('Partner Tax read, remit denied; Operator separate Tax bundle and scoped account contract',async()=>{
  await asActor(partner,async()=>{assert.ok(await scalar('select get_finance_tax_position()'));await rejects("select transition_finance_tax_remittance($1,1,'confirmed',true)",[randomUUID()],/PERMISSION_DENIED/);});
  await asActor(operator,async()=>{assert.ok(await scalar('select get_finance_tax_position()'));await rejects("select transition_finance_tax_remittance($1,1,'confirmed',true)",[randomUUID()],/query returned no rows/);await rejects('select tax_filing_account($1,null)',[ids.bank],/permission denied/);});
 });
 await check('routine Receipt issue allowed to Operator; Admin correction integrity guard preserved',async()=>{
  await asActor(operator,async()=>{const receipt=await docs.create(unproven);const r=await scalar('select to_jsonb(r) from finance_receipts r where id=$1',[receipt]);await rpc('issue_finance_receipt',[receipt,true,r.draft_snapshot_json]);await rejects("select void_finance_receipt($1,'reason',true)",[receipt],/PERMISSION_DENIED/);});
  await rejects("select transition_finance_direct_money_receipt($1,2,'reverse',true,'Reason')",[unproven],/DOCUMENT_DEPENDENCY|TREASURY_CASH_CORRECTION/);
 });
 await check('independent PostgreSQL sessions: same payout ID retries are atomic/exactly once',async()=>{
  const args=await phase.args(source,0);args[5]=bank;await db.exec('commit');
  const results=await Promise.all(Array.from({length:4},()=>independent(operator,statement('pay_finance_distribution_participant',args))));
  for(const r of results)assert.equal(r.code,0,r.error);await db.exec('begin');
  for(const [table,col,n]of [['finance_payouts','id',1],['finance_payout_allocations','payout_id',1],['finance_cash_transactions','source_payout_id',1],['finance_payout_audit','payout_id',2]])assert.equal(await scalar(`select count(*)::int from ${table} where ${col}=$1`,[args[2]]),n,table);
 });
 await check('independent duplicate entitlement attempts choose one winner; losing transaction rolls back',async()=>{
  const one=await phase.args(source,1),two=[...one];one[5]=bank;two[5]=bank;two[2]=randomUUID();await db.exec('commit');
  const results=await Promise.all([one,two].map(a=>independent(operator,statement('pay_finance_distribution_participant',a))));assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));assert.match(results.find(r=>r.code!==0).error,/RIGHTS_UNAVAILABLE/);await db.exec('begin');assert.equal(await scalar('select count(*)::int from finance_payout_allocations where entitlement_id=$1',[one[1]]),1);
 });
 await check('Operator files and confirms actual Tax remittance without incoming or balance authority; retries preserve one cash leg',async()=>{
  const payout=require('./payout-postgres.test.cjs'),payee=randomUUID();await payout.payee({id:payee,external:true});
  const e=await expense.accepted({supplier_payee_id:payee});await expense.review(e,{vat_state:'none',eligibility:'ineligible',wht_state:'withhold',wht_base:10000,wht_rate:3});await expense.settlement(e,'supplier_unpaid',payee);const p=await expense.prepare(e,{bank,wht:true});await expense.confirm(p);await payout.flush();
  const v=await scalar('select version from finance_treasury_account_authorities where user_id=$1 and bank_account_id=$2',[operator,bank]);await rpc('set_finance_treasury_authority',[operator,bank,null,{...rights,view_balance:false,view_movements:false},v,'Synthetic execution-only']);
  const f=randomUUID(),r=randomUUID();
  await asActor(operator,async()=>{
   const state=await scalar("select get_finance_tax_filings('2026-09-01')"),pool=state.pools.find(x=>x.filing_type==='wht_natural');assert.equal(pool.tax_amount,300);
   const deadline=await scalar("select get_finance_tax_deadline('2026-09-01','wht_natural','online')");
   await rpc('create_finance_tax_filing_review',[f,'2026-09-01','wht_natural',pool.fingerprint,'online',deadline,null]);
   await rpc('transition_finance_tax_filing',[f,1,'ready_for_review',null,null,null,true]);await rpc('transition_finance_tax_filing',[f,2,'filed','2026-09-23','Synthetic filing','Evidence',true]);
   const a=state.accounts.find(x=>x.bank_account_id===bank);assert.ok(a);assert.equal(a.system_balance,null);assert.ok(a.account_token);assert.ok(!('opening_amount'in a));assert.ok(!state.accounts.some(x=>x.bank_account_id===ids.bank));
   const args=[r,f,bank,null,'2026-09-23','Synthetic tax payment','Evidence',a];await rpc('create_finance_tax_remittance',args);await rpc('create_finance_tax_remittance',args);
   await rpc('transition_finance_tax_remittance',[r,1,'confirmed',true]);await rpc('transition_finance_tax_remittance',[r,1,'confirmed',true]);
   const filing=(await scalar("select get_finance_tax_filings('2026-09-01')")).filings.find(x=>x.id===f),rem=filing.remittance;assert.equal(rem.confirmed_snapshot_json.account.system_balance,null);assert.ok(!('opening_amount'in rem.confirmed_snapshot_json.account));assert.deepEqual(filing.payment_history[0].audit,[]);
  });await payout.flush();assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[r]),1);
 });
 await check('Admin Payment confirm, preserved v2 basis and two-leg transfer remain operational after 078',async()=>{
  const payment=await require('./vp-distribution-postgres.test.cjs').source([{base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee',wht:3}]);
  assert.equal(await scalar('select status from finance_payments where id=$1',[payment.p.id]),'confirmed');
  const c=await dist.context('payment',payment.p.id);assert.equal(c.source.totals.professional_pool,10000);const d=await dist.confirm(dist.args('payment',payment.p.id,c));assert.ok(d);
  const transfer=randomUUID(),args=[transfer,bank,null,ids.bank,null,10,'2026-09-23','Synthetic movement',true];await rpc('confirm_finance_treasury_transfer',args);await rpc('confirm_finance_treasury_transfer',args);
  assert.equal(await scalar('select count(*)::int from finance_treasury_transfer_legs l join finance_cash_transactions c on c.id=l.cash_transaction_id where l.transfer_id=$1',[transfer]),2);
 });
 t.diagnostic(`${checks} scenario groups passed on independent-session capable PostgreSQL.`);
});
