BEGIN;
-- Rollback-only schema rehearsal. No business lifecycle calls.
-- BEGIN EMBEDDED MIGRATION 040
-- Prospective document decisions and one-number combined issuance. No backfill.
-- Apply only after the SELECT-only preflight and external VP-RTI manual gate.

create function public.finance_vat_treatment(p_evidence jsonb,p_applicable boolean,p_rate numeric)
returns jsonb language plpgsql immutable set search_path=public as $vat$
declare treatment text:=p_evidence->>'treatment'; reason text:=nullif(btrim(p_evidence->>'reason'),'');
begin
  if p_applicable is true and p_rate>0 and p_rate<=100 then
    if treatment is not null and treatment not in ('unknown','standard_rate') then raise exception 'DOCUMENT_VAT_CONFLICT'; end if;
    return jsonb_build_object('schema_version',1,'treatment','standard_rate','reason',null,'basis','explicit_positive_vat');
  end if;
  if treatment is null or treatment='unknown' then
    return jsonb_build_object('schema_version',1,'treatment','unknown','reason',null,'basis','unresolved');
  end if;
  if p_rate is distinct from 0 or reason is null or length(reason)>2000
    or treatment not in ('zero_rated','exempt','outside_scope','disbursement','pass_through')
    or (treatment='zero_rated') is distinct from p_applicable then raise exception 'DOCUMENT_VAT_CONFLICT'; end if;
  return jsonb_build_object('schema_version',1,'treatment',treatment,'reason',reason,'basis','explicit_review');
end;
$vat$;

alter table public.finance_quotation_items add column vat_treatment_json jsonb;
alter table public.finance_fee_agreement_items add column vat_treatment_json jsonb;
alter table public.finance_billing_installment_items add column vat_treatment_json jsonb;
alter table public.finance_billable_charges add column vat_treatment_json jsonb;
alter table public.finance_invoice_items add column vat_treatment_json jsonb;

create function public.inherit_finance_document_vat_treatment()
returns trigger language plpgsql security definer set search_path=public as $inherit$
declare evidence jsonb; inherited boolean:=false; tax_facts_changed boolean:=false;
begin
  if tg_table_name='finance_fee_agreement_items' then
    select vat_treatment_json into evidence from public.finance_quotation_items where id=new.source_quotation_item_id;
    inherited:=new.source_quotation_item_id is not null;
  elsif tg_table_name='finance_billing_installment_items' then
    select vat_treatment_json into evidence from public.finance_fee_agreement_items where id=new.fee_agreement_item_id;
    inherited:=true;
  elsif tg_table_name='finance_billable_charges' then
    if new.source_billing_installment_item_id is not null then
      select vat_treatment_json into evidence from public.finance_billing_installment_items where id=new.source_billing_installment_item_id;
      inherited:=true;
    end if;
  elsif tg_table_name='finance_invoice_items' then
    if new.source_billable_charge_id is not null then
      select vat_treatment_json into evidence from public.finance_billable_charges where id=new.source_billable_charge_id;
    else
      select vat_treatment_json into evidence from public.finance_fee_agreement_items where id=new.source_fee_agreement_item_id;
    end if;
    inherited:=true;
  end if;
  if inherited then
    -- Null remains null for historical source chains; never retrofit their evidence.
    new.vat_treatment_json:=evidence;
  else
    if tg_op='UPDATE' then
      tax_facts_changed:=(new.vat_applicable,new.vat_rate) is distinct from (old.vat_applicable,old.vat_rate);
      -- The atomic quotation save writes financial facts before applying its new evidence.
      if tax_facts_changed and new.vat_treatment_json is not distinct from old.vat_treatment_json then
        new.vat_treatment_json:=null;
      end if;
    end if;
    if tg_op='INSERT' or tax_facts_changed or new.vat_treatment_json is not null then
      new.vat_treatment_json:=public.finance_vat_treatment(new.vat_treatment_json,new.vat_applicable,new.vat_rate);
    end if;
  end if;
  return new;
end;
$inherit$;

do $vat_tables$
declare name text;
begin
  foreach name in array array['finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items'] loop
    execute format('alter table public.%I add constraint document_vat_evidence_object check(vat_treatment_json is null or (jsonb_typeof(vat_treatment_json)=''object'' and vat_treatment_json->>''schema_version''=''1''))',name);
    execute format('create trigger z_document_vat_inherit before insert or update on public.%I for each row execute function public.inherit_finance_document_vat_treatment()',name);
  end loop;
end;
$vat_tables$;

create table public.finance_combined_documents (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  receipt_id uuid not null unique references public.finance_receipts(id) on delete restrict deferrable initially deferred,
  tax_invoice_id uuid not null unique references public.finance_tax_invoices(id) on delete restrict deferrable initially deferred,
  status text not null default 'draft' check(status in ('draft','issued','cancelled')),
  combined_no text unique,
  issue_date date not null,
  source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
  draft_snapshot_json jsonb not null check(jsonb_typeof(draft_snapshot_json)='object'),
  issued_snapshot_json jsonb,
  decisions_json jsonb not null default '{}' check(jsonb_typeof(decisions_json)='object'),
  external_receipt_checked boolean not null,
  issued_at timestamptz,
  issued_by_user_id uuid references public.user_profiles(id),
  created_by_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancel_reason text,
  constraint combined_lifecycle check(
    (status in ('draft','cancelled') and combined_no is null and issued_at is null and issued_by_user_id is null and issued_snapshot_json is null)
    or (status='issued' and combined_no is not null and combined_no ~ '^VP-RTI-[0-9]{6}-[0-9]{6}$'
      and issued_at is not null and issued_by_user_id is not null and issued_snapshot_json is not null and jsonb_typeof(issued_snapshot_json)='object')),
  constraint combined_cancel_reason check((status='cancelled')=(nullif(btrim(cancel_reason),'') is not null))
);
create unique index combined_active_payment on public.finance_combined_documents(payment_id) where status in ('draft','issued');
create table public.finance_combined_document_audit_events (
  id uuid primary key default gen_random_uuid(),
  combined_document_id uuid not null references public.finance_combined_documents(id) on delete restrict,
  event_type text not null check(event_type in ('draft_created','draft_saved','draft_refreshed','issued','cancelled')),
  event_payload_json jsonb not null check(jsonb_typeof(event_payload_json)='object'),
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);
create index combined_audit_history on public.finance_combined_document_audit_events(combined_document_id,created_at);
alter table public.finance_receipts add column combined_document_id uuid unique references public.finance_combined_documents(id) on delete restrict deferrable initially deferred;
alter table public.finance_tax_invoices add column combined_document_id uuid unique references public.finance_combined_documents(id) on delete restrict deferrable initially deferred;

-- Existing lifecycle evidence remains mandatory. Only the explicit paired mode gains RTI.
alter table public.finance_receipts drop constraint finance_receipts_lifecycle_check;
alter table public.finance_receipts add constraint finance_receipts_lifecycle_check check (
  (status in ('draft','cancelled') and receipt_no is null and issued_at is null and issued_by_user_id is null and issued_snapshot_json is null)
  or (status in ('issued','voided') and receipt_no is not null
    and ((combined_document_id is null and receipt_no ~ '^VP-RC-[0-9]{6}-[0-9]{6}$')
      or (combined_document_id is not null and status='issued' and receipt_no ~ '^VP-RTI-[0-9]{6}-[0-9]{6}$'))
    and issued_at is not null and issued_by_user_id is not null and issued_snapshot_json is not null
    and jsonb_typeof(issued_snapshot_json)='object' and issued_snapshot_json<>'{}'::jsonb));
alter table public.finance_tax_invoices drop constraint tax_invoice_lifecycle;
alter table public.finance_tax_invoices add constraint tax_invoice_lifecycle check (
  (status in ('draft','cancelled') and tax_invoice_no is null and issued_at is null and issued_by_user_id is null and issued_snapshot_json is null)
  or (status='issued' and tax_invoice_no is not null
    and ((combined_document_id is null and tax_invoice_no ~ '^VP-TI-[0-9]{6}-[0-9]{6}$')
      or (combined_document_id is not null and tax_invoice_no ~ '^VP-RTI-[0-9]{6}-[0-9]{6}$'))
    and issued_at is not null and issued_by_user_id is not null and issued_snapshot_json is not null and jsonb_typeof(issued_snapshot_json)='object'));

insert into public.document_numbering_profiles(document_type,display_prefix,period_scope,sequence_width,is_active)
values('receipt_tax_invoice','VP-RTI','monthly',6,true);

create function public.current_user_can_manage_combined_documents()
returns boolean language sql stable security definer set search_path=public as $permission$
select public.current_user_can_manage_finance_receipts() and public.current_user_can_manage_finance_tax_invoices();
$permission$;
create function public.current_user_can_view_combined_documents()
returns boolean language sql stable security definer set search_path=public as $permission$
select public.current_user_can_view_finance_receipts() and public.current_user_can_view_finance_tax_invoices();
$permission$;
create function public.current_user_can_issue_combined_documents()
returns boolean language sql stable security definer set search_path=public as $permission$
select public.current_user_can_issue_finance_receipts() and public.current_user_can_issue_finance_tax_invoices();
$permission$;

create function public.finance_document_invoice_lines(p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $lines$
declare i public.finance_invoices%rowtype; entries jsonb; entry jsonb; item jsonb; evidence jsonb; result jsonb:='[]';
  before_vat numeric:=0; vat numeric:=0; gross numeric:=0;
begin
  select * into strict i from public.finance_invoices where id=p_invoice_id;
  if i.document_status='issued' then
    entries:=i.issued_snapshot_json->'items';
    if i.issued_snapshot_json->>'source_model' is distinct from i.source_model then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
  elsif i.document_status='draft' then
    select coalesce(jsonb_agg(jsonb_build_object('invoice_item',to_jsonb(it)) order by sort_order,id),'[]') into entries
      from public.finance_invoice_items it where invoice_id=i.id and source_state='active';
  else raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
  if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries)=0 then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    item:=coalesce(entry->'invoice_item',entry);
    if item->>'invoice_id' is distinct from i.id::text or nullif(btrim(item->>'description'),'') is null
      or (item->>'line_total')::numeric is distinct from (item->>'amount_before_vat')::numeric+(item->>'vat_amount')::numeric
      or not exists(select 1 from public.finance_invoice_items where invoice_id=i.id and id::text=item->>'id' and source_state='active')
    then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
    evidence:=public.finance_vat_treatment(item->'vat_treatment_json',(item->>'vat_applicable')::boolean,(item->>'vat_rate')::numeric);
    if evidence->>'treatment'<>'standard_rate' and (item->>'vat_amount')::numeric<>0 then raise exception 'DOCUMENT_VAT_CONFLICT'; end if;
    result:=result||jsonb_build_array(item||jsonb_build_object('resolved_vat_treatment',evidence));
    before_vat:=before_vat+(item->>'amount_before_vat')::numeric; vat:=vat+(item->>'vat_amount')::numeric; gross:=gross+(item->>'line_total')::numeric;
  end loop;
  if before_vat is distinct from i.amount_before_vat or vat is distinct from i.vat_amount or gross is distinct from i.total_amount
    or (select count(distinct value->>'id') from jsonb_array_elements(result))<>jsonb_array_length(result)
  then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
  return result;
end;
$lines$;

