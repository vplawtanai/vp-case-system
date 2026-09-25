/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic disposable PostgreSQL only; no credentials or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const phase2=require('./distribution-payout-postgres.test.cjs'),phase3=require('./company-statement-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
async function setup(){await phase2.setup();await phase3.apply();await db.exec(migration('70'));}
const company=(type='all',search='',offset=0)=>scalar('select get_finance_unified_company_statement($1,$2,$3,$4,$5)',['2026-09-01','2026-09-30',type,search,offset]);
const account=(bank=ids.bank,cash=null,search='',offset=0)=>scalar('select get_finance_account_statement($1,$2,$3,$4,$5,$6,$7)',[bank,cash,'2026-09-01','2026-09-30','all',search,offset]);
const classify=(id,treatment='COMPANY_COST',vat=null,previous=null,op=randomUUID())=>rpc('classify_finance_expense',[op,id,previous,treatment,vat,'Confirmed expense burden']);
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
async function transferArgs(extra={}){return [extra.id||randomUUID(),extra.fromBank===undefined?ids.bank:extra.fromBank,extra.fromCash||null,extra.toBank||null,extra.toCash||await scalar("select id from finance_cash_locations where code='office_cash'"),extra.amount??100,extra.date||'2026-09-15',extra.note||'Synthetic transfer',true];}
const transfer=a=>rpc('confirm_finance_treasury_transfer',a);
test('070 migration, dynamic accounts, transfer pair, retry, full-history balance and read-only company',async()=>{
 await setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({amount:1000});await treasury.opening({bank:null,cash,amount:100});
 assert.equal((await scalar('select get_finance_statement_accounts()')).accounts.length,2);
 const before=await phase2.protectedRows(),a=await transferArgs();await transfer(a);await transfer(a);await flush();
 assert.equal(await scalar('select count(*)::int from finance_treasury_transfers'),1);assert.equal(await scalar('select count(*)::int from finance_treasury_transfer_legs'),2);
 const b=await account(),c=await account(null,cash);assert.equal(b.opening,1000);assert.equal(b.outflow,100);assert.equal(b.closing,900);assert.equal(b.rows[0].balance,900);assert.equal(c.closing,200);assert.equal(c.rows[0].kind,'transfer');
 assert.equal((await company()).count,0);assert.deepEqual(await phase2.protectedRows(),before);
});
test('070 COMPANY_COST full authoritative VAT/WHT, unpaid excluded; no inferred treatment',async()=>{
 await setup();await treasury.opening({amount:50000});const id=await expense.accepted({creator_payment_fact:'unpaid'});await expense.review(id);await expense.settlement(id,'company_bank');
 const before=await phase2.protectedRows();await classify(id);assert.deepEqual(await phase2.protectedRows(),before);assert.equal((await company()).count,0);
 const p=await expense.prepare(id);await expense.confirm(p);await flush();const data=await company();assert.equal(data.expense,10000);assert.equal(data.rows[0].gross,10700);assert.equal(data.rows[0].recoverable_vat,700);
 assert.equal(data.rows[0].economic_date,'2026-09-10');assert.ok(data.rows[0].confirmed_at);
 const old=await scalar('select id from finance_expense_economic_decisions where expense_id=$1',[id]);await classify(id,'CLIENT_RECOVERABLE',null,old);assert.equal((await company()).count,0);
});
test('070 Phase 3 income projection preserves 069 and payout-independent values',async()=>{
 await setup();const s=await phase2.source();const old=await phase3.read();let current=await company();assert.equal(current.income,old.totals[0].amount);assert.equal(current.rows[0].distribution_id,old.rows[0].distribution_id);
 await phase2.pay(await phase2.args(s));await flush();current=await company();assert.equal(current.income,old.totals[0].amount);assert.equal(current.expense,0);
});
module.exports={setup,company,account,classify,transferArgs,transfer,flush};
const payout=require('./payout-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs'),purchase=require('./company-review-modal-postgres.test.cjs');
test('070 Company review atomically classifies, WHT stays in gross, retry preserves one decision, no tax or money duplication',async()=>{
 await setup();await treasury.opening({amount:10000});const doc=await purchase.request(),e=doc.items[0];
 const a=['company_purchase',randomUUID(),e.id,e.version,true,{...purchase.choices(),recipient_name:'Supplier'},null,'','COMPANY_COST',null];
 await rpc('review_finance_expense_with_economics',a);await rpc('review_finance_expense_with_economics',a);
 assert.equal(await scalar('select count(*)::int from finance_expense_economic_decisions'),1);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
 const p=await expense.prepare(e.id,{wht:true});await expense.confirm(p);await flush();const row=(await company()).rows[0];assert.equal(row.gross,300);assert.equal(row.recoverable_vat,19.63);assert.equal(row.expense,280.37);assert.equal(row.cash,291.59);assert.equal(row.wht,8.41);
 const before=await phase2.protectedRows();await company();await account();assert.deepEqual(await phase2.protectedRows(),before);
 const rejected=doc.items[1];await rpc('review_finance_expense_with_economics',['company_purchase',randomUUID(),rejected.id,rejected.version,false,{},null,'Invalid evidence',null,null]);assert.equal(await scalar('select count(*)::int from finance_expense_economic_decisions'),1);
});
async function claimWithVat(approved=535,eligible=true){
 const id=await expense.accepted({origin:'employee_claim',personally_paid:true,reimbursement_requested:1070,gross_amount:1070});
 await expense.review(id,{vat_base:1000,vat_rate:7,tax_document_reference:id,eligibility:eligible?'eligible':'ineligible'});
 await payout.payee({id:ids.admin,bank:false,tax:false});await expense.settlement(id,'reimburse',ids.admin,approved);return id;
}
test('070 reduced reimbursement requires explicit VAT; boundaries, zero/nonrecoverable/full approval and exact approved economic gross',async()=>{
 await setup();await treasury.opening({amount:5000});const id=await claimWithVat();
 await rejects('select classify_finance_expense($1,$2,null,\'COMPANY_COST\',null,\'reason\')',[randomUUID(),id],/APPROVED_VAT_REQUIRED/);
 for(const v of [-1,70.01,535.01,1.001])await rejects('select classify_finance_expense($1,$2,null,\'COMPANY_COST\',$3,\'reason\')',[randomUUID(),id,v],/APPROVED_VAT_INVALID/);
 const taxBefore=await scalar("select tax_position_source('expense',$1)",[id]),op=randomUUID();await classify(id,'COMPANY_COST',35,null,op);await classify(id,'COMPANY_COST',35,null,op);
 const p=await expense.prepare(id);await expense.confirm(p);await flush();const r=(await company()).rows[0];assert.equal(r.gross,535);assert.equal(r.recoverable_vat,35);assert.equal(r.expense,500);assert.equal(r.cash,535);assert.equal(r.wht,0);
 assert.deepEqual(await scalar("select tax_position_source('expense',$1)",[id]),taxBefore);
 const prior=await scalar('select id from finance_expense_economic_decisions where expense_id=$1',[id]);await classify(id,'COMPANY_COST',0,prior);assert.equal((await company()).expense,535);
 // Whole-document VAT validity still wins; never claim ineligible VAT.
 const second=await expense.accepted({origin:'employee_claim',personally_paid:true,reimbursement_requested:1070,gross_amount:1070});await expense.review(second,{vat_base:1000,vat_rate:7,tax_document_reference:second,eligibility:'ineligible'});await expense.settlement(second,'reimburse',ids.admin,535);
 await rejects('select classify_finance_expense($1,$2,null,\'COMPANY_COST\',1,\'reason\')',[randomUUID(),second],/APPROVED_VAT_INVALID/);await classify(second,'COMPANY_COST',0);
 const full=await expense.accepted({origin:'employee_claim',personally_paid:true,reimbursement_requested:1070,gross_amount:1070});await expense.review(full,{vat_base:1000,vat_rate:7,tax_document_reference:full});await expense.settlement(full,'reimburse',ids.admin,1070);await classify(full);
 assert.equal(Number(await scalar('select approved_recoverable_vat from finance_expense_economic_decisions where expense_id=$1',[full])),70);
});
test('070 no heuristic history backfill, no-VAT employee approval, correction invalidation, authorization and immutability',async()=>{
 await phase2.setup();await phase3.apply();await treasury.opening({amount:10000});const id=await expense.accepted({creator_payment_fact:'unpaid',category:'Court fee',client_id:ids.client});await expense.review(id);await expense.settlement(id,'company_bank');await expense.confirm(await expense.prepare(id));await flush();
 const before=await phase2.protectedRows();await db.exec(migration('70'));assert.deepEqual(await phase2.protectedRows(),before);assert.equal((await company()).count,0);assert.equal((await company()).unclassified_count,1);
 await asActor(ids.staff,()=>rejects('select classify_finance_expense($1,$2,null,\'COMPANY_COST\',null,\'reason\')',[randomUUID(),id],/PERMISSION/));
 await classify(id);const d=await scalar('select id from finance_expense_economic_decisions where expense_id=$1',[id]);await rejects('delete from finance_expense_economic_decisions where id=$1',[d],/immutable/i);
 const previous=await scalar('select id from finance_expense_tax_reviews where expense_id=$1',[id]);await expense.review(id,{eligibility:'ineligible'},previous);assert.equal((await company()).count,0);assert.equal((await scalar('select get_finance_expense_economics($1)',[id])).effective,false);
 await classify(id,'CLIENT_RECOVERABLE',null,d);assert.equal((await company()).count,0);assert.equal((await company()).unclassified_count,0);
 const r=await requests.save(requests.items([500]));await rpc('submit_finance_expense_request',[r.id,1]);const e=(await requests.read(r.id)).items[0];
 await rpc('review_finance_expense_with_economics',['employee_claim',randomUUID(),e.id,e.version,true,null,400,'','COMPANY_COST',null]);
 assert.equal((await scalar('select get_finance_expense_economics($1)',[e.id])).decision.approved_recoverable_vat,0);
});
test('070 transfer invalid inputs, inactive/account/permission guards and failure halfway rolls back both legs',async()=>{
 await setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({amount:1000});await treasury.opening({bank:null,cash,amount:100});const a=await transferArgs(),sql='select confirm_finance_treasury_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9)';
 for(const amount of [0,-1,1.111]){const b=[...a];b[5]=amount;await rejects(sql,b,/INPUT_INVALID/);}
 await rejects(sql,[a[0],ids.bank,null,ids.bank,null,...a.slice(5)],/INPUT_INVALID/);await rejects(sql,[...a.slice(0,8),false],/ACK_REQUIRED/);
 await asActor(ids.staff,()=>rejects(sql,a,/PERMISSION/));await query('update finance_cash_locations set is_active=false where id=$1',[cash]);await rejects(sql,a,/ACCOUNT_INVALID/);await query('update finance_cash_locations set is_active=true where id=$1',[cash]);
 await db.exec("create function fail070() returns trigger language plpgsql as $$begin if new.direction='inflow' then raise exception 'HALF_PAIR_FAILURE';end if;return new;end$$;create trigger fail070 before insert on finance_cash_transactions for each row execute function fail070();");
 await rejects(sql,a,/HALF_PAIR_FAILURE/);for(const table of ['finance_treasury_transfers','finance_treasury_transfer_legs','finance_cash_transactions'])assert.equal(await scalar('select count(*)::int from '+table),0);
 await db.exec('drop trigger fail070 on finance_cash_transactions;drop function fail070();');await transfer(a);await flush();
 await rejects('delete from finance_treasury_transfers where id=$1',[a[0]],/immutable/i);await rejects(sql,[...a.slice(0,5),110,...a.slice(6)],/IDEMPOTENCY/);
});
test('070 cash-to-bank, dynamic bank-to-bank, pagination/search/backdating stable balances and inactive history',async()=>{
 await setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({amount:10000});await treasury.opening({bank:null,cash,amount:1000});
 for(let i=0;i<55;i++)await transfer(await transferArgs({amount:1,note:'record '+i,date:'2026-09-20'}));
 await transfer(await transferArgs({amount:50,date:'2026-09-02',note:'Backdated'}));await flush();
 const plan=await query("explain (analyze,format json) select id,10000+sum(case direction when 'inflow' then cash_amount else -cash_amount end) over(order by occurred_at,confirmed_at,id rows unbounded preceding) from finance_cash_transactions where bank_account_id is not distinct from $1 and cash_location_id is null and currency='THB' and status='confirmed' and occurred_at<'2026-10-01'",[ids.bank]);assert.match(JSON.stringify(plan),/WindowAgg/);assert.doesNotMatch(JSON.stringify(plan),/SubPlan/);require('node:fs').writeFileSync('/private/tmp/070-balance-plan.json',JSON.stringify(plan,null,2));
 const first=await account(),second=await account(ids.bank,null,'',50);assert.equal(first.count,56);assert.equal(second.opening,first.opening);assert.equal(second.closing,9895);assert.equal(second.rows.at(-1).balance,9950);
 const one=await account(ids.bank,null,'Backdated');assert.equal(one.rows[0].balance,9950);assert.equal(one.closing,9895);assert.equal(one.outflow,105);
 const reverse=[randomUUID(),null,cash,ids.bank,null,25,'2026-09-21','Cash to bank',true];await transfer(reverse);await flush();assert.equal((await account()).closing,9920);
 // A new real master record automatically appears, without a bank-specific route.
 const other=randomUUID();await query('insert into finance_bank_accounts(id,short_name,bank_name,account_name,account_number,is_active) values($1,\'New bank\',\'Synthetic\',\'VP\',\'998877\',true)',[other]);await treasury.opening({bank:other,amount:0});await transfer([randomUUID(),ids.bank,null,other,null,10,'2026-09-22','Bank to bank',true]);await flush();assert.equal((await account(other)).closing,10);
 await query('update finance_bank_accounts set is_active=false where id=$1',[other]);assert.equal((await scalar('select get_finance_statement_accounts()')).accounts.find(a=>a.account_id===other).is_active,false);assert.equal((await account(other)).closing,10);
});
test('070 capture local contract and synthetic UI fixtures',{skip:!process.env.CAPTURE_070},async()=>{
 const fs=require('node:fs'),raw=require('./direct-money-documents-artifacts.cjs');await phase2.setup();await phase3.apply();
 const capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const before=await capture();await db.exec(migration('70'));const after=await capture();fs.writeFileSync('/private/tmp/unified-statement-070-contract.json',JSON.stringify({before,after}));
 await phase2.source();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:1000});await transfer(await transferArgs());
 const doc=await purchase.request(),e=doc.items[0];await rpc('review_finance_expense_with_economics',['company_purchase',randomUUID(),e.id,e.version,true,{...purchase.choices(),recipient_name:'ผู้ขายตัวอย่าง'},null,'','COMPANY_COST',null]);await expense.confirm(await expense.prepare(e.id,{wht:true}));await flush();
 fs.writeFileSync('scripts/tests/unified-statement-fixture.json',JSON.stringify({accounts:await scalar('select get_finance_statement_accounts()'),company:await company(),bank:await account(),expense:(await requests.read(doc.id)).items[0],economics:await scalar('select get_finance_expense_economics($1)',[e.id])},null,2)+'\n');
});
test('070 bank reads cover Payment/Direct, participant WHT/remittance; zero company expense or duplicated tax/cash',async()=>{
 await setup();const tax=require('./tax-filing-postgres.test.cjs'),payment=await phase2.source('payment'),direct=randomUUID();const dm=require('./direct-money-postgres.test.cjs'),input=dm.input();input.received_on='2026-09-15';await dm.save(direct,input);await dm.transition(direct,1,'confirm');
 await treasury.materialize('payment',payment.sid);const initial=await company();await payout.payee({id:payment.rows[0].recipient_id,bank:false,tax:true});const a=await phase2.args(payment,0,{rate:3});await phase2.pay(a);await flush();
 assert.ok((await scalar("select get_finance_account_statement($1,null,'2026-07-01','2026-09-30')",[ids.bank])).rows.some(r=>r.kind==='payment'));let statement=await account();assert.ok(statement.rows.some(r=>r.kind==='direct_money_receipt'));assert.ok(statement.rows.some(r=>r.kind==='participant_payout'&&r.cash_amount===Math.round(Number(payment.rows[0].gross_amount)*97)/100));
 const f=await tax.create('wht_natural');await rpc('transition_finance_tax_filing',[f,1,'ready_for_review',null,null,'Synthetic evidence',true]);await rpc('transition_finance_tax_filing',[f,2,'filed','2026-09-10','SYNTHETIC-FILING','Synthetic evidence',true]);const sourceAccount=(await tax.state()).accounts.find(a=>a.bank_account_id===ids.bank);const remittance=await rpc('create_finance_tax_remittance',[randomUUID(),f,ids.bank,null,'2026-09-11','SYNTHETIC-REMIT','Synthetic remittance',sourceAccount]);await rpc('transition_finance_tax_remittance',[remittance,1,'confirmed',true]);await flush();
 const before=await phase3.rows();statement=await account();const remitted=statement.rows.find(r=>r.kind==='tax_remittance');assert.ok(remitted);assert.equal(remitted.cash_amount,await scalar('select tax_amount::float from finance_tax_filings where id=$1',[f]));
 assert.equal((await company()).expense,0);assert.equal((await company()).income,initial.income);assert.deepEqual(await phase3.rows(),before);
 assert.equal(statement.closing,await scalar('select system_balance::float from finance_treasury_balances where bank_account_id=$1',[ids.bank]));assert.ok(direct);
});
test('070 read permissions, no direct table writes, cutoff truth and archived income equivalence',async()=>{
 await setup();await treasury.opening({amount:1000});const cash=await scalar("select id from finance_cash_locations where code='office_cash'");
 await asActor(ids.staff,async()=>{await rejects('select get_finance_statement_accounts()',[],/PERMISSION/);await rejects('select get_finance_account_statement($1,null,\'2026-09-01\',\'2026-09-30\')',[ids.bank],/PERMISSION/);await rejects('select get_finance_unified_company_statement(\'2026-09-01\',\'2026-09-30\')',[],/PERMISSION/);});
 await query('update user_profiles set can_view_finance_cash_transactions=true where id=$1',[ids.staff]);await query('insert into finance_bank_account_access(user_profile_id,bank_account_id,can_view) values($1,$2,true)',[ids.staff,ids.bank]);
 await asActor(ids.staff,async()=>{const r=await scalar('select get_finance_statement_accounts()');assert.equal(r.accounts.length,1);assert.equal(r.accounts[0].account_id,ids.bank);assert.equal(r.can_transfer,false);await rejects('select get_finance_account_statement(null,$1,\'2026-09-01\',\'2026-09-30\')',[cash],/PERMISSION/);
  for(const t of ['finance_expense_economic_decisions','finance_treasury_transfers','finance_treasury_transfer_legs'])await rejects('insert into '+t+' default values',[],/permission denied/);
 });
 const doc=await purchase.request(),e=doc.items[0];await rpc('review_finance_expense_with_economics',['company_purchase',randomUUID(),e.id,e.version,true,{...purchase.choices(),recipient_name:'Private supplier'},null,'','COMPANY_COST',null]);await expense.confirm(await expense.prepare(e.id,{wht:true}));await flush();
 await asActor(ids.staff,async()=>{const r=(await account()).rows[0];assert.equal(r.kind,'other');assert.equal(r.party,null);assert.equal(r.client,null);assert.equal(r.matter,null);assert.equal(r.href,null);assert.equal(r.cash_amount,291.59);});
 const before=await scalar("select get_finance_account_statement($1,null,'2026-06-01','2026-09-30')",[ids.bank]);assert.equal(before.opening,null);assert.equal(before.balance_covered,false);
 // A missing opening is unknown, never fabricated zero.
 const unknown=await account(null,cash);assert.equal(unknown.closing,null);assert.equal(unknown.balance_covered,false);
});
test('070 unresolved legacy VAT never blocks existing approval or silently becomes zero expense VAT',async()=>{
 await setup();await treasury.opening({amount:10000});const r=await requests.save(requests.items([500]));await rpc('submit_finance_expense_request',[r.id,1]);const e=(await requests.read(r.id)).items[0];
 // Legacy incomplete declaration: synthetic setup only, existing immutable source guard retained in candidate.
 await db.exec('alter table finance_expenses disable trigger user');await query("update finance_expenses set vat_awareness='yes' where id=$1",[e.id]);await db.exec('alter table finance_expenses enable trigger user');
 await rpc('review_finance_expense_with_economics',['employee_claim',randomUUID(),e.id,e.version,true,null,400,'','COMPANY_COST',null]);
 const decision=await scalar('select get_finance_expense_economics($1)',[e.id]);assert.equal(decision.decision.treatment,'COMPANY_COST');assert.equal(decision.decision.approved_recoverable_vat,null);assert.equal(decision.effective,false);
 await expense.confirm(await expense.prepare(e.id));await flush();assert.equal((await company()).expense,0);assert.equal((await company()).unclassified_count,1);
 await expense.review(e.id,{vat_state:'none',vat_base:null,vat_rate:null,tax_document_reference:null,eligibility:'ineligible'});
 await classify(e.id,'COMPANY_COST',null,decision.decision.id);assert.equal((await company()).expense,400);
});
test('070 ineffective expense/reversal evidence is excluded; cash reversal pair retained and draft cash ignored',async()=>{
 await setup();await treasury.opening({amount:10000});const doc=await purchase.request(),e=doc.items[0];await rpc('review_finance_expense_with_economics',['company_purchase',randomUUID(),e.id,e.version,true,{...purchase.choices(),recipient_name:'Supplier'},null,'','COMPANY_COST',null]);await expense.confirm(await expense.prepare(e.id,{wht:true}));await flush();assert.equal((await company()).expense,280.37);
 const cash=await scalar('select id from finance_cash_transactions where source_payout_id is not null limit 1');
 const reversal="insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,reversal_of_transaction_id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) select occurred_at,'inflow','reversal',bank_account_id,cash_amount,currency,'confirmed',id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at from finance_cash_transactions where id=$1";
 await rejects(reversal,[cash],/PAYOUT_REVERSAL_NOT_AVAILABLE/);
 // Adversarial read fixture only; current controlled lifecycle intentionally disallows unpaired payout reversal.
 await db.exec('alter table finance_cash_transactions disable trigger user');await query(reversal,[cash]);await query("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,status) values('2026-09-12','outflow','manual_outflow',$1,999,'draft')",[ids.bank]);await db.exec('alter table finance_cash_transactions enable trigger user');
 assert.equal((await company()).expense,0);const a=await account();assert.equal(a.count,2);assert.equal(a.closing,10000);assert.equal(a.rows.filter(r=>r.reversal_of_transaction_id).length,1);
});
test('070 static gate: exact dependencies, rows/security tamper, fail-closed pins, complete local rollback',{skip:!require('node:fs').existsSync('scripts/tests/unified-statement-contract.json')},async()=>{
 await phase2.setup();await phase3.apply();await phase2.source();const a=require('./unified-statement-artifacts.cjs'),prior=require('./revenue-distribution-artifacts.cjs'),c=structuredClone(require('./unified-statement-contract.json'));
 // Only disposable expectations are adapted to the deliberately synthetic fixture.
 c.scope.rowTables=(await query("select tablename from pg_tables where schemaname='public' and (tablename like 'finance_%' or tablename in ('clients','user_profiles','cases','advisory_matters')) order by tablename")).map(r=>r.tablename);
 const before=await scalar(prior.captureSql(c));c.before={...before};delete c.before.rows;
 await db.exec('savepoint candidate070');await db.exec(migration('70'));const after=await scalar(prior.captureSql(c));c.after={...after};delete c.after.rows;await db.exec('rollback to savepoint candidate070');
 const pre=(await query(a.preflight(c)))[0];assert.equal(pre.gate_pass,true);const pins={stateSha:pre.state_sha256,rowsSha:pre.historical_rows_sha256};
 const bad=(await query(a.preflight({...c,before:{...c.before,functions:{...c.before.functions,'expense_can_manage()':'bad'}}})))[0];assert.equal(bad.gate_pass,false);
 await rejects(a.dryRun(c,{stateSha:'bad',rowsSha:'bad'}).match(/DO \$gate070\$[\s\S]*?\$gate070\$;/)[0],[],/BASELINE_CHANGED/);
 // Recovery from deliberately rejected nested BEGIN: fixture remains in outer transaction.
 await db.exec('set constraints all immediate;commit;');
 const results=await db.exec(a.dryRun(c,pins));assert.equal(results.at(-1).rows[0].rollback_verified,true);assert.equal(await scalar("select to_regclass('finance_treasury_transfers') is null"),true);
 await db.exec('begin;');await db.exec(migration('70'));let verified=(await query(a.verifier(c,pins)))[0];assert.equal(verified.gate_pass,true);assert.equal(verified.historical_rows_unchanged,true);
 await db.exec('revoke execute on function get_finance_statement_accounts() from authenticated');assert.equal((await query(a.verifier(c,pins)))[0].gate_pass,false);await db.exec('grant execute on function get_finance_statement_accounts() to authenticated');
 await query("update clients set name='tampered synthetic' where id=$1",[ids.client]);verified=(await query(a.verifier(c,pins)))[0];assert.equal(verified.gate_pass,false);assert.equal(verified.historical_rows_unchanged,false);
});
