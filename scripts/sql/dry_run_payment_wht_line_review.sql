-- Manual rollback-only candidate test. Never applies permanently. Do not run until preflight reviewed.
-- No business RPCs or synthetic business rows. Temporary baseline hashes are transaction-local.
begin;
create temporary table wht_041_before as select jsonb_build_object(
  'payments',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payments t),
  'wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_wht_components t),
  'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_invoice_allocations t),
  'payment_audits',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_audit_events t),
  'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_invoices t),
  'receipts',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_receipts t),
  'charges',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_billable_charges t),
  'cash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_cash_transactions t),
  'openings',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_account_opening_balances t),
  'ledger',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_company_ledger t),
  'compensation',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_compensation_batches t),
  'protected_functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not in ('assert_finance_payment_structured_wht','guard_finance_payment_wht_confirmation',
      'finance_invoice_wht_lines_v2','finance_payment_wht_review_v2','assert_finance_payment_structured_wht_v1','save_finance_payment_wht_lines_draft'))
) as evidence;

-- BEGIN EMBEDDED MIGRATION 041 (byte-for-byte)
-- CANDIDATE 041: explicit per-line WHT for one fully settled, frozen V2 Invoice.
-- No business rows are changed by installation. No historical WHT is inferred.
-- UI implementation is gated on review/application of this candidate.
-- Optional prospective Charge hint: source_snapshot_json.wht_applicability =
-- applies | does_not_apply | unknown. Existing 040 readiness and 032 Issue freeze
-- this JSON under charge_ready_snapshot.source.source_snapshot. It is only a hint;
-- Payment must explicitly confirm every line and select rates. No source backfill.
do $preflight$
begin
  if to_regprocedure('public.finance_invoice_wht_basis_v1(jsonb)') is null
    or to_regprocedure('public.assert_finance_payment_structured_wht(uuid)') is null
    or to_regprocedure('public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)') is null
    or to_regprocedure('public.finance_invoice_active_reserved_settlement(uuid,uuid)') is null
    or to_regprocedure('public.guard_finance_payment_child_mutation()') is null
  then raise exception 'WHT_LINE_REVIEW_PREDECESSOR_MISSING'; end if;
  if to_regprocedure('public.finance_invoice_wht_lines_v2(jsonb)') is not null
    or to_regprocedure('public.assert_finance_payment_structured_wht_v1(uuid)') is not null
  then raise exception 'WHT_LINE_REVIEW_ALREADY_PRESENT'; end if;
end;
$preflight$;

alter table public.finance_payments drop constraint finance_payments_wht_calculation_mode_check;
alter table public.finance_payments add constraint finance_payments_wht_calculation_mode_check
  check (wht_calculation_mode in ('none','rate','line_review'));
alter table public.finance_payment_wht_components
  drop constraint finance_payment_wht_components_calculation_rule_check,
  drop constraint finance_payment_wht_calculation_check,
  alter column rate_percent drop not null;
alter table public.finance_payment_wht_components add constraint finance_payment_wht_components_calculation_rule_check
  check (calculation_rule in ('single_line_full_invoice_v1','line_review_full_invoice_v2'));
-- No new column/default changes the serialized historical v1 component contract.
-- Applicability is persisted, explicitly, in the v2 evidence envelope.
alter table public.finance_payment_wht_components add constraint finance_payment_wht_calculation_check check (
  (calculation_rule='single_line_full_invoice_v1' and rate_percent is not null
    and calculated_wht_amount>0 and calculated_wht_amount=round(base_amount*rate_percent/100,2))
  or (calculation_rule='line_review_full_invoice_v2'
    and coalesce(jsonb_typeof(basis_snapshot_json->'basis')='object',false)
    and ((coalesce(basis_snapshot_json->>'applicability'='applies',false)
      and rate_percent is not null and calculated_wht_amount>0
      and calculated_wht_amount=round(base_amount*rate_percent/100,2))
    or (coalesce(basis_snapshot_json->>'applicability'='does_not_apply',false)
      and rate_percent is null and calculated_wht_amount=0)))
);

-- Pure frozen-evidence reader. Never reads live Charges, VAT rules or tax categories.
create function public.finance_invoice_wht_lines_v2(p_snapshot jsonb)
returns jsonb language plpgsql immutable set search_path=public
as $lines$
declare
  inv jsonb; item jsonb; result jsonb:='[]'; ids text[]:=array[]::text[];
  b numeric; v numeric; g numeric; sb numeric:=0; sv numeric:=0; sg numeric:=0;
