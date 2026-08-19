-- Add the legally meaningful Fee Agreement date without rewriting historical records.

alter table public.finance_fee_agreements
  add column if not exists agreement_date date null;

create or replace function public.default_finance_fee_agreement_agreement_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.agreement_date is null then
    new.agreement_date := (now() at time zone 'Asia/Bangkok')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_fee_agreements_default_agreement_date
  on public.finance_fee_agreements;
create trigger finance_fee_agreements_default_agreement_date
before insert on public.finance_fee_agreements
for each row
execute function public.default_finance_fee_agreement_agreement_date();

-- Keep the variable key and bindings stable while correcting its authoritative resolver.
update public.document_variable_definitions
set resolver_key = 'agreement.agreement_date',
    updated_at = now()
where variable_key = 'AGREEMENT_DATE'
  and resolver_key = 'agreement.created_date';

create or replace function public.save_finance_fee_agreement_draft_atomic_impl(
  p_fee_agreement_id uuid,
  p_title text,
  p_agreement_date date,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date,
  p_preserve_agreement_date boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
  v_language text := lower(btrim(coalesce(p_language_code, 'th')));
  v_agreement_date date;
  v_legal_terms jsonb;
  v_signatories jsonb;
  v_custom_clauses jsonb;
  v_template_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save fee agreement';
  end if;

  select *
  into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;
  if v_agreement.status not in ('draft', 'under_review') then
    raise exception 'Only draft or under review fee agreements can be edited';
  end if;
  if v_title = '' then
    raise exception 'Title is required';
  end if;
  if v_billing_method not in ('single', 'installments', 'milestone', 'recurring', 'manual') then
    raise exception 'Invalid billing method';
  end if;
  if p_expiry_date is not null and p_effective_date is not null and p_expiry_date < p_effective_date then
    raise exception 'Expiry date cannot be before effective date';
  end if;
  if v_language not in ('th', 'en') then
    raise exception 'Invalid agreement language';
  end if;
  if p_legal_terms_json is not null and jsonb_typeof(p_legal_terms_json) <> 'object' then
    raise exception 'Legal terms must be an object';
  end if;
  if p_signatories_json is not null and jsonb_typeof(p_signatories_json) <> 'array' then
    raise exception 'Signatories must be an array';
  end if;
  if p_custom_clauses_json is not null and jsonb_typeof(p_custom_clauses_json) <> 'array' then
    raise exception 'Custom clauses must be an array';
  end if;

  v_agreement_date := case
    when coalesce(p_preserve_agreement_date, false) then v_agreement.agreement_date
    else p_agreement_date
  end;
  v_legal_terms := coalesce(p_legal_terms_json, '{}'::jsonb);
  v_signatories := public.normalize_finance_fee_agreement_signatories(coalesce(p_signatories_json, '[]'::jsonb));
  v_custom_clauses := coalesce(p_custom_clauses_json, '[]'::jsonb);

  if p_template_version_id is not null then
    select tv.template_id
    into v_template_id
    from public.document_template_versions as tv
    join public.document_templates as t on t.id = tv.template_id
    where tv.id = p_template_version_id
      and t.document_type = 'fee_agreement'
      and tv.language_code = v_language
      and (
        (p_template_version_id = v_agreement.selected_template_version_id and tv.status in ('published', 'retired'))
        or (
          tv.status = 'published'
          and t.status = 'active'
          and (tv.effective_from is null or tv.effective_from <= current_date)
          and (tv.effective_to is null or tv.effective_to >= current_date)
        )
      );

    if v_template_id is null then
      raise exception 'Selected template version is unavailable for this agreement';
    end if;
  end if;

  if v_agreement.title is not distinct from v_title
    and v_agreement.agreement_date is not distinct from v_agreement_date
    and v_agreement.effective_date is not distinct from p_effective_date
    and v_agreement.expiry_date is not distinct from p_expiry_date
    and v_agreement.billing_method is not distinct from v_billing_method
    and v_agreement.legal_terms_json is not distinct from v_legal_terms
    and v_agreement.signatories_json is not distinct from v_signatories
    and v_agreement.custom_clauses_json is not distinct from v_custom_clauses
    and v_agreement.selected_template_id is not distinct from v_template_id
    and v_agreement.selected_template_version_id is not distinct from p_template_version_id
    and v_agreement.language_code is not distinct from v_language
    and v_agreement.commencement_date is not distinct from p_commencement_date
  then
    return v_agreement.id;
  end if;

  update public.finance_fee_agreements
  set title = v_title,
      agreement_date = v_agreement_date,
      effective_date = p_effective_date,
      expiry_date = p_expiry_date,
      billing_method = v_billing_method,
      legal_terms_json = v_legal_terms,
      signatories_json = v_signatories,
      custom_clauses_json = v_custom_clauses,
      selected_template_id = v_template_id,
      selected_template_version_id = p_template_version_id,
      language_code = v_language,
      commencement_date = p_commencement_date,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    case when v_agreement.status = 'under_review' then 'under_review_saved' else 'draft_saved' end,
    null,
    jsonb_build_object(
      'fields',
      jsonb_build_array(
        'title',
        'agreement_date',
        'effective_date',
        'expiry_date',
        'billing_method',
        'legal_terms',
        'signatories',
        'custom_clauses',
        'template_version',
        'language_code',
        'commencement_date'
      )
    )
  );

  return v_agreement.id;
