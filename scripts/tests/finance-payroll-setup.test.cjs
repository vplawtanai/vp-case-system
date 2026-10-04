/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {load}=require('./finance-payroll-setup-support.cjs'),S=load('app/finance/payroll/setup.ts'),L=load('app/finance/payroll/labels.ts');
const A=require('./finance-payroll-setup-artifacts.cjs'),P=require('./finance-payroll-correction-artifacts.cjs');
test('093 exact immutable predecessor contracts; no schema change; SELECT-only fail-closed gates',()=>{
 assert.match(A.validate(),/^[a-f0-9]{64}$/);assert.equal(P.validate(),A.immutable092);assert.deepEqual(A.before().tables,A.after().tables);
 assert.deepEqual(Object.keys(A.before().functions).filter(k=>A.before().functions[k]!==A.after().functions[k]).sort(),['payroll089_manage(text,jsonb,uuid)','payroll089_protect()']);
 for(const signature of ['payroll091_manage(text,date,jsonb,uuid,boolean)','payroll091_source(date,uuid)','payroll092_correct(text,uuid,uuid,text,text,uuid)'])assert.equal(A.before().functions[signature],A.after().functions[signature]);
 assert.doesNotMatch(A.body(),/create table|add column|grant (?:update|delete)|disable trigger/i);
 const source=fs.readFileSync('scripts/tests/finance-payroll-setup-body.sql','utf8');
 assert.doesNotMatch(source,/delete from finance_payroll_(engagements|rates)/i);
 assert.match(source,/payout_lifecycle[\s\S]*payroll089/);assert.match(source,/payroll092_line_safe/);assert.match(source,/p_request_id[\s\S]*PAYROLL_RETRY_CHANGED/);
 for(const post of [false,true])assert.doesNotMatch(A.gate(post).replace(/'(?:''|[^'])*'/g,"''").replace(/^--.*$/gm,''),/\b(call |do \$|create |update |delete |insert into|payroll093_correct\()/i);
 assert.match(A.gate(true,{}),/reviewed_baseline_bound.*NULL::text/);assert.match(A.gate(true),/bool_and\(coalesce\(pass,false\)\)/);
 // All 092 update/delete restrictions remain after the exact narrow permit.
 const previous=P.body().slice(P.body().indexOf(" if tg_op='DELETE' and tg_table_name"),P.body().indexOf('DO $security$'));
 assert.ok(A.body().includes(previous.trim()));
});
test('093 verifier binds exact Human-reviewed Production baseline without weakening gates',()=>{
 const reviewed={rows_sha256:'a4c938db4aa5a9ac4becca6ccbbcc08ac9bf784adfe92b9ba3949a1a9a72e77b',preserved_sha256:'cc6cbfc633c328e893c1325f7e886b7154e45c88cdd4cd3613f61b281d34e64e'};
 assert.deepEqual(JSON.parse(fs.readFileSync(A.baselinePath)),reviewed);
 assert.equal(A.validate(),'cc083ad3e973646b3903b628ac50cce132faa88d582488eb4e7707ed18e9eb58');
 const sql=fs.readFileSync(A.verifier,'utf8'),{hash}=require('./finance-authority-artifacts.cjs');
 assert.equal(sql,A.gate(true,reviewed));
 let unbound=sql;
 for(const value of Object.values(reviewed)){
  assert.equal(sql.split(`'${value}'`).length-1,2);
  unbound=unbound.replaceAll(`'${value}'`,'NULL::text');
 }
 assert.equal(unbound,A.gate(true,{}),'Only reviewed baseline literals may differ from the unbound verifier');
 for(const [check,field,pin] of [['historical_rows_unchanged','rows','rows_sha256'],['unrelated_contracts_unchanged','preserved','preserved_sha256']]){
  assert.ok(sql.includes(`('${check}',(select ${hash(`state->'${field}'`)}='${reviewed[pin]}' from captured))`));
 }
 assert.match(sql,/bool_and\(coalesce\(pass,false\)\)/);
 assert.match(sql,/filter\(where pass is distinct from true\)/);
 assert.match(sql,/false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted/);
});
test('093 modal targets the displayed effective record; explicit correction versus future intent, no guessing from date',()=>{
 const person={id:'person',engagements:[{id:'e',kind:'employee',active:true,effective_from:'2026-10-01'}],rates:[{id:'old',monthly_amount:15000,effective_from:'2026-10-01'},{id:'future',monthly_amount:18000,effective_from:'2026-11-01'}]};
 const target=S.setupTarget(person,'rate','2026-10-01');assert.equal(target.id,'old');assert.equal(S.setupTarget(person,'rate','2026-11-01').id,'future');
 const input={kind:'rate',intent:'correct',person,target,values:{monthly_amount:16000,effective_from:'2026-10-01',reason:'Mistake'},hash:'a'.repeat(64),id:'new'};
 let body=S.setupChange(input);assert.equal(body.action,'setup_correct');assert.equal(body.payload.target,'old');assert.equal(body.payload.expected_hash,input.hash);
 body=S.setupChange({...input,values:{...input.values,effective_from:'2026-10-04'}});assert.equal(body.action,'setup_correct','Correcting a mistaken date is not silently an append');
 body=S.setupChange({...input,intent:'future',values:{...input.values,effective_from:'2026-11-01',monthly_amount:18000}});assert.equal(body.action,'rate');assert.equal(body.payload.id,'new');assert.equal(body.payload.monthly_amount,18000);
 assert.throws(()=>S.setupChange({...input,intent:'future'}),/FUTURE_DATE_REQUIRED/);assert.throws(()=>S.setupChange({...input,hash:undefined}),/CORRECTION_STALE/);
 assert.equal(person.rates[0].monthly_amount,15000);assert.equal(person.rates.length,2);
});
test('093 known business errors have actionable TH/EN messages; no raw DB or RPC names',()=>{
 for(const code of ['PAYROLL_SETUP_FINALIZED','PAYROLL_EFFECTIVE_DATE_COLLISION','PAYROLL_TYPE_MONTH_BOUNDARY_REQUIRED','PAYROLL_CORRECTION_STALE','PAYROLL_SETUP_INVALID','PAYROLL_FUTURE_DATE_REQUIRED'])for(const locale of ['th','en']){
  const text=L.payrollError(locale,Error(code));assert.equal(text,S.setupError(locale,code));assert.notEqual(text,L.payrollText(locale,'failed'));assert.doesNotMatch(text,/PAYROLL_|RPC|SQL/);
 }
 for(const value of Object.values(S.setupText)){assert.ok(value[0]);assert.ok(value[1]);assert.notEqual(value[0],value[1]);}
});
