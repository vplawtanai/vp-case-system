/* eslint-disable @typescript-eslint/no-require-imports */
// Local deterministic artifact generation only. No connection or credentials.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180049_add_treasury_cashbook_foundation.sql';
const manifestPath='scripts/tests/treasury-catalog.json';
const filenames={pre:'scripts/sql/preflight_treasury_cashbook_foundation.sql',dry:'scripts/sql/dry_run_treasury_cashbook_foundation.sql',verify:'scripts/sql/verify_treasury_cashbook_foundation.sql'};
const tables=['finance_cash_locations','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events','finance_direct_money_receipts'];
const views=['finance_treasury_accounts','finance_treasury_balances'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,...views].map(q).join(','))
 .replace('c.relforcerowsecurity as force_rls,',"c.relforcerowsecurity as force_rls,c.reloptions,case when c.relkind='v' then pg_get_viewdef(c.oid,true) end as view_definition,");
const upstream=['finance_payments','finance_payment_invoice_allocations','finance_payment_effective_invoice_allocations','finance_payment_wht_components','finance_payment_allocation_reallocations','finance_payment_audit_events',
 'finance_invoices','finance_invoice_items','finance_invoice_audit_events','finance_invoice_settlement_summary','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events',
 'finance_company_ledger','finance_compensation_batches','finance_compensation_allocations','finance_receipts','finance_receipt_invoice_allocations','finance_receipt_audit_events','finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events',
 'finance_combined_documents','finance_combined_document_audit_events','finance_document_counters','finance_payment_money_allocations','finance_payment_money_allocation_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_direct_money_receipts','finance_direct_money_receipt_audit',
 'finance_payable_entitlement_sources','finance_payable_entitlements','finance_payable_entitlement_audit'];
const required=['money_allocation_admin','current_user_can_view_finance_cash_transactions','current_user_can_view_finance_cash_bank_account',
 'direct_money_payload','direct_money_snapshot','direct_money_guard','direct_money_integrity','save_finance_direct_money_receipt','transition_finance_direct_money_receipt',
 'confirm_finance_payment','reverse_finance_payment','correct_erroneous_finance_payment','post_confirmed_payment_to_finance_cash_transaction',
 'validate_finance_cash_transaction_integrity','validate_finance_opening_balance_integrity','enforce_finance_cash_transaction_lifecycle','enforce_finance_opening_balance_lifecycle','protect_finance_cash_audit_event'];
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql),prior=new Map();
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=48).sort()){
  const source=fs.readFileSync('supabase/migrations/'+file,'utf8');
  for(const m of source.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.includes(m[1])){
   for(const f of base.contractFacts(definition(source.slice(m.index),m[1])))prior.set(f.signature,f);
  }
 }
 for(const name of required)assert.ok([...prior.values()].some(f=>f.name===name),`Missing upstream ${name}`);
 const unchanged=[...prior.values()].filter(f=>!functions.some(n=>n.name===f.name));
 const backups=['direct_money_payload','direct_money_snapshot'].map(name=>{
  const f=[...prior.values()].find(f=>f.name===name);return {...f,name:name+'_before_treasury',signature:f.signature.replace(name+'(',name+'_before_treasury(')};
 });
 const protectedCte=`protected as(select jsonb_build_object(${upstream.map(table=>{
  const strip=table==='finance_cash_transactions'?"-array['cash_location_id','source_direct_money_receipt_id','source_snapshot_json']":table==='finance_account_opening_balances'?"-'cash_location_id'":table==='finance_direct_money_receipts'?"-'receiving_cash_location_id'":'';
  return `${q(table)},(select md5(coalesce(jsonb_agg(to_jsonb(r)${strip} order by (to_jsonb(r)${strip})::text),'[]')::text) from public.${table} r)`;
 }).join(',\n')}) as hashes)`;
 const header='-- ONE SELECT-only statement / ONE row. No application RPCs or mutations.\n-- STOP on failed_checks. Compare upstream_evidence_hashes before/after apply.\n-- No fixed Ledger/Compensation/Payment row-count baseline. No cutover or receipt backfill.\n';
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as treasury_cashbook_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments),'direct_money_rows',(select count(*) from finance_direct_money_receipts)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const zero=`('no_cash_cutover',not exists(select 1 from finance_cash_transactions) and not exists(select 1 from finance_account_opening_balances)
 and not exists(select 1 from finance_cash_transaction_audit_events) and not exists(select 1 from finance_account_opening_balance_audit_events))`;
 const pre=header+`with ${base.functionCtes([...prior.values()])},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),${zero},
 ('049_namespace_unused',${['finance_cash_locations',...views].map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')}
 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'treasury_%' or proname in(${[...functions.filter(f=>!prior.has(f.signature)).map(f=>f.name),...backups.map(f=>f.name)].map(q).join(',')})))
 and not exists(select 1 from pg_attribute where attrelid in('finance_cash_transactions'::regclass,'finance_account_opening_balances'::regclass,'finance_direct_money_receipts'::regclass) and attname in('cash_location_id','source_direct_money_receipt_id','source_snapshot_json','receiving_cash_location_id') and not attisdropped))
 ) ${summary(false)}`;
 if(!fs.existsSync(manifestPath))return {[filenames.pre]:pre};
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${base.functionCtes([...functions,...unchanged,...backups])},${protectedCte},actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),${zero},
 ('office_cash_stable_identity',(select count(*)=1 and bool_and(is_active and name_th='เงินสดสำนักงาน' and name_en='Office Cash') from finance_cash_locations where code='office_cash')),
 ('private_and_rpc_permissions',${base.functionPrivileges([...functions,...backups],['treasury_can_view','get_finance_treasury','materialize_finance_treasury_source','save_finance_treasury_opening','confirm_finance_treasury_opening'])}),
 ('cash_browser_mutation_blocked',(select count(*)=5 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class
 where relnamespace='public'::regnamespace and relname in(${tables.filter(t=>t!=='finance_direct_money_receipts').map(q).join(',')}))),
 ('payment_reversal_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=19 and tgfoid='treasury_source_reversal_guard()'::regprocedure and not tgisinternal)
 from pg_trigger where tgrelid='finance_payments'::regclass and tgname='treasury_payment_reversal')),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.treasury049_before',true),'') is null or current_setting('vp.treasury049_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only schema rehearsal. No business RPC or cash/opening/source creation.\nselect set_config('vp.treasury049_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n-- BEGIN EMBEDDED MIGRATION 049\n${sql}-- END EMBEDDED MIGRATION 049\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,catalogSql};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('049 artifacts '+(process.argv.includes('--write')?'generated':'verified'));}
