/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs');
const direct=require('./direct-money-postgres.test.cjs'),prior=require('./vp-distribution-postgres.test.cjs');
const {db,scalar,rpc,rejects,query,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {people,resolved}=require('./vp-formula.test.cjs');
const {calculateFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const engine=require('../../app/finance/compensation/formula-engine.ts');
const {catalogSql,manifestPath,workflow,filenames}=require('./payable-artifacts.cjs');
const third='10000000-0000-4000-8000-000000000009';
async function setup(apply=true){await direct.setup();if(apply)await db.exec(migration('48'));}
async function distribution({payment=false,finalize=false,external=false,zeroPool=false}={}){
 let c,id;
 if(payment){const p=await prior.source();id=p.p.id;c=await prior.context(id);}
 else{id=randomUUID();await direct.save(id,zeroPool?direct.input([direct.line({wht_rate:100})],700):direct.input());await direct.transition(id,1,'confirm');c=await direct.context(id);}
 await query("insert into user_profiles(id,role,full_name,staff_name,active) values($1,'staff','Pao','Pao',true) on conflict(id) do nothing",[third]);
 const recipients=[...people,{id:third,name:'Pao'}];
 const choices=c.source.lines.filter(l=>l.classification==='professional_fee').map(l=>{
  const input=resolved('source_worker_qc',l.professional_pool);
  input.rows[0].recipient_user_id=people[0].id;
  input.rows[2].recipient_user_id=people[1].id;
  input.rows.push({...engine.createAllocation('worker','',12,false,'Co-working Counsel'),recipient_user_id:people[0].id});
  input.rows.push({...engine.createAllocation('qc','',8,false,'Quality Control'),recipient_user_id:third});
  input.rows=engine.rebalanceOwnerWorkPool(input.rows,l.professional_pool,input.code);
  if(external){input.rows[0].recipient_user_id='__other__';input.rows[0].recipient_name='External without canonical identity';}
  const f=calculateFormula(l.professional_pool,input,recipients);assert.deepEqual(f.errors,[]);
  return {[payment?'invoice_item_id':'source_line_id']:l[payment?'invoice_item_id':'source_line_id'],formula_result:f.result,referral_amount:f.result.referral_amount,company_share_amount:f.result.company_share_amount,work_compensation_amount:f.result.work_compensation_amount};
 });
 const d=await rpc(payment?'save_finance_vp_distribution':'save_finance_direct_vp_distribution',[id,null,null,c.source,choices,'Synthetic payables']);
 await rpc('transition_finance_vp_distribution',[d,1,c.source,'review',true,'']);
 if(finalize)await rpc('transition_finance_vp_distribution',[d,2,c.source,'finalize',true,'']);
 return {id,d,c};
}
test('048 future Direct finalize atomically creates four frozen component rights; same person keeps two roles; no financial writes',async()=>{
 await setup();const before=await prior.financialState(),{d}=await distribution({finalize:true});
 const rows=await query('select * from finance_payable_entitlements where distribution_id=$1 order by gross_amount desc',[d]);
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>Number(r.gross_amount)),[1940,1940,1164,776]);
 assert.equal(rows.reduce((n,r)=>n+Number(r.gross_amount),0),5820);
 assert.equal(rows.filter(r=>r.recipient_id===people[0].id).length,2);
 assert.equal(rows.filter(r=>r.recipient_id===people[0].id).reduce((n,r)=>n+Number(r.gross_amount),0),3104);
 assert.deepEqual(new Set(rows.map(r=>r.bucket)),new Set(['referral','work']));
 assert.equal(rows[0].evidence_json.formula.company_share_amount,3880);assert.equal(rows[0].evidence_json.line.vat,700);assert.equal(rows[0].evidence_json.line.wht,300);
 const snapshot=await scalar('select to_jsonb(s) from finance_payable_entitlement_sources s where distribution_id=$1',[d]);
 assert.equal(await rpc('ensure_finance_payable_entitlements',[d,3,true]),d);assert.equal(await rpc('ensure_finance_payable_entitlements',[d,3,true]),d);
 assert.deepEqual(await scalar('select to_jsonb(s) from finance_payable_entitlement_sources s where distribution_id=$1',[d]),snapshot);
 assert.equal(await scalar('select count(*)::int from finance_payable_entitlement_audit where distribution_id=$1',[d]),1);
 assert.deepEqual(await prior.financialState(),before);
});
test('048 read RPC groups complete components by canonical recipient/currency and filters without false totals',async()=>{
 await setup();await distribution({finalize:true});await distribution({finalize:true});
 const all=await scalar("select get_finance_payable_entitlements()"),pam=all.groups.find(g=>g.recipient_id===people[0].id);
 assert.equal(all.groups.length,3);assert.equal(pam.components.length,4);assert.equal(pam.open_amount,6208);assert.equal(all.has_next,false);
 const referral=await scalar("select get_finance_payable_entitlements('','direct_money_receipt','referral','open',0)");
 assert.equal(referral.groups.length,1);assert.equal(referral.groups[0].open_amount,3880);assert.equal(referral.groups[0].components.length,2);
 await query("update user_profiles set staff_name='Renamed now' where id=$1",[third]);
 assert.equal((await scalar("select get_finance_payable_entitlements('Pao')")).groups.length,1);
 assert.equal((await scalar("select get_finance_payable_entitlements('Renamed now')")).groups.length,0);
 assert.equal((await scalar("select get_finance_payable_entitlements('','all','all','open',25)")).groups.length,0);
 await rejects("select get_finance_payable_entitlements('','company')",[],/FILTER_INVALID/);
 await asActor(ids.staff,async()=>await rejects('select get_finance_payable_entitlements()',[],/PERMISSION_DENIED/));
});
test('048 historical finalize remains untouched until explicit materialization; frozen names survive profile rename/inactivation',async()=>{
 await setup(false);const {d}=await distribution({finalize:true});const old=await scalar('select to_jsonb(d) from finance_vp_revenue_distributions d where id=$1',[d]);
 await db.exec(migration('48'));assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),0);
 await query("update user_profiles set staff_name='Renamed',active=false where id=$1",[third]);
 await rpc('ensure_finance_payable_entitlements',[d,3,true]);
 assert.equal(await scalar('select recipient_name from finance_payable_entitlements where recipient_id=$1',[third]),'Pao');
 assert.deepEqual(await scalar('select to_jsonb(d) from finance_vp_revenue_distributions d where id=$1',[d]),old);
});
test('048 Payment-backed projection and supersession preserve financial history and invalidate all rights once',async()=>{
 await setup();const {d,c}=await distribution({payment:true,finalize:true}),before=await prior.financialState();
 const frozen=await scalar('select components_json from finance_payable_entitlement_sources where distribution_id=$1',[d]);
 assert.ok(frozen.length);assert.ok(frozen.every(r=>r.source_type==='payment'));
 await rpc('transition_finance_vp_distribution',[d,3,c.source,'supersede',true,'Source retired']);
 await rpc('transition_finance_vp_distribution',[d,3,c.source,'supersede',true,'Source retired']);
 assert.equal(await scalar("select count(*)::int from finance_payable_entitlements where status='open'"),0);
 assert.equal(await scalar("select count(*)::int from finance_payable_entitlement_audit where event_type='superseded'"),1);
 assert.deepEqual(await scalar('select components_json from finance_payable_entitlement_sources where distribution_id=$1',[d]),frozen);
 await rejects('select ensure_finance_payable_entitlements($1,4,true)',[d],/FINALIZED_REQUIRED/);
 assert.deepEqual(await prior.financialState(),before);
});
test('048 non-finalized/stale/unacknowledged blocked; unidentified external rolls back finalization; no partial rights',async()=>{
 await setup();const {d,c}=await distribution({external:true});
 await rejects('select ensure_finance_payable_entitlements($1,2,true)',[d],/FINALIZED_REQUIRED/);
 await rejects('select ensure_finance_payable_entitlements($1,1,true)',[d],/SOURCE_CHANGED/);
 await rejects('select ensure_finance_payable_entitlements($1,2,false)',[d],/ACK_REQUIRED/);
 await rejects("select transition_finance_vp_distribution($1,2,$2,'finalize',true,'')",[d,c.source],/CANONICAL_RECIPIENT_REQUIRED/);
 assert.equal(await scalar('select status from finance_vp_revenue_distributions where id=$1',[d]),'reviewed');
 for(const t of ['sources','audit'])assert.equal(await scalar('select count(*)::int from finance_payable_entitlement_'+t),0);
 assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),0);
});
test('048 zero pool creates an audited empty materialization, never VAT/WHT or zero-value rights',async()=>{
 await setup();const {d}=await distribution({external:true,zeroPool:true,finalize:true});
 assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),0);
 assert.deepEqual(await scalar('select components_json from finance_payable_entitlement_sources where distribution_id=$1',[d]),[]);
 assert.equal(await rpc('ensure_finance_payable_entitlements',[d,3,true]),d);
 assert.equal(await scalar('select count(*)::int from finance_payable_entitlement_audit'),1);
});
test('048 immutable components/audit, complete-set integrity, and future payout dependency fail closed',async()=>{
 await setup();const {d,c}=await distribution({finalize:true});
 for(const statement of ["update finance_payable_entitlements set gross_amount=1",'delete from finance_payable_entitlements','truncate finance_payable_entitlements',"update finance_payable_entitlement_audit set event_type='superseded'"])
  await rejects(statement,[],/HISTORY_IMMUTABLE/);
 await db.exec('savepoint forged');
 try {await query("insert into finance_payable_entitlements select (jsonb_populate_record(null::finance_payable_entitlements,to_jsonb(e)||jsonb_build_object('id',gen_random_uuid(),'component_key',md5('forged')))).* from finance_payable_entitlements e limit 1");await assert.rejects(()=>db.exec('set constraints all immediate'),/COMPONENT_INTEGRITY/);}
 finally{await db.exec('rollback to savepoint forged');}
 await db.exec('create table synthetic_future_payout(entitlement_id uuid references finance_payable_entitlements(id));');
 await rejects("select transition_finance_vp_distribution($1,3,$2,'supersede',true,'Attempt')",[d,c.source],/PAYOUT_INTEGRATION_REQUIRED/);
 assert.equal(await scalar('select status from finance_vp_revenue_distributions where id=$1',[d]),'finalized');
});
test('048 Admin-only materialization, existing Finance RLS read policy, private helpers inaccessible',async()=>{
 await setup();const {d}=await distribution({finalize:true});
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{await rejects('select ensure_finance_payable_entitlements($1,3,true)',[d],/PERMISSION_DENIED/);await query('set role authenticated');assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),4);await query('reset role');});
 await query("update user_profiles set role='staff' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{await query('set role authenticated');assert.equal(await scalar('select count(*)::int from finance_payable_entitlements'),0);await rejects('select payable_materialize($1)',[d],/permission denied/);await query('reset role');});
 await query('set role authenticated');await rejects('delete from finance_payable_entitlements',[],/permission denied/);await query('reset role');
});
test('048 aggregate-only historical source blocks materialization without edits; company-only frozen formula creates no payable',async()=>{
 await prior.setup();const p=await prior.source();await prior.finalize(p.p.id);const old=(await prior.context(p.p.id)).current;
 await db.exec('create table cases(id bigint primary key,client_id uuid references clients(id));create table advisory_matters(id uuid primary key,client_id uuid references clients(id));');
 const {definition}=require('./tax-invoice-sql-artifacts.cjs');await db.exec(definition(migration('30'),'assert_finance_billable_charge_context')+'\n'+definition(migration('30'),'calculate_finance_billable_charge_amounts'));
 await db.exec(migration('46'));await db.exec(migration('47'));await db.exec(migration('48'));
 await rejects('select ensure_finance_payable_entitlements($1,$2,true)',[old.id,old.version],/FORMULA_EVIDENCE_REQUIRED/);
 assert.deepEqual((await prior.context(p.p.id)).current.source_snapshot_json,old.source_snapshot_json);
 const f=calculateFormula(9700,resolved('travel_fee',9700),people).result;
 const d=structuredClone(old);d.decisions_json=d.decisions_json.map(c=>{
  const line=d.source_snapshot_json.lines.find(l=>l.invoice_item_id===c.invoice_item_id);
  const company=calculateFormula(line.professional_pool,resolved('travel_fee',line.professional_pool),people).result;
  return {...c,formula_result:company,referral_amount:0,work_compensation_amount:0,company_share_amount:company.company_share_amount};
 });
 assert.ok(f);assert.deepEqual(await scalar('select payable_frozen_components($1)',[d]),[]);
});
test('048 exact catalog capture and rollback-only operator workflow (isolated PostgreSQL)',async()=>{
 await setup(false);const before=await prior.financialState();await db.exec('savepoint candidate048');await db.exec(migration('48'));
 const actual=await query(catalogSql);
 if(process.env.PAYABLE_CAPTURE==='1')fs.writeFileSync(manifestPath,JSON.stringify(actual,null,2)+'\n');else assert.deepEqual(actual,JSON.parse(fs.readFileSync(manifestPath,'utf8')));
 const files=workflow();const post=(await query(files[filenames.verify]))[0];assert.deepEqual(post.failed_checks,[],JSON.stringify(post));
 await db.exec('alter table finance_payable_entitlements add column unexpected text');
 const drift=(await query(files[filenames.verify]))[0];assert.equal(drift.checks.exact_catalog,false);assert.ok(drift.catalog_differences.length);
 await db.exec('rollback to savepoint candidate048');const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 const results=await db.exec(files[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator048;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator048;'));
 const rehearsal=results.flatMap(r=>r.rows||[]).find(r=>Object.hasOwn(r,'payable_entitlement_foundation_verification_pass'));
 assert.deepEqual(rehearsal.failed_checks,[],JSON.stringify(rehearsal));assert.equal(await scalar("select to_regclass('finance_payable_entitlements')"),null);
 assert.deepEqual(await prior.financialState(),before);
});
