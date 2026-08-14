-- SELECT-only verification for 202607180003_complete_fee_agreement_renderer_foundation.sql

with target as (
  select tv.id as template_version_id
  from public.document_template_versions as tv
  join public.document_templates as template on template.id = tv.template_id
  where template.document_type = 'fee_agreement'
    and template.template_code = 'VP-FA-LEGAL-SERVICES'
    and tv.version_no = 1
    and tv.language_code = 'th'
)
select
  template.template_code,
  template.status as template_status,
  template.metadata_json,
  tv.version_no,
  tv.status as version_status,
  tv.renderer_schema_version,
  tv.definition_json,
  tv.signature_requirements_json,
  count(distinct section.id) as section_count,
  count(distinct slot.id) as slot_count
from target
join public.document_template_versions as tv on tv.id = target.template_version_id
join public.document_templates as template on template.id = tv.template_id
left join public.document_template_sections as section on section.template_version_id = tv.id
left join public.document_template_clause_slots as slot on slot.template_section_id = section.id
group by template.template_code, template.status, template.metadata_json, tv.version_no,
  tv.status, tv.renderer_schema_version, tv.definition_json, tv.signature_requirements_json;

with target as (
  select tv.id as template_version_id
  from public.document_template_versions as tv
  join public.document_templates as template on template.id = tv.template_id
  where template.document_type = 'fee_agreement'
    and template.template_code = 'VP-FA-LEGAL-SERVICES'
    and tv.version_no = 1
    and tv.language_code = 'th'
)
select
  section.sort_order,
  section.section_code,
  section.section_kind,
  section.is_required,
  count(slot.id) as slot_count,
  array_remove(array_agg(slot.slot_code order by slot.sort_order), null) as slot_codes,
  array_remove(array_agg(clause.clause_code order by slot.sort_order), null) as clause_codes,
  array_remove(array_agg(version.status order by slot.sort_order), null) as clause_statuses,
  array_remove(array_agg(version.language_code order by slot.sort_order), null) as clause_languages
from target
join public.document_template_sections as section on section.template_version_id = target.template_version_id
left join public.document_template_clause_slots as slot on slot.template_section_id = section.id
left join public.document_clause_versions as version on version.id = slot.clause_version_id
left join public.document_clause_libraries as clause on clause.id = version.clause_id
group by section.sort_order, section.section_code, section.section_kind, section.is_required
order by section.sort_order;

with expected(variable_key) as (
  values
    ('AGREEMENT_TITLE'), ('AGREEMENT_NO'), ('AGREEMENT_DATE'), ('EFFECTIVE_DATE'),
    ('CLIENT_NAME'), ('CLIENT_ADDRESS'), ('CLIENT_TAX_ID'),
    ('CLIENT_SIGNATORY_NAME'), ('CLIENT_SIGNATORY_TITLE'),
    ('LAW_FIRM_NAME'), ('LAW_FIRM_ADDRESS'), ('LAW_FIRM_TAX_ID'),
    ('LAW_FIRM_SIGNATORY_NAME'), ('LAW_FIRM_SIGNATORY_TITLE'),
    ('SOURCE_QUOTATION_NO'), ('MATTER_NAME')
), target as (
  select tv.id as template_version_id
  from public.document_template_versions as tv
  join public.document_templates as template on template.id = tv.template_id
  where template.document_type = 'fee_agreement'
    and template.template_code = 'VP-FA-LEGAL-SERVICES'
    and tv.version_no = 1
    and tv.language_code = 'th'
), actual as (
  select definition.variable_key, binding.is_required, binding.metadata_json
  from target
  join public.document_template_variable_bindings as binding on binding.template_version_id = target.template_version_id
  join public.document_variable_definitions as definition on definition.id = binding.variable_definition_id
)
select
  expected.variable_key,
  actual.variable_key is not null as binding_present,
  actual.is_required,
  actual.metadata_json
from expected
left join actual using (variable_key)
order by expected.variable_key;

select
  routine.proname as function_name,
  pg_get_function_identity_arguments(routine.oid) as function_arguments,
  routine.prosecdef as security_definer,
  routine.proconfig as function_config,
  'search_path=public' = any(coalesce(routine.proconfig, array[]::text[])) as fixed_public_search_path,
  has_function_privilege('anon', routine.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', routine.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc as routine
join pg_namespace as namespace on namespace.oid = routine.pronamespace
where namespace.nspname = 'public'
  and routine.proname in (
    'finance_fee_agreement_signatory_party_type',
    'normalize_finance_fee_agreement_signatories',
    'save_finance_fee_agreement_draft_legal_terms',
    'resolve_finance_fee_agreement_condition_facts',
    'resolve_finance_fee_agreement_document_variables',
    'validate_finance_fee_agreement_template_ready',
    'get_finance_fee_agreement_template_preview',
    'set_document_template_version_status'
  )
order by routine.proname;

select
  position('Inactive template shells cannot be published' in pg_get_functiondef(routine.oid)) > 0 as inactive_shell_guard_present,
  position('Approved legal wording is required before publication' in pg_get_functiondef(routine.oid)) > 0 as wording_approval_guard_present,
  'search_path=public' = any(coalesce(routine.proconfig, array[]::text[])) as fixed_public_search_path_present
from pg_proc as routine
join pg_namespace as namespace on namespace.oid = routine.pronamespace
where namespace.nspname = 'public'
  and routine.proname = 'set_document_template_version_status'
  and pg_get_function_identity_arguments(routine.oid) = 'p_template_version_id uuid, p_next_status text, p_approval_note text, p_approval_reference text';
