-- Complete the renderer-v3 foundation without changing existing template slots or snapshots.

create or replace function public.finance_fee_agreement_signatory_party_type(p_signatory jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(lower(btrim(coalesce(
    p_signatory->>'party_type',
    p_signatory->>'party',
    p_signatory->>'side',
    ''
  ))), '');
$$;

create or replace function public.normalize_finance_fee_agreement_signatories(p_signatories jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_signatories is null then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_signatories) <> 'array' then
    raise exception 'Signatories must be an array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_signatories) as signer(value)
    where coalesce(public.finance_fee_agreement_signatory_party_type(signer.value), '')
      not in ('client', 'firm', 'witness')
  ) then
    raise exception 'Each signatory requires an approved party type';
  end if;

  select coalesce(
    jsonb_agg(
      (signer.value - 'party' - 'side')
      || jsonb_build_object(
        'party_type',
        public.finance_fee_agreement_signatory_party_type(signer.value)
      )
      order by signer.ordinality
    ),
    '[]'::jsonb
  )
  into v_result
  from jsonb_array_elements(p_signatories) with ordinality as signer(value, ordinality);

  return v_result;
end;
$$;

-- PREAMBLE is renderer-generated. Bind its structured inputs at template-version scope.
insert into public.document_template_variable_bindings (
  template_version_id,
  variable_definition_id,
  is_required,
  metadata_json
)
select
  tv.id,
  variable.id,
  variable.default_required,
  jsonb_build_object(
    'renderer_section', 'PREAMBLE',
    'seed_source', 'VP-FA-LEGAL-SERVICES-v1'
  )
from public.document_template_versions as tv
join public.document_templates as template on template.id = tv.template_id
join public.document_variable_definitions as variable on variable.variable_key in (
  'AGREEMENT_TITLE',
  'AGREEMENT_NO',
  'AGREEMENT_DATE',
  'EFFECTIVE_DATE',
  'CLIENT_NAME',
  'CLIENT_ADDRESS',
  'CLIENT_TAX_ID',
  'CLIENT_SIGNATORY_NAME',
  'CLIENT_SIGNATORY_TITLE',
  'LAW_FIRM_NAME',
  'LAW_FIRM_ADDRESS',
  'LAW_FIRM_TAX_ID',
  'LAW_FIRM_SIGNATORY_NAME',
  'LAW_FIRM_SIGNATORY_TITLE',
  'SOURCE_QUOTATION_NO',
  'MATTER_NAME'
)
where template.document_type = 'fee_agreement'
  and template.template_code = 'VP-FA-LEGAL-SERVICES'
  and tv.version_no = 1
  and tv.language_code = 'th'
  and tv.status = 'draft'
on conflict (template_version_id, variable_definition_id) do nothing;

-- Keep the deployed RPC signature. Old clients may still send party/side; all new saves are canonicalized.
create or replace function public.save_finance_fee_agreement_draft_legal_terms(
  p_fee_agreement_id uuid, p_legal_terms_json jsonb, p_signatories_json jsonb,
  p_custom_clauses_json jsonb, p_template_version_id uuid, p_language_code text,
  p_commencement_date date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_template_id uuid;
  v_language text := lower(btrim(coalesce(p_language_code, 'th')));
  v_signatories jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save fee agreement legal terms'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.status not in ('draft', 'under_review') then raise exception 'Only draft or under review fee agreements can be edited'; end if;
  if v_language not in ('th', 'en') then raise exception 'Invalid agreement language'; end if;
  if p_legal_terms_json is not null and jsonb_typeof(p_legal_terms_json) <> 'object' then raise exception 'Legal terms must be an object'; end if;
  if p_signatories_json is not null and jsonb_typeof(p_signatories_json) <> 'array' then raise exception 'Signatories must be an array'; end if;
  if p_custom_clauses_json is not null and jsonb_typeof(p_custom_clauses_json) <> 'array' then raise exception 'Custom clauses must be an array'; end if;
  v_signatories := public.normalize_finance_fee_agreement_signatories(coalesce(p_signatories_json, '[]'::jsonb));

  if p_template_version_id is not null then
    select tv.template_id into v_template_id
    from public.document_template_versions tv
    join public.document_templates t on t.id = tv.template_id
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
    if v_template_id is null then raise exception 'Selected template version is unavailable for this agreement'; end if;
  end if;

  update public.finance_fee_agreements
  set legal_terms_json = coalesce(p_legal_terms_json, '{}'::jsonb),
      signatories_json = v_signatories,
      custom_clauses_json = coalesce(p_custom_clauses_json, '[]'::jsonb),
      selected_template_id = v_template_id,
      selected_template_version_id = p_template_version_id,
      language_code = v_language,
      commencement_date = p_commencement_date,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;
  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    case when v_agreement.status = 'under_review' then 'under_review_legal_terms_saved' else 'draft_legal_terms_saved' end,
    null,
    jsonb_build_object('fields', jsonb_build_array('legal_terms', 'signatories', 'custom_clauses', 'template_version', 'language_code', 'commencement_date'))
  );
  return v_agreement.id;
