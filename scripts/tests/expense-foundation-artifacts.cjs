/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local artifacts; no credentials or database connection.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const base=require('./vp-distribution-artifacts.cjs');
const migrationPath='supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql';
const manifestPath='scripts/tests/expense-foundation-catalog.json';
const filenames={pre:'scripts/sql/preflight_expense_purchase_settlement_foundation.sql',dry:'scripts/sql/dry_run_expense_purchase_settlement_foundation.sql',verify:'scripts/sql/verify_expense_purchase_settlement_foundation.sql'};
const tables=['finance_expenses','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations','finance_expense_obligation_waivers','finance_expense_audit','finance_treasury_account_authorities','finance_treasury_authority_audit'];
const changed=['finance_payouts','finance_payout_allocations','finance_tax_source_revisions','finance_tax_position_facts'];
const q=s=>"'"+s.replaceAll("'","''")+"'";
const catalogSql=base.catalogSql.replace("'finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'",[...tables,...changed].map(q).join(','));
const source=()=>fs.readFileSync(migrationPath,'utf8');
const sha=()=>createHash('sha256').update(source()).digest('hex');
const created=()=>[...source().matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(m=>m[1]);
const renamed=()=>[...source().matchAll(/alter function public\.(\w+)\([^;]+?rename to (\w+);/g)].map(m=>({from:m[1],to:m[2]}));
const preserved=['payout_can_manage','cancel_finance_payout','payout_choices','save_finance_payee','get_finance_payees','tax_position_sync','tax_filing_pool','tax_filing_assert','create_finance_tax_filing_review','transition_finance_tax_filing','transition_finance_tax_remittance','treasury_can_view','treasury_location_active','get_finance_treasury','get_finance_treasury_month_flow','current_user_can_confirm_finance_cash_transactions','assert_finance_billable_charge_context'];
function functionSql(names){return `select p.proname as name,'public.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' as signature,md5(p.prosrc) as body_hash,
 p.prosecdef as security_definer,p.provolatile as volatility,p.proconfig as config,p.prokind as kind,
 pg_get_function_result(p.oid) as result,pg_get_function_arguments(p.oid) as arguments,p.proretset as returns_set,
 l.lanname as language,p.proisstrict as strict,p.proparallel as parallel,p.proleakproof as leakproof
 from pg_proc p join pg_language l on l.oid=p.prolang where p.pronamespace='public'::regnamespace and p.proname in(${[...new Set(names)].map(q).join(',')}) order by signature`;}
const priorFunctionSql=()=>functionSql([...renamed().map(r=>r.from),...preserved]);
const postFunctionSql=()=>functionSql([...created(),...renamed().map(r=>r.to),...preserved]);
const viewSql="select pg_get_viewdef('public.finance_treasury_balances'::regclass,true) as definition,reloptions from pg_class where oid='public.finance_treasury_balances'::regclass";
const upstream=['finance_expense_claims','finance_company_ledger','finance_compensation_allocations','finance_compensation_batches','finance_payments','finance_payment_wht_components','finance_payment_invoice_allocations','finance_payment_audit_events','finance_invoices','finance_invoice_items','finance_receipts','finance_receipt_audit_events','finance_tax_invoices','finance_combined_documents','finance_direct_money_receipts','finance_vp_revenue_distributions','finance_payable_entitlements','finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_cash_transactions','finance_cash_transaction_audit_events','finance_account_opening_balances','finance_account_opening_balance_audit_events','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_position_audit','finance_outgoing_wht_obligations','finance_tax_periods','finance_tax_filings','finance_tax_filing_allocations','finance_tax_remittances','finance_tax_deadline_rules','finance_document_counters'];
const protectedCte=`protected as(select jsonb_build_object(${upstream.map(t=>{const value=t==='finance_payouts'?"to_jsonb(r)-'source_model'":t==='finance_payout_allocations'?"to_jsonb(r)-array['expense_id','expense_obligation_id','wht_base']":"to_jsonb(r)";return `${q(t)},(select md5(coalesce(jsonb_agg(${value} order by (${value})::text),'[]')::text) from public.${t} r)`;}).join(',')}) hashes)`;
function differences(name,actual,expected,key='signature'){return `${name}_actual as(${actual}),${name}_expected as(select value expected from jsonb_array_elements(${q(JSON.stringify(expected))}::jsonb)),
 ${name}_differences as(select e.expected,to_jsonb(a) actual from ${name}_expected e full join ${name}_actual a on e.expected->>${q(key)}=a.${key} where e.expected is distinct from to_jsonb(a))`;}
function workflow(){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(manifest.sha256,sha(),'Candidate changed: regenerate isolated manifest, then artifacts');
 const header='-- ONE SELECT-only statement / ONE result row. No business RPC. STOP on failed_checks.\n-- Candidate 055. No cutover or data creation. Compare upstream_evidence_hashes before/after apply.\n';
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) failed_checks,
 (select bool_and(passed is true) from checks) expense_purchase_settlement_foundation_${post?'verification':'preflight'}_pass,
 (select hashes from protected) upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) function_differences,
 ${post?"(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d)":"'[]'::jsonb"} catalog_differences,
 jsonb_build_object('legacy_claims',(select count(*) from finance_expense_claims),'legacy_ledger',(select count(*) from finance_company_ledger),'cash',(select count(*) from finance_cash_transactions),'opening',(select count(*) from finance_account_opening_balances)${post?tables.map(t=>`,${q(t)},(select count(*) from public.${t})`).join(''):''}) observability,
 ${q(sha())} as migration_055_sha256,current_setting('server_version_num')::integer catalog_server_version_num;\n`;
 const newNames=created().filter(n=>!renamed().some(r=>r.from===n));
 const legacyColumns=['id','claim_date','claimant_user_id','category','amount','client_id','case_id','advisory_matter_id','description','note','status','ledger_entry_id'];
 const pre=header+`with ${differences('function',priorFunctionSql(),manifest.priorFunctions)},${protectedCte},checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),
 ('055_namespace_unused',${tables.map(t=>`to_regclass(${q('public.'+t)}) is null`).join(' and ')}
 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in(${[...newNames,...renamed().map(r=>r.to)].map(q).join(',')}))
 and not exists(select 1 from pg_attribute where attrelid='public.finance_payouts'::regclass and attname='source_model' and not attisdropped)),
 ('legacy_bridge_columns_present',(select count(*)=${legacyColumns.length} from pg_attribute where attrelid='public.finance_expense_claims'::regclass and attname in(${legacyColumns.map(q).join(',')}) and not attisdropped)
 and exists(select 1 from pg_attribute where attrelid='public.finance_company_ledger'::regclass and attname='source_expense_claim_id' and not attisdropped)),
 ('existing_payouts_require_canonical_payee',not exists(select 1 from finance_payouts where payee_id is null)),
 ('only_confirmed_outgoing_wht',not exists(select 1 from finance_outgoing_wht_obligations w left join finance_payouts p on p.id=w.payout_source_id where p.status is distinct from 'confirmed'))
 ) ${summary(false)}`;
 const rpcs=source().match(/if f.proname in \(([\s\S]*?)\)\s*then execute/)[1].match(/'[^']+'/g).map(s=>s.slice(1,-1));
 const verify=header+`with ${differences('function',postFunctionSql(),manifest.functions)},${differences('catalog',catalogSql,manifest.catalog,'name')},${protectedCte},checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),
 ('treasury_shared_balance_view_exact',(select to_jsonb(v)=${q(JSON.stringify(manifest.view))}::jsonb from (${viewSql}) v)),
 ('new_foundation_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')} and not exists(select 1 from finance_payouts where source_model='expense_v1')
 and not exists(select 1 from finance_payout_allocations where expense_id is not null) and not exists(select 1 from finance_tax_source_revisions where source_type='expense')),
 ('private_and_rpc_permissions',${base.functionPrivileges([...created(),...renamed().map(r=>r.to)].map(name=>({name,signature:manifest.functions.find(f=>f.name===name).signature})),rpcs)}),
 ('browser_raw_access_blocked',(select count(*)=${tables.length} and bool_and(relrowsecurity
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')}))),
 ('legacy_guards_narrow_and_enabled',(select count(*)=2 and bool_and(tgenabled='O' and not tgisinternal) from pg_trigger where tgfoid='public.expense_legacy_bridge_guard()'::regprocedure)),
 ('no_new_cash_or_tax_effect',not exists(select 1 from finance_cash_transactions c join finance_payouts p on p.id=c.source_payout_id where p.source_model='expense_v1') and not exists(select 1 from finance_tax_position_facts where tax_kind='input_vat')),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.expense055_before',true),'') is null or current_setting('vp.expense055_before',true)=(select hashes::text from protected))) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only schema rehearsal; no Expense/Claim/Tax/Payout/Cash action.\nselect set_config('vp.expense055_before',upstream_evidence_hashes::text,true),set_config('vp.expense055_preflight',expense_purchase_settlement_foundation_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;\nDO $gate$ BEGIN IF current_setting('vp.expense055_preflight')<>'true' THEN RAISE EXCEPTION '055 preflight failed; STOP'; END IF; END $gate$;\n-- BEGIN EMBEDDED MIGRATION 055\n${source()}-- END EMBEDDED MIGRATION 055\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,catalogSql,priorFunctionSql,postFunctionSql,viewSql,sha};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('055 artifacts verified');}
