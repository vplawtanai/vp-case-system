/* eslint-disable @typescript-eslint/no-require-imports */
// Independent disposable PostgreSQL, Unix socket ONLY; no env files or Production connection.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../..'), bin = '/Applications/Postgres.app/Contents/Versions/18/bin';
const read = name => fs.readFileSync(path.join(repo, name), 'utf8');
const migration = read('supabase/migrations/202607180074_admin_full_access_semantics.sql');
const preflight = read('scripts/sql/preflight_admin_full_access_074.sql');
const targets = {finance_company_ledger:['select','insert','update'],finance_expense_claims:['select','insert','update'],finance_compensation_batches:['select','insert','update'],finance_compensation_allocations:['select','insert','update','delete'],finance_bank_accounts:['select'],office_work_logs:['select','insert','update']};
let root, started = false, baseline, verified;
const env = { PATH: process.env.PATH, LC_ALL:'C', LANG:'C' };
function cmd(name,args,input) { const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',env,maxBuffer:20*1024*1024});if(r.error)throw r.error;return r; }
function ok(name,args,input) {const r=cmd(name,args,input);assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
function connection(){assert.match(root,/^\/private\/tmp\/vp074-pg-[a-zA-Z0-9]+$/);return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',root,'-p','58474','-U','postgres','-d','postgres'];}
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
 root=fs.mkdtempSync('/private/tmp/vp074-pg-');fs.chmodSync(root,0o700);
 ok('initdb',['-D',root+'/data','-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
 ok('pg_ctl',['-D',root+'/data','-l',root+'/server.log','-o',`-F -k ${root} -p 58474 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);started=true;
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
 baseline=matrix();
 verified=JSON.parse(sql(migration));
});
after(()=>{if(started)ok('pg_ctl',['-D',root+'/data','-m','fast','-w','stop']);if(root)console.log('Disposable 074 DB evidence:',root);});
test('074 preserves every historical row, original policy, ACL, owner and unrelated function',()=>{
 assert.equal(verified.gate_pass,true);assert.equal(verified.historical_rows_unchanged,true);assert.equal(verified.profile_flags_unchanged,true);assert.equal(verified.existing_acl_preserved,true);
 assert.equal(JSON.parse(sql(preflight)).gate_pass,false,'repeat/partial migration fails closed');
});
test('zero-capability Admin passes every modern Finance helper; inactive Admin fails all',()=>{
 assert.ok(modern.size>=30);
 for(const n of [1,7]){
  const result=JSON.parse(sql(`begin;set local test.actor='${uid(n)}';select jsonb_build_object(${[...modern.keys()].flatMap(f=>[q(f),f+'()']).join(',')});rollback;`));
  for(const [f,allowed]of Object.entries(result))assert.equal(allowed,n===1,f);
 }
});
test('zero-capability Admin can select/insert/update supported legacy/office operations; inactive Admin denied',()=>{
 for(const [table,ops] of Object.entries(targets))for(const op of ops){
  const query=op==='select'?`select count(*) from ${table}`:op==='insert'?`insert into ${table}(id) values(${table==='office_work_logs'?'2':q(uid(100))}) returning id`:op==='update'?`update ${table} set id=id returning id`:`delete from ${table} returning id`;
  const r=cmd('psql',connection(),actor(1)+query+';rollback;');assert.equal(r.status,0,table+op+r.stderr);assert.ok(r.stdout.trim());
  const denied=cmd('psql',connection(),actor(7)+query+';rollback;');
  if(op==='insert')assert.notEqual(denied.status,0,table);
  else assert.equal(denied.stdout.trim(),op==='select'?'0':'',table+op);
 }
});
test('non-Admin before/after role-capability and RLS matrix identical, including inactive Partner',()=>assert.deepEqual(matrix(),baseline));
test('four old helpers deny inactive Admin and keep active Admin/Partner authority; ACLs not expanded',()=>{
 for(const f of ['current_user_is_admin','current_user_is_admin_or_partner','current_user_can_manage_finance_quotations','current_user_can_approve_document_platform'])for(const n of [1,7,9]){
  assert.equal(sql(`begin;set local test.actor='${uid(n)}';select ${f}();rollback;`),n===1||(n===9&&f!=='current_user_is_admin')?'t':'f',f+n);
 }
 assert.equal(sql("select has_function_privilege('authenticated','current_user_can_approve_document_platform()','execute')"),'f');
});
test('lawyer to Admin to lawyer changes authority but leaves every explicit capability intact via actual 073 RPC',()=>{
 const before=JSON.parse(sql(`select to_jsonb(p)-'role' from user_profiles p where id='${uid(8)}'`));
 sql(actor(1)+`select people_admin_save_profile('${uid(8)}','{"role":"admin"}',(select to_jsonb(p) from user_profiles p where id='${uid(8)}'),null);commit;`);
 sql(actor(1)+`select people_admin_save_profile('${uid(8)}','{"role":"lawyer"}',(select to_jsonb(p) from user_profiles p where id='${uid(8)}'),null);commit;`);
 assert.deepEqual(JSON.parse(sql(`select to_jsonb(p)-'role' from user_profiles p where id='${uid(8)}'`)),before);
});
test('authorization does not bypass lifecycle constraints or retired Legacy write guards',()=>{
 sql(`create function fixture_retired() returns trigger language plpgsql as $$begin raise exception 'LEGACY_READ_ONLY';end;$$;create trigger fixture_retired before update on finance_company_ledger for each row execute function fixture_retired()`);
 const r=cmd('psql',connection(),actor(1)+'update finance_company_ledger set id=id;rollback;');assert.notEqual(r.status,0);assert.match(r.stderr,/LEGACY_READ_ONLY/);
});
test('SELECT-only Preflight contains no mutation, candidate never changes profile values or applied migrations',()=>{
 assert.doesNotMatch(preflight.replace(/--[^\n]*/g,''),/\b(insert|update|delete|alter|create|drop|grant|revoke|do|call)\s/i);
 assert.doesNotMatch(migration,/\b(update|insert into|delete from)\s+(public\.)?(user_profiles|auth\.users)\b/i);
 const hash=require('node:crypto').createHash('sha256').update(migration).digest('hex');
 assert.ok(preflight.includes("'candidate_sha256','"+hash+"'"));
});
