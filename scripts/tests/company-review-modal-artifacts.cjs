/* eslint-disable @typescript-eslint/no-require-imports */
// Uses the established 059 catalog and function inventory; isolated fixtures generate 060 evidence.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const prior=require('./company-tax-review-artifacts.cjs');
const migrationPath='supabase/migrations/202607180060_add_company_purchase_request_flow.sql';
const manifestPath='scripts/tests/company-review-modal-catalog.json';
const filenames={pre:'scripts/sql/preflight_company_review_modal.sql',dry:'scripts/sql/dry_run_company_review_modal.sql',verify:'scripts/sql/verify_company_review_modal.sql'};
const source=()=>fs.readFileSync(migrationPath,'utf8'),sha=()=>createHash('sha256').update(source()).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const changed=['save_finance_expense_request','expense_document','review_finance_expense','get_finance_expense_access','decide_finance_expense_settlement','expense_integrity','expense_payout_choice','confirm_finance_expense_payout','payout_assert','get_finance_expense_obligations'];
const added=['company_purchase_tax_choices','company_purchase_request_declaration','review_finance_company_purchase_request','company_purchase_request_recipient','payout_assert',...['save_finance_expense_request','expense_document','review_finance_expense','get_finance_expense_access'].map(n=>n+'_before_purchase_flow')];
const functionSql=()=>prior.functionSql().replace(') order by signature',','+added.map(q).join(',')+') order by signature'),catalogSql=prior.catalogSql;
const tables=['finance_expenses','finance_expense_audit','finance_expense_requests','finance_expense_request_items','finance_expense_request_audit','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations','finance_expense_claims','finance_payees','finance_payee_destinations','finance_payee_audit','finance_company_ledger','finance_compensation_allocations','finance_payments','finance_invoices','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_account_opening_balances','finance_tax_position_facts','finance_tax_source_revisions','finance_tax_filings','finance_tax_remittances','finance_outgoing_wht_obligations'];
const differences=(name,sql,expected,key)=>`${name}_actual as(${sql}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;
function workflow(){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8')),before=JSON.parse(fs.readFileSync(prior.manifestPath,'utf8'));assert.equal(m.sha256,sha());
 const statement=post=>`-- ONE SELECT-only statement / ONE result row. No business RPC calls.
-- Compare upstream hashes with preflight. Standalone verification cannot establish the prior baseline.
with ${differences('function',functionSql(),post?m.functions:m.prior,'signature')},${differences('catalog',catalogSql,post?m.catalog:before.catalog,'name')},
protected as(select jsonb_build_object(${tables.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) hashes),
checks(name,passed) as(values
 ('exact_${post?'060':'059'}_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_catalog_and_policies',not exists(select 1 from catalog_differences)),
 ('calculator_private',(select not authenticated_execute and not anon_execute and not public_execute from function_actual where name='company_expense_tax_calculation')),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.expense060_before',true),'') is null or current_setting('vp.expense060_before',true)=(select hashes::text from protected)))
select (select jsonb_object_agg(name,passed is true) from checks) checks,
 (select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select bool_and(passed is true) from checks) company_purchase_request_${post?'verification':'preflight'}_pass,
 (select hashes from protected) upstream_evidence_hashes,
 nullif(current_setting('vp.expense060_before',true),'') is not null rehearsal_baseline_available,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) catalog_differences,
 ${q(sha())} migration_060_sha256,current_setting('server_version_num')::int catalog_server_version_num;
`;
 const pre=statement(false),verify=statement(true);
 const dry=`-- Rollback-only catalog/function rehearsal. No sample business transactions.
BEGIN;
select set_config('vp.expense060_before',upstream_evidence_hashes::text,true),set_config('vp.expense060_preflight',company_purchase_request_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;
DO $gate$ BEGIN IF current_setting('vp.expense060_preflight')<>'true' THEN RAISE EXCEPTION '060 preflight failed; STOP'; END IF; END $gate$;
-- BEGIN EMBEDDED MIGRATION 060
${source()}-- END EMBEDDED MIGRATION 060
${verify}ROLLBACK;
`;
 return {[filenames.pre]:pre,[filenames.dry]:dry,[filenames.verify]:verify};
}
module.exports={workflow,filenames,migrationPath,manifestPath,source,sha,functionSql,catalogSql,changed};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('060 artifacts verified');}