begin
  if p_snapshot->>'schema_version' is distinct from '2'
    or p_snapshot->>'source_model' is distinct from 'billable_charge_v2'
    or jsonb_typeof(p_snapshot->'items') is distinct from 'array'
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  if jsonb_array_length(p_snapshot->'items')=0 then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  inv:=p_snapshot->'invoice';
  if inv->>'document_status' is distinct from 'issued' or nullif(inv->>'currency','') is null
    or nullif(inv->>'id','') is null
    or exists(select 1 from (values('amount_before_vat'),('vat_amount'),('total_amount')) f(k)
      where jsonb_typeof(inv->f.k) is distinct from 'number')
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  perform (inv->>'id')::uuid;
  for item in select e->'invoice_item' from jsonb_array_elements(p_snapshot->'items') e loop
    if item->>'source_state' is distinct from 'active'
      or item->>'invoice_id' is distinct from inv->>'id' or nullif(item->>'id','') is null
      or (item->>'id')=any(ids) or jsonb_typeof(item->'vat_applicable') is distinct from 'boolean'
      or exists(select 1 from (values('amount_before_vat'),('vat_amount'),('line_total')) f(k)
        where jsonb_typeof(item->f.k) is distinct from 'number')
    then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
    perform (item->>'id')::uuid;
    ids:=array_append(ids,item->>'id');
    b:=(item->>'amount_before_vat')::numeric; v:=(item->>'vat_amount')::numeric; g:=(item->>'line_total')::numeric;
    if b<=0 or v<0 or g<=0 or b+v<>g or b<>round(b,2) or v<>round(v,2) or g<>round(g,2)
      or (item->>'vat_applicable'='false' and v<>0)
    then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
    sb:=sb+b; sv:=sv+v; sg:=sg+g;
    result:=result||jsonb_build_array(jsonb_build_object('invoice_id',inv->>'id','invoice_item_id',item->>'id',
      'currency',inv->>'currency','amount_before_vat',b,'vat_amount',v,'total_amount',g,
      'vat_applicable',(item->>'vat_applicable')::boolean,'calculation_rule','line_review_full_invoice_v2'));
  end loop;
  if sb<>(inv->>'amount_before_vat')::numeric or sv<>(inv->>'vat_amount')::numeric or sg<>(inv->>'total_amount')::numeric
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  return result;
end;
$lines$;

-- Choice contract contains IDs, explicit applicability and rates only, never bases
-- or calculated amounts. Unknown/missing choices are not persistable in this version,
-- matching 036's complete-before-save behavior; the UI can retain them locally.
create function public.finance_payment_wht_review_v2(p_snapshot jsonb,p_choices jsonb)
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
      amount:=round((basis->>'amount_before_vat')::numeric*rate/100,2);
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

