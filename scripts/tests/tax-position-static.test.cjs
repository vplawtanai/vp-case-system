/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict'),{test}=require('node:test');
const {lexical}=require('./receipt-sql-static.test.cjs'),{workflow,filenames,migrationPath}=require('./tax-position-artifacts.cjs');
const read=p=>fs.readFileSync(p,'utf8');
test('050 SELECT-only, one statement, exact rollback artifacts, no backfill or financial writes',()=>{
 const artifacts=workflow();for(const [p,sql] of Object.entries(artifacts))assert.equal(read(p),sql);
 for(const p of [filenames.pre,filenames.verify]){
  const clean=lexical(read(p));assert.equal(clean.split(';').filter(s=>s.trim()).length,1);
  assert.match(clean.trim(),/^with /i);assert.doesNotMatch(clean,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);
 }
 const dry=read(filenames.dry),clean=lexical(dry);assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 050\n')[1].split('-- END EMBEDDED MIGRATION 050')[0],read(migrationPath));
 const m=read(migrationPath);for(const s of lexical(m).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 const writes=[...m.matchAll(/(?:insert into|update|delete from) public\.(\w+)/g)].map(x=>x[1]);
 assert.ok(writes.length);assert.ok(writes.every(t=>t.startsWith('finance_tax_')),JSON.stringify(writes));
 assert.doesNotMatch(m,/perform public\.(?:issue|confirm|create|post|materialize)_finance_(?:receipt|payment|cash|treasury|combined|tax_invoice)/);
 assert.match(read('app/finance/finance-navigation.ts'),/href: "\/finance\/tax-position", page: "tax-position"/);
 assert.match(read('app/finance/tax-position/page.tsx'),/<FinanceSubNav activePage="tax-position" permissions=\{a.permissions\}/);
 assert.match(read(filenames.verify),/tax_position_foundation_verification_pass/);
});
test('050 TH/EN keys complete, source references are not optional reference numbers, no raw backend errors',()=>{
 const {taxPositionMessages}=require('../../lib/i18n/messages/tax-position.ts');
 for(const [k,v] of Object.entries(taxPositionMessages)){assert.ok(v.th,k);assert.ok(v.en,k);}
 const {sourceLabel,taxErrorKey}=require('../../app/finance/tax-position/shared.ts');
 assert.equal(sourceLabel({reference:null,source_id:'028430c3-0000-4000-8000-000000000000'}),'028430C3');
 assert.equal(sourceLabel({reference:'VP-TI-local',source_id:'other'}),'VP-TI-local');
 assert.equal(taxErrorKey({message:'secret internal database failure'}),'taxPosition.error.failed');
 assert.equal(taxErrorKey({message:'TAX_POSITION_ADMIN_REQUIRED'}),'taxPosition.error.permission');
 assert.equal(taxErrorKey({message:'TAX_POSITION_SOURCE_CHANGED'}),'taxPosition.error.changed');
});
