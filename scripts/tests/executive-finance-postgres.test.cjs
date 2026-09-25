/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL (PGlite), synthetic records only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const phase4=require('./unified-statement-postgres.test.cjs'),phase2=require('./distribution-payout-postgres.test.cjs');
const treasury=require('./treasury-postgres.test.cjs'),expense=require('./expense-foundation-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration,invoice,payment}=require('./receipt-foundation.test.cjs');
const raw=require('./direct-money-documents-artifacts.cjs');
const names=['get_finance_cash_flow_summary','get_finance_receivables_summary','get_finance_general_payables_summary','get_finance_unpaid_participants_summary'];
const cash=()=>scalar("select get_finance_cash_flow_summary('2026-09-01','2026-09-30')");
const read=n=>scalar('select '+names[n]+'()');
const thb=data=>data.currencies.find(c=>c.currency==='THB');
async function setup(){await phase4.setup();await db.exec(migration('71'));}
// The inherited fixture deliberately omits Invoice/Payment RLS. Install existing
// repository SELECT policies in the disposable fixture to test INVOKER access.
async function invoiceSecurity(){
 await db.exec(fs.readFileSync('supabase/migrations/202607090001_create_finance_quotations.sql','utf8').match(/create or replace function public\.current_user_can_manage_finance_quotations\(\)[\s\S]*?\$\$;/)[0]);
 for(const [table,guard] of [['finance_invoices','current_user_can_manage_finance_quotations'],['finance_payments','current_user_can_view_finance_payments'],['finance_payment_invoice_allocations','current_user_can_manage_finance_quotations'],['finance_payment_allocation_reallocations','current_user_can_view_finance_payments']]){
  await db.exec(`alter table ${table} enable row level security; create policy fixture071_read on ${table} for select to authenticated using(public.${guard}()); grant select on ${table} to authenticated;`);
 }
 await db.exec('grant select on finance_invoice_settlement_summary,finance_payment_effective_invoice_allocations to authenticated');
}
const capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
async function businessRows(){const tables=await query("select tablename from pg_tables where schemaname='public' order by tablename");return Object.fromEntries(await Promise.all(tables.map(async({tablename:t})=>[t,await scalar(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r`)])));}

test('071 additive read-only migration/security and repeated reads preserve every historical row and existing object',async()=>{
 await phase4.setup();await invoiceSecurity();await phase2.source();const before=await capture(),rows=await businessRows();await db.exec(migration('71'));const after=await capture();
 assert.deepEqual(after.catalog,before.catalog);assert.deepEqual(after.views,before.views);
 assert.deepEqual(after.functions.filter(f=>!names.includes(f.name)),before.functions);
 const added=after.functions.filter(f=>names.includes(f.name));assert.equal(added.length,4);
 for(const f of added){assert.equal(f.owner,'postgres');assert.deepEqual(f.config,['search_path=public']);assert.equal(f.anon_execute,false);assert.equal(f.authenticated_execute,true);assert.equal(f.service_execute,true);assert.equal(f.security_definer,f.name!=='get_finance_receivables_summary');assert.match(f.definition,/STABLE/);}
 await asActor(ids.admin,async()=>{for(let i=0;i<2;i++){await cash();for(let n=1;n<4;n++)await read(n);}});
 assert.deepEqual(await businessRows(),rows);
 if(process.env.CAPTURE_071)fs.writeFileSync('/private/tmp/executive-finance-071-contract.json',JSON.stringify({before,after},null,2));
});
test('071 cash aggregates confirmed cash, one transfer, excludes opening/WHT credits and drafts; date boundaries',async()=>{
 await setup();const s=await phase2.source();const location=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash:location,amount:1000});
 const prior=thb(await cash());await phase4.transfer(await phase4.transferArgs({amount:100}));await phase4.flush();
 const transferred=thb(await cash());assert.equal(transferred.external_inflow,prior.external_inflow);assert.equal(transferred.external_outflow,prior.external_outflow);assert.equal(transferred.internal_transfer_amount,100);assert.equal(transferred.internal_transfer_count,1);
 await payout.payee({id:s.rows[0].recipient_id,bank:false,tax:true});const a=await phase2.args(s,0,{rate:3});await phase2.pay(a);await phase2.pay(a);
 const p=await scalar('select to_jsonb(p) from finance_payouts p where id=$1',[a[2]]);const result=thb(await cash());assert.equal(result.external_outflow,p.net_amount);assert.notEqual(p.net_amount,p.gross_amount);assert.equal(result.external_outflow_count,1);
 const incoming=await scalar('select cash_amount::float from finance_direct_money_receipts where id=$1',[s.sid]);assert.equal(result.external_inflow,incoming);assert.equal(result.external_inflow_count,1);
 assert.equal((await scalar("select get_finance_cash_flow_summary('2025-01-01','2025-01-31')")).currencies.length,0);
 for(const dates of [[null,'2026-09-01'],['2026-09-02','2026-09-01'],['-infinity','2026-09-01']])await rejects('select get_finance_cash_flow_summary($1,$2)',dates,/RANGE_INVALID/);
 // Outgoing tax remittance is an actual separate cash movement, not netted away.
 const tax=require('./tax-filing-postgres.test.cjs'),f=await tax.create('wht_natural');await rpc('transition_finance_tax_filing',[f,1,'ready_for_review',null,null,'Synthetic evidence',true]);await rpc('transition_finance_tax_filing',[f,2,'filed','2026-09-24','TEST-071','Synthetic',true]);const account=(await tax.state()).accounts.find(a=>a.bank_account_id===ids.bank);
 const rem=await rpc('create_finance_tax_remittance',[require('node:crypto').randomUUID(),f,ids.bank,null,'2026-09-25','TEST-071','Synthetic',account]);await rpc('transition_finance_tax_remittance',[rem,1,'confirmed',true]);
 assert.equal(thb(await cash()).external_outflow,p.gross_amount);
 // A draft is never cash; synthetic fixture creation does not invoke confirmation.
 await query("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,status) values('2026-09-12','outflow','manual_outflow',$1,999,'draft')",[ids.bank]);assert.equal(thb(await cash()).external_outflow,p.gross_amount);
});
test('071 account-scoped visibility hides unrelated cash, counts one visible transfer leg once, inactive history preserved',async()=>{
 await setup();await treasury.opening({amount:1000});const location=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({bank:null,cash:location,amount:100});await phase4.transfer(await phase4.transferArgs({amount:100}));
 const other=require('node:crypto').randomUUID();await query("insert into finance_bank_accounts(id,short_name,bank_name,account_name,account_number,is_active) values($1,'Hidden','Synthetic','VP','000',true)",[other]);await treasury.opening({bank:other,amount:0});
 await phase4.transfer([require('node:crypto').randomUUID(),null,location,other,null,10,'2026-09-22','Hidden transfer',true]);await phase4.flush();
 await query('update user_profiles set can_view_finance_cash_transactions=true where id=$1',[ids.staff]);await query('insert into finance_bank_account_access(user_profile_id,bank_account_id,can_view) values($1,$2,true)',[ids.staff,ids.bank]);
 await asActor(ids.staff,async()=>{const r=thb(await cash());assert.equal(r.internal_transfer_count,1);assert.equal(r.internal_transfer_amount,100);assert.equal(r.external_inflow,0);assert.equal(r.external_outflow,0);});
 await query('update finance_bank_accounts set is_active=false where id=$1',[ids.bank]);assert.equal(thb(await cash()).internal_transfer_amount,110);
});
test('071 receivables confirmed settlement, optional dates, due window, currency separation and invoker RLS',async()=>{
 await setup();await invoiceSecurity();const a=await invoice(1000),b=await invoice(2000),full=await invoice(300),draft=await invoice(400),voided=await invoice(500),usd=await invoice(600);
 await query("update finance_invoices set due_date=(now() at time zone 'Asia/Bangkok')::date-1 where id=$1",[a.id]);await query("update finance_invoices set due_date=(now() at time zone 'Asia/Bangkok')::date+30 where id=$1",[b.id]);
 await query("update finance_invoices set document_status='draft' where id=$1",[draft.id]);await query("update finance_invoices set document_status='voided' where id=$1",[voided.id]);await query("update finance_invoices set currency='USD' where id=$1",[usd.id]);
 await payment({cash:400,allocations:[{invoice:a,cash:400}]});await payment({cash:300,allocations:[{invoice:full,cash:300}]});await payment({cash:100,allocations:[{invoice:b,cash:100}],confirmed:false});
 await asActor(ids.admin,async()=>{const r=await read(1),t=thb(r);assert.equal(t.outstanding_count,2);assert.equal(t.outstanding_amount,2600);assert.equal(t.overdue_amount,600);assert.equal(t.overdue_count,1);assert.equal(t.due_soon_amount,2000);assert.equal(t.no_due_date_count,0);assert.equal(r.currencies.find(c=>c.currency==='USD').outstanding_amount,600);assert.equal(r.currencies.find(c=>c.currency==='USD').overdue_count,0);});
 await query("update finance_invoices set due_date=null where id=$1",[a.id]);assert.equal(thb(await read(1)).overdue_amount,0);assert.equal(thb(await read(1)).no_due_date_amount,600);
 // Additional restrictive RLS is honored rather than bypassed by a definer.
 await db.exec(`create policy fixture071_restrict on finance_invoices as restrictive for select to authenticated using(id<>'${a.id}');`);
 await asActor(ids.admin,async()=>assert.equal(thb(await read(1)).outstanding_amount,2000));
});
test('071 General Payables includes approved supplier/reimbursement only; paid/waived/rejected excluded, no participant leakage',async()=>{
 await setup();await phase2.source();await payout.payee({id:ids.admin,bank:true,tax:false});
 const company=await expense.accepted({creator_payment_fact:'unpaid'});await expense.review(company);await expense.settlement(company,'supplier_unpaid',ids.admin);
 const claim=await expense.accepted({origin:'employee_claim',personally_paid:true,reimbursement_requested:500,gross_amount:500});const obligation=await expense.settlement(claim,'reimburse',ids.admin,500);
 let r=thb(await read(2));assert.equal(r.company_purchase_amount,10700);assert.equal(r.reimbursement_amount,500);assert.equal(r.outstanding_count,2);
 assert.ok(thb(await read(3)).unpaid_amount>0);assert.equal(r.outstanding_amount,11200);
 await expense.confirm(await expense.prepare(company));r=thb(await read(2));assert.equal(r.outstanding_count,1);assert.equal(r.reimbursement_amount,500);
 await rpc('waive_finance_expense_reimbursement',[obligation,'Synthetic waiver',true]);assert.deepEqual((await read(2)).currencies,[]);
});
test('071 participants use full entitlement settlement including WHT; partial distribution remaining and superseded exclusion',async()=>{
 await setup();const s=await phase2.source();const total=s.rows.reduce((n,e)=>n+Number(e.gross_amount),0);let r=thb(await read(3));assert.equal(r.unpaid_amount,total);assert.equal(r.unpaid_entitlement_count,2);assert.ok(r.oldest_unpaid_at);assert.equal((await read(3)).partial_entitlement_settlement_supported,false);
 const basis=(await scalar('select get_finance_revenue_distribution_workspace()')).summary[0].amount;assert.notEqual(r.unpaid_amount,basis);
 await payout.payee({id:s.rows[0].recipient_id,bank:false,tax:true});const a=await phase2.args(s,0,{rate:3});await phase2.pay(a);await phase2.pay(a);
 r=thb(await read(3));assert.equal(r.unpaid_amount,Number(s.rows[1].gross_amount));assert.equal(r.unpaid_entitlement_count,1);
 await phase2.pay(await phase2.args(s,1));assert.deepEqual((await read(3)).currencies,[]);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[a[2]]),1);
});
test('071 superseded entitlements excluded using controlled existing lifecycle',async()=>{
 await setup();const second=await phase2.source('payment'),ctx=await scalar('select get_finance_revenue_distribution_detail($1,$2)',[second.type,second.sid]);await rpc('transition_finance_vp_distribution',[second.d,ctx.current.version,ctx.source,'supersede',true,'Synthetic correction']);assert.deepEqual((await read(3)).currencies,[]);
});
test('071 unauthorized, anon and null identity fail closed for all domains; authenticated rights are independent',async()=>{
 await setup();await invoiceSecurity();await asActor(ids.staff,async()=>{await rejects("select get_finance_cash_flow_summary('2026-09-01','2026-09-30')",[],/PERMISSION/);for(let n=1;n<4;n++)await rejects('select '+names[n]+'()',[],/PERMISSION/);});
 await asActor(null,async()=>{for(let n=1;n<4;n++)await rejects('select '+names[n]+'()',[],/PERMISSION/);});
 await db.exec('set local role anon');try{await rejects("select get_finance_cash_flow_summary('2026-09-01','2026-09-30')",[],/permission denied/);for(let n=1;n<4;n++)await rejects('select '+names[n]+'()',[],/permission denied/);}finally{await db.exec('reset role');}
 await query('update user_profiles set can_manage_finance_payments=true where id=$1',[ids.staff]);await asActor(ids.staff,async()=>{assert.deepEqual((await read(3)).currencies,[]);await rejects('select get_finance_general_payables_summary()',[],/PERMISSION/);await rejects('select get_finance_receivables_summary()',[],/PERMISSION/);});
});
module.exports={setup,capture,businessRows};

test('071 adversarial non-effective Payable/source records, due-date boundaries and currency-safe read shape',async()=>{
 await setup();await payout.payee({id:ids.admin,bank:true,tax:false});
 const a=await expense.accepted(),b=await expense.accepted({origin:'employee_claim',personally_paid:true,reimbursement_requested:500,gross_amount:500});await expense.settlement(a,'supplier_unpaid',ids.admin);await expense.settlement(b,'reimburse',ids.admin,500);
 // Disposable adversarial fixture only: immutable production source rows are never changed.
 await db.exec('alter table finance_expense_obligations disable trigger user');await query("update finance_expense_obligations set due_on=null where expense_id=$1",[a]);await query("update finance_expense_obligations set due_on=(now() at time zone 'Asia/Bangkok')::date+30 where expense_id=$1",[b]);await db.exec('alter table finance_expense_obligations enable trigger user');
 let r=thb(await read(2));assert.equal(r.no_due_date_amount,10700);assert.equal(r.overdue_count,0);assert.equal(r.due_soon_amount,500);
 await db.exec('alter table finance_expenses disable trigger user');await query("update finance_expenses set status='rejected' where id=$1",[a]);await db.exec('alter table finance_expenses enable trigger user');assert.equal(thb(await read(2)).outstanding_amount,500);
 // Current Payable schema is THB-only. Do not relax it to manufacture a currency test.
 assert.match(migration('55'),/currency text not null default 'THB' check\(currency='THB'\)/);
});
test('071 full customer settlement includes WHT credit for receivables but never inflates cash',async()=>{
 await setup();await invoiceSecurity();await treasury.opening();const i=await invoice(5000),pmt=await payment({cash:4859.81,wht:140.19,allocations:[{invoice:i,cash:4859.81,wht:140.19}]});await treasury.materialize('payment',pmt.id);assert.deepEqual((await read(1)).currencies,[]);
 const p=await scalar("select get_finance_cash_flow_summary('2026-07-01','2026-07-31')");
 assert.equal(thb(p).external_inflow,4859.81);
});
test('071 cash period Bangkok midnight boundaries and independent currency totals',async()=>{
 await setup();
 // Synthetic confirmed Cashbook evidence at exact boundary instants. Disable
 // audit triggers only inside this disposable fixture; candidate never does so.
 await db.exec('alter table finance_cash_transactions disable trigger user');
 for(const [at,amount,currency] of [['2026-08-31T16:59:59Z',1,'THB'],['2026-08-31T17:00:00Z',2,'THB'],['2026-09-30T16:59:59Z',3,'THB'],['2026-09-30T17:00:00Z',4,'THB'],['2026-09-15T00:00:00Z',50,'USD']])
  await query("insert into finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_amount,currency,status,created_by_user_id,updated_by_user_id,confirmed_by_user_id,confirmed_at) values($1,'inflow','manual_inflow',$2,$3,$4,'confirmed',$5,$5,$5,$1)",[at,ids.bank,amount,currency,ids.admin]);
 await db.exec('alter table finance_cash_transactions enable trigger user');
 const r=await cash();assert.equal(r.currencies.length,2);assert.equal(thb(r).external_inflow,5);assert.equal(thb(r).external_inflow_count,2);assert.equal(r.currencies.find(c=>c.currency==='USD').external_inflow,50);
});
test('071 DB aggregation plans and existing indexes: no new materialization or index needed by local evidence',async()=>{
 await setup();await invoiceSecurity();await phase2.source();
 const sql=migration('71'),bodies=[...sql.matchAll(/as \$fn\$([\s\S]*?)\$fn\$/g)].map(m=>m[1]);
 const plans=[];
 for(let i=0;i<4;i++){
  const body=bodies[i],start=body.indexOf(i===0?' with visible':' select coalesce(jsonb_agg');
  const select=body.slice(start,body.indexOf(';',start)+1).replace(/ into result /g,' ').replace(/\bp_from\b/g,"date '2026-09-01'").replace(/\bp_to\b/g,"date '2026-09-30'").replace(/\btoday\b/g,"date '2026-09-25'");
  const plan=(await query('explain (analyze,buffers,format json) '+select))[0]['QUERY PLAN'];assert.match(JSON.stringify(plan),/Aggregate/);plans.push({rpc:names[i],plan});
 }
 const indexes=await query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('finance_cash_transactions','finance_treasury_transfer_legs','finance_invoices','finance_expense_obligations','finance_payout_allocations','finance_payable_entitlements') order by tablename,indexname");
 assert.ok(indexes.some(i=>/entitlement_id/.test(i.indexdef)&&/UNIQUE/.test(i.indexdef)));assert.ok(indexes.some(i=>/cash_transaction_id/.test(i.indexdef)&&/UNIQUE/.test(i.indexdef)));
 fs.writeFileSync('/private/tmp/071-query-plans.json',JSON.stringify({plans,indexes,scope:'Synthetic local data; not a Production scale benchmark. No index justified or added.'},null,2));
});
test('071 static Preflight local execution: exact-match PASS; ACL, definition, target conflict and row hash tampering fail closed',async()=>{
 await phase4.setup();await invoiceSecurity();const a=require('./executive-finance-artifacts.cjs'),g=require('./revenue-distribution-artifacts.cjs'),c=structuredClone(require('./executive-finance-contract.json'));
 // Local expectations only: inherited fixture has intentionally simplified tables.
 c.scope.rowTables=(await query("select tablename from pg_tables where schemaname='public' order by tablename")).map(r=>r.tablename);
 const before=await scalar(g.captureSql(c));c.before={...before};delete c.before.rows;
 const r=(await query(a.preflight(c)))[0];assert.equal(r.gate_pass,true,JSON.stringify(r));assert.deepEqual(r.failed_checks,[]);
 await db.exec('savepoint bad071');await db.exec('revoke execute on function treasury_can_view(uuid,uuid) from authenticated');assert.equal((await query(a.preflight(c)))[0].gate_pass,false);await db.exec('rollback to savepoint bad071');
 await db.exec('create function get_finance_cash_flow_summary(integer) returns integer language sql as $$ select 1 $$');assert.equal((await query(a.preflight(c)))[0].gate_pass,false);await db.exec('rollback to savepoint bad071');
 const changed=structuredClone(c);changed.before.functions['expense_can_view_all()']='bad';assert.equal((await query(a.preflight(changed)))[0].gate_pass,false);
 await query("update clients set name='Changed synthetic business evidence' where id=$1",[ids.client]);const changedRows=(await query(a.preflight(c)))[0];assert.notEqual(changedRows.historical_rows_sha256,r.historical_rows_sha256);assert.notEqual(changedRows.state_sha256,r.state_sha256);
 // Preflight captures current rows. Later approved gates will pin these hashes;
 // it must not falsely claim historical_rows_unchanged before approval exists.
 assert.equal(Object.hasOwn(changedRows,'historical_rows_unchanged'),false);
});
