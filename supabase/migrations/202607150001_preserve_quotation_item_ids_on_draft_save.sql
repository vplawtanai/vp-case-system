-- Preserve quotation item identifiers once Payment Terms or downstream records reference them.
create or replace function public.save_finance_quotation_draft_impl(
  p_quotation_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_issue_date date,
  p_valid_until date,
  p_scope_of_legal_services text,
  p_included_services text,
  p_excluded_services text,
  p_note text,
  p_internal_note text,
  p_authorized_signer_key text,
  p_authorized_signer_name text,
  p_authorized_signer_position text,
  p_authorized_signer_email text,
  p_subtotal_vatable numeric,
  p_subtotal_non_vatable numeric,
  p_vat_amount numeric,
  p_grand_total numeric,
  p_client_snapshot_json jsonb,
  p_matter_snapshot_json jsonb,
  p_document_data_snapshot_json jsonb,
  p_updated_by_user_id uuid,
  p_updated_by_email text,
  p_updated_by_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_subtotal_vatable numeric(14,2);
  v_subtotal_non_vatable numeric(14,2);
  v_vat_amount numeric(14,2);
  v_grand_total numeric(14,2);
  v_existing_item_ids uuid[];
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save finance quotation draft';
  end if;

  if p_case_id is not null and p_advisory_matter_id is not null then
    raise exception 'Select either case or advisory matter, not both';
  end if;
  if p_valid_until is not null and p_valid_until < p_issue_date then
    raise exception 'Valid until cannot be before issue date';
  end if;
  if trim(coalesce(p_authorized_signer_key, '')) = '' then
    raise exception 'Authorized signer is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Quotation draft requires at least one line item';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or trim(coalesce(item->>'description', '')) = ''
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
      or coalesce((item->>'sort_order')::integer, -1) < 0
  ) then
    raise exception 'Quotation draft contains invalid line items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where nullif(item->>'id', '') is not null
      and item->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception 'Quotation draft contains an invalid line item id';
  end if;
  if (select count(*) from jsonb_array_elements(p_items) item where nullif(item->>'id', '') is not null)
     <> (select count(distinct item->>'id') from jsonb_array_elements(p_items) item where nullif(item->>'id', '') is not null) then
    raise exception 'Quotation draft contains duplicate line item ids';
  end if;
  if (select count(*) from jsonb_array_elements(p_items) item)
     <> (select count(distinct (item->>'sort_order')::integer) from jsonb_array_elements(p_items) item) then
    raise exception 'Quotation draft contains duplicate line item sort orders';
  end if;

  select status into v_status
  from public.finance_quotations
  where id = p_quotation_id
  for update;
  if v_status is null then raise exception 'Quotation not found'; end if;
  if v_status <> 'draft' then raise exception 'Only draft quotations can be edited'; end if;

  perform 1 from public.finance_quotation_items where quotation_id = p_quotation_id for update;
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_existing_item_ids
  from public.finance_quotation_items
  where quotation_id = p_quotation_id;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where nullif(item->>'id', '') is not null
      and not exists (
        select 1 from public.finance_quotation_items qi
        where qi.id = (item->>'id')::uuid and qi.quotation_id = p_quotation_id
      )
  ) then
    raise exception 'Quotation draft contains a line item from another quotation';
  end if;

  -- The current Save All flow cannot assign newly generated source item IDs to an
  -- already-loaded Payment Terms editor in the same request. Require an explicit
  -- Payment Terms revision before changing the item set, rather than persisting
  -- inconsistent payment allocations.
  if exists (select 1 from public.finance_quotation_payment_terms pt where pt.quotation_id = p_quotation_id)
     and (
       exists (select 1 from jsonb_array_elements(p_items) item where nullif(item->>'id', '') is null)
       or exists (
         select 1 from public.finance_quotation_items qi
         where qi.quotation_id = p_quotation_id
           and qi.id = any(v_existing_item_ids)
           and not exists (
             select 1 from jsonb_array_elements(p_items) item
             where nullif(item->>'id', '') is not null and (item->>'id')::uuid = qi.id
           )
       )
     ) then
    raise exception 'Payment Terms exist for this quotation. Revise the payment terms before adding or removing quotation items.';
  end if;

  -- Payment Terms allocations are monetary snapshots. Their referenced source item can
  -- retain wording and order, but its commercial values must not change independently.
  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    join public.finance_quotation_items qi on qi.id = (item->>'id')::uuid
    where qi.quotation_id = p_quotation_id
      and exists (
        select 1 from public.finance_quotation_payment_installment_items ai
        where ai.quotation_item_id = qi.id
      )
      and (
        qi.quantity <> (item->>'quantity')::numeric
        or qi.unit_price <> (item->>'unit_price')::numeric
        or qi.vat_applicable <> coalesce((item->>'vat_applicable')::boolean, false)
        or qi.vat_rate <> case when coalesce((item->>'vat_applicable')::boolean, false) then coalesce((item->>'vat_rate')::numeric, 7) else 0 end
      )
  ) then
    raise exception 'This quotation item is already used in Payment Terms. Revise the payment terms before changing its commercial amounts.';
  end if;

  update public.finance_quotation_items qi
  set
    description = btrim(item->>'description'),
    quantity = (item->>'quantity')::numeric,
    unit_price = (item->>'unit_price')::numeric,
    amount_before_tax = round(((item->>'quantity')::numeric * (item->>'unit_price')::numeric)::numeric, 2),
    vat_applicable = coalesce((item->>'vat_applicable')::boolean, false),
    vat_rate = case when coalesce((item->>'vat_applicable')::boolean, false) then coalesce((item->>'vat_rate')::numeric, 7) else 0 end,
    vat_amount = case when coalesce((item->>'vat_applicable')::boolean, false)
      then round((((item->>'quantity')::numeric * (item->>'unit_price')::numeric) * coalesce((item->>'vat_rate')::numeric, 7) / 100)::numeric, 2)
      else 0 end,
    line_total = case when coalesce((item->>'vat_applicable')::boolean, false)
      then round((((item->>'quantity')::numeric * (item->>'unit_price')::numeric) * (1 + coalesce((item->>'vat_rate')::numeric, 7) / 100))::numeric, 2)
      else round(((item->>'quantity')::numeric * (item->>'unit_price')::numeric)::numeric, 2) end,
    sort_order = (item->>'sort_order')::integer,
    updated_at = now()
  from jsonb_array_elements(p_items) item
  where nullif(item->>'id', '') is not null
    and qi.id = (item->>'id')::uuid
    and qi.quotation_id = p_quotation_id;

  insert into public.finance_quotation_items (
    quotation_id, description, quantity, unit_price, amount_before_tax,
    vat_applicable, vat_rate, vat_amount, line_total, sort_order
  )
  select
    p_quotation_id,
    btrim(item->>'description'),
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    round(((item->>'quantity')::numeric * (item->>'unit_price')::numeric)::numeric, 2),
    coalesce((item->>'vat_applicable')::boolean, false),
    case when coalesce((item->>'vat_applicable')::boolean, false) then coalesce((item->>'vat_rate')::numeric, 7) else 0 end,
    case when coalesce((item->>'vat_applicable')::boolean, false)
      then round((((item->>'quantity')::numeric * (item->>'unit_price')::numeric) * coalesce((item->>'vat_rate')::numeric, 7) / 100)::numeric, 2)
      else 0 end,
    case when coalesce((item->>'vat_applicable')::boolean, false)
      then round((((item->>'quantity')::numeric * (item->>'unit_price')::numeric) * (1 + coalesce((item->>'vat_rate')::numeric, 7) / 100))::numeric, 2)
      else round(((item->>'quantity')::numeric * (item->>'unit_price')::numeric)::numeric, 2) end,
    (item->>'sort_order')::integer
  from jsonb_array_elements(p_items) item
  where nullif(item->>'id', '') is null;

  if exists (
    select 1
    from public.finance_quotation_items qi
    where qi.quotation_id = p_quotation_id
      and qi.id = any(v_existing_item_ids)
      and not exists (
        select 1 from jsonb_array_elements(p_items) item
        where nullif(item->>'id', '') is not null and (item->>'id')::uuid = qi.id
      )
      and (
        exists (select 1 from public.finance_quotation_payment_installment_items ai where ai.quotation_item_id = qi.id)
        or exists (select 1 from public.finance_fee_agreement_items fai where fai.source_quotation_item_id = qi.id)
      )
  ) then
    raise exception 'This quotation item is already used in Payment Terms or downstream documents. Remove or revise the dependent allocation first.';
  end if;

  delete from public.finance_quotation_items qi
  where qi.quotation_id = p_quotation_id
    and qi.id = any(v_existing_item_ids)
    and not exists (
      select 1 from jsonb_array_elements(p_items) item
      where nullif(item->>'id', '') is not null and (item->>'id')::uuid = qi.id
    );

  select
    coalesce(sum(case when vat_applicable then amount_before_tax else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when not vat_applicable then amount_before_tax else 0 end), 0)::numeric(14,2),
    coalesce(sum(vat_amount), 0)::numeric(14,2),
    coalesce(sum(line_total), 0)::numeric(14,2)
  into v_subtotal_vatable, v_subtotal_non_vatable, v_vat_amount, v_grand_total
  from public.finance_quotation_items
  where quotation_id = p_quotation_id;

  update public.finance_quotations
  set
    client_id = p_client_id,
    case_id = p_case_id,
    advisory_matter_id = p_advisory_matter_id,
    issue_date = p_issue_date,
    valid_until = p_valid_until,
    scope_of_legal_services = nullif(trim(coalesce(p_scope_of_legal_services, '')), ''),
    included_services = nullif(trim(coalesce(p_included_services, '')), ''),
    excluded_services = nullif(trim(coalesce(p_excluded_services, '')), ''),
    authorized_signer_key = nullif(trim(coalesce(p_authorized_signer_key, '')), ''),
    authorized_signer_name = nullif(trim(coalesce(p_authorized_signer_name, '')), ''),
    authorized_signer_position = nullif(trim(coalesce(p_authorized_signer_position, '')), ''),
    authorized_signer_email = nullif(trim(coalesce(p_authorized_signer_email, '')), ''),
    subtotal_vatable = v_subtotal_vatable,
    subtotal_non_vatable = v_subtotal_non_vatable,
    vat_amount = v_vat_amount,
    grand_total = v_grand_total,
    note = nullif(trim(coalesce(p_note, '')), ''),
    internal_note = nullif(trim(coalesce(p_internal_note, '')), ''),
    client_snapshot_json = p_client_snapshot_json,
    matter_snapshot_json = p_matter_snapshot_json,
    document_data_snapshot_json = coalesce(p_document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
      'totals', jsonb_build_object(
        'subtotalVatable', v_subtotal_vatable,
        'subtotalNonVatable', v_subtotal_non_vatable,
        'vatAmount', v_vat_amount,
        'grandTotal', v_grand_total
      )
    ),
    updated_by_user_id = p_updated_by_user_id,
    updated_by_email = p_updated_by_email,
    updated_by_name = p_updated_by_name,
    updated_at = now()
  where id = p_quotation_id and status = 'draft';

  return p_quotation_id;
end;
$$;

-- The current frontend always sends the 26-parameter contract. Removing the obsolete
-- 24-parameter wrapper prevents PostgREST overload ambiguity after this correction.
drop function if exists public.save_finance_quotation_draft(
  uuid, uuid, bigint, uuid, date, date, text, text, text, text, text, text,
  text, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb,
  uuid, text, text, jsonb
);
