/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local files only. Never connects to a database.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./vp-distribution-artifacts.cjs');
const old=require('./tax-filing-artifacts.cjs'),{definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180053_separate_tax_filing_monthly_facts.sql';
const filenames={pre:'scripts/sql/preflight_tax_filing_snapshot_consistency.sql',dry:'scripts/sql/dry_run_tax_filing_snapshot_consistency.sql',verify:'scripts/sql/verify_tax_filing_snapshot_consistency.sql'};
const q=s=>"'"+s.replaceAll("'","''")+"'";
const tables=['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit'];
const protectedTables=[...tables,'finance_payments','finance_payment_wht_components','finance_payment_invoice_allocations','finance_payment_audit_events','finance_invoices','finance_invoice_items','finance_receipts','finance_receipt_audit_events','finance_tax_invoices','finance_tax_invoice_items','finance_tax_point_events','finance_combined_documents','finance_tax_document_corrections','finance_tax_correction_lines','finance_document_counters','finance_company_ledger','finance_compensation_allocations','finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_vp_revenue_distributions','finance_payable_entitlements','finance_account_opening_balances','finance_account_opening_balance_audit_events','finance_cash_transactions','finance_cash_transaction_audit_events','finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit','finance_outgoing_wht_obligations','finance_payees','finance_payouts','finance_payout_allocations','finance_payout_audit'];
const protectedCte=`protected as(select jsonb_build_object(${protectedTables.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) as hashes)`;
const rpcs=['create_finance_tax_filing','transition_finance_tax_filing','create_finance_tax_remittance','transition_finance_tax_remittance','get_finance_tax_filings','get_finance_tax_position'];
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),previous=base.contractFacts(fs.readFileSync(old.migrationPath,'utf8'));
 const source=base.contractFacts(definition(fs.readFileSync('supabase/migrations/202607180050_add_tax_position_foundation.sql','utf8'),'tax_position_source'))[0];
 previous.push(source);
 const updated=base.contractFacts(sql),pool=previous.find(f=>f.name==='tax_filing_pool');
 const backup={...pool,name:'tax_filing_allocation_pool_v1',signature:pool.signature.replace('tax_filing_pool','tax_filing_allocation_pool_v1')};
 const postFunctions=[...previous.filter(f=>!updated.some(n=>n.signature===f.signature)),...updated,backup];
 const manifest=JSON.parse(fs.readFileSync(old.manifestPath,'utf8'));
 const catalog=`actual_catalog as(${old.catalogSql}),expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a))`;
 const header='-- ONE SELECT-only statement / ONE result row. No lifecycle RPC or source materialization.\n-- September 2026 UAT contract; STOP on failed_checks. Compare upstream_evidence_hashes before/after apply.\n';
 const common=`('filing_remittance_zero_state',${tables.map(t=>`not exists(select 1 from ${t})`).join(' and ')}),
 ('input_vat_still_incomplete',not exists(select 1 from finance_tax_periods where input_vat_status<>'incomplete' or input_vat_amount is not null or net_vat_amount is not null)),
 ('confirmed_only_outgoing_wht',not exists(select 1 from finance_outgoing_wht_obligations w left join finance_payouts p on p.id=w.payout_source_id where p.status is distinct from 'confirmed')),
 ('cancelled_payout_has_no_outgoing_or_cash',not exists(select 1 from finance_payouts p where p.status='cancelled' and
  (exists(select 1 from finance_outgoing_wht_obligations w where w.payout_source_id=p.id) or exists(select 1 from finance_cash_transactions c where c.source_payout_id=p.id)))),
 ('exact_catalog_052_retained',not exists(select 1 from catalog_differences)),
 ('browser_raw_access_and_mutation_blocked',(select count(*)=5 and bool_and(relrowsecurity
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in(${tables.map(q).join(',')})))`;
 const summary=post=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_filing_snapshot_consistency_${post?'verification':'preflight'}_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 ${post?'(select snapshot from review)':'null::jsonb'} as september_review_snapshot,
 jsonb_build_object('filing_rows',(select count(*) from finance_tax_filings),'allocation_rows',(select count(*) from finance_tax_filing_allocations),
 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const pre=header+`with ${base.functionCtes(previous)},${catalog},${protectedCte},checks(name,passed) as(values
 ${common},('exact_052_functions',not exists(select 1 from function_differences)),
 ('053_namespace_unused',to_regprocedure('public.tax_filing_monthly_facts(date)') is null and to_regprocedure('public.tax_filing_allocation_pool_v1(date,text)') is null),
 ('private_and_rpc_permissions',${base.functionPrivileges(previous,rpcs)})
 ) ${summary(false)}`;
 const verify=header+`with ${base.functionCtes(postFunctions)},${catalog},${protectedCte},
 review as(select public.tax_filing_pool('2026-09-01'::date,'vat') as snapshot),checks(name,passed) as(values
 ${common},('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('private_and_rpc_permissions',${base.functionPrivileges(postFunctions,rpcs)}),
 ('september_monthly_facts_frozen_contract',(select snapshot->>'schema_version'='2'
  and snapshot->'monthly_facts' @> '{"output_vat":700,"input_vat":null,"input_vat_complete":false,"net_vat":null}'::jsonb
  and snapshot->'allocation_coverage' @> '{"output_vat":0,"base_amount":0,"source_count":0,"sources":[]}'::jsonb
  and not snapshot ?| array['output_vat','base_amount','source_count','sources']
  and snapshot->'tax_amount'='null'::jsonb and snapshot->'ready'='false'::jsonb from review)),
 ('wht_pool_contract_unchanged',public.tax_filing_pool('2026-09-01','wht_natural')=public.tax_filing_allocation_pool_v1('2026-09-01','wht_natural')
 and public.tax_filing_pool('2026-09-01','wht_juristic')=public.tax_filing_allocation_pool_v1('2026-09-01','wht_juristic')),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.tax_filing053_before',true),'') is null or current_setting('vp.tax_filing053_before',true)=(select hashes::text from protected))
 ) ${summary(true)}`;
 const dry=`BEGIN;\n-- Rollback-only DDL rehearsal. NO Draft, Filing, Remittance or materialization RPC.\nselect set_config('vp.tax_filing053_before',upstream_evidence_hashes::text,true),set_config('vp.tax_filing053_preflight',tax_filing_snapshot_consistency_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;\nDO $preflight$ BEGIN IF current_setting('vp.tax_filing053_preflight')<>'true' THEN RAISE EXCEPTION '053 preflight failed; stop'; END IF; END $preflight$;\n-- BEGIN EMBEDDED MIGRATION 053\n${sql}-- END EMBEDDED MIGRATION 053\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,protectedCte};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('053 artifacts verified');}
