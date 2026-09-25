/* eslint-disable @typescript-eslint/no-require-imports */
// Accepted post-068 hashes are the existing Production contract. Only NEW,
// explicitly secured 069 function definitions come from disposable local SQL.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs'),{sha}=require('./direct-money-documents-artifacts.cjs');
const candidatePath='supabase/migrations/202607180069_add_company_share_statement.sql',contractPath='scripts/tests/company-statement-contract.json';
const created=['company_statement_frozen_share','get_finance_company_statement'];
function build(localPath){
 const prior=require('./distribution-payout-contract.json'),local=JSON.parse(fs.readFileSync(localPath));
 const {manifestSha,...accepted}=prior;assert.equal(fingerprint(accepted),manifestSha);assert.equal(prior.candidateSha,'3cffbbfbb1a554ef3e3eb9955f438b4f331d831b3209b44c27b796e30ce96e44');
 assert.deepEqual(local.before.functions.filter(f=>created.includes(f.name)),[]);
 const added=local.after.functions.filter(f=>created.includes(f.name));assert.equal(added.length,2);
 for(const f of added){assert.equal(f.owner,'postgres');assert.deepEqual(f.config,['search_path=public']);assert.equal(f.anon_execute,false);assert.equal(f.authenticated_execute,f.name==='get_finance_company_statement');assert.equal(f.service_execute,true);}
 const changed=local.after.functions.filter(f=>!created.includes(f.name)).filter(f=>JSON.stringify(f)!==JSON.stringify(local.before.functions.find(x=>x.signature===f.signature)));
 assert.deepEqual(changed,[],'069 must not alter pre-existing functions');assert.deepEqual(local.before.catalog,local.after.catalog);assert.deepEqual(local.before.views,local.after.views);
 const body={version:1,candidateSha:sha(fs.readFileSync(candidatePath)),accepted068:{candidateSha:prior.candidateSha,manifestSha:prior.manifestSha,postApply:'Operator confirmed exact applied state, preserved historical rows, then Phase 2 Human UAT. New historical hashes are captured by 069 Preflight.'},broaderUnresolvedDifferences:490,
  scope:{created,changed:[],writeTables:[],functionNames:[...prior.scope.functionNames,...created].sort(),tableNames:prior.scope.tableNames,rowTables:prior.scope.rowTables},
  before:prior.after,after:{...prior.after,functions:{...prior.after.functions,...Object.fromEntries(added.map(f=>[f.signature,fingerprint(f)]))}},
  dependencyEvidence:'Existing function/catalog/security hashes are copied verbatim from accepted 068 after-state. Includes 067/068 payout, tax, cash and source invariants as protected contracts. No broad 490 differences accepted.',
  appliedMigrationHashes:Object.fromEntries(cp.execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').map(p=>[p,sha(fs.readFileSync(p))]))};
 fs.writeFileSync(contractPath,JSON.stringify({...body,manifestSha:fingerprint(body)},null,2)+'\n');
}
if(require.main===module)build(process.argv[2]);
module.exports={candidatePath,contractPath,created,build};
