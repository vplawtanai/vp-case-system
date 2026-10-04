/* eslint-disable @typescript-eslint/no-require-imports */
require('./finance-payroll-overlap-postgres.test.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const A=require('./finance-payroll-monthly-artifacts.cjs');
const {db,query,scalar,ids}=require('./receipt-foundation.test.cjs'),payout=require('./payout-postgres.test.cjs');
const manage=(a,p,r=randomUUID())=>scalar('select payroll089_manage($1,$2,$3)',[a,p,r]);
const month=m=>scalar('select payroll091_month($1)',[m]);
const command=(a,m,items,r=randomUUID())=>scalar('select payroll091_manage($1,$2,$3,$4,true)',[a,m,items,r]);
const facts=(base=15000,extra={})=>({base_amount:base,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,adjustment_reason:'Explicit actual amount',note:'Admin reviewed all monthly facts',confirmed:true,...extra});
async function person(kind='contractor',rateStart='2027-10-01',bank=true) {const id=randomUUID();await query("insert into user_profiles(id,role,active,full_name,must_change_password) values($1,'staff',true,'Synthetic 091',false)",[id]);await payout.payee({id,bank});await manage('engagement',{id:randomUUID(),payee_id:id,kind,active:true,effective_from:'2027-10-01',reason:'Synthetic'});if(rateStart)await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:15000,effective_from:rateStart,reason:'Synthetic'});return id;}
async function item(id,m='2027-10-01',extra={}){const r=(await month(m)).rows.find(x=>x.payee_id===id);return {payee_id:id,line_id:r.line?.id||randomUUID(),line_hash:r.line_hash,source_hash:r.source_hash,payee_version:r.payee_version,destination_id:r.destination?.id,...extra};}
async function payItem(id,m='2027-10-01',extra={}){return item(id,m,{payout_id:randomUUID(),bank_account_id:ids.bank,cash_location_id:null,paid_on:m.slice(0,7)+'-28',...extra});}
async function reject(fn,pattern){await db.exec('savepoint reject091');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to reject091;release reject091');}}
const gate=(post,pins)=>query(A.gate(post,pins).replace(/^--.*$/gm,''));
test('091 line-controlled monthly payroll, atomic cash, preservation and privacy',async t=>{
 await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 const before=await scalar(A.snapshot());assert.deepEqual(before.functions,A.before().functions);assert.deepEqual(before.tables,A.before().tables);
 if(process.env.CAPTURE_091_EVIDENCE){await db.exec(A.body());const after=await scalar(A.snapshot());assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);fs.writeFileSync(A.contractPath,JSON.stringify({functions:Object.fromEntries(A.signatures.map(s=>[s,after.functions[s]])),tables:{finance_payroll_periods:after.tables.finance_payroll_periods}},null,2)+'\n');await db.exec('rollback');return;}
 const pre=(await gate(false))[0];assert.equal(pre.gate_pass,true);const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 assert.equal((await gate(true,pins))[0].gate_pass,true);assert.equal((await gate(true,{}))[0].gate_pass,false);
 for(const sql of ["update user_profiles set full_name='drift' where id='"+ids.admin+"'","alter table finance_payroll_lines add column drift text","grant execute on function payroll091_source(date,uuid) to authenticated","alter function finance_expense_payout_batch(text,jsonb,boolean) security invoker","create table public.unexpected091(id integer)"]){await db.exec('savepoint drift091');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false,sql);await db.exec('rollback to drift091;release drift091');}
 const scenario=async(name,fn)=>{await db.exec('savepoint scenario091');try{await fn();await payout.flush();t.diagnostic('PASS '+name);}finally{await db.exec('rollback to scenario091;release scenario091');}};
 await scenario('A/B/D/E/F/G independent partial lines, obligations, retry, future rate and readonly month',async()=>{
  const a=await person('employee'),b=await person('contractor','2027-10-04'),missing=await person('contractor',null);
  const initial=await scalar(A.snapshot());const preview=await month('2027-10-01');assert.equal(preview.period_id,null);assert.equal(preview.rows.find(x=>x.payee_id===b).state,'amount_required');assert.deepEqual(preview.rows.find(x=>x.payee_id===missing).issues,['missing_rate']);await month('2027-11-01');assert.deepEqual((await scalar(A.snapshot())).rows,initial.rows);
  const bBefore=(await month('2027-10-01')).rows.find(x=>x.payee_id===b).line;
  const input=await payItem(a,'2027-10-01',{facts:facts(15000,{employee_ss:750,employer_ss:750,wht_treatment:'withhold',wht_amount:300})}),request=randomUUID();
  const paid=await command('pay','2027-10-01',[input],request);await payout.flush();const aPaid=(await month('2027-10-01')).rows.find(x=>x.payee_id===a);
  assert.equal(aPaid.state,'paid');assert.equal(aPaid.line.net_amount,13950);assert.deepEqual((await month('2027-10-01')).rows.find(x=>x.payee_id===b).line,bBefore);assert.equal((await month('2027-10-01')).rows.find(x=>x.payee_id===b).state,'amount_required');
  assert.equal(await scalar('select count(*) from finance_cash_transactions where source_payout_id=$1',[input.payout_id]),1);
  assert.equal(await scalar('select count(*) from finance_payroll_obligations where line_id=$1',[aPaid.line.id]),3);
  const after=await scalar(A.snapshot());assert.deepEqual(await command('pay','2027-10-01',[input],request),paid);assert.deepEqual((await scalar(A.snapshot())).rows,after.rows);
  await command('save','2027-10-01',[await item(b,'2027-10-01',{facts:facts(11000)})]);const bi=await payItem(b);await command('pay','2027-10-01',[bi]);await payout.flush();assert.equal((await month('2027-10-01')).rows.find(x=>x.payee_id===b).line.net_amount,11000);assert.deepEqual((await month('2027-10-01')).rows.find(x=>x.payee_id===a).line,aPaid.line);
  await manage('rate',{id:randomUUID(),payee_id:a,monthly_amount:19000,effective_from:'2027-11-01',reason:'Future rate'});assert.deepEqual((await month('2027-10-01')).rows.find(x=>x.payee_id===a).line,aPaid.line);
  await reject(()=>manage('rate',{id:randomUUID(),payee_id:a,monthly_amount:16000,effective_from:'2027-10-15',reason:'Backdate'}),/APPROVED_HISTORY/);
  await reject(async()=>command('reload','2027-10-01',[await item(a)]),/LINE_FROZEN/);
 });
 await scenario('C atomic two payees, one invalid rolls back container/freezes/obligations/cash, separate Statement facts',async()=>{
  const a=await person('employee'),b=await person();const inputs=[await payItem(a,'2027-10-01',{facts:facts(200,{employee_ss:5,employer_ss:5})}),await payItem(b,'2027-10-01',{facts:facts(220)})];
  const state=await scalar(A.snapshot());await reject(()=>command('pay','2027-10-01',[inputs[0],{...inputs[1],destination_id:randomUUID()}]),/DESTINATION_REQUIRED/);assert.deepEqual((await scalar(A.snapshot())).rows,state.rows);
  await command('pay','2027-10-01',inputs);await payout.flush();const cash=await query('select cash_amount from finance_cash_transactions where source_payout_id in ($1,$2) order by cash_amount',inputs.map(x=>x.payout_id));assert.deepEqual(cash.map(x=>x.cash_amount),[195,220]);
  assert.equal(await scalar('select count(*) from finance_payroll_obligations where line_id in (select id from finance_payroll_lines where period_id=(select id from finance_payroll_periods where month=$1))',['2027-10-01']),2);
 });
 await scenario('partial amount/reason guards, source refresh only unfinished, per-line optimistic concurrency',async()=>{
  const a=await person('contractor','2027-10-04'),b=await person();const input=await item(a);await reject(()=>command('pay','2027-10-01',[{...input,facts:facts(10000,{adjustment_reason:''})}]),/BASE_REASON_REQUIRED/);
  await command('save','2027-10-01',[{...input,facts:facts(10000)}]);const aOld=await item(a);await command('save','2027-10-01',[await item(b,'2027-10-01',{facts:facts()})]);await command('save','2027-10-01',[{...aOld,facts:facts(11000)}]);await reject(()=>command('save','2027-10-01',[{...aOld,facts:facts(12000)}]),/LINE_STALE/);
  await manage('rate',{id:randomUUID(),payee_id:a,monthly_amount:16000,effective_from:'2027-10-15',reason:'Draft change'});const stale=await item(a);await reject(()=>command('save','2027-10-01',[{...stale,facts:facts()}]),/SOURCE_CHANGED/);await command('reload','2027-10-01',[stale]);const row=(await month('2027-10-01')).rows.find(x=>x.payee_id===a);assert.equal(row.line.reviewed,false);assert.equal(row.line.base_amount,0);assert.equal(row.state,'amount_required');
 });
 await scenario('Contractor rejects social security, missing facts fail closed, no prepare cash on save',async()=>{
  const a=await person(),input=await item(a);await reject(()=>command('save','2027-10-01',[{...input,facts:facts(15000,{employee_ss:100})}]),/check constraint/);await reject(()=>command('save','2027-10-01',[{...input,facts:{base_amount:15000}}]),/FACTS_REQUIRED/);const count=await scalar('select count(*) from finance_cash_transactions');await command('save','2027-10-01',[{...input,facts:facts()}]);assert.equal(await scalar('select count(*) from finance_cash_transactions'),count);
 });
 await scenario('Admin-only RPC/private resolver, generic roles cannot inspect salary',async()=>{
  const a=await person();for(const role of ['partner','staff','admin']){await query('update user_profiles set role=$1,active=$2 where id=$3',[role,role!=='admin',a]);await query("select set_config('test.actor',$1,true)",[a]);await reject(()=>month('2027-10-01'),/ADMIN_REQUIRED/);await reject(()=>command('pay','2027-10-01',[]),/ADMIN_REQUIRED/);}await query("select set_config('test.actor',$1,true)",[ids.admin]);for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("select has_function_privilege($1,'payroll091_source(date,uuid)','execute')",[role]),false);
 });
 await scenario('account/cutoff rejection rolls back selected line and obligations; confirmed line immutable',async()=>{
  const a=await person('employee'),b=await person(),inputs=[await payItem(a,'2027-10-01',{facts:facts(15000,{employee_ss:750,employer_ss:750})}),await payItem(b,'2027-10-01',{facts:facts()})];
  const baseline=await scalar(A.snapshot());await reject(()=>command('pay','2027-10-01',[inputs[0],{...inputs[1],paid_on:'2000-01-01'}]),/BEFORE_CUTOVER/);assert.deepEqual((await scalar(A.snapshot())).rows,baseline.rows);
  await reject(()=>command('pay','2027-10-01',[inputs[0],{...inputs[1],bank_account_id:randomUUID()}]),/ACCOUNT_DENIED/);assert.deepEqual((await scalar(A.snapshot())).rows,baseline.rows);
  await command('pay','2027-10-01',inputs);await payout.flush();const l=(await month('2027-10-01')).rows.find(r=>r.payee_id===a).line;
  await reject(()=>query('update finance_payroll_lines set note=$1 where id=$2',['tampered',l.id]),/LINE_FROZEN/);
  const statement=await scalar('select get_finance_account_statement($1,null,$2,$3)',[ids.bank,'2027-10-28','2027-10-28']);assert.equal(statement.count,2);assert.deepEqual(statement.rows.map(r=>Number(r.cash_amount)).sort((a,b)=>a-b),[14250,15000]);assert.doesNotMatch(JSON.stringify(statement),/employee_ss|employer_ss|base_amount|source_json/);
 });
 await scenario('Office Cash retains existing no-bank-destination behavior; bank transfer still rejects missing destination',async()=>{
  const a=await person('contractor','2027-10-01',false),cash=await scalar("select id from finance_cash_locations where code='office_cash'");
  await require('./treasury-postgres.test.cjs').opening({bank:null,cash,amount:20000});const i=await payItem(a,'2027-10-01',{facts:facts()});
  await reject(()=>command('pay','2027-10-01',[i]),/DESTINATION_REQUIRED/);
  await command('pay','2027-10-01',[{...i,bank_account_id:null,cash_location_id:cash}]);await payout.flush();assert.equal(await scalar('select cash_location_id from finance_cash_transactions where source_payout_id=$1',[i.payout_id]),cash);
 });
 await scenario('existing draft promotes to container without rewriting other people; zero net has obligations but no cash',async()=>{
  const a=await person(),pid=randomUUID();await manage('create_period',{id:pid,month:'2027-10-01',target_payment_date:'2027-10-31'});
  const prior=await query('select * from finance_payroll_lines where period_id=$1 and payee_id<>$2 order by id',[pid,a]);
  const cash=await scalar('select count(*) from finance_cash_transactions');await command('pay','2027-10-01',[await payItem(a,'2027-10-01',{facts:facts(15000,{deductions:15000})})]);await payout.flush();
  assert.equal(await scalar('select status from finance_payroll_periods where id=$1',[pid]),'open');assert.deepEqual(await query('select * from finance_payroll_lines where period_id=$1 and payee_id<>$2 order by id',[pid,a]),prior);assert.equal(await scalar('select count(*) from finance_cash_transactions'),cash);assert.equal((await month('2027-10-01')).rows.find(r=>r.payee_id===a).state,'settled_zero');
  await reject(()=>manage('approve',{period_id:pid,version:3,acknowledged:true}),/STALE_OR_FROZEN/);
 });
 const after=await scalar(A.snapshot());assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);assert.deepEqual(after.functions,A.after().functions);assert.deepEqual(after.tables,A.after().tables);await db.exec('set local enable_hashagg=off');assert.deepEqual(await scalar(A.snapshot()),after);await db.exec('rollback');
 // Separate connections prove concurrent retries at the new parent transaction,
 // not merely at the reused payout child. Synthetic committed rows stay local.
 await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);const a=await person(),b=await person();
 const inputs=[await payItem(a,'2027-10-01',{facts:facts(200)}),await payItem(b,'2027-10-01',{facts:facts(220)})];await db.exec('commit');
 const {PGlite}=require('./finance-authority-pg-adapter.cjs'),c1=new PGlite(),c2=new PGlite(),request=randomUUID();
 try{for(const c of [c1,c2]){await c.query("select set_config('test.actor',$1,false)",[ids.admin]);await c.exec('set role authenticated');}
  const results=await Promise.all([c1.query("select payroll091_manage('pay','2027-10-01',$1,$2,true)",[inputs,request]),c2.query("select payroll091_manage('pay','2027-10-01',$1,$2,true)",[inputs,request])]);assert.deepEqual(results[0].rows,results[1].rows);assert.equal(await scalar('select count(*) from finance_cash_transactions where source_payout_id in ($1,$2)',inputs.map(x=>x.payout_id)),2);t.diagnostic('PASS concurrent 091 confirmations reuse one parent result; exactly two cash outflows');
 }finally{await c1.close();await c2.close();}

});