-- BEGIN UNCHANGED V1 ASSERT BODY (new private name, no changed business rule)
create function public.assert_finance_payment_structured_wht_v1(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $assert_wht$
declare
  p public.finance_payments%rowtype; c public.finance_payment_wht_components%rowtype;
  i public.finance_invoices%rowtype; a public.finance_payment_invoice_allocations%rowtype;
  v_count integer; v_basis jsonb;
begin
  select * into p from public.finance_payments where id=p_payment_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  select count(*) into v_count from public.finance_payment_wht_components where payment_id=p.id;
  if p.wht_amount = 0 then
    if p.wht_calculation_mode = 'rate' or v_count <> 0 then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
    return;
  end if;
  if p.wht_calculation_mode is distinct from 'rate' then raise exception 'WHT_LEGACY_RECALCULATION_REQUIRED'; end if;
  if v_count <> 1 or (select count(*) from public.finance_payment_invoice_allocations where payment_id=p.id) <> 1
  then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
  select * into c from public.finance_payment_wht_components where payment_id=p.id;
  select * into a from public.finance_payment_invoice_allocations where payment_id=p.id;
  select * into i from public.finance_invoices where id=a.invoice_id for update;
  if i.document_status is distinct from 'issued' or i.client_id <> p.client_id or i.currency <> p.currency
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  v_basis := public.finance_invoice_wht_basis_v1(i.issued_snapshot_json);
  if v_basis->>'invoice_id' is distinct from i.id::text or v_basis->>'currency' is distinct from i.currency
    or c.invoice_id <> i.id or c.invoice_item_id::text is distinct from v_basis->>'invoice_item_id'
    or not exists (select 1 from public.finance_invoice_items where id=c.invoice_item_id and invoice_id=i.id and source_state='active')
    or c.basis_snapshot_json is distinct from v_basis
    or c.base_amount <> (v_basis->>'amount_before_vat')::numeric
    or c.calculated_wht_amount <> p.wht_amount
    or a.wht_credit_allocated <> p.wht_amount or a.cash_allocated <> p.cash_amount
    or i.total_amount <> (v_basis->>'total_amount')::numeric
  then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  if p.cash_amount+p.wht_amount <> i.total_amount
    or public.finance_invoice_active_reserved_settlement(i.id,p.id) <> 0
  then raise exception 'WHT_PARTIAL_SCOPE_UNSUPPORTED'; end if;
end;
$assert_wht$;
-- END UNCHANGED V1 ASSERT BODY

create or replace function public.assert_finance_payment_structured_wht(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public
as $assert_lines$
declare p public.finance_payments%rowtype; i public.finance_invoices%rowtype;
  a public.finance_payment_invoice_allocations%rowtype;
  choices jsonb; expected jsonb; actual jsonb; wht numeric;
begin
  select * into p from public.finance_payments where id=p_payment_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  if p.wht_calculation_mode is distinct from 'line_review' then
    -- New evidence must never masquerade as legacy none/rate evidence.
    if exists(select 1 from public.finance_payment_wht_components where payment_id=p.id and calculation_rule='line_review_full_invoice_v2')
    then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
    perform public.assert_finance_payment_structured_wht_v1(p.id); return;
  end if;
  if (select count(*) from public.finance_payment_invoice_allocations where payment_id=p.id)<>1
  then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
  select * into a from public.finance_payment_invoice_allocations where payment_id=p.id;
  select * into i from public.finance_invoices where id=a.invoice_id for update;
  if i.id is null or i.document_status is distinct from 'issued' or i.client_id is distinct from p.client_id
    or i.currency is distinct from p.currency or i.id::text is distinct from i.issued_snapshot_json->'invoice'->>'id'
    or i.currency is distinct from i.issued_snapshot_json->'invoice'->>'currency'
    or i.total_amount is distinct from (i.issued_snapshot_json->'invoice'->>'total_amount')::numeric
    or i.amount_before_vat is distinct from (i.issued_snapshot_json->'invoice'->>'amount_before_vat')::numeric
    or i.vat_amount is distinct from (i.issued_snapshot_json->'invoice'->>'vat_amount')::numeric
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('invoice_item_id',c.invoice_item_id,
    'applicability',c.basis_snapshot_json->>'applicability','rate_percent',c.rate_percent)),'[]'),
    coalesce(jsonb_agg(to_jsonb(c)-array['id','payment_id','created_at','created_by_user_id'] order by c.invoice_item_id),'[]'),
    coalesce(sum(c.calculated_wht_amount),0)
  into choices,actual,wht from public.finance_payment_wht_components c where c.payment_id=p.id;
  expected:=public.finance_payment_wht_review_v2(i.issued_snapshot_json,choices);
  if actual is distinct from expected or p.wht_amount<>wht or a.wht_credit_allocated<>wht
    or a.cash_allocated<>p.cash_amount or p.cash_amount+p.wht_amount<>i.total_amount
    or exists(select 1 from public.finance_payment_wht_components c where c.payment_id=p.id and not exists(
      select 1 from public.finance_invoice_items item where item.id=c.invoice_item_id and item.invoice_id=i.id and item.source_state='active'))
  then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  if public.finance_invoice_active_reserved_settlement(i.id,p.id)<>0 then raise exception 'WHT_PARTIAL_SCOPE_UNSUPPORTED'; end if;
end;
$assert_lines$;

create or replace function public.guard_finance_payment_wht_confirmation()
returns trigger language plpgsql security definer set search_path=public
as $confirm_guard$
begin
  if tg_op='INSERT' then
    if new.wht_amount=0 and new.wht_calculation_mode is null then new.wht_calculation_mode:='none'; end if;
  elsif old.status='draft' and new.status='confirmed' then
    if new.cash_amount is distinct from old.cash_amount or new.wht_amount is distinct from old.wht_amount
      or new.wht_calculation_mode is distinct from old.wht_calculation_mode
    then raise exception 'WHT_SAVE_BEFORE_CONFIRM'; end if;
    perform public.assert_finance_payment_structured_wht(old.id);
    if new.wht_amount=0 and new.wht_calculation_mode is distinct from 'line_review' then new.wht_calculation_mode:='none'; end if;
  end if;
  return new;
end;
$confirm_guard$;

-- Narrow new entry point. No client-supplied cash/WHT/base or allocation values.
-- Requires the existing single Invoice allocation and preserves its identity.
create function public.save_finance_payment_wht_lines_draft(
  p_payment_id uuid,p_received_on date,p_payment_method text,p_receiving_bank_account_id uuid,
  p_receiving_account_reference text,p_external_transaction_reference text,p_payer_name text,p_note text,
  p_line_choices_json jsonb
)
returns uuid language plpgsql security definer set search_path=public
as $save_lines$
declare p public.finance_payments%rowtype; i public.finance_invoices%rowtype;
  a public.finance_payment_invoice_allocations%rowtype;
  components jsonb; previous jsonb; wht numeric; cash numeric;