end;
$$;

-- Compatibility signature for the currently deployed frontend. It preserves agreement_date.
create or replace function public.save_finance_fee_agreement_draft_atomic(
  p_fee_agreement_id uuid,
  p_title text,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.save_finance_fee_agreement_draft_atomic_impl(
    p_fee_agreement_id,
    p_title,
    null,
    p_effective_date,
    p_expiry_date,
    p_billing_method,
    p_legal_terms_json,
    p_signatories_json,
    p_custom_clauses_json,
    p_template_version_id,
    p_language_code,
    p_commencement_date,
    true
  );
$$;

-- New signature. PostgREST resolves it by the additional p_agreement_date argument name.
create or replace function public.save_finance_fee_agreement_draft_atomic(
  p_fee_agreement_id uuid,
  p_title text,
  p_agreement_date date,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.save_finance_fee_agreement_draft_atomic_impl(
    p_fee_agreement_id,
    p_title,
    p_agreement_date,
    p_effective_date,
    p_expiry_date,
    p_billing_method,
    p_legal_terms_json,
    p_signatories_json,
    p_custom_clauses_json,
    p_template_version_id,
    p_language_code,
    p_commencement_date,
    false
  );
$$;

create or replace function public.resolve_finance_fee_agreement_document_variables(
  p_fee_agreement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_client_signer jsonb;
  v_firm_signer jsonb;
  v_value jsonb;
  v_formatted text;
  v_row record;
  v_result jsonb := '[]'::jsonb;
begin
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;

  select signer.value into v_client_signer
  from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) as signer(value)
  where public.finance_fee_agreement_signatory_party_type(signer.value) = 'client'
  limit 1;
  select signer.value into v_firm_signer
  from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) as signer(value)
  where public.finance_fee_agreement_signatory_party_type(signer.value) = 'firm'
  limit 1;

  for v_row in
    select vd.*, bool_or(b.is_required or vd.default_required) as is_required,
      coalesce(
        jsonb_agg(jsonb_build_object('binding_scope', b.binding_scope, 'binding_id', b.binding_id))
          filter (where b.binding_id is not null),
        '[]'::jsonb
      ) as bindings
    from public.document_variable_definitions as vd
    join (
      select tvb.variable_definition_id, tvb.is_required,
        'template_version'::text as binding_scope, tvb.id as binding_id
      from public.document_template_variable_bindings as tvb
      where tvb.template_version_id = v_agreement.selected_template_version_id
      union all
      select cvb.variable_definition_id, cvb.is_required,
        'clause_version'::text, cvb.id
      from public.document_clause_version_variable_bindings as cvb
      join public.document_template_clause_slots as slot on slot.clause_version_id = cvb.clause_version_id
      join public.document_template_sections as sec on sec.id = slot.template_section_id
      left join public.document_template_alternative_groups as grp on grp.id = slot.alternative_group_id
      where sec.template_version_id = v_agreement.selected_template_version_id
        and (
          slot.alternative_group_id is null
          or (
            exists (
              select 1 from public.finance_fee_agreement_clause_slot_selections as selected
              where selected.fee_agreement_id = v_agreement.id
                and selected.alternative_group_id = grp.id
            )
            and exists (
              select 1 from public.finance_fee_agreement_clause_slot_selections as selected
              where selected.fee_agreement_id = v_agreement.id
                and selected.alternative_group_id = grp.id
                and selected.template_slot_id = slot.id
            )
          )
          or (
            not exists (
              select 1 from public.finance_fee_agreement_clause_slot_selections as selected
              where selected.fee_agreement_id = v_agreement.id
                and selected.alternative_group_id = grp.id
            )
            and grp.default_selected_slot_id = slot.id
          )
        )
    ) as b on b.variable_definition_id = vd.id
    where vd.status = 'active'
    group by vd.id
  loop
    v_value := case v_row.resolver_key
      when 'agreement.title' then to_jsonb(v_agreement.title)
      when 'agreement.agreement_no' then to_jsonb(v_agreement.agreement_no)
      when 'agreement.agreement_date' then to_jsonb(v_agreement.agreement_date)
      when 'agreement.created_date' then to_jsonb(v_agreement.agreement_date)
      when 'agreement.effective_date' then to_jsonb(v_agreement.effective_date)
      when 'agreement.commencement_date' then to_jsonb(v_agreement.commencement_date)
      when 'agreement.expiry_date' then to_jsonb(v_agreement.expiry_date)
      when 'client.name' then to_jsonb(coalesce(v_agreement.client_snapshot_json->>'name', v_agreement.client_snapshot_json->>'client_name'))
      when 'client.address' then to_jsonb(coalesce(v_agreement.client_snapshot_json->>'address', v_agreement.client_snapshot_json->>'address_th'))
      when 'client.tax_id' then to_jsonb(v_agreement.client_snapshot_json->>'tax_id')
      when 'company.name' then to_jsonb(coalesce(v_agreement.company_snapshot_json->>'company_name_th', v_agreement.company_snapshot_json->>'name'))
      when 'company.address' then to_jsonb(coalesce(v_agreement.company_snapshot_json->>'address_th', v_agreement.company_snapshot_json->>'address'))
      when 'company.tax_id' then to_jsonb(v_agreement.company_snapshot_json->>'tax_id')
      when 'source.quotation_no' then to_jsonb(coalesce(v_agreement.source_document_snapshot_json->>'quotation_no', v_agreement.source_document_snapshot_json #>> '{quotation,quotation_no}'))
      when 'matter.name' then to_jsonb(coalesce(v_agreement.matter_snapshot_json->>'name', v_agreement.matter_snapshot_json->>'title'))
      when 'matter.service_scope' then to_jsonb(coalesce(v_agreement.legal_terms_json->>'service_scope', v_agreement.matter_snapshot_json->>'service_scope'))
      when 'commercial.subtotal' then to_jsonb(v_agreement.amount_before_tax)
      when 'commercial.vat_amount' then to_jsonb(v_agreement.vat_amount)
      when 'commercial.total' then to_jsonb(v_agreement.total_amount)
      when 'commercial.currency' then to_jsonb(v_agreement.currency)
      when 'commercial.payment_schedule' then coalesce(v_agreement.commercial_terms_snapshot_json->'payment_terms', v_agreement.commercial_terms_snapshot_json->'billing_plan')
      when 'signatories.client_name' then to_jsonb(v_client_signer->>'name')
      when 'signatories.client_title' then to_jsonb(coalesce(v_client_signer->>'title', v_client_signer->>'capacity'))
      when 'signatories.firm_name' then to_jsonb(v_firm_signer->>'name')
      when 'signatories.firm_title' then to_jsonb(coalesce(v_firm_signer->>'title', v_firm_signer->>'capacity'))
      else null
    end;
    v_formatted := case
      when v_value is null or v_value = 'null'::jsonb then null
      when v_row.data_type = 'money' then
        to_char((v_value #>> '{}')::numeric, 'FM999,999,999,999,990.00') || ' ' || coalesce(v_agreement.currency, '')
      when v_row.data_type = 'date' then
        case when v_agreement.language_code = 'th'
          then to_char((v_value #>> '{}')::date, 'DD/MM/YYYY')
          else to_char((v_value #>> '{}')::date, 'YYYY-MM-DD')
        end
      else v_value #>> '{}'
    end;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'variable_key', v_row.variable_key,
      'data_type', v_row.data_type,
      'required', v_row.is_required,
      'resolver_key', v_row.resolver_key,
      'value', v_value,
      'formatted_value', v_formatted,
      'formatting', v_row.formatting_json,
      'locale_behavior', v_row.locale_behavior_json,
      'source_metadata', jsonb_build_object('resolver_key', v_row.resolver_key, 'bindings', v_row.bindings),
      'resolution_result', case when v_value is null or v_value = 'null'::jsonb then 'unresolved' else 'resolved' end
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function public.build_finance_fee_agreement_document_snapshot(
  p_fee_agreement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_template jsonb;
  v_items jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to build fee agreement document snapshot';
  end if;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;

  v_template := public.resolve_finance_fee_agreement_template_content(v_agreement.id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'source_quotation_item_id', i.source_quotation_item_id,
    'description', i.description,
    'quantity', i.quantity,
    'unit_price', i.unit_price,
    'vat_applicable', i.vat_applicable,
    'vat_rate', i.vat_rate,
    'amount_before_tax', i.amount_before_tax,
    'vat_amount', i.vat_amount,
    'line_total', i.line_total,
    'tax_category', i.tax_category,
    'sort_order', i.sort_order,
    'source_item_snapshot', i.item_snapshot_json
  ) order by i.sort_order, i.id), '[]'::jsonb)
  into v_items
  from public.finance_fee_agreement_items as i
  where i.fee_agreement_id = v_agreement.id;

  return jsonb_build_object(
    'schema_version', 3,
    'resolver_schema_version', 3,
    'document_type', 'fee_agreement',
    'agreement', jsonb_build_object(
      'id', v_agreement.id,
      'agreement_no', v_agreement.agreement_no,
      'title', v_agreement.title,
      'status', v_agreement.status,
      'language_code', v_agreement.language_code,
      'agreement_date', v_agreement.agreement_date,
      'effective_date', v_agreement.effective_date,
      'commencement_date', v_agreement.commencement_date,
      'expiry_date', v_agreement.expiry_date,
      'currency', v_agreement.currency,
      'totals', jsonb_build_object(
        'amount_before_tax', v_agreement.amount_before_tax,
        'vat_amount', v_agreement.vat_amount,
        'total_amount', v_agreement.total_amount
      )
    ),
    'source_quotation_snapshot', coalesce(v_agreement.source_document_snapshot_json, '{}'::jsonb),
    'agreement_items', v_items,
    'commercial_terms', coalesce(v_agreement.commercial_terms_snapshot_json, '{}'::jsonb),
    'legal_terms', coalesce(v_agreement.legal_terms_json, '{}'::jsonb),
    'signatories', coalesce(v_agreement.signatories_json, '[]'::jsonb),
    'custom_clauses', coalesce(v_agreement.custom_clauses_json, '[]'::jsonb),
    'template', v_template,
    'source_snapshots', jsonb_build_object(
      'client', coalesce(v_agreement.client_snapshot_json, '{}'::jsonb),
      'matter', coalesce(v_agreement.matter_snapshot_json, '{}'::jsonb),
      'company', coalesce(v_agreement.company_snapshot_json, '{}'::jsonb)
    )
  );
end;
$$;

create or replace function public.set_finance_fee_agreement_status(
  p_fee_agreement_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status, '')));
  v_event text;
  v_retired boolean;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance fee agreement status';
  end if;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if not (
    (v_agreement.status = 'draft' and v_next in ('under_review', 'cancelled'))
    or (v_agreement.status = 'under_review' and v_next in ('sent', 'cancelled'))
    or (v_agreement.status = 'sent' and v_next in ('signed', 'cancelled'))
    or (v_agreement.status = 'signed' and v_next = 'completed')
    or (v_agreement.status = 'draft' and v_next = 'active')
    or (v_agreement.status = 'active' and v_next in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid finance fee agreement status transition';
  end if;
  if v_next in ('under_review', 'sent', 'active')
    and (v_agreement.source_document_snapshot_json is null or v_agreement.commercial_terms_snapshot_json is null)
  then
    raise exception 'Fee agreement source evidence is required';
  end if;
  if v_next = 'sent' and v_agreement.agreement_date is null then
    raise exception 'กรุณาระบุวันที่ทำสัญญาก่อนส่งเอกสาร';
  end if;
  if v_next = 'sent'
    and (v_agreement.agreement_no is null or v_agreement.legal_terms_json is null or v_agreement.signatories_json is null)
  then
    raise exception 'Fee agreement legal document data is not ready';
  end if;
  if v_next = 'sent' and v_agreement.selected_template_version_id is not null then
    perform public.validate_finance_fee_agreement_template_ready(v_agreement.id);
    select tv.status = 'retired' or t.status = 'retired'
    into v_retired
    from public.document_template_versions as tv
    join public.document_templates as t on t.id = tv.template_id
    where tv.id = v_agreement.selected_template_version_id;
    if coalesce(v_retired, false)
      and (
        v_agreement.retired_template_use_approved_version_id is distinct from v_agreement.selected_template_version_id
        or v_agreement.retired_template_use_approved_by_user_id is null
        or nullif(btrim(coalesce(v_agreement.retired_template_use_reason, '')), '') is null
      )
    then
      raise exception 'Partner approval is required before sending an agreement that uses a retired template version';
    end if;
  end if;
  if v_next = 'cancelled'
    and exists (
      select 1 from public.finance_billing_plans
      where fee_agreement_id = v_agreement.id
        and status <> 'cancelled'
    )
  then
    raise exception 'Cancel the Billing Plan before cancelling this agreement';
  end if;

  update public.finance_fee_agreements
  set status = v_next,
      sent_at = case when v_next = 'sent' then now() else sent_at end,
      sent_by_user_id = case when v_next = 'sent' then auth.uid() else sent_by_user_id end,
      signed_at = case when v_next = 'signed' then now() else signed_at end,
      signed_by_user_id = case when v_next = 'signed' then auth.uid() else signed_by_user_id end,
      cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end,
      cancelled_by_user_id = case when v_next = 'cancelled' then auth.uid() else cancelled_by_user_id end,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  v_event := v_next;
  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    v_event,
    null,
    jsonb_build_object('from_status', v_agreement.status, 'to_status', v_next)
  );
  return v_agreement.id;
end;
$$;

revoke all on function public.default_finance_fee_agreement_agreement_date() from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic_impl(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date, boolean) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_document_variables(uuid) from public, anon, authenticated;
revoke all on function public.build_finance_fee_agreement_document_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.set_finance_fee_agreement_status(uuid, text) from public, anon, authenticated;

grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid, text) to authenticated;

comment on column public.finance_fee_agreements.agreement_date is
  'Legal/document date stated in the Fee Agreement; distinct from creation, effective, and service commencement dates.';
