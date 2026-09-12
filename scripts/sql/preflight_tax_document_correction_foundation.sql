-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_and_counters_hash before and after apply. Stop on any failed check.
-- Business owner confirmed no external/manual VP-CN or VP-DN numbers have ever been issued or reserved.
with manual_gate as (select true as external_cn_dn_unused_confirmed),expected_functions(signature,hash,security_definer,volatility) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v'),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v'),
('public.void_finance_receipt(uuid,text,boolean)','1899822f8a5561379cc46ce002a6b202',true,'v'),
('public.generate_finance_document_no(text,date)','e8930fcf469ccd9980785d55355eef47',true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v'),
('public.validate_finance_combined_document()','972428305229c19520c4e9b2004aed62',true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,'v'),
('public.finance_customer_tax_identity(uuid)','259e4e1c344e24a112eaecd86bc0f6d6',true,'s'),
('public.get_finance_customer_tax_profile(uuid)','b0f24853759ff637123268398ca5cdba',true,'s')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as (select * from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)),protected_evidence as (select jsonb_build_object(
 'combined',(select to_jsonb(c) from public.finance_combined_documents c where id='d903b209-1e29-4a60-a453-032611a7202f'),
 'tax',(select to_jsonb(t) from public.finance_tax_invoices t where id=(select tax_invoice_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id=(select receipt_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'invoice',(select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'),
 'payment',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'client',(select to_jsonb(c) from public.clients c where id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'profile',(select to_jsonb(p) from public.finance_customer_tax_profiles p where client_id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by c.doc_type,c.year,c.month),'[]') from public.finance_document_counters c)
 ) as evidence),protected_checks(name,passed) as (values
 ('protected_combined_draft',(select count(*)=1 and bool_and(status='draft' and combined_no is null and issued_at is null and payment_id='95e22d0e-1996-4f16-98e4-218db1cbd857') from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 ('protected_invoice',(select count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10) from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 ('protected_payment',(select count(*)=1 and bool_and(status='confirmed' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280) from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('existing_number_profiles_compatible',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'tax_invoice' then 'VP-TI' else 'VP-RTI' end) from public.document_numbering_profiles where document_type in ('tax_invoice','receipt_tax_invoice')))),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('043_objects_unused',to_regclass('public.finance_tax_document_corrections') is null and to_regclass('public.finance_tax_correction_lines') is null and to_regclass('public.finance_tax_correction_documents') is null and to_regclass('public.finance_tax_correction_audit_events') is null and to_regprocedure('public.tax_correction_authorized(boolean,text)') is null and to_regprocedure('public.tax_correction_immutable()') is null and to_regprocedure('public.tax_correction_source(uuid,uuid)') is null and to_regprocedure('public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)') is null and to_regprocedure('public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)') is null and to_regprocedure('public.tax_correction_number(text,date)') is null and to_regprocedure('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)') is null and to_regprocedure('public.cancel_finance_tax_correction_draft(uuid,text)') is null and to_regprocedure('public.validate_tax_correction_document()') is null and to_regprocedure('public.get_finance_tax_correction_context(uuid,uuid)') is null),
 ('predecessor_contracts_exact',not exists(select 1 from function_differences)),
 ('no_competing_correction_domain',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v') and c.relname ~* '(credit_note|debit_note|tax.*correct|tax.*replace)')),
 ('cn_dn_profiles_unused',not exists(select 1 from public.document_numbering_profiles where document_type in ('credit_note','debit_note') or display_prefix in ('VP-CN','VP-DN'))),
 ('cn_dn_counters_unused',not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('credit_note','debit_note','cn','dn','vp-cn','vp-dn') or prefix ~ '^VP-(CN|DN)-')),
 ('manual_external_number_gate',(select external_cn_dn_unused_confirmed from manual_gate))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_document_correction_preflight_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_and_counters_hash,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 current_setting('server_version_num')::integer as catalog_server_version_num;
