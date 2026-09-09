/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {artifacts,migrationPath}=require('./combined-document-artifacts.cjs');
const read=p=>fs.readFileSync(p,'utf8');
test('040 exact artifacts, SELECT-only operator scripts and rollback-only dry-run',()=>{
  for(const[p,sql]of Object.entries(artifacts())){
    assert.equal(read(p),sql,p);assert.doesNotMatch(sql,/[\t ]+$/m,`${p}: trailing whitespace`);
  }
  for(const kind of ['preflight','verify']){
    const clean=lexical(read(`scripts/sql/${kind}_combined_receipt_tax_invoice.sql`));
    assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\s/i);
    assert.doesNotMatch(clean,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);
    assert.doesNotMatch(clean,/\b(?:create|issue|cancel|refresh|save)_finance_\w*\s*\(/i);
  }
  const dry=read('scripts/sql/dry_run_combined_receipt_tax_invoice.sql'),clean=lexical(dry);
  assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
  assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 040\n')[1].split('-- END EMBEDDED MIGRATION 040')[0],read(migrationPath));
  assert.ok(dry.includes(read('scripts/sql/verify_combined_receipt_tax_invoice.sql')));
  for(const statement of lexical(read(migrationPath)).split(';')){
    if(/^\s*insert\b/i.test(statement))assert.match(statement,/insert into public\.document_numbering_profiles\b/i);
    else assert.doesNotMatch(statement.trim(),/^(update|delete|merge|truncate|copy|select)\b/i);
  }
  assert.match(read('scripts/sql/preflight_combined_receipt_tax_invoice.sql'),/select false as external_vp_rti_unused_confirmed/);
});
