-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_hash before/after apply; stop on ANY failed check.
-- Competing Client tax fields/profiles require schema review, never automatic overwrite.
with expected_functions(signature,hash,callable,security_definer,volatility) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',false,true,'v'),
('public.build_finance_receipt_source(uuid)','1fe91b4d85e36bdc913b5427f5a8e270',false,true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',false,true,'v'),
('public.current_user_can_view_finance_tax_invoices()','61b920f71b441ab396a6058f9903c903',false,true,'s'),
('public.current_user_can_manage_finance_tax_invoices()','d049e03a67dd6c81f2309d134138dcb6',false,true,'s'),
('public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','bef394e77841bd9e6394511f3eebc7bd',false,false,'i'),
('public.finance_tax_invoice_issue_blockers(jsonb)','e7f592f622ab0494cbf15c160b2807bb',false,false,'i'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,true,'v'),
('public.build_finance_document_tax_source(uuid)','1629c804cf013b519759d672541d7d09',false,true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,true,'v'),
('public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)','dfbd31e473a7d682a1329c18a7c1ee93',true,true,'v')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
 coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
 coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),protected_evidence as (select jsonb_build_object(
 'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.finance_invoices i where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.finance_payments p where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 'clients',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.clients c where id in (select client_id from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6')))
 ) as evidence),
 client_columns as (select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='clients'),
 competing_fields as (select column_name from client_columns where column_name ~* '(vat|branch|tax.*address|tax.*evidence|tax.*verif|legal_name|billing_address)'),
 competing_profiles as (select table_name from information_schema.tables where table_schema='public' and table_name ~* '(client|customer).*(tax|vat)|(tax|vat).*(client|customer)' and table_name not in ('finance_customer_tax_profiles','finance_customer_tax_profile_audit_events')),
 protected_checks(name,passed) as (values
 ('protected_invoices',(select count(*)=2 and bool_and(document_status='issued' and ((id='74461042-e3ba-4922-9b64-55aac9ebd8aa' and invoice_no='VP-IV-202609-000003' and total_amount=5000) or (id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and vat_amount=607.10))) from public.finance_invoices where id in ('74461042-e3ba-4922-9b64-55aac9ebd8aa','a392a5ec-cc84-4c74-bd7a-5636a984f9c6'))),
 ('protected_payments',(select count(*)=2 and bool_and(status='confirmed' and ((id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) or (id='95e22d0e-1996-4f16-98e4-218db1cbd857' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280))) from public.finance_payments where id in ('9e2f601e-13ef-4165-8e2c-1887c3ad8861','95e22d0e-1996-4f16-98e4-218db1cbd857'))),
 ('protected_receipt',(select count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('client_columns_compatible',(select count(*)=6 and bool_and(case when column_name='id' then udt_name='uuid' else data_type in ('text','character varying') end) from client_columns where column_name in ('id','name','tax_id','address','client_type','status'))),
 ('no_competing_profile_to_review',not exists(select 1 from competing_fields) and not exists(select 1 from competing_profiles))
 ),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('042_unused',to_regclass('public.finance_customer_tax_profiles') is null and to_regclass('public.finance_customer_tax_profile_audit_events') is null and to_regprocedure('public.document_tax_source_pre042(uuid)') is null and to_regprocedure('public.document_tax_snapshot_pre042(jsonb,jsonb,date)') is null and to_regprocedure('public.get_finance_customer_tax_profile(uuid)') is null),
 ('predecessor_contracts_exact',(select bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as customer_tax_identity_preflight_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_hash,
 (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from client_columns c) as client_columns,
 (select coalesce(jsonb_agg(column_name),'[]') from competing_fields) as competing_client_fields,
 (select coalesce(jsonb_agg(table_name),'[]') from competing_profiles) as competing_profile_tables,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_facts f where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences;
