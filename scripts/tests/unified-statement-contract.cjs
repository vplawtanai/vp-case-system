/* eslint-disable @typescript-eslint/no-require-imports */
// Offline reconciliation. Existing Production hashes are never learned from PGlite.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs'),{sha}=require('./direct-money-documents-artifacts.cjs');
const candidatePath='supabase/migrations/202607180070_add_unified_statement_and_transfers.sql',contractPath='scripts/tests/unified-statement-contract.json';
const created=['statement_expense_context','get_finance_expense_economics','classify_finance_expense','review_finance_expense_with_economics','statement_transfer_allowed','statement_transfer_integrity','confirm_finance_treasury_transfer','statement_company_income','get_finance_unified_company_statement','get_finance_statement_accounts','get_finance_account_statement'];
const tables=['finance_expense_economic_decisions','finance_treasury_transfers','finance_treasury_transfer_legs'];
function reconciled066(approved,raw=require('./direct-money-documents-contract.json'),accepted=require('./direct-money-documents-dry-run-contract.json')){
 const baseline=approved.baseline||approved,{manifestSha,...body}=accepted;
 assert.equal(baseline.gate_pass,true);assert.equal(fingerprint(body),manifestSha,'Accepted 066 manifest integrity');
 assert.equal(baseline.candidate_sha256,accepted.candidateSha);assert.equal(raw.candidateSha,accepted.candidateSha);
 assert.equal(baseline.state_sha256,accepted.approvedBaselineSha);assert.equal(fingerprint(baseline.state),accepted.approvedBaselineSha,'Accepted 066 capture integrity');
 return (section,name)=>{
  const key=section==='functions'?'signature':'name',captured=baseline.state[section].find(x=>x[key]===name);
  const delta=raw.after[section].find(x=>x[key]===name),expected=accepted.after[section][name];
  // Reuse the accepted 066 overlay: preserve captured owner/ACL/RLS/config and
  // apply ONLY its documented definition/structural delta, never fixture grants.
  const live=delta?(section==='functions'?(captured?{...captured,definition:delta.definition}:delta):
   {...captured,...Object.fromEntries(['columns','constraints','indexes','triggers'].map(k=>[k,delta[k]]))}):captured;
  assert.ok(live,'Missing accepted 066 evidence: '+name);
  if(delta)assert.ok(expected,'Missing accepted 066 post-apply fingerprint: '+name);
  if(expected)assert.equal(fingerprint(live),expected,'Accepted 066 post-apply evidence mismatch: '+name);
  return live;
 };
}
function build(localPath,approvedPath){
 const prior=require('./company-statement-contract.json'),local=JSON.parse(fs.readFileSync(localPath)),approved=JSON.parse(fs.readFileSync(approvedPath));
 const {manifestSha,...body069}=prior;assert.equal(fingerprint(body069),manifestSha);assert.equal(prior.candidateSha,'922922ac27b5eb16819fe1775a31269909f7772c8894f5a531485a9cde238d06');assert.equal(approved.gate_pass,true);
 const captured=approved.baseline.state,resolve066=reconciled066(approved),before=structuredClone(prior.after),names=new Set([...prior.scope.functionNames,...created]),evidence=[];
 // Include the complete schema-qualified call graph of new and protected functions.
 let changed=true;while(changed){changed=false;for(const f of local.after.functions.filter(f=>names.has(f.name)))for(const m of f.definition.matchAll(/public\.([a-z_][a-z_0-9]*)\s*\(/g))if(!names.has(m[1])&&local.after.functions.some(x=>x.name===m[1])){names.add(m[1]);changed=true;}}
 for(const f of local.before.functions.filter(f=>names.has(f.name)&&!before.functions[f.signature])){
  const live=resolve066('functions',f.signature);
  for(const key of ['definition','owner','security_definer','config'])assert.deepEqual(live[key],f[key],f.signature+' unexplained '+key);
  before.functions[f.signature]=fingerprint(live);evidence.push({signature:f.signature,provenance:'Accepted compact 066 post-apply fingerprint verified against the corrected PASS capture plus its definition-only overlay; captured ACL/owner/security/search_path preserved. Unchanged post-069 repository definition reconciled; raw fixture grants are not authoritative.',sha256:fingerprint(live)});
 }
 const tableNames=new Set([...prior.scope.tableNames,...tables]);
 for(const f of local.after.functions.filter(f=>names.has(f.name)))for(const m of f.definition.matchAll(/public\.([a-z_0-9]+)/g))if(local.after.catalog.some(t=>t.name===m[1]))tableNames.add(m[1]);
 for(const rawTable of local.before.catalog.filter(t=>tableNames.has(t.name)&&!before.catalog[t.name])){
  const t=structuredClone(rawTable);
  const live=resolve066('catalog',t.name);
  // Receipt fixture omits this accepted 021 performance index; verify exact repository DDL.
  if(t.name==='finance_payment_evidence'){assert.match(fs.readFileSync('supabase/migrations/202607180021_create_finance_payment_foundation.sql','utf8'),/create index idx_finance_payment_evidence_payment\s+on public.finance_payment_evidence\s*\(payment_id, created_at\)/);assert.equal(live.indexes.find(i=>i.name==='idx_finance_payment_evidence_payment')?.definition,'CREATE INDEX idx_finance_payment_evidence_payment ON public.finance_payment_evidence USING btree (payment_id, created_at)');t.indexes=live.indexes;assert.match(fs.readFileSync('supabase/migrations/202607180021_create_finance_payment_foundation.sql','utf8'),/create trigger finance_payment_evidence_mutation_guard[\s\S]*?execute function public.guard_finance_payment_child_mutation/);assert.equal(live.triggers.length,1);assert.equal(live.triggers[0].name,'finance_payment_evidence_mutation_guard');t.triggers=live.triggers;assert.match(fs.readFileSync('supabase/migrations/202607180021_create_finance_payment_foundation.sql','utf8'),/alter table public.finance_payment_evidence enable row level security/);t.rls=live.rls;t.policies=live.policies;}
  for(const key of ['owner','kind','columns','constraints','indexes','triggers','rls','force_rls','policies'])assert.deepEqual(live[key],t[key],t.name+' unexplained '+key);
  before.catalog[t.name]=fingerprint(live);evidence.push({table:t.name,provenance:'Accepted compact 066 post-apply fingerprint verified against the corrected PASS capture plus its columns/constraints/indexes/triggers overlay; captured owner/ACL/RLS/policies preserved. Unchanged later migration structure checked; raw fixture grants are not authoritative.',sha256:fingerprint(live)});
 }
 const existingChanges=local.after.functions.filter(f=>!created.includes(f.name)&&JSON.stringify(f)!==JSON.stringify(local.before.functions.find(x=>x.signature===f.signature)));
 assert.deepEqual(existingChanges,[],'070 must not replace existing functions');
 const newFunctions=local.after.functions.filter(f=>created.includes(f.name));assert.equal(newFunctions.length,created.length);
 const newTables=local.after.catalog.filter(t=>tables.includes(t.name));assert.equal(newTables.length,3);
 for(const t of newTables){assert.equal(t.owner,'postgres');assert.equal(t.rls,true);assert.equal(t.anon_select,false);assert.equal(t.authenticated_write,false);assert.deepEqual(t.policies,[]);assert.equal(t.acl,'{postgres=arwdDxtm/postgres,service_role=r/postgres}');}
 for(const f of newFunctions){assert.equal(f.owner,'postgres');assert.deepEqual(f.config,['search_path=public']);assert.equal(f.anon_execute,false);assert.equal(f.service_execute,true);}
 // Only append the new constraint trigger to the accepted Cashbook catalog.
 // Preserve every existing column, constraint, index, policy, ACL and trigger.
 const cash=structuredClone(captured.catalog.find(t=>t.name==='finance_cash_transactions'));assert.equal(fingerprint(cash),prior.after.catalog.finance_cash_transactions);
 const localCash=local.after.catalog.find(t=>t.name===cash.name),oldCash=local.before.catalog.find(t=>t.name===cash.name);
 const delta=localCash.triggers.filter(t=>!oldCash.triggers.some(x=>x.name===t.name));assert.deepEqual(delta.map(t=>t.name),['statement_transfer_cash_integrity']);
 const constraints=localCash.constraints.filter(t=>!oldCash.constraints.some(x=>x.name===t.name));assert.deepEqual(constraints.map(t=>t.name),['statement_transfer_cash_integrity']);
 assert.deepEqual({...localCash,triggers:oldCash.triggers,constraints:oldCash.constraints},oldCash);for(const [key,items] of [['triggers',delta],['constraints',constraints]]){cash[key].push(...items);cash[key].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);}
 const changedCatalog=local.after.catalog.filter(t=>!tables.includes(t.name)&&t.name!=='finance_cash_transactions'&&JSON.stringify(t)!==JSON.stringify(local.before.catalog.find(x=>x.name===t.name)));assert.deepEqual(changedCatalog,[]);
 const after={...before,functions:{...before.functions,...Object.fromEntries(newFunctions.map(f=>[f.signature,fingerprint(f)]))},catalog:{...before.catalog,finance_cash_transactions:fingerprint(cash),...Object.fromEntries(newTables.map(t=>[t.name,fingerprint(t)]))}};
 const body={version:1,candidateSha:sha(fs.readFileSync(candidatePath)),accepted069:{candidateSha:prior.candidateSha,manifestSha:prior.manifestSha,postApply:'Operator confirmed PASS, historical rows unchanged, then Phase 3 Human UAT PASS.'},additionalDependencyEvidence:evidence,
  rawSecurityEvidence:{source:'approved-066-preflight.json',sha256:sha(fs.readFileSync(approvedPath)),capturedAt:approved.baseline.captured_at},broaderUnresolvedDifferences:490,
  scope:{created,changed:[],newTables:tables,changedTables:['finance_cash_transactions'],functionNames:[...names].sort(),tableNames:[...tableNames].sort(),rowTables:prior.scope.rowTables},before,after,
  appliedMigrationHashes:Object.fromEntries(cp.execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').map(p=>[p,sha(fs.readFileSync(p))]))};
 fs.writeFileSync(contractPath,JSON.stringify({...body,manifestSha:fingerprint(body)},null,2)+'\n');
}
if(require.main===module)build(process.argv[2],process.argv[3]);
module.exports={build,reconciled066,candidatePath,contractPath,created,tables};
