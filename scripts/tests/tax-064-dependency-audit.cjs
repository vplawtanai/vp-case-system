/* eslint-disable @typescript-eslint/no-require-imports */
// Offline dependency audit. Does not regenerate an approved gate or execute SQL.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const a=require('./tax-064-historical-artifacts.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');
function audit(){
 const raw=fs.readFileSync('/private/tmp/post063-baseline-for-064.json'),capture=JSON.parse(raw);
 const before=JSON.parse(fs.readFileSync(a.manifestPath,'utf8')).before;
 assert.equal(a.sha(),capture.migration_064_sha256);
 const all=new Map(capture.all_public_function_definitions.map(f=>[f.signature.split('(')[0],f]));
 const roots=['tax_position_source','tax_position_sync','tax_position_can_view','tax_position_can_manage','tax_position_immutable'];
 const seen=new Set(),edges=[];
 function walk(name){if(seen.has(name))return;seen.add(name);const f=all.get(name);assert.ok(f,name);
  const body=f.definition.replace(/--[^\n]*/g,'');assert.doesNotMatch(body,/\bexecute\s+(?:format|')/i,'Dynamic SQL requires manual dependency analysis');
  const called=[...new Set([...body.matchAll(/public\.([a-z_0-9]+)\s*\(/g)].map(m=>m[1]))].filter(n=>n!==name&&all.has(n));
  for(const child of called){edges.push({caller:name,callee:child});walk(child);}
 }
 roots.forEach(walk);
 const readTables=[...new Set([...seen].flatMap(n=>[...all.get(n).definition.matchAll(/public\.((?:finance_|user_)[a-z_0-9]+)/g)].map(m=>m[1])).filter(n=>!all.has(n)))].sort();
 const writeTables=['finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit'];
 const changedTables=['finance_tax_source_revisions','finance_tax_position_facts'];
 const newTables=['finance_external_input_vat','finance_external_input_vat_reviews'];
 const newFunctions=['tax_position_source_before_external_input(text,uuid)','save_finance_external_input_vat(uuid,jsonb,boolean)','review_finance_external_input_vat(uuid,uuid,uuid,text,text,boolean)','get_finance_tax_input_evidence(date)'];
 const protectedTables=['finance_expenses','finance_expense_tax_reviews','finance_expense_requests','finance_expense_request_items','finance_expense_audit','finance_expense_settlements','finance_expense_obligations','finance_expense_obligation_waivers','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_outgoing_wht_obligations','finance_cash_transactions','finance_cash_transaction_audit_events','finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit'];
 const provenance={tax_position_source:'055 replaces projection; 063 accepted body hash',tax_position_source_before_expense:'050 projection renamed by 055',tax_position_sync:'050',tax_position_can_view:'050',tax_position_can_manage:'050',tax_position_immutable:'050',current_user_can_manage_finance_tax_invoices:'039'};
 const functions=[...seen].sort().map(name=>{
  const f=all.get(name),fixture=before.functions.find(x=>x.signature===f.signature);assert.ok(fixture);
  assert.equal(f.definition_hash,fixture.definition_hash,name+' repository-derived definition');
  assert.equal(f.security_definer,fixture.security_definer);assert.deepEqual(f.config,fixture.config);
  return {signature:f.signature,repository_evidence:provenance[name],definition_security_config_match:true,expected_fixture_acl:fixture.acl,current_acl:f.acl,
   privilege_classification:f.acl===fixture.acl?'A':'B',privilege_reason:'063 verifies selected application-role EXECUTE access, not raw ACL/service_role grant provenance. Repository DDL neither grants nor revokes service_role; current default ACL is current-state evidence only.'};
 });
 const tables=readTables.map(name=>{
  const current=capture.catalog.find(t=>t.name===name),old=before.catalog.find(t=>t.name===name);
  if(!current)return {name,classification:'B',reason:'Capture omitted full user_profiles columns/constraints. Its id FK and active/role/tax permission fields are required; only relation security was captured.'};
  const difference=capture.original_064_preflight.catalog_differences.find(d=>(d.actual||d.expected).name===name);
  return {name,new_path_writes:writeTables.includes(name),ddl_touched:changedTables.includes(name),current_security:capture.relation_security.find(t=>t.name===name),current_policies:current.policies,current_triggers:current.triggers,
   compared_to_repository_fixture:!!old,changed_fields:difference?Object.keys(current).filter(k=>!isDeepStrictEqual(current[k],old?.[k])):[],
   classification:difference?'B':'A',reason:difference?'Raw ACL provenance is outside accepted 063 evidence; retain full difference. Source-provider schema differences require referenced-field/repository reconciliation; no blanket approval.':'Matches repository fixture contract'};
 });
 const special=['current_user_can_manage_finance_billable_charges','current_user_can_manage_finance_quotations','validate_finance_invoice_integrity'].map(name=>({name,called_by_064:seen.has(name),blocking:false,disposition:'Broader unresolved evidence only. Projection reads stored rows, not these mutation/permission functions; SELECT does not fire their DML triggers.'}));
 assert.ok(special.every(x=>!x.called_by_064));
 const absent=newTables.every(n=>!capture.catalog.some(t=>t.name===n))&&newFunctions.every(n=>!capture.all_public_function_definitions.some(f=>f.signature===n));assert.ok(absent);
 return {status:'STOP_SCOPED_SECURITY_EVIDENCE_GAP',capture_sha256:sha(raw),candidate_sha256:a.sha(),candidate_changed:false,
  broader_unresolved_differences:490,original_report:'scripts/tests/tax-064-reconciliation.json',
  changed_existing_functions:['tax_position_source(text,uuid) renamed then wrapped'],new_functions:newFunctions,new_tables:newTables,changed_tables:changedTables,
  runtime_existing_functions:functions,call_edges:edges,platform_dependencies:['auth.uid() identity','user_profiles(id,active,role,can_view_finance_tax_invoices,can_manage_finance_tax_invoices,can_issue_finance_tax_invoices)','PostgreSQL FK/sequence/default and advisory-lock semantics'],
  runtime_existing_tables:tables,new_path_write_tables:writeTables,protected_finance_tables:protectedTables,
  affected_tax_readers:['tax_filing_monthly_facts(date)','tax_filing_monthly_facts_before_expense(date)','tax_filing_pool(date,text)','get_finance_tax_filings(date)','get_finance_tax_position()'],
  special_functions:special,targets_absent:true,
  narrow_blocker:{objects:['tax_position_source(text,uuid)','finance_tax_source_revisions','finance_tax_position_facts'],reason:'These are directly renamed/wrapped or ALTERed by 064. Their service_role ACLs are not covered by accepted 063 or explicit repository grants. Current default privileges explain inheritance but do not establish prior accepted authorization.',not_proof_of_unauthorized_change:true},
  gate_regenerated:false,production_actions:[]};
}
if(require.main===module){const report=audit(),path='scripts/tests/tax-064-dependency-audit.json';if(process.argv.includes('--write'))fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(path,'utf8')),report);console.log(JSON.stringify({status:report.status,runtime_functions:report.runtime_existing_functions.length,runtime_tables:report.runtime_existing_tables.length,special_functions:report.special_functions,targets_absent:report.targets_absent,candidate_changed:false}));}
module.exports={audit};
