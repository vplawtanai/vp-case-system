/* eslint-disable @typescript-eslint/no-require-imports */
require('./finance-payroll-correction-postgres.test.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const A=require('./finance-payroll-setup-artifacts.cjs');
const {db,query,scalar,ids}=require('./receipt-foundation.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {load}=require('./finance-payroll-setup-support.cjs');
const server=load('lib/server/finance-payroll.ts'),S=load('app/finance/payroll/setup.ts'),M=load('app/finance/payroll/monthly.ts');
const manage=(a,p,r=randomUUID())=>scalar('select payroll089_manage($1,$2,$3)',[a,p,r]);
const month=m=>scalar('select payroll091_month($1)',[m]);
const facts=(extra={})=>({base_amount:15000,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,adjustment_reason:'Reviewed amount',note:'Admin review',confirmed:true,...extra});
async function person(kind='employee',date='2028-10-01'){
 const id=randomUUID(),e=randomUUID(),r=randomUUID();await query("insert into user_profiles(id,role,active,full_name,must_change_password) values($1,'staff',true,'Synthetic 093',false)",[id]);await payout.payee({id,bank:true});
 await manage('engagement',{id:e,payee_id:id,kind,active:true,effective_from:date,reason:'Synthetic'});
 await manage('rate',{id:r,payee_id:id,monthly_amount:15000,effective_from:date,reason:'Synthetic'});return{id,e,r};
}
const gate=(post,pins)=>query(A.gate(post,pins).replace(/^--.*$/gm,''));
const read=()=>scalar('select payroll092_read($1)', ['2028-10-01']);
const hash=async p=>(await read()).corrections[p.id].hash;
const correct=async(p,kind,values={},request=randomUUID(),token)=>scalar('select payroll093_correct($1,$2,$3,$4,$5,$6)',[kind,p.id,kind==='rate'?p.r:p.e,token||await hash(p),{effective_from:'2028-10-01',reason:'Correct entry',...(kind==='rate'?{monthly_amount:16000}:{kind:'contractor'}),...values},request]);
const personForBrowser=person;
async function row(p,m='2028-10-01'){return(await month(m)).rows.find(x=>x.payee_id===p.id);}
async function save(p,extra={},m='2028-10-01',action='save'){
 const r=await row(p,m);return scalar('select payroll091_manage($1,$2,$3,$4,true)',[action,m,[{...M.lineIdentity(r,randomUUID()),facts:facts(extra),payee_version:r.payee_version,destination_id:r.destination?.id,payout_id:randomUUID(),bank_account_id:ids.bank,paid_on:'2028-10-28'}],randomUUID()]);
}
async function reject(fn,pattern){await db.exec('savepoint reject093');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to reject093;release reject093');}}
test('093 atomic setup correction, accepted baseline, safety and real API mutations',async t=>{
 await query("select set_config('test.actor',$1,true)",[ids.admin]);
 const before=await scalar(A.snapshot());assert.deepEqual(before.functions,A.before().functions);assert.deepEqual(before.tables,A.before().tables);
 if(process.env.CAPTURE_093_EVIDENCE){await db.exec(A.body());const after=await scalar(A.snapshot());assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);assert.deepEqual(after.tables,before.tables);fs.writeFileSync(A.contractPath,JSON.stringify({functions:Object.fromEntries(A.signatures.map(s=>[s,after.functions[s]])),tables:{}},null,2)+'\n');return;}
 const pre=(await gate(false))[0];assert.equal(pre.gate_pass,true);const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 assert.equal((await gate(true,pins))[0].gate_pass,true);assert.equal((await gate(true,{}))[0].gate_pass,false);
 for(const sql of ["update user_profiles set full_name='drift' where id='"+ids.admin+"'","alter table finance_payroll_rates add column drift text","grant execute on function payroll093_affected(text,uuid,date) to authenticated","alter function payroll091_manage(text,date,jsonb,uuid,boolean) security invoker","create function payroll093_unexpected() returns integer language sql as 'select 1'"]){await db.exec('savepoint drift093');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false);await db.exec('rollback to drift093;release drift093');}
 const scenario=async(name,fn)=>{await db.exec('savepoint scenario093');try{await fn();await payout.flush();t.diagnostic('PASS '+name);}finally{await db.exec('rollback to scenario093;release scenario093');}};
 await scenario('A/B/C same-ID same-date rate/type corrections; safe date movement; affected reviews invalidated only',async()=>{
  const p=await person(),other=await person();await save(p,{employee_ss:750,employer_ss:750});await save(other);const unchanged=await row(other),cash=await scalar('select count(*) from finance_cash_transactions');
  const oldRate=await scalar('select to_jsonb(r) from finance_payroll_rates r where id=$1',[p.r]);
  const result=await correct(p,'rate');assert.equal(result.before.monthly_amount,15000);assert.equal(result.after.monthly_amount,16000);assert.equal(result.after.id,p.r);assert.equal(result.after.created_at,oldRate.created_at);assert.equal(result.invalidated_lines.length,1);
  assert.equal((await row(p)).line,null);assert.equal((await row(p)).recurring_amount,16000);assert.deepEqual(await row(other),unchanged);
  await correct(p,'engagement');assert.equal((await row(p)).kind,'contractor');await save(p,{wht_treatment:'withhold',wht_amount:450});assert.equal((await row(p)).line.employee_ss,0);
  await correct(p,'engagement',{kind:'employee'});assert.equal((await row(p)).kind,'employee');assert.equal((await row(p)).line,null);
  await correct(p,'rate',{effective_from:'2028-10-04'});assert.equal((await row(p)).source.requires_base_review,true);
  await correct(p,'engagement',{kind:'employee',effective_from:'2028-10-04'});assert.equal((await row(p)).source.service_from,'2028-10-04');
  assert.equal(await scalar('select count(*) from finance_payroll_rates where payee_id=$1',[p.id]),1);assert.equal(await scalar('select count(*) from finance_cash_transactions'),cash);
 });
 await scenario('D/E every frozen/payment/obligation dependency fails closed; future rate does not rewrite paid October',async()=>{
  const p=await person();await save(p,{employee_ss:750,employer_ss:750},'2028-10-01','pay');const old=await row(p);
  for(const kind of ['rate','engagement'])await reject(()=>correct(p,kind),/SETUP_FINALIZED/);
  await manage('rate',{id:randomUUID(),payee_id:p.id,monthly_amount:18000,effective_from:'2028-11-01',reason:'Future increase'});
  assert.deepEqual(await row(p),old);assert.equal((await row(p,'2028-11-01')).recurring_amount,18000);
  const q=await person();await save(q);const l=(await row(q)).line;
  await db.exec('savepoint obligation093');await query("insert into finance_payroll_obligations(period_id,line_id,kind,amount,source_json) values($1,$2,'employee_ss',1,'{}')",[l.period_id,l.id]);
  await reject(()=>correct(q,'rate'),/SETUP_FINALIZED/);await reject(()=>correct(q,'engagement'),/SETUP_FINALIZED/);await db.exec('rollback to obligation093;release obligation093');
 });
 await scenario('F/G/H/I future append, both type directions; reject mid-month before writing; start/end mid-month retained',async()=>{
  const p=await person();const snapshot=await scalar('select payroll092_state($1)',[p.id]);
  await reject(()=>manage('engagement',{id:randomUUID(),payee_id:p.id,kind:'contractor',active:true,effective_from:'2028-10-16',reason:'Real change'}),/TYPE_MONTH_BOUNDARY_REQUIRED/);
  assert.deepEqual(await scalar('select payroll092_state($1)',[p.id]),snapshot);
  await manage('engagement',{id:randomUUID(),payee_id:p.id,kind:'contractor',active:true,effective_from:'2028-11-01',reason:'Future'});assert.equal((await row(p,'2028-11-01')).kind,'contractor');assert.equal((await row(p)).kind,'employee');
  await reject(()=>manage('engagement',{id:randomUUID(),payee_id:p.id,kind:'employee',active:true,effective_from:'2028-11-16',reason:'Real change'}),/TYPE_MONTH_BOUNDARY_REQUIRED/);
  const q=await person('employee','2028-10-04');assert.equal((await row(q)).source.requires_base_review,true);
  await manage('engagement',{id:randomUUID(),payee_id:q.id,kind:'employee',active:false,effective_from:'2028-10-16',reason:'End relationship'});assert.equal((await row(q)).source.service_to,'2028-10-15');
 });
 await scenario('collision, malformed facts, stale state, retry, direct updates and audit failure rollback',async()=>{
  const p=await person(),request=randomUUID(),token=await hash(p),result=await correct(p,'rate',{},request,token);
  assert.deepEqual(await correct(p,'rate',{},request,token),result);await reject(()=>correct(p,'rate',{monthly_amount:17000},request,token),/RETRY_CHANGED/);
  await reject(()=>correct(p,'engagement',{},randomUUID(),token),/CORRECTION_STALE/);
  for(const values of [{monthly_amount:0},{monthly_amount:-1},{reason:''},{effective_from:'2028-02-30'},{effective_from:'infinity'}])await reject(()=>correct(p,'rate',values),/SETUP_INVALID/);
  await manage('rate',{id:randomUUID(),payee_id:p.id,monthly_amount:18000,effective_from:'2028-11-01',reason:'Future'});
  await reject(()=>correct(p,'rate',{effective_from:'2028-11-01'}),/EFFECTIVE_DATE_COLLISION/);
  await reject(()=>manage('rate',{id:randomUUID(),payee_id:p.id,monthly_amount:17000,effective_from:'2028-10-01',reason:'Duplicate'}),/EFFECTIVE_DATE_COLLISION/);
  await query("select set_config('vp.payroll093_request',$1,true)",[request]);await reject(()=>query('update finance_payroll_rates set monthly_amount=999 where id=$1',[p.r]),/HISTORY_IMMUTABLE/);
  const state=await scalar(A.snapshot());await db.exec("create function fail093() returns trigger language plpgsql as $$begin raise exception 'audit_failure';end$$;create trigger fail093 before insert on finance_payroll_audit for each row execute function fail093();");
  await reject(()=>correct(p,'rate'),/audit_failure/);assert.deepEqual((await scalar(A.snapshot())).rows,state.rows);
 });
 await scenario('finalized secondary rate interval and changed predecessor month stay protected',async()=>{
  const p=await person(),secondary=randomUUID();await manage('rate',{id:secondary,payee_id:p.id,monthly_amount:17000,effective_from:'2028-10-15',reason:'New rate'});
  await save(p,{},'2028-10-01','pay');await reject(()=>correct({...p,r:secondary},'rate',{effective_from:'2028-10-15'}),/SETUP_FINALIZED/);
  const q=await person();await save(q,{},'2028-10-01','pay');const future=randomUUID();await manage('rate',{id:future,payee_id:q.id,monthly_amount:18000,effective_from:'2028-11-01',reason:'Future'});
  await reject(()=>correct({...q,r:future},'rate',{effective_from:'2028-10-20'}),/SETUP_FINALIZED/);
 });
 await scenario('Active Admin only; unchanged 091 money and 092 reset/delete after correction',async()=>{
  const p=await person();for(const actor of [ids.staff,randomUUID()]){await query("select set_config('test.actor',$1,true)",[actor]);await reject(()=>correct(p,'rate'),/ADMIN_REQUIRED/);}await query("select set_config('test.actor',$1,true)",[ids.admin]);
  for(const role of ['anon','authenticated','service_role']){assert.equal(await scalar("select has_table_privilege($1,'finance_payroll_rates','UPDATE')",[role]),false);assert.equal(await scalar("select has_function_privilege($1,'payroll093_affected(text,uuid,date)','EXECUTE')",[role]),false);}
  await correct(p,'rate');await save(p,{base_amount:16000,additions:500,deductions:100,employee_ss:600,employer_ss:700,wht_treatment:'withhold',wht_amount:200});assert.equal((await row(p)).line.net_amount,15600);
  const r=await row(p);await scalar('select payroll092_correct($1,$2,$3,$4,$5,$6)',['line',p.id,r.line.id,await hash(p),'Reset review',randomUUID()]);assert.equal((await row(p)).line,null);
  await save(p,{},'2028-10-01','pay');assert.equal((await row(p)).state,'paid');assert.equal(await scalar('select count(*) from finance_cash_transactions where source_payout_id=$1',[(await row(p)).payment.id]),1);
  await reject(async()=>scalar('select payroll092_correct($1,$2,$3,$4,$5,$6)',['setup',p.id,null,await hash(p),'Wrong',randomUUID()]),/CORRECTION_FINALIZED/);
 });
 await scenario('application modal intent → actual server → actual RPC → reread corrected/future values',async()=>{
  const p=await person();
  const caller={auth:{getUser:async()=>({data:{user:{id:ids.admin}}})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{role:'admin',active:true,must_change_password:false}})};return q;},rpc:async(name,args)=>{
   if(name==='people_admin_get_users')return{data:[]};
   await db.exec('savepoint api093');try{const entries=Object.entries(args),data=await scalar(`select public.${name}(${entries.map(([k],i)=>`${k}:=$${i+1}`).join(',')})`,entries.map(([,v])=>v));await db.exec('release api093');return{data};}catch(error){await db.exec('rollback to api093;release api093');return{error};}
  }};
  const request=async(body,month='2028-10-01')=>{const r=await server.handlePayrollRequest(new Request('https://local.invalid/api/finance/payroll?month='+month,{method:body?'POST':'GET',headers:{Origin:'https://local.invalid'},...(body?{body:JSON.stringify({...body,request_id:body.request_id||randomUUID()})}:{})}),{caller});return{status:r.status,data:await r.json()};};
  let data=(await request()).data;let uiPerson=data.people.find(x=>x.id===p.id);
  for(const kind of ['rate','engagement']){
   const change=S.setupChange({kind,intent:'correct',person:uiPerson,target:S.setupTarget(uiPerson,kind,'2028-10-01'),values:{effective_from:'2028-10-01',reason:'UI reviewed',...(kind==='rate'?{monthly_amount:16000}:{kind:'contractor'})},hash:data.corrections[p.id].hash,id:randomUUID()});
   const response=await request(change);assert.equal(response.status,200,JSON.stringify(response));data=(await request()).data;uiPerson=data.people.find(x=>x.id===p.id);
  }
  assert.equal(uiPerson.rates[0].monthly_amount,16000);assert.equal(data.monthly.rows.find(x=>x.payee_id===p.id).kind,'contractor');
  const future=S.setupChange({kind:'rate',intent:'future',person:uiPerson,target:uiPerson.rates[0],values:{effective_from:'2028-11-01',monthly_amount:18000,reason:'Future'},id:randomUUID()});assert.equal((await request(future)).status,200);assert.equal((await row(p,'2028-11-01')).recurring_amount,18000);
  const bad=S.setupChange({kind:'engagement',intent:'future',person:uiPerson,target:uiPerson.engagements[0],values:{effective_from:'2028-10-16',kind:'employee',reason:'Midmonth'},id:randomUUID()});const denied=await request(bad);assert.equal(denied.data.error,'PAYROLL_TYPE_MONTH_BOUNDARY_REQUIRED');
  assert.notEqual(S.setupError('th',denied.data.error),null);assert.notEqual(S.setupError('en',denied.data.error),null);
  if(process.env.VP093_BROWSER){const browserPerson=await personForBrowser();await require('./finance-payroll-setup-browser.cjs').checkBrowser(request,browserPerson.id);}
 });
});
