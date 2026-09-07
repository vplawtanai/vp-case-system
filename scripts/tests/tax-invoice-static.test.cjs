/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {artifacts}=require('./tax-invoice-sql-artifacts.cjs');
const root=path.resolve(__dirname,'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('039 deterministic workflow, one SELECT-only statement and no mutating RPCs in either verifier',()=>{
  for(const [file,text] of Object.entries(artifacts()))assert.equal(read(file),text,file);
  for(const kind of ['preflight','verify']){
    const clean=lexical(read(`scripts/sql/${kind}_finance_tax_invoice_foundation.sql`));
    assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\s/i);
    assert.doesNotMatch(clean,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);
    assert.doesNotMatch(clean,/\b(?:create|save|issue|refresh|cancel)_finance_tax_invoice\w*\s*\(/i);
  }
  const migration=read('supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql');
  for(const s of lexical(migration).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
  const dry=read('scripts/sql/dry_run_finance_tax_invoice_foundation.sql'),clean=lexical(dry);
  assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
  assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 039\n')[1].split('-- END EMBEDDED MIGRATION 039')[0],migration);
  assert.equal(dry.split('-- END EMBEDDED MIGRATION 039\n')[1],read('scripts/sql/verify_finance_tax_invoice_foundation.sql')+'ROLLBACK;\n');
});

test('039 catalog manifest checks defaults and nullability independently of PostgreSQL NOT NULL constraint rows',()=>{
  const manifest=JSON.parse(read('scripts/tests/tax-invoice-catalog.json'));
  assert.equal(manifest.length,5);
  assert.equal(new Set(manifest.map(t=>t.name)).size,5);
  assert.equal(manifest.flatMap(t=>t.columns).length,49);
  assert.equal(manifest.flatMap(t=>t.columns).filter(c=>c.not_null).length,40);
  for(const table of manifest){
    for(const category of ['columns','constraints','indexes'])
      assert.equal(new Set(table[category].map(o=>o.name)).size,table[category].length,table.name+' '+category);
    assert.ok(table.constraints.every(c=>c.type!=='n'));
    table.columns.forEach((c,i)=>{
      assert.equal(c.position,i+1);
      assert.equal(typeof c.not_null,'boolean');
      assert.equal(typeof c.has_default,'boolean');
      assert.equal(c.has_default,c.default_expression!==null);
    });
  }
  const verifier=read('scripts/sql/verify_finance_tax_invoice_foundation.sql');
  assert.match(verifier,/con\.contype <> 'n'/);
  assert.match(verifier,/'not_null',a\.attnotnull/);
  assert.match(verifier,/pg_get_expr\(d\.adbin,d\.adrelid\)/);
  assert.match(verifier,/as catalog_server_version_num/);
  assert.match(verifier,/not exists\(select 1 from catalog_differences\)/);
  assert.match(verifier,/as catalog_differences/);
  assert.match(verifier,/as failed_checks/);
  assert.match(verifier,/as tax_invoice_foundation_verification_pass/);
});
