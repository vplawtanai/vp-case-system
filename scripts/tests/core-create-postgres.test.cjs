/* eslint-disable @typescript-eslint/no-require-imports */
// Real PostgreSQL, new disposable cluster, private Unix socket, no TCP or credentials.
// Never reads .env, links Supabase, or connects to any existing database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const repo = path.resolve(__dirname, '../..');
const migrationPath = path.join(repo, 'supabase/migrations/202607180072_core_numbering_create_hardening.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/core-create-verified-baseline.sql'), 'utf8');
const bin = process.env.VP072_PG_BIN || '/Applications/Postgres.app/Contents/Versions/18/bin';
const env = { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' };
const client = "'10000000-0000-0000-0000-000000000001'";
const caseCall = `select public.create_case_with_number(${client});`;
const advisoryCall = `select public.create_advisory_matter_with_number(${client}, 'Fixture advisory',
  'general_advisory','no_retainer','active','Lawyer', '2026-09-26',null,12000,'Scope','Note');`;
let root, started = false, baseline, verified;
function command(name, args, input) {
  const r = spawnSync(path.join(bin, name), args, { input, encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}
function checked(name, args, input) {
  const r = command(name, args, input);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}
function connection() {
  assert.match(root, /^\/private\/tmp\/vp072-pg-[a-zA-Z0-9]+$/);
  return ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',root,'-p','58472','-U','postgres','-d','postgres'];
}
function sql(text) { return checked('psql', connection(), text); }
function json(text) { return JSON.parse(sql(text)); }
function actor(n, role = 'authenticated') {
  assert.ok(['authenticated','anon','postgres','service_role'].includes(role));
  const uid = n ? `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` : '';
  return `begin; set local test.actor='${uid}'; set local role ${role};`;
}
function as(n, text, role = 'authenticated', end = 'commit') {
  return sql(`${actor(n, role)} ${text} ${end};`);
}
function denied(n, text, expected, role = 'authenticated') {
  const r = command('psql', connection(), `${actor(n, role)} ${text} commit;`);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, expected);
}
function counters() {
  return json(`select jsonb_build_object(
    'case',(select coalesce(jsonb_agg(to_jsonb(t) order by year),'[]') from public.file_no_counters t),
    'advisory',(select coalesce(jsonb_agg(to_jsonb(t) order by year),'[]') from public.advisory_matter_counters t),
    'cases',(select count(*) from public.cases), 'matters',(select count(*) from public.advisory_matters));`);
}
function preservation() {
  return json(`select jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.user_profiles t),
    'case',(select to_jsonb(t) from public.cases t where id=1),
    'advisory',(select to_jsonb(t) from public.advisory_matters t where id='20000000-0000-0000-0000-000000000001'),
    'functions',(select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace='public'::regnamespace
      and proname not in ('can_create_case','can_create_advisory_matter','create_case_with_number',
        'create_advisory_matter_with_number','generate_file_no','generate_advisory_matter_no')),
    'policies',(select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p where not
      (polrelid='public.cases'::regclass and polname='cases_insert_policy')),
    'table_security',(select jsonb_agg(jsonb_build_array(oid,relacl,relowner,relrowsecurity,relforcerowsecurity) order by oid)
      from pg_class where relnamespace='public'::regnamespace
      and relname not in ('file_no_counters','advisory_matter_counters')),
    'case_tasks',(select jsonb_agg(to_jsonb(t)) from public.case_tasks t),
    'advisory_tasks',(select jsonb_agg(to_jsonb(t)) from public.advisory_tasks t),
    'finance',(select jsonb_agg(to_jsonb(t)) from public.finance_permission_canary t));`);
}
before(() => {
  assert.ok(fs.existsSync(path.join(bin, 'initdb')), 'Real PostgreSQL required; set VP072_PG_BIN to its local bin directory');
  root = fs.mkdtempSync('/private/tmp/vp072-pg-');
  fs.chmodSync(root, 0o700);
  checked('initdb', ['-D',path.join(root,'data'),'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
  checked('pg_ctl', ['-D',path.join(root,'data'),'-l',path.join(root,'server.log'),'-o',
    `-F -k ${root} -p 58472 -c listen_addresses='' -c unix_socket_permissions=0700`,'-w','start']);
  started = true;
  sql(fixture);
  baseline = { preservation: preservation(), counters: counters() };
  verified = JSON.parse(sql(migration));
});
after(() => {
  if (started) checked('pg_ctl', ['-D',path.join(root,'data'),'-m','fast','-w','stop']);
  // Keep local log/data as reproducible test evidence; no automatic broad deletion.
  if (root) console.log('Disposable local PostgreSQL evidence:', root);
});

test('072 applies without consuming counters or changing historical/child/Finance data; final SELECT passes', () => {
  assert.equal(verified.gate_pass, true);
  assert.deepEqual(verified.failed_checks, []);
  assert.deepEqual(counters(), baseline.counters);
  assert.deepEqual(preservation(), baseline.preservation);
  assert.equal(verified.case_counters_before[0].last_number, 52);
  assert.equal(verified.advisory_counters_before[0].last_number, 12);
  assert.equal(verified.checks.case_update_and_advisory_policies_preserved, true);
});

test('active Admin/Partner/Lawyer (including Lawyer+) can create Cases; exactly one increment and current defaults', () => {
  for (const n of [1,2,3,8]) {
    const before = counters();
    const row = JSON.parse(as(n, caseCall));
    const after = counters();
    assert.equal(after.case[0].last_number, before.case[0].last_number + 1);
    assert.equal(after.cases, before.cases + 1);
    assert.equal(row.file_no, `VP-${after.case[0].year}-${String(after.case[0].last_number).padStart(3,'0')}`);
    const saved = json(`select to_jsonb(c) from public.cases c where id=${Number(row.id)};`);
    for (const k of ['title','court_name','case_number','owner_name','physical_storage_detail']) assert.equal(saved[k], '');
    assert.equal(saved.client_name, 'Fixture client');
    assert.equal(saved.phase, 'litigation'); assert.equal(saved.status, 'Active');
    assert.equal(saved.physical_storage_type, 'Cabinet');
  }
  const unlinked = JSON.parse(as(3, 'select public.create_case_with_number();'));
  const saved = json(`select to_jsonb(c) from public.cases c where id=${Number(unlinked.id)};`);
  assert.equal(saved.client_id, null); assert.equal(saved.client_name, '');
});

test('Case rejects Assistant Lawyer/Staff/Viewer/inactive/missing profile/anon before allocation, regardless of Finance flags', () => {
  const before = counters();
  for (const n of [4,5,6,7,99,null]) denied(n, caseCall, /CASE_CREATE_PERMISSION_DENIED/);
  denied(null, caseCall, /permission denied for function/, 'anon');
  assert.deepEqual(counters(), before);
});

test('Advisory allows active Admin/Partner/Lawyer/Assistant Lawyer and returns the existing complete payload', () => {
  for (const n of [1,2,3,4,8]) {
    const before = counters();
    const row = JSON.parse(as(n, advisoryCall));
    const after = counters();
    assert.equal(after.advisory[0].last_number, before.advisory[0].last_number + 1);
    assert.equal(after.matters, before.matters + 1);
    assert.equal(row.matter_no, `ADV-${after.advisory[0].year}-${String(after.advisory[0].last_number).padStart(3,'0')}`);
    assert.equal(row.client_id, client.slice(1,-1));
    assert.equal(row.title,'Fixture advisory'); assert.equal(row.matter_type,'general_advisory');
    assert.equal(row.retainer_type,'no_retainer'); assert.equal(row.status,'active');
    assert.equal(row.responsible_lawyer,'Lawyer'); assert.equal(row.start_date,'2026-09-26');
    assert.equal(row.end_date,null); assert.equal(row.monthly_retainer_amount,12000);
    assert.equal(row.scope_of_work,'Scope'); assert.equal(row.note,'Note'); assert.ok(row.id);
  }
  const row = JSON.parse(as(4, advisoryCall.replace('null,12000', 'null,null')));
  assert.equal(row.monthly_retainer_amount, null);
});

test('Advisory rejects Staff/Viewer/inactive/missing profile/anon and invalid fields without consuming a number', () => {
  const before = counters();
  for (const n of [5,6,7,99,null]) denied(n, advisoryCall, /ADVISORY_CREATE_PERMISSION_DENIED/);
  denied(null, advisoryCall, /permission denied for function/, 'anon');
  denied(3, advisoryCall.replace("'Fixture advisory'", "' '"), /ADVISORY_REQUIRED_FIELDS_MISSING/);
  assert.deepEqual(counters(), before);
});

test('raw allocators have no PUBLIC/anon/authenticated/service EXECUTE, and enforce caller auth even for owner execution', () => {
  const before = counters();
  for (const name of ['generate_file_no','generate_advisory_matter_no']) {
    const grants = json(`select jsonb_agg(to_jsonb(x)) from aclexplode((select proacl from pg_proc
      where oid='public.${name}()'::regprocedure)) x;`);
    const owner = Number(sql("select 'postgres'::regrole::oid;"));
    assert.ok(grants.every(g => Number(g.grantee) === owner));
    for (const role of ['anon','authenticated','service_role']) denied(1, `select public.${name}();`, /permission denied for function/, role);
    denied(null, `select public.${name}();`, /CREATE_PERMISSION_DENIED/, 'postgres');
    denied(7, `select public.${name}();`, /CREATE_PERMISSION_DENIED/, 'postgres');
  }
  assert.deepEqual(counters(), before);
});

test('normal clients cannot read or mutate either counter; backend administrative grants remain', () => {
  const before = counters();
  for (const table of ['file_no_counters','advisory_matter_counters']) {
    for (const role of ['anon','authenticated']) {
      for (const statement of [`select * from public.${table};`, `update public.${table} set last_number=0;`,
        `delete from public.${table};`, `truncate public.${table};`,
        `insert into public.${table}(year,last_number) values ('2099',1);`]) {
        denied(1, statement, /permission denied for table/, role);
      }
    }
    assert.equal(sql(`select has_table_privilege('service_role','public.${table}','INSERT')
      and has_table_privilege('service_role','public.${table}','SELECT')
      and has_table_privilege('service_role','public.${table}','UPDATE');`), 't');
  }
  assert.deepEqual(counters(), before);
});

test('Case INSERT policy stops direct bypass while Case UPDATE/children and Advisory authorization stay unchanged', () => {
  for (const n of [4,5,6,7]) denied(n, "insert into public.cases(file_no) values ('BYPASS');", /row-level security/);
  for (const n of [1,2,3,8]) as(n, "insert into public.cases(file_no) values ('AUTHORIZED-ROLLBACK');", 'authenticated', 'rollback');
  for (const n of [1,2,3,4,5]) {
    assert.equal(as(n, `with u as(update public.cases set title='edit' where id=1 returning id) select count(*) from u;`, 'authenticated','rollback'), '1');
    assert.equal(as(n, `with u as(update public.case_tasks set note='edit' where id=1 returning id) select count(*) from u;`, 'authenticated','rollback'), '1');
    assert.equal(as(n, `with u as(update public.advisory_tasks set note='edit' where id=1 returning id) select count(*) from u;`, 'authenticated','rollback'), '1');
  }
  for (const n of [6,7]) assert.equal(as(n, `with u as(update public.cases set title='edit' where id=1 returning id) select count(*) from u;`, 'authenticated','rollback'), '0');
  const direct = `insert into public.advisory_matters(client_id,matter_no,title) values(${client},'TEST-ROLLBACK','Test');`;
  for (const n of [1,2,3,4]) as(n,direct,'authenticated','rollback');
  for (const n of [5,6,7]) denied(n,direct,/row-level security/);
  assert.equal(as(8,'select public.finance_permission_canary_check();'),'t');
  assert.equal(as(3,'select public.finance_permission_canary_check();'),'f');
  assert.deepEqual(preservation(), baseline.preservation);
});

test('failed Case/Advisory INSERT rolls back allocations, including first-row counter creation', () => {
  // Failure deliberately AFTER generator evaluation, inside the actual INSERT.
  sql(`create function public.test_reject_insert() returns trigger language plpgsql as $$
    begin raise exception 'TEST_INSERT_FAILURE'; end; $$;
    create trigger test_case_failure before insert on public.cases for each row execute function public.test_reject_insert();
    create trigger test_advisory_failure before insert on public.advisory_matters for each row execute function public.test_reject_insert();`);
  const before = counters();
  denied(1,caseCall,/TEST_INSERT_FAILURE/); denied(1,advisoryCall,/TEST_INSERT_FAILURE/);
  assert.deepEqual(counters(),before);
  // Local transaction removes counter rows, then catches failed create in a
  // subtransaction; allocation must not survive. Roll back the fixture changes.
  for (const [table,call] of [['file_no_counters',caseCall],['advisory_matter_counters',advisoryCall]]) {
    const invoke = call.replace(/^select /,'perform ');
    assert.equal(as(1,`delete from public.${table}; do $block$ begin
      begin ${invoke} exception when raise_exception then
        if sqlerrm <> 'TEST_INSERT_FAILURE' then raise; end if;
      end;
      if exists(select 1 from public.${table}) then raise exception 'COUNTER_LEAK'; end if;
    end; $block$; select count(*) from public.${table};`, 'postgres','rollback'), '0');
  }
  sql('drop trigger test_case_failure on public.cases; drop trigger test_advisory_failure on public.advisory_matters; drop function public.test_reject_insert();');
  assert.deepEqual(counters(),before);
});

function session(text) {
  return new Promise((resolve,reject) => {
    let out='',err='';
    const p=spawn(path.join(bin,'psql'),connection(),{env,stdio:['pipe','pipe','pipe']});
    p.on('error',reject); p.stdout.on('data',b=>out+=b); p.stderr.on('data',b=>err+=b);
    p.on('close',code=>resolve({code,out,err}));
    p.stdin.end(`${actor(1)} select pg_backend_pid(); ${text} commit;`);
  });
}
test('independent PostgreSQL transactions cannot duplicate Case/Advisory numbers (existing and missing counter races)', async () => {
  for (const fresh of [false,true]) {
    if (fresh) sql('delete from public.file_no_counters; delete from public.advisory_matter_counters;');
    for (const [key,call,numberKey,prefix,rows] of [
      ['case',caseCall,'file_no','VP','cases'], ['advisory',advisoryCall,'matter_no','ADV','matters']
    ]) {
      const before=counters(); const initial=before[key][0]?.last_number || 0;
      const results=await Promise.all(Array.from({length:6},()=>session(call+'select pg_sleep(0.15);')));
      assert.ok(results.every(r=>r.code===0),JSON.stringify(results));
      const lines=results.map(r=>r.out.trim().split('\n'));
      assert.equal(new Set(lines.map(l=>l[0])).size,6,'Six genuinely independent backend PIDs');
      const numbers=lines.map(l=>JSON.parse(l[1])[numberKey]);
      assert.equal(new Set(numbers).size,6);
      const after=counters(); assert.equal(after[key][0].last_number,initial+6);
      assert.equal(after[rows],before[rows]+6);
      assert.deepEqual(numbers.sort(),Array.from({length:6},(_,i)=>`${prefix}-${after[key][0].year}-${String(initial+i+1).padStart(3,'0')}`).sort());
    }
  }
  console.log('Independent-session concurrency PASS: 4 batches × 6 PostgreSQL transactions; existing/new-year counter paths.');
  assert.deepEqual(preservation(),baseline.preservation);
});

test('migration accepts legitimate counters beyond the audit without reset; rerun/failed guard cannot partially apply', () => {
  // Fresh isolated database in the same disposable cluster; roles are cluster-wide.
  sql('create database advanced;');
  const conn=[...connection()]; conn[conn.length-1]='advanced';
  checked('psql',conn,fixture.replace(/^create role .*;\n/gm,''));
  checked('psql',conn,'update public.file_no_counters set last_number=77; update public.advisory_matter_counters set last_number=31;');
  const result=JSON.parse(checked('psql',conn,migration));
  assert.equal(result.gate_pass,true);
  assert.equal(result.case_counters_after[0].last_number,77);
  assert.equal(result.advisory_counters_after[0].last_number,31);
  const retry=command('psql',conn,migration); assert.notEqual(retry.status,0);
  assert.match(retry.stderr,/072_CASE_INSERT_BASELINE_MISMATCH/);
  assert.equal(checked('psql',conn,'select last_number from public.file_no_counters;'),'77');
  // Inherited privileges survive direct-role REVOKE; fail closed instead of
  // silently altering an unrelated role's ACL/membership to make the gate pass.
  sql('create database inherited_acl;'); conn[conn.length-1]='inherited_acl';
  checked('psql',conn,fixture.replace(/^create role .*;\n/gm,''));
  checked('psql',conn,'create role counter_writer_canary; grant update on public.file_no_counters to counter_writer_canary; grant counter_writer_canary to authenticated;');
  const failed=command('psql',conn,migration); assert.notEqual(failed.status,0);
  assert.match(failed.stderr,/072_VERIFICATION_FAILED.*counter_client_access_removed/);
  assert.equal(checked('psql',conn,"select to_regprocedure('public.can_create_case()') is null;"),'t');
  assert.equal(checked('psql',conn,'select last_number from public.file_no_counters;'),'52');
});

test('static boundary: exact original allocation algorithms, authorization first, no Finance/child/profile writes or app standalone allocation', () => {
  for (const name of ['generate_file_no','generate_advisory_matter_no']) {
    const re=new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`,'i');
    const original=fixture.match(re)[1];
    const hardened=migration.match(re)[1];
    assert.match(hardened,/begin\s+if auth\.uid\(\) is null/);
    const stripped=hardened.replace(/\n  if auth\.uid\(\) is null[\s\S]*?\n  end if;/,'');
    assert.equal(stripped.replace(/\s+/g,' ').trim(),original.replace(/\s+/g,' ').trim());
  }
  assert.doesNotMatch(migration,/\b(?:insert into|update|delete from|alter table|alter policy|grant|revoke)\s+(?:public\.)?(?:user_profiles|finance_|case_tasks|advisory_tasks)\b/i);
  assert.doesNotMatch(migration,/create or replace function public\.can_write_case_data/);
  for (const page of ['cases','advisory']) {
    const source=fs.readFileSync(path.join(repo,`app/${page}/page.tsx`),'utf8');
    assert.doesNotMatch(source,/rpc\([\s\n]*['"]generate_(?:file_no|advisory_matter_no)/);
  }
  assert.match(migration,/commit;\s+-- SELECT-only[^\n]*\nselect result as verification from pg_temp\.vp072_verification;\s*$/);
  console.log('Candidate SHA-256:',createHash('sha256').update(migration).digest('hex'));
});
