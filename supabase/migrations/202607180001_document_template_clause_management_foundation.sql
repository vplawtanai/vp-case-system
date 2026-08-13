-- Milestone 3A: operational Fee Agreement template and clause-management foundation.
-- Additive only. This migration does not seed operative legal wording or alter legacy agreements.

create extension if not exists pgcrypto;

create table if not exists public.document_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.document_template_versions(id) on delete restrict,
  section_code text not null,
  title text not null,
  sort_order integer not null,
  parent_section_id uuid null references public.document_template_sections(id) on delete restrict,
  display_number text null,
  display_label text null,
  numbering_style text not null default 'explicit',
  numbering_depth integer not null default 1,
  section_kind text not null default 'normal',
  condition_rule_json jsonb null,
  is_required boolean not null default true,
  allow_custom_after boolean not null default false,
  risk_level text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_sections_code_unique unique (template_version_id, section_code),
  constraint document_template_sections_order_unique unique (template_version_id, sort_order),
  constraint document_template_sections_sort_order_check check (sort_order > 0),
  constraint document_template_sections_numbering_style_check check (numbering_style in ('explicit', 'decimal', 'roman', 'thai_clause', 'thai_appendix', 'none')),
  constraint document_template_sections_numbering_depth_check check (numbering_depth between 0 and 8),
  constraint document_template_sections_kind_check check (section_kind in ('normal', 'preamble', 'schedule', 'appendix', 'execution')),
  constraint document_template_sections_risk_check check (risk_level is null or risk_level in ('low', 'medium', 'high', 'critical', 'informational'))
);

create table if not exists public.document_template_clause_slots (
  id uuid primary key default gen_random_uuid(),
  template_section_id uuid not null references public.document_template_sections(id) on delete restrict,
  slot_code text not null,
  clause_version_id uuid null references public.document_clause_versions(id) on delete restrict,
  sort_order integer not null,
  parent_slot_id uuid null references public.document_template_clause_slots(id) on delete restrict,
  display_number text null,
  display_label text null,
  numbering_style text not null default 'explicit',
  numbering_depth integer not null default 1,
  clause_type text not null default 'mandatory',
  condition_rule_json jsonb null,
  is_required boolean not null default true,
  allow_override boolean not null default false,
  allow_suppress boolean not null default false,
  allow_custom_after boolean not null default false,
  risk_level text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_clause_slots_code_unique unique (template_section_id, slot_code),
  constraint document_template_clause_slots_order_unique unique (template_section_id, sort_order),
  constraint document_template_clause_slots_sort_order_check check (sort_order > 0),
  constraint document_template_clause_slots_numbering_style_check check (numbering_style in ('explicit', 'decimal', 'roman', 'thai_clause', 'thai_appendix', 'none')),
  constraint document_template_clause_slots_numbering_depth_check check (numbering_depth between 0 and 8),
  constraint document_template_clause_slots_type_check check (clause_type in ('mandatory', 'optional', 'alternative', 'placeholder', 'conditional')),
  constraint document_template_clause_slots_risk_check check (risk_level is null or risk_level in ('low', 'medium', 'high', 'critical', 'informational')),
  constraint document_template_clause_slots_suppress_check check (not allow_suppress or not is_required)
);

create table if not exists public.document_template_alternative_groups (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.document_template_versions(id) on delete restrict,
  group_code text not null,
  title text not null,
  minimum_selection integer not null default 0,
  maximum_selection integer not null default 1,
  selection_required boolean not null default false,
  default_selected_slot_id uuid null references public.document_template_clause_slots(id) on delete set null,
  condition_rule_json jsonb null,
  risk_level text null,
  sort_order integer not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_alternative_groups_code_unique unique (template_version_id, group_code),
  constraint document_template_alternative_groups_order_unique unique (template_version_id, sort_order),
  constraint document_template_alternative_groups_selection_check check (minimum_selection >= 0 and maximum_selection >= minimum_selection and maximum_selection > 0),
  constraint document_template_alternative_groups_required_check check (not selection_required or minimum_selection > 0),
  constraint document_template_alternative_groups_risk_check check (risk_level is null or risk_level in ('low', 'medium', 'high', 'critical', 'informational'))
);

alter table public.document_template_clause_slots
  add column if not exists alternative_group_id uuid null references public.document_template_alternative_groups(id) on delete restrict;

create table if not exists public.document_variable_definitions (
  id uuid primary key default gen_random_uuid(),
  variable_key text not null unique,
  display_name_th text not null,
  display_name_en text not null,
  data_type text not null,
  resolver_key text not null,
  allowed_document_types jsonb not null default '[]'::jsonb,
  default_required boolean not null default false,
  formatting_json jsonb not null default '{}'::jsonb,
  locale_behavior_json jsonb not null default '{}'::jsonb,
  fallback_policy text not null default 'unresolved',
  sensitivity_level text not null default 'internal',
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_variable_definitions_key_check check (variable_key ~ '^[A-Z][A-Z0-9_]*$'),
  constraint document_variable_definitions_type_check check (data_type in ('text', 'number', 'money', 'date', 'party', 'address', 'boolean', 'list', 'rich_text')),
  constraint document_variable_definitions_fallback_check check (fallback_policy in ('unresolved', 'empty', 'dash', 'default_value')),
  constraint document_variable_definitions_sensitivity_check check (sensitivity_level in ('public', 'internal', 'confidential', 'restricted')),
  constraint document_variable_definitions_status_check check (status in ('active', 'retired')),
  constraint document_variable_definitions_allowed_types_check check (jsonb_typeof(allowed_document_types) = 'array')
);

create table if not exists public.document_template_variable_bindings (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.document_template_versions(id) on delete restrict,
  variable_definition_id uuid not null references public.document_variable_definitions(id) on delete restrict,
  is_required boolean not null default false,
  formatting_override_json jsonb null,
  fallback_override text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_variable_bindings_unique unique (template_version_id, variable_definition_id),
  constraint document_template_variable_bindings_fallback_check check (fallback_override is null or fallback_override in ('unresolved', 'empty', 'dash', 'default_value'))
);

create table if not exists public.document_clause_version_variable_bindings (
  id uuid primary key default gen_random_uuid(),
  clause_version_id uuid not null references public.document_clause_versions(id) on delete restrict,
  variable_definition_id uuid not null references public.document_variable_definitions(id) on delete restrict,
  is_required boolean not null default false,
  formatting_override_json jsonb null,
  fallback_override text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_clause_version_variable_bindings_unique unique (clause_version_id, variable_definition_id),
  constraint document_clause_version_variable_bindings_fallback_check check (fallback_override is null or fallback_override in ('unresolved', 'empty', 'dash', 'default_value'))
);

create table if not exists public.finance_fee_agreement_clause_slot_selections (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  alternative_group_id uuid not null references public.document_template_alternative_groups(id) on delete restrict,
  template_slot_id uuid not null references public.document_template_clause_slots(id) on delete restrict,
  source_clause_version_id uuid not null references public.document_clause_versions(id) on delete restrict,
  was_default boolean not null default false,
  reason text null,
  status text not null default 'selected',
  provenance_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_agreement_clause_slot_selections_unique unique (fee_agreement_id, alternative_group_id, template_slot_id),
  constraint finance_fee_agreement_clause_slot_selections_status_check check (status = 'selected')
);

create table if not exists public.finance_fee_agreement_clause_overrides (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  template_slot_id uuid not null references public.document_template_clause_slots(id) on delete restrict,
  source_clause_version_id uuid not null references public.document_clause_versions(id) on delete restrict,
  action text not null,
  replacement_title text null,
  replacement_content text null,
  reason text not null,
  risk_metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_agreement_clause_overrides_unique unique (fee_agreement_id, template_slot_id),
  constraint finance_fee_agreement_clause_overrides_action_check check (action in ('replace', 'suppress')),
  constraint finance_fee_agreement_clause_overrides_replace_check check (
    (action = 'replace' and btrim(coalesce(replacement_title, '')) <> '' and btrim(coalesce(replacement_content, '')) <> '')
    or (action = 'suppress' and replacement_title is null and replacement_content is null)
  ),
  constraint finance_fee_agreement_clause_overrides_reason_check check (btrim(reason) <> '')
);

create table if not exists public.finance_fee_agreement_custom_clauses (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  template_section_id uuid not null references public.document_template_sections(id) on delete restrict,
  anchor_template_slot_id uuid null references public.document_template_clause_slots(id) on delete restrict,
  title text not null,
  content text not null,
  sort_order integer not null,
  reason text null,
  risk_metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_agreement_custom_clauses_order_unique unique (fee_agreement_id, template_section_id, sort_order),
  constraint finance_fee_agreement_custom_clauses_sort_order_check check (sort_order > 0),
  constraint finance_fee_agreement_custom_clauses_title_check check (btrim(title) <> ''),
  constraint finance_fee_agreement_custom_clauses_content_check check (btrim(content) <> '')
);

create table if not exists public.document_template_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint document_template_audit_events_entity_type_check check (entity_type in ('template', 'template_version', 'template_section', 'template_slot', 'alternative_group', 'template_variable_binding', 'variable_definition', 'clause_family', 'clause_version', 'clause_variable_binding', 'template_structure', 'agreement_override', 'agreement_custom_clause', 'agreement_alternative_selection'))
);

alter table public.document_template_versions
  add column if not exists reviewed_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists published_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists published_at timestamptz null,
  add column if not exists retired_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists retired_at timestamptz null,
  add column if not exists approval_note text null,
  add column if not exists approval_reference text null,
  add column if not exists content_hash text null,
  add column if not exists structure_hash text null,
  add column if not exists normalized_text_hash text null,
  add column if not exists previous_version_id uuid null references public.document_template_versions(id) on delete restrict,
  add column if not exists supersedes_version_id uuid null references public.document_template_versions(id) on delete restrict,
  add column if not exists change_summary_json jsonb not null default '{}'::jsonb,
  add column if not exists condition_rule_json jsonb null,
  add column if not exists signature_requirements_json jsonb not null default '{"minimum_client_signers":0,"minimum_firm_signers":0,"minimum_witnesses":0,"witness_required":false,"signing_order_required":false,"allowed_party_types":["client","firm","witness"],"signature_block_style":"standard"}'::jsonb,
  add column if not exists renderer_schema_version integer not null default 1,
  add column if not exists updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.document_template_versions
  drop constraint if exists document_template_versions_status_check;
alter table public.document_template_versions
  add constraint document_template_versions_status_check check (status in ('draft', 'under_review', 'published', 'retired'));
alter table public.document_template_versions
  drop constraint if exists document_template_versions_renderer_schema_check,
  drop constraint if exists document_template_versions_signature_requirements_check,
  drop constraint if exists document_template_versions_change_summary_check;
alter table public.document_template_versions
  add constraint document_template_versions_renderer_schema_check check (renderer_schema_version between 1 and 100),
  add constraint document_template_versions_signature_requirements_check check (jsonb_typeof(signature_requirements_json) = 'object'),
  add constraint document_template_versions_change_summary_check check (jsonb_typeof(change_summary_json) = 'object');

alter table public.document_clause_versions
  add column if not exists status text not null default 'draft',
  add column if not exists reviewed_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists published_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists published_at timestamptz null,
  add column if not exists retired_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists retired_at timestamptz null,
  add column if not exists approval_note text null,
  add column if not exists approval_reference text null,
  add column if not exists content_hash text null,
  add column if not exists normalized_text_hash text null,
  add column if not exists previous_version_id uuid null references public.document_clause_versions(id) on delete restrict,
  add column if not exists supersedes_version_id uuid null references public.document_clause_versions(id) on delete restrict,
  add column if not exists change_summary_json jsonb not null default '{}'::jsonb,
  add column if not exists content_format text not null default 'plain_text',
  add column if not exists updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.document_clause_versions
  drop constraint if exists document_clause_versions_status_check;
alter table public.document_clause_versions
  add constraint document_clause_versions_status_check check (status in ('draft', 'under_review', 'published', 'retired'));
alter table public.document_clause_versions
  drop constraint if exists document_clause_versions_content_format_check,
  drop constraint if exists document_clause_versions_change_summary_check;
alter table public.document_clause_versions
  add constraint document_clause_versions_content_format_check check (content_format in ('plain_text', 'rich_text', 'structured_blocks')),
  add constraint document_clause_versions_change_summary_check check (jsonb_typeof(change_summary_json) = 'object');

alter table public.finance_fee_agreements
  add column if not exists retired_template_use_approved_version_id uuid null references public.document_template_versions(id) on delete restrict,
  add column if not exists retired_template_use_approved_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists retired_template_use_approved_at timestamptz null,
  add column if not exists retired_template_use_reason text null;

create index if not exists idx_document_template_sections_template_version on public.document_template_sections(template_version_id, sort_order);
create index if not exists idx_document_template_sections_parent on public.document_template_sections(template_version_id, parent_section_id, sort_order);
create index if not exists idx_document_template_clause_slots_section on public.document_template_clause_slots(template_section_id, sort_order);
create index if not exists idx_document_template_clause_slots_parent on public.document_template_clause_slots(template_section_id, parent_slot_id, sort_order);
create index if not exists idx_document_template_clause_slots_clause_version on public.document_template_clause_slots(clause_version_id);
create index if not exists idx_document_template_clause_slots_alternative_group on public.document_template_clause_slots(alternative_group_id);
create index if not exists idx_document_template_alternative_groups_version on public.document_template_alternative_groups(template_version_id, sort_order);
create index if not exists idx_template_variable_bindings_version on public.document_template_variable_bindings(template_version_id);
create index if not exists idx_clause_variable_bindings_version on public.document_clause_version_variable_bindings(clause_version_id);
create index if not exists idx_fee_agreement_slot_selections_agreement on public.finance_fee_agreement_clause_slot_selections(fee_agreement_id, alternative_group_id);
create index if not exists idx_fee_agreement_clause_overrides_agreement on public.finance_fee_agreement_clause_overrides(fee_agreement_id);
create index if not exists idx_fee_agreement_custom_clauses_agreement on public.finance_fee_agreement_custom_clauses(fee_agreement_id, template_section_id, sort_order);
create index if not exists idx_document_template_audit_events_entity on public.document_template_audit_events(entity_type, entity_id, created_at desc);

