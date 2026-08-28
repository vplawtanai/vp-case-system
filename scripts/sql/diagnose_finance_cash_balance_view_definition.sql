-- SELECT-only Production diagnostic for the Finance Cash balance view.
-- Returns one row and does not call lifecycle RPCs or mutate database state.
with view_definition as (
  select pg_get_viewdef(
    'public.finance_cash_account_balance_summary'::regclass,
    true
  ) as actual_view_definition
), normalized as (
  select
    actual_view_definition,
    trim(
      regexp_replace(
        lower(actual_view_definition),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) as normalized_view_definition
  from view_definition
)
select
  actual_view_definition,
  normalized_view_definition,
  'confirmed cash transaction occurred_at > current confirmed opening as_of'::text
    as expected_semantics,
  regexp_count(normalized_view_definition, 'occurred_at')
    as occurred_at_reference_count,
  regexp_count(normalized_view_definition, 'as_of')
    as opening_as_of_reference_count,
  regexp_count(
    normalized_view_definition,
    'cash_transaction\.occurred_at'
  ) as exact_cash_alias_occurred_at_reference_count,
  regexp_count(
    normalized_view_definition,
    'current_opening\.as_of'
  ) as exact_opening_alias_as_of_reference_count,
  regexp_count(
    normalized_view_definition,
    'occurred_at[^<>=]{0,240}>[^<>=]{0,240}as_of'
  ) as strict_gt_operator_count_near_cutoff,
  regexp_count(
    normalized_view_definition,
    'occurred_at[^<>=]{0,240}>=[^<>=]{0,240}as_of'
  ) as gte_operator_count_near_cutoff,
  regexp_count(
    normalized_view_definition,
    'as_of[^<>=]{0,240}<[^<>=]{0,240}occurred_at'
  ) as equivalent_reverse_strict_lt_count,
  regexp_count(
    normalized_view_definition,
    'as_of[^<>=]{0,240}<=[^<>=]{0,240}occurred_at'
  ) as equivalent_reverse_lte_count,
  normalized_view_definition like
    '%cash_transaction.occurred_at > current_opening.as_of%'
    as exact_expected_alias_pattern_present,
  normalized_view_definition ~
    'cash_transaction\.occurred_at[[:space:]]*>[[:space:]]*current_opening\.as_of'
    as whitespace_tolerant_alias_pattern_present,
  normalized_view_definition ~
    'occurred_at[^<>=]{0,240}>[^<>=]{0,240}as_of'
    as qualification_cast_parenthesis_tolerant_forward_pattern_present,
  normalized_view_definition ~
    'as_of[^<>=]{0,240}<[^<>=]{0,240}occurred_at'
    as equivalent_reverse_pattern_present,
  (
    normalized_view_definition ~
      'occurred_at[^<>=]{0,240}>[^<>=]{0,240}as_of'
    or normalized_view_definition ~
      'as_of[^<>=]{0,240}<[^<>=]{0,240}occurred_at'
  ) as strict_cutoff_pattern_present_in_either_direction,
  (
    normalized_view_definition ~
      'occurred_at[^<>=]{0,240}>=[^<>=]{0,240}as_of'
    or normalized_view_definition ~
      'as_of[^<>=]{0,240}<=[^<>=]{0,240}occurred_at'
  ) as non_strict_cutoff_pattern_present_in_either_direction,
  normalized_view_definition like '%operator(pg_catalog.>)%'
    as pg_catalog_qualified_gt_operator_present,
  normalized_view_definition like '%cash_transaction.status = ''confirmed''%'
    as confirmed_cash_status_pattern_present,
  normalized_view_definition like '%opening_balance.status = ''confirmed''%'
    as confirmed_opening_status_pattern_present
from normalized;
