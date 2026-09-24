/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL fixture only. No network / Production credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const phase1=require('./revenue-distribution-postgres.test.cjs'),docs=require('./direct-money-documents-postgres.test.cjs'),payment=require('./vp-distribution-postgres.test.cjs');
const payout=require('./payout-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const apply=()=>db.exec(migration('68')),flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
async function setup(){await phase1.setup();await apply();}
async function source(type='direct_money_receipt'){
 const sid=type==='payment'?(await payment.source([{base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee',wht:3}])).p.id:await docs.source();
 if(type==='payment')await treasury.opening({amount:50000});
 const c=await phase1.context(type,sid),d=await phase1.confirm(phase1.args(type,sid,c));await flush();
 return {sid,type,d,rows:await query('select * from finance_payable_entitlements where distribution_id=$1 order by component_no',[d])};
}
const context=(d,e)=>scalar('select get_finance_distribution_payment_context($1,$2)',[d,e]);
async function args(s,index=0,overrides={}){const e=s.rows[index],c=await context(s.d,e.id);return [s.d,e.id,overrides.id||randomUUID(),c.payee.version,'2026-09-23',overrides.cash?null:ids.bank,overrides.cash||null,overrides.rate?'withhold':'none',overrides.rate||0,'Synthetic actual outflow',true];}
const pay=a=>rpc('pay_finance_distribution_participant',a);
const sql='select pay_finance_distribution_participant($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
async function protectedRows(){const names=['finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_expenses','finance_expense_obligations','finance_expense_settlements','finance_expense_claims','finance_company_ledger','finance_compensation_allocations','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_payments','finance_direct_money_receipts','finance_tax_position_facts','finance_tax_source_revisions'];return Object.fromEntries(await Promise.all(names.map(async n=>[n,await scalar(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from ${n} r`)])));}
for(const type of ['direct_money_receipt','payment'])test('068 '+type+' two individual shares, bank then cash, exactly once, no upstream/expense/Statement mutation',async()=>{
 await setup();const s=await source(type);assert.equal(s.rows.length,2);assert.equal((await phase1.context(type,s.sid)).summary.basis,10000);
 const before=await protectedRows(),a=await args(s);assert.equal(a[3],null); // virtual internal Payee; no forced bank profile or inferred WHT
 const c=await context(s.d,s.rows[0].id);assert.equal(c.wht_rate,null);assert.equal(c.wht_treatment,null);assert.equal(c.payee.destination,null);
 const results=await Promise.all(Array.from({length:4},()=>pay(a)));assert.deepEqual(new Set(results),new Set([a[2]]));await flush();
 let detail=await phase1.context(type,s.sid);assert.equal(detail.summary.state,'partial');assert.equal(detail.participants.filter(p=>p.payout_id).length,1);
 const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[a[2]]);assert.equal(p.gross_amount,Number(s.rows[0].gross_amount));assert.equal(p.wht_amount,0);assert.equal(p.net_amount,Number(s.rows[0].gross_amount));assert.equal(p.confirmed_snapshot_json.destination,null);
 for(const [table,col] of [['finance_payout_allocations','payout_id'],['finance_cash_transactions','source_payout_id'],['finance_payout_audit','payout_id']])assert.equal(await scalar(`select count(*)::int from ${table} where ${col}=$1`,[a[2]]),table==='finance_payout_audit'?2:1);
 await rejects(sql,[...a.slice(0,2),randomUUID(),...a.slice(3)],/RIGHTS_UNAVAILABLE/);const changed=[...a];changed[4]='2026-09-03';await rejects(sql,changed,/STALE/);
 const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:50000});const last=await args(s,1,{cash});await pay(last);await flush();detail=await phase1.context(type,s.sid);assert.equal(detail.summary.state,'paid');assert.equal(detail.summary.settled,2);assert.ok(detail.participants.every(p=>p.paid_on&&p.account));assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),0);assert.deepEqual(await protectedRows(),before);
 await rejects("select transition_finance_vp_distribution($1,3,$2,'supersede',true,'unsafe')",[s.d,detail.source],/SETTLED_DISTRIBUTION_LOCKED/);
 if(type==='direct_money_receipt'){const id=await docs.create(s.sid);await docs.save(id);await docs.issue(id);assert.equal((await docs.decision(s.sid)).decision,'complete');}
});
test('068 unresolved WHT/tax identity fail closed; explicit withholding creates only one outgoing obligation and net cash',async()=>{
 await setup();const s=await source(),a=await args(s);const missing=[...a];missing[7]=null;missing[8]=null;await rejects(sql,missing,/WHT_REQUIRED/);
 const wht=[...a];wht[7]='withhold';wht[8]=5;await rejects(sql,wht,/TAX_ID_REQUIRED/);assert.equal(await scalar('select count(*)::int from finance_payouts'),0);assert.equal(await scalar('select count(*)::int from finance_payees'),0);
 await payout.payee({id:s.rows[0].recipient_id,bank:false,tax:true});const ready=await args(s,0,{rate:5});await pay(ready);await pay(ready);await flush();
 const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[ready[2]]);assert.equal(p.wht_amount,Math.round(s.rows[0].gross_amount*5)/100);assert.equal(p.net_amount,p.gross_amount-p.wht_amount);
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations where payout_source_id=$1',[ready[2]]),1);assert.equal(Number(await scalar('select cash_amount from finance_cash_transactions where source_payout_id=$1',[ready[2]])),p.net_amount);
 assert.equal((await phase1.context(s.type,s.sid)).summary.state,'partial');
 await pay(await args(s,1));await flush();assert.equal((await phase1.context(s.type,s.sid)).summary.state,'paid');assert.equal(await scalar('select remittance_status from finance_outgoing_wht_obligations where payout_source_id=$1',[ready[2]]),'not_remitted');
});
test('068 Admin only, stale payee, ack, forged entitlement and audit failure are atomic',async()=>{
 await setup();const s=await source(),a=await args(s),before=await docs.money();await rejects(sql,[...a.slice(0,10),false],/ACK_REQUIRED/);
 await rejects(sql,[a[0],randomUUID(),...a.slice(2)],/RIGHTS_UNAVAILABLE/);await rejects(sql,[...a.slice(0,3),99,...a.slice(4)],/STALE/);
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await asActor(ids.staff,()=>rejects(sql,a,/PERMISSION_DENIED/));
 await asActor(ids.admin,()=>rejects('select payout_confirm_distribution_outflow($1,1,1,null,true,true)',[a[2]],/permission denied/));
 await db.exec("create function fixture_068_fail() returns trigger language plpgsql as $$begin raise exception '068_AUDIT_FAILURE';end$$;create trigger fixture_068_fail before insert on finance_payout_audit for each row when(new.event_type='confirmed') execute function fixture_068_fail();");
 await rejects(sql,a,/068_AUDIT_FAILURE/);assert.equal(await scalar('select count(*)::int from finance_payouts'),0);assert.equal(await scalar('select count(*)::int from finance_payees'),0);assert.deepEqual(await docs.money(),before);
});
test('068 legacy payout bank destination guard and immutable confirmed/reversal contracts remain intact',async()=>{
 await setup();const s=await source();await payout.payee({id:s.rows[0].recipient_id,bank:false,tax:false});
 const id=await payout.save({rows:[s.rows[0]]},{recipient:s.rows[0].recipient_id,rate:0});await rejects('select confirm_finance_payout($1,1,1,null,true)',[id],/DESTINATION_REQUIRED/);
 const a=await args(s);await pay(a);await flush();await rejects('select confirm_finance_payout($1,1,1,null,true)',[id],/RIGHTS_UNAVAILABLE/);
 await rejects('delete from finance_payouts where id=$1',[a[2]],/IMMUTABLE/);await rejects('select cancel_finance_payout($1,2,true)',[a[2]],/STALE/);
 const cash=await scalar('select id from finance_cash_transactions where source_payout_id=$1',[a[2]]);await rejects("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,reversal_of_transaction_id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) select occurred_at,'inflow','reversal',bank_account_id,cash_amount,currency,'confirmed',id,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at from finance_cash_transactions where id=$1",[cash],/PAYOUT_REVERSAL|FINANCE_CASH/);
});
test('068 migration preserves v1 historical distribution evidence; v1 can settle without policy recalculation',async()=>{
 await docs.setup();const r=await payout.rights();await db.exec(migration('67'));const before=await docs.money();await apply();assert.deepEqual(await docs.money(),before);await treasury.opening({amount:50000});
 const s={d:r.d,rows:r.rows};const a=await args(s);await pay(a);await flush();const d=await scalar('select to_jsonb(d) from finance_vp_revenue_distributions d where id=$1',[r.d]);assert.equal(d.source_snapshot_json.policy_version,'vp_distribution_v1');
});
test('068 capture local contract and synthetic browser evidence',{skip:!process.env.CAPTURE_068},async()=>{
 await phase1.setup();const fs=require('node:fs'),raw=require('./direct-money-documents-artifacts.cjs');const capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const before=await capture();await apply();const after=await capture();fs.writeFileSync('/private/tmp/distribution-068-local-contract.json',JSON.stringify({before,after}));const s=await source();fs.writeFileSync('/private/tmp/distribution-068-ui.json',JSON.stringify({detail:await phase1.context(s.type,s.sid),context:await context(s.d,s.rows[0].id)}));
});
module.exports={setup,apply,source,args,pay,context,protectedRows};
test('068 compact static gates: exact scoped functions/security, all protected rows, fail-closed pins and rollback',async()=>{
 await phase1.setup();await source();const a=require('./distribution-payout-artifacts.cjs'),raw=require('./direct-money-documents-artifacts.cjs'),{fingerprint}=require('./direct-money-documents-dry-run.cjs');
 const capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const c=structuredClone(require('./distribution-payout-contract.json')),before=await capture();await db.exec('savepoint candidate068');await apply();const after=await capture();await db.exec('rollback to savepoint candidate068');
 const tables=(await query("select tablename from pg_tables where schemaname='public'")).map(r=>r.tablename);c.scope.rowTables=c.scope.rowTables.filter(n=>tables.includes(n));
 const map=(xs,key)=>Object.fromEntries(xs.map(x=>[x[key],fingerprint(x)]));for(const [stage,state] of [['before',before],['after',after]])c[stage]={functions:map(state.functions.filter(f=>c.scope.functionNames.includes(f.name)),'signature'),catalog:map(state.catalog.filter(t=>c.scope.tableNames.includes(t.name)),'name'),views:Object.fromEntries(Object.entries(state.views).filter(([n])=>c.scope.tableNames.includes(n)))};
 const pre=(await query(a.preflight(c)))[0];assert.equal(pre.gate_pass,true,JSON.stringify(pre));const pins={stateSha:pre.state_sha256,rowsSha:pre.historical_rows_sha256};
 await apply();let post=(await query(a.verifier(c,pins)))[0];assert.equal(post.gate_pass,true,JSON.stringify(post));assert.equal(post.historical_rows_unchanged,true);
 await db.exec('grant execute on function payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean) to anon');post=(await query(a.verifier(c,pins)))[0];assert.equal(post.gate_pass,false);assert.equal(post.applied_state_exact,false);
 await db.exec('rollback to savepoint candidate068');await apply();await query("update user_profiles set staff_name='Changed protected evidence' where id=$1",[ids.staff]);post=(await query(a.verifier(c,pins)))[0];assert.equal(post.historical_rows_unchanged,false);assert.equal(post.gate_pass,false);await db.exec('rollback to savepoint candidate068');
 const dry=a.dryRun(c,pins).replace('BEGIN;','SAVEPOINT rehearsal068;').replace('ROLLBACK;','ROLLBACK TO SAVEPOINT rehearsal068;');const results=await db.exec(dry),result=results.flatMap(r=>r.rows||[]).find(r=>Object.hasOwn(r,'rollback_verified'));assert.equal(result.rollback_verified,true,JSON.stringify(result));assert.equal(result.historical_rows_unchanged,true);assert.equal(await scalar("select to_regprocedure('get_finance_distribution_payment_context(uuid,uuid)')"),null);
 const invalid={stateSha:'UNAPPROVED',rowsSha:'UNAPPROVED'};await db.exec('savepoint invalidgate068');await assert.rejects(()=>db.exec(a.dryRun(c,invalid).replace('BEGIN;','SAVEPOINT invalidrehearsal068;').replace('ROLLBACK;','ROLLBACK TO SAVEPOINT invalidrehearsal068;')),/APPROVED_PREFLIGHT_REQUIRED/);await db.exec('rollback to savepoint invalidgate068');
 for(const sql of [a.preflight(c),a.dryRun(c,pins),a.verifier(c,pins)])assert.ok(Buffer.byteLength(sql)<250000);
});
test('068 existing Company and Reimbursement bank/cash engines unchanged after candidate',async()=>{
 await setup();const company=require('./company-review-modal-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),requests=require('./expense-request-postgres.test.cjs');await treasury.opening({amount:10000});const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash,amount:10000});
 const r=await company.request();for(const[i,e]of r.items.entries()){await company.approve(e);const p=await expense.prepare(e.id,{bank:i?null:ids.bank,cash:i?cash:null,wht:true});await expense.confirm(p);await expense.confirm(p);await flush();assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[p]),1);assert.equal(await scalar('select cash_amount from finance_cash_transactions where source_payout_id=$1',[p]),i?'116.64':'291.59');}
 for(const bank of [true,false]){let r;await asActor(ids.staff,async()=>{r=await requests.save(requests.items([700]));await rpc('submit_finance_expense_request',[r.id,1]);});const e=(await requests.read(r.id)).items[0];await rpc('review_finance_employee_reimbursement',[randomUUID(),e.id,e.version,true,500,'Approved 500']);const p=await expense.prepare(e.id,{bank:bank?ids.bank:null,cash:bank?null:cash});await expense.confirm(p);await expense.confirm(p);await flush();const actual=await query('select cash_amount from finance_cash_transactions where source_payout_id=$1',[p]);assert.equal(actual.length,1);assert.equal(actual[0].cash_amount,'500.00');}
});
