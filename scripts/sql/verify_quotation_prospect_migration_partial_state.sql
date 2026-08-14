-- SELECT-only Production check for partial effects from migration 202607180004.
-- Run this after the failed apply and before retrying the corrected migration.
with expected_columns(column_name) as (
  values
    ('customer_source_type'),
    ('prospect_name'),
    ('prospect_contact_person'),
    ('prospect_phone'),
    ('prospect_email'),
    ('prospect_tax_id'),
    ('prospect_address'),
    ('matter_source_type'),
    ('unlinked_matter_name'),
    ('unlinked_matter_description'),
    ('client_linked_at'),
    ('client_linked_by_user_id'),
    ('matter_linked_at'),
    ('matter_linked_by_user_id')
),
column_checks as (
  select
    'COLUMN'::text as object_type,
    'public.finance_quotations.' || expected.column_name as object_name,
    (attribute.attname is not null) as present,
    case when attribute.attname is null then 'not present' else format('type=%s nullable=%s', format_type(attribute.atttypid, attribute.atttypmod), not attribute.attnotnull) end as details
  from expected_columns expected
  left join pg_catalog.pg_class relation
    on relation.oid = to_regclass('public.finance_quotations')
  left join pg_catalog.pg_attribute attribute
    on attribute.attrelid = relation.oid
   and attribute.attname = expected.column_name
   and attribute.attnum > 0
   and not attribute.attisdropped
),
client_nullability_check as (
  select
    'COLUMN_CHANGE'::text as object_type,
    'public.finance_quotations.client_id nullable'::text as object_name,
    coalesce(not attribute.attnotnull, false) as present,
    case
      when attribute.attname is null then 'client_id not found'
      when attribute.attnotnull then 'still NOT NULL'
      else 'NULL allowed'
    end as details
  from pg_catalog.pg_class relation
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = relation.oid
   and attribute.attname = 'client_id'
   and attribute.attnum > 0
   and not attribute.attisdropped
  where relation.oid = to_regclass('public.finance_quotations')
),
constraint_checks as (
  select
    'CONSTRAINT'::text as object_type,
    expected.constraint_name as object_name,
    (constraint_record.oid is not null) as present,
    coalesce(pg_get_constraintdef(constraint_record.oid), 'not present') as details
  from (values
    ('finance_quotations_customer_source_type_check'),
    ('finance_quotations_matter_source_type_check'),
    ('finance_quotations_customer_identity_check')
  ) expected(constraint_name)
  left join pg_catalog.pg_constraint constraint_record
    on constraint_record.conrelid = to_regclass('public.finance_quotations')
   and constraint_record.conname = expected.constraint_name
),
index_checks as (
  select
    'INDEX'::text as object_type,
    expected.index_name as object_name,
    (to_regclass('public.' || expected.index_name) is not null) as present,
    coalesce(pg_get_indexdef(to_regclass('public.' || expected.index_name)), 'not present') as details
  from (values
    ('idx_finance_quotations_customer_source_type'),
    ('idx_finance_quotations_matter_source_type')
  ) expected(index_name)
),
function_checks as (
  select
    'FUNCTION'::text as object_type,
    expected.function_signature as object_name,
    (to_regprocedure(expected.function_signature) is not null) as present,
    case
      when to_regprocedure(expected.function_signature) is null then 'not present'
      else format(
        'security_definer=%s search_path=%s',
        function_record.prosecdef,
        coalesce(array_to_string(function_record.proconfig, ', '), '(not fixed)')
      )
    end as details
  from (values
    ('public.normalize_finance_quotation_party_context()'),
    ('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)'),
    ('public.set_finance_quotation_status_v2(uuid,text,text,uuid,text,text)'),
    ('public.link_finance_quotation_master_records(uuid,uuid,bigint,uuid)'),
    ('public.create_finance_fee_agreement_from_quotation_v2(uuid)')
  ) expected(function_signature)
  left join pg_catalog.pg_proc function_record
    on function_record.oid = to_regprocedure(expected.function_signature)
),
trigger_check as (
  select
    'TRIGGER'::text as object_type,
    'finance_quotation_party_context_before_write'::text as object_name,
    exists (
      select 1
      from pg_catalog.pg_trigger trigger_record
      where trigger_record.tgrelid = to_regclass('public.finance_quotations')
        and trigger_record.tgname = 'finance_quotation_party_context_before_write'
        and not trigger_record.tgisinternal
    ) as present,
    coalesce((
      select pg_get_triggerdef(trigger_record.oid)
      from pg_catalog.pg_trigger trigger_record
      where trigger_record.tgrelid = to_regclass('public.finance_quotations')
        and trigger_record.tgname = 'finance_quotation_party_context_before_write'
        and not trigger_record.tgisinternal
    ), 'not present') as details
),
freeze_function_check as (
  select
    'FUNCTION_BODY_MARKER'::text as object_type,
    'public.freeze_finance_quotation_commercial_terms_v2() prospect fallback'::text as object_name,
    coalesce(pg_get_functiondef(function_record.oid) like '%new.client_snapshot_json%', false) as present,
    case
      when function_record.oid is null then 'function not present'
      when pg_get_functiondef(function_record.oid) like '%new.client_snapshot_json%' then '180004 prospect fallback body is present'
      else 'pre-180004 body is present'
    end as details
  from (select to_regprocedure('public.freeze_finance_quotation_commercial_terms_v2()') as oid) function_oid
  left join pg_catalog.pg_proc function_record on function_record.oid = function_oid.oid
),
all_checks as (
  select * from column_checks
  union all select * from client_nullability_check
  union all select * from constraint_checks
  union all select * from index_checks
  union all select * from function_checks
  union all select * from trigger_check
  union all select * from freeze_function_check
),
summary as (
  select
    'SUMMARY'::text as object_type,
    '202607180004 failed-apply state'::text as object_name,
    bool_or(present) as present,
    case
      when not bool_or(present) then 'NO UNIQUE 180004 EFFECTS DETECTED'
      when bool_and(present) then 'ALL CHECKED 180004 EFFECTS PRESENT'
      else 'PARTIAL 180004 EFFECTS DETECTED'
    end as details
  from all_checks
)
select object_type, object_name, present, details
from (
  select 0 as sort_group, * from summary
  union all
  select 1 as sort_group, * from all_checks
) report
order by sort_group, object_type, object_name;
