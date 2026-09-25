/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const a=require('./executive-finance-artifacts.cjs'),prior=require('./unified-statement-contract.json');
test('071 exact candidate/static Preflight, applied migrations and accepted post-070 baseline preserved',()=>{
 const c=a.validate();for(const section of ['functions','catalog','views'])for(const [name,value] of Object.entries(prior.after[section]))assert.deepEqual(c.before[section][name],value,section+': '+name);
 assert.equal(c.broaderUnresolvedDifferences,490);assert.equal(c.accepted070.manifestSha,prior.manifestSha);
 assert.deepEqual(c.scope.changed,[]);assert.deepEqual(c.scope.newTables,[]);assert.deepEqual(c.scope.changedTables,[]);
 for(const section of ['catalog','views'])assert.deepEqual(c.after[section],c.before[section]);
 for(const [s,h] of Object.entries(c.before.functions))assert.equal(c.after.functions[s],h);
 assert.equal(Object.keys(c.after.functions).length-Object.keys(c.before.functions).length,4);
 assert.ok(!Object.hasOwn(c.before,'rows'),'Current Production row hashes captured by SELECT only, never copied from fixtures');
 assert.ok(c.scope.rowTables.includes('finance_treasury_transfers'));assert.ok(c.scope.rowTables.includes('finance_expense_economic_decisions'));
});
test('071 Preflight is one SELECT-only SQL statement, no candidate execution, no external baseline transfer',()=>{
 const sql=fs.readFileSync(a.preflightPath,'utf8'),executable=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'');
 assert.match(executable.trim(),/^WITH\b/);assert.equal((executable.match(/;/g)||[]).length,1);
 assert.doesNotMatch(executable,/\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|execute|call|do|copy|begin|commit|rollback)\b/i);
 assert.ok(Buffer.byteLength(sql)<250000);assert.match(sql,/490 broader_unresolved_differences/);
 assert.doesNotMatch(executable,/get_finance_(cash_flow|receivables|general_payables|unpaid_participants)_summary\(/);
});
test('071 candidate has four STABLE domain RPCs only and no new write paths or shared summary table',()=>{
 const sql=a.source();assert.equal((sql.match(/create function public\./g)||[]).length,4);
 assert.equal((sql.match(/language plpgsql stable/g)||[]).length,4);
 const bodies=[...sql.matchAll(/as \$fn\$([\s\S]*?)\$fn\$/g)].map(m=>m[1].replace(/--[^\n]*/g,''));
 assert.equal(bodies.length,4);for(const body of bodies)assert.doesNotMatch(body,/\b(insert|update|delete|merge|truncate|execute|perform|create|alter|drop)\b/i);
 assert.doesNotMatch(sql,/create (table|index|trigger|policy)|alter table|create or replace function/i);
 assert.match(sql,/get_finance_receivables_summary\(\)[\s\S]*?security invoker/);
});