create or replace function public.document_platform_content_hash(p_value jsonb)
returns text language sql immutable set search_path = public as $$
  select encode(extensions.digest(convert_to(coalesce(p_value, '{}'::jsonb)::text, 'utf8'), 'sha256'), 'hex');
$$;

create or replace function public.document_condition_fact_type(p_fact_key text)
returns text language sql immutable set search_path = public as $$
  select case p_fact_key
    when 'document.language' then 'text'
    when 'document.service_type' then 'text'
    when 'document.has_end_date' then 'boolean'
    when 'commercial.currency' then 'text'
    when 'commercial.subtotal' then 'number'
    when 'commercial.vat_amount' then 'number'
    when 'commercial.total' then 'number'
    when 'commercial.has_vat' then 'boolean'
    when 'commercial.installment_count' then 'number'
    when 'signatures.client_signer_count' then 'number'
    when 'signatures.firm_signer_count' then 'number'
    when 'signatures.witness_count' then 'number'
    when 'signatures.witness_required' then 'boolean'
    when 'template.code' then 'text'
    when 'template.language' then 'text'
    when 'matter.type' then 'text'
    else null
  end;
$$;

create or replace function public.validate_document_condition_rule(p_rule jsonb, p_depth integer default 0)
returns void language plpgsql security definer set search_path = public as $$
declare v_operator text; v_fact text; v_fact_type text; v_child jsonb; v_value jsonb;
begin
  if p_rule is null then return; end if;
  if p_depth > 8 then raise exception 'Condition nesting exceeds the maximum depth'; end if;
  if jsonb_typeof(p_rule) <> 'object' then raise exception 'Condition rule must be an object'; end if;
  v_operator := lower(btrim(coalesce(p_rule->>'op', '')));
  if v_operator not in ('equals', 'not_equals', 'exists', 'not_exists', 'greater_than', 'less_than', 'in', 'all', 'any', 'not') then
    raise exception 'Condition operator is not approved';
  end if;
  if v_operator in ('all', 'any') then
    if jsonb_typeof(p_rule->'rules') <> 'array' or jsonb_array_length(p_rule->'rules') = 0 then raise exception 'Compound condition requires a non-empty rules array'; end if;
    for v_child in select value from jsonb_array_elements(p_rule->'rules') loop
      perform public.validate_document_condition_rule(v_child, p_depth + 1);
    end loop;
    return;
  end if;
  if v_operator = 'not' then
    if jsonb_typeof(p_rule->'rule') <> 'object' then raise exception 'Not condition requires a rule object'; end if;
    perform public.validate_document_condition_rule(p_rule->'rule', p_depth + 1);
    return;
  end if;
  v_fact := p_rule->>'fact';
  v_fact_type := public.document_condition_fact_type(v_fact);
  if v_fact_type is null then raise exception 'Condition fact is not approved'; end if;
  if v_operator in ('exists', 'not_exists') then return; end if;
  if not (p_rule ? 'value') then raise exception 'Condition value is required'; end if;
  v_value := p_rule->'value';
  if v_operator = 'in' then
    if jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) = 0 then raise exception 'In condition requires a non-empty value array'; end if;
    return;
  end if;
  if v_fact_type = 'number' and jsonb_typeof(v_value) <> 'number' then raise exception 'Numeric condition facts require a numeric value'; end if;
  if v_fact_type = 'boolean' and jsonb_typeof(v_value) <> 'boolean' then raise exception 'Boolean condition facts require a boolean value'; end if;
  if v_fact_type = 'text' and jsonb_typeof(v_value) <> 'string' then raise exception 'Text condition facts require a string value'; end if;
end;
$$;

create or replace function public.validate_document_signature_requirements(p_requirements jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_party text;
begin
  if jsonb_typeof(p_requirements) <> 'object' then raise exception 'Signature requirements must be an object'; end if;
  if coalesce((p_requirements->>'minimum_client_signers')::integer, -1) < 0
     or coalesce((p_requirements->>'minimum_firm_signers')::integer, -1) < 0
     or coalesce((p_requirements->>'minimum_witnesses')::integer, -1) < 0 then
    raise exception 'Signature minimums must be non-negative integers';
  end if;
  if jsonb_typeof(p_requirements->'witness_required') <> 'boolean'
     or jsonb_typeof(p_requirements->'signing_order_required') <> 'boolean'
     or jsonb_typeof(p_requirements->'allowed_party_types') <> 'array' then
    raise exception 'Signature requirements have an invalid shape';
  end if;
  for v_party in select value from jsonb_array_elements_text(p_requirements->'allowed_party_types') loop
    if v_party not in ('client', 'firm', 'witness') then raise exception 'Signature party type is not approved'; end if;
  end loop;
  if coalesce((p_requirements->>'witness_required')::boolean, false)
     and coalesce((p_requirements->>'minimum_witnesses')::integer, 0) < 1 then
    raise exception 'Witness-required templates need at least one witness';
  end if;
end;
$$;

create or replace function public.resolve_finance_fee_agreement_condition_facts(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template_code text; v_client_count integer; v_firm_count integer; v_witness_count integer;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  select t.template_code into v_template_code from public.document_template_versions tv join public.document_templates t on t.id = tv.template_id where tv.id = v_agreement.selected_template_version_id;
  select count(*) filter (where value->>'party_type' = 'client'), count(*) filter (where value->>'party_type' = 'firm'), count(*) filter (where value->>'party_type' = 'witness') into v_client_count, v_firm_count, v_witness_count from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb));
  return jsonb_build_object(
    'document', jsonb_build_object('language', v_agreement.language_code, 'service_type', coalesce(v_agreement.commercial_terms_snapshot_json->>'service_type', v_agreement.billing_method), 'has_end_date', v_agreement.expiry_date is not null),
    'commercial', jsonb_build_object('currency', v_agreement.currency, 'subtotal', v_agreement.amount_before_tax, 'vat_amount', v_agreement.vat_amount, 'total', v_agreement.total_amount, 'has_vat', coalesce(v_agreement.vat_amount, 0) > 0, 'installment_count', coalesce(jsonb_array_length(coalesce(v_agreement.commercial_terms_snapshot_json->'installments', '[]'::jsonb)), 0)),
    'signatures', jsonb_build_object('client_signer_count', v_client_count, 'firm_signer_count', v_firm_count, 'witness_count', v_witness_count, 'witness_required', false),
    'template', jsonb_build_object('code', v_template_code, 'language', v_agreement.language_code),
    'matter', jsonb_build_object('type', coalesce(v_agreement.matter_snapshot_json->>'type', ''))
  );
end;
$$;

