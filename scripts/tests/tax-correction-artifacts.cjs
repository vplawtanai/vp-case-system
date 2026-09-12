/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic operator artifacts, generated locally without any network access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {functionFacts}=require('./combined-document-workflow.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),quote=s=>"'"+s.replaceAll("'","''")+"'";
const migrationPath='supabase/migrations/202607180043_add_tax_document_correction_foundation.sql';
const tables=['finance_tax_document_corrections','finance_tax_correction_lines','finance_tax_correction_documents','finance_tax_correction_audit_events'];
const catalogSql=`select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${tables.map(quote).join(',')}) order by c.relname`;
const protectedSql=`select jsonb_build_object(
 'combined',(select to_jsonb(c) from public.finance_combined_documents c where id='d903b209-1e29-4a60-a453-032611a7202f'),
 'tax',(select to_jsonb(t) from public.finance_tax_invoices t where id=(select tax_invoice_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id=(select receipt_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'invoice',(select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'),
 'payment',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'client',(select to_jsonb(c) from public.clients c where id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'profile',(select to_jsonb(p) from public.finance_customer_tax_profiles p where client_id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by c.doc_type,c.year,c.month),'[]') from public.finance_document_counters c)
 ) as evidence`;
const filenames={pre:'scripts/sql/preflight_tax_document_correction_foundation.sql',verify:'scripts/sql/verify_tax_document_correction_foundation.sql',dry:'scripts/sql/dry_run_tax_document_correction_foundation.sql'};
function workflow(){
 const sql=read(migrationPath),funcs=functionFacts(sql).map(f=>({...f,callable:['tax_correction_authorized','create_finance_tax_correction_draft','approve_finance_tax_correction','issue_finance_tax_correction','cancel_finance_tax_correction_draft','get_finance_tax_correction_context'].includes(f.name)}));
 const required=['issue_finance_combined_document','refresh_finance_combined_document_draft','issue_finance_tax_invoice','issue_finance_receipt','void_finance_receipt','confirm_finance_payment','reverse_finance_payment','generate_finance_document_no','document_logo_evidence','finance_customer_tax_identity','get_finance_customer_tax_profile','validate_finance_combined_document','get_finance_document_decision'];
 const prior=new Map();
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^2026071800(2[2-9]|3[0-9]|4[0-2])_/.test(f)).sort())for(const f of functionFacts(read('supabase/migrations/'+file)))if(required.includes(f.name))prior.set(f.name,f);
 assert.equal(prior.size,required.length,'Missing predecessor '+required.filter(n=>!prior.has(n)));
 const facts=list=>`expected_functions(signature,hash,security_definer,volatility) as (values ${list.map(f=>`(${quote(f.signature)},${quote(f.hash)},${f.securityDefiner},${quote(f.volatility)})`).join(',\n')}),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as (select * from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false))`;
 const common=`protected_evidence as (${protectedSql}),protected_checks(name,passed) as (values
 ('protected_combined_draft',(select count(*)=1 and bool_and(status='draft' and combined_no is null and issued_at is null and payment_id='95e22d0e-1996-4f16-98e4-218db1cbd857') from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 ('protected_invoice',(select count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10) from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 ('protected_payment',(select count(*)=1 and bool_and(status='confirmed' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280) from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('existing_number_profiles_compatible',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'tax_invoice' then 'VP-TI' else 'VP-RTI' end) from public.document_numbering_profiles where document_type in ('tax_invoice','receipt_tax_invoice'))))`;
 const summary=flag=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as ${flag},
 (select md5(evidence::text) from protected_evidence) as protected_evidence_and_counters_hash,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 current_setting('server_version_num')::integer as catalog_server_version_num`;
 const header='-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n-- Compare protected_evidence_and_counters_hash before and after apply. Stop on any failed check.\n';
 const pre=header+`-- Business owner confirmed no external/manual VP-CN or VP-DN numbers have ever been issued or reserved.\nwith manual_gate as (select true as external_cn_dn_unused_confirmed),${facts([...prior.values()])},${common},
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('043_objects_unused',${tables.map(t=>`to_regclass('public.${t}') is null`).join(' and ')} and ${funcs.map(f=>`to_regprocedure(${quote(f.signature)}) is null`).join(' and ')}),
 ('predecessor_contracts_exact',not exists(select 1 from function_differences)),
 ('no_competing_correction_domain',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') and c.relname ~* '(credit_note|debit_note|tax.*correct|tax.*replace)')),
 ('cn_dn_profiles_unused',not exists(select 1 from public.document_numbering_profiles where document_type in ('credit_note','debit_note') or display_prefix in ('VP-CN','VP-DN'))),
 ('cn_dn_counters_unused',not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('credit_note','debit_note','cn','dn','vp-cn','vp-dn') or prefix ~ '^VP-(CN|DN)-')),
 ('manual_external_number_gate',(select external_cn_dn_unused_confirmed from manual_gate))
 ) x(name,passed)) ${summary('tax_document_correction_preflight_pass')};\n`;
 const paths={[filenames.pre]:pre},manifest=path.join(root,'scripts/tests/tax-correction-catalog.json');if(!fs.existsSync(manifest))return paths;
 const verify=header+`with ${facts([...prior.values(),...funcs])},${common},
 expected_catalog as (select value from jsonb_array_elements(${quote(fs.readFileSync(manifest,'utf8'))}::jsonb)), actual_catalog as (${catalogSql}),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_043_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_tables_policies_triggers',not exists(select 1 from catalog_differences)),
 ('rpc_private_privileges',${funcs.map(f=>`(has_function_privilege('authenticated',${quote(f.signature)},'EXECUTE')=${f.callable} and not has_function_privilege('anon',${quote(f.signature)},'EXECUTE'))`).join(' and ')}),
 ('browser_direct_mutation_blocked',(select count(*)=4 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in (${tables.map(t=>`'public.${t}'::regclass`).join(',')}))),
 ('correction_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('cn_dn_profiles',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'credit_note' then 'VP-CN' else 'VP-DN' end) from public.document_numbering_profiles where document_type in ('credit_note','debit_note'))),
 ('no_cn_dn_numbers_consumed',not exists(select 1 from public.finance_document_counters where doc_type in ('credit_note','debit_note') or prefix ~ '^VP-(CN|DN)-')),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax043_before',true),'') is null or current_setting('vp.tax043_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) ${summary('tax_document_correction_foundation_verification_pass')},
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object(${tables.map(t=>`${quote(t)},(select count(*) from public.${t})`).join(',')}) as correction_rows;\n`;
 return {...paths,[filenames.verify]:verify,[filenames.dry]:`BEGIN;\n-- Rollback-only rehearsal. No business lifecycle calls; transaction setting rolls back.\nselect set_config('vp.tax043_before',md5(evidence::text),true) from (${protectedSql}) p;\n-- BEGIN EMBEDDED MIGRATION 043\n${sql}-- END EMBEDDED MIGRATION 043\n${verify}ROLLBACK;\n`};
}
module.exports={workflow,catalogSql,migrationPath,filenames};
if(require.main===module){for(const [file,content] of Object.entries(workflow())){if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,file),content);else assert.equal(read(file),content,file);}console.log('043 operator artifacts verified');}
