/* eslint-disable @typescript-eslint/no-require-imports */
// Capture-tool tests ONLY, not the Production schema or a Migration 076 fixture.
// A fresh local PostgreSQL cluster, private Unix socket, no network/.env/Supabase.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sqlText = fs.readFileSync(path.join(__dirname, '../sql/preflight_non_litigation_matter_control_core.sql'), 'utf8');
const bin = '/Applications/Postgres.app/Contents/Versions/18/bin';
let dir, started = false;
function run(name, args, input) {
  const r = spawnSync(path.join(bin, name), args, {
    input, encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'C', LANG: 'C' }, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
  return r.stdout.trim();
}
function sql(input) {
  assert.match(dir, /^\/private\/tmp\/vp8c-capture-[A-Za-z0-9]+$/);
  return run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', '58476', '-U', 'postgres', '-d', 'postgres'], input);
}
function capture(prefix = '') { return JSON.parse(sql(`BEGIN READ ONLY; ${prefix}\n${sqlText}\nROLLBACK;`)); }
function state() {
  return sql(`SELECT jsonb_build_object(
    'matters',(SELECT jsonb_agg(to_jsonb(t)) FROM advisory_matters t),
    'tasks',(SELECT jsonb_agg(to_jsonb(t)) FROM advisory_issue_tasks t),
    'profiles',(SELECT jsonb_agg(to_jsonb(t)) FROM user_profiles t),
    'counter',(SELECT jsonb_agg(to_jsonb(t)) FROM advisory_matter_counters t),
    'finance',(SELECT jsonb_agg(to_jsonb(t)) FROM finance_invoices t));`);
}
before(() => {
  assert.ok(fs.existsSync(path.join(bin, 'initdb')), 'Local PostgreSQL 18 is required');
  dir = fs.mkdtempSync('/private/tmp/vp8c-capture-'); fs.chmodSync(dir, 0o700);
  run('initdb', ['-D', dir + '/data', '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
  run('pg_ctl', ['-D', dir + '/data', '-l', dir + '/server.log', '-o', `-F -k ${dir} -p 58476 -c listen_addresses='' -c unix_socket_permissions=0700`, '-w', 'start']);
  started = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE clients(id text PRIMARY KEY,name text);
    CREATE TABLE user_profiles(id text PRIMARY KEY,full_name text,staff_name text,role text,active boolean,account_type text,assignable boolean,must_change_password boolean);
    CREATE TABLE advisory_matters(id text PRIMARY KEY,client_id text REFERENCES clients,matter_no text UNIQUE,title text,matter_type text,status text,responsible_lawyer text,start_date date,note text);
    CREATE TABLE advisory_issues(id text PRIMARY KEY,advisory_matter_id text,client_id text,responsible_person text,deleted_at timestamptz);
    CREATE TABLE advisory_issue_tasks(id text PRIMARY KEY,advisory_matter_id text,advisory_issue_id text NOT NULL,client_id text,title text,assignee_name text,status text,due_date date,completed_at timestamptz,deleted_at timestamptz);
    CREATE TABLE advisory_advice_records(id text PRIMARY KEY,advisory_matter_id text,advisory_issue_id text,responsible_person text,advice_text text);
    CREATE TABLE advisory_time_logs(id text PRIMARY KEY,advisory_matter_id text,advisory_issue_id text,staff_name text,minutes integer,billable boolean,work_date date,deleted_at timestamptz);
    CREATE TABLE advisory_matter_counters(year int PRIMARY KEY,last_number int);
    CREATE TABLE case_audit_logs(id text PRIMARY KEY,table_name text,record_id text,note text);
    CREATE TABLE finance_invoices(id text PRIMARY KEY,advisory_matter_id text REFERENCES advisory_matters,amount numeric,note text);
    CREATE TABLE cases(id int PRIMARY KEY,note text);
    CREATE FUNCTION can_create_advisory_matter() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$BEGIN RAISE EXCEPTION 'Do not execute helpers'; END$$;
    CREATE FUNCTION generate_advisory_matter_no() RETURNS text LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Do not consume numbers'; END$$;
    CREATE FUNCTION create_advisory_matter_with_number(uuid,text,text,text,text,text,date,date,numeric,text,text) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN PERFORM public.can_create_advisory_matter(); RAISE EXCEPTION 'Do not create matter'; END$$;
    CREATE FUNCTION people_is_assignable(uuid) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Do not execute helpers'; END$$;
    ALTER TABLE advisory_matters ENABLE ROW LEVEL SECURITY;
    CREATE POLICY matter_read ON advisory_matters FOR SELECT TO authenticated USING (true);
    CREATE POLICY matter_write ON advisory_matters FOR UPDATE TO authenticated USING (public.can_create_advisory_matter());
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    REVOKE ALL ON FUNCTION can_create_advisory_matter() FROM public,anon;
    GRANT EXECUTE ON FUNCTION can_create_advisory_matter() TO authenticated,service_role;
    INSERT INTO clients VALUES ('c1','PRIVATE CLIENT SENTINEL'),('c2','Second');
    INSERT INTO user_profiles VALUES
      ('u1','Unique','Lead','lawyer',true,'operational',true,false),
      ('u2','Duplicate','Twin','lawyer',true,'operational',true,false),
      ('u3','Duplicate','Other','lawyer',true,'operational',true,false),
      ('u4','UAT','Test','lawyer',true,'uat',false,false),
      ('u5','Inactive','Gone','lawyer',false,'operational',false,false),
      ('u6','No assignment','Unavailable','lawyer',true,'operational',false,false),
      ('u7','Staff','Staff','staff',true,'operational',true,false);
    INSERT INTO advisory_matters VALUES ('m1','c1','ADV-2026-001','PRIVATE TITLE SENTINEL','contract_review','active',' Lead ','2026-09-27','PRIVATE NOTE SENTINEL'),
      ('m2','c2','ADV-2026-002','Private','legal_opinion','waiting','Staff',NULL,NULL);
    INSERT INTO advisory_issues VALUES ('i1','m1','c1','Duplicate',NULL);
    INSERT INTO advisory_issue_tasks VALUES
      ('t1','m1','i1','c1','Private','Lead','completed','2026-09-27',now(),NULL),
      ('t2','m1','i1','c1','Private','UAT','pending',NULL,NULL,NULL),
      ('t3','m1','i1','c1','Private','Inactive','pending',NULL,NULL,NULL),
      ('t4','m1','i1','c1','Private','No assignment','pending',NULL,NULL,NULL),
      ('t5','m1','i1','c1','Private','Not a person','pending',NULL,NULL,NULL);
    INSERT INTO advisory_advice_records VALUES ('a1','m1','i1','Duplicate','PRIVATE ADVICE SENTINEL');
    INSERT INTO advisory_time_logs VALUES ('l1','m1','i1','Lead',90,true,'2026-09-26',NULL),('l2','m1',NULL,'Lead',30,false,'2026-09-27',NULL);
    INSERT INTO advisory_matter_counters VALUES(2026,2);
    INSERT INTO case_audit_logs VALUES ('h1','advisory_issue_tasks','t1','PRIVATE AUDIT SENTINEL'),('h2','cases','1','CASE SENTINEL');
    INSERT INTO finance_invoices VALUES ('f1','m1',1000,'FINANCE SENTINEL');
    INSERT INTO cases VALUES (1,'CASE SENTINEL');`);
});
after(() => {
  if (started) run('pg_ctl', ['-D', dir + '/data', '-m', 'fast', '-w', 'stop']);
  if (dir) console.log('Local capture-test evidence:', dir);
});

test('capture runs in READ ONLY, never invokes business helpers, and preserves rows/counters', () => {
  const before = state(), result = capture();
  assert.equal(result.capture_complete, true); assert.deepEqual(result.failed_capture_checks, []);
  assert.equal(result.migration_ready, false); assert.equal(state(), before);
  assert.equal(result.preservation_fingerprints.advisory_issue_tasks.count, 5);
  assert.equal(result.preservation_fingerprints.case_audit_logs.count, 1);
  assert.match(result.historical_rows_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.boundaries.broader_finance_differences_accepted, false);
});
test('reports exact schema, Issue NOT NULL, RLS, ACL and creation/helper definitions without guessing', () => {
  const r = capture();
  assert.equal(r.catalog.advisory_issue_tasks.columns.find(c => c.name === 'advisory_issue_id').not_null, true);
  assert.equal(r.catalog.advisory_matters.rls_enabled, true);
  assert.equal(r.catalog.advisory_matters.policies.length, 2);
  assert.ok(r.catalog.advisory_matters.incoming_foreign_keys.some(c => c.table === 'finance_invoices'));
  const f = r.functions.find(f => f.signature === 'can_create_advisory_matter()');
  assert.equal(f.owner, 'postgres'); assert.equal(f.security_definer, true);
  assert.equal(f.effective_execute.anon, false); assert.equal(f.effective_execute.authenticated, true);
  assert.match(f.definition, /Do not execute helpers/);
});
test('exact names distinguish unique, ambiguous, inactive/UAT/unassignable, and Lead role constraints', () => {
  const names = capture().people.legacy_name_matches;
  const get = (name, table) => names.find(n => n.legacy_value === name && (!table || n.table_name === table));
  assert.equal(get('Lead').classification, 'unique_eligible_candidate_requires_review');
  assert.equal(get('Duplicate').classification, 'ambiguous');
  for (const name of ['UAT','Inactive','No assignment']) assert.equal(get(name).classification, 'ineligible');
  assert.equal(get('Staff','advisory_matters').classification, 'ineligible');
  assert.equal(get('Not a person').classification, 'unmatched');
  assert.equal(get('Lead').candidates[0].profile_id, 'u1');
});
test('time and Finance references remain separate; private narrative/client/audit contents are not exported', () => {
  const r = capture();
  assert.equal(r.time_evidence.minutes_total, 120); assert.equal(r.time_evidence.core_live_minutes, 90);
  assert.equal(r.time_evidence.support_live_minutes, 30);
  assert.equal(r.finance_matter_references.finance_invoices.count, 1);
  assert.equal(r.finance_matter_references.finance_invoices.orphan_matter_refs, 0);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE (CLIENT|TITLE|NOTE|ADVICE|AUDIT) SENTINEL|FINANCE SENTINEL|CASE SENTINEL/);
});
test('orphan and cross-Matter Issue/Client links are surfaced, never silently repaired', () => {
  sql("INSERT INTO advisory_issue_tasks(id,advisory_matter_id,advisory_issue_id,client_id) VALUES ('bad','m2','i1','c1'),('orphan','absent','missing','c1');");
  try {
    const before = state(), r = capture();
    assert.equal(r.cross_parent_mismatches.issue_matter, 1); assert.equal(r.cross_parent_mismatches.client_matter, 1);
    assert.equal(r.relationships.find(l => l.child_table === 'advisory_issue_tasks' && l.field === 'advisory_matter_id').orphan_links, 1);
    assert.equal(state(), before);
  } finally { sql("DELETE FROM advisory_issue_tasks WHERE id IN ('bad','orphan');"); }
});
test('restricted visibility and proposed-target conflicts cannot produce a complete capture', () => {
  const r = capture('SET LOCAL ROLE authenticated;');
  assert.equal(r.capture_complete, false); assert.ok(r.failed_capture_checks.includes('complete_unrestricted_snapshot'));
  sql('CREATE TABLE advisory_matter_stages(id int);');
  try { assert.ok(capture().failed_capture_checks.includes('no_proposed_target_conflicts')); }
  finally { sql('DROP TABLE advisory_matter_stages;'); }
});
test('bounded row evidence reports truncation instead of pretending the full Task set was captured', () => {
  sql("INSERT INTO advisory_issue_tasks(id,advisory_matter_id,advisory_issue_id) SELECT 'bulk-'||n,'m1','i1' FROM generate_series(1,501) n;");
  try {
    const r = capture(); assert.equal(r.capture_complete, false);
    assert.ok(r.failed_capture_checks.includes('task_evidence_not_truncated'));
    assert.equal(r.task_link_evidence.length, 500);
    assert.equal(r.preservation_fingerprints.advisory_issue_tasks.count, 506);
  } finally { sql("DELETE FROM advisory_issue_tasks WHERE id LIKE 'bulk-%';"); }
});
