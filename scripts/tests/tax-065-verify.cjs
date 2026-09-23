/* eslint-disable @typescript-eslint/no-require-imports */
// Offline SELECT-only exporter. No SQL execution or database client.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const a=require('./tax-065-gate.cjs'),prior=require('./tax-simple-artifacts.cjs'),contract=require('./tax-064-scoped-contract.json');
const {contractFacts,functionCtes}=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const artifactPath='scripts/sql/verify_authoritative_input_vat_065.sql';
const priorPath='scripts/tests/tax-065-prior-functions.json';
const hashToken='__APPROVED_BASELINE_SHA256__',timeToken='__APPROVED_CAPTURED_AT__';
const q=s=>"'"+s.replaceAll("'","''")+"'",list=xs=>xs.map(q).join(',');
const md5=s=>createHash('md5').update(s).digest('hex');
function priorDefinitions(){
 const defs=JSON.parse(fs.readFileSync(priorPath,'utf8'));
 const expected=[...contract.after.functions,...require('./tax-simple-catalog.json').before.functions];
 const changed=contractFacts(a.source()).filter(f=>!['tax_expense_input_vat_status','tax_input_vat_evidence'].includes(f.name)).map(f=>f.signature.replace(/^public\./,'')).sort();
 assert.deepEqual(defs.map(f=>f.signature).sort(),changed);
 for(const f of defs){assert.equal(md5(f.definition),f.definition_hash);assert.equal(f.definition_hash,expected.find(e=>e.signature===f.signature)?.definition_hash,'Unaccepted prior definition: '+f.signature);}
 return defs;
}
// Translate ONLY the known old 055 read model into a SELECT expression. No old
// function is installed/executed, and no current business row is substituted.
function oldMonthlySql(){
 const file='supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql';
 const sql=definition(fs.readFileSync(file,'utf8'),'tax_filing_monthly_facts');
 const aggregate=/ select ([\s\S]*?) into known\n ([\s\S]*?);\n return/.exec(sql);
 const returned=/ return (result\|\|[\s\S]*?);\nend;/.exec(sql);assert.ok(aggregate&&returned);
 const known=`select ${aggregate[1]} known\n ${aggregate[2]}`.replaceAll('p_month',"date '2026-09-01'");
 const result=returned[1].replace(/^result/,"public.tax_filing_monthly_facts_before_expense(date '2026-09-01')");
 return {known,result};
}
function diff(name,sql,expected,key){return `${name}_actual as (${sql}),${name}_expected as (select value v from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as (select e.v expected,to_jsonb(a) actual from ${name}_actual a full join ${name}_expected e on to_jsonb(a)->>${q(key)}=e.v->>${q(key)} where to_jsonb(a) is distinct from e.v)`;}
function generate({baselineSha=hashToken,capturedAt=timeToken,manifest=contract}={}){
 a.validateCandidate();const old=priorDefinitions(),legacy=oldMonthlySql();
 if(baselineSha!==hashToken)assert.match(baselineSha,/^[0-9a-f]{64}$/);
 if(capturedAt!==timeToken)assert.match(capturedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
 const candidateFns=contractFacts(a.source()),created=candidateFns.filter(f=>['tax_expense_input_vat_status','tax_input_vat_evidence'].includes(f.name));
 const allocationCtes=functionCtes(a.extraFunctions.filter(f=>f.name==='tax_filing_allocation_pool_v1')).replaceAll('expected_functions','allocation_expected_functions').replaceAll('function_facts','allocation_function_facts').replaceAll('function_differences','allocation_function_differences');
 const normalizedSql=`select signature,owner,coalesce(p.v->>'definition_hash',a.definition_hash) definition_hash,security_definer,config,acl from (${prior.functionSql}) a left join prior_definitions p on p.v->>'signature'=a.signature`;
 return `-- 065 SELECT-only Post-Apply Verifier. ONE statement; no temporary objects.
-- Approved baseline SHA: ${baselineSha}
-- Approved original captured_at: ${capturedAt}
-- Check installed 065 definitions separately. Reconstruct the ORIGINAL baseline
-- in memory by restoring only the six approved prior definition strings and the
-- old read-only monthly summary format. Current rows/security remain untouched.
-- SHA equality binds every historical fingerprint, source row, owner/ACL/RLS,
-- trigger/default and unchanged dependency to the SAME approved pre-apply state.
-- A new/fresh baseline is NEVER accepted on mismatch. Broader 490 remain unresolved.
with prior_definitions as (select value v from jsonb_array_elements(${q(JSON.stringify(old))}::jsonb)),
${functionCtes(candidateFns)},
${allocationCtes},
${diff('accepted_function',normalizedSql,manifest.after.functions,'signature')},
${diff('catalog',prior.catalogSql,manifest.after.catalog,'name')},
functions_current as (${a.functionsSql}),
functions_before as (select f.signature,case when p.v is null then to_jsonb(f) else
 to_jsonb(f)||jsonb_build_object('definition',p.v->'definition','definition_hash',p.v->'definition_hash') end value
 from functions_current f left join prior_definitions p on p.v->>'signature'=f.signature),
triggers_current as (${a.triggerSql}),profile_current as (${prior.profileSecuritySql}),defaults_current as (${prior.defaultsSql}),
history as (${a.rowSql}),
source_rows as (select e.id,to_jsonb(e) expense,to_jsonb(r) tax_review from public.finance_expenses e left join lateral
 (select * from public.finance_expense_tax_reviews x where x.expense_id=e.id order by revision desc limit 1) r on true
 where e.id in (${list([a.bigC,...a.claims])})),
functions_ready as (select not exists(select 1 from function_differences) and not exists(select 1 from allocation_function_differences)
 and not exists(select 1 from accepted_function_differences) and not exists(select 1 from catalog_differences) ready),
legacy_known as (${legacy.known}),
legacy_monthly as (select case when ready then ${legacy.result} end facts from legacy_known,functions_ready),
monthly as (select case when ready then public.tax_filing_monthly_facts(date '2026-09-01') end facts,
 case when ready then public.tax_filing_allocation_pool_v1(date '2026-09-01','wht_natural') end wht_natural,
 case when ready then public.tax_filing_allocation_pool_v1(date '2026-09-01','wht_juristic') end wht_juristic,
 case when ready then public.tax_filing_pool(date '2026-09-01','wht_natural') end current_wht_natural,
 case when ready then public.tax_filing_pool(date '2026-09-01','wht_juristic') end current_wht_juristic from functions_ready),
filing_integrity as (select case when ready then
 (select coalesce(jsonb_agg(jsonb_build_object('id',id,'assertion',public.tax_filing_assert(id)::text) order by id),'[]') from public.finance_tax_filings)
 end evidence from functions_ready),
reconstructed_baseline as (select jsonb_build_object(
 'baseline_kind','post_cleanup_live_capture_for_065','captured_at',${q(capturedAt)}::text,'database',current_database(),
 'server_version_num',current_setting('server_version_num'),'migration_sha256',${q(a.candidateSha)},'accepted_064_sha256',${q(a.accepted064Sha)},
 'operator_reported_cleanup_preflight_sha256',${q(a.cleanupReference)},
 'historical_hashes',(select hashes from history),
 'functions',(select jsonb_agg(value order by signature) from functions_before),
 'catalog',(select jsonb_agg(to_jsonb(c) order by name) from catalog_actual c),
 'triggers',(select jsonb_agg(to_jsonb(t) order by table_name,name) from triggers_current t),
 'profile_security',(select to_jsonb(p) from profile_current p),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(d) order by owner,schema,object_type),'[]') from defaults_current d),
 'september_sources',(select jsonb_agg(to_jsonb(s) order by id) from source_rows s),
 'september_facts',(select facts from legacy_monthly),'wht_natural',(select wht_natural from monthly),'wht_juristic',(select wht_juristic from monthly),
 'broader_unresolved_differences',490,'broader_evidence','scripts/tests/tax-064-reconciliation.json') value),
binding as (select encode(sha256(convert_to(value::text,'UTF8')),'hex') actual_sha from reconstructed_baseline),
checks(name,passed) as (values
 ('candidate_sha256',encode(sha256(convert_to(${q(a.source())},'UTF8')),'hex')=${q(a.candidateSha)}),
 ('finance_owner_session',current_user='postgres'),
 ('exact_installed_065_functions',not exists(select 1 from function_differences)),
 ('unchanged_dependency_functions',not exists(select 1 from allocation_function_differences) and not exists(select 1 from accepted_function_differences)),
 ('catalog_and_security_preserved',not exists(select 1 from catalog_differences)),
 ('exact_approved_baseline_matched',(select actual_sha=${q(baselineSha)} from binding)),
 ('new_helpers_exact_namespace',(select count(*)=2 from pg_proc where pronamespace='public'::regnamespace and proname in ('tax_expense_input_vat_status','tax_input_vat_evidence'))),
 ('new_helpers_explicit_security',(select count(*)=2 and bool_and(pg_get_userbyid(proowner)='postgres' and prosecdef and proconfig=array['search_path=public']
  and proacl::text='{postgres=X/postgres,service_role=X/postgres}' and has_function_privilege('service_role',oid,'EXECUTE')
  and not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('authenticated',oid,'EXECUTE'))
  from pg_proc where oid in (${created.map(f=>`to_regprocedure(${q(f.signature)})`).join(',')}))),
 ('immutability_triggers_enabled',not exists(select 1 from triggers_current where enabled<>'O')),
 ('existing_filing_integrity',(select evidence is not null and jsonb_array_length(evidence)=(select count(*) from public.finance_tax_filings) from filing_integrity)),
 ('september_vat_expected',(select (facts->>'output_vat')::numeric=700 and (facts->>'input_vat')::numeric=19.63
  and (facts->>'reviewed_input_vat')::numeric=19.63 and (facts->>'net_vat')::numeric=680.37 and facts->'input_vat_complete'='true'::jsonb
  and facts->'unresolved_input_sources'='[]'::jsonb and jsonb_array_length(facts->'input_sources')=1
  and facts#>>'{input_sources,0,source_type}'='expense' and facts#>>'{input_sources,0,source_id}'=${q(a.bigC)} from monthly)),
 ('three_no_vat_claims_ignored',(select case when ready then
  (select bool_and(public.tax_position_source('expense',id::uuid)->'lines'='[]'::jsonb) from unnest(array[${list(a.claims)}]) id) else false end from functions_ready)),
 ('uat_external_absent',not exists(select 1 from public.finance_external_input_vat where invoice_number='5647891231236' or vendor='บริษัท UAT ผู้ขาย จำกัด')),
 ('wht_unchanged',(select current_wht_natural=wht_natural and current_wht_juristic=wht_juristic from monthly))
)
select (select bool_and(passed is true) from checks) gate_pass,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select jsonb_object_agg(name,passed) from checks) checks,
 ${q(a.candidateSha)} migration_sha256,${q(baselineSha)} approved_baseline_sha256,${q(capturedAt)} approved_captured_at,
 (select actual_sha from binding) reconstructed_preapply_baseline_sha256,
 (select actual_sha=${q(baselineSha)} from binding) exact_approved_baseline_matched,
 -- A hash mismatch cannot prove whether rows or another bound object drifted.
 -- Fail the gate and report unknown, NEVER assume the new state is an approved baseline.
 (select case when actual_sha=${q(baselineSha)} then true else null end from binding) historical_rows_unchanged,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d)||
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from allocation_function_differences d)||
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from accepted_function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 (select facts from monthly) september_facts,
 (select hashes from history) current_historical_hashes,
 490 broader_unresolved_differences;
`;
}
function validateTemplate(){a.validateCandidate();priorDefinitions();assert.equal(fs.readFileSync(artifactPath,'utf8'),generate(),'Stale 065 SELECT-only verifier; STOP');}
module.exports={artifactPath,priorPath,generate,validateTemplate,priorDefinitions,oldMonthlySql,hashToken,timeToken};
if(require.main===module){assert.deepEqual(process.argv.slice(2),['--write']);fs.writeFileSync(artifactPath,generate());console.log('065 SELECT-only Post-Apply Verifier generated offline.');}
