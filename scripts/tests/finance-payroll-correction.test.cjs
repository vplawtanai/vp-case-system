/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,overrides={}){const full=path.resolve(root,file);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full));const box={exports:{},Response,Request,URL,FormData,console,process:{env:{}},require:n=>{if(n in overrides)return overrides[n];if(n==='server-only')return{};if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}return require(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,box);return box.exports;}
const server=load('lib/server/finance-payroll.ts'),M=load('app/finance/payroll/monthly.ts'),old=load('app/finance/payroll/model.ts'),A=require('./finance-payroll-correction-artifacts.cjs'),S=load('app/finance/payroll/single-page.ts');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(profile={role:'admin',active:true,must_change_password:false}){const calls=[],data={today:'2026-10-04',people:[{id:'p',profile_id:'p',legal_name:'Synthetic VP',engagements:[],rates:[]}],people_options:[{id:'p',profile_id:'p',kind:'internal',entity_type:'natural_person'}],periods:[]};const caller={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='payroll092_read'?{...data,monthly:{rows:[],month:args.p_month},corrections:{}}:name==='payroll089_read'?data:name==='people_admin_get_users'?[]:name==='payroll091_month'?{rows:[],month:args.p_month}:{ok:true}};}};return {caller,calls,data};}
const request=(f,body,query='',origin='https://local.invalid')=>server.handlePayrollRequest(new Request('https://local.invalid/api/finance/payroll'+query,{method:body?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer synthetic'},...(body?{body:JSON.stringify(body)}:{})}),f);
test('092 exact accepted 091 baseline, no table/column changes, SELECT-only gates and unbound verifier',()=>{
 assert.match(A.validate(),/^[a-f0-9]{64}$/);assert.equal(A.immutable091,'f375b985260d1c132efec25f8f51b4432b6cb5d580ae93d7bc3397d1b29d882b');assert.deepEqual(A.before().tables,A.after().tables);
 assert.deepEqual(Object.keys(A.before().functions).filter(k=>A.before().functions[k]!==A.after().functions[k]),['payroll089_protect()']);
 const beforeBody=require('./finance-payroll-monthly-artifacts.cjs').body(),guard=beforeBody.slice(beforeBody.indexOf('create or replace function public.payroll089_protect()'),beforeBody.indexOf('-- Public read and selected-line'));
 const body=A.body();assert.ok(body.includes(guard.slice(guard.indexOf(" if tg_op='TRUNCATE'"))),'All old update/truncate protection remains exact');
 assert.doesNotMatch(body,/create table|add column|disable trigger|grant delete/i);
 for(const post of [false,true]){const sql=A.gate(post);assert.match(sql,/WITH captured AS MATERIALIZED/);assert.doesNotMatch(sql.replace(/'(?:''|[^'])*'/g,"''").replace(/^--.*$/gm,''),/\b(call |do \$|create |update |delete |insert into|payroll092_correct\()/i);}
 assert.match(A.gate(true,{}),/reviewed_baseline_bound.*NULL::text/);assert.match(A.gate(true),/bool_and\(coalesce\(pass,false\)\)/);
});
test('092 verifier binds exact Human-reviewed Production baseline without weakening gates',()=>{
 const reviewed={rows_sha256:'f1c4febe6f8984fa0343032701ea386e57550685e516b3e327888b7a4923437b',preserved_sha256:'ed4deecb615414dca1c810959817702dadc4dc6335aafd3e360215a2cf67aca8'};
 assert.deepEqual(JSON.parse(fs.readFileSync(A.baselinePath)),reviewed);
 assert.equal(A.validate(),'4a2288524b8eb7970f44be044d299b354e60f24674a9afe24eec4c5cf42bcb60');
 const sql=fs.readFileSync(A.verifier,'utf8'),{hash}=require('./finance-authority-artifacts.cjs');
 assert.equal(sql,A.gate(true,reviewed));
 let unbound=sql;
 for(const value of Object.values(reviewed)){
  assert.equal(sql.split(`'${value}'`).length-1,2);
  unbound=unbound.replaceAll(`'${value}'`,'NULL::text');
 }
 assert.equal(unbound,A.gate(true,{}),'Only reviewed baseline literals may differ from the unbound verifier');
 for(const [check,field,pin] of [['historical_rows_unchanged','rows','rows_sha256'],['unrelated_contracts_unchanged','preserved','preserved_sha256']]){
  assert.ok(sql.includes(`('${check}',(select ${hash(`state->'${field}'`)}='${reviewed[pin]}' from captured))`),'Preservation requires exact equality to the reviewed hash');
 }
 assert.match(sql,/bool_and\(coalesce\(pass,false\)\) gate_pass/);
 assert.match(sql,/filter\(where pass is distinct from true\)/);
 assert.match(sql,/false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted/);
});
test('092 correction API authenticates Admin/CSRF before one controlled RPC, forwards exact expected hash',async()=>{
 const f=fixture(),payload={kind:'line',payee_id:'p',target:'l',expected_hash:'a'.repeat(64),reason:'Wrong amount'},request_id='synthetic-request';
 const response=await request(f,{action:'correct',payload,request_id});assert.equal(response.status,200);assert.deepEqual(plain(f.calls),[{name:'payroll092_correct',args:{p_action:'line',p_payee:'p',p_target:'l',p_expected_hash:payload.expected_hash,p_reason:payload.reason,p_request_id:request_id}}]);
 for(const profile of [{role:'partner',active:true},{role:'staff',active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}]){const denied=fixture(profile);assert.equal((await request(denied,{action:'correct',payload})).status,403);assert.equal(denied.calls.length,0);}
 const denied=fixture();assert.equal((await request(denied,{action:'correct',payload},'','https://evil.invalid')).status,403);assert.equal(denied.calls.length,0);
});
test('092 monthly edits accept explicit changes to known tax/SS; zero remains explicit, Contractor rejects SSO treatment',()=>{
 const row={kind:'employee',source_fresh:true,line:{reviewed:true,employee_ss:750,employer_ss:750,wht_treatment:'withhold',wht_amount:300,additions:0,deductions:0}},f=new FormData();
 for(const[k,v]of Object.entries({base_amount:'15000',additions:'500',deductions:'100',employee_ss:'600',employer_ss:'700',wht_treatment:'withhold',wht_amount:'200',note:'Revised reviewed facts'}))f.set(k,v);
 let facts=M.monthlyFacts(row,f);assert.equal(facts.employee_ss,600);assert.equal(facts.employer_ss,700);assert.equal(facts.wht_amount,200);assert.equal(old.netPay(facts),14600);
 f.set('wht_treatment','none');f.delete('wht_amount');facts=M.monthlyFacts(row,f);assert.equal(facts.wht_amount,0);assert.equal(facts.wht_treatment,'none');
 const unknown={...row,line:null};f.delete('employee_ss');assert.throws(()=>M.monthlyFacts(unknown,f),/FACTS_REQUIRED/);f.set('employee_ss','0');assert.equal(M.monthlyFacts(unknown,f).employee_ss,0);
 f.set('employee_ss','999');f.set('employer_ss','999');facts=M.monthlyFacts({...unknown,kind:'contractor'},f);assert.equal(facts.employee_ss,0);assert.equal(facts.employer_ss,0);
});
test('092 month workspace keeps historic inactive people accessible, does not mutate source or count absent people as payable',()=>{
 const p={id:'p',profile_id:'p',legal_name:'History',engagements:[{id:'e',active:false,kind:'employee',effective_from:'2026-10-01'}],rates:[],is_active:false,destination:null};
 const data={people:[p],people_options:[{id:'p',profile_id:'p',kind:'internal',entity_type:'natural_person'}],monthly:{month:'2026-10-01',rows:[]}};
 assert.equal(S.workspacePeople(data).length,0);assert.equal(S.workspacePeople(data,true).length,1);assert.equal(S.readyForConfirmation(S.workspacePeople(data,true)[0].row),false);assert.equal(data.monthly.rows.length,0);
 const historic={payee_id:'p',profile_id:'p',state:'paid',line:{reviewed:true},issues:[],source_fresh:true};data.monthly.rows=[historic];assert.equal(S.workspacePeople(data).length,1);assert.equal(S.readyForConfirmation(historic),false);
 for(const [k,v]of Object.entries(S.singleText)){assert.ok(v[0].length&&v[1].length,k);assert.equal(S.st('th',k),v[0]);assert.equal(S.st('en',k),v[1]);}
});
test('092 one-modal Add Person retains internal eligibility, stable step retry IDs, and existing payee source',async()=>{
 const f=fixture(),original=f.caller.rpc,people=[{id:'p',active:true,account_type:'operational',assignable:true,full_name:'Synthetic'}];
 Object.assign(f.data.people_options[0],{legal_name:'Synthetic',is_active:true,version:1});
 f.caller.rpc=async(n,a)=>n==='people_admin_get_users'?{data:people}:original(n,a);
 const body={action:'setup',request_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',payload:{payee_id:'p',kind:'contractor',effective_from:'2026-10-01',monthly_amount:15000,reason:'Setup'}};
 assert.equal((await request(f,body)).status,200);let calls=f.calls.filter(c=>c.name==='payroll089_manage');assert.equal(calls.length,2);assert.equal(calls[0].args.p_action,'engagement');assert.equal(calls[0].args.p_payload.active,true);assert.equal(calls[1].args.p_action,'rate');assert.equal(f.calls.some(c=>c.name==='save_finance_payee'),false,'Existing unchanged destination is reused');const expected=plain(calls);f.calls.length=0;
 assert.equal((await request(f,body)).status,200);assert.deepEqual(plain(f.calls.filter(c=>c.name==='payroll089_manage')),expected);
 people[0].assignable=false;f.calls.length=0;assert.equal((await request(f,body)).status,400);assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false);
});
test('092 setup validates destination before writes and reuses the existing Finance destination contract',async()=>{
 const f=fixture(),rpc=f.caller.rpc;Object.assign(f.data.people_options[0],{legal_name:'Synthetic',is_active:true,version:null,destination:null});
 f.caller.rpc=async(n,a)=>n==='people_admin_get_users'?{data:[{id:'p',active:true,account_type:'operational',assignable:true,full_name:'Synthetic'}]}:rpc(n,a);
 const body={action:'setup',request_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',payload:{payee_id:'p',kind:'employee',effective_from:'2026-10-01',monthly_amount:15000,reason:'Reviewed setup',destination:{bank_name:'KTB',account_name:'Synthetic',account_number:'1234567890'}}};
 const invalid={...body,payload:{...body.payload,destination:{...body.payload.destination,account_number:''}}};assert.equal((await request(f,invalid)).status,400);assert.equal(f.calls.some(c=>['save_finance_payee','payroll089_manage'].includes(c.name)),false);f.calls.length=0;
 assert.equal((await request(f,body)).status,200);const saved=f.calls.find(c=>c.name==='save_finance_payee');assert.equal(saved.args.p_profile_id,'p');assert.equal(saved.args.p_expected_version,null);assert.deepEqual(plain(saved.args.p_input.destination),body.payload.destination);assert.equal(f.calls.filter(c=>c.name==='payroll089_manage').length,2);
});
