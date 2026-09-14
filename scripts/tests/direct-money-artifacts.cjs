/* eslint-disable @typescript-eslint/no-require-imports */
// Local deterministic artifact generation. No network/database execution.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=require('./vp-distribution-artifacts.cjs'),{definition}=require('./tax-invoice-sql-artifacts.cjs');
const {functionFacts}=require('./combined-document-workflow.cjs');
const migrationPath=require('./direct-money-migration.cjs').file;
const filenames={pre:'scripts/sql/preflight_direct_money_receipt_foundation.sql',dry:'scripts/sql/dry_run_direct_money_receipt_foundation.sql',verify:'scripts/sql/verify_direct_money_receipt_foundation.sql'};
const tables=['finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",tables.map(q).join(','));
const manifestPath='scripts/tests/direct-money-catalog.json';
const rpcs=['save_finance_direct_money_receipt','transition_finance_direct_money_receipt','classify_finance_direct_money_receipt','get_finance_received_money_source','get_finance_direct_vp_formula_context','save_finance_direct_vp_distribution','save_finance_vp_distribution','get_finance_vp_distribution','transition_finance_vp_distribution'];
const upstream=['finance_payments','finance_payment_invoice_allocations','finance_payment_effective_invoice_allocations','finance_payment_wht_components','finance_payment_allocation_reallocations','finance_payment_audit_events',
 'finance_invoices','finance_invoice_items','finance_invoice_audit_events','finance_invoice_settlement_summary',
 'finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_company_ledger','finance_compensation_batches','finance_compensation_allocations',
 'finance_receipts','finance_receipt_invoice_allocations','finance_receipt_audit_events','finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events','finance_combined_documents','finance_combined_document_audit_events',
 'finance_document_counters','finance_payment_money_allocations','finance_payment_money_allocation_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'];
const evidence=`select jsonb_build_object(${upstream.map(table=>{const row=table==='finance_vp_revenue_distributions'?"(to_jsonb(r)-'direct_money_receipt_id')":"to_jsonb(r)";return `${q(table)},(select md5(coalesce(jsonb_agg(${row} order by ${row}::text),'[]')::text) from public.${table} r)`;}).join(',\n')}) as hashes`;
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql),names=new Set(functions.map(f=>f.name)),prior=new Map();
 const required=new Set([...names,'vp_formula_result_guard','vp_formula_calculate','vp_compensation_formula_catalog','guard_vp_distribution_source','money_allocation_admin','current_user_can_view_finance_payments','finance_vat_treatment','calculate_finance_billable_charge_amounts','assert_finance_billable_charge_context','money_allocation_source']);
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=46).sort()){
  const source=fs.readFileSync('supabase/migrations/'+file,'utf8');
  for(const match of source.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.has(match[1]))prior.set(match[1],functionFacts(definition(source,match[1]))[0]);
 }
 const newNames=[...names].filter(name=>!prior.has(name));
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const preFacts=[...prior.values()];
 const priorCte=`prerequisites(signature,hash) as(values ${preFacts.map(f=>`(${q(f.signature)},${q(f.hash)})`).join(',\n')}),
 prerequisite_differences as(select e.signature,e.hash as expected_hash,md5(p.prosrc) as actual_hash from prerequisites e left join pg_proc p on p.oid=to_regprocedure(e.signature) where p.oid is null or md5(p.prosrc) is distinct from e.hash)`;
 const protectedCte=`protected as(${evidence}), protected_targets as(select jsonb_build_object(
 'payment_95E22D0E',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'invoice_VP_IV_202609_000004',(select to_jsonb(i) from public.finance_invoices i where invoice_no='VP-IV-202609-000004'),
 'combined_D903B209',(select to_jsonb(c) from public.finance_combined_documents c where upper(left(id::text,8))='D903B209')) as evidence)`;
 const tableSecurity=`(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
  and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
  and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a where a.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in('finance_direct_money_receipts','finance_direct_money_receipt_audit'))`;
 const summary=post=>`select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as direct_money_receipt_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select evidence from protected_targets) as protected_target_evidence,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 ${post?"(select coalesce(jsonb_agg(d.evidence),'[]') from (select to_jsonb(f) as evidence from function_differences f union all select to_jsonb(r) from retained_function_differences r) d)":"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from prerequisite_differences d)"} as function_differences,
 jsonb_build_object('legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments), 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ${post?",'direct_money_rows',(select count(*) from finance_direct_money_receipts),'direct_money_audit_rows',(select count(*) from finance_direct_money_receipt_audit)":""}) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;\n`;
 const header='-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n-- Stop on failed_checks. Preserve and compare ALL protected_target_evidence / upstream_evidence_hashes before/after.\n-- No fixed Ledger/Compensation row-count gate; those systems remain operational. No business UAT actions here.\n';
 const pre=header+`with ${priorCte},${protectedCte}, checks(name,passed) as(values
 ('exact_prerequisite_functions',not exists(select 1 from prerequisite_differences)),
 ('047_namespace_unused',to_regclass('public.finance_direct_money_receipts') is null and to_regclass('public.finance_direct_money_receipt_audit') is null
  and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in(${newNames.map(q).join(',')}))
  and not exists(select 1 from pg_attribute where attrelid='public.finance_vp_revenue_distributions'::regclass and attname='direct_money_receipt_id' and not attisdropped)),
 ('matter_master_shape',(select count(*)=2 and bool_and(case when c.relname='cases' then a.atttypid='bigint'::regtype else a.atttypid='uuid'::regtype end)
   from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname in('cases','advisory_matters') and a.attname='id' and not a.attisdropped)),
 ('bank_master_shape',(select count(*)=4 from pg_attribute where attrelid='public.finance_bank_accounts'::regclass and attname in('id','short_name','bank_name','is_active') and not attisdropped))
 ) ${summary(false)}`;
 const retainedCte=`retained_functions(signature,hash) as(values ${preFacts.filter(f=>!names.has(f.name)).map(f=>`(${q(f.signature)},${q(f.hash)})`).join(',\n')}),
 retained_function_differences as(select e.signature,e.hash as expected_hash,md5(p.prosrc) as actual_hash from retained_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) where p.oid is null or md5(p.prosrc) is distinct from e.hash)`;
 const verify=header+`with ${base.functionCtes(functions)},${retainedCte},${protectedCte}, actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
  from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('exact_functions',not exists(select 1 from function_differences)),
 ('retained_tax_formula_permission_functions',not exists(select 1 from retained_function_differences)),
 ('private_and_rpc_permissions',${base.functionPrivileges(functions,rpcs)}),
 ('browser_mutation_blocked',${tableSecurity}),
 ('new_zero_state',not exists(select 1 from finance_direct_money_receipts) and not exists(select 1 from finance_direct_money_receipt_audit)
  and not exists(select 1 from finance_vp_revenue_distributions where direct_money_receipt_id is not null)),
 ('rehearsal_evidence_unchanged',nullif(current_setting('vp.direct047_before',true),'') is null or current_setting('vp.direct047_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only rehearsal. No synthetic rows and no business RPC calls.\nselect set_config('vp.direct047_before',upstream_evidence_hashes::text,true) from (${pre.trim().replace(/;$/,'')}) p;\n-- BEGIN EMBEDDED MIGRATION 047\n${sql}-- END EMBEDDED MIGRATION 047\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,catalogSql,manifestPath};
if(require.main===module){for(const [file,sql]of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('047 artifacts '+(process.argv.includes('--write')?'generated':'verified'));}
