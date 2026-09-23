/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {assess}=require('./tax-064-privilege-resolution.cjs');
test('064 distinguishes preserved table ACLs from new-function/new-table default privileges',()=>{
 const report=assess();assert.deepEqual(report,JSON.parse(fs.readFileSync('scripts/tests/tax-064-privilege-resolution.json','utf8')));
 assert.equal(report.scope.length,5);assert.ok(report.table_results.every(t=>!t.acl_can_change_by_064));
 assert.equal(report.function_result.acl_can_change_by_064,true);
 assert.equal(report.existing_acl_drift_blocks_064,false);
 assert.ok(report.new_table_results.every(t=>t.rls_enabled&&!t.policies.length&&t.owner_pinned_by_candidate&&t.service_role_access_pinned_by_candidate));
 assert.equal(report.genuine_candidate_security_contract_defect,false);assert.equal(report.replacement_preflight_ready,true);
 assert.equal(report.candidate_changed,true);assert.deepEqual(report.production_actions,[]);
});
