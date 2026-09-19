/* eslint-disable @typescript-eslint/no-require-imports */
// Local deterministic artifacts. --write never connects to a database.
const fs=require('node:fs'),assert=require('node:assert/strict'),base=require('./vp-distribution-artifacts.cjs');
const prior=require('./tax-filing-snapshot-artifacts.cjs'),old=require('./tax-filing-artifacts.cjs'),{definition}=require('./tax-invoice-sql-artifacts.cjs');
const migrationPath='supabase/migrations/202607180054_add_reviewed_tax_deadlines.sql',manifestPath='scripts/tests/finance-hardening-catalog.json';
const filenames={pre:'scripts/sql/preflight_finance_ux_integrity_hardening.sql',dry:'scripts/sql/dry_run_finance_ux_integrity_hardening.sql',verify:'scripts/sql/verify_finance_ux_integrity_hardening.sql'};
const catalogSql=old.catalogSql.replace("'finance_tax_filings'","'finance_tax_deadline_rules','finance_tax_filings'");
const q=s=>"'"+s.replaceAll("'","''")+"'";
function workflow(){
 const sql=fs.readFileSync(migrationPath,'utf8'),functions=base.contractFacts(sql);
 const preserved=[];for(const [number,names] of [['49',['get_finance_treasury','materialize_finance_treasury_source','treasury_post_source']],['52',['tax_filing_immutable','transition_finance_tax_filing','transition_finance_tax_remittance']],['53',['tax_filing_pool','tax_filing_assert','create_finance_tax_filing']]]){
  const file=fs.readdirSync('supabase/migrations').find(f=>f.startsWith('2026071800'+number+'_')),s=fs.readFileSync('supabase/migrations/'+file,'utf8');for(const n of names)preserved.push(...base.contractFacts(definition(s,n)));
 }
 const header='-- ONE SELECT-only statement / ONE row. No business RPC. STOP on failed_checks.\n-- Candidate 054; no real due-date rules seeded. Compare upstream evidence hashes before/after.\n';
 const baseline=prior.workflow()[prior.filenames.verify].trim().replace(/;$/,'');
 const namespace=functions.map(f=>`to_regprocedure(${q(f.signature)}) is null`).join(' and ');
 const pre=header+`with baseline as(${baseline}),checks as(select checks||jsonb_build_object('054_namespace_unused',to_regclass('public.finance_tax_deadline_rules') is null and ${namespace}
 and not exists(select 1 from pg_attribute where attrelid='public.finance_tax_filings'::regclass and attname='deadline_snapshot_json' and not attisdropped)) as items,upstream_evidence_hashes from baseline)
 select items as checks,(select coalesce(jsonb_agg(key),'[]') from jsonb_each(items) where value<>'true') as failed_checks,
 not exists(select 1 from jsonb_each(items) where value<>'true') as finance_ux_integrity_hardening_preflight_pass,upstream_evidence_hashes from checks;\n`;
 if(!fs.existsSync(manifestPath))return {[filenames.pre]:pre};
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 const verify=header+`with ${base.functionCtes([...functions,...preserved])},${prior.protectedCte},actual_catalog as(${catalogSql}),expected_catalog as(select value as expected from jsonb_array_elements(${q(JSON.stringify(manifest))}::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),
 ('no_business_or_rule_creation',not exists(select 1 from finance_tax_filings) and not exists(select 1 from finance_tax_filing_allocations) and not exists(select 1 from finance_tax_remittances) and not exists(select 1 from finance_tax_deadline_rules)),
 ('private_rpc_permissions',${base.functionPrivileges(functions,functions.filter(f=>f.name!=='tax_filing_deadline').map(f=>f.name))}
 and not has_function_privilege('authenticated','public.create_finance_tax_filing(uuid,date,text,text,date,text)','EXECUTE')),
 ('rule_table_raw_access_blocked',(select relrowsecurity and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') from pg_class where oid='public.finance_tax_deadline_rules'::regclass)),
 ('no_invented_deadline',public.tax_filing_deadline('2026-09-01','vat','online')->'due_date'='null'::jsonb),
 ('september_snapshot_preserved',public.tax_filing_pool('2026-09-01','vat') @> '{"schema_version":2,"monthly_facts":{"output_vat":700,"input_vat":null,"input_vat_complete":false,"net_vat":null},"allocation_coverage":{"source_count":0},"tax_amount":null,"ready":false}'::jsonb),
 ('cancelled_payout_still_inert',not exists(select 1 from finance_payouts p where p.status='cancelled' and (exists(select 1 from finance_outgoing_wht_obligations w where w.payout_source_id=p.id) or exists(select 1 from finance_cash_transactions c where c.source_payout_id=p.id)))),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.hardening054_before',true),'') is null or current_setting('vp.hardening054_before',true)=(select hashes::text from protected)))
 select (select jsonb_object_agg(name,passed is true) from checks) as checks,(select coalesce(jsonb_agg(name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as finance_ux_integrity_hardening_verification_pass,(select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 current_setting('server_version_num')::integer as catalog_server_version_num;\n`;
 const dry=`BEGIN;\nselect set_config('vp.hardening054_before',upstream_evidence_hashes::text,true),set_config('vp.hardening054_preflight',finance_ux_integrity_hardening_preflight_pass::text,true) from (${pre.trim().replace(/;$/,'')}) p;\nDO $gate$ BEGIN IF current_setting('vp.hardening054_preflight')<>'true' THEN RAISE EXCEPTION '054 preflight failed; stop'; END IF; END $gate$;\n-- BEGIN EMBEDDED MIGRATION 054\n${sql}-- END EMBEDDED MIGRATION 054\n${verify}ROLLBACK;\n`;
 return {[filenames.pre]:pre,[filenames.verify]:verify,[filenames.dry]:dry};
}
module.exports={workflow,filenames,migrationPath,manifestPath,catalogSql};
if(require.main===module){for(const [file,sql] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(file,sql);else assert.equal(fs.readFileSync(file,'utf8'),sql);}console.log('054 artifacts verified');}
