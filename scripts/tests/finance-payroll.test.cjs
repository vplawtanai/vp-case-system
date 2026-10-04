/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(file,overrides={}){const full=path.resolve(root,file);if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full));const box={exports:{},Response,Request,URL,FormData,console,process:{env:{}},require:n=>{if(n in overrides)return overrides[n];if(n==='server-only')return{};if(n.startsWith('.')){let p=path.resolve(path.dirname(full),n);if(!fs.existsSync(p))p+=fs.existsSync(p+'.ts')?'.ts':'.tsx';return load(p);}return require(n);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,box);return box.exports;}
const server=load('lib/server/finance-payroll.ts'),model=load('app/finance/payroll/model.ts'),labels=load('app/finance/payroll/labels.ts');
function fixture(profile={role:'admin',active:true,must_change_password:false}){
 const calls=[],profiles=[{id:'internal',active:true,account_type:'operational',assignable:true,staff_name:'VP Person',email:'person@example.invalid'}],data={people:[],people_options:[{id:'internal',profile_id:'internal',kind:'internal',entity_type:'natural_person',version:1}],periods:[{id:'period',month:'2026-10-01'}]};
 const caller={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile})};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='get_finance_payees'?data.people_options:name==='payroll089_read'?data:name==='people_admin_get_users'?profiles:{ok:true}};}};
 return{caller,calls,data,profiles,privileged:()=>{throw Error('Privileged client forbidden');}};
}
async function request(f,body,origin='https://local.invalid'){return server.handlePayrollRequest(new Request('https://local.invalid/api/finance/payroll',{method:body?'POST':'GET',headers:{Authorization:'Bearer synthetic.token',Origin:origin},...(body?{body:JSON.stringify(body)}:{})}),f);}
test('089 server rejects all non-Admin/inactive/forced-password personas before RPC',async()=>{
 for(const profile of [{role:'partner',active:true},{role:'lawyer',active:true},{role:'staff',finance_operator:true,active:true},{role:'admin',active:false},{role:'admin',active:true,must_change_password:true}])for(const action of [null,'session','engagement','rate','create_period','line','approve','prepare','confirm','cancel']){const f=fixture({must_change_password:false,...profile});assert.equal((await request(f,action?{action}:null)).status,403);assert.equal(f.calls.length,0);}
 const f=fixture();f.caller.auth.getUser=async()=>({data:{user:null},error:{}});assert.equal((await request(f)).status,401);
});
test('089 authenticated Admin only, caller RPC, scoped cookie, no-store, CSRF and request routing',async()=>{
 const f=fixture();let r=await request(f,{action:'session'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/finance\/payroll; Max-Age=1800; Secure/);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await request(f,{action:'approve'},'https://hostile.invalid')).status,403);assert.equal((await request(f,{action:'unknown'})).status,400);
 for(const action of ['engagement','rate','create_period','line','reload_period','approve']){r=await request(f,{action,payload:{payee_id:'internal',active:true,month:'2026-10-01',period_id:'period'},request_id:'stable-request'});assert.equal(r.status,200);assert.equal(f.calls.at(-1).name,'payroll089_manage');assert.equal(f.calls.at(-1).args.p_request_id,'stable-request');}
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
 const person={id:'person',profile_id:'person',is_active:true,engagements:[engagement],rates:[rate]};
 const landing=(people,on=today)=>model.payrollLandingTab({people,today:on});
 assert.equal(landing([]),'people');
 for(const patch of [{engagements:[],rates:[]},{engagements:[]},{rates:[]},{is_active:false},{profile_id:null},{rates:[{...rate,monthly_amount:0}]},{rates:[{...rate,monthly_amount:-1}]},{rates:[{...rate,monthly_amount:'invalid'}]},{engagements:[{...engagement,active:false}]},{engagements:[{...engagement,effective_from:'2026-11-01'}]},{rates:[{...rate,effective_from:'2026-11-01'}]}])assert.equal(landing([{...person,...patch}]),'people',JSON.stringify(patch));
 assert.equal(landing([person]),'periods');
 assert.equal(landing([{...person,profile_id:null,engagements:[{...engagement,kind:'contractor'}]}]),'people','External contractors are not Payroll people');
 assert.equal(landing([{...person,engagements:[{...engagement,kind:'contractor'}]}]),'periods','Internal people can be contractors');
 assert.equal(landing([{...person,engagements:[],rates:[]},person]),'periods','At least one usable setup is sufficient for landing guidance');
 const history={...person,engagements:[{...engagement,active:false,effective_from:'2026-11-01'},engagement],rates:[{...rate,monthly_amount:25000,effective_from:'2026-11-01'},rate]};
 const before=JSON.stringify(history);assert.equal(landing([history]),'periods');assert.equal(landing([history],'2026-11-01'),'people');assert.equal(JSON.stringify(history),before,'History is never reordered or rewritten');
});

