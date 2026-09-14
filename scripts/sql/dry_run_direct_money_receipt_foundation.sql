BEGIN;
-- Rollback-only rehearsal. No synthetic rows and no business RPC calls.
select set_config('vp.direct047_before',upstream_evidence_hashes::text,true) from (-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Preserve and compare ALL protected_target_evidence / upstream_evidence_hashes before/after.
-- No fixed Ledger/Compensation row-count gate; those systems remain operational. No business UAT actions here.
with prerequisites(signature,hash) as(values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66'),
('public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric)','caf162441a1bb1dbeea2aba6461b4b5a'),
('public.assert_finance_billable_charge_context(uuid,bigint,uuid)','79ea6c5b4cae8483a652384ed1385e60'),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c'),
('public.finance_payment_wht_review_v2(jsonb,jsonb)','4af13910a5ee37ce68948fb6c9c7156e'),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0'),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab'),
('public.vp_distribution_frozen_source(jsonb,jsonb)','dd7c249818f0918fd05b711d4af60d2d'),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','9ba3597e77ecbee804cbca3dc2e8d7d6'),
('public.vp_distribution_immutable()','b11fdf476b490cc8971fc62d33ba7ea1'),
('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','276a63b50873c2ae5fd971207c0d6a69'),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','1c80933e8c6df2b50a601cd3f5182a2b'),
('public.guard_vp_distribution_source()','d9c2dfe4aedd09392bf393e1a91587ab'),
('public.vp_distribution_validate()','28858e2881c548358be1eedd2f8f178d'),
('public.get_finance_vp_distribution(uuid)','6e6d47836c88dd5616e7e42b6b9aa015'),
('public.vp_compensation_formula_catalog()','e7dd3b4645419ad707ba60494dd9d301'),
('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','6bc574a243fe094d1443ff0ff6343c78'),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8'),
('public.vp_formula_result_guard()','c0e42b906d2a4198ee95ce82ab1cdf5a')),
 prerequisite_differences as(select e.signature,e.hash as expected_hash,md5(p.prosrc) as actual_hash from prerequisites e left join pg_proc p on p.oid=to_regprocedure(e.signature) where p.oid is null or md5(p.prosrc) is distinct from e.hash),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg((to_jsonb(r)-'direct_money_receipt_id') order by (to_jsonb(r)-'direct_money_receipt_id')::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r)) as hashes), protected_targets as(select jsonb_build_object(
 'payment_95E22D0E',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'invoice_VP_IV_202609_000004',(select to_jsonb(i) from public.finance_invoices i where invoice_no='VP-IV-202609-000004'),
 'combined_D903B209',(select to_jsonb(c) from public.finance_combined_documents c where upper(left(id::text,8))='D903B209')) as evidence), checks(name,passed) as(values
 ('exact_prerequisite_functions',not exists(select 1 from prerequisite_differences)),
 ('047_namespace_unused',to_regclass('public.finance_direct_money_receipts') is null and to_regclass('public.finance_direct_money_receipt_audit') is null
  and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('finance_structured_wht_amount','direct_money_lines','direct_money_payload','direct_money_snapshot','save_finance_direct_money_receipt','transition_finance_direct_money_receipt','direct_money_guard','direct_money_classification_lines','direct_money_integrity','classify_finance_direct_money_receipt','vp_received_line_economics','vp_direct_frozen_source','vp_received_source','vp_received_frozen','vp_received_lock','save_finance_vp_received_distribution','save_finance_direct_vp_distribution','get_finance_vp_received_distribution','get_finance_direct_vp_formula_context','get_finance_received_money_source'))
  and not exists(select 1 from pg_attribute where attrelid='public.finance_vp_revenue_distributions'::regclass and attname='direct_money_receipt_id' and not attisdropped)),
 ('matter_master_shape',(select count(*)=2 and bool_and(case when c.relname='cases' then a.atttypid='bigint'::regtype else a.atttypid='uuid'::regtype end)
   from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname in('cases','advisory_matters') and a.attname='id' and not a.attisdropped)),
 ('bank_master_shape',(select count(*)=4 from pg_attribute where attrelid='public.finance_bank_accounts'::regclass and attname in('id','short_name','bank_name','is_active') and not attisdropped))
 ) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as direct_money_receipt_foundation_preflight_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select evidence from protected_targets) as protected_target_evidence,
 '[]'::jsonb as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from prerequisite_differences d) as function_differences,
 jsonb_build_object('legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments), 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ) as observability_only,
 current_setting('server_version_num')::integer as server_version_num) p;
-- BEGIN EMBEDDED MIGRATION 047
-- Candidate only. No backfill, posting, document numbering or customer document creation.
-- Direct money is a cash event, not settlement of an invented receivable.
create table public.finance_direct_money_receipts (
 id uuid primary key,
 status text not null default 'draft' check(status in ('draft','confirmed','reversed')),
 version integer not null default 1 check(version>0),
 client_id uuid references public.clients(id) on delete restrict,
 payer_name text not null check(length(btrim(payer_name)) between 1 and 500),
 case_id bigint references public.cases(id) on delete restrict,
 advisory_matter_id uuid references public.advisory_matters(id) on delete restrict,
 received_on date not null,
 method text not null check(method in ('bank_transfer','cash','other')),
 receiving_bank_account_id uuid references public.finance_bank_accounts(id) on delete restrict,
 cash_location text,
 currency text not null check(currency='THB'),
 cash_amount numeric not null check(cash_amount>0 and cash_amount=round(cash_amount,2)),
 wht_amount numeric not null check(wht_amount>=0 and wht_amount=round(wht_amount,2)),
 amount_before_vat numeric not null check(amount_before_vat>0),
 vat_amount numeric not null check(vat_amount>=0),
 gross_amount numeric not null check(gross_amount=cash_amount+wht_amount and gross_amount=amount_before_vat+vat_amount),
 reference_no text check(length(reference_no) between 1 and 200),
 evidence_reference text check(length(evidence_reference) between 1 and 1000),
 note text not null check(length(note)<=2000),
 lines_json jsonb not null check(jsonb_typeof(lines_json)='array' and jsonb_array_length(lines_json) between 1 and 100),
 unclassified boolean not null,
 input_json jsonb not null check(jsonb_typeof(input_json)='object'),
 confirmed_snapshot_json jsonb,
 classification_json jsonb check(classification_json is null or jsonb_typeof(classification_json)='object'),
 created_at timestamptz not null,
 created_by uuid not null references public.user_profiles(id),
 updated_at timestamptz not null,
 confirmed_at timestamptz,
 confirmed_by uuid references public.user_profiles(id),
 reversed_at timestamptz,
 reversed_by uuid references public.user_profiles(id),
 reversal_reason text,
 check(case_id is null or advisory_matter_id is null),
 check((case_id is null and advisory_matter_id is null) or client_id is not null),
 check((method='bank_transfer' and receiving_bank_account_id is not null and cash_location is null)
   or (method<>'bank_transfer' and receiving_bank_account_id is null and length(btrim(cash_location)) between 1 and 300)),
 check((status='draft' and confirmed_at is null and confirmed_by is null and confirmed_snapshot_json is null and reversed_at is null and reversed_by is null and reversal_reason is null)
   or (status='confirmed' and confirmed_at is not null and confirmed_by is not null and confirmed_snapshot_json is not null and reversed_at is null and reversed_by is null and reversal_reason is null)
   or (status='reversed' and confirmed_at is not null and confirmed_by is not null and confirmed_snapshot_json is not null and reversed_at is not null and reversed_by is not null and length(btrim(reversal_reason)) between 1 and 2000))
);
create unique index direct_money_active_reference on public.finance_direct_money_receipts
 (method,coalesce(receiving_bank_account_id::text,cash_location),currency,received_on,lower(btrim(reference_no)))
 where status<>'reversed' and reference_no is not null;
create unique index direct_money_active_evidence on public.finance_direct_money_receipts(lower(btrim(evidence_reference)))
 where status<>'reversed' and evidence_reference is not null;
create index direct_money_list on public.finance_direct_money_receipts(created_at desc,id);
create table public.finance_direct_money_receipt_audit (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null references public.finance_direct_money_receipts(id) on delete restrict,
 event_type text not null check(event_type in ('created','saved','classified','confirmed','reversed')),
 version integer not null check(version>0),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null,
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 unique(receipt_id,version)
);

-- The existing Payment line-review engine and Direct lines share this exact primitive.
create function public.finance_structured_wht_amount(p_base numeric,p_rate numeric)
returns numeric language plpgsql immutable set search_path=public as $wht$
begin
 if p_base is null or p_base<=0 or p_base<>round(p_base,2) or p_rate is null or p_rate<=0 or p_rate>100 or p_rate<>round(p_rate,4)
 then raise exception 'WHT_LINE_RATE_REQUIRED'; end if;
 return round(p_base*p_rate/100,2);
end;
$wht$;

create function public.direct_money_lines(p_lines jsonb)
returns jsonb language plpgsql immutable set search_path=public as $lines$
declare l jsonb; result jsonb:='[]'; amounts record; vat jsonb; wht numeric; base numeric; rate numeric; nature text; classification text;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100
 then raise exception 'DIRECT_MONEY_LINES_REQUIRED'; end if;
 if (select count(distinct (value->>'source_line_id')::uuid) from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines)
 then raise exception 'DIRECT_MONEY_LINE_ID_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_lines) order by value->>'source_line_id' loop
  if jsonb_typeof(l) is distinct from 'object' or exists(select 1 from jsonb_object_keys(l) k where k not in
   ('source_line_id','description','reason','money_nature','classification','base','vat_applicable','vat_rate','vat_treatment_json','wht_applicability','wht_base','wht_rate'))
   or nullif(btrim(l->>'description'),'') is null or length(l->>'description')>1000 or nullif(btrim(l->>'reason'),'') is null or length(l->>'reason')>2000
  then raise exception 'DIRECT_MONEY_LINE_INVALID'; end if;
  nature:=l->>'money_nature'; classification:=l->>'classification';
  if nature is null or nature not in('business_revenue','client_money','owner_or_partner_funding','loan_or_deposit','reimbursement_or_pass_through','other_non_revenue','unclassified')
   or (nature='business_revenue' and (classification is null or classification not in('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')))
   or (nature<>'business_revenue' and classification is not null) then raise exception 'DIRECT_MONEY_CLASSIFICATION_REQUIRED'; end if;
  if jsonb_typeof(l->'vat_applicable') is distinct from 'boolean' or jsonb_typeof(l->'base') is distinct from 'number'
   or jsonb_typeof(l->'vat_rate') is distinct from 'number' then raise exception 'DIRECT_MONEY_VAT_INVALID'; end if;
  base:=(l->>'base')::numeric; rate:=(l->>'vat_rate')::numeric;
  if base<=0 or base>999999999999 or rate>100 then raise exception 'DIRECT_MONEY_AMOUNT_INVALID'; end if;
  vat:=public.finance_vat_treatment(l->'vat_treatment_json',(l->>'vat_applicable')::boolean,rate);
  if vat->>'treatment'='unknown' and nature<>'unclassified' then raise exception 'DIRECT_MONEY_VAT_UNRESOLVED'; end if;
  select * into amounts from public.calculate_finance_billable_charge_amounts(1,base,case when (l->>'vat_applicable')::boolean then 'vat_exclusive' else 'non_vat' end,rate);
  if l->>'wht_applicability'='applies' then
   if jsonb_typeof(l->'wht_base') is distinct from 'number' or jsonb_typeof(l->'wht_rate') is distinct from 'number'
     or (l->>'wht_base')::numeric>base then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
   wht:=public.finance_structured_wht_amount((l->>'wht_base')::numeric,(l->>'wht_rate')::numeric);
   if wht<=0 then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
  elsif l->>'wht_applicability'='does_not_apply' then
   if l->>'wht_base' is not null or l->>'wht_rate' is not null then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
   wht:=0;
  else raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
  result:=result||jsonb_build_array(l||jsonb_build_object('source_line_id',(l->>'source_line_id')::uuid,
   'description',btrim(l->>'description'),'reason',btrim(l->>'reason'),'vat_treatment_json',vat,
   'vat',amounts.vat_amount,'gross',amounts.total_amount,'wht',wht,'cash',amounts.total_amount-wht));
 end loop;
 return result;
