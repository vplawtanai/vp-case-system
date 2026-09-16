/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local generation. Does not connect to any database.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180050_add_tax_position_foundation.sql';
const manifestPath='scripts/tests/tax-position-catalog.json';
const filenames={pre:'scripts/sql/preflight_tax_position_foundation.sql',dry:'scripts/sql/dry_run_tax_position_foundation.sql',verify:'scripts/sql/verify_tax_position_foundation.sql'};
const tables=['finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit','finance_outgoing_wht_obligations'];
const hooks=['finance_payments','finance_direct_money_receipts','finance_tax_invoices','finance_tax_correction_documents'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",tables.map(q).join(','));
const upstream=['finance_payments','finance_payment_wht_components','finance_payment_invoice_allocations','finance_payment_allocation_reallocations','finance_payment_audit_events',
 'finance_invoices','finance_invoice_items','finance_invoice_settlement_summary','finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events','finance_tax_invoice_source_coverages',
 'finance_tax_document_corrections','finance_tax_correction_lines','finance_tax_correction_documents','finance_tax_correction_audit_events','finance_receipts','finance_receipt_invoice_allocations',
 'finance_combined_documents','finance_document_counters','finance_cash_transactions','finance_cash_transaction_audit_events','finance_account_opening_balances','finance_account_opening_balance_audit_events',
 'finance_company_ledger','finance_compensation_allocations','finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit',
 'finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_payment_money_allocations'];
const protectedCte=`protected as(select jsonb_build_object(${upstream.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) as hashes)`;
const required=['money_allocation_admin','current_user_can_manage_finance_tax_invoices','finance_vat_treatment','post_confirmed_payment_to_finance_cash_transaction','transition_finance_direct_money_receipt','treasury_post_source','issue_finance_tax_correction'];
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql),prior=new Map();
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=49).sort()){
  const s=fs.readFileSync('supabase/migrations/'+file,'utf8');
  for(const m of s.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.includes(m[1]))for(const f of base.contractFacts(definition(s.slice(m.index),m[1])))prior.set(f.signature,f);
 }
 for(const name of required)assert.ok([...prior.values()].some(f=>f.name===name),name);
 const header='-- ONE SELECT-only statement / ONE row; no business RPCs. STOP on failed_checks.\n-- Treasury is already operational: Cash/Opening/Legacy counts are NOT zero-state invariants.\n-- Compare upstream_evidence_hashes across rehearsal/apply; run only with human approval.\n';
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_position_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const pre=header+`with ${base.functionCtes([...prior.values()])},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),
 ('050_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')}
 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in(${functions.map(f=>q(f.name)).join(',')}))
 and not exists(select 1 from pg_trigger where tgname like 'tax_position_%'))
 ) ${summary(false)}`;
 if(!fs.existsSync(manifestPath))return {[filenames.pre]:pre};
 const expected=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${base.functionCtes([...functions,...prior.values()])},${protectedCte},actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),
 ('new_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('private_and_rpc_permissions',${base.functionPrivileges(functions,['tax_position_can_view','tax_position_can_manage','get_finance_tax_position','materialize_finance_tax_source','transition_finance_tax_period','record_finance_incoming_wht_evidence'])}),
 ('browser_direct_mutation_blocked',(select count(*)=5 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('atomic_source_hooks',(select count(*)=4 and count(distinct tgrelid)=4 and bool_and(tgenabled='O' and tgdeferrable and tginitdeferred and not tgisinternal
 and tgrelid in(${hooks.map(t=>`${q(t)}::regclass`).join(',')})) from pg_trigger where tgfoid='tax_position_source_changed()'::regprocedure)),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.tax050_before',true),'') is null or current_setting('vp.tax050_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only schema rehearsal. No source materialization, filing or financial actions.\nselect set_config('vp.tax050_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n-- BEGIN EMBEDDED MIGRATION 050\n${sql}-- END EMBEDDED MIGRATION 050\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,catalogSql,tables};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('050 artifacts '+(process.argv.includes('--write')?'generated':'verified'));}
