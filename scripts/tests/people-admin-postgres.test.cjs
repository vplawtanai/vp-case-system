/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated real PostgreSQL only. No .env, TCP, Production URI or Supabase connection.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';
const repo=path.resolve(__dirname,'../..');
const migration=fs.readFileSync(path.join(repo,'supabase/migrations/202607180073_user_profile_people_alignment.sql'),'utf8');
let root,started=false,verified;
const env={PATH:process.env.PATH,LC_ALL:'C',LANG:'C'};
function command(name,args,input){const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',env,maxBuffer:12*1024*1024});if(r.error)throw r.error;return r;}
function checked(name,args,input){const r=command(name,args,input);assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
function connection(){assert.match(root,/^\/private\/tmp\/vp073-pg-[a-zA-Z0-9]+$/);return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',root,'-p','58473','-U','postgres','-d','postgres'];}
function sql(s){return checked('psql',connection(),s);}
function q(s){return "'"+s.replaceAll("'","''")+"'";}
function uid(n){return `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;}
function act(n,role='authenticated'){return `begin;set local test.actor='${n?uid(n):''}';set local role ${role};`;}
function as(n,s,end='rollback'){return sql(act(n)+s+';'+end+';');}
function denied(n,s,pattern,role='authenticated'){const r=command('psql',connection(),act(n,role)+s+';commit;');assert.notEqual(r.status,0,r.stdout);assert.match(r.stderr,pattern);}
function saved(n,patch){return `select public.people_admin_save_profile('${uid(n)}',${q(JSON.stringify(patch))}::jsonb,(select to_jsonb(u) from public.user_profiles u where id='${uid(n)}'),null)`;}
function provision(n,{type='uat',assignable=false}={}){return `insert into auth.users(id,email,raw_app_meta_data,banned_until) values('${uid(n)}','user${n}@example.invalid','{"vp_people_created_by":"${uid(1)}","vp_people_request":"${uid(999)}"}',now()+interval '100 years');
${act(1)} select public.people_admin_save_profile('${uid(n)}','{"full_name":"Person ${n}","staff_name":"Staff ${n}","role":"lawyer","active":true,"account_type":"${type}","assignable":${assignable}}',null,'${uid(999)}');commit;`;}
before(()=>{
 root=fs.mkdtempSync('/private/tmp/vp073-pg-');fs.chmodSync(root,0o700);
 checked('initdb',['-D',path.join(root,'data'),'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 checked('pg_ctl',['-D',path.join(root,'data'),'-l',path.join(root,'server.log'),'-o',`-F -k ${root} -p 58473 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
 sql(fs.readFileSync(path.join(__dirname,'fixtures/core-create-verified-baseline.sql'),'utf8'));
 sql(fs.readFileSync(path.join(repo,'supabase/migrations/202607180072_core_numbering_create_hardening.sql'),'utf8'));
 sql(fs.readFileSync(path.join(__dirname,'fixtures/people-admin.sql'),'utf8'));
 const fields=[...fs.readFileSync(path.join(repo,'lib/people.ts'),'utf8').split('export const CAPABILITY_LABELS')[1].split('};')[0].matchAll(/^  (can_\w+):/gm)].map(m=>m[1]);
 for(const f of fields) sql(`alter table public.user_profiles add column ${f} boolean not null default false;`);
 sql(`update public.user_profiles set can_confirm_finance_payments=true where id='${uid(8)}'`);
 verified=JSON.parse(sql(migration));
});
after(()=>{if(started)checked('pg_ctl',['-D',path.join(root,'data'),'-m','fast','-w','stop']);if(root)console.log('Disposable 073 PostgreSQL evidence:',root);});
test('073 manual gate preserves every existing row, Auth identity, role/capability and 072 definition',()=>{
 assert.equal(verified.gate_pass,true);assert.deepEqual(verified.failed_checks,[]);assert.equal(verified.historical_rows_unchanged,true);
 assert.equal(sql('select count(*) from user_profiles where account_type is null and not assignable'),'8');
 assert.equal(sql("select last_number from file_no_counters limit 1"),'52');
 assert.equal(sql("select last_number from advisory_matter_counters limit 1"),'12');
});
test('all management RPCs and raw UPDATE deny Partner/Lawyer/Lawyer+/Assistant/Staff/Viewer/inactive/anonymous',()=>{
 for(const n of [2,3,4,5,6,7,8,0]){
  for(const call of ['select people_admin_get_users()',saved(3,{full_name:'Denied'}),`select people_admin_delete_check('${uid(3)}')`]) denied(n,call,/FORBIDDEN/);
  assert.equal(as(n,`with changed as (update user_profiles set role='admin' where id='${uid(n||3)}' returning id) select count(*) from changed`),'0');
 }
 denied(0,'select people_admin_get_users()',/permission denied/,'anon');
 assert.equal(JSON.parse(as(1,'select people_admin_get_users()')).length,8);
});
test('Admin updates role/classification; Lawyer+ explicit Finance capabilities survive',()=>{
 const row=JSON.parse(as(1,saved(8,{full_name:'Renamed person',account_type:'operational',assignable:true,role:'staff'})));
 assert.equal(row.can_confirm_finance_payments,true);assert.equal(row.financial_access,true);assert.equal(row.role,'staff');assert.equal(row.assignable,true);
 denied(1,saved(1,{active:false}),/SELF_PROTECTION/);denied(1,saved(1,{role:'viewer'}),/SELF_PROTECTION/);
 denied(1,`select people_admin_save_profile('${uid(8)}','{"active":false}','{}',null)`,/PROFILE_CHANGED/);
 denied(1,saved(8,{id:uid(3)}),/INVALID_INPUT/);
});
test('classification and inactive constraints; no implicit assignment or identity inference',()=>{
 denied(1,saved(8,{account_type:'uat',assignable:true}),/NOT_ASSIGNABLE/);
 denied(1,saved(8,{account_type:'operational',assignable:true,active:false}),/NOT_ASSIGNABLE/);
 denied(1,saved(8,{account_type:'real'}),/people_account_type_check/);
 const row=JSON.parse(as(1,saved(8,{account_type:'uat',assignable:false})));
 assert.equal(row.account_type,'uat');assert.equal(row.assignable,false);
 assert.equal(as(1,`select people_is_assignable('${uid(8)}')`),'f');
 const raw=as(1,`update user_profiles set account_type='operational',assignable=true where id='${uid(8)}';update user_profiles set active=false where id='${uid(8)}';select assignable from user_profiles where id='${uid(8)}'`);
 assert.equal(raw,'f');
});
test('new operational and UAT profiles initialize only with server-created Auth provenance',()=>{
 sql(provision(20,{type:'operational',assignable:true}));sql(provision(21));
 assert.equal(sql(`select people_is_assignable('${uid(20)}')`),'t');
 assert.equal(sql(`select account_type||':'||assignable from user_profiles where id='${uid(21)}'`),'uat:false');
 denied(1,`select people_admin_save_profile('${uid(3)}','{"full_name":"Hijack"}',null,'${uid(999)}')`,/FORBIDDEN/);
 denied(1,`select people_admin_save_profile('${uid(20)}','{"full_name":"Retry"}',null,'${uid(999)}')`,/FORBIDDEN/);
});
test('all history forms block Auth DELETE without cascades; deactivation preserves rows',()=>{
 const refs=[
  n=>`insert into case_time_logs values(${n},'Staff ${n}',null)`,
  n=>`insert into advisory_time_logs values(${n},null,'${uid(n)}')`,
  n=>`insert into office_work_logs values(${n},'${uid(n)}',null)`,
  n=>`insert into case_audit_logs(table_name,record_id,action,user_id) values('case_tasks','1','update','${uid(n)}')`,
  n=>`insert into finance_payable_entitlements values(${n},'${uid(n)}')`,
  n=>`insert into finance_payout_audit values(${n},'${uid(n)}')`,
  n=>`insert into document_history values(${n},'${uid(n)}')`,
  n=>`insert into finance_snapshot_history values(${n},'{"person":{"id":"${uid(n)}"}}')`,
  n=>`insert into storage.objects values('${uid(n)}','${uid(n)}')`,
  n=>`insert into finance_snapshot_history values(${n},'{"person":{"name":"Staff ${n}"}}')`,
 ];
 refs.forEach((make,i)=>{
  const n=30+i;sql(provision(n));sql(make(n));
  const before=sql(`select md5(to_jsonb(t)::text) from user_profiles t where id='${uid(n)}'`);
  const r=command('psql',connection(),`delete from auth.users where id='${uid(n)}'`);assert.notEqual(r.status,0);assert.match(r.stderr,/USER_HISTORY_REQUIRED/);
  assert.equal(sql(`select md5(to_jsonb(t)::text) from user_profiles t where id='${uid(n)}'`),before);
  as(1,saved(n,{active:false,assignable:false}),'commit');
  assert.equal(sql(`select count(*) from auth.users where id='${uid(n)}'`),'1');
  assert.equal(JSON.parse(as(1,`select people_admin_delete_check('${uid(n)}')`)).deletable,false);
 });
});
test('unused UAT can delete Auth + profile atomically; failed create compensates a banned profile',()=>{
 sql(provision(50));
 // Exercise the REAL UI path: deactivation audit remains, but has no operational history.
 as(1,saved(50,{active:false,assignable:false}),'commit');
 assert.equal(JSON.parse(as(1,`select people_admin_delete_check('${uid(50)}')`)).deletable,true);
 sql(`delete from auth.users where id='${uid(50)}'`);
 assert.equal(sql(`select count(*) from case_audit_logs where table_name='user_profiles' and record_id='${uid(50)}'`),'1');
 assert.equal(sql(`select (select count(*) from auth.users where id='${uid(50)}')+(select count(*) from user_profiles where id='${uid(50)}')`),'0');
 sql(`insert into auth.users(id,email,raw_app_meta_data,banned_until) values('${uid(51)}','failure@example.invalid','{"vp_people_request":"${uid(999)}"}',now()+interval '100 years');delete from auth.users where id='${uid(51)}'`);
 assert.equal(sql(`select count(*) from user_profiles where id='${uid(51)}'`),'0');
 denied(1,`delete from user_profiles where id='${uid(21)}'`,/permission denied/);
});
test('new FK outside public and SET NULL histories are automatically protected',()=>{
 sql(provision(60));sql(`create schema other_business;create table other_business.history(actor uuid references auth.users on delete set null);insert into other_business.history values('${uid(60)}')`);
 const r=command('psql',connection(),`delete from auth.users where id='${uid(60)}'`);assert.notEqual(r.status,0);assert.match(r.stderr,/USER_HISTORY_REQUIRED/);
 assert.equal(sql('select count(actor) from other_business.history'),'1');
});
test('self-referencing profile FK cannot cascade-delete another person',()=>{
 sql(provision(61));sql(provision(62));
 sql(`alter table user_profiles add column added_by uuid references user_profiles(id) on delete cascade`);
 as(1,`update user_profiles set added_by='${uid(61)}' where id='${uid(62)}';update user_profiles set active=false where id='${uid(61)}'`,'commit');
 const r=command('psql',connection(),`delete from auth.users where id='${uid(61)}'`);
 assert.notEqual(r.status,0);assert.match(r.stderr,/USER_HISTORY_REQUIRED/);
 assert.equal(sql(`select count(*) from user_profiles where id in ('${uid(61)}','${uid(62)}')`),'2');
});
function session(input){const child=spawn(path.join(bin,'psql'),connection(),{env});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.stdin.end(input);return new Promise(resolve=>child.on('exit',code=>resolve({code,out,err})));}
test('independent writer/delete race cannot erase a newly committed history reference',async()=>{
 sql(provision(70));
 const writer=session(`begin;insert into finance_payable_entitlements values(70,'${uid(70)}');select pg_sleep(0.5);commit;`);
 const deletion=session(`select pg_sleep(0.15);delete from auth.users where id='${uid(70)}';`);
 const [w,d]=await Promise.all([writer,deletion]);assert.equal(w.code,0,w.err);assert.notEqual(d.code,0);assert.match(d.err,/USER_HISTORY_REQUIRED/);
 assert.equal(sql('select count(*) from finance_payable_entitlements where id=70'),'1');assert.equal(sql(`select count(*) from user_profiles where id='${uid(70)}'`),'1');
});
test('072 Case/Non-Litigation create role matrix stays intact after 073',()=>{
 for(const n of [1,2,3,8])assert.match(as(n,'select create_case_with_number(null)'),/VP-/);
 for(const n of [1,2,3,4,8])assert.match(as(n,`select create_advisory_matter_with_number('10000000-0000-0000-0000-000000000001','Matter','general_advisory','no_retainer','active','Lawyer',null,null,null,null,null)`),/ADV-/);
 for(const n of [4,5,6,7])denied(n,'select create_case_with_number(null)',/denied|FORBIDDEN|authorized/i);
 for(const n of [5,6,7])denied(n,`select create_advisory_matter_with_number('10000000-0000-0000-0000-000000000001','Matter','general_advisory','no_retainer','active','Lawyer',null,null,null,null,null)`,/denied|FORBIDDEN|authorized/i);
});
test('function ACLs fail closed even under broad creator default grants',()=>{
 for(const role of ['anon','service_role'])for(const fn of ['people_admin_get_users()','people_admin_save_profile(uuid,jsonb,jsonb,uuid)','people_admin_delete_check(uuid)'])assert.equal(sql(`select has_function_privilege('${role}','${fn}','execute')`),'f');
 for(const fn of ['people_history_references(uuid,boolean)','people_auth_delete_guard()','people_profile_update_guard()'])assert.equal(sql(`select has_function_privilege('authenticated','${fn}','execute')`),'f');
 assert.match(migration,/commit;\s*-- SELECT-only[\s\S]*select result as migration_073_verifier/);
});
