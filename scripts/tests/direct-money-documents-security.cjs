/* eslint-disable @typescript-eslint/no-require-imports */
// Offline provenance checks and disposable-test setup only. Never Production SQL.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const evidence=require('./direct-money-documents-acl-evidence.json');
const helperName='calculate_finance_billable_charge_amounts';
const signature=helperName+'(numeric,numeric,text,numeric)';
const expectedSecurity={owner:'postgres',acl:'{postgres=X/postgres,service_role=X/postgres}',security_definer:false,config:['search_path=public'],anon_execute:false,authenticated_execute:false,service_execute:true};
function validateEvidence(){
 const old=evidence.reported_function_difference.expected,actual=evidence.reported_function_difference.actual,capture=evidence.post063_capture.object;
 assert.equal(old.signature,signature);assert.equal(actual.signature,signature);assert.equal(capture.signature,signature);
 assert.equal(createHash('md5').update(old.definition).digest('hex'),capture.definition_hash);
 for(const [k,v]of Object.entries(expectedSecurity)){assert.deepEqual(actual[k],v);if(k in capture)assert.deepEqual(capture[k],v);}
 assert.equal(evidence.accepted_065_evidence.helper_was_in_065_scoped_contract,false);
 assert.ok(evidence.post063_capture.function_default_privileges[0].acl.includes('service_role=X/postgres'));
 return evidence;
}
function fixtureSecuritySql(){
 validateEvidence();
 const source=fs.readFileSync(evidence.provenance.created_and_hardened_by,'utf8');
 const revoke=source.match(/revoke all on function public\.calculate_finance_billable_charge_amounts\(numeric, numeric, text, numeric\)\s+from public, anon, authenticated;/i);
 assert.ok(revoke,'The applied 030 private-helper contract must remain explicit');
 // The earlier fixture extracts only CREATE FUNCTION. Restore its omitted 030 REVOKE.
 // Reproduce the observed retained service_role grant in this disposable database.
 return revoke[0]+`\ngrant execute on function public.${signature} to service_role;`;
}
function assertPinnedHelper(functions){
 validateEvidence();const f=functions.find(f=>f.signature===signature);assert.ok(f,'Keep this real Direct runtime dependency');
 for(const [k,v]of Object.entries(expectedSecurity))assert.deepEqual(f[k],v,signature+' '+k);
 assert.equal(createHash('md5').update(f.definition).digest('hex'),evidence.post063_capture.object.definition_hash);
}
module.exports={helperName,signature,expectedSecurity,validateEvidence,fixtureSecuritySql,assertPinnedHelper};