begin
  if not public.current_user_can_manage_finance_payments() then raise exception 'Not allowed to save Payment Draft'; end if;
  select * into p from public.finance_payments where id=p_payment_id for update;
  if p.id is null or p.status<>'draft' then raise exception 'Only a Draft Payment can be saved'; end if;
  if (select count(*) from public.finance_payment_invoice_allocations where payment_id=p.id)<>1
  then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
  select * into a from public.finance_payment_invoice_allocations where payment_id=p.id;
  select * into i from public.finance_invoices where id=a.invoice_id for update;
  if i.id is null or i.document_status is distinct from 'issued' or i.client_id is distinct from p.client_id or i.currency is distinct from p.currency
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  -- A partial Payment cannot silently expand into a full-Invoice Payment here.
  if p.cash_amount+p.wht_amount<>i.total_amount or a.cash_allocated+a.wht_credit_allocated<>i.total_amount
    or public.finance_invoice_active_reserved_settlement(i.id,p.id)<>0
  then raise exception 'WHT_PARTIAL_SCOPE_UNSUPPORTED'; end if;
  components:=public.finance_payment_wht_review_v2(i.issued_snapshot_json,p_line_choices_json);
  select sum((c->>'calculated_wht_amount')::numeric) into wht from jsonb_array_elements(components) c;
  cash:=i.total_amount-wht;
  if cash<0 then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)-array['id','payment_id','created_at','created_by_user_id'] order by c.invoice_item_id),'[]')
  into previous from public.finance_payment_wht_components c where c.payment_id=p.id;
  perform public.save_finance_payment_draft(p.id,p_received_on,p_payment_method,p_receiving_bank_account_id,
    p_receiving_account_reference,p_external_transaction_reference,p_payer_name,p_note,cash,wht,
    jsonb_build_array(jsonb_build_object('invoice_id',i.id,'cash_allocated',cash,'wht_credit_allocated',wht)));
  if p.wht_calculation_mode is distinct from 'line_review' or previous is distinct from components then
    delete from public.finance_payment_wht_components where payment_id=p.id;
    insert into public.finance_payment_wht_components(payment_id,invoice_id,invoice_item_id,calculation_rule,base_amount,rate_percent,
      calculated_wht_amount,basis_snapshot_json,created_by_user_id)
    select p.id,c.invoice_id,c.invoice_item_id,c.calculation_rule,c.base_amount,c.rate_percent,c.calculated_wht_amount,c.basis_snapshot_json,auth.uid()
    from jsonb_to_recordset(components) c(invoice_id uuid,invoice_item_id uuid,calculation_rule text,base_amount numeric,
      rate_percent numeric,calculated_wht_amount numeric,basis_snapshot_json jsonb);
    update public.finance_payments set wht_calculation_mode='line_review',updated_at=now(),updated_by_user_id=auth.uid() where id=p.id;
    perform public.record_finance_payment_audit_event(p.id,'draft_saved',jsonb_build_object('operation','structured_wht_lines_saved',
      'previous_components',previous,'components',components,'applicability_confirmed_by_user',true,'rate_selected_by_user',true));
  end if;
  perform public.assert_finance_payment_structured_wht(p.id);
  return p.id;
end;
$save_lines$;

revoke all on function public.finance_invoice_wht_lines_v2(jsonb) from public,anon,authenticated;
revoke all on function public.finance_payment_wht_review_v2(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.assert_finance_payment_structured_wht_v1(uuid) from public,anon,authenticated;
revoke all on function public.assert_finance_payment_structured_wht(uuid) from public,anon,authenticated;
revoke all on function public.guard_finance_payment_wht_confirmation() from public,anon,authenticated;
revoke all on function public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb) to authenticated;
-- Existing RLS, browser SELECT-only grant, component Draft guard, unique line key,
-- immutable confirmed evidence and reallocation blocker remain unchanged.
-- END EMBEDDED MIGRATION 041

