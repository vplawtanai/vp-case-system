/* eslint-disable @typescript-eslint/no-require-imports */
// Local disposable PostgreSQL only, isolated Unix socket, no project credentials.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const base = require('./visual-assets-artifacts.cjs');
const gate = require('./visual-assets-general-artifacts.cjs');
const bin = '/Applications/Postgres.app/Contents/Versions/18/bin/';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let dir, running = false, initial, reviewed, migration;

function run(name, args, input) {
  return spawnSync(bin + name, args, {input, encoding: 'utf8', env: {PATH: process.env.PATH, LC_ALL: 'C'}, maxBuffer: 16e6});
}
function checked(name, args, input) {
  const r = run(name, args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
}
function sql(text, reject = false) {
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', '58584', '-U', 'postgres', '-d', 'postgres'];
  return reject ? run('psql', args, text) : checked('psql', args, text);
}
const auth = (n = 1) => `set local role authenticated;set local request.jwt.claim.sub='${id(n)}';set local request.jwt.claim.role='authenticated';`;
const inspect = query => JSON.parse(sql('begin read only;' + query + 'rollback;'));
const rpc = (action, n, data, version = null) => `select public.visual_assets_write(${base.q(action)},'${id(n)}',${version === null ? 'null' : version},${base.q(JSON.stringify(data))})`;
const image = n => ({artwork_key: n === 20 ? 'existing-artwork' : 'vp-img-a1b2c3', name_th: 'ภาพระบบ', name_en: 'System image', asset_type: 'illustration', scope: 'both', theme: '', tags: [], status: n === 20 ? 'active' : 'draft', overlay_ready: n === 20, master_path: `${id(1)}/${id(n)}/${id(90)}/master.webp`, thumbnail_path: `${id(1)}/${id(n)}/${id(90)}/thumbnail.webp`, width: 1200, height: 800, byte_size: 4000, thumbnail_bytes: 700, sha256: 'a'.repeat(64)});
const stored = n => `insert into storage.objects(bucket_id,name) values('vp-visual-assets','${image(n).master_path}'),('vp-visual-assets','${image(n).thumbnail_path}');`;
function denied(query, pattern) {
  const r = sql(query, true); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern);
}

before(() => {
  dir = fs.mkdtempSync('/private/tmp/vp-visual084-'); fs.chmodSync(dir, 0o700);
  checked('initdb', ['-D', dir + '/data', '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=en_US.UTF-8']);
  checked('pg_ctl', ['-D', dir + '/data', '-l', dir + '/log', '-o', `-F -k ${dir} -p 58584 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); running = true;
  sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table user_profiles(id uuid primary key,role text,active boolean,must_change_password boolean not null default false);
create function public.people_is_active_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.user_profiles where id=auth.uid() and active is true and role='admin');$$;
create table storage.buckets(id text primary key,name text unique,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;grant all on storage.objects to anon,authenticated,service_role;
create policy other_storage_read on storage.objects for select to public using(true);
insert into storage.buckets values('other','other',false,null,null);insert into storage.objects(bucket_id,name) values('other','preserved');
insert into user_profiles values('${id(1)}','admin',true,false),('${id(2)}','partner',true,false),('${id(3)}','lawyer',true,false),('${id(4)}','staff',true,false),('${id(5)}','admin',false,false),('${id(6)}','admin',true,true);`);
  sql(fs.readFileSync(base.candidate, 'utf8'));
  sql(stored(20));
  sql('begin;' + auth() + rpc('create', 20, image(20)) + ';' + rpc('map', 20, {scope: 'both', family_key: 'universal', artwork_key: 'existing-artwork', expected_key: null}) + ';commit;');
  denied('begin;' + stored(21) + auth() + rpc('create', 21, image(21)) + ';rollback;', /visual_assets_overlay_ready_check/);
  initial = JSON.parse(sql(gate.snapshot()));
  const pre = inspect(gate.preflightSql()); assert.equal(pre.gate_pass, true, JSON.stringify(pre));
  reviewed = {candidate_sha256: base.hash(fs.readFileSync(gate.candidate)), rows_sha256: pre.rows_sha256, security_sha256: pre.security_sha256};
  migration = fs.readFileSync(gate.candidate, 'utf8');
  sql(migration.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  assert.deepEqual(JSON.parse(sql(gate.snapshot())), initial, 'Rollback preserves all evidence');
  sql(migration);
});
after(() => { if (running) checked('pg_ctl', ['-D', dir + '/data', '-m', 'fast', '-w', 'stop']); });

test('084 changes only the truth-only CHECK and default; preserves rows, mappings, storage, RPC and security', () => {
  const actual = JSON.parse(sql(gate.snapshot()));
  assert.deepEqual(actual.contract, gate.expectedContract(true));
  assert.deepEqual(actual.rows, initial.rows);
  assert.deepEqual(actual.security, initial.security);
  assert.equal(sql("select overlay_ready from visual_assets where artwork_key='existing-artwork'"), 't');
  assert.equal(inspect(gate.verifierSql(reviewed)).gate_pass, true);
  assert.equal(inspect(gate.preflightSql()).gate_pass, false, 'Already applied is not pre-084');
  denied(migration, /VISUAL084_OVERLAY_BASELINE_MISMATCH/);
});

test('Admin can store a general image honestly with false; stable key remains immutable and mapping optional', () => {
  const row = JSON.parse(sql('begin;' + stored(21) + auth() + rpc('create', 21, image(21)) + ';rollback;'));
  assert.equal(row.overlay_ready, false); assert.equal(row.artwork_key, 'vp-img-a1b2c3'); assert.equal(row.status, 'draft');
  assert.equal(row.id, id(21));
  const edited = sql('begin;' + stored(21) + auth() + rpc('create', 21, image(21)) + ';' + rpc('edit', 21, {...image(21), artwork_key: 'replacement-key'}, 1) + ';rollback;').split('\n').map(JSON.parse);
  assert.equal(edited[1].artwork_key, 'vp-img-a1b2c3');
  assert.equal(sql('select count(*) from visual_asset_mappings'), '1', 'Existing mapping only, no automatic mapping');
  denied('begin;' + stored(21) + auth() + rpc('create', 21, {...image(21), overlay_ready: null}) + ';rollback;', /null value in column "overlay_ready"/);
});

test('Active Admin ceiling and raw-write protections remain unchanged', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    denied('begin;' + auth(n) + rpc('create', 21, image(21)) + ';rollback;', /VISUAL_FORBIDDEN/);
    assert.equal(sql('begin;' + auth(n) + 'select count(*) from visual_assets;rollback;'), '0');
  }
  denied('begin;' + auth() + "update visual_assets set overlay_ready=false;rollback;", /permission denied/);
  denied('begin;set local role anon;' + rpc('create', 21, image(21)) + ';rollback;', /permission denied/);
});

