-- Phase 6A.1: retain versioned company logos and freeze explicit Receipt evidence.
-- No business rows or storage bytes are changed. Apply only after manual preflight.
-- Storage RLS protects normal API writes. No triggers, ownership changes or table
-- DDL on managed Storage. Privileged out-of-band administration is not covered.

do $logo_precondition$
begin
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.build_finance_receipt_source(uuid)'))
    is distinct from '591924d577f438ba1bbe21b0ea540052' then
    raise exception 'DOCUMENT_LOGO_UNEXPECTED_RECEIPT_SOURCE_CONTRACT';
  end if;
  if not (
-- BEGIN STORAGE POLICY CAPABILITY SELECT
select exists(select 1 from pg_class c where c.oid='storage.objects'::regclass
    and pg_has_role(current_user,c.relowner,'USAGE'))
  or exists(
    select 1 from pg_settings s
    cross join lateral jsonb_array_elements_text(
      coalesce(nullif(s.setting,'')::jsonb->current_user,'[]'::jsonb)
    ) granted(table_name)
    where s.name='supautils.policy_grants' and s.context in ('sighup','postmaster','superuser')
      and to_regclass(granted.table_name)='storage.objects'::regclass
  ) as can_manage_storage_policies
-- END STORAGE POLICY CAPABILITY SELECT
  ) then
    raise exception 'DOCUMENT_LOGO_STORAGE_POLICY_PERMISSION_REQUIRED'
      using hint='Stop and review SQL Editor policy permissions; do not assume Storage ownership or change platform roles.';
  end if;
end;
$logo_precondition$;

create policy document_logos_no_update on storage.objects
as restrictive for update to public
using (not (bucket_id = 'vp-document-assets' and name like 'company/logo/%'))
with check (not (bucket_id = 'vp-document-assets' and name like 'company/logo/%'));

create policy document_logos_no_delete on storage.objects
as restrictive for delete to public
using (not (bucket_id = 'vp-document-assets' and name like 'company/logo/%'));

create policy receipt_document_logos_read on storage.objects
for select to authenticated
using (bucket_id = 'vp-document-assets' and name like 'company/logo/%'
  and public.current_user_can_view_finance_receipts());

create function public.document_logo_evidence(p_path text)
returns jsonb language plpgsql security definer set search_path = public
as $logo_evidence$
declare v_object storage.objects%rowtype;
begin
  if p_path is null or p_path !~ '^company/logo/[^/]+$' or p_path like '%..%' then
    raise exception 'RECEIPT_LOGO_EVIDENCE_REQUIRED';
  end if;
  select * into v_object from storage.objects
    where bucket_id = 'vp-document-assets' and name = p_path;
  if not found or lower(coalesce(v_object.metadata->>'mimetype',''))
    not in ('image/png','image/jpeg','image/webp','image/svg+xml') then
    raise exception 'RECEIPT_LOGO_EVIDENCE_REQUIRED';
  end if;
  return jsonb_build_object('bucket','vp-document-assets','path',v_object.name,
    'object_id',v_object.id,'storage_version',to_jsonb(v_object)->>'version');
end;
$logo_evidence$;

