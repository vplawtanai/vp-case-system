/* eslint-disable @typescript-eslint/no-require-imports */
// Offline reconciliation. Does not connect to a database or execute any SQL.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs');
const {sha}=require('./direct-money-documents-artifacts.cjs');
const candidatePath='supabase/migrations/202607180067_add_revenue_distribution_workspace.sql';
const contractPath='scripts/tests/revenue-distribution-contract.json';
const previousSha='010093343be8675823b8e9459c979d1dc6efe75959c7f12c0268eecb17db3f9e';
const acceptedBaselineSha='3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e';
const created=['vp_distribution_policy','vp_distribution_workspace_row','confirm_finance_vp_received_distribution','get_finance_revenue_distribution_workspace','get_finance_revenue_distribution_detail'];
const changed=['vp_received_source','vp_received_frozen'];
const writeTables=['finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlement_sources','finance_payable_entitlements','finance_payable_entitlement_audit'];
function build(baselinePath,localPath){
 let b=JSON.parse(fs.readFileSync(baselinePath));b=(Array.isArray(b)?b[0]:b);b=b.baseline||b;
 assert.equal(b.gate_pass,true);assert.equal(b.candidate_sha256,previousSha);assert.equal(b.state_sha256,acceptedBaselineSha);assert.equal(fingerprint(b.state),acceptedBaselineSha);
 const c66=JSON.parse(fs.readFileSync('scripts/tests/direct-money-documents-contract.json'));
 const m66=JSON.parse(fs.readFileSync('scripts/tests/direct-money-documents-dry-run-contract.json'));
 assert.equal(m66.approvedBaselineSha,acceptedBaselineSha);
 const current=structuredClone(b.state),local=JSON.parse(fs.readFileSync(localPath));
 // Exact expected post-066 overlay, already accepted by the manual post-apply gate.
 for(const f of c66.after.functions){let i=current.functions.findIndex(x=>x.signature===f.signature);const after=i<0?f:{...current.functions[i],definition:f.definition};assert.equal(fingerprint(after),m66.after.functions[f.signature]);if(i<0)current.functions.push(after);else current.functions[i]=after;}
 for(const t of c66.after.catalog){const i=current.catalog.findIndex(x=>x.name===t.name),after={...current.catalog[i],...Object.fromEntries(['columns','constraints','indexes','triggers'].map(k=>[k,t[k]]))};assert.equal(fingerprint(after),m66.after.catalog[t.name]);current.catalog[i]=after;}
 const names=new Set([...created,...changed,'document_direct_source']);const tables=new Set(writeTables);
 const allNames=new Set([...current.functions,...local.after.functions].map(f=>f.name));
 const refs=text=>{for(const m of text.matchAll(/\b(?:public\.)?([a-z][a-z0-9_]*)\s*\(/gi))if(allNames.has(m[1]))names.add(m[1]);for(const t of current.catalog)if(new RegExp('\\b'+t.name+'\\b').test(text))tables.add(t.name);};
 refs(fs.readFileSync(candidatePath,'utf8'));
 for(const t of current.catalog.filter(t=>writeTables.includes(t.name)))for(const tr of t.triggers)refs(tr.definition);
 let old;do{old=names.size;for(const f of [...current.functions,...local.after.functions.filter(f=>[...created,...changed].includes(f.name))])if(names.has(f.name))refs(f.definition);}while(old!==names.size);
 const before=current.functions.filter(f=>names.has(f.name));const reconciliation=[];
 for(const f of before){const localFn=local.before.functions.find(x=>x.signature===f.signature);assert.ok(localFn,'Missing local repository definition '+f.signature);
  // Compare code/owner/config, never synthetic default privileges against Production.
  const keys=['definition','owner','security_definer','config'];const mismatches=keys.filter(k=>JSON.stringify(f[k])!==JSON.stringify(localFn[k]));
  reconciliation.push({signature:f.signature,definition_matches_repository:mismatches.length===0,mismatches,security_provenance:m66.after.functions[f.signature]?'accepted 066 exact post-apply contract':'captured pre-existing ACL; 067 preserves it exactly'});
 }
 const unexplained=reconciliation.filter(r=>!r.definition_matches_repository);
 if(unexplained.length){fs.writeFileSync('/private/tmp/revenue-067-reconciliation.json',JSON.stringify(unexplained,null,2));throw Error('Dependency definition mismatches: '+unexplained.map(r=>r.signature+':'+r.mismatches).join('; '));}
 const after=[...before.filter(f=>!changed.includes(f.name)),...local.after.functions.filter(f=>created.includes(f.name)),...before.filter(f=>changed.includes(f.name)).map(f=>({...f,definition:local.after.functions.find(x=>x.signature===f.signature).definition}))];
 const catalog=current.catalog.filter(t=>tables.has(t.name));const hashMap=(xs,key)=>Object.fromEntries(xs.map(x=>[x[key],fingerprint(x)]));
 const views=Object.fromEntries(Object.entries(local.before.views).filter(([n])=>tables.has(n)));
 const migrations=Object.fromEntries(require('node:child_process').execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').map(p=>p.split('/').at(-1)).map(n=>[n,sha(fs.readFileSync('supabase/migrations/'+n))]));
 const result={version:1,candidateSha:sha(fs.readFileSync(candidatePath)),accepted066:{candidateSha:previousSha,baselineSha:acceptedBaselineSha,capturedAt:b.captured_at,postApply:'Operator confirmed exact 066 post-apply PASS before this task'},broaderUnresolvedDifferences:490,
  scope:{functionNames:[...names].sort(),tableNames:catalog.map(t=>t.name).sort(),created,changed,writeTables,rowTables:[...new Set([...c66.rowTables,...current.catalog.filter(t=>t.kind==='r'&&/^finance_/.test(t.name)).map(t=>t.name)])].sort()},
  before:{functions:hashMap(before,'signature'),catalog:hashMap(catalog,'name'),views},after:{functions:hashMap(after,'signature'),catalog:hashMap(catalog,'name'),views},
  reconciliation,appliedMigrationHashes:migrations};
 fs.writeFileSync(contractPath,JSON.stringify({...result,manifestSha:fingerprint(result)},null,2)+'\n');return result;
}
if(require.main===module){assert.ok(process.argv[2]&&process.argv[3],'Usage: node scripts/tests/revenue-distribution-contract.cjs approved-066-preflight.json local-definition-capture.json');const c=build(process.argv[2],process.argv[3]);console.log('067 reconciled',c.scope.functionNames.length,'functions;',c.scope.tableNames.length,'relations');}
module.exports={candidatePath,contractPath,created,changed,writeTables,build};
