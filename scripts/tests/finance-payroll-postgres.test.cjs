/* eslint-disable @typescript-eslint/no-require-imports */
// Private disposable PostgreSQL only. No environment files, remote SQL or real people.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const fixture=require('./finance-authority-fixture.cjs'),A=require('./finance-payroll-artifacts.cjs'),B=require('./finance-payable-bulk-artifacts.cjs');
const {db,query,scalar,ids,rpc}=require('./receipt-foundation.test.cjs');
const payout=require('./payout-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs');
const manage=(action,payload,request=randomUUID())=>scalar('select payroll089_manage($1,$2,$3)',[action,payload,request]);
const payment=(action,items,request=randomUUID(),ack=true)=>scalar('select payroll089_payment_batch($1,$2,$3,$4)',[action,items,request,ack]);
const read=id=>scalar('select payroll089_read($1)',[id||null]);
const gate=(post,pins)=>query(A.gate(post,pins).replace(/^--.*$/gm,''));
async function reject(fn,pattern){await db.exec('savepoint rejected089');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to rejected089;release rejected089');}}
async function person(kind='employee',amount=20000){
 const id=randomUUID();if(kind==='employee')await query("insert into user_profiles(id,role,active,full_name,must_change_password) values($1,'staff',true,'Synthetic employee',false)",[id]);
 await payout.payee({id,external:kind==='contractor'});
 await manage('engagement',{id:randomUUID(),payee_id:id,kind,active:true,effective_from:'2026-01-01',reason:'Synthetic engagement'});
 await manage('rate',{id:randomUUID(),payee_id:id,monthly_amount:amount,effective_from:'2026-01-01',reason:'Synthetic opening rate'});
 return id;
}
const lineInput=(period,l,patch={})=>({period_id:period.id,version:period.version,line_id:l.id,base_amount:l.base_amount,additions:0,deductions:0,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0,note:'Reviewed manual facts by synthetic accountant',...patch});
async function reviewAll(id,patch={}){let data=await read(id);for(const line of data.lines){const period=data.periods.find(p=>p.id===id);await manage('line',lineInput(period,line,patch[line.payee_id]||{}));data=await read(id);}return data;}
async function approve(id){const d=await read(id),p=d.periods.find(p=>p.id===id);return manage('approve',{period_id:id,version:p.version,acknowledged:true});}
async function prepareItems(id,lineIds){const d=await read(id);return d.lines.filter(l=>l.net_amount>0&&(!lineIds||lineIds.includes(l.id))).map(l=>{const y=d.people.find(y=>y.id===l.payee_id);return{line_id:l.id,payout_id:randomUUID(),bank_account_id:ids.bank,cash_location_id:null,paid_on:'2026-09-30',payee_version:y.version,destination_id:y.destination?.id||null};});}
const confirms=items=>items.map(x=>({line_id:x.line_id,payout_id:x.payout_id,payout_version:1,payee_version:x.payee_version,destination_id:x.destination_id}));
test('089 Payroll P1 contract, private facts and existing money integration',async t=>{
 const check=async(name,fn)=>{await fn();t.diagnostic('PASS '+name);};
 await fixture.setup();await fixture.apply();await require('./finance-payable-bulk-fixture.cjs').installAcceptedSecurity(db,query,scalar);
 await db.exec('commit');await db.exec(fs.readFileSync(B.candidate,'utf8'));await db.exec('begin');
 // Fixture-only ACL adaptation is checked against independent accepted 071/078
 // full-object pins, never exported as Production authority.
 const F=require('./finance-authority-artifacts.cjs');
 for(const [signature,expected]of Object.entries(A.extraPins)){
  let matched=false;
  for(const acl of [null,'{postgres=X/postgres,service_role=X/postgres}','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}','{postgres=X/postgres,authenticated=X/postgres}']){
   await query('update pg_proc set proacl=$1::aclitem[] where oid=to_regprocedure($2)',[acl,signature]);
   const hashes=await scalar(F.functionHashes([signature.split('(')[0]]));if(hashes[signature]===expected){matched=true;break;}
  }
  assert.ok(matched,'Independent accepted function contract must match: '+signature);
 }

 await db.exec('commit');await db.exec('begin');
 const before=await scalar(A.snapshot());assert.deepEqual(before.functions,A.before().functions);assert.deepEqual(before.tables,A.before().tables);
 await db.exec(A.body());const after=await scalar(A.snapshot());
 if(process.env.CAPTURE_089_EVIDENCE){
  const immutable={...B.contract().immutableMigrationSha256,[B.candidate]:A.sha(fs.readFileSync(B.candidate))};
  fs.writeFileSync(A.contractPath,JSON.stringify({functions:after.functions,tables:after.tables,immutableMigrationSha256:immutable},null,2)+'\n');
  console.log('Captured ONLY candidate-created object hashes from accepted-security disposable fixture.');return;
 }
 assert.deepEqual(after.functions,A.contract().functions);assert.deepEqual(after.tables,A.contract().tables);
 assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.preserved,before.preserved);
 await db.exec('rollback');await db.exec('begin');
 // 088 was committed; 089 body was rolled back.
 const pre=(await gate(false))[0];assert.equal(pre.gate_pass,true,JSON.stringify(pre));
 const pins={rows_sha256:pre.rows_sha256,preserved_sha256:pre.preserved_sha256};
 await check('accepted 088 contract, deterministic catalog and fail-closed preflight',async()=>{
  for(const sql of ["alter table finance_payouts alter column paid_on drop not null","grant select on finance_payouts to authenticated","alter function expense_integrity() security invoker"]){await db.exec('savepoint drift');await db.exec(sql);assert.equal((await gate(false))[0].gate_pass,false);await db.exec('rollback to drift;release drift');}
  await db.exec('set local enable_hashagg=off');assert.deepEqual(await scalar(A.snapshot()),before);
 });
 await db.exec('commit');await db.exec(fs.readFileSync(A.candidate,'utf8').replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.deepEqual(await scalar(A.snapshot()),before);
 await db.exec(fs.readFileSync(A.candidate,'utf8'));await db.exec('begin');
 assert.equal((await gate(true,pins))[0].gate_pass,true);assert.equal((await gate(true,{}))[0].gate_pass,false);
 await check('verifier rejects historical row, RPC, table security and field drift',async()=>{
  for(const sql of ["update user_profiles set full_name='unexpected' where id='"+ids.admin+"'","alter table finance_payroll_rates add column unexpected text","grant execute on function payroll089_read(uuid) to anon","alter function finance_expense_payout_batch(text,jsonb,boolean) security invoker"]){await db.exec('savepoint drift');await db.exec(sql);assert.equal((await gate(true,pins))[0].gate_pass,false);await db.exec('rollback to drift;release drift');}
 });
 const employee=await person(),contractor=await person('contractor',15000);
 await manage('rate',{id:randomUUID(),payee_id:employee,monthly_amount:23000,effective_from:'2026-07-01',reason:'Approved raise'});
 await reject(()=>manage('rate',{id:randomUUID(),payee_id:employee,monthly_amount:25000,effective_from:'2026-07-01',reason:'Overlap'}),/unique|duplicate/);
 let period=randomUUID();await manage('create_period',{id:period,month:'2026-06-01',target_payment_date:'2026-09-30'});
 await check('monthly draft, effective salary, independent employment and no draft cash',async()=>{
  let data=await read(period);assert.equal(data.lines.find(l=>l.payee_id===employee).base_amount,20000);
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
  await reject(()=>approve(period),/REVIEW_REQUIRED/);
  const l=data.lines.find(l=>l.kind==='contractor');await reject(()=>manage('line',lineInput(data.periods.find(p=>p.id===period),l,{employee_ss:1})),/check constraint/);
 });
 await reviewAll(period,{[employee]:{additions:2000,deductions:500,employee_ss:750,employer_ss:750,wht_treatment:'withhold',wht_amount:1000},[contractor]:{wht_treatment:'withhold',wht_amount:450}});
 const aReq=randomUUID(),ad=await read(period),ap=ad.periods.find(p=>p.id===period),aPayload={period_id:period,version:ap.version,acknowledged:true};
 await manage('approve',aPayload,aReq);await manage('approve',aPayload,aReq);
 await check('approval freezes salary/tax/SS, creates four distinct non-cash obligations exactly once',async()=>{
  const d=await read(period),e=d.lines.find(l=>l.payee_id===employee);assert.equal(e.gross_amount,22000);assert.equal(e.net_amount,19750);assert.equal(e.employer_ss,750);
  assert.deepEqual(d.obligations.map(o=>o.kind).sort(),['contractor_wht','employee_ss','employee_wht','employer_ss']);
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
  await reject(()=>manage('line',lineInput(d.periods.find(p=>p.id===period),e,{base_amount:999})),/STALE_OR_FROZEN/);
  await reject(()=>query('update finance_payroll_lines set base_amount=1 where id=$1',[e.id]),/HISTORY_IMMUTABLE/);
  await reject(()=>manage('rate',{id:randomUUID(),payee_id:employee,monthly_amount:22000,effective_from:'2026-06-20',reason:'Backdate'}),/APPROVED_HISTORY/);
 });
 await check('future raises/type transition preserve approved history; login inactive does not end employment',async()=>{
  const frozen=await scalar('select frozen_json from finance_payroll_lines where period_id=$1 and payee_id=$2',[period,employee]);
  await manage('engagement',{id:randomUUID(),payee_id:employee,kind:'contractor',active:true,effective_from:'2026-08-01',reason:'Future service contract'});
  await query('update user_profiles set active=false where id=$1',[employee]);
  const july=randomUUID();await manage('create_period',{id:july,month:'2026-07-01',target_payment_date:'2026-09-30'});const d=await read(july);const e=d.lines.find(l=>l.payee_id===employee);assert.equal(e.base_amount,23000);assert.equal(e.kind,'employee');
  const august=randomUUID();await manage('create_period',{id:august,month:'2026-08-01',target_payment_date:'2026-09-30'});assert.equal((await read(august)).lines.find(l=>l.payee_id===employee).kind,'contractor');
  assert.deepEqual(await scalar('select frozen_json from finance_payroll_lines where period_id=$1 and payee_id=$2',[period,employee]),frozen);
 });
 await treasury.opening({amount:100000});
 const items=await prepareItems(period),prepareReq=randomUUID();await payment('prepare',items,prepareReq);await payment('prepare',items,prepareReq);
 await check('prepare is separate from cash; duplicate prevention and atomic rollback',async()=>{
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
  await reject(()=>payment('prepare',items),/ALREADY_PREPARED/);
  const bad=confirms(items).sort((a,b)=>a.payout_id.localeCompare(b.payout_id));bad[bad.length-1].payout_version=999;
  await reject(()=>payment('confirm',bad),/STALE/);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
  assert.equal(await scalar("select count(*)::int from finance_payouts where source_model='payroll_v1' and status='confirmed'"),0);
 });
 const confirmReq=randomUUID();await payment('confirm',confirms(items),confirmReq);await payout.flush();await payment('confirm',confirms(items),confirmReq);
 await check('N lines create N immutable payouts/cash rows and existing Statement reconciles',async()=>{
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),2);
  const s=await scalar('select get_finance_account_statement($1,null,$2,$3)',[ids.bank,'2026-09-30','2026-09-30']);assert.equal(s.count,2);assert.deepEqual(s.rows.map(r=>Number(r.cash_amount)).sort((a,b)=>a-b),[14550,19750]);
  assert.ok(s.rows.every(r=>r.kind==='other'&&r.href==='/finance/payroll'));
  assert.equal((await read(period)).periods.find(p=>p.id===period).payment_status,'paid');
  await reject(()=>payment('confirm',confirms(items)),/STALE/);
  await reject(()=>rpc('cancel_finance_payout',[items[0].payout_id,2,true]),/PAYOUT_/);
 });
 await check('generic Payout/Statement snapshots contain net execution facts only',async()=>{
  const p=await scalar("select jsonb_agg(to_jsonb(p)) from finance_payouts p where source_model='payroll_v1'");
  for(const key of ['base_amount','employee_ss','employer_ss','deductions','additions','frozen_json','monthly_amount','adjustment_reason','source_json'])assert.equal(JSON.stringify(p).includes('"'+key+'"'),false,key);
  assert.ok(p.every(p=>p.gross_amount===p.net_amount&&p.wht_amount===0));
  assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0,'Dedicated salary obligations never enter incompatible fixed-rate WHT pool');
 });
 await check('Admin-only RPC/table permissions; Partner/Operator/Custodian/employee/inactive Admin denied',async()=>{
  for(const [role,active,operator]of [['partner',true,false],['staff',true,true],['lawyer',true,false],['admin',false,false]]){
   const actor=randomUUID();await query('insert into user_profiles(id,role,active,full_name,must_change_password,finance_operator) values($1,$2,$3,$4,false,$5)',[actor,role,active,'Synthetic privacy actor',operator]);
   if(operator)await rpc('set_finance_treasury_authority',[actor,ids.bank,null,{view_balance:true,view_movements:true,record_outflow:true,confirm_outflow:true},null,'Synthetic privacy account grant']);
   await db.exec('savepoint privacy');await query("select set_config('test.actor',$1,true)",[actor]);await db.exec('set local role authenticated');
   await reject(()=>read(period),/ADMIN_REQUIRED/);await reject(()=>manage('create_period',{id:randomUUID(),month:'2027-01-01',target_payment_date:'2027-01-31'}),/ADMIN_REQUIRED/);
   await reject(()=>payment('confirm',confirms(items)),/ADMIN_REQUIRED/);await reject(()=>query('select * from finance_payroll_lines'),/permission denied/);
   if(role==='partner'||operator){const statement=await scalar('select get_finance_account_statement($1,null,$2,$3)',[ids.bank,'2026-09-30','2026-09-30']);assert.equal(statement.count,2);assert.ok(statement.rows.every(r=>r.href===null));assert.equal(JSON.stringify(statement).includes('employee_ss'),false);}
   await db.exec('rollback to privacy;release privacy');
  }
  assert.equal(await scalar("select has_function_privilege('anon','payroll089_read(uuid)','execute')"),false);
 });
 await check('mid-month rate review, source refresh, zero net and draft cancellation',async()=>{
  const september=randomUUID();await manage('create_period',{id:september,month:'2026-09-01',target_payment_date:'2026-09-30'});
  await manage('rate',{id:randomUUID(),payee_id:contractor,monthly_amount:18000,effective_from:'2026-09-15',reason:'Mid-month reviewed change'});
  await reviewAll(september);await reject(()=>approve(september),/SOURCES_CHANGED/);
  let d=await read(september);await manage('reload_period',{period_id:september,version:d.periods.find(p=>p.id===september).version,acknowledged:true});d=await read(september);
  const c=d.lines.find(l=>l.payee_id===contractor);assert.equal(c.requires_base_review,true);assert.equal(c.reviewed,false);
  await reject(()=>manage('line',lineInput(d.periods.find(p=>p.id===september),c)),/BASE_REASON_REQUIRED/);
  await reject(()=>manage('line',lineInput(d.periods.find(p=>p.id===september),c,{base_amount:200.123,adjustment_reason:'review'})),/INPUT_INVALID/);
  await reviewAll(september,{[contractor]:{base_amount:16500,adjustment_reason:'Accounting reviewed partial month'},[employee]:{deductions:23000}});await approve(september);
  const x=await prepareItems(september);assert.equal(x.length,1);await payment('prepare',x);await payment('cancel',confirms(x));await payout.flush();
  const newItems=await prepareItems(september);await payment('prepare',newItems);await payment('confirm',confirms(newItems));await payout.flush();
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[newItems[0].payout_id]),1);
  assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[x[0].payout_id]),0);
  assert.equal((await read(september)).periods.find(p=>p.id===september).payment_status,'paid');
 });
 await check('single selected line, different accounts and cutoff failure roll back as a batch',async()=>{
  const month=randomUUID();await manage('create_period',{id:month,month:'2026-10-01',target_payment_date:'2026-09-30'});await reviewAll(month);await approve(month);
  const xs=await prepareItems(month);const other=randomUUID();await query("insert into finance_bank_accounts(id,short_name,bank_name,account_number,is_active) values($1,'Other synthetic','Synthetic','1111',true)",[other]);xs[1].bank_account_id=other;
  await payment('prepare',xs);const beforeCash=await scalar('select count(*)::int from finance_cash_transactions');await reject(()=>payment('confirm',confirms(xs)),/OPENING_BALANCE_REQUIRED/);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),beforeCash);
  await treasury.opening({bank:other,amount:100000});await payment('confirm',[confirms(xs)[1]]);await payout.flush();
  assert.equal((await read(month)).periods.find(p=>p.id===month).payment_status,'partially_paid');
  await payment('confirm',[confirms(xs)[0]]);await payout.flush();assert.equal((await read(month)).periods.find(p=>p.id===month).payment_status,'paid');
 });
 await check('existing individual expense/WHT and distribution payouts still execute after 089',async()=>{
  const expense=require('./expense-foundation-postgres.test.cjs');const id=await expense.accepted({gross_amount:1000});await expense.review(id,{vat_state:'none',eligibility:'ineligible',wht_state:'withhold',wht_base:1000,wht_rate:3});await expense.settlement(id,'supplier_unpaid',contractor,1000);
  const x=randomUUID();await rpc('prepare_finance_expense_payout',[x,id,null,'2026-09-30',ids.bank,null,true,'']);await expense.confirm(x);await payout.flush();assert.equal(await scalar('select cash_amount from finance_cash_transactions where source_payout_id=$1',[x]),970);
  const rights=await payout.rights(contractor),distribution=await payout.save(rights,{recipient:contractor});await payout.confirm(distribution);await payout.flush();assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[distribution]),1);
 });
 await check('concurrent same-request confirms create one outflow per line, never duplicates',async()=>{
  const month=randomUUID();await manage('create_period',{id:month,month:'2026-11-01',target_payment_date:'2026-09-30'});await reviewAll(month);await approve(month);const xs=await prepareItems(month);await payment('prepare',xs);await payout.flush();await db.exec('commit');
  const {PGlite}=require('./finance-authority-pg-adapter.cjs'),a=new PGlite(),b=new PGlite(),requestId=randomUUID();
  try{for(const c of [a,b]){await c.query("select set_config('test.actor',$1,false)",[ids.admin]);await c.exec('set role authenticated');}
   const sql='select payroll089_payment_batch($1,$2,$3,true)';const results=await Promise.all([a.query(sql,['confirm',confirms(xs),requestId]),b.query(sql,['confirm',confirms(xs),requestId])]);assert.deepEqual(results[0].rows,results[1].rows);
   assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id in ($1,$2)',xs.map(x=>x.payout_id)),2);
  }finally{await a.close();await b.close();await db.exec('begin');}
 });
 await check('mixed engagement month fails closed rather than merging tracks or making two payouts per person',async()=>{
  await manage('engagement',{id:randomUUID(),payee_id:employee,kind:'employee',active:true,effective_from:'2026-12-15',reason:'Future mixed-month transition'});
  await reject(()=>manage('create_period',{id:randomUUID(),month:'2026-12-01',target_payment_date:'2026-12-31'}),/MIXED_ENGAGEMENT_MONTH/);
 });
 await check('088 function and untouched individual expense/distribution contract remain exact',async()=>{
  const state=await scalar(B.snapshot());assert.deepEqual(state.batch,B.contract().batch);
  for(const [signature,h]of Object.entries(B.contract().functions))if(!A.patches.some(p=>p.signature===signature))assert.equal(state.functions[signature],h,signature);
 });
 await db.exec('rollback');
});
