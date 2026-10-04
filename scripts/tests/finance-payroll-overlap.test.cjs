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
const artifacts=require('./finance-payroll-overlap-artifacts.cjs');
const person=(patch={})=>({id:'internal',profile_id:'internal',legal_name:'Synthetic VP person',is_active:true,version:1,destination:{id:'dest',bank_name:'KTB',account_number:'1234566789',is_active:true},engagements:[{id:'e',active:true,kind:'contractor',effective_from:'2026-09-01'}],rates:[{id:'r',monthly_amount:15000,effective_from:'2026-10-04'}],...patch});
test('090 artifacts keep accepted 089 immutable, only source helper changes; unbound verifier fail closed',()=>{
 assert.match(artifacts.validate(),/^[0-9a-f]{64}$/);
 const before=artifacts.before(),after=artifacts.after();assert.deepEqual(before.tables,after.tables);
 assert.deepEqual(Object.keys(before.functions).filter(s=>before.functions[s]!==after.functions[s]),['payroll089_sources(date)']);
 const sql=artifacts.body();assert.doesNotMatch(sql,/\b(insert into|update public|delete from|create table|alter table)\b/i);
 assert.match(sql,/perform public.payroll089_require_admin\(\)/);
 for(const post of [false,true]){const gate=artifacts.gate(post);assert.match(gate,/WITH captured AS MATERIALIZED/i);assert.doesNotMatch(gate.replace(/'(?:''|[^'])*'/g,"''").replace(/^--.*$/gm,''),/\b(call |do \$|create |update |delete |insert into|payroll089_sources\()/i);assert.match(gate,/COLLATE "C"/);}
 assert.match(artifacts.gate(true,{}),/reviewed_baseline_bound.*NULL::text/);
});
test('090 verifier binds exact Human-reviewed Production baseline and preserves equality guards',()=>{
 const reviewed={rows_sha256:'d6effc8fcf950a4526d7258f08c456eb915d3bf50848f82e76f71efd540cbe01',preserved_sha256:'6e27eeeec1ca4b15def77cf4b254249cc1227d06a22eb966c286254776a56c81'};
 assert.deepEqual(JSON.parse(fs.readFileSync(artifacts.baselinePath)),reviewed);
 assert.equal(artifacts.validate(),'ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b');
 const {hash}=require('./finance-authority-artifacts.cjs');
 const bound=artifacts.gate(true),unbound=artifacts.gate(true,{});
 assert.equal(bound,fs.readFileSync(artifacts.verifier,'utf8'));
 assert.equal(bound.replaceAll("'"+reviewed.rows_sha256+"'",'NULL::text').replaceAll("'"+reviewed.preserved_sha256+"'",'NULL::text'),unbound,'Binding changes only the four baseline literals; every guard is retained');
 for(const [check,key]of [['historical_rows_unchanged','rows'],['unrelated_contracts_unchanged','preserved']]){
  const actualHash=hash("state->'"+key+"'");
  assert.ok(bound.includes(`('${check}',(select ${actualHash}='${reviewed[key+'_sha256']}' from captured))`));
 }
 assert.match(bound,/bool_and\(coalesce\(pass,false\)\)/);
 assert.match(bound,/false business_rpc_executed,false historical_migration,false broader_finance_differences_accepted/);
});
test('090 October 4 initial rate is eligible October; full months, interval boundaries and changes align with DB',()=>{
 const p=person();let r=model.payrollMonthReadiness(p,'2026-10-01');assert.equal(r.missing,null);assert.deepEqual(Array.from(r.reasons),['rate_starts_after_service_start']);
 assert.equal(model.payrollMonthReadiness(p,'2026-09-01').missing,'rate');
 r=model.payrollMonthReadiness(p,'2026-11-01');assert.equal(r.missing,null);assert.equal(r.reasons.length,0);
 assert.deepEqual(Array.from(model.payrollMonthReadiness(person({rates:[]}), '2026-10-01').reasons),[]);
 p.rates.unshift({id:'old',monthly_amount:12000,effective_from:'2026-09-01'});r=model.payrollMonthReadiness(p,'2026-10-01');assert.deepEqual(Array.from(r.reasons),['rate_ends_before_service_end','rate_changes_during_service']);
 p.engagements.push({id:'end',active:false,kind:'contractor',effective_from:'2026-10-04'});p.rates=p.rates.filter(x=>x.id!=='old');assert.equal(model.payrollMonthReadiness(p,'2026-10-01').missing,'rate','Rate starting exactly at termination does not overlap');
 p.engagements[1].effective_from='2026-10-05';r=model.payrollMonthReadiness(p,'2026-10-01');assert.equal(r.missing,null);assert.ok(r.reasons.includes('engagement_ends_mid_month'));
});
test('090 readiness uses existing recipient/destination, masks bank, never hides history',()=>{
 const p=person(),before=JSON.stringify(p);const result=model.payrollPaymentReadiness(p);assert.equal(result.recipient,true);assert.equal(result.bank,true);assert.ok(result.summary.endsWith('6789'));assert.ok(!result.summary.includes('123456'));assert.equal(JSON.stringify(p),before);
 assert.equal(model.payrollPaymentReadiness(person({destination:null})).bank,false);assert.equal(model.payrollPaymentReadiness(person({is_active:false})).recipient,false);
 assert.equal(model.payrollMonthReadiness(person({is_active:false}),'2026-10-01').missing,'payee');assert.equal(model.hasPayrollHistory(person({is_active:false})),true);
});
test('090 missing-rate errors identify only caller-visible person and service interval, never raw SQL/bank detail',async()=>{
 const f=fixture();f.data.people=[person()];const original=f.caller.rpc;
 f.caller.rpc=async(name,args)=>name==='payroll089_manage'?{error:{message:'PAYROLL_RATE_MISSING',details:JSON.stringify({payee_id:'internal',reason:'no_rate_overlap',month:'2026-10-01',service_from:'2026-10-01',service_to:'2026-10-31',sql:'SECRET SQL',bank:'1234566789'})}}:original(name,args);
 const response=await request(f,{action:'create_period',payload:{month:'2026-10-01'}}),body=await response.json();assert.equal(response.status,409);assert.equal(body.issue.person,'Synthetic VP person');assert.doesNotMatch(JSON.stringify(body),/SECRET|1234566789/);
 for(const locale of ['th','en']){const error=Object.assign(Error(body.error),{issue:body.issue});const text=labels.payrollError(locale,error);assert.ok(text.includes(body.issue.person));assert.ok(text.includes('2026-10-31'));assert.notEqual(text,labels.payrollText(locale,'rateMissing'));}
 f.data.people=[];assert.equal((await (await request(f,{action:'create_period',payload:{month:'2026-10-01'}})).json()).issue,undefined);
 const denied=fixture({role:'staff',active:true,must_change_password:false});const d=await request(denied,{action:'create_period',payload:{month:'2026-10-01'}});assert.equal(d.status,403);assert.equal((await d.json()).issue,undefined);assert.equal(denied.calls.length,0);
});
test('090 blank review amount rejected; contractor social security remains zero; reason wording TH/EN uses source dates',()=>{
 const form=new FormData();for(const[k,v]of Object.entries({base_amount:'',additions:'0',deductions:'0',employee_ss:'500',employer_ss:'500',wht_amount:'0',wht_treatment:'none',note:'Admin review',adjustment_reason:'October amount'}))form.set(k,v);
 const line={id:'line',kind:'contractor',requires_base_review:true,reviewed:false,service_from:'2026-10-01',service_to:'2026-10-31',source_json:{manual_review_reasons:['rate_starts_after_service_start'],rate_intervals:[{rate:person().rates[0],overlap_from:'2026-10-04',overlap_to:'2026-10-31'}]}};
 assert.throws(()=>model.reviewInput({id:'period',version:1},line,form),/INPUT_INVALID/);form.set('base_amount','12000');const input=model.reviewInput({id:'period',version:1},line,form);assert.equal(input.base_amount,12000);assert.equal(input.employee_ss,0);assert.equal(input.employer_ss,0);
 for(const locale of ['th','en']){const messages=labels.payrollReviewMessages(locale,line);assert.equal(messages.length,1);assert.ok(messages[0].includes('4'));assert.notEqual(labels.payrollText(locale,'manualAmount'),labels.payrollText(locale,'readyPeriod'));}
});
