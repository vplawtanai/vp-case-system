-- Atomic New Quotation creation. Existing edit/save RPCs remain unchanged.
create or replace function public.create_finance_quotation_draft_atomic(
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
  p_client_snapshot_json jsonb,
  p_matter_snapshot_json jsonb,
  p_document_data_snapshot_json jsonb,
  p_items jsonb,
  p_payment_method_type text,
  p_payment_client_summary text,
  p_installments_json jsonb
)
returns table(quotation_id uuid, quotation_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation_id uuid;
  v_quotation_no text;
  v_item jsonb;
  v_item_id uuid;
  v_item_map jsonb := '{}'::jsonb;
  v_mapped_installments jsonb;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to create quotation draft';
  end if;
  if p_client_id is null or not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'Quotation client not found';
  end if;
  if p_case_id is not null and p_advisory_matter_id is not null then
    raise exception 'Select either case or advisory matter, not both';
  end if;
  if p_case_id is not null and not exists (select 1 from public.cases where id = p_case_id) then
    raise exception 'Quotation case not found';
  end if;
  if p_advisory_matter_id is not null and not exists (select 1 from public.advisory_matters where id = p_advisory_matter_id) then
    raise exception 'Quotation advisory matter not found';
  end if;
  if p_issue_date is null or (p_valid_until is not null and p_valid_until < p_issue_date) then
    raise exception 'Valid until cannot be before issue date';
  end if;
  if nullif(btrim(coalesce(p_authorized_signer_key, '')), '') is null then
    raise exception 'Authorized signer is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Quotation draft requires at least one line item';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(coalesce(item->>'client_item_key', '')), '') is null
      or nullif(btrim(coalesce(item->>'description', '')), '') is null
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
      or coalesce((item->>'sort_order')::integer, -1) < 0
  ) then raise exception 'Quotation draft contains invalid line items'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct item->>'client_item_key') from jsonb_array_elements(p_items) item) then
    raise exception 'Quotation draft contains duplicate client item keys';
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct (item->>'sort_order')::integer) from jsonb_array_elements(p_items) item) then
    raise exception 'Quotation draft contains duplicate line item sort orders';
  end if;
  if p_installments_json is not null and jsonb_typeof(p_installments_json) <> 'array' then
    raise exception 'Payment installments must be a JSON array';
  end if;
  if p_installments_json is not null and exists (
    select 1 from jsonb_array_elements(p_installments_json) installment, jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) allocation
    where nullif(allocation->>'client_item_key', '') is null
      or not exists (select 1 from jsonb_array_elements(p_items) source where source->>'client_item_key' = allocation->>'client_item_key')
  ) then raise exception 'Payment allocation item does not match a quotation line item'; end if;

  select coalesce(nullif(btrim(staff_name), ''), nullif(btrim(full_name), ''), '') into v_actor_name
  from public.user_profiles where id = auth.uid();
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

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.finance_quotation_items (
      quotation_id, description, quantity, unit_price, amount_before_tax, vat_applicable, vat_rate, vat_amount, line_total, sort_order
    ) values (
      v_quotation_id, btrim(v_item->>'description'), (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric,
      round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2), coalesce((v_item->>'vat_applicable')::boolean, false),
      case when coalesce((v_item->>'vat_applicable')::boolean, false) then coalesce((v_item->>'vat_rate')::numeric, 7) else 0 end,
      case when coalesce((v_item->>'vat_applicable')::boolean, false) then round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * coalesce((v_item->>'vat_rate')::numeric, 7) / 100, 2) else 0 end,
      case when coalesce((v_item->>'vat_applicable')::boolean, false) then round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (1 + coalesce((v_item->>'vat_rate')::numeric, 7) / 100), 2) else round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2) end,
      (v_item->>'sort_order')::integer
    ) returning id into v_item_id;
    v_item_map := v_item_map || jsonb_build_object(v_item->>'client_item_key', v_item_id);
  end loop;

  update public.finance_quotations set
    subtotal_vatable = (select coalesce(sum(amount_before_tax), 0) from public.finance_quotation_items where quotation_id = v_quotation_id and vat_applicable),
    subtotal_non_vatable = (select coalesce(sum(amount_before_tax), 0) from public.finance_quotation_items where quotation_id = v_quotation_id and not vat_applicable),
    vat_amount = (select coalesce(sum(vat_amount), 0) from public.finance_quotation_items where quotation_id = v_quotation_id),
    grand_total = (select coalesce(sum(line_total), 0) from public.finance_quotation_items where quotation_id = v_quotation_id),
    updated_at = now()
  where id = v_quotation_id;

  if p_installments_json is not null then
    select coalesce(jsonb_agg(jsonb_set(installment, '{items}', coalesce((
      select jsonb_agg((allocation - 'client_item_key') || jsonb_build_object('quotation_item_id', v_item_map ->> (allocation->>'client_item_key')) order by allocation_ordinality)
      from jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) with ordinality allocation(allocation, allocation_ordinality)
    ), '[]'::jsonb)) order by installment_ordinality), '[]'::jsonb)
    into v_mapped_installments
    from jsonb_array_elements(p_installments_json) with ordinality source(installment, installment_ordinality);
    perform public.save_finance_quotation_payment_terms_draft(v_quotation_id, p_payment_method_type, p_payment_client_summary, v_mapped_installments);
  end if;
  return query select v_quotation_id, v_quotation_no;
end;
$$;

revoke all on function public.create_finance_quotation_draft_atomic(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) from public, anon;
grant execute on function public.create_finance_quotation_draft_atomic(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) to authenticated;
