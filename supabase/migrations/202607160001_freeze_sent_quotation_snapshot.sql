-- Freeze the client-facing document at Draft -> Sent. This migration is additive
-- and does not rewrite existing quotations or document numbers.

drop policy if exists "finance quotation managers status transition quotations" on public.finance_quotations;

create or replace function public.set_finance_quotation_status(
  p_quotation_id uuid,
  p_next_status text,
  p_cancel_reason text,
  p_user_id uuid,
  p_user_email text,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.finance_quotations%rowtype;
  v_next_status text := lower(trim(coalesce(p_next_status, '')));
  v_item_before numeric(14,2);
  v_item_vat numeric(14,2);
  v_item_total numeric(14,2);
  v_payment public.finance_quotation_payment_terms%rowtype;
  v_client jsonb;
  v_matter jsonb := '{}'::jsonb;
  v_company jsonb := '{}'::jsonb;
  v_signer jsonb := '{}'::jsonb;
  v_items jsonb;
  v_installments jsonb;
  v_snapshot jsonb;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance quotation status';
  end if;

  select * into q
  from public.finance_quotations
  where id = p_quotation_id
  for update;

  if q.id is null then raise exception 'Quotation not found'; end if;
  select coalesce(nullif(btrim(staff_name), ''), nullif(btrim(full_name), ''), '')
    into v_actor_name from public.user_profiles where id = auth.uid();
  if not ((q.status = 'draft' and v_next_status in ('sent', 'cancelled')) or (q.status = 'sent' and v_next_status in ('accepted', 'cancelled'))) then
    raise exception 'Invalid quotation status transition';
  end if;

  if q.status = 'draft' and v_next_status = 'sent' then
    if q.valid_until is not null and q.valid_until < q.issue_date then
      raise exception 'Valid until cannot be before issue date';
    end if;
    if q.case_id is not null and q.advisory_matter_id is not null then
      raise exception 'Select either case or advisory matter, not both';
    end if;

    select jsonb_build_object('id', c.id, 'name', c.name, 'tax_id', c.tax_id, 'address', c.address, 'phone', c.phone, 'email', c.email)
      into v_client from public.clients c where c.id = q.client_id;
    if v_client is null then raise exception 'Quotation client not found'; end if;

    if q.case_id is not null then
      select jsonb_build_object('type', 'case', 'id', c.id, 'file_no', c.file_no, 'title', c.title, 'client_name', c.client_name)
        into v_matter from public.cases c where c.id = q.case_id;
      if v_matter is null then raise exception 'Quotation case not found'; end if;
    elsif q.advisory_matter_id is not null then
      select jsonb_build_object('type', 'advisory_matter', 'id', a.id, 'matter_no', a.matter_no, 'title', a.title)
        into v_matter from public.advisory_matters a where a.id = q.advisory_matter_id;
      if v_matter is null then raise exception 'Quotation advisory matter not found'; end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'quotation_item_id', i.id, 'description', i.description, 'quantity', i.quantity,
      'unit_price', i.unit_price, 'vat_applicable', i.vat_applicable, 'vat_rate', i.vat_rate,
      'amount_before_tax', i.amount_before_tax, 'vat_amount', i.vat_amount,
      'line_total', i.line_total, 'sort_order', i.sort_order
    ) order by i.sort_order, i.id), '[]'::jsonb),
      coalesce(sum(i.amount_before_tax), 0), coalesce(sum(i.vat_amount), 0), coalesce(sum(i.line_total), 0)
    into v_items, v_item_before, v_item_vat, v_item_total
    from public.finance_quotation_items i where i.quotation_id = q.id;

    if jsonb_array_length(v_items) = 0 then raise exception 'Quotation requires at least one item'; end if;
    if exists (select 1 from public.finance_quotation_items i where i.quotation_id = q.id and (
      nullif(btrim(i.description), '') is null or i.quantity <= 0 or i.unit_price < 0 or
      i.amount_before_tax < 0 or i.vat_amount < 0 or i.line_total <> i.amount_before_tax + i.vat_amount or
      (not i.vat_applicable and (i.vat_rate <> 0 or i.vat_amount <> 0))
    )) then raise exception 'Quotation contains invalid line items'; end if;
    if v_item_before <> q.subtotal_vatable + q.subtotal_non_vatable or v_item_vat <> q.vat_amount or v_item_total <> q.grand_total then
      raise exception 'Quotation totals do not reconcile with line items';
    end if;

    select * into v_payment from public.finance_quotation_payment_terms where quotation_id = q.id for update;
    if v_payment.id is null then raise exception 'Payment terms are required'; end if;
    perform public.validate_finance_quotation_payment_terms(q.id, true);
    if v_payment.amount_before_tax <> q.subtotal_vatable + q.subtotal_non_vatable or v_payment.vat_amount <> q.vat_amount or v_payment.total_amount <> q.grand_total then
      raise exception 'Payment terms totals do not reconcile with the quotation';
    end if;

    select jsonb_build_object(
      'company_name_th', p.company_name_th, 'company_name_en', p.company_name_en, 'tax_id', p.tax_id,
      'branch_label', p.branch_label, 'address_th', p.address_th, 'phone', p.phone, 'email', p.email,
      'website', p.website, 'description', p.description, 'quotation_prefix', p.quotation_prefix,
      'logo_storage_path', p.logo_storage_path
    ) into v_company from public.finance_company_profiles p where p.id = 'default';
    v_company := coalesce(v_company, coalesce(q.document_data_snapshot_json->'company_profile', '{}'::jsonb));
    select jsonb_build_object('key', s.signer_key, 'name', s.display_name,
      'position', concat_ws(' / ', nullif(s.position_th, ''), nullif(s.position_en, '')),
      'email', s.email, 'signature_storage_path', s.signature_storage_path)
      into v_signer from public.finance_authorized_signers s where s.signer_key = q.authorized_signer_key;
    v_signer := coalesce(v_signer, jsonb_build_object('key', q.authorized_signer_key, 'name', q.authorized_signer_name, 'position', q.authorized_signer_position, 'email', q.authorized_signer_email));

    select coalesce(jsonb_agg(jsonb_build_object(
      'installment_no', pi.installment_no, 'title', pi.title, 'calculation_type', pi.calculation_type,
      'percentage', pi.percentage, 'trigger_type', pi.trigger_type, 'trigger_description', pi.trigger_description,
      'due_date', pi.due_date, 'payment_due_days', pi.payment_due_days, 'client_note', pi.client_note,
      'amount_before_tax', pi.amount_before_tax, 'vat_amount', pi.vat_amount, 'total_amount', pi.total_amount,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'quotation_item_id', ai.quotation_item_id, 'description_snapshot', qi.description,
        'vat_applicable', qi.vat_applicable, 'vat_rate', qi.vat_rate,
        'allocated_amount_before_tax', ai.allocated_amount_before_tax, 'allocated_vat_amount', ai.allocated_vat_amount,
        'allocated_total', ai.allocated_total
      ) order by ai.sort_order, ai.id) from public.finance_quotation_payment_installment_items ai
        join public.finance_quotation_items qi on qi.id = ai.quotation_item_id where ai.payment_installment_id = pi.id), '[]'::jsonb)
    ) order by pi.installment_no), '[]'::jsonb) into v_installments
    from public.finance_quotation_payment_installments pi where pi.payment_terms_id = v_payment.id;

    v_snapshot := coalesce(q.document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
      'version', 2,
      'quotation', jsonb_build_object('quotation_no', q.quotation_no, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'currency', 'THB', 'status_at_freeze', 'sent'),
      'client', v_client, 'matter', v_matter, 'company', v_company,
      'company_profile', v_company,
      'commercial', jsonb_build_object('scope_of_legal_services', q.scope_of_legal_services, 'included_services', q.included_services, 'excluded_services', q.excluded_services, 'note', q.note, 'authorized_signer', v_signer),
      'authorized_signer', v_signer,
      'items', v_items,
      'totals', jsonb_build_object('subtotal_vatable', q.subtotal_vatable, 'subtotal_non_vatable', q.subtotal_non_vatable, 'vat_amount', q.vat_amount, 'grand_total', q.grand_total),
      'payment_terms', jsonb_build_object('version', v_payment.snapshot_version, 'payment_method_type', v_payment.payment_method_type, 'currency', v_payment.currency, 'client_summary', v_payment.client_summary, 'amount_before_tax', v_payment.amount_before_tax, 'vat_amount', v_payment.vat_amount, 'total_amount', v_payment.total_amount, 'installments', v_installments),
      'frozen_at', now(), 'frozen_by', jsonb_build_object('user_id', auth.uid(), 'email', '', 'name', coalesce(v_actor_name, ''))
    );
  end if;

  -- This SECURITY DEFINER lifecycle RPC bypasses ordinary RLS while FORCE RLS is disabled.
  -- Review this function before enabling FORCE ROW LEVEL SECURITY on finance_quotations.
  update public.finance_quotations set
    status = v_next_status,
    document_data_snapshot_json = case when q.status = 'draft' and v_next_status = 'sent' then v_snapshot else document_data_snapshot_json end,
    sent_at = case when v_next_status = 'sent' then now() else sent_at end,
    sent_by_user_id = case when v_next_status = 'sent' then auth.uid() else sent_by_user_id end,
    accepted_at = case when v_next_status = 'accepted' then now() else accepted_at end,
    accepted_by_user_id = case when v_next_status = 'accepted' then auth.uid() else accepted_by_user_id end,
    cancelled_at = case when v_next_status = 'cancelled' then now() else cancelled_at end,
    cancelled_by_user_id = case when v_next_status = 'cancelled' then auth.uid() else cancelled_by_user_id end,
    cancel_reason = case when v_next_status = 'cancelled' then nullif(trim(coalesce(p_cancel_reason, '')), '') else cancel_reason end,
    updated_by_user_id = auth.uid(), updated_by_email = null, updated_by_name = v_actor_name, updated_at = now()
  where id = q.id;
  return q.id;
