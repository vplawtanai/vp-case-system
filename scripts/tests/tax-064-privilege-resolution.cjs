/* eslint-disable @typescript-eslint/no-require-imports */
// Offline assessment of exactly three existing objects and two new tables. No SQL execution.
const fs=require('node:fs'),assert=require('node:assert/strict');
const candidate=require('./tax-simple-artifacts.cjs');
function assess(){
 const capture=JSON.parse(fs.readFileSync('/private/tmp/post063-baseline-for-064.json','utf8'));
 const sql=fs.readFileSync(candidate.migrationPath,'utf8');
 assert.equal(capture.migration_064_sha256,require('./tax-064-historical-artifacts.cjs').sha());
 const functionRow=capture.all_public_function_definitions.find(f=>f.signature==='tax_position_source(text,uuid)');
 assert.equal(functionRow.owner,'postgres');assert.equal(functionRow.acl,'{postgres=X/postgres,service_role=X/postgres}');
 const tables=['finance_tax_source_revisions','finance_tax_position_facts'].map(name=>{
  const security=capture.relation_security.find(t=>t.name===name),row=capture.catalog.find(t=>t.name===name);
  assert.equal(security.owner,'postgres');assert.equal(security.rls,true);assert.equal(security.force_rls,false);
  assert.equal(security.acl,'{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}');
  assert.equal(row.policies.length,1);assert.equal(row.policies[0].cmd,'SELECT');assert.equal(row.policies[0].qual,'tax_position_can_view()');
  assert.deepEqual(row.policies[0].roles,['authenticated']);
  return {name,classification:'A_PREEXISTING_POSTURE_FREEZE_AND_PRESERVE',security,policies:row.policies,
   candidate_changes:'CHECK constraint only; no object recreation, owner/ACL/RLS/policy change',acl_can_change_by_064:false,
   capture_acl_access:{postgres:'owner/full',service_role:'all table privileges',authenticated:'SELECT subject to tax_position_can_view() RLS',anon:'none',PUBLIC:'none'},
   required_gate:'Freeze raw relacl/owner/RLS/policies before migration; compare exact pre/post values. Validate has_table_privilege, schema USAGE and role/RLS behavior separately.'};
 });
 assert.match(sql,/alter function public\.tax_position_source\(text,uuid\) rename to tax_position_source_before_external_input/);
 assert.match(sql,/create function public\.tax_position_source\(/);
 assert.match(sql,/alter function public\.tax_position_source\(text,uuid\) owner to postgres/);
 assert.match(sql,/grant execute on function public\.tax_position_source\(text,uuid\) to service_role/);
 assert.match(sql,/revoke all on public\.finance_external_input_vat,public\.finance_external_input_vat_reviews from public,anon,authenticated,service_role/);
 assert.match(sql,/grant select,insert on public\.finance_external_input_vat,public\.finance_external_input_vat_reviews to service_role/);
 const newTables=['finance_external_input_vat','finance_external_input_vat_reviews'];
 for(const n of newTables){assert.match(sql,new RegExp('alter table public\\.'+n+' enable row level security'));assert.match(sql,new RegExp('alter table public\\.'+n+' owner to postgres'));assert.equal(capture.catalog.some(t=>t.name===n),false);}
 assert.doesNotMatch(sql,/create\s+policy/i);
 return {scope:[functionRow.signature,...tables.map(t=>t.name),...newTables],candidate_sha256:candidate.sha(),candidate_changed:true,original_candidate_sha256:capture.migration_064_sha256,
  historical_default_privileges:'Not provable for 050/055 creation time. Captured current defaults are compatible with the observed grants. No historical acceptance proof is required for ACLs 064 leaves unchanged.',
  table_results:tables,function_result:{signature:functionRow.signature,current_owner:functionRow.owner,current_acl:functionRow.acl,
   classification:'B_RENAMED_ORIGINAL_PLUS_NEW_OBJECT',acl_can_change_by_064:true,
   original_alias:'Rename preserves original OID/owner/ACL; subsequent revokes for PUBLIC/anon/authenticated are no-ops against captured ACL.',
   replacement:'New OID with explicit postgres owner and service_role EXECUTE; not inherited from alias or default privileges.',
   explicit_current_contract:'SECURITY DEFINER; search_path=public; PUBLIC/anon/authenticated EXECUTE revoked.',
   missing_explicit_contract:[],
   expected_contract:{owner:'postgres',security_definer:true,search_path:['public'],postgres_execute:true,service_role_execute:true,authenticated_execute:false,anon_execute:false,PUBLIC_execute:false}},
  new_table_results:newTables.map(name=>({name,expected_owner:'postgres',owner_pinned_by_candidate:true,rls_enabled:true,force_rls:false,policies:[],
   authenticated_direct_access:'explicitly revoked',anon_direct_access:'explicitly revoked',PUBLIC_direct_access:'explicitly revoked',
   expected_service_role_access:'SELECT and INSERT only for append-only evidence; all other service table privileges revoked explicitly; RLS bypass checked by gate',
   service_role_access_pinned_by_candidate:true,
   default_privileges:'Not relied on: service grants are revoked before explicit SELECT/INSERT grant.'})),
  effective_access_limit:'Captured ACL and policy results are established. Live has_*_privilege, schema USAGE and role BYPASSRLS attributes were not captured or executed here; no end-to-end Production permission PASS is claimed.',
  genuine_candidate_security_contract_defect:false,existing_acl_drift_blocks_064:false,replacement_preflight_ready:true,
  stop_reason:'Security contract fixed under explicit authorization. Regenerated gates remain subject to MANUAL PRODUCTION GATE; no Production execution.',
  production_actions:[]};
}
if(require.main===module){const r=assess(),file='scripts/tests/tax-064-privilege-resolution.json';if(process.argv.includes('--write'))fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),r);console.log(JSON.stringify({candidate_changed:r.candidate_changed,existing_acl_drift_blocks_064:r.existing_acl_drift_blocks_064,security_contract_defect:r.genuine_candidate_security_contract_defect,preflight_ready:r.replacement_preflight_ready,candidate_sha256:r.candidate_sha256}));}
module.exports={assess};
