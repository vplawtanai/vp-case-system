/* eslint-disable @typescript-eslint/no-require-imports */
// Pure local API/Auth doubles. No Supabase credentials, email or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const crypto=require('node:crypto');
function load(file,imports={}){const ctx={exports:{},require:n=>{if(n in imports)return imports[n];throw Error('Unexpected import: '+n);},Response,Request,URL,Buffer,Date,process:{env:{}},console:{log(){throw Error('Logging forbidden');},warn(){throw Error('Logging forbidden');},error(){throw Error('Logging forbidden');}}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx.exports;}
const policy=load('lib/password-onboarding.ts');
const {handlePasswordRequest}=load('lib/server/account-password.ts',{'server-only':{},'../password-onboarding':policy,'node:crypto':crypto,'./people-admin':{peopleClientsFor(){throw Error('No live connection');}}});
const password='Synthetic-fixture-only-Password!';
function fixture(options={}){
 const calls=[],state={active:options.active!==false,must_change_password:options.forced!==false},user={id:options.id||'local-user',app_metadata:{vp_temporary_password_nonce:'generation-1'}};
 const supplied={signingKey:'local-signing-fixture-not-a-real-secret',caller:{auth:{getUser:async()=>({data:{user:options.anonymous?null:user},error:null})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:state,error:null})})})})},privileged:()=>({rpc:async(name,args)=>{calls.push({complete:args,name});if(options.completionFail)return{error:{message:'database unavailable'}};if(args.p_nonce!==user.app_metadata.vp_temporary_password_nonce)return{error:{message:'PASSWORD_RESET_CHANGED'}};state.must_change_password=false;return{data:true,error:null};}}),updatePassword:async value=>{calls.push({auth:true});assert.equal(value,password);if(options.resetDuringChange)user.app_metadata.vp_temporary_password_nonce='generation-2';return{ok:!options.authFail,code:options.weak?'weak_password':'unknown'};}};
 return{calls,state,user,supplied,options};
}
async function send(f,body,origin='https://local.invalid'){const r=await handlePasswordRequest(new Request('https://local.invalid/api/account/password',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}),f.supplied);return{status:r.status,body:await r.json()};}
const change={action:'change',password,confirmation:password};
test('one shared password policy; no trimming; required, weak and mismatch fail',()=>{
 for(const [a,b,code]of [['','','REQUIRED'],['short','short','WEAK'],['eight-or-more','different','MISMATCH']])assert.throws(()=>policy.validatePassword(a,b),new RegExp(code));
 assert.equal(policy.validatePassword(' eight chars ',' eight chars '),' eight chars ');
});
test('forced user blocked on every normal path; security accessible; ordinary and inactive rules',()=>{
 for(const path of ['/cases','/advisory','/dashboard','/finance/overview','/admin/users','/'])assert.equal(policy.passwordDestination({active:true,must_change_password:true},path),'/account/security');
 assert.equal(policy.passwordDestination({active:true,must_change_password:true},'/account/security'),null);
 assert.equal(policy.passwordDestination({active:true,must_change_password:false},'/cases'),null);
 for(const path of ['/cases','/account/security'])assert.equal(policy.passwordDestination({active:false,must_change_password:true},path),'/login');
});
test('successful user Auth update precedes private completion; no secret returned',async()=>{
 const f=fixture();const r=await send(f,change);assert.equal(r.status,200);assert.equal(r.body.changed,true);assert.equal(f.state.must_change_password,false);assert.deepEqual(f.calls.map(x=>x.auth?'auth':'complete'),['auth','complete']);assert.ok(!JSON.stringify(r.body).includes(password));
});
test('failed Auth update preserves required state and cannot call completion',async()=>{
 for(const weak of [false,true]){const f=fixture({authFail:true,weak}),r=await send(f,change);assert.equal(r.status,400);assert.equal(f.state.must_change_password,true);assert.equal(f.calls.length,1);assert.equal(r.body.error,weak?'PASSWORD_WEAK':'PASSWORD_UPDATE_FAILED');assert.equal(r.body.ticket,undefined);}
});
test('inactive/anonymous/cross-origin rejected before Auth mutation',async()=>{
 for(const options of [{active:false},{anonymous:true}]){const f=fixture(options);assert.ok([401,403].includes((await send(f,change)).status));assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await send(f,change,'https://evil.invalid')).status,403);assert.equal(f.calls.length,0);
 const missing=fixture();delete missing.state.must_change_password;assert.equal((await send(missing,change)).status,403);assert.equal(missing.calls.length,0);
});
test('successful Auth + failed completion can retry with signed short-lived proof only',async()=>{
 const f=fixture({completionFail:true});const r=await send(f,change);assert.equal(r.status,503);assert.equal(f.state.must_change_password,true);assert.ok(r.body.ticket);assert.ok(!r.body.ticket.includes(password));
 f.options.completionFail=false;const retry=await send(f,{action:'complete',ticket:r.body.ticket});assert.equal(retry.status,200);assert.equal(f.state.must_change_password,false);assert.equal(f.calls.filter(x=>x.auth).length,1);
});
test('forged proof, another user proof, expired proof and mismatched generation never clear flag',async()=>{
 const f=fixture({completionFail:true}),r=await send(f,change);f.options.completionFail=false;
 const forged=await send(f,{action:'complete',ticket:r.body.ticket+'0'});assert.equal(forged.status,400);assert.equal(f.state.must_change_password,true);
 const other=fixture({id:'other-user'});assert.equal((await send(other,{action:'complete',ticket:r.body.ticket})).status,400);assert.equal(other.calls.length,0);
 const payload=Buffer.from(JSON.stringify({id:'local-user',nonce:'generation-1',expires:0})).toString('base64url');const mac=crypto.createHmac('sha256',f.supplied.signingKey).update('vp-password-completion-v1:'+payload).digest('hex');assert.equal((await send(f,{action:'complete',ticket:payload+'.'+mac})).status,400);
 f.user.app_metadata.vp_temporary_password_nonce='generation-2';assert.equal((await send(f,{action:'complete',ticket:r.body.ticket})).body.error,'PASSWORD_RESET_CHANGED');assert.equal(f.state.must_change_password,true);
});
test('concurrent Admin reset invalidates completion after an in-flight user password change',async()=>{
 const f=fixture({resetDuringChange:true});assert.equal((await send(f,change)).body.error,'PASSWORD_RESET_CHANGED');assert.equal(f.state.must_change_password,true);
});
test('ordinary password update remains supported and never changes profile capabilities',async()=>{
 const f=fixture({forced:false});f.state.role='lawyer';f.state.financial_access=true;f.state.assignable=true;f.state.account_type='operational';const before=JSON.stringify(f.state);assert.equal((await send(f,change)).status,200);assert.equal(JSON.stringify(f.state),before);
});
test('root guard covers page effects; route/focus/session/interval rechecks and logout stay available',()=>{
 const guard=fs.readFileSync('app/components/AuthGuard.tsx','utf8'),layout=fs.readFileSync('app/layout.tsx','utf8'),security=fs.readFileSync('app/account/security/page.tsx','utf8');
 assert.match(layout,/<AuthGuard publicRoutes>\{children\}<\/AuthGuard>/);assert.match(guard,/pathname === "\/login"/);assert.match(guard,/readyPath !== pathname/);assert.match(guard,/passwordDestination\(profile, pathname\)/);
 for(const signal of ['onAuthStateChange','visibilitychange','setInterval','focus'])assert.ok(guard.includes(signal));assert.match(security,/supabase.auth.signOut/);assert.match(security,/BilingualUiScope/);assert.doesNotMatch(security,/\.from\("user_profiles"\)\.update/);
});
test('secrets not logged; browser cannot call privileged Auth; normal invite path removed',()=>{
 for(const file of ['lib/server/account-password.ts','lib/server/people-admin.ts','app/account/security/page.tsx','app/admin/users/page.tsx']){const s=fs.readFileSync(file,'utf8');assert.doesNotMatch(s,/console\.(log|warn|error)|inviteUserByEmail|invitation_sent/);}
 for(const file of ['app/admin/users/page.tsx','app/account/security/page.tsx'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/SERVICE_ROLE|auth.admin/);
});

const {workspaceFixture}=require('./i18n-workspace-fixture.cjs');
const fields=workspaceFixture('app/admin/users/TemporaryPasswordFields.tsx');
const security=workspaceFixture('app/account/security/page.tsx',['PasswordForm']);
test('TH/EN password fields and security page use one language with forced/ordinary/retry modes',()=>{
 for(const locale of ['th','en']){
  const html=fields.render(locale,{}, {password:'',confirmation:'',onPassword(){},onConfirmation(){}});
  assert.equal((html.match(/type="password"/g)||[]).length,2);assert.match(html,/minLength="8"/);
  assert.ok(html.includes(policy.passwordText('temporary',locale)));assert.ok(!html.includes(policy.passwordText('temporary',locale==='th'?'en':'th')));
  const reset=fields.render(locale,{}, {password:'partial',confirmation:'',onPassword(){},onConfirmation(){},required:false});assert.doesNotMatch(reset,/minLength|required=""/);
  const forced=security.render(locale,{'PasswordForm.forced':true},{},'PasswordForm');
  assert.ok(forced.includes(policy.passwordText('instruction',locale)));assert.ok(forced.includes(policy.passwordText('logout',locale)));assert.doesNotMatch(forced,/href="\/cases"/);
  const ordinary=security.render(locale,{'PasswordForm.forced':false},{},'PasswordForm');assert.ok(ordinary.includes(policy.passwordText('ordinaryTitle',locale)));
  const retry=security.render(locale,{'PasswordForm.forced':true,'PasswordForm.completionTicket':'synthetic-ticket'},{},'PasswordForm');assert.ok(retry.includes(policy.passwordText('retry',locale)));assert.doesNotMatch(retry,/type="password"/);
 }
});

// Run the real SessionGuard effect with a small hook/scheduler harness. This
// exercises asynchronous decisions and route changes without live credentials.
function guardFixture(initialProfile,initialPath='/cases') {
 const slots=[],effects=[],listeners={},timeouts=[],destinations=[];
 let cursor=0,pathname=initialPath,profile=initialProfile,cleanup,dependencyKey,sessionListener,signouts=0,interval;
 const router={replace:path=>destinations.push(path)};
 const react={
  createContext:()=>({Provider:'provider'}),useContext:()=>false,
  useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value;}];},
  useEffect:(fn,deps)=>{const key=deps[0];if(key!==dependencyKey){cleanup?.();dependencyKey=key;effects.push(fn);}},
 };
 const supabase={auth:{getUser:async()=>({data:{user:{id:'local-user'}},error:null}),signOut:async()=>{signouts++;},onAuthStateChange:fn=>{sessionListener=fn;return{data:{subscription:{unsubscribe(){sessionListener=null;}}}};}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:profile,error:null})})})})};
 const add=(name,fn)=>{listeners[name]=fn;},remove=name=>{delete listeners[name];};
 const jsx=(type,props)=>({type,props});
 const context={exports:{},require:name=>({'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>router,usePathname:()=>pathname},'../../lib/supabase':{supabase},'../../lib/password-onboarding':policy,'../../lib/i18n/provider':{useI18n:()=>({t:key=>key})}}[name]),
  window:{setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{interval=null;},setTimeout:fn=>{timeouts.push(fn);},addEventListener:add,removeEventListener:remove},document:{visibilityState:'visible',addEventListener:add,removeEventListener:remove}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/components/AuthGuard.tsx','utf8')+'\nexports.TestSessionGuard=SessionGuard;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 const render=()=>{cursor=0;const result=context.exports.TestSessionGuard({children:'protected-page'});while(effects.length)cleanup=effects.shift()();return result;};
 return{render,destinations,setProfile:value=>{profile=value;},navigate:path=>{pathname=path;},signal:name=>{if(name==='interval')interval();else if(name==='auth'){sessionListener();while(timeouts.length)timeouts.shift()();}else listeners[name]();},get signouts(){return signouts;},close:()=>cleanup?.()};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('real guard blocks initial mount and direct navigation; security route accessible without redirect loop',async()=>{
 const f=guardFixture({active:true,must_change_password:true});
 assert.equal(f.render().type,'main');await settle();assert.deepEqual(f.destinations,['/account/security']);assert.equal(f.render().type,'main');
 f.navigate('/account/security');assert.equal(f.render().type,'main');await settle();assert.equal(f.render().type,'provider');assert.equal(f.destinations.length,1);
 f.setProfile({active:true,must_change_password:false});f.navigate('/cases');assert.equal(f.render().type,'main');await settle();assert.equal(f.render().type,'provider');
 f.navigate('/finance/overview');assert.equal(f.render().type,'main');await settle();assert.equal(f.render().type,'provider');f.close();
});
test('real guard detects Admin reset during continued use on focus/visibility/session/interval',async()=>{
 for(const signal of ['focus','visibilitychange','auth','interval']){
  const f=guardFixture({active:true,must_change_password:false});f.render();await settle();assert.equal(f.render().type,'provider');
  f.setProfile({active:true,must_change_password:true});f.signal(signal);await settle();assert.deepEqual(f.destinations,['/account/security']);assert.equal(f.render().type,'main');f.close();
 }
});
test('real guard denies inactive user and fails closed if migration/profile contract is unavailable',async()=>{
 const inactive=guardFixture({active:false,must_change_password:true},'/account/security');inactive.render();await settle();assert.equal(inactive.signouts,1);assert.deepEqual(inactive.destinations,['/login']);assert.equal(inactive.render().type,'main');inactive.close();
 const missing=guardFixture({active:true});missing.render();await settle();assert.equal(missing.render().type,'main');assert.deepEqual(missing.destinations,[]);missing.close();
});