-- Pure negative test vectors only; no business RPC, no financial fixture rows.
do $negative_tests$
declare s jsonb; c jsonb; bad jsonb; detail_text text;
begin
  s:='{"schema_version":2,"source_model":"billable_charge_v2","invoice":{"id":"00000000-0000-4000-8000-000000000001","document_status":"issued","currency":"THB","amount_before_vat":4672.90,"vat_amount":327.10,"total_amount":5000},"items":[{"invoice_item":{"id":"00000000-0000-4000-8000-000000000011","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":true,"amount_before_vat":4672.90,"vat_amount":327.10,"line_total":5000}}]}';
  c:='[{"invoice_item_id":"00000000-0000-4000-8000-000000000011","applicability":"applies","rate_percent":3}]';
  if (public.finance_payment_wht_review_v2(s,c)->0->>'calculated_wht_amount')::numeric<>140.19
    or public.finance_invoice_wht_basis_v1(s)->>'amount_before_vat'<>'4672.90'
  then raise exception '041_SINGLE_LINE_REGRESSION'; end if;
  begin
    perform public.finance_payment_wht_review_v2(s,'[]');
    raise exception '041_EXPECTED_MISSING_LINE_ERROR';
  exception when raise_exception then
    if sqlerrm<>'WHT_LINE_APPLICABILITY_REQUIRED' then raise; end if;
    get stacked diagnostics detail_text=pg_exception_detail;
    if detail_text::jsonb->>'invoice_item_id'<>'00000000-0000-4000-8000-000000000011' then raise exception '041_LINE_DIAGNOSTIC_MISSING'; end if;
  end;
  begin
    perform public.finance_payment_wht_review_v2(s,c||c);
    raise exception '041_EXPECTED_DUPLICATE_ERROR';
  exception when raise_exception then if sqlerrm<>'WHT_DUPLICATE_LINE' then raise; end if; end;
  begin
    perform public.finance_payment_wht_review_v2(s,jsonb_set(c,'{0,rate_percent}','null'));
    raise exception '041_EXPECTED_RATE_ERROR';
  exception when raise_exception then if sqlerrm<>'WHT_LINE_RATE_REQUIRED' then raise; end if; end;
  begin
    perform public.finance_payment_wht_review_v2(s,jsonb_set(c,'{0,base_amount}','100'));
    raise exception '041_EXPECTED_MANUAL_BASE_ERROR';
  exception when raise_exception then if sqlerrm<>'WHT_LINE_CHOICE_INVALID' then raise; end if; end;
  begin
    perform public.finance_invoice_wht_lines_v2(jsonb_set(s,'{invoice,vat_amount}','999'));
    raise exception '041_EXPECTED_SNAPSHOT_ERROR';
  exception when raise_exception then if sqlerrm<>'WHT_SNAPSHOT_INVALID' then raise; end if; end;
  bad:=jsonb_set(jsonb_set(c,'{0,applicability}','"does_not_apply"'),'{0,rate_percent}','null');
  if public.finance_payment_wht_review_v2(s,bad)->0->>'calculated_wht_amount'<>'0' then raise exception '041_NON_APPLICABLE_NOT_ZERO'; end if;
end;
$negative_tests$;

create temporary table wht_041_after as select jsonb_build_object(
  'payments',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payments t),
  'wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_wht_components t),
  'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_invoice_allocations t),
  'payment_audits',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_payment_audit_events t),
  'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_invoices t),
  'receipts',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_receipts t),
  'charges',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_billable_charges t),
  'cash',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_cash_transactions t),
  'openings',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_account_opening_balances t),
  'ledger',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_company_ledger t),
  'compensation',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'[]')) from public.finance_compensation_batches t),
  'protected_functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not in ('assert_finance_payment_structured_wht','guard_finance_payment_wht_confirmation',
      'finance_invoice_wht_lines_v2','finance_payment_wht_review_v2','assert_finance_payment_structured_wht_v1','save_finance_payment_wht_lines_draft'))
) as evidence;
do $unchanged$
begin
  if (select evidence from wht_041_before) is distinct from (select evidence from wht_041_after)
  then raise exception '041_DRY_RUN_CHANGED_PROTECTED_ROWS_OR_FUNCTIONS'; end if;
end;
$unchanged$;

