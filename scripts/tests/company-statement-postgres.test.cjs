/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable PostgreSQL fixtures only. Never connects to Production.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const phase2=require('./distribution-payout-postgres.test.cjs'),phase1=require('./revenue-distribution-postgres.test.cjs');
const docs=require('./direct-money-documents-postgres.test.cjs'),direct=require('./direct-money-postgres.test.cjs'),payment=require('./vp-distribution-postgres.test.cjs'),payout=require('./payout-postgres.test.cjs');
const {db,query,scalar,rpc,rejects,asActor,ids,migration}=require('./receipt-foundation.test.cjs');
const {resolved,people}=require('./vp-formula.test.cjs'),{calculateFormula}=require('../../app/finance/compensation/formula-calculation.ts');
const apply=()=>db.exec(migration('69'));
const read=(month=null,type='all',search='',offset=0)=>scalar('select get_finance_company_statement($1,$2,$3,$4)',[month,type,search,offset]);
const rows=async()=>scalar(require('./revenue-distribution-artifacts.cjs').rowsSql((await query("select tablename from pg_tables where schemaname='public' and (tablename like 'finance_%' or tablename in ('clients','user_profiles','cases','advisory_matters')) order by tablename")).map(r=>r.tablename)));
const flush=()=>db.exec('set constraints all immediate;set constraints all deferred');
for(const type of ['payment','direct_money_receipt'])test('069 '+type+' frozen share, date, full trace; unpaid/partial/paid invariant, zero read side effects',async()=>{
 await phase2.setup();const s=await phase2.source(type);const before=await rows();await apply();assert.deepEqual(await rows(),before);
 const initial=await read();assert.equal(initial.count,1);const r=initial.rows[0];assert.equal(r.amount,4000);assert.equal(r.basis,10000);assert.equal(r.distribution_id,s.d);assert.equal(r.source_id,s.sid);assert.equal(r.policy,'vp_distribution_v2');
 assert.equal(r.received_on,await scalar(`select received_on::text from ${type==='payment'?'finance_payments':'finance_direct_money_receipts'} where id=$1`,[s.sid]));assert.ok(r.finalized_at);assert.ok(r.client);assert.equal(r.revision,1);
 const repeats=await Promise.all(Array.from({length:8},()=>read()));assert.ok(repeats.every(x=>JSON.stringify(x)===JSON.stringify(initial)));assert.deepEqual(await rows(),before);
 // Explicit outgoing WHT belongs to payout only, never the frozen Company Share.
 await payout.payee({id:s.rows[0].recipient_id,bank:false,tax:true});const a=await phase2.args(s,0,{rate:3});await phase2.pay(a);await phase2.pay(a);await flush();
 let protectedBefore=await rows();assert.deepEqual(await read(),initial);assert.deepEqual(await rows(),protectedBefore);assert.equal((await phase1.context(type,s.sid)).summary.state,'partial');
 await phase2.pay(await phase2.args(s,1));await flush();protectedBefore=await rows();assert.deepEqual(await read(),initial);assert.deepEqual(await rows(),protectedBefore);assert.equal((await phase1.context(type,s.sid)).summary.state,'paid');
 assert.equal((await read(null,type,'',50)).rows.length,0);assert.deepEqual((await read(null,type,'',50)).totals,initial.totals);assert.equal((await read('2020-01-01')).count,0);
});
test('069 UAT amount 4672.90 -> 934.58; only professional share, no routed company economics',async()=>{
 await phase2.setup();await apply();const s=await payment.source([{base:4672.90,vat:327.10,rate:7,applicable:true,classification:'professional_fee',wht:3},{base:4000,vat:0,rate:0,applicable:false,treatment:'outside_scope',classification:'government_or_court_fee'}]);
 const c=await phase1.context('payment',s.p.id),a=phase1.args('payment',s.p.id,c),f=calculateFormula(4672.90,resolved('pao_line',4672.90),people);assert.deepEqual(f.errors,[]);
 a[5][0]={...a[5][0],formula_result:f.result,company_share_amount:f.result.company_share_amount,referral_amount:f.result.referral_amount,work_compensation_amount:f.result.work_compensation_amount};
 await phase1.confirm(a);await phase1.confirm(a);await flush();const before=await rows(),r=(await read()).rows[0];assert.equal(r.amount,934.58);assert.equal(r.basis,4672.90);assert.deepEqual(await rows(),before);
});
test('069 exact September 5 economic date, late confirmation, multi-line frozen aggregation and source search',async()=>{
 await phase2.setup();await apply();const sid=require('node:crypto').randomUUID(),payload=direct.input([direct.line({base:4672.90,wht_base:4672.90}),direct.line({base:1000,wht_base:1000})],5899.81);
 payload.received_on='2026-09-05';payload.reference_no='SYNTHETIC-069';
 await direct.save(sid,payload);await direct.transition(sid,1,'confirm');const c=await phase1.context('direct_money_receipt',sid),a=phase1.args('direct_money_receipt',sid,c);
 a[5]=a[5].map((choice,i)=>{const pool=c.source.lines[i].professional_pool,f=calculateFormula(pool,resolved('pao_line',pool),people).result;return {...choice,formula_result:f,company_share_amount:f.company_share_amount,referral_amount:f.referral_amount,work_compensation_amount:f.work_compensation_amount};});
 // A draft is not Company income.
 await rpc('save_finance_direct_vp_distribution',[sid,null,null,c.source,a[5],'Synthetic reviewed formula']);assert.equal((await read()).count,0);
 const draft=await phase1.context('direct_money_receipt',sid);a[2]=draft.current.id;a[3]=draft.current.version;await phase1.confirm(a);await flush();
 const r=(await read('2026-09-01','direct_money_receipt','synthetic-069')).rows[0];assert.equal(r.received_on,'2026-09-05');assert.equal(r.amount,1134.58);assert.equal(r.basis,5672.90);assert.ok(r.finalized_at);assert.equal((await read('2026-08-01')).count,0);
});
test('069 historical v1 remains frozen, superseded excluded and effective replacement appears once',async()=>{
 await docs.setup();const sid=await docs.source(),c=await direct.context(sid),choices=phase1.choices(c),id=await rpc('save_finance_direct_vp_distribution',[sid,null,null,c.source,choices,'v1 evidence']);
 await rpc('transition_finance_vp_distribution',[id,1,c.source,'review',true,'']);await rpc('transition_finance_vp_distribution',[id,2,c.source,'finalize',true,'']);await db.exec(migration('67'));await db.exec(migration('68'));
 const before=await rows();await apply();assert.deepEqual(await rows(),before);const r=(await read()).rows[0];assert.equal(r.amount,3880);assert.equal(r.basis,9700);assert.equal(r.policy,'vp_distribution_v1');
 await rpc('transition_finance_vp_distribution',[id,3,c.source,'supersede',true,'Synthetic correction']);assert.equal((await read()).count,0);
 const next=await phase1.context('direct_money_receipt',sid),a=phase1.args('direct_money_receipt',sid,next);const replacement=await phase1.confirm(a);await phase1.confirm(a);await flush();
 const result=await read();assert.equal(result.count,1);assert.equal(result.rows[0].distribution_id,replacement);assert.equal(result.rows[0].revision,2);assert.equal(result.rows[0].amount,4000);
});
test('069 fails closed on unproven classes, duplicate choices and inconsistent formula; pre-formula v1 stays readable',async()=>{
 await phase2.setup();await apply();const s=await phase2.source(),c=(await phase1.context(s.type,s.sid)).current;
 const share=(source,choices)=>scalar('select company_statement_frozen_share($1,$2)',[source,choices]);
 for(const mutate of [x=>{x.source.policy_version='unknown'},x=>{x.choices.push(x.choices[0])},x=>{x.source.lines[0].classification='government_or_court_fee'},x=>{x.choices[0].formula_result.company_share_amount=9999},x=>{x.source.blockers=['unresolved']}]){const x={source:structuredClone(c.source_snapshot_json),choices:structuredClone(c.decisions_json)};mutate(x);assert.equal(await share(x.source,x.choices),null);}
 assert.deepEqual(await share({...c.source_snapshot_json,lines:c.source_snapshot_json.lines.map(l=>({...l,classification:'government_or_court_fee'}))},[]),{amount:0,basis:0});
 const old=structuredClone(c.decisions_json);delete old[0].formula_result;assert.deepEqual(await share({...c.source_snapshot_json,policy_version:'vp_distribution_v1'},old),{amount:4000,basis:10000});
});
test('069 permission parity, no public helper, explicit owner/ACL/search_path and read-only volatility',async()=>{
 await phase2.setup();await apply();await phase2.source();await asActor(ids.staff,()=>rejects('select get_finance_company_statement()',[],/PERMISSION_DENIED/));
 await query("update user_profiles set role='partner' where id=$1",[ids.staff]);await asActor(ids.staff,async()=>{assert.equal((await read()).count,1);await rejects("select company_statement_frozen_share('{}','[]')",[],/permission denied/);});
 await asActor(ids.admin,async()=>assert.equal((await read()).count,1));
 await rejects("select get_finance_company_statement('2026-09-02')",[],/FILTER_INVALID/);
 const f=await scalar("select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'volatility',provolatile,'config',proconfig,'anon',has_function_privilege('anon',oid,'EXECUTE'),'auth',has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where oid='get_finance_company_statement(date,text,text,integer)'::regprocedure");
 assert.deepEqual(f,{owner:'postgres',definer:true,volatility:'s',config:['search_path=public'],anon:false,auth:true});
});
test('069 capture local definitions for dependency reconciliation',{skip:!process.env.CAPTURE_069},async()=>{
 await phase2.setup();const raw=require('./direct-money-documents-artifacts.cjs'),capture=async()=>({functions:await scalar(raw.functionsSql),catalog:await scalar(raw.catalogSql),views:await scalar("select jsonb_object_agg(relname,jsonb_build_object('definition',pg_get_viewdef(oid,true),'options',reloptions)) from pg_class where relnamespace='public'::regnamespace and relkind='v'")});
 const before=await capture();await apply();const after=await capture();fs.writeFileSync('/private/tmp/company-statement-069-contract.json',JSON.stringify({before,after}));await phase2.source();fs.writeFileSync('/private/tmp/company-statement-069-fixture.json',JSON.stringify(await read()));
});
module.exports={apply,read,rows};
test('069 static gates locally rehearse exact applied state, row/security tamper and complete rollback',{skip:!fs.existsSync('scripts/tests/company-statement-contract.json')},async()=>{
 await phase2.setup();await phase2.source();const a=require('./company-statement-artifacts.cjs'),prior=require('./revenue-distribution-artifacts.cjs'),raw=require('./direct-money-documents-artifacts.cjs');
 const c=structuredClone(require('./company-statement-contract.json'));
 // Fixture catalogs differ from Production. Adapt only this disposable test's
 // expected fingerprints; never write synthetic ACLs to the release manifest.
 c.scope.rowTables=(await query("select tablename from pg_tables where schemaname='public' and (tablename like 'finance_%' or tablename in ('clients','user_profiles','cases','advisory_matters')) order by tablename")).map(r=>r.tablename);
 const before=await scalar(prior.captureSql(c));c.before={...before};delete c.before.rows;
 await apply();const after=await scalar(prior.captureSql(c));c.after={...after};delete c.after.rows;
 for(const name of c.scope.created){const sig=(await scalar(raw.functionsSql)).find(f=>f.name===name).signature;await db.exec('drop function public.'+sig);}
 const pre=(await query(a.preflight(c)))[0];assert.equal(pre.gate_pass,true);const pins={stateSha:pre.state_sha256,rowsSha:pre.historical_rows_sha256};
 await rejects(a.verifier(c,pins),[],/does not exist/); // Projection absent before apply.
 const bad=(await query(a.preflight({...c,before:{...c.before,functions:{...c.before.functions,'current_user_can_view_finance_payments()':'bad'}}})))[0];assert.equal(bad.gate_pass,false);
 // Commit only synthetic fixture setup so the operator ROLLBACK does not undo it.
 await db.exec('set constraints all immediate;commit;');
 const results=await db.exec(a.dryRun(c,pins));assert.equal(results.at(-1).rows[0].rollback_verified,true);assert.equal(await scalar("select to_regprocedure('get_finance_company_statement(date,text,text,integer)') is null"),true);
 await db.exec('begin;');await apply();let verified=(await query(a.verifier(c,pins)))[0];assert.equal(verified.gate_pass,true);assert.equal(verified.historical_rows_unchanged,true);
 await db.exec('revoke execute on function get_finance_company_statement(date,text,text,integer) from authenticated');assert.equal((await query(a.verifier(c,pins)))[0].gate_pass,false);
 await db.exec('grant execute on function get_finance_company_statement(date,text,text,integer) to authenticated');
 await query("update clients set name='tampered fixture' where id=$1",[ids.client]);verified=(await query(a.verifier(c,pins)))[0];assert.equal(verified.gate_pass,false);assert.equal(verified.historical_rows_unchanged,false);
});
