/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory PostgreSQL only. No credentials, network or Production actions.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const payout=require('./payout-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const month='2026-09-01',flush=payout.flush;
async function setup(){await payout.setup();await db.exec(migration('52'));}
const pool=type=>scalar('select tax_filing_pool($1,$2)',[month,type]);
const state=()=>scalar('select get_finance_tax_filings($1)',[month]);
const row=id=>scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[id]);
async function create(type,id=randomUUID(),due=null,evidence=null){const fingerprint=await scalar('select md5(tax_filing_pool($1,$2)::text)',[month,type]);return rpc('create_finance_tax_filing',[id,month,type,fingerprint,due,evidence]);}
async function transition(id,action,ack=true){return rpc('transition_finance_tax_filing',[id,(await row(id)).version,action,action==='filed'?'2026-09-10':null,action==='filed'?'EXTERNAL-FILING-1':null,'Synthetic filing evidence',ack]);}
async function confirmedPayout(){const rights=await payout.rights();await payout.payee();await treasury.opening({amount:10000});const id=await payout.save(rights);await payout.confirm(id);await flush();return id;}
async function filed(){const id=await create('wht_natural');await transition(id,'ready_for_review');await transition(id,'filed');return id;}
async function payment(filing,id=randomUUID(),account=null){account=account||(await state()).accounts.find(a=>a.bank_account_id===ids.bank);return rpc('create_finance_tax_remittance',[id,filing,account.bank_account_id,account.cash_location_id,'2026-09-11','TAX-PAYMENT-1','Synthetic external government payment',account]);}
const remit=(id,action='confirmed',ack=true)=>rpc('transition_finance_tax_remittance',[id,1,action,ack]);