test('Payroll setup projects internal People only without rewriting Finance identities or history',()=>{
 const f=fixture(),internal=f.data.people_options[0];
 f.data.people_options.push({id:'external',profile_id:null,kind:'external',entity_type:'natural_person'}, {...internal,id:'wrong-profile'}, {...internal,id:'juristic',profile_id:'juristic',entity_type:'juristic_person'}, {...internal,id:'wrong-kind',profile_id:'wrong-kind',kind:'external'});
 f.data.people=f.data.people_options.map(p=>({...p,engagements:[{kind:'contractor',active:true,effective_from:'2026-01-01'}],rates:[]}));
 const before=JSON.stringify(f.data);
 assert.deepEqual(Array.from(model.payrollPeopleOptions(f.data.people_options),p=>p.id),['internal']);
 assert.deepEqual(Array.from(model.payrollSetupPeople(f.data),p=>p.id),['internal']);
 assert.equal(JSON.stringify(f.data),before,'External Finance records and all history stay intact');
});

test('Payroll API rejects external/forged setup before mutation; internal Employee and Contractor both work',async()=>{
 for(const action of ['engagement','rate'])for(const identity of [null,{id:'external',profile_id:null,kind:'external',entity_type:'natural_person'},{id:'forged',profile_id:'internal',kind:'internal',entity_type:'natural_person'}]){
  const f=fixture();if(identity)f.data.people_options.push(identity);
  const r=await request(f,{action,payload:{payee_id:identity?.id||'unknown',profile_id:'internal',kind:'employee'}});
  assert.equal(r.status,400);assert.equal((await r.json()).error,'PAYROLL_INTERNAL_PERSON_REQUIRED');
  assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false);
 }
 for(const kind of ['employee','contractor']){
  const f=fixture(),payload={id:'engagement',payee_id:'internal',kind,active:true,effective_from:'2026-10-01',reason:'Internal VP engagement'};
  assert.equal((await request(f,{action:'engagement',payload,request_id:'same-request'})).status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).args.p_payload)),payload);assert.equal(f.calls.at(-1).args.p_request_id,'same-request');
 }
 for(const response of [{error:{message:'failed'}},{data:null}]){
  const f=fixture();f.caller.rpc=async name=>{f.calls.push({name});return response;};
  assert.notEqual((await request(f,{action:'rate',payload:{payee_id:'internal'}})).status,200);
  assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false);
 }
});

test('Existing external engagement cannot silently seed a new/reloaded Payroll period',async()=>{
 const engagement={active:true,effective_from:'2026-01-01',kind:'contractor'};
 for(const action of ['create_period','reload_period']){
  const f=fixture();f.data.people.push({id:'external',profile_id:null,engagements:[engagement]});
  const r=await request(f,{action,payload:{month:'2026-10-01',period_id:'period'}});
  assert.equal(r.status,400);assert.equal((await r.json()).error,'PAYROLL_INTERNAL_PERSON_REQUIRED');
  assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false);
 }
 const f=fixture(),outside={id:'external',profile_id:null,engagements:[engagement]};f.data.people=[outside];
 const check=events=>model.hasExternalPayrollSource({...f.data,people:[{...outside,engagements:events}]},'2026-10-01');
 assert.equal(check([engagement,{active:false,effective_from:'2026-10-01'}]),false,'Ended before period');
 assert.equal(check([{...engagement,effective_from:'2026-11-01'}]),false,'Future period only');
 assert.equal(check([engagement,{active:false,effective_from:'2026-10-02'}]),true,'Active for part of selected month');
 assert.equal(check([{...engagement,effective_from:'2026-10-31'}]),true,'Starts within selected month');
 assert.equal(model.hasExternalPayrollSource({...f.data,people:[{...outside,id:'internal',profile_id:'internal'}]},'2026-10-01'),false,'Internal Contractor is eligible');
 assert.throws(()=>model.hasExternalPayrollSource(f.data,'invalid'),/PAYROLL_MONTH_INVALID/);
 for(const locale of ['th','en'])assert.equal(labels.payrollError(locale,Error('PAYROLL_INTERNAL_PERSON_REQUIRED')),labels.payrollText(locale,'internalOnly'));
});

