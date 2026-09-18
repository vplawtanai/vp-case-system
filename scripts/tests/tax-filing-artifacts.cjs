/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local artifact generation only. No connection or credentials.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./vp-distribution-artifacts.cjs');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql',manifestPath='scripts/tests/tax-filing-catalog.json';
const filenames={pre:'scripts/sql/preflight_tax_filing_remittance_foundation.sql',dry:'scripts/sql/dry_run_tax_filing_remittance_foundation.sql',verify:'scripts/sql/verify_tax_filing_remittance_foundation.sql'};
const tables=['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit'];
const rpc=['create_finance_tax_filing','transition_finance_tax_filing','create_finance_tax_remittance','transition_finance_tax_remittance','get_finance_tax_filings','get_finance_tax_position'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,'finance_cash_transactions'].map(q).join(','));
const upstream=['finance_payments','finance_payment_wht_components','finance_payment_invoice_allocations','finance_payment_audit_events','finance_invoices','finance_invoice_items','finance_receipts','finance_tax_invoices','finance_tax_point_events','finance_combined_documents','finance_document_counters','finance_company_ledger','finance_compensation_allocations','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit','finance_payable_entitlements','finance_payable_entitlement_sources','finance_payable_entitlement_audit','finance_account_opening_balances','finance_account_opening_balance_audit_events','finance_cash_transactions','finance_cash_transaction_audit_events','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit','finance_outgoing_wht_obligations','finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit'];
const protectedCte=`protected as(select jsonb_build_object(${upstream.map(t=>{const row=t==='finance_cash_transactions'?"to_jsonb(r)-'source_tax_remittance_id'":"to_jsonb(r)";return `${q(t)},(select md5(coalesce(jsonb_agg(${row} order by (${row})::text),'[]')::text) from public.${t} r)`;}).join(',')}) as hashes)`;
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql),prior=new Map();
 const required=['get_finance_tax_position','tax_position_can_view','tax_position_can_manage','tax_position_sync','tax_position_source','confirm_finance_payout','payout_assert','payout_choices','treasury_can_view','treasury_location_active','get_finance_treasury','validate_finance_cash_transaction_integrity','validate_finance_opening_balance_integrity','record_finance_cash_transaction_audit_event','finance_bangkok_completed_day_end','enforce_finance_cash_transaction_lifecycle','current_user_can_confirm_finance_cash_transactions'];
 required.push('transition_finance_tax_period');
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^2026071800\d{2}_/.test(f)&&Number(f.slice(10,12))<=51).sort()){
  const source=fs.readFileSync('supabase/migrations/'+file,'utf8');for(const m of source.matchAll(/create (?:or replace )?function public\.(\w+)\(/g))if(required.includes(m[1]))for(const f of base.contractFacts(definition(source.slice(m.index),m[1])))prior.set(f.signature,f);
 }
 for(const n of required)assert.ok([...prior.values()].some(f=>f.name===n),n);
 const old=[...prior.values()].find(f=>f.name==='get_finance_tax_position');const backup={...old,name:'get_finance_tax_position_before_filing',signature:old.signature.replace('get_finance_tax_position','get_finance_tax_position_before_filing')};
 const preserved=[...prior.values()].filter(f=>f.name!=='get_finance_tax_position');
 const header='-- ONE SELECT-only statement / ONE result row. STOP on failed_checks.\n-- Compare upstream_evidence_hashes before/after apply. No fixed mutable financial counts.\n';
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_filing_remittance_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'payout_rows',(select count(*) from finance_payouts),'confirmed_payout_rows',(select count(*) from finance_payouts where status='confirmed'),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations)${post?tables.map(t=>`,${q(t)},(select count(*) from public.${t})`).join(''):''}) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const baseline=`('vat_incomplete_not_invented',not exists(select 1 from finance_tax_periods where input_vat_status<>'incomplete' or input_vat_amount is not null or net_vat_amount is not null)),
 ('only_confirmed_outgoing_evidence',not exists(select 1 from finance_outgoing_wht_obligations w left join finance_payouts p on p.id=w.payout_source_id where p.status is distinct from 'confirmed'))`;
 const pre=header+`with ${base.functionCtes([...prior.values()])},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),${baseline},
 ('052_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')}
 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'tax_filing_%' or proname in(${[...functions.filter(f=>f.name!=='get_finance_tax_position').map(f=>f.name),backup.name].map(q).join(',')})))
 and not exists(select 1 from pg_attribute where attrelid='public.finance_cash_transactions'::regclass and attname='source_tax_remittance_id' and not attisdropped))
 ) ${summary(false)}`;
 if(!fs.existsSync(manifestPath))return {[filenames.pre]:pre};
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${base.functionCtes([...functions,...preserved,backup])},${protectedCte},actual_catalog as(${catalogSql}),
 expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),${baseline},
 ('foundation_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')} and not exists(select 1 from finance_cash_transactions where source_tax_remittance_id is not null)),
 ('private_and_rpc_permissions',${base.functionPrivileges([...functions,backup],rpc)} and not has_function_privilege('authenticated','public.transition_finance_tax_period(date,integer,text,text,date,boolean)','EXECUTE') and not has_function_privilege('anon','public.transition_finance_tax_period(date,integer,text,text,date,boolean)','EXECUTE')),
 ('browser_raw_access_and_mutation_blocked',(select count(*)=5 and bool_and(relrowsecurity
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.tax_filing052_before',true),'') is null or current_setting('vp.tax_filing052_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only rehearsal. No filing, remittance or cash RPC is invoked.\nselect set_config('vp.tax_filing052_before',upstream_evidence_hashes::text,true),set_config('vp.tax_filing052_preflight',tax_filing_remittance_foundation_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;\nDO $preflight$ BEGIN IF current_setting('vp.tax_filing052_preflight')<>'true' THEN RAISE EXCEPTION '052 preflight failed; stop'; END IF; END $preflight$;\n-- BEGIN EMBEDDED MIGRATION 052\n${sql}-- END EMBEDDED MIGRATION 052\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,catalogSql,manifestPath,filenames,migrationPath};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('052 artifacts verified');}