-- BEGIN EMBEDDED VERIFIER (byte-for-byte)
-- SELECT-only post-apply/candidate dry-run verifier. One statement, one row.
-- No Payment save/confirm RPC is called. Pure frozen-evidence test vectors only.
with expected_functions as (
  -- GENERATED CANDIDATE FUNCTION MANIFEST
  select * from jsonb_to_recordset('[{"signature":"public.assert_finance_payment_structured_wht(uuid)","body_md5":"52cd73f8b3ba91ff9b297041129cc391","security_definer":true,"authenticated_execute":false},{"signature":"public.assert_finance_payment_structured_wht_v1(uuid)","body_md5":"1114ee87e6f2e74fedcfbb096065388c","security_definer":true,"authenticated_execute":false},{"signature":"public.finance_invoice_wht_lines_v2(jsonb)","body_md5":"b8cdedf15dceee0c3d4b03ef7fbc7e2c","security_definer":false,"authenticated_execute":false},{"signature":"public.finance_payment_wht_review_v2(jsonb,jsonb)","body_md5":"4af13910a5ee37ce68948fb6c9c7156e","security_definer":false,"authenticated_execute":false},{"signature":"public.guard_finance_payment_wht_confirmation()","body_md5":"5773fee1676451fc5d80c7b30ff7cb4f","security_definer":true,"authenticated_execute":false},{"signature":"public.save_finance_payment_wht_lines_draft(uuid,date,text,uuid,text,text,text,text,jsonb)","body_md5":"dfbd31e473a7d682a1329c18a7c1ee93","security_definer":true,"authenticated_execute":true}]'::jsonb) x(signature text,body_md5 text,security_definer boolean,authenticated_execute boolean)
), function_differences as (
  select e.signature,e.body_md5 as expected_body_md5,md5(p.prosrc) as actual_body_md5,
    e.security_definer as expected_security_definer,p.prosecdef as actual_security_definer
  from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc) is distinct from e.body_md5 or p.prosecdef is distinct from e.security_definer
    or p.proconfig is distinct from array['search_path=public']::text[]
    or has_function_privilege('authenticated',p.oid,'EXECUTE') is distinct from e.authenticated_execute
    or has_function_privilege('anon',p.oid,'EXECUTE')
    or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
), preserved_functions as (
  -- GENERATED PRESERVED FUNCTION MANIFEST
  select * from jsonb_to_recordset('[{"signature":"public.confirm_finance_payment(uuid,boolean)","body_md5":"deae5aa01dc48eb0faa64afa82bca8b7"},{"signature":"public.finance_invoice_wht_basis_v1(jsonb)","body_md5":"e48a9550e6c675f034714a907ddfca9b"},{"signature":"public.guard_structured_wht_reallocation()","body_md5":"229b0af17984dd64228c9a1258f548b9"},{"signature":"public.post_confirmed_payment_to_finance_cash_transaction(uuid)","body_md5":"5cff47abdf1ae86983b201d88cd8e64c"},{"signature":"public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)","body_md5":"ecc24e593d80a9c1e93ea6ea236c3f17"},{"signature":"public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)","body_md5":"acb0e612b8a816a04108182d31f21e7a"}]'::jsonb) x(signature text,body_md5 text)
), preserved_function_differences as (
  select e.signature,e.body_md5 as expected_body_md5,md5(p.prosrc) as actual_body_md5
  from preserved_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc) is distinct from e.body_md5
), expected_catalog as (
  -- GENERATED CANDIDATE CATALOG MANIFEST
  select * from jsonb_to_recordset('[{"kind":"column","name":"base_amount","definition":"numeric(14,2):true:"},{"kind":"column","name":"basis_snapshot_json","definition":"jsonb:true:"},{"kind":"column","name":"calculated_wht_amount","definition":"numeric(14,2):true:"},{"kind":"column","name":"calculation_rule","definition":"text:true:"},{"kind":"column","name":"created_at","definition":"timestamp with time zone:true:now()"},{"kind":"column","name":"created_by_user_id","definition":"uuid:false:"},{"kind":"column","name":"id","definition":"uuid:true:gen_random_uuid()"},{"kind":"column","name":"invoice_id","definition":"uuid:true:"},{"kind":"column","name":"invoice_item_id","definition":"uuid:true:"},{"kind":"column","name":"payment_id","definition":"uuid:true:"},{"kind":"column","name":"rate_percent","definition":"numeric(7,4):false:"},{"kind":"constraint","name":"finance_payment_wht_calculation_check","definition":"CHECK (calculation_rule = ''single_line_full_invoice_v1''::text AND rate_percent IS NOT NULL AND calculated_wht_amount > 0::numeric AND calculated_wht_amount = round(base_amount * rate_percent / 100::numeric, 2) OR calculation_rule = ''line_review_full_invoice_v2''::text AND COALESCE(jsonb_typeof(basis_snapshot_json -> ''basis''::text) = ''object''::text, false) AND (COALESCE((basis_snapshot_json ->> ''applicability''::text) = ''applies''::text, false) AND rate_percent IS NOT NULL AND calculated_wht_amount > 0::numeric AND calculated_wht_amount = round(base_amount * rate_percent / 100::numeric, 2) OR COALESCE((basis_snapshot_json ->> ''applicability''::text) = ''does_not_apply''::text, false) AND rate_percent IS NULL AND calculated_wht_amount = 0::numeric))"},{"kind":"constraint","name":"finance_payment_wht_components_base_amount_check","definition":"CHECK (base_amount > 0::numeric)"},{"kind":"constraint","name":"finance_payment_wht_components_basis_snapshot_json_check","definition":"CHECK (jsonb_typeof(basis_snapshot_json) = ''object''::text)"},{"kind":"constraint","name":"finance_payment_wht_components_calculation_rule_check","definition":"CHECK (calculation_rule = ANY (ARRAY[''single_line_full_invoice_v1''::text, ''line_review_full_invoice_v2''::text]))"},{"kind":"constraint","name":"finance_payment_wht_components_created_by_user_id_fkey","definition":"FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL"},{"kind":"constraint","name":"finance_payment_wht_components_invoice_id_fkey","definition":"FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_invoice_item_id_fkey","definition":"FOREIGN KEY (invoice_item_id) REFERENCES finance_invoice_items(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_payment_id_fkey","definition":"FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"},{"kind":"constraint","name":"finance_payment_wht_components_pkey","definition":"PRIMARY KEY (id)"},{"kind":"constraint","name":"finance_payment_wht_components_rate_percent_check","definition":"CHECK (rate_percent > 0::numeric AND rate_percent <= 100::numeric)"},{"kind":"constraint","name":"finance_payment_wht_line_unique","definition":"UNIQUE (payment_id, invoice_id, invoice_item_id)"},{"kind":"constraint","name":"finance_payments_wht_calculation_mode_check","definition":"CHECK (wht_calculation_mode = ANY (ARRAY[''none''::text, ''rate''::text, ''line_review''::text]))"},{"kind":"index","name":"finance_payment_wht_components_pkey","definition":"CREATE UNIQUE INDEX finance_payment_wht_components_pkey ON public.finance_payment_wht_components USING btree (id)"},{"kind":"index","name":"finance_payment_wht_invoice_idx","definition":"CREATE INDEX finance_payment_wht_invoice_idx ON public.finance_payment_wht_components USING btree (invoice_id)"},{"kind":"index","name":"finance_payment_wht_line_unique","definition":"CREATE UNIQUE INDEX finance_payment_wht_line_unique ON public.finance_payment_wht_components USING btree (payment_id, invoice_id, invoice_item_id)"}]'::jsonb) x(kind text,name text,definition text)
), actual_catalog as (
  select 'constraint'::text as kind,c.conname::text as name,pg_get_constraintdef(c.oid,true) as definition
  from pg_constraint c where c.conrelid in ('public.finance_payment_wht_components'::regclass,'public.finance_payments'::regclass)
    and (c.conrelid='public.finance_payment_wht_components'::regclass or c.conname='finance_payments_wht_calculation_mode_check')
  union all select 'column',a.attname::text,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.finance_payment_wht_components'::regclass and a.attnum>0 and not a.attisdropped
  union all select 'index',c.relname::text,pg_get_indexdef(c.oid) from pg_index i join pg_class c on c.oid=i.indexrelid
    where i.indrelid='public.finance_payment_wht_components'::regclass
), catalog_differences as (
  select coalesce(e.kind,a.kind) as kind,coalesce(e.name,a.name) as name,e.definition as expected,a.definition as actual
  from expected_catalog e full join actual_catalog a using(kind,name) where e.definition is distinct from a.definition
), vector as (
  select '{"schema_version":2,"source_model":"billable_charge_v2","invoice":{"id":"00000000-0000-4000-8000-000000000001","document_status":"issued","currency":"THB","amount_before_vat":18672.90,"vat_amount":607.10,"total_amount":19280},"items":[{"invoice_item":{"id":"00000000-0000-4000-8000-000000000011","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":true,"amount_before_vat":4000,"vat_amount":280,"line_total":4280}},{"invoice_item":{"id":"00000000-0000-4000-8000-000000000012","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":false,"amount_before_vat":10000,"vat_amount":0,"line_total":10000}},{"invoice_item":{"id":"00000000-0000-4000-8000-000000000013","invoice_id":"00000000-0000-4000-8000-000000000001","source_state":"active","vat_applicable":true,"amount_before_vat":4672.90,"vat_amount":327.10,"line_total":5000}}]}'::jsonb as snapshot
), math as (
  select public.finance_invoice_wht_lines_v2(snapshot) as bases,
    public.finance_payment_wht_review_v2(snapshot,(select jsonb_agg(jsonb_build_object('invoice_item_id',i->'invoice_item'->>'id','applicability','applies','rate_percent',3)) from jsonb_array_elements(snapshot->'items') i)) as all_applies,
    public.finance_payment_wht_review_v2(snapshot,(select jsonb_agg(jsonb_build_object('invoice_item_id',i->'invoice_item'->>'id',
      'applicability',case when i->'invoice_item'->>'id'='00000000-0000-4000-8000-000000000012' then 'does_not_apply' else 'applies' end,
      'rate_percent',case when i->'invoice_item'->>'id'='00000000-0000-4000-8000-000000000012' then null else 3 end)) from jsonb_array_elements(snapshot->'items') i)) as mixed
  from vector
), checks as (
  select 'exact_function_bodies_security_privileges' as name,(select count(*) from expected_functions)>=6 and not exists(select 1 from function_differences) as pass
  union all select 'existing_payment_cash_single_line_rpcs_preserved',(select count(*) from preserved_functions)>=6 and not exists(select 1 from preserved_function_differences)
  union all select 'exact_component_catalog',(select count(*) from expected_catalog)>10 and not exists(select 1 from catalog_differences)
  union all select 'component_browser_mutation_blocked',(select relrowsecurity from pg_class where oid='public.finance_payment_wht_components'::regclass)
    and has_table_privilege('authenticated','public.finance_payment_wht_components','SELECT')
    and not has_table_privilege('authenticated','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
    and not has_table_privilege('anon','public.finance_payment_wht_components','INSERT,UPDATE,DELETE,TRUNCATE')
  union all select 'read_policy_preserved',exists(select 1 from pg_policies where schemaname='public' and tablename='finance_payment_wht_components'
    and policyname='payment viewers read wht components' and cmd='SELECT' and roles=array['authenticated']::name[]
    and qual='current_user_can_view_finance_payments()')
  union all select 'transition_child_reallocation_triggers_preserved',(select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled='O' and
    ((t.tgrelid='public.finance_payments'::regclass and t.tgname='finance_payment_structured_wht_before_write' and t.tgfoid='public.guard_finance_payment_wht_confirmation()'::regprocedure)
    or (t.tgrelid='public.finance_payment_wht_components'::regclass and t.tgname='finance_payment_wht_component_draft_guard' and t.tgfoid='public.guard_finance_payment_child_mutation()'::regprocedure)
    or (t.tgrelid='public.finance_payment_allocation_reallocations'::regclass and t.tgname='finance_payment_structured_wht_reallocation_guard' and t.tgfoid='public.guard_structured_wht_reallocation()'::regprocedure)))=3
  union all select 'all_applicable_before_vat_exact',
    (select sum((c->>'calculated_wht_amount')::numeric) from math,jsonb_array_elements(all_applies)c)=560.19
    and (select sum((c->>'base_amount')::numeric) from math,jsonb_array_elements(all_applies)c)=18672.90
  union all select 'mixed_applicability_exact',
    (select sum((c->>'calculated_wht_amount')::numeric) from math,jsonb_array_elements(mixed)c)=260.19
    and (select count(*) from math,jsonb_array_elements(mixed)c where c->'basis_snapshot_json'->>'applicability'='does_not_apply' and c->'rate_percent'='null'::jsonb and (c->>'calculated_wht_amount')::numeric=0)=1
  union all select 'base_reader_does_not_infer_rate_or_applicability',not exists(select 1 from math,jsonb_array_elements(bases)c where c?'rate_percent' or c?'applicability')
  union all select 'target_draft_unchanged',count(*)=1 and bool_and(status='draft' and cash_amount+wht_amount=19280)
    from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857'
  union all select 'target_invoice_unchanged',count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004'
    and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10)
    from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'
  union all select 'historical_single_line_payment_unchanged',count(*)=1 and bool_and(status='confirmed' and wht_calculation_mode='rate'
    and cash_amount=4859.81 and wht_amount=140.19 and settlement_amount=5000) from public.finance_payments where id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'
  union all select 'historical_single_line_component_unchanged',count(*)=1 and bool_and(calculation_rule='single_line_full_invoice_v1'
    and base_amount=4672.90 and rate_percent=3 and calculated_wht_amount=140.19) from public.finance_payment_wht_components where payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861'
  union all select 'historical_receipt_unchanged',count(*)=1 and bool_and(status='issued' and receipt_no='VP-RC-202609-000001'
    and payment_id='9e2f601e-13ef-4165-8e2c-1887c3ad8861') from public.finance_receipts where id='a76cd43d-fe52-4008-ade1-f1d79a9f27bf'
  union all select 'no_line_review_rows_created_by_migration',not exists(select 1 from public.finance_payment_wht_components where calculation_rule='line_review_full_invoice_v2')
    and not exists(select 1 from public.finance_payments where wht_calculation_mode='line_review')
  union all select 'no_cash_cutover',not exists(select 1 from public.finance_account_opening_balances)
)
select current_setting('server_version_num') as catalog_server_version_num,
  (select jsonb_object_agg(name,coalesce(pass,false) order by name) from checks) as checks,
  (select coalesce(jsonb_agg(name order by name),'[]') from checks where pass is not true) as failed_checks,
  (select coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]') from function_differences d) as function_differences,
  (select coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]') from preserved_function_differences d) as preserved_function_differences,
  (select coalesce(jsonb_agg(to_jsonb(d) order by kind,name),'[]') from catalog_differences d) as catalog_differences,
  (select count(*) from public.finance_payments) as payment_rows_observability,
  (select count(*) from public.finance_company_ledger) as ledger_rows_observability,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_observability,
  not exists(select 1 from checks where pass is not true) as payment_wht_line_review_verification_pass;
-- END EMBEDDED VERIFIER
rollback;
