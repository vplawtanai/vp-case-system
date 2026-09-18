/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PostgreSQL WASM only. No network or Production credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const treasury=require('./treasury-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),prior=require('./vp-distribution-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {people,resolved}=require('./vp-formula.test.cjs');
const {calculateFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const engine=require('../../app/finance/compensation/formula-engine.ts');
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
async function rejected(fn,pattern){await db.exec('savepoint expected_payout_failure');try{await assert.rejects(fn,pattern);}finally{await db.exec('rollback to savepoint expected_payout_failure;release savepoint expected_payout_failure');}}
async function setup(apply=true){await treasury.setup();await db.exec(migration('50'));if(apply)await db.exec(migration('51'));}
async function payee({id=people[0].id,external=false,bank=true,tax=true,version=null}={}){
 return rpc('save_finance_payee',[id,external?null:id,{legal_name:'External Broker',entity_type:'natural_person',tax_id:tax?'1234567890123':null,
  destination:bank?{bank_name:'Synthetic bank',account_name:'Synthetic recipient',account_number:'1234567890'}:null},version]);
}
async function rights(externalId=null){
 const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');const c=await direct.context(id);
 const choices=c.source.lines.filter(l=>l.classification==='professional_fee').map(l=>{
  const input=resolved('source_worker_qc',l.professional_pool);input.rows[0].recipient_user_id=people[0].id;input.rows[2].recipient_user_id=people[1].id;
  input.rows.push({...engine.createAllocation('worker','',12,false,'Co-working Counsel'),recipient_user_id:people[0].id});
  input.rows=engine.rebalanceOwnerWorkPool(input.rows,l.professional_pool,input.code);
  if(externalId)for(const row of input.rows.filter(r=>r.recipient_user_id===people[0].id)){row.recipient_user_id='__other__';row.recipient_payee_id=externalId;row.recipient_name='External Broker';}
  const f=calculateFormula(l.professional_pool,input,people).result;
  return {source_line_id:l.source_line_id,formula_result:f,referral_amount:f.referral_amount,company_share_amount:f.company_share_amount,work_compensation_amount:f.work_compensation_amount};
 });
 const d=await rpc('save_finance_direct_vp_distribution',[id,null,null,c.source,choices,'Synthetic payout']);
 await rpc('transition_finance_vp_distribution',[d,1,c.source,'review',true,'']);await rpc('transition_finance_vp_distribution',[d,2,c.source,'finalize',true,'']);await flush();
 return {d,c,rows:await query('select * from finance_payable_entitlements where distribution_id=$1 and recipient_id=$2 order by id',[d,externalId||people[0].id])};
}
async function save(r,{id=randomUUID(),recipient=people[0].id,rate=3,bank=ids.bank,cash=null,version=null}={}){
 const choices=r.rows.map(e=>({entitlement_id:e.id,treatment:rate?'withhold':'none',rate}));
 return rpc('save_finance_payout',[id,recipient,'2026-09-01',bank,cash,choices,'',version]);
}
async function confirm(id,ack=true){const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]);
 const payee=await scalar('select to_jsonb(p) from finance_payees p where id=$1',[p.payee_id]);
 const dest=await scalar('select (select id from finance_payee_destinations where payee_id=$1 and is_active)',[p.payee_id]);
 return rpc('confirm_finance_payout',[id,p.version,payee.version,dest||null,ack]);}

