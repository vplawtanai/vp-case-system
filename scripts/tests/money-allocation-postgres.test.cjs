/* eslint-disable @typescript-eslint/no-require-imports */
// In-memory synthetic PostgreSQL only. No network or Production credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup: previous, source: taxSource, args, create: correction, issue: issueCorrection } = require('./tax-correction-postgres.test.cjs');
const { source: invoiceSource } = require('./combined-document-postgres.test.cjs');
const { db, query, scalar, rpc, rejects, ids, asActor, migration, payment } = require('./receipt-foundation.test.cjs');
async function financialState() {
 const tables=['finance_payments','finance_payment_invoice_allocations','finance_payment_allocation_reallocations','finance_payment_wht_components','finance_payment_audit_events',
 'finance_invoices','finance_invoice_settlement_summary','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events',
 'finance_company_ledger','finance_compensation_batches','finance_receipts','finance_receipt_invoice_allocations','finance_receipt_audit_events',
 'finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events','finance_combined_documents','finance_document_counters'];
 const state={};for(const t of tables)state[t]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${t} t`);return state;
}
async function setup(apply = true) {
 await previous();
 // The Receipt test harness creates an empty hypothetical downstream probe table,
 // not an applied domain. Remove that fixture stub, never a Production object.
 await db.exec('drop table finance_revenue_allocations');
 if (apply) await db.exec(migration('44'));
}
const context = p => scalar('select get_finance_money_allocation($1)', [p]);
const choices = c => c.source.lines.map(l => ({ invoice_item_id: l.invoice_item_id, category: 'company_revenue', reason: 'Reviewed contract and economic evidence' }));
const save = (p, c, decisions = choices(c), note = '') => rpc('save_finance_money_allocation', [p,c.current?.id || null,c.current?.version || null,c.source,decisions,note]);
const transition = async (p, action, reason = '') => { const c=await context(p); return rpc('transition_finance_money_allocation',[c.current.id,c.current.version,c.source,action,true,reason]); };
async function finalize(p) { await save(p,await context(p)); await transition(p,'review'); await transition(p,'finalize'); }
async function uat() {
 const s=await invoiceSource([{base:4000,vat:280,rate:7,applicable:true},{base:10000,vat:0,rate:0,applicable:false,treatment:'outside_scope'},{base:4672.90,vat:327.10,rate:7,applicable:true}],null,0,false);
 await rpc('save_finance_payment_wht_lines_draft',[s.p.id,'2026-07-01','bank_transfer',ids.bank,null,null,'Synthetic payer','',s.items.map((item,n)=>({invoice_item_id:item.id,applicability:n===0?'applies':'does_not_apply',rate_percent:n===0?3:null}))]);
 await rpc('confirm_finance_payment',[s.p.id,true]); return s;
}
test('044 exact mixed full Payment, VAT/WHT separation, explicit categories and no financial/document posting',async()=>{
 await setup(); const s=await uat(),before=await financialState(),c=await context(s.p.id);
 assert.deepEqual(c.source.blockers,[]); assert.equal(c.current,null); assert.equal(c.source.lines.length,3);
 assert.equal(c.source.payment.cash,19160); assert.equal(c.source.payment.wht,120); assert.equal(c.source.payment.settlement,19280);
 assert.equal(c.source.proven_base,18672.90); assert.equal(c.source.proven_vat,607.10); assert.equal(c.source.unallocated_settlement,0);
 assert.equal(c.source.lines.reduce((n,l)=>n+l.cash,0),19160);assert.equal(c.source.lines.reduce((n,l)=>n+l.wht,0),120);
 for (const l of c.source.lines) {assert.equal(l.base+l.vat,l.settlement);assert.equal(l.cash+l.wht,l.settlement);assert.ok(s.items.some(i=>i.id===l.invoice_item_id));assert.ok(!('category' in l));}
 const unknown=choices(c).map(x=>({...x,category:'unallocated',reason:''})); const id=await save(s.p.id,c,unknown);
 await rejects('select transition_finance_money_allocation($1,$2,$3,\'review\',true,\'\')',[id,1,c.source],/REVIEW_REQUIRED/);
 const reviewed=await context(s.p.id);await save(s.p.id,reviewed);await transition(s.p.id,'review');await transition(s.p.id,'finalize');
 const done=await context(s.p.id);assert.equal(done.current.status,'finalized');assert.equal(done.posting_enabled,false);assert.equal(done.eligible_for_future_policy_review,true);
 assert.deepEqual(await financialState(),before);assert.equal(done.current.decisions_json.length,3);
 await rejects('update finance_payment_money_allocations set note=\'changed\',version=version+1 where id=$1',[id],/IMMUTABLE/);
 await rejects('delete from finance_payment_money_allocation_audit where allocation_id=$1',[id],/IMMUTABLE/);
 await transition(s.p.id,'supersede','Wrong economic category: review contract');const prior=(await context(s.p.id)).history[0];
 assert.equal(prior.status,'superseded');assert.deepEqual(prior.source_snapshot_json,done.current.source_snapshot_json);assert.deepEqual(prior.decisions_json,done.current.decisions_json);
 await save(s.p.id,await context(s.p.id));const next=(await context(s.p.id)).current;assert.equal(next.previous_id,id);assert.equal(next.revision,2);
 assert.deepEqual(await financialState(),before);
});
test('044 full single Invoice; partial and aggregate-paid Invoice never silently prorated or amount-matched',async()=>{
 await setup(); const full=await invoiceSource();await finalize(full.p.id);
 const partial=await invoiceSource(undefined,5000);let c=await context(partial.p.id);
 assert.ok(c.source.blockers.includes('partial_line_evidence_missing'));assert.deepEqual(c.source.lines,[]);assert.equal(c.source.unallocated_settlement,5000);
 await save(partial.p.id,c,[]);await rejects('select transition_finance_money_allocation($1,1,$2,\'review\',true,\'\')',[(await context(partial.p.id)).current.id,c.source],/SOURCE_UNPROVEN/);
 await payment({cash:5700,wht:0,confirmed:true,allocations:[{invoice:{id:partial.id,snapshot:partial.snapshot},cash:5700,wht:0}]});
 c=await context(partial.p.id);assert.deepEqual(c.source.lines,[]);assert.ok(c.source.blockers.includes('partial_line_evidence_missing'));
});
test('044 multi-Invoice preserves exact effective coverage and never joins on equal amounts',async()=>{
 await setup();const a=await invoiceSource(),b=await invoiceSource();
 // Synthetic fixture only: remove separate draft-free sources before a multi-Invoice Payment.
 await rpc('correct_erroneous_finance_payment',[a.p.id,'Fixture replacement',true]);await rpc('correct_erroneous_finance_payment',[b.p.id,'Fixture replacement',true]);
 const p=await payment({cash:21400,wht:0,confirmed:true,allocations:[{invoice:{id:a.id,snapshot:a.snapshot},cash:10700,wht:0},{invoice:{id:b.id,snapshot:b.snapshot},cash:10700,wht:0}]});
 const c=await context(p.id);assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.lines.length,2);assert.deepEqual(new Set(c.source.lines.map(l=>l.invoice_id)),new Set([a.id,b.id]));
 await finalize(p.id);assert.equal((await context(p.id)).current.status,'finalized');
});
test('044 legacy unstructured WHT, unknown VAT, and missing frozen lines fail closed without fabricating evidence',async()=>{
 await setup();const unknown=await invoiceSource([{base:1000,vat:0,rate:0,applicable:false}]);const c=await context(unknown.p.id);
 assert.ok(c.source.blockers.includes('vat_evidence_unknown'));assert.ok(c.source.lines.every(l=>!l.category));
 const legacy=await invoiceSource(undefined,null,300);
 // Synthetic pre-036 history: confirmed amount without a structured component.
 await db.exec('alter table finance_payment_wht_components disable trigger user');
 await query('delete from finance_payment_wht_components where payment_id=$1',[legacy.p.id]);
 await db.exec('alter table finance_payment_wht_components enable trigger user');
 const l=await context(legacy.p.id);assert.ok(l.source.blockers.includes('wht_line_evidence_missing'));assert.deepEqual(l.source.lines,[]);
 const s=await invoiceSource();s.snapshot.items=[];await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[s.id,s.snapshot]);
 assert.ok((await context(s.p.id)).source.blockers.includes('frozen_lines_invalid'));
});
test('044 Admin only writes; Partner reads; unauthorized users and anonymous/direct mutations fail',async()=>{
 await setup();const s=await invoiceSource();const c=await context(s.p.id);
 await asActor(ids.staff,async()=>{await rejects('select get_finance_money_allocation($1)',[s.p.id],/PERMISSION_DENIED/);assert.deepEqual(await query('select * from finance_payment_money_allocations'),[]);});
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await save(s.p.id,c);
 await asActor(ids.staff,async()=>{
  const p=await context(s.p.id);assert.equal(p.can_manage,false);assert.equal((await query('select * from finance_payment_money_allocations')).length,1);
  await rejects('select save_finance_money_allocation($1,null,null,$2,$3,\'\')',[s.p.id,p.source,choices(p)],/PERMISSION_DENIED/);
  await rejects('update finance_payment_money_allocations set status=\'finalized\'',[],/permission denied/);
  await rejects('select money_allocation_source($1)',[s.p.id],/permission denied/);
 });
 for(const role of ['anon','authenticated'])assert.equal(await scalar("select has_table_privilege($1,'finance_payment_money_allocations','INSERT,UPDATE,DELETE,TRUNCATE')",[role]),false);
});
test('044 stale source/version, invalid choices, duplicate retries, acknowledgements and audit failures are atomic',async()=>{
 await setup();const s=await invoiceSource(),c=await context(s.p.id),id=await save(s.p.id,c);await save(s.p.id,c);
 assert.equal(await scalar('select count(*) from finance_payment_money_allocations'),1);assert.equal(await scalar('select count(*) from finance_payment_money_allocation_audit'),1);
 await rejects('select save_finance_money_allocation($1,null,null,$2,$3,\'different\')',[s.p.id,c.source,choices(c)],/STALE/);
 await rejects('select save_finance_money_allocation($1,$2,1,$3,$4,\'\')',[s.p.id,id,{},choices(c)],/SOURCE_CHANGED/);
 await rejects('select save_finance_money_allocation($1,$2,1,$3,$4,\'\')',[s.p.id,id,c.source,[...choices(c),...choices(c)]],/CHOICES_INVALID/);
 await rejects('select transition_finance_money_allocation($1,1,$2,\'review\',false,\'\')',[id,c.source],/ACK_REQUIRED/);
 await db.exec("create function fixture_no_audit() returns trigger language plpgsql as $$begin raise exception 'FIXTURE_AUDIT_FAILED';end$$;create trigger fixture_no_audit before insert on finance_payment_money_allocation_audit for each row execute function fixture_no_audit();");
 await rejects('select transition_finance_money_allocation($1,1,$2,\'review\',true,\'\')',[id,c.source],/FIXTURE_AUDIT_FAILED/);
 assert.equal((await context(s.p.id)).current.status,'draft');
});
test('044 Payment reversal/reallocation and Invoice changes require explicit supersession, originals retained',async()=>{
 await setup();const s=await invoiceSource(),target=await invoiceSource();await rpc('correct_erroneous_finance_payment',[target.p.id,'Fixture',true]);await finalize(s.p.id);
 await rejects('select correct_erroneous_finance_payment($1,\'Fixture\',true)',[s.p.id],/SUPERSEDE_REQUIRED/);
 await rejects('insert into finance_payment_allocation_reallocations(payment_id,source_invoice_id,target_invoice_id,cash_moved,wht_moved,reason,request_id) values($1,$2,$3,1,0,\'fixture\',gen_random_uuid())',[s.p.id,s.id,target.id],/SUPERSEDE_REQUIRED/);
 await rejects('update finance_invoices set total_amount=total_amount+1 where id=$1',[s.id],/SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'supersede','Source Payment correction required');await rpc('correct_erroneous_finance_payment',[s.p.id,'Fixture',true]);
 const c=await context(s.p.id);assert.equal(c.current,null);assert.equal(c.eligible_for_future_policy_review,false);assert.ok(c.source.blockers.includes('payment_not_confirmed'));
});
test('044 issued tax correction cannot leave finalized allocation silently valid; corrected source stays blocked',async()=>{
 await setup();const s=await taxSource(true,false);await finalize(s.p.id);
 const id=await correction(args(s));await rpc('approve_finance_tax_correction',[id,await scalar('select draft_snapshot_json from finance_tax_document_corrections where id=$1',[id]),true,'Reviewed',true]);
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,await scalar('select draft_snapshot_json from finance_tax_document_corrections where id=$1',[id])],/SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'supersede','Tax correction requires economic review');await issueCorrection(id);
 const c=await context(s.p.id);assert.ok(c.source.blockers.includes('corrected_document_review_required'));assert.equal(c.current,null);
});

test('044 Draft source changes need fresh evidence; reviewed source changes are blocked',async()=>{
 await setup();const s=await invoiceSource(),target=await invoiceSource();
 await rpc('correct_erroneous_finance_payment',[target.p.id,'Synthetic target cleared',true]);
 const initial=await context(s.p.id),id=await save(s.p.id,initial);
 await rpc('reallocate_finance_payment_allocation',[s.p.id,s.id,target.id,10700,0,'Synthetic wrong Invoice',true,'10000000-0000-4000-8000-000000000044']);
 const stale=await context(s.p.id);assert.equal(stale.source_current,false);assert.equal(stale.current.status,'draft');
 assert.equal(stale.source.lines[0].invoice_id,target.id);assert.deepEqual(stale.current.source_snapshot_json,initial.source);
 await rejects('select transition_finance_money_allocation($1,1,$2,\'review\',true,\'\')',[id,initial.source],/SOURCE_CHANGED/);
 await save(s.p.id,stale);await transition(s.p.id,'review');
 await rejects('select reverse_finance_payment($1,\'Synthetic\')',[s.p.id],/SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'finalize');assert.equal((await context(s.p.id)).source_current,true);
});

module.exports={setup,context,save,transition,finalize,uat};

test('044 exact operator artifacts, catalog/function drift and rollback-only DDL preserve upstream evidence',async()=>{
 await setup(false);const {workflow,catalogSql,filenames}=require('./money-allocation-artifacts.cjs');
 const before=await financialState(),pre=(await query(workflow()[filenames.pre]))[0];
 assert.equal(pre.payment_money_allocation_preflight_pass,true,JSON.stringify(pre));
 await db.exec('savepoint candidate044');await db.exec(migration('44'));const catalog=await query(catalogSql);
 const manifest=path.join(__dirname,'money-allocation-catalog.json');
 if(process.env.UPDATE_MONEY_MANIFEST==='1')fs.writeFileSync(manifest,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifest,'utf8')));
 const artifacts=workflow(),result=(await query(artifacts[filenames.verify]))[0];
 assert.equal(result.payment_money_allocation_foundation_verification_pass,true,JSON.stringify(result));
 assert.deepEqual(result.failed_checks,[]);assert.deepEqual(result.catalog_differences,[]);assert.deepEqual(await financialState(),before);
 await db.exec('alter table finance_payment_money_allocations add column unexpected text');
 const bad=(await query(artifacts[filenames.verify]))[0];assert.equal(bad.checks.exact_new_catalog,false);assert.equal(bad.catalog_differences[0].table_name,'finance_payment_money_allocations');
 await db.exec('rollback to savepoint candidate044');
 assert.ok(artifacts[filenames.dry].startsWith('BEGIN;'));assert.ok(artifacts[filenames.dry].endsWith('ROLLBACK;\n'));
 await db.exec(artifacts[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator044;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator044;'));
 assert.equal(await scalar("select to_regclass('public.finance_payment_money_allocations')"),null);assert.deepEqual(await financialState(),before);
});
