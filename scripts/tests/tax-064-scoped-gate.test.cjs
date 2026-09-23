/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createHash}=require('node:crypto');
const a=require('./tax-simple-artifacts.cjs'),old=require('./tax-064-historical-artifacts.cjs');
const m=require('./tax-064-scoped-contract.json');
test('064 security-only candidate delta leaves every function body and business DDL unchanged',()=>{
 let restored=a.source();
 const additions=[
  '-- Pin the Finance owner and append-only service access independently of defaults.',
  'alter table public.finance_external_input_vat owner to postgres;',
  'alter table public.finance_external_input_vat_reviews owner to postgres;',
  'grant select,insert on public.finance_external_input_vat,public.finance_external_input_vat_reviews to service_role;',
  'alter function public.tax_position_source(text,uuid) owner to postgres;',
  'revoke all on function public.tax_position_source(text,uuid) from service_role;',
  'grant execute on function public.tax_position_source(text,uuid) to service_role;'
 ];
 for(const line of additions){assert.ok(restored.includes(line+'\n'));restored=restored.replace(line+'\n','');}
 restored=restored.replace('from public,anon,authenticated,service_role;','from public,anon,authenticated;');
 assert.equal(restored,fs.readFileSync(old.migrationPath,'utf8'));
 assert.equal(m.sha256,a.sha());assert.equal(m.original_candidate_sha256,old.sha());
 assert.doesNotMatch(a.source(),/alter default privileges/i);
});
test('scoped contract freezes existing raw security and preserves all 490 unresolved differences',()=>{
 const capture=JSON.parse(fs.readFileSync('/private/tmp/post063-baseline-for-064.json'));
 assert.equal(createHash('sha256').update(fs.readFileSync('/private/tmp/post063-baseline-for-064.json')).digest('hex'),m.capture_sha256);
 for(const name of ['finance_tax_source_revisions','finance_tax_position_facts']){
  const before=m.before.catalog.find(t=>t.name===name),after=m.after.catalog.find(t=>t.name===name),actual=capture.relation_security.find(t=>t.name===name);
  for(const field of ['owner','acl','rls','force_rls']){assert.equal(before[field],actual[field]);assert.equal(after[field],before[field]);}
  assert.deepEqual(after.policies,before.policies);assert.deepEqual(after.triggers,before.triggers);
 }
 for(const t of m.after.catalog.filter(t=>a.newTables.includes(t.name))){
  assert.equal(t.owner,'postgres');assert.equal(t.rls,true);assert.deepEqual(t.policies,[]);
  assert.equal(t.acl,'{postgres=arwdDxtm/postgres,service_role=ar/postgres}');
 }
 const helper=m.after.functions.find(f=>f.signature==='tax_position_source(text,uuid)');
 assert.equal(helper.owner,'postgres');assert.equal(helper.security_definer,true);assert.deepEqual(helper.config,['search_path=public']);
 assert.equal(helper.acl,'{postgres=X/postgres,service_role=X/postgres}');
 const report=JSON.parse(fs.readFileSync(m.unresolved_evidence));assert.equal(report.summary.B,490);assert.equal(report.differences.length,490);
 for(const f of require('./tax-064-dependency-audit.json').special_functions)assert.ok(!a.signatures.some(s=>s.startsWith(f.name+'(')));
});
test('replacement gates fail closed; operator command has only readonly preflight/verifier modes',()=>{
 const files=a.workflow();
 for(const p of [a.files.pre,a.files.verify]){
  const code=files[p].replace(/'(?:[^']|'')*'/g,"''").replace(/--[^\n]*/g,'');
  assert.doesNotMatch(code,/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|do|call|set_config|dblink|query_to_xml)\b/i);
  assert.equal((code.match(/;/g)||[]).length,1);
 }
 assert.match(files[a.files.verify],/hashes is not null and hashes=/);
 const dry=files[a.files.dry],candidateAt=dry.indexOf(a.source());
 assert.ok(dry.indexOf('COMMIT;')<candidateAt);assert.doesNotMatch(dry.slice(candidateAt),/\bCOMMIT;/);
 assert.match(dry,/ROLLBACK;/);assert.match(dry,/vp\.tax064_rolled_back/);
 const runner=fs.readFileSync('scripts/tests/tax-064-gate.cjs','utf8');
 assert.ok(runner.includes("['preflight','verify','print-verify']"));assert.ok(runner.includes('default_transaction_read_only=on'));
 assert.ok(runner.includes('flag:\'wx\''));
 require('./tax-064-gate.cjs').validateArtifacts();
});

test('SQL-editor export checks candidate bytes and requires saved evidence for verification',()=>{
 const {execFileSync}=require('node:child_process');
 const stdout=execFileSync(process.execPath,['scripts/tests/tax-064-gate.cjs','print-preflight'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(stdout,'-- Candidate file and gate bytes checked locally before export.\n'+a.workflow()[a.files.pre]);
 assert.throws(()=>execFileSync(process.execPath,['scripts/tests/tax-064-gate.cjs','print-verify'],{stdio:'pipe'}));
});
