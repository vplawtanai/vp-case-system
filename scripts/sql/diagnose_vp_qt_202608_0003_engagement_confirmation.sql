-- READ-ONLY Production diagnostic for accepted-Quotation engagement confirmation.
-- Returns exactly one result table and does not invoke any mutating RPC.

with target as (
  select 'VP-QT-202608-0003'::text as quotation_no
),
quotation as (
  select quotation.*
  from target
  left join public.finance_quotations as quotation
    on quotation.quotation_no = target.quotation_no
),
snapshot_items as (
  select
    quotation.id as quotation_id,
    item.value as item_json,
    item.ordinality as item_ordinal
  from quotation
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(quotation.document_data_snapshot_json->'items') = 'array'
      then quotation.document_data_snapshot_json->'items'
      else '[]'::jsonb
    end
  ) with ordinality as item(value, ordinality)
),
catalog_evidence as (
  select
    exists (
      select 1
      from pg_trigger as trigger_record
      where trigger_record.tgrelid = 'public.finance_fee_agreements'::regclass
        and trigger_record.tgname = 'finance_fee_agreements_default_agreement_date'
        and not trigger_record.tgisinternal
        and trigger_record.tgenabled <> 'D'
    ) as agreement_date_trigger_enabled,
    coalesce((
      select position(
        'engagement_basis' in lower(pg_get_functiondef(procedure_record.oid))
      ) > 0
      from pg_proc as procedure_record
      join pg_namespace as procedure_namespace
        on procedure_namespace.oid = procedure_record.pronamespace
      where procedure_namespace.nspname = 'public'
        and procedure_record.proname = 'default_finance_fee_agreement_agreement_date'
        and pg_get_function_identity_arguments(procedure_record.oid) = ''
    ), false) as agreement_date_trigger_is_basis_aware,
    coalesce((
      select position(
        'agreement_date is null' in lower(pg_get_constraintdef(constraint_record.oid))
      ) > 0
      from pg_constraint as constraint_record
      where constraint_record.conrelid = 'public.finance_fee_agreements'::regclass
        and constraint_record.conname = 'finance_fee_agreements_engagement_basis_state_check'
    ), false) as accepted_basis_requires_null_agreement_date
)
select
  'ACCEPTED_QUOTATION_ENGAGEMENT_DIAGNOSTIC'::text as report_section,
  target.quotation_no as requested_quotation_no,
  quotation.id as quotation_id,
  quotation.quotation_no,
  quotation.status as quotation_status,
  quotation.client_id,
  client.name as client_name,
  quotation.case_id,
  case_record.file_no as case_file_no,
  case_record.title as case_title,
  quotation.advisory_matter_id,
  advisory.matter_no as advisory_matter_no,
  advisory.title as advisory_title,
  jsonb_typeof(quotation.document_data_snapshot_json) = 'object' as snapshot_is_object,
  quotation.document_data_snapshot_json->>'version' as snapshot_version,
  quotation.document_data_snapshot_json->>'frozen_at' as snapshot_frozen_at,
  jsonb_typeof(quotation.document_data_snapshot_json->'items') as snapshot_items_type,
  case
    when jsonb_typeof(quotation.document_data_snapshot_json->'items') = 'array'
    then jsonb_array_length(quotation.document_data_snapshot_json->'items')
    else null
  end as snapshot_item_count,
  jsonb_typeof(quotation.document_data_snapshot_json->'payment_terms') as snapshot_payment_terms_type,
  jsonb_typeof(quotation.document_data_snapshot_json->'totals') as snapshot_totals_type,
  quotation.document_data_snapshot_json->'matter' as frozen_matter_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', agreement.id,
      'agreement_no', agreement.agreement_no,
      'status', agreement.status,
      'engagement_basis', agreement.engagement_basis,
      'created_at', agreement.created_at,
      'agreement_date', agreement.agreement_date,
      'document_version', agreement.document_version,
      'selected_template_id', agreement.selected_template_id,
      'selected_template_version_id', agreement.selected_template_version_id,
      'engagement_confirmed_on', agreement.engagement_confirmed_on,
      'engagement_confirmation_channel', agreement.engagement_confirmation_channel
    ) order by agreement.created_at, agreement.id)
    from public.finance_fee_agreements as agreement
    where agreement.source_type = 'quotation'
      and agreement.source_quotation_id = quotation.id
  ), '[]'::jsonb) as existing_fee_agreements,
  (
    select count(*)
    from public.finance_fee_agreements as agreement
    where agreement.source_type = 'quotation'
      and agreement.source_quotation_id = quotation.id
      and agreement.status <> 'cancelled'
  ) as non_cancelled_engagement_count,
  (
    select count(*)
    from public.finance_quotation_items as item
    where item.quotation_id = quotation.id
  ) as live_quotation_item_count,
  (
    select count(*)
    from snapshot_items as item
    where nullif(btrim(coalesce(item.item_json->>'description', '')), '') is null
      or coalesce(item.item_json->>'quotation_item_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(item.item_json->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'unit_price', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'amount_before_tax', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'vat_applicable', '') not in ('true', 'false')
      or coalesce(item.item_json->>'vat_rate', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'vat_amount', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'line_total', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(item.item_json->>'sort_order', '') !~ '^[0-9]+$'
  ) as snapshot_item_shape_issue_count,
  (
    select count(*)
    from snapshot_items as snapshot_item
    where not exists (
      select 1
      from public.finance_quotation_items as live_item
      where live_item.quotation_id = quotation.id
        and live_item.id::text = snapshot_item.item_json->>'quotation_item_id'
    )
  ) as snapshot_item_missing_live_source_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'ordinal', item.item_ordinal,
      'quotation_item_id', item.item_json->>'quotation_item_id',
      'description', item.item_json->>'description',
      'quantity', item.item_json->>'quantity',
      'unit_price', item.item_json->>'unit_price',
      'amount_before_tax', item.item_json->>'amount_before_tax',
      'vat_applicable', item.item_json->>'vat_applicable',
      'vat_rate', item.item_json->>'vat_rate',
      'vat_amount', item.item_json->>'vat_amount',
      'line_total', item.item_json->>'line_total',
      'sort_order', item.item_json->>'sort_order'
    ) order by item.item_ordinal)
    from snapshot_items as item
  ), '[]'::jsonb) as frozen_item_evidence,
  catalog_evidence.agreement_date_trigger_enabled,
  catalog_evidence.agreement_date_trigger_is_basis_aware,
  catalog_evidence.accepted_basis_requires_null_agreement_date,
  (
    catalog_evidence.agreement_date_trigger_enabled
    and not catalog_evidence.agreement_date_trigger_is_basis_aware
    and catalog_evidence.accepted_basis_requires_null_agreement_date
  ) as confirmed_migration_015_agreement_date_conflict,
  case
    when quotation.id is null then 'FAIL: quotation not found'
    when quotation.status <> 'accepted' then 'FAIL: quotation is not Accepted'
    when quotation.client_id is null then 'FAIL: Client is not linked'
    when client.id is null then 'FAIL: linked Client does not exist'
    when quotation.case_id is not null and case_record.id is null then 'FAIL: linked Case does not exist'
    when quotation.advisory_matter_id is not null and advisory.id is null then 'FAIL: linked Advisory matter does not exist'
    when quotation.document_data_snapshot_json is null
      or quotation.document_data_snapshot_json->>'frozen_at' is null
      or jsonb_typeof(quotation.document_data_snapshot_json->'items') <> 'array'
      or jsonb_typeof(quotation.document_data_snapshot_json->'payment_terms') <> 'object'
      then 'FAIL: frozen quotation snapshot is incomplete'
    when (
      select count(*)
      from public.finance_fee_agreements as agreement
      where agreement.source_type = 'quotation'
        and agreement.source_quotation_id = quotation.id
        and agreement.status <> 'cancelled'
    ) > 0 then 'BLOCKED: a non-cancelled commercial engagement already exists'
    when catalog_evidence.agreement_date_trigger_enabled
      and not catalog_evidence.agreement_date_trigger_is_basis_aware
      and catalog_evidence.accepted_basis_requires_null_agreement_date
      then 'BLOCKED: agreement-date trigger conflicts with accepted-Quotation state constraint'
    else 'READY: no diagnosed data or catalog blocker'
  end as diagnostic_summary
from target
left join quotation on true
left join public.clients as client on client.id = quotation.client_id
left join public.cases as case_record on case_record.id = quotation.case_id
left join public.advisory_matters as advisory on advisory.id = quotation.advisory_matter_id
cross join catalog_evidence;
