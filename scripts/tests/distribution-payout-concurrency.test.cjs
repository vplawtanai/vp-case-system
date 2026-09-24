/* eslint-disable @typescript-eslint/no-require-imports */
// Run only against a new disposable PostgreSQL 18 cluster through a private Unix socket.
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const phase=require('./distribution-payout-postgres.test.cjs'),{db,scalar,ids}=require('./receipt-foundation.test.cjs');
const {bin,connection}=require('./distribution-payout-pg-adapter.cjs');
const literal=v=>v===null?'null':typeof v==='number'?String(v):typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const call=a=>'select pay_finance_distribution_participant('+a.map(literal).join(',')+');';
function session(sql){return new Promise(resolve=>{let out='',err='';const p=spawn(bin,connection(),{stdio:['pipe','pipe','pipe']});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('exit',code=>resolve({code,out,err}));p.stdin.end(`begin;select pg_backend_pid();select set_config('test.actor','${ids.admin}',true);set local role authenticated;${sql}\ncommit;`);});}
test('068 independent PostgreSQL sessions: concurrent retry and competing payment IDs settle each component exactly once',async()=>{
 await phase.setup();const s=await phase.source();await require('./payout-postgres.test.cjs').payee({id:s.rows[0].recipient_id,bank:false,tax:true});const a=await phase.args(s,0,{rate:3});await db.exec('commit');
 // Commit the first session only after the second has attempted confirmation.
 const first=session(call(a)+'select pg_sleep(0.5);');await new Promise(r=>setTimeout(r,60));const retry=session(call(a));const r=await Promise.all([first,retry]);assert.ok(r.every(v=>v.code===0),JSON.stringify(r));assert.equal(new Set(r.map(v=>v.out.split('\n')[0])).size,2,'Independent backend PIDs');
 assert.equal(await scalar('select count(*)::int from finance_payout_allocations where entitlement_id=$1',[a[1]]),1);assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id=$1',[a[2]]),1);
 const b=await phase.args(s,1),other=[...b];other[2]=randomUUID();const left=session(call(b)+'select pg_sleep(0.5);');await new Promise(r=>setTimeout(r,60));const right=session(call(other));const competing=await Promise.all([left,right]);assert.equal(competing.filter(v=>v.code===0).length,1,JSON.stringify(competing));assert.match(competing.find(v=>v.code!==0).err,/RIGHTS_UNAVAILABLE/);
 assert.equal(await scalar('select count(*)::int from finance_payout_allocations where entitlement_id=$1',[b[1]]),1);assert.equal(await scalar('select count(*)::int from finance_payouts'),2);assert.equal(await scalar('select count(*)::int from finance_cash_transactions where source_payout_id is not null'),2);
 assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations'),1);assert.equal(await scalar('select count(*)::int from finance_outgoing_wht_obligations where payout_source_id=$1',[a[2]]),1);assert.equal((await require('./revenue-distribution-postgres.test.cjs').context(s.type,s.sid)).summary.state,'paid');
 console.log('Independent transactions PASS: identical request retry, competing request IDs, two unique allocations/payouts/cash movements');await db.exec('begin');
});