test('New Payroll eligibility uses exact People flags and preserves same-name identities',()=>{
 const f=fixture(),base=f.profiles[0];
 const profiles=[base,...[{active:false},{account_type:'uat'},{account_type:null},{assignable:false},{active:'true'},{assignable:null}].map((patch,i)=>({...base,id:'excluded-'+i,...patch})),{...base,id:'second',email:'second@example.invalid'},{...base,id:'no-email',email:null}];
 f.data.people_options=profiles.map(p=>({id:p.id,profile_id:p.id,kind:'internal',entity_type:'natural_person',legal_name:'Same name',version:1}));
 const options=model.newPayrollPeople(f.data,profiles);
 assert.deepEqual(Array.from(options,p=>p.id),['internal','second','no-email']);
 assert.equal(options[0].display_label,'VP Person · person@example.invalid');
 assert.equal(options[1].display_label,'VP Person · second@example.invalid');
 assert.equal(options[2].display_label,'VP Person · no-email');
 const duplicate=model.newPayrollPeople(f.data,[base,{...base,id:'second'}]);
 assert.equal(new Set(duplicate.map(p=>p.display_label)).size,2,'No name/email deduplication');
 f.data.people=[{id:'internal',profile_id:'internal',engagements:[{active:true}],rates:[]}];
 assert.equal(model.newPayrollPeople(f.data,profiles).some(p=>p.id==='internal'),false,'Existing people use their history card, not Add');
 assert.equal(model.payrollSetupPeople(f.data).length,1,'Existing history stays visible independently of new eligibility');
});

test('Payroll API rechecks current new-person eligibility and creation is active only',async()=>{
 for(const patch of [{active:false},{account_type:'uat'},{account_type:null},{assignable:false}])for(const action of ['engagement','rate']){
  const f=fixture();Object.assign(f.profiles[0],patch);
  const r=await request(f,{action,payload:{payee_id:'internal',kind:'contractor',active:true,assignable:true,account_type:'operational'}});
  assert.equal(r.status,400);assert.equal((await r.json()).error,'PAYROLL_PERSON_NOT_ELIGIBLE');
  assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false,'Forged client eligibility is ignored');
 }
 for(const active of [false,undefined]){
  const f=fixture(),r=await request(f,{action:'engagement',payload:{payee_id:'internal',kind:'employee',active}});
  assert.equal(r.status,400);assert.equal((await r.json()).error,'PAYROLL_NEW_ENGAGEMENT_ACTIVE_REQUIRED');
  assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false);
 }
 const f=fixture();f.caller.rpc=async name=>{f.calls.push({name});return name==='payroll089_read'?{data:f.data}:{error:{message:'Roster unavailable'}};};
 assert.notEqual((await request(f,{action:'engagement',payload:{payee_id:'internal',active:true}})).status,200);
 assert.equal(f.calls.some(c=>c.name==='payroll089_manage'),false,'Missing eligibility evidence fails closed');
});

test('Historical Payroll remains readable/editable after account eligibility changes; ending appends dated facts',async()=>{
 const f=fixture();Object.assign(f.profiles[0],{active:false,account_type:'uat',assignable:false});
 f.data.people=[{id:'internal',profile_id:'internal',engagements:[{id:'old',kind:'contractor',active:true,effective_from:'2026-01-01'}],rates:[{id:'rate',monthly_amount:15000,effective_from:'2026-01-01'}]}];
 const before=JSON.stringify(f.data),read=await request(f),body=await read.json();
 assert.equal(read.status,200);assert.deepEqual(body.people,f.data.people);assert.deepEqual(body.new_people_options,[]);
 for(const action of ['rate','engagement']){
  const payload={id:'new-history',payee_id:'internal',kind:'contractor',active:false,effective_from:'2026-11-01',reason:'End engagement',monthly_amount:16000};
  assert.equal((await request(f,{action,payload,request_id:'history-request'})).status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).args.p_payload)),payload);
 }
 assert.equal(JSON.stringify(f.data),before,'No historical objects filtered, rewritten or mutated');
 for(const locale of ['th','en'])assert.equal(labels.payrollError(locale,Error('PAYROLL_PERSON_NOT_ELIGIBLE')),labels.payrollText(locale,'personNotEligible'));
});
