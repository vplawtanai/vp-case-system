/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lexical } = require('./receipt-sql-static.test.cjs');
const { functionFacts } = require('./combined-document-workflow.cjs');
const { definition } = require('./tax-invoice-sql-artifacts.cjs');
const { workflow, catalogSql, migrationPath, filenames } = require('./vp-distribution-artifacts.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const newTables = ['finance_vp_revenue_distributions', 'finance_vp_revenue_distribution_audit'];
const candidateDefinitions = () => {
  const sql = read(migrationPath);
  return [...sql.matchAll(/create function public\.(\w+)\(/g)].map(match => definition(sql.slice(match.index), match[1]));
};

test('045 operator API and generated files are deterministic and scoped to new artifacts', () => {
  assert.equal(typeof workflow, 'function');
  assert.equal(typeof catalogSql, 'string');
  assert.equal(migrationPath, 'supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql');
  assert.deepEqual(Object.keys(workflow()).sort(), Object.values(filenames).sort());
  for (const [file, content] of Object.entries(workflow())) {
    assert.match(file, /^scripts\/sql\/(preflight|dry_run|verify)_vp_revenue_distribution\.sql$/);
    assert.equal(read(file), content, file);
  }
  assert.deepEqual(workflow(), workflow());
});

test('045 preflight and verifier are single read-only statements with one summary row', () => {
  for (const file of [filenames.pre, filenames.verify]) {
    const sql = read(file), clean = lexical(sql);
    assert.equal(clean.split(';').filter(statement => statement.trim()).length, 1);
    assert.match(clean.trim(), /^with\b/i);
    assert.doesNotMatch(clean, /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into|set_config)\b/i);
    assert.doesNotMatch(clean, /\b(?:get|save|transition|issue|confirm|reverse|correct|reallocate|post)_finance_\w*\s*\(/i);
    assert.match(sql, /jsonb_object_agg\(name,passed is true order by name\)/);
    assert.match(sql, /as failed_checks/);
    assert.match(sql, /bool_and\(passed is true\)/);
    // All relations in the final SELECT occur inside scalar subqueries.
    const summary = clean.slice(clean.lastIndexOf('select (select jsonb_object_agg'));
    let depth = 0, topLevel = '';
    for (const char of summary) {
      if (char === '(') depth++;
      if (depth === 0) topLevel += char;
      if (char === ')') depth--;
    }
    assert.doesNotMatch(topLevel, /\bfrom\b/i);
  }
});

test('045 preserves only the present 001-044 function contract, with latest exact hashes', () => {
  const critical = [
    'current_user_can_view_finance_payments', 'finance_document_invoice_lines', 'finance_vat_treatment',
    'confirm_finance_payment', 'reverse_finance_payment', 'correct_erroneous_finance_payment',
    'reallocate_finance_payment_allocation', 'issue_finance_tax_correction', 'assert_finance_payment_structured_wht',
    'void_finance_invoice', 'issue_finance_receipt', 'issue_finance_tax_invoice', 'issue_finance_combined_document',
  ];
  const required = new Set([...critical, ...functionFacts(read('supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql')).map(fn => fn.name)]);
  const prior = new Map();
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file => /^2026071800\d{2}_/.test(file) && Number(file.slice(10, 12)) >= 1 && Number(file.slice(10, 12)) <= 44).sort()) {
    for (const fn of functionFacts(read('supabase/migrations/' + file))) if (required.has(fn.name)) prior.set(fn.name, fn);
  }
  const pre = read(filenames.pre), verify = read(filenames.verify);
  const expectedCte = pre.slice(pre.indexOf('expected_functions('), pre.indexOf('function_facts as('));
  assert.equal((expectedCte.match(/\('[^']*','[a-f0-9]{32}'/g) || []).length, required.size);
  for (const fn of prior.values()) {
    for (const sql of [pre, verify]) assert.ok(sql.includes(`('${fn.signature}','${fn.hash}',`), fn.signature);
  }
  for (const text of candidateDefinitions()) {
    const fn = functionFacts(text)[0];
    assert.ok(verify.includes(`('${fn.signature}','${fn.hash}',`), fn.signature);
  }
  assert.ok(verify.includes('public.vp_distribution_source(uuid)'));
  assert.ok(verify.includes('public.vp_distribution_frozen_source(jsonb,jsonb)'));
  for (const column of ['prosecdef', 'provolatile', 'proconfig', 'prorettype', 'proargnames', 'proisstrict', 'proleakproof']) assert.ok(verify.includes(column), column);
});

test('045 preflight rejects existing domain objects and preserves source contracts without legacy count gates', () => {
  const pre = read(filenames.pre), verify = read(filenames.verify);
  for (const sql of [pre, verify]) {
    for (const table of ['finance_payment_money_allocations', 'finance_payment_money_allocation_audit', 'finance_invoice_items', 'finance_invoice_audit_events', 'finance_compensation_allocations', 'finance_tax_correction_audit_events']) {
      assert.ok(sql.includes(`'${table}',(select md5(coalesce(jsonb_agg(to_jsonb(r)`), table);
    }
    assert.match(sql, /'044_catalog_preserved'/);
    assert.match(sql, /'044_source_guards_preserved'/);
    assert.match(sql, /'source_contracts_present'/);
    assert.match(sql, /'no_opening_cutover',not exists\(select 1 from public\.finance_account_opening_balances\)/);
    const emptiness = [...sql.matchAll(/not exists\(select 1 from public\.(\w+)\)/g)].map(match => match[1]);
    assert.ok(emptiness.every(table => [...newTables, 'finance_account_opening_balances'].includes(table)));
    assert.doesNotMatch(sql, /count\(\*\)\s*(?:=|<|>)\s*\d+\s+from public\.(?!finance_vp_revenue_distribution)\w+/i);
    assert.doesNotMatch(sql, /95E22D0E|VP-IV-202609-000004|D903B209/i);
  }
  assert.match(pre, /'045_objects_unused'/);
  for (const kind of ['relations', 'functions', 'types', 'triggers']) assert.ok(pre.includes(`not exists(select 1 from competing_${kind})`));
});

test('045 verifier checks exact catalog, eight actual guards, explicit policies and only three authenticated RPCs', () => {
  const verify = read(filenames.verify);
  for (const check of ['exact_new_catalog', 'exact_new_relation_inventory', 'exact_new_and_preserved_functions', 'exact_new_function_inventory', 'source_guards', 'source_truncate_guards', 'private_and_rpc_privileges', 'only_three_authenticated_rpcs', 'no_anon_execute', 'browser_mutation_blocked', 'explicit_read_policies', 'zero_state', 'dry_run_upstream_unchanged']) {
    assert.ok(verify.includes(`('${check}',`), check);
  }
  assert.match(verify, /count\(\*\)=8 from distribution_actual_guards where \(trigger_type & 1\)=1/);
  assert.match(verify, /count\(\*\)=8 from distribution_actual_guards where trigger_type=34/);
  const guardCte = verify.slice(verify.indexOf('distribution_expected_guards('), verify.indexOf('distribution_actual_guards as('));
  assert.equal((guardCte.match(/\('finance_[^']+','[^']+',\d+\)/g) || []).length, 16);
  assert.match(guardCte, /\('finance_payment_money_allocations','[^']+',31\)/);
  assert.match(guardCte, /\('finance_payment_allocation_reallocations','[^']+',31\)/);
  assert.match(guardCte, /\('finance_tax_document_corrections','[^']+',31\)/);
  assert.match(verify, /has_any_column_privilege/);
  assert.match(verify, /acl\.grantee=0/);
  assert.match(verify, /roles=array\['authenticated'\]::name\[\]/);
  assert.match(verify, /qual='current_user_can_view_finance_payments\(\)'/);
  assert.match(verify, /count\(\*\)=3 and bool_and\(p\.proname in \('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution'\)\)/);
});

test('045 dry run embeds exact migration and verifier inside BEGIN/ROLLBACK without executing financial RPCs', () => {
  const dry = read(filenames.dry), migration = read(migrationPath), verify = read(filenames.verify);
  const clean = lexical(dry);
  assert.match(clean.trim(), /^begin;/i);
  assert.match(clean.trim(), /rollback;$/i);
  assert.doesNotMatch(clean, /\bcommit\b/i);
  for (const [label, expected] of [['MIGRATION 045', migration], ['VP DISTRIBUTION VERIFIER', verify]]) {
    assert.equal(dry.split(`-- BEGIN EMBEDDED ${label}\n`).length, 2);
    assert.equal(dry.split(`-- BEGIN EMBEDDED ${label}\n`)[1].split(`-- END EMBEDDED ${label}`)[0], expected);
  }
  assert.ok(dry.indexOf("set_config('vp.distribution045_before'") < dry.indexOf('-- BEGIN EMBEDDED MIGRATION 045'));
  assert.match(dry, /current_setting\('vp.distribution045_before',true\)=\(select evidence::text from protected\)/);
  assert.doesNotMatch(clean, /\b(?:select|perform|call)\s+(?:public\.)?(?:get|save|transition|confirm|reverse|correct|reallocate|issue|post)_finance_\w*\s*\(/i);
  assert.doesNotMatch(lexical(migration), /\b(insert|update|delete|merge|truncate|copy)\s+(?:into\s+|from\s+)?public\./i);
  assert.doesNotMatch(lexical(migration), /create or replace function|alter table public\.(?!finance_vp_revenue_distribution)/i);
  for (const table of ['finance_payment_money_allocations', 'finance_payment_money_allocation_audit', 'finance_payments', 'finance_invoices', 'finance_company_ledger', 'finance_compensation_batches', 'finance_compensation_allocations', 'finance_cash_transactions', 'finance_account_opening_balances', 'finance_receipts', 'finance_tax_invoices', 'finance_combined_documents', 'finance_document_counters']) {
    assert.doesNotMatch(migration, new RegExp(`(?:update|insert\\s+into|delete\\s+from)\\s+public\\.${table}\\b`, 'i'));
  }
});

test('045 function bodies write only the two new tables and never call existing business-mutating RPCs', () => {
  const migration = read(migrationPath);
  const newFunctions = candidateDefinitions().map(text => ({ ...functionFacts(text)[0], text }));
  const allowedRpcs = new Set(['get_finance_vp_distribution', 'save_finance_vp_distribution', 'transition_finance_vp_distribution']);
  const allowedPublicCalls = new Set([...newFunctions.map(fn => fn.name), ...newTables,
    'money_allocation_admin', 'money_allocation_lock', 'money_allocation_source',
    'money_allocation_decisions', 'current_user_can_view_finance_payments']);
  const mutations = [];
  for (const fn of newFunctions) {
    const text = fn.text;
    const tag = /\bas\s+(\$\w*\$)/i.exec(text);
    const body = lexical(text.slice(tag.index + tag[0].length, text.lastIndexOf(tag[1])));
    assert.doesNotMatch(body, /\b(execute|call|merge|truncate|copy|create|alter|drop|grant|revoke)\b/i, fn.name);
    for (const match of body.matchAll(/\b(insert\s+into|update|delete\s+from)\s+(?:only\s+)?((?:\w+\.)?\w+)/gi)) {
      if (match[1].toLowerCase() === 'update') {
        const preceding = body.slice(0, match.index).trim();
        if (/\bfor(?:\s+no\s+key)?$/i.test(preceding)) continue;
        if (/\bdo$/i.test(preceding) && match[2].toLowerCase() === 'set') continue;
      }
      const table = match[2].replace(/^public\./, '');
      assert.ok(newTables.includes(table), `${fn.name}: forbidden ${match[1]} target ${match[2]}`);
      mutations.push({ fn: fn.name, table });
    }
    for (const match of body.matchAll(/\b(?:public\.)?((?:get|save|transition|issue|confirm|reverse|correct|reallocate|post|create|update|delete|cancel|void|approve|finalize|supersede)_finance_\w*)\s*\(/gi)) {
      assert.ok(allowedRpcs.has(match[1]), `${fn.name}: forbidden business RPC ${match[1]}`);
    }
    for (const match of body.matchAll(/\bpublic\.(\w+)\s*\(/gi)) {
      assert.ok(allowedPublicCalls.has(match[1]), `${fn.name}: unexpected upstream call ${match[1]}`);
    }
  }
  assert.deepEqual([...new Set(mutations.map(mutation => mutation.table))].sort(), [...newTables].sort());
  assert.doesNotMatch(lexical(migration), /\bcreate\s+or\s+replace\s+function\b/i);
  const previousNames = new Set();
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file => /^2026071800\d{2}_/.test(file) && Number(file.slice(10, 12)) <= 44)) {
    for (const fn of functionFacts(read('supabase/migrations/' + file))) previousNames.add(fn.name);
  }
  for (const fn of newFunctions) assert.ok(!previousNames.has(fn.name), `Inherited function replaced: ${fn.name}`);
});