end;
$$;

create or replace function public.resolve_finance_fee_agreement_condition_facts(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template_code text; v_client_count integer; v_firm_count integer; v_witness_count integer;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  select t.template_code into v_template_code from public.document_template_versions tv join public.document_templates t on t.id = tv.template_id where tv.id = v_agreement.selected_template_version_id;
  select
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'client'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'firm'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'witness')
  into v_client_count, v_firm_count, v_witness_count
  from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb));
  return jsonb_build_object(
    'document', jsonb_build_object('language', v_agreement.language_code, 'service_type', coalesce(v_agreement.commercial_terms_snapshot_json->>'service_type', v_agreement.billing_method), 'has_end_date', v_agreement.expiry_date is not null),
    'commercial', jsonb_build_object('currency', v_agreement.currency, 'subtotal', v_agreement.amount_before_tax, 'vat_amount', v_agreement.vat_amount, 'total', v_agreement.total_amount, 'has_vat', coalesce(v_agreement.vat_amount, 0) > 0, 'installment_count', coalesce(jsonb_array_length(coalesce(v_agreement.commercial_terms_snapshot_json->'installments', '[]'::jsonb)), 0)),
    'signatures', jsonb_build_object('client_signer_count', v_client_count, 'firm_signer_count', v_firm_count, 'witness_count', v_witness_count, 'witness_required', false),
    'template', jsonb_build_object('code', v_template_code, 'language', v_agreement.language_code),
    'matter', jsonb_build_object('type', coalesce(v_agreement.matter_snapshot_json->>'type', ''))
  );
end;
$$;

