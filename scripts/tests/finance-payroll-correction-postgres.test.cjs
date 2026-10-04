/* eslint-disable @typescript-eslint/no-require-imports */
require('./finance-payroll-monthly-postgres.test.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const A=require('./finance-payroll-correction-artifacts.cjs');
const {db,query,scalar,ids}=require('./receipt-foundation.test.cjs'),payout=require('./payout-postgres.test.cjs');
const manage=(a,p,r=randomUUID())=>scalar('select payroll089_manage($1,$2,$3)',[a,p,r]);
const month=m=>scalar('select payroll091_month($1)',[m]);
const command=(a,m,items,r=randomUUID())=>scalar('select payroll091_manage($1,$2,$3,$4,true)',[a,m,items,r]);
const facts=(extra={})=>({base_amount:15000,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,adjustment_reason:'Explicit amount',note:'Admin review',confirmed:true,...extra});
async function person(kind='contractor'){const id=randomUUID();await query("insert into user_profiles(id,role,active,full_name,must_change_password) values($1,'staff',true,'Synthetic 092',false)",[id]);await payout.payee({id,bank:true});const e=randomUUID(),r=randomUUID();await manage('engagement',{id:e,payee_id:id,kind,active:true,effective_from:'2028-10-01',reason:'Synthetic'});await manage('rate',{id:r,payee_id:id,monthly_amount:15000,effective_from:'2028-10-01',reason:'Synthetic'});return{id,e,r};}
async function item(id,m='2028-10-01',extra={}){const r=(await month(m)).rows.find(x=>x.payee_id===id);return{payee_id:id,line_id:r.line?.id||randomUUID(),line_hash:r.line_hash,source_hash:r.source_hash,payee_version:r.payee_version,destination_id:r.destination?.id,...extra};}
const read=()=>scalar("select payroll092_read()->'corrections'");
async function correct(a,id,target=null,request=randomUUID(),hash){return scalar('select payroll092_correct($1,$2,$3,$4,$5,$6)',[a,id,target,hash||(await read())[id].hash,'Entered in error',request]);}
async function reject(fn,pattern){await db.exec('savepoint reject092');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to reject092;release reject092');}}
const gate=(post,pins)=>query(A.gate(post,pins).replace(/^--.*$/gm,''));
test('092 safe correction gate, atomic preservation, deletion boundary and 091 payment regression',async t=>{
 await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 const before=await scalar(A.snapshot());assert.deepEqual(before.functions,A.before().functions);assert.deepEqual(before.tables,A.before().tables);
 if(process.env.CAPTURE_092_EVIDENCE){await db.exec(A.body());const after=await scalar(A.snapshot());assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);assert.deepEqual(after.tables,before.tables);fs.writeFileSync(A.contractPath,JSON.stringify({functions:Object.fromEntries(A.signatures.map(s=>[s,after.functions[s]])),tables:{}},null,2)+'\n');await db.exec('rollback');return;}
 const pre=(await gate(false))[0];assert.equal(pre.gate_pass,true);const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 assert.equal((await gate(true,pins))[0].gate_pass,true);assert.equal((await gate(true,{}))[0].gate_pass,false);
 for(const sql of ["update user_profiles set full_name='drift' where id='"+ids.admin+"'","alter table finance_payroll_lines add column drift text","grant execute on function payroll092_state(uuid) to authenticated","alter function payroll091_manage(text,date,jsonb,uuid,boolean) security invoker","create table public.unexpected092(id integer)"]){await db.exec('savepoint drift092');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false,sql);await db.exec('rollback to drift092;release drift092');}
 const scenario=async(name,fn)=>{await db.exec('savepoint scenario092');try{await fn();await payout.flush();t.diagnostic('PASS '+name);}finally{await db.exec('rollback to scenario092;release scenario092');}};
 await scenario('A/G setup deletion preserves shared person/payee/bank, audit, exact retries and recreation',async()=>{
  const p=await person(),state=await scalar("select jsonb_build_object('profile',(select to_jsonb(x) from user_profiles x where id=$1),'payee',(select to_jsonb(x) from finance_payees x where id=$1),'dest',(select to_jsonb(x) from finance_payee_destinations x where payee_id=$1))",[p.id]);
  const request=randomUUID(),hash=(await read())[p.id].hash,result=await correct('setup',p.id,null,request,hash);
  assert.equal(await scalar('select count(*) from finance_payroll_engagements where payee_id=$1',[p.id]),0);assert.equal(await scalar('select count(*) from finance_payroll_rates where payee_id=$1',[p.id]),0);
  assert.deepEqual(await correct('setup',p.id,null,request,hash),result);await reject(()=>correct('rate',p.id,p.r,request,hash),/RETRY_CHANGED/);
  assert.equal(await scalar('select count(*) from finance_payroll_audit where request_id=$1',[request]),1);
  assert.deepEqual(await scalar("select jsonb_build_object('profile',(select to_jsonb(x) from user_profiles x where id=$1),'payee',(select to_jsonb(x) from finance_payees x where id=$1),'dest',(select to_jsonb(x) from finance_payee_destinations x where payee_id=$1))",[p.id]),state);
  await manage('engagement',{id:randomUUID(),payee_id:p.id,kind:'employee',active:true,effective_from:'2028-10-01',reason:'Correct setup'});
  await manage('rate',{id:randomUUID(),payee_id:p.id,monthly_amount:16000,effective_from:'2028-10-01',reason:'Correct rate'});
 });
 await scenario('B/C/I delete wrong rate and dependent unfinished line; reset and recreate; next month recurring',async()=>{
  const p=await person();await command('save','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts({base_amount:10000,additions:500,deductions:100})})]);
  const line=(await month('2028-10-01')).rows.find(x=>x.payee_id===p.id).line;
  await correct('line',p.id,line.id);assert.equal((await month('2028-10-01')).rows.find(x=>x.payee_id===p.id).line,null);
  await command('save','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts({base_amount:12000})})]);
  assert.equal((await month('2028-11-01')).rows.find(x=>x.payee_id===p.id).recurring_amount,15000);
  await correct('rate',p.id,p.r);assert.equal(await scalar('select count(*) from finance_payroll_lines where payee_id=$1',[p.id]),0);
  await manage('rate',{id:randomUUID(),payee_id:p.id,monthly_amount:17000,effective_from:'2028-10-01',reason:'Correct rate'});
  assert.equal((await month('2028-10-01')).rows.find(x=>x.payee_id===p.id).recurring_amount,17000);
 });
 await scenario('D/E/F/H/K frozen/paid/obligation reference denied; atomic separate 091 payment and future history',async()=>{
  const a=await person('employee'),b=await person();const pay=async p=>item(p.id,'2028-10-01',{facts:facts(p.id===a.id?{employee_ss:750,employer_ss:750}:{}),payout_id:randomUUID(),bank_account_id:ids.bank,paid_on:'2028-10-28'});
  const batch=[await pay(a),await pay(b)],snap=await scalar(A.snapshot());await reject(()=>command('pay','2028-10-01',[batch[0],{...batch[1],destination_id:randomUUID()}]),/DESTINATION_REQUIRED/);assert.deepEqual((await scalar(A.snapshot())).rows,snap.rows);
  await command('pay','2028-10-01',batch);await payout.flush();assert.deepEqual((await query('select cash_amount from finance_cash_transactions where source_payout_id in ($1,$2) order by cash_amount',batch.map(x=>x.payout_id))).map(x=>x.cash_amount),[14250,15000]);
  const old=(await month('2028-10-01')).rows.find(x=>x.payee_id===a.id).line;
  for(const [action,target]of [['setup',null],['rate',a.r],['line',old.id]])await reject(()=>correct(action,a.id,target),/CORRECTION_FINALIZED/);
  await manage('rate',{id:randomUUID(),payee_id:a.id,monthly_amount:19000,effective_from:'2028-11-01',reason:'Future'});assert.deepEqual((await month('2028-10-01')).rows.find(x=>x.payee_id===a.id).line,old);
  const future=(await scalar('select id from finance_payroll_rates where payee_id=$1 and effective_from=$2',[a.id,'2028-11-01']));await correct('rate',a.id,future);assert.deepEqual((await month('2028-10-01')).rows.find(x=>x.payee_id===a.id).line,old);
 });
 await scenario('F final secondary mid-month rate interval cannot be removed',async()=>{
  const p=await person(),second=randomUUID();await manage('rate',{id:second,payee_id:p.id,monthly_amount:18000,effective_from:'2028-10-15',reason:'Midmonth'});
  await command('pay','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts(),payout_id:randomUUID(),bank_account_id:ids.bank,paid_on:'2028-10-28'})]);await payout.flush();await reject(()=>correct('rate',p.id,second),/CORRECTION_FINALIZED/);
 });
 await scenario('D/F frozen without payment, statutory reference alone and cancelled payout references remain protected',async()=>{
  const p=await person('employee');await command('save','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts()})]);const l=(await month('2028-10-01')).rows.find(x=>x.payee_id===p.id).line;
  await db.exec('savepoint dependency092');
  await query("insert into finance_payroll_obligations(period_id,line_id,kind,amount,source_json) values($1,$2,'employee_ss',1,'{}')",[l.period_id,l.id]);
  await reject(()=>correct('line',p.id,l.id),/CORRECTION_FINALIZED/);await db.exec('rollback to dependency092;release dependency092');
  await db.exec('savepoint frozen092');await query("update finance_payroll_lines set frozen_json=to_jsonb(finance_payroll_lines)-'frozen_json' where id=$1",[l.id]);await reject(()=>correct('line',p.id,l.id),/CORRECTION_FINALIZED/);await db.exec('rollback to frozen092;release frozen092');
  // Simulate a malformed source-link state inside a rollback-only savepoint.
  // Even before deferred integrity fires, the deletion guard must fail closed.
  await db.exec('savepoint payout092');const pid=randomUUID();
  await query("insert into finance_payouts(id,source_model,payee_id,paid_on,bank_account_id,choices_json,gross_amount,wht_amount,net_amount,created_by,updated_by) values($1,'payroll_v1',$2,'2028-10-28',$3,$4,15000,0,15000,$5,$5)",[pid,p.id,ids.bank,[{line_id:l.id,payee_id:p.id,net:15000}],ids.admin]);
  await query("insert into finance_payroll_payments(payout_id,line_id,status,prepare_json) values($1,$2,'cancelled','{}')",[pid,l.id]);
  assert.equal(await scalar('select payroll092_line_safe($1)',[l.id]),false);await reject(()=>correct('line',p.id,l.id),/CORRECTION_FINALIZED/);await reject(()=>correct('setup',p.id),/CORRECTION_FINALIZED/);await db.exec('rollback to payout092;release payout092');
  await command('pay','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts({base_amount:0})})]);await payout.flush();await reject(()=>correct('line',p.id,l.id),/CORRECTION_FINALIZED/);
 });
 await scenario('J stale/forged permit/direct delete denied; Contractor SS rejected; no cash on save',async()=>{
  const p=await person(),hash=(await read())[p.id].hash;await command('save','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts()})]);await reject(()=>correct('setup',p.id,null,randomUUID(),hash),/CORRECTION_STALE/);
  await reject(()=>command('save','2028-10-01',[]),/INPUT_INVALID/);
  await reject(async()=>command('save','2028-10-01',[await item(p.id,'2028-10-01',{facts:facts({employee_ss:1})})]),/check constraint/);
  await query("select set_config('vp.payroll092_request',$1,true)",[randomUUID()]);await reject(()=>query('delete from finance_payroll_rates where id=$1',[p.r]),/HISTORY_IMMUTABLE/);
  for(const actor of [randomUUID(),ids.staff]){await query("select set_config('test.actor',$1,true)",[actor]);await reject(()=>read(),/ADMIN_REQUIRED/);await reject(()=>correct('setup',p.id,null,randomUUID(),hash),/ADMIN_REQUIRED/);}await query("select set_config('test.actor',$1,true)",[ids.admin]);
  for(const role of ['anon','authenticated','service_role']){assert.equal(await scalar("select has_table_privilege($1,'finance_payroll_lines','DELETE')",[role]),false);assert.equal(await scalar("select has_function_privilege($1,'payroll092_state(uuid)','EXECUTE')",[role]),false);}
 });
 await db.exec('commit');
});
