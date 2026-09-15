/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local artifact generator. No connections or credentials.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180048_add_payable_entitlement_foundation.sql';
const manifestPath='scripts/tests/payable-catalog.json';
const filenames={pre:'scripts/sql/preflight_payable_entitlement_foundation.sql',dry:'scripts/sql/dry_run_payable_entitlement_foundation.sql',verify:'scripts/sql/verify_payable_entitlement_foundation.sql'};
const tables=['finance_payable_entitlement_sources','finance_payable_entitlements','finance_payable_entitlement_audit'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'].map(q).join(','));
const upstream=['finance_payments','finance_payment_invoice_allocations','finance_payment_effective_invoice_allocations','finance_payment_wht_components','finance_payment_allocation_reallocations','finance_payment_audit_events',
 'finance_invoices','finance_invoice_items','finance_invoice_audit_events','finance_invoice_settlement_summary','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events',
 'finance_company_ledger','finance_compensation_batches','finance_compensation_allocations','finance_receipts','finance_receipt_invoice_allocations','finance_receipt_audit_events','finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events',
 'finance_combined_documents','finance_combined_document_audit_events','finance_document_counters','finance_payment_money_allocations','finance_payment_money_allocation_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_direct_money_receipts','finance_direct_money_receipt_audit'];
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql),prior=new Map();
 const required=new Set(['money_allocation_admin','current_user_can_view_finance_payments','vp_received_lock','vp_received_frozen','vp_distribution_choices','vp_distribution_amount_choices_v1','vp_formula_calculate','vp_formula_result_guard','vp_distribution_immutable','vp_distribution_validate','transition_finance_vp_distribution','save_finance_vp_received_distribution']);
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=47).sort()){
  const source=fs.readFileSync('supabase/migrations/'+file,'utf8');
  for(const match of source.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.has(match[1])){
   for(const f of base.contractFacts(definition(source.slice(match.index),match[1])))prior.set(f.signature,f);
  }
 }
 for(const name of required)assert.ok([...prior.values()].some(f=>f.name===name),`Missing upstream contract ${name}`);
 const prerequisites=`${base.functionCtes([...prior.values()]).replaceAll('function_differences','prerequisite_differences').replaceAll('function_facts','prerequisite_facts').replaceAll('expected_functions','prerequisite_functions')}`;
 const protectedCte=`protected as(select jsonb_build_object(${upstream.map(table=>`${q(table)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${table} r)`).join(',\n')}) as hashes)`;
 const summary=post=>`select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payable_entitlement_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from prerequisite_differences d) as prerequisite_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d)":"'[]'::jsonb"} as function_differences,
 jsonb_build_object('finalized_distributions',(select count(*) from finance_vp_revenue_distributions where status='finalized'),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ${post?tables.map(t=>`,${q(t)},(select count(*) from public.${t})`).join(''):''}) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;\n`;
 const header='-- ONE SELECT-only statement / ONE row. No application RPC calls.\n-- Stop on any failed check. Compare upstream_evidence_hashes before/after apply.\n-- No backfill. Existing external/name-only and aggregate-only distributions require separate identity/evidence resolution.\n';
 const pre=header+`with ${prerequisites},${protectedCte},checks(name,passed) as(values
 ('exact_upstream_functions',not exists(select 1 from prerequisite_differences)),
 ('048_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')}
  and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in(${functions.map(f=>q(f.name)).join(',')}))
  and not exists(select 1 from pg_trigger where tgrelid='public.finance_vp_revenue_distributions'::regclass and tgname like 'payable_%'))
 ) ${summary(false)}`;
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${prerequisites},${base.functionCtes(functions)},${protectedCte},actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
  from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('exact_functions',not exists(select 1 from function_differences)),
 ('upstream_functions_unchanged',not exists(select 1 from prerequisite_differences)),
 ('private_and_rpc_permissions',${base.functionPrivileges(functions,['ensure_finance_payable_entitlements','get_finance_payable_entitlements'])}),
 ('browser_direct_mutation_blocked',(select count(*)=3 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
  and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
  and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a where a.grantee=0))
  from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('new_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.payables048_before',true),'') is null or current_setting('vp.payables048_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only schema rehearsal. No business RPC, synthetic business rows or historical materialization.\nselect set_config('vp.payables048_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n-- BEGIN EMBEDDED MIGRATION 048\n${sql}-- END EMBEDDED MIGRATION 048\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,catalogSql};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('048 local artifacts '+(process.argv.includes('--write')?'generated':'verified'));}