test('existing edit contract activates drafts and retires active images without changing identity or files', () => {
  const rows = sql('begin;' + stored(21) + auth() + rpc('create', 21, image(21)) + ';'
    + rpc('edit', 21, {...image(21), status: 'active'}, 1) + ';'
    + rpc('edit', 21, {...image(21), status: 'retired'}, 2) + ';rollback;').split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(r => r.status), ['draft','active','retired']);
  assert.deepEqual(rows.map(r => r.version), [1,2,3]);
  for (const row of rows) for (const key of ['id','artwork_key','master_path','thumbnail_path','sha256','width','height','overlay_ready']) assert.equal(row[key], rows[0][key], key);
  for (const n of [2,3,4,5,6]) denied('begin;' + auth(n) + rpc('edit',20,{...image(20),status:'retired'},1) + ';rollback;', /VISUAL_FORBIDDEN/);
  denied('begin;' + auth() + rpc('edit',20,{...image(20),status:'retired'},1) + ';rollback;', /VISUAL_IN_USE/);
  denied('begin;' + stored(21) + auth() + rpc('create',21,image(21)) + ';' + rpc('edit',21,{...image(21),status:'active'},0) + ';rollback;', /VISUAL_CONFLICT/);
  denied('begin;' + stored(21) + auth() + rpc('create',21,image(21)) + ';' + rpc('delete_begin',21,{},1) + ';' + rpc('edit',21,{...image(21),status:'active'},2) + ';rollback;', /VISUAL_INVALID/);
});

test('Post-Apply verifier remains fail-closed for row/storage/security/schema changes and unreviewed baseline', () => {
  assert.equal(inspect(gate.verifierSql()).gate_pass, false);
  for (const change of [
    "update visual_assets set name_en='changed'",
    'delete from visual_asset_mappings',
    "delete from storage.objects where bucket_id='vp-visual-assets'",
    'alter table visual_assets alter column overlay_ready drop not null',
    'alter table visual_assets alter column overlay_ready set default true',
    'alter table visual_assets add constraint truth_only_again check(overlay_ready)',
    'grant insert on visual_assets to authenticated',
    'alter table visual_assets disable row level security',
    'alter function visual_assets_admin() security invoker',
    'drop policy visual083_insert_ceiling on storage.objects',
  ]) assert.equal(JSON.parse(sql('begin;' + change + ';' + gate.verifierSql(reviewed) + 'rollback;')).gate_pass, false, change);
  assert.equal(inspect(gate.verifierSql(reviewed)).gate_pass, true);
});

test('PG17-shaped catalog and PG18 normalize identically; static artifacts match exact candidates', () => {
  const projected = gate.verifierSql(reviewed).replace('WITH funcs AS (', "WITH pg_constraint AS (SELECT * FROM pg_catalog.pg_constraint WHERE contype<>'n'), funcs AS (");
  assert.equal(inspect(projected).gate_pass, true);
  assert.equal(base.hash(fs.readFileSync(base.candidate)), gate.accepted083);
  assert.equal(fs.readFileSync(gate.preflight, 'utf8'), gate.preflightSql());
  assert.equal(fs.readFileSync(gate.verifier, 'utf8'), gate.verifierSql(JSON.parse(fs.readFileSync(gate.pinsPath))));
});
