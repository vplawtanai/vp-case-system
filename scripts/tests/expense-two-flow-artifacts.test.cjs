/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm');
const a=require('./expense-two-flow-artifacts.cjs');
const lexSource=fs.readFileSync('scripts/tests/receipt-sql-static.test.cjs','utf8');
const lexical=vm.runInNewContext(lexSource.slice(lexSource.indexOf('function lexical('),lexSource.indexOf('module.exports'))+';lexical',{assert});
test('058 artifacts: SELECT-only single-row checks, exact embedding, rollback only; no top-level business writes or new schema',()=>{
 for(const [file,sql]of Object.entries(a.workflow()))assert.equal(fs.readFileSync(file,'utf8'),sql,file);
 for(const file of [a.filenames.pre,a.filenames.verify]){const sql=lexical(fs.readFileSync(file,'utf8'));assert.equal(sql.split(';').filter(s=>s.trim()).length,1);assert.match(sql.trim(),/^with /i);assert.doesNotMatch(sql,/\b(insert|update|delete|merge|call|execute|do|create|alter|drop|truncate|copy|into)\b/i);assert.doesNotMatch(sql,/\b(save_finance|review_finance|confirm_finance|prepare_finance)\w*\s*\(/i);}
 const dry=fs.readFileSync(a.filenames.dry,'utf8');assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 058\n')[1].split('-- END EMBEDDED MIGRATION 058')[0],a.source());assert.match(lexical(dry).trim(),/^begin;/i);assert.match(lexical(dry).trim(),/rollback;$/i);assert.doesNotMatch(lexical(dry),/\bcommit\b/i);
 const sql=lexical(a.source());assert.equal((sql.match(/create or replace function/gi)||[]).length,3);assert.doesNotMatch(sql,/\b(create table|alter table|create policy|create trigger|grant)\b/i);
 for(const statement of sql.split(';'))assert.doesNotMatch(statement.trim(),/^(insert|update|delete|merge|truncate|copy|select|call|do)\b/i);
});
test('058 scope: 001-057, Claim rendering and financial confirmation handlers unchanged',()=>{
 const files=cp.execFileSync('git',['ls-tree','-r','--name-only','HEAD','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').filter(p=>!p.includes('0058_'));
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
 const part=(source,start,end)=>source.slice(source.indexOf(start),end?source.indexOf(end,source.indexOf(start)):undefined);
 for(const [file,start,end]of [['app/finance/expenses/workspace.tsx','export function ExpenseClaimList','export function ExpenseList'],['app/finance/expenses/forms.tsx','export function ExpensePaymentPanel',null]]){
  assert.equal(part(fs.readFileSync(file,'utf8'),start,end),part(cp.execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}),start,end));
 }
 const manifest=JSON.parse(fs.readFileSync(a.manifestPath,'utf8'));assert.deepEqual(manifest.catalog,manifest.priorCatalog);
 for(const f of manifest.functions.filter(f=>!a.changed.includes(f.name)))assert.deepEqual(f,manifest.prior.find(p=>p.signature===f.signature));
});
