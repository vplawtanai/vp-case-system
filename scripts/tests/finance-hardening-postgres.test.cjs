/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated PGlite only; synthetic reviewed rules are not Thai tax-law configuration.
require('./receipt-render-fixture.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const snapshot=require('./tax-filing-snapshot-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const month='2026-09-01';
const spec=(extra={})=>({filing_type:'vat',channel:'online',status:'reviewed',effective_from:month,effective_to:month,due_day:15,holiday_policy:'next_business_day_reviewed',calendar_from:'2026-10-01',calendar_to:'2026-10-31',weekend_days:[0,6],closed_dates:['2026-10-15','2026-10-16'],reference:'SYNTHETIC TEST ONLY',reason:'Synthetic reviewed calendar',...extra});
async function setup(){await snapshot.setup();await db.exec(migration('54'));}
const deadline=(channel='online')=>scalar('select get_finance_tax_deadline($1,\'vat\',$2)',[month,channel]);
const publish=async(s=spec(),id=randomUUID())=>{await rpc('publish_finance_tax_deadline_rule',[id,s,true]);return id;};
const fingerprint=()=>scalar("select md5(tax_filing_pool($1,'vat')::text)",[month]);
async function create(channel='online',override=null,id=randomUUID(),expected=null){return rpc('create_finance_tax_filing_review',[id,month,'vat',await fingerprint(),channel,expected||await deadline(channel),override]);}
test('054 no rule invents no date; frozen VAT 700/coverage 0 remains unready; no old-RPC bypass',async()=>{
 await setup();const d=await deadline();assert.equal(d.due_date,null);assert.equal(d.status,'review_required');
 const id=randomUUID();await create('online',null,id);await db.exec('set constraints all immediate');
 const f=await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[id]);assert.equal(f.source_snapshot_json.monthly_facts.output_vat,700);assert.equal(f.source_snapshot_json.allocation_coverage.source_count,0);assert.equal(f.tax_amount,null);assert.equal(f.source_snapshot_json.ready,false);assert.equal(f.deadline_snapshot_json.channel,'online');assert.equal(f.due_date,null);
 await create('online',null,id,d);assert.equal(await scalar('select count(*)::int from finance_tax_filing_audit'),1);
 await asActor(ids.admin,()=>rejects("select create_finance_tax_filing($1,$2,'vat','x',null,null)",[randomUUID(),month],/permission denied/));
 await rejects("select transition_finance_tax_filing($1,1,'ready_for_review',null,null,null,true)",[id],/NOT_READY/);
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),0);
});
test('054 reviewed channel/calendar rules, versioned audit, unknown coverage and no silent holiday assumptions',async()=>{
 await setup();for(const bad of [{weekend_days:['6']},{weekend_days:[null]},{weekend_days:[0.5]},{closed_dates:[null]}])await rejects('select publish_finance_tax_deadline_rule($1,$2,true)',[randomUUID(),spec(bad)],/RULE_INVALID/);
 const s=spec(),rule=await publish(s);assert.equal(await publish(s,rule),rule);
 const d=await deadline();assert.equal(d.normal_due_date,'2026-10-15');assert.equal(d.due_date,'2026-10-19');assert.equal(d.rule.reviewed_by,ids.admin);assert.ok(d.rule.reviewed_at);assert.equal((await deadline('paper')).due_date,null);
 await publish(spec({channel:'paper',due_day:7,holiday_policy:'no_adjustment_reviewed'}));assert.equal((await deadline('paper')).due_date,'2026-10-07');
 await rejects('update finance_tax_deadline_rules set status=\'withdrawn\' where id=$1',[rule],/IMMUTABLE/);
 await rejects('delete from finance_tax_deadline_rules where id=$1',[rule],/IMMUTABLE/);
 await rejects('select publish_finance_tax_deadline_rule($1,$2,true)',[randomUUID(),spec()],/CONFLICT/);
 await publish(spec({supersedes_id:rule,calendar_to:'2026-10-16'}));assert.equal((await deadline()).due_date,null);
 const last=await scalar('select id from finance_tax_deadline_rules where channel=\'online\' order by version desc limit 1');
 await publish(spec({supersedes_id:last,status:'withdrawn'}));assert.equal((await deadline()).due_date,null);
});
test('054 frozen calculated date and Admin override are audited; Finance cannot publish/override; stale rule fails',async()=>{
 await setup();const old=await deadline();await publish();
 await rejects('select create_finance_tax_filing_review($1,$2,\'vat\',$3,\'online\',$4,null)',[randomUUID(),month,await fingerprint(),old],/SOURCE_CHANGED/);
 await query("update user_profiles set role='staff',can_manage_finance_tax_invoices=true where id=$1",[ids.staff]);
 const fp=await fingerprint();
 await asActor(ids.staff,async()=>{
  await rejects('select publish_finance_tax_deadline_rule($1,$2,true)',[randomUUID(),spec()],/ADMIN_REQUIRED/);
  await rejects('select create_finance_tax_filing_review($1,$2,\'vat\',$3,\'online\',$4,$5)',[randomUUID(),month,fp,await deadline(),{due_date:'2026-10-22',reason:'x',reference:'test'}],/ADMIN_REQUIRED/);
  await rejects('select * from finance_tax_deadline_rules',[],/permission denied/);
 });
 const id=randomUUID(),override={due_date:'2026-10-22',reason:'Synthetic exception',reference:'Synthetic announcement'};
 await create('online',override,id);await db.exec('set constraints all immediate');const f=await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[id]);
 assert.equal(f.due_date,'2026-10-22');assert.equal(f.deadline_snapshot_json.override_actor,ids.admin);assert.equal(f.deadline_snapshot_json.reviewed.due_date,'2026-10-19');
 assert.deepEqual(await scalar('select evidence_json from finance_tax_filing_audit where filing_id=$1',[id]),f);
 await rejects("update finance_tax_filings set deadline_snapshot_json='{}' where id=$1",[id],/IMMUTABLE/);
 assert.equal(f.tax_amount,null);assert.equal(f.source_snapshot_json.ready,false);
});
test('054 Treasury account-specific cutoff, complete monthly flow, historical exclusion and strict RPC guard',async()=>{
 await setup();await treasury.opening({amount:0,start:'2026-09-10'});
 const input=direct.input();input.received_on='2026-09-15';const id=randomUUID();await direct.save(id,input);await direct.transition(id,1,'confirm');await db.exec('set constraints all immediate');
 const flow=await scalar('select get_finance_treasury_month_flow($1)',[month]);assert.equal(flow.cash,29212.81);assert.equal(flow.pre_cutoff,18812.81);assert.equal(flow.represented,10400);assert.equal(flow.pending,0);assert.equal(flow.unresolved,0);
 const state=await scalar('select get_finance_treasury()'),{treasuryOverview}=require('../../app/finance/treasury/dashboard.ts');const view=treasuryOverview(state);
 assert.equal(view.eligible.length,0);assert.equal(view.historical.length,2);assert.equal(state.accounts.find(a=>a.bank_account_id===ids.bank).system_balance,10400);
 const source=state.pending_sources[0];await rejects('select materialize_finance_treasury_source($1,$2,$3,true,null)',[source.source_type,source.source_id,source],/BEFORE_CUTOVER/);
});
test('054 exact catalog fixture',async()=>{
 await setup();const artifacts=require('./finance-hardening-artifacts.cjs');const rows=await query(artifacts.catalogSql);
 if(process.env.WRITE_054_MANIFEST==='1')fs.writeFileSync(artifacts.manifestPath,JSON.stringify(rows,null,2)+'\n');
 else assert.deepEqual(rows,JSON.parse(fs.readFileSync(artifacts.manifestPath,'utf8')));
});
test('054 monthly flow preserves one-bank visibility, denied readers and zero versus unavailable boundaries',async()=>{
 await setup();await asActor(ids.staff,()=>rejects('select get_finance_treasury_month_flow($1)',[month],/PERMISSION_DENIED/));
 await query('update user_profiles set can_view_finance_cash_transactions=true where id=$1',[ids.staff]);
 await asActor(ids.staff,async()=>assert.equal((await scalar('select get_finance_treasury_month_flow($1)',[month])).cash,0));
 await query('insert into finance_bank_account_access values($1,$2,true)',[ids.staff,ids.bank]);
 await asActor(ids.staff,async()=>{const flow=await scalar('select get_finance_treasury_month_flow($1)',[month]);assert.equal(flow.cash,18812.81);assert.equal(flow.unresolved,18812.81);assert.equal(flow.represented,0);});
});
test('054 new reviewed entry preserves WHT allocation/readiness/remittance and rolls back failed audit',async()=>{
 await setup();const payout=require('./payout-postgres.test.cjs'),rights=await payout.rights();await payout.payee();await treasury.opening({amount:10000});const payment=await payout.save(rights);await payout.confirm(payment);await payout.flush();
 await publish(spec({filing_type:'wht_natural'}));const d=await scalar("select get_finance_tax_deadline($1,'wht_natural','online')",[month]),fp=await scalar("select md5(tax_filing_pool($1,'wht_natural')::text)",[month]),id=randomUUID();
 const args=[id,month,'wht_natural',fp,'online',d,null];
 await db.exec("create function fixture_deadline_audit_failure() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end$$; create trigger fixture_deadline_audit_failure before insert on finance_tax_filing_audit for each row execute function fixture_deadline_audit_failure()");
 await rejects('select create_finance_tax_filing_review($1,$2,$3,$4,$5,$6,$7)',args,/SYNTHETIC_AUDIT_FAILURE/);assert.equal(await scalar('select count(*)::int from finance_tax_filings'),0);assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations'),0);
 await db.exec('drop trigger fixture_deadline_audit_failure on finance_tax_filing_audit');await query('update user_profiles set can_manage_finance_tax_invoices=true where id=$1',[ids.staff]);
 await asActor(ids.staff,()=>rpc('create_finance_tax_filing_review',args));await payout.flush();
 const frozen=await scalar('select to_jsonb(f) from finance_tax_filings f where id=$1',[id]);assert.equal(frozen.tax_amount,93.12);assert.equal(frozen.deadline_snapshot_json.due_date,'2026-10-19');assert.equal(frozen.created_by,ids.staff);assert.equal(await scalar('select count(*)::int from finance_tax_filing_allocations'),2);
 await rpc('transition_finance_tax_filing',[id,1,'ready_for_review',null,null,null,true]);await rpc('transition_finance_tax_filing',[id,2,'filed','2026-09-10','SYNTHETIC','Synthetic external filing',true]);
 const account=(await scalar('select get_finance_tax_filings($1)',[month])).accounts.find(a=>a.bank_account_id===ids.bank),r=randomUUID();
 await rpc('create_finance_tax_remittance',[r,id,ids.bank,null,'2026-09-11','SYNTHETIC','Synthetic external payment',account]);await rpc('transition_finance_tax_remittance',[r,1,'confirmed',true]);await payout.flush();
 assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_tax_remittance_id=$1',[r]),1);assert.deepEqual(await scalar('select deadline_snapshot_json from finance_tax_filings where id=$1',[id]),frozen.deadline_snapshot_json);
});
module.exports={setup};

test('054 exact SELECT artifacts, manifest drift, literal rollback and protected evidence',async()=>{
 const {workflow,filenames}=require('./finance-hardening-artifacts.cjs');await snapshot.setup();const files=workflow();
 for(const [file,sql] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 await db.exec('savepoint before054');await db.exec(migration('54'));
 const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));assert.deepEqual(post.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 await db.exec('alter table finance_tax_deadline_rules add column unexpected text');assert.ok((await query(files[filenames.verify]))[0].catalog_differences.length);
 await db.exec('rollback to before054');await db.exec('commit');
 const results=await db.exec(files[filenames.dry]),verified=results.flatMap(r=>r.rows).find(r=>'finance_ux_integrity_hardening_verification_pass' in r);
 assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));assert.deepEqual(verified.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 assert.equal(await scalar("select to_regclass('public.finance_tax_deadline_rules')"),null);
 assert.deepEqual((await query(files[filenames.pre]))[0].upstream_evidence_hashes,pre.upstream_evidence_hashes);
});