create or replace function public.resolve_finance_fee_agreement_document_variables(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_client_signer jsonb; v_firm_signer jsonb; v_value jsonb; v_formatted text;
  v_row record; v_result jsonb := '[]'::jsonb;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  select value into v_client_signer from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) where public.finance_fee_agreement_signatory_party_type(value) = 'client' limit 1;
  select value into v_firm_signer from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) where public.finance_fee_agreement_signatory_party_type(value) = 'firm' limit 1;
  for v_row in
    select vd.*, bool_or(b.is_required or vd.default_required) as is_required,
      coalesce(jsonb_agg(jsonb_build_object('binding_scope', b.binding_scope, 'binding_id', b.binding_id)) filter (where b.binding_id is not null), '[]'::jsonb) as bindings
    from public.document_variable_definitions vd
    join (
      select tvb.variable_definition_id, tvb.is_required, 'template_version'::text as binding_scope, tvb.id as binding_id
      from public.document_template_variable_bindings tvb where tvb.template_version_id = v_agreement.selected_template_version_id
      union all
      select cvb.variable_definition_id, cvb.is_required, 'clause_version'::text, cvb.id
      from public.document_clause_version_variable_bindings cvb
      join public.document_template_clause_slots slot on slot.clause_version_id = cvb.clause_version_id
      join public.document_template_sections sec on sec.id = slot.template_section_id
      left join public.document_template_alternative_groups grp on grp.id = slot.alternative_group_id
      where sec.template_version_id = v_agreement.selected_template_version_id
        and (
          slot.alternative_group_id is null
          or (exists (select 1 from public.finance_fee_agreement_clause_slot_selections selected where selected.fee_agreement_id = v_agreement.id and selected.alternative_group_id = grp.id)
              and exists (select 1 from public.finance_fee_agreement_clause_slot_selections selected where selected.fee_agreement_id = v_agreement.id and selected.alternative_group_id = grp.id and selected.template_slot_id = slot.id))
          or (not exists (select 1 from public.finance_fee_agreement_clause_slot_selections selected where selected.fee_agreement_id = v_agreement.id and selected.alternative_group_id = grp.id)
              and grp.default_selected_slot_id = slot.id)
        )
    ) b on b.variable_definition_id = vd.id
    where vd.status = 'active'
    group by vd.id
  loop
    v_value := case v_row.resolver_key
      when 'agreement.title' then to_jsonb(v_agreement.title)
      when 'agreement.agreement_no' then to_jsonb(v_agreement.agreement_no)
      when 'agreement.created_date' then to_jsonb(v_agreement.created_at::date)
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
      when v_row.data_type = 'money' then to_char((v_value #>> '{}')::numeric, 'FM999,999,999,999,990.00') || ' ' || coalesce(v_agreement.currency, '')
      when v_row.data_type = 'date' then case when v_agreement.language_code = 'th' then to_char((v_value #>> '{}')::date, 'DD/MM/YYYY') else to_char((v_value #>> '{}')::date, 'YYYY-MM-DD') end
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

create or replace function public.validate_finance_fee_agreement_template_ready(p_fee_agreement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_requirements jsonb; v_variables jsonb; v_group record; v_selected_count integer; v_client_count integer; v_firm_count integer; v_witness_count integer;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.selected_template_version_id is null then return; end if;
  select signature_requirements_json into v_requirements from public.document_template_versions where id = v_agreement.selected_template_version_id;
  perform public.validate_document_signature_requirements(v_requirements);
  select
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'client'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'firm'),
    count(*) filter (where public.finance_fee_agreement_signatory_party_type(value) = 'witness')
  into v_client_count, v_firm_count, v_witness_count
  from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb));
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) as signer(value)
    where nullif(btrim(coalesce(signer.value->>'name', signer.value->>'display_name', '')), '') is null
      or coalesce(public.finance_fee_agreement_signatory_party_type(signer.value), '') not in ('client', 'firm', 'witness')
  ) then raise exception 'Each signatory requires a name and approved party type'; end if;
  if v_client_count < coalesce((v_requirements->>'minimum_client_signers')::integer, 0) or v_firm_count < coalesce((v_requirements->>'minimum_firm_signers')::integer, 0) or v_witness_count < coalesce((v_requirements->>'minimum_witnesses')::integer, 0) then raise exception 'Fee agreement does not meet the selected template signature requirements'; end if;
  v_variables := public.resolve_finance_fee_agreement_document_variables(v_agreement.id);
  if exists (select 1 from jsonb_array_elements(v_variables) variable where coalesce((variable->>'required')::boolean, false) and variable->>'resolution_result' <> 'resolved') then raise exception 'Required document variables remain unresolved'; end if;
  for v_group in select * from public.document_template_alternative_groups where template_version_id = v_agreement.selected_template_version_id loop
    select count(*) into v_selected_count from public.finance_fee_agreement_clause_slot_selections s where s.fee_agreement_id = v_agreement.id and s.alternative_group_id = v_group.id;
    if v_selected_count = 0 and v_group.default_selected_slot_id is not null then v_selected_count := 1; end if;
    if v_selected_count < v_group.minimum_selection or v_selected_count > v_group.maximum_selection then raise exception 'Alternative clause selection count is invalid for group %', v_group.group_code; end if;
  end loop;
end;
$$;

