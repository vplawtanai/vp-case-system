/* eslint-disable @typescript-eslint/no-require-imports */
// Builds expected delta from locally parsed 064 DDL; existing contracts ONLY from supplied capture.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const a=require('./tax-simple-artifacts.cjs'),historical=require('./tax-064-historical-artifacts.cjs');
const {reconcile}=require('./tax-064-reconcile-capture.cjs');
const md5=s=>createHash('md5').update(s).digest('hex');
function build(localBefore,localAfter){
 const bytes=fs.readFileSync('/private/tmp/post063-baseline-for-064.json'),capture=JSON.parse(bytes);
 const evidence=reconcile('/private/tmp/post063-baseline-for-064.json');
 assert.equal(evidence.summary.B,490);assert.equal(capture.migration_064_sha256,historical.sha());
 const fields=['signature','owner','definition_hash','security_definer','config','acl'];
 const functions=a.signatures.map(s=>{
  const f=capture.all_public_function_definitions.find(f=>f.signature.replace(/\s/g,'')===s);assert.ok(f,s);
  assert.equal(md5(f.definition),f.definition_hash,s);
  return Object.fromEntries(fields.map(k=>[k,f[k]]));
 });
 const catalog=a.tableNames.map(n=>{
  const t=capture.catalog.find(t=>t.name===n),security=capture.relation_security.find(t=>t.name===n);assert.ok(t&&security,n);
  return {...t,owner:security.owner,force_rls:security.force_rls};
 });
 const before={functions,catalog},after=structuredClone(before);
 // Only these two constraint definitions may differ on existing tables.
 for(const [name,constraint] of [['finance_tax_source_revisions','finance_tax_source_revisions_source_type_check'],['finance_tax_position_facts','finance_tax_position_facts_date_basis_check']]){
  const captured=catalog.find(t=>t.name===name),old=localBefore.catalog.find(t=>t.name===name),next=localAfter.catalog.find(t=>t.name===name);
  for(const key of ['columns','constraints','triggers','indexes','policies'])assert.deepEqual(captured[key],old[key],name+' repository schema '+key);
  const expected=after.catalog.find(t=>t.name===name);
  expected.constraints=expected.constraints.map(c=>c.name===constraint?next.constraints.find(n=>n.name===constraint):c);
 }
 const oldSource=functions.find(f=>f.signature==='tax_position_source(text,uuid)');
 assert.equal(oldSource.definition_hash,localBefore.functions.find(f=>f.signature===oldSource.signature).definition_hash);
 const alias=localAfter.functions.find(f=>f.signature==='tax_position_source_before_external_input(text,uuid)');assert.ok(alias);
 after.functions=after.functions.filter(f=>f.signature!==oldSource.signature);
 after.functions.push({...oldSource,signature:alias.signature,definition_hash:alias.definition_hash});
 for(const sig of ['tax_position_source(text,uuid)',...a.newFunctions.filter(n=>n!==alias.signature)]){
  const f=localAfter.functions.find(f=>f.signature===sig);assert.ok(f,sig);assert.equal(f.owner,'postgres');after.functions.push(f);
 }
 for(const name of a.newTables){const t=localAfter.catalog.find(t=>t.name===name);assert.ok(t);after.catalog.push(t);}
 for(const phase of [before,after]){phase.functions.sort((x,y)=>x.signature.localeCompare(y.signature));phase.catalog.sort((x,y)=>x.name.localeCompare(y.name));}
 return {version:2,sha256:a.sha(),original_candidate_sha256:historical.sha(),capture_sha256:createHash('sha256').update(bytes).digest('hex'),captured_at:capture.captured_at,
  baseline_kind:'dependency-scoped current-state preservation contract, NOT whole-database acceptance',
  accepted_063:{migration_sha256:capture.migration_063_sha256,independently_verified_function_count:evidence.accepted_063_evidence.verified_function_count,accepted_table_count:10},
  broader_unresolved_differences:490,unresolved_evidence:'scripts/tests/tax-064-reconciliation.json',
  security_decision:'Freeze existing owner/raw ACL/RLS/policies. New helper: postgres owner, service_role EXECUTE. New tables: postgres owner, RLS/no policies, service_role SELECT/INSERT only; no direct PUBLIC/anon/authenticated access.',
  defaults:capture.default_privileges.filter(d=>d.owner==='postgres'&&['f','r'].includes(d.object_type)),
  profile_security:capture.relation_security.find(t=>t.name==='user_profiles'),before,after};
}
module.exports={build};
