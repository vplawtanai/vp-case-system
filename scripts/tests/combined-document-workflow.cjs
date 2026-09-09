/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const tables=['finance_combined_documents','finance_combined_document_audit_events'];
const extendedTables=[...tables,'finance_receipts','finance_tax_invoices','finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items'];
const catalogSql=`select c.relname as name,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and (c.relname in (${tables.map(quote).join(',')}) or a.attname in ('combined_document_id','vat_treatment_json'))) as columns,
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n'
    and (c.relname in (${tables.map(quote).join(',')}) or con.conname in ('document_vat_evidence_object','finance_receipts_lifecycle_check','tax_invoice_lifecycle') or con.conname like '%combined_document_id%')) as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'definition',pg_get_indexdef(ix.indexrelid)) order by idx.relname) from pg_index ix join pg_class idx on idx.oid=ix.indexrelid where ix.indrelid=c.oid
    and (c.relname in (${tables.map(quote).join(',')}) or idx.relname like '%combined_document_id%')) as indexes
  from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${extendedTables.map(quote).join(',')}) order by c.relname`;
function functionFacts(sql){
  return [...new Set([...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(m=>m[1]))].map(name=>{
    const fn=definition(sql,name),tag=/\bas\s+(\$\w*\$)/i.exec(fn),body=fn.slice(tag.index+tag[0].length,fn.lastIndexOf(tag[1]));
    const args=fn.slice(fn.indexOf('(')+1,fn.indexOf(')')).split(',').map(s=>s.trim().split(/\s+/)[1]).filter(Boolean).join(',');
    return {name,signature:`public.${name}(${args})`,hash:crypto.createHash('md5').update(body).digest('hex'),
      securityDefiner:/security definer/i.test(fn.slice(0,tag.index)),volatility:/\bimmutable\b/i.test(fn.slice(0,tag.index))?'i':/\bstable\b/i.test(fn.slice(0,tag.index))?'s':'v',
      callable:sql.includes(`grant execute on function public.${name}(${args}) to authenticated;`)};
  });
}
function workflow(sql){
 const header='-- ONE SELECT-only statement, ONE result row. No lifecycle calls or business writes.\n-- Compare protected_evidence_hashes between preflight and verification.\n';
 const protectedCte=`protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
 protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
 protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 protected_checks(name,passed) as (values
 ('protected_payment',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
 ('protected_invoice',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and total_amount=5000 and amount_before_vat=4672.90 and vat_amount=327.10),false) from protected_invoice)),
 ('protected_receipt',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and issued_snapshot_json->>'schema_version'='2'),false) from protected_receipt)),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
 )`;
 const summary=flag=>`select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as ${flag},
 jsonb_build_object('payment',(select md5(to_jsonb(p)::text) from protected_payment p),'invoice',(select md5(to_jsonb(i)::text) from protected_invoice i),
   'receipt',(select md5((to_jsonb(r)-'combined_document_id')::text) from protected_receipt r)) as protected_evidence_hashes`;
 const funcs=functionFacts(sql);
 const facts=list=>`expected_functions(signature,hash,callable,security_definer,volatility) as (values ${list.map(f=>`(${quote(f.signature)},${quote(f.hash)},${f.callable},${f.securityDefiner},${quote(f.volatility)})`).join(',\n')}),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
   coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
   coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature))`;
 const predecessors=new Map();
 for(const number of ['34','35','37','38','39']){
   const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.startsWith('2026071800'+number+'_'));
   for(const f of functionFacts(read('supabase/migrations/'+file))) if(funcs.some(n=>n.signature===f.signature)||['document_logo_evidence','build_finance_receipt_source'].includes(f.name)) predecessors.set(f.signature,f);
 }
 const pre=header+`-- Mandatory human gate: change FALSE only after confirming no external VP-RTI use/reservations.\nwith manual_gate as (select false as external_vp_rti_unused_confirmed),
 ${facts([...predecessors.values()])}, ${protectedCte},
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('040_objects_absent',${tables.map(t=>`to_regclass('public.${t}') is null`).join(' and ')} and to_regprocedure('public.create_finance_combined_document_draft(uuid,boolean,boolean)') is null),
 ('predecessor_functions_exact',(select bool_and(oid is not null and exact_body) from function_facts)),
 ('no_prior_rti_profile',not exists(select 1 from public.document_numbering_profiles where document_type='receipt_tax_invoice' or display_prefix='VP-RTI')),
 ('no_prior_rti_counter',not exists(select 1 from public.finance_document_counters where doc_type='receipt_tax_invoice' or prefix like 'VP-RTI-%')),
 ('prospective_columns_absent',not exists(select 1 from information_schema.columns where table_schema='public' and column_name in ('combined_document_id','vat_treatment_json') and table_name in ('finance_receipts','finance_tax_invoices','finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items'))),
 ('no_existing_tax_documents',not exists(select 1 from public.finance_tax_invoices)),
 ('standalone_profiles_compatible',(select count(*)=2 and bool_and(period_scope='monthly' and sequence_width=6 and is_active and display_prefix=case document_type when 'receipt' then 'VP-RC' else 'VP-TI' end) from public.document_numbering_profiles where document_type in ('receipt','tax_invoice'))),
 ('external_manual_vp_rti_gate',(select external_vp_rti_unused_confirmed from manual_gate))
 ) x(name,passed)) ${summary('combined_receipt_tax_invoice_preflight_pass')},
 true as manual_external_number_check_required,
 (select coalesce(jsonb_agg(signature),'[]') from function_facts where oid is null or exact_body is distinct from true) as predecessor_differences;\n`;
 const manifestPath=path.join(root,'scripts/tests/combined-document-catalog.json');
 if(!fs.existsSync(manifestPath))return {'scripts/sql/preflight_combined_receipt_tax_invoice.sql':pre};
 const manifest=fs.readFileSync(manifestPath,'utf8');
 const verifier=header+`with ${facts(funcs)}, ${protectedCte},
 expected_catalog as (select value from jsonb_array_elements(${quote(manifest)}::jsonb)), actual_catalog as (${catalogSql}),
 catalog_differences as (select e.value->>'name' as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e
   full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_040_functions',(select count(*)=${funcs.length} and bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)),
 ('private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('new_rls_direct_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid=any(array[${tables.map(t=>`'public.${t}'::regclass`).join(',')}]))),
 ('paired_deferred_guards',(select count(*)=4 and bool_and(tgdeferrable and tginitdeferred and tgenabled='O' and tgfoid='public.validate_finance_combined_document()'::regprocedure and tgrelid in ('public.finance_combined_documents'::regclass,'public.finance_combined_document_audit_events'::regclass,'public.finance_receipts'::regclass,'public.finance_tax_invoices'::regclass)) from pg_trigger where tgname='combined_integrity')),
 ('explicit_read_policies',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_combined_documents()' and with_check is null) from pg_policies where schemaname='public' and tablename in (${tables.map(quote).join(',')}))),
 ('vat_propagation_triggers',(select count(*)=5 and bool_and(tgenabled='O' and tgtype=23 and tgfoid='public.inherit_finance_document_vat_treatment()'::regprocedure) from pg_trigger where tgname='z_document_vat_inherit')),
 ('invoice_issue_vat_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=19 and tgfoid='public.guard_finance_prospective_invoice_vat()'::regprocedure and tgrelid='public.finance_invoices'::regclass) from pg_trigger where tgname='document_vat_issue_guard')),
 ('new_zero_state',${tables.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
 ('no_standalone_reinterpretation',not exists(select 1 from public.finance_receipts where combined_document_id is not null) and not exists(select 1 from public.finance_tax_invoices where combined_document_id is not null)),
 ('rti_profile',(select count(*)=1 and bool_and(display_prefix='VP-RTI' and period_scope='monthly' and sequence_width=6 and is_active) from public.document_numbering_profiles where document_type='receipt_tax_invoice')),
 ('no_rti_number_consumed',not exists(select 1 from public.finance_document_counters where doc_type='receipt_tax_invoice' or prefix like 'VP-RTI-%')),
 ('prospective_columns',(select count(*)=5 from information_schema.columns where table_schema='public' and table_name in ('finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items') and column_name='vat_treatment_json' and data_type='jsonb' and is_nullable='YES'))
 ) x(name,passed)) ${summary('combined_receipt_tax_invoice_foundation_verification_pass')},
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(signature),'[]') from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences,
 jsonb_build_object(${tables.map(t=>`${quote(t)},(select count(*) from public.${t})`).join(',')}) as combined_rows;\n`;
 return {'scripts/sql/preflight_combined_receipt_tax_invoice.sql':pre,'scripts/sql/verify_combined_receipt_tax_invoice.sql':verifier,
 'scripts/sql/dry_run_combined_receipt_tax_invoice.sql':`BEGIN;\n-- Rollback-only schema rehearsal. No business lifecycle calls.\n-- BEGIN EMBEDDED MIGRATION 040\n${sql}-- END EMBEDDED MIGRATION 040\n${verifier}ROLLBACK;\n`};
}
module.exports={workflow,catalogSql,functionFacts};
