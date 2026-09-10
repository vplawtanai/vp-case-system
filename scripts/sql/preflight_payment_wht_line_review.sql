-- SELECT-only, one statement / one row. No RPC or Production mutation.
-- Candidate 041 only; run this first. A passing result is NOT approval to apply.
with expected_functions as (
  -- GENERATED PREDECESSOR FUNCTION MANIFEST
  select * from jsonb_to_recordset('[{"signature":"public.assert_finance_payment_structured_wht(uuid)","body_md5":"1114ee87e6f2e74fedcfbb096065388c"},{"signature":"public.confirm_finance_payment(uuid,boolean)","body_md5":"deae5aa01dc48eb0faa64afa82bca8b7"},{"signature":"public.finance_invoice_wht_basis_v1(jsonb)","body_md5":"e48a9550e6c675f034714a907ddfca9b"},{"signature":"public.guard_finance_payment_wht_confirmation()","body_md5":"02e6d9f248fd987419203f43e3ddcc87"},{"signature":"public.guard_structured_wht_reallocation()","body_md5":"229b0af17984dd64228c9a1258f548b9"},{"signature":"public.post_confirmed_payment_to_finance_cash_transaction(uuid)","body_md5":"5cff47abdf1ae86983b201d88cd8e64c"},{"signature":"public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)","body_md5":"ecc24e593d80a9c1e93ea6ea236c3f17"},{"signature":"public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)","body_md5":"acb0e612b8a816a04108182d31f21e7a"}]'::jsonb) x(signature text,body_md5 text)
), function_differences as (
  select e.signature,e.body_md5 as expected_body_md5,md5(p.prosrc) as actual_body_md5
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc) is distinct from e.body_md5
), targets as (
  select
    (select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857') as draft,
    (select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6') as invoice,
    (select to_jsonb(p) from public.finance_payments p where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') as historical,
    (select to_jsonb(r) from public.finance_receipts r where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf') as receipt
), checks as (
  select 'predecessor_function_bodies_exact' as name,
    (select count(*) from expected_functions)>=4 and not exists(select 1 from function_differences) as pass
  union all select 'candidate_not_installed',to_regprocedure('public.finance_invoice_wht_lines_v2(jsonb)') is null
    and to_regprocedure('public.finance_payment_wht_review_v2(jsonb,jsonb)') is null
    and to_regprocedure('public.assert_finance_payment_structured_wht_v1(uuid)') is null
    and to_regprocedure('public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)') is null
  union all select 'component_required_predecessor_constraints',
    (select count(*) from pg_constraint where conrelid='public.finance_payment_wht_components'::regclass and convalidated and conname in (
      'finance_payment_wht_components_calculation_rule_check','finance_payment_wht_calculation_check','finance_payment_wht_line_unique',
      'finance_payment_wht_components_base_amount_check','finance_payment_wht_components_rate_percent_check'))=5
    and exists(select 1 from pg_attribute where attrelid='public.finance_payment_wht_components'::regclass and attname='rate_percent' and attnotnull)
  union all select 'component_security_and_transition_guards',
    (select relrowsecurity from pg_class where oid='public.finance_payment_wht_components'::regclass)
    and not has_table_privilege('authenticated','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('anon','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
    and exists(select 1 from pg_trigger where tgrelid='public.finance_payments'::regclass and tgname='finance_payment_structured_wht_before_write' and tgenabled='O')
    and exists(select 1 from pg_trigger where tgrelid='public.finance_payment_wht_components'::regclass and tgname='finance_payment_wht_component_draft_guard' and tgenabled='O')
  union all select 'target_draft_untouched',draft->>'status'='draft'
    and (draft->>'cash_amount')::numeric+(draft->>'wht_amount')::numeric=19280 from targets
  union all select 'target_invoice_frozen_totals',invoice->>'document_status'='issued' and invoice->>'invoice_no'='VP-IV-202609-000004'
    and invoice->>'source_model'='billable_charge_v2' and (invoice->>'total_amount')::numeric=19280
    and (invoice->>'amount_before_vat')::numeric=18672.90 and (invoice->>'vat_amount')::numeric=607.10
    and invoice->'issued_snapshot_json'->>'schema_version'='2'
    and jsonb_array_length(invoice->'issued_snapshot_json'->'items')=3 from targets
  union all select 'target_allocation_full_invoice',count(*)=1 and bool_and(invoice_id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'::uuid
    and cash_allocated+wht_credit_allocated=19280) from public.finance_payment_invoice_allocations where payment_id='95e22d0e-1996-4f16-98e4-218db1cbd857'
  union all select 'historical_payment_financials_unchanged',historical->>'status'='confirmed'
    and historical->>'wht_calculation_mode'='rate' and (historical->>'cash_amount')::numeric=4859.81
    and (historical->>'wht_amount')::numeric=140.19 and (historical->>'settlement_amount')::numeric=5000 from targets
  union all select 'historical_component_unchanged',count(*)=1 and bool_and(calculation_rule='single_line_full_invoice_v1'
    and base_amount=4672.90 and rate_percent=3 and calculated_wht_amount=140.19)
    from public.finance_payment_wht_components where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'
  union all select 'historical_receipt_unchanged',receipt->>'status'='issued' and receipt->>'receipt_no'='VP-RC-202609-000001'
    and receipt->>'payment_id'='9e2f601e-13ef-4165-8e2c-1887c3ad8861' from targets
  union all select 'no_cash_cutover',not exists(select 1 from public.finance_account_opening_balances)
)
select
  (select jsonb_object_agg(name,coalesce(pass,false) order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name),'[]') from checks where pass is not true) as failed_checks,
  (select coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]') from function_differences d) as function_differences,
  (select count(*) from public.finance_payments) as payment_rows_observability,
  (select count(*) from public.finance_payment_wht_components) as wht_component_rows_observability,
  (select count(*) from public.finance_company_ledger) as ledger_rows_observability,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_observability,
  not exists(select 1 from checks where pass is not true) as payment_wht_line_review_preflight_pass;
