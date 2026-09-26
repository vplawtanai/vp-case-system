const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'scripts/sql/audit_finance_cutover_phase7.sql'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/finance/PHASE7A_DATA_CLASSIFICATION.json'), 'utf8'));
const legacy = ['finance_expense_claims', 'finance_compensation_batches', 'finance_compensation_allocations', 'finance_company_ledger'];
const code = sql.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''");

test('one SELECT, no writes, locks, RPC calls, dynamic SQL or sequence advancement', () => {
  assert.match(code, /^\s*WITH RECURSIVE\b/i);
  assert.equal((code.match(/;/g) || []).length, 1);
  assert.doesNotMatch(code, /\b(insert|update|delete|truncate|alter|create|drop|merge|copy|call|execute|do|grant|revoke|nextval|setval|set_config|dblink|pg_advisory_lock|pg_sleep|into)\b/i);
  assert.doesNotMatch(code, /\bpublic\.\w+\s*\(/i);
  assert.doesNotMatch(code, /\bFROM\s+public\.finance_\w+_summary\b/i);
  const allowedCalls = new Set(('and array as by exists filter from in join materialized not or over then using values where blockers inventory k m legacy_functions raw_rows ' +
    'coalesce concat_ws convert_to count current_database encode generate_subscripts has_function_privilege jsonb_agg jsonb_build_object jsonb_each_text max min nullif ' +
    'pg_get_constraintdef pg_get_function_identity_arguments pg_get_functiondef pg_get_triggerdef pg_get_userbyid right row_number sha256 statement_timestamp string_agg sum to_jsonb to_regclass unnest').split(' '));
  for (const m of code.matchAll(/\b([a-z_][a-z_0-9]*)\s*\(/gi)) assert.ok(allowedCalls.has(m[1].toLowerCase()), `unreviewed call/syntax: ${m[1]}`);
  assert.ok(Buffer.byteLength(sql) < 100_000);
  assert.match(sql, /'cutover_ready',false/);
  assert.match(sql, /'CUTOVER_DATE_REQUIRED',true/);
});

test('all tracked table families covered, Legacy/config/shared protected', () => {
  const paths = execFileSync('git', ['ls-files', 'supabase/migrations'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const created = new Set(paths.flatMap(p => [...fs.readFileSync(path.join(root, p), 'utf8').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z_0-9]*)/gi)].map(m => m[1])));
  const inventory = new Map(manifest.tables.map(t => [t.table, t]));
  assert.equal(inventory.size, manifest.tables.length);
  for (const table of created) assert.ok(inventory.has(table), `missing ${table}`);
  for (const table of legacy) assert.equal(inventory.get(table).classification, 'LEGACY_REAL_KEEP');
  for (const table of ['finance_bank_accounts', 'finance_cash_locations', 'document_numbering_profiles']) assert.equal(inventory.get(table).classification, 'CONFIG_KEEP');
  for (const table of ['clients', 'cases', 'advisory_matters', 'user_profiles', 'case_audit_logs']) assert.equal(inventory.get(table).classification, 'SHARED_CORE_NO_TOUCH');
  for (const table of inventory.keys()) assert.ok(sql.includes(`FROM public.${table} t`), `SQL misses ${table}`);
  assert.equal(manifest.destructive_authorization, false);
  assert.equal(manifest.broader_unresolved_differences, 490);
  assert.match(sql, /UNCLASSIFIED_FINANCE_RELATIONS/);
  assert.match(sql, /KEEP_OR_UNKNOWN_TABLE_REFERENCES_UAT/);
});

// Opt-in fixture test. This deliberately accepts no connection URL or Production credentials.
// Start an isolated Postgres.app cluster at this exact local socket first. Never uses .env.
test('local PostgreSQL READ ONLY: nonzero obligations, currencies, links, history and UAT position', { skip: process.env.PHASE7A_LOCAL_FIXTURE !== '1' }, () => {
  const psql = '/Applications/Postgres.app/Contents/Versions/18/bin/psql';
  const socket = '/private/tmp/vp-phase7a-local/socket';
  const args = ['-X', '-h', socket, '-p', '58477', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
  const fixtureDb = `vp_phase7a_audit_fixture_${process.pid}`;
  const run = (input, db = fixtureDb) => execFileSync(psql, [...args, '-d', db], { input, encoding: 'utf8', env: { PATH: process.env.PATH }, maxBuffer: 20 * 1024 * 1024 });
  // This name is reserved for disposable local synthetic fixtures. Fail if already present.
  run(`CREATE DATABASE ${fixtureDb};`, 'postgres');
  const fields = new Set([...sql.matchAll(/->>\s*'([a-z_]+)'/g)].map(m => m[1]));
  for (const t of manifest.tables) { if (t.date_key) fields.add(t.date_key); if (t.amount_key) fields.add(t.amount_key); }
  for (const field of ['id', 'created_at', 'updated_at', 'source_invoice_id', 'payment_id']) fields.add(field);
  fields.delete('signed_evidence_json');
  const columns = [...fields].map(k => `"${k}" text`).join(',') + ', signed_evidence_json jsonb';
  const existingRoles = run('SELECT rolname FROM pg_roles;').trim().split('\n');
  let fixture = ['authenticated', 'anon', 'service_role'].filter(r => !existingRoles.includes(r)).map(r => `CREATE ROLE ${r};`).join('') + 'CREATE SCHEMA storage;';
  fixture += 'CREATE TABLE storage.buckets(id text,public boolean); CREATE TABLE storage.objects(bucket_id text,name text,created_at timestamptz);';
  fixture += manifest.tables.map(t => `CREATE TABLE public.${t.table}(${columns});`).join('\n');
  run(fixture);
  const evaluate = () => JSON.parse(run('BEGIN READ ONLY;\n' + sql + '\nROLLBACK;').trim());
  const empty = evaluate();
  assert.equal(empty.table_manifest_and_counts.length, manifest.tables.length);
  assert.ok(empty.table_manifest_and_counts.every(t => t.row_count === 0));
  assert.deepEqual(empty.legacy.expense_outstanding_items, []);
  assert.equal(empty.cutover_ready, false, 'empty fixture is not cutover approval');
  fixture = '';
  const add = (table, row) => {
    const quote = v => v == null ? 'NULL' : "'" + String(typeof v === 'object' ? JSON.stringify(v) : v).replaceAll("'", "''") + "'";
    fixture += `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});\n`;
  };
  add('finance_bank_accounts', { id: 'bank-a', short_name: 'KBANK', account_number: '1234567890', is_active: 'true' });
  for (const [id, status, amount] of [['c1', 'submitted', 100], ['c2', 'approved', 200], ['c3', 'paid', 300]]) add('finance_expense_claims', { id, status, amount, claim_date: '2026-09-01', ledger_entry_id: id === 'c3' ? 'l1' : null });
  add('finance_company_ledger', { id: 'l1', status: 'active', amount: 300, entry_type: 'expense', transaction_date: '2026-09-02', bank_account_id: 'bank-a', source_expense_claim_id: 'c3' });
  add('finance_compensation_batches', { id: 'batch1', status: 'finalized', received_date: '2026-09-01', received_amount: 1000 });
  add('finance_compensation_batches', { id: 'batch2', status: 'draft', received_date: '2026-09-02', received_amount: 1000 });
  add('finance_compensation_batches', { id: 'zero', status: 'posted', formula_code: 'custom', received_amount: 1000 });
  for (const [id, batch_id, amount, is_company_share, payment_status] of [['a1', 'batch1', 700, false, 'unpaid'], ['a2', 'batch1', 300, true, 'unpaid'], ['a3', 'batch2', 1000, false, 'unpaid'], ['a4', 'zero', 1000, false, 'paid']]) add('finance_compensation_allocations', { id, batch_id, amount, is_company_share, payment_status });
  add('finance_account_opening_balances', { id: 'op', bank_account_id: 'bank-a', currency: 'THB', status: 'confirmed', as_of: '2026-09-01T00:00:00Z', balance_amount: 1000 });
  add('finance_cash_transactions', { id: 'cash1', bank_account_id: 'bank-a', currency: 'THB', status: 'confirmed', occurred_at: '2026-09-02T00:00:00Z', cash_amount: 200, direction: 'inflow', source_payment_id: 'pay1' });
  add('finance_payments', { id: 'pay1', currency: 'THB', status: 'confirmed', cash_amount: 200, received_on: '2026-09-02' });
  add('finance_payments', { id: 'pay2', currency: 'USD', status: 'draft', cash_amount: 10 });
  add('finance_expenses', { id: 'exp1', legacy_claim_id: 'c2', status: 'submitted', gross_amount: 200, expense_date: '2026-09-01' });
  for (const [id, revision] of [['r1', 1], ['r2', 2]]) add('finance_tax_source_revisions', { id, revision, source_type: 'expense', source_id: 'exp1' });
  for (const [id, revision_id, tax_amount] of [['f1', 'r1', 70], ['f2', 'r2', 19.63]]) add('finance_tax_position_facts', { id, revision_id, tax_kind: 'input_vat', tax_amount, currency: 'THB' });
  add('case_audit_logs', { id: 'audit1', table_name: 'finance_expense_claims' });
  add('case_audit_logs', { id: 'audit2', table_name: 'finance_expenses' });
  add('clients', { id: 'client1', name: 'UAT shared client' });
  add('finance_fee_agreements', { id: 'agreement1', signed_evidence_json: { evidence_file: { storage_path: 'fee-agreements/agreement1/test.pdf' } } });
  fixture += "INSERT INTO storage.objects VALUES ('fee-agreement-executed-documents','fee-agreements/agreement1/test.pdf',now());";
  // Deliberately orphaned FK and undeclared Finance family must be surfaced, never ignored.
  fixture += 'ALTER TABLE finance_payments ADD PRIMARY KEY(id);';
  add('finance_payment_evidence', { id: 'evidence1', payment_id: 'missing' });
  fixture += 'ALTER TABLE finance_payment_evidence ADD CONSTRAINT fixture_orphan FOREIGN KEY(payment_id) REFERENCES finance_payments(id) NOT VALID;';
  fixture += 'CREATE TABLE finance_unknown_fixture(id text);';
  fixture += "CREATE FUNCTION fixture_legacy_writer() RETURNS void LANGUAGE plpgsql AS $$ BEGIN INSERT INTO finance_expense_claims(id) VALUES('must-not-write'); END $$;";
  fixture += 'CREATE FUNCTION fixture_legacy_wrapper() RETURNS void LANGUAGE sql AS $$ SELECT fixture_legacy_writer(); $$;';
  run(fixture);
  const a = evaluate();
  const b = evaluate();
  assert.equal(a.cutover_ready, false);
  assert.equal(a.counts_complete_for_current_role, true);
  assert.deepEqual(a.table_manifest_and_counts, b.table_manifest_and_counts, 'SELECT changed historical rows');
  assert.equal(a.table_manifest_and_counts.find(t => t.table_name === 'finance_bank_accounts').row_count, 1, 'nullable amount key must not hide rows');
  assert.deepEqual(a.legacy.expense_outstanding_summary.map(t => t.amount).sort((x, y) => x - y), [100, 200]);
  assert.equal(a.legacy.compensation_outstanding_items.length, 2);
  assert.equal(a.cutover_blockers_and_decisions.find(b => b.code === 'LEGACY_COMPENSATION_OUTSTANDING').count, 1);
  assert.deepEqual(a.legacy.zero_company_custom_posted_without_ledger, ['zero']);
  assert.deepEqual(a.legacy.link_anomalies, []);
  assert.equal(a.legacy.ledger_position_by_stored_account[0].calculated_ending_position, -300);
  assert.equal(a.new_finance_uat_position.simulated_balances[0].simulated_balance, 1200);
  assert.deepEqual(a.status_currency_totals.filter(t => t.table_name === 'finance_payments').map(t => t.currency).sort(), ['THB', 'USD']);
  assert.equal(a.tax_uat.stored_facts_not_recomputed.find(f => f.latest_revision).stored_tax_amount, 19.63);
  assert.equal(a.foreign_key_dependencies.find(f => f.conname === 'fixture_orphan').orphan_count, 1);
  assert.equal(a.unclassified_relations[0].name, 'finance_unknown_fixture');
  assert.equal(a.storage_metadata.agreement_file_links[0].object_exists, true);
  assert.ok(a.cutover_blockers_and_decisions.some(b => b.code === 'NEW_EXPENSE_LEGACY_BRIDGE'));
  assert.equal(a.shared_audit_by_parent.find(r => r.parent_table === 'finance_expense_claims').parent_class, 'LEGACY_REAL_KEEP');
  assert.equal(a.legacy_writer_surface.functions_and_transitive_callers.length, 2);
  assert.ok(a.legacy_writer_surface.functions_and_transitive_callers.some(f => f.write_candidate));
  assert.equal(a.table_manifest_and_counts.find(t => t.table_name === 'finance_expense_claims').row_count, 3, 'metadata inspection must never invoke writers');
});
