/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic local operator artifacts. Never connects to a database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {functionFacts}=require('./combined-document-workflow.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migrationPath='supabase/migrations/202607180042_add_customer_tax_identity_profile.sql';
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const tables=['finance_customer_tax_profiles','finance_customer_tax_profile_audit_events'];
const catalogSql=`select c.relname as name,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${tables.map(quote).join(',')}) order by c.relname`;
const protectedSql=`select jsonb_build_object(
 'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.finance_invoices i where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.finance_payments p where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 'clients',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.clients c where id in (select client_id from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')))
 ) as evidence`;
function workflow() {
 const sql=read(migrationPath),newFacts=functionFacts(sql);
 const required=['build_finance_document_tax_source','finance_tax_invoice_draft_snapshot','build_finance_receipt_source','document_logo_evidence',
 'finance_tax_invoice_issue_blockers','get_finance_document_decision','current_user_can_view_finance_tax_invoices','current_user_can_manage_finance_tax_invoices',
 'issue_finance_combined_document','refresh_finance_combined_document_draft','issue_finance_tax_invoice','issue_finance_receipt','confirm_finance_payment','save_finance_payment_wht_lines_draft'];
 const previous=new Map();
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^2026071800(2[2-9]|3[0-9]|4[01])_/.test(f)).sort())
  for(const f of functionFacts(read('supabase/migrations/'+file)))if(required.includes(f.name))previous.set(f.name,f);
 assert.equal(previous.size,required.length,'Missing predecessors: '+required.filter(n=>!previous.has(n)).join(','));
 const facts=list=>`expected_functions(signature,hash,callable,security_definer,volatility) as (values ${list.map(f=>`(${quote(f.signature)},${quote(f.hash)},${f.callable},${f.securityDefiner},${quote(f.volatility)})`).join(',\n')}),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature))`;
 const common=`protected_evidence as (${protectedSql}),
 client_columns as (select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='clients'),
 competing_fields as (select column_name from client_columns where column_name ~* '(vat|branch|tax.*address|tax.*evidence|tax.*verif|legal_name|billing_address)'),
 competing_profiles as (select table_name from information_schema.tables where table_schema='public' and table_name ~* '(client|customer).*(tax|vat)|(tax|vat).*(client|customer)' and table_name not in (${tables.map(quote).join(',')})),
 protected_checks(name,passed) as (values
 ('protected_invoices',(select count(*)=2 and bool_and(document_status='issued' and ((id='74461042-e3ba-4922-9b64-55aac9ebd8aa' and invoice_no='VP-IV-202609-000003' and total_amount=5000) or (id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and vat_amount=607.10))) from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6'))),
 ('protected_payments',(select count(*)=2 and bool_and(status='confirmed' and ((id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) or (id='95e22d0e-1996-4f16-98e4-218db1cbd857' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280))) from public.finance_payments where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857'))),
 ('protected_receipt',(select count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('client_columns_compatible',(select count(*)=6 and bool_and(case when column_name='id' then udt_name='uuid' else data_type in ('text','character varying') end) from client_columns where column_name in ('id','name','tax_id','address','client_type','status'))),
 ('no_competing_profile_to_review',not exists(select 1 from competing_fields) and not exists(select 1 from competing_profiles))
 )`;
 const exact=`(select bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)`;
 const summary=flag=>`select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as ${flag},
 (select md5(evidence::text) from protected_evidence) as protected_evidence_hash,
 (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from client_columns c) as client_columns,
 (select coalesce(jsonb_agg(column_name),'[]') from competing_fields) as competing_client_fields,
 (select coalesce(jsonb_agg(table_name),'[]') from competing_profiles) as competing_profile_tables,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_facts f where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences`;
 const header='-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n-- Compare protected_evidence_hash before/after apply; stop on ANY failed check.\n-- Competing Client tax fields/profiles require schema review, never automatic overwrite.\n';
 const pre=header+`with ${facts([...previous.values()])},${common},
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('042_unused',${tables.map(t=>`to_regclass('public.${t}') is null`).join(' and ')} and to_regprocedure('public.document_tax_source_pre042(uuid)') is null and to_regprocedure('public.document_tax_snapshot_pre042(jsonb,jsonb,date)') is null and to_regprocedure('public.get_finance_customer_tax_profile(uuid)') is null),
 ('predecessor_contracts_exact',${exact})
 ) x(name,passed)) ${summary('customer_tax_identity_preflight_pass')};\n`;
 const paths={'scripts/sql/preflight_customer_tax_identity.sql':pre};
 const manifestPath=path.join(root,'scripts/tests/customer-tax-profile-catalog.json');
 if(!fs.existsSync(manifestPath))return paths;
 const preserved=[...previous.values()].map(f=>newFacts.some(n=>n.signature===f.signature)?{...f,signature:f.signature.replace(f.name,f.name==='build_finance_document_tax_source'?'document_tax_source_pre042':'document_tax_snapshot_pre042'),callable:false}:f);
 const verifier=header+`with ${facts([...newFacts,...preserved])},${common},
 expected_catalog as (select value from jsonb_array_elements(${quote(fs.readFileSync(manifestPath,'utf8'))}::jsonb)), actual_catalog as (${catalogSql}),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_new_and_preserved_functions',${exact}),
 ('new_private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts where signature in (${newFacts.map(f=>quote(f.signature)).join(',')}))),
 ('private_predecessors',not has_function_privilege('authenticated','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE') and not has_function_privilege('anon','public.document_tax_source_pre042(uuid)','EXECUTE') and not has_function_privilege('anon','public.document_tax_snapshot_pre042(jsonb,jsonb,date)','EXECUTE')),
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('rls_no_browser_mutation',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in (${tables.map(t=>`'public.${t}'::regclass`).join(',')}))),
 ('read_policies_only',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_tax_invoices()' and with_check is null) from pg_policies where schemaname='public' and tablename in (${tables.map(quote).join(',')}))),
 ('audit_immutable',(select count(*)=1 and bool_and(tgtype=27 and tgenabled='O' and tgfoid='public.protect_customer_tax_profile_audit()'::regprocedure) from pg_trigger where tgrelid='public.finance_customer_tax_profile_audit_events'::regclass and not tgisinternal)),
 ('new_profile_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax042_before',true),'') is null or current_setting('vp.tax042_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) ${summary('customer_tax_identity_verification_pass')},
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object(${tables.map(t=>`${quote(t)},(select count(*) from public.${t})`).join(',')}) as new_rows;\n`;
 return {...paths,'scripts/sql/verify_customer_tax_identity.sql':verifier,
 'scripts/sql/dry_run_customer_tax_identity.sql':`BEGIN;\n-- Local transaction setting only: before/after protected-row evidence, rolled back.\nselect set_config('vp.tax042_before',md5(evidence::text),true) from (${protectedSql}) p;\n-- BEGIN EMBEDDED MIGRATION 042\n${sql}-- END EMBEDDED MIGRATION 042\n${verifier}ROLLBACK;\n`};
}
module.exports={workflow,catalogSql,migrationPath};
if(require.main===module){const artifacts=workflow();if(process.argv.includes('--check')){for(const [file,content] of Object.entries(artifacts))assert.equal(read(file),content,file);console.log('Exact 042 artifacts verified');}else if(process.argv.includes('--write')){for(const [file,content] of Object.entries(artifacts))fs.writeFileSync(path.join(root,file),content);}else console.log(JSON.stringify(artifacts));}
