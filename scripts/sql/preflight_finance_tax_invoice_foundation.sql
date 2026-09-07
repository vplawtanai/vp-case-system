-- Phase 6B manual SQL Editor review: ONE SELECT-only statement, ONE result row.
-- No lifecycle RPC calls. No business writes. Global Ledger counts are observation only.
-- Compare protected full-row hashes before/after apply; fixed facts are independently checked.
-- Technical catalog checks cannot verify external/manual VAT coverage or legal tax-point facts.
-- Those remain mandatory human decisions at Issue, not approval granted by this script.
with expected_functions(name,signature,body_hash,definer,callable) as (values
  ('generate_finance_document_no','public.generate_finance_document_no(text,date)','63e8d62f9fc39b4d4d4520e6155e2335',true,false),
  ('assert_finance_payment_has_no_downstream_dependencies','public.assert_finance_payment_has_no_downstream_dependencies(uuid)','983f3acbada08a61230d88d36dd76894',true,false),
  ('assert_finance_erroneous_payment_correction_dependencies','public.assert_finance_erroneous_payment_correction_dependencies(uuid)','515aab9608c93f22c42776dfb80a6da2',true,false),
  ('assert_finance_payment_reallocation_dependencies','public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)','8ada5cdb03fc95d16355702e30976e72',true,false),
  ('assert_finance_invoice_has_no_void_dependencies','public.assert_finance_invoice_has_no_void_dependencies(uuid)','a691e2e9dc61d91a1a1bd38f7dd3ad93',true,false),
  ('document_logo_evidence','public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',true,false),
  ('build_finance_receipt_source','public.build_finance_receipt_source(uuid)','1fe91b4d85e36bdc913b5427f5a8e270',true,false)
), function_facts as (select e.*,p.oid,p.prosecdef,p.proconfig,md5(p.prosrc)=e.body_hash as exact_body,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
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
),
checks(name,passed) as (select * from protected_checks union all select * from (values
  ('039_names_unused',to_regclass('public.finance_tax_invoices') is null and to_regclass('public.finance_tax_invoice_items') is null and to_regclass('public.finance_tax_invoice_source_coverages') is null and to_regclass('public.finance_tax_point_events') is null and to_regclass('public.finance_tax_invoice_audit_events') is null and to_regprocedure('public.create_finance_tax_invoice_draft(uuid)') is null),
  ('new_permissions_absent',not exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name in ('can_view_finance_tax_invoices','can_manage_finance_tax_invoices','can_issue_finance_tax_invoices'))),
  ('numbering_profile_valid',(select count(*)=1 and coalesce(bool_and(is_active and display_prefix='VP-TI' and period_scope='monthly' and sequence_width=6),false) from public.document_numbering_profiles where document_type='tax_invoice')),('no_tax_invoice_number_consumption',not exists(select 1 from public.finance_document_counters where lower(doc_type) in ('tax_invoice','ti','vp-ti') or prefix like 'VP-TI-%')),
  ('exact_predecessor_functions',(select bool_and(oid is not null and exact_body and prosecdef=definer and proconfig @> array['search_path=public']) from function_facts)),
  ('private_allocator_preserved',not coalesce(has_function_privilege('authenticated',to_regprocedure('public.generate_finance_document_no(text,date)'),'EXECUTE'),true)),
  ('required_upstream_tables_present',to_regclass('public.finance_invoice_items') is not null and to_regclass('public.finance_payment_allocation_reallocations') is not null),
  ('logo_038_read_boundary_present',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd='SELECT' and qual like '%current_user_can_view_finance_receipts%')),
  ('new_logo_policy_absent',not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='tax_invoice_document_logos_read'))
) v(name,passed))
select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
  (select facts from protected_observation) as protected_uat_observation,
  coalesce((select bool_and(passed is true) from checks),false) as tax_invoice_foundation_preflight_pass;
