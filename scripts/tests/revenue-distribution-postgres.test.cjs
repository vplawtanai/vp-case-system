/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL only; no network or Production credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const docs=require('./direct-money-documents-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),payment=require('./vp-distribution-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {resolved,people}=require('./vp-formula.test.cjs'),{calculateFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const engine=require('../../app/finance/compensation/formula-engine.ts');
const apply=()=>db.exec(migration('67'));
async function setup(){await docs.setup();await apply();}
const context=(type,id)=>scalar('select get_finance_revenue_distribution_detail($1,$2)',[type,id]);
function choices(c){return c.source.lines.filter(l=>l.classification==='professional_fee').map(l=>{const f=calculateFormula(l.professional_pool,resolved('source_worker_qc',l.professional_pool),people).result;return {...(l.source_line_id?{source_line_id:l.source_line_id}:{invoice_item_id:l.invoice_item_id}),formula_result:f,referral_amount:f.referral_amount,company_share_amount:f.company_share_amount,work_compensation_amount:f.work_compensation_amount};});}
function args(type,id,c,note='Synthetic reviewed formula'){const prior=c.current||c.history[0];return [type==='payment'?id:null,type==='direct_money_receipt'?id:null,prior?.id||null,prior?.version||null,c.source,choices(c),note,true];}
const confirm=a=>rpc('confirm_finance_vp_received_distribution',a);
async function unchanged(){const names=(await query("select tablename from pg_tables where schemaname='public' and tablename like 'finance_%' order by tablename")).map(r=>r.tablename).filter(n=>!/^finance_(vp_revenue_distribution|payable_entitlement)/.test(n));return Object.fromEntries(await Promise.all(names.map(async n=>[n,await scalar("select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public."+n+" r")])));}
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
const spec=(extra={})=>({base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee',...extra});

for(const extra of [{vat:0,rate:0,applicable:false,treatment:'outside_scope'},{},{wht:3}])test('067 Payment v2 authoritative base '+JSON.stringify(extra),async()=>{
 await setup();const s=await payment.source([spec(extra)]),c=await context('payment',s.p.id);
 assert.deepEqual(c.source.blockers,[]);assert.equal(c.source.policy_version,'vp_distribution_v2');assert.equal(c.source.totals.professional_pool,10000);
 const before=await unchanged(),a=args('payment',s.p.id,c),attempts=await Promise.all(Array.from({length:5},()=>confirm(a))),id=attempts[0];assert.equal(new Set(attempts).size,1);await flush();assert.equal(await confirm(a),id);
 const done=await context('payment',s.p.id);assert.equal(done.current.status,'finalized');assert.equal(done.summary.state,'unpaid');assert.equal(done.summary.basis,10000);
 assert.deepEqual(await unchanged(),before);assert.equal(await scalar('select count(*)::int from finance_vp_revenue_distributions where payment_id=$1',[s.p.id]),1);
});
for(const taxable of [true,false])test('067 Direct v2 basis, atomic confirmation/retry and 066 documents '+taxable,async()=>{
 await setup();const sid=await docs.source(taxable),c=await context('direct_money_receipt',sid),docSource=await scalar('select document_direct_source($1)',[sid]);
 assert.equal(c.source.totals.professional_pool,10000);assert.equal(c.summary.cash,taxable?10400:10000);assert.equal(c.summary.wht,taxable?300:0);
 const before=await unchanged(),a=args('direct_money_receipt',sid,c),attempts=await Promise.all(Array.from({length:5},()=>confirm(a)));
 assert.equal(new Set(attempts).size,1);await flush();const done=await context('direct_money_receipt',sid);
 assert.equal(done.current.version,3);assert.equal(done.audit.length,3);assert.equal(done.summary.rights,2);
 const rights=await scalar('select jsonb_agg(to_jsonb(e) order by id) from finance_payable_entitlements e');await confirm(a);
 assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(e) order by id) from finance_payable_entitlements e'),rights);
 assert.deepEqual(await unchanged(),before);assert.deepEqual(await scalar('select document_direct_source($1)',[sid]),docSource);
 const did=await docs.create(sid);if(taxable){await docs.save(did);await docs.issue(did);}else await rpc('issue_finance_receipt',[did,true,await scalar('select draft_snapshot_json from finance_receipts where id=$1',[did])]);
 assert.equal((await docs.decision(sid)).decision,'complete');assert.equal((await context('direct_money_receipt',sid)).current.id,attempts[0]);
 if(process.env.CAPTURE_067_UI && taxable)require('node:fs').writeFileSync('/private/tmp/revenue-067-detail.json',JSON.stringify(done));
});
test('067 preserves reviewed/finalized v1 snapshots/audits/rights and v1 source projection without backfill',async()=>{
 await docs.setup();const sid=await docs.source(),old=await direct.context(sid),d=choices(old);
 assert.equal(old.source.totals.professional_pool,9700);const id=await rpc('save_finance_direct_vp_distribution',[sid,null,null,old.source,d,'Original v1']);
 await rpc('transition_finance_vp_distribution',[id,1,old.source,'review',true,'']);
 const before=await docs.money(),reviewed=await direct.context(sid);await apply();assert.deepEqual(await docs.money(),before);
 assert.deepEqual((await context('direct_money_receipt',sid)).source,old.source);
 assert.deepEqual(await scalar('select vp_received_frozen($1)',[old.source]),old.source);
 const a=args('direct_money_receipt',sid,reviewed,'Original v1');await confirm(a);await confirm(a);await flush();
 const final=await context('direct_money_receipt',sid);assert.equal(final.current.source_snapshot_json.policy_version,'vp_distribution_v1');assert.equal(final.summary.basis,9700);
 const frozen=await docs.money();assert.deepEqual(await scalar('select vp_received_frozen($1)',[final.current.source_snapshot_json]),old.source);assert.deepEqual(await docs.money(),frozen);
});
test('067 saved draft atomic confirm, stale/ack/identity denial and audit failure roll back fully',async()=>{
 await setup();const sid=await docs.source(),c=await context('direct_money_receipt',sid),a=args('direct_money_receipt',sid,c);
 await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',[...a.slice(0,7),false],/ACK_REQUIRED/);
 const id=await rpc('save_finance_direct_vp_distribution',[sid,null,null,c.source,choices(c),'Synthetic reviewed formula']);const draft=await context('direct_money_receipt',sid);
 await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',[null,sid,id,999,...a.slice(4)],/STALE/);
 await db.exec("create function fixture_067_fail() returns trigger language plpgsql as $$begin raise exception '067_AUDIT_FAILURE';end$$;create trigger fixture_067_fail before insert on finance_vp_revenue_distribution_audit for each row when(new.event_type='finalized') execute function fixture_067_fail();");
 const before=await docs.money();await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',args('direct_money_receipt',sid,draft),/067_AUDIT_FAILURE/);assert.deepEqual(await docs.money(),before);
 await db.exec('drop trigger fixture_067_fail on finance_vp_revenue_distribution_audit');const ca=args('direct_money_receipt',sid,draft);await confirm(ca);await confirm(ca);await flush();
 await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',[...ca.slice(0,6),'Different',true],/STALE/);
});
test('067 mixed authoritative classes preserve company routing; unsupported nature and partial Payment remain blocked',async()=>{
 await setup();const p=await payment.source([spec({wht:3}),spec({base:4000,vat:280,classification:'government_or_court_fee',wht:3})]);
 let c=await context('payment',p.p.id);assert.equal(c.source.totals.professional_pool,10000);assert.equal(c.source.totals.company_economic,4000);assert.equal(c.source.totals.company_cash,3880);await confirm(args('payment',p.p.id,c));
 for(const nature of ['unclassified','client_money','reimbursement_or_pass_through']){const id=randomUUID(),l=direct.line({money_nature:nature,classification:null,vat_applicable:false,vat_rate:0,vat_treatment_json:nature==='unclassified'?null:{treatment:'outside_scope',reason:'Synthetic evidence'},wht_applicability:'does_not_apply',wht_base:null,wht_rate:null});await direct.save(id,direct.input([l],10000));await direct.transition(id,1,'confirm');c=await context('direct_money_receipt',id);assert.ok(c.source.blockers.length);assert.equal(c.summary.basis,null);await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',args('direct_money_receipt',id,c),/SOURCE_CHANGED/);}
 const frozen=structuredClone((await context('payment',p.p.id)).source);frozen.money_source.lines[0].partial=true;
 // Actual partial coverage is tested by the upstream 044/045 suites; v2 never clears its blocker.
 const blocked=await scalar("select vp_distribution_policy($1,'vp_distribution_v2')",[{...frozen,policy_version:'vp_distribution_v1',blockers:['partial_line_evidence_missing']}]);assert.deepEqual(blocked.blockers,['partial_line_evidence_missing']);
});
test('067 exact-cent multirole formula and database recomputation total the v2 basis',async()=>{
 await setup();const sid=await docs.source(),c=await context('direct_money_receipt',sid),input=resolved('source_worker_qc',10000);
 for(const [role,type] of [['Co-Lawyer / Co-Worker','worker'],['Assistant','assistant'],['Quality Controller','qc']])input.rows.push({...engine.createAllocation(type,'',10,false,role),recipient_user_id:people[0].id});
 input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);const f=calculateFormula(10000,input,people);assert.deepEqual(f.errors,[]);
 const a=args('direct_money_receipt',sid,c);a[5][0]={...a[5][0],formula_result:f.result,referral_amount:f.result.referral_amount,company_share_amount:f.result.company_share_amount,work_compensation_amount:f.result.work_compensation_amount};await confirm(a);await flush();
 assert.equal(f.result.recipients.reduce((n,r)=>n+Math.round(r.amount*100),0),1000000);assert.equal((await context('direct_money_receipt',sid)).summary.rights,5);
});
test('067 workspace filters, pagination counts and inherited permissions; no direct helper access',async()=>{
 await setup();const sid=await docs.source(),c=await context('direct_money_receipt',sid);let w=await scalar("select get_finance_revenue_distribution_workspace('2026-09-01','direct_money_receipt','all',$1,0)",[sid.slice(0,8)]);assert.equal(w.count,1);assert.equal(w.rows[0].source_id,sid);assert.equal(w.summary[0].amount,10000);
 assert.equal((await scalar("select get_finance_revenue_distribution_workspace('2025-01-01','payment','all','',0)")).count,0);
 await asActor(ids.staff,()=>rejects('select get_finance_revenue_distribution_workspace()',[],/PERMISSION_DENIED/));await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{assert.equal((await context('direct_money_receipt',sid)).can_manage,false);await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',args('direct_money_receipt',sid,c),/PERMISSION_DENIED/);await rejects("select vp_distribution_policy('{}','vp_distribution_v2')",[],/permission denied/);});
 await asActor(ids.admin,()=>confirm(args('direct_money_receipt',sid,c)));w=await scalar("select get_finance_revenue_distribution_workspace(null,'all','unpaid',$1,0)",[sid.slice(0,8)]);assert.equal(w.count,1);assert.equal(w.rows[0].state,'unpaid');
 assert.equal(await scalar("select has_function_privilege('service_role','vp_distribution_policy(jsonb,text)','EXECUTE')"),true);
 assert.equal(await scalar("select has_function_privilege('authenticated','vp_distribution_policy(jsonb,text)','EXECUTE')"),false);
});
module.exports={setup,apply,context,choices,args,confirm,unchanged};
test('067 capture local definitions for offline gate generation',{skip:!process.env.CAPTURE_067_CONTRACT},async()=>{
 await docs.setup();const a=require('./direct-money-documents-artifacts.cjs');
 const capture=async()=>({functions:await scalar(a.functionsSql),catalog:await scalar(a.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const before=await capture();await apply();const after=await capture();require('node:fs').writeFileSync('/private/tmp/revenue-067-local-contract.json',JSON.stringify({before,after}));
});
test('067 compact SELECT-only gates fail closed, preserve rows and independently verify rollback',async()=>{
 await docs.setup();const sid=await docs.source(),c=await direct.context(sid),id=await rpc('save_finance_direct_vp_distribution',[sid,null,null,c.source,choices(c),'v1 before gate']);
 await rpc('transition_finance_vp_distribution',[id,1,c.source,'review',true,'']);
 const a=require('./revenue-distribution-artifacts.cjs'),raw=require('./direct-money-documents-artifacts.cjs');
 const capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const local={before:await capture()};await db.exec('savepoint local067');await apply();local.after=await capture();await db.exec('rollback to savepoint local067');
 const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
 const production=JSON.parse(require('node:fs').readFileSync('scripts/tests/revenue-distribution-contract.json'));
 // Compile the identical gate SQL against the disposable fixture's catalog/ACL,
 // never export this synthetic contract as a Production permission baseline.
 const map=(xs,key)=>Object.fromEntries(xs.map(x=>[x[key],fingerprint(x)]));
 const tables=(await query("select tablename from pg_tables where schemaname='public'")).map(r=>r.tablename);
 const contract={...production,scope:{...production.scope,rowTables:production.scope.rowTables.filter(n=>tables.includes(n))}};
 for(const stage of ['before','after'])contract[stage]={functions:map(local[stage].functions.filter(f=>contract.scope.functionNames.includes(f.name)),'signature'),catalog:map(local[stage].catalog.filter(t=>contract.scope.tableNames.includes(t.name)),'name'),views:Object.fromEntries(Object.entries(local[stage].views).filter(([n])=>contract.scope.tableNames.includes(n)))};
 contract.candidateSha=require('./direct-money-documents-artifacts.cjs').sha(a.source());
 let pre=(await query(a.preflight(contract)))[0];assert.equal(pre.gate_pass,true,JSON.stringify(pre));const baseline=pre.baseline;
 await db.exec('savepoint gate067');await apply();let post=(await query(a.verifier(contract,baseline)))[0];assert.equal(post.gate_pass,true,JSON.stringify(post));assert.equal(post.historical_rows_unchanged,true);
 await db.exec('grant execute on function vp_received_source(uuid,uuid) to anon');post=(await query(a.verifier(contract,baseline)))[0];assert.equal(post.gate_pass,false);assert.ok(post.failed_checks.includes('dependency_functions_exact'));
 await db.exec('rollback to savepoint gate067');
 const dry=a.dryRun(contract,baseline).replace('BEGIN;','SAVEPOINT rehearsal067;').replace('ROLLBACK;','ROLLBACK TO SAVEPOINT rehearsal067;');const results=await db.exec(dry);const result=results.flatMap(r=>r.rows||[]).find(r=>Object.hasOwn(r,'rollback_verified'));assert.equal(result.rollback_verified,true,JSON.stringify(result));assert.equal(result.historical_rows_unchanged,true);
 assert.equal(await scalar("select to_regprocedure('vp_distribution_policy(jsonb,text)')"),null);
 assert.ok(Buffer.byteLength(a.preflight(contract))<150000);assert.ok(Buffer.byteLength(a.verifier(contract,baseline))<150000);assert.ok(Buffer.byteLength(dry)<300000);
});
test('067 paid v1 remains byte-for-byte unchanged; truthful partial/paid read statuses use existing payouts only',async()=>{
 await docs.setup();const p=require('./payout-postgres.test.cjs'),t=require('./treasury-postgres.test.cjs');await t.opening({amount:30000});const r=await p.rights();await p.payee();const pid=await p.save(r);await p.confirm(pid);await flush();
 const before=await docs.money();await apply();assert.deepEqual(await docs.money(),before);const sid=await scalar('select direct_money_receipt_id from finance_vp_revenue_distributions where id=$1',[r.d]);
 const c=await context('direct_money_receipt',sid);assert.equal(c.source.policy_version,'vp_distribution_v1');assert.equal(c.summary.state,'partial');assert.equal(c.summary.settled,2);assert.equal(c.summary.rights,3);
 await p.payee({id:ids.staff});const rest={rows:await query('select * from finance_payable_entitlements where distribution_id=$1 and recipient_id=$2',[r.d,ids.staff])};const last=await p.save(rest,{recipient:ids.staff});await p.confirm(last);await flush();assert.equal((await context('direct_money_receipt',sid)).summary.state,'paid');
 await rejects("select transition_finance_vp_distribution($1,3,$2,'supersede',true,'unsafe')",[r.d,c.source],/SETTLED_DISTRIBUTION_LOCKED/);
});
test('067 VAT-inclusive/exclusive normalized bases and actual partial Payment fail-closed',async()=>{
 await setup();for(const [mode,amount] of [['vat_inclusive',10700],['vat_exclusive',10000]]){const v=(await query('select * from calculate_finance_billable_charge_amounts(1,$1,$2,7)',[amount,mode]))[0];assert.equal(Number(v.amount_before_vat),10000);assert.equal(Number(v.vat_amount),700);const p=await payment.source([spec({base:Number(v.amount_before_vat),vat:Number(v.vat_amount),wht:3})]);const c=await context('payment',p.p.id);assert.equal(c.source.totals.professional_pool,10000);await confirm(args('payment',p.p.id,c));}
 const partial=await require('./combined-document-postgres.test.cjs').source(undefined,5000);const c=await context('payment',partial.p.id);assert.ok(c.source.blockers.includes('partial_line_evidence_missing'));assert.equal(c.summary.basis,null);await rejects('select confirm_finance_vp_received_distribution($1,$2,$3,$4,$5,$6,$7,$8)',args('payment',partial.p.id,c),/SOURCE_CHANGED/);
});
test('067 explicit v1 supersession creates a v2 successor without rewriting historical snapshots or duplicating active rights',async()=>{
 await docs.setup();const sid=await docs.source(),old=await direct.context(sid),id=await rpc('save_finance_direct_vp_distribution',[sid,null,null,old.source,choices(old),'v1']);
 await rpc('transition_finance_vp_distribution',[id,1,old.source,'review',true,'']);await rpc('transition_finance_vp_distribution',[id,2,old.source,'finalize',true,'']);await flush();await apply();
 await rpc('transition_finance_vp_distribution',[id,3,old.source,'supersede',true,'Explicit correction']);const next=await context('direct_money_receipt',sid);assert.equal(next.source.policy_version,'vp_distribution_v2');assert.equal(next.source.totals.professional_pool,10000);
 const a=args('direct_money_receipt',sid,next),newId=await confirm(a);assert.equal(await confirm(a),newId);await flush();const done=await context('direct_money_receipt',sid);assert.equal(done.current.revision,2);assert.equal(done.current.previous_id,id);assert.deepEqual(done.history.find(h=>h.id===id).source_snapshot_json,old.source);
 assert.equal(await scalar("select count(*)::int from finance_vp_revenue_distributions where direct_money_receipt_id=$1 and status<>'superseded'",[sid]),1);
 assert.equal(await scalar("select count(*)::int from finance_payable_entitlements where distribution_id=$1 and status='open'",[id]),0);
});