end;
$$;

revoke all on function public.set_finance_quotation_status(uuid,text,text,uuid,text,text) from public, anon;
grant execute on function public.set_finance_quotation_status(uuid,text,text,uuid,text,text) to authenticated;

create or replace function public.create_finance_fee_agreement_from_quotation(p_quotation_id uuid)
returns table (fee_agreement_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare q public.finance_quotations%rowtype; v_snapshot jsonb; v_id uuid; v_existing_count integer;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create fee agreement'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can create fee agreements'; end if;
  v_snapshot := q.document_data_snapshot_json;
  if v_snapshot is null or v_snapshot->>'frozen_at' is null or jsonb_typeof(v_snapshot->'items') <> 'array' or jsonb_typeof(v_snapshot->'payment_terms') <> 'object' then
    raise exception 'Accepted quotation has no frozen document snapshot';
  end if;
  select count(*)::integer into v_existing_count from public.finance_fee_agreements where source_type = 'quotation' and source_quotation_id = q.id and status <> 'cancelled';
  if v_existing_count > 1 then raise exception 'Conflicting fee agreements exist for this quotation'; end if;
  select id into v_id from public.finance_fee_agreements where source_type = 'quotation' and source_quotation_id = q.id and status <> 'cancelled' order by created_at, id limit 1 for update;
  if v_id is not null then return query select v_id, false; return; end if;
  insert into public.finance_fee_agreements (title,client_id,case_id,advisory_matter_id,source_type,source_quotation_id,status,effective_date,currency,amount_before_tax,vat_amount,total_amount,billing_method,allocation_method,client_snapshot_json,matter_snapshot_json,company_snapshot_json,commercial_terms_snapshot_json,source_document_snapshot_json,created_by_user_id,updated_by_user_id)
  values (concat('Fee Agreement - ', q.quotation_no),q.client_id,q.case_id,q.advisory_matter_id,'quotation',q.id,'draft',null,'THB',(v_snapshot->'totals'->>'subtotal_vatable')::numeric + (v_snapshot->'totals'->>'subtotal_non_vatable')::numeric,(v_snapshot->'totals'->>'vat_amount')::numeric,(v_snapshot->'totals'->>'grand_total')::numeric,'single',null,v_snapshot->'client',v_snapshot->'matter',v_snapshot->'company',jsonb_build_object('commercial',v_snapshot->'commercial','payment_terms',v_snapshot->'payment_terms'),v_snapshot,auth.uid(),auth.uid()) returning id into v_id;
  insert into public.finance_fee_agreement_items (fee_agreement_id,source_quotation_item_id,description,quantity,unit_price,amount_before_tax,vat_applicable,vat_rate,vat_amount,line_total,sort_order,item_snapshot_json)
  select v_id,(item->>'quotation_item_id')::uuid,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'amount_before_tax')::numeric,coalesce((item->>'vat_applicable')::boolean,false),coalesce((item->>'vat_rate')::numeric,0),(item->>'vat_amount')::numeric,(item->>'line_total')::numeric,coalesce((item->>'sort_order')::integer,0),item || jsonb_build_object('source_quotation_id',q.id,'source_quotation_no',q.quotation_no) from jsonb_array_elements(v_snapshot->'items') item order by coalesce((item->>'sort_order')::integer,0);
  return query select v_id, true;
end;
$$;

revoke all on function public.create_finance_fee_agreement_from_quotation(uuid) from public, anon;
grant execute on function public.create_finance_fee_agreement_from_quotation(uuid) to authenticated;
