/* eslint-disable @typescript-eslint/no-require-imports */
// Independent disposable PostgreSQL, Unix socket ONLY; no env files or Production connection.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '../..'), bin = '/Applications/Postgres.app/Contents/Versions/18/bin';
const read = name => fs.readFileSync(path.join(repo, name), 'utf8');
const migration = read('supabase/migrations/202607180074_admin_full_access_semantics.sql');
const preflight = read('scripts/sql/preflight_admin_full_access_074.sql');
const targets = {finance_company_ledger:['select','insert','update'],finance_expense_claims:['select','insert','update'],finance_compensation_batches:['select','insert','update'],finance_compensation_allocations:['select','insert','update','delete'],finance_bank_accounts:['select'],office_work_logs:['select','insert','update']};
let root, started = false, baseline, verified;
const env = { PATH: process.env.PATH, LC_ALL:'C', LANG:'C' };
function cmd(name,args,input) { const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',env,maxBuffer:20*1024*1024});if(r.error)throw r.error;return r; }
function ok(name,args,input) {const r=cmd(name,args,input);assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
function connection(){assert.match(root,/^\/private\/tmp\/vp075-pg-[a-zA-Z0-9]+$/);return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',root,'-p','58475','-U','postgres','-d','postgres'];}
const sql=s=>ok('psql',connection(),s);
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const q=s=>"'"+s.replaceAll("'","''")+"'";
const actor=n=>`begin;set local test.actor='${uid(n)}';set local role authenticated;`;
const modern=new Map();
for(const name of fs.readdirSync(path.join(repo,'supabase/migrations')).sort().filter(n=>n.endsWith('.sql')&&!n.includes('074_'))){
 const s=read('supabase/migrations/'+name);
 for(const m of s.matchAll(/create (?:or replace )?function public\.([a-z0-9_]+)\(\s*\)([\s\S]*?)\bas (\$[a-z_]*\$)([\s\S]*?)\3\s*;/gi)){
  if(/returns boolean/i.test(m[2]) && (/^current_user_can_(view|manage|confirm|reverse|reallocate|approve|issue|void)_(finance|combined)/.test(m[1])||/^(money_allocation_admin|tax_position_can_\w+|tax_filing_can_\w+|payout_can_manage|expense_can_\w+)$/.test(m[1])) && m[1]!=='current_user_can_manage_finance_quotations')modern.set(m[1],m[0]);
 }
}
function matrix(){
 const out={};
 for(const n of [2,3,4,5,6,8,9]){
  out[n]={};
  for(const [table,ops] of Object.entries(targets))for(const op of ops){
   const statement=op==='select'?`select count(*) from ${table}`:op==='insert'?`insert into ${table}(id) values(${table==='office_work_logs'?'2':q(uid(100))}) returning id`:op==='update'?`update ${table} set id=id returning id`:`delete from ${table} returning id`;
   const r=cmd('psql',connection(),actor(n)+statement+';rollback;');
   out[n][table+':'+op]={code:r.status,out:r.status===0?r.stdout.trim():'denied'};
  }
  out[n].modern=sql(`begin;set local test.actor='${uid(n)}';select jsonb_build_array(${[...modern.keys()].map(f=>f+'()').join(',')});rollback;`);
 }
 return out;
}
before(()=>{
 root=fs.mkdtempSync('/private/tmp/vp075-pg-');fs.chmodSync(root,0o700);
 ok('initdb',['-D',root+'/data','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 ok('pg_ctl',['-D',root+'/data','-l',root+'/server.log','-o',`-F -k ${root} -p 58475 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(read('scripts/tests/fixtures/core-create-verified-baseline.sql'));
 sql(read('supabase/migrations/202607180072_core_numbering_create_hardening.sql'));
 sql(read('scripts/tests/fixtures/people-admin.sql'));
 const flags=[...read('lib/people.ts').split('export const CAPABILITY_LABELS')[1].split('};')[0].matchAll(/^  (can_\w+):/gm)].map(m=>m[1]);
 for(const f of flags)sql(`alter table user_profiles add column ${f} boolean not null default false`);
 // Complete Lawyer+ and inactive Partner fixtures exercise preservation, not new grants.
 sql(`update user_profiles set ${flags.map(f=>f+'=true').join(',')} where id='${uid(8)}';insert into auth.users(id,email) values('${uid(9)}','inactive-partner@example.invalid');update user_profiles set role='partner',active=false where id='${uid(9)}'`);
 sql(read('supabase/migrations/202607180073_user_profile_people_alignment.sql'));
 sql(read('scripts/tests/fixtures/admin-full-access.sql'));
 for(const s of modern.values())sql(s);
 for(const table of Object.keys(targets))sql(`insert into ${table}(id) values(${table==='office_work_logs'?'1':q(uid(99))})`);
 sql(`update finance_compensation_batches set status='draft';update finance_compensation_allocations set batch_id='${uid(99)}';update finance_bank_accounts set is_active=true`);
 assert.equal(JSON.parse(sql(preflight)).gate_pass,true);
 // Deliberate local drift must fail before candidate application; never normalize it.
 assert.equal(JSON.parse(sql('begin;alter function current_user_is_admin() stable;'+preflight+'rollback;')).gate_pass,false);
 assert.equal(JSON.parse(sql('begin;create policy unexpected_restriction on office_work_logs as restrictive for select to authenticated using(false);'+preflight+'rollback;')).gate_pass,false);
 sql(migration);
 baseline=matrix();
 verified=JSON.parse(sql(read('supabase/migrations/202607180075_user_password_onboarding.sql')));
});
after(()=>{if(started)ok('pg_ctl',['-D',root+'/data','-m','fast','-w','stop']);if(root)console.log('Disposable 075 DB evidence:',root);});

test('075 preserves existing Auth/profile/history/security; no forced change for existing users',()=>{
 assert.equal(verified.gate_pass,true);assert.equal(verified.auth_users_passwords_unchanged,true);assert.equal(verified.existing_contracts_security_preserved,true);assert.equal(verified.historical_rows_unchanged,true);assert.equal(verified.existing_profiles_not_forced,true);assert.equal(verified.column_contract,true);assert.equal(verified.server_only_completion,true);
 assert.equal(sql('select count(*) from user_profiles where must_change_password'),'0');
 assert.equal(verified.private_functions_contract,true);assert.equal(verified.onboarding_triggers_contract,true);
});
test('new Auth-provisioned profile requires change using only protected app metadata',()=>{
 sql(`insert into auth.users(id,email,raw_app_meta_data,banned_until) values('${uid(20)}','new@example.invalid','{"vp_people_created_by":"${uid(1)}","vp_people_request":"${uid(999)}","vp_temporary_password_nonce":"${uid(888)}"}',now()+interval '100 years')`);
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
 sql(actor(1)+`select people_admin_save_profile('${uid(20)}','{"full_name":"New","staff_name":"New","role":"lawyer","active":true,"account_type":"uat","assignable":false}',null,'${uid(999)}');commit;`);
 assert.equal(sql(`select must_change_password||':'||role||':'||account_type||':'||assignable from user_profiles where id='${uid(20)}'`),'true:lawyer:uat:false');
});
test('Auth create can attach app metadata after the automatic profile INSERT within one transaction',()=>{
 sql(`begin;insert into auth.users(id,email) values('${uid(21)}','metadata-after-insert@example.invalid');update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(921)}"}' where id='${uid(21)}';commit;`);
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(21)}'`),'t');
});
test('browser roles including Admin cannot clear flag via raw write, old RPC, new private RPC or forged GUC',()=>{
 for(const n of [1,2,3,4,5,6,7,8,20]){
  const direct=cmd('psql',connection(),actor(n)+`set local people.password_target='${uid(20)}';update user_profiles set must_change_password=false where id='${uid(20)}';commit;`);
  if(n===1)assert.notEqual(direct.status,0);else assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
  const rpc=cmd('psql',connection(),actor(n)+`select people075_complete_password_change('${uid(20)}','${uid(888)}');commit;`);assert.notEqual(rpc.status,0);assert.match(rpc.stderr,/permission denied/);
 }
 const old=cmd('psql',connection(),actor(1)+`select people_admin_save_profile('${uid(20)}','{"must_change_password":false}',(select to_jsonb(p) from user_profiles p where id='${uid(20)}'),null);commit;`);assert.notEqual(old.status,0);assert.match(old.stderr,/INVALID_INPUT/);
});
test('service completion clears only flag after Auth-success contract, is idempotent and rejects old nonce',()=>{
 const before=sql(`select to_jsonb(p)-'must_change_password' from user_profiles p where id='${uid(20)}'`);
 for(let i=0;i<2;i++)assert.equal(sql(`begin;set local role service_role;select people075_complete_password_change('${uid(20)}','${uid(888)}');commit;`),'t');
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'f');assert.equal(sql(`select to_jsonb(p)-'must_change_password' from user_profiles p where id='${uid(20)}'`),before);
 sql(`update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(889)}"}' where id='${uid(20)}'`);
 const stale=cmd('psql',connection(),`begin;set local role service_role;select people075_complete_password_change('${uid(20)}','${uid(888)}');commit;`);assert.notEqual(stale.status,0);assert.match(stale.stderr,/PASSWORD_RESET_CHANGED/);assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
});
test('Auth reset only sets requirement; inactive/role/type/assignment/Finance flags preserved',()=>{
 for(const n of [1,3,7,8]){
  const before=sql(`select to_jsonb(p)-'must_change_password' from user_profiles p where id='${uid(n)}'`);
  sql(`update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(890+n)}"}' where id='${uid(n)}'`);
  assert.equal(sql(`select must_change_password from user_profiles where id='${uid(n)}'`),'t');assert.equal(sql(`select to_jsonb(p)-'must_change_password' from user_profiles p where id='${uid(n)}'`),before);
 }
 const inactive=cmd('psql',connection(),`begin;set local role service_role;select people075_complete_password_change('${uid(7)}','${uid(897)}');commit;`);assert.notEqual(inactive.status,0);assert.match(inactive.stderr,/FORBIDDEN/);
});
test('Auth reset requirement is atomic with its Auth transaction and survives later unrelated metadata edits',()=>{
 const before=sql(`select to_jsonb(p) from user_profiles p where id='${uid(5)}'`);
 sql(`begin;update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(899)}"}' where id='${uid(5)}';rollback;`);
 assert.equal(sql(`select to_jsonb(p) from user_profiles p where id='${uid(5)}'`),before);
 sql(`update auth.users set raw_app_meta_data=raw_app_meta_data||'{"unrelated":"preserved"}' where id='${uid(20)}'`);
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
});
test('073/074 Finance authorization matrix and Admin/non-Admin capabilities unchanged by 075',()=>assert.deepEqual(matrix(),baseline));

test('independent PostgreSQL sessions serialize reset/completion; newest reset always keeps requirement',async()=>{
 function session(statement){
  const child=spawn(path.join(bin,'psql'),connection(),{env});let out='',err='',announce;
  const locked=new Promise(resolve=>{announce=resolve;});
  child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('LOCK_HELD'))announce();});child.stderr.on('data',chunk=>{err+=chunk;});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{announce();resolve({code,out,err});});});child.stdin.end(statement);return{locked,done};
 }
 const reset=session(`begin;update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(910)}"}' where id='${uid(20)}';select 'LOCK_HELD';select pg_sleep(0.25);commit;`);
 await reset.locked;
 const stale=session(`begin;set local role service_role;select people075_complete_password_change('${uid(20)}','${uid(889)}');commit;`);
 assert.equal((await reset.done).code,0);const rejected=await stale.done;assert.notEqual(rejected.code,0);assert.match(rejected.err,/PASSWORD_RESET_CHANGED/);
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
 const completion=session(`begin;set local role service_role;select people075_complete_password_change('${uid(20)}','${uid(910)}');select 'LOCK_HELD';select pg_sleep(0.25);commit;`);
 await completion.locked;
 const later=session(`begin;update auth.users set raw_app_meta_data=raw_app_meta_data||'{"vp_temporary_password_nonce":"${uid(911)}"}' where id='${uid(20)}';commit;`);
 assert.equal((await completion.done).code,0);assert.equal((await later.done).code,0);
 assert.equal(sql(`select must_change_password from user_profiles where id='${uid(20)}'`),'t');
});