test('051 atomic full components: gross 3104, WHT 93.12, cash 3010.88; retry, settlement and upstream boundary',async()=>{
 await setup();const r=await rights();await payee();await treasury.opening({amount:29560});await flush();
 const before=await prior.financialState(),id=await save(r);await confirm(id);await flush();
 const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]);assert.equal(p.status,'confirmed');assert.equal(p.gross_amount,3104);assert.equal(p.wht_amount,93.12);assert.equal(p.net_amount,3010.88);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[id]),1);
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payout_id=$1',[id]),'3010.88');
 assert.equal(await scalar('select count(*)::int from finance_payout_allocations where payout_id=$1',[id]),2);
 assert.equal(await scalar('select sum(withheld_amount)::text from finance_outgoing_wht_obligations where payout_source_id=$1',[id]),'93.12');
 assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='bank'"),'26549.12');
 assert.equal(await confirm(id),id);await flush();assert.equal(await scalar('select count(*)::int from finance_payout_audit where payout_id=$1 and event_type=\'confirmed\'',[id]),1);
 assert.ok(!(await scalar('select get_finance_payable_entitlements()')).groups.some(g=>g.recipient_id===people[0].id));
 const after=await prior.financialState();for(const k of Object.keys(before).filter(k=>!k.includes('cash_transaction')))assert.deepEqual(after[k],before[k],k);
 await rejects("select transition_finance_vp_distribution($1,3,$2,'supersede',true,'unsafe')",[r.d,r.c.source],/SETTLED_DISTRIBUTION_LOCKED/);
 await rejected(()=>save(r),/RIGHTS_UNAVAILABLE/);
 await rejects('update finance_payouts set net_amount=1 where id=$1',[id],/IMMUTABLE/);
});
test('051 stable internal/external identities; incomplete payee allowed, bank/tax/opening/ack fail closed',async()=>{
 await setup();const r=await rights();await payee({bank:false,tax:false});
 await rejected(()=>payee(),/STALE/);
 assert.equal(await scalar('select profile_id from finance_payees where id=$1',[people[0].id]),people[0].id);
 const ext=randomUUID();await payee({id:ext,external:true,bank:false,tax:false});assert.equal(await scalar('select count(*)::int from user_profiles where id=$1',[ext]),0);
 const id=await save(r);await rejected(()=>confirm(id,false),/ACK_REQUIRED/);await rejected(()=>confirm(id),/DESTINATION_REQUIRED/);
 await payee({tax:false,version:1});await rejected(()=>confirm(id),/TAX_ID_REQUIRED/);
 await payee({version:2});await rejected(()=>confirm(id),/OPENING_BALANCE_REQUIRED/);
 assert.equal(await scalar('select count(*)::int from finance_payout_allocations'),0);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 const other=await rights(ext);const eid=await save(other,{recipient:ext,rate:0});
 assert.equal(await scalar('select payee_id from finance_payouts where id=$1',[eid]),ext);
 await rejects('select save_finance_payout($1,$2,\'2026-09-01\',$3,null,$4,\'\',null)',[randomUUID(),ext,ids.bank,r.rows.map(e=>({entitlement_id:e.id,treatment:'none',rate:0}))],/RIGHTS_UNAVAILABLE/);
 await rejected(()=>confirm(eid),/DESTINATION_REQUIRED/);
 await payee({id:ext,external:true,version:1});await treasury.opening({amount:10000});await confirm(eid);await flush();
 assert.equal(await scalar('select status from finance_payouts where id=$1',[eid]),'confirmed');
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[eid]),1);
 assert.equal(await scalar('select count(*)::int from user_profiles where id=$1',[ext]),0);
});
test('051 Office Cash no destination, no-WHT; partial/duplicate/unselected WHT refused; rollback on failure',async()=>{
 await setup();const r=await rights();await payee({bank:false,tax:false});const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:0});
 const id=await save(r,{rate:0,bank:null,cash});await confirm(id);await flush();
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0);assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='cash'"),'-3104.00');
 const next=await rights();const base=next.rows.map(e=>({entitlement_id:e.id,treatment:'none',rate:0}));
 for(const choices of [[{...base[0],amount:1}], [base[0],base[0]], [{entitlement_id:base[0].entitlement_id}]])await rejects('select save_finance_payout($1,$2,\'2026-09-01\',null,$3,$4,\'\',null)',[randomUUID(),people[0].id,cash,choices],/PAYOUT_/);
 const failed=await save(next,{rate:0,bank:null,cash});await db.exec(`create function payout_test_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic_failure';end$$;create trigger payout_test_fail before insert on finance_payout_audit for each row when(new.event_type='confirmed') execute function payout_test_fail();`);
 await rejected(()=>confirm(failed),/synthetic_failure/);assert.equal(await scalar('select status from finance_payouts where id=$1',[failed]),'draft');assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[failed]),0);
});
test('051 permissions, immutable allocation/WHT, payee snapshot stable, no generic Cash reversal',async()=>{
 await setup();const r=await rights();await payee();await treasury.opening({amount:10000});const id=await save(r);await confirm(id);await flush();
 const snap=await scalar('select confirmed_snapshot_json from finance_payouts where id=$1',[id]);
 await rpc('save_finance_payee',[people[0].id,people[0].id,{tax_id:'9876543210987',destination:{bank_name:'Changed bank',account_name:'Changed destination',account_number:'9876543210'}},1]);
 assert.deepEqual(await scalar('select confirmed_snapshot_json from finance_payouts where id=$1',[id]),snap);
 assert.equal(await scalar('select count(*)::int from finance_payee_destinations where payee_id=$1',[people[0].id]),2);
 assert.equal(await scalar('select account_number from finance_payee_destinations where payee_id=$1 and is_active',[people[0].id]),'9876543210');
 assert.equal(snap.destination.account_number,'1234567890');assert.equal(snap.payee.tax_id,'1234567890123');
 for(const table of ['finance_payout_allocations','finance_payout_audit','finance_outgoing_wht_obligations'])await rejects('delete from '+table,[],/IMMUTABLE/);
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await asActor(ids.staff,async()=>{
  assert.equal((await scalar('select get_finance_payout_workspace($1,$2)',[people[0].id,id])).can_manage,false);
  await rejects('select cancel_finance_payout($1,2,true)',[id],/PERMISSION_DENIED/);
  await rejects('insert into finance_payouts default values',[],/permission denied/);
  await rejects('select payout_assert($1)',[id],/permission denied/);
 });
});
module.exports={setup,rights,payee,save,confirm,flush};

