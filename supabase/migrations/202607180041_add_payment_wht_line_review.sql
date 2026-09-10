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
