/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable native PostgreSQL only. Private Unix socket, no project credentials.
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), { spawnSync, spawn } = require('node:child_process');
const E = require('./advisory-journey-families-artifacts.cjs'), { A, B, C, D, q } = E;
const bin = '/Applications/Postgres.app/Contents/Versions/18/bin';
const locale = process.env.ADVISORY085_TEST_LOCALE || 'en_US.UTF-8';
assert.ok(['C', 'en_US.UTF-8'].includes(locale));
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let dir, started = false, baseline, pins, legacy, retry, retryResult, oldPlan, finance;
function run(name, args, input, fail = false) {
  const r = spawnSync(bin + '/' + name, args, { input, encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' }, maxBuffer: 32e6 });
  if (!fail) assert.equal(r.status, 0, r.stderr || r.error?.message);
  return fail ? r : r.stdout.trim();
}
function args() { return ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', '58485', '-U', 'postgres', '-d', 'postgres']; }
function sql(s, fail = false) { return run('psql', args(), s, fail); }
function auth(n = 1) { return `set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claims',${q(JSON.stringify({ sub: id(n), role: 'authenticated' }))},false);`; }
function as(s, n = 1) { return JSON.parse(sql(auth(n) + s).split('\n').at(-1)); }
function snapshot() { return JSON.parse(sql(E.snapshot())); }
function gate(s) { return JSON.parse(sql('begin read only;' + s + 'rollback;')); }
function call(m, action, payload, request = crypto.randomUUID(), version = m ? +sql(`select version from advisory_matter_control where matter_id=${q(m)}`) : 0) {
  return `select advisory_control_write(${m ? q(m) : 'null'},${q(action)},${q(JSON.stringify(payload))},${q(request)},${version});`;
}
function payload(type, template) { return { client_id: id(90), title: 'SYNTHETIC 085 ' + type, lead_id: id(2), matter_type: type, template }; }
function write(m, action, p) { return as(call(m, action, p)); }
function plan(m) { return JSON.parse(sql(`select jsonb_agg(to_jsonb(s) order by position) from advisory_matter_stages s where matter_id=${q(m)}`)); }
function current(m) { return sql(`select id from advisory_stage_visits where matter_id=${q(m)} and kind='visit' and exited_at is null`); }
function session(s) { return new Promise(resolve => {
  const p = spawn(bin + '/psql', args(), { env: { PATH: process.env.PATH, LC_ALL: 'C' } }); let out = '', err = '';
  p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b); p.on('close', code => resolve({ code, out, err })); p.stdin.end(auth() + s);
}); }
before(() => {
  dir = fs.mkdtempSync('/private/tmp/vp-advisory085-'); fs.chmodSync(dir, 0o700);
  run('initdb', ['-D', dir + '/data', '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=' + locale]);
  run('pg_ctl', ['-D', dir + '/data', '-l', dir + '/server.log', '-o', `-F -k ${dir} -p 58485 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']); started = true;
  const source = fs.readFileSync(__dirname + '/non-litigation-postgres.test.cjs', 'utf8');
  const fixture = source.slice(source.indexOf('function fixture(){'), source.indexOf('\nbefore(()=>'));
  sql(vm.runInNewContext('(' + fixture + ')()', { A, id })); sql(A.migration(JSON.parse(sql(A.snapshotSql()))));
  // Historical fixtures only: rebase the old 077 guard to the disposable fixture.
  // 081, 082 and the candidate under test run byte-for-byte with exact guards.
  const pre077 = JSON.parse(sql(B.snapshot())); let local077 = fs.readFileSync(B.candidate, 'utf8');
  for (const k of ['catalog', 'functions']) local077 = local077.replaceAll(B.baseline[k], E.jsonHash(pre077.old[k]));
  sql(local077); sql(fs.readFileSync(C.candidate, 'utf8')); sql(fs.readFileSync(D.candidate, 'utf8'));
  retry = call(null, 'create', payload('monthly_advisory', 'general')); retryResult = as(retry); legacy = retryResult.matter_id;
  write(legacy, 'stage_complete', { visit_id: current(legacy) }); oldPlan = plan(legacy);
  baseline = snapshot(); finance = JSON.parse(sql(A.snapshotSql(true))).finance;
  pins = { candidate_sha256: A.hash(E.migration()), rows_sha256: E.jsonHash(baseline.rows), catalog_sha256: E.jsonHash(baseline.catalog) };
  const pre = gate(fs.readFileSync(E.preflight, 'utf8'));
  assert.equal(pre.gate_pass, true, JSON.stringify(pre)); assert.deepEqual(pre.object_differences, []);
  assert.equal(pre.rows_sha256, pins.rows_sha256); assert.equal(pre.catalog_sha256, pins.catalog_sha256);
  fs.writeFileSync(dir + '/preflight.json', JSON.stringify(pre, null, 2));
  for (const mutation of [
    'alter function advisory076_template(text) volatile;',
    'grant execute on function advisory076_template(text) to anon;',
    'alter policy advisory076_read on advisory_matter_stages using(false);',
  ]) {
    const preDrift = JSON.parse(sql('begin;' + mutation + E.preflightSql() + 'rollback;'));
    assert.equal(preDrift.gate_pass, false); assert.ok(preDrift.object_differences.length);
    const bad = sql('begin;' + mutation + E.migration().replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, 'ROLLBACK;'), true);
    assert.notEqual(bad.status, 0); assert.match(bad.stderr, /ADVISORY085_BASELINE_MISMATCH/);
    assert.deepEqual(snapshot(), baseline);
  }
  sql(E.migration().replace(/COMMIT;\s*$/, 'ROLLBACK;')); assert.deepEqual(snapshot(), baseline);
  sql(fs.readFileSync(E.candidate, 'utf8'));
});
after(() => { if (started) run('pg_ctl', ['-D', dir + '/data', '-m', 'fast', '-w', 'stop']); console.log('085 disposable evidence:', dir, 'locale:', locale); });

test('catalog freezes 18 real work types mapped to exactly ten linear families, with complete TH/EN', () => {
  assert.equal(E.catalog.work_types.length, 18); assert.equal(E.catalog.families.length, 10);
  assert.equal(new Set(E.catalog.work_types.map(t => t.key)).size, 18);
  assert.equal(new Set(E.catalog.work_types.map(t => t.family)).size, 10);
  for (const t of E.catalog.work_types) { assert.ok(t.th && t.en); assert.ok(E.catalog.families.some(f => f.key === t.family)); }
  for (const f of E.catalog.families) {
    assert.equal(new Set(f.stages).size, f.stages.length); assert.equal(f.stages.at(-1), 'close');
    assert.notEqual(f.stages[0], 'close'); assert.equal(f.stage_labels_th.length, f.stages.length); assert.equal(f.stage_labels_en.length, f.stages.length);
    assert.ok(f.stage_labels_th.every(Boolean) && f.stage_labels_en.every(Boolean));
  }
  for (const old of ['monthly_advisory', 'contract_review', 'contract_work', 'document_drafting', 'meeting_consultation', 'corporate_support', 'government_registration']) assert.ok(!E.catalog.work_types.some(t => t.key === old));
});
test('exact candidate changes only the pure helper; five old patterns, security, rows and Stage history are preserved', () => {
  assert.equal(E.afterDefinition.replace('\n' + E.branches, ''), E.beforeDefinition);
  assert.equal(sql(`select pg_get_functiondef('${E.signature}'::regprocedure)`), E.afterDefinition.trimEnd());
  const s = snapshot(); assert.deepEqual(s.contract, E.afterContract); assert.deepEqual(s.rows, baseline.rows); assert.deepEqual(s.catalog, baseline.catalog);
  for (const [key, value] of Object.entries(E.beforeContract.functions)) if (key !== E.signature) assert.deepEqual(s.contract.functions[key], value);
  const beforeArrays = [...E.beforeDefinition.matchAll(/when '([^']+)' then array\[([^\]]+)\]/g)]; assert.equal(beforeArrays.length, 5);
  for (const [, key, values] of beforeArrays) assert.deepEqual(JSON.parse(sql(`select to_jsonb(advisory076_template(${q(key)}))`)), [...values.matchAll(/'([^']+)'/g)].map(m => m[1]));
  assert.deepEqual(plan(legacy), oldPlan); assert.deepEqual(as(retry), retryResult);
  assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id='${id(101)}'`), '0');
  assert.deepEqual(JSON.parse(sql(A.snapshotSql(true))).finance, finance);
});
test('SELECT-only gates pass exact reviewed state and reject unbound pins, row/history/catalog/function/security drift', () => {
  const good = gate(E.verifierSql(pins)); assert.equal(good.gate_pass, true, JSON.stringify(good)); assert.deepEqual(good.object_differences, []);
  assert.equal(gate(fs.readFileSync(E.verifier, 'utf8')).gate_pass, false);
  for (const [mutation, key] of [
    [`update advisory_matters set title='Drift' where id='${id(101)}';`, 'historical_rows_unchanged'],
    [`delete from advisory_stage_visits where matter_id=${q(legacy)};`, 'historical_rows_unchanged'],
    ['alter table advisory_matter_stages add column unexpected text;', 'catalog_security_unchanged'],
    ['alter table advisory_matter_stages alter column template_key drop not null;', 'catalog_security_unchanged'],
    ['alter policy advisory076_read on advisory_matter_stages using(false);', 'applied_state_exact'],
    ['alter function advisory076_template(text) volatile;', 'applied_state_exact'],
    ['grant execute on function advisory076_template(text) to anon;', 'template_security_unchanged'],
    [E.afterDefinition.replace("when 'general_advisory' then array['intake'", "when 'general_advisory' then array['brief'") + ';', 'applied_state_exact'],
  ]) {
    const r = JSON.parse(sql('begin;' + mutation + E.verifierSql(pins) + 'rollback;'));
    assert.equal(r.gate_pass, false); assert.ok(r.failed_checks.includes(key), JSON.stringify(r));
  }
  assert.equal(gate(E.verifierSql({ ...pins, rows_sha256: '0'.repeat(64) })).gate_pass, false);
  assert.equal(gate(E.verifierSql({ ...pins, catalog_sha256: '0'.repeat(64) })).gate_pass, false);
  assert.deepEqual(snapshot().rows, baseline.rows);
});
for (const type of E.catalog.work_types) test(type.key + ': create uses its actual Family plan, one first Stage, linear advance and explicit close', () => {
  const family = E.catalog.families.find(f => f.key === type.family);
  const body = call(null, 'create', payload(type.key, type.family)), result = as(body), m = result.matter_id;
  assert.deepEqual(as(body), result, 'Retry is one saved create response');
  assert.deepEqual(plan(m).map(s => s.stage_key), family.stages); assert.ok(plan(m).every(s => s.template_key === type.family));
  let row = as(`select advisory_control_read(${q(m)})`).items[0];
  assert.equal(row.matter_type, type.key); assert.equal(row.stage_key, family.stages[0]); assert.equal(row.template_key, type.family);
  assert.equal(row.status, 'active'); assert.equal(row.work_state, 'working');
  assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id=${q(m)}`), '1');
  for (const stage of family.stages.slice(0, -1)) {
    row = as(`select advisory_control_read(${q(m)})`).items[0]; assert.equal(row.stage_key, stage);
    write(m, 'stage_complete', { visit_id: current(m) });
  }
  assert.equal(current(m), ''); assert.equal(sql(`select status from advisory_matters where id=${q(m)}`), 'active');
  assert.equal(sql(`select count(*) from advisory_stage_visits v join advisory_matter_stages s on s.id=v.stage_id where v.matter_id=${q(m)} and s.stage_key='close'`), '0');
  write(m, 'close', { outcome: 'completed', summary: 'Synthetic completed' });
  assert.equal(sql(`select status from advisory_matters where id=${q(m)}`), 'completed');
  write(m, 'reopen', { reason: 'Synthetic new instruction' }); assert.equal(current(m), '');
});
test('new Family create concurrency/retry and invalid-key rollback preserve the existing contract', async () => {
  const body = call(null, 'create', payload('foreign_workforce', 'employment_foreign_workforce'));
  const responses = await Promise.all([session(body), session(body)]);
  for (const r of responses) assert.equal(r.code, 0, r.err); assert.equal(responses[0].out, responses[1].out);
  const m = JSON.parse(responses[0].out.trim().split('\n').at(-1)).matter_id;
  assert.equal(sql(`select count(*) from advisory_stage_visits where matter_id=${q(m)}`), '1');
  const prior = snapshot(); const bad = sql(auth() + call(null, 'create', payload('unknown', 'not_a_family')), true);
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /TEMPLATE_INVALID/); assert.deepEqual(snapshot(), prior);
});
test('no authority widening; inactive actors, unauthorized roles and anon stay denied', () => {
  const prior = snapshot();
  for (const n of [3, 4, 5, 8]) {
    const r = sql(auth(n) + call(null, 'create', payload('foreign_workforce', 'employment_foreign_workforce')), true);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /FORBIDDEN/);
  }
  const anon = sql("set role anon;select advisory076_template('general_advisory');", true);
  assert.notEqual(anon.status, 0); assert.match(anon.stderr, /permission denied/); assert.deepEqual(snapshot(), prior);
  assert.deepEqual(plan(legacy), oldPlan); assert.deepEqual(JSON.parse(sql(A.snapshotSql(true))).finance, finance);
});
test('artifact consistency, deterministic projection and applied migration hashes remain exact', () => {
  assert.equal(fs.readFileSync(E.candidate, 'utf8'), E.migration()); assert.equal(fs.readFileSync(E.preflight, 'utf8'), E.preflightSql());
  assert.equal(fs.readFileSync(E.verifier, 'utf8'), E.verifierSql(JSON.parse(fs.readFileSync(E.pinsPath))));
  for (const gateSql of [E.preflightSql(), E.verifierSql()]) {
    assert.ok(gateSql.includes('COLLATE "C"')); assert.ok(gateSql.includes('a.attnotnull')); assert.ok(gateSql.includes("c.contype<>'n'"));
    assert.doesNotMatch(gateSql, /(?:select|perform)\s+(?:public\.)?advisory\w*\(/i);
  }
  assert.equal(A.hash(fs.readFileSync(A.candidate)), C.sha076); assert.equal(A.hash(fs.readFileSync(B.candidate)), C.sha077);
  assert.equal(A.hash(fs.readFileSync(C.candidate)), D.sha081); assert.equal(A.hash(fs.readFileSync(D.candidate)), E.D.A.hash(D.migration()));
});