test('051 Draft cancellation preserves evidence and open Payables, is idempotent, permission guarded and financially inert',async()=>{
 await setup();const r=await rights();await payee();await treasury.opening({amount:29560});const id=await save(r);await flush();
 const before=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]);
 const financial=await prior.financialState(),tax=await scalar('select get_finance_tax_position()'),balances=await query('select * from finance_treasury_balances');
 const entitlements=await query('select * from finance_payable_entitlements order by id'),available=await scalar('select get_finance_payable_entitlements()');
 assert.equal(await scalar('select count(*)::int from finance_payout_allocations where payout_id=$1',[id]),0);
 await rejected(()=>rpc('cancel_finance_payout',[id,1,false]),/ACK_REQUIRED/);
 await rejected(()=>rpc('cancel_finance_payout',[id,99,true]),/STALE/);
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{
  const view=await scalar('select get_finance_payout_workspace($1,$2)',[people[0].id,id]);assert.equal(view.can_manage,false);
  await rejects('select cancel_finance_payout($1,1,true)',[id],/PERMISSION_DENIED/);
  await rejects("update finance_payouts set status='cancelled' where id=$1",[id],/permission denied/);
 });
 assert.equal(await rpc('cancel_finance_payout',[id,1,true]),id);await flush();
 const after=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]);assert.equal(after.status,'cancelled');assert.equal(after.version,2);
 assert.ok(after.cancelled_at);assert.equal(after.cancelled_by,ids.admin);
 for(const key of Object.keys(before).filter(k=>!['status','version','cancelled_at','cancelled_by','updated_at','updated_by'].includes(k)))assert.deepEqual(after[key],before[key],key);
 const audit=await query("select * from finance_payout_audit where payout_id=$1 and event_type='cancelled'",[id]);assert.equal(audit.length,1);assert.equal(audit[0].actor_id,ids.admin);assert.deepEqual(audit[0].evidence_json,before);
 assert.equal(await rpc('cancel_finance_payout',[id,1,true]),id);await flush();
 assert.deepEqual(await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[id]),after);
 assert.deepEqual(await query("select * from finance_payout_audit where payout_id=$1 and event_type='cancelled'",[id]),audit);
 await rejected(()=>confirm(id),/STALE/);await rejected(()=>save(r,{id,version:2}),/IMMUTABLE/);
 await rejects('delete from finance_payouts where id=$1',[id],/IMMUTABLE/);
 assert.deepEqual(await prior.financialState(),financial);assert.deepEqual(await scalar('select get_finance_tax_position()'),tax);assert.deepEqual(await query('select * from finance_treasury_balances'),balances);
 assert.deepEqual(await query('select * from finance_payable_entitlements order by id'),entitlements);assert.deepEqual(await scalar('select get_finance_payable_entitlements()'),available);
 for(const [table,key] of [['finance_payout_allocations','payout_id'],['finance_cash_transactions','source_payout_id'],['finance_outgoing_wht_obligations','payout_source_id']])assert.equal(await scalar(`select count(*)::int from ${table} where ${key}=$1`,[id]),0);
 const view=await scalar('select get_finance_payout_workspace($1,$2)',[people[0].id,id]);assert.equal(view.payout.id,id);assert.equal(view.payout.status,'cancelled');assert.equal(view.components.length,r.rows.length);assert.equal(view.history.filter(h=>h.id===id&&h.status==='cancelled').length,1);
 const next=await save(r);await confirm(next);await flush();await rejected(()=>rpc('cancel_finance_payout',[next,2,true]),/STALE/);
});

