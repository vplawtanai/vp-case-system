/* eslint-disable @typescript-eslint/no-require-imports */
// Offline only. This module never opens a database connection or emits later gates.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process');
const prior=require('./unified-statement-contract.json'),{fingerprint}=require('./direct-money-documents-dry-run.cjs');
const {sha}=require('./direct-money-documents-artifacts.cjs'),gate=require('./revenue-distribution-artifacts.cjs');
const candidatePath='supabase/migrations/202607180071_add_executive_finance_read_contracts.sql';
const contractPath='scripts/tests/executive-finance-contract.json',preflightPath='scripts/sql/preflight_executive_finance_071.sql';
const created=['get_finance_cash_flow_summary','get_finance_receivables_summary','get_finance_general_payables_summary','get_finance_unpaid_participants_summary'];
const source=()=>fs.readFileSync(candidatePath,'utf8'),q=s=>"'"+s.replaceAll("'","''")+"'";
const hash=s=>`encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
function build(localPath,capturePath){
 const {manifestSha,...priorBody}=prior;assert.equal(fingerprint(priorBody),manifestSha);
 assert.equal(prior.candidateSha,'6b9bab9c80730d659ad5e06d0b227872aaea44782d1a789b7ec0be1add73ad96');
 const local=JSON.parse(fs.readFileSync(localPath)),approved=JSON.parse(fs.readFileSync(capturePath));
 const accepted=approved.baseline||approved;assert.equal(accepted.gate_pass,true);
 assert.equal(fingerprint(accepted.state),accepted.state_sha256);
 assert.equal(accepted.state_sha256,require('./direct-money-documents-dry-run-contract.json').approvedBaselineSha);
 const before=structuredClone(prior.after),evidence=[];
 // All previously reconciled post-070 contracts take precedence over fixtures.
 // This new dependency used to be outside that footprint. Reconcile its exact
 // definition against the original repository function, compiled locally.
 const name='current_user_can_manage_finance_quotations()',live=accepted.state.functions.find(f=>f.signature===name),fixture=local.before.functions.find(f=>f.signature===name);
 for(const key of ['definition','owner','security_definer','config'])assert.deepEqual(live[key],fixture[key],name+' unexplained '+key);
 before.functions[name]=fingerprint(live);
 evidence.push({object:name,definitionSource:'202607090001_create_finance_quotations.sql (unchanged current Invoice RLS guard)',securitySource:'Corrected PASS 066 capture. Existing ACL frozen; 071 cannot alter it. Preflight checks exact current state, not default privileges.',fingerprint:before.functions[name]});
 const view='finance_invoice_settlement_summary',current=accepted.state.catalog.find(t=>t.name===view),localView=local.before.catalog.find(t=>t.name===view);
 for(const key of ['owner','kind','columns','constraints','indexes','triggers','rls','force_rls','policies'])assert.deepEqual(current[key],localView[key],view+' unexplained '+key);
 before.catalog[view]=fingerprint(current);before.views[view]=local.before.views[view];
 assert.deepEqual(before.views[view].options,['security_invoker=true']);
 evidence.push({object:view,definitionSource:'202607180029_add_payment_allocation_reallocation.sql (unchanged settlement view; 021 SELECT grant)',securitySource:'Corrected PASS 066 capture catalog, unchanged owner/ACL. View definition compiled from exact repository SQL; 071 retains INVOKER semantics.',fingerprint:before.catalog[view]});
 assert.deepEqual(local.after.catalog,local.before.catalog,'071 must not alter existing table/view/security/index state');
 assert.deepEqual(local.after.views,local.before.views);
 assert.deepEqual(local.after.functions.filter(f=>!created.includes(f.name)),local.before.functions,'071 must not replace any function');
 const newFunctions=local.after.functions.filter(f=>created.includes(f.name));assert.equal(newFunctions.length,4);
 for(const f of newFunctions){assert.equal(f.owner,'postgres');assert.deepEqual(f.config,['search_path=public']);assert.equal(f.anon_execute,false);assert.equal(f.authenticated_execute,true);assert.equal(f.service_execute,true);assert.equal(f.security_definer,f.name!=='get_finance_receivables_summary');assert.match(f.definition,/STABLE/);}
 const body={version:1,candidateSha:sha(source()),accepted070:{candidateSha:prior.candidateSha,manifestSha:prior.manifestSha,postApply:'Operator confirmed exact applied-state, unchanged historical rows, empty differences; subsequently released and Human UAT completed.'},
  evidence,additionalEvidenceCaptureSha:sha(fs.readFileSync(capturePath)),broaderUnresolvedDifferences:490,
  scope:{created,changed:[],newTables:[],changedTables:[],functionNames:[...prior.scope.functionNames,'current_user_can_manage_finance_quotations',...created].sort(),
   tableNames:[...prior.scope.tableNames,view].sort(),rowTables:[...new Set([...prior.scope.rowTables,...prior.scope.newTables])].sort()},
  before,after:{...before,functions:{...before.functions,...Object.fromEntries(newFunctions.map(f=>[f.signature,fingerprint(f)]))}},
  appliedMigrationHashes:Object.fromEntries(cp.execFileSync('git',['ls-files','supabase/migrations'],{encoding:'utf8'}).trim().split('\n').map(p=>[p,sha(fs.readFileSync(p))]))};
 fs.writeFileSync(contractPath,JSON.stringify({...body,manifestSha:fingerprint(body)},null,2)+'\n');
}
function preflight(c){return `-- 071 SELECT-only Preflight. Run the complete static file in Supabase SQL Editor.
-- No candidate execution, business-row mutation or mutable RPC call.
-- Return compact hashes to approve the next gate; no JSON/CSV transfer required.
-- The broader 490 baseline differences remain unresolved OUTSIDE this scope.
WITH expected AS(select ${q(JSON.stringify(c.before))}::jsonb value),
actual AS materialized(${gate.captureSql(c)}),
diff AS(select (${gate.differences("(actual.value-'rows')",'expected.value')}) value from actual,expected),
checks AS(select * from (values
 ('candidate_sha256_exact',${hash(q(source()))}=${q(c.candidateSha)}),
 ('expected_contract_exact',(select ${hash('value')}=${q(fingerprint(c.before))} from expected)),
 ('dependency_functions_catalog_security_exact',(select value='[]'::jsonb from diff)),
 ('target_names_absent',not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in (${created.map(q).join(',')}))),
 ('invoice_settlement_invoker',exists(select 1 from pg_class where oid='public.finance_invoice_settlement_summary'::regclass and reloptions @> ARRAY['security_invoker=true'])),
 ('participant_full_settlement_contract',exists(select 1 from pg_constraint where conrelid='public.finance_payout_allocations'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (entitlement_id)'))
 ) checks(name,pass))
SELECT bool_and(coalesce(pass,false)) gate_pass,coalesce(jsonb_agg(name order by name) filter(where pass is distinct from true),'[]') failed_checks,
 ${q(c.candidateSha)} candidate_sha256,${q(c.manifestSha)} manifest_sha256,
 (select ${hash('value')} from actual) state_sha256,(select ${hash("value->'rows'")} from actual) historical_rows_sha256,
 (select value from diff) object_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section'='functions') function_differences,
 (select coalesce(jsonb_agg(v),'[]') from diff,jsonb_array_elements(value) v where v->>'section' in ('catalog','views')) catalog_differences,
 490 broader_unresolved_differences FROM checks;
`;}
function validate(){
 const c=JSON.parse(fs.readFileSync(contractPath)),{manifestSha,...body}=c;assert.equal(fingerprint(body),manifestSha);assert.equal(sha(source()),c.candidateSha);
 for(const [p,h] of Object.entries(c.appliedMigrationHashes))assert.equal(sha(fs.readFileSync(p)),h,p);
 assert.equal(fs.readFileSync(preflightPath,'utf8'),preflight(c));assert.ok(Buffer.byteLength(preflight(c))<250000,'SQL Editor size budget');return c;
}
if(require.main===module){const mode=process.argv[2];if(mode==='--build')build(process.argv[3],process.argv[4]);if(['--build','--write-preflight'].includes(mode))fs.writeFileSync(preflightPath,preflight(JSON.parse(fs.readFileSync(contractPath))));console.log('071 candidate / immutable predecessors / static SELECT-only Preflight PASS '+validate().candidateSha);}
module.exports={candidatePath,contractPath,preflightPath,created,source,build,preflight,validate};