create function public.finance_payment_document_decision(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $decision$
declare p public.finance_payments%rowtype; allocation record; i public.finance_invoices%rowtype; lines jsonb:='[]'; current_lines jsonb;
  partial boolean:=false; relevant boolean; unknown_lines jsonb; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype;
  combined public.finance_combined_documents%rowtype; decision text; cash numeric:=0; wht numeric:=0;
begin
  select * into p from public.finance_payments where id=p_payment_id;
  if not found or p.status<>'confirmed' then return jsonb_build_object('decision','blocked_payment','lines','[]'::jsonb); end if;
  for allocation in select * from public.finance_payment_effective_invoice_allocations where payment_id=p.id order by invoice_id loop
    select * into strict i from public.finance_invoices where id=allocation.invoice_id;
    if i.document_status<>'issued' or i.client_id<>p.client_id or i.currency<>p.currency then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
    current_lines:=public.finance_document_invoice_lines(i.id); lines:=lines||current_lines;
    cash:=cash+allocation.effective_cash_allocated; wht:=wht+allocation.effective_wht_credit_allocated;
    partial:=partial or allocation.effective_settlement_total<>i.total_amount;
  end loop;
  if jsonb_array_length(lines)=0 or cash<>p.cash_amount or wht<>p.wht_amount then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
  select coalesce(jsonb_agg(value) filter(where value #>> '{resolved_vat_treatment,treatment}'='unknown'),'[]'),
    bool_or(value #>> '{resolved_vat_treatment,treatment}' in ('standard_rate','zero_rated')) into unknown_lines,relevant from jsonb_array_elements(lines);
  select * into r from public.finance_receipts where payment_id=p.id and status in ('draft','issued');
  select * into t from public.finance_tax_invoices where payment_id=p.id and status in ('draft','issued');
  select * into combined from public.finance_combined_documents where payment_id=p.id and status in ('draft','issued');
  decision:=case
    when jsonb_array_length(unknown_lines)>0 then 'blocked_unknown_treatment'
    when relevant and partial then 'blocked_partial_taxable'
    when relevant and (select count(*) from public.finance_payment_effective_invoice_allocations where payment_id=p.id)<>1 then 'blocked_multiple_invoices'
    when combined.status='issued' then 'complete'
    when combined.id is not null then 'combined_receipt_tax_invoice'
    when r.status='issued' and t.status='issued' then 'complete'
    when relevant and r.status='issued' then 'tax_invoice_completion_only'
    when relevant and t.status='issued' then 'receipt_completion_only'
    when relevant then 'combined_receipt_tax_invoice'
    when r.status='issued' then 'complete'
    else 'receipt_only' end;
  return jsonb_build_object('decision',decision,'lines',lines,'unknown_lines',unknown_lines,'partial',partial,
    'receipt_id',r.id,'receipt_status',r.status,'tax_invoice_id',t.id,'tax_invoice_status',t.status,
    'combined_id',combined.id,'combined_status',combined.status);
end;
$decision$;

create function public.get_finance_document_decision(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $decision_rpc$
declare d jsonb; source jsonb;
begin
  if not(public.current_user_can_view_finance_receipts() or public.current_user_can_view_finance_tax_invoices()) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  d:=public.finance_payment_document_decision(p_payment_id);
  if d->>'decision' in ('combined_receipt_tax_invoice','tax_invoice_completion_only') then
    if d->>'tax_invoice_id' is not null then
      select draft_snapshot_json into source from public.finance_tax_invoices where id=(d->>'tax_invoice_id')::uuid;
    else
      source:=public.finance_tax_invoice_draft_snapshot(public.build_finance_document_tax_source(p_payment_id),'{}',(now() at time zone 'Asia/Bangkok')::date);
    end if;
    d:=d||jsonb_build_object('blockers',public.finance_tax_invoice_issue_blockers(source));
  end if;
  return d;
end;
$decision_rpc$;

-- BEGIN GENERATED PREDECESSOR INTEGRATION
create or replace function public.generate_finance_document_no(
  p_doc_type text,
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_type text := lower(trim(coalesce(p_doc_type, '')));
  v_counter_type text;
  v_year integer := extract(year from p_issue_date)::integer;
  v_month integer;
  v_prefix_code text;
  v_prefix text;
  v_next integer;
  v_width integer := 4;
  v_period_scope text;
begin
  if v_input_type = '' then raise exception 'Document type is required'; end if;
  if p_issue_date is null then raise exception 'Document issue date is required'; end if;
  if v_input_type = 'receipt_tax_invoice' then
    if not public.current_user_can_issue_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  elsif v_input_type = 'tax_invoice' then
    if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  elsif v_input_type = 'receipt' then
    if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  elsif not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to allocate document number';
  end if;

  if v_input_type in ('fee_agreement', 'invoice', 'receipt', 'tax_invoice', 'receipt_tax_invoice') then
    select display_prefix, period_scope, sequence_width
      into v_prefix_code, v_period_scope, v_width
    from public.document_numbering_profiles
    where document_type = v_input_type and is_active;
    if v_prefix_code is null then raise exception 'Document numbering profile is not active'; end if;
    if v_input_type = 'receipt' and (v_prefix_code <> 'VP-RC' or v_period_scope <> 'monthly' or v_width <> 6) then
      raise exception 'RECEIPT_NUMBERING_PROFILE_INVALID';
    end if;
    if v_input_type = 'tax_invoice' and (v_prefix_code <> 'VP-TI' or v_period_scope <> 'monthly' or v_width <> 6) then
      raise exception 'TAX_INVOICE_NUMBERING_PROFILE_INVALID';
    end if;
    if v_input_type='receipt_tax_invoice' and (v_prefix_code<>'VP-RTI' or v_period_scope<>'monthly' or v_width<>6) then raise exception 'DOCUMENT_NUMBERING_PROFILE_INVALID'; end if;
    v_counter_type := v_input_type;
    v_month := case when v_period_scope = 'annual' then null else extract(month from p_issue_date)::integer end;
    v_prefix := v_prefix_code || '-' || case
      when v_period_scope = 'annual' then to_char(p_issue_date, 'YYYY')
      else to_char(p_issue_date, 'YYYYMM')
    end || '-';
  else
    v_counter_type := upper(v_input_type);
    v_month := extract(month from p_issue_date)::integer;
    if v_counter_type = 'QT' then
      select nullif(trim(quotation_prefix), '') into v_prefix_code
      from public.finance_company_profiles where id = 'default';
      v_prefix_code := coalesce(v_prefix_code, 'VP-QT');
    else
      v_prefix_code := v_counter_type;
    end if;
    v_prefix := v_prefix_code || '-' || to_char(p_issue_date, 'YYYYMM') || '-';
  end if;

  insert into public.finance_document_counters (doc_type, year, month, prefix, last_no)
  values (v_counter_type, v_year, v_month, v_prefix, 1)
  on conflict (doc_type, year, (coalesce(month, 0))) do update set
    last_no = public.finance_document_counters.last_no + 1,
    prefix = excluded.prefix,
    updated_at = now()
  returning last_no into v_next;

  if v_input_type in ('receipt','tax_invoice','receipt_tax_invoice') and length(v_next::text) > v_width then
    raise exception using message = case when v_input_type='tax_invoice' then 'TAX_INVOICE_NUMBERING_EXHAUSTED' else 'RECEIPT_NUMBERING_EXHAUSTED' end;
  end if;
  return v_prefix || lpad(v_next::text, v_width, '0');
end;
$$;

create function public.receipt_create_pre040(p_payment_id uuid,p_external_receipt_checked boolean default false)
returns uuid language plpgsql security definer set search_path = public
as $receipt_create$
declare
  v_payment public.finance_payments%rowtype;
  v_id uuid;
  v_predecessor uuid;
  v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'RECEIPT_CONFIRMED_PAYMENT_REQUIRED'; end if;
  select id into v_id from public.finance_receipts where payment_id = p_payment_id and status in ('draft','issued');
  if v_id is not null then return v_id; end if;
  if p_external_receipt_checked is distinct from true then raise exception 'RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED'; end if;
  select id into v_predecessor from public.finance_receipts where payment_id = p_payment_id and status = 'voided'
    order by issued_at desc,id desc limit 1;
  v_snapshot := public.build_finance_receipt_source(p_payment_id);
  insert into public.finance_receipts(payment_id,client_id,receipt_date,currency,cash_amount,wht_amount,
    draft_snapshot_json,replaces_receipt_id,external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id)
  values (p_payment_id,v_payment.client_id,v_payment.received_on,v_payment.currency,v_payment.cash_amount,v_payment.wht_amount,
    v_snapshot,v_predecessor,now(),auth.uid(),auth.uid()) returning id into v_id;
  perform public.record_finance_receipt_audit(v_id,'draft_created',jsonb_build_object(
    'payment_id',p_payment_id,'external_receipt_checked',true,'replaces_receipt_id',v_predecessor));
  return v_id;
end;
$receipt_create$;

revoke all on function public.receipt_create_pre040(uuid,boolean) from public,anon,authenticated;

create function public.receipt_issue_pre040(p_receipt_id uuid,p_acknowledged boolean,p_reviewed_snapshot_json jsonb default null)
returns uuid language plpgsql security definer set search_path = public
as $receipt_issue$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb; v_number text; v_now timestamptz := now();
begin
  if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  -- Retry must not consult changed master data or allocate another number.
  select * into v_receipt from public.finance_receipts where id = p_receipt_id;
  if v_receipt.status = 'issued' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_snapshot is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  if p_reviewed_snapshot_json is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_REVIEW_REQUIRED'; end if;
  v_number := public.generate_finance_document_no('receipt',v_receipt.receipt_date);
  v_snapshot := v_snapshot || jsonb_build_object('receipt',jsonb_build_object('id',p_receipt_id,
    'receipt_no',v_number,'receipt_date',v_receipt.receipt_date,'issued_at',v_now,'issued_by_user_id',auth.uid(),
    'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id = auth.uid()),
    'replaces_receipt_id',v_receipt.replaces_receipt_id));
  update public.finance_receipts set status = 'issued',receipt_no = v_number,issued_snapshot_json = v_snapshot,
    issued_at = v_now,issued_by_user_id = auth.uid(),updated_at = v_now where id = p_receipt_id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,
    cash_allocated,wht_allocated,source_snapshot_json)
  select p_receipt_id,(item->>'invoice_id')::uuid,item->>'invoice_no',item->>'currency',
    (item->>'cash_allocated')::numeric,(item->>'wht_allocated')::numeric,item
  from jsonb_array_elements(v_snapshot->'invoices') as entries(item);
  perform public.record_finance_receipt_audit(p_receipt_id,'issued',jsonb_build_object(
    'payment_id',v_payment_id,'receipt_no',v_number,'cash_amount',v_receipt.cash_amount,
    'wht_amount',v_receipt.wht_amount,'settlement_amount',v_receipt.settlement_amount,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'tax_invoice_created',false));
  return p_receipt_id;
end;
$receipt_issue$;

revoke all on function public.receipt_issue_pre040(uuid,boolean,jsonb) from public,anon,authenticated;

create function public.receipt_refresh_pre040(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $receipt_refresh$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  if v_snapshot = v_receipt.draft_snapshot_json then return p_receipt_id; end if;
  update public.finance_receipts set draft_snapshot_json = v_snapshot,
    receipt_date = (v_snapshot #>> '{payment,received_on}')::date,
    currency = v_snapshot #>> '{payment,currency}',cash_amount = (v_snapshot #>> '{payment,cash_amount}')::numeric,
    wht_amount = (v_snapshot #>> '{payment,wht_amount}')::numeric,updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'draft_refreshed',jsonb_build_object('payment_id',v_payment_id));
  return p_receipt_id;
end;
$receipt_refresh$;

revoke all on function public.receipt_refresh_pre040(uuid) from public,anon,authenticated;

create function public.receipt_cancel_pre040(p_receipt_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $receipt_cancel$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.status = 'cancelled' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  update public.finance_receipts set status = 'cancelled',cancelled_at = now(),cancelled_by_user_id = auth.uid(),
    cancel_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'payment_changed',false));
  return p_receipt_id;
end;
$receipt_cancel$;

revoke all on function public.receipt_cancel_pre040(uuid,text) from public,anon,authenticated;

create function public.tax_save_pre040(p_tax_invoice_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $save_draft$
declare t public.finance_tax_invoices%rowtype; snapshot jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if p_issue_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
    or p_issue_date<(t.source_snapshot_json #>> '{payment,received_on}')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  snapshot:=public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,p_decisions_json,p_issue_date);
  if snapshot=t.draft_snapshot_json and p_decisions_json=t.decisions_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=case when p_decisions_json->'no_earlier_event'='true'::jsonb then now() end,
    approved_by_user_id=case when p_decisions_json->'no_earlier_event'='true'::jsonb then auth.uid() end where tax_invoice_id=t.id;
  update public.finance_tax_invoices set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=snapshot,updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_saved',jsonb_build_object('previous_decisions',t.decisions_json,'decisions',p_decisions_json,'issue_date',p_issue_date));
  return t.id;
end;
$save_draft$;

revoke all on function public.tax_save_pre040(uuid,date,jsonb,timestamptz) from public,anon,authenticated;

create function public.tax_refresh_pre040(p_tax_invoice_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $refresh_draft$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  source:=public.build_finance_tax_invoice_source(pid);
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if source->'invoice_item' is distinct from t.source_snapshot_json->'invoice_item'
    or source->'payment' is distinct from t.source_snapshot_json->'payment'
  then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if source=t.source_snapshot_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=null,approved_by_user_id=null where tax_invoice_id=t.id;
  update public.finance_tax_invoices set source_snapshot_json=source,decisions_json='{}',
    draft_snapshot_json=public.finance_tax_invoice_draft_snapshot(source,'{}',t.issue_date),updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_refreshed',jsonb_build_object('approvals_reset',true));
  return t.id;
end;
$refresh_draft$;

revoke all on function public.tax_refresh_pre040(uuid,timestamptz) from public,anon,authenticated;

create function public.tax_issue_pre040(p_tax_invoice_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $issue$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid; number text; event public.finance_tax_point_events%rowtype; snapshot jsonb; moment timestamptz:=now(); b text[];
begin
  if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'TAX_INVOICE_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='issued' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  source:=public.build_finance_tax_invoice_source(pid);
  if source is distinct from t.source_snapshot_json then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if p_reviewed_snapshot_json is distinct from t.draft_snapshot_json then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  b:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(b)>0 then raise exception using message=b[1]; end if;
  select * into strict event from public.finance_tax_point_events where tax_invoice_id=t.id;
  if event.approved_at is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if t.issue_date<event.occurred_on or t.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if t.issue_date>event.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id and status='reserved' for update;
  number:=public.generate_finance_document_no('tax_invoice',t.issue_date);
  snapshot:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(event),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,
      'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=snapshot,updated_at=moment where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'tax_point_date',event.occurred_on,'issue_date',t.issue_date,
    'delayed_issue_acknowledged',t.issue_date>event.occurred_on and p_delayed_issue_acknowledged,'decisions',t.decisions_json,
    'documentary_only',true,'payment_changed',false,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false,'receipt_changed',false));
  return t.id;
end;
$issue$;

revoke all on function public.tax_issue_pre040(uuid,jsonb,boolean,boolean) from public,anon,authenticated;

create function public.tax_cancel_pre040(p_tax_invoice_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare t public.finance_tax_invoices%rowtype; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'TAX_INVOICE_REASON_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='cancelled' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  update public.finance_tax_invoice_source_coverages set status='released' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='cancelled',cancelled_at=now(),cancelled_by_user_id=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'coverage_released',true));
  return t.id;
end;
$cancel$;

revoke all on function public.tax_cancel_pre040(uuid,text) from public,anon,authenticated;

create function public.tax_snapshot_pre040(p_source jsonb,p_decisions jsonb,p_issue_date date)
returns jsonb language plpgsql immutable set search_path=public as $draft_snapshot$
declare customer jsonb:=p_source->'customer'; decisions jsonb:=coalesce(p_decisions,'{}'); branch text;
begin
  if jsonb_typeof(decisions)<>'object' or exists(select 1 from jsonb_object_keys(decisions) k where k not in
    ('tax_treatment','treatment_reason','buyer_vat_registered','customer_address','customer_tax_id','buyer_branch_type',
     'buyer_branch_code','identity_evidence','no_earlier_event','external_coverage_checked'))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if exists(select 1 from (values('buyer_vat_registered'),('no_earlier_event'),('external_coverage_checked')) f(key)
    where decisions ? f.key and jsonb_typeof(decisions->f.key) not in ('boolean','null'))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if exists(select 1 from jsonb_each(decisions) f where f.key not in ('buyer_vat_registered','no_earlier_event','external_coverage_checked')
    and (jsonb_typeof(f.value) not in ('string','null') or length(f.value #>> '{}')>2000))
  then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  if nullif(btrim(customer->>'address'),'') is not null and nullif(btrim(decisions->>'customer_address'),'') is not null
    and btrim(decisions->>'customer_address')<>customer->>'address'
    or nullif(btrim(customer->>'tax_id'),'') is not null and nullif(btrim(decisions->>'customer_tax_id'),'') is not null
    and btrim(decisions->>'customer_tax_id')<>customer->>'tax_id'
  then raise exception 'TAX_INVOICE_FROZEN_IDENTITY_CHANGE_BLOCKED'; end if;
  branch:=case when lower(customer->>'branch') in ('สำนักงานใหญ่','head office','00000') then 'head_office'
    else nullif(decisions->>'buyer_branch_type','') end;
  customer:=customer||jsonb_build_object('address',coalesce(nullif(btrim(customer->>'address'),''),nullif(btrim(decisions->>'customer_address'),'')),
    'tax_id',coalesce(nullif(btrim(customer->>'tax_id'),''),nullif(btrim(decisions->>'customer_tax_id'),'')),
    'vat_registered',decisions->'buyer_vat_registered','branch_type',branch,
    'branch_code',case when branch='head_office' then '00000' else nullif(btrim(decisions->>'buyer_branch_code'),'') end,
    'supplemental_evidence',nullif(btrim(decisions->>'identity_evidence'),''));
  return p_source||jsonb_build_object('customer',customer,'issue_date',p_issue_date,
    'tax_treatment',nullif(decisions->>'tax_treatment',''),'treatment_reason',nullif(btrim(decisions->>'treatment_reason'),''),
    'tax_point',jsonb_build_object('event_type','payment_received','date',p_source #> '{payment,received_on}',
      'no_earlier_event_acknowledged',coalesce(decisions->'no_earlier_event','false'::jsonb),'policy_version','vp_v1'),
    'external_coverage_checked',coalesce(decisions->'external_coverage_checked','false'::jsonb));
end;
$draft_snapshot$;

revoke all on function public.tax_snapshot_pre040(jsonb,jsonb,date) from public,anon,authenticated;

create function public.tax_blockers_pre040(p_snapshot jsonb)
returns text[] language plpgsql immutable set search_path=public as $blockers$
declare b text[]:='{}'; s jsonb:=p_snapshot->'seller'; c jsonb:=p_snapshot->'customer'; item jsonb:=p_snapshot->'invoice_item';
begin
  if nullif(btrim(s->>'company_name_th'),'') is null or nullif(btrim(s->>'address_th'),'') is null
    or coalesce(s->>'tax_id','')!~'^[0-9]{13}$' or s->>'branch_type' is distinct from 'head_office'
    or s->>'branch_code' is distinct from '00000' or s->'vat_registered' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_SELLER_IDENTITY_REQUIRED'); end if;
  if nullif(btrim(c->>'name'),'') is null or nullif(btrim(c->>'address'),'') is null
    or jsonb_typeof(c->'vat_registered') is distinct from 'boolean'
    or (c->'vat_registered'='true'::jsonb and (coalesce(c->>'tax_id','')!~'^[0-9]{13}$'
      or coalesce(c->>'branch_type','') not in ('head_office','branch') or coalesce(c->>'branch_code','')!~'^[0-9]{5}$'
      or (c->>'branch_type'='branch' and c->>'branch_code'='00000')))
    or ((nullif(btrim(p_snapshot #>> '{invoice_snapshot,invoice,customer_billing_address}'),'') is null
      and nullif(btrim(p_snapshot #>> '{invoice_snapshot,customer,address}'),'') is null)
      and nullif(btrim(c->>'supplemental_evidence'),'') is null)
    or (c->'vat_registered'='true'::jsonb and
      (nullif(btrim(p_snapshot #>> '{invoice_snapshot,customer,tax_id}'),'') is null
       or lower(coalesce(p_snapshot #>> '{invoice_snapshot,customer,branch}','')) not in ('สำนักงานใหญ่','head office','00000'))
      and nullif(btrim(c->>'supplemental_evidence'),'') is null)
  then b:=array_append(b,'TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED'); end if;
  if not coalesce((p_snapshot->>'tax_treatment'='standard_rated' and item->'vat_applicable'='true'::jsonb
      and (item->>'vat_rate')::numeric>0 and (item->>'vat_amount')::numeric>0)
    or (p_snapshot->>'tax_treatment'='zero_rated' and item->'vat_applicable'='true'::jsonb
      and (item->>'vat_rate')::numeric=0 and (item->>'vat_amount')::numeric=0
      and nullif(btrim(p_snapshot->>'treatment_reason'),'') is not null),false)
  then b:=array_append(b,'TAX_INVOICE_VAT_TREATMENT_UNRESOLVED'); end if;
  if p_snapshot #> '{tax_point,no_earlier_event_acknowledged}' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'); end if;
  if p_snapshot->'external_coverage_checked' is distinct from 'true'::jsonb
  then b:=array_append(b,'TAX_INVOICE_EXTERNAL_COVERAGE_CHECK_REQUIRED'); end if;
  return b;
end;
$blockers$;

revoke all on function public.tax_blockers_pre040(jsonb) from public,anon,authenticated;

create or replace function public.build_finance_tax_invoice_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
begin return public.build_finance_document_tax_source(p_payment_id); end;
$source$;

create or replace function public.create_finance_receipt_draft_from_payment(p_payment_id uuid,p_external_receipt_checked boolean default false)
returns uuid language plpgsql security definer set search_path = public
as $receipt_create$
declare
  v_payment public.finance_payments%rowtype;
  v_id uuid;
  v_predecessor uuid;
  v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select * into v_payment from public.finance_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'confirmed' then raise exception 'RECEIPT_CONFIRMED_PAYMENT_REQUIRED'; end if;
  select id into v_id from public.finance_receipts where payment_id = p_payment_id and status in ('draft','issued');
  if v_id is not null then return v_id; end if;
  perform public.assert_finance_document_route(p_payment_id,'receipt');
  if p_external_receipt_checked is distinct from true then raise exception 'RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED'; end if;
  select id into v_predecessor from public.finance_receipts where payment_id = p_payment_id and status = 'voided'
    order by issued_at desc,id desc limit 1;
  v_snapshot := public.build_finance_receipt_source(p_payment_id);
  insert into public.finance_receipts(payment_id,client_id,receipt_date,currency,cash_amount,wht_amount,
    draft_snapshot_json,replaces_receipt_id,external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id)
  values (p_payment_id,v_payment.client_id,v_payment.received_on,v_payment.currency,v_payment.cash_amount,v_payment.wht_amount,
    v_snapshot,v_predecessor,now(),auth.uid(),auth.uid()) returning id into v_id;
  perform public.record_finance_receipt_audit(v_id,'draft_created',jsonb_build_object(
    'payment_id',p_payment_id,'external_receipt_checked',true,'replaces_receipt_id',v_predecessor));
  return v_id;
end;
$receipt_create$;

create or replace function public.issue_finance_receipt(p_receipt_id uuid,p_acknowledged boolean,p_reviewed_snapshot_json jsonb default null)
returns uuid language plpgsql security definer set search_path = public
as $receipt_issue$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb; v_number text; v_now timestamptz := now();
begin
  if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  -- Retry must not consult changed master data or allocate another number.
  select * into v_receipt from public.finance_receipts where id = p_receipt_id;
  if v_receipt.status = 'issued' then return p_receipt_id; end if;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  perform public.assert_finance_document_route(v_payment_id,'receipt');
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_snapshot is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  if p_reviewed_snapshot_json is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_REVIEW_REQUIRED'; end if;
  v_number := public.generate_finance_document_no('receipt',v_receipt.receipt_date);
  v_snapshot := v_snapshot || jsonb_build_object('receipt',jsonb_build_object('id',p_receipt_id,
    'receipt_no',v_number,'receipt_date',v_receipt.receipt_date,'issued_at',v_now,'issued_by_user_id',auth.uid(),
    'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id = auth.uid()),
    'replaces_receipt_id',v_receipt.replaces_receipt_id));
  update public.finance_receipts set status = 'issued',receipt_no = v_number,issued_snapshot_json = v_snapshot,
    issued_at = v_now,issued_by_user_id = auth.uid(),updated_at = v_now where id = p_receipt_id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,
    cash_allocated,wht_allocated,source_snapshot_json)
  select p_receipt_id,(item->>'invoice_id')::uuid,item->>'invoice_no',item->>'currency',
    (item->>'cash_allocated')::numeric,(item->>'wht_allocated')::numeric,item
  from jsonb_array_elements(v_snapshot->'invoices') as entries(item);
  perform public.record_finance_receipt_audit(p_receipt_id,'issued',jsonb_build_object(
    'payment_id',v_payment_id,'receipt_no',v_number,'cash_amount',v_receipt.cash_amount,
    'wht_amount',v_receipt.wht_amount,'settlement_amount',v_receipt.settlement_amount,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'tax_invoice_created',false));
  return p_receipt_id;
end;
$receipt_issue$;

create or replace function public.create_finance_tax_invoice_draft(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $create_draft$
declare source jsonb; existing uuid; id uuid; event_id uuid; item_id uuid; item jsonb; date_today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where finance_payments.id=p_payment_id for update;
  select t.id into existing from public.finance_tax_invoices t where t.payment_id=p_payment_id and t.status in ('draft','issued');
  if found then return existing; end if;
  perform public.assert_finance_document_route(p_payment_id,'tax_invoice');
  return public.prepare_finance_document_tax_draft(p_payment_id);
end;
$create_draft$;

create or replace function public.issue_finance_tax_invoice(p_tax_invoice_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $issue$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid; number text; event public.finance_tax_point_events%rowtype; snapshot jsonb; moment timestamptz:=now(); b text[];
begin
  if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'TAX_INVOICE_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='issued' then return t.id; end if;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  perform public.assert_finance_document_route(pid,'tax_invoice');
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  source:=public.build_finance_tax_invoice_source(pid);
  if source is distinct from t.source_snapshot_json then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if p_reviewed_snapshot_json is distinct from t.draft_snapshot_json then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  b:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(b)>0 then raise exception using message=b[1]; end if;
  select * into strict event from public.finance_tax_point_events where tax_invoice_id=t.id;
  if event.approved_at is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if t.issue_date<event.occurred_on or t.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if t.issue_date>event.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id and status='reserved' for update;
  number:=public.generate_finance_document_no('tax_invoice',t.issue_date);
  snapshot:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(event),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,
      'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=snapshot,updated_at=moment where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'tax_point_date',event.occurred_on,'issue_date',t.issue_date,
    'delayed_issue_acknowledged',t.issue_date>event.occurred_on and p_delayed_issue_acknowledged,'decisions',t.decisions_json,
    'documentary_only',true,'payment_changed',false,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false,'receipt_changed',false));
  return t.id;
end;
$issue$;

create or replace function public.save_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $save_draft$
declare t public.finance_tax_invoices%rowtype; snapshot jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if p_issue_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
    or p_issue_date<(t.source_snapshot_json #>> '{payment,received_on}')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  snapshot:=public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,p_decisions_json,p_issue_date);
  if snapshot=t.draft_snapshot_json and p_decisions_json=t.decisions_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=case when p_decisions_json->'no_earlier_event'='true'::jsonb then now() end,
    approved_by_user_id=case when p_decisions_json->'no_earlier_event'='true'::jsonb then auth.uid() end where tax_invoice_id=t.id;
  update public.finance_tax_invoices set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=snapshot,updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_saved',jsonb_build_object('previous_decisions',t.decisions_json,'decisions',p_decisions_json,'issue_date',p_issue_date));
  return t.id;
end;
$save_draft$;

create or replace function public.refresh_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $refresh_draft$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  source:=public.build_finance_tax_invoice_source(pid);
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if source->'invoice_item' is distinct from t.source_snapshot_json->'invoice_item'
    or source->'payment' is distinct from t.source_snapshot_json->'payment'
  then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if source=t.source_snapshot_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=null,approved_by_user_id=null where tax_invoice_id=t.id;
  update public.finance_tax_invoices set source_snapshot_json=source,decisions_json='{}',
    draft_snapshot_json=public.finance_tax_invoice_draft_snapshot(source,'{}',t.issue_date),updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_refreshed',jsonb_build_object('approvals_reset',true));
  return t.id;
end;
$refresh_draft$;

create or replace function public.cancel_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare t public.finance_tax_invoices%rowtype; pid uuid;
begin
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'TAX_INVOICE_REASON_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='cancelled' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  update public.finance_tax_invoice_source_coverages set status='released' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='cancelled',cancelled_at=now(),cancelled_by_user_id=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'coverage_released',true));
  return t.id;
end;
$cancel$;

create or replace function public.refresh_finance_receipt_draft(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $receipt_refresh$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  if v_snapshot = v_receipt.draft_snapshot_json then return p_receipt_id; end if;
  update public.finance_receipts set draft_snapshot_json = v_snapshot,
    receipt_date = (v_snapshot #>> '{payment,received_on}')::date,
    currency = v_snapshot #>> '{payment,currency}',cash_amount = (v_snapshot #>> '{payment,cash_amount}')::numeric,
    wht_amount = (v_snapshot #>> '{payment,wht_amount}')::numeric,updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'draft_refreshed',jsonb_build_object('payment_id',v_payment_id));
  return p_receipt_id;
end;
$receipt_refresh$;

create or replace function public.cancel_finance_receipt_draft(p_receipt_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $receipt_cancel$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status = 'cancelled' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  update public.finance_receipts set status = 'cancelled',cancelled_at = now(),cancelled_by_user_id = auth.uid(),
    cancel_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'payment_changed',false));
  return p_receipt_id;
end;
$receipt_cancel$;

create or replace function public.void_finance_receipt(p_receipt_id uuid,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path = public
as $receipt_void$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if not public.current_user_can_void_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_VOID_ACK_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status = 'voided' then return p_receipt_id; end if;
  if v_receipt.status <> 'issued' then raise exception 'RECEIPT_ISSUED_REQUIRED'; end if;
  update public.finance_receipts set status = 'voided',voided_at = now(),voided_by_user_id = auth.uid(),
    void_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'voided',jsonb_build_object(
    'reason',btrim(p_reason),'receipt_no',v_receipt.receipt_no,'payment_changed',false,'cash_created',false));
  return p_receipt_id;
end;
$receipt_void$;

create or replace function public.validate_finance_tax_invoice_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
declare t public.finance_tax_invoices%rowtype; v_id uuid; c record; item jsonb; point public.finance_tax_point_events%rowtype;
begin
  if tg_table_name='finance_tax_invoices' then v_id:=new.id; else v_id:=new.tax_invoice_id; end if;
  select * into strict t from public.finance_tax_invoices where finance_tax_invoices.id=v_id;
  if t.source_snapshot_json->>'schema_version'='2' then
    perform public.validate_finance_document_tax_integrity(t.id); return new;
  end if;
  item:=t.source_snapshot_json->'invoice_item';
  if t.draft_snapshot_json is distinct from public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,t.decisions_json,t.issue_date)
    or t.payment_id::text is distinct from t.source_snapshot_json #>> '{payment,id}'
    or t.invoice_id::text is distinct from t.source_snapshot_json #>> '{invoice,id}'
    or t.client_id::text is distinct from t.source_snapshot_json #>> '{customer,id}'
  then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  if (select count(*) from public.finance_tax_invoice_items where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_point_events where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id)<>1
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id;
  if point.event_type<>'payment_received' or point.occurred_on is distinct from (t.source_snapshot_json #>> '{payment,received_on}')::date
    or point.evidence_json is distinct from jsonb_build_object('payment',t.source_snapshot_json->'payment','policy_version','vp_v1')
    or ((t.decisions_json->'no_earlier_event'='true'::jsonb) is true)<>(point.approved_at is not null)
  then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  select coverage.*,i.invoice_item_id as item_source_id,i.amount_before_vat as ib,i.vat_amount as iv,i.total_amount as it,i.source_snapshot_json as frozen_item
  into strict c from public.finance_tax_invoice_source_coverages coverage join public.finance_tax_invoice_items i on i.id=coverage.tax_invoice_item_id
  where coverage.tax_invoice_id=t.id and i.tax_invoice_id=t.id;
  if c.invoice_item_id<>c.item_source_id or c.invoice_item_id::text is distinct from item->>'id' or c.tax_point_event_id<>point.id
    or c.amount_before_vat<>c.ib or c.vat_amount<>c.iv or c.total_amount<>c.it
    or c.ib is distinct from (item->>'amount_before_vat')::numeric or c.iv is distinct from (item->>'vat_amount')::numeric or c.it is distinct from (item->>'line_total')::numeric
    or c.frozen_item is distinct from item or c.status<>(case t.status when 'draft' then 'reserved' when 'issued' then 'issued' else 'released' end)
    or c.source_snapshot_json is distinct from jsonb_build_object('invoice_id',t.source_snapshot_json #> '{invoice,id}',
      'payment_id',t.payment_id,'invoice_item',item,'rule','single_line_full_payment_v1')
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  if t.status='issued' then
    if cardinality(public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json))>0
      or t.issued_snapshot_json->>'document_kind' is distinct from 'tax_invoice'
      or t.issued_snapshot_json->'schema_version' is distinct from '1'::jsonb
      or (t.issued_snapshot_json-array['document','tax_point']) is distinct from (t.draft_snapshot_json-'tax_point')
      or t.issued_snapshot_json #>> '{document,tax_invoice_no}' is distinct from t.tax_invoice_no
      or t.issued_snapshot_json #>> '{document,id}' is distinct from t.id::text
      or (t.issued_snapshot_json #>> '{document,issue_date}')::date is distinct from t.issue_date
      or (t.issued_snapshot_json #>> '{document,issued_at}')::timestamptz is distinct from t.issued_at
      or t.issued_snapshot_json #>> '{document,issued_by_user_id}' is distinct from t.issued_by_user_id::text
      or t.issued_snapshot_json->'tax_point' is distinct from (t.draft_snapshot_json->'tax_point'||to_jsonb(point))
      or t.issued_snapshot_json #> '{seller,logo_asset}' is distinct from public.document_logo_evidence(t.issued_snapshot_json #>> '{seller,logo_asset,path}')
    then raise exception 'TAX_INVOICE_ISSUED_EVIDENCE_INVALID'; end if;
    if not exists(select 1 from public.finance_tax_invoice_audit_events where tax_invoice_id=t.id and event_type='issued'
      and event_payload_json->>'tax_invoice_no'=t.tax_invoice_no and actor_user_id=t.issued_by_user_id
      and (t.issue_date=point.occurred_on or event_payload_json->'delayed_issue_acknowledged'='true'::jsonb))
    then raise exception 'TAX_INVOICE_ISSUE_AUDIT_REQUIRED'; end if;
  end if;
  return new;
end;
$integrity$;

create or replace function public.apply_finance_quotation_draft_item_tax_modes(
  p_quotation_id uuid,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare q public.finance_quotations%rowtype;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update quotation tax modes'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null or q.status <> 'draft' then raise exception 'Only draft quotations can change tax modes'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Quotation items are required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) p
    where nullif(btrim(coalesce(p->>'unit', '')), '') is null
      or length(btrim(p->>'unit')) > 100
      or lower(btrim(coalesce(p->>'economic_classification', ''))) not in (
        'professional_fee', 'additional_service', 'reimbursable_expense', 'government_or_court_fee', 'other'
      )
  ) then raise exception 'Quotation item unit and economic classification are required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) p join public.finance_quotation_items qi on qi.id = (p->>'id')::uuid
    where qi.quotation_id = p_quotation_id and coalesce(p->>'price_tax_mode', case when qi.vat_applicable then 'vat_exclusive' else 'non_vat' end) <> qi.price_tax_mode
      and exists (select 1 from public.finance_quotation_payment_installment_items ai where ai.quotation_item_id = qi.id)
  ) then raise exception 'This quotation item is already used in Payment Terms. Revise the payment terms before changing its commercial amounts.'; end if;
  update public.finance_quotation_items qi set
    price_tax_mode = coalesce(nullif(p->>'price_tax_mode', ''), case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    vat_rate = case when coalesce(p->>'price_tax_mode', case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end) = 'non_vat' then 0 else coalesce((p->>'vat_rate')::numeric, 7) end,
    vat_treatment_json = public.finance_vat_treatment(p->'vat_treatment_json',coalesce(p->>'price_tax_mode',qi.price_tax_mode)<>'non_vat',coalesce((p->>'vat_rate')::numeric,qi.vat_rate)),
    unit = btrim(p->>'unit'),
    economic_classification = lower(btrim(p->>'economic_classification')),
    updated_at = now()
  from jsonb_array_elements(p_items) p
  where qi.quotation_id = p_quotation_id
    and ((nullif(p->>'id','') is not null and qi.id = (p->>'id')::uuid)
      or (nullif(p->>'id','') is null and qi.sort_order = (p->>'sort_order')::integer));
  update public.finance_quotations fq set
    subtotal_vatable = (select coalesce(sum(i.amount_before_tax) filter (where i.price_tax_mode <> 'non_vat'), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    subtotal_non_vatable = (select coalesce(sum(i.amount_before_tax) filter (where i.price_tax_mode = 'non_vat'), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    vat_amount = (select coalesce(sum(i.vat_amount), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    grand_total = (select coalesce(sum(i.line_total), 0) from public.finance_quotation_items i where i.quotation_id = fq.id), updated_at = now()
  where fq.id = p_quotation_id;
  return p_quotation_id;
end;
$$;

create or replace function public.create_finance_quotation_draft_atomic_v3(
  p_client_id uuid,p_case_id bigint,p_advisory_matter_id uuid,p_issue_date date,p_valid_until date,
  p_scope_of_legal_services text,p_included_services text,p_excluded_services text,p_note text,p_internal_note text,
  p_authorized_signer_key text,p_authorized_signer_name text,p_authorized_signer_position text,p_authorized_signer_email text,
  p_client_snapshot_json jsonb,p_matter_snapshot_json jsonb,p_document_data_snapshot_json jsonb,p_items jsonb,
  p_payment_method_type text,p_payment_client_summary text,p_installments_json jsonb
)
returns table(quotation_id uuid, quotation_no text)
language plpgsql security definer set search_path = public
as $$
declare
  v_quotation_id uuid; v_quotation_no text; v_actor_name text; v_tax_items jsonb;
  v_mapped_installments jsonb; v_mode text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create quotation draft'; end if;
  if p_client_id is not null then
    if not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'Quotation client not found'; end if;
  elsif lower(coalesce(p_client_snapshot_json->>'source_type', '')) <> 'prospect'
    or nullif(btrim(coalesce(p_client_snapshot_json->>'name', '')), '') is null then raise exception 'Prospect name is required';
  end if;
  if p_case_id is not null and p_advisory_matter_id is not null then raise exception 'Select either case or advisory matter, not both'; end if;
  if p_case_id is not null and not exists (select 1 from public.cases c where c.id = p_case_id) then raise exception 'Quotation case not found'; end if;
  if p_advisory_matter_id is not null and not exists (select 1 from public.advisory_matters a where a.id = p_advisory_matter_id) then raise exception 'Quotation advisory matter not found'; end if;
  if p_issue_date is null or (p_valid_until is not null and p_valid_until < p_issue_date) then raise exception 'Valid until cannot be before issue date'; end if;
  if nullif(btrim(coalesce(p_authorized_signer_key, '')), '') is null then raise exception 'Authorized signer is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Quotation draft requires at least one line item'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(coalesce(item->>'client_item_key', '')), '') is null
      or nullif(btrim(coalesce(item->>'description', '')), '') is null
      or nullif(btrim(coalesce(item->>'unit', '')), '') is null
      or lower(btrim(coalesce(item->>'economic_classification', ''))) not in ('professional_fee','additional_service','reimbursable_expense','government_or_court_fee','other')
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
      or coalesce((item->>'sort_order')::integer, -1) < 0
  ) then raise exception 'Quotation draft contains invalid line items'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct item->>'client_item_key') from jsonb_array_elements(p_items) item) then raise exception 'Quotation draft contains duplicate client item keys'; end if;
  if p_installments_json is null or jsonb_typeof(p_installments_json) <> 'array' then raise exception 'Payment installments must be a JSON array'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_installments_json) installment,
      jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) allocation
    where nullif(allocation->>'client_item_key', '') is null
      or not exists (select 1 from jsonb_array_elements(p_items) source where source->>'client_item_key' = allocation->>'client_item_key')
  ) then raise exception 'Payment allocation item does not match a quotation line item'; end if;

  select coalesce(nullif(btrim(up.staff_name), ''), nullif(btrim(up.full_name), ''), '') into v_actor_name from public.user_profiles up where up.id = auth.uid();
  v_quotation_no := public.generate_finance_document_no('QT', p_issue_date);
  insert into public.finance_quotations (
    quotation_no, client_id, case_id, advisory_matter_id, issue_date, valid_until, status,
    scope_of_legal_services, included_services, excluded_services, note, internal_note,
    authorized_signer_key, authorized_signer_name, authorized_signer_position, authorized_signer_email,
    client_snapshot_json, matter_snapshot_json, document_data_snapshot_json,
    created_by_user_id, created_by_name, updated_by_user_id, updated_by_name
  ) values (
    v_quotation_no, p_client_id, p_case_id, p_advisory_matter_id, p_issue_date, p_valid_until, 'draft',
    nullif(btrim(coalesce(p_scope_of_legal_services, '')), ''), nullif(btrim(coalesce(p_included_services, '')), ''),
    nullif(btrim(coalesce(p_excluded_services, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_internal_note, '')), ''),
    nullif(btrim(coalesce(p_authorized_signer_key, '')), ''), nullif(btrim(coalesce(p_authorized_signer_name, '')), ''),
    nullif(btrim(coalesce(p_authorized_signer_position, '')), ''), nullif(btrim(coalesce(p_authorized_signer_email, '')), ''),
    coalesce(p_client_snapshot_json, '{}'::jsonb), coalesce(p_matter_snapshot_json, '{}'::jsonb), coalesce(p_document_data_snapshot_json, '{}'::jsonb),
    auth.uid(), v_actor_name, auth.uid(), v_actor_name
  ) returning id into v_quotation_id;
  perform public.save_finance_quotation_draft_impl(
    v_quotation_id, p_client_id, p_case_id, p_advisory_matter_id, p_issue_date, p_valid_until,
    p_scope_of_legal_services, p_included_services, p_excluded_services, p_note, p_internal_note,
    p_authorized_signer_key, p_authorized_signer_name, p_authorized_signer_position, p_authorized_signer_email,
    0, 0, 0, 0, p_client_snapshot_json, p_matter_snapshot_json, p_document_data_snapshot_json,
    auth.uid(), null, v_actor_name, p_items
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', qi.id, 'price_tax_mode', coalesce(nullif(source.item->>'price_tax_mode', ''), case when coalesce((source.item->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    'vat_treatment_json',source.item->'vat_treatment_json','vat_rate', source.item->>'vat_rate', 'unit', source.item->>'unit', 'economic_classification', source.item->>'economic_classification'
  ) order by qi.sort_order), '[]'::jsonb)
  into v_tax_items
  from jsonb_array_elements(p_items) with ordinality source(item, ordinal_position)
  join public.finance_quotation_items qi on qi.quotation_id = v_quotation_id and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.ordinal_position - 1);
  perform public.apply_finance_quotation_draft_item_tax_modes(v_quotation_id, v_tax_items);
  update public.finance_quotations quotation set document_data_snapshot_json = coalesce(p_document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'totals', jsonb_build_object('subtotalVatable', quotation.subtotal_vatable, 'subtotalNonVatable', quotation.subtotal_non_vatable, 'vatAmount', quotation.vat_amount, 'grandTotal', quotation.grand_total)
  ) where quotation.id = v_quotation_id;
  v_mode := coalesce(nullif(p_installments_json->0->>'allocation_mode', ''), 'proportional_all_items');
  select coalesce(jsonb_agg(jsonb_set(installment.item, '{items}', coalesce((
    select jsonb_agg((allocation.value - 'client_item_key') || jsonb_build_object('quotation_item_id', qi.id) order by allocation.ordinal_position)
    from jsonb_array_elements(coalesce(installment.item->'items', '[]'::jsonb)) with ordinality allocation(value, ordinal_position)
    join jsonb_array_elements(p_items) with ordinality source(item, source_ordinal_position) on source.item->>'client_item_key' = allocation.value->>'client_item_key'
    join public.finance_quotation_items qi on qi.quotation_id = v_quotation_id and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.source_ordinal_position - 1)
  ), '[]'::jsonb)) order by installment.ordinal_position), '[]'::jsonb)
  into v_mapped_installments from jsonb_array_elements(p_installments_json) with ordinality installment(item, ordinal_position);
  perform public.save_finance_quotation_payment_terms_draft_v2(v_quotation_id, p_payment_method_type, p_payment_client_summary, v_mode, v_mapped_installments);
  return query select v_quotation_id, v_quotation_no;
end;
$$;

create or replace function public.freeze_finance_quotation_commercial_terms_v2()
returns trigger language plpgsql security definer set search_path = public
as $semantic_snapshot$
declare v_client jsonb; v_items jsonb; v_payment jsonb; v_snapshot jsonb;
begin
  if not (old.status = 'draft' and new.status = 'sent') then return new; end if;
  if new.client_id is not null then
    select jsonb_build_object('source_type','existing_client','id',c.id,'name',c.name,'client_type',c.client_type,'client_display_name',case when c.client_type='individual' then 'คุณ'||regexp_replace(c.name,'^(นาย|นางสาว|นาง|คุณ)[[:space:]]*','','g') else c.name end,'tax_id',c.tax_id,'address',c.address,'phone',c.phone,'email',c.email)
      into v_client from public.clients c where c.id = new.client_id;
  else v_client := coalesce(new.client_snapshot_json, '{}'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'vat_treatment_json',i.vat_treatment_json,'quotation_item_id',i.id,'description',i.description,'unit',i.unit,'economic_classification',i.economic_classification,
    'quantity',i.quantity,'unit_price',i.unit_price,'price_tax_mode',i.price_tax_mode,'vat_applicable',i.vat_applicable,
    'vat_rate',i.vat_rate,'amount_before_tax',i.amount_before_tax,'vat_amount',i.vat_amount,'line_total',i.line_total,'sort_order',i.sort_order
  ) order by i.sort_order,i.id),'[]'::jsonb) into v_items from public.finance_quotation_items i where i.quotation_id = new.id;
  select jsonb_build_object(
    'version', pt.snapshot_version,
    'allocation_contract', case
      when exists (select 1 from public.finance_quotation_payment_installments ci where ci.payment_terms_id = pt.id and ci.calculation_type <> 'percentage') then 'fixed_amount'
      when pt.snapshot_version >= 2 then 'gross_first' else 'component_first' end,
    'payment_method_type', pt.payment_method_type, 'allocation_mode', pt.allocation_mode, 'currency', pt.currency,
    'client_summary', pt.client_summary, 'amount_before_tax', pt.amount_before_tax, 'vat_amount', pt.vat_amount, 'total_amount', pt.total_amount,
    'installments', coalesce(jsonb_agg(jsonb_build_object(
      'installment_no',pi.installment_no,'title',pi.title,'calculation_type',pi.calculation_type,'percentage',pi.percentage,
      'trigger_type',pi.trigger_type,'trigger_description',pi.trigger_description,'due_date',pi.due_date,'payment_due_days',pi.payment_due_days,
      'client_note',pi.client_note,'amount_before_tax',pi.amount_before_tax,'vat_amount',pi.vat_amount,'total_amount',pi.total_amount,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'vat_treatment_json',qi.vat_treatment_json,'quotation_item_id',ai.quotation_item_id,'description_snapshot',qi.description,'unit',qi.unit,'economic_classification',qi.economic_classification,
        'price_tax_mode',qi.price_tax_mode,'vat_applicable',qi.vat_applicable,'vat_rate',qi.vat_rate,
        'allocation_percentage',ai.allocation_percentage,'allocated_amount_before_tax',ai.allocated_amount_before_tax,
        'allocated_vat_amount',ai.allocated_vat_amount,'allocated_total',ai.allocated_total
      ) order by ai.sort_order,ai.id) from public.finance_quotation_payment_installment_items ai
        join public.finance_quotation_items qi on qi.id=ai.quotation_item_id where ai.payment_installment_id=pi.id),'[]'::jsonb)
    ) order by pi.installment_no),'[]'::jsonb)
  ) into v_payment from public.finance_quotation_payment_terms pt
  join public.finance_quotation_payment_installments pi on pi.payment_terms_id=pt.id
  where pt.quotation_id=new.id group by pt.id;
  v_snapshot := coalesce(new.document_data_snapshot_json,'{}'::jsonb) || jsonb_build_object(
    'version',2,'client',coalesce(v_client,'{}'::jsonb),
    'matter',coalesce(new.document_data_snapshot_json->'matter',new.matter_snapshot_json,'{}'::jsonb),
    'items',v_items,'payment_terms',coalesce(v_payment,'{}'::jsonb)
  );
  update public.finance_quotations quotation set document_data_snapshot_json=v_snapshot where quotation.id=new.id;
  return new;
end;
$semantic_snapshot$;

create or replace function public.save_finance_billable_charge_draft(
  p_charge_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_client_cost_funding_mode text,
  p_source_reference text,
  p_source_snapshot_json jsonb,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_unit_rate numeric,
  p_currency text,
  p_service_date date,
  p_economic_classification text,
  p_price_tax_mode text,
  p_vat_rate numeric,
  p_tax_category text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_billable_charge_draft_with_funding$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_updated public.finance_billable_charges%rowtype;
  v_funding_mode text := nullif(lower(btrim(coalesce(p_client_cost_funding_mode, ''))), '');
  v_source_reference text := nullif(btrim(coalesce(p_source_reference, '')), '');
  v_source_snapshot jsonb := coalesce(p_source_snapshot_json, '{}'::jsonb);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_economic_classification text := nullif(lower(btrim(coalesce(p_economic_classification, ''))), '');
  v_price_tax_mode text := lower(btrim(coalesce(p_price_tax_mode, '')));
  v_tax_category text := nullif(btrim(coalesce(p_tax_category, '')), '');
  v_calculated record;
begin
  if not public.current_user_can_manage_finance_billable_charges() then
    raise exception 'Not allowed to save Billable Charge Draft';
  end if;
  if p_charge_id is null then
    raise exception 'Billable Charge Draft is required';
  end if;
  if jsonb_typeof(v_source_snapshot) <> 'object' then
    raise exception 'Billable Charge source snapshot must be an object';
  end if;
  if length(coalesce(v_source_reference, '')) > 1000
    or length(coalesce(v_description, '')) > 2000
    or length(coalesce(v_unit, '')) > 100
  then
    raise exception 'Billable Charge text exceeds the supported length';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Billable Charge currency must be a three-letter uppercase code';
  end if;
  if v_economic_classification is not null
    and v_economic_classification not in (
      'professional_fee',
      'additional_service',
      'reimbursable_expense',
      'government_or_court_fee',
      'other'
    )
  then
    raise exception 'Billable Charge economic classification is invalid';
  end if;

  perform public.assert_finance_billable_charge_context(
    p_client_id,
    p_case_id,
    p_advisory_matter_id
  );

  select * into v_calculated
  from public.calculate_finance_billable_charge_amounts(
    p_quantity,
    p_unit_rate,
    v_price_tax_mode,
    p_vat_rate
  );

  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'Billable Charge Draft not found';
  end if;
  if v_charge.status <> 'draft' then
    raise exception 'Only a Draft Billable Charge can be saved';
  end if;
  if v_charge.source_type = 'billing_installment_item' then
    raise exception 'Billing Installment Charges require the controlled adapter';
  end if;
  if v_funding_mode is not null
    and (
      v_charge.source_type <> 'recoverable_cost'
      or v_funding_mode not in ('collect_before_disbursement', 'reimburse_after_advance')
    )
  then
    raise exception 'Billable Charge client-cost funding mode is invalid for its business nature';
  end if;

  if v_charge.client_id is not distinct from p_client_id
    and v_charge.case_id is not distinct from p_case_id
    and v_charge.advisory_matter_id is not distinct from p_advisory_matter_id
    and v_charge.client_cost_funding_mode is not distinct from v_funding_mode
    and v_charge.source_reference is not distinct from v_source_reference
    and v_charge.source_snapshot_json is not distinct from v_source_snapshot
    and v_charge.description is not distinct from v_description
    and v_charge.quantity is not distinct from p_quantity
    and v_charge.unit is not distinct from v_unit
    and v_charge.unit_rate is not distinct from p_unit_rate
    and v_charge.currency is not distinct from v_currency
    and v_charge.service_date is not distinct from p_service_date
    and v_charge.economic_classification is not distinct from v_economic_classification
    and v_charge.vat_applicable is not distinct from v_calculated.vat_applicable
    and v_charge.vat_rate is not distinct from p_vat_rate
    and v_charge.tax_category is not distinct from v_tax_category
    and v_charge.price_tax_mode is not distinct from v_price_tax_mode
    and v_charge.amount_before_vat is not distinct from v_calculated.amount_before_vat
    and v_charge.vat_amount is not distinct from v_calculated.vat_amount
    and v_charge.total_amount is not distinct from v_calculated.total_amount
  then
    return v_charge.id;
  end if;

  update public.finance_billable_charges
  set
    client_id = p_client_id,
    case_id = p_case_id,
    advisory_matter_id = p_advisory_matter_id,
    client_cost_funding_mode = v_funding_mode,
    source_reference = v_source_reference,
    source_snapshot_json = v_source_snapshot,
    vat_treatment_json = public.finance_vat_treatment(v_source_snapshot->'vat_treatment_json',v_price_tax_mode<>'non_vat',p_vat_rate),
    description = v_description,
    quantity = p_quantity,
    unit = v_unit,
    unit_rate = p_unit_rate,
    currency = v_currency,
    service_date = p_service_date,
    economic_classification = v_economic_classification,
    vat_applicable = v_calculated.vat_applicable,
    vat_rate = p_vat_rate,
    tax_category = v_tax_category,
    price_tax_mode = v_price_tax_mode,
    amount_before_vat = v_calculated.amount_before_vat,
    vat_amount = v_calculated.vat_amount,
    total_amount = v_calculated.total_amount,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_charge.id
  returning * into v_updated;

  perform public.record_finance_billable_charge_audit_event(
    v_charge.id,
    'draft_saved',
    jsonb_build_object(
      'before', to_jsonb(v_charge),
      'after', to_jsonb(v_updated)
    )
  );

  return v_charge.id;
end;
$save_billable_charge_draft_with_funding$;

create or replace function public.mark_finance_billable_charge_ready(
  p_charge_id uuid,
  p_human_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $mark_billable_charge_ready$
declare
  v_charge public.finance_billable_charges%rowtype;
  v_ready_at timestamptz := now();
  v_ready_snapshot jsonb;
begin
  if not public.current_user_can_approve_finance_billable_charges() then
    raise exception 'Not allowed to mark Billable Charge ready';
  end if;
  if p_human_confirmed is distinct from true then
    raise exception 'Billable Charge readiness confirmation is required';
  end if;

  select * into v_charge
  from public.finance_billable_charges
  where id = p_charge_id
  for update;

  if v_charge.id is null then
    raise exception 'Billable Charge not found';
  end if;
  if v_charge.status = 'ready_to_invoice' then
    return v_charge.id;
  end if;
  if v_charge.status <> 'draft' then
    raise exception 'Only a Draft Billable Charge can be marked ready';
  end if;
  if nullif(btrim(coalesce(v_charge.description, '')), '') is null then
    raise exception 'Billable Charge description is required';
  end if;
  if v_charge.calculation_basis = 'quantity_rate'
    and nullif(btrim(coalesce(v_charge.unit, '')), '') is null
  then
    raise exception 'Billable Charge unit is required';
  end if;
  if v_charge.economic_classification is null then
    raise exception 'Billable Charge economic classification is required';
  end if;
  if v_charge.total_amount <= 0 then
    raise exception 'Billable Charge total must be positive before readiness';
  end if;
  if v_charge.source_type = 'recoverable_cost'
    and v_charge.client_cost_funding_mode is null
  then
    raise exception 'Billable Charge client-cost funding mode is required before readiness';
  end if;

  perform public.validate_finance_billable_charge_integrity(v_charge.id);

  v_ready_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'charge', jsonb_build_object(
      'id', v_charge.id,
      'client_id', v_charge.client_id,
      'case_id', v_charge.case_id,
      'advisory_matter_id', v_charge.advisory_matter_id,
      'status', 'ready_to_invoice',
      'ready_to_invoice_at', v_ready_at,
      'ready_by_user_id', auth.uid()
    ),
    'source', jsonb_build_object(
      'source_type', v_charge.source_type,
      'source_billing_installment_item_id', v_charge.source_billing_installment_item_id,
      'source_reference', v_charge.source_reference,
      'source_event_key', v_charge.source_event_key,
      'source_snapshot', v_charge.source_snapshot_json,
      'certified_semantics', v_charge.source_semantics_json
    ),
    'commercial', jsonb_build_object(
      'calculation_basis', v_charge.calculation_basis,
      'description', v_charge.description,
      'quantity', v_charge.quantity,
      'unit', v_charge.unit,
      'unit_rate', v_charge.unit_rate,
      'currency', v_charge.currency,
      'service_date', v_charge.service_date,
      'amount_before_vat', v_charge.amount_before_vat,
      'vat_amount', v_charge.vat_amount,
      'total_amount', v_charge.total_amount
    ),
    'economic', jsonb_build_object(
      'classification', v_charge.economic_classification,
      'revenue_policy_inferred', false,
      'compensation_policy_inferred', false
    ),
    'cost_handling', jsonb_build_object(
      'funding_mode', v_charge.client_cost_funding_mode,
      'revenue_policy_inferred', false,
      'compensation_policy_inferred', false
    ),
    'vat_treatment_json',v_charge.vat_treatment_json,
    'tax', jsonb_build_object(
      'vat_applicable', v_charge.vat_applicable,
      'vat_rate', v_charge.vat_rate,
      'tax_category', v_charge.tax_category,
      'price_tax_mode', v_charge.price_tax_mode,
      'wht_policy_inferred', false
    )
  ));

  update public.finance_billable_charges
  set
    status = 'ready_to_invoice',
    ready_snapshot_json = v_ready_snapshot,
    ready_to_invoice_at = v_ready_at,
    ready_by_user_id = auth.uid(),
    updated_at = v_ready_at,
    updated_by_user_id = auth.uid()
  where id = v_charge.id;

  perform public.validate_finance_billable_charge_integrity(v_charge.id);

  perform public.record_finance_billable_charge_audit_event(
    v_charge.id,
    'marked_ready',
    jsonb_build_object(
      'source_type', v_charge.source_type,
      'client_cost_funding_mode', v_charge.client_cost_funding_mode,
      'economic_classification', v_charge.economic_classification,
      'ready_snapshot', v_ready_snapshot
    )
  );

  return v_charge.id;
end;
$mark_billable_charge_ready$;
-- END GENERATED PREDECESSOR INTEGRATION

create function public.build_finance_document_tax_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $tax_source$
declare p public.finance_payments%rowtype; i public.finance_invoices%rowtype; a record; source jsonb; company jsonb;
  lines jsonb; taxable jsonb; seller jsonb;
begin
  select * into strict p from public.finance_payments where id=p_payment_id for update;
  if p.status<>'confirmed' then raise exception 'DOCUMENT_PAYMENT_REQUIRED'; end if;
  if (select count(*) from public.finance_payment_effective_invoice_allocations where payment_id=p.id)<>1 then raise exception 'DOCUMENT_MULTIPLE_INVOICES'; end if;
  select * into strict a from public.finance_payment_effective_invoice_allocations where payment_id=p.id;
  select * into strict i from public.finance_invoices where id=a.invoice_id for share;
  lines:=public.finance_document_invoice_lines(i.id);
  if i.document_status<>'issued' or i.source_model<>'billable_charge_v2' or i.currency<>'THB' or p.currency<>i.currency or p.client_id<>i.client_id
    or a.effective_settlement_total<>i.total_amount or p.settlement_amount<>i.total_amount
    or a.effective_cash_allocated<>p.cash_amount or a.effective_wht_credit_allocated<>p.wht_amount
  then raise exception 'DOCUMENT_PARTIAL_TAXABLE'; end if;
  if exists(select 1 from jsonb_array_elements(lines) e where e #>> '{resolved_vat_treatment,treatment}'='unknown') then raise exception 'DOCUMENT_UNKNOWN_TREATMENT'; end if;
  select jsonb_agg(e) into taxable from jsonb_array_elements(lines) e where e #>> '{resolved_vat_treatment,treatment}' in ('standard_rate','zero_rated');
  if taxable is null then raise exception 'DOCUMENT_RECEIPT_ONLY'; end if;
  source:=public.build_finance_receipt_source(p.id);
  select to_jsonb(c) into company from public.finance_company_profiles c where id='default';
  seller:=source->'seller'||jsonb_build_object('vat_registered',true,'registration_basis','approved_vp_v1_policy',
    'branch_label_th',coalesce(nullif(btrim(company->>'branch_th'),''),nullif(btrim(company->>'branch_label'),'')),
    'branch_type',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then 'head_office' end,
    'branch_code',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then '00000' end);
  return source||jsonb_build_object('schema_version',2,'document_kind','tax_invoice','seller',seller,
    'invoice',i.issued_snapshot_json->'invoice','invoice_snapshot',i.issued_snapshot_json,
    'invoice_item',taxable->0,'invoice_items',taxable,'document_lines',lines,
    'receipt_reference',(select jsonb_build_object('id',r.id,'receipt_no',r.receipt_no,'issued_at',r.issued_at)
      from public.finance_receipts r where r.payment_id=p.id and r.status='issued' and r.combined_document_id is null));
end;
$tax_source$;

create function public.prepare_finance_document_tax_draft(p_payment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $tax_prepare$
declare source jsonb; item jsonb; id uuid; point_id uuid; component_id uuid; date_today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
  source:=public.build_finance_document_tax_source(p_payment_id);
  insert into public.finance_tax_invoices(payment_id,invoice_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id)
  values(p_payment_id,(source #>> '{invoice,id}')::uuid,(source #>> '{customer,id}')::uuid,date_today,source,
    public.finance_tax_invoice_draft_snapshot(source,'{}',date_today),auth.uid()) returning finance_tax_invoices.id into id;
  insert into public.finance_tax_point_events(tax_invoice_id,event_type,occurred_on,evidence_json)
  values(id,'payment_received',(source #>> '{payment,received_on}')::date,jsonb_build_object('payment',source->'payment','policy_version','vp_v1'))
  returning finance_tax_point_events.id into point_id;
  for item in select value from jsonb_array_elements(source->'invoice_items') loop
    insert into public.finance_tax_invoice_items(tax_invoice_id,invoice_item_id,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
    values(id,(item->>'id')::uuid,(item->>'amount_before_vat')::numeric,(item->>'vat_amount')::numeric,(item->>'line_total')::numeric,item)
    returning finance_tax_invoice_items.id into component_id;
    insert into public.finance_tax_invoice_source_coverages(tax_invoice_id,tax_invoice_item_id,invoice_item_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
    values(id,component_id,(item->>'id')::uuid,point_id,'reserved',(item->>'amount_before_vat')::numeric,(item->>'vat_amount')::numeric,(item->>'line_total')::numeric,
      jsonb_build_object('invoice_id',source #> '{invoice,id}','payment_id',p_payment_id,'invoice_item',item,'rule','explicit_full_line_v2'));
  end loop;
  perform public.record_finance_tax_invoice_audit(id,'draft_created',jsonb_build_object('payment_id',p_payment_id,'number_allocated',false,'contract_version',2));
  return id;
end;
$tax_prepare$;

create function public.assert_finance_document_route(p_payment_id uuid,p_route text)
returns void language plpgsql security definer set search_path=public as $route$
declare d jsonb;
begin
  perform 1 from public.finance_payments where id=p_payment_id for update;
  d:=public.finance_payment_document_decision(p_payment_id);
  if p_route='receipt' and d->>'decision' in ('receipt_only','receipt_completion_only') and d->>'combined_id' is null then return; end if;
  if p_route='tax_invoice' and d->>'decision'='tax_invoice_completion_only' and d->>'combined_id' is null then return; end if;
  raise exception using message='DOCUMENT_ROUTE_'||upper(d->>'decision');
end;
$route$;

create function public.create_finance_combined_document_draft(p_payment_id uuid,p_external_receipt_checked boolean,p_external_tax_checked boolean)
returns uuid language plpgsql security definer set search_path=public as $combined_create$
declare d jsonb; v_id uuid:=gen_random_uuid(); rid uuid; tid uuid; source jsonb; day date:=(now() at time zone 'Asia/Bangkok')::date;
begin
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where finance_payments.id=p_payment_id for update;
  select c.id into rid from public.finance_combined_documents c where c.payment_id=p_payment_id and status in ('draft','issued');
  if found then return rid; end if;
  d:=public.finance_payment_document_decision(p_payment_id);
  if d->>'decision'<>'combined_receipt_tax_invoice' then raise exception using message='DOCUMENT_ROUTE_'||upper(d->>'decision'); end if;
  if d->>'receipt_id' is not null or d->>'tax_invoice_id' is not null then raise exception 'DOCUMENT_EXISTING_STANDALONE_DRAFT'; end if;
  if p_external_receipt_checked is distinct from true or p_external_tax_checked is distinct from true then raise exception 'DOCUMENT_EXTERNAL_CHECK_REQUIRED'; end if;
  rid:=public.receipt_create_pre040(p_payment_id,true);
  tid:=public.prepare_finance_document_tax_draft(p_payment_id);
  select source_snapshot_json into source from public.finance_tax_invoices where finance_tax_invoices.id=tid;
  insert into public.finance_combined_documents(id,payment_id,receipt_id,tax_invoice_id,issue_date,source_snapshot_json,draft_snapshot_json,external_receipt_checked,created_by_user_id)
  values(v_id,p_payment_id,rid,tid,day,source,public.finance_tax_invoice_draft_snapshot(source,'{}',day),true,auth.uid());
  update public.finance_receipts set combined_document_id=v_id where finance_receipts.id=rid;
  update public.finance_tax_invoices set combined_document_id=v_id where finance_tax_invoices.id=tid;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(v_id,'draft_created',jsonb_build_object('external_receipt_checked',true,'external_tax_checked',true,'number_allocated',false),auth.uid());
  return v_id;
end;
$combined_create$;

create function public.save_finance_combined_document_draft(p_combined_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $combined_save$
declare c public.finance_combined_documents%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if c.updated_at is distinct from p_expected_updated_at then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  perform public.tax_save_pre040(t.id,p_issue_date,p_decisions_json,t.updated_at);
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  update public.finance_combined_documents set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=t.draft_snapshot_json,updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'draft_saved',jsonb_build_object('decisions',p_decisions_json,'issue_date',p_issue_date),auth.uid());
  return c.id;
end;
$combined_save$;

create function public.issue_finance_combined_document(p_combined_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean,p_external_receipt_checked boolean,p_external_tax_checked boolean)
returns uuid language plpgsql security definer set search_path=public as $combined_issue$
declare c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype;
  point public.finance_tax_point_events%rowtype; source jsonb; rs jsonb; ts jsonb; number text; moment timestamptz:=now(); blockers text[];
begin
  if not public.current_user_can_issue_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'DOCUMENT_ISSUE_ACK_REQUIRED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status='issued' then return c.id; end if;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if p_external_receipt_checked is distinct from true or p_external_tax_checked is distinct from true then raise exception 'DOCUMENT_EXTERNAL_CHECK_REQUIRED'; end if;
  if public.finance_payment_document_decision(c.payment_id)->>'decision'<>'combined_receipt_tax_invoice' then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
  source:=public.build_finance_document_tax_source(c.payment_id);
  if source is distinct from c.source_snapshot_json then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
  if c.draft_snapshot_json is distinct from p_reviewed_snapshot_json then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict r from public.finance_receipts where id=c.receipt_id for update;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id for update;
  if r.status<>'draft' or t.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  blockers:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(blockers)>0 then raise exception using message=blockers[1]; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id for update;
  if point.approved_at is null or point.approved_by_user_id is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if c.issue_date<point.occurred_on or c.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if c.issue_date>point.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  rs:=public.build_finance_receipt_source(c.payment_id);
  if rs is distinct from r.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id order by invoice_item_id for update;
  number:=public.generate_finance_document_no('receipt_tax_invoice',c.issue_date);
  rs:=rs||jsonb_build_object('receipt',jsonb_build_object('id',r.id,'receipt_no',number,'receipt_date',r.receipt_date,'issued_at',moment,
    'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid()),'replaces_receipt_id',r.replaces_receipt_id,'combined_document_id',c.id));
  ts:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(point),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,'issued_by_user_id',auth.uid(),'combined_document_id',c.id));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_receipts set status='issued',receipt_no=number,issued_snapshot_json=rs,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment where id=r.id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,cash_allocated,wht_allocated,source_snapshot_json)
  select r.id,(value->>'invoice_id')::uuid,value->>'invoice_no',value->>'currency',(value->>'cash_allocated')::numeric,(value->>'wht_allocated')::numeric,value
    from jsonb_array_elements(rs->'invoices');
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_snapshot_json=ts,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment where id=t.id;
  update public.finance_combined_documents set status='issued',combined_no=number,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment,
    issued_snapshot_json=jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',c.id,'combined_no',number,
      'issued_at',moment,'issue_date',c.issue_date,'receipt',rs,'tax_invoice',ts) where id=c.id;
  perform public.record_finance_receipt_audit(r.id,'issued',jsonb_build_object('receipt_no',number,'combined_document_id',c.id,'documentary_only',true));
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'combined_document_id',c.id,'delayed_issue_acknowledged',p_delayed_issue_acknowledged,'documentary_only',true));
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'issued',jsonb_build_object('combined_no',number,'receipt_id',r.id,'tax_invoice_id',t.id,'external_receipt_checked',true,'external_tax_checked',true,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false),auth.uid());
  return c.id;
end;
$combined_issue$;

create or replace function public.finance_tax_invoice_draft_snapshot(p_source jsonb,p_decisions jsonb,p_issue_date date)
returns jsonb language plpgsql immutable set search_path=public as $snapshot_v2$
declare decisions jsonb:=coalesce(p_decisions,'{}'); item jsonb; treatment text;
begin
  if p_source->>'schema_version'='2' then
    item:=p_source->'invoice_item'; treatment:=item #>> '{resolved_vat_treatment,treatment}';
    decisions:=decisions||jsonb_build_object('tax_treatment',case when treatment='standard_rate' then 'standard_rated' else treatment end,
      'treatment_reason',item #> '{resolved_vat_treatment,reason}');
  end if;
  return public.tax_snapshot_pre040(p_source,decisions,p_issue_date);
end;
$snapshot_v2$;

create or replace function public.finance_tax_invoice_issue_blockers(p_snapshot jsonb)
returns text[] language plpgsql immutable set search_path=public as $blockers_v2$
declare result text[]:='{}'; item jsonb; treatment text; b text[];
begin
  if p_snapshot->>'schema_version'<>'2' then return public.tax_blockers_pre040(p_snapshot); end if;
  if jsonb_typeof(p_snapshot->'invoice_items') is distinct from 'array' or jsonb_array_length(p_snapshot->'invoice_items')=0 then return array['DOCUMENT_SOURCE_INVALID']; end if;
  for item in select value from jsonb_array_elements(p_snapshot->'invoice_items') loop
    treatment:=item #>> '{resolved_vat_treatment,treatment}';
    b:=public.tax_blockers_pre040(p_snapshot||jsonb_build_object('invoice_item',item,
      'tax_treatment',case when treatment='standard_rate' then 'standard_rated' else treatment end,'treatment_reason',item #> '{resolved_vat_treatment,reason}'));
    result:=result||b;
  end loop;
  return array(select distinct e from unnest(result) e order by e);
end;
$blockers_v2$;

create function public.validate_finance_document_tax_integrity(p_id uuid)
returns void language plpgsql security definer set search_path=public as $tax_integrity_v2$
declare t public.finance_tax_invoices%rowtype; point public.finance_tax_point_events%rowtype; item jsonb; c record; expected_count integer; lines jsonb; taxable jsonb;
begin
  select * into strict t from public.finance_tax_invoices where id=p_id;
  lines:=public.finance_document_invoice_lines(t.invoice_id);
  select jsonb_agg(e) into taxable from jsonb_array_elements(lines) e where e #>> '{resolved_vat_treatment,treatment}' in ('standard_rate','zero_rated');
  expected_count:=jsonb_array_length(t.source_snapshot_json->'invoice_items');
  if expected_count is null or expected_count<1 or t.draft_snapshot_json is distinct from public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,t.decisions_json,t.issue_date)
    or t.source_snapshot_json->'document_lines' is distinct from lines or t.source_snapshot_json->'invoice_items' is distinct from taxable
    or t.payment_id::text is distinct from t.source_snapshot_json #>> '{payment,id}'
    or t.invoice_id::text is distinct from t.source_snapshot_json #>> '{invoice,id}'
    or t.client_id::text is distinct from t.source_snapshot_json #>> '{customer,id}'
    or (select count(*) from public.finance_tax_invoice_items where tax_invoice_id=t.id)<>expected_count
    or (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id)<>expected_count
  then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id;
  if point.event_type<>'payment_received' or point.occurred_on is distinct from (t.source_snapshot_json #>> '{payment,received_on}')::date
    or point.evidence_json is distinct from jsonb_build_object('payment',t.source_snapshot_json->'payment','policy_version','vp_v1')
    or ((t.decisions_json->'no_earlier_event'='true'::jsonb) is true)<>(point.approved_at is not null)
  then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(t.source_snapshot_json->'invoice_items') loop
    if item #>> '{resolved_vat_treatment,treatment}' not in ('standard_rate','zero_rated') then raise exception 'DOCUMENT_VAT_CONFLICT'; end if;
    select coverage.*,component.source_snapshot_json as component_snapshot,component.amount_before_vat as cb,component.vat_amount as cv,component.total_amount as ct
    into strict c from public.finance_tax_invoice_source_coverages coverage join public.finance_tax_invoice_items component on component.id=coverage.tax_invoice_item_id
    where coverage.tax_invoice_id=t.id and component.tax_invoice_id=t.id and component.invoice_item_id::text=item->>'id';
    if c.invoice_item_id::text is distinct from item->>'id' or c.tax_point_event_id<>point.id
      or c.component_snapshot is distinct from item or c.cb is distinct from (item->>'amount_before_vat')::numeric
      or c.cv is distinct from (item->>'vat_amount')::numeric or c.ct is distinct from (item->>'line_total')::numeric
      or c.amount_before_vat<>c.cb or c.vat_amount<>c.cv or c.total_amount<>c.ct
      or c.status<>(case t.status when 'draft' then 'reserved' when 'issued' then 'issued' else 'released' end)
      or c.source_snapshot_json is distinct from jsonb_build_object('invoice_id',t.source_snapshot_json #> '{invoice,id}','payment_id',t.payment_id,'invoice_item',item,'rule','explicit_full_line_v2')
    then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  end loop;
  if t.status='issued' then
    if cardinality(public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json))>0
      or (t.issued_snapshot_json-array['document','tax_point']) is distinct from (t.draft_snapshot_json-'tax_point')
      or t.issued_snapshot_json #>> '{document,id}' is distinct from t.id::text
      or t.issued_snapshot_json #>> '{document,tax_invoice_no}' is distinct from t.tax_invoice_no
      or (t.issued_snapshot_json #>> '{document,issue_date}')::date is distinct from t.issue_date
      or (t.issued_snapshot_json #>> '{document,issued_at}')::timestamptz is distinct from t.issued_at
      or t.issued_snapshot_json #>> '{document,issued_by_user_id}' is distinct from t.issued_by_user_id::text
      or t.issued_snapshot_json->'tax_point' is distinct from (t.draft_snapshot_json->'tax_point'||to_jsonb(point))
      or t.issued_snapshot_json #> '{seller,logo_asset}' is distinct from public.document_logo_evidence(t.issued_snapshot_json #>> '{seller,logo_asset,path}')
    then raise exception 'TAX_INVOICE_ISSUED_EVIDENCE_INVALID'; end if;
    if not exists(select 1 from public.finance_tax_invoice_audit_events where tax_invoice_id=t.id and event_type='issued'
      and event_payload_json->>'tax_invoice_no'=t.tax_invoice_no and actor_user_id=t.issued_by_user_id
      and (t.issue_date=point.occurred_on or event_payload_json->'delayed_issue_acknowledged'='true'::jsonb)) then raise exception 'TAX_INVOICE_ISSUE_AUDIT_REQUIRED'; end if;
  end if;
end;
$tax_integrity_v2$;

create function public.protect_finance_combined_document()
returns trigger language plpgsql security definer set search_path=public as $combined_history$
begin
  if tg_op='DELETE' or tg_table_name='finance_combined_document_audit_events' then raise exception 'DOCUMENT_HISTORY_IMMUTABLE'; end if;
  if old.status<>'draft' or (to_jsonb(old)-array['status','combined_no','issue_date','source_snapshot_json','draft_snapshot_json','issued_snapshot_json','decisions_json','issued_at','issued_by_user_id','updated_at','cancel_reason'])
    is distinct from (to_jsonb(new)-array['status','combined_no','issue_date','source_snapshot_json','draft_snapshot_json','issued_snapshot_json','decisions_json','issued_at','issued_by_user_id','updated_at','cancel_reason'])
  then raise exception 'DOCUMENT_HISTORY_IMMUTABLE'; end if;
  return new;
end;
$combined_history$;

create function public.validate_finance_combined_document()
returns trigger language plpgsql security definer set search_path=public as $combined_integrity$
declare cid uuid; c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if tg_table_name='finance_combined_documents' then cid:=new.id; else cid:=new.combined_document_id; end if;
  if cid is null then
    if tg_op='UPDATE' and old.combined_document_id is not null then raise exception 'DOCUMENT_PAIR_IMMUTABLE'; end if;
    return new;
  end if;
  if tg_op='UPDATE' and tg_table_name in ('finance_receipts','finance_tax_invoices') then
    if old.combined_document_id is not null and old.combined_document_id is distinct from new.combined_document_id then raise exception 'DOCUMENT_PAIR_IMMUTABLE'; end if;
  end if;
  select * into strict c from public.finance_combined_documents where id=cid;
  select * into strict r from public.finance_receipts where id=c.receipt_id;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  if r.payment_id<>c.payment_id or t.payment_id<>c.payment_id or r.combined_document_id is distinct from c.id or t.combined_document_id is distinct from c.id
    or r.status<>c.status or t.status<>c.status or c.issue_date<>t.issue_date
    or c.draft_snapshot_json is distinct from t.draft_snapshot_json or c.source_snapshot_json is distinct from t.source_snapshot_json
    or c.decisions_json is distinct from t.decisions_json or not c.external_receipt_checked
  then raise exception 'DOCUMENT_PAIR_INVALID'; end if;
  if c.status='issued' then
    if c.combined_no is distinct from r.receipt_no or c.combined_no is distinct from t.tax_invoice_no
      or c.issued_at is distinct from r.issued_at or c.issued_at is distinct from t.issued_at
      or c.issued_by_user_id is distinct from r.issued_by_user_id or c.issued_by_user_id is distinct from t.issued_by_user_id
      or c.issued_snapshot_json is distinct from jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',c.id,
        'combined_no',c.combined_no,'issued_at',c.issued_at,'issue_date',c.issue_date,'receipt',r.issued_snapshot_json,'tax_invoice',t.issued_snapshot_json)
      or not exists(select 1 from public.finance_combined_document_audit_events where combined_document_id=c.id and event_type='issued'
        and event_payload_json->>'combined_no'=c.combined_no and actor_user_id=c.issued_by_user_id)
    then raise exception 'DOCUMENT_PAIR_ISSUED_EVIDENCE_INVALID'; end if;
  end if;
  return new;
end;
$combined_integrity$;

create function public.finance_invoice_document_readiness(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $readiness$
declare lines jsonb; i public.finance_invoices%rowtype; customer jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select * into strict i from public.finance_invoices where id=p_invoice_id;
  lines:=public.finance_document_invoice_lines(p_invoice_id);
  customer:=case when i.document_status='issued' then i.issued_snapshot_json->'customer' else i.source_snapshot_json->'customer' end;
  return jsonb_build_object('lines',lines,'unknown_lines',(select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(lines) e where e #>> '{resolved_vat_treatment,treatment}'='unknown'),
    'buyer_identity_warning',exists(select 1 from jsonb_array_elements(lines) e where e #>> '{resolved_vat_treatment,treatment}' in ('standard_rate','zero_rated'))
      and (nullif(btrim(coalesce(i.customer_billing_address,customer->>'address')),'') is null
        or jsonb_typeof(customer->'vat_registered') is distinct from 'boolean'
        or (customer->'vat_registered'='true'::jsonb and (coalesce(customer->>'tax_id','')!~'^[0-9]{13}$'
          or coalesce(customer->>'branch_type','') not in ('head_office','branch') or coalesce(customer->>'branch_code','')!~'^[0-9]{5}$'))));
end;
$readiness$;

create function public.guard_finance_prospective_invoice_vat()
returns trigger language plpgsql security definer set search_path=public as $prospective$
begin
  if old.document_status='draft' and new.document_status='issued' and exists(select 1 from public.finance_invoice_items
    where invoice_id=new.id and source_state='active' and vat_treatment_json is not null
      and public.finance_vat_treatment(vat_treatment_json,vat_applicable,vat_rate)->>'treatment'='unknown')
  then raise exception 'DOCUMENT_UNKNOWN_TREATMENT_BEFORE_ISSUE'; end if;
  return new;
end;
$prospective$;
create trigger document_vat_issue_guard before update on public.finance_invoices for each row execute function public.guard_finance_prospective_invoice_vat();

do $combined_tables$
declare name text;
begin
  foreach name in array array['finance_combined_documents','finance_combined_document_audit_events'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy combined_read on public.%I for select to authenticated using(public.current_user_can_view_combined_documents())',name);
    execute format('create trigger combined_history before update or delete on public.%I for each row execute function public.protect_finance_combined_document()',name);
  end loop;
  foreach name in array array['finance_combined_documents','finance_combined_document_audit_events','finance_receipts','finance_tax_invoices'] loop
    execute format('create constraint trigger combined_integrity after insert or update on public.%I deferrable initially deferred for each row execute function public.validate_finance_combined_document()',name);
  end loop;
end;
$combined_tables$;

-- Explicit privileges, including all predecessor implementation copies.
create or replace function public.get_finance_tax_invoice_eligibility(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $tax_eligibility_v2$
declare d jsonb; existing public.finance_tax_invoices%rowtype; source jsonb;
begin
  if not public.current_user_can_view_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  d:=public.finance_payment_document_decision(p_payment_id);
  select * into existing from public.finance_tax_invoices where payment_id=p_payment_id and status in ('draft','issued');
  if found then return jsonb_build_object('can_prepare',false,'existing_id',existing.id,'existing_status',existing.status,'existing_number',existing.tax_invoice_no,
    'combined_id',existing.combined_document_id,'blockers',case when existing.status='issued' then array['TAX_INVOICE_ALREADY_COVERED'] else public.finance_tax_invoice_issue_blockers(existing.draft_snapshot_json) end); end if;
  if d->>'decision'<>'tax_invoice_completion_only' then return jsonb_build_object('can_prepare',false,'blockers',array['DOCUMENT_ROUTE_'||upper(d->>'decision')]); end if;
  source:=public.build_finance_document_tax_source(p_payment_id);
  return jsonb_build_object('can_prepare',true,'blockers',public.finance_tax_invoice_issue_blockers(public.finance_tax_invoice_draft_snapshot(source,'{}',(now() at time zone 'Asia/Bangkok')::date)));
end;
$tax_eligibility_v2$;

create function public.refresh_finance_combined_document_draft(p_combined_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $combined_refresh$
declare c public.finance_combined_documents%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if c.updated_at is distinct from p_expected_updated_at then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  perform public.receipt_refresh_pre040(c.receipt_id);
  perform public.tax_refresh_pre040(t.id,t.updated_at);
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  if (t.source_snapshot_json,t.draft_snapshot_json,t.decisions_json) is not distinct from
    (c.source_snapshot_json,c.draft_snapshot_json,c.decisions_json) then return c.id; end if;
  update public.finance_combined_documents set source_snapshot_json=t.source_snapshot_json,draft_snapshot_json=t.draft_snapshot_json,
    decisions_json=t.decisions_json,updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'draft_refreshed',jsonb_build_object('approvals_reset',true),auth.uid());
  return c.id;
end;
$combined_refresh$;

create function public.cancel_finance_combined_document_draft(p_combined_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $combined_cancel$
declare c public.finance_combined_documents%rowtype;
begin
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status='cancelled' then return c.id; end if;
  if c.status<>'draft' then raise exception 'DOCUMENT_CORRECTION_WORKFLOW_REQUIRED'; end if;
  perform public.receipt_cancel_pre040(c.receipt_id,p_reason);
  perform public.tax_cancel_pre040(c.tax_invoice_id,p_reason);
  update public.finance_combined_documents set status='cancelled',cancel_reason=btrim(p_reason),updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'cancelled',jsonb_build_object('reason',btrim(p_reason)),auth.uid());
  return c.id;
end;
$combined_cancel$;

-- BEGIN GENERATED PRIVILEGES
revoke all on function public.finance_vat_treatment(jsonb,boolean,numeric) from public,anon,authenticated;
revoke all on function public.inherit_finance_document_vat_treatment() from public,anon,authenticated;
revoke all on function public.current_user_can_manage_combined_documents() from public,anon,authenticated;
grant execute on function public.current_user_can_manage_combined_documents() to authenticated;
revoke all on function public.current_user_can_view_combined_documents() from public,anon,authenticated;
grant execute on function public.current_user_can_view_combined_documents() to authenticated;
revoke all on function public.current_user_can_issue_combined_documents() from public,anon,authenticated;
grant execute on function public.current_user_can_issue_combined_documents() to authenticated;
revoke all on function public.finance_document_invoice_lines(uuid) from public,anon,authenticated;
revoke all on function public.finance_payment_document_decision(uuid) from public,anon,authenticated;
revoke all on function public.get_finance_document_decision(uuid) from public,anon,authenticated;
grant execute on function public.get_finance_document_decision(uuid) to authenticated;
revoke all on function public.generate_finance_document_no(text,date) from public,anon,authenticated;
revoke all on function public.receipt_create_pre040(uuid,boolean) from public,anon,authenticated;
revoke all on function public.receipt_issue_pre040(uuid,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.receipt_refresh_pre040(uuid) from public,anon,authenticated;
revoke all on function public.receipt_cancel_pre040(uuid,text) from public,anon,authenticated;
revoke all on function public.tax_save_pre040(uuid,date,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.tax_refresh_pre040(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.tax_issue_pre040(uuid,jsonb,boolean,boolean) from public,anon,authenticated;
revoke all on function public.tax_cancel_pre040(uuid,text) from public,anon,authenticated;
revoke all on function public.tax_snapshot_pre040(jsonb,jsonb,date) from public,anon,authenticated;
revoke all on function public.tax_blockers_pre040(jsonb) from public,anon,authenticated;
revoke all on function public.build_finance_tax_invoice_source(uuid) from public,anon,authenticated;
revoke all on function public.create_finance_receipt_draft_from_payment(uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_finance_receipt_draft_from_payment(uuid,boolean) to authenticated;
revoke all on function public.issue_finance_receipt(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.issue_finance_receipt(uuid,boolean,jsonb) to authenticated;
revoke all on function public.create_finance_tax_invoice_draft(uuid) from public,anon,authenticated;
grant execute on function public.create_finance_tax_invoice_draft(uuid) to authenticated;
revoke all on function public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean) to authenticated;
revoke all on function public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz) to authenticated;
revoke all on function public.refresh_finance_tax_invoice_draft(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_finance_tax_invoice_draft(uuid,timestamptz) to authenticated;
revoke all on function public.cancel_finance_tax_invoice_draft(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_finance_tax_invoice_draft(uuid,text) to authenticated;
revoke all on function public.refresh_finance_receipt_draft(uuid) from public,anon,authenticated;
grant execute on function public.refresh_finance_receipt_draft(uuid) to authenticated;
revoke all on function public.cancel_finance_receipt_draft(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_finance_receipt_draft(uuid,text) to authenticated;
revoke all on function public.void_finance_receipt(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.void_finance_receipt(uuid,text,boolean) to authenticated;
revoke all on function public.validate_finance_tax_invoice_integrity() from public,anon,authenticated;
revoke all on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) to authenticated;
revoke all on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) to authenticated;
revoke all on function public.freeze_finance_quotation_commercial_terms_v2() from public,anon,authenticated;
revoke all on function public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text) to authenticated;
revoke all on function public.mark_finance_billable_charge_ready(uuid,boolean) from public,anon,authenticated;
grant execute on function public.mark_finance_billable_charge_ready(uuid,boolean) to authenticated;
revoke all on function public.build_finance_document_tax_source(uuid) from public,anon,authenticated;
revoke all on function public.prepare_finance_document_tax_draft(uuid) from public,anon,authenticated;
revoke all on function public.assert_finance_document_route(uuid,text) from public,anon,authenticated;
revoke all on function public.create_finance_combined_document_draft(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.create_finance_combined_document_draft(uuid,boolean,boolean) to authenticated;
revoke all on function public.save_finance_combined_document_draft(uuid,date,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_finance_combined_document_draft(uuid,date,jsonb,timestamptz) to authenticated;
revoke all on function public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean) to authenticated;
revoke all on function public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date) from public,anon,authenticated;
revoke all on function public.finance_tax_invoice_issue_blockers(jsonb) from public,anon,authenticated;
revoke all on function public.validate_finance_document_tax_integrity(uuid) from public,anon,authenticated;
revoke all on function public.protect_finance_combined_document() from public,anon,authenticated;
revoke all on function public.validate_finance_combined_document() from public,anon,authenticated;
revoke all on function public.finance_invoice_document_readiness(uuid) from public,anon,authenticated;
grant execute on function public.finance_invoice_document_readiness(uuid) to authenticated;
revoke all on function public.guard_finance_prospective_invoice_vat() from public,anon,authenticated;
revoke all on function public.get_finance_tax_invoice_eligibility(uuid) from public,anon,authenticated;
grant execute on function public.get_finance_tax_invoice_eligibility(uuid) to authenticated;
revoke all on function public.refresh_finance_combined_document_draft(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.refresh_finance_combined_document_draft(uuid,timestamptz) to authenticated;
revoke all on function public.cancel_finance_combined_document_draft(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_finance_combined_document_draft(uuid,text) to authenticated;
-- END GENERATED PRIVILEGES
-- END EMBEDDED MIGRATION 040
-- ONE SELECT-only statement, ONE result row. No lifecycle calls or business writes.
-- Compare protected_evidence_hashes between preflight and verification.
with expected_functions(signature,hash,callable,security_definer,volatility) as (values ('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,false,'i'),
('public.inherit_finance_document_vat_treatment()','ace71258dcef487257373cafea7979de',false,true,'v'),
('public.current_user_can_manage_combined_documents()','45458bdb930da5ddfb43446647a76cbd',true,true,'s'),
('public.current_user_can_view_combined_documents()','a0c66c36abe6728e74a62516a8a21846',true,true,'s'),
('public.current_user_can_issue_combined_documents()','4a0335e8ee913bd3a92a04930e99abad',true,true,'s'),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',false,true,'s'),
('public.finance_payment_document_decision(uuid)','6eb4824bcb031dfd72032bf85f51b041',false,true,'s'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,true,'v'),
('public.generate_finance_document_no(text,date)','e8930fcf469ccd9980785d55355eef47',false,true,'v'),
('public.receipt_create_pre040(uuid,boolean)','e7a845489934cd709a195c597184da7b',false,true,'v'),
('public.receipt_issue_pre040(uuid,boolean,jsonb)','4bba2218365fa335a69c65a563c86f03',false,true,'v'),
('public.receipt_refresh_pre040(uuid)','99c9e30d64fffcb396dff606b527d856',false,true,'v'),
('public.receipt_cancel_pre040(uuid,text)','5322719551e81b50a970e62e100e45f3',false,true,'v'),
('public.tax_save_pre040(uuid,date,jsonb,timestamptz)','982f39ad0345366279a9c49b45a081e3',false,true,'v'),
('public.tax_refresh_pre040(uuid,timestamptz)','dde80410373f2c781a6900b8edc2bbfd',false,true,'v'),
('public.tax_issue_pre040(uuid,jsonb,boolean,boolean)','82817a02817e85f05d992ab05ad3f183',false,true,'v'),
('public.tax_cancel_pre040(uuid,text)','f8b815d6f05e1b217e816a1db65fb4b1',false,true,'v'),
('public.tax_snapshot_pre040(jsonb,jsonb,date)','e49e30e3642346e411eb479c3c172521',false,false,'i'),
('public.tax_blockers_pre040(jsonb)','9956fcd2141247a996e3ac72600eff67',false,false,'i'),
('public.build_finance_tax_invoice_source(uuid)','a9667d254bb892de408b5651e8168efa',false,true,'v'),
('public.create_finance_receipt_draft_from_payment(uuid,boolean)','49563370979fa03e58a77297082b155a',true,true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,true,'v'),
('public.create_finance_tax_invoice_draft(uuid)','3b54fd34ce0fbae1b4ba86003d38747b',true,true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,true,'v'),
('public.save_finance_tax_invoice_draft(uuid,date,jsonb,timestamptz)','b4a61bbaa67b962bc47e1a9ff9b0f926',true,true,'v'),
('public.refresh_finance_tax_invoice_draft(uuid,timestamptz)','ee692ff7b88b02b419ad1b5f957a6680',true,true,'v'),
('public.cancel_finance_tax_invoice_draft(uuid,text)','2f2578bd3d11894fb0fa0adc4dc721a1',true,true,'v'),
('public.refresh_finance_receipt_draft(uuid)','3f79a415985f4701ae91ff7b7a21e2e4',true,true,'v'),
('public.cancel_finance_receipt_draft(uuid,text)','4532b3dd1905ba5b5c98e231d5b0e27d',true,true,'v'),
('public.void_finance_receipt(uuid,text,boolean)','1899822f8a5561379cc46ce002a6b202',true,true,'v'),
('public.validate_finance_tax_invoice_integrity()','e2ee57619fbcc3073d5b4ebfb19c2b43',false,true,'v'),
('public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb)','65b7bae464e694303e8a82b9027ed098',true,true,'v'),
('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)','742aa07f3707f2f8b58cdc83e87cd446',true,true,'v'),
('public.freeze_finance_quotation_commercial_terms_v2()','3d5243c061afd3bfb981d4d13ec7e858',false,true,'v'),
('public.save_finance_billable_charge_draft(uuid,uuid,bigint,uuid,text,text,jsonb,text,numeric,text,numeric,text,date,text,text,numeric,text)','3bc2c9a48b6a591223e49040a0bffd0b',true,true,'v'),
('public.mark_finance_billable_charge_ready(uuid,boolean)','a6f3196da29d750aa29ae46df2aca8ec',true,true,'v'),
('public.build_finance_document_tax_source(uuid)','1629c804cf013b519759d672541d7d09',false,true,'v'),
('public.prepare_finance_document_tax_draft(uuid)','0c759724a38ab2b9f4f88b7eacc94779',false,true,'v'),
('public.assert_finance_document_route(uuid,text)','f97fdb3e752c6f1eee151bb8efe5c150',false,true,'v'),
('public.create_finance_combined_document_draft(uuid,boolean,boolean)','52dc25593bb5f7607f944bfc8e6a8487',true,true,'v'),
('public.save_finance_combined_document_draft(uuid,date,jsonb,timestamptz)','2ce8fb00b598f55b61ddd708c19840ba',true,true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,true,'v'),
('public.finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)','bef394e77841bd9e6394511f3eebc7bd',false,false,'i'),
('public.finance_tax_invoice_issue_blockers(jsonb)','e7f592f622ab0494cbf15c160b2807bb',false,false,'i'),
('public.validate_finance_document_tax_integrity(uuid)','d2674f68e33dd69ce59cae9bcccc7c7b',false,true,'v'),
('public.protect_finance_combined_document()','8c0ed16cc4c0b5f2c387c8f73c20c2f2',false,true,'v'),
('public.validate_finance_combined_document()','972428305229c19520c4e9b2004aed62',false,true,'v'),
('public.finance_invoice_document_readiness(uuid)','1164e506e5ac5eb8a27d4a61748fb16d',true,true,'v'),
('public.guard_finance_prospective_invoice_vat()','7cf67c41e96c2e0d4cee6b6a73c75dcb',false,true,'v'),
('public.get_finance_tax_invoice_eligibility(uuid)','03b0ffa9cc202ce870ab799a2691a986',true,true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,true,'v'),
('public.cancel_finance_combined_document_draft(uuid,text)','4844510df3eb3f68faefd73e90d1fddc',true,true,'v')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile,
   coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
   coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anon_execute
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)), protected_payment as (select * from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'),
 protected_invoice as (select * from public.finance_invoices where id='74461042-e3ba-4922-9b64-55aac9ebd8aa'),
 protected_receipt as (select * from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'),
 protected_checks(name,passed) as (values
 ('protected_payment',(select count(*)=1 and coalesce(bool_and(status='confirmed' and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000),false) from protected_payment)),
 ('protected_invoice',(select count(*)=1 and coalesce(bool_and(document_status='issued' and invoice_no='VP-IV-202609-000003' and total_amount=5000 and amount_before_vat=4672.90 and vat_amount=327.10),false) from protected_invoice)),
 ('protected_receipt',(select count(*)=1 and coalesce(bool_and(status='issued' and receipt_no='VP-RC-202609-000001' and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861' and issued_snapshot_json->>'schema_version'='2'),false) from protected_receipt)),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances))
 ),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_billable_charges",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_billing_installment_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_combined_document_audit_events",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_payload_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "combined_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_document_audit_event_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_combined_document_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_document_audit_events_event_payload_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_document_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''draft_refreshed''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_combined_document_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "combined_audit_history",
        "definition": "CREATE INDEX combined_audit_history ON public.finance_combined_document_audit_events USING btree (combined_document_id, created_at)"
      },
      {
        "name": "finance_combined_document_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_combined_document_audit_events_pkey ON public.finance_combined_document_audit_events USING btree (id)"
      }
    ]
  },
  {
    "name": "finance_combined_documents",
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "receipt_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "tax_invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "not_null": true
      },
      {
        "name": "combined_no",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "issue_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "draft_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": "''{}''::jsonb",
        "not_null": true
      },
      {
        "name": "external_receipt_checked",
        "type": "boolean",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "created_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "cancel_reason",
        "type": "text",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "combined_cancel_reason",
        "type": "c",
        "definition": "CHECK (((status = ''cancelled''::text) = (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL)))"
      },
      {
        "name": "combined_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "combined_lifecycle",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (combined_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (combined_no IS NOT NULL) AND (combined_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      },
      {
        "name": "finance_combined_documents_combined_no_key",
        "type": "u",
        "definition": "UNIQUE (combined_no)"
      },
      {
        "name": "finance_combined_documents_created_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_documents_decisions_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_draft_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_combined_documents_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_combined_documents_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_combined_documents_receipt_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (receipt_id) REFERENCES finance_receipts(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_documents_receipt_id_key",
        "type": "u",
        "definition": "UNIQUE (receipt_id)"
      },
      {
        "name": "finance_combined_documents_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_combined_documents_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_key",
        "type": "u",
        "definition": "UNIQUE (tax_invoice_id)"
      }
    ],
    "indexes": [
      {
        "name": "combined_active_payment",
        "definition": "CREATE UNIQUE INDEX combined_active_payment ON public.finance_combined_documents USING btree (payment_id) WHERE (status = ANY (ARRAY[''draft''::text, ''issued''::text]))"
      },
      {
        "name": "finance_combined_documents_combined_no_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_combined_no_key ON public.finance_combined_documents USING btree (combined_no)"
      },
      {
        "name": "finance_combined_documents_pkey",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_pkey ON public.finance_combined_documents USING btree (id)"
      },
      {
        "name": "finance_combined_documents_receipt_id_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_receipt_id_key ON public.finance_combined_documents USING btree (receipt_id)"
      },
      {
        "name": "finance_combined_documents_tax_invoice_id_key",
        "definition": "CREATE UNIQUE INDEX finance_combined_documents_tax_invoice_id_key ON public.finance_combined_documents USING btree (tax_invoice_id)"
      }
    ]
  },
  {
    "name": "finance_fee_agreement_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_invoice_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_quotation_items",
    "columns": [
      {
        "name": "vat_treatment_json",
        "type": "jsonb",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "document_vat_evidence_object",
        "type": "c",
        "definition": "CHECK (((vat_treatment_json IS NULL) OR ((jsonb_typeof(vat_treatment_json) = ''object''::text) AND ((vat_treatment_json ->> ''schema_version''::text) = ''1''::text))))"
      }
    ],
    "indexes": null
  },
  {
    "name": "finance_receipts",
    "columns": [
      {
        "name": "combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_receipts_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_receipts_combined_document_id_key",
        "type": "u",
        "definition": "UNIQUE (combined_document_id)"
      },
      {
        "name": "finance_receipts_lifecycle_check",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (receipt_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ANY (ARRAY[''issued''::text, ''voided''::text])) AND (receipt_no IS NOT NULL) AND (((combined_document_id IS NULL) AND (receipt_no ~ ''^VP-RC-[0-9]{6}-[0-9]{6}$''::text)) OR ((combined_document_id IS NOT NULL) AND (status = ''issued''::text) AND (receipt_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text))) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text) AND (issued_snapshot_json <> ''{}''::jsonb))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_receipts_combined_document_id_key",
        "definition": "CREATE UNIQUE INDEX finance_receipts_combined_document_id_key ON public.finance_receipts USING btree (combined_document_id)"
      }
    ]
  },
  {
    "name": "finance_tax_invoices",
    "columns": [
      {
        "name": "combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_invoices_combined_document_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED"
      },
      {
        "name": "finance_tax_invoices_combined_document_id_key",
        "type": "u",
        "definition": "UNIQUE (combined_document_id)"
      },
      {
        "name": "tax_invoice_lifecycle",
        "type": "c",
        "definition": "CHECK ((((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (tax_invoice_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ''issued''::text) AND (tax_invoice_no IS NOT NULL) AND (((combined_document_id IS NULL) AND (tax_invoice_no ~ ''^VP-TI-[0-9]{6}-[0-9]{6}$''::text)) OR ((combined_document_id IS NOT NULL) AND (tax_invoice_no ~ ''^VP-RTI-[0-9]{6}-[0-9]{6}$''::text))) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text))))"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_invoices_combined_document_id_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_invoices_combined_document_id_key ON public.finance_tax_invoices USING btree (combined_document_id)"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,
  (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or a.attname in ('combined_document_id','vat_treatment_json'))) as columns,
  (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n'
    and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or con.conname in ('document_vat_evidence_object','finance_receipts_lifecycle_check','tax_invoice_lifecycle') or con.conname like '%combined_document_id%')) as constraints,
  (select jsonb_agg(jsonb_build_object('name',idx.relname,'definition',pg_get_indexdef(ix.indexrelid)) order by idx.relname) from pg_index ix join pg_class idx on idx.oid=ix.indexrelid where ix.indrelid=c.oid
    and (c.relname in ('finance_combined_documents','finance_combined_document_audit_events') or idx.relname like '%combined_document_id%')) as indexes
  from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_combined_documents','finance_combined_document_audit_events','finance_receipts','finance_tax_invoices','finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items') order by c.relname),
 catalog_differences as (select e.value->>'name' as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e
   full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_040_functions',(select count(*)=52 and bool_and(oid is not null and exact_body and prosecdef=security_definer and provolatile::text=volatility and proconfig @> array['search_path=public']) from function_facts)),
 ('private_and_rpc_privileges',(select bool_and(not anon_execute and authenticated_execute=callable) from function_facts)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('new_rls_direct_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid=any(array['public.finance_combined_documents'::regclass,'public.finance_combined_document_audit_events'::regclass]))),
 ('paired_deferred_guards',(select count(*)=4 and bool_and(tgdeferrable and tginitdeferred and tgenabled='O' and tgfoid='public.validate_finance_combined_document()'::regprocedure and tgrelid in ('public.finance_combined_documents'::regclass,'public.finance_combined_document_audit_events'::regclass,'public.finance_receipts'::regclass,'public.finance_tax_invoices'::regclass)) from pg_trigger where tgname='combined_integrity')),
 ('explicit_read_policies',(select count(*)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_combined_documents()' and with_check is null) from pg_policies where schemaname='public' and tablename in ('finance_combined_documents','finance_combined_document_audit_events'))),
 ('vat_propagation_triggers',(select count(*)=5 and bool_and(tgenabled='O' and tgtype=23 and tgfoid='public.inherit_finance_document_vat_treatment()'::regprocedure) from pg_trigger where tgname='z_document_vat_inherit')),
 ('invoice_issue_vat_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=19 and tgfoid='public.guard_finance_prospective_invoice_vat()'::regprocedure and tgrelid='public.finance_invoices'::regclass) from pg_trigger where tgname='document_vat_issue_guard')),
 ('new_zero_state',not exists(select 1 from public.finance_combined_documents) and not exists(select 1 from public.finance_combined_document_audit_events)),
 ('no_standalone_reinterpretation',not exists(select 1 from public.finance_receipts where combined_document_id is not null) and not exists(select 1 from public.finance_tax_invoices where combined_document_id is not null)),
 ('rti_profile',(select count(*)=1 and bool_and(display_prefix='VP-RTI' and period_scope='monthly' and sequence_width=6 and is_active) from public.document_numbering_profiles where document_type='receipt_tax_invoice')),
 ('no_rti_number_consumed',not exists(select 1 from public.finance_document_counters where doc_type='receipt_tax_invoice' or prefix like 'VP-RTI-%')),
 ('prospective_columns',(select count(*)=5 from information_schema.columns where table_schema='public' and table_name in ('finance_quotation_items','finance_fee_agreement_items','finance_billing_installment_items','finance_billable_charges','finance_invoice_items') and column_name='vat_treatment_json' and data_type='jsonb' and is_nullable='YES'))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as combined_receipt_tax_invoice_foundation_verification_pass,
 jsonb_build_object('payment',(select md5(to_jsonb(p)::text) from protected_payment p),'invoice',(select md5(to_jsonb(i)::text) from protected_invoice i),
   'receipt',(select md5((to_jsonb(r)-'combined_document_id')::text) from protected_receipt r)) as protected_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(signature),'[]') from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)) as function_differences,
 jsonb_build_object('finance_combined_documents',(select count(*) from public.finance_combined_documents),'finance_combined_document_audit_events',(select count(*) from public.finance_combined_document_audit_events)) as combined_rows;
ROLLBACK;
