-- Result 1: the complete approved wording attached to VP-FA-LEGAL-SERVICES v1.
with attached_clauses as (
  select
    dt.id as template_id,
    dt.template_code,
    dt.name as template_name,
    dtv.id as template_version_id,
    dtv.version_no as template_version_no,
    dtv.language_code as template_language,
    dts.id as section_id,
    dts.sort_order as section_order,
    dts.section_code,
    dts.title as section_title,
    dts.display_number as section_display_number,
    dtcs.id as slot_id,
    dtcs.sort_order as slot_order,
    dtcs.slot_code,
    dcl.id as clause_id,
    dcl.clause_code,
    dcv.id as clause_version_id,
    dcv.version_no as clause_version_no,
    dcv.language_code,
    dcv.status as clause_version_status,
    dcv.title as clause_title,
    dcv.content as approved_clause_body
  from public.document_templates as dt
  join public.document_template_versions as dtv
    on dtv.template_id = dt.id
  join public.document_template_sections as dts
    on dts.template_version_id = dtv.id
  join public.document_template_clause_slots as dtcs
    on dtcs.template_section_id = dts.id
  join public.document_clause_versions as dcv
    on dcv.id = dtcs.clause_version_id
  join public.document_clause_libraries as dcl
    on dcl.id = dcv.clause_id
  where dt.template_code = 'VP-FA-LEGAL-SERVICES'
    and dtv.version_no = 1
    and dtv.language_code = 'th'
    and dcv.status = 'published'
)
select
  'ATTACHED_PUBLISHED_CLAUSE_BODIES' as report_section,
  count(*) over () as attached_clause_count,
  template_id,
  template_code,
  template_name,
  template_version_id,
  template_version_no,
  template_language,
  section_id,
  section_order,
  section_code,
  section_title,
  section_display_number,
  slot_id,
  slot_order,
  slot_code,
  clause_id,
  clause_code,
  clause_version_id,
  clause_version_no,
  language_code,
  clause_version_status,
  clause_title,
  approved_clause_body
from attached_clauses
order by section_order, slot_order, clause_code, clause_version_no;

-- Result 2: full wording for attached clauses containing each review term.
with attached_clauses as (
  select
    dts.sort_order as section_order,
    dts.section_code,
    dts.title as section_title,
    dtcs.sort_order as slot_order,
    dtcs.slot_code,
    dcl.clause_code,
    dcv.id as clause_version_id,
    dcv.version_no as clause_version_no,
    dcv.language_code,
    dcv.title as clause_title,
    dcv.content as approved_clause_body
  from public.document_templates as dt
  join public.document_template_versions as dtv
    on dtv.template_id = dt.id
  join public.document_template_sections as dts
    on dts.template_version_id = dtv.id
  join public.document_template_clause_slots as dtcs
    on dtcs.template_section_id = dts.id
  join public.document_clause_versions as dcv
    on dcv.id = dtcs.clause_version_id
  join public.document_clause_libraries as dcl
    on dcl.id = dcv.clause_id
  where dt.template_code = 'VP-FA-LEGAL-SERVICES'
    and dtv.version_no = 1
    and dtv.language_code = 'th'
    and dcv.status = 'published'
),
review_terms(search_order, search_term) as (
  values
    (1, 'ลูกค้า'),
    (2, 'สำนักงาน'),
    (3, 'Template')
)
select
  'CLAUSE_BODY_TERM_REVIEW' as report_section,
  rt.search_term as matched_term,
  ac.section_order,
  ac.section_code,
  ac.section_title,
  ac.slot_order,
  ac.slot_code,
  ac.clause_code,
  ac.clause_version_id,
  ac.clause_version_no,
  ac.language_code,
  ac.clause_title,
  ac.approved_clause_body
from attached_clauses as ac
cross join review_terms as rt
where strpos(lower(ac.approved_clause_body), lower(rt.search_term)) > 0
   or strpos(lower(ac.clause_title), lower(rt.search_term)) > 0
order by rt.search_order, ac.section_order, ac.slot_order, ac.clause_code, ac.clause_version_no;