create or replace function public.evaluate_document_condition_rule(p_rule jsonb, p_facts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_operator text; v_fact text; v_fact_value jsonb; v_expected jsonb; v_result boolean; v_children jsonb;
begin
  if p_rule is null then return jsonb_build_object('condition', null, 'facts_used', '[]'::jsonb, 'result', true); end if;
  v_operator := lower(p_rule->>'op');
  if v_operator in ('all', 'any') then
    select coalesce(jsonb_agg(public.evaluate_document_condition_rule(value, p_facts)), '[]'::jsonb) into v_children from jsonb_array_elements(p_rule->'rules');
    select case when v_operator = 'all' then bool_and((value->>'result')::boolean) else bool_or((value->>'result')::boolean) end into v_result from jsonb_array_elements(v_children);
    return jsonb_build_object('condition', p_rule, 'facts_used', coalesce((select jsonb_agg(value->'facts_used') from jsonb_array_elements(v_children)), '[]'::jsonb), 'children', v_children, 'result', coalesce(v_result, false));
  end if;
  if v_operator = 'not' then
    v_children := public.evaluate_document_condition_rule(p_rule->'rule', p_facts);
    return jsonb_build_object('condition', p_rule, 'facts_used', v_children->'facts_used', 'children', jsonb_build_array(v_children), 'result', not coalesce((v_children->>'result')::boolean, false));
  end if;
  v_fact := p_rule->>'fact';
  v_fact_value := p_facts #> string_to_array(v_fact, '.');
  v_expected := p_rule->'value';
  v_result := case v_operator
    when 'exists' then v_fact_value is not null and v_fact_value <> 'null'::jsonb and v_fact_value <> '""'::jsonb
    when 'not_exists' then v_fact_value is null or v_fact_value = 'null'::jsonb or v_fact_value = '""'::jsonb
    when 'equals' then v_fact_value = v_expected
    when 'not_equals' then v_fact_value is distinct from v_expected
    when 'greater_than' then (v_fact_value #>> '{}')::numeric > (v_expected #>> '{}')::numeric
    when 'less_than' then (v_fact_value #>> '{}')::numeric < (v_expected #>> '{}')::numeric
    when 'in' then exists (select 1 from jsonb_array_elements(v_expected) candidate where candidate = v_fact_value)
    else false
  end;
  return jsonb_build_object('condition', p_rule, 'facts_used', jsonb_build_array(jsonb_build_object('key', v_fact, 'value', v_fact_value)), 'result', coalesce(v_result, false));
end;
$$;

create or replace function public.current_user_is_document_platform_partner()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'partner');
$$;

create or replace function public.document_platform_audit(
  p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata_json jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_email text;
begin
  select coalesce(nullif(btrim(staff_name), ''), nullif(btrim(full_name), ''), email), email into v_name, v_email
  from public.user_profiles where id = auth.uid();
  insert into public.document_template_audit_events(entity_type, entity_id, event_type, metadata_json, actor_user_id, actor_email, actor_name)
  values (p_entity_type, p_entity_id, p_event_type, coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), v_email, v_name);
end;
$$;

create or replace function public.document_template_version_is_draft(p_template_version_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.document_template_versions where id = p_template_version_id and status = 'draft');
$$;

create or replace function public.enforce_document_template_structure_mutability()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_template_version_id uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'document_template_sections' then
      v_template_version_id := old.template_version_id;
    else
      select s.template_version_id into v_template_version_id
      from public.document_template_sections s
      where s.id = old.template_section_id;
    end if;
  elsif tg_table_name = 'document_template_sections' then
    v_template_version_id := new.template_version_id;
  else
    select s.template_version_id into v_template_version_id
    from public.document_template_sections s
    where s.id = new.template_section_id;
  end if;
  if not public.document_template_version_is_draft(v_template_version_id) then
    raise exception 'Template sections and slots can only be changed while the template version is draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_document_template_version_child_mutability()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_template_version_id uuid;
begin
  if tg_table_name = 'document_template_alternative_groups' then
    v_template_version_id := case when tg_op = 'DELETE' then old.template_version_id else new.template_version_id end;
  else
    v_template_version_id := case when tg_op = 'DELETE' then old.template_version_id else new.template_version_id end;
  end if;
  if not public.document_template_version_is_draft(v_template_version_id) then raise exception 'Template version children can only be changed while draft'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_document_clause_version_binding_mutability()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_clause_version_id uuid; v_status text;
begin
  v_clause_version_id := case when tg_op = 'DELETE' then old.clause_version_id else new.clause_version_id end;
  select status into v_status from public.document_clause_versions where id = v_clause_version_id;
  if v_status <> 'draft' then raise exception 'Clause variable bindings can only be changed while the clause version is draft'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_document_variable_definition_key_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.variable_key is distinct from old.variable_key and (
    exists (select 1 from public.document_template_variable_bindings where variable_definition_id = old.id)
    or exists (select 1 from public.document_clause_version_variable_bindings where variable_definition_id = old.id)
  ) then raise exception 'Variable keys are immutable after use'; end if;
  if tg_op = 'DELETE' and (
    exists (select 1 from public.document_template_variable_bindings where variable_definition_id = old.id)
    or exists (select 1 from public.document_clause_version_variable_bindings where variable_definition_id = old.id)
  ) then raise exception 'Used variable definitions cannot be deleted; retire them instead'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.validate_document_template_section()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_parent public.document_template_sections%rowtype;
begin
  perform public.validate_document_condition_rule(new.condition_rule_json);
  if new.parent_section_id is not null then
    select * into v_parent from public.document_template_sections where id = new.parent_section_id;
    if v_parent.id is null or v_parent.template_version_id <> new.template_version_id then raise exception 'Section parent must belong to the same template version'; end if;
    if new.id = new.parent_section_id then raise exception 'A section cannot be its own parent'; end if;
    if new.numbering_depth <> v_parent.numbering_depth + 1 then raise exception 'Section numbering depth must follow its parent'; end if;
    if exists (
      with recursive ancestors(id, parent_section_id) as (
        select s.id, s.parent_section_id from public.document_template_sections s where s.id = new.parent_section_id
        union all
        select s.id, s.parent_section_id from public.document_template_sections s join ancestors a on s.id = a.parent_section_id
      ) select 1 from ancestors where id = new.id
    ) then raise exception 'Section hierarchy cannot contain a cycle'; end if;
  elsif new.numbering_style <> 'none' and new.numbering_depth <> 1 then
    raise exception 'Top-level numbered sections must have numbering depth 1';
  end if;
  if new.display_number is not null and exists (
    select 1 from public.document_template_sections s
    where s.template_version_id = new.template_version_id
      and s.parent_section_id is not distinct from new.parent_section_id
      and s.display_number = new.display_number
      and s.id <> new.id
  ) then raise exception 'Sibling sections cannot share a display number'; end if;
  return new;
end;
$$;

create or replace function public.validate_document_template_clause_slot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_language text; v_status text; v_clause_language text; v_clause_status text; v_parent public.document_template_clause_slots%rowtype; v_group public.document_template_alternative_groups%rowtype; v_section_version_id uuid;
begin
  select tv.language_code, tv.status into v_language, v_status
  from public.document_template_sections s join public.document_template_versions tv on tv.id = s.template_version_id
  where s.id = new.template_section_id;
  if v_status is null then raise exception 'Template section not found'; end if;
  if new.clause_version_id is null and v_status <> 'draft' then raise exception 'Published template slots require a clause version'; end if;
  if new.clause_version_id is not null then
    select language_code, status into v_clause_language, v_clause_status from public.document_clause_versions where id = new.clause_version_id;
    if v_clause_language is null or v_clause_language <> v_language then raise exception 'Template slot clause language must match the template version language'; end if;
    if v_status in ('under_review', 'published') and v_clause_status <> 'published' then raise exception 'Reviewed or published template slots require published clause versions'; end if;
  end if;
  if new.is_required and new.allow_suppress then raise exception 'Required template slots cannot allow suppression'; end if;
  if new.parent_slot_id is not null then
    select * into v_parent from public.document_template_clause_slots where id = new.parent_slot_id;
    if v_parent.id is null or v_parent.template_section_id <> new.template_section_id then raise exception 'Slot parent must belong to the same section'; end if;
    if new.id = new.parent_slot_id then raise exception 'A slot cannot be its own parent'; end if;
    if new.numbering_depth <> v_parent.numbering_depth + 1 then raise exception 'Slot numbering depth must follow its parent'; end if;
    if exists (
      with recursive ancestors(id, parent_slot_id) as (
        select s.id, s.parent_slot_id from public.document_template_clause_slots s where s.id = new.parent_slot_id
        union all
        select s.id, s.parent_slot_id from public.document_template_clause_slots s join ancestors a on s.id = a.parent_slot_id
      ) select 1 from ancestors where id = new.id
    ) then raise exception 'Slot hierarchy cannot contain a cycle'; end if;
  elsif new.numbering_style <> 'none' and new.numbering_depth <> 1 then
    raise exception 'Top-level numbered slots must have numbering depth 1';
  end if;
  if new.display_number is not null and exists (
    select 1 from public.document_template_clause_slots s
    where s.template_section_id = new.template_section_id
      and s.parent_slot_id is not distinct from new.parent_slot_id
      and s.display_number = new.display_number
      and s.id <> new.id
  ) then raise exception 'Sibling slots cannot share a display number'; end if;
  if new.clause_type = 'alternative' and new.alternative_group_id is null then raise exception 'Alternative slots require an alternative group'; end if;
  if new.clause_type <> 'alternative' and new.alternative_group_id is not null then raise exception 'Only alternative slots may belong to an alternative group'; end if;
  if new.alternative_group_id is not null then
    select g.* into v_group from public.document_template_alternative_groups g where g.id = new.alternative_group_id;
    select s.template_version_id into v_section_version_id from public.document_template_sections s where s.id = new.template_section_id;
    if v_group.id is null or v_group.template_version_id <> v_section_version_id then raise exception 'Alternative group must belong to the same template version'; end if;
  end if;
  perform public.validate_document_condition_rule(new.condition_rule_json);
  return new;
end;
$$;

create or replace function public.validate_document_template_alternative_group()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_slot_version_id uuid;
begin
  perform public.validate_document_condition_rule(new.condition_rule_json);
  if new.default_selected_slot_id is not null then
    select sec.template_version_id into v_slot_version_id
    from public.document_template_clause_slots slot
    join public.document_template_sections sec on sec.id = slot.template_section_id
    where slot.id = new.default_selected_slot_id;
    if v_slot_version_id is distinct from new.template_version_id then raise exception 'Alternative default slot must belong to the same template version'; end if;
    if exists (select 1 from public.document_template_clause_slots slot where slot.id = new.default_selected_slot_id and slot.alternative_group_id is not null and slot.alternative_group_id <> new.id) then raise exception 'Alternative default slot belongs to another group'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_document_template_version_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.status in ('published', 'retired') then raise exception 'Published or retired template versions cannot be deleted'; end if;
  if tg_op = 'UPDATE' and old.status in ('published', 'retired') then
    if new.template_id is distinct from old.template_id
       or new.version_no is distinct from old.version_no
       or new.language_code is distinct from old.language_code
       or new.definition_json is distinct from old.definition_json
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.content_hash is distinct from old.content_hash
       or new.structure_hash is distinct from old.structure_hash
       or new.normalized_text_hash is distinct from old.normalized_text_hash
       or new.change_summary_json is distinct from old.change_summary_json
       or new.condition_rule_json is distinct from old.condition_rule_json
       or new.signature_requirements_json is distinct from old.signature_requirements_json
       or new.renderer_schema_version is distinct from old.renderer_schema_version
       or new.previous_version_id is distinct from old.previous_version_id
       or new.supersedes_version_id is distinct from old.supersedes_version_id
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Published or retired template version content is immutable; create a new version';
    end if;
    if old.status = 'published' and new.status not in ('published', 'retired') then raise exception 'Published template versions can only be retired'; end if;
    if old.status = 'retired' and new.status is distinct from old.status then raise exception 'Retired template versions cannot be reactivated'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.enforce_document_clause_version_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.status in ('published', 'retired') then raise exception 'Published or retired clause versions cannot be deleted'; end if;
  if tg_op = 'UPDATE' and old.status in ('published', 'retired') then
    if new.clause_id is distinct from old.clause_id
       or new.version_no is distinct from old.version_no
       or new.language_code is distinct from old.language_code
       or new.title is distinct from old.title
       or new.content is distinct from old.content
       or new.metadata_json is distinct from old.metadata_json
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.content_hash is distinct from old.content_hash
       or new.normalized_text_hash is distinct from old.normalized_text_hash
       or new.change_summary_json is distinct from old.change_summary_json
       or new.content_format is distinct from old.content_format
       or new.previous_version_id is distinct from old.previous_version_id
       or new.supersedes_version_id is distinct from old.supersedes_version_id
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Published or retired clause version content is immutable; create a new version';
    end if;
    if old.status = 'published' and new.status not in ('published', 'retired') then raise exception 'Published clause versions can only be retired'; end if;
    if old.status = 'retired' and new.status is distinct from old.status then raise exception 'Retired clause versions cannot be reactivated'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists document_template_sections_draft_only on public.document_template_sections;
create trigger document_template_sections_draft_only before insert or update or delete on public.document_template_sections for each row execute function public.enforce_document_template_structure_mutability();
drop trigger if exists document_template_section_validate on public.document_template_sections;
create trigger document_template_section_validate before insert or update on public.document_template_sections for each row execute function public.validate_document_template_section();
drop trigger if exists document_template_slots_draft_only on public.document_template_clause_slots;
create trigger document_template_slots_draft_only before insert or update or delete on public.document_template_clause_slots for each row execute function public.enforce_document_template_structure_mutability();
drop trigger if exists document_template_slot_validate on public.document_template_clause_slots;
create trigger document_template_slot_validate before insert or update on public.document_template_clause_slots for each row execute function public.validate_document_template_clause_slot();
drop trigger if exists document_template_alternative_groups_validate on public.document_template_alternative_groups;
create trigger document_template_alternative_groups_validate before insert or update on public.document_template_alternative_groups for each row execute function public.validate_document_template_alternative_group();
drop trigger if exists document_template_alternative_groups_draft_only on public.document_template_alternative_groups;
create trigger document_template_alternative_groups_draft_only before insert or update or delete on public.document_template_alternative_groups for each row execute function public.enforce_document_template_version_child_mutability();
drop trigger if exists document_template_variable_bindings_draft_only on public.document_template_variable_bindings;
create trigger document_template_variable_bindings_draft_only before insert or update or delete on public.document_template_variable_bindings for each row execute function public.enforce_document_template_version_child_mutability();
drop trigger if exists document_clause_variable_bindings_draft_only on public.document_clause_version_variable_bindings;
create trigger document_clause_variable_bindings_draft_only before insert or update or delete on public.document_clause_version_variable_bindings for each row execute function public.enforce_document_clause_version_binding_mutability();
drop trigger if exists document_variable_definitions_key_immutable on public.document_variable_definitions;
create trigger document_variable_definitions_key_immutable before update or delete on public.document_variable_definitions for each row execute function public.enforce_document_variable_definition_key_immutability();
drop trigger if exists document_template_versions_immutable on public.document_template_versions;
create trigger document_template_versions_immutable before update or delete on public.document_template_versions for each row execute function public.enforce_document_template_version_immutability();
drop trigger if exists document_clause_versions_immutable on public.document_clause_versions;
create trigger document_clause_versions_immutable before update or delete on public.document_clause_versions for each row execute function public.enforce_document_clause_version_immutability();

insert into public.document_variable_definitions (
  variable_key, display_name_th, display_name_en, data_type, resolver_key,
  allowed_document_types, default_required, formatting_json, locale_behavior_json,
  fallback_policy, sensitivity_level, status
)
values
  ('AGREEMENT_TITLE', 'ชื่อสัญญา', 'Agreement Title', 'text', 'agreement.title', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('AGREEMENT_NO', 'เลขที่สัญญา', 'Agreement Number', 'text', 'agreement.agreement_no', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('AGREEMENT_DATE', 'วันที่สัญญา', 'Agreement Date', 'date', 'agreement.created_date', '["fee_agreement"]', false, '{"date_style":"short"}', '{"th":"DD/MM/YYYY","en":"YYYY-MM-DD"}', 'unresolved', 'internal', 'active'),
  ('EFFECTIVE_DATE', 'วันที่มีผล', 'Effective Date', 'date', 'agreement.effective_date', '["fee_agreement"]', false, '{"date_style":"short"}', '{"th":"DD/MM/YYYY","en":"YYYY-MM-DD"}', 'unresolved', 'internal', 'active'),
  ('COMMENCEMENT_DATE', 'วันเริ่มให้บริการ', 'Commencement Date', 'date', 'agreement.commencement_date', '["fee_agreement"]', false, '{"date_style":"short"}', '{"th":"DD/MM/YYYY","en":"YYYY-MM-DD"}', 'unresolved', 'internal', 'active'),
  ('END_DATE', 'วันสิ้นสุด', 'End Date', 'date', 'agreement.expiry_date', '["fee_agreement"]', false, '{"date_style":"short"}', '{"th":"DD/MM/YYYY","en":"YYYY-MM-DD"}', 'unresolved', 'internal', 'active'),
  ('CLIENT_NAME', 'ชื่อลูกค้า', 'Client Name', 'party', 'client.name', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'confidential', 'active'),
  ('CLIENT_ADDRESS', 'ที่อยู่ลูกค้า', 'Client Address', 'address', 'client.address', '["fee_agreement"]', false, '{}', '{"th":"multiline","en":"multiline"}', 'unresolved', 'confidential', 'active'),
  ('CLIENT_TAX_ID', 'เลขประจำตัวผู้เสียภาษีลูกค้า', 'Client Tax ID', 'text', 'client.tax_id', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'confidential', 'active'),
  ('CLIENT_SIGNATORY_NAME', 'ชื่อผู้ลงนามลูกค้า', 'Client Signatory Name', 'party', 'signatories.client_name', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'confidential', 'active'),
  ('CLIENT_SIGNATORY_TITLE', 'ตำแหน่งผู้ลงนามลูกค้า', 'Client Signatory Title', 'text', 'signatories.client_title', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'confidential', 'active'),
  ('LAW_FIRM_NAME', 'ชื่อสำนักงานกฎหมาย', 'Law Firm Name', 'party', 'company.name', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('LAW_FIRM_ADDRESS', 'ที่อยู่สำนักงานกฎหมาย', 'Law Firm Address', 'address', 'company.address', '["fee_agreement"]', false, '{}', '{"th":"multiline","en":"multiline"}', 'unresolved', 'internal', 'active'),
  ('LAW_FIRM_TAX_ID', 'เลขประจำตัวผู้เสียภาษีสำนักงาน', 'Law Firm Tax ID', 'text', 'company.tax_id', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('LAW_FIRM_SIGNATORY_NAME', 'ชื่อผู้ลงนามสำนักงาน', 'Law Firm Signatory Name', 'party', 'signatories.firm_name', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('LAW_FIRM_SIGNATORY_TITLE', 'ตำแหน่งผู้ลงนามสำนักงาน', 'Law Firm Signatory Title', 'text', 'signatories.firm_title', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('SOURCE_QUOTATION_NO', 'เลขที่ใบเสนอราคาอ้างอิง', 'Source Quotation Number', 'text', 'source.quotation_no', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('MATTER_NAME', 'ชื่อเรื่อง/งาน', 'Matter Name', 'text', 'matter.name', '["fee_agreement"]', false, '{}', '{"th":"text","en":"text"}', 'unresolved', 'confidential', 'active'),
  ('SERVICE_SCOPE', 'ขอบเขตบริการ', 'Service Scope', 'rich_text', 'matter.service_scope', '["fee_agreement"]', false, '{}', '{"th":"multiline","en":"multiline"}', 'unresolved', 'confidential', 'active'),
  ('SUBTOTAL', 'ยอดก่อน VAT', 'Subtotal', 'money', 'commercial.subtotal', '["fee_agreement"]', true, '{"currency":"THB"}', '{"th":"THB","en":"THB"}', 'unresolved', 'internal', 'active'),
  ('VAT_AMOUNT', 'ภาษีมูลค่าเพิ่ม', 'VAT Amount', 'money', 'commercial.vat_amount', '["fee_agreement"]', true, '{"currency":"THB"}', '{"th":"THB","en":"THB"}', 'unresolved', 'internal', 'active'),
  ('AGREEMENT_TOTAL', 'ยอดรวมสัญญา', 'Agreement Total', 'money', 'commercial.total', '["fee_agreement"]', true, '{"currency":"THB"}', '{"th":"THB","en":"THB"}', 'unresolved', 'internal', 'active'),
  ('CURRENCY', 'สกุลเงิน', 'Currency', 'text', 'commercial.currency', '["fee_agreement"]', true, '{}', '{"th":"text","en":"text"}', 'unresolved', 'internal', 'active'),
  ('PAYMENT_SCHEDULE', 'กำหนดการชำระเงิน', 'Payment Schedule', 'list', 'commercial.payment_schedule', '["fee_agreement"]', false, '{}', '{"th":"multiline","en":"multiline"}', 'unresolved', 'internal', 'active')
on conflict (variable_key) do nothing;

-- An inactive Thai structural shell only. It intentionally contains no operative legal wording or slots.
insert into public.document_templates (
  document_type, template_code, name, language_code, status, metadata_json
)
values (
  'fee_agreement',
  'VP-FA-LEGAL-SERVICES',
  'สัญญาว่าจ้างให้บริการทางกฎหมาย',
  'th',
  'draft',
  '{"inactive_shell": true, "legal_wording_approved": false}'::jsonb
)
on conflict (document_type, template_code) do nothing;

insert into public.document_template_versions (
  template_id, version_no, language_code, definition_json, status, signature_requirements_json, renderer_schema_version
)
select t.id, 1, 'th', '{"schema_version": 2, "inactive_shell": true, "legal_wording_approved": false, "numbering_policy":{"top_level":"thai_clause","subclause":"decimal","appendix":"thai_appendix","execution":"none"}}'::jsonb, 'draft',
  '{"minimum_client_signers":1,"minimum_firm_signers":1,"minimum_witnesses":0,"witness_required":false,"signing_order_required":false,"allowed_party_types":["client","firm","witness"],"signature_block_style":"standard"}'::jsonb, 3
from public.document_templates t
where t.document_type = 'fee_agreement'
  and t.template_code = 'VP-FA-LEGAL-SERVICES'
  and t.status = 'draft'
  and coalesce(t.metadata_json->>'inactive_shell', 'false') = 'true'
on conflict (template_id, version_no, language_code) do nothing;

insert into public.document_template_sections (
  template_version_id, section_code, title, sort_order, display_number, display_label, numbering_style, numbering_depth, section_kind, is_required, allow_custom_after, risk_level, metadata_json
)
select tv.id, seed.section_code, seed.title, seed.sort_order, seed.display_number, seed.display_label, seed.numbering_style, seed.numbering_depth, seed.section_kind, seed.is_required, seed.allow_custom_after, seed.risk_level,
  jsonb_build_object('inactive_shell', true, 'default_slot_policy', seed.default_slot_policy)
from public.document_template_versions tv
join public.document_templates t on t.id = tv.template_id
cross join (values
  ('PREAMBLE', 'คู่สัญญา บทนำ วันที่ และคำนิยาม', 1, 'ข้อ 1', 'ข้อ 1', 'thai_clause', 1, 'preamble', true, false, 'high', 'non_suppressible'),
  ('SCOPE', 'ขอบเขตการให้บริการ', 2, 'ข้อ 2', 'ข้อ 2', 'thai_clause', 1, 'normal', true, true, 'high', 'non_suppressible'),
  ('INCLUDED_SERVICES', 'งานที่รวมอยู่ในค่าบริการ', 3, 'ข้อ 3', 'ข้อ 3', 'thai_clause', 1, 'normal', false, true, 'medium', 'slot_configurable'),
  ('EXCLUDED_SERVICES', 'งานที่ไม่รวม', 4, 'ข้อ 4', 'ข้อ 4', 'thai_clause', 1, 'normal', false, true, 'medium', 'slot_configurable'),
  ('FEES_PAYMENT', 'ค่าบริการ VAT และเงื่อนไขการชำระเงิน', 5, 'ข้อ 5', 'ข้อ 5', 'thai_clause', 1, 'normal', true, false, 'high', 'non_suppressible'),
  ('CLIENT_OBLIGATIONS', 'หน้าที่ของลูกค้า', 6, 'ข้อ 6', 'ข้อ 6', 'thai_clause', 1, 'normal', true, false, 'high', 'non_suppressible'),
  ('FIRM_OBLIGATIONS', 'หน้าที่ของสำนักงาน', 7, 'ข้อ 7', 'ข้อ 7', 'thai_clause', 1, 'normal', true, false, 'high', 'non_suppressible'),
  ('EXPENSES', 'ค่าใช้จ่ายและเงินทดรอง', 8, 'ข้อ 8', 'ข้อ 8', 'thai_clause', 1, 'normal', false, true, 'medium', 'slot_configurable'),
  ('CONFIDENTIALITY', 'การรักษาความลับและการจัดการเอกสาร', 9, 'ข้อ 9', 'ข้อ 9', 'thai_clause', 1, 'normal', true, false, 'critical', 'non_suppressible'),
  ('COOPERATION_RELIANCE', 'ความร่วมมือและการพึ่งพาข้อมูลจากลูกค้า', 10, 'ข้อ 10', 'ข้อ 10', 'thai_clause', 1, 'normal', false, true, 'medium', 'slot_configurable'),
  ('TERMINATION', 'การเลิกสัญญา', 11, 'ข้อ 11', 'ข้อ 11', 'thai_clause', 1, 'normal', true, false, 'critical', 'non_suppressible'),
  ('GOVERNING_LAW', 'กฎหมายที่ใช้บังคับและเขตอำนาจ', 12, 'ข้อ 12', 'ข้อ 12', 'thai_clause', 1, 'normal', true, false, 'critical', 'non_suppressible'),
  ('NOTICES_GENERAL', 'การบอกกล่าวและข้อกำหนดทั่วไป', 13, 'ข้อ 13', 'ข้อ 13', 'thai_clause', 1, 'normal', false, true, 'medium', 'slot_configurable'),
  ('EXECUTION', 'การลงนามและพยานตามที่ Template กำหนด', 14, null, null, 'none', 0, 'execution', true, false, 'high', 'non_suppressible')
) as seed(section_code, title, sort_order, display_number, display_label, numbering_style, numbering_depth, section_kind, is_required, allow_custom_after, risk_level, default_slot_policy)
where t.document_type = 'fee_agreement'
  and t.template_code = 'VP-FA-LEGAL-SERVICES'
  and t.status = 'draft'
  and coalesce(t.metadata_json->>'inactive_shell', 'false') = 'true'
  and tv.version_no = 1
  and tv.language_code = 'th'
on conflict (template_version_id, section_code) do nothing;

create or replace function public.save_document_template_family_draft(
  p_template_id uuid, p_document_type text, p_template_code text, p_name text, p_language_code text, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text; v_type text := lower(btrim(coalesce(p_document_type, ''))); v_code text := upper(btrim(coalesce(p_template_code, ''))); v_language text := lower(btrim(coalesce(p_language_code, 'th')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save document template'; end if;
  if v_type = '' or v_code = '' or btrim(coalesce(p_name, '')) = '' or v_language not in ('th', 'en') then raise exception 'Invalid document template draft data'; end if;
  if p_template_id is null then
    insert into public.document_templates(document_type, template_code, name, language_code, status, metadata_json, created_by_user_id, updated_by_user_id)
    values (v_type, v_code, btrim(p_name), v_language, 'draft', coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
    perform public.document_platform_audit('template', v_id, 'created_draft');
  else
    select id, status into v_id, v_status from public.document_templates where id = p_template_id for update;
    if v_id is null then raise exception 'Document template not found'; end if;
    if v_status <> 'draft' then raise exception 'Only draft document template families can be edited'; end if;
    update public.document_templates set name = btrim(p_name), metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
    perform public.document_platform_audit('template', v_id, 'updated_draft');
  end if;
  return v_id;
end;
$$;

create or replace function public.save_document_template_version_draft(
  p_template_version_id uuid, p_template_id uuid, p_language_code text, p_definition_json jsonb default '{}'::jsonb, p_effective_from date default null, p_effective_to date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_version_no integer; v_previous_version_id uuid; v_language text := lower(btrim(coalesce(p_language_code, 'th')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save document template version'; end if;
  if v_language not in ('th', 'en') or p_definition_json is null or jsonb_typeof(p_definition_json) <> 'object' then raise exception 'Invalid document template version data'; end if;
  if p_effective_to is not null and p_effective_from is not null and p_effective_to < p_effective_from then raise exception 'Template effective date range is invalid'; end if;
  if p_template_version_id is null then
    if not exists (select 1 from public.document_templates where id = p_template_id and status <> 'retired') then raise exception 'Document template is unavailable'; end if;
    perform 1 from public.document_templates where id = p_template_id for update;
    select coalesce(max(version_no), 0) + 1 into v_version_no from public.document_template_versions where template_id = p_template_id and language_code = v_language;
    select id into v_previous_version_id from public.document_template_versions where template_id = p_template_id and language_code = v_language order by version_no desc limit 1;
    insert into public.document_template_versions(template_id, version_no, language_code, definition_json, status, effective_from, effective_to, previous_version_id, supersedes_version_id, created_by_user_id, updated_by_user_id)
    values (p_template_id, v_version_no, v_language, p_definition_json, 'draft', p_effective_from, p_effective_to, v_previous_version_id, v_previous_version_id, auth.uid(), auth.uid()) returning id into v_id;
    perform public.document_platform_audit('template_version', v_id, 'created_draft');
  else
    select id into v_id from public.document_template_versions where id = p_template_version_id for update;
    if v_id is null or not public.document_template_version_is_draft(v_id) then raise exception 'Only draft template versions can be edited'; end if;
    update public.document_template_versions set definition_json = p_definition_json, effective_from = p_effective_from, effective_to = p_effective_to, updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
    perform public.document_platform_audit('template_version', v_id, 'updated_draft');
  end if;
  return v_id;
end;
$$;

create or replace function public.replace_document_template_draft_structure(p_template_version_id uuid, p_sections_json jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_section jsonb; v_slot jsonb; v_section_id uuid; v_section_code text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save template structure'; end if;
  if not public.document_template_version_is_draft(p_template_version_id) then raise exception 'Only draft template versions can be edited'; end if;
  if p_sections_json is null or jsonb_typeof(p_sections_json) <> 'array' then raise exception 'Template sections must be an array'; end if;
  if exists (select 1 from public.finance_fee_agreements where selected_template_version_id = p_template_version_id) then raise exception 'Draft template structure is already referenced and cannot be replaced'; end if;
  delete from public.document_template_clause_slots where template_section_id in (select id from public.document_template_sections where template_version_id = p_template_version_id);
  delete from public.document_template_sections where template_version_id = p_template_version_id;
  for v_section in select value from jsonb_array_elements(p_sections_json) loop
    v_section_code := upper(btrim(coalesce(v_section->>'section_code', '')));
    if v_section_code = '' or btrim(coalesce(v_section->>'title', '')) = '' or coalesce((v_section->>'sort_order')::integer, 0) < 1 then raise exception 'Invalid template section'; end if;
    insert into public.document_template_sections(template_version_id, section_code, title, sort_order, is_required, allow_custom_after, risk_level, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_template_version_id, v_section_code, btrim(v_section->>'title'), (v_section->>'sort_order')::integer, coalesce((v_section->>'is_required')::boolean, true), coalesce((v_section->>'allow_custom_after')::boolean, false), nullif(btrim(coalesce(v_section->>'risk_level', '')), ''), coalesce(v_section->'metadata_json', '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_section_id;
    for v_slot in select value from jsonb_array_elements(coalesce(v_section->'slots', '[]'::jsonb)) loop
      if upper(btrim(coalesce(v_slot->>'slot_code', ''))) = '' or coalesce((v_slot->>'sort_order')::integer, 0) < 1 then raise exception 'Invalid template clause slot'; end if;
      insert into public.document_template_clause_slots(template_section_id, slot_code, clause_version_id, sort_order, is_required, allow_override, allow_suppress, allow_custom_after, risk_level, metadata_json, created_by_user_id, updated_by_user_id)
      values (v_section_id, upper(btrim(v_slot->>'slot_code')), nullif(v_slot->>'clause_version_id', '')::uuid, (v_slot->>'sort_order')::integer, coalesce((v_slot->>'is_required')::boolean, true), coalesce((v_slot->>'allow_override')::boolean, false), coalesce((v_slot->>'allow_suppress')::boolean, false), coalesce((v_slot->>'allow_custom_after')::boolean, false), nullif(btrim(coalesce(v_slot->>'risk_level', '')), ''), coalesce(v_slot->'metadata_json', '{}'::jsonb), auth.uid(), auth.uid());
    end loop;
  end loop;
  perform public.document_platform_audit('template_structure', p_template_version_id, 'replaced_draft_structure');
  return p_template_version_id;
end;
$$;

create or replace function public.save_document_clause_family_draft(
  p_clause_id uuid, p_clause_code text, p_category text default null, p_jurisdiction text default null, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text := upper(btrim(coalesce(p_clause_code, '')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save clause family'; end if;
  if v_code = '' then raise exception 'Clause code is required'; end if;
  if p_clause_id is null then
    insert into public.document_clause_libraries(clause_code, category, jurisdiction, metadata_json, is_active, created_by_user_id, updated_by_user_id)
    values (v_code, nullif(btrim(coalesce(p_category, '')), ''), nullif(btrim(coalesce(p_jurisdiction, '')), ''), coalesce(p_metadata_json, '{}'::jsonb), true, auth.uid(), auth.uid()) returning id into v_id;
    perform public.document_platform_audit('clause_family', v_id, 'created_draft');
  else
    select id into v_id from public.document_clause_libraries where id = p_clause_id for update;
    if v_id is null then raise exception 'Clause family not found'; end if;
    update public.document_clause_libraries set category = nullif(btrim(coalesce(p_category, '')), ''), jurisdiction = nullif(btrim(coalesce(p_jurisdiction, '')), ''), metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
    perform public.document_platform_audit('clause_family', v_id, 'updated_draft');
  end if;
  return v_id;
end;
$$;

create or replace function public.save_document_clause_version_draft(
  p_clause_version_id uuid, p_clause_id uuid, p_language_code text, p_title text, p_content text, p_metadata_json jsonb default '{}'::jsonb, p_effective_from date default null, p_effective_to date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_version_no integer; v_previous_version_id uuid; v_language text := lower(btrim(coalesce(p_language_code, 'th'))); v_hash text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save clause version'; end if;
  if v_language not in ('th', 'en') or btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_content, '')) = '' then raise exception 'Invalid clause version data'; end if;
  if p_effective_to is not null and p_effective_from is not null and p_effective_to < p_effective_from then raise exception 'Clause effective date range is invalid'; end if;
  v_hash := public.document_platform_content_hash(jsonb_build_object('language_code', v_language, 'title', btrim(p_title), 'content', btrim(p_content), 'metadata', coalesce(p_metadata_json, '{}'::jsonb)));
  if p_clause_version_id is null then
    if not exists (select 1 from public.document_clause_libraries where id = p_clause_id and is_active) then raise exception 'Clause family is unavailable'; end if;
    perform 1 from public.document_clause_libraries where id = p_clause_id for update;
    select coalesce(max(version_no), 0) + 1 into v_version_no from public.document_clause_versions where clause_id = p_clause_id and language_code = v_language;
    select id into v_previous_version_id from public.document_clause_versions where clause_id = p_clause_id and language_code = v_language order by version_no desc limit 1;
    insert into public.document_clause_versions(clause_id, version_no, language_code, title, content, metadata_json, effective_from, effective_to, status, content_hash, normalized_text_hash, previous_version_id, supersedes_version_id, created_by_user_id, updated_by_user_id)
    values (p_clause_id, v_version_no, v_language, btrim(p_title), btrim(p_content), coalesce(p_metadata_json, '{}'::jsonb), p_effective_from, p_effective_to, 'draft', v_hash, public.document_platform_content_hash(jsonb_build_object('text', regexp_replace(btrim(p_content), '\s+', ' ', 'g'))), v_previous_version_id, v_previous_version_id, auth.uid(), auth.uid()) returning id into v_id;
    perform public.document_platform_audit('clause_version', v_id, 'created_draft');
  else
    select id into v_id from public.document_clause_versions where id = p_clause_version_id for update;
    if v_id is null or not exists (select 1 from public.document_clause_versions where id = v_id and status = 'draft') then raise exception 'Only draft clause versions can be edited'; end if;
    update public.document_clause_versions set title = btrim(p_title), content = btrim(p_content), metadata_json = coalesce(p_metadata_json, '{}'::jsonb), effective_from = p_effective_from, effective_to = p_effective_to, content_hash = v_hash, normalized_text_hash = public.document_platform_content_hash(jsonb_build_object('text', regexp_replace(btrim(p_content), '\s+', ' ', 'g'))), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
    perform public.document_platform_audit('clause_version', v_id, 'updated_draft');
  end if;
  return v_id;
end;
$$;

create or replace function public.save_document_template_alternative_group_draft(
  p_group_id uuid, p_template_version_id uuid, p_group_code text, p_title text, p_minimum_selection integer, p_maximum_selection integer, p_selection_required boolean, p_default_selected_slot_id uuid default null, p_condition_rule_json jsonb default null, p_risk_level text default null, p_sort_order integer default 1, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text := upper(btrim(coalesce(p_group_code, ''))); v_risk text := nullif(lower(btrim(coalesce(p_risk_level, ''))), '');
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save an alternative group'; end if;
  if not public.document_template_version_is_draft(p_template_version_id) then raise exception 'Alternative groups can only be changed while the template version is draft'; end if;
  if v_code = '' or btrim(coalesce(p_title, '')) = '' or coalesce(p_minimum_selection, -1) < 0 or coalesce(p_maximum_selection, 0) < coalesce(p_minimum_selection, -1) or coalesce(p_maximum_selection, 0) < 1 or coalesce(p_sort_order, 0) < 1 or (v_risk is not null and v_risk not in ('low', 'medium', 'high', 'critical', 'informational')) then raise exception 'Invalid alternative group data'; end if;
  perform public.validate_document_condition_rule(p_condition_rule_json);
  if p_group_id is null then
    insert into public.document_template_alternative_groups(template_version_id, group_code, title, minimum_selection, maximum_selection, selection_required, default_selected_slot_id, condition_rule_json, risk_level, sort_order, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_template_version_id, v_code, btrim(p_title), p_minimum_selection, p_maximum_selection, coalesce(p_selection_required, false), p_default_selected_slot_id, p_condition_rule_json, v_risk, p_sort_order, coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.document_template_alternative_groups where id = p_group_id and template_version_id = p_template_version_id for update;
    if v_id is null then raise exception 'Alternative group not found'; end if;
    update public.document_template_alternative_groups set group_code = v_code, title = btrim(p_title), minimum_selection = p_minimum_selection, maximum_selection = p_maximum_selection, selection_required = coalesce(p_selection_required, false), default_selected_slot_id = p_default_selected_slot_id, condition_rule_json = p_condition_rule_json, risk_level = v_risk, sort_order = p_sort_order, metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('alternative_group', v_id, 'saved_draft');
  return v_id;
end;
$$;

create or replace function public.save_document_template_section_draft(
  p_section_id uuid, p_template_version_id uuid, p_section_code text, p_title text, p_sort_order integer, p_parent_section_id uuid default null, p_display_number text default null, p_display_label text default null, p_numbering_style text default 'explicit', p_numbering_depth integer default 1, p_section_kind text default 'normal', p_condition_rule_json jsonb default null, p_is_required boolean default true, p_allow_custom_after boolean default false, p_risk_level text default null, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text := upper(btrim(coalesce(p_section_code, '')));
begin
  if not public.current_user_can_manage_finance_quotations() or not public.document_template_version_is_draft(p_template_version_id) then raise exception 'Sections can only be changed while the template version is draft'; end if;
  if v_code = '' or btrim(coalesce(p_title, '')) = '' or coalesce(p_sort_order, 0) < 1 then raise exception 'Invalid template section data'; end if;
  if p_section_id is null then
    insert into public.document_template_sections(template_version_id, section_code, title, sort_order, parent_section_id, display_number, display_label, numbering_style, numbering_depth, section_kind, condition_rule_json, is_required, allow_custom_after, risk_level, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_template_version_id, v_code, btrim(p_title), p_sort_order, p_parent_section_id, nullif(btrim(coalesce(p_display_number, '')), ''), nullif(btrim(coalesce(p_display_label, '')), ''), lower(btrim(coalesce(p_numbering_style, 'explicit'))), p_numbering_depth, lower(btrim(coalesce(p_section_kind, 'normal'))), p_condition_rule_json, coalesce(p_is_required, true), coalesce(p_allow_custom_after, false), nullif(lower(btrim(coalesce(p_risk_level, ''))), ''), coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.document_template_sections where id = p_section_id and template_version_id = p_template_version_id for update;
    if v_id is null then raise exception 'Template section not found'; end if;
    update public.document_template_sections set section_code = v_code, title = btrim(p_title), sort_order = p_sort_order, parent_section_id = p_parent_section_id, display_number = nullif(btrim(coalesce(p_display_number, '')), ''), display_label = nullif(btrim(coalesce(p_display_label, '')), ''), numbering_style = lower(btrim(coalesce(p_numbering_style, 'explicit'))), numbering_depth = p_numbering_depth, section_kind = lower(btrim(coalesce(p_section_kind, 'normal'))), condition_rule_json = p_condition_rule_json, is_required = coalesce(p_is_required, true), allow_custom_after = coalesce(p_allow_custom_after, false), risk_level = nullif(lower(btrim(coalesce(p_risk_level, ''))), ''), metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('template_section', v_id, 'saved_draft');
  return v_id;
end;
$$;

create or replace function public.save_document_template_clause_slot_draft(
  p_slot_id uuid, p_template_section_id uuid, p_slot_code text, p_clause_version_id uuid, p_sort_order integer, p_parent_slot_id uuid default null, p_display_number text default null, p_display_label text default null, p_numbering_style text default 'explicit', p_numbering_depth integer default 1, p_clause_type text default 'mandatory', p_alternative_group_id uuid default null, p_condition_rule_json jsonb default null, p_is_required boolean default true, p_allow_override boolean default false, p_allow_suppress boolean default false, p_allow_custom_after boolean default false, p_risk_level text default null, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_template_version_id uuid; v_code text := upper(btrim(coalesce(p_slot_code, '')));
begin
  select template_version_id into v_template_version_id from public.document_template_sections where id = p_template_section_id;
  if not public.current_user_can_manage_finance_quotations() or not public.document_template_version_is_draft(v_template_version_id) then raise exception 'Clause slots can only be changed while the template version is draft'; end if;
  if v_code = '' or coalesce(p_sort_order, 0) < 1 then raise exception 'Invalid template clause slot data'; end if;
  if p_slot_id is null then
    insert into public.document_template_clause_slots(template_section_id, slot_code, clause_version_id, sort_order, parent_slot_id, display_number, display_label, numbering_style, numbering_depth, clause_type, alternative_group_id, condition_rule_json, is_required, allow_override, allow_suppress, allow_custom_after, risk_level, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_template_section_id, v_code, p_clause_version_id, p_sort_order, p_parent_slot_id, nullif(btrim(coalesce(p_display_number, '')), ''), nullif(btrim(coalesce(p_display_label, '')), ''), lower(btrim(coalesce(p_numbering_style, 'explicit'))), p_numbering_depth, lower(btrim(coalesce(p_clause_type, 'mandatory'))), p_alternative_group_id, p_condition_rule_json, coalesce(p_is_required, true), coalesce(p_allow_override, false), coalesce(p_allow_suppress, false), coalesce(p_allow_custom_after, false), nullif(lower(btrim(coalesce(p_risk_level, ''))), ''), coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.document_template_clause_slots where id = p_slot_id and template_section_id = p_template_section_id for update;
    if v_id is null then raise exception 'Template clause slot not found'; end if;
    update public.document_template_clause_slots set slot_code = v_code, clause_version_id = p_clause_version_id, sort_order = p_sort_order, parent_slot_id = p_parent_slot_id, display_number = nullif(btrim(coalesce(p_display_number, '')), ''), display_label = nullif(btrim(coalesce(p_display_label, '')), ''), numbering_style = lower(btrim(coalesce(p_numbering_style, 'explicit'))), numbering_depth = p_numbering_depth, clause_type = lower(btrim(coalesce(p_clause_type, 'mandatory'))), alternative_group_id = p_alternative_group_id, condition_rule_json = p_condition_rule_json, is_required = coalesce(p_is_required, true), allow_override = coalesce(p_allow_override, false), allow_suppress = coalesce(p_allow_suppress, false), allow_custom_after = coalesce(p_allow_custom_after, false), risk_level = nullif(lower(btrim(coalesce(p_risk_level, ''))), ''), metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('template_slot', v_id, 'saved_draft');
  return v_id;
end;
$$;

create or replace function public.save_document_template_variable_binding_draft(
  p_binding_id uuid, p_template_version_id uuid, p_variable_definition_id uuid, p_is_required boolean, p_formatting_override_json jsonb default null, p_fallback_override text default null, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() or not public.document_template_version_is_draft(p_template_version_id) then raise exception 'Template variable bindings can only be changed while draft'; end if;
  if not exists (select 1 from public.document_variable_definitions where id = p_variable_definition_id and status = 'active' and allowed_document_types ? 'fee_agreement') then raise exception 'Variable definition is not approved for fee agreements'; end if;
  if p_binding_id is null then
    insert into public.document_template_variable_bindings(template_version_id, variable_definition_id, is_required, formatting_override_json, fallback_override, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_template_version_id, p_variable_definition_id, coalesce(p_is_required, false), p_formatting_override_json, p_fallback_override, coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.document_template_variable_bindings where id = p_binding_id and template_version_id = p_template_version_id for update;
    if v_id is null then raise exception 'Template variable binding not found'; end if;
    update public.document_template_variable_bindings set variable_definition_id = p_variable_definition_id, is_required = coalesce(p_is_required, false), formatting_override_json = p_formatting_override_json, fallback_override = p_fallback_override, metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('template_variable_binding', v_id, 'saved_draft');
  return v_id;
end;
$$;

create or replace function public.save_document_clause_variable_binding_draft(
  p_binding_id uuid, p_clause_version_id uuid, p_variable_definition_id uuid, p_is_required boolean, p_formatting_override_json jsonb default null, p_fallback_override text default null, p_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() or not exists (select 1 from public.document_clause_versions where id = p_clause_version_id and status = 'draft') then raise exception 'Clause variable bindings can only be changed while draft'; end if;
  if not exists (select 1 from public.document_variable_definitions where id = p_variable_definition_id and status = 'active' and allowed_document_types ? 'fee_agreement') then raise exception 'Variable definition is not approved for fee agreements'; end if;
  if p_binding_id is null then
    insert into public.document_clause_version_variable_bindings(clause_version_id, variable_definition_id, is_required, formatting_override_json, fallback_override, metadata_json, created_by_user_id, updated_by_user_id)
    values (p_clause_version_id, p_variable_definition_id, coalesce(p_is_required, false), p_formatting_override_json, p_fallback_override, coalesce(p_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.document_clause_version_variable_bindings where id = p_binding_id and clause_version_id = p_clause_version_id for update;
    if v_id is null then raise exception 'Clause variable binding not found'; end if;
    update public.document_clause_version_variable_bindings set variable_definition_id = p_variable_definition_id, is_required = coalesce(p_is_required, false), formatting_override_json = p_formatting_override_json, fallback_override = p_fallback_override, metadata_json = coalesce(p_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('clause_variable_binding', v_id, 'saved_draft');
  return v_id;
end;
$$;

create or replace function public.compute_document_template_version_content_hash(p_template_version_id uuid)
returns text language sql security definer set search_path = public as $$
  select public.document_platform_content_hash(
    jsonb_build_object(
      'definition', tv.definition_json,
      'sections', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'section_code', sec.section_code,
            'title', sec.title,
            'sort_order', sec.sort_order,
            'is_required', sec.is_required,
            'allow_custom_after', sec.allow_custom_after,
            'risk_level', sec.risk_level,
            'slots', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'slot_code', slot.slot_code,
                  'sort_order', slot.sort_order,
                  'clause_version_id', slot.clause_version_id,
                  'clause_content_hash', cv.content_hash,
                  'is_required', slot.is_required,
                  'allow_override', slot.allow_override,
                  'allow_suppress', slot.allow_suppress,
                  'allow_custom_after', slot.allow_custom_after,
                  'risk_level', slot.risk_level
                ) order by slot.sort_order
              )
              from public.document_template_clause_slots slot
              join public.document_clause_versions cv on cv.id = slot.clause_version_id
              where slot.template_section_id = sec.id
            ), '[]'::jsonb)
          ) order by sec.sort_order
        )
        from public.document_template_sections sec
        where sec.template_version_id = tv.id
      ), '[]'::jsonb)
    )
  )
  from public.document_template_versions tv
  where tv.id = p_template_version_id;
$$;

create or replace function public.compute_document_template_version_structure_hash(p_template_version_id uuid)
returns text language sql security definer set search_path = public as $$
  select public.document_platform_content_hash(jsonb_build_object(
    'template_version_id', tv.id,
    'definition', tv.definition_json,
    'condition_rule', tv.condition_rule_json,
    'signature_requirements', tv.signature_requirements_json,
    'renderer_schema_version', tv.renderer_schema_version,
    'sections', coalesce((select jsonb_agg(jsonb_build_object('section_code', s.section_code, 'parent_section_id', s.parent_section_id, 'display_number', s.display_number, 'display_label', s.display_label, 'numbering_style', s.numbering_style, 'numbering_depth', s.numbering_depth, 'section_kind', s.section_kind, 'sort_order', s.sort_order, 'condition_rule', s.condition_rule_json, 'risk_level', s.risk_level) order by s.sort_order) from public.document_template_sections s where s.template_version_id = tv.id), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('section_id', s.template_section_id, 'slot_code', s.slot_code, 'parent_slot_id', s.parent_slot_id, 'clause_version_id', s.clause_version_id, 'alternative_group_id', s.alternative_group_id, 'display_number', s.display_number, 'display_label', s.display_label, 'numbering_style', s.numbering_style, 'numbering_depth', s.numbering_depth, 'clause_type', s.clause_type, 'sort_order', s.sort_order, 'condition_rule', s.condition_rule_json, 'risk_level', s.risk_level) order by s.sort_order) from public.document_template_clause_slots s join public.document_template_sections sec on sec.id = s.template_section_id where sec.template_version_id = tv.id), '[]'::jsonb),
    'alternative_groups', coalesce((select jsonb_agg(jsonb_build_object('group_code', g.group_code, 'minimum_selection', g.minimum_selection, 'maximum_selection', g.maximum_selection, 'selection_required', g.selection_required, 'default_selected_slot_id', g.default_selected_slot_id, 'condition_rule', g.condition_rule_json, 'risk_level', g.risk_level, 'sort_order', g.sort_order) order by g.sort_order) from public.document_template_alternative_groups g where g.template_version_id = tv.id), '[]'::jsonb),
    'variables', coalesce((select jsonb_agg(jsonb_build_object('variable_key', v.variable_key, 'required', b.is_required, 'formatting_override', b.formatting_override_json, 'fallback_override', b.fallback_override) order by v.variable_key) from public.document_template_variable_bindings b join public.document_variable_definitions v on v.id = b.variable_definition_id where b.template_version_id = tv.id), '[]'::jsonb)
  )) from public.document_template_versions tv where tv.id = p_template_version_id;
$$;

create or replace function public.compute_document_template_version_normalized_text_hash(p_template_version_id uuid)
returns text language sql security definer set search_path = public as $$
  select public.document_platform_content_hash(jsonb_build_object('clause_hashes', coalesce((select jsonb_agg(coalesce(cv.normalized_text_hash, public.document_platform_content_hash(jsonb_build_object('text', regexp_replace(cv.content, '\s+', ' ', 'g')))) order by sec.sort_order, slot.sort_order) from public.document_template_sections sec join public.document_template_clause_slots slot on slot.template_section_id = sec.id join public.document_clause_versions cv on cv.id = slot.clause_version_id where sec.template_version_id = p_template_version_id), '[]'::jsonb)));
$$;

create or replace function public.set_document_template_version_status(p_template_version_id uuid, p_next_status text, p_approval_note text default null, p_approval_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_version public.document_template_versions%rowtype; v_next text := lower(btrim(coalesce(p_next_status, ''))); v_hash text; v_structure_hash text; v_normalized_text_hash text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update template version status'; end if;
  select * into v_version from public.document_template_versions where id = p_template_version_id for update;
  if v_version.id is null then raise exception 'Template version not found'; end if;
  if not ((v_version.status = 'draft' and v_next = 'under_review') or (v_version.status = 'under_review' and v_next in ('draft', 'published')) or (v_version.status = 'published' and v_next = 'retired')) then raise exception 'Invalid template version status transition'; end if;
  if v_next in ('published', 'retired') and not public.current_user_is_document_platform_partner() then raise exception 'Only a Partner can publish or retire template versions'; end if;
  if v_next = 'published' then
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

create or replace function public.set_document_clause_version_status(p_clause_version_id uuid, p_next_status text, p_approval_note text default null, p_approval_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_version public.document_clause_versions%rowtype; v_next text := lower(btrim(coalesce(p_next_status, ''))); v_hash text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update clause version status'; end if;
  select * into v_version from public.document_clause_versions where id = p_clause_version_id for update;
  if v_version.id is null then raise exception 'Clause version not found'; end if;
  if not ((v_version.status = 'draft' and v_next = 'under_review') or (v_version.status = 'under_review' and v_next in ('draft', 'published')) or (v_version.status = 'published' and v_next = 'retired')) then raise exception 'Invalid clause version status transition'; end if;
  if v_next in ('published', 'retired') and not public.current_user_is_document_platform_partner() then raise exception 'Only a Partner can publish or retire clause versions'; end if;
  if v_next = 'published' then
    v_hash := public.document_platform_content_hash(jsonb_build_object('language_code', v_version.language_code, 'title', v_version.title, 'content', v_version.content, 'content_format', v_version.content_format, 'metadata', coalesce(v_version.metadata_json, '{}'::jsonb), 'variables', coalesce((select jsonb_agg(jsonb_build_object('variable_key', d.variable_key, 'required', b.is_required, 'formatting_override', b.formatting_override_json, 'fallback_override', b.fallback_override) order by d.variable_key) from public.document_clause_version_variable_bindings b join public.document_variable_definitions d on d.id = b.variable_definition_id where b.clause_version_id = v_version.id), '[]'::jsonb)));
  end if;
  update public.document_clause_versions set status = v_next, reviewed_by_user_id = case when v_next = 'published' then auth.uid() else reviewed_by_user_id end, reviewed_at = case when v_next = 'published' then now() else reviewed_at end, published_by_user_id = case when v_next = 'published' then auth.uid() else published_by_user_id end, published_at = case when v_next = 'published' then now() else published_at end, retired_by_user_id = case when v_next = 'retired' then auth.uid() else retired_by_user_id end, retired_at = case when v_next = 'retired' then now() else retired_at end, approval_note = case when v_next in ('published', 'retired') then nullif(btrim(coalesce(p_approval_note, '')), '') else approval_note end, approval_reference = case when v_next in ('published', 'retired') then nullif(btrim(coalesce(p_approval_reference, '')), '') else approval_reference end, content_hash = case when v_next = 'published' then v_hash else content_hash end, normalized_text_hash = case when v_next = 'published' then public.document_platform_content_hash(jsonb_build_object('text', regexp_replace(v_version.content, '\s+', ' ', 'g'))) else normalized_text_hash end, updated_by_user_id = auth.uid(), updated_at = now() where id = v_version.id;
  perform public.document_platform_audit('clause_version', v_version.id, v_next, jsonb_build_object('approval_note', nullif(btrim(coalesce(p_approval_note, '')), ''), 'approval_reference', nullif(btrim(coalesce(p_approval_reference, '')), '')));
  return v_version.id;
end;
$$;

create or replace function public.save_finance_fee_agreement_clause_override(
  p_override_id uuid, p_fee_agreement_id uuid, p_template_slot_id uuid, p_action text, p_replacement_title text, p_replacement_content text, p_reason text, p_risk_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_slot public.document_template_clause_slots%rowtype; v_template_version_id uuid; v_id uuid; v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save agreement clause override'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null or v_agreement.status not in ('draft', 'under_review') then raise exception 'Clause overrides can only be edited while the agreement is draft or under review'; end if;
  select s.* into v_slot
  from public.document_template_clause_slots s
  where s.id = p_template_slot_id;
  if v_slot.id is not null then
    select sec.template_version_id into v_template_version_id
    from public.document_template_sections sec
    where sec.id = v_slot.template_section_id;
  end if;
  if v_slot.id is null or v_template_version_id <> v_agreement.selected_template_version_id or v_slot.clause_version_id is null then raise exception 'Template slot is not part of the selected agreement template'; end if;
  if v_action = 'replace' and not v_slot.allow_override then raise exception 'This template clause slot does not allow overrides'; end if;
  if v_action = 'suppress' and (not v_slot.allow_suppress or v_slot.is_required) then raise exception 'This template clause slot cannot be suppressed'; end if;
  if v_action not in ('replace', 'suppress') or btrim(coalesce(p_reason, '')) = '' then raise exception 'Override action and reason are required'; end if;
  if v_action = 'replace' and (btrim(coalesce(p_replacement_title, '')) = '' or btrim(coalesce(p_replacement_content, '')) = '') then raise exception 'Replacement title and content are required'; end if;
  if p_override_id is null then
    insert into public.finance_fee_agreement_clause_overrides(fee_agreement_id, template_slot_id, source_clause_version_id, action, replacement_title, replacement_content, reason, risk_metadata_json, created_by_user_id, updated_by_user_id)
    values (v_agreement.id, v_slot.id, v_slot.clause_version_id, v_action, case when v_action = 'replace' then btrim(p_replacement_title) else null end, case when v_action = 'replace' then btrim(p_replacement_content) else null end, btrim(p_reason), coalesce(p_risk_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.finance_fee_agreement_clause_overrides where id = p_override_id and fee_agreement_id = v_agreement.id for update;
    if v_id is null then raise exception 'Agreement clause override not found'; end if;
    update public.finance_fee_agreement_clause_overrides set template_slot_id = v_slot.id, source_clause_version_id = v_slot.clause_version_id, action = v_action, replacement_title = case when v_action = 'replace' then btrim(p_replacement_title) else null end, replacement_content = case when v_action = 'replace' then btrim(p_replacement_content) else null end, reason = btrim(p_reason), risk_metadata_json = coalesce(p_risk_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('agreement_override', v_id, 'saved', jsonb_build_object('fee_agreement_id', v_agreement.id, 'action', v_action));
  return v_id;
end;
$$;

create or replace function public.delete_finance_fee_agreement_clause_override(p_override_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_agreement_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to delete agreement clause override'; end if;
  select o.fee_agreement_id into v_agreement_id from public.finance_fee_agreement_clause_overrides o join public.finance_fee_agreements a on a.id = o.fee_agreement_id where o.id = p_override_id and a.status in ('draft', 'under_review') for update;
  if v_agreement_id is null then raise exception 'Agreement clause override cannot be deleted'; end if;
  delete from public.finance_fee_agreement_clause_overrides where id = p_override_id;
  perform public.document_platform_audit('agreement_override', p_override_id, 'deleted', jsonb_build_object('fee_agreement_id', v_agreement_id));
end;
$$;

create or replace function public.save_finance_fee_agreement_custom_clause(
  p_custom_clause_id uuid, p_fee_agreement_id uuid, p_template_section_id uuid, p_anchor_template_slot_id uuid, p_title text, p_content text, p_sort_order integer, p_reason text default null, p_risk_metadata_json jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template_version_id uuid; v_allow_custom boolean; v_anchor_section_id uuid; v_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save agreement custom clause'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null or v_agreement.status not in ('draft', 'under_review') then raise exception 'Custom clauses can only be edited while the agreement is draft or under review'; end if;
  select template_version_id, allow_custom_after into v_template_version_id, v_allow_custom from public.document_template_sections where id = p_template_section_id;
  if v_template_version_id <> v_agreement.selected_template_version_id or not coalesce(v_allow_custom, false) then raise exception 'The selected template section does not allow custom clauses'; end if;
  if p_anchor_template_slot_id is not null then
    select template_section_id into v_anchor_section_id from public.document_template_clause_slots where id = p_anchor_template_slot_id;
    if v_anchor_section_id is distinct from p_template_section_id then raise exception 'Custom clause anchor does not belong to the selected template section'; end if;
  end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_content, '')) = '' or coalesce(p_sort_order, 0) < 1 then raise exception 'Custom clause title, content, and order are required'; end if;
  if p_custom_clause_id is null then
    insert into public.finance_fee_agreement_custom_clauses(fee_agreement_id, template_section_id, anchor_template_slot_id, title, content, sort_order, reason, risk_metadata_json, created_by_user_id, updated_by_user_id)
    values (v_agreement.id, p_template_section_id, p_anchor_template_slot_id, btrim(p_title), btrim(p_content), p_sort_order, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_risk_metadata_json, '{}'::jsonb), auth.uid(), auth.uid()) returning id into v_id;
  else
    select id into v_id from public.finance_fee_agreement_custom_clauses where id = p_custom_clause_id and fee_agreement_id = v_agreement.id for update;
    if v_id is null then raise exception 'Agreement custom clause not found'; end if;
    update public.finance_fee_agreement_custom_clauses set template_section_id = p_template_section_id, anchor_template_slot_id = p_anchor_template_slot_id, title = btrim(p_title), content = btrim(p_content), sort_order = p_sort_order, reason = nullif(btrim(coalesce(p_reason, '')), ''), risk_metadata_json = coalesce(p_risk_metadata_json, '{}'::jsonb), updated_by_user_id = auth.uid(), updated_at = now() where id = v_id;
  end if;
  perform public.document_platform_audit('agreement_custom_clause', v_id, 'saved', jsonb_build_object('fee_agreement_id', v_agreement.id));
  return v_id;
end;
$$;

create or replace function public.delete_finance_fee_agreement_custom_clause(p_custom_clause_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_agreement_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to delete agreement custom clause'; end if;
  select c.fee_agreement_id into v_agreement_id from public.finance_fee_agreement_custom_clauses c join public.finance_fee_agreements a on a.id = c.fee_agreement_id where c.id = p_custom_clause_id and a.status in ('draft', 'under_review') for update;
  if v_agreement_id is null then raise exception 'Agreement custom clause cannot be deleted'; end if;
  delete from public.finance_fee_agreement_custom_clauses where id = p_custom_clause_id;
  perform public.document_platform_audit('agreement_custom_clause', p_custom_clause_id, 'deleted', jsonb_build_object('fee_agreement_id', v_agreement_id));
end;
$$;

-- Keep the deployed RPC signature while allowing an existing draft to retain a retired version.
-- A retired version can never be newly selected by this save path.
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
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save fee agreement legal terms'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.status not in ('draft', 'under_review') then raise exception 'Only draft or under review fee agreements can be edited'; end if;
  if v_language not in ('th', 'en') then raise exception 'Invalid agreement language'; end if;
  if p_legal_terms_json is not null and jsonb_typeof(p_legal_terms_json) <> 'object' then raise exception 'Legal terms must be an object'; end if;
  if p_signatories_json is not null and jsonb_typeof(p_signatories_json) <> 'array' then raise exception 'Signatories must be an array'; end if;
  if p_custom_clauses_json is not null and jsonb_typeof(p_custom_clauses_json) <> 'array' then raise exception 'Custom clauses must be an array'; end if;

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
      signatories_json = coalesce(p_signatories_json, '[]'::jsonb),
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

create or replace function public.resolve_finance_fee_agreement_document_variables(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_client_signer jsonb; v_firm_signer jsonb; v_value jsonb; v_formatted text;
  v_row record; v_result jsonb := '[]'::jsonb;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  select value into v_client_signer from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) where value->>'party_type' = 'client' limit 1;
  select value into v_firm_signer from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) where value->>'party_type' = 'firm' limit 1;
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
  select count(*) filter (where value->>'party_type' = 'client'), count(*) filter (where value->>'party_type' = 'firm'), count(*) filter (where value->>'party_type' = 'witness') into v_client_count, v_firm_count, v_witness_count from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb));
  if exists (select 1 from jsonb_array_elements(coalesce(v_agreement.signatories_json, '[]'::jsonb)) s where nullif(btrim(coalesce(s.value->>'name', '')), '') is null or s.value->>'party_type' not in ('client', 'firm', 'witness')) then raise exception 'Each signatory requires a name and approved party type'; end if;
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

create or replace function public.save_finance_fee_agreement_clause_slot_selection(
  p_fee_agreement_id uuid, p_alternative_group_id uuid, p_template_slot_id uuid, p_reason text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_group public.document_template_alternative_groups%rowtype; v_slot public.document_template_clause_slots%rowtype; v_id uuid; v_selection_count integer;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to select an alternative clause'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null or v_agreement.status not in ('draft', 'under_review') then raise exception 'Alternative clauses can only be selected while the agreement is draft or under review'; end if;
  select * into v_group from public.document_template_alternative_groups where id = p_alternative_group_id;
  select * into v_slot from public.document_template_clause_slots where id = p_template_slot_id;
  if v_group.id is null or v_slot.id is null or v_group.template_version_id <> v_agreement.selected_template_version_id or v_slot.alternative_group_id <> v_group.id or v_slot.clause_type <> 'alternative' then raise exception 'Alternative selection does not belong to the selected template'; end if;
  if v_slot.clause_version_id is null or not exists (select 1 from public.document_clause_versions cv where cv.id = v_slot.clause_version_id and cv.status = 'published' and cv.language_code = v_agreement.language_code) then raise exception 'Alternative selection requires a published, language-matched clause version'; end if;
  if v_group.default_selected_slot_id is distinct from v_slot.id and nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required when selecting a non-default alternative'; end if;
  select count(*) into v_selection_count from public.finance_fee_agreement_clause_slot_selections where fee_agreement_id = v_agreement.id and alternative_group_id = v_group.id and template_slot_id <> v_slot.id;
  if v_selection_count + 1 > v_group.maximum_selection then raise exception 'Alternative selection exceeds the group maximum'; end if;
  insert into public.finance_fee_agreement_clause_slot_selections(fee_agreement_id, alternative_group_id, template_slot_id, source_clause_version_id, was_default, reason, provenance_json, created_by_user_id, updated_by_user_id)
  values (v_agreement.id, v_group.id, v_slot.id, v_slot.clause_version_id, v_group.default_selected_slot_id = v_slot.id, nullif(btrim(coalesce(p_reason, '')), ''), jsonb_build_object('selection_source', case when v_group.default_selected_slot_id = v_slot.id then 'default_confirmed' else 'user_selected' end), auth.uid(), auth.uid())
  on conflict (fee_agreement_id, alternative_group_id, template_slot_id) do update set reason = excluded.reason, provenance_json = excluded.provenance_json, updated_by_user_id = auth.uid(), updated_at = now()
  returning id into v_id;
  perform public.document_platform_audit('agreement_alternative_selection', v_id, 'saved', jsonb_build_object('fee_agreement_id', v_agreement.id, 'group_code', v_group.group_code));
  return v_id;
end;
$$;

create or replace function public.delete_finance_fee_agreement_clause_slot_selection(p_selection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_agreement_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to delete an alternative selection'; end if;
  select s.fee_agreement_id into v_agreement_id
  from public.finance_fee_agreement_clause_slot_selections s
  join public.finance_fee_agreements a on a.id = s.fee_agreement_id
  where s.id = p_selection_id and a.status in ('draft', 'under_review')
  for update;
  if v_agreement_id is null then raise exception 'Alternative selection cannot be deleted'; end if;
  delete from public.finance_fee_agreement_clause_slot_selections where id = p_selection_id;
  perform public.document_platform_audit('agreement_alternative_selection', p_selection_id, 'deleted', jsonb_build_object('fee_agreement_id', v_agreement_id));
end;
$$;

create or replace function public.resolve_finance_fee_agreement_template_content(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template jsonb; v_sections jsonb; v_flat jsonb; v_definition jsonb; v_variables jsonb; v_facts jsonb;
begin
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.selected_template_version_id is null then return null; end if;
  select definition_json into v_definition
  from public.document_template_versions
  where id = v_agreement.selected_template_version_id;
  v_variables := public.resolve_finance_fee_agreement_document_variables(v_agreement.id);
  v_facts := public.resolve_finance_fee_agreement_condition_facts(v_agreement.id);
  select jsonb_agg(jsonb_build_object(
    'section_id', sec.id, 'section_code', sec.section_code, 'title', sec.title, 'sort_order', sec.sort_order, 'parent_section_id', sec.parent_section_id, 'display_number', sec.display_number, 'display_label', sec.display_label, 'numbering_style', sec.numbering_style, 'numbering_depth', sec.numbering_depth, 'section_kind', sec.section_kind, 'is_required', sec.is_required, 'allow_custom_after', sec.allow_custom_after, 'risk_level', sec.risk_level, 'condition_rule', sec.condition_rule_json, 'condition_evaluation', public.evaluate_document_condition_rule(sec.condition_rule_json, v_facts),
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
      'slot_id', slot.id, 'slot_code', slot.slot_code, 'sort_order', slot.sort_order, 'parent_slot_id', slot.parent_slot_id, 'display_number', slot.display_number, 'display_label', slot.display_label, 'numbering_style', slot.numbering_style, 'numbering_depth', slot.numbering_depth, 'clause_type', slot.clause_type, 'is_required', slot.is_required, 'allow_override', slot.allow_override, 'allow_suppress', slot.allow_suppress, 'allow_custom_after', slot.allow_custom_after, 'risk_level', slot.risk_level, 'condition_rule', slot.condition_rule_json, 'condition_evaluation', public.evaluate_document_condition_rule(slot.condition_rule_json, v_facts),
      'origin_type', case when ov.action = 'suppress' then 'suppressed_template_clause' when ov.action = 'replace' then 'document_override' else 'template_clause' end,
      'source_clause_family_id', cv.clause_id, 'source_clause_version_id', cv.id, 'source_clause_version_no', cv.version_no, 'source_content_hash', cv.content_hash,
      'title', case when ov.action = 'replace' then ov.replacement_title else cv.title end, 'content', case when ov.action = 'replace' then ov.replacement_content else cv.content end,
      'content_hash', case when ov.action = 'replace' then public.document_platform_content_hash(jsonb_build_object('title', ov.replacement_title, 'content', ov.replacement_content)) else cv.content_hash end,
      'suppression_evidence', case when ov.action = 'suppress' then jsonb_build_object('override_id', ov.id, 'reason', ov.reason, 'actor_user_id', ov.created_by_user_id, 'created_at', ov.created_at) else null end,
      'override_evidence', case when ov.action = 'replace' then jsonb_build_object('override_id', ov.id, 'reason', ov.reason, 'actor_user_id', ov.created_by_user_id, 'created_at', ov.created_at, 'risk_metadata', ov.risk_metadata_json) else null end,
      'alternative_selection', case when slot.alternative_group_id is null then null else jsonb_build_object('group_id', grp.id, 'group_code', grp.group_code, 'selection_required', grp.selection_required, 'minimum_selection', grp.minimum_selection, 'maximum_selection', grp.maximum_selection, 'default_slot_id', grp.default_selected_slot_id, 'selected', case when exists (select 1 from public.finance_fee_agreement_clause_slot_selections sel where sel.fee_agreement_id = v_agreement.id and sel.alternative_group_id = grp.id) then exists (select 1 from public.finance_fee_agreement_clause_slot_selections sel where sel.fee_agreement_id = v_agreement.id and sel.alternative_group_id = grp.id and sel.template_slot_id = slot.id) else grp.default_selected_slot_id = slot.id end) end
    ) order by slot.sort_order) from public.document_template_clause_slots slot join public.document_clause_versions cv on cv.id = slot.clause_version_id left join public.finance_fee_agreement_clause_overrides ov on ov.fee_agreement_id = v_agreement.id and ov.template_slot_id = slot.id left join public.document_template_alternative_groups grp on grp.id = slot.alternative_group_id where slot.template_section_id = sec.id), '[]'::jsonb),
    'custom_clauses', coalesce((select jsonb_agg(jsonb_build_object('custom_clause_id', cc.id, 'origin_type', 'document_custom_clause', 'anchor_template_slot_id', cc.anchor_template_slot_id, 'title', cc.title, 'content', cc.content, 'content_hash', public.document_platform_content_hash(jsonb_build_object('title', cc.title, 'content', cc.content)), 'sort_order', cc.sort_order, 'reason', cc.reason, 'risk_metadata', cc.risk_metadata_json, 'actor_user_id', cc.created_by_user_id, 'created_at', cc.created_at) order by cc.sort_order) from public.finance_fee_agreement_custom_clauses cc where cc.fee_agreement_id = v_agreement.id and cc.template_section_id = sec.id), '[]'::jsonb)
  ) order by sec.sort_order) into v_sections from public.document_template_sections sec where sec.template_version_id = v_agreement.selected_template_version_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'section_id', sec.id,
    'section_code', sec.section_code,
    'section_title', sec.title,
    'section_sort_order', sec.sort_order,
    'slot_id', slot.id,
    'slot_code', slot.slot_code,
    'sort_order', slot.sort_order,
    'is_required', slot.is_required,
    'allow_override', slot.allow_override,
    'allow_suppress', slot.allow_suppress,
    'allow_custom_after', slot.allow_custom_after,
    'risk_level', slot.risk_level,
    'origin_type', case when ov.action = 'suppress' then 'suppressed_template_clause' when ov.action = 'replace' then 'document_override' else 'template_clause' end,
    'source_clause_family_id', cv.clause_id,
    'source_clause_version_id', cv.id,
    'source_clause_version_no', cv.version_no,
    'source_content_hash', cv.content_hash,
    'title', case when ov.action = 'replace' then ov.replacement_title else cv.title end,
    'content', case when ov.action = 'replace' then ov.replacement_content else cv.content end,
    'content_hash', case when ov.action = 'replace' then public.document_platform_content_hash(jsonb_build_object('title', ov.replacement_title, 'content', ov.replacement_content)) else cv.content_hash end,
    'suppression_evidence', case when ov.action = 'suppress' then jsonb_build_object('override_id', ov.id, 'reason', ov.reason, 'actor_user_id', ov.created_by_user_id, 'created_at', ov.created_at) else null end,
    'override_evidence', case when ov.action = 'replace' then jsonb_build_object('override_id', ov.id, 'reason', ov.reason, 'actor_user_id', ov.created_by_user_id, 'created_at', ov.created_at, 'risk_metadata', ov.risk_metadata_json) else null end
  ) order by sec.sort_order, slot.sort_order), '[]'::jsonb) into v_flat
  from public.document_template_sections sec
  join public.document_template_clause_slots slot on slot.template_section_id = sec.id
  join public.document_clause_versions cv on cv.id = slot.clause_version_id
  left join public.finance_fee_agreement_clause_overrides ov on ov.fee_agreement_id = v_agreement.id and ov.template_slot_id = slot.id
  where sec.template_version_id = v_agreement.selected_template_version_id;
  -- Preserve the pre-3A definition_json clause list for legacy template versions.
  if v_flat = '[]'::jsonb and jsonb_typeof(v_definition->'clause_version_ids') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'origin_type', 'legacy_template_clause',
      'source_clause_family_id', cv.clause_id,
      'source_clause_version_id', cv.id,
      'source_clause_version_no', cv.version_no,
      'source_content_hash', cv.content_hash,
      'title', cv.title,
      'content', cv.content,
      'content_hash', coalesce(cv.content_hash, public.document_platform_content_hash(jsonb_build_object('title', cv.title, 'content', cv.content))),
      'sort_order', requested.ordinality
    ) order by requested.ordinality), '[]'::jsonb) into v_flat
    from jsonb_array_elements_text(v_definition->'clause_version_ids') with ordinality requested(clause_version_id_text, ordinality)
    join public.document_clause_versions cv on cv.id = requested.clause_version_id_text::uuid;
  end if;
  select jsonb_build_object('template_id', tv.template_id, 'template_version_id', tv.id, 'template_code', t.template_code, 'template_name', t.name, 'language_code', tv.language_code, 'version_no', tv.version_no, 'content_hash', tv.content_hash, 'structure_hash', tv.structure_hash, 'normalized_text_hash', tv.normalized_text_hash, 'renderer_schema_version', tv.renderer_schema_version, 'signature_requirements', tv.signature_requirements_json, 'condition_rule', tv.condition_rule_json, 'condition_evaluation', public.evaluate_document_condition_rule(tv.condition_rule_json, v_facts), 'definition', tv.definition_json, 'sections', coalesce(v_sections, '[]'::jsonb), 'resolved_clause_versions', coalesce(v_flat, '[]'::jsonb), 'variables', v_variables, 'condition_facts', v_facts) into v_template
  from public.document_template_versions tv join public.document_templates t on t.id = tv.template_id where tv.id = v_agreement.selected_template_version_id and tv.template_id = v_agreement.selected_template_id and t.document_type = 'fee_agreement' and tv.language_code = v_agreement.language_code and tv.status in ('published', 'retired');
  if v_template is null then raise exception 'Selected document template version is unavailable'; end if;
  return v_template;
end;
$$;

create or replace function public.build_finance_fee_agreement_document_snapshot(p_fee_agreement_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template jsonb; v_items jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to build fee agreement document snapshot'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  v_template := public.resolve_finance_fee_agreement_template_content(v_agreement.id);
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'source_quotation_item_id', i.source_quotation_item_id, 'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price, 'vat_applicable', i.vat_applicable, 'vat_rate', i.vat_rate, 'amount_before_tax', i.amount_before_tax, 'vat_amount', i.vat_amount, 'line_total', i.line_total, 'tax_category', i.tax_category, 'sort_order', i.sort_order, 'source_item_snapshot', i.item_snapshot_json) order by i.sort_order, i.id), '[]'::jsonb) into v_items from public.finance_fee_agreement_items i where i.fee_agreement_id = v_agreement.id;
  return jsonb_build_object('schema_version', 3, 'resolver_schema_version', 3, 'document_type', 'fee_agreement', 'agreement', jsonb_build_object('id', v_agreement.id, 'agreement_no', v_agreement.agreement_no, 'title', v_agreement.title, 'status', v_agreement.status, 'language_code', v_agreement.language_code, 'effective_date', v_agreement.effective_date, 'commencement_date', v_agreement.commencement_date, 'expiry_date', v_agreement.expiry_date, 'currency', v_agreement.currency, 'totals', jsonb_build_object('amount_before_tax', v_agreement.amount_before_tax, 'vat_amount', v_agreement.vat_amount, 'total_amount', v_agreement.total_amount)), 'source_quotation_snapshot', coalesce(v_agreement.source_document_snapshot_json, '{}'::jsonb), 'agreement_items', v_items, 'commercial_terms', coalesce(v_agreement.commercial_terms_snapshot_json, '{}'::jsonb), 'legal_terms', coalesce(v_agreement.legal_terms_json, '{}'::jsonb), 'signatories', coalesce(v_agreement.signatories_json, '[]'::jsonb), 'custom_clauses', coalesce(v_agreement.custom_clauses_json, '[]'::jsonb), 'template', v_template, 'source_snapshots', jsonb_build_object('client', coalesce(v_agreement.client_snapshot_json, '{}'::jsonb), 'matter', coalesce(v_agreement.matter_snapshot_json, '{}'::jsonb), 'company', coalesce(v_agreement.company_snapshot_json, '{}'::jsonb)));
end;
$$;

create or replace function public.approve_retired_template_use_for_fee_agreement(p_fee_agreement_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_retired boolean;
begin
  if not public.current_user_is_document_platform_partner() then raise exception 'Only a Partner can approve continued use of a retired template'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null or v_agreement.status not in ('draft', 'under_review') or v_agreement.selected_template_version_id is null then raise exception 'Fee agreement is not eligible for retired template approval'; end if;
  select tv.status = 'retired' or t.status = 'retired' into v_retired from public.document_template_versions tv join public.document_templates t on t.id = tv.template_id where tv.id = v_agreement.selected_template_version_id;
  if not coalesce(v_retired, false) or btrim(coalesce(p_reason, '')) = '' then raise exception 'A reason is required to approve continued use of a retired template'; end if;
  update public.finance_fee_agreements set retired_template_use_approved_version_id = v_agreement.selected_template_version_id, retired_template_use_approved_by_user_id = auth.uid(), retired_template_use_approved_at = now(), retired_template_use_reason = btrim(p_reason), updated_by_user_id = auth.uid(), updated_at = now() where id = v_agreement.id;
  perform public.document_platform_audit('template_version', v_agreement.selected_template_version_id, 'approved_retired_use', jsonb_build_object('fee_agreement_id', v_agreement.id, 'reason', btrim(p_reason)));
  return v_agreement.id;
end;
$$;

create or replace function public.set_finance_fee_agreement_status(p_fee_agreement_id uuid, p_next_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_next text := lower(btrim(coalesce(p_next_status, ''))); v_event text; v_retired boolean;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update finance fee agreement status'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if not ((v_agreement.status = 'draft' and v_next in ('under_review', 'cancelled')) or (v_agreement.status = 'under_review' and v_next in ('sent', 'cancelled')) or (v_agreement.status = 'sent' and v_next in ('signed', 'cancelled')) or (v_agreement.status = 'signed' and v_next = 'completed') or (v_agreement.status = 'draft' and v_next = 'active') or (v_agreement.status = 'active' and v_next in ('completed', 'cancelled'))) then raise exception 'Invalid finance fee agreement status transition'; end if;
  if v_next in ('under_review', 'sent', 'active') and (v_agreement.source_document_snapshot_json is null or v_agreement.commercial_terms_snapshot_json is null) then raise exception 'Fee agreement source evidence is required'; end if;
  if v_next = 'sent' and (v_agreement.agreement_no is null or v_agreement.legal_terms_json is null or v_agreement.signatories_json is null) then raise exception 'Fee agreement legal document data is not ready'; end if;
  if v_next = 'sent' and v_agreement.selected_template_version_id is not null then
    perform public.validate_finance_fee_agreement_template_ready(v_agreement.id);
    select tv.status = 'retired' or t.status = 'retired' into v_retired from public.document_template_versions tv join public.document_templates t on t.id = tv.template_id where tv.id = v_agreement.selected_template_version_id;
    if coalesce(v_retired, false) and (v_agreement.retired_template_use_approved_version_id is distinct from v_agreement.selected_template_version_id or v_agreement.retired_template_use_approved_by_user_id is null or nullif(btrim(coalesce(v_agreement.retired_template_use_reason, '')), '') is null) then raise exception 'Partner approval is required before sending an agreement that uses a retired template version'; end if;
  end if;
  if v_next = 'cancelled' and exists (select 1 from public.finance_billing_plans where fee_agreement_id = v_agreement.id and status <> 'cancelled') then raise exception 'Cancel the Billing Plan before cancelling this agreement'; end if;
  update public.finance_fee_agreements set status = v_next, sent_at = case when v_next = 'sent' then now() else sent_at end, sent_by_user_id = case when v_next = 'sent' then auth.uid() else sent_by_user_id end, signed_at = case when v_next = 'signed' then now() else signed_at end, signed_by_user_id = case when v_next = 'signed' then auth.uid() else signed_by_user_id end, cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end, cancelled_by_user_id = case when v_next = 'cancelled' then auth.uid() else cancelled_by_user_id end, updated_by_user_id = auth.uid(), updated_at = now() where id = v_agreement.id;
  v_event := v_next;
  perform public.record_finance_fee_agreement_version(v_agreement.id, v_event, null, jsonb_build_object('from_status', v_agreement.status, 'to_status', v_next));
  return v_agreement.id;
end;
$$;

alter table public.document_template_sections enable row level security;
alter table public.document_template_clause_slots enable row level security;
alter table public.document_template_alternative_groups enable row level security;
alter table public.document_variable_definitions enable row level security;
alter table public.document_template_variable_bindings enable row level security;
alter table public.document_clause_version_variable_bindings enable row level security;
alter table public.finance_fee_agreement_clause_slot_selections enable row level security;
alter table public.finance_fee_agreement_clause_overrides enable row level security;
alter table public.finance_fee_agreement_custom_clauses enable row level security;
alter table public.document_template_audit_events enable row level security;

drop policy if exists "finance managers select template sections" on public.document_template_sections;
create policy "finance managers select template sections" on public.document_template_sections for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select template slots" on public.document_template_clause_slots;
create policy "finance managers select template slots" on public.document_template_clause_slots for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select alternative groups" on public.document_template_alternative_groups;
create policy "finance managers select alternative groups" on public.document_template_alternative_groups for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select document variables" on public.document_variable_definitions;
create policy "finance managers select document variables" on public.document_variable_definitions for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select template variable bindings" on public.document_template_variable_bindings;
create policy "finance managers select template variable bindings" on public.document_template_variable_bindings for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select clause variable bindings" on public.document_clause_version_variable_bindings;
create policy "finance managers select clause variable bindings" on public.document_clause_version_variable_bindings for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select agreement alternative selections" on public.finance_fee_agreement_clause_slot_selections;
create policy "finance managers select agreement alternative selections" on public.finance_fee_agreement_clause_slot_selections for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select fee agreement clause overrides" on public.finance_fee_agreement_clause_overrides;
create policy "finance managers select fee agreement clause overrides" on public.finance_fee_agreement_clause_overrides for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select fee agreement custom clauses" on public.finance_fee_agreement_custom_clauses;
create policy "finance managers select fee agreement custom clauses" on public.finance_fee_agreement_custom_clauses for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select template audit events" on public.document_template_audit_events;
create policy "finance managers select template audit events" on public.document_template_audit_events for select using (public.current_user_can_manage_finance_quotations());

revoke all on function public.document_platform_content_hash(jsonb) from public, anon, authenticated;
revoke all on function public.document_condition_fact_type(text) from public, anon, authenticated;
revoke all on function public.validate_document_condition_rule(jsonb, integer) from public, anon, authenticated;
revoke all on function public.validate_document_signature_requirements(jsonb) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_condition_facts(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_document_condition_rule(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_document_variables(uuid) from public, anon, authenticated;
revoke all on function public.validate_finance_fee_agreement_template_ready(uuid) from public, anon, authenticated;
revoke all on function public.current_user_is_document_platform_partner() from public, anon, authenticated;
revoke all on function public.document_platform_audit(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.document_template_version_is_draft(uuid) from public, anon, authenticated;
revoke all on function public.enforce_document_template_structure_mutability() from public, anon, authenticated;
revoke all on function public.enforce_document_template_version_child_mutability() from public, anon, authenticated;
revoke all on function public.enforce_document_clause_version_binding_mutability() from public, anon, authenticated;
revoke all on function public.enforce_document_variable_definition_key_immutability() from public, anon, authenticated;
revoke all on function public.validate_document_template_section() from public, anon, authenticated;
revoke all on function public.validate_document_template_clause_slot() from public, anon, authenticated;
revoke all on function public.validate_document_template_alternative_group() from public, anon, authenticated;
revoke all on function public.enforce_document_template_version_immutability() from public, anon, authenticated;
revoke all on function public.enforce_document_clause_version_immutability() from public, anon, authenticated;
revoke all on function public.compute_document_template_version_content_hash(uuid) from public, anon, authenticated;
revoke all on function public.compute_document_template_version_structure_hash(uuid) from public, anon, authenticated;
revoke all on function public.compute_document_template_version_normalized_text_hash(uuid) from public, anon, authenticated;
revoke all on function public.resolve_finance_fee_agreement_template_content(uuid) from public, anon, authenticated;
revoke all on function public.build_finance_fee_agreement_document_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.record_finance_fee_agreement_version(uuid, text, text, jsonb) from public, anon, authenticated;

revoke all on function public.save_document_template_family_draft(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.save_document_template_version_draft(uuid, uuid, text, jsonb, date, date) from public, anon;
revoke all on function public.replace_document_template_draft_structure(uuid, jsonb) from public, anon;
revoke all on function public.save_document_clause_family_draft(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.save_document_clause_version_draft(uuid, uuid, text, text, text, jsonb, date, date) from public, anon;
revoke all on function public.save_document_template_alternative_group_draft(uuid, uuid, text, text, integer, integer, boolean, uuid, jsonb, text, integer, jsonb) from public, anon;
revoke all on function public.save_document_template_section_draft(uuid, uuid, text, text, integer, uuid, text, text, text, integer, text, jsonb, boolean, boolean, text, jsonb) from public, anon;
revoke all on function public.save_document_template_clause_slot_draft(uuid, uuid, text, uuid, integer, uuid, text, text, text, integer, text, uuid, jsonb, boolean, boolean, boolean, boolean, text, jsonb) from public, anon;
revoke all on function public.save_document_template_variable_binding_draft(uuid, uuid, uuid, boolean, jsonb, text, jsonb) from public, anon;
revoke all on function public.save_document_clause_variable_binding_draft(uuid, uuid, uuid, boolean, jsonb, text, jsonb) from public, anon;
revoke all on function public.set_document_template_version_status(uuid, text, text, text) from public, anon;
revoke all on function public.set_document_clause_version_status(uuid, text, text, text) from public, anon;
revoke all on function public.save_finance_fee_agreement_clause_override(uuid, uuid, uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.delete_finance_fee_agreement_clause_override(uuid) from public, anon;
revoke all on function public.save_finance_fee_agreement_custom_clause(uuid, uuid, uuid, uuid, text, text, integer, text, jsonb) from public, anon;
revoke all on function public.delete_finance_fee_agreement_custom_clause(uuid) from public, anon;
revoke all on function public.save_finance_fee_agreement_clause_slot_selection(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.delete_finance_fee_agreement_clause_slot_selection(uuid) from public, anon;
revoke all on function public.approve_retired_template_use_for_fee_agreement(uuid, text) from public, anon;
revoke all on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) from public, anon;

grant execute on function public.save_document_template_family_draft(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.save_document_template_version_draft(uuid, uuid, text, jsonb, date, date) to authenticated;
grant execute on function public.replace_document_template_draft_structure(uuid, jsonb) to authenticated;
grant execute on function public.save_document_clause_family_draft(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.save_document_clause_version_draft(uuid, uuid, text, text, text, jsonb, date, date) to authenticated;
grant execute on function public.save_document_template_alternative_group_draft(uuid, uuid, text, text, integer, integer, boolean, uuid, jsonb, text, integer, jsonb) to authenticated;
grant execute on function public.save_document_template_section_draft(uuid, uuid, text, text, integer, uuid, text, text, text, integer, text, jsonb, boolean, boolean, text, jsonb) to authenticated;
grant execute on function public.save_document_template_clause_slot_draft(uuid, uuid, text, uuid, integer, uuid, text, text, text, integer, text, uuid, jsonb, boolean, boolean, boolean, boolean, text, jsonb) to authenticated;
grant execute on function public.save_document_template_variable_binding_draft(uuid, uuid, uuid, boolean, jsonb, text, jsonb) to authenticated;
grant execute on function public.save_document_clause_variable_binding_draft(uuid, uuid, uuid, boolean, jsonb, text, jsonb) to authenticated;
grant execute on function public.set_document_template_version_status(uuid, text, text, text) to authenticated;
grant execute on function public.set_document_clause_version_status(uuid, text, text, text) to authenticated;
grant execute on function public.save_finance_fee_agreement_clause_override(uuid, uuid, uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.delete_finance_fee_agreement_clause_override(uuid) to authenticated;
grant execute on function public.save_finance_fee_agreement_custom_clause(uuid, uuid, uuid, uuid, text, text, integer, text, jsonb) to authenticated;
grant execute on function public.delete_finance_fee_agreement_custom_clause(uuid) to authenticated;
grant execute on function public.save_finance_fee_agreement_clause_slot_selection(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.delete_finance_fee_agreement_clause_slot_selection(uuid) to authenticated;
grant execute on function public.approve_retired_template_use_for_fee_agreement(uuid, text) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
