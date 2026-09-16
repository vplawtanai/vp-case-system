/* eslint-disable @typescript-eslint/no-require-imports */
// Local deterministic generation. No database/network connection.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180051_add_payee_payout_foundation.sql',manifestPath='scripts/tests/payout-catalog.json';
const filenames={pre:'scripts/sql/preflight_payee_payout_foundation.sql',dry:'scripts/sql/dry_run_payee_payout_foundation.sql',verify:'scripts/sql/verify_payee_payout_foundation.sql'};
const tables=['finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit'];
const modified=['finance_payable_entitlements','finance_cash_transactions','finance_outgoing_wht_obligations'];
const rpc=['save_finance_payee','get_finance_payees','save_finance_payout','get_finance_payout_workspace','confirm_finance_payout','cancel_finance_payout'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,...modified].map(q).join(','));
const upstream=['finance_payments','finance_payment_wht_components','finance_payment_invoice_allocations','finance_payment_audit_events','finance_invoices','finance_invoice_items','finance_receipts','finance_tax_invoices','finance_tax_point_events','finance_combined_documents','finance_document_counters','finance_company_ledger','finance_compensation_allocations','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_account_opening_balances','finance_cash_transactions','finance_cash_transaction_audit_events','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit'];
const protectedCte=`protected as(select jsonb_build_object(${upstream.map(t=>{const row=t==='finance_cash_transactions'?"to_jsonb(r)-'source_payout_id'":"to_jsonb(r)";return `${q(t)},(select md5(coalesce(jsonb_agg(${row} order by (${row})::text),'[]')::text) from public.${t} r)`;}).join(',')}) as hashes)`;
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql);
 const required=['vp_formula_calculate','payable_frozen_components','payable_distribution_transition','payable_assert_unpaid_contract','get_finance_payable_entitlements','get_finance_tax_position','payable_assert_distribution','treasury_location_active','treasury_can_view','get_finance_treasury','money_allocation_admin','confirm_finance_payment','transition_finance_direct_money_receipt','tax_position_source_changed'];
 const prior=new Map();
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=50).sort()){
  const s=fs.readFileSync('supabase/migrations/'+file,'utf8');
  for(const m of s.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.includes(m[1]))for(const f of base.contractFacts(definition(s.slice(m.index),m[1])))prior.set(f.signature,f);
 }
 for(const name of required)assert.ok([...prior.values()].some(f=>f.name===name),name);
 const preserved=[...prior.values()].filter(f=>!functions.some(n=>n.signature===f.signature));
 const backups=['vp_formula_calculate','get_finance_tax_position'].map(name=>{const f=[...prior.values()].find(f=>f.name===name);const renamed=name==='vp_formula_calculate'?'vp_formula_calculate_before_payee':'get_finance_tax_position_before_payout';return {...f,name:renamed,signature:f.signature.replace(name,renamed)};});
 const header='-- SELECT-only / ONE statement / ONE row. STOP on failed_checks.\n-- No fixed mutable financial row-count baselines. Compare upstream_evidence_hashes across apply.\n';
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payee_payout_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations)${post?",'payout_rows',(select count(*) from finance_payouts), 'payee_rows',(select count(*) from finance_payees)":""}) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const pre=header+`with ${base.functionCtes([...prior.values()])},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),
 ('051_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')} and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'payout_%' or proname in(${[...functions.filter(f=>![...prior.values()].some(p=>p.name===f.name)),...backups].map(f=>q(f.name)).join(',')})))
 and not exists(select 1 from pg_attribute where attrelid='public.finance_cash_transactions'::regclass and attname='source_payout_id' and not attisdropped)),
 ('reserved_outgoing_empty',not exists(select 1 from public.finance_outgoing_wht_obligations)),
 ('no_existing_settlement_integration',not exists(select 1 from pg_constraint where contype='f' and confrelid='public.finance_payable_entitlements'::regclass))
 ) ${summary(false)}`;
 if(!fs.existsSync(manifestPath))return {[filenames.pre]:pre};
 const expected=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${base.functionCtes([...functions,...preserved,...backups])},${protectedCte},actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),
 ('new_zero_state',${[...tables,'finance_outgoing_wht_obligations'].map(t=>`not exists(select 1 from public.${t})`).join(' and ')} and not exists(select 1 from finance_cash_transactions where source_payout_id is not null)),
 ('private_and_rpc_permissions',${base.functionPrivileges([...functions,...backups],[...rpc,'get_finance_payable_entitlements','get_finance_tax_position'])}),
 ('browser_raw_identity_and_mutation_blocked',(select count(*)=6 and bool_and(relrowsecurity
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.payout051_before',true),'') is null or current_setting('vp.payout051_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only schema rehearsal. Never creates Payees, Payouts, Cash or WHT.\nselect set_config('vp.payout051_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n-- BEGIN EMBEDDED MIGRATION 051\n${sql}-- END EMBEDDED MIGRATION 051\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,catalogSql,manifestPath,filenames,migrationPath};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('051 artifacts verified');}
