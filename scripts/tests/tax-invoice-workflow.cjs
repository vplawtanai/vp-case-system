/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sqlString=s=>"'"+s.replaceAll("'","''")+"'";
const tableNames=['finance_tax_invoices','finance_tax_invoice_items','finance_tax_invoice_source_coverages','finance_tax_point_events','finance_tax_invoice_audit_events'];
const publicFunctions=['current_user_can_view_finance_tax_invoices','current_user_can_manage_finance_tax_invoices','current_user_can_issue_finance_tax_invoices','get_finance_tax_invoice_eligibility','create_finance_tax_invoice_draft','save_finance_tax_invoice_draft','refresh_finance_tax_invoice_draft','issue_finance_tax_invoice','cancel_finance_tax_invoice_draft'];
function functions(sql){
  return [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/gi)].map(match=>{
    const name=match[1],fn=definition(sql,name),tag=/\bas\s+(\$\w*\$)/i.exec(fn);
    const body=fn.slice(tag.index+tag[0].length,fn.lastIndexOf(tag[1]));
    const args=fn.slice(fn.indexOf('(')+1,fn.indexOf(')')).split(',').map(s=>s.trim().split(/\s+/)[1]).filter(Boolean).join(',');
    return {name,args,hash:crypto.createHash('md5').update(body).digest('hex'),definer:/security definer/i.test(fn),callable:publicFunctions.includes(name)};
  });
}
function workflow(migration){
  const prior=read('supabase/migrations/202607180037_create_finance_receipt_foundation.sql');
  const logo=read('supabase/migrations/202607180038_add_immutable_document_logo_evidence.sql');
  const modified=functions(migration),preserved=functions(logo).filter(f=>['document_logo_evidence','build_finance_receipt_source','issue_finance_receipt','refresh_finance_receipt_draft'].includes(f.name));
  const earlier=functions(prior).filter(f=>modified.some(n=>n.name===f.name));
  const functionsCte=list=>`expected_functions(name,signature,body_hash,definer,callable) as (values\n${list.map(f=>`  (${sqlString(f.name)},${sqlString(`public.${f.name}(${f.args})`)},${sqlString(f.hash)},${f.definer},${f.callable})`).join(',\n')}\n), function_facts as (select e.*,p.oid,p.prosecdef,p.proconfig,md5(p.prosrc)=e.body_hash as exact_body,\n  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,\n  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute\n  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature))`;
  const protectedCtes=`protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
protected_observation as (select jsonb_build_object(
  'payment',(select to_jsonb(p) from protected_payment p),'invoice',(select to_jsonb(i)-'issued_snapshot_json'-'draft_snapshot_json' from protected_invoice i),
  'receipt',(select to_jsonb(r)-'issued_snapshot_json'-'draft_snapshot_json' from protected_receipt r),
  'payment_hash',(select md5(to_jsonb(p)::text) from protected_payment p),
  'invoice_hash',(select md5(to_jsonb(i)::text) from protected_invoice i),
  'receipt_hash',(select md5(to_jsonb(r)::text) from protected_receipt r),
  'cash_rows',(select count(*) from public.finance_cash_transactions),'opening_rows',(select count(*) from public.finance_account_opening_balances),
  'legacy_ledger_rows',(select count(*) from public.finance_company_ledger),
  'buyer_identity_incomplete',(select nullif(btrim(issued_snapshot_json #>> '{customer,address}'),'') is null from protected_invoice)
) as facts),
protected_checks(name,passed) as (values
  ('protected_payment_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
  ('protected_invoice_unchanged_facts',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and amount_before_vat=4672.90 and vat_amount=327.10 and total_amount=5000),false) from protected_invoice)),
  ('protected_receipt_unchanged_facts',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000 and issued_snapshot_json->'schema_version'='2'::jsonb),false) from protected_receipt)),
  ('protected_effective_settlement',(select count(*)=1 and coalesce(bool_and(effective_cash_allocated=4859.81 and effective_wht_credit_allocated=140.19 and effective_settlement_total=5000),false) from public.finance_payment_effective_invoice_allocations where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and invoice_id='74461042-e3ba-4922-9b64-55aac9ebd8aa')),
  ('protected_no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
)`;
  const profile=`(select count(*)=1 and coalesce(bool_and(is_active and display_prefix='VP-TI' and period_scope='monthly' and sequence_width=6),false) from public.document_numbering_profiles where document_type='tax_invoice')`;
  const counter=`not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('tax_invoice','ti','vp-ti') or prefix like 'VP-TI-%')`;
  const summary=flag=>`select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
  (select facts from protected_observation) as protected_uat_observation,
  coalesce((select bool_and(passed is true) from checks),false) as ${flag}`;
  const header=`-- Phase 6B manual SQL Editor review: ONE SELECT-only statement, ONE result row.
-- No lifecycle RPC calls. No business writes. Global Ledger counts are observation only.
-- Compare protected full-row hashes before/after apply; fixed facts are independently checked.
-- Technical catalog checks cannot verify external/manual VAT coverage or legal tax-point facts.
-- Those remain mandatory human decisions at Issue, not approval granted by this script.
`;
  const absent=tableNames.map(t=>`to_regclass('public.${t}') is null`).join(' and ');
  const preflight=header+`with ${functionsCte([...earlier,...preserved])},\n${protectedCtes},
checks(name,passed) as (select * from protected_checks union all select * from (values
  ('039_names_unused',${absent} and to_regprocedure('public.create_finance_tax_invoice_draft(uuid)') is null),
  ('new_permissions_absent',not exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name in ('can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices'))),
  ('numbering_profile_valid',${profile}),('no_tax_invoice_number_consumption',${counter}),
  ('exact_predecessor_functions',(select bool_and(oid is not null and exact_body and prosecdef=definer and proconfig @> array['search_path=public']) from function_facts)),
  ('private_allocator_preserved',not coalesce(has_function_privilege('authenticated',to_regprocedure('public.generate_finance_document_no(text,date)'),'EXECUTE'),true)),
  ('required_upstream_tables_present',to_regclass('public.finance_invoice_items') is not null and to_regclass('public.finance_payment_allocation_reallocations') is not null),
  ('logo_038_read_boundary_present',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='SELECT' and qual like '%current_user_can_view_finance_receipts%')),
  ('new_logo_policy_absent',not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tax_invoice_document_logos_read'))
) v(name,passed))\n${summary('tax_invoice_foundation_preflight_pass')};\n`;
  const manifest=read('scripts/tests/tax-invoice-catalog.json');
  const verifier=header+`with ${functionsCte(modified)},
expected_tables as (select value as spec from jsonb_array_elements(${sqlString(manifest)}::jsonb)),
table_facts as (select e.spec,c.oid,c.relrowsecurity,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'has_default',d.oid is not null,'default_expression',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
  -- PostgreSQL 18 adds table NOT NULL catalog rows. Check nullability through attnotnull on every version.
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'valid',con.convalidated,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype <> 'n') as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'unique',i.indisunique,'valid',i.indisvalid,'definition',pg_get_indexdef(i.indexrelid)) order by idx.relname) from pg_index i join pg_class idx on idx.oid=i.indexrelid where i.indrelid=c.oid) as indexes
  from expected_tables e left join pg_class c on c.oid=to_regclass('public.'||(e.spec->>'name'))),
catalog_objects as (
  select t.spec->>'name' as table_name,part.category,side.source,item.value->>'name' as object_name,item.value as definition
  from table_facts t
  cross join lateral (values ('columns',t.spec->'columns',t.columns),('constraints',t.spec->'constraints',t.constraints),('indexes',t.spec->'indexes',t.indexes)) part(category,expected,actual)
  cross join lateral (values ('expected',part.expected),('actual',part.actual)) side(source,objects)
  cross join lateral jsonb_array_elements(side.objects) item(value)
), catalog_pairs as (
  select coalesce(e.table_name,a.table_name) as table_name,coalesce(e.category,a.category) as category,
    coalesce(e.object_name,a.object_name) as object_name,e.definition as expected,a.definition as actual
  from (select * from catalog_objects where source='expected') e
  full join (select * from catalog_objects where source='actual') a using(table_name,category,object_name)
), catalog_differences as (
  select p.table_name,p.category,p.object_name,d.property,d.expected,d.actual,
    case when p.actual is null then 'missing_object' when p.expected is null then 'unexpected_object' else 'property_mismatch' end as reason
  from catalog_pairs p cross join lateral (
    select null::text as property,p.expected,p.actual where p.expected is null or p.actual is null
    union all
    select coalesce(e.key,a.key),e.value,a.value
    from jsonb_each(p.expected) e full join jsonb_each(p.actual) a using(key)
    where p.expected is not null and p.actual is not null and e.value is distinct from a.value
  ) d
  union all
  select spec->>'name','table',spec->>'name','exists','true'::jsonb,'false'::jsonb,'missing_object'
  from table_facts where oid is null
),
${protectedCtes},
checks(name,passed) as (select * from protected_checks union all select * from (values
  ('exact_039_functions_and_search_path',(select count(*)=${modified.length} and bool_and(oid is not null and exact_body and prosecdef=definer and proconfig @> array['search_path=public']) from function_facts)),
  ('rpc_and_private_grants',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
  ('exact_tables_columns_constraints_indexes',(select count(*)=5 from table_facts) and not exists(select 1 from catalog_differences)),
  ('rls_and_browser_direct_mutation_blocked',(select bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from table_facts)),
  ('only_permission_gated_read_policies',(select count(*)=5 and bool_and(p.cmd='SELECT' and p.roles=array['authenticated']::name[] and p.qual like '%current_user_can_view_finance_tax_invoices%') from pg_policies p join table_facts t on p.tablename=t.spec->>'name' where p.schemaname='public')),
  ('append_only_and_deferred_integrity_triggers',(select count(*)=10 and bool_and(g.tgenabled='O' and ((g.tgname='tax_invoice_history' and g.tgfoid=to_regprocedure('public.protect_finance_tax_invoice_history()')) or (g.tgname='tax_invoice_integrity' and g.tgdeferrable and g.tginitdeferred and g.tgfoid=to_regprocedure('public.validate_finance_tax_invoice_integrity()')))) from pg_trigger g join table_facts t on t.oid=g.tgrelid where not g.tgisinternal)),
  ('upstream_dependency_triggers',(select count(*)=4 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.guard_finance_tax_invoice_upstream()')) from pg_trigger where tgname in ('tax_invoice_payment_guard','tax_invoice_invoice_guard','tax_invoice_receipt_guard','tax_invoice_reallocation_guard') and not tgisinternal)),
  ('permission_escalation_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgfoid=to_regprocedure('public.protect_finance_tax_invoice_permissions()')) from pg_trigger where tgname='protect_finance_tax_invoice_permissions' and tgrelid='public.user_profiles'::regclass)),
  ('new_permissions_default_false',(select count(*)=3 and bool_and(data_type='boolean' and is_nullable='NO' and column_default='false') from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name in ('can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices'))),
  ('logo_read_policy',(select count(*)=1 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual like '%current_user_can_view_finance_tax_invoices%' and qual like '%company/logo/%') from pg_policies where schemaname='storage' and tablename='objects' and policyname='tax_invoice_document_logos_read')),
  ('numbering_profile_valid',${profile}),('no_tax_invoice_number_consumption',${counter}),
  ('tax_foundation_zero_state',${tableNames.map(t=>`not exists(select 1 from public.${t})`).join(' and ')}),
  ('receipt_038_functions_unchanged',${preserved.map(f=>`coalesce((select md5(prosrc)=${sqlString(f.hash)} from pg_proc where oid=to_regprocedure(${sqlString(`public.${f.name}(${f.args})`)})),false)`).join(' and ')})
) v(name,passed))\n${summary('tax_invoice_foundation_verification_pass')},
  current_setting('server_version_num')::integer as catalog_server_version_num,
  (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,category,object_name,property),'[]'::jsonb) from catalog_differences d) as catalog_differences,
  jsonb_build_object(${tableNames.map(t=>`${sqlString(t)},(select count(*) from public.${t})`).join(',')}) as tax_foundation_rows;\n`;
  return {'scripts/sql/preflight_finance_tax_invoice_foundation.sql':preflight,'scripts/sql/verify_finance_tax_invoice_foundation.sql':verifier,
    'scripts/sql/dry_run_finance_tax_invoice_foundation.sql':`BEGIN;\n-- Manual schema rehearsal only. No business lifecycle calls.\n-- BEGIN EMBEDDED MIGRATION 039\n${migration}-- END EMBEDDED MIGRATION 039\n${verifier}ROLLBACK;\n`};
}
module.exports={workflow,functions,tableNames};
