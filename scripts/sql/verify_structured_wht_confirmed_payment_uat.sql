-- Structured WHT confirmation UAT: one SELECT statement, one result row, no RPCs.
-- Run manually in the Production SQL Editor with an unrestricted read context.
-- Stored component values and frozen Invoice evidence are checked, never inferred.
-- Ledger/Compensation counts are observability only. Their original schemas are
-- not in migration history: inspect available Payment links plus confirmation
-- audit evidence; this cannot prove the absence of an unlinked external write.
-- Receipt/Tax Invoice objects are not installed in this phase. Unexpected objects
-- fail closed for schema/linkage review, not as proof that a document was created.

with
constants as (
  select
    '9e2f601e-13ef-4165-8e2c-1887c3ad8861'::uuid as payment_id,
    '74461042-e3ba-4922-9b64-55aac9ebd8aa'::uuid as invoice_id,
    'VP-IV-202609-000003'::text as invoice_no,
    4672.90::numeric as expected_base,
    327.10::numeric as expected_vat,
    5000.00::numeric as expected_gross,
    3.00::numeric as expected_rate,
    140.19::numeric as expected_wht,
    4859.81::numeric as expected_cash
),
target_payment as (
  select p.* from public.finance_payments p join constants c on p.id = c.payment_id
),
target_invoice as (
  select i.* from public.finance_invoices i join constants c on i.id = c.invoice_id
),
payment_facts as (
  select
    count(*) as payment_count,
    coalesce(bool_and(
      p.status = 'confirmed' and p.wht_calculation_mode = 'rate'
      and p.currency = 'THB'
      and p.cash_amount = c.expected_cash and p.wht_amount = c.expected_wht
      and p.settlement_amount = c.expected_gross
      and p.cash_amount + p.wht_amount = p.settlement_amount
      and p.confirmed_at is not null and p.cancelled_at is null and p.reversed_at is null
    ), false) as confirmed_amounts_and_mode_valid,
    jsonb_agg(jsonb_build_object(
      'id', p.id, 'ui_reference', upper(substr(p.id::text, 1, 8)),
      'internal_reference', p.internal_reference, 'status', p.status,
      'wht_calculation_mode', p.wht_calculation_mode,
      'currency', p.currency, 'cash', p.cash_amount, 'wht', p.wht_amount,
      'settlement', p.settlement_amount, 'received_on', p.received_on,
      'payment_method', p.payment_method, 'receiving_bank_account_id', p.receiving_bank_account_id,
      'confirmed_at', p.confirmed_at
    )) as payment
  from target_payment p cross join constants c
),
invoice_facts as (
  select
    count(*) as invoice_count,
    coalesce(bool_and(
      i.invoice_no = c.invoice_no and i.document_status = 'issued'
      and i.source_model = 'billable_charge_v2' and i.currency = 'THB'
      and i.amount_before_vat = c.expected_base and i.vat_amount = c.expected_vat
      and i.total_amount = c.expected_gross
      and i.amount_before_vat + i.vat_amount = i.total_amount
      and i.issued_at is not null and i.cancelled_at is null and i.voided_at is null
    ), false) as issued_invoice_amounts_valid,
    jsonb_agg(jsonb_build_object(
      'id', i.id, 'invoice_no', i.invoice_no, 'status', i.document_status,
      'source_model', i.source_model, 'currency', i.currency,
      'before_vat', i.amount_before_vat, 'vat', i.vat_amount, 'gross', i.total_amount
    )) as invoice
  from target_invoice i cross join constants c
),
component_facts as (
  select
    count(*) as component_count,
    count(*) filter (where
      w.invoice_id = c.invoice_id and item.id is not null
      and item.invoice_id = c.invoice_id and item.source_state = 'active'
      and p.client_id = i.client_id and p.currency = i.currency
      and w.calculation_rule = 'single_line_full_invoice_v1'
      and w.base_amount = c.expected_base and w.rate_percent = c.expected_rate
      and w.calculated_wht_amount = c.expected_wht
      and w.calculated_wht_amount = p.wht_amount
      and w.calculated_wht_amount = round(w.base_amount * w.rate_percent / 100, 2)
      and w.basis_snapshot_json = jsonb_build_object(
        'invoice_id', c.invoice_id, 'invoice_item_id', w.invoice_item_id,
        'currency', 'THB', 'amount_before_vat', c.expected_base,
        'vat_amount', c.expected_vat, 'total_amount', c.expected_gross,
        'vat_applicable', true, 'calculation_rule', 'single_line_full_invoice_v1'
      )
      and i.issued_snapshot_json @> jsonb_build_object(
        'schema_version', 2, 'source_model', 'billable_charge_v2',
        'invoice', jsonb_build_object(
          'id', c.invoice_id, 'document_status', 'issued', 'currency', 'THB',
          'amount_before_vat', c.expected_base, 'vat_amount', c.expected_vat,
          'total_amount', c.expected_gross
        )
      )
      and case when jsonb_typeof(i.issued_snapshot_json->'items') = 'array'
        then jsonb_array_length(i.issued_snapshot_json->'items') = 1 else false end
      and i.issued_snapshot_json->'items'->0->'invoice_item' @> jsonb_build_object(
        'id', w.invoice_item_id, 'invoice_id', c.invoice_id, 'source_state', 'active',
        'vat_applicable', true, 'amount_before_vat', c.expected_base,
        'vat_amount', c.expected_vat, 'line_total', c.expected_gross
      )
    ) as valid_component_count,
    jsonb_agg(jsonb_build_object(
      'id', w.id, 'invoice_id', w.invoice_id, 'invoice_item_id', w.invoice_item_id,
      'calculation_rule', w.calculation_rule, 'stored_base', w.base_amount,
      'stored_rate_percent', w.rate_percent, 'stored_calculated_wht', w.calculated_wht_amount,
      'basis_snapshot', w.basis_snapshot_json
    ) order by w.id) as structured_wht_components
  from public.finance_payment_wht_components w
  join constants c on w.payment_id = c.payment_id
  left join target_payment p on p.id = w.payment_id
  left join target_invoice i on i.id = w.invoice_id
  left join public.finance_invoice_items item on item.id = w.invoice_item_id
),
allocation_facts as (
  select
    (select count(*) from public.finance_payment_invoice_allocations a
      where a.payment_id = c.payment_id) as raw_count,
    (select count(*) from public.finance_payment_invoice_allocations a
      where a.payment_id = c.payment_id and a.invoice_id = c.invoice_id
        and a.cash_allocated = c.expected_cash and a.wht_credit_allocated = c.expected_wht
        and a.settlement_total = c.expected_gross) as valid_raw_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations a
      where a.payment_id = c.payment_id) as effective_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations a
      where a.payment_id = c.payment_id and a.invoice_id = c.invoice_id
        and a.effective_cash_allocated = c.expected_cash
        and a.effective_wht_credit_allocated = c.expected_wht
        and a.effective_settlement_total = c.expected_gross) as valid_effective_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations a
      join public.finance_payments p on p.id = a.payment_id and p.status = 'confirmed'
      where a.invoice_id = c.invoice_id) as invoice_effective_confirmed_count,
    (select count(*) from public.finance_payment_allocation_reallocations r
      where r.payment_id = c.payment_id) as reallocation_count
  from constants c
),
settlement_facts as (
  select
    count(*) as summary_count,
    coalesce(bool_and(
      s.invoice_no = c.invoice_no and s.invoice_status = 'issued'
      and s.currency = 'THB' and s.invoice_gross_amount = c.expected_gross
      and s.confirmed_cash_allocated = c.expected_cash
      and s.confirmed_wht_credit_allocated = c.expected_wht
      and s.economically_settled_amount = c.expected_gross
      and s.outstanding_amount = 0 and s.payment_status = 'settled'
    ), false) as authoritative_settlement_valid,
    jsonb_agg(jsonb_build_object(
      'gross', s.invoice_gross_amount, 'confirmed_cash', s.confirmed_cash_allocated,
      'confirmed_wht', s.confirmed_wht_credit_allocated,
      'economically_settled', s.economically_settled_amount,
      'outstanding', s.outstanding_amount, 'payment_status', s.payment_status
    )) as settlement
  from public.finance_invoice_settlement_summary s
  join constants c on s.invoice_id = c.invoice_id
),
audit_facts as (
  select
    count(*) filter (where a.event_type = 'confirmed') as confirmed_event_count,
    count(*) filter (where a.event_type = 'confirmed' and a.event_payload_json @> jsonb_build_object(
      'cash_amount', c.expected_cash, 'wht_amount', c.expected_wht,
      'settlement_amount', c.expected_gross, 'allocation_count', 1,
      'cash_posting_outcome', 'pre_cutover_no_opening',
      -- The no-opening branch records JSON null for amounts not posted, not zero.
      'cash_transaction_id', null, 'cash_amount_posted', null,
      'cash_accounting_effective_occurred_at', null,
      'wht_excluded_from_cash_posting', true,
      'ledger_created', false, 'receipt_created', false,
      'tax_invoice_created', false, 'compensation_created', false
    )) as valid_no_opening_confirmation_count,
    count(*) filter (where
      a.event_type = 'draft_saved' and a.created_at <= p.confirmed_at
      and a.event_payload_json @> jsonb_build_object(
        'operation', 'structured_wht_saved', 'wht_calculation_mode', 'rate',
        'rate_selected_by_user', true
      )
      and exists (
        select 1 from public.finance_payment_wht_components w
        where w.payment_id = c.payment_id
          and a.event_payload_json->'components' @> jsonb_build_array(jsonb_build_object(
            'payment_id', w.payment_id, 'invoice_id', w.invoice_id,
            'invoice_item_id', w.invoice_item_id, 'calculation_rule', w.calculation_rule,
            'base_amount', w.base_amount, 'rate_percent', w.rate_percent,
            'calculated_wht_amount', w.calculated_wht_amount,
            'basis_snapshot_json', w.basis_snapshot_json
          ))
      )
    ) as matching_explicit_rate_selection_event_count,
    jsonb_agg(jsonb_build_object(
      'event_id', a.id, 'created_at', a.created_at,
      'cash_posting_outcome', a.event_payload_json->'cash_posting_outcome',
      'cash_transaction_id', a.event_payload_json->'cash_transaction_id',
      'cash_amount_posted', a.event_payload_json->'cash_amount_posted',
      'wht_excluded_from_cash_posting', a.event_payload_json->'wht_excluded_from_cash_posting',
      'ledger_created', a.event_payload_json->'ledger_created',
      'compensation_created', a.event_payload_json->'compensation_created',
      'receipt_created', a.event_payload_json->'receipt_created',
      'tax_invoice_created', a.event_payload_json->'tax_invoice_created'
    ) order by a.created_at) filter (where a.event_type = 'confirmed') as confirmation_evidence
  from public.finance_payment_audit_events a
  join constants c on a.payment_id = c.payment_id
  left join target_payment p on p.id = a.payment_id
),
legacy_link_columns as (
  -- Catalog FKs plus conventional exact Payment-id fields, without guessing
  -- whether those optional columns exist on either legacy relation.
  select distinct cl.relname as table_name, at.attname as column_name
  from pg_catalog.pg_class cl
  join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
  join pg_catalog.pg_attribute at on at.attrelid = cl.oid
  where ns.nspname = 'public'
    and cl.relname in ('finance_company_ledger', 'finance_compensation_batches')
    and at.attnum > 0 and not at.attisdropped
    and (
      at.attname in ('payment_id', 'source_payment_id')
      or exists (
        select 1 from pg_catalog.pg_constraint fk
        where fk.contype = 'f' and fk.conrelid = cl.oid
          and fk.confrelid = 'public.finance_payments'::regclass
          and at.attnum = any(fk.conkey)
      )
    )
),
legacy_rows as (
  select 'finance_company_ledger'::text as table_name, to_jsonb(l) as row_json
  from public.finance_company_ledger l
  union all
  select 'finance_compensation_batches', to_jsonb(b)
  from public.finance_compensation_batches b
),
legacy_facts as (
  select
    count(*) filter (where l.table_name = 'finance_company_ledger') as ledger_rows_observed,
    count(*) filter (where l.table_name = 'finance_compensation_batches') as compensation_rows_observed,
    count(*) filter (where l.table_name = 'finance_company_ledger' and exists (
      select 1 from legacy_link_columns col where col.table_name = l.table_name
        and l.row_json->>col.column_name = c.payment_id::text
    )) as payment_linked_ledger_rows,
    count(*) filter (where l.table_name = 'finance_compensation_batches' and exists (
      select 1 from legacy_link_columns col where col.table_name = l.table_name
        and l.row_json->>col.column_name = c.payment_id::text
    )) as payment_linked_compensation_rows,
    -- UUID mentions are review signals, not proof of automatic financial posting.
    count(*) filter (where l.table_name = 'finance_company_ledger'
      and position(c.payment_id::text in l.row_json::text) > 0) as ledger_uuid_mentions_observed,
    count(*) filter (where l.table_name = 'finance_compensation_batches'
      and position(c.payment_id::text in l.row_json::text) > 0) as compensation_uuid_mentions_observed
  from legacy_rows l cross join constants c
),
downstream_facts as (
  select
    (select count(*) from public.finance_cash_transactions cash
      where cash.source_payment_id = c.payment_id) as payment_linked_cash_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    coalesce((select jsonb_agg(ns.nspname || '.' || cl.relname order by cl.relname)
      from pg_catalog.pg_class cl
      join pg_catalog.pg_namespace ns on ns.oid = cl.relnamespace
      where ns.nspname = 'public' and cl.relkind in ('r', 'p', 'v', 'm', 'f')
        and cl.relname ~ '^finance_.*(receipt|tax_invoice)'
    ), '[]'::jsonb) as receipt_tax_invoice_objects_requiring_linkage_review,
    coalesce((select jsonb_agg(to_jsonb(col) order by col.table_name, col.column_name)
      from legacy_link_columns col), '[]'::jsonb) as available_legacy_payment_link_columns
  from constants c
),
checks as (
  select
    p.payment_count = 1 as payment_exists_once,
    p.confirmed_amounts_and_mode_valid as payment_confirmed_cash_wht_and_mode_valid,
    i.invoice_count = 1 as invoice_exists_once,
    i.issued_invoice_amounts_valid as invoice_identity_status_and_vat_unchanged,
    w.component_count = 1 and w.valid_component_count = 1
      as stored_wht_base_rate_amount_and_frozen_basis_valid,
    a.raw_count = 1 and a.valid_raw_count = 1 as raw_payment_invoice_link_valid,
    a.effective_count = 1 and a.valid_effective_count = 1 as effective_payment_invoice_link_valid,
    a.invoice_effective_confirmed_count = 1 as no_other_effective_confirmed_payment,
    a.reallocation_count = 0 as structured_payment_not_reallocated,
    s.summary_count = 1 and s.authoritative_settlement_valid as invoice_settled_exactly_without_overpayment,
    au.matching_explicit_rate_selection_event_count >= 1 as stored_rate_selection_audited_before_confirmation,
    au.confirmed_event_count = 1 and au.valid_no_opening_confirmation_count = 1
      as confirmation_no_opening_and_no_downstream_effects,
    d.opening_balance_rows = 0 as no_opening_balance_cutover,
    d.payment_linked_cash_rows = 0 as no_payment_linked_cash_movement,
    l.payment_linked_ledger_rows = 0 as no_detectable_payment_linked_legacy_ledger_posting,
    l.payment_linked_compensation_rows = 0 as no_detectable_payment_linked_compensation,
    d.receipt_tax_invoice_objects_requiring_linkage_review = '[]'::jsonb
      as receipt_tax_invoice_absence_established_by_catalog
  from payment_facts p cross join invoice_facts i cross join component_facts w
  cross join allocation_facts a cross join settlement_facts s cross join audit_facts au
  cross join legacy_facts l cross join downstream_facts d
)
select
  c.payment_id, c.invoice_id, c.invoice_no,
  p.payment_count, p.payment->0 as payment,
  i.invoice_count, i.invoice->0 as invoice,
  w.component_count, coalesce(w.structured_wht_components, '[]'::jsonb) as structured_wht_components,
  to_jsonb(a) as allocation_checks,
  s.summary_count, s.settlement->0 as authoritative_settlement,
  au.confirmed_event_count, au.matching_explicit_rate_selection_event_count,
  coalesce(au.confirmation_evidence, '[]'::jsonb) as confirmation_evidence,
  to_jsonb(d) as downstream_checks,
  to_jsonb(l) as legacy_observability,
  'Legacy checks use available Payment-id fields/FKs and explicit confirmation audit flags. '
    'Global counts and UUID mentions are observability only; unlinked external writes cannot '
    'be attributed from current rows. Unexpected Receipt/Tax Invoice objects require linkage review.'
    as schema_limitations,
  to_jsonb(ch) as checks,
  coalesce((select jsonb_agg(test.key order by test.key)
    from jsonb_each(to_jsonb(ch)) test where test.value is distinct from 'true'::jsonb
  ), '[]'::jsonb) as failed_checks,
  not exists (select 1 from jsonb_each(to_jsonb(ch)) test
    where test.value is distinct from 'true'::jsonb
  ) as structured_wht_confirmed_payment_uat_verification_pass
from constants c cross join payment_facts p cross join invoice_facts i
cross join component_facts w cross join allocation_facts a cross join settlement_facts s
cross join audit_facts au cross join legacy_facts l cross join downstream_facts d cross join checks ch;
