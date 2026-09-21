/* eslint-disable @typescript-eslint/no-require-imports */
// Generated from isolated PostgreSQL; never connects to Production.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base=require('./vp-distribution-artifacts.cjs');
const migrationPath='supabase/migrations/202607180058_fix_company_expense_declaration_authority.sql';
const manifestPath='scripts/tests/expense-two-flow-catalog.json';
const filenames={pre:'scripts/sql/preflight_company_expense_two_flow.sql',dry:'scripts/sql/dry_run_company_expense_two_flow.sql',verify:'scripts/sql/verify_company_expense_two_flow.sql'};
const source=()=>fs.readFileSync(migrationPath,'utf8'),sha=()=>createHash('sha256').update(source()).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const changed=['get_finance_expense_access','save_finance_expense_before_requests','save_finance_expense_request'];
const preserved=['expense_can_claim','expense_can_manage','expense_can_read','expense_account_allowed','get_finance_expense_accounts','set_finance_treasury_authority','review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement','prepare_finance_expense_payout','confirm_finance_expense_payout','confirm_finance_payout','cancel_finance_payout','get_finance_expense_obligations','tax_position_source','record_finance_paid_expense','expense_immutable','expense_request_child_guard','submit_finance_expense_request','save_finance_expense','submit_finance_expense','expense_document','get_finance_expense_parties'];
const functionSql=()=>`select proname as name,'public.'||proname||'('||oidvectortypes(proargtypes)||')' as signature,md5(prosrc) as hash,prosecdef as security_definer,provolatile as volatility,proconfig as config,
 has_function_privilege('authenticated',oid,'EXECUTE') authenticated_execute,has_function_privilege('anon',oid,'EXECUTE') anon_execute,
 exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
 from pg_proc where pronamespace='public'::regnamespace and proname in (${[...changed,...preserved].map(q).join(',')}) order by signature`;
const tables=['finance_expenses','finance_expense_audit','finance_expense_requests','finance_expense_request_items','finance_expense_request_audit','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations','finance_treasury_account_authorities'];
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",tables.map(q).join(','));
const protectedTables=[...tables,'finance_expense_claims','finance_payees','finance_payee_destinations','finance_payee_audit','finance_company_ledger','finance_compensation_allocations','finance_payments','finance_invoices','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_account_opening_balances','finance_tax_position_facts','finance_tax_filings','finance_tax_remittances','finance_outgoing_wht_obligations'];
const protectedCte=`protected as(select jsonb_build_object(${protectedTables.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) hashes)`;
const differences=(name,sql,expected,key)=>`${name}_actual as(${sql}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;
function workflow(){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(m.sha256,sha());assert.deepEqual(m.priorCatalog,m.catalog);
 const statement=post=>`-- ONE SELECT-only statement / ONE result row. No business RPC calls.
-- STOP on failed_checks. Compare preflight/post-apply upstream_evidence_hashes before frontend deployment.
-- The standalone post-apply statement cannot establish a prior data baseline; the rollback rehearsal can.
with ${differences('function',functionSql(),post?m.functions:m.prior,'signature')},${differences('catalog',catalogSql,m.catalog,'name')},${protectedCte},checks(name,passed) as(values
 ('exact_${post?'058':'057'}_and_preserved_functions',not exists(select 1 from function_differences)),
 ('unchanged_catalog',not exists(select 1 from catalog_differences)),
 ('private_and_rpc_permissions',${base.functionPrivileges(m.functions.filter(f=>changed.includes(f.name)),['get_finance_expense_access','save_finance_expense_request'])}),
 ('browser_direct_mutation_blocked',(select count(*)=${tables.length} and bool_and(relrowsecurity and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES') and not has_table_privilege('anon',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.expense058_before',true),'') is null or current_setting('vp.expense058_before',true)=(select hashes::text from protected)))
select (select jsonb_object_agg(name,passed is true) from checks) checks,
 (select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select bool_and(passed is true) from checks) company_expense_two_flow_${post?'verification':'preflight'}_pass,
 (select hashes from protected) upstream_evidence_hashes,
 nullif(current_setting('vp.expense058_before',true),'') is not null rehearsal_baseline_available,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 ${q(sha())} migration_058_sha256,current_setting('server_version_num')::int catalog_server_version_num;
`;
 const pre=statement(false),verify=statement(true);
 const dry=`-- Rehearse function replacements only; no sample business records are created.
BEGIN;
select set_config('vp.expense058_before',upstream_evidence_hashes::text,true),set_config('vp.expense058_preflight',company_expense_two_flow_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;
DO $gate$ BEGIN IF current_setting('vp.expense058_preflight')<>'true' THEN RAISE EXCEPTION '058 preflight failed; STOP'; END IF; END $gate$;
-- BEGIN EMBEDDED MIGRATION 058
${source()}-- END EMBEDDED MIGRATION 058
${verify}ROLLBACK;
`;
 return {[filenames.pre]:pre,[filenames.dry]:dry,[filenames.verify]:verify};
}
module.exports={workflow,filenames,migrationPath,manifestPath,source,sha,functionSql,catalogSql,changed,preserved};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('058 artifacts verified');}
