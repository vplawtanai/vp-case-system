/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic in-memory PostgreSQL only. No network or Production credentials.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const money=require('./money-allocation-postgres.test.cjs');
const {source:invoiceSource}=require('./combined-document-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
async function setup(apply=true){
 await money.setup();
 // Legacy DDL predates checked-in history. This local sentinel is only an
 // untouched-data probe, never an asserted Production catalog definition.
 await db.exec("create table finance_compensation_allocations(id uuid primary key,amount numeric);insert into finance_compensation_allocations values('10000000-0000-4000-8000-000000000045',123.45)");
 if(apply)await db.exec(migration('45'));
}
const context=p=>scalar('select get_finance_vp_distribution($1)',[p]);
const choices=c=>c.source.lines.filter(l=>l.classification==='professional_fee').map(l=>({invoice_item_id:l.invoice_item_id,referral_amount:0,company_share_amount:0,work_compensation_amount:l.professional_pool}));
const save=(p,c,d=choices(c),note='Reviewed VP policy')=>{
 const expected=c.current||c.history[0];
 return rpc('save_finance_vp_distribution',[p,expected?.id||null,expected?.version||null,c.source,d,note]);
};
const transition=async(p,action,reason='')=>{const c=await context(p);return rpc('transition_finance_vp_distribution',[c.current.id,c.current.version,c.source,action,true,reason]);};
async function finalize(p){await save(p,await context(p));await transition(p,'review');await transition(p,'finalize');}
const mixed=[
 {base:4000,vat:280,rate:7,applicable:true,classification:'additional_service',description:'Translation',wht:3},
 {base:10000,vat:0,rate:0,applicable:false,treatment:'outside_scope',classification:'professional_fee',description:'Legal work'},
 {base:4672.90,vat:327.10,rate:7,applicable:true,classification:'additional_service',description:'Travel'}
];
async function source(specs=mixed,structuredWht=true){
 const s=await invoiceSource(specs,null,0,false);
 s.snapshot.invoice.client_id=ids.client;
 for(let n=0;n<s.items.length;n++){
  const item=s.items[n],spec=specs[n],chargeId=randomUUID();
  item.description=spec.description||'Arbitrary label';item.source_billable_charge_id=chargeId;
  item.source_snapshot_json={schema_version:2,billable_charge_id:chargeId,ready_snapshot:{schema_version:1,
   charge:{id:chargeId,client_id:ids.client,status:'ready_to_invoice'},
   economic:{classification:spec.classification,revenue_policy_inferred:false,compensation_policy_inferred:false},
   commercial:{currency:'THB',amount_before_vat:item.amount_before_vat,vat_amount:item.vat_amount,total_amount:item.line_total}}};
 }
 // Build classified frozen evidence before computing the synthetic Payment's WHT basis.
 await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[s.id,s.snapshot]);
 if(structuredWht)await rpc('save_finance_payment_wht_lines_draft',[s.p.id,'2026-07-01','bank_transfer',ids.bank,null,null,'Synthetic payer','',s.items.map((item,n)=>({invoice_item_id:item.id,applicability:specs[n].wht?'applies':'does_not_apply',rate_percent:specs[n].wht||null}))]);
 await rpc('confirm_finance_payment',[s.p.id,true]);return s;
}
async function financialState(){
 const tables=['finance_payments','finance_payment_invoice_allocations','finance_payment_allocation_reallocations','finance_payment_wht_components','finance_payment_audit_events',
  'finance_invoices','finance_invoice_items','finance_invoice_settlement_summary','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events',
  'finance_company_ledger','finance_compensation_batches','finance_compensation_allocations','finance_receipts','finance_receipt_invoice_allocations','finance_receipt_audit_events',
  'finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events','finance_combined_documents','finance_document_counters',
  'finance_payment_money_allocations','finance_payment_money_allocation_audit'];
 const result={};for(const t of tables)result[t]=await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${t} t`);return result;
}

test('045 exact VP mixed example; automatic company routing and explicit professional split; no upstream/posting writes',async()=>{
 await setup();const s=await source(),before=await financialState(),c=await context(s.p.id);
 assert.deepEqual(c.source.blockers,[]);assert.equal(c.current,null);assert.equal(c.source.money_allocation,null);
 assert.deepEqual(c.source.totals,{cash:19160,wht:120,vat:607.10,base:18672.90,professional_pool:10000,company_economic:8672.90,company_cash:8552.90});
 const byDescription=Object.fromEntries(c.source.lines.map(l=>[l.description,l]));
 assert.deepEqual(['base','vat','wht','cash','company_economic','company_cash','professional_pool'].map(k=>byDescription.Translation[k]),[4000,280,120,4160,4000,3880,0]);
 assert.equal(byDescription.Travel.company_economic,4672.90);assert.equal(byDescription.Travel.company_cash,4672.90);assert.equal(byDescription['Legal work'].professional_pool,10000);
 const d=choices(c).map(l=>({...l,referral_amount:2000,company_share_amount:4000,work_compensation_amount:4000}));
 const id=await save(s.p.id,c,d);await transition(s.p.id,'review');await transition(s.p.id,'finalize');
 const done=await context(s.p.id);assert.equal(done.current.status,'finalized');assert.equal(done.source_current,true);assert.equal(done.posting_enabled,false);
 assert.deepEqual(done.current.decisions_json,d);assert.deepEqual(await financialState(),before);
 await rejects('update finance_vp_revenue_distributions set note=\'changed\',version=version+1 where id=$1',[id],/IMMUTABLE|TRANSITION_INVALID/);
 await rejects('delete from finance_vp_revenue_distribution_audit where distribution_id=$1',[id],/IMMUTABLE/);
 await transition(s.p.id,'supersede','Correct distribution evidence');const historical=(await context(s.p.id)).history[0];
 assert.deepEqual(historical.source_snapshot_json,done.current.source_snapshot_json);assert.deepEqual(historical.decisions_json,d);
 await save(s.p.id,await context(s.p.id));const next=(await context(s.p.id)).current;assert.equal(next.previous_id,id);assert.equal(next.revision,2);
 assert.deepEqual(await financialState(),before);
});
test('045 professional VAT and WHT are excluded, zero-VAT and explicit nonprofessional classes retain cash distinction',async()=>{
 await setup();
 for(const spec of [
  {base:10000,vat:700,rate:7,applicable:true,wht:3},
  {base:10000,vat:0,rate:0,applicable:false,treatment:'outside_scope'},
  {base:10000,vat:0,rate:0,applicable:false,treatment:'outside_scope',wht:3}
 ]){
  const s=await source([{...spec,classification:'professional_fee'}]),c=await context(s.p.id),pool=spec.wht?9700:10000;
  assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.totals.professional_pool,pool);assert.equal(c.source.totals.company_economic,0);
  assert.equal(c.source.totals.cash,pool+spec.vat);assert.equal(c.source.totals.wht,spec.wht?300:0);await finalize(s.p.id);
 }
 for(const classification of ['additional_service','reimbursable_expense','government_or_court_fee']){
  const s=await source([{base:4000,vat:280,rate:7,applicable:true,wht:3,classification,description:'Professional fee words must not change routing'}]),c=await context(s.p.id);
  assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.totals.professional_pool,0);assert.equal(c.source.totals.company_economic,4000);assert.equal(c.source.totals.company_cash,3880);
  assert.deepEqual(choices(c),[]);await finalize(s.p.id);
 }
});
test('045 no description inference; unknown, unsupported or malformed frozen classification fails closed',async()=>{
 await setup();
 for(const classification of [undefined,null,'other','invented']){
  const s=await source([{base:10000,vat:700,rate:7,applicable:true,classification,description:'ค่าวิชาชีพทนาย professional fee'}]),c=await context(s.p.id);
  assert.ok(c.source.blockers.length>0);assert.equal(c.source.totals.professional_pool,0);
  await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[s.p.id,c.source,[]],/SOURCE_UNPROVEN/);
 }
 const s=await source(),item=s.items[0];item.source_snapshot_json.ready_snapshot.commercial.amount_before_vat=9999;
 await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[s.id,s.snapshot]);
 assert.ok((await context(s.p.id)).source.blockers.length>0);
 const legacy=await invoiceSource();const c=await context(legacy.p.id);assert.ok(c.source.blockers.length>0);assert.equal(c.source.totals.professional_pool,0);
});
test('045 exact cents and whole professional coverage; partial draft cannot be reviewed; no excess/negative/extra choices',async()=>{
 await setup();const s=await source(),c=await context(s.p.id),valid=choices(c),partial=valid.map(x=>({...x,work_compensation_amount:5000}));
 const id=await save(s.p.id,c,partial);
 await rejects('select transition_finance_vp_distribution($1,1,$2,\'review\',true,\'\')',[id,c.source],/REVIEW_REQUIRED|SPLIT/);
 for(const invalid of [[],[...valid,...valid],valid.map(x=>({...x,work_compensation_amount:10000.001})),valid.map(x=>({...x,referral_amount:-1})),valid.map(x=>({...x,referral_amount:1})),valid.map(x=>({...x,category:'company_revenue'})),valid.map(x=>({...x,company_share_amount:null}))]){
  await rejects('select save_finance_vp_distribution($1,$2,1,$3,$4,\'\')',[s.p.id,id,c.source,invalid],/CHOICES_INVALID|SPLIT|POOL_EXCEEDED/);
 }
 await save(s.p.id,await context(s.p.id),valid);await transition(s.p.id,'review');await transition(s.p.id,'finalize');
});
test('045 Admin manages; Partner read-only; other users denied, no direct table/private-function privilege',async()=>{
 await setup();const s=await source(),c=await context(s.p.id);await save(s.p.id,c);
 await asActor(ids.staff,async()=>{await rejects('select get_finance_vp_distribution($1)',[s.p.id],/PERMISSION_DENIED/);assert.deepEqual(await query('select * from finance_vp_revenue_distributions'),[]);});
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{
  const p=await context(s.p.id);assert.equal(p.can_manage,false);assert.equal((await query('select * from finance_vp_revenue_distributions')).length,1);
  await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[s.p.id,p.source,choices(p)],/PERMISSION_DENIED/);
  await rejects('select transition_finance_vp_distribution($1,1,$2,\'review\',true,\'\')',[p.current.id,p.source],/PERMISSION_DENIED/);
  await rejects('update finance_vp_revenue_distributions set status=\'finalized\'',[],/permission denied/);
  await rejects('select vp_distribution_source($1)',[s.p.id],/permission denied/);
 });
 for(const role of ['anon','authenticated'])for(const t of ['finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'])assert.equal(await scalar('select has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE,TRUNCATE\')',[role,t]),false);
});
test('045 optimistic stale protection, idempotent retry, acknowledgement and atomic audit failure',async()=>{
 await setup();const s=await source(),c=await context(s.p.id),id=await save(s.p.id,c);assert.equal(await save(s.p.id,c),id);
 assert.equal(await scalar('select count(*) from finance_vp_revenue_distributions'),1);assert.equal(await scalar('select count(*) from finance_vp_revenue_distribution_audit'),1);
 await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'Different\')',[s.p.id,c.source,choices(c)],/STALE/);
 await rejects('select save_finance_vp_distribution($1,$2,1,$3,$4,\'\')',[s.p.id,id,{},choices(c)],/SOURCE_CHANGED/);
 await rejects('select transition_finance_vp_distribution($1,1,$2,\'review\',false,\'\')',[id,c.source],/ACK_REQUIRED/);
 await db.exec("create function fixture_distribution_no_audit() returns trigger language plpgsql as $$begin raise exception 'FIXTURE_AUDIT_FAILED';end$$;create trigger fixture_distribution_no_audit before insert on finance_vp_revenue_distribution_audit for each row execute function fixture_distribution_no_audit();");
 await rejects('select transition_finance_vp_distribution($1,1,$2,\'review\',true,\'\')',[id,c.source],/FIXTURE_AUDIT_FAILED/);assert.equal((await context(s.p.id)).current.status,'draft');
});
test('045 trusted-write mistakes cannot forge source, skip an audited version, or rewrite final history',async()=>{
 await setup();const s=await source(),c=await context(s.p.id),fake=structuredClone(c.source.money_source);
 fake.lines[0].description='Forged source text';
 const forged=await scalar('select vp_distribution_frozen_source($1,null)',[fake]);
 await rejects('insert into finance_vp_revenue_distributions(payment_id,revision,source_snapshot_json,decisions_json,created_by) values($1,1,$2,$3,$4)',[s.p.id,forged,choices(c),ids.admin],/SOURCE_UNPROVEN/);
 const id=await save(s.p.id,c);
 await rejects(`do $fixture$ declare a finance_vp_revenue_distributions%rowtype;begin
  update finance_vp_revenue_distributions set note='Unaudited intermediate',version=version+1,updated_at=clock_timestamp() where id='${id}';
  update finance_vp_revenue_distributions set note='Audited last version',version=version+1,updated_at=clock_timestamp() where id='${id}' returning * into a;
  insert into finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json) values(a.id,'saved',auth.uid(),a.updated_at,to_jsonb(a));
 end;$fixture$`,[],/AUDIT_REQUIRED|AUDIT_INVALID/);
 await transition(s.p.id,'review');await transition(s.p.id,'finalize');
 await rejects('update finance_vp_revenue_distributions set status=\'superseded\',superseded_at=clock_timestamp(),superseded_by=$2,supersede_reason=\'Synthetic\',reviewed_at=created_at,version=version+1,updated_at=clock_timestamp() where id=$1',[id,ids.admin],/IMMUTABLE/);
 await rejects('truncate finance_vp_revenue_distribution_audit',[],/IMMUTABLE/);
 await rejects('truncate finance_payment_money_allocation_audit,finance_payment_money_allocations',[],/SUPERSEDE_REQUIRED|foreign key/);
});
test('045 old create requests cannot cross superseded revisions, while exact successor retry stays idempotent',async()=>{
 await setup();const s=await source(),original=await context(s.p.id),first=await save(s.p.id,original);
 await transition(s.p.id,'supersede','Explicit new revision');
 await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,$4)',[s.p.id,original.source,choices(original),'Reviewed VP policy'],/STALE/);
 const successor=await context(s.p.id),id=await save(s.p.id,successor);assert.notEqual(id,first);
 assert.equal(await save(s.p.id,successor),id);
 await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,$4)',[s.p.id,original.source,choices(original),'Reviewed VP policy'],/STALE/);
 assert.equal(await scalar('select count(*) from finance_vp_revenue_distributions'),2);
 assert.equal(await scalar('select count(*) from finance_vp_revenue_distribution_audit'),3);
});
test('045 contradictory frozen client identities fail closed even when classification and monetary totals match',async()=>{
 await setup();const spec=[{base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee'}];const s=await source(spec,false);
 s.items[0].source_snapshot_json.ready_snapshot.charge.client_id=randomUUID();
 await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[s.id,s.snapshot]);
 let c=await context(s.p.id);assert.deepEqual(c.source.money_source.blockers,[]);assert.ok(c.source.blockers.length>0);
 await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[s.p.id,c.source,choices(c)],/SOURCE_UNPROVEN/);
 const other=await source(spec,false),wrong=randomUUID();other.snapshot.invoice.client_id=wrong;
 for(const item of other.items)item.source_snapshot_json.ready_snapshot.charge.client_id=wrong;
 await query('update finance_invoices set issued_snapshot_json=$2 where id=$1',[other.id,other.snapshot]);
 c=await context(other.p.id);assert.deepEqual(c.source.money_source.blockers,[]);assert.ok(c.source.blockers.length>0);
 await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[other.p.id,c.source,choices(c)],/SOURCE_UNPROVEN/);
});
test('045 Payment reversal requires supersession without linked 044 row, preserved evidence never silently current',async()=>{
 await setup();const s=await source();await finalize(s.p.id);
 await rejects('select correct_erroneous_finance_payment($1,\'Synthetic\',true)',[s.p.id],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
 await rejects('update finance_invoices set total_amount=total_amount+1 where id=$1',[s.id],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'supersede','Payment recorded in error');await rpc('correct_erroneous_finance_payment',[s.p.id,'Synthetic',true]);
 const c=await context(s.p.id);assert.equal(c.current,null);assert.ok(c.source.blockers.includes('payment_not_confirmed'));assert.equal(c.history[0].status,'superseded');
});
test('045 044 record creation/supersession stales Draft, blocks finalized distribution; conflicting ownership fails closed',async()=>{
 await setup();const s=await source();await save(s.p.id,await context(s.p.id));
 await money.save(s.p.id,await money.context(s.p.id));let c=await context(s.p.id);assert.equal(c.source_current,false);
 await rejects('select transition_finance_vp_distribution($1,1,$2,\'review\',true,\'\')',[c.current.id,c.source],/SOURCE_CHANGED/);
 await save(s.p.id,c);await transition(s.p.id,'review');
 await rejects('select transition_finance_money_allocation($1,1,$2,\'supersede\',true,\'Correct\')',[(await money.context(s.p.id)).current.id,(await money.context(s.p.id)).source],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'supersede','044 ownership review');await money.transition(s.p.id,'supersede','Review ownership');
 const m=await money.context(s.p.id);await money.save(s.p.id,m,m.source.lines.map(l=>({invoice_item_id:l.invoice_item_id,category:'client_money',reason:'Explicit conflicting ownership'})));
 c=await context(s.p.id);assert.ok(c.source.blockers.length>0);await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[s.p.id,c.source,choices(c)],/SOURCE_UNPROVEN/);
 const other=await source();await finalize(other.p.id);
 await rejects('select save_finance_money_allocation($1,null,null,$2,$3,\'\')',[other.p.id,(await money.context(other.p.id)).source,(await money.context(other.p.id)).source.lines.map(l=>({invoice_item_id:l.invoice_item_id,category:'company_revenue',reason:'Review'}))],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
});
test('045 real reallocation cannot silently retain reviewed evidence; Draft source is visibly stale',async()=>{
 await setup();const spec=[{base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee'}];
 // Ordinary zero-WHT history has no structured components. The existing component
 // workflow independently blocks reallocation of newer line-review Payments.
 const a=await source(spec,false),b=await source(spec,false);await rpc('correct_erroneous_finance_payment',[b.p.id,'Synthetic target cleared',true]);
 await finalize(a.p.id);
 await rejects('select reallocate_finance_payment_allocation($1,$2,$3,10700,0,\'Synthetic wrong Invoice\',true,$4)',[a.p.id,a.id,b.id,randomUUID()],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
 await transition(a.p.id,'supersede','Source allocation correction');await save(a.p.id,await context(a.p.id));
 const old=await context(a.p.id);
 await rpc('reallocate_finance_payment_allocation',[a.p.id,a.id,b.id,10700,0,'Synthetic wrong Invoice',true,randomUUID()]);
 const stale=await context(a.p.id);assert.equal(stale.source_current,false);assert.equal(stale.current.status,'draft');assert.deepEqual(stale.current.source_snapshot_json,old.source);
 await rejects('select transition_finance_vp_distribution($1,$2,$3,\'review\',true,\'\')',[old.current.id,old.current.version,old.source],/SOURCE_CHANGED/);
 // The post-reallocation WHT/source evidence is not silently fabricated to make it eligible.
 if(stale.source.blockers.length)await rejects('select save_finance_vp_distribution($1,$2,$3,$4,$5,\'\')',[a.p.id,stale.current.id,stale.current.version,stale.source,choices(stale)],/SOURCE_UNPROVEN/);
});
test('045 issued tax correction requires explicit distribution supersession and blocks further automatic distribution',async()=>{
 await setup();const combined=require('./combined-document-postgres.test.cjs'),correction=require('./tax-correction-postgres.test.cjs');
 const s=await source([{base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee'}]);
 const profile=await scalar('select get_finance_customer_tax_profile($1)',[ids.client]);
 await scalar('select save_finance_customer_tax_profile($1,$2,$3,$4,$5,$6,$7,$8)',[ids.client,true,'head_office','00000','Synthetic written evidence',true,profile.identity,profile.profile?.updated_at||null]);
 const cid=await combined.create(s.p.id);await combined.save(cid,{external_coverage_checked:true,no_earlier_event:true});await combined.issue(cid);
 const tid=(await combined.combined(cid)).tax_invoice_id,item=await scalar('select id from finance_tax_invoice_items where tax_invoice_id=$1',[tid]);
 await finalize(s.p.id);const id=await correction.create(correction.args({tid,cid,item}));await correction.approve(id);
 await rejects('select issue_finance_tax_correction($1,$2,true,true)',[id,(await correction.row(id)).draft_snapshot_json],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
 await transition(s.p.id,'supersede','Issued tax source requires review');await correction.issue(id);
 const c=await context(s.p.id);assert.ok(c.source.blockers.includes('corrected_document_review_required'));assert.equal(c.current,null);
});
test('045 exact operator catalog/functions, drift diagnostics, SELECT-only and rollback-only rehearsal',async()=>{
 await setup(false);const {workflow,catalogSql,filenames}=require('./vp-distribution-artifacts.cjs');const before=await financialState();
 const pre=(await query(workflow()[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 await db.exec('savepoint candidate045');await db.exec(migration('45'));const catalog=await query(catalogSql),manifest=path.join(__dirname,'vp-distribution-catalog.json');
 if(process.env.UPDATE_DISTRIBUTION_MANIFEST==='1')fs.writeFileSync(manifest,JSON.stringify(catalog,null,2)+'\n');
 assert.deepEqual(catalog,JSON.parse(fs.readFileSync(manifest,'utf8')));
 const files=workflow(),verify=(await query(files[filenames.verify]))[0];assert.deepEqual(verify.failed_checks,[],JSON.stringify(verify));assert.deepEqual(verify.catalog_differences,[]);
 await db.exec('alter table finance_vp_revenue_distributions add column unexpected text');
 const bad=(await query(files[filenames.verify]))[0];assert.equal(bad.checks.exact_new_catalog,false);assert.equal(bad.catalog_differences[0].table_name,'finance_vp_revenue_distributions');
 await db.exec('rollback to savepoint candidate045');
 await db.exec(files[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator045;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator045;'));
 assert.equal(await scalar("select to_regclass('public.finance_vp_revenue_distributions')"),null);assert.deepEqual(await financialState(),before);
});

module.exports={setup,source,context,choices,save,transition,finalize,financialState};