end;
$lines$;

create function public.direct_money_payload(p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $payload$
declare lines jsonb; result jsonb; client uuid; case_id bigint; advisory uuid; bank uuid; amount numeric;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in
  ('client_id','payer_name','case_id','advisory_matter_id','received_on','method','receiving_bank_account_id','cash_location','currency','cash_amount','reference_no','evidence_reference','note','lines'))
 then raise exception 'DIRECT_MONEY_FACTS_REQUIRED'; end if;
 client:=(p_input->>'client_id')::uuid; case_id:=(p_input->>'case_id')::bigint; advisory:=(p_input->>'advisory_matter_id')::uuid; bank:=(p_input->>'receiving_bank_account_id')::uuid;
 if client is not null then perform public.assert_finance_billable_charge_context(client,case_id,advisory);
 elsif case_id is not null or advisory is not null then raise exception 'DIRECT_MONEY_CONTEXT_INVALID'; end if;
 if nullif(btrim(p_input->>'payer_name'),'') is null or length(p_input->>'payer_name')>500
  or p_input->>'currency' is distinct from 'THB' or (p_input->>'received_on')::date is null
  or (p_input->>'received_on')::date>(current_timestamp at time zone 'Asia/Bangkok')::date
  or p_input->>'method' is null or p_input->>'method' not in('bank_transfer','cash','other')
  or jsonb_typeof(p_input->'cash_amount') is distinct from 'number' or p_input->>'note' is null or length(p_input->>'note')>2000
 then raise exception 'DIRECT_MONEY_FACTS_REQUIRED'; end if;
 if p_input->>'method'='bank_transfer' then
  if bank is null or not exists(select 1 from public.finance_bank_accounts b where b.id=bank and b.is_active)
   or nullif(btrim(p_input->>'cash_location'),'') is not null then raise exception 'DIRECT_MONEY_ACCOUNT_REQUIRED'; end if;
 elsif bank is not null or nullif(btrim(p_input->>'cash_location'),'') is null or length(p_input->>'cash_location')>300
 then raise exception 'DIRECT_MONEY_ACCOUNT_REQUIRED'; end if;
 lines:=public.direct_money_lines(p_input->'lines'); amount:=(p_input->>'cash_amount')::numeric;
 if amount<=0 or amount<>round(amount,2) or amount<>(select sum((l->>'cash')::numeric) from jsonb_array_elements(lines) l)
 then raise exception 'DIRECT_MONEY_RECONCILE'; end if;
 result:=p_input-'lines'||jsonb_build_object('payer_name',btrim(p_input->>'payer_name'),'note',btrim(p_input->>'note'),
  'reference_no',nullif(btrim(p_input->>'reference_no'),''),'evidence_reference',nullif(btrim(p_input->>'evidence_reference'),''),
  'cash_location',nullif(btrim(p_input->>'cash_location'),''),'lines_json',lines,
  'amount_before_vat',(select sum((l->>'base')::numeric) from jsonb_array_elements(lines) l),
  'vat_amount',(select sum((l->>'vat')::numeric) from jsonb_array_elements(lines) l),
  'wht_amount',(select sum((l->>'wht')::numeric) from jsonb_array_elements(lines) l),
  'gross_amount',(select sum((l->>'gross')::numeric) from jsonb_array_elements(lines) l),
  'unclassified',exists(select 1 from jsonb_array_elements(lines) l where l->>'money_nature'='unclassified'));
 return result;
end;
$payload$;

create function public.direct_money_snapshot(p public.finance_direct_money_receipts)
returns jsonb language sql stable security definer set search_path=public as $snapshot$
 select jsonb_build_object('schema_version',1,'source_type','direct_money_receipt','source_id',p.id,'source_version',p.version,
  'currency',p.currency,'actual_cash',p.cash_amount,'wht_credit',p.wht_amount,'gross_received',p.gross_amount,
  'before_vat',p.amount_before_vat,'vat',p.vat_amount,'lines',p.lines_json,
  'facts',to_jsonb(p)-'confirmed_snapshot_json',
  'client',case when p.client_id is null then null else (select to_jsonb(c) from (select id,name from public.clients where id=p.client_id) c) end,
  'bank',case when p.receiving_bank_account_id is null then null else (select to_jsonb(b) from (select id,short_name,bank_name from public.finance_bank_accounts where id=p.receiving_bank_account_id) b) end,
  'document_policy',jsonb_build_object('state','requires_review','automatic_issue',false,'reason','direct_source_integration_not_enabled'),
  'cashbook',jsonb_build_object('posting_enabled',false,'original_leg_key','direct_money_receipt:'||p.id::text||':original'));
$snapshot$;

create function public.save_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $save_direct$
declare a public.finance_direct_money_receipts%rowtype; n public.finance_direct_money_receipts%rowtype; data jsonb; ts timestamptz:=clock_timestamp(); ev text;
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'DIRECT_MONEY_STALE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is not null and a.status<>'draft' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 data:=public.direct_money_payload(p_input);
 if a.id is not null and a.input_json=p_input and a.created_by=auth.uid() and p_expected_version in(a.version,a.version-1) then return a.id; end if;
 if coalesce(a.version,0)<>p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 n:=jsonb_populate_record(null::public.finance_direct_money_receipts,data);
 if a.id is null then
  n.id:=p_id; n.status:='draft'; n.version:=1; n.created_by:=auth.uid(); n.created_at:=ts; n.updated_at:=ts; n.input_json:=p_input;
  insert into public.finance_direct_money_receipts select n.* returning * into a; ev:='created';
 else
  update public.finance_direct_money_receipts set client_id=n.client_id,payer_name=n.payer_name,case_id=n.case_id,advisory_matter_id=n.advisory_matter_id,
   received_on=n.received_on,method=n.method,receiving_bank_account_id=n.receiving_bank_account_id,cash_location=n.cash_location,currency=n.currency,
   cash_amount=n.cash_amount,wht_amount=n.wht_amount,amount_before_vat=n.amount_before_vat,vat_amount=n.vat_amount,gross_amount=n.gross_amount,
   reference_no=n.reference_no,evidence_reference=n.evidence_reference,note=n.note,lines_json=n.lines_json,unclassified=n.unclassified,input_json=p_input,
   version=version+1,updated_at=ts where id=p_id returning * into a; ev:='saved';
 end if;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,ev,a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$save_direct$;

-- One shared distribution table with an exclusive source identity. No existing rows are rewritten.
alter table public.finance_vp_revenue_distributions alter column payment_id drop not null;
alter table public.finance_vp_revenue_distributions add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict;
alter table public.finance_vp_revenue_distributions add constraint vp_distribution_source_identity check(
 (payment_id is not null and direct_money_receipt_id is null) or (payment_id is null and direct_money_receipt_id is not null and money_allocation_id is null));
create unique index vp_distribution_direct_revision on public.finance_vp_revenue_distributions(direct_money_receipt_id,revision);
create unique index vp_distribution_current_direct on public.finance_vp_revenue_distributions(direct_money_receipt_id) where status<>'superseded';

