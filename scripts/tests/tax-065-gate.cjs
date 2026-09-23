/* eslint-disable @typescript-eslint/no-require-imports */
// Offline validator/exporter ONLY. No database client, network or execution mode.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const prior=require('./tax-simple-artifacts.cjs'),contract=require('./tax-064-scoped-contract.json');
const {contractFacts,functionCtes}=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180065_use_authoritative_input_vat.sql';
const preflightPath='scripts/sql/preflight_authoritative_input_vat_065.sql';
const candidateSha='eea28bb1470b964547815c90ad4d0be0b22408da1978176b49ac194ad855a54e';
const accepted064Sha='6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e';
const cleanupReference='c6c82fed55fcaa249ee56b3bad24996e497577bcce7d37f005881950fe010662';
const digest=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const source=()=>fs.readFileSync(migrationPath,'utf8');
const helpers=['tax_expense_input_vat_status','tax_input_vat_evidence'];
const changed=['tax_position_source','save_finance_external_input_vat','get_finance_tax_input_evidence','tax_filing_monthly_facts','tax_filing_pool','tax_filing_assert'];
const extraFunctions=[
 ...contractFacts(definition(fs.readFileSync('supabase/migrations/202607180053_separate_tax_filing_monthly_facts.sql','utf8'),'tax_filing_assert')),
 ...contractFacts(definition(fs.readFileSync('supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql','utf8'),'tax_filing_pool').replace('function public.tax_filing_pool(','function public.tax_filing_allocation_pool_v1('))
];
const extraSignatures=extraFunctions.map(f=>f.signature.replace(/^public\./,''));
const signatures=[...new Set([...contract.after.functions.map(f=>f.signature),...extraSignatures])].sort();
const tableNames=contract.after.catalog.map(t=>t.name).sort();
// Include source data and money/audit rows, not just the smaller 064 historical hash set.
const rowTables=[...new Set([...tableNames,'finance_expense_claims','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_payees','finance_payee_destinations','finance_payee_audit','finance_cash_locations','finance_account_opening_balances','finance_account_opening_balance_audit_events'])].sort();
const claims=['0a7be430-a5b9-4be1-869d-0f8ef8fc4631','839db839-524e-4988-b7d0-686801338bf9','fb360ccc-2004-49bb-8541-3eb1dd079d4a'];
const bigC='cf09f3ac-c2d2-4218-8005-575416589229';
const rowSql=`select jsonb_build_object(${rowTables.map(t=>`${q(t)},(select jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text collate "C"),'[]')::text,'UTF8')),'hex')) from public.${t} r)`).join(',')}) hashes`;
const functionsSql=`select p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,md5(pg_get_functiondef(p.oid)) definition_hash,pg_get_functiondef(p.oid) definition,p.prosecdef security_definer,p.proconfig config,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and replace(p.oid::regprocedure::text,' ','') in (${list(signatures)}) order by 1`;
const triggerSql=`select c.relname table_name,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname in (${list(tableNames)}) order by c.relname,t.tgname`;
function differences(name,sql,expected,key){return `${name}_actual as (${sql}),${name}_expected as (select value v from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as (select e.v expected,to_jsonb(a) actual from ${name}_actual a full join ${name}_expected e on to_jsonb(a)->>${q(key)}=e.v->>${q(key)} where to_jsonb(a) is distinct from e.v)`;}
function validateCandidate(){
 assert.equal(digest(source()),candidateSha,'065 candidate changed; STOP');
 assert.equal(prior.sha(),accepted064Sha,'Applied 064 changed; STOP');
 assert.equal(contract.sha256,accepted064Sha);assert.equal(contract.broader_unresolved_differences,490);
 assert.equal(require('./tax-064-reconciliation.json').summary.B,490);
 const names=contractFacts(source()).map(f=>f.name).sort();assert.deepEqual(names,[...helpers,...changed].sort());
 // 065 is function-only. Reject a silently broadened candidate even before export.
 assert.doesNotMatch(source(),/\b(?:alter|create|drop)\s+(?:table|policy|role|schema|trigger|index)\b/i);
 assert.doesNotMatch(source(),/alter default privileges/i);
 return candidateSha;
}
function preflight(manifest=contract){
 validateCandidate();
 const extraCtes=functionCtes(extraFunctions).replaceAll('expected_functions','extra_expected_functions').replaceAll('function_facts','extra_function_facts').replaceAll('function_differences','extra_function_differences');
 const cleanChecks=['finance_external_input_vat','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_position_audit','finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit'].map(t=>`not exists(select 1 from public.${t} r where strpos(to_jsonb(r)::text,'5647891231236')>0 or strpos(to_jsonb(r)::text,'บริษัท UAT ผู้ขาย จำกัด')>0)`).join(' and ');
 return `-- 065 SELECT-only Preflight + FRESH POST-CLEANUP baseline capture. ONE statement.
-- Validate/export with: node scripts/tests/tax-065-gate.cjs print-preflight
-- Save the ENTIRE result JSON (including baseline) for the later manual gates.
-- This statement does not run 065, materialize sources, or write application rows.
-- Current row fingerprints are captured NOW, never copied from the pre-cleanup baseline.
-- The older 490 broader differences remain unresolved; this is dependency-scoped.
with ${differences('accepted_function',prior.functionSql,manifest.after.functions,'signature')},
${differences('catalog',prior.catalogSql,manifest.after.catalog,'name')},
${extraCtes},
functions_current as (${functionsSql}),
triggers_current as (${triggerSql}),
profile_current as (${prior.profileSecuritySql}),
defaults_current as (${prior.defaultsSql}),
history as (${rowSql}),
source_rows as (
 select e.id,to_jsonb(e) expense,to_jsonb(r) tax_review from public.finance_expenses e left join lateral
  (select * from public.finance_expense_tax_reviews x where x.expense_id=e.id order by revision desc limit 1) r on true
 where e.id in (${list([bigC,...claims])})
),
contract_ready as (select not exists(select 1 from accepted_function_differences) and not exists(select 1 from extra_function_differences) functions_exact),
-- Only execute the existing, verified pure projections; never any save/review/sync RPC.
monthly as (select case when functions_exact then public.tax_filing_monthly_facts(date '2026-09-01') end facts,
 case when functions_exact then public.tax_filing_allocation_pool_v1(date '2026-09-01','wht_natural') end wht_natural,
 case when functions_exact then public.tax_filing_allocation_pool_v1(date '2026-09-01','wht_juristic') end wht_juristic from contract_ready),
checks(name,passed) as (values
 ('candidate_sha256',encode(sha256(convert_to(${q(source())},'UTF8')),'hex')=${q(candidateSha)}),
 ('finance_owner_session',current_user='postgres'),
 ('accepted_post064_functions_exact',not exists(select 1 from accepted_function_differences)),
 ('accepted_post064_catalog_security_exact',not exists(select 1 from catalog_differences)),
 ('additional_filing_dependencies_exact',not exists(select 1 from extra_function_differences)),
 ('additional_filing_security',(select count(*)=2 and bool_and(owner='postgres' and security_definer and config=array['search_path=public']
  and has_function_privilege('postgres',signature,'EXECUTE') and has_function_privilege('service_role',signature,'EXECUTE')
  and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'))
  from functions_current where signature in (${list(extraSignatures)}))),
 ('profile_security_preserved',(select to_jsonb(p) from profile_current p)=${q(JSON.stringify(manifest.profile_security))}::jsonb),
 ('profile_required_fields',(select count(*)=6 from pg_attribute where attrelid='public.user_profiles'::regclass and not attisdropped and ((attname='id' and atttypid='uuid'::regtype) or (attname='role' and atttypid in ('text'::regtype,'varchar'::regtype)) or (attname in ('active','can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices') and atttypid='boolean'::regtype)))),
 ('immutability_and_integrity_triggers_enabled',not exists(select 1 from triggers_current where enabled<>'O')),
 ('065_new_helpers_absent',not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in (${list(helpers)}))),
 ('uat_dataset_absent',${cleanChecks}),
 ('big_c_authoritative_vat_preserved',(select count(*)=1 and bool_and(expense->>'vendor_name'='Big C' and expense->>'status'='accepted'
  and (expense->>'gross_amount')::numeric=300 and tax_review->>'vat_state'='exists' and (tax_review->>'vat_base')::numeric=280.37
  and (tax_review->>'vat_amount')::numeric=19.63 and (tax_review->>'vat_rate')::numeric=7 and tax_review->>'eligibility'<>'ineligible') from source_rows where id=${q(bigC)}::uuid)),
 ('three_claims_without_explicit_vat',(select count(*)=3 and bool_and((expense->>'origin'='employee_claim' and expense->>'status'='accepted'
  and (tax_review is null or tax_review->>'vat_state'='none' or (tax_review->>'vat_amount')::numeric=0)
  and (expense->>'vat_awareness'<>'yes' or tax_review->>'vat_state'='none' or (tax_review->>'vat_amount')::numeric=0)) is true)
  from source_rows where id<>${q(bigC)}::uuid)),
 ('post_cleanup_vat_totals',(select (facts->>'output_vat')::numeric=700 and (facts->>'reviewed_input_vat')::numeric=0 from monthly)),
 ('fresh_history_captured',(select count(*)=${rowTables.length} from history h,jsonb_object_keys(h.hashes))),
 ('existing_table_access',(select bool_and(has_table_privilege('postgres','public.'||name,'SELECT')) from unnest(array[${list(rowTables)}]) name)),
 ('new_helper_platform_access',has_schema_privilege('postgres','public','CREATE') and has_schema_privilege('postgres','auth','USAGE') and has_function_privilege('postgres','auth.uid()','EXECUTE'))
),
baseline as (select jsonb_build_object(
 'baseline_kind','post_cleanup_live_capture_for_065','captured_at',statement_timestamp(),'database',current_database(),
 'server_version_num',current_setting('server_version_num'),'migration_sha256',${q(candidateSha)},'accepted_064_sha256',${q(accepted064Sha)},
 'operator_reported_cleanup_preflight_sha256',${q(cleanupReference)},
 'historical_hashes',(select hashes from history),
 'functions',(select jsonb_agg(to_jsonb(f) order by signature) from functions_current f),
 'catalog',(select jsonb_agg(to_jsonb(c) order by name) from catalog_actual c),
 'triggers',(select jsonb_agg(to_jsonb(t) order by table_name,name) from triggers_current t),
 'profile_security',(select to_jsonb(p) from profile_current p),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d) order by owner,schema,object_type),'[]') from defaults_current d),
 'september_sources',(select jsonb_agg(to_jsonb(s) order by id) from source_rows s),
 'september_facts',(select facts from monthly),'wht_natural',(select wht_natural from monthly),'wht_juristic',(select wht_juristic from monthly),
 'broader_unresolved_differences',490,'broader_evidence','scripts/tests/tax-064-reconciliation.json'
 ) value)
select (select bool_and(passed is true) from checks) gate_pass,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select jsonb_object_agg(name,passed) from checks) checks,
 ${q(candidateSha)} migration_sha256,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from accepted_function_differences d)||
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from extra_function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 (select hashes from history) historical_hashes,
 null::boolean historical_rows_unchanged,
 (select value from baseline) baseline,
 (select encode(sha256(convert_to(value::text,'UTF8')),'hex') from baseline) baseline_sha256,
 490 broader_unresolved_differences;
`;
}
function validateArtifacts(){validateCandidate();const sql=preflight();assert.equal(fs.readFileSync(preflightPath,'utf8'),sql,'Stale 065 Preflight artifact; STOP');require('./tax-065-dry-run.cjs').validateTemplate();require('./tax-065-verify.cjs').validateTemplate();return candidateSha;}
module.exports={migrationPath,preflightPath,candidateSha,accepted064Sha,cleanupReference,source,preflight,validateCandidate,validateArtifacts,rowTables,rowSql,functionsSql,claims,bigC,extraFunctions,triggerSql,tableNames,signatures};
if(require.main===module){
 const [mode,...rest]=process.argv.slice(2);
 assert.ok(['validate','print-preflight','write-preflight','print-dry-run','print-verify'].includes(mode),'Offline only: validate|print-preflight|write-preflight or print-dry-run|print-verify --baseline-sha <sha> --captured-at <exact original timestamp>');
 if(mode==='print-dry-run'||mode==='print-verify'){
  assert.equal(rest.length,4);assert.equal(rest[0],'--baseline-sha');assert.equal(rest[2],'--captured-at');
  validateArtifacts();process.stdout.write(require(mode==='print-dry-run'?'./tax-065-dry-run.cjs':'./tax-065-verify.cjs').generate({baselineSha:rest[1],capturedAt:rest[3]}));
 }else{
  assert.equal(rest.length,0);
  if(mode==='write-preflight'){fs.writeFileSync(preflightPath,preflight());console.log('065 SELECT-only Preflight generated locally. No database connection.');}
  else {validateArtifacts();if(mode==='print-preflight')process.stdout.write(preflight());else console.log('065 candidate/artifacts PASS; SHA-256 '+candidateSha+'; post-cleanup baseline captured when the SELECT runs. No database connection.');}
 }
}
