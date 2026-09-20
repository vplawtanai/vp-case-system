/* eslint-disable @typescript-eslint/no-require-imports */
// Reproducible catalog/function evidence from isolated PostgreSQL only.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base=require('./vp-distribution-artifacts.cjs');
const migrationPath='supabase/migrations/202607180056_add_expense_request_foundation.sql';
const manifestPath='scripts/tests/expense-request-catalog.json';
const filenames={pre:'scripts/sql/preflight_expense_request_foundation.sql',dry:'scripts/sql/dry_run_expense_request_foundation.sql',verify:'scripts/sql/verify_expense_request_foundation.sql'};
const tables=['finance_expense_requests','finance_expense_request_items','finance_expense_request_audit'];
const source=()=>fs.readFileSync(migrationPath,'utf8'),sha=()=>createHash('sha256').update(source()).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const created=()=>[...source().matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(m=>m[1]);
const renamed=()=>[...source().matchAll(/alter function public\.(\w+)\([^;]+?rename to (\w+);/g)].map(m=>({from:m[1],to:m[2]}));
const preserved=['expense_can_claim','expense_can_manage','expense_can_read','review_finance_expense','review_finance_expense_tax','decide_finance_expense_settlement','prepare_finance_expense_payout','confirm_finance_expense_payout','get_finance_expense_obligations','tax_position_source','record_finance_paid_expense'];
const functionSql=names=>`select proname as name,'public.'||proname||'('||oidvectortypes(proargtypes)||')' as signature,md5(prosrc) as hash,prosecdef as security_definer,provolatile as volatility,proconfig as config from pg_proc where pronamespace='public'::regnamespace and proname in (${[...new Set(names)].map(q).join(',')}) order by signature`;
const priorSql=()=>functionSql([...renamed().map(x=>x.from),...preserved]);
const postSql=()=>functionSql([...created(),...renamed().map(x=>x.to),...preserved]);
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,'finance_expenses'].map(q).join(','));
const protectedTables=['finance_expenses','finance_expense_audit','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations','finance_expense_claims','finance_company_ledger','finance_compensation_allocations','finance_payments','finance_invoices','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payouts','finance_payout_allocations','finance_cash_transactions','finance_account_opening_balances','finance_tax_position_facts','finance_tax_filings','finance_tax_remittances'];
const protectedCte=`protected as(select jsonb_build_object(${protectedTables.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) hashes)`;
const differences=(name,sql,expected,key)=>`${name}_actual as(${sql}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;
function workflow(){
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(m.sha256,sha());
 const header='-- ONE SELECT-only statement / ONE result row. No business RPC. STOP on failed_checks.\n-- 056 request foundation: no backfill, submission, approval, tax, payout or cash action.\n';
 const result=post=>`select (select jsonb_object_agg(name,passed is true) from checks) checks,(select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select bool_and(passed is true) from checks) expense_request_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) upstream_evidence_hashes,(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} catalog_differences,
 ${q(sha())} migration_056_sha256,current_setting('server_version_num')::int catalog_server_version_num;\n`;
 const pre=header+`with ${differences('function',priorSql(),m.prior,'signature')},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),
 ('056_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')} and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in (${[...created().filter(n=>!renamed().some(x=>x.from===n)),...renamed().map(x=>x.to)].map(q).join(',')})))
 ) ${result(false)}`;
 const rpcs=['save_finance_expense','submit_finance_expense','get_finance_expenses','save_finance_expense_request','submit_finance_expense_request','get_finance_expense_requests'];
 const verify=header+`with ${differences('function',postSql(),m.functions,'signature')},${differences('catalog',catalogSql,m.catalog,'name')},${protectedCte},checks(name,passed) as(values
 ('exact_functions',not exists(select 1 from function_differences)),('exact_catalog',not exists(select 1 from catalog_differences)),
 ('foundation_zero_state',${tables.map(t=>`not exists(select 1 from ${t})`).join(' and ')}),
 ('browser_access_blocked',(select count(*)=3 and bool_and(relrowsecurity and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('private_and_rpc_permissions',${base.functionPrivileges(m.functions.filter(x=>!preserved.includes(x.name)),rpcs)}),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.request056_before',true),'') is null or current_setting('vp.request056_before',true)=(select hashes::text from protected))) ${result(true)}`;
 const dry=`BEGIN;\nselect set_config('vp.request056_before',upstream_evidence_hashes::text,true),set_config('vp.request056_preflight',expense_request_foundation_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;\nDO $gate$ BEGIN IF current_setting('vp.request056_preflight')<>'true' THEN RAISE EXCEPTION '056 preflight failed; STOP'; END IF; END $gate$;\n-- BEGIN EMBEDDED MIGRATION 056\n${source()}-- END EMBEDDED MIGRATION 056\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,source,sha,priorSql,postSql,catalogSql};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('056 artifacts verified');}
