/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const prior=require('./vp-distribution-postgres.test.cjs');
const {db,scalar,query,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {resolved,people}=require('./vp-formula.test.cjs');
const formula=require('../../app/finance/compensation/formula-calculation.ts');
const engine=require('../../app/finance/compensation/formula-engine.ts');
async function setup(){await prior.setup();await db.exec(migration('46'));}
const context=p=>scalar('select get_finance_vp_formula_context($1)',[p]);
function decisions(c,codes=['pao_line']){
 return c.source.lines.filter(l=>l.classification==='professional_fee').map((line,index)=>{
  const f=formula.calculateFormula(line.professional_pool,resolved(codes[index%codes.length],line.professional_pool),people);
  assert.deepEqual(f.errors,[]);
  return {invoice_item_id:line.invoice_item_id,referral_amount:f.result.referral_amount,company_share_amount:f.result.company_share_amount,work_compensation_amount:f.result.work_compensation_amount,formula_result:f.result};
 });
}
test('046 candidate applies after 045 and publishes the shared catalog without data changes',async()=>{
 await prior.setup();const before=await prior.financialState();
 await db.exec(migration('46'));
 assert.deepEqual(await scalar('select vp_compensation_formula_catalog()'),require('../../app/finance/compensation/formula-definitions.json'));
 assert.deepEqual(await prior.financialState(),before);
});
test('046 TS/Postgres parity for all shared formulas, exact rounding and fixed values',async()=>{
 await setup();
 for(const code of engine.formulaCodes)for(const pool of [10000,9999.99,123.47]){
  const input=resolved(code,pool),f=formula.calculateFormula(pool,input,people);assert.deepEqual(f.errors,[]);
  const sql=await scalar('select vp_formula_calculate($1,$2,$3,$4,$5)',[pool,code,1,f.result.formula_snapshot,f.result.recipients]);
  assert.deepEqual(sql,f.result);
 }
 const input=resolved('source_worker_qc',10000);
 input.rows.push({...engine.createAllocation('assistant','Outside assistant',10,false,'Assistant'),recipient_user_id:'__other__'});
 input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);
 const f=formula.calculateFormula(10000,input,people).result;
 assert.deepEqual(await scalar('select vp_formula_calculate($1,$2,$3,$4,$5)',[10000,input.code,1,f.formula_snapshot,f.recipients]),f);
});
test('046 mixed source finalizes frozen per-line recipients with no Compensation, Ledger, Cash, referral or document writes',async()=>{
 await setup();const s=await prior.source(),c=await context(s.p.id),before=await prior.financialState(),d=decisions(c);
 assert.equal(c.source.totals.professional_pool,10000);assert.equal(c.source.totals.company_economic,8672.9);
 const id=await prior.save(s.p.id,c,d);assert.equal(await prior.save(s.p.id,c,d),id);
 await prior.transition(s.p.id,'review');await prior.transition(s.p.id,'finalize');
 const result=await context(s.p.id);assert.deepEqual(result.current.decisions_json,d);assert.equal(result.current.status,'finalized');
 assert.deepEqual(await prior.financialState(),before);
 await rejects("update finance_vp_revenue_distributions set decisions_json='[]' where id=$1",[id],/IMMUTABLE|IMMUTABLE_HISTORY|HISTORY_IMMUTABLE/);
 const frozen=JSON.stringify(result.current);
 await query("update user_profiles set full_name='Later name',active=false where id=$1",[ids.staff]);
 const sql=await scalar("select pg_get_functiondef('vp_compensation_formula_catalog()'::regprocedure)");
 await db.exec(sql.replace('"version":1','"version":2'));
 assert.equal(JSON.stringify((await context(s.p.id)).current),frozen);
 await prior.transition(s.p.id,'supersede','Deliberate replacement');
 assert.deepEqual((await context(s.p.id)).history[0].decisions_json,d);
});
test('046 multiple professional pools exclude their own WHT/VAT and allow distinct formulas',async()=>{
 await setup();const s=await prior.source([
  {base:10000,vat:700,rate:7,applicable:true,classification:'professional_fee',wht:3},
  {base:5000,vat:0,rate:0,applicable:false,treatment:'outside_scope',classification:'professional_fee'}
 ]);
 const c=await context(s.p.id),d=decisions(c,['source_worker_qc','tun_line']);
 assert.deepEqual(d.map(v=>v.formula_result.pool).sort((a,b)=>a-b),[5000,9700]);
 await prior.save(s.p.id,c,d);await prior.transition(s.p.id,'review');await prior.transition(s.p.id,'finalize');
 assert.deepEqual((await context(s.p.id)).current.decisions_json,d);
});
test('046 controlled multi-role workers preserve distinct components for one person through finalization, with no downstream writes',async()=>{
 await setup();const s=await prior.source(),c=await context(s.p.id),before=await prior.financialState(),d=decisions(c,['source_worker_qc']);
 const input=resolved('source_worker_qc',10000);input.rows[2].recipient_user_id=people[0].id;
 for(const [role,type] of [['Co-Lawyer / Co-Worker','worker'],['Assistant','assistant'],['Quality Controller','qc']])
  input.rows.push({...engine.createAllocation(type,'',10,false,role),recipient_user_id:people[0].id});
 input.rows=engine.rebalanceOwnerWorkPool(input.rows,10000,input.code);
 const computed=formula.calculateFormula(10000,input,people);assert.deepEqual(computed.errors,[]);
 d[0].formula_result=computed.result;
 assert.deepEqual(await scalar('select vp_formula_calculate($1,$2,$3,$4,$5)',[10000,input.code,1,computed.result.formula_snapshot,computed.result.recipients]),computed.result);
 await prior.save(s.p.id,c,d);await prior.transition(s.p.id,'review');await prior.transition(s.p.id,'finalize');
 const saved=(await context(s.p.id)).current;assert.deepEqual(saved.decisions_json,d);
 assert.deepEqual(saved.decisions_json[0].formula_result.recipients.slice(2).map(row=>row.component_no),[3,4,5,6]);
 assert.deepEqual(await prior.financialState(),before);
});
test('046 aggregate bypass, forged recipient/evidence and under/over allocation blocked atomically',async()=>{
 await setup();const s=await prior.source(),c=await context(s.p.id),d=decisions(c),before=await prior.financialState();
 const bad=[prior.choices(c)];
 for(const alter of [
  f=>f.recipients[1].amount+=0.01,
  f=>f.recipients[1].recipient_name='Forged name',
  f=>f.recipients[1].recipient_user_id='00000000-0000-4000-8000-000000000000',
  f=>f.formula_snapshot.defaults[0].percent=21,
  f=>f.recipients[1].percent-=1,
  f=>f.recipients[1].percent+=1,
  f=>f.recipients[1].percent=-1,
  f=>f.recipients[1].bucket='referral_amount',
  f=>f.recipients[1].role_label='',
  f=>f.recipients[2]={...f.recipients[1],component_no:3},
 ]){const copy=structuredClone(d);alter(copy[0].formula_result);bad.push(copy);}
 for(const choices of bad)await rejects('select save_finance_vp_distribution($1,null,null,$2,$3,\'\')',[s.p.id,c.source,choices],/VP_FORMULA_|VP_DISTRIBUTION_/);
 assert.equal((await context(s.p.id)).current,null);assert.deepEqual(await prior.financialState(),before);
});
test('046 legacy history is not backfilled; old reviewed/finalized can supersede; old drafts must explicitly gain formulas',async()=>{
 await prior.setup();const s=await prior.source();await prior.finalize(s.p.id);
 const old=(await prior.context(s.p.id)).current;await db.exec(migration('46'));
 assert.deepEqual((await context(s.p.id)).current,old);
 await prior.transition(s.p.id,'supersede','Explicit formula revision');
 const c=await context(s.p.id);await prior.save(s.p.id,c,decisions(c));
 assert.deepEqual((await context(s.p.id)).history.find(r=>r.id===old.id).decisions_json,old.decisions_json);
});
test('046 legacy drafts explicitly gain formulas before review',async()=>{
 await prior.setup();const other=await prior.source();await prior.save(other.p.id,await prior.context(other.p.id));await db.exec(migration('46'));
 await rejects('select transition_finance_vp_distribution($1,$2,$3,\'review\',true,\'\')',[(await context(other.p.id)).current.id,1,(await context(other.p.id)).source],/VP_FORMULA_REQUIRED/);
 const draft=await context(other.p.id);await prior.save(other.p.id,draft,decisions(draft));await prior.transition(other.p.id,'review');
});
test('046 Admin only manages; Partner reads frozen recipients without person directory; private helpers/direct writes denied',async()=>{
 await setup();const s=await prior.source(),c=await context(s.p.id);
 assert.ok(c.formula_people.some(person=>person.id===ids.admin));
 await prior.save(s.p.id,c,decisions(c));
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);
 await asActor(ids.staff,async()=>{
  const read=await context(s.p.id);assert.equal(read.can_manage,false);assert.deepEqual(read.formula_people,[]);
  await rejects('select save_finance_vp_distribution($1,$2,$3,$4,$5,\'\')',[s.p.id,read.current.id,read.current.version,read.source,decisions(c)],/PERMISSION_DENIED/);
  await rejects('select vp_compensation_formula_catalog()',[],/permission denied/);
  await rejects('update finance_vp_revenue_distributions set note=\'bad\'',[],/permission denied/);
 });
 await query("update user_profiles set role='staff' where id=$1",[ids.staff]);
 await asActor(ids.staff,()=>rejects('select get_finance_vp_formula_context($1)',[s.p.id],/PERMISSION_DENIED/));
});
test('046 stale recipient blocks review and upstream source guards remain effective',async()=>{
 await setup();const s=await prior.source(),c=await context(s.p.id);await prior.save(s.p.id,c,decisions(c));
 await query("update user_profiles set active=false where id=$1",[ids.staff]);
 const draft=await context(s.p.id);
 await rejects('select transition_finance_vp_distribution($1,$2,$3,\'review\',true,\'\')',[draft.current.id,draft.current.version,draft.source],/RECIPIENT_STALE/);
 await query("update user_profiles set active=true where id=$1",[ids.staff]);
 await prior.transition(s.p.id,'review');
 await rejects('select reverse_finance_payment($1,\'test\')',[s.p.id],/VP_DISTRIBUTION_SUPERSEDE_REQUIRED/);
});
test('046 exact operator artifacts, missing-function diagnostics and rollback-only baseline rehearsal',async()=>{
 await prior.setup();
 const {workflow,filenames}=require('./vp-formula-artifacts.cjs'),files=workflow();
 const pre=(await query(files[filenames.pre]))[0];assert.deepEqual(pre.failed_checks,[],JSON.stringify(pre));
 const before=await prior.financialState();
 await db.exec('savepoint candidate046');await db.exec(migration('46'));
 const verified=(await query(files[filenames.verify]))[0];assert.deepEqual(verified.failed_checks,[],JSON.stringify(verified));
 assert.deepEqual(verified.upstream_evidence_hashes,pre.upstream_evidence_hashes);
 await db.exec('revoke execute on function get_finance_vp_formula_context(uuid) from authenticated');
 const bad=(await query(files[filenames.verify]))[0];assert.ok(bad.failed_checks.includes('formula_rpc_private_permissions'));
 await db.exec('rollback to savepoint candidate046');
 await db.exec(files[filenames.dry].replace(/^BEGIN;/,'SAVEPOINT operator046;').replace(/ROLLBACK;\n$/,'ROLLBACK TO SAVEPOINT operator046;'));
 assert.equal(await scalar("select to_regprocedure('get_finance_vp_formula_context(uuid)')"),null);
 assert.deepEqual(await prior.financialState(),before);
});