test('051 heterogeneous WHT, stale master, cancellation and second-draft double-settlement protection',async()=>{
 await setup();const r=await rights();await payee();await treasury.opening({amount:29560});
 const id=await save(r),second=await save(r),third=await save(r);
 await rpc('cancel_finance_payout',[third,1,true]);assert.equal(await rpc('cancel_finance_payout',[third,1,true]),third);
 await rejected(()=>rpc('confirm_finance_payout',[id,1,0,null,true]),/PAYEE_INVALID/);
 const choices=r.rows.map((e,i)=>({entitlement_id:e.id,treatment:i?'none':'withhold',rate:i?0:3}));
 await rpc('save_finance_payout',[id,people[0].id,'2026-09-01',ids.bank,null,choices,'mixed explicit rates',1]);await confirm(id);await flush();
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),1);
 const tax=await scalar('select get_finance_tax_position()');assert.equal(tax.outgoing_workflow_available,true);assert.equal(tax.outgoing.length,1);assert.equal(tax.outgoing[0].remittance_status,'not_remitted');
 await rejected(()=>confirm(second),/RIGHTS_UNAVAILABLE/);
 const cash=await scalar('select id from finance_cash_transactions where source_payout_id=$1',[id]);
 await rejects("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,reversal_of_transaction_id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) select occurred_at,'inflow','reversal',bank_account_id,cash_amount,currency,'confirmed',id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at from finance_cash_transactions where id=$1",[cash],/PAYOUT_REVERSAL|FINANCE_CASH/);
});
test('051 authorized Finance, readonly partner masks and no permission escalation',async()=>{
 await setup();await payee();await query('update user_profiles set can_manage_finance_payments=true,can_confirm_finance_cash_transactions=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>{const external=randomUUID();assert.equal(await payee({id:external,external:true,bank:false,tax:false}),external);});
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await asActor(ids.staff,async()=>{const data=await scalar('select get_finance_payees()');assert.ok(data.find(p=>p.id===people[0].id).tax_id.startsWith('*'));await rejects('select save_finance_payee($1,null,$2,null)',[randomUUID(),{legal_name:'Forbidden',entity_type:'natural_person'}],/PERMISSION_DENIED/);});
});
// Last: literal ROLLBACK operates only on the in-memory synthetic database.
test('051 operator artifacts exact catalog/functions, readonly verification and rollback-only rehearsal',async()=>{
 const fs=require('node:fs'),{workflow,catalogSql,manifestPath,filenames}=require('./payout-artifacts.cjs');
 await setup(false);await treasury.opening();await rights();await flush();const before=await prior.financialState();
 await db.exec('savepoint before_candidate');await db.exec(migration('51'));const catalog=await query(catalogSql);
 if(process.env.PAYOUT_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifestPath,'utf8')));const files=workflow();
 if(process.env.PAYOUT_CAPTURE==='1')for(const [file,content] of Object.entries(files))fs.writeFileSync(file,content);
 for(const [file,content] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),content);
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('alter table finance_payees add column unexpected text');assert.ok((await query(files[filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to savepoint before_candidate');assert.deepEqual((await query(files[filenames.pre]))[0].failed_checks,[]);
 await db.exec('commit');const results=await db.exec(files[filenames.dry]);const v=results.flatMap(r=>r.rows).find(r=>'payee_payout_foundation_verification_pass' in r);assert.deepEqual(v.failed_checks,[],JSON.stringify(v));
 assert.equal(await scalar("select to_regclass('public.finance_payouts')"),null);assert.deepEqual(await prior.financialState(),before);
});