create function public.transition_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition_direct$
declare a public.finance_direct_money_receipts%rowtype; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'DIRECT_MONEY_ACK_REQUIRED'; end if;
 if p_action is null or p_action not in('confirm','reverse') then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is null then raise exception 'DIRECT_MONEY_MISSING'; end if;
 if a.version=p_expected_version+1 and ((p_action='confirm' and a.status='confirmed' and a.confirmed_by=auth.uid())
  or (p_action='reverse' and a.status='reversed' and a.reversed_by=auth.uid() and a.reversal_reason=btrim(p_reason))) then return a.id; end if;
 if a.version is distinct from p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 if p_action='confirm' and a.status='draft' then
  perform public.direct_money_payload(a.input_json);
  a.status:='confirmed'; a.version:=a.version+1; a.updated_at:=ts; a.confirmed_at:=ts; a.confirmed_by:=auth.uid();
  update public.finance_direct_money_receipts set status=a.status,version=a.version,updated_at=ts,confirmed_at=ts,confirmed_by=auth.uid(),
    confirmed_snapshot_json=public.direct_money_snapshot(a) where id=a.id returning * into a;
 elsif p_action='reverse' and a.status='confirmed' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'DIRECT_MONEY_REASON_REQUIRED'; end if;
  if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=a.id and status in('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
  update public.finance_direct_money_receipts set status='reversed',version=version+1,updated_at=ts,reversed_at=ts,reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
   where id=a.id returning * into a;
 else raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,a.status,a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$transition_direct$;

create function public.direct_money_guard()
returns trigger language plpgsql security definer set search_path=public as $guard_direct$
begin
 if tg_op in('DELETE','TRUNCATE') or tg_table_name='finance_direct_money_receipt_audit' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.version<>1 then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if; return new;
 end if;
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.version<>old.version+1 or new.updated_at<old.updated_at
  or old.status='reversed' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 if old.status='confirmed' then
  if new.status='confirmed' then
   if new.classification_json is null or new.classification_json is not distinct from old.classification_json
     or (to_jsonb(new)-array['version','updated_at','classification_json','unclassified']) is distinct from
       (to_jsonb(old)-array['version','updated_at','classification_json','unclassified']) then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  elsif new.status<>'reversed' or (to_jsonb(new)-array['status','version','updated_at','reversed_at','reversed_by','reversal_reason']) is distinct from
    (to_jsonb(old)-array['status','version','updated_at','reversed_at','reversed_by','reversal_reason']) then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=old.id and status in('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
 elsif new.status not in('draft','confirmed') then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 return new;
end;
$guard_direct$;
create trigger direct_money_immutable before insert or update or delete on public.finance_direct_money_receipts for each row execute function public.direct_money_guard();
create trigger direct_money_audit_immutable before update or delete on public.finance_direct_money_receipt_audit for each row execute function public.direct_money_guard();
create trigger direct_money_no_truncate before truncate on public.finance_direct_money_receipts for each statement execute function public.direct_money_guard();
create trigger direct_money_audit_no_truncate before truncate on public.finance_direct_money_receipt_audit for each statement execute function public.direct_money_guard();

create function public.direct_money_classification_lines(p_original jsonb,p_choices jsonb)
returns jsonb language plpgsql immutable set search_path=public as $classification_lines$
declare l jsonb; c jsonb; lines jsonb:='[]'; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices)<>jsonb_array_length(p_original)
 then raise exception 'DIRECT_MONEY_LINES_REQUIRED'; end if;
 for l in select value from jsonb_array_elements(p_original) loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'source_line_id'=l->>'source_line_id')<>1
  then raise exception 'DIRECT_MONEY_LINE_ID_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'source_line_id'=l->>'source_line_id';
  if exists(select 1 from jsonb_object_keys(c) k where k not in('source_line_id','money_nature','classification','vat_treatment_json'))
  then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  if c->>'money_nature' is null or c->>'money_nature'='unclassified' then raise exception 'DIRECT_MONEY_CLASSIFICATION_REQUIRED'; end if;
  lines:=lines||jsonb_build_array((l-array['cash','wht','vat','gross'])||c);
 end loop;
 canonical:=public.direct_money_lines(lines);
 if (select jsonb_agg(x-array['money_nature','classification','vat_treatment_json'] order by x->>'source_line_id') from jsonb_array_elements(canonical) x)
  is distinct from (select jsonb_agg(x-array['money_nature','classification','vat_treatment_json'] order by x->>'source_line_id') from jsonb_array_elements(p_original) x)
 then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 return canonical;
end;
$classification_lines$;

create function public.direct_money_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity_direct$
declare a public.finance_direct_money_receipts%rowtype; projected jsonb; ev text;
begin
 if tg_table_name='finance_direct_money_receipt_audit' then
  select * into a from public.finance_direct_money_receipts where id=new.receipt_id;
  if a.id is null or new.version>a.version or new.evidence_json->>'id' is distinct from a.id::text
   or new.version is distinct from (new.evidence_json->>'version')::integer
   or (new.version=a.version and new.evidence_json is distinct from to_jsonb(a))
   or new.created_at is distinct from (new.evidence_json->>'updated_at')::timestamptz
   or (new.event_type='created' and new.actor_id is distinct from (new.evidence_json->>'created_by')::uuid)
   or (new.event_type='confirmed' and new.actor_id is distinct from (new.evidence_json->>'confirmed_by')::uuid)
   or (new.event_type='reversed' and new.actor_id is distinct from (new.evidence_json->>'reversed_by')::uuid)
   or (new.event_type='classified' and new.actor_id is distinct from (new.evidence_json#>>'{classification_json,actor_id}')::uuid)
   or (new.version>1 and not exists(select 1 from public.finance_direct_money_receipt_audit e where e.receipt_id=a.id and e.version=new.version-1))
  then raise exception 'DIRECT_MONEY_AUDIT_INVALID'; end if;
  return null;
 end if;
 ev:=case when tg_op='INSERT' then 'created' when new.status='draft' then 'saved' when new.status='confirmed' and old.status='confirmed' then 'classified' else new.status end;
 if not exists(select 1 from public.finance_direct_money_receipt_audit e where e.receipt_id=new.id and e.version=new.version and e.event_type=ev and e.evidence_json=to_jsonb(new))
 then raise exception 'DIRECT_MONEY_AUDIT_REQUIRED'; end if;
 -- Validate stored line arithmetic without depending on mutable bank/client master data.
 projected:=public.direct_money_lines(new.input_json->'lines');
 if new.lines_json is distinct from projected or new.cash_amount<>(select sum((l->>'cash')::numeric) from jsonb_array_elements(projected) l)
  or new.wht_amount<>(select sum((l->>'wht')::numeric) from jsonb_array_elements(projected) l)
  or new.vat_amount<>(select sum((l->>'vat')::numeric) from jsonb_array_elements(projected) l)
  or new.amount_before_vat<>(select sum((l->>'base')::numeric) from jsonb_array_elements(projected) l)
  or new.unclassified is distinct from exists(select 1 from jsonb_array_elements(coalesce(new.classification_json->'lines',projected)) l where l->>'money_nature'='unclassified')
 then raise exception 'DIRECT_MONEY_RECONCILE'; end if;
 if new.classification_json is not null then
  if new.status='draft' or new.classification_json->'schema_version' is distinct from '1'::jsonb
   or nullif(btrim(new.classification_json->>'reason'),'') is null
   or length(new.classification_json->>'reason')>2000
   or (new.classification_json->>'actor_id')::uuid is null
   or new.classification_json->'lines' is distinct from public.direct_money_classification_lines(new.lines_json,new.classification_json->'choices')
   or (ev='classified' and (new.classification_json->>'created_at')::timestamptz is distinct from new.updated_at)
  then raise exception 'DIRECT_MONEY_CLASSIFICATION_INVALID'; end if;
 end if;
 if new.status='confirmed' and old.status='draft' and new.confirmed_snapshot_json is distinct from public.direct_money_snapshot(new)
 then raise exception 'DIRECT_MONEY_SNAPSHOT_INVALID'; end if;
 return null;
end;
$integrity_direct$;
create constraint trigger direct_money_integrity after insert or update on public.finance_direct_money_receipts deferrable initially deferred for each row execute function public.direct_money_integrity();
create constraint trigger direct_money_audit_integrity after insert on public.finance_direct_money_receipt_audit deferrable initially deferred for each row execute function public.direct_money_integrity();

alter table public.finance_direct_money_receipts enable row level security;
alter table public.finance_direct_money_receipt_audit enable row level security;
create policy direct_money_read on public.finance_direct_money_receipts for select to authenticated using(public.current_user_can_view_finance_payments());
create policy direct_money_audit_read on public.finance_direct_money_receipt_audit for select to authenticated using(public.current_user_can_view_finance_payments());
revoke all on public.finance_direct_money_receipts,public.finance_direct_money_receipt_audit from public,anon,authenticated;
grant select on public.finance_direct_money_receipts,public.finance_direct_money_receipt_audit to authenticated;
revoke all on function public.finance_structured_wht_amount(numeric,numeric),public.direct_money_lines(jsonb),public.direct_money_classification_lines(jsonb,jsonb),public.direct_money_payload(jsonb),public.direct_money_snapshot(public.finance_direct_money_receipts),public.direct_money_guard(),public.direct_money_integrity(),
 public.save_finance_direct_money_receipt(uuid,integer,jsonb),public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.save_finance_direct_money_receipt(uuid,integer,jsonb),public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text) to authenticated;

-- Classification revises only economic evidence. Original confirmed cash/tax facts stay frozen.
create function public.classify_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_choices jsonb,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $classify$
declare a public.finance_direct_money_receipts%rowtype; canonical jsonb; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'DIRECT_MONEY_ACK_REQUIRED'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'DIRECT_MONEY_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is null or a.status<>'confirmed' then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 if a.version=p_expected_version+1 and a.classification_json->'choices'=p_choices and a.classification_json->>'reason'=btrim(p_reason)
  and a.classification_json->>'actor_id'=auth.uid()::text then return a.id; end if;
 if a.version is distinct from p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=a.id and status in('reviewed','finalized')) then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
 canonical:=public.direct_money_classification_lines(a.lines_json,p_choices);
 update public.finance_direct_money_receipts set version=version+1,updated_at=ts,unclassified=false,
  classification_json=jsonb_build_object('schema_version',1,'lines',canonical,'choices',p_choices,'reason',btrim(p_reason),'actor_id',auth.uid(),'created_at',ts)
  where id=a.id returning * into a;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,'classified',a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$classify$;
revoke all on function public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text) from public,anon;
grant execute on function public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text) to authenticated;

-- SHARED SOURCE ADAPTERS (generated from the unchanged 045/046 implementations).
create function public.vp_received_line_economics(p_base numeric,p_wht numeric,p_classification text)
returns jsonb language plpgsql immutable set search_path=public as $economics$
begin
 if p_base is null or p_wht is null or p_base<0 or p_wht<0 or p_base<p_wht or p_base<>round(p_base,2) or p_wht<>round(p_wht,2)
  or p_classification is null or p_classification not in('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return jsonb_build_object('professional_pool',case when p_classification='professional_fee' then p_base-p_wht else 0 end,
  'company_economic',case when p_classification='professional_fee' then 0 else p_base end,
  'company_cash',case when p_classification='professional_fee' then 0 else p_base-p_wht end);
end;
$economics$;

create or replace function public.vp_distribution_frozen_source(p_money_source jsonb,p_money_allocation jsonb)
returns jsonb language plpgsql immutable set search_path=public as $source$
declare s jsonb:=p_money_source; a jsonb:=nullif(p_money_allocation,'null'::jsonb);
 l jsonb; economics jsonb; item jsonb; ready jsonb; commercial jsonb; invoice_header jsonb; classification text; k text;
 lines jsonb:='[]'; blockers jsonb:='[]'; valid boolean; amount numeric;
 cash numeric; wht numeric; vat numeric; base numeric; pool numeric; economic numeric; company_cash numeric;
 total_pool numeric:=0; total_economic numeric:=0; total_company_cash numeric:=0;
 line_cash numeric:=0; line_wht numeric:=0; line_vat numeric:=0; line_base numeric:=0;
