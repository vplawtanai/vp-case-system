/* eslint-disable @typescript-eslint/no-require-imports */
// Offline evidence reconciliation only. No connection, migration execution, or gate generation.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const candidate=require('./tax-064-historical-artifacts.cjs'),prior=require('./reimbursement-bank-artifacts.cjs');
const md5=s=>createHash('md5').update(s).digest('hex');
const sha=s=>createHash('sha256').update(s).digest('hex');
const canonical=s=>s.replace(/^public\./,'').replace(/\s/g,'');
function reconcile(path){
 const bytes=fs.readFileSync(path),capture=JSON.parse(bytes);
 assert.equal(capture.capture_kind,'unreviewed_current_post063_evidence');
 assert.equal(capture.migration_064_sha256,candidate.sha());assert.equal(capture.migration_063_sha256,prior.sha());
 const accepted=capture.accepted_063_verifier;
 assert.equal(accepted.migration_063_sha256,prior.sha());assert.equal(accepted.reimbursement_bank_verification_pass,true);
 for(const key of ['failed_checks','function_differences','catalog_differences'])assert.deepEqual(accepted[key],[]);
 const manifest=JSON.parse(fs.readFileSync('scripts/tests/employee-reimbursement-catalog.json','utf8'));
 const latest=JSON.parse(fs.readFileSync(prior.manifestPath,'utf8'));
 const contract=manifest.functions.map(f=>f.name==='confirm_finance_expense_payout'?latest.function:f);
 const full=new Map(capture.all_public_function_definitions.map(f=>[canonical(f.signature),f]));
 const verifiedFunctions=contract.map(f=>{
  const actual=full.get(canonical(f.signature));assert.ok(actual,f.signature);
  assert.equal(md5(actual.definition),actual.definition_hash,f.signature);
  const body=/\bAS (\$[\w]*\$)([\s\S]*?)\1/.exec(actual.definition);assert.ok(body,f.signature);
  assert.equal(md5(body[2]),f.hash,f.signature+' accepted body hash');
  assert.equal(actual.security_definer,f.security_definer);assert.deepEqual(actual.config,f.config);
  return {signature:f.signature,body_hash:f.hash,evidence:'Accepted 063 named-function contract; captured body hash independently matched. Raw ACL/service_role privileges are NOT in that contract.'};
 });
 const tables=manifest.catalog.map(t=>t.name);
 const expected=JSON.parse(fs.readFileSync(candidate.manifestPath,'utf8')).before;
 const differences=[];
 for(const [kind,key]of [['function','signature'],['catalog','name']]){
  const actualRows=capture[kind==='function'?'functions':'catalog'];
  const oldRows=expected[kind==='function'?'functions':'catalog'];
  const actualMap=new Map(actualRows.map(r=>[r[key],r])),oldMap=new Map(oldRows.map(r=>[r[key],r]));
  const equal=(a,b)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
  const observed=capture.original_064_preflight[kind+'_differences'];
  const calculated=[...new Set([...actualMap.keys(),...oldMap.keys()])].filter(k=>!equal(actualMap.get(k)||null,oldMap.get(k)||null)).sort();
  assert.deepEqual(observed.map(d=>(d.actual||d.expected)[key]).sort(),calculated);
  for(const d of observed){
   const name=(d.actual||d.expected)[key];assert.ok(equal(d.actual,actualMap.get(name)||null));assert.ok(equal(d.expected,oldMap.get(name)||null));
   const fields=[...new Set([...Object.keys(d.expected||{}),...Object.keys(d.actual||{})])].filter(k=>!equal(d.expected?.[k],d.actual?.[k])).sort();
   const covered=kind==='function'?contract.some(f=>canonical(f.signature)===canonical(name)):tables.includes(name);
   const reasons=[];
   if(!d.expected)reasons.push('Production object absent from synthetic fixture and outside the accepted 063 inventory; current existence is not historical acceptance evidence.');
   if(fields.includes('acl'))reasons.push('Accepted 063 verifier does not check raw ACLs, grantors, owners or service_role grants. Captured default privileges only explain a possible mechanism; they do not prove historical acceptance.');
   if(!covered&&fields.some(f=>f!=='acl'))reasons.push('Definition/schema/RLS/policy fields are outside the accepted 063 object inventory. No accepted historical comparator was supplied for these fields.');
   assert.ok(reasons.length,'Difference needs explicit classification: '+name);
   differences.push({kind,name,classification:'B',meaning:'Unexplained relative to supplied accepted evidence; NOT proof of an unauthorized Production change.',changed_fields:fields,accepted_063_object_in_scope:covered,reasons,expected_fixture:d.expected,current_production:d.actual});
  }
 }
 return {status:'STOP_UNEXPLAINED_DIFFERENCES',capture_sha256:sha(bytes),captured_at:capture.captured_at,
  candidate_064_sha256:candidate.sha(),migration_063_sha256:prior.sha(),candidate_changed:false,
  accepted_063_gate_sha256:sha(prior.workflow()[prior.filenames.verify]),
  accepted_063_evidence:{reported_pass:true,verified_function_count:verifiedFunctions.length,verified_functions:verifiedFunctions,table_count:tables.length,tables,
   catalog_evidence:'Embedded exact_062_catalog=true with empty catalog_differences; contract checks these 10 tables, excluding raw relation ACLs.',
   historical_rows:'No independent historical baseline: rehearsal_baseline_available=false. The reported true row check is conditional, not proof that historical rows were unchanged.',
   missing_prior_evidence:['raw ACLs including service_role and grant options','default privileges and role membership','broader Finance tables/functions outside the named 063 inventory']},
  summary:{function_differences:differences.filter(d=>d.kind==='function').length,catalog_differences:differences.filter(d=>d.kind==='catalog').length,A:0,B:differences.length,
   note:'A/B applies to whole differing objects: any unexplained field prevents A. Accepted unchanged function-body fields are recorded separately.'},differences};
}
function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
if(require.main===module){
 const report=reconcile(process.argv[2]||'/private/tmp/post063-baseline-for-064.json');
 const output='scripts/tests/tax-064-reconciliation.json';
 if(process.argv.includes('--write'))fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 else assert.deepEqual(JSON.parse(fs.readFileSync(output,'utf8')),report);
 console.log(JSON.stringify({status:report.status,...report.summary,verified_063_functions:report.accepted_063_evidence.verified_function_count,candidate_unchanged:!report.candidate_changed}));
}
module.exports={reconcile};
