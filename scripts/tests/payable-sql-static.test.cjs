/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {workflow,filenames,migrationPath}=require('./payable-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
test('048 deterministic SELECT-only one-row operator artifacts and exact rollback-only migration embedding',()=>{
 const files=workflow();for(const [file,content] of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),content);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(files[file]);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|set_config)\b/i);
  assert.doesNotMatch(clean,/\b(?:public\.)?(?:ensure_finance|payable_materialize|get_finance)_\w*\s*\(/i);
  let balance=0;for(const c of clean){if(c==='(')balance++;if(c===')')balance--;assert.ok(balance>=0);}assert.equal(balance,0);
  assert.match(files[file],/failed_checks/);assert.match(files[file],/as observability_only/);
 }
 const sql=fs.readFileSync(migrationPath,'utf8'),dry=files[filenames.dry],clean=lexical(dry);
 assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 048\n')[1].split('-- END EMBEDDED MIGRATION 048')[0],sql);
});
test('048 migration contains no row writes outside entitlement domain, no backfill or payout/tax/legacy mutation, no replacement of upstream functions',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8');assert.doesNotMatch(lexical(sql),/create or replace function|\b(insert|update|delete|merge|truncate)\s+(into|from|public\.)/i);
 for(const match of sql.matchAll(/create function public\.(\w+)\(/g)){
  const fn=definition(sql.slice(match.index),match[1]),tag=/\bas\s+(\$\w*\$)/i.exec(fn),body=lexical(fn.slice(tag.index+tag[0].length,fn.lastIndexOf(tag[1])));
  for(const target of body.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi))assert.match(target[1],/^finance_payable_entitlement/);
 }
 assert.match(sql,/source-first lock order/);assert.match(sql,/PAYABLE_PAYOUT_INTEGRATION_REQUIRED/);
 assert.match(sql,/unique\(distribution_id,source_line_id,component_key\)/);
 const names=cp.execFileSync('git',['diff','--name-only','--','supabase/migrations'],{encoding:'utf8'}).trim();assert.equal(names,'','Applied migrations must remain unchanged');
});
