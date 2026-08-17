-- Save an existing Quotation Draft, its item tax modes, and Payment Terms atomically.
-- This additive RPC leaves the existing save contracts available during deployment.
create or replace function public.save_finance_quotation_draft_atomic(
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
  p_items jsonb,
  p_payment_method_type text,
  p_payment_client_summary text,
  p_allocation_mode text,
  p_installments_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.finance_quotations%rowtype;
  v_previous_terms public.finance_quotation_payment_terms%rowtype;
  v_had_payment_terms boolean := false;
  v_installment jsonb;
  v_allocation jsonb;
  v_mapped_installments jsonb := '[]'::jsonb;
  v_mapped_items jsonb;
  v_item_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save finance quotation draft';
  end if;

  select quotation.*
    into v_quotation
  from public.finance_quotations quotation
  where quotation.id = p_quotation_id
  for update;

  if v_quotation.id is null then raise exception 'Quotation not found'; end if;
  if v_quotation.status <> 'draft' then raise exception 'Only draft quotations can be edited'; end if;

  if p_payment_method_type is not null then
    if p_allocation_mode not in ('proportional_all_items', 'per_item')
      or p_installments_json is null
      or jsonb_typeof(p_installments_json) <> 'array'
      or jsonb_array_length(p_installments_json) = 0 then
      raise exception 'Invalid payment terms';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(p_installments_json) installment,
        jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) allocation
      where (
        nullif(allocation->>'quotation_item_id', '') is null
        and nullif(allocation->>'client_item_key', '') is null
      ) or (
        nullif(allocation->>'quotation_item_id', '') is not null
        and not exists (
          select 1
          from jsonb_array_elements(p_items) source_item
          where source_item->>'id' = allocation->>'quotation_item_id'
        )
      ) or (
        nullif(allocation->>'quotation_item_id', '') is null
        and not exists (
          select 1
          from jsonb_array_elements(p_items) source_item
          where source_item->>'client_item_key' = allocation->>'client_item_key'
        )
      )
    ) then
      raise exception 'Payment allocation item does not match a quotation line item';
    end if;
  elsif p_installments_json is not null or p_allocation_mode is not null then
    raise exception 'Invalid payment terms';
  end if;

  select payment_terms.*
    into v_previous_terms
  from public.finance_quotation_payment_terms payment_terms
  where payment_terms.quotation_id = p_quotation_id
  for update;
  v_had_payment_terms := v_previous_terms.id is not null;

  -- Existing draft helpers intentionally block changing an item set while allocations
  -- reference it. Remove those transaction-owned rows only inside this transaction,
  -- then rebuild them against the final item IDs before returning.
  if p_payment_method_type is not null and v_had_payment_terms then
    delete from public.finance_quotation_payment_terms payment_terms
    where payment_terms.id = v_previous_terms.id;
  end if;

  perform public.save_finance_quotation_draft_impl(
    p_quotation_id,
    p_client_id,
    p_case_id,
    p_advisory_matter_id,
    p_issue_date,
    p_valid_until,
    p_scope_of_legal_services,
    p_included_services,
    p_excluded_services,
    p_note,
    p_internal_note,
    p_authorized_signer_key,
    p_authorized_signer_name,
    p_authorized_signer_position,
    p_authorized_signer_email,
    p_subtotal_vatable,
    p_subtotal_non_vatable,
    p_vat_amount,
    p_grand_total,
    p_client_snapshot_json,
    p_matter_snapshot_json,
    p_document_data_snapshot_json,
    p_updated_by_user_id,
    p_updated_by_email,
    p_updated_by_name,
    p_items
  );

  perform public.apply_finance_quotation_draft_item_tax_modes(p_quotation_id, p_items);

  update public.finance_quotations quotation
  set document_data_snapshot_json = coalesce(p_document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'totals', jsonb_build_object(
      'subtotalVatable', quotation.subtotal_vatable,
      'subtotalNonVatable', quotation.subtotal_non_vatable,
      'vatAmount', quotation.vat_amount,
      'grandTotal', quotation.grand_total
    )
  )
  where quotation.id = p_quotation_id;

  if p_payment_method_type is not null then
    if v_had_payment_terms then
      insert into public.finance_quotation_payment_terms (
        id,
        quotation_id,
        payment_method_type,
        currency,
        amount_before_tax,
        vat_amount,
        total_amount,
        client_summary,
        snapshot_version,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at,
        allocation_mode
      ) values (
        v_previous_terms.id,
        v_previous_terms.quotation_id,
        v_previous_terms.payment_method_type,
        v_previous_terms.currency,
        v_previous_terms.amount_before_tax,
        v_previous_terms.vat_amount,
        v_previous_terms.total_amount,
        v_previous_terms.client_summary,
        v_previous_terms.snapshot_version,
        v_previous_terms.created_by_user_id,
        v_previous_terms.updated_by_user_id,
        v_previous_terms.created_at,
        v_previous_terms.updated_at,
        v_previous_terms.allocation_mode
      );
    end if;

    for v_installment in
      select value from jsonb_array_elements(p_installments_json)
    loop
      v_mapped_items := '[]'::jsonb;

      for v_allocation in
        select value from jsonb_array_elements(coalesce(v_installment->'items', '[]'::jsonb))
      loop
        v_item_id := null;

        if nullif(v_allocation->>'quotation_item_id', '') is not null then
          select quotation_item.id
            into v_item_id
          from public.finance_quotation_items quotation_item
          where quotation_item.id = (v_allocation->>'quotation_item_id')::uuid
            and quotation_item.quotation_id = p_quotation_id;
        else
          select quotation_item.id
            into v_item_id
          from jsonb_array_elements(p_items) source_item
          join public.finance_quotation_items quotation_item
            on quotation_item.quotation_id = p_quotation_id
           and quotation_item.sort_order = (source_item->>'sort_order')::integer
          where source_item->>'client_item_key' = v_allocation->>'client_item_key';
        end if;

        if v_item_id is null then
          raise exception 'Payment allocation item could not be mapped to a saved quotation item';
        end if;

        v_mapped_items := v_mapped_items || jsonb_build_array(
          (v_allocation - 'client_item_key' - 'quotation_item_id')
          || jsonb_build_object('quotation_item_id', v_item_id)
        );
      end loop;

      v_mapped_installments := v_mapped_installments || jsonb_build_array(
        jsonb_set(v_installment, '{items}', v_mapped_items)
      );
    end loop;

    perform public.save_finance_quotation_payment_terms_draft_v2(
      p_quotation_id,
      p_payment_method_type,
      p_payment_client_summary,
      p_allocation_mode,
      v_mapped_installments
    );
  end if;

  return p_quotation_id;
end;
$$;

revoke all on function public.save_finance_quotation_draft_atomic(
  uuid,uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb,uuid,text,text,jsonb,text,text,text,jsonb
) from public, anon;

grant execute on function public.save_finance_quotation_draft_atomic(
  uuid,uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,jsonb,jsonb,jsonb,uuid,text,text,jsonb,text,text,text,jsonb
) to authenticated;
