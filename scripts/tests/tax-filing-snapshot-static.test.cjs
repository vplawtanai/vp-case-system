/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{test}=require('node:test');
const {lexical}=require('./receipt-sql-static.test.cjs'),{workflow,filenames,migrationPath}=require('./tax-filing-snapshot-artifacts.cjs');
test('053 exact artifacts, SELECT-only checks, rollback-only rehearsal, no top-level business writes',()=>{
 for(const [file,sql] of Object.entries(workflow()))assert.equal(fs.readFileSync(file,'utf8'),sql);
 for(const file of [filenames.pre,filenames.verify]){const s=lexical(fs.readFileSync(file,'utf8'));assert.equal(s.split(';').filter(x=>x.trim()).length,1);assert.match(s.trim(),/^with /i);assert.doesNotMatch(s,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into)\b/i);assert.doesNotMatch(s,/\b(?:create|transition|materialize)_\w+\s*\(/i);}
 const dry=fs.readFileSync(filenames.dry,'utf8'),sql=fs.readFileSync(migrationPath,'utf8');
 assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 053\n')[1].split('-- END EMBEDDED MIGRATION 053')[0],sql);
 for(const s of lexical(sql).split(';'))assert.doesNotMatch(s.trim(),/^(insert|update|delete|merge|truncate|copy|select)\b/i);
 const writes=[...sql.matchAll(/(?:insert into|update|delete from) public\.(\w+)/g)].map(m=>m[1]);assert.deepEqual([...new Set(writes)].sort(),['finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_filings']);
 assert.doesNotMatch(sql,/perform public\.(tax_position_sync|materialize_)/i);
});
test('053 all existing migrations 001-052 and authoritative Overview reader remain byte-identical',()=>{
 const ref='6f20f0818c0096025c370b11f3b0f08f5a74f86b';
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only',ref,'supabase/migrations'],{encoding:'utf8'}).trim().split('\n');files.push('app/finance/tax-position/dashboard-data.ts');
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show',ref+':'+file]),file);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql')).digest('hex'),'28717cf534fba05b7591b188b15646c0833177bf412caf1a35c3864fd7ed6b2b');
});
