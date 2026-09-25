/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable private-socket PostgreSQL only. No Production connection/config.
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const phase=require('./unified-statement-postgres.test.cjs'),treasury=require('./treasury-postgres.test.cjs');
const {db,scalar,ids}=require('./receipt-foundation.test.cjs'),{bin,connection}=require('./distribution-payout-pg-adapter.cjs');
const literal=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const call=a=>'select confirm_finance_treasury_transfer('+a.map(literal).join(',')+');';
function session(sql){return new Promise(resolve=>{let out='',err='';const p=spawn(bin,connection(),{stdio:['pipe','pipe','pipe']});p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('exit',code=>resolve({code,out,err}));p.stdin.end(`begin;set local statement_timeout='10s';select pg_backend_pid();select set_config('test.actor','${ids.admin}',true);set local role authenticated;${sql}\ncommit;`);});}
async function race(a,b){const first=session(call(a)+'select pg_sleep(0.4);');await new Promise(r=>setTimeout(r,60));const results=await Promise.all([first,session(call(b))]);assert.equal(new Set(results.map(r=>r.out.split('\n')[0])).size,2);return results;}
test('070 independent PostgreSQL sessions: retry, conflicting payload, opposite-account lock order and atomic pair',async()=>{
 await phase.setup();const cash=await scalar("select id from finance_cash_locations where code='office_cash'");await treasury.opening({amount:1000});await treasury.opening({bank:null,cash,amount:1000});const a=await phase.transferArgs();await db.exec('commit');
 let r=await race(a,a);assert.ok(r.every(x=>x.code===0),JSON.stringify(r));assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),2);
 const b=await phase.transferArgs(),conflict=[...b];conflict[5]=200;r=await race(b,conflict);assert.equal(r.filter(x=>x.code===0).length,1);assert.match(r.find(x=>x.code!==0).err,/IDEMPOTENCY_CONFLICT/);
 const left=await phase.transferArgs(),right=await phase.transferArgs({fromBank:null,fromCash:cash,toBank:ids.bank});right[4]=null;r=await race(left,right);assert.ok(r.every(x=>x.code===0),JSON.stringify(r));
 assert.equal(await scalar('select count(*)::int from finance_treasury_transfers'),4);assert.equal(await scalar('select count(*)::int from finance_cash_transactions'),8);
 assert.equal(await scalar("select count(*)::int from (select transfer_id from finance_treasury_transfer_legs l join finance_cash_transactions c on c.id=l.cash_transaction_id group by transfer_id having count(*)<>2 or sum(case c.direction when 'inflow' then c.cash_amount else -c.cash_amount end)<>0) bad"),0);
 console.log('PASS independent PostgreSQL backend PIDs: retry=1 pair; conflicting payload rejected; opposite direction=2 valid atomic pairs, no deadlock');await db.exec('begin');
});
