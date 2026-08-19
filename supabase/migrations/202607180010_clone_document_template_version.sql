-- Add an authoritative, transaction-safe way to clone a Published Template version.
-- The source remains immutable; the clone starts as an uncertified Draft.

create or replace function public.clone_document_template_version(
  p_source_template_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.document_template_versions%rowtype;
  v_template public.document_templates%rowtype;
  v_existing_draft_id uuid;
  v_new_version_id uuid;
  v_new_version_no integer;
  v_new_section_id uuid;
  v_new_group_id uuid;
  v_new_slot_id uuid;
  v_mapped_parent_id uuid;
  v_mapped_group_id uuid;
  v_mapped_default_slot_id uuid;
  v_section_map jsonb := '{}'::jsonb;
  v_group_map jsonb := '{}'::jsonb;
  v_slot_map jsonb := '{}'::jsonb;
  v_section public.document_template_sections%rowtype;
  v_group public.document_template_alternative_groups%rowtype;
  v_slot public.document_template_clause_slots%rowtype;
  v_binding public.document_template_variable_bindings%rowtype;
  v_source_section_count integer;
  v_source_group_count integer;
  v_source_slot_count integer;
  v_source_binding_count integer;
begin
  if auth.uid() is null or not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to clone document template versions';
  end if;

  select tv.*
  into v_source
  from public.document_template_versions as tv
  where tv.id = p_source_template_version_id
  for share;

  if v_source.id is null then
    raise exception 'Source template version not found';
  end if;
  if v_source.status <> 'published' then
    raise exception 'Only Published template versions can be cloned';
  end if;

  -- This family lock serializes version-number allocation with the existing
  -- save_document_template_version_draft creation path.
  select t.*
  into v_template
  from public.document_templates as t
  where t.id = v_source.template_id
  for update;

  if v_template.id is null or v_template.status = 'retired' then
    raise exception 'Document template family is unavailable';
  end if;

  select tv.id
  into v_existing_draft_id
  from public.document_template_versions as tv
  where tv.template_id = v_source.template_id
    and tv.language_code = v_source.language_code
    and tv.status = 'draft'
    and tv.previous_version_id = v_source.id
    and tv.supersedes_version_id = v_source.id
  order by tv.version_no desc
  limit 1;

  -- Idempotent retry protection: return the same clone without overwriting it.
  if v_existing_draft_id is not null then
    return v_existing_draft_id;
  end if;

  if exists (
    select 1
    from public.document_template_versions as tv
    where tv.template_id = v_source.template_id
      and tv.language_code = v_source.language_code
      and tv.version_no > v_source.version_no
  ) then
    raise exception 'Only the latest Template version can be used as a clone source';
  end if;

  if exists (
    select 1
    from public.document_template_versions as tv
    where tv.template_id = v_source.template_id
      and tv.language_code = v_source.language_code
      and tv.status = 'draft'
  ) then
    raise exception 'Another Draft already exists for this template and language';
  end if;

  select coalesce(max(tv.version_no), 0) + 1
  into v_new_version_no
  from public.document_template_versions as tv
  where tv.template_id = v_source.template_id
    and tv.language_code = v_source.language_code;

  insert into public.document_template_versions (
    template_id,
    version_no,
    language_code,
    definition_json,
    status,
    effective_from,
    effective_to,
    previous_version_id,
    supersedes_version_id,
    change_summary_json,
    condition_rule_json,
    signature_requirements_json,
    renderer_schema_version,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_source.template_id,
    v_new_version_no,
    v_source.language_code,
    coalesce(v_source.definition_json, '{}'::jsonb)
      || jsonb_build_object('inactive_shell', true, 'legal_wording_approved', false),
    'draft',
    v_source.effective_from,
    v_source.effective_to,
    v_source.id,
    v_source.id,
    coalesce(v_source.change_summary_json, '{}'::jsonb),
    v_source.condition_rule_json,
    v_source.signature_requirements_json,
    v_source.renderer_schema_version,
    auth.uid(),
    auth.uid()
  )
  returning id into v_new_version_id;

  -- Parents are cloned before children so hierarchy validation remains active.
  for v_section in
    select sec.*
    from public.document_template_sections as sec
    where sec.template_version_id = v_source.id
    order by sec.numbering_depth, sec.sort_order, sec.id
  loop
    v_mapped_parent_id := null;
    if v_section.parent_section_id is not null then
      v_mapped_parent_id := nullif(v_section_map ->> v_section.parent_section_id::text, '')::uuid;
      if v_mapped_parent_id is null then
        raise exception 'Unable to map parent section while cloning Template version';
      end if;
    end if;

    insert into public.document_template_sections (
      template_version_id, section_code, title, sort_order, parent_section_id,
      display_number, display_label, numbering_style, numbering_depth, section_kind,
      condition_rule_json, is_required, allow_custom_after, risk_level, metadata_json,
      created_by_user_id, updated_by_user_id
    )
    values (
      v_new_version_id, v_section.section_code, v_section.title, v_section.sort_order,
      v_mapped_parent_id, v_section.display_number, v_section.display_label,
      v_section.numbering_style, v_section.numbering_depth, v_section.section_kind,
      v_section.condition_rule_json, v_section.is_required, v_section.allow_custom_after,
      v_section.risk_level, v_section.metadata_json, auth.uid(), auth.uid()
    )
    returning id into v_new_section_id;

    v_section_map := v_section_map
      || jsonb_build_object(v_section.id::text, v_new_section_id::text);
  end loop;

  -- Alternative groups must exist before alternative slots can reference them.
  -- Default slot references are restored after all slots have been cloned.
  for v_group in
    select grp.*
    from public.document_template_alternative_groups as grp
    where grp.template_version_id = v_source.id
    order by grp.sort_order, grp.id
  loop
    insert into public.document_template_alternative_groups (
      template_version_id, group_code, title, minimum_selection, maximum_selection,
      selection_required, default_selected_slot_id, condition_rule_json, risk_level,
      sort_order, metadata_json, created_by_user_id, updated_by_user_id
    )
    values (
      v_new_version_id, v_group.group_code, v_group.title, v_group.minimum_selection,
      v_group.maximum_selection, v_group.selection_required, null,
      v_group.condition_rule_json, v_group.risk_level, v_group.sort_order,
      v_group.metadata_json, auth.uid(), auth.uid()
    )
    returning id into v_new_group_id;

    v_group_map := v_group_map
      || jsonb_build_object(v_group.id::text, v_new_group_id::text);
  end loop;

  for v_slot in
    select slot.*
    from public.document_template_clause_slots as slot
    join public.document_template_sections as sec on sec.id = slot.template_section_id
    where sec.template_version_id = v_source.id
    order by sec.sort_order, slot.numbering_depth, slot.sort_order, slot.id
  loop
    v_new_section_id := nullif(v_section_map ->> v_slot.template_section_id::text, '')::uuid;
    if v_new_section_id is null then
      raise exception 'Unable to map Template section while cloning clause slot';
    end if;

    v_mapped_parent_id := null;
    if v_slot.parent_slot_id is not null then
      v_mapped_parent_id := nullif(v_slot_map ->> v_slot.parent_slot_id::text, '')::uuid;
      if v_mapped_parent_id is null then
        raise exception 'Unable to map parent clause slot while cloning Template version';
      end if;
    end if;

    v_mapped_group_id := null;
    if v_slot.alternative_group_id is not null then
      v_mapped_group_id := nullif(v_group_map ->> v_slot.alternative_group_id::text, '')::uuid;
      if v_mapped_group_id is null then
        raise exception 'Unable to map alternative group while cloning Template version';
      end if;
    end if;

    insert into public.document_template_clause_slots (
      template_section_id, slot_code, clause_version_id, sort_order, parent_slot_id,
      display_number, display_label, numbering_style, numbering_depth, clause_type,
      alternative_group_id, condition_rule_json, is_required, allow_override,
      allow_suppress, allow_custom_after, risk_level, metadata_json,
      created_by_user_id, updated_by_user_id
    )
    values (
      v_new_section_id, v_slot.slot_code, v_slot.clause_version_id, v_slot.sort_order,
      v_mapped_parent_id, v_slot.display_number, v_slot.display_label,
      v_slot.numbering_style, v_slot.numbering_depth, v_slot.clause_type,
      v_mapped_group_id, v_slot.condition_rule_json, v_slot.is_required,
      v_slot.allow_override, v_slot.allow_suppress, v_slot.allow_custom_after,
      v_slot.risk_level, v_slot.metadata_json, auth.uid(), auth.uid()
    )
    returning id into v_new_slot_id;

    v_slot_map := v_slot_map
      || jsonb_build_object(v_slot.id::text, v_new_slot_id::text);
  end loop;

  for v_group in
    select grp.*
    from public.document_template_alternative_groups as grp
    where grp.template_version_id = v_source.id
      and grp.default_selected_slot_id is not null
    order by grp.sort_order, grp.id
  loop
    v_new_group_id := nullif(v_group_map ->> v_group.id::text, '')::uuid;
    v_mapped_default_slot_id := nullif(v_slot_map ->> v_group.default_selected_slot_id::text, '')::uuid;
    if v_new_group_id is null or v_mapped_default_slot_id is null then
      raise exception 'Unable to map default alternative selection while cloning Template version';
    end if;

    update public.document_template_alternative_groups as grp
    set default_selected_slot_id = v_mapped_default_slot_id,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where grp.id = v_new_group_id;
  end loop;

  for v_binding in
    select binding.*
    from public.document_template_variable_bindings as binding
    where binding.template_version_id = v_source.id
    order by binding.variable_definition_id, binding.id
  loop
    insert into public.document_template_variable_bindings (
      template_version_id, variable_definition_id, is_required,
      formatting_override_json, fallback_override, metadata_json,
      created_by_user_id, updated_by_user_id
    )
    values (
      v_new_version_id, v_binding.variable_definition_id, v_binding.is_required,
      v_binding.formatting_override_json, v_binding.fallback_override,
      v_binding.metadata_json, auth.uid(), auth.uid()
    );
  end loop;

  select count(*) into v_source_section_count
  from public.document_template_sections as sec
  where sec.template_version_id = v_source.id;
  select count(*) into v_source_group_count
  from public.document_template_alternative_groups as grp
  where grp.template_version_id = v_source.id;
  select count(*) into v_source_slot_count
  from public.document_template_clause_slots as slot
  join public.document_template_sections as sec on sec.id = slot.template_section_id
  where sec.template_version_id = v_source.id;
  select count(*) into v_source_binding_count
  from public.document_template_variable_bindings as binding
  where binding.template_version_id = v_source.id;

  if (select count(*) from public.document_template_sections as sec where sec.template_version_id = v_new_version_id) <> v_source_section_count
     or (select count(*) from public.document_template_alternative_groups as grp where grp.template_version_id = v_new_version_id) <> v_source_group_count
     or (select count(*) from public.document_template_clause_slots as slot join public.document_template_sections as sec on sec.id = slot.template_section_id where sec.template_version_id = v_new_version_id) <> v_source_slot_count
     or (select count(*) from public.document_template_variable_bindings as binding where binding.template_version_id = v_new_version_id) <> v_source_binding_count then
    raise exception 'Template version clone verification failed';
  end if;

  perform public.document_platform_audit(
    'template_version',
    v_new_version_id,
    'created_draft',
    jsonb_build_object(
      'source_template_version_id', v_source.id,
      'source_version_no', v_source.version_no,
      'new_version_no', v_new_version_no,
      'sections', v_source_section_count,
      'slots', v_source_slot_count,
      'alternative_groups', v_source_group_count,
      'variable_bindings', v_source_binding_count,
      'readiness_certification_reset', true
    )
  );

  return v_new_version_id;
end;
$$;

comment on function public.clone_document_template_version(uuid) is
  'Clones one Published Template version and its normalized structure into one uncertified Draft in the same family. Repeated calls return the existing source-lineage Draft without overwriting it.';

revoke all on function public.clone_document_template_version(uuid) from public, anon, authenticated;
grant execute on function public.clone_document_template_version(uuid) to authenticated;