-- Defense in depth: a new Issue cannot use a schema-1 or incomplete logo snapshot,
-- even in trusted SQL. Already-issued schema-1 history remains untouched.
create function public.guard_receipt_logo_issue()
returns trigger language plpgsql security definer set search_path = public
as $logo_issue$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    if (new.issued_snapshot_json->'schema_version') is distinct from '2'::jsonb
      or (new.issued_snapshot_json #> '{seller,logo_asset}') is distinct from
        public.document_logo_evidence(new.issued_snapshot_json #>> '{seller,logo_asset,path}') then
      raise exception 'RECEIPT_LOGO_EVIDENCE_REQUIRED';
    end if;
  end if;
  return new;
end;
$logo_issue$;
create trigger receipt_logo_issue_guard before update on public.finance_receipts
for each row execute function public.guard_receipt_logo_issue();

create or replace function public.build_finance_receipt_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $receipt_source$
declare
  v_payment public.finance_payments%rowtype;
  v_company jsonb;
  v_seller jsonb;
  v_bank jsonb;
  v_customer jsonb;
  v_candidate_customer jsonb;
  v_allocation record;
  v_invoice public.finance_invoices%rowtype;
  v_invoices jsonb := '[]'::jsonb;
  v_cash numeric := 0;
  v_wht numeric := 0;
  v_description text;
begin
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'RECEIPT_CONFIRMED_PAYMENT_REQUIRED'; end if;
  if v_payment.received_on is null or v_payment.payment_method is null or v_payment.settlement_amount <= 0
  then raise exception 'RECEIPT_PAYMENT_EVIDENCE_REQUIRED'; end if;
  select to_jsonb(company) into v_company from public.finance_company_profiles company where id = 'default' for share;
  v_seller := jsonb_build_object(
    'company_name_th',v_company->>'company_name_th','company_name_en',v_company->>'company_name_en',
    'tax_id',v_company->>'tax_id','address_th',v_company->>'address_th','address_en',v_company->>'address_en',
    'branch_label_th',coalesce(nullif(btrim(v_company->>'branch_th'),''),nullif(btrim(v_company->>'branch_label'),''),'สำนักงานใหญ่'),
    'branch_label_en',coalesce(nullif(btrim(v_company->>'branch_en'),''),'Head Office'),
    'phone',v_company->>'phone','email',v_company->>'email','website',v_company->>'website',
    'logo_asset',public.document_logo_evidence(v_company->>'logo_storage_path')
  );
  if nullif(btrim(v_seller->>'company_name_th'),'') is null
    or nullif(btrim(v_seller->>'address_th'),'') is null
    or nullif(btrim(v_seller->>'tax_id'),'') is null
  then raise exception 'RECEIPT_SELLER_IDENTITY_REQUIRED'; end if;
  if v_payment.receiving_bank_account_id is not null then
    select jsonb_build_object('id',bank.id,'short_name',bank.short_name,'bank_name',bank.bank_name,
      'account_name',bank.account_name,'account_number',bank.account_number,'branch_name',to_jsonb(bank)->>'branch_name')
    into v_bank from public.finance_bank_accounts bank where id = v_payment.receiving_bank_account_id for share;
    if v_bank is null or nullif(btrim(v_bank->>'bank_name'),'') is null
      or nullif(btrim(v_bank->>'account_name'),'') is null or nullif(btrim(v_bank->>'account_number'),'') is null
    then raise exception 'RECEIPT_RECEIVING_ACCOUNT_REQUIRED'; end if;
  end if;
  if v_payment.payment_method = 'bank_transfer' and v_bank is null
    and nullif(btrim(v_payment.receiving_account_reference),'') is null
  then raise exception 'RECEIPT_RECEIVING_ACCOUNT_REQUIRED'; end if;
  perform 1 from public.finance_invoices where id in (
    select invoice_id from public.finance_payment_effective_invoice_allocations where payment_id = p_payment_id
  ) order by id for share;
  for v_allocation in select * from public.finance_payment_effective_invoice_allocations
    where payment_id = p_payment_id order by invoice_id
  loop
    select * into strict v_invoice from public.finance_invoices where id = v_allocation.invoice_id;
    if v_invoice.document_status <> 'issued' or v_invoice.client_id <> v_payment.client_id
      or v_invoice.currency <> v_payment.currency
      or coalesce(v_invoice.issued_snapshot_json->>'schema_version','') not in ('1','2')
      or (v_invoice.issued_snapshot_json #>> '{invoice,id}') is distinct from v_invoice.id::text
      or (v_invoice.issued_snapshot_json #>> '{invoice,invoice_no}') is distinct from v_invoice.invoice_no
      or (v_invoice.issued_snapshot_json #>> '{invoice,document_status}') is distinct from 'issued'
      or (v_invoice.issued_snapshot_json #>> '{invoice,currency}') is distinct from v_payment.currency
      or nullif(v_invoice.issued_snapshot_json #>> '{invoice,issued_at}','') is null
      or nullif(v_invoice.invoice_no,'') is null
      or jsonb_typeof(v_invoice.issued_snapshot_json->'items') is distinct from 'array'
    then raise exception 'RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED'; end if;
    -- V1 snapshots have normalized customer fields; V2 preserves the Invoice
    -- row and its original customer snapshot. Never consult mutable Client data.
    v_candidate_customer := jsonb_build_object(
      'id',v_payment.client_id,
      'name',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_name}',
        v_invoice.issued_snapshot_json #>> '{customer,name}',v_invoice.issued_snapshot_json #>> '{customer,client_display_name}'),
      'tax_id',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_tax_id}',v_invoice.issued_snapshot_json #>> '{customer,tax_id}'),
      'address',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_billing_address}',
        v_invoice.issued_snapshot_json #>> '{customer,billing_address}',v_invoice.issued_snapshot_json #>> '{customer,address}'),
      'branch',coalesce(v_invoice.issued_snapshot_json #>> '{invoice,customer_branch}',
        v_invoice.issued_snapshot_json #>> '{customer,branch}',v_invoice.issued_snapshot_json #>> '{customer,branch_label}')
    );
    if nullif(btrim(v_candidate_customer->>'name'),'') is null then raise exception 'RECEIPT_CUSTOMER_IDENTITY_REQUIRED'; end if;
    if v_customer is not null and v_customer <> v_candidate_customer then raise exception 'RECEIPT_CUSTOMER_EVIDENCE_CONFLICT'; end if;
    v_customer := v_candidate_customer;
    select string_agg(coalesce(item->>'description',item #>> '{invoice_item,description}'),'; ' order by ordinal)
      into v_description from jsonb_array_elements(v_invoice.issued_snapshot_json->'items') with ordinality as entries(item,ordinal);
    if nullif(btrim(v_description),'') is null then raise exception 'RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED'; end if;
    if v_allocation.effective_cash_allocated < 0 or v_allocation.effective_wht_credit_allocated < 0
      or v_allocation.effective_settlement_total <= 0
      or v_allocation.effective_settlement_total <> v_allocation.effective_cash_allocated + v_allocation.effective_wht_credit_allocated
    then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
    v_cash := v_cash + v_allocation.effective_cash_allocated;
    v_wht := v_wht + v_allocation.effective_wht_credit_allocated;
    v_invoices := v_invoices || jsonb_build_array(jsonb_build_object(
      'invoice_id',v_invoice.id,'invoice_no',v_invoice.invoice_no,'currency',v_invoice.currency,
      'description',v_description,'matter',v_invoice.issued_snapshot_json->'matter',
      'cash_allocated',v_allocation.effective_cash_allocated,'wht_allocated',v_allocation.effective_wht_credit_allocated,
      'settlement_allocated',v_allocation.effective_settlement_total,
      'invoice_snapshot_schema_version',v_invoice.issued_snapshot_json->'schema_version',
      'invoice_issued_at',v_invoice.issued_snapshot_json #> '{invoice,issued_at}'
    ));
  end loop;
  if jsonb_array_length(v_invoices) = 0 or v_cash <> v_payment.cash_amount or v_wht <> v_payment.wht_amount
  then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
  return jsonb_build_object('schema_version',2,'document_kind','receipt','seller',v_seller,'customer',v_customer,
    'payment',jsonb_build_object('id',v_payment.id,'internal_reference',v_payment.internal_reference,
      'received_on',v_payment.received_on,'payment_method',v_payment.payment_method,
      'receiving_bank_account',v_bank,'receiving_account_reference',v_payment.receiving_account_reference,
      'external_transaction_reference',v_payment.external_transaction_reference,'payer_name',v_payment.payer_name,
      'cash_amount',v_payment.cash_amount,'wht_amount',v_payment.wht_amount,
      'settlement_amount',v_payment.settlement_amount,'currency',v_payment.currency),
    'invoices',v_invoices,'structured_wht_components',coalesce((select jsonb_agg(jsonb_build_object(
      'id',component.id,'invoice_id',component.invoice_id,'invoice_item_id',component.invoice_item_id,
      'calculation_rule',component.calculation_rule,'base_amount',component.base_amount,
      'rate_percent',component.rate_percent,'calculated_wht_amount',component.calculated_wht_amount,
      'basis_snapshot_json',component.basis_snapshot_json) order by component.id)
      from public.finance_payment_wht_components component where payment_id = p_payment_id),'[]'::jsonb));
end;
$receipt_source$;

revoke all on function public.document_logo_evidence(text),public.guard_receipt_logo_issue(),
public.build_finance_receipt_source(uuid) from public,anon,authenticated;
