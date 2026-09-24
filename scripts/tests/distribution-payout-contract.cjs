/* eslint-disable @typescript-eslint/no-require-imports */
// Offline reconciliation against accepted 066/067 evidence; never a database connection.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {fingerprint}=require('./direct-money-documents-dry-run.cjs'),{sha}=require('./direct-money-documents-artifacts.cjs');
const candidatePath='supabase/migrations/202607180068_add_distribution_participant_payout.sql',contractPath='scripts/tests/distribution-payout-contract.json';
const created=['payout_confirm_distribution_outflow','get_finance_distribution_payment_context','pay_finance_distribution_participant'];
const changed=['confirm_finance_payout_before_expense','get_finance_revenue_distribution_detail'];
const writeTables=['finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_outgoing_wht_obligations'];
function build(baselinePath,localPath){
 let b=JSON.parse(fs.readFileSync(baselinePath));b=(Array.isArray(b)?b[0]:b);b=b.baseline||b;
 assert.equal(b.gate_pass,true);assert.equal(b.state_sha256,'3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e');assert.equal(fingerprint(b.state),b.state_sha256);
 const c66=require('./direct-money-documents-contract.json'),m66=require('./direct-money-documents-dry-run-contract.json'),c67=require('./revenue-distribution-contract.json');
 const current=structuredClone(b.state),local=JSON.parse(fs.readFileSync(localPath));
 for(const f of c66.after.functions){const i=current.functions.findIndex(x=>x.signature===f.signature),after=i<0?f:{...current.functions[i],definition:f.definition};assert.equal(fingerprint(after),m66.after.functions[f.signature]);if(i<0)current.functions.push(after);else current.functions[i]=after;}
 for(const t of c66.after.catalog){const i=current.catalog.findIndex(x=>x.name===t.name),after={...current.catalog[i],...Object.fromEntries(['columns','constraints','indexes','triggers'].map(k=>[k,t[k]]))};assert.equal(fingerprint(after),m66.after.catalog[t.name]);current.catalog[i]=after;}
 for(const [sig,hash] of Object.entries(c67.after.functions)){
  const i=current.functions.findIndex(f=>f.signature===sig),f=local.before.functions.find(f=>f.signature===sig);assert.ok(f,sig);
  const after=i<0?f:{...current.functions[i],definition:f.definition};assert.equal(fingerprint(after),hash,'Accepted 067 overlay '+sig);if(i<0)current.functions.push(after);else current.functions[i]=after;
 }
 const names=new Set([...created,...changed]),tables=new Set(writeTables),allNames=new Set([...current.functions,...local.after.functions].map(f=>f.name));
 const refs=text=>{for(const m of text.matchAll(/\b(?:public\.)?([a-z][a-z0-9_]*)\s*\(/gi))if(allNames.has(m[1]))names.add(m[1]);for(const t of current.catalog)if(new RegExp('\\b'+t.name+'\\b').test(text))tables.add(t.name);};
 refs(fs.readFileSync(candidatePath,'utf8'));
 for(const t of current.catalog.filter(t=>writeTables.includes(t.name)))for(const tr of t.triggers)refs(tr.definition);
 let old;do{old=names.size+tables.size;for(const [n,v] of Object.entries(local.before.views))if(tables.has(n))refs(v.definition);for(const f of [...current.functions,...local.after.functions.filter(f=>[...created,...changed].includes(f.name))])if(names.has(f.name))refs(f.definition);}while(old!==names.size+tables.size);
 const before=current.functions.filter(f=>names.has(f.name));
 const reconciliation=before.map(f=>{const lf=local.before.functions.find(x=>x.signature===f.signature);assert.ok(lf);const mismatches=['definition','owner','security_definer','config'].filter(k=>JSON.stringify(f[k])!==JSON.stringify(lf[k]));return {signature:f.signature,mismatches,security_provenance:c67.after.functions[f.signature]?'Accepted exact 067 post-apply contract':m66.after.functions[f.signature]?'Accepted exact 066 post-apply contract':'Previously captured security, unchanged by 066/067; frozen exactly in 068 Preflight/dry-run/verifier'};});
 assert.deepEqual(reconciliation.filter(r=>r.mismatches.length),[],'Unreconciled dependency definitions');
 const after=before.map(f=>changed.includes(f.name)?{...f,definition:local.after.functions.find(x=>x.signature===f.signature).definition}:f).concat(local.after.functions.filter(f=>created.includes(f.name)));
 const map=(xs,key)=>Object.fromEntries(xs.map(x=>[x[key],fingerprint(x)])),catalog=current.catalog.filter(t=>tables.has(t.name));
 const views=Object.fromEntries(Object.entries(local.before.views).filter(([n])=>tables.has(n)));
 const appliedMigrationHashes=Object.fromEntries(require('node:child_process').execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').map(p=>[p,sha(fs.readFileSync(p))]));
 const body={version:1,candidateSha:sha(fs.readFileSync(candidatePath)),accepted067:{candidateSha:c67.candidateSha,manifestSha:c67.manifestSha,stateSha:'0638051f9a8422a4930bea2a0f1a97aa190b42c2cdf204a556b1809335336448',postApply:'Operator confirmed exact 067 applied state, then Phase 1 UAT. Historical row baseline is recaptured by 068 Preflight.'},broaderUnresolvedDifferences:490,
  scope:{created,changed,writeTables,functionNames:[...names].sort(),tableNames:catalog.map(t=>t.name).sort(),rowTables:c67.scope.rowTables},before:{functions:map(before,'signature'),catalog:map(catalog,'name'),views},after:{functions:map(after,'signature'),catalog:map(catalog,'name'),views},reconciliation,appliedMigrationHashes};
 fs.writeFileSync(contractPath,JSON.stringify({...body,manifestSha:fingerprint(body)},null,2)+'\n');return body;
}
if(require.main===module){assert.ok(process.argv[2]&&process.argv[3]);const c=build(process.argv[2],process.argv[3]);console.log('068 reconciled',c.scope.functionNames.length,'functions;',c.scope.tableNames.length,'relations');}
module.exports={candidatePath,contractPath,created,changed,writeTables,build};
