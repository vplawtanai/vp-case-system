/* eslint-disable @typescript-eslint/no-require-imports */
// Focused offline baseline/Preflight checks. No database, candidate execution or later gates.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {reconciled066}=require('./unified-statement-contract.cjs');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
const a=require('./unified-statement-artifacts.cjs');
const c=require('./unified-statement-contract.json'),accepted=require('./direct-money-documents-dry-run-contract.json');
const raw=require('./direct-money-documents-contract.json');
const affected={functions:['current_user_can_manage_finance_tax_invoices()','tax_position_source_before_expense(text,uuid)','tax_position_source_before_external_input(text,uuid)'],catalog:['finance_tax_invoice_items','finance_tax_point_events']};

test('070 dependencies use the accepted compact 066 verifier fingerprints, not raw fixture privileges',()=>{
 const sql=fs.readFileSync('scripts/sql/verify_direct_money_documents_066.sql','utf8');
 const match=sql.match(/WITH expected AS \(SELECT '((?:[^']|'')*)'::jsonb value\)/);assert.ok(match);
 const verified=JSON.parse(match[1].replaceAll("''","'"));
 for(const [section,names] of Object.entries(affected))for(const name of names){
  const key=section==='functions'?'signature':'name';
  assert.equal(c.before[section][name],accepted.after[section][name]);
  assert.equal(c.after[section][name],accepted.after[section][name]);
  assert.equal(c.before[section][name],verified[section][name]);
  assert.notEqual(c.before[section][name],fingerprint(raw.after[section].find(x=>x[key]===name)));
 }
});

function fixture(){
 const fn={signature:'example()',definition:'old',owner:'postgres',acl:'{postgres=X/postgres,service_role=X/postgres}',service_execute:true};
 const table={name:'example_table',owner:'postgres',acl:'{postgres=arwdDxt/postgres,service_role=r/postgres}',rls:true,policies:[],columns:['old'],constraints:[],indexes:[],triggers:[]};
 const state={functions:[fn],catalog:[table]},baseline={gate_pass:true,candidate_sha256:'candidate',state,state_sha256:fingerprint(state)};
 const synthetic={candidateSha:'candidate',after:{functions:[{...fn,definition:'new',acl:null,service_execute:false}],catalog:[{...table,columns:['new'],acl:null,rls:false,policies:['permissive']}]}};
 const body={candidateSha:'candidate',approvedBaselineSha:baseline.state_sha256,after:{functions:{'example()':fingerprint({...fn,definition:'new'})},catalog:{example_table:fingerprint({...table,columns:['new']})}}};
 return {baseline,synthetic,compact:{...body,manifestSha:fingerprint(body)}};
}

test('070 reconciliation overlays definitions/structure while preserving captured ACL, owner and RLS',()=>{
 const {baseline,synthetic,compact}=fixture();const resolve=reconciled066({baseline},synthetic,compact);
 const fn=resolve('functions','example()'),table=resolve('catalog','example_table');
 assert.equal(fn.definition,'new');assert.equal(fn.acl,baseline.state.functions[0].acl);assert.equal(fn.service_execute,true);
 assert.deepEqual(table.columns,['new']);assert.equal(table.acl,baseline.state.catalog[0].acl);assert.equal(table.rls,true);assert.deepEqual(table.policies,[]);
 synthetic.after.functions[0].definition='unexpected';assert.throws(()=>resolve('functions','example()'),/post-apply evidence mismatch/);
});

test('070 reconciliation fails closed on capture, manifest, candidate or accepted post-state mismatch',()=>{
 for(const alter of [x=>{x.baseline.state.functions[0].acl=null;},x=>{x.compact.after.functions['example()']='bad';},x=>{x.baseline.candidate_sha256='wrong';},x=>{x.baseline.gate_pass=false;}]){
  const x=fixture();alter(x);assert.throws(()=>reconciled066(x.baseline,x.synthetic,x.compact));
 }
 const x=fixture();delete x.compact.after.functions['example()'];const {manifestSha:_,...body}=x.compact;void _;x.compact.manifestSha=fingerprint(body);
 assert.throws(()=>reconciled066(x.baseline,x.synthetic,x.compact)('functions','example()'),/Missing accepted 066 post-apply fingerprint/);
});

test('070 historical row scope and broader unresolved evidence remain unchanged',()=>{
 const prior=require('./company-statement-contract.json');
 assert.deepEqual(c.scope.rowTables,prior.scope.rowTables);assert.equal(c.broaderUnresolvedDifferences,490);
 assert.ok(!Object.hasOwn(c.before,'rows'),'Preflight captures current Production row hashes; no fixture rows are adopted');
 assert.equal(require('./unified-statement-approved-hashes.json').stateSha,'REQUIRES_PRODUCTION_PREFLIGHT_PASS');
});

test('070 static Preflight remains one SELECT-only statement and pins the unchanged candidate',()=>{
 assert.equal(a.validate({preflightOnly:true}).candidateSha,'6b9bab9c80730d659ad5e06d0b227872aaea44782d1a789b7ec0be1add73ad96');
 const sql=fs.readFileSync(a.files.preflight,'utf8');
 const executable=sql.replace(/'(?:''|[^'])*'/g,"''").replace(/--[^\n]*/g,'');
 assert.match(executable.trim(),/^WITH\b/);assert.equal((executable.match(/;/g)||[]).length,1);
 assert.doesNotMatch(executable,/\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|execute|call|do|copy|begin|commit|rollback)\b/i);
 assert.match(sql,/490 broader_unresolved_differences/);
});
