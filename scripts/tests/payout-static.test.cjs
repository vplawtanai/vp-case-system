/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {lexical}=require('./receipt-sql-static.test.cjs'),{workflow,filenames,migrationPath}=require('./payout-artifacts.cjs');
test('051 SELECT-only one-row artifacts, exact embedded candidate and rollback with no COMMIT',()=>{
 const files=workflow();for(const [file,sql]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),sql);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(files[file]);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|set_config|execute)\b/i);
  assert.doesNotMatch(clean,/\b(?:public\.)?(?:save|confirm|cancel|get)_finance_\w+\s*\(/i);
  let depth=0;for(const c of clean){if(c==='(')depth++;if(c===')')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
  assert.match(files[file],/failed_checks/);assert.match(files[file],/catalog_differences/);assert.match(files[file],/function_differences/);
 }
 const sql=fs.readFileSync(migrationPath,'utf8'),dry=files[filenames.dry];assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 051\n')[1].split('-- END EMBEDDED MIGRATION 051')[0],sql);
 assert.equal(sql.split('-- BEGIN GENERATED PAYABLE INTEGRATION')[1],'\n'+require('./payout-integration-sql.cjs').sql().split('\n').slice(1).join('\n'));
 assert.doesNotMatch(lexical(sql),/\b(insert into|update|delete from)\s+public\./i);
 assert.equal(cp.execFileSync('git',['diff','--name-only','--','supabase/migrations'],{encoding:'utf8'}).trim(),'');
});
test('051 mutation boundary is explicitly Payee/Payout/Cash/WHT only; no financial source rewrite',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8');
 const forbidden=['finance_payments','finance_invoices','finance_receipts','finance_tax_invoices','finance_company_ledger','finance_compensation_allocations','finance_payment_wht_components','finance_tax_periods','finance_account_opening_balances'];
 for(const table of forbidden)assert.doesNotMatch(sql,new RegExp('(?:insert\\s+into|update|delete\\s+from)\\s+public\\.'+table+'\\b','i'),table);
 assert.match(sql,/PAYOUT_SETTLED_DISTRIBUTION_LOCKED/);assert.match(sql,/PAYOUT_REVERSAL_NOT_AVAILABLE/);
});
