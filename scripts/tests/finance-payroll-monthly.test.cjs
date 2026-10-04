/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,overrides={}){const full=path.resolve(root,file);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full));const box={exports:{},Response,Request,URL,FormData,console,process:{env:{}},require:n=>{if(n in overrides)return overrides[n];if(n==='server-only')return{};if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}return require(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,box);return box.exports;}
const server=load('lib/server/finance-payroll.ts'),M=load('app/finance/payroll/monthly.ts'),old=load('app/finance/payroll/model.ts'),A=require('./finance-payroll-monthly-artifacts.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(profile={role:'admin',active:true,must_change_password:false}){const calls=[],data={today:'2026-10-04',people:[{id:'p',profile_id:'p',legal_name:'Synthetic VP',engagements:[],rates:[]}],people_options:[{id:'p',profile_id:'p',kind:'internal',entity_type:'natural_person'}],periods:[]};const caller={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='payroll092_read'?{...data,monthly:{rows:[],month:args.p_month},corrections:{}}:name==='payroll089_read'?data:name==='people_admin_get_users'?[]:name==='payroll091_month'?{rows:[],month:args.p_month}:{ok:true}};}};return {caller,calls,data};}
const request=(f,body,query='',origin='https://local.invalid')=>server.handlePayrollRequest(new Request('https://local.invalid/api/finance/payroll'+query,{method:body?'POST':'GET',headers:{Origin:origin,Authorization:'Bearer synthetic'},...(body?{body:JSON.stringify(body)}:{})}),f);
test('091 artifacts accept 090 baseline, only explicit contract changes; SELECT gates/unbound fail closed',()=>{
 assert.match(A.validate(),/^[a-f0-9]{64}$/);assert.equal(A.immutable089,'d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b');assert.equal(A.immutable090,'ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b');
 assert.deepEqual(Object.keys(A.before().tables).filter(k=>A.before().tables[k]!==A.after().tables[k]),['finance_payroll_periods']);
 assert.deepEqual(Object.keys(A.before().functions).filter(k=>A.before().functions[k]!==A.after().functions[k]).sort(),['payroll089_manage(text,jsonb,uuid)','payroll089_period_assert()','payroll089_protect()']);
 for(const post of [false,true]){const sql=A.gate(post);assert.match(sql,/WITH captured AS MATERIALIZED/);assert.doesNotMatch(sql.replace(/'(?:''|[^'])*'/g,"''").replace(/^--.*$/gm,''),/\b(call |do \$|create |update |delete |insert into|payroll091_manage\()/i);}
 assert.match(A.gate(true,{}),/reviewed_baseline_bound.*NULL::text/);
});
test('091 verifier binds exact Human-reviewed Production baseline and retains fail-closed preservation checks',()=>{
 const reviewed={rows_sha256:'f1c4febe6f8984fa0343032701ea386e57550685e516b3e327888b7a4923437b',preserved_sha256:'53301c3f50b73ba100a1e2d9e5431601b388ce16ddb9b711c25cc75aedeb3ab2'};
 assert.deepEqual(JSON.parse(fs.readFileSync(A.baselinePath)),reviewed);
 assert.equal(A.validate(),'f375b985260d1c132efec25f8f51b4432b6cb5d580ae93d7bc3397d1b29d882b');
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
test('091 GET month is read-only; explicit selected items go to one atomic RPC; retired period actions denied',async()=>{
 const f=fixture();assert.equal((await request(f,null,'?month=2026-10-01')).status,200);assert.deepEqual(f.calls.map(c=>c.name),['payroll092_read','people_admin_get_users']);assert.equal(f.calls[0].args.p_month,'2026-10-01');f.calls.length=0;
 const items=[{payee_id:'p',source_hash:'hash',line_hash:null}];const r=await request(f,{action:'monthly_pay',month:'2026-10-01',items,request_id:'same-retry',acknowledged:true});assert.equal(r.status,200);assert.equal(f.calls.filter(x=>x.name==='payroll091_manage').length,1);assert.deepEqual(plain(f.calls.at(-1).args),{p_action:'pay',p_month:'2026-10-01',p_items:items,p_request_id:'same-retry',p_acknowledged:true});
 for(const action of ['approve','create_period','reload_period','line','prepare','confirm'])assert.equal((await request(f,{action})).status,400);
 assert.equal((await request(f,null,'?month=2026-99-01')).status,400);
 assert.equal((await request(f,{action:'cancel',items:[{line_id:'legacy-line',payout_id:'draft',payout_version:1}],acknowledged:true})).status,200);assert.equal(f.calls.at(-1).name,'payroll089_payment_batch');assert.equal(f.calls.at(-1).args.p_action,'cancel');
});
test('091 Admin/privacy/CSRF enforced before Payroll reads and mutation',async()=>{
 for(const profile of [{role:'partner',active:true},{role:'staff',active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}]){const f=fixture(profile);for(const body of [null,{action:'monthly_pay'}])assert.equal((await request(f,body)).status,403);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await request(f,{action:'monthly_pay'},'','https://evil.invalid')).status,403);assert.equal(f.calls.length,0);
});
test('091 safe person errors return only caller-visible name; no raw bank/SQL details',async()=>{
 const f=fixture(),rpc=f.caller.rpc;f.caller.rpc=async(n,a)=>n==='payroll091_manage'?{error:{message:'PAYROLL_PERSON_SETUP_INCOMPLETE',details:JSON.stringify({payee_id:'p',sql:'SECRET SQL',account:'123456789'})}}:rpc(n,a);
 const r=await request(f,{action:'monthly_save',month:'2026-10-01',items:[]});const result=await r.json();assert.equal(result.issue.person,'Synthetic VP');assert.doesNotMatch(JSON.stringify(result),/SECRET|123456789/);
});
test('091 form actual amount/reason, Contractor zero SS, explicit tax facts and exact line token',()=>{
 const row={payee_id:'p',profile_id:'p',kind:'contractor',line_hash:'linehash',source_hash:'sourcehash',state:'ready',issues:[],source_fresh:true,line:{id:'line',reviewed:true}};assert.equal(M.canPay(row),true);assert.equal(M.canPay({...row,profile_id:null}),false);
 const f=new FormData();for(const[k,v]of Object.entries({base_amount:'10000',additions:'0',deductions:'0',wht_amount:'450',wht_treatment:'withhold',note:'Reviewed actual October amount',confirmed:'on',employee_ss:'999',employer_ss:'999'}))f.set(k,v);
 const facts=M.monthlyFacts(row,f);assert.equal(facts.base_amount,10000);assert.equal(facts.adjustment_reason,facts.note);assert.equal(facts.employee_ss,0);assert.equal(facts.employer_ss,0);assert.equal(facts.confirmed,true);assert.equal(old.netPay(facts),9550);f.set('wht_treatment','none');assert.throws(()=>M.monthlyFacts(row,f),/TAX_MISMATCH/);f.set('wht_treatment','withhold');f.set('base_amount','');assert.throws(()=>M.monthlyFacts(row,f),/FACTS_REQUIRED/);
 assert.deepEqual(plain(M.lineIdentity(row,'ignored')),{payee_id:'p',line_id:'line',line_hash:'linehash',source_hash:'sourcehash'});
 const pending={...row,line:null,state:'setup_incomplete',issues:['monthly_facts_required'],source:{requires_base_review:false}};assert.equal(M.canPay(pending),true,'Full-month facts may be confirmed inside Pay');assert.equal(M.canPay({...pending,source:{requires_base_review:true}}),false);
});
test('091 amount modal reuses known monthly facts and requires explicit unresolved tax/SS without guessing zero',()=>{
 const line={reviewed:true,additions:100,deductions:25,employee_ss:750,employer_ss:750,wht_treatment:'withhold',wht_amount:450};
 const row={kind:'employee',source_fresh:true,line};
 const f=new FormData();f.set('base_amount','10000');f.set('note','Reviewed actual amount');
 assert.deepEqual(plain(M.knownMonthlyFacts(row)),{employee_ss:750,employer_ss:750,wht_treatment:'withhold',wht_amount:450});
 const saved=M.monthlyFacts(row,f);assert.equal(saved.employee_ss,750);assert.equal(saved.employer_ss,750);assert.equal(saved.wht_amount,450);assert.equal(saved.additions,100);assert.equal(saved.deductions,25);assert.equal(saved.confirmed,true);
 const oneMissing={...row,line:{...line,employer_ss:null}};
 assert.deepEqual(plain(M.knownMonthlyFacts(oneMissing)),{employee_ss:750,wht_treatment:'withhold',wht_amount:450});
 assert.throws(()=>M.monthlyFacts(oneMissing,f),/FACTS_REQUIRED/);f.set('employer_ss','0');assert.equal(M.monthlyFacts(oneMissing,f).employer_ss,0);
 const defaults={...row,line:{...line,reviewed:false,employee_ss:0,employer_ss:0,wht_treatment:'none',wht_amount:0}};
 assert.deepEqual(plain(M.knownMonthlyFacts(defaults)),{});assert.deepEqual(plain(M.knownMonthlyFacts({...row,source_fresh:false})),{});
 assert.throws(()=>M.monthlyFacts(defaults,f),/FACTS_REQUIRED/);f.set('employee_ss','0');assert.throws(()=>M.monthlyFacts(defaults,f),/FACTS_REQUIRED/);
 f.set('wht_treatment','none');const zero=M.monthlyFacts(defaults,f);assert.equal(zero.wht_amount,0);assert.equal(zero.employee_ss,0);assert.equal(zero.employer_ss,0);
 f.delete('employee_ss');f.delete('employer_ss');const contractor=M.monthlyFacts({...defaults,kind:'contractor'},f);assert.equal(contractor.employee_ss,0);assert.equal(contractor.employer_ss,0);
 f.set('wht_treatment','withhold');assert.throws(()=>M.monthlyFacts({...defaults,kind:'contractor'},f),/FACTS_REQUIRED/);
});
test('091 month navigation, localized dates and all new bilingual labels',()=>{
 assert.equal(M.shiftMonth('2026-12-01',1),'2027-01-01');assert.equal(M.shiftMonth('2026-01-01',-1),'2025-12-01');assert.equal(M.monthLabel('2026-10-01','th'),'ตุลาคม 2569');assert.equal(M.monthLabel('2026-10-01','en'),'October 2026');assert.match(M.dateLabel('2026-10-04','th'),/2569/);for(const [k,v]of Object.entries(M.monthlyText)){assert.ok(v[0].length&&v[1].length,k);assert.equal(M.mt('th',k),v[0]);assert.equal(M.mt('en',k),v[1]);}
});
