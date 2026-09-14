/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {workflow,filenames,migrationPath}=require('./direct-money-artifacts.cjs');
const {generated,marker}=require('./direct-money-migration.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
test('047 exact generated adapters and operator artifacts; SELECT-only preflight/verifier; rollback-only candidate',()=>{
 const files=workflow(),sql=fs.readFileSync(migrationPath,'utf8');assert.equal(sql.split(marker)[1],generated());
 for(const [file,text]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),text,file);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(files[file]);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into|set_config)\b/i);
  assert.doesNotMatch(clean,/\b(?:get|save|transition|issue|confirm|reverse|correct|reallocate|post)_finance_\w*\s*\(/i);
  assert.match(files[file],/as failed_checks/);assert.match(files[file],/as upstream_evidence_hashes/);
  assert.doesNotMatch(clean,/count\(\*\)\s*=\s*(267|274|33)/);
 }
 const dry=files[filenames.dry],clean=lexical(dry);assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 047\n')[1].split('-- END EMBEDDED MIGRATION 047')[0],sql);
});
test('047 no top-level DML/backfill and no financial/document writes within functions',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8');assert.doesNotMatch(lexical(sql),/\b(insert|update|delete|merge|truncate)\s+(into|from|public\.)/i);
 for(const match of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)){
  const fn=definition(sql.slice(match.index),match[1]),quote=/\bas\s+(\$\w*\$)/i.exec(fn),body=lexical(fn.slice(quote.index+quote[0].length,fn.lastIndexOf(quote[1])));
  for(const write of body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi))assert.ok(['finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'].includes(write[1]),write[1]);
  assert.doesNotMatch(body,/\b(?:issue|confirm_finance_payment|reverse_finance_payment|create_finance_invoice|create_finance_cash|create_finance_receipt)\w*\s*\(/i);
 }
});
test('applied migrations 001-046 and canonical formula catalog remain byte-identical',()=>{
 const files=cp.execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 for(const file of [...files,'app/finance/compensation/formula-definitions.json'])assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
});
