/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const {lexical}=require('./receipt-sql-static.test.cjs');
const {workflow,filenames,migrationPath}=require('./vp-formula-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const {functionFacts}=require('./combined-document-workflow.cjs');
test('046 deterministic operator artifacts are SELECT-only, one statement/result, exact rollback candidate with no COMMIT',()=>{
 const files=workflow(),sql=fs.readFileSync(migrationPath,'utf8');
 for(const [file,text]of Object.entries(files))assert.equal(fs.readFileSync(file,'utf8'),text);
 for(const file of [filenames.pre,filenames.verify]){
  const clean=lexical(files[file]);assert.equal(clean.split(';').filter(s=>s.trim()).length,1);
  assert.match(clean.trim(),/^with\b/i);
  assert.doesNotMatch(clean,/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|copy|execute|into|set_config)\b/i);
  assert.doesNotMatch(clean,/\b(?:get|save|transition|issue|confirm|reverse|correct|reallocate|post)_finance_\w*\s*\(/i);
  assert.match(files[file],/as failed_checks/);assert.match(files[file],/upstream_evidence_hashes/);
  assert.doesNotMatch(files[file],/\('zero_state'/);
  const final=clean.slice(clean.lastIndexOf('select (select jsonb_object_agg'));let depth=0,top='';
  for(const char of final){if(char==='(')depth++;if(depth===0)top+=char;if(char===')')depth--;assert.ok(depth>=0);}
  assert.equal(depth,0);assert.doesNotMatch(top,/\bfrom\b/i);
 }
 const dry=files[filenames.dry],clean=lexical(dry);
 assert.match(clean.trim(),/^begin;/i);assert.match(clean.trim(),/rollback;$/i);assert.doesNotMatch(clean,/\bcommit\b/i);
 assert.equal(dry.split('-- BEGIN EMBEDDED MIGRATION 046\n')[1].split('-- END EMBEDDED MIGRATION 046')[0],sql);
 assert.ok(dry.includes(files[filenames.verify]));
});
test('046 only extends validated distribution formula evidence; zero financial DML, no upstream RPC replacement',()=>{
 const sql=fs.readFileSync(migrationPath,'utf8'),facts=functionFacts(sql);
 assert.deepEqual([...sql.matchAll(/create or replace function public\.(\w+)/g)].map(m=>m[1]),['vp_distribution_choices']);
 assert.doesNotMatch(lexical(sql),/alter table|create table|drop |truncate /i);
 const allowed=new Set([...facts.map(f=>f.name),'get_finance_vp_distribution','money_allocation_admin']);
 for(const fact of facts){
  const text=definition(sql,fact.name),tag=/\bas\s+(\$\w*\$)/i.exec(text),body=lexical(text.slice(tag.index+tag[0].length,text.lastIndexOf(tag[1])));
  assert.doesNotMatch(body,/\b(insert|update|delete|merge|truncate|execute|call|copy)\b/i,fact.name);
  for(const match of body.matchAll(/public\.(\w+)\s*\(/g))assert.ok(allowed.has(match[1]),match[1]);
 }
});
test('applied migrations remain byte-identical, including 044/045/046',()=>{
 const files=cp.execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').filter(file=>file!==migrationPath);
 for(const file of files)assert.deepEqual(fs.readFileSync(file),cp.execFileSync('git',['show','HEAD:'+file]),file);
 for(const [n,hash]of [['044','51ddffdef335a817f788843dc53dc50bec1d3772b41007d8d3cb163d3d8417ce'],['045','fd9675fa91148dc03dbe7ff8ecc09d892ac566ae9358658efe17ec31b94979f3']]){
  const file=files.find(f=>f.includes('202607180'+n+'_'));assert.ok(file,n);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
 }
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(migrationPath)).digest('hex'),'39f5d3e7164c67266eabcd185a4787ecf8adfcdac88f2bdd1c1be882407c3c4b');
});
