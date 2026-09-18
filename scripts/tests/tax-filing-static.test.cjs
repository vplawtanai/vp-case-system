/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict'),{test}=require('node:test');
const {lexical}=require('./receipt-sql-static.test.cjs'),{workflow,filenames,migrationPath}=require('./tax-filing-artifacts.cjs');
test('052 SELECT-only exact artifacts, one result statement, rollback-only and no top-level business writes',()=>{
 for(const [p,sql] of Object.entries(workflow()))assert.equal(fs.readFileSync(p,'utf8'),sql);
 for(const p of [filenames.pre,filenames.verify]){const s=lexical(fs.readFileSync(p,'utf8'));assert.equal(s.split(';').filter(x=>x.trim()).length,1);assert.match(s.trim(),/^with /i);assert.doesNotMatch(s,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);}
 const dry=fs.readFileSync(filenames.dry,'utf8');assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 052\n')[1].split('-- END EMBEDDED MIGRATION 052')[0],fs.readFileSync(migrationPath,'utf8'));
 const sql=fs.readFileSync(migrationPath,'utf8');for(const s of lexical(sql).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 const writes=[...sql.matchAll(/(?:insert into|update|delete from) public\.(\w+)/g)].map(m=>m[1]);assert.ok(writes.every(t=>['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit','finance_cash_transactions'].includes(t)),writes.join(','));
 assert.match(sql,/pg_advisory_xact_lock\(500050\)/);assert.match(sql,/tax_filing_effective_period/);assert.match(sql,/tax_remittance_once/);
});
test('052 applied migrations 001-051 and deployed navigation remain byte-identical',()=>{
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only','1117cf0','supabase/migrations'],{encoding:'utf8'}).trim().split('\n');
 files.push('app/components/AppTopNav.tsx','app/finance/finance-navigation.ts','app/finance/FinanceSubNav.tsx','app/finance/finance-sidebar.module.css');
 for(const p of files)assert.equal(fs.readFileSync(p,'utf8'),cp.execFileSync('git',['show','1117cf0:'+p],{encoding:'utf8'}),p);
});
