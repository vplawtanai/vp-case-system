/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated in-memory PostgreSQL. No network, credentials or Production connection.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const direct=require('./direct-money-postgres.test.cjs'),prior=require('./vp-distribution-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration,payment}=require('./receipt-foundation.test.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
async function setup(apply=true){
 await direct.setup();await db.exec(migration('48'));
 await db.exec(`alter table user_profiles add column can_view_finance_cash_transactions boolean default false,
 add column can_manage_finance_cash_transactions boolean default false,add column can_confirm_finance_cash_transactions boolean default false;
 create table finance_bank_account_access(user_profile_id uuid,bank_account_id uuid,can_view boolean);
 grant select on finance_bank_accounts to authenticated;`);
 // Receipt fixtures already install the exact 025 tables. Complete their real
 // permissions, lifecycle triggers, balance view, and 026/027 opening contracts.
 const m25=migration('25'),tail=m25.slice(m25.indexOf('create or replace function public.protect_finance_cash_permission_fields'));
 await db.exec(tail);
 const m26=migration('26');await db.exec(m26.slice(m26.indexOf('drop index public.uq_finance_opening_balances_supersedes;')));
 for(const name of ['finance_bangkok_completed_day_end','assert_finance_opening_balance_input','assert_finance_opening_balance_has_no_unposted_payments','confirm_finance_account_opening_balance'])
  await db.exec(definition(migration('27'),name));
 if(apply)await db.exec(migration('49'));
}
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
async function opening({bank=ids.bank,cash=null,start='2026-06-30',amount=0,prior=null,confirm=true}={}){
 const id=await rpc('save_finance_treasury_opening',[randomUUID(),bank,cash,start,amount,'Verified starting cash, excluding later receipts',null,prior]);
 if(confirm){const ts=await scalar('select updated_at from finance_account_opening_balances where id=$1',[id]);await rpc('confirm_finance_treasury_opening',[id,ts,true]);}
 return id;
}
const source=(type,id)=>scalar('select treasury_source($1,$2)',[type,id]);
async function materialize(type,id,location=null){const result=await scalar('select materialize_finance_treasury_source($1,$2,$3,true,$4)',[type,id,await source(type,id),location]);await flush();return result;}
test('049 reuses cash tables, bank identity and unknown balances; Office Cash is a stable non-bank location',async()=>{
 await setup();const data=await scalar('select get_finance_treasury()');
 assert.equal(data.accounts.length,2);assert.ok(data.accounts.every(a=>a.system_balance===null));
 assert.equal(data.accounts.find(a=>a.kind==='bank').account_id,ids.bank);
 assert.equal(data.accounts.find(a=>a.kind==='cash').name_en,'Office Cash');
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('049 bank and physical opening are not income; immutable confirmation and controlled replacement',async()=>{
 await setup();const before=await prior.financialState();
 const cash=await scalar("select id from finance_cash_locations where code='office_cash'");
 const bank=await opening({amount:150000});await opening({bank:null,cash,amount:20000});
 const balances=(await scalar('select get_finance_treasury()')).accounts;
 assert.equal(balances.find(a=>a.kind==='bank').system_balance,150000);assert.equal(balances.find(a=>a.kind==='cash').system_balance,20000);
 await rejects('update finance_account_opening_balances set balance_amount=1 where id=$1',[bank],/immutable/);
 await rejects('select save_finance_treasury_opening($1,$2,null,$3,1,\'note\')',[randomUUID(),ids.bank,'2026-06-30'],/OPENING_LINEAGE/);
 const replacement=await opening({amount:150100,start:'2026-07-01',prior:bank});
 assert.equal(await scalar('select status from finance_account_opening_balances where id=$1',[bank]),'superseded');
 assert.equal(await scalar('select supersedes_opening_balance_id from finance_account_opening_balances where id=$1',[replacement]),bank);
 const after=await prior.financialState();for(const k of Object.keys(before).filter(k=>!k.includes('opening')))assert.deepEqual(after[k],before[k],k);
});
test('049 historical Direct and Payment require explicit acknowledgement, stay unchanged and materialize once each',async()=>{
 await setup();const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');
 const p=await prior.source();const before=await prior.financialState();
 await rejects('select materialize_finance_treasury_source($1,$2,$3,false)', ['direct_money_receipt',id,await source('direct_money_receipt',id)],/ACK_REQUIRED/);
 await rejects('select materialize_finance_treasury_source($1,$2,$3,true)', ['direct_money_receipt',id,await source('direct_money_receipt',id)],/OPENING_BALANCE_REQUIRED/);
 await opening();const first=await materialize('direct_money_receipt',id),second=await materialize('payment',p.p.id);
 assert.equal(first.outcome,'posted');assert.equal(second.outcome,'posted');
 assert.equal((await materialize('direct_money_receipt',id)).cash_transaction_id,first.cash_transaction_id);
 assert.equal((await materialize('payment',p.p.id)).cash_transaction_id,second.cash_transaction_id);
 assert.deepEqual(await query('select cash_amount::text from finance_cash_transactions order by cash_amount'),[{cash_amount:'10400.00'},{cash_amount:'19160.00'}]);
 assert.equal(await scalar('select count(*)::int from finance_cash_transaction_audit_events'),2);
 assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='bank'"),'29560.00');
 const after=await prior.financialState();for(const k of Object.keys(before).filter(k=>!k.includes('cash_transaction')&&!k.includes('opening')))assert.deepEqual(after[k],before[k],k);
});
test('049 future Payment and Direct confirmation atomically post actual cash only, never WHT or a second VAT movement',async()=>{
 await setup();await opening();const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');
 const p=await prior.source();assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),2);
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_direct_money_receipt_id=$1',[id]),'10400.00');
 assert.equal(await scalar('select cash_amount::text from finance_cash_transactions where source_payment_id=$1',[p.p.id]),'19160.00');
 assert.equal((await source('direct_money_receipt',id)).wht_amount,300);
});
test('049 physical Direct and non-revenue cash use explicit IDs; free-text locations are never inferred',async()=>{
 await setup();const location=await scalar("select id from finance_cash_locations where code='office_cash'");await opening({bank:null,cash:location});
 for(const nature of ['client_money','loan_or_deposit','owner_or_partner_funding']){
  const id=randomUUID(),payload=direct.input([direct.line({money_nature:nature,classification:null,base:1000,vat_applicable:false,vat_rate:0,
   vat_treatment_json:{treatment:'outside_scope',reason:'Not revenue'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null})],1000);
  Object.assign(payload,{method:'cash',receiving_bank_account_id:null,cash_location:'Office Cash',receiving_cash_location_id:location});
  await direct.save(id,payload);await direct.transition(id,1,'confirm');
  const row=await scalar('select to_jsonb(c) from finance_cash_transactions c where source_direct_money_receipt_id=$1',[id]);
  assert.equal(row.cash_location_id,location);assert.equal(row.bank_account_id,null);assert.equal(row.source_snapshot_json.classification[0].money_nature,nature);
 }
 assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='cash'"),'3000.00');
 const id=randomUUID(),payload=direct.input();Object.assign(payload,{method:'cash',receiving_bank_account_id:null,cash_location:'Office Cash'});
 await direct.save(id,payload);await rejects('select transition_finance_direct_money_receipt($1,1,\'confirm\',true,\'\')',[id],/LOCATION_REQUIRED/);
 assert.equal(await scalar('select status from finance_direct_money_receipts where id=$1',[id]),'draft');
});
test('049 strict opening cutoff prevents double counting historical receipts already in opening; no migration backfill',async()=>{
 await setup(false);const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');await db.exec(migration('49'));
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);await opening({start:'2026-07-02',amount:10400});
 await rejects('select materialize_finance_treasury_source($1,$2,$3,true)', ['direct_money_receipt',id,await source('direct_money_receipt',id)],/BEFORE_CUTOVER/);
 assert.equal(await scalar("select system_balance::text from finance_treasury_balances where kind='bank'"),'10400.00');
});
test('049 source reversal fails closed, preserves original cash, and never creates a refund',async()=>{
 await setup();await opening();const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');
 const before=await scalar('select jsonb_agg(to_jsonb(c)) from finance_cash_transactions c');
 await rejects('select transition_finance_direct_money_receipt($1,2,\'reverse\',true,\'Wrong record\')',[id],/CASH_CORRECTION_WORKFLOW_REQUIRED/);
 await rejects('delete from finance_cash_transactions',[],/cannot be deleted/);await rejects('truncate finance_cash_transactions cascade',[],/append-only/);
 assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(c)) from finance_cash_transactions c'),before);
 const p=await payment();await rejects('select reverse_finance_payment($1,\'Wrong record\')',[p.id],/Cash|CASH|downstream|CORRECTION/);
});
test('049 Admin mutation, Partner read-only, restricted staff and browser direct-write protection',async()=>{
 await setup();await opening();await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{assert.equal((await scalar('select get_finance_treasury()')).can_manage,false);
  await rejects('select save_finance_treasury_opening($1,$2,null,$3,0,\'Verified\')',[randomUUID(),ids.bank,'2026-07-01'],/PERMISSION_DENIED/);
  await rejects('insert into finance_cash_transactions default values',[],/permission denied/);});
 await query("update user_profiles set role='staff' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{await rejects('select get_finance_treasury()',[],/PERMISSION_DENIED/);await rejects('select treasury_post_source(\'payment\',$1)',[randomUUID()],/permission denied/);});
});
module.exports={setup,opening,source,materialize};
test('049 failure of cash audit rolls back confirmation, snapshot, audit and settlement atomically',async()=>{
 await setup();await opening();const id=randomUUID();await direct.save(id,direct.input());const p=await payment({confirmed:false});
 const before=await prior.financialState();
 await db.exec(`create function treasury_test_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic_cash_failure';end$$;
 create trigger treasury_test_fail before insert on finance_cash_transaction_audit_events for each row execute function treasury_test_fail();`);
 await rejects('select transition_finance_direct_money_receipt($1,1,\'confirm\',true,\'\')',[id],/synthetic_cash_failure/);
 await rejects('select confirm_finance_payment($1,true)',[p.id],/synthetic_cash_failure/);
 assert.deepEqual(await prior.financialState(),before);
 assert.equal(await scalar('select status from finance_direct_money_receipts where id=$1',[id]),'draft');
 assert.equal(await scalar('select status from finance_payments where id=$1',[p.id]),'draft');
});
test('049 unique source and stale source guards; legacy text mapping is an explicit audited choice',async()=>{
 await setup(false);const id=randomUUID(),payload=direct.input();Object.assign(payload,{method:'cash',receiving_bank_account_id:null,cash_location:'Old drawer name'});
 await direct.save(id,payload);await direct.transition(id,1,'confirm');
 const frozen=await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]);
 await db.exec(migration('49'));const location=await scalar("select id from finance_cash_locations where code='office_cash'");await opening({bank:null,cash:location});
 const original=await source('direct_money_receipt',id);
 await rejects('select materialize_finance_treasury_source($1,$2,$3,true,$4)',['direct_money_receipt',id,{...original,cash_amount:1},location],/SOURCE_CHANGED/);
 await materialize('direct_money_receipt',id,location);
 assert.deepEqual(await scalar('select confirmed_snapshot_json from finance_direct_money_receipts where id=$1',[id]),frozen);
 assert.equal(await scalar('select receiving_cash_location_id from finance_direct_money_receipts where id=$1',[id]),null);
 const c=await scalar('select to_jsonb(c) from finance_cash_transactions c where source_direct_money_receipt_id=$1',[id]);
 assert.equal(c.source_snapshot_json.legacy_cash_location,'Old drawer name');assert.equal(c.source_snapshot_json.cash_location_id,location);
 await rejects(`insert into finance_cash_transactions select (jsonb_populate_record(null::finance_cash_transactions,$1)).*`,[{...c,id:randomUUID()}],/unique/);
});
test('049 one-bank read scope does not expose other accounts or physical cash',async()=>{
 await setup();await opening();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await opening({bank:null,cash,amount:20000});
 await query('update user_profiles set can_view_finance_cash_transactions=true where id=$1',[ids.staff]);
 await query('insert into finance_bank_account_access values($1,$2,true)',[ids.staff,ids.bank]);
 await asActor(ids.staff,async()=>{const data=await scalar('select get_finance_treasury()');assert.equal(data.accounts.length,1);assert.equal(data.accounts[0].kind,'bank');assert.equal(data.openings.length,1);assert.deepEqual(data.pending_sources,[]);});
});
test('049 exact operator artifacts execute in rollback-only rehearsal with unchanged financial evidence',async()=>{
 const fs=require('node:fs'),{workflow,catalogSql,manifestPath,filenames}=require('./treasury-artifacts.cjs');
 await setup(false);await prior.source();const id=randomUUID();await direct.save(id,direct.input());await direct.transition(id,1,'confirm');
 const before=await prior.financialState();await db.exec('savepoint before_candidate');await db.exec(migration('49'));const catalog=await query(catalogSql);
 if(process.env.TREASURY_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifestPath,'utf8')));
 const files=workflow();
 if(process.env.TREASURY_CAPTURE==='1')for(const [file,content] of Object.entries(files))fs.writeFileSync(file,content);
 for(const [file,content] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),content);
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('rollback to savepoint before_candidate');const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 // Commit only synthetic fixture setup, so the operator ROLLBACK is tested literally.
 await db.exec('commit');
 const results=await db.exec(files[filenames.dry]);const result=results.flatMap(r=>r.rows).find(r=>'treasury_cashbook_foundation_verification_pass' in r);
 assert.ok(result);assert.deepEqual(result.failed_checks,[],JSON.stringify(result));assert.equal(result.treasury_cashbook_foundation_verification_pass,true);
 assert.equal(await scalar("select to_regclass('public.finance_cash_locations')"),null);assert.deepEqual(await prior.financialState(),before);
});
