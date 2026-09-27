/* eslint-disable @typescript-eslint/no-require-imports */
// Real route/service code with isolated Auth/RPC doubles. Never contacts Supabase or sends email.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports={}){const sandbox={exports:{},require:n=>{if(n in imports)return imports[n];throw Error('Unexpected import: '+n);},Response,Request,URL,console,process:{env:{}}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const people=load('lib/people.ts');
const passwords=load('lib/password-onboarding.ts');
const {handlePeopleRequest}=load('lib/server/people-admin.ts',{'server-only':{},'../people':people,'../password-onboarding':passwords,'node:crypto':{randomUUID:()=>uid(99)},'@supabase/supabase-js':{createClient:()=>{throw Error('Network must not be used');}}});
function uid(n){return `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;}
function fixture(options={}){
 const calls=[],users=[{id:uid(1),email:'admin@example.invalid',role:options.role||'admin',active:options.active!==false,must_change_password:!!options.mustChange},{id:uid(2),email:'unused@example.invalid',full_name:'Unused',role:'lawyer',active:false,account_type:'uat',assignable:false,financial_access:true,can_confirm_finance_payments:true}];
 const caller={auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:uid(1)}},error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:users[0],error:null})})})}),rpc:async(name,args)=>{
  calls.push({rpc:name,args});
  if(name==='people_admin_get_users')return {data:users,error:null};
  if(name==='people_admin_save_profile'){
   if(options.profileFail) return {data:null,error:{message:'INVALID_INPUT'}};
   if(args.p_request_id){const row={id:args.p_id,email:'new@example.invalid',...args.p_input,must_change_password:true};users.push(row);return {data:row,error:null};}
   const u=users.find(x=>x.id===args.p_id);Object.assign(u,args.p_input);return {data:u,error:null};
  }
  if(name==='people_admin_delete_check')return {data:{deletable:!options.history,code:options.history?'USER_HISTORY_REQUIRED':null},error:null};
  throw Error(name);
 }};
 const admin={auth:{admin:{createUser:async input=>{calls.push({create:input});return options.duplicate?{data:{user:null},error:{code:'email_exists'}}:{data:{user:{id:uid(3)}},error:null};},deleteUser:async id=>{calls.push({delete:id});return {error:options.cleanupFail?{message:'blocked'}:null};},getUserById:async id=>({data:{user:{id,email:users.find(x=>x.id===id)?.email,email_confirmed_at:options.confirmed?'2026-01-01':null}},error:null}),updateUserById:async(id,input)=>{calls.push({unban:id,input});if(input.password && !options.resetFail)users.find(x=>x.id===id).must_change_password=true;return {error:options.resetFail||options.unbanFail?{code:'unexpected',message:'secret backend details'}:null};},inviteUserByEmail:async(email,input)=>{calls.push({invite:email,input});return {data:{user:{id:users.find(x=>x.email===email)?.id}},error:options.inviteFail?{message:'SMTP'}:null};}}}};
 return {calls,users,clients:{caller,privileged:()=>{calls.push('privileged');return admin;},redirectTo:'https://vp-case-system.vercel.app/account/security'}};
}
async function request(f,body,method='POST'){const r=await handlePeopleRequest(new Request('https://vp-case-system.vercel.app/api/admin/users',{method,headers:{Authorization:'Bearer fixture',Origin:'https://vp-case-system.vercel.app'},...(body?{body:JSON.stringify(body.action==='create'?{...credentials,...body}:body)}:{})}),f.clients);return {status:r.status,body:await r.json()};}
const temporaryPassword='Fixture-only-Password-1!';
const credentials={temporaryPassword,confirmTemporaryPassword:temporaryPassword};
const input={email:'new@example.invalid',full_name:'New lawyer',staff_name:'New',role:'lawyer',account_type:'operational',assignable:true};
test('active Admin only; Partner/Lawyer+/Assistant/Staff/Viewer/inactive cannot reach privileged API',async()=>{
 for(const options of [{role:'partner'},{role:'lawyer'},{role:'assistant_lawyer'},{role:'staff'},{role:'viewer'},{active:false},{mustChange:true},{anonymous:true}]){
  for(const body of [{action:'create',input},{action:'save',id:uid(2),input:{role:'admin'},expected:{}},{action:'delete',id:uid(2),confirmation:'unused@example.invalid'},{action:'reset-password',id:uid(2),...credentials},undefined]){
   const f=fixture(options),r=await request(f,body,body?'POST':'GET');assert.ok([401,403].includes(r.status));assert.equal(f.calls.length,0);
  }
 }
 const f=fixture();assert.equal((await request(f,undefined,'GET')).status,200);
});
test('create operational lawyer / UAT: confirmed temporary credentials; required-change profile before unban; no invite',async()=>{
 for(const account_type of ['operational','uat']){
  const f=fixture();const r=await request(f,{action:'create',input:{...input,account_type,assignable:account_type==='operational'}});
  assert.equal(r.status,201);assert.equal(r.body.must_change_password,true);
  const created=f.calls.find(x=>x.create).create;assert.equal(created.email_confirm,true);assert.equal(created.password,temporaryPassword);assert.equal(created.ban_duration,'876000h');assert.equal(created.app_metadata.vp_people_created_by,uid(1));
  const profile=f.calls.find(x=>x.rpc==='people_admin_save_profile');assert.equal(profile.args.p_input.role,'lawyer');assert.equal(profile.args.p_request_id,uid(99));
  assert.ok(f.calls.indexOf(profile)<f.calls.findIndex(x=>x.unban));assert.ok(!f.calls.some(x=>x.invite));assert.equal(f.users.find(x=>x.id===uid(3)).must_change_password,true);
  assert.ok(!JSON.stringify(r.body).includes(temporaryPassword));
 }
});
test('UAT assignable, invented role, arbitrary capabilities and missing classification rejected before Auth',async()=>{
 for(const patch of [{account_type:'uat',assignable:true},{role:'lawyer_plus'},{account_type:null},{account_type:''},{financial_access:true},{id:uid(2)},{full_name:''},{assignable:'true'}]){
  const f=fixture();const r=await request(f,{action:'create',input:{...input,...patch}});assert.equal(r.status,400);assert.equal(f.calls.length,0);
 }
});
test('duplicate email never edits or deletes existing account',async()=>{
 const f=fixture({duplicate:true});const r=await request(f,{action:'create',input});assert.equal(r.status,409);assert.equal(r.body.error,'DUPLICATE_EMAIL');assert.ok(!f.calls.some(x=>x.delete||x.invite||x.rpc));
});
test('profile failure compensates only newly created Auth ID; failed cleanup is visible and stays banned',async()=>{
 for(const cleanupFail of [false,true]){
  const f=fixture({profileFail:true,cleanupFail});const r=await request(f,{action:'create',input});assert.equal(r.status,502);assert.equal(r.body.error,cleanupFail?'CREATE_RECOVERY_REQUIRED':'CREATE_FAILED');
  assert.equal(f.calls.find(x=>x.delete).delete,uid(3));assert.ok(!f.calls.some(x=>x.unban||x.invite));
 }
});
test('failed final unban leaves a provisioned identity recoverable, no email or unsafe deletion',async()=>{
 const f=fixture({unbanFail:true});const r=await request(f,{action:'create',input});assert.equal(r.status,502);assert.equal(r.body.error,'CREATE_RECOVERY_REQUIRED');assert.ok(!f.calls.some(x=>x.delete||x.invite));
});
test('temporary password required/mismatch/weak rejected before creating Auth; no secret in errors',async()=>{
 for(const patch of [{temporaryPassword:''},{temporaryPassword:undefined},{confirmTemporaryPassword:'different'},{temporaryPassword:'short',confirmTemporaryPassword:'short'}]){
  const f=fixture();const r=await request(f,{action:'create',input,...patch});assert.equal(r.status,400);assert.equal(f.calls.length,0);assert.ok(!JSON.stringify(r.body).includes(temporaryPassword));
 }
});
test('Admin reset preserves inactive, role, Lawyer+ flags, account type and assignment',async()=>{
 for(const role of ['admin','partner','lawyer','assistant_lawyer','staff','viewer']){
  const f=fixture();f.users[1].role=role;const before=JSON.stringify(f.users[1]);
  const r=await request(f,{action:'reset-password',id:uid(2),...credentials});assert.equal(r.status,200);
  const {must_change_password,...unchanged}=f.users[1];assert.equal(must_change_password,true);assert.equal(JSON.stringify(unchanged),before);
  const write=f.calls.find(x=>x.unban).input;assert.deepEqual(Object.keys(write).sort(),['app_metadata','password']);assert.ok(!JSON.stringify(r.body).includes(temporaryPassword));
 }
});
test('reset failure cannot report success or activate target; retired invite path rejected',async()=>{
 const f=fixture({resetFail:true});const before=JSON.stringify(f.users[1]);const r=await request(f,{action:'reset-password',id:uid(2),...credentials});assert.equal(r.status,502);assert.equal(JSON.stringify(f.users[1]),before);assert.ok(!JSON.stringify(r.body).includes('secret backend'));
 const retired=fixture();assert.equal((await request(retired,{action:'invite',id:uid(2)})).status,400);assert.ok(!retired.calls.some(x=>x.invite));
});
test('unrelated profile edit and role change preserve explicit Finance capabilities',async()=>{
 const f=fixture();const original={...f.users[1]};const r=await request(f,{action:'save',id:uid(2),input:{full_name:'Changed',role:'staff'},expected:original});assert.equal(r.status,200);
 const sent=f.calls.find(x=>x.rpc==='people_admin_save_profile').args.p_input;assert.deepEqual(Object.keys(sent).sort(),['full_name','role']);assert.equal(f.users[1].financial_access,true);assert.equal(f.users[1].can_confirm_finance_payments,true);
});
test('historical user delete blocked; unused user requires exact explicit confirmation',async()=>{
 const f=fixture({history:true});assert.equal((await request(f,{action:'delete',id:uid(2),confirmation:'unused@example.invalid'})).body.error,'USER_HISTORY_REQUIRED');assert.ok(!f.calls.includes('privileged'));
 const wrong=fixture();assert.equal((await request(wrong,{action:'delete',id:uid(2),confirmation:'wrong'})).status,400);assert.ok(!wrong.calls.includes('privileged'));
 const safe=fixture();assert.equal((await request(safe,{action:'delete',id:uid(2),confirmation:'unused@example.invalid'})).status,200);assert.equal(safe.calls.find(x=>x.delete).delete,uid(2));
 const self=fixture();assert.equal((await request(self,{action:'delete',id:uid(1),confirmation:'admin@example.invalid'})).body.error,'SELF_PROTECTION');
});
test('reusable assignment definition excludes UAT/unclassified/inactive without inferring names',()=>{
 for(const active of [true,false])for(const account_type of [null,'uat','operational'])for(const assignable of [true,false])assert.equal(people.isAssignablePerson({active,account_type,assignable}),active&&account_type==='operational'&&assignable);
});
test('UI advanced permissions and explicit delete confirmation; client never imports service-role client',()=>{
 const page=fs.readFileSync('app/admin/users/page.tsx','utf8');assert.match(page,/DetailModal/);assert.match(page,/<details[^>]*>[\s\S]*สิทธิ์เพิ่มเติม/);assert.match(page,/confirmation !== original.email/);assert.match(page,/PROFILE_FIELDS.filter\(key => form\[key\] !== original\[key\]\)/);
 assert.doesNotMatch(page,/SERVICE_ROLE|people-admin|auth.admin|\.from\("user_profiles"\)\.update/);
 const route=fs.readFileSync('app/api/admin/users/route.ts','utf8');assert.match(route,/handlePeopleRequest/);
});