create or replace function public.get_finance_fee_agreement_template_preview(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to preview fee agreement template content';
  end if;
  if not exists (
    select 1
    from public.finance_fee_agreements
    where id = p_fee_agreement_id
      and status in ('draft', 'under_review')
  ) then
    raise exception 'Only draft or under review template content can be previewed live';
  end if;
  return public.resolve_finance_fee_agreement_template_content(p_fee_agreement_id);
end;
$$;

-- Publication is authoritative at the database layer; inactive shells cannot be bypassed by direct RPC calls.
create or replace function public.set_document_template_version_status(p_template_version_id uuid, p_next_status text, p_approval_note text default null, p_approval_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_version public.document_template_versions%rowtype; v_template public.document_templates%rowtype; v_next text := lower(btrim(coalesce(p_next_status, ''))); v_hash text; v_structure_hash text; v_normalized_text_hash text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update template version status'; end if;
  select * into v_version from public.document_template_versions where id = p_template_version_id for update;
  if v_version.id is null then raise exception 'Template version not found'; end if;
  select * into v_template from public.document_templates where id = v_version.template_id for update;
  if not ((v_version.status = 'draft' and v_next = 'under_review') or (v_version.status = 'under_review' and v_next in ('draft', 'published')) or (v_version.status = 'published' and v_next = 'retired')) then raise exception 'Invalid template version status transition'; end if;
  if v_next in ('published', 'retired') and not public.current_user_is_document_platform_partner() then raise exception 'Only an Admin or Partner can publish or retire template versions'; end if;
  if v_next = 'published' then
    if coalesce(v_template.metadata_json->>'inactive_shell', 'false') = 'true'
       or coalesce(v_version.definition_json->>'inactive_shell', 'false') = 'true' then
      raise exception 'Inactive template shells cannot be published';
    end if;
    if coalesce(v_template.metadata_json->>'legal_wording_approved', 'false') <> 'true'
       or coalesce(v_version.definition_json->>'legal_wording_approved', 'false') <> 'true' then
      raise exception 'Approved legal wording is required before publication';
    end if;
    perform public.validate_document_condition_rule(v_version.condition_rule_json);
    perform public.validate_document_signature_requirements(v_version.signature_requirements_json);
    if v_version.definition_json ? 'clause_version_ids' and exists (select 1 from public.document_template_sections where template_version_id = v_version.id) then raise exception 'New normalized template versions must not also define clause_version_ids in definition_json'; end if;
    if not exists (select 1 from public.document_template_sections where template_version_id = v_version.id) or exists (select 1 from public.document_template_clause_slots s join public.document_template_sections sec on sec.id = s.template_section_id left join public.document_clause_versions cv on cv.id = s.clause_version_id where sec.template_version_id = v_version.id and (s.clause_version_id is null or cv.status <> 'published' or cv.language_code <> v_version.language_code)) then raise exception 'Template version structure requires published, language-matched clause versions'; end if;
    if exists (select 1 from public.document_template_alternative_groups g left join public.document_template_clause_slots s on s.id = g.default_selected_slot_id where g.template_version_id = v_version.id and (g.default_selected_slot_id is not null and (s.id is null or s.alternative_group_id <> g.id))) then raise exception 'Alternative group default selections must be slots in their own group'; end if;
    if exists (select 1 from public.document_template_variable_bindings b join public.document_variable_definitions v on v.id = b.variable_definition_id where b.template_version_id = v_version.id and (v.status <> 'active' or not (v.allowed_document_types ? 'fee_agreement'))) then raise exception 'Template variable bindings must use active variables approved for fee agreements'; end if;
    v_hash := public.compute_document_template_version_content_hash(v_version.id);
    v_structure_hash := public.compute_document_template_version_structure_hash(v_version.id);
    v_normalized_text_hash := public.compute_document_template_version_normalized_text_hash(v_version.id);
    update public.document_templates set status = 'active', updated_by_user_id = auth.uid(), updated_at = now() where id = v_version.template_id and status <> 'retired';
  end if;
  update public.document_template_versions set status = v_next, reviewed_by_user_id = case when v_next = 'published' then auth.uid() else reviewed_by_user_id end, reviewed_at = case when v_next = 'published' then now() else reviewed_at end, published_by_user_id = case when v_next = 'published' then auth.uid() else published_by_user_id end, published_at = case when v_next = 'published' then now() else published_at end, retired_by_user_id = case when v_next = 'retired' then auth.uid() else retired_by_user_id end, retired_at = case when v_next = 'retired' then now() else retired_at end, approval_note = case when v_next in ('published', 'retired') then nullif(btrim(coalesce(p_approval_note, '')), '') else approval_note end, approval_reference = case when v_next in ('published', 'retired') then nullif(btrim(coalesce(p_approval_reference, '')), '') else approval_reference end, content_hash = case when v_next = 'published' then v_hash else content_hash end, structure_hash = case when v_next = 'published' then v_structure_hash else structure_hash end, normalized_text_hash = case when v_next = 'published' then v_normalized_text_hash else normalized_text_hash end, updated_by_user_id = auth.uid(), updated_at = now() where id = v_version.id;
  perform public.document_platform_audit('template_version', v_version.id, v_next, jsonb_build_object('approval_note', nullif(btrim(coalesce(p_approval_note, '')), ''), 'approval_reference', nullif(btrim(coalesce(p_approval_reference, '')), '')));
  return v_version.id;
end;
$$;

comment on function public.finance_fee_agreement_signatory_party_type(jsonb) is
  'Reads the canonical Fee Agreement signer party type with party and side compatibility fallbacks.';
comment on function public.normalize_finance_fee_agreement_signatories(jsonb) is
  'Normalizes new Fee Agreement signer writes to party_type without rewriting historical snapshots.';

revoke all on function public.finance_fee_agreement_signatory_party_type(jsonb) from public, anon, authenticated;
revoke all on function public.normalize_finance_fee_agreement_signatories(jsonb) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_condition_facts(uuid) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_document_variables(uuid) from public, anon, authenticated;
revoke all on function public.validate_finance_fee_agreement_template_ready(uuid) from public, anon, authenticated;
revoke all on function public.get_finance_fee_agreement_template_preview(uuid) from public, anon;
revoke all on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) from public, anon;
revoke all on function public.set_document_template_version_status(uuid, text, text, text) from public, anon;

grant execute on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.get_finance_fee_agreement_template_preview(uuid) to authenticated;
grant execute on function public.set_document_template_version_status(uuid, text, text, text) to authenticated;
