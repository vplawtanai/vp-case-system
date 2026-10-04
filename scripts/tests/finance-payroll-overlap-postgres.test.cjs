/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL only. Reuse the accepted 089 installation + targeted payout
// regressions, then test 090 with synthetic People in rolled-back savepoints.
require('./finance-payroll-postgres.test.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const A=require('./finance-payroll-overlap-artifacts.cjs'),P=require('./finance-payroll-artifacts.cjs');
const {db,query,scalar,ids}=require('./receipt-foundation.test.cjs'),payout=require('./payout-postgres.test.cjs');
const manage=(action,payload,request=randomUUID())=>scalar('select payroll089_manage($1,$2,$3)',[action,payload,request]);
const read=id=>scalar('select payroll089_read($1)',[id||null]);
const gate=(post,pins)=>query(A.gate(post,pins).replace(/^--.*$/gm,''));
async function reject(fn,pattern){await db.exec('savepoint rejected090');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to rejected090;release rejected090');}}
async function person({start='2027-01-01',end,rateStart='2027-01-01',second,kind='contractor',amount=15000}={}){
 const id=randomUUID();await query("insert into user_profiles(id,role,active,full_name,must_change_password) values($1,'staff',true,'Synthetic 090 person',false)",[id]);await payout.payee({id});
 await manage('engagement',{id:randomUUID(),payee_id:id,kind,active:true,effective_from:start,reason:'Synthetic engagement'});
 if(end)await manage('engagement',{id:randomUUID(),payee_id:id,kind,active:false,effective_from:end,reason:'Synthetic end'});
 if(rateStart)await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:amount,effective_from:rateStart,reason:'Synthetic rate'});
 if(second)await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:23000,effective_from:second,reason:'Synthetic raise'});
 return id;
}
async function draft(month='2027-01-01'){const id=randomUUID();await manage('create_period',{id,month,target_payment_date:'2027-01-31'});return id;}
async function reviewAll(id){let d=await read(id);for(const l of d.lines){const p=d.periods.find(p=>p.id===id);await manage('line',{period_id:id,version:p.version,line_id:l.id,base_amount:l.requires_base_review?12000:l.base_amount,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,adjustment_reason:l.requires_base_review?'Admin explicitly reviewed the amount; no proration':'',note:'Reviewed synthetic evidence'});d=await read(id);}return d;}
async function approve(id){const d=await read(id);return manage('approve',{period_id:id,version:d.periods.find(p=>p.id===id).version,acknowledged:true});}
test('090 overlap, review, historical preservation and accepted Finance contracts',async t=>{
 await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 const before=await scalar(A.snapshot());assert.deepEqual(before.functions,A.before().functions);assert.deepEqual(before.tables,A.before().tables);
 if(process.env.CAPTURE_090_EVIDENCE){await db.exec(A.body());const state=await scalar(A.snapshot());assert.deepEqual(state.tables,before.tables);assert.deepEqual(state.rows,before.rows);assert.deepEqual(state.preserved,before.preserved);
  fs.writeFileSync(A.contractPath,JSON.stringify({source_sha256:state.functions[A.signature]},null,2)+'\n');await db.exec('rollback');return;}
 const pre=(await gate(false))[0];assert.equal(pre.gate_pass,true,JSON.stringify(pre));const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await db.exec('set local enable_hashagg=off');assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');await query("select set_config('test.actor',$1,true)",[ids.admin]);
 const after=await scalar(A.snapshot());assert.deepEqual(after.functions,A.after().functions);assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);
 assert.equal((await gate(true,pins))[0].gate_pass,true);assert.equal((await gate(true,{}))[0].gate_pass,false);
 for(const sql of ["update user_profiles set full_name='unexpected' where id='"+ids.admin+"'","alter table finance_payroll_rates add column unexpected text","grant execute on function payroll089_sources(date) to authenticated","alter function finance_expense_payout_batch(text,jsonb,boolean) security invoker","create table public.unrelated_drift(id integer)"]){await db.exec('savepoint drift090');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false,sql);await db.exec('rollback to drift090;release drift090');}
 t.diagnostic('PASS exact accepted pins, rollback/preservation incl. existing Payroll rows, deterministic fingerprints, unbound/drift fail closed');
 // Each scenario has its own savepoint; existing approved 089 facts stay in place.
 const scenario=async(name,fn)=>{await db.exec('savepoint scenario090');try{await fn();t.diagnostic('PASS '+name);}finally{await db.exec('rollback to scenario090;release scenario090');}};
 await scenario('full month unchanged amount, no special review flag',async()=>{
  const id=await person(),period=await draft(),l=(await read(period)).lines.find(l=>l.payee_id===id);assert.equal(l.base_amount,15000);assert.equal(l.requires_base_review,false);assert.deepEqual(l.source_json.manual_review_reasons,[]);
 });
 await scenario('first mid-month rate: draft zero placeholder, review then approval, source evidence frozen, no approval cash',async()=>{
  const id=await person({start:'2027-09-01',rateStart:'2027-10-04'}),period=await draft('2027-10-01');let l=(await read(period)).lines.find(l=>l.payee_id===id);
  assert.equal(l.base_amount,0);assert.equal(l.reviewed,false);assert.equal(l.requires_base_review,true);assert.equal(l.source_json.rate.monthly_amount,15000);assert.deepEqual(l.source_json.manual_review_reasons,['rate_starts_after_service_start']);
  assert.equal(l.source_json.rate_intervals[0].overlap_from,'2027-10-04');assert.equal(l.source_json.rate_intervals[0].overlap_to,'2027-10-31');
  await reject(()=>approve(period),/REVIEW_REQUIRED/);
  const p=(await read(period)).periods.find(p=>p.id===period);await reject(()=>manage('line',{period_id:period,version:p.version,line_id:l.id,base_amount:12000,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,note:'Reviewed'}),/BASE_REASON_REQUIRED/);
  const cashBefore=await scalar('select count(*) from finance_cash_transactions');await reviewAll(period);await approve(period);await payout.flush();l=(await read(period)).lines.find(l=>l.payee_id===id);
  assert.equal(l.base_amount,12000);assert.equal(l.reviewed,true);assert.equal(l.frozen_json.base_amount,12000);assert.deepEqual(l.frozen_json.source_json,l.source_json);assert.equal(await scalar('select count(*) from finance_cash_transactions'),cashBefore);
  await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:18000,effective_from:'2027-11-01',reason:'Future increase'});assert.deepEqual((await read(period)).lines.find(l=>l.payee_id===id),l);
  await reject(()=>manage('line',{period_id:period,version:p.version,line_id:l.id}),/STALE_OR_FROZEN/);
 });
 await scenario('mid-month rate change, complete interval evidence, no automatic proration',async()=>{
  const id=await person({amount:20000,second:'2027-01-15'}),period=await draft(),l=(await read(period)).lines.find(l=>l.payee_id===id);
  assert.equal(l.base_amount,0);assert.equal(l.requires_base_review,true);assert.deepEqual(l.source_json.manual_review_reasons,['rate_ends_before_service_end','rate_changes_during_service']);
  assert.deepEqual(l.source_json.rate_intervals.map(x=>[x.overlap_from,x.overlap_to,x.rate.monthly_amount]),[['2027-01-01','2027-01-14',20000],['2027-01-15','2027-01-31',23000]]);
 });
 for(const [name,config,reason]of [['start',{start:'2027-01-10'},'engagement_starts_mid_month'],['end',{end:'2027-01-20'},'engagement_ends_mid_month'],['both',{start:'2027-01-05',end:'2027-01-25',rateStart:'2027-01-10'},'rate_starts_after_service_start']])await scenario('engagement '+name+' inside month',async()=>{
  const id=await person(config),period=await draft(),l=(await read(period)).lines.find(l=>l.payee_id===id);assert.equal(l.base_amount,0);assert.equal(l.requires_base_review,true);assert.ok(l.source_json.manual_review_reasons.includes(reason));
 });
 for(const config of [{rateStart:null},{rateStart:'2027-02-01'},{end:'2027-01-10',rateStart:'2027-01-10'}])await scenario('no valid rate overlap returns safe person-specific detail; entire draft rolls back',async()=>{
  const id=await person(config),before=await scalar("select count(*) from finance_payroll_periods");await reject(()=>draft(),new RegExp('PAYROLL_RATE_MISSING[\\s\\S]*'+id));assert.equal(await scalar('select count(*) from finance_payroll_periods'),before);
 });
 await scenario('reload preserves retry/version guards and invalidates earlier review',async()=>{
  const id=await person(),period=await draft();await reviewAll(period);await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:17000,effective_from:'2027-01-15',reason:'Mid-month change'});await reject(()=>approve(period),/DRAFT_SOURCES_CHANGED/);
  const d=await read(period),p=d.periods.find(p=>p.id===period),request=randomUUID(),input={period_id:period,version:p.version,acknowledged:true};const a=await manage('reload_period',input,request);assert.deepEqual(await manage('reload_period',input,request),a);
  const l=(await read(period)).lines.find(l=>l.payee_id===id);assert.equal(l.reviewed,false);assert.equal(l.base_amount,0);await reject(()=>approve(period),/REVIEW_REQUIRED/);
 });
 await scenario('Admin-only helper/RPC/RLS; no salary details exposed to other roles',async()=>{
  const id=await person();for(const role of ['staff','partner','admin']){
   await query('update user_profiles set role=$1,active=$2 where id=$3',[role,role!=='admin',id]);await query("select set_config('test.actor',$1,true)",[id]);
   await reject(()=>scalar("select payroll089_sources('2027-01-01')"),/ADMIN_REQUIRED/);await reject(()=>read(),/ADMIN_REQUIRED/);await reject(()=>draft(),/ADMIN_REQUIRED/);
  }await query("select set_config('test.actor',$1,true)",[ids.admin]);
  for(const role of ['anon','authenticated','service_role'])assert.equal(await scalar("select has_function_privilege($1,'payroll089_sources(date)','execute')",[role]),false);
 });
 await scenario('reviewed partial month pays separate net outflows; Contractor SS still prohibited',async()=>{
  const a=await person({rateStart:'2027-01-04'}),b=await person({kind:'employee',start:'2027-01-02'}),period=await draft();
  const d=await read(period),p=d.periods.find(p=>p.id===period),l=d.lines.find(l=>l.payee_id===a);
  await reject(()=>manage('line',{period_id:period,version:p.version,line_id:l.id,base_amount:12000,additions:0,deductions:0,employee_ss:100,employer_ss:100,wht_treatment:'none',wht_amount:0,adjustment_reason:'review',note:'evidence'}),/check constraint/);
  await reviewAll(period);await approve(period);
  const approved=await read(period),items=approved.lines.filter(l=>[a,b].includes(l.payee_id)).map(l=>({line_id:l.id,payout_id:randomUUID(),bank_account_id:ids.bank,cash_location_id:null,paid_on:'2027-01-31',payee_version:approved.people.find(p=>p.id===l.payee_id).version,destination_id:approved.people.find(p=>p.id===l.payee_id).destination.id}));
  await scalar("select payroll089_payment_batch('prepare',$1,$2,true)",[items,randomUUID()]);assert.equal(await scalar('select count(*) from finance_cash_transactions where source_payout_id in ($1,$2)',items.map(x=>x.payout_id)),0);
  const input=items.map(x=>({...x,payout_version:1})),request=randomUUID();const result=await scalar("select payroll089_payment_batch('confirm',$1,$2,true)",[input,request]);assert.deepEqual(await scalar("select payroll089_payment_batch('confirm',$1,$2,true)",[input,request]),result);await payout.flush();
  const cash=await query('select cash_amount from finance_cash_transactions where source_payout_id in ($1,$2)',items.map(x=>x.payout_id));assert.deepEqual(cash.map(c=>c.cash_amount),[12000,12000]);
 });
 const state=await scalar(A.snapshot());assert.deepEqual(state.functions,A.after().functions);assert.deepEqual(state.tables,A.before().tables);assert.deepEqual(state.rows,before.rows);assert.deepEqual(state.preserved,before.preserved);assert.equal(P.validate(),A.immutable089);
 await db.exec('rollback');
});
