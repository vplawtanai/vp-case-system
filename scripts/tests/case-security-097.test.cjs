/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('./case-security-097-artifacts.cjs');

test('097 generated migration/preflight/verifier are exact and candidate SHA agrees', () => {
  assert.equal(A.read(A.candidate),A.migration());
  assert.equal(A.read('scripts/sql/preflight_case_security_097.sql'),A.gate());
  assert.equal(A.read('scripts/sql/verify_case_security_097.sql'),A.gate(true));
  for (const f of ['preflight','verify']) assert.ok(A.read(`scripts/sql/${f}_case_security_097.sql`).includes(A.hash(A.read(A.candidate))));
});

test('preflight and verifier are SELECT-only and scoped; no auth/Finance data or business RPC execution', () => {
  for (const sql of [A.gate(),A.gate(true)]) {
    const executable = sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'');
    assert.doesNotMatch(executable,/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|call|do|set)\b/i);
    assert.doesNotMatch(executable,/auth\.users|public\.finance_|public\.create_case_with_number\s*\(/i);
    assert.match(sql,/query_to_xml\(format\(\s*'SELECT count\(\*\)/);
  }
  assert.deepEqual(JSON.parse(A.read(A.reviewedPath)),{
    candidate_sha256:'bddd266cc305bf676b4fe4564181035dee25db830b367c279f6bb79729d57db6',
    rows_sha256:'b90f8ed39b58adcef3bf2ebe9b12fbb68b5d8fbba6a65ef341af95b2a9f99d74',
  });
});

test('contract adds restrictions only and preserves shared helpers, schema and business writes', () => {
  const core = A.read('scripts/sql/case_security_097_contract.sql');
  assert.equal((core.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
  assert.match(core,/CREATE OR REPLACE FUNCTION public\.can_create_case\(\)/);
  assert.doesNotMatch(core,/DROP |DISABLE ROW LEVEL|ADD COLUMN|DELETE FROM|UPDATE public\.|INSERT INTO|public\.finance_|ALTER FUNCTION public\.can_write_case_data/i);
  assert.match(core,/AS RESTRICTIVE FOR ALL/);
  assert.match(core,/WITH CHECK \(user_id = auth\.uid\(\)\)/);
  assert.match(core,/NEW\.deleted_at IS DISTINCT FROM OLD\.deleted_at/);
  assert.match(core,/NEW\.deleted_by IS DISTINCT FROM OLD\.deleted_by/);
  assert.match(core,/must_change_password IS FALSE/);
  assert.match(core,/FROM PUBLIC, anon, authenticated;/);
});

test('unchanged UI role helpers are the authority for process vs routine edits and soft-delete', () => {
  const ui = A.read('lib/permissions.ts');
  for (const fn of ['canEditCaseInfo','canEditParties','canEditTimeline','canEditJudgments','canEditEnforcement','canEditDeadlines']) assert.match(ui,new RegExp(`function ${fn}[^}]+return isAssistantLawyerUp\\(role\\);`));
  for (const fn of ['canEditTasks','canEditNotes','canEditTimeLogs']) assert.match(ui,new RegExp(`function ${fn}[^}]+return isStaffUp\\(role\\);`));
  for (const fn of ['canSoftDelete','canRestore']) assert.match(ui,new RegExp(`function ${fn}[^}]+return isPartnerUp\\(role\\);`));
  assert.match(ui,/function canCreateCase[^}]+return isLawyerUp\(role\);/);
});

test('legacy unused fee/service tables have no current application consumers and remain physically intact', () => {
  function scan(dir) {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const p = path.join(dir,e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.tsx?$/.test(e.name)) assert.doesNotMatch(fs.readFileSync(p,'utf8'),/\.from\(["']case_(fees|services)["']\)/,p);
    }
  }
  scan(path.join(A.root,'app')); scan(path.join(A.root,'lib'));
  const after = JSON.parse(A.read(A.afterPath));
  for (const n of ['case_fees','case_services']) {
    assert.equal(after.tables[n].rls_enabled,true);
    assert.deepEqual(after.tables[n].policies,[]);
    assert.deepEqual(after.tables[n].columns,A.before.tables[n].columns);
  }
});
