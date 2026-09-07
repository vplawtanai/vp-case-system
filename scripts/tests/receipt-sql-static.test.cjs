/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Strip SQL comments and quoted content, without confusing PL/pgSQL body
// semicolons with top-level statements. The engine fixtures validate bodies.
function lexical(sql) {
  let clean = '', i = 0, depth = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
      clean += ' ';
      continue;
    }
    if (sql.startsWith('/*', i)) {
      let level = 1;
      i += 2;
      while (i < sql.length && level) {
        if (sql.startsWith('/*', i)) { level++; i += 2; }
        else if (sql.startsWith('*/', i)) { level--; i += 2; }
        else i++;
      }
      assert.equal(level, 0, 'Unclosed block comment');
      clean += ' ';
      continue;
    }
    const quote = sql[i];
    if (quote === "'" || quote === '"') {
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] !== quote) { i++; continue; }
        if (sql[i + 1] === quote) { i += 2; continue; }
        i++; closed = true; break;
      }
      assert.ok(closed, 'Unclosed quoted text');
      clean += ' quoted ';
      continue;
    }
    const tag = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/.exec(sql.slice(i));
    if (tag) {
      const end = sql.indexOf(tag[0], i + tag[0].length);
      assert.ok(end >= 0, 'Unclosed dollar quote');
      clean += ' body '; i = end + tag[0].length;
      continue;
    }
    if (sql[i] === '(') depth++;
    if (sql[i] === ')') { depth--; assert.ok(depth >= 0, 'Unexpected closing parenthesis'); }
    clean += sql[i++];
  }
  assert.equal(depth, 0, 'Unclosed parenthesis');
  return clean;
}
module.exports = {lexical};

for (const kind of ['preflight', 'verify']) {
  test(`${kind} is one SELECT-only statement with balanced structure`, () => {
    const clean = lexical(read(`scripts/sql/${kind}_finance_receipt_foundation.sql`));
    assert.equal(clean.split(';').filter((statement) => statement.trim()).length, 1);
    assert.match(clean.trim(), /^with\s/i);
    assert.doesNotMatch(clean, /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);
    assert.doesNotMatch(clean, /\b(?:create|issue|cancel|void|refresh)_finance_receipt\w*\s*\(/i);
  });
}

test('dry-run embeds exact 037 and verifier, uses BEGIN/ROLLBACK and no COMMIT', () => {
  const dry = read('scripts/sql/dry_run_finance_receipt_foundation.sql');
  const clean = lexical(dry);
  assert.match(clean.trim(), /^begin;/i);
  assert.match(clean.trim(), /rollback;$/i);
  assert.doesNotMatch(clean, /\bcommit\b/i);
  for (const [label, file] of [
    ['MIGRATION 037', 'supabase/migrations/202607180037_create_finance_receipt_foundation.sql'],
    ['RECEIPT FOUNDATION VERIFIER', 'scripts/sql/verify_finance_receipt_foundation.sql'],
  ]) {
    const marker = `-- BEGIN EMBEDDED ${label} (byte-for-byte)\n`;
    assert.equal(dry.split(marker).length, 2);
    assert.equal(dry.split(marker)[1].split(`-- END EMBEDDED ${label}`)[0], read(file));
  }
});

test('037 has no top-level business-data writes and retains the final verification flag', () => {
  const clean = lexical(read('supabase/migrations/202607180037_create_finance_receipt_foundation.sql'));
  for (const statement of clean.split(';')) {
    assert.doesNotMatch(statement.trim(), /^(insert|update|delete|merge|truncate|copy|select)\b/i);
  }
  assert.match(read('scripts/sql/verify_finance_receipt_foundation.sql'), /\bas receipt_foundation_verification_pass\b/i);
});