test('052 VAT uses immutable 050 facts, incomplete input blocks readiness, incoming credit never payable',async()=>{
 await setup();const id=randomUUID(),input=direct.input();input.received_on=month;await direct.save(id,input);await direct.transition(id,1,'confirm');await flush();
 const s=await state(),vat=s.pools.find(p=>p.filing_type==='vat');assert.equal(vat.output_vat,700);assert.equal(vat.tax_amount,null);assert.equal(vat.ready,false);assert.equal(vat.source_count,1);assert.equal(s.incoming_wht_credit,300);
 const f=await create('vat');assert.equal((await row(f)).due_date,null);await rejects('select transition_finance_tax_filing($1,1,\'ready_for_review\',null,null,null,true)',[f],/NOT_READY/);
 await rejects('select transition_finance_tax_filing($1,1,\'filed\',\'2026-09-10\',\'ref\',\'evidence\',true)',[f],/STALE/);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations where filing_id=$1',[f]),1);
});
test('052 confirmed payout only, frozen legal classification, no Draft/cancelled liability, no live payee guessing',async()=>{
 await setup();const r=await payout.rights();await payout.payee();const draft=await payout.save(r),cancelled=await payout.save(r);await rpc('cancel_finance_payout',[cancelled,1,true]);
 assert.equal((await pool('wht_natural')).tax_amount,0);assert.equal((await pool('wht_juristic')).source_count,0);
 await treasury.opening({amount:10000});await payout.confirm(draft);await flush();const p=await pool('wht_natural');assert.equal(p.tax_amount,93.12);assert.equal(p.source_count,2);assert.equal(p.sources[0].entity_type,'natural_person');
 await query("update finance_payees set legal_name='Changed name',version=version+1 where id=(select payee_id from finance_payouts where id=$1)",[draft]);assert.deepEqual(await pool('wht_natural'),p);
 // Corrupt evidence only in the isolated adversarial fixture; V1 must fail closed.
 await db.exec('alter table finance_outgoing_wht_obligations disable trigger user');await query("update finance_outgoing_wht_obligations set payee_json=payee_json-'entity_type'");
 assert.equal((await pool('wht_natural')).ready,false);assert.ok((await pool('wht_juristic')).issues.some(i=>i.code==='unclassified_wht'));
 assert.equal((await pool('wht_natural')).source_count,0);assert.equal((await pool('wht_natural')).review_sources.length,2);
});
test('052 filing/evidence/idempotency/coverage, full remittance creates exactly one outflow; no financial duplicate',async()=>{
 await setup();await confirmedPayout();const before=await scalar('select count(*)::int from finance_cash_transactions'),f=await create('wht_natural');assert.equal(await create('wht_natural',f),f);
 await rejects('select create_finance_tax_filing($1,$2,\'wht_natural\',$3,null,null)',[randomUUID(),month,(await state()).pools.find(p=>p.filing_type==='wht_natural').fingerprint],/ALREADY_EXISTS/);
 await transition(f,'ready_for_review');await rejects('select transition_finance_tax_filing($1,2,\'filed\',\'2026-09-10\',\'ref\',\'evidence\',false)',[f],/ACK_REQUIRED/);
 await transition(f,'filed');assert.equal(await transition(f,'filed'),f);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),before);
 const r=await payment(f);assert.equal(await payment(f,r),r);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),before);
 await rejects('select transition_finance_tax_remittance($1,1,\'confirmed\',false)',[r],/ACK_REQUIRED/);await remit(r);assert.equal(await remit(r),r);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[r]),1);
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_tax_remittance_id=$1',[r]),'93.12');
 assert.equal(await scalar("select direction from finance_cash_transactions where source_tax_remittance_id=$1",[r]),'outflow');
 const tax=await scalar('select get_finance_tax_position()');assert.ok(tax.outgoing.every(w=>w.filing_status==='filed'&&w.remittance_status==='remitted'&&w.remitted_amount===w.withheld_amount));
 assert.equal(await scalar('select sum(remitted_amount)::text from finance_outgoing_wht_obligations'),'0.00');
 await rejects('update finance_tax_filings set tax_amount=1 where id=$1',[f],/IMMUTABLE/);await rejects('delete from finance_tax_filing_allocations',[],/IMMUTABLE/);
 await rejects('delete from finance_tax_remittances',[],/IMMUTABLE/);await rejects('truncate finance_tax_remittance_audit',[],/IMMUTABLE/);
 const c=await scalar('select id from finance_cash_transactions where source_tax_remittance_id=$1',[r]);
 await rejects("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,reversal_of_transaction_id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) select occurred_at,'inflow','reversal',bank_account_id,cash_amount,currency,'confirmed',id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at from finance_cash_transactions where id=$1",[c],/COORDINATED_REVERSAL/);
});
test('052 zero filing is complete without fake payment; due dates require evidence; stale Draft cancellation preserves history',async()=>{
 await setup();const f=await create('wht_natural');await transition(f,'ready_for_review');await transition(f,'filed');assert.equal((await state()).history[0].payment_state,'no_payment_required');
 await rejects('select create_finance_tax_remittance($1,$2,$3,null,\'2026-09-11\',\'ref\',\'evidence\',\'{}\')',[randomUUID(),f,ids.bank],/PAYMENT_NOT_REQUIRED/);
 const v=await create('vat');await transition(v,'cancelled');const v2=await create('vat',randomUUID(),'2026-09-30','Reviewed internal due-date evidence');assert.notEqual(v2,v);assert.equal((await row(v)).status,'cancelled');
 await rejects('select create_finance_tax_filing($1,$2,\'wht_juristic\',$3,\'2026-09-30\',null)',[randomUUID(),month,(await state()).pools[2].fingerprint],/DUE_EVIDENCE/);
 await confirmedPayout();assert.equal((await state()).filings.find(x=>x.id===f).source_changed,true);assert.equal((await row(f)).tax_amount,0);
});
test('052 permissions and RLS: Partner readonly, authorized Finance needs separate cash authority; direct writes blocked',async()=>{
 await setup();await query("update user_profiles set role='partner',can_manage_finance_tax_invoices=true,can_confirm_finance_cash_transactions=true where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{const s=await state();assert.equal(s.can_manage,false);assert.equal(s.can_remit,false);
  await rejects('select create_finance_tax_filing($1,$2,\'vat\',\'x\',null,null)',[randomUUID(),month],/PERMISSION_DENIED/);
  await rejects('select tax_filing_pool($1,\'vat\')',[month],/permission denied/);
  for(const t of ['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit'])await rejects('insert into '+t+' default values',[],/permission denied/);
 });
 await query("update user_profiles set role='staff',can_confirm_finance_cash_transactions=false where id=$1",[ids.staff]);await asActor(ids.staff,async()=>{assert.equal((await state()).can_manage,true);assert.equal((await state()).can_remit,false);});
 await query('update user_profiles set can_manage_finance_tax_invoices=false where id=$1',[ids.staff]);await asActor(ids.staff,()=>rejects('select get_finance_tax_filings($1)',[month],/PERMISSION_DENIED/));
});
test('052 payment guard/atomic rollback/stale account and negative-balance policy',async()=>{
 await setup();await confirmedPayout();const f=await filed();
 const unknown=(await state()).accounts.find(a=>a.kind==='cash');const r=await payment(f,randomUUID(),unknown);await rejects('select transition_finance_tax_remittance($1,1,\'confirmed\',true)',[r],/OPENING_BALANCE_REQUIRED/);await remit(r,'cancelled');
 const next=await payment(f);await db.exec(`create function tax_test_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic_failure';end$$;create trigger tax_test_fail before insert on finance_tax_remittance_audit for each row when(new.event_type='confirmed') execute function tax_test_fail();`);
 await rejects('select transition_finance_tax_remittance($1,1,\'confirmed\',true)',[next],/synthetic_failure/);assert.equal(await scalar('select status from finance_tax_remittances where id=$1',[next]),'draft');assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[next]),0);
 await db.exec('drop trigger tax_test_fail on finance_tax_remittance_audit');await remit(next,'cancelled');
 const cash=unknown.cash_location_id;await treasury.opening({bank:null,cash,amount:0});const negative=await payment(f,randomUUID(),(await state()).accounts.find(a=>a.kind==='cash'));await remit(negative);assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='cash'"),'-93.12');
});
test('052 old untyped filing path is retired; historic filing blocks duplicate returns, and changed sources block readiness',async()=>{
 await setup();await asActor(ids.admin,()=>rejects("select transition_finance_tax_period($1,1,'filed','ref','2026-09-10',true)",[month],/permission denied/));
 const f=await create('wht_natural');await confirmedPayout();await rejects("select transition_finance_tax_filing($1,1,'ready_for_review',null,null,null,true)",[f],/SOURCE_CHANGED/);
 await transition(f,'cancelled');
 await query('insert into finance_tax_periods(period_month) values($1) on conflict do nothing',[month]);
 await query("insert into finance_tax_position_audit(period_month,event_type,evidence_json,actor_id) values($1,'period_transition',jsonb_build_object('action','filed'),$2)",[month,ids.admin]);
 assert.ok((await pool('wht_natural')).issues.some(i=>i.code==='legacy_filing_review'));
 const replacement=await create('wht_natural');await rejects("select transition_finance_tax_filing($1,1,'ready_for_review',null,null,null,true)",[replacement],/NOT_READY/);
});
test('052 stale Treasury review is rejected and confirmed sources cannot be covered twice',async()=>{
 await setup();await confirmedPayout();const f=await filed(),r=await payment(f);
 const next=await treasury.opening({bank:null,cash:(await state()).accounts.find(a=>a.kind==='cash').cash_location_id,amount:1});assert.ok(next);
 // A real additional confirmed account movement changes the reviewed bank balance.
 await query("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) values('2026-09-11','outflow','other',$1,1,'THB','confirmed',$2,$2,$2,now())",[ids.bank,ids.admin]);await flush();
 await rejects("select transition_finance_tax_remittance($1,1,'confirmed',true)",[r],/ACCOUNT_CHANGED/);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[r]),0);
 await rejects('insert into finance_tax_filing_allocations(filing_id,outgoing_wht_id,economic_key,source_fingerprint,evidence_json) select filing_id,outgoing_wht_id,economic_key,source_fingerprint,evidence_json from finance_tax_filing_allocations limit 1',[],/unique/);
});
test('052 juristic bucket uses frozen legal entity; filing/remittance preserve upstream financial evidence',async()=>{
 await setup();const payee=randomUUID();await rpc('save_finance_payee',[payee,null,{legal_name:'External Broker',entity_type:'juristic_person',tax_id:'1234567890123',destination:{bank_name:'Fixture',account_name:'Fixture',account_number:'1234567890'}},null]);
 const rights=await payout.rights(payee);await treasury.opening({amount:10000});const p=await payout.save(rights,{recipient:payee});await payout.confirm(p);await flush();
 assert.equal((await pool('wht_natural')).source_count,0);assert.equal((await pool('wht_juristic')).tax_amount,93.12);
 const financialState=require('./vp-distribution-postgres.test.cjs').financialState,before=await financialState();
 const f=await create('wht_juristic');await transition(f,'ready_for_review');await transition(f,'filed');assert.deepEqual(await financialState(),before);
 const r=await payment(f);await remit(r);await flush();const after=await financialState();for(const k of Object.keys(before).filter(k=>!k.includes('cash_transaction')))assert.deepEqual(after[k],before[k],k);
});
module.exports={setup,create,state,pool};

test('052 exact operator artifacts, permissions, catalog drift and literal rollback preserve all existing business evidence',async()=>{
 const fs=require('node:fs'),{workflow,catalogSql,manifestPath,filenames}=require('./tax-filing-artifacts.cjs');
 await payout.setup();await treasury.opening({amount:10000});await payout.rights();await flush();
 await db.exec('savepoint before_052');await db.exec(migration('52'));const catalog=await query(catalogSql);
 if(process.env.TAX_FILING_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifestPath,'utf8')));const files=workflow();
 if(process.env.TAX_FILING_CAPTURE==='1')for(const [file,sql] of Object.entries(files))fs.writeFileSync(file,sql);
 for(const [file,sql] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('alter table finance_tax_filings add column unexpected text');assert.ok((await query(files[filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to savepoint before_052');const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 await db.exec('commit');const results=await db.exec(files[filenames.dry]);const verified=results.flatMap(r=>r.rows).find(r=>'tax_filing_remittance_foundation_verification_pass' in r);
 assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));assert.deepEqual(verified.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 assert.equal(await scalar("select to_regclass('public.finance_tax_filings')"),null);
});