begin
 if jsonb_typeof(s) is distinct from 'object' then
  return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1',
   'money_source',s,'money_allocation',a,'lines','[]'::jsonb,
   'totals',jsonb_build_object('cash',null,'wht',null,'vat',null,'base',null,
     'professional_pool',null,'company_economic',null,'company_cash',null),
   'blockers',jsonb_build_array('money_source_unavailable'));
 end if;
 if jsonb_typeof(s->'blockers')='array' then blockers:=s->'blockers';
 else blockers:=jsonb_build_array('money_source_invalid'); end if;
 begin
  if s->'schema_version' is distinct from '1'::jsonb
    or jsonb_typeof(s->'payment') is distinct from 'object'
    or jsonb_typeof(s#>'{payment,currency}') is distinct from 'string'
    or nullif(btrim(s#>>'{payment,currency}'),'') is null
    or jsonb_typeof(s#>'{payment,id}') is distinct from 'string'
    or nullif(s#>>'{payment,id}','') is null
    or jsonb_typeof(s->'lines') is distinct from 'array'
    or jsonb_typeof(s->'invoices') is distinct from 'array'
  then raise exception 'INVALID'; end if;
  perform (s#>>'{payment,id}')::uuid;
  for k in select unnest(array['cash','wht','settlement']) loop
   if jsonb_typeof(s->'payment'->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->'payment'->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  for k in select unnest(array['proven_base','proven_vat','unallocated_settlement']) loop
   if jsonb_typeof(s->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  cash:=(s#>>'{payment,cash}')::numeric; wht:=(s#>>'{payment,wht}')::numeric;
  base:=(s->>'proven_base')::numeric; vat:=(s->>'proven_vat')::numeric;
  if cash+wht is distinct from (s#>>'{payment,settlement}')::numeric
    or (s->>'unallocated_settlement')::numeric<>0 then blockers:=blockers||jsonb_build_array('settlement_evidence_invalid'); end if;
 exception when others then
  blockers:=blockers||jsonb_build_array('money_source_invalid');
  cash:=null; wht:=null; base:=null; vat:=null;
 end;
 if s#>>'{payment,status}' is distinct from 'confirmed' then blockers:=blockers||jsonb_build_array('payment_not_confirmed'); end if;
 if a is not null then
  if jsonb_typeof(a) is distinct from 'object'
    or a->>'payment_id' is distinct from s#>>'{payment,id}'
    or coalesce(a->>'status','') not in ('draft','reviewed','finalized')
    or a->'source_snapshot_json' is distinct from s
  then blockers:=blockers||jsonb_build_array('money_allocation_stale'); end if;
  begin
   if public.money_allocation_decisions(s,a->'decisions_json',false) is distinct from a->'decisions_json'
   then raise exception 'INVALID'; end if;
   if exists(select 1 from jsonb_array_elements(a->'decisions_json') x
     where coalesce(x->>'category','') not in ('company_revenue','unallocated'))
   then blockers:=blockers||jsonb_build_array('money_allocation_conflict'); end if;
  exception when others then blockers:=blockers||jsonb_build_array('money_allocation_invalid'); end;
 end if;
 for l in select value from jsonb_array_elements(case when jsonb_typeof(s->'lines')='array' then s->'lines' else '[]'::jsonb end) loop
  item:=l->'source_item'; ready:=item#>'{source_snapshot_json,ready_snapshot}'; commercial:=ready->'commercial';
  classification:=ready#>>'{economic,classification}'; valid:=true;
  pool:=0; economic:=0; company_cash:=0;
  if classification is null or classification not in ('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
  then blockers:=blockers||jsonb_build_array('classification_unsupported'); valid:=false; end if;
  begin
   if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(item) is distinct from 'object'
     or item->>'id' is distinct from l->>'invoice_item_id'
     or item->>'invoice_id' is distinct from l->>'invoice_id'
     or item->>'source_state' is distinct from 'active'
   then raise exception 'INVALID'; end if;
   if nullif(l->>'invoice_item_id','') is null or nullif(l->>'invoice_id','') is null then raise exception 'INVALID'; end if;
   perform (l->>'invoice_item_id')::uuid; perform (l->>'invoice_id')::uuid;
   if (select count(*) from jsonb_array_elements(s->'invoices') inv where inv->>'invoice_id'=l->>'invoice_id')<>1
   then raise exception 'INVALID'; end if;
   select inv#>'{issued_snapshot,invoice}' into invoice_header from jsonb_array_elements(s->'invoices') inv
    where inv->>'invoice_id'=l->>'invoice_id';
   if invoice_header->>'id' is distinct from l->>'invoice_id'
     or jsonb_typeof(invoice_header->'client_id') is distinct from 'string'
     or nullif(invoice_header->>'client_id','') is null
     or ready#>>'{charge,client_id}' is distinct from invoice_header->>'client_id'
   then raise exception 'INVALID'; end if;
   perform (invoice_header->>'client_id')::uuid;
   for k in select unnest(array['cash','wht','vat','base','settlement']) loop
    if jsonb_typeof(l->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(l->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   if (l->>'base')::numeric<=0
     or (l->>'base')::numeric+(l->>'vat')::numeric is distinct from (l->>'settlement')::numeric
     or (l->>'cash')::numeric+(l->>'wht')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
   line_cash:=line_cash+(l->>'cash')::numeric; line_wht:=line_wht+(l->>'wht')::numeric;
   line_base:=line_base+(l->>'base')::numeric; line_vat:=line_vat+(l->>'vat')::numeric;
   if (l->>'base')::numeric-(l->>'wht')::numeric<0 then
    blockers:=blockers||jsonb_build_array('base_less_than_wht'); valid:=false;
   end if;
   if jsonb_typeof(ready) is distinct from 'object' or ready->'schema_version' is distinct from '1'::jsonb
     or item#>'{source_snapshot_json,schema_version}' is distinct from '2'::jsonb
     or jsonb_typeof(item->'source_billable_charge_id') is distinct from 'string'
     or nullif(item->>'source_billable_charge_id','') is null
     or ready#>>'{charge,id}' is distinct from item->>'source_billable_charge_id'
     or item#>>'{source_snapshot_json,billable_charge_id}' is distinct from item->>'source_billable_charge_id'
     or ready#>>'{charge,status}' is distinct from 'ready_to_invoice'
     or jsonb_typeof(commercial) is distinct from 'object'
     or jsonb_typeof(commercial->'currency') is distinct from 'string'
     or nullif(btrim(commercial->>'currency'),'') is null
     or commercial->>'currency' is distinct from s#>>'{payment,currency}'
   then raise exception 'INVALID'; end if;
   perform (item->>'source_billable_charge_id')::uuid;
   for k in select unnest(array['amount_before_vat','vat_amount','total_amount']) loop
    if jsonb_typeof(commercial->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(commercial->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   for k in select unnest(array['amount_before_vat','vat_amount','line_total']) loop
    if jsonb_typeof(item->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   end loop;
   if (commercial->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (commercial->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (commercial->>'total_amount')::numeric is distinct from (l->>'settlement')::numeric
     or (item->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (item->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (item->>'line_total')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
  exception when others then blockers:=blockers||jsonb_build_array('frozen_economic_evidence_invalid'); valid:=false;
  end;
  if valid then
   economics:=public.vp_received_line_economics((l->>'base')::numeric,(l->>'wht')::numeric,classification);
   pool:=(economics->>'professional_pool')::numeric; economic:=(economics->>'company_economic')::numeric; company_cash:=(economics->>'company_cash')::numeric;
  end if;
  total_pool:=total_pool+pool; total_economic:=total_economic+economic; total_company_cash:=total_company_cash+company_cash;
  lines:=lines||jsonb_build_array(l||jsonb_build_object('classification',classification,'professional_pool',pool,
    'company_economic',economic,'company_cash',company_cash));
 end loop;
 if jsonb_array_length(lines)=0 then blockers:=blockers||jsonb_build_array('frozen_lines_missing'); end if;
 if (select count(distinct x->>'invoice_item_id') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines)
 then blockers:=blockers||jsonb_build_array('frozen_lines_invalid'); end if;
 if line_cash is distinct from cash or line_wht is distinct from wht or line_base is distinct from base or line_vat is distinct from vat
   or cash is distinct from total_company_cash+total_pool+vat
 then blockers:=blockers||jsonb_build_array('cash_reconciliation_invalid'); end if;
 return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1','money_source',s,'money_allocation',a,
  'lines',lines,'totals',jsonb_build_object('cash',cash,'wht',wht,'vat',vat,'base',base,
    'professional_pool',total_pool,'company_economic',total_economic,'company_cash',total_company_cash),
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$source$;

create function public.vp_direct_frozen_source(s jsonb)
returns jsonb language plpgsql immutable set search_path=public as $direct_source$
declare l jsonb; lines jsonb:='[]'; blockers jsonb:='[]'; economics jsonb; canonical jsonb; input_lines jsonb;
begin
 if s->>'source_type' is distinct from 'direct_money_receipt' or s->'schema_version' is distinct from '1'::jsonb
  or jsonb_typeof(s->'lines') is distinct from 'array' or nullif(s->>'source_id','') is null
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 perform (s->>'source_id')::uuid;
 if s->>'status' is distinct from 'confirmed' then blockers:=blockers||jsonb_build_array('direct_not_confirmed'); end if;
 select coalesce(jsonb_agg(x-array['cash','wht','vat','gross']),'[]') into input_lines from jsonb_array_elements(s->'lines') x;
 canonical:=public.direct_money_lines(input_lines);
 if canonical is distinct from s->'lines' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 for l in select value from jsonb_array_elements(canonical) loop
  economics:=jsonb_build_object('professional_pool',0,'company_economic',0,'company_cash',0);
  if l->>'money_nature'<>'business_revenue' then blockers:=blockers||jsonb_build_array('direct_'||(l->>'money_nature'));
  elsif l#>>'{vat_treatment_json,treatment}'='unknown' then blockers:=blockers||jsonb_build_array('direct_vat_unresolved');
  else economics:=public.vp_received_line_economics((l->>'base')::numeric,(l->>'wht')::numeric,l->>'classification'); end if;
  lines:=lines||jsonb_build_array(l||economics);
 end loop;
 if (s->>'actual_cash')::numeric is distinct from (select sum((x->>'cash')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'wht_credit')::numeric is distinct from (select sum((x->>'wht')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'before_vat')::numeric is distinct from (select sum((x->>'base')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'vat')::numeric is distinct from (select sum((x->>'vat')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'gross_received')::numeric is distinct from (s->>'actual_cash')::numeric+(s->>'wht_credit')::numeric
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1','received_money_source',s,
  'money_source',null,'money_allocation',null,'lines',lines,'totals',jsonb_build_object('cash',s->'actual_cash','wht',s->'wht_credit','base',s->'before_vat','vat',s->'vat',
   'professional_pool',(select sum((x->>'professional_pool')::numeric) from jsonb_array_elements(lines) x),
   'company_economic',(select sum((x->>'company_economic')::numeric) from jsonb_array_elements(lines) x),
   'company_cash',(select sum((x->>'company_cash')::numeric) from jsonb_array_elements(lines) x)),
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$direct_source$;

create function public.vp_received_source(p_payment_id uuid,p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare a public.finance_direct_money_receipts%rowtype; s jsonb;
begin
 if (p_payment_id is null)=(p_direct_id is null) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_payment_id is not null then return public.vp_distribution_source(p_payment_id); end if;
 select * into a from public.finance_direct_money_receipts where id=p_direct_id;
 if a.id is null then raise exception 'DIRECT_MONEY_MISSING'; end if;
 s:=coalesce(a.confirmed_snapshot_json,public.direct_money_snapshot(a))||jsonb_build_object('status',a.status,'source_version',a.version);
 if a.classification_json is not null then s:=s||jsonb_build_object('lines',a.classification_json->'lines','classification_evidence',a.classification_json); end if;
 s:=s||jsonb_build_object('source_fingerprint',md5(s::text));
 return public.vp_direct_frozen_source(s);
end;
$source$;
create function public.vp_received_frozen(p_source jsonb)
returns jsonb language sql immutable set search_path=public as $frozen$
 select case when p_source ? 'received_money_source' then public.vp_direct_frozen_source(p_source->'received_money_source')
 else public.vp_distribution_frozen_source(p_source->'money_source',p_source->'money_allocation') end;
$frozen$;
create function public.vp_received_lock(p_payment_id uuid,p_direct_id uuid)
returns void language plpgsql security definer set search_path=public as $lock$
begin
 if (p_payment_id is null)=(p_direct_id is null) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_payment_id is not null then perform public.money_allocation_lock(p_payment_id); return; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_direct_id::text,0));
 perform 1 from public.finance_direct_money_receipts where id=p_direct_id for update;
 if not found then raise exception 'DIRECT_MONEY_MISSING'; end if;
end;
$lock$;

create or replace function public.vp_distribution_amount_choices_v1(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare identity_key text:=case when p_source ? 'received_money_source' then 'source_line_id' else 'invoice_item_id' end; l jsonb; c jsonb; k text; amount numeric; total numeric; pool numeric; result jsonb:='[]';
begin
 if p_complete is null or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x) is distinct from 'object')
   or jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee')
 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' order by value->>identity_key loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>identity_key=l->>identity_key)<>1
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>identity_key=l->>identity_key;
  if jsonb_typeof(c->identity_key) is distinct from 'string'
    or exists(select 1 from jsonb_object_keys(c) as keys(key) where keys.key not in (identity_key,'referral_amount','company_share_amount','work_compensation_amount'))
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  total:=0;
  for k in select unnest(array['referral_amount','company_share_amount','work_compensation_amount']) loop
   if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   amount:=(c->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   total:=total+amount;
  end loop;
  if jsonb_typeof(l->'professional_pool') is distinct from 'number' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  pool:=(l->>'professional_pool')::numeric;
  if pool<0 or pool<>round(pool,2) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  if total>pool then raise exception 'VP_DISTRIBUTION_POOL_EXCEEDED'; end if;
  if p_complete and total<>pool then raise exception 'VP_DISTRIBUTION_REVIEW_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object(identity_key,l->>identity_key,
   'referral_amount',(c->>'referral_amount')::numeric,'company_share_amount',(c->>'company_share_amount')::numeric,
   'work_compensation_amount',(c->>'work_compensation_amount')::numeric));
 end loop;
 return result;
end;
$choices$;

create or replace function public.vp_distribution_choices(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare identity_key text:=case when p_source ? 'received_money_source' then 'source_line_id' else 'invoice_item_id' end; base jsonb; result jsonb:='[]'; c jsonb; l jsonb; f jsonb; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 base:=public.vp_distribution_amount_choices_v1(p_source,(select coalesce(jsonb_agg(value-'formula_result'),'[]') from jsonb_array_elements(p_choices)),p_complete);
 for c in select value from jsonb_array_elements(base) loop
  select value->'formula_result' into f from jsonb_array_elements(p_choices) where value->>identity_key=c->>identity_key;
  if f is not null then
   select value into l from jsonb_array_elements(p_source->'lines') where value->>identity_key=c->>identity_key;
   canonical:=public.vp_formula_calculate((l->>'professional_pool')::numeric,f->>'formula_code',(f->>'formula_version')::integer,f->'formula_snapshot',f->'recipients');
   if canonical is distinct from f or c->'referral_amount' is distinct from f->'referral_amount'
     or c->'company_share_amount' is distinct from f->'company_share_amount' or c->'work_compensation_amount' is distinct from f->'work_compensation_amount'
   then raise exception 'VP_FORMULA_EVIDENCE_INVALID'; end if;
   c:=c||jsonb_build_object('formula_result',canonical);
  end if;
  result:=result||jsonb_build_array(c);
 end loop;
 return result;
end;
$choices$;

create or replace function public.vp_distribution_immutable()
returns trigger language plpgsql security definer set search_path=public as $immutable$
declare s jsonb;
begin
 if tg_op in ('DELETE','TRUNCATE') or tg_table_name='finance_vp_revenue_distribution_audit'
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.version<>1 then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
  perform public.vp_received_lock(new.payment_id,new.direct_money_receipt_id);
  s:=public.vp_received_source(new.payment_id,new.direct_money_receipt_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  return new;
 end if;
 if old.status='superseded' or new.id<>old.id or new.payment_id is distinct from old.payment_id or new.direct_money_receipt_id is distinct from old.direct_money_receipt_id or new.revision<>old.revision
   or new.previous_id is distinct from old.previous_id or new.created_at<>old.created_at or new.created_by<>old.created_by
   or new.version<>old.version+1 or new.updated_at<old.updated_at
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not ((old.status='draft' and new.status in ('draft','reviewed','superseded'))
   or (old.status='reviewed' and new.status in ('finalized','superseded'))
   or (old.status='finalized' and new.status='superseded')) then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if (old.status<>'draft' or new.status<>'draft') and (new.source_snapshot_json is distinct from old.source_snapshot_json
   or new.money_allocation_id is distinct from old.money_allocation_id or new.decisions_json is distinct from old.decisions_json or new.note<>old.note)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='draft' and new.status='reviewed') and (new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='reviewed' and new.status='finalized') and (new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.vp_received_lock(new.payment_id,new.direct_money_receipt_id);
 if new.status<>'superseded' then
  s:=public.vp_received_source(new.payment_id,new.direct_money_receipt_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 end if;
 return new;
end;
$immutable$;

create or replace function public.vp_distribution_validate()
returns trigger language plpgsql security definer set search_path=public as $validate$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; actor uuid; evidence jsonb; event_version integer;
begin
 if tg_table_name='finance_vp_revenue_distribution_audit' then
  select * into a from public.finance_vp_revenue_distributions where id=new.distribution_id;
  event_version:=(new.evidence_json->>'version')::integer;
  if a.id is null or new.evidence_json->>'id' is distinct from a.id::text
    or new.evidence_json->>'payment_id' is distinct from a.payment_id::text
    or new.evidence_json->>'direct_money_receipt_id' is distinct from a.direct_money_receipt_id::text
    or new.evidence_json->>'revision' is distinct from a.revision::text
    or event_version>a.version
    or (event_version=a.version and new.evidence_json is distinct from to_jsonb(a))
    or (event_version>1 and not exists(select 1 from public.finance_vp_revenue_distribution_audit e
      where e.distribution_id=a.id and (e.evidence_json->>'version')::integer=event_version-1))
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  evidence:=new.evidence_json;
  ev:=case when event_version=1 then 'created' when evidence->>'status'='draft' then 'saved' else evidence->>'status' end;
  actor:=case ev when 'created' then (evidence->>'created_by')::uuid when 'reviewed' then (evidence->>'reviewed_by')::uuid
   when 'finalized' then (evidence->>'finalized_by')::uuid when 'superseded' then (evidence->>'superseded_by')::uuid else new.actor_id end;
  if new.event_type is distinct from ev or new.actor_id is distinct from actor
    or new.created_at is distinct from (evidence->>'updated_at')::timestamptz
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  return null;
 end if;
 select * into a from public.finance_vp_revenue_distributions where id=new.id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.vp_received_lock(a.payment_id,a.direct_money_receipt_id);
 if new.source_snapshot_json is distinct from public.vp_received_frozen(new.source_snapshot_json)
   or new.source_snapshot_json->'blockers' is distinct from '[]'::jsonb
   or new.source_snapshot_json#>>'{money_source,payment,id}' is distinct from new.payment_id::text
   or new.source_snapshot_json#>>'{received_money_source,source_id}' is distinct from new.direct_money_receipt_id::text
   or new.source_snapshot_json#>>'{money_allocation,id}' is distinct from new.money_allocation_id::text
   or (new.money_allocation_id is not null and not exists(select 1 from public.finance_payment_money_allocations m
     where m.id=new.money_allocation_id and m.payment_id=new.payment_id))
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if new.decisions_json is distinct from public.vp_distribution_choices(new.source_snapshot_json,new.decisions_json,
     new.reviewed_at is not null) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if new.previous_id is not null and not exists(select 1 from public.finance_vp_revenue_distributions p
   where p.id=new.previous_id and p.payment_id is not distinct from new.payment_id and p.direct_money_receipt_id is not distinct from new.direct_money_receipt_id and p.revision=new.revision-1 and p.status='superseded')
 then raise exception 'VP_DISTRIBUTION_REVISION_INVALID'; end if;
 -- Check every captured NEW version, not only the last row visible at commit.
 ev:=case when tg_op='INSERT' then 'created' when new.status='draft' then 'saved' else new.status end;
 if not exists(select 1 from public.finance_vp_revenue_distribution_audit e
   where e.distribution_id=new.id and e.event_type=ev and e.evidence_json=to_jsonb(new))
 then raise exception 'VP_DISTRIBUTION_AUDIT_REQUIRED'; end if;
 -- Drafts may subsequently become stale; protected states never may.
 if a.status in ('reviewed','finalized') then
  s:=public.vp_received_source(a.payment_id,a.direct_money_receipt_id);
  if s is distinct from a.source_snapshot_json or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
 end if;
 return null;
end;
$validate$;

create or replace function public.transition_finance_vp_distribution(p_id uuid,p_expected_version integer,p_source jsonb,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'VP_DISTRIBUTION_ACK_REQUIRED'; end if;
 if p_action is null or p_action not in ('review','finalize','supersede') then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if p_expected_version is null or p_expected_version<1 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 select * into a from public.finance_vp_revenue_distributions where id=p_id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_MISSING'; end if;
 perform public.vp_received_lock(a.payment_id,a.direct_money_receipt_id);
 select * into a from public.finance_vp_revenue_distributions where id=p_id for update;
 if p_action='supersede' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'VP_DISTRIBUTION_REASON_REQUIRED'; end if;
  -- Retirement must remain possible when the live source is stale or unreadable.
  if a.status='superseded' and a.version=p_expected_version+1 and a.supersede_reason=btrim(p_reason) then return a.id; end if;
 else
  s:=public.vp_received_source(a.payment_id,a.direct_money_receipt_id);
  if s is distinct from p_source or s is distinct from a.source_snapshot_json then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
  if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
  if a.version=p_expected_version+1 and ((p_action='review' and a.status='reviewed') or (p_action='finalize' and a.status='finalized')) then return a.id; end if;
 end if;
 if a.version is distinct from p_expected_version then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if p_action='supersede' and a.status<>'superseded' then
  update public.finance_vp_revenue_distributions set status='superseded',version=version+1,updated_at=ts,
   superseded_at=ts,superseded_by=auth.uid(),supersede_reason=btrim(p_reason) where id=a.id returning * into a; ev:='superseded';
 elsif p_action='review' and a.status='draft' then
  update public.finance_vp_revenue_distributions set status='reviewed',version=version+1,updated_at=ts,
   reviewed_at=ts,reviewed_by=auth.uid() where id=a.id returning * into a; ev:='reviewed';
 elsif p_action='finalize' and a.status='reviewed' then
  update public.finance_vp_revenue_distributions set status='finalized',version=version+1,updated_at=ts,
   finalized_at=ts,finalized_by=auth.uid() where id=a.id returning * into a; ev:='finalized';
 else raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$transition$;

create or replace function public.save_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.finance_vp_revenue_distributions%rowtype; prev public.finance_vp_revenue_distributions%rowtype;
 s jsonb; c jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if (p_expected_id is null)<>(p_expected_version is null) or (p_expected_version is not null and p_expected_version<1)
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 perform public.vp_received_lock(p_payment_id,p_direct_id); s:=public.vp_received_source(p_payment_id,p_direct_id);
 if s is distinct from p_source then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
 if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_note is null or length(p_note)>2000 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 c:=public.vp_distribution_choices(s,p_choices,false);
 select * into a from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded' for update;
 if a.id is null then
  select * into prev from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id order by revision desc limit 1;
 elsif a.previous_id is not null then
  select * into prev from public.finance_vp_revenue_distributions where id=a.previous_id;
 end if;
 -- Only an identical current operation or its immediate retry is idempotent.
 if a.id is not null and a.status='draft' and a.source_snapshot_json=s and a.decisions_json=c and a.note=btrim(p_note)
   and ((p_expected_id=a.id and p_expected_version in (a.version,a.version-1))
     or (a.version=1 and a.created_by=auth.uid() and (
       (a.revision=1 and a.previous_id is null and p_expected_id is null and p_expected_version is null)
       or (a.previous_id=p_expected_id and prev.id=a.previous_id and prev.version=p_expected_version and prev.status='superseded')))) then return a.id; end if;
 if (a.id is not null and (a.id is distinct from p_expected_id or a.version is distinct from p_expected_version))
   or (a.id is null and (prev.id is distinct from p_expected_id or (prev.id is not null and prev.version is distinct from p_expected_version)))
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if a.id is null then
  insert into public.finance_vp_revenue_distributions(payment_id,direct_money_receipt_id,money_allocation_id,revision,previous_id,source_snapshot_json,decisions_json,note,created_at,created_by,updated_at)
  values(p_payment_id,p_direct_id,(s#>>'{money_allocation,id}')::uuid,coalesce(prev.revision,0)+1,prev.id,s,c,btrim(p_note),ts,auth.uid(),ts)
  returning * into a; ev:='created';
 else
  if a.status<>'draft' then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
  update public.finance_vp_revenue_distributions set money_allocation_id=(s#>>'{money_allocation,id}')::uuid,
   source_snapshot_json=s,decisions_json=c,note=btrim(p_note),version=version+1,updated_at=ts where id=a.id returning * into a; ev:='saved';
 end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$save$;

create or replace function public.save_finance_vp_distribution(p_payment_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(p_payment_id,null,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;
create function public.save_finance_direct_vp_distribution(p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(null,p_direct_id,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;

create or replace function public.get_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $context$
declare s jsonb; a public.finance_vp_revenue_distributions%rowtype;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 s:=public.vp_received_source(p_payment_id,p_direct_id);
 select * into a from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded';
 return jsonb_build_object('source',s,'current',case when a.id is null then null else to_jsonb(a) end,
  'source_current',coalesce(a.id is not null and s=a.source_snapshot_json and s->'blockers'='[]'::jsonb,false),
  'can_manage',public.money_allocation_admin(),'posting_enabled',false,
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.revision desc),'[]') from public.finance_vp_revenue_distributions h where h.payment_id is not distinct from p_payment_id and h.direct_money_receipt_id is not distinct from p_direct_id),
  'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by h.revision,(e.evidence_json->>'version')::integer,e.id),'[]')
   from public.finance_vp_revenue_distribution_audit e join public.finance_vp_revenue_distributions h on h.id=e.distribution_id where h.payment_id is not distinct from p_payment_id and h.direct_money_receipt_id is not distinct from p_direct_id));
end;
$context$;

create or replace function public.get_finance_vp_distribution(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path=public as $get$
 select public.get_finance_vp_received_distribution(p_payment_id,null);
$get$;

create or replace function public.get_finance_direct_vp_formula_context(p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $get$
declare context jsonb; people jsonb:='[]';
begin
 context:=public.get_finance_vp_received_distribution(null,p_direct_id);
 if public.money_allocation_admin() then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(btrim(staff_name),''),nullif(btrim(full_name),''),nullif(btrim(email),''),id::text)) order by id),'[]')
   into people from public.user_profiles where active is true;
 end if;
 return context||jsonb_build_object('formula_schema_version',1,'formula_catalog',public.vp_compensation_formula_catalog(),'formula_people',people);
end;
$get$;

create or replace function public.finance_payment_wht_review_v2(p_snapshot jsonb,p_choices jsonb)
returns jsonb language plpgsql immutable set search_path=public
as $review$
declare lines jsonb; basis jsonb; choice jsonb; rate numeric; amount numeric; result jsonb:='[]';
begin
  lines:=public.finance_invoice_wht_lines_v2(p_snapshot);
  if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'WHT_LINE_CHOICES_REQUIRED'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c where jsonb_typeof(c) is distinct from 'object')
  then raise exception 'WHT_LINE_CHOICE_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c, jsonb_object_keys(c) k
    where k not in ('invoice_item_id','applicability','rate_percent'))
  then raise exception 'WHT_LINE_CHOICE_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c group by c->>'invoice_item_id' having count(*)>1)
  then raise exception 'WHT_DUPLICATE_LINE'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c where not exists(
    select 1 from jsonb_array_elements(lines) l where l->>'invoice_item_id'=c->>'invoice_item_id'))
  then raise exception 'WHT_UNKNOWN_SOURCE_LINE'; end if;
  for basis in select l from jsonb_array_elements(lines) l order by l->>'invoice_item_id' loop
    select c into choice from jsonb_array_elements(p_choices) c where c->>'invoice_item_id'=basis->>'invoice_item_id';
    if choice is null or (choice->>'applicability') is null or choice->>'applicability' not in ('applies','does_not_apply')
    then raise exception 'WHT_LINE_APPLICABILITY_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
    rate:=null; amount:=0;
    if choice->>'applicability'='applies' then
      if jsonb_typeof(choice->'rate_percent') is distinct from 'number'
      then raise exception 'WHT_LINE_RATE_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
      rate:=(choice->>'rate_percent')::numeric;
      if rate<=0 or rate>100 or rate<>round(rate,4)
      then raise exception 'WHT_LINE_RATE_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
      amount:=public.finance_structured_wht_amount((basis->>'amount_before_vat')::numeric,rate);
      if amount<=0 then raise exception 'WHT_LINE_RATE_ROUNDS_TO_ZERO' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
    elsif choice->'rate_percent' is not null and choice->'rate_percent'<>'null'::jsonb then
      raise exception 'WHT_NON_APPLICABLE_RATE_NOT_ALLOWED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('invoice_id',basis->>'invoice_id','invoice_item_id',basis->>'invoice_item_id',
      'calculation_rule','line_review_full_invoice_v2','base_amount',(basis->>'amount_before_vat')::numeric,
      'rate_percent',rate,'calculated_wht_amount',amount,'basis_snapshot_json',jsonb_build_object('applicability',choice->>'applicability','basis',basis)));
  end loop;
  return result;
end;
$review$;

-- A new normalized read contract. The existing 044 evidence and Payment JSON are unchanged.
create function public.get_finance_received_money_source(p_source_type text,p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $normalized$
declare s jsonb; m jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_source_type='direct_money_receipt' then
  s:=public.vp_received_source(null,p_source_id); return s->'received_money_source'||jsonb_build_object('blockers',s->'blockers');
 elsif p_source_type='invoice_payment' then
  s:=public.vp_distribution_source(p_source_id); m:=s->'money_source';
  return jsonb_build_object('schema_version',1,'source_type',p_source_type,'source_id',p_source_id,'source_fingerprint',md5(s::text),
   'actual_cash',m#>'{payment,cash}','wht_credit',m#>'{payment,wht}','receivable_settlement',m#>'{payment,settlement}',
   'before_vat',s#>'{totals,base}','vat',s#>'{totals,vat}','currency',m#>'{payment,currency}',
   'lines',(select coalesce(jsonb_agg(l||jsonb_build_object('source_line_id',l->'invoice_item_id')),'[]') from jsonb_array_elements(s->'lines') l),
   'evidence',s,'blockers',s->'blockers','original_leg_key','invoice_payment:'||p_source_id::text||':original');
 end if;
 raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN';
end;
$normalized$;
revoke all on function public.vp_received_line_economics(numeric,numeric,text),public.vp_direct_frozen_source(jsonb),
 public.vp_received_source(uuid,uuid),public.vp_received_frozen(jsonb),public.vp_received_lock(uuid,uuid),
 public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_vp_received_distribution(uuid,uuid),
 public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_direct_vp_formula_context(uuid),
 public.get_finance_received_money_source(text,uuid) from public,anon,authenticated;
grant execute on function public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_direct_vp_formula_context(uuid),
 public.get_finance_received_money_source(text,uuid) to authenticated;
-- END EMBEDDED MIGRATION 047
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Preserve and compare ALL protected_target_evidence / upstream_evidence_hashes before/after.
-- No fixed Ledger/Compensation row-count gate; those systems remain operational. No business UAT actions here.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.finance_structured_wht_amount(numeric,numeric)','d375170216f363ad89e576a877a53b09',false,'i',false,'numeric','plpgsql',array['p_base','p_rate']::text[],0,false,'u',false),
('public.direct_money_lines(jsonb)','a3d68daa8114563718eb46ab8757e049',false,'i',false,'jsonb','plpgsql',array['p_lines']::text[],0,false,'u',false),
('public.direct_money_payload(jsonb)','93a1f42cb8b6e7ae05182558cf4f1e40',true,'s',false,'jsonb','plpgsql',array['p_input']::text[],0,false,'u',false),
('public.direct_money_snapshot(public.finance_direct_money_receipts)','287a1077274b2ebf3889f7cda0de3d7c',true,'s',false,'jsonb','sql',array['p']::text[],0,false,'u',false),
('public.save_finance_direct_money_receipt(uuid,integer,jsonb)','238cad995c70864a383522f5626f4b26',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_input']::text[],0,false,'u',false),
('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','621fd126935fcfac21556d0ac95a44ee',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.direct_money_guard()','f6ca48044ecbdb35d1aadd1191bcbe0e',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.direct_money_classification_lines(jsonb,jsonb)','13fb4029cd92ed443788f86d6d7fce42',false,'i',false,'jsonb','plpgsql',array['p_original','p_choices']::text[],0,false,'u',false),
('public.direct_money_integrity()','9750729c08f92127574d751654214993',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text)','8b82f858b8961f73f4c3660defde5795',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_choices','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.vp_received_line_economics(numeric,numeric,text)','86abd1474cfd67d89ea93c47fdc6bfb8',false,'i',false,'jsonb','plpgsql',array['p_base','p_wht','p_classification']::text[],0,false,'u',false),
('public.vp_distribution_frozen_source(jsonb,jsonb)','fce7539a2fa915dc56c5974bba210fef',false,'i',false,'jsonb','plpgsql',array['p_money_source','p_money_allocation']::text[],0,false,'u',false),
('public.vp_direct_frozen_source(jsonb)','133aefc5d4e6cce920ea8e9dc53264b4',false,'i',false,'jsonb','plpgsql',array['s']::text[],0,false,'u',false),
('public.vp_received_source(uuid,uuid)','ad435cbfac069fb5a53722f15cd1f8ed',true,'s',false,'jsonb','plpgsql',array['p_payment_id','p_direct_id']::text[],0,false,'u',false),
('public.vp_received_frozen(jsonb)','4a6e39b62924cfb5cc6da2cbe209f96f',false,'i',false,'jsonb','sql',array['p_source']::text[],0,false,'u',false),
('public.vp_received_lock(uuid,uuid)','6ea0cee2f0d2bad0d46263ca6d11c6fd',true,'v',false,'void','plpgsql',array['p_payment_id','p_direct_id']::text[],0,false,'u',false),
('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','240df9ff78400a6ed8aae924f36cbf20',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','a81c9b3f218f662dd41e5092dc05e0fb',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','71ab2be543407aa3a1610c4882e227fd',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_validate()','386dddc7e227fc12d3d0b12faaac3e62',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','234e3f2e768a7856af3515ad74076e84',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)','845627702267502da870422c3f9f2b61',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_direct_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','86faeae0080c83da22e84ddf1fb8c1fd',true,'v',false,'uuid','sql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','361b4fc48a963daa0e481be4174856e3',true,'v',false,'uuid','sql',array['p_direct_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.get_finance_vp_received_distribution(uuid,uuid)','7903ab046ea1890e56dd332fc2f7ac31',true,'s',false,'jsonb','plpgsql',array['p_payment_id','p_direct_id']::text[],0,false,'u',false),
('public.get_finance_vp_distribution(uuid)','f759208295949612b78a5e11f61fdf36',true,'s',false,'jsonb','sql',array['p_payment_id']::text[],0,false,'u',false),
('public.get_finance_direct_vp_formula_context(uuid)','0d4a6869c2b74a78f7484621680d4546',true,'s',false,'jsonb','plpgsql',array['p_direct_id']::text[],0,false,'u',false),
('public.finance_payment_wht_review_v2(jsonb,jsonb)','fca9753b894f1a6acf0c041c524317cc',false,'i',false,'jsonb','plpgsql',array['p_snapshot','p_choices']::text[],0,false,'u',false),
('public.get_finance_received_money_source(text,uuid)','10e18e3a3bd9867eaedbd4a42ee23a6b',true,'s',false,'jsonb','plpgsql',array['p_source_type','p_source_id']::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),retained_functions(signature,hash) as(values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66'),
('public.calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric)','caf162441a1bb1dbeea2aba6461b4b5a'),
('public.assert_finance_billable_charge_context(uuid,bigint,uuid)','79ea6c5b4cae8483a652384ed1385e60'),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c'),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0'),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab'),
('public.guard_vp_distribution_source()','d9c2dfe4aedd09392bf393e1a91587ab'),
('public.vp_compensation_formula_catalog()','e7dd3b4645419ad707ba60494dd9d301'),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8'),
('public.vp_formula_result_guard()','c0e42b906d2a4198ee95ce82ab1cdf5a')),
 retained_function_differences as(select e.signature,e.hash as expected_hash,md5(p.prosrc) as actual_hash from retained_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) where p.oid is null or md5(p.prosrc) is distinct from e.hash),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg((to_jsonb(r)-'direct_money_receipt_id') order by (to_jsonb(r)-'direct_money_receipt_id')::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r)) as hashes), protected_targets as(select jsonb_build_object(
 'payment_95E22D0E',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'invoice_VP_IV_202609_000004',(select to_jsonb(i) from public.finance_invoices i where invoice_no='VP-IV-202609-000004'),
 'combined_D903B209',(select to_jsonb(c) from public.finance_combined_documents c where upper(left(id::text,8))='D903B209')) as evidence), actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_direct_money_receipts','finance_direct_money_receipt_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit') order by c.relname),
 expected_catalog as(select value as expected from jsonb_array_elements('[{"name":"finance_direct_money_receipt_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"receipt_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"direct_money_audit_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_direct_money_receipt_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_event_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''classified''::text, ''confirmed''::text, ''reversed''::text])))","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_receipt_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (receipt_id) REFERENCES finance_direct_money_receipts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_receipt_id_version_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (receipt_id, version)","initially_deferred":false},{"name":"finance_direct_money_receipt_audit_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false}],"indexes":[{"name":"finance_direct_money_receipt_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_direct_money_receipt_audit_pkey ON public.finance_direct_money_receipt_audit USING btree (id)"},{"name":"finance_direct_money_receipt_audit_receipt_id_version_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_direct_money_receipt_audit_receipt_id_version_key ON public.finance_direct_money_receipt_audit USING btree (receipt_id, version)"}],"policies":[{"name":"direct_money_audit_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"direct_money_audit_immutable","enabled":"O","definition":"CREATE TRIGGER direct_money_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_direct_money_receipt_audit FOR EACH ROW EXECUTE FUNCTION direct_money_guard()"},{"name":"direct_money_audit_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER direct_money_audit_integrity AFTER INSERT ON public.finance_direct_money_receipt_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION direct_money_integrity()"},{"name":"direct_money_audit_no_truncate","enabled":"O","definition":"CREATE TRIGGER direct_money_audit_no_truncate BEFORE TRUNCATE ON public.finance_direct_money_receipt_audit FOR EACH STATEMENT EXECUTE FUNCTION direct_money_guard()"}]},{"name":"finance_direct_money_receipts","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"client_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"payer_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"case_id","type":"bigint","default":null,"identity":"","not_null":false,"generated":""},{"name":"advisory_matter_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"received_on","type":"date","default":null,"identity":"","not_null":true,"generated":""},{"name":"method","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"receiving_bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"cash_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"wht_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"amount_before_vat","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"vat_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"reference_no","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"evidence_reference","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"note","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"lines_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"unclassified","type":"boolean","default":null,"identity":"","not_null":true,"generated":""},{"name":"input_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"confirmed_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"classification_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversal_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"direct_money_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_direct_money_receipts_advisory_matter_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (advisory_matter_id) REFERENCES advisory_matters(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_amount_before_vat_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((amount_before_vat > (0)::numeric))","initially_deferred":false},{"name":"finance_direct_money_receipts_case_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_cash_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((cash_amount > (0)::numeric) AND (cash_amount = round(cash_amount, 2))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((gross_amount = (cash_amount + wht_amount)) AND (gross_amount = (amount_before_vat + vat_amount))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((case_id IS NULL) OR (advisory_matter_id IS NULL)))","initially_deferred":false},{"name":"finance_direct_money_receipts_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((case_id IS NULL) AND (advisory_matter_id IS NULL)) OR (client_id IS NOT NULL)))","initially_deferred":false},{"name":"finance_direct_money_receipts_check3","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((method = ''bank_transfer''::text) AND (receiving_bank_account_id IS NOT NULL) AND (cash_location IS NULL)) OR ((method <> ''bank_transfer''::text) AND (receiving_bank_account_id IS NULL) AND ((length(btrim(cash_location)) >= 1) AND (length(btrim(cash_location)) <= 300)))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check4","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''draft''::text) AND (confirmed_at IS NULL) AND (confirmed_by IS NULL) AND (confirmed_snapshot_json IS NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reversal_reason IS NULL)) OR ((status = ''confirmed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_snapshot_json IS NOT NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reversal_reason IS NULL)) OR ((status = ''reversed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_snapshot_json IS NOT NULL) AND (reversed_at IS NOT NULL) AND (reversed_by IS NOT NULL) AND ((length(btrim(reversal_reason)) >= 1) AND (length(btrim(reversal_reason)) <= 2000)))))","initially_deferred":false},{"name":"finance_direct_money_receipts_classification_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((classification_json IS NULL) OR (jsonb_typeof(classification_json) = ''object''::text)))","initially_deferred":false},{"name":"finance_direct_money_receipts_client_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_confirmed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency = ''THB''::text))","initially_deferred":false},{"name":"finance_direct_money_receipts_evidence_reference_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(evidence_reference) >= 1) AND (length(evidence_reference) <= 1000)))","initially_deferred":false},{"name":"finance_direct_money_receipts_input_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(input_json) = ''object''::text))","initially_deferred":false},{"name":"finance_direct_money_receipts_lines_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((jsonb_typeof(lines_json) = ''array''::text) AND ((jsonb_array_length(lines_json) >= 1) AND (jsonb_array_length(lines_json) <= 100))))","initially_deferred":false},{"name":"finance_direct_money_receipts_method_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((method = ANY (ARRAY[''bank_transfer''::text, ''cash''::text, ''other''::text])))","initially_deferred":false},{"name":"finance_direct_money_receipts_note_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((length(note) <= 2000))","initially_deferred":false},{"name":"finance_direct_money_receipts_payer_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(payer_name)) >= 1) AND (length(btrim(payer_name)) <= 500)))","initially_deferred":false},{"name":"finance_direct_money_receipts_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_direct_money_receipts_receiving_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (receiving_bank_account_id) REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_reference_no_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(reference_no) >= 1) AND (length(reference_no) <= 200)))","initially_deferred":false},{"name":"finance_direct_money_receipts_reversed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reversed_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''reversed''::text])))","initially_deferred":false},{"name":"finance_direct_money_receipts_vat_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((vat_amount >= (0)::numeric))","initially_deferred":false},{"name":"finance_direct_money_receipts_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false},{"name":"finance_direct_money_receipts_wht_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((wht_amount >= (0)::numeric) AND (wht_amount = round(wht_amount, 2))))","initially_deferred":false}],"indexes":[{"name":"direct_money_active_evidence","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX direct_money_active_evidence ON public.finance_direct_money_receipts USING btree (lower(btrim(evidence_reference))) WHERE ((status <> ''reversed''::text) AND (evidence_reference IS NOT NULL))"},{"name":"direct_money_active_reference","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX direct_money_active_reference ON public.finance_direct_money_receipts USING btree (method, COALESCE((receiving_bank_account_id)::text, cash_location), currency, received_on, lower(btrim(reference_no))) WHERE ((status <> ''reversed''::text) AND (reference_no IS NOT NULL))"},{"name":"direct_money_list","ready":true,"valid":true,"definition":"CREATE INDEX direct_money_list ON public.finance_direct_money_receipts USING btree (created_at DESC, id)"},{"name":"finance_direct_money_receipts_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_direct_money_receipts_pkey ON public.finance_direct_money_receipts USING btree (id)"}],"policies":[{"name":"direct_money_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"direct_money_immutable","enabled":"O","definition":"CREATE TRIGGER direct_money_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_direct_money_receipts FOR EACH ROW EXECUTE FUNCTION direct_money_guard()"},{"name":"direct_money_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER direct_money_integrity AFTER INSERT OR UPDATE ON public.finance_direct_money_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION direct_money_integrity()"},{"name":"direct_money_no_truncate","enabled":"O","definition":"CREATE TRIGGER direct_money_no_truncate BEFORE TRUNCATE ON public.finance_direct_money_receipts FOR EACH STATEMENT EXECUTE FUNCTION direct_money_guard()"}]},{"name":"finance_vp_revenue_distribution_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_vp_revenue_distribution_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_event_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_evidence_json_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK (COALESCE(((jsonb_typeof((evidence_json -> ''version''::text)) = ''number''::text) AND (((evidence_json ->> ''version''::text))::numeric >= (1)::numeric) AND (((evidence_json ->> ''version''::text))::numeric = trunc(((evidence_json ->> ''version''::text))::numeric))), false))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"vp_distribution_audit_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_vp_revenue_distribution_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distribution_audit_pkey ON public.finance_vp_revenue_distribution_audit USING btree (id)"},{"name":"vp_distribution_audit_parent","ready":true,"valid":true,"definition":"CREATE INDEX vp_distribution_audit_parent ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, created_at, id)"},{"name":"vp_distribution_audit_version","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_audit_version ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, (((evidence_json ->> ''version''::text))::integer))"}],"policies":[{"name":"vp_distribution_audit_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"vp_distribution_audit_immutable","enabled":"O","definition":"CREATE TRIGGER vp_distribution_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_vp_revenue_distribution_audit FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_distribution_audit_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER vp_distribution_audit_integrity AFTER INSERT ON public.finance_vp_revenue_distribution_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"},{"name":"vp_distribution_audit_no_truncate","enabled":"O","definition":"CREATE TRIGGER vp_distribution_audit_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distribution_audit FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"}]},{"name":"finance_vp_revenue_distributions","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payment_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"money_allocation_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"revision","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"previous_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"source_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"decisions_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"note","type":"text","default":"''''::text","identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"reviewed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"reviewed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"finalized_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"finalized_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"supersede_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"direct_money_receipt_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_vp_revenue_distributions_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((revision = 1) = (previous_id IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((updated_at >= created_at))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check10","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) OR ((finalized_at >= reviewed_at) AND (finalized_at <= updated_at))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check11","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''superseded''::text) AND (superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (COALESCE(NULLIF(btrim(supersede_reason), ''''::text), ''''::text) <> ''''::text) AND (supersede_reason = btrim(supersede_reason)) AND (superseded_at >= COALESCE(finalized_at, reviewed_at, created_at)) AND (superseded_at <= updated_at)) OR ((status <> ''superseded''::text) AND (superseded_at IS NULL) AND (superseded_by IS NULL) AND (supersede_reason IS NULL))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check3","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check4","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''draft''::text) OR ((reviewed_at IS NULL) AND (finalized_at IS NULL))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check5","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check6","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''reviewed''::text) OR (finalized_at IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check7","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''finalized''::text) OR (finalized_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check8","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) OR ((reviewed_at IS NOT NULL) AND (status = ANY (ARRAY[''finalized''::text, ''superseded''::text])))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check9","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reviewed_at IS NULL) OR ((reviewed_at >= created_at) AND (reviewed_at <= updated_at))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_decisions_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(decisions_json) = ''array''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_direct_money_receipt_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (direct_money_receipt_id) REFERENCES finance_direct_money_receipts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_finalized_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_money_allocation_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (money_allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_note_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(note) <= 2000) AND (note = btrim(note))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_payment_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_payment_id_revision_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (payment_id, revision)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_previous_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (previous_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_previous_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (previous_id)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_reviewed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_revision_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((revision > 0))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_source_snapshot_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_supersede_reason_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((length(supersede_reason) <= 2000))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_superseded_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false},{"name":"vp_distribution_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"vp_distribution_source_identity","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((payment_id IS NOT NULL) AND (direct_money_receipt_id IS NULL)) OR ((payment_id IS NULL) AND (direct_money_receipt_id IS NOT NULL) AND (money_allocation_id IS NULL))))","initially_deferred":false}],"indexes":[{"name":"finance_vp_revenue_distributions_payment_id_revision_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_payment_id_revision_key ON public.finance_vp_revenue_distributions USING btree (payment_id, revision)"},{"name":"finance_vp_revenue_distributions_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_pkey ON public.finance_vp_revenue_distributions USING btree (id)"},{"name":"finance_vp_revenue_distributions_previous_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_previous_id_key ON public.finance_vp_revenue_distributions USING btree (previous_id)"},{"name":"vp_distribution_current_direct","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_current_direct ON public.finance_vp_revenue_distributions USING btree (direct_money_receipt_id) WHERE (status <> ''superseded''::text)"},{"name":"vp_distribution_current_payment","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_current_payment ON public.finance_vp_revenue_distributions USING btree (payment_id) WHERE (status <> ''superseded''::text)"},{"name":"vp_distribution_direct_revision","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_direct_revision ON public.finance_vp_revenue_distributions USING btree (direct_money_receipt_id, revision)"},{"name":"vp_distribution_money_allocation","ready":true,"valid":true,"definition":"CREATE INDEX vp_distribution_money_allocation ON public.finance_vp_revenue_distributions USING btree (money_allocation_id) WHERE (money_allocation_id IS NOT NULL)"}],"policies":[{"name":"vp_distribution_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"vp_distribution_immutable","enabled":"O","definition":"CREATE TRIGGER vp_distribution_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_distribution_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER vp_distribution_integrity AFTER INSERT OR UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"},{"name":"vp_distribution_no_truncate","enabled":"O","definition":"CREATE TRIGGER vp_distribution_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distributions FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_formula_result_guard","enabled":"O","definition":"CREATE TRIGGER vp_formula_result_guard BEFORE INSERT OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_formula_result_guard()"}]}]'::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
  from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('exact_functions',not exists(select 1 from function_differences)),
 ('retained_tax_formula_permission_functions',not exists(select 1 from retained_function_differences)),
 ('private_and_rpc_permissions',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.finance_structured_wht_amount(numeric,numeric)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.finance_structured_wht_amount(numeric,numeric)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.finance_structured_wht_amount(numeric,numeric)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.finance_structured_wht_amount(numeric,numeric)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_lines(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_lines(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_lines(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_lines(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_payload(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_direct_money_receipt(uuid,integer,jsonb)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_direct_money_receipt(uuid,integer,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_direct_money_receipt(uuid,integer,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_direct_money_receipt(uuid,integer,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_guard()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_guard()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_guard()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_guard()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_classification_lines(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_classification_lines(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_classification_lines(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_classification_lines(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_integrity()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_integrity()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_integrity()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_integrity()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_line_economics(numeric,numeric,text)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_line_economics(numeric,numeric,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_received_line_economics(numeric,numeric,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_received_line_economics(numeric,numeric,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_direct_frozen_source(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_direct_frozen_source(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_direct_frozen_source(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_direct_frozen_source(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_source(uuid,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_source(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_received_source(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_received_source(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_frozen(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_frozen(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_received_frozen(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_received_frozen(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_lock(uuid,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_received_lock(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_received_lock(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_received_lock(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_validate()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_received_distribution(uuid,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_received_distribution(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_received_distribution(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_received_distribution(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_distribution(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_direct_vp_formula_context(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_direct_vp_formula_context(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_direct_vp_formula_context(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_direct_vp_formula_context(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.finance_payment_wht_review_v2(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.finance_payment_wht_review_v2(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.finance_payment_wht_review_v2(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.finance_payment_wht_review_v2(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_received_money_source(text,uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_received_money_source(text,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_received_money_source(text,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_received_money_source(text,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
  and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
  and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a where a.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in('finance_direct_money_receipts','finance_direct_money_receipt_audit'))),
 ('new_zero_state',not exists(select 1 from finance_direct_money_receipts) and not exists(select 1 from finance_direct_money_receipt_audit)
  and not exists(select 1 from finance_vp_revenue_distributions where direct_money_receipt_id is not null)),
 ('rehearsal_evidence_unchanged',nullif(current_setting('vp.direct047_before',true),'') is null or current_setting('vp.direct047_before',true)=(select hashes::text from protected))
 ) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as direct_money_receipt_foundation_verification_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select evidence from protected_targets) as protected_target_evidence,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(d.evidence),'[]') from (select to_jsonb(f) as evidence from function_differences f union all select to_jsonb(r) from retained_function_differences r) d) as function_differences,
 jsonb_build_object('legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments), 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ,'direct_money_rows',(select count(*) from finance_direct_money_receipts),'direct_money_audit_rows',(select count(*) from finance_direct_money_receipt_audit)) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;
ROLLBACK;
