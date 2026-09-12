/* eslint-disable @typescript-eslint/no-require-imports */
// Reproducible local-only operator artifacts. Never connects to any database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {functionFacts}=require('./combined-document-workflow.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),q=s=>"'"+s.replaceAll("'","''")+"'";
const migrationPath='supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql';
const tables=['finance_payment_money_allocations','finance_payment_money_allocation_audit'];
const filenames={pre:'scripts/sql/preflight_payment_money_allocation.sql',verify:'scripts/sql/verify_payment_money_allocation.sql',dry:'scripts/sql/dry_run_payment_money_allocation.sql'};
const catalogSql=`select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${tables.map(q).join(',')}) order by c.relname`;
const upstream=['finance_payments','finance_payment_invoice_allocations','finance_payment_allocation_reallocations','finance_payment_wht_components','finance_payment_audit_events','finance_invoices','finance_cash_transactions','finance_account_opening_balances',
 'finance_company_ledger','finance_compensation_batches','finance_receipts','finance_tax_invoices','finance_combined_documents','finance_document_counters'];
// Hashes are observability/before-after protection, never fixed mutable row counts.
const protectedSql=`select jsonb_build_object(${upstream.map(t=>`${q(t)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${t} r)`).join(',')}) as evidence`;
function workflow(){
 const sql=read(migrationPath),funcs=functionFacts(sql),prior=new Map();
 const required=['current_user_can_view_finance_payments','finance_document_invoice_lines','finance_vat_treatment','confirm_finance_payment','reverse_finance_payment','correct_erroneous_finance_payment',
 'reallocate_finance_payment_allocation','issue_finance_tax_correction','assert_finance_payment_structured_wht','void_finance_invoice','issue_finance_receipt','issue_finance_tax_invoice','issue_finance_combined_document'];
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^2026071800(2[1-9]|3[0-9]|4[0-3])_/.test(f)).sort())
  for(const fn of functionFacts(read('supabase/migrations/'+f)))if(required.includes(fn.name))prior.set(fn.name,fn);
 assert.equal(prior.size,required.length,required.filter(n=>!prior.has(n)).join(','));
 const facts=list=>`expected_functions(signature,hash,security_definer,volatility) as (values ${list.map(f=>`(${q(f.signature)},${q(f.hash)},${f.securityDefiner},${q(f.volatility)})`).join(',\n')}),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false))`;
 const summary=flag=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as ${flag},
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num`;
 const header='-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n-- Stop on failed_checks. Compare upstream_evidence_hashes before and after apply.\n';
 const pre=header+`with ${facts([...prior.values()])},protected as(${protectedSql}),
 competing as(select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','p','v','m') and c.relname ~ '(revenue_allocation|money_allocation)'),
 checks(name,passed) as(values
 ('044_objects_unused',not exists(select 1 from competing) and ${funcs.map(f=>`to_regprocedure(${q(f.signature)}) is null`).join(' and ')}),
 ('predecessor_functions_exact',not exists(select 1 from function_differences)),
 ('source_contracts_present',to_regclass('public.finance_payment_effective_invoice_allocations') is not null and to_regclass('public.finance_payment_wht_components') is not null and to_regclass('public.finance_tax_document_corrections') is not null),
 ('no_cutover',not exists(select 1 from public.finance_account_opening_balances)))
 ${summary('payment_money_allocation_preflight_pass')},(select coalesce(jsonb_agg(relname),'[]') from competing) as competing_domains;
`;
 const files={[filenames.pre]:pre},manifest=path.join(__dirname,'money-allocation-catalog.json');if(!fs.existsSync(manifest))return files;
 const guards=['finance_payments','finance_invoices','finance_invoice_items','finance_payment_allocation_reallocations','finance_payment_invoice_allocations','finance_payment_wht_components','finance_tax_document_corrections'];
 const verify=header+`with ${facts([...prior.values(),...funcs])},protected as(${protectedSql}),
 expected_catalog as(select value from jsonb_array_elements(${q(fs.readFileSync(manifest,'utf8'))}::jsonb)),actual_catalog as(${catalogSql}),
 catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('no_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('source_guards',${guards.map(t=>`(select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.${t}'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure)`).join(' and ')}),
 ('private_and_rpc_privileges',${funcs.map(f=>`(has_function_privilege('authenticated',${q(f.signature)},'EXECUTE')=${['get_finance_money_allocation','save_finance_money_allocation','transition_finance_money_allocation'].includes(f.name)} and not has_function_privilege('anon',${q(f.signature)},'EXECUTE'))`).join(' and ')}),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in (${tables.map(t=>`'public.${t}'::regclass`).join(',')}))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.money044_before',true),'') is null or current_setting('vp.money044_before',true)=(select evidence::text from protected)))
 ${summary('payment_money_allocation_foundation_verification_pass')},(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object(${tables.map(t=>`${q(t)},(select count(*) from public.${t})`).join(',')}) as new_rows;
`;
 return {...files,[filenames.verify]:verify,[filenames.dry]:`BEGIN;\n-- ROLLBACK only. No business RPCs or UAT row creation.\nselect set_config('vp.money044_before',evidence::text,true) from (${protectedSql}) p;\n-- BEGIN EMBEDDED MIGRATION 044\n${sql}-- END EMBEDDED MIGRATION 044\n${verify}ROLLBACK;\n`};
}
module.exports={workflow,catalogSql,migrationPath,filenames};
if(require.main===module){for(const [file,content] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,file),content);else assert.equal(read(file),content,file);}console.log('044 operator artifacts verified');}
