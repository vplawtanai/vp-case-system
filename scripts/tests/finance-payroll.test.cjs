/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,overrides={}){const full=path.resolve(root,file);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full));const box={exports:{},Response,Request,URL,FormData,console,process:{env:{}},require:n=>{if(n in overrides)return overrides[n];if(n==='server-only')return{};if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}return require(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,box);return box.exports;}
const server=load('lib/server/finance-payroll.ts'),model=load('app/finance/payroll/model.ts'),labels=load('app/finance/payroll/labels.ts');
function fixture(profile={role:'admin',active:true,must_change_password:false}){const calls=[];const caller={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:{ok:true}};}};return{caller,calls,privileged:()=>{throw Error('Privileged client forbidden');}};}
async function request(f,body,origin='https://local.invalid'){return server.handlePayrollRequest(new Request('https://local.invalid/api/finance/payroll',{method:body?'POST':'GET',headers:{Authorization:'Bearer synthetic.token',Origin:origin},...(body?{body:JSON.stringify(body)}:{})}),f);}
test('089 server rejects all non-Admin/inactive/forced-password personas before RPC',async()=>{
 for(const profile of [{role:'partner',active:true},{role:'lawyer',active:true},{role:'staff',finance_operator:true,active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}])for(const action of [null,'session','engagement','rate','create_period','line','approve','prepare','confirm','cancel']){const f=fixture({must_change_password:false,...profile});assert.equal((await request(f,action?{action}:null)).status,403);assert.equal(f.calls.length,0);}
 const f=fixture();f.caller.auth.getUser=async()=>({data:{user:null},error:{}});assert.equal((await request(f)).status,401);
});
test('089 authenticated Admin only, caller RPC, scoped cookie, no-store, CSRF and request routing',async()=>{
 const f=fixture();let r=await request(f,{action:'session'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/finance\/payroll; Max-Age=1800; Secure/);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await request(f,{action:'approve'},'https://hostile.invalid')).status,403);assert.equal((await request(f,{action:'unknown'})).status,400);
 for(const action of ['engagement','rate','create_period','line','reload_period','approve']){r=await request(f,{action,payload:{explicit:'facts'},request_id:'stable-request'});assert.equal(r.status,200);assert.equal(f.calls.at(-1).name,'payroll089_manage');assert.equal(f.calls.at(-1).args.p_request_id,'stable-request');}
 for(const action of ['prepare','confirm','cancel']){await request(f,{action,items:[{line_id:'line',payout_id:'payout'}],request_id:'stable-payment',acknowledged:true});assert.equal(f.calls.at(-1).name,'payroll089_payment_batch');assert.equal(f.calls.at(-1).args.p_items.length,1);}
 const denied=load('app/finance/payroll/page.tsx',{'next/headers':{cookies:async()=>({get:()=>({value:'synthetic'})})},'next/navigation':{notFound(){throw Error('SERVER_DENIED');},redirect(){throw Error('REDIRECT');}},'../../../lib/server/finance-payroll':{PayrollError:server.PayrollError,payrollPageAllowed:async()=>{throw new server.PayrollError('PAYROLL_ADMIN_REQUIRED',403);}},'./workspace':{default:()=>null}});await assert.rejects(denied.default(),/SERVER_DENIED/);
});
test('089 effective history and browser FormData keep employee/employer deductions independent',()=>{
 assert.equal(model.effective([{effective_from:'2026-01-01',amount:20000},{effective_from:'2026-07-01',amount:23000}],'2026-06-30').amount,20000);
 const f=new FormData();for(const [k,v]of Object.entries({base_amount:'23000',additions:'2000',deductions:'500',employee_ss:'750',employer_ss:'750',wht_amount:'1000',wht_treatment:'withhold',note:'Reviewed facts'}))f.set(k,v);
 const input=model.reviewInput({id:'period',version:4},{id:'employee',kind:'employee'},f);assert.equal(model.netPay(input),22750);assert.equal(input.employer_ss,750);assert.equal(input.version,4);
 const c=model.reviewInput({id:'period',version:4},{id:'contractor',kind:'contractor'},f);assert.equal(c.employee_ss,0);assert.equal(c.employer_ss,0);assert.equal(model.netPay(c),23500);
 f.set('base_amount','23.456');assert.throws(()=>model.reviewInput({},{},f),/INPUT_INVALID/);
});
test('089 selection produces one explicit payout identity per line, prepare and confirm remain separate',()=>{
 const lines=[{id:'second',payee_id:'p2',net_amount:220},{id:'third',payee_id:'p3',net_amount:817.20}],people=lines.map(l=>({id:l.payee_id,version:2,destination:{id:'dest-'+l.id}})),accounts=[{bank_account_id:'KTB',cash_location_id:null}],choices=Object.fromEntries(lines.map(l=>[l.id,{id:'payout-'+l.id,account:'KTB',date:'2026-10-31'}]));
 const items=model.paymentItems(lines,people,accounts,choices,'prepare');assert.equal(items.length,2);assert.equal(items[0].line_id,'second');assert.equal(items[1].payout_id,'payout-third');assert.equal(model.selectedTotal(lines),1037.2);assert.equal(items[0].destination_id,'dest-second');
 assert.throws(()=>model.paymentItems(lines,people,accounts,choices,'confirm'),/STALE/);
 lines.forEach(l=>l.payment={id:'payout-'+l.id,status:'draft',version:1,bank_account_id:'KTB'});assert.equal(model.paymentItems(lines,people,accounts,choices,'confirm')[0].payout_version,1);
});
test('089 menu privacy and bilingual business labels',()=>{
 const {buildPermissions}=load('lib/permissions.ts'),{financeNavigationLinks}=load('app/finance/finance-navigation.ts');
 for(const locale of ['th','en'])for(const profile of [{role:'admin',active:true},{role:'admin',active:false},{role:'partner',active:true},{role:'staff',active:true,finance_operator:true},{role:'lawyer',active:true}]){const links=financeNavigationLinks(buildPermissions(profile),locale);assert.equal(links.some(x=>x.page==='payroll'),profile.role==='admin'&&profile.active);}
 for(const key of ['title','periods','people','obligations','employee','contractor','approve','prepare','confirm','employee_ss','employer_ss']){assert.match(labels.payrollText('th',key),/[ก-๛]/);assert.doesNotMatch(labels.payrollText('en',key),/[ก-๛]/);}
});
test('089 artifact consistency and exact Human-reviewed Production baseline binding',()=>{
 const A=require('./finance-payroll-artifacts.cjs');
 assert.equal(A.validate(),'d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b');
 const pins=JSON.parse(fs.readFileSync(A.baselinePath));
 assert.equal(pins.rows_sha256,'d7439a1db0fbcb7abadfeaed977c250f21fea50fa4eba16da0ce87623dc1af6a');
 assert.equal(pins.preserved_sha256,'9136fbd2a8e169d95dcdb8d947a861f637155922f01ec6d22b8418e12b1f5b5f');
 const verifier=fs.readFileSync(A.verifier,'utf8');
 for(const [check,field,pin]of [['historical_rows_unchanged','rows',pins.rows_sha256],['unrelated_contracts_unchanged','preserved',pins.preserved_sha256]]){
  assert.ok(verifier.includes(`('${check}',(select ${A.hash("state->'"+field+"'")}=${A.q(pin)} from captured))`));
 }
 assert.ok(verifier.includes(`('reviewed_baseline_bound',${A.q(pins.rows_sha256)} is not null and ${A.q(pins.preserved_sha256)} is not null)`));
 assert.ok(verifier.includes("('contract_exact',(select bool_and(value='[]'::jsonb) from differences))"));
 assert.ok(verifier.includes("('no_payroll_seed',(select (state->>'new_row_count')::integer=0 from captured))"));
 assert.ok(verifier.includes('bool_and(coalesce(pass,false)) gate_pass'));
 assert.ok(verifier.includes('filter(where pass is distinct from true)'));
 assert.ok(verifier.includes('false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted'));
 for(const p of [A.preflight,A.verifier])assert.doesNotMatch(fs.readFileSync(p,'utf8').replace(/^--.*$/gm,''),/\b(?:insert|update|delete|create|alter|drop|truncate)\s/i);
});
test('089 verifier retains fail-closed equality checks for unbound or partial baselines',()=>{
 const A=require('./finance-payroll-artifacts.cjs'),pins=JSON.parse(fs.readFileSync(A.baselinePath));
 for(const supplied of [{},{rows_sha256:pins.rows_sha256},{preserved_sha256:pins.preserved_sha256}]){
  const sql=A.gate(true,supplied);
  assert.match(sql,/\('reviewed_baseline_bound',.*NULL::text is not null/);
  assert.match(sql,/\('(?:historical_rows_unchanged|unrelated_contracts_unchanged)',\(select .*?=NULL::text from captured\)\)/);
  assert.ok(sql.includes('bool_and(coalesce(pass,false)) gate_pass'));
 }
});

test('Payroll business failures stay localized without exposing raw server errors',()=>{
 for(const code of ['PAYROLL_ADMIN_REQUIRED','PAYROLL_RATE_MISSING','PAYROLL_DRAFT_SOURCES_CHANGED','PAYROLL_PAYMENT_STALE','PAYROLL_REVIEW_REQUIRED','PAYROLL_ACCOUNT_DENIED','PAYROLL_DESTINATION_REQUIRED','FINANCE_CASH_OPENING_BALANCE_REQUIRED','PAYROLL_ALREADY_PREPARED','PAYROLL_RETRY_CHANGED','PAYROLL_HISTORY_IMMUTABLE','PAYROLL_NO_ELIGIBLE_PEOPLE','PAYROLL_INPUT_INVALID','Unexpected private database details']){
  const th=labels.payrollError('th',new Error(code)),en=labels.payrollError('en',new Error(code));
  assert.match(th,/[ก-๛]/);assert.doesNotMatch(en,/[ก-๛]/);assert.notEqual(th,en);assert.notEqual(en,code);assert.doesNotMatch(en,/PAYROLL_|FINANCE_/);
 }
 assert.equal(labels.payrollError('th',new Error('PAYROLL_HISTORY_IMMUTABLE')),labels.payrollText('th','historyLocked'));
});

test('Payroll landing uses effective engagement and positive rate, not account existence',()=>{
 const today='2026-10-04',engagement={id:'engagement',kind:'employee',active:true,effective_from:'2026-10-01'},rate={id:'rate',monthly_amount:23000,effective_from:'2026-10-01'};
 const person={id:'person',profile_id:'profile',is_active:true,engagements:[engagement],rates:[rate]};
 const landing=(people,on=today)=>model.payrollLandingTab({people,today:on});
 assert.equal(landing([]),'people');
 for(const patch of [{engagements:[],rates:[]},{engagements:[]},{rates:[]},{is_active:false},{profile_id:null},{rates:[{...rate,monthly_amount:0}]},{rates:[{...rate,monthly_amount:-1}]},{rates:[{...rate,monthly_amount:'invalid'}]},{engagements:[{...engagement,active:false}]},{engagements:[{...engagement,effective_from:'2026-11-01'}]},{rates:[{...rate,effective_from:'2026-11-01'}]}])assert.equal(landing([{...person,...patch}]),'people',JSON.stringify(patch));
 assert.equal(landing([person]),'periods');
 assert.equal(landing([{...person,profile_id:null,engagements:[{...engagement,kind:'contractor'}]}]),'periods','External contractors do not need a login account');
 assert.equal(landing([{...person,engagements:[],rates:[]},person]),'periods','At least one usable setup is sufficient for landing guidance');
 const history={...person,engagements:[{...engagement,active:false,effective_from:'2026-11-01'},engagement],rates:[{...rate,monthly_amount:25000,effective_from:'2026-11-01'},rate]};
 const before=JSON.stringify(history);assert.equal(landing([history]),'periods');assert.equal(landing([history],'2026-11-01'),'people');assert.equal(JSON.stringify(history),before,'History is never reordered or rewritten');
});
