-- Migration 037 immediate post-apply verifier: one SELECT, one row, no RPC calls.
-- Run manually with unrestricted reads BEFORE any Receipt UAT or ordinary use.
-- Stop on SQL errors. Missing prerequisite relations can fail during binding.
-- Expected catalog manifest is mechanically captured from this exact Migration
-- in isolated PostgreSQL, including source MD5s (drift detection, not signatures).
-- Manifest comparisons do NOT compare PostgreSQL deparser output: constraint
-- columns/actions, index keys/options, trigger flags/columns and policy commands
-- are structural. Human-readable deparser output is diagnostic only.
-- Static catalog/source attestation is not a substitute for lifecycle/concurrency
-- tests. No rows/counters are created by this query, including in the dry-run.
-- Protected financial predicates are copied verbatim from the existing verifier;
-- only its obsolete Receipt-absence check is replaced by exact 037-only catalogs.

with protected_wht as (
-- BEGIN EXACT PROTECTED WHT VERIFIER (without its terminating semicolon)
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
cross join audit_facts au cross join legacy_facts l cross join downstream_facts d cross join checks ch
-- END EXACT PROTECTED WHT VERIFIER
), receipt_tables(table_name) as (
  values ('finance_receipts'), ('finance_receipt_invoice_allocations'), ('finance_receipt_audit_events')
), capability_columns(column_name) as (
  values ('can_view_finance_receipts'), ('can_manage_finance_receipts'),
    ('can_issue_finance_receipts'), ('can_void_finance_receipts')
), upstream_functions(signature) as (
  values
    ('public.generate_finance_document_no(text,date)'),
    ('public.assert_finance_payment_has_no_downstream_dependencies(uuid)'),
    ('public.assert_finance_erroneous_payment_correction_dependencies(uuid)'),
    ('public.assert_finance_payment_reallocation_dependencies(uuid,uuid,uuid)'),
    ('public.assert_finance_invoice_has_no_void_dependencies(uuid)')
), exposed_functions(signature, result_type, capability) as (
  values
    ('public.current_user_can_view_finance_receipts()', 'boolean', null::text),
    ('public.current_user_can_manage_finance_receipts()', 'boolean', null::text),
    ('public.current_user_can_issue_finance_receipts()', 'boolean', null::text),
    ('public.current_user_can_void_finance_receipts()', 'boolean', null::text),
    ('public.create_finance_receipt_draft_from_payment(uuid,boolean)', 'uuid', 'manage'),
    ('public.refresh_finance_receipt_draft(uuid)', 'uuid', 'manage'),
    ('public.issue_finance_receipt(uuid,boolean,jsonb)', 'uuid', 'issue'),
    ('public.cancel_finance_receipt_draft(uuid,text)', 'uuid', 'manage'),
    ('public.void_finance_receipt(uuid,text,boolean)', 'uuid', 'void')
), inspected_functions as (
  select p.*, n.nspname, l.lanname
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.prokind = 'f'
    and (p.proname like '%receipt%' or p.oid in (select to_regprocedure(signature) from upstream_functions))
), actual_manifest as (
  select 'table'::text as kind, c.relname::text as name,
    jsonb_build_object('kind', c.relkind, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity) as definition
  from pg_catalog.pg_class c join receipt_tables t on c.oid = to_regclass('public.' || t.table_name)
  union all
  select 'column', c.relname || '.' || a.attname,
    jsonb_build_object('type', a.atttypid::regtype::text, 'type_modifier', a.atttypmod,
      'not_null', a.attnotnull, 'generated', a.attgenerated, 'identity', a.attidentity,
      'has_default', d.oid is not null, 'default_expression', pg_catalog.pg_get_expr(d.adbin,d.adrelid))
  from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped
    and (c.oid in (select to_regclass('public.' || table_name) from receipt_tables)
      or (c.oid = 'public.user_profiles'::regclass and a.attname in (select column_name from capability_columns)))
  union all
  select 'constraint', cl.relname || '.' || c.conname,
    jsonb_build_object('type', c.contype, 'validated', c.convalidated,
      'deferrable', c.condeferrable, 'deferred', c.condeferred,
      'columns', (select jsonb_agg(a.attname order by k.ordinal)
        from unnest(c.conkey) with ordinality k(attnum, ordinal)
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum),
      'referenced_table', (select relname from pg_catalog.pg_class where oid = c.confrelid),
      'referenced_columns', (select jsonb_agg(a.attname order by k.ordinal)
        from unnest(c.confkey) with ordinality k(attnum, ordinal)
        join pg_catalog.pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum),
      'delete_action', c.confdeltype, 'update_action', c.confupdtype,
      'match_type', c.confmatchtype, 'no_inherit', c.connoinherit,
      'check_expression', case when c.contype = 'c' then pg_catalog.pg_get_expr(c.conbin,c.conrelid) end)
  from pg_catalog.pg_constraint c join pg_catalog.pg_class cl on cl.oid = c.conrelid
  where c.conrelid in (select to_regclass('public.' || table_name) from receipt_tables)
    and c.contype <> 'n' -- PostgreSQL 18 NOT NULL constraints are checked via attnotnull.
  union all
  select 'index', cl.relname || '.' || ci.relname,
    jsonb_build_object('unique', i.indisunique, 'valid', i.indisvalid, 'ready', i.indisready,
      'primary', i.indisprimary, 'immediate', i.indimmediate,
      'key_count', i.indnkeyatts, 'attribute_count', i.indnatts,
      'keys', (select jsonb_agg(a.attname order by k.ordinal)
        from unnest(i.indkey::smallint[]) with ordinality k(attnum, ordinal)
        left join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum),
      'options', to_jsonb(i.indoption::smallint[]), 'method', am.amname,
      'operator_classes', (select jsonb_agg(op.opcname order by k.ordinal)
        from unnest(i.indclass::oid[]) with ordinality k(opclass, ordinal)
        join pg_catalog.pg_opclass op on op.oid = k.opclass),
      'has_expressions', i.indexprs is not null, 'is_partial', i.indpred is not null,
      'predicate',pg_catalog.pg_get_expr(i.indpred,i.indrelid))
  from pg_catalog.pg_index i join pg_catalog.pg_class ci on ci.oid = i.indexrelid
  join pg_catalog.pg_class cl on cl.oid = i.indrelid
  join pg_catalog.pg_am am on am.oid = ci.relam
  where i.indrelid in (select to_regclass('public.' || table_name) from receipt_tables)
  union all
  select 'trigger', cl.relname || '.' || t.tgname,
    jsonb_build_object('enabled', t.tgenabled, 'type', t.tgtype,
      'deferrable', t.tgdeferrable, 'deferred', t.tginitdeferred,
      'function', p.proname, 'function_schema', n.nspname,
      'columns', (select jsonb_agg(a.attname order by k.ordinal)
        from unnest(t.tgattr::smallint[]) with ordinality k(attnum, ordinal)
        join pg_catalog.pg_attribute a on a.attrelid = t.tgrelid and a.attnum = k.attnum),
      'has_when', t.tgqual is not null, 'constraint', t.tgconstraint <> 0,
      'arguments', encode(t.tgargs, 'hex'))
  from pg_catalog.pg_trigger t join pg_catalog.pg_class cl on cl.oid = t.tgrelid
  join pg_catalog.pg_proc p on p.oid = t.tgfoid
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where not t.tgisinternal
    and (t.tgrelid in (select to_regclass('public.' || table_name) from receipt_tables)
      or t.tgname like '%receipt%')
  union all
  select 'policy', cl.relname || '.' || p.polname,
    jsonb_build_object('command', p.polcmd, 'permissive', p.polpermissive,
      'roles', (select jsonb_agg(case when r = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(r) end
          order by case when r = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(r) end)
        from unnest(p.polroles) r),
      'using_receipt_view_capability_only', pg_catalog.pg_get_expr(p.polqual, p.polrelid)
        ~ '^[[:space:]()]*(public\.)?current_user_can_view_finance_receipts\(\)[[:space:]()]*$',
      'has_with_check', p.polwithcheck is not null)
  from pg_catalog.pg_policy p join pg_catalog.pg_class cl on cl.oid = p.polrelid
  where p.polrelid in (select to_regclass('public.' || table_name) from receipt_tables)
  union all
  select 'function', p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')',
    jsonb_build_object('result', p.prorettype::regtype::text, 'returns_set', p.proretset,
      'argument_names', to_jsonb(p.proargnames), 'argument_modes', to_jsonb(p.proargmodes),
      'default_argument_count', p.pronargdefaults, 'language', p.lanname,
      'security_definer', p.prosecdef, 'volatility', p.provolatile,
      'strict', p.proisstrict, 'config', to_jsonb(p.proconfig), 'source_md5', md5(p.prosrc))
  from inspected_functions p
), expected_manifest as (
  select * from jsonb_to_recordset(
-- BEGIN GENERATED MIGRATION 037 CATALOG MANIFEST
    '[{"kind":"column","name":"finance_receipt_audit_events.actor_user_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_audit_events.created_at","definition":{"type":"timestamp with time zone","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"now()"}},{"kind":"column","name":"finance_receipt_audit_events.event_payload_json","definition":{"type":"jsonb","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_audit_events.event_type","definition":{"type":"text","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_audit_events.id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"gen_random_uuid()"}},{"kind":"column","name":"finance_receipt_audit_events.receipt_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.cash_allocated","definition":{"type":"numeric","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":917510,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.created_at","definition":{"type":"timestamp with time zone","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"now()"}},{"kind":"column","name":"finance_receipt_invoice_allocations.currency","definition":{"type":"text","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"gen_random_uuid()"}},{"kind":"column","name":"finance_receipt_invoice_allocations.invoice_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.invoice_no","definition":{"type":"text","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.receipt_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.settlement_allocated","definition":{"type":"numeric","identity":"","not_null":false,"generated":"s","has_default":true,"type_modifier":917510,"default_expression":"(cash_allocated + wht_allocated)"}},{"kind":"column","name":"finance_receipt_invoice_allocations.source_snapshot_json","definition":{"type":"jsonb","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipt_invoice_allocations.wht_allocated","definition":{"type":"numeric","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":917510,"default_expression":null}},{"kind":"column","name":"finance_receipts.cancel_reason","definition":{"type":"text","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.cancelled_at","definition":{"type":"timestamp with time zone","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.cancelled_by_user_id","definition":{"type":"uuid","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.cash_amount","definition":{"type":"numeric","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":917510,"default_expression":null}},{"kind":"column","name":"finance_receipts.client_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.created_at","definition":{"type":"timestamp with time zone","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"now()"}},{"kind":"column","name":"finance_receipts.created_by_user_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.currency","definition":{"type":"text","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.draft_snapshot_json","definition":{"type":"jsonb","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.external_receipt_checked_at","definition":{"type":"timestamp with time zone","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.external_receipt_checked_by_user_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"gen_random_uuid()"}},{"kind":"column","name":"finance_receipts.issued_at","definition":{"type":"timestamp with time zone","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.issued_by_user_id","definition":{"type":"uuid","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.issued_snapshot_json","definition":{"type":"jsonb","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.payment_id","definition":{"type":"uuid","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.receipt_date","definition":{"type":"date","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.receipt_no","definition":{"type":"text","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.replaces_receipt_id","definition":{"type":"uuid","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.settlement_amount","definition":{"type":"numeric","identity":"","not_null":false,"generated":"s","has_default":true,"type_modifier":917510,"default_expression":"(cash_amount + wht_amount)"}},{"kind":"column","name":"finance_receipts.status","definition":{"type":"text","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"''draft''::text"}},{"kind":"column","name":"finance_receipts.updated_at","definition":{"type":"timestamp with time zone","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"now()"}},{"kind":"column","name":"finance_receipts.void_reason","definition":{"type":"text","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.voided_at","definition":{"type":"timestamp with time zone","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.voided_by_user_id","definition":{"type":"uuid","identity":"","not_null":false,"generated":"","has_default":false,"type_modifier":-1,"default_expression":null}},{"kind":"column","name":"finance_receipts.wht_amount","definition":{"type":"numeric","identity":"","not_null":true,"generated":"","has_default":false,"type_modifier":917510,"default_expression":null}},{"kind":"column","name":"user_profiles.can_issue_finance_receipts","definition":{"type":"boolean","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"false"}},{"kind":"column","name":"user_profiles.can_manage_finance_receipts","definition":{"type":"boolean","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"false"}},{"kind":"column","name":"user_profiles.can_view_finance_receipts","definition":{"type":"boolean","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"false"}},{"kind":"column","name":"user_profiles.can_void_finance_receipts","definition":{"type":"boolean","identity":"","not_null":true,"generated":"","has_default":true,"type_modifier":-1,"default_expression":"false"}},{"kind":"constraint","name":"finance_receipt_audit_events.finance_receipt_audit_events_actor_user_id_fkey","definition":{"type":"f","columns":["actor_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipt_audit_events.finance_receipt_audit_events_event_payload_json_check","definition":{"type":"c","columns":["event_payload_json"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(jsonb_typeof(event_payload_json) = ''object''::text)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_audit_events.finance_receipt_audit_events_event_type_check","definition":{"type":"c","columns":["event_type"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(event_type = ANY (ARRAY[''draft_created''::text, ''draft_refreshed''::text, ''issued''::text, ''cancelled''::text, ''voided''::text]))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_audit_events.finance_receipt_audit_events_pkey","definition":{"type":"p","columns":["id"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_audit_events.finance_receipt_audit_events_receipt_id_fkey","definition":{"type":"f","columns":["receipt_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"finance_receipts","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_cash_allocated_check","definition":{"type":"c","columns":["cash_allocated"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(cash_allocated >= (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_check","definition":{"type":"c","columns":["cash_allocated","wht_allocated"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"((cash_allocated + wht_allocated) > (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_invoice_id_fkey","definition":{"type":"f","columns":["invoice_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"finance_invoices","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_invoice_no_check","definition":{"type":"c","columns":["invoice_no"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(btrim(invoice_no) <> ''''::text)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_pkey","definition":{"type":"p","columns":["id"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_receipt_id_fkey","definition":{"type":"f","columns":["receipt_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"finance_receipts","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_receipt_id_invoice_id_key","definition":{"type":"u","columns":["receipt_id","invoice_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_source_snapshot_json_check","definition":{"type":"c","columns":["source_snapshot_json"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(jsonb_typeof(source_snapshot_json) = ''object''::text)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_wht_allocated_check","definition":{"type":"c","columns":["wht_allocated"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(wht_allocated >= (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipt_invoice_allocations.validate_finance_receipt_allocation_integrity","definition":{"type":"t","columns":null,"deferred":true,"validated":true,"deferrable":true,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_cancel_check","definition":{"type":"c","columns":["status","cancelled_at","cancelled_by_user_id","cancel_reason"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(((status = ''cancelled''::text) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL)) OR ((status <> ''cancelled''::text) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL)))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_cancelled_by_user_id_fkey","definition":{"type":"f","columns":["cancelled_by_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_cash_amount_check","definition":{"type":"c","columns":["cash_amount"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(cash_amount >= (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_client_id_fkey","definition":{"type":"f","columns":["client_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"clients","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_created_by_user_id_fkey","definition":{"type":"f","columns":["created_by_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_currency_check","definition":{"type":"c","columns":["currency"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(btrim(currency) <> ''''::text)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_draft_snapshot_json_check","definition":{"type":"c","columns":["draft_snapshot_json"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"((jsonb_typeof(draft_snapshot_json) = ''object''::text) AND (draft_snapshot_json <> ''{}''::jsonb))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_external_receipt_checked_by_user_id_fkey","definition":{"type":"f","columns":["external_receipt_checked_by_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_issued_by_user_id_fkey","definition":{"type":"f","columns":["issued_by_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_lifecycle_check","definition":{"type":"c","columns":["status","receipt_no","issued_at","issued_by_user_id","issued_snapshot_json"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(((status = ANY (ARRAY[''draft''::text, ''cancelled''::text])) AND (receipt_no IS NULL) AND (issued_at IS NULL) AND (issued_by_user_id IS NULL) AND (issued_snapshot_json IS NULL)) OR ((status = ANY (ARRAY[''issued''::text, ''voided''::text])) AND (receipt_no IS NOT NULL) AND (receipt_no ~ ''^VP-RC-[0-9]{6}-[0-9]{6}$''::text) AND (issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL) AND (issued_snapshot_json IS NOT NULL) AND (jsonb_typeof(issued_snapshot_json) = ''object''::text) AND (issued_snapshot_json <> ''{}''::jsonb)))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_payment_id_fkey","definition":{"type":"f","columns":["payment_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"finance_payments","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_pkey","definition":{"type":"p","columns":["id"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_positive_settlement","definition":{"type":"c","columns":["cash_amount","wht_amount"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"((cash_amount + wht_amount) > (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_predecessor_check","definition":{"type":"c","columns":["replaces_receipt_id","id"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(replaces_receipt_id IS DISTINCT FROM id)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_receipt_no_key","definition":{"type":"u","columns":["receipt_no"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_replaces_receipt_id_fkey","definition":{"type":"f","columns":["replaces_receipt_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"r","update_action":"a","check_expression":null,"referenced_table":"finance_receipts","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_status_check","definition":{"type":"c","columns":["status"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(status = ANY (ARRAY[''draft''::text, ''issued''::text, ''cancelled''::text, ''voided''::text]))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_void_check","definition":{"type":"c","columns":["status","voided_at","voided_by_user_id","void_reason"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(((status = ''voided''::text) AND (voided_at IS NOT NULL) AND (voided_by_user_id IS NOT NULL) AND (NULLIF(btrim(void_reason), ''''::text) IS NOT NULL)) OR ((status <> ''voided''::text) AND (voided_at IS NULL) AND (voided_by_user_id IS NULL) AND (void_reason IS NULL)))","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.finance_receipts_voided_by_user_id_fkey","definition":{"type":"f","columns":["voided_by_user_id"],"deferred":false,"validated":true,"deferrable":false,"match_type":"s","no_inherit":true,"delete_action":"a","update_action":"a","check_expression":null,"referenced_table":"user_profiles","referenced_columns":["id"]}},{"kind":"constraint","name":"finance_receipts.finance_receipts_wht_amount_check","definition":{"type":"c","columns":["wht_amount"],"deferred":false,"validated":true,"deferrable":false,"match_type":" ","no_inherit":false,"delete_action":" ","update_action":" ","check_expression":"(wht_amount >= (0)::numeric)","referenced_table":null,"referenced_columns":null}},{"kind":"constraint","name":"finance_receipts.validate_finance_receipt_integrity","definition":{"type":"t","columns":null,"deferred":true,"validated":true,"deferrable":true,"match_type":" ","no_inherit":true,"delete_action":" ","update_action":" ","check_expression":null,"referenced_table":null,"referenced_columns":null}},{"kind":"function","name":"assert_finance_erroneous_payment_correction_dependencies(uuid)","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"plpgsql","source_md5":"515aab9608c93f22c42776dfb80a6da2","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"assert_finance_invoice_has_no_void_dependencies(uuid)","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"plpgsql","source_md5":"a691e2e9dc61d91a1a1bd38f7dd3ad93","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_invoice_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"assert_finance_payment_has_no_downstream_dependencies(uuid)","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"plpgsql","source_md5":"983f3acbada08a61230d88d36dd76894","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"assert_finance_payment_reallocation_dependencies(uuid, uuid, uuid)","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"plpgsql","source_md5":"8ada5cdb03fc95d16355702e30976e72","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id","p_source_invoice_id","p_target_invoice_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"assert_finance_receipt_dependencies(uuid, uuid[])","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"plpgsql","source_md5":"330fa73ed6faa03a43080edff1cba252","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id","p_invoice_ids"],"security_definer":true,"default_argument_count":2}},{"kind":"function","name":"build_finance_receipt_source(uuid)","definition":{"config":["search_path=public"],"result":"jsonb","strict":false,"language":"plpgsql","source_md5":"591924d577f438ba1bbe21b0ea540052","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"cancel_finance_receipt_draft(uuid, text)","definition":{"config":["search_path=public"],"result":"uuid","strict":false,"language":"plpgsql","source_md5":"5322719551e81b50a970e62e100e45f3","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_receipt_id","p_reason"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"create_finance_receipt_draft_from_payment(uuid, boolean)","definition":{"config":["search_path=public"],"result":"uuid","strict":false,"language":"plpgsql","source_md5":"e7a845489934cd709a195c597184da7b","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_payment_id","p_external_receipt_checked"],"security_definer":true,"default_argument_count":1}},{"kind":"function","name":"current_user_can_issue_finance_receipts()","definition":{"config":["search_path=public"],"result":"boolean","strict":false,"language":"sql","source_md5":"02bfe5b3889f13317fdf6ad8a0ec18e0","volatility":"s","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"current_user_can_manage_finance_receipts()","definition":{"config":["search_path=public"],"result":"boolean","strict":false,"language":"sql","source_md5":"952e96c9a52ecd071d0e0a397119efc6","volatility":"s","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"current_user_can_view_finance_receipts()","definition":{"config":["search_path=public"],"result":"boolean","strict":false,"language":"sql","source_md5":"abb582370e3bb3ef9beb5b61dacb0bc2","volatility":"s","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"current_user_can_void_finance_receipts()","definition":{"config":["search_path=public"],"result":"boolean","strict":false,"language":"sql","source_md5":"169b0d88ae8ecbffcf06caa8350e71b1","volatility":"s","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"generate_finance_document_no(text, date)","definition":{"config":["search_path=public"],"result":"text","strict":false,"language":"plpgsql","source_md5":"63e8d62f9fc39b4d4d4520e6155e2335","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_doc_type","p_issue_date"],"security_definer":true,"default_argument_count":1}},{"kind":"function","name":"guard_finance_receipt_lifecycle()","definition":{"config":["search_path=public"],"result":"trigger","strict":false,"language":"plpgsql","source_md5":"b9c6a12a7d3e19b95465d1ca7e6f551b","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":false,"default_argument_count":0}},{"kind":"function","name":"issue_finance_receipt(uuid, boolean, jsonb)","definition":{"config":["search_path=public"],"result":"uuid","strict":false,"language":"plpgsql","source_md5":"4bba2218365fa335a69c65a563c86f03","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_receipt_id","p_acknowledged","p_reviewed_snapshot_json"],"security_definer":true,"default_argument_count":1}},{"kind":"function","name":"protect_finance_receipt_history()","definition":{"config":["search_path=public"],"result":"trigger","strict":false,"language":"plpgsql","source_md5":"3f49581419a20033a6ebe90a884a8ff4","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":false,"default_argument_count":0}},{"kind":"function","name":"protect_finance_receipt_permission_fields()","definition":{"config":["search_path=public"],"result":"trigger","strict":false,"language":"plpgsql","source_md5":"1d8f11ed9415d7a1741638a3aaa59314","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"record_finance_receipt_audit(uuid, text, jsonb)","definition":{"config":["search_path=public"],"result":"void","strict":false,"language":"sql","source_md5":"2572b407937be975ba88b5b8cc3041fa","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_receipt_id","p_event","p_payload"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"refresh_finance_receipt_draft(uuid)","definition":{"config":["search_path=public"],"result":"uuid","strict":false,"language":"plpgsql","source_md5":"99c9e30d64fffcb396dff606b527d856","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_receipt_id"],"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"validate_finance_receipt_integrity()","definition":{"config":["search_path=public"],"result":"trigger","strict":false,"language":"plpgsql","source_md5":"f34df9aca4d0412b7d79cf96335fe0b2","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":null,"security_definer":true,"default_argument_count":0}},{"kind":"function","name":"void_finance_receipt(uuid, text, boolean)","definition":{"config":["search_path=public"],"result":"uuid","strict":false,"language":"plpgsql","source_md5":"1cd5e5f8e8b1e790452daabc70ac7973","volatility":"v","returns_set":false,"argument_modes":null,"argument_names":["p_receipt_id","p_reason","p_acknowledged"],"security_definer":true,"default_argument_count":0}},{"kind":"index","name":"finance_receipt_audit_events.finance_receipt_audit_events_pkey","definition":{"keys":["id"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0],"primary":true,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"index","name":"finance_receipt_audit_events.idx_finance_receipt_audit_history","definition":{"keys":["receipt_id","created_at"],"ready":true,"valid":true,"method":"btree","unique":false,"options":[0,0],"primary":false,"immediate":true,"key_count":2,"predicate":null,"is_partial":false,"attribute_count":2,"has_expressions":false,"operator_classes":["uuid_ops","timestamptz_ops"]}},{"kind":"index","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_pkey","definition":{"keys":["id"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0],"primary":true,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"index","name":"finance_receipt_invoice_allocations.finance_receipt_invoice_allocations_receipt_id_invoice_id_key","definition":{"keys":["receipt_id","invoice_id"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0,0],"primary":false,"immediate":true,"key_count":2,"predicate":null,"is_partial":false,"attribute_count":2,"has_expressions":false,"operator_classes":["uuid_ops","uuid_ops"]}},{"kind":"index","name":"finance_receipt_invoice_allocations.idx_finance_receipt_allocations_invoice","definition":{"keys":["invoice_id"],"ready":true,"valid":true,"method":"btree","unique":false,"options":[0],"primary":false,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"index","name":"finance_receipts.finance_receipts_pkey","definition":{"keys":["id"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0],"primary":true,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"index","name":"finance_receipts.finance_receipts_receipt_no_key","definition":{"keys":["receipt_no"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0],"primary":false,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["text_ops"]}},{"kind":"index","name":"finance_receipts.idx_finance_receipts_payment_history","definition":{"keys":["payment_id","created_at"],"ready":true,"valid":true,"method":"btree","unique":false,"options":[0,0],"primary":false,"immediate":true,"key_count":2,"predicate":null,"is_partial":false,"attribute_count":2,"has_expressions":false,"operator_classes":["uuid_ops","timestamptz_ops"]}},{"kind":"index","name":"finance_receipts.idx_finance_receipts_predecessor","definition":{"keys":["replaces_receipt_id"],"ready":true,"valid":true,"method":"btree","unique":false,"options":[0],"primary":false,"immediate":true,"key_count":1,"predicate":null,"is_partial":false,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"index","name":"finance_receipts.idx_finance_receipts_status_date","definition":{"keys":["status","receipt_date"],"ready":true,"valid":true,"method":"btree","unique":false,"options":[0,0],"primary":false,"immediate":true,"key_count":2,"predicate":null,"is_partial":false,"attribute_count":2,"has_expressions":false,"operator_classes":["text_ops","date_ops"]}},{"kind":"index","name":"finance_receipts.uq_finance_receipts_active_payment","definition":{"keys":["payment_id"],"ready":true,"valid":true,"method":"btree","unique":true,"options":[0],"primary":false,"immediate":true,"key_count":1,"predicate":"(status = ANY (ARRAY[''draft''::text, ''issued''::text]))","is_partial":true,"attribute_count":1,"has_expressions":false,"operator_classes":["uuid_ops"]}},{"kind":"policy","name":"finance_receipt_audit_events.finance_receipt_audit_read","definition":{"roles":["authenticated"],"command":"r","permissive":true,"has_with_check":false,"using_receipt_view_capability_only":true}},{"kind":"policy","name":"finance_receipt_invoice_allocations.finance_receipt_allocations_read","definition":{"roles":["authenticated"],"command":"r","permissive":true,"has_with_check":false,"using_receipt_view_capability_only":true}},{"kind":"policy","name":"finance_receipts.finance_receipts_read","definition":{"roles":["authenticated"],"command":"r","permissive":true,"has_with_check":false,"using_receipt_view_capability_only":true}},{"kind":"table","name":"finance_receipt_audit_events","definition":{"rls":true,"kind":"r","force_rls":false}},{"kind":"table","name":"finance_receipt_invoice_allocations","definition":{"rls":true,"kind":"r","force_rls":false}},{"kind":"table","name":"finance_receipts","definition":{"rls":true,"kind":"r","force_rls":false}},{"kind":"trigger","name":"finance_receipt_audit_events.protect_finance_receipt_audit_history","definition":{"type":27,"columns":null,"enabled":"O","deferred":false,"function":"protect_finance_receipt_history","has_when":false,"arguments":"","constraint":false,"deferrable":false,"function_schema":"public"}},{"kind":"trigger","name":"finance_receipt_invoice_allocations.protect_finance_receipt_allocation_history","definition":{"type":27,"columns":null,"enabled":"O","deferred":false,"function":"protect_finance_receipt_history","has_when":false,"arguments":"","constraint":false,"deferrable":false,"function_schema":"public"}},{"kind":"trigger","name":"finance_receipt_invoice_allocations.validate_finance_receipt_allocation_integrity","definition":{"type":5,"columns":null,"enabled":"O","deferred":true,"function":"validate_finance_receipt_integrity","has_when":false,"arguments":"","constraint":true,"deferrable":true,"function_schema":"public"}},{"kind":"trigger","name":"finance_receipts.guard_finance_receipt_lifecycle","definition":{"type":31,"columns":null,"enabled":"O","deferred":false,"function":"guard_finance_receipt_lifecycle","has_when":false,"arguments":"","constraint":false,"deferrable":false,"function_schema":"public"}},{"kind":"trigger","name":"finance_receipts.validate_finance_receipt_integrity","definition":{"type":21,"columns":null,"enabled":"O","deferred":true,"function":"validate_finance_receipt_integrity","has_when":false,"arguments":"","constraint":true,"deferrable":true,"function_schema":"public"}},{"kind":"trigger","name":"user_profiles.protect_finance_receipt_permission_fields","definition":{"type":23,"columns":["can_view_finance_receipts","can_manage_finance_receipts","can_issue_finance_receipts","can_void_finance_receipts"],"enabled":"O","deferred":false,"function":"protect_finance_receipt_permission_fields","has_when":false,"arguments":"","constraint":false,"deferrable":false,"function_schema":"public"}}]'::jsonb
-- END GENERATED MIGRATION 037 CATALOG MANIFEST
  ) as x(kind text, name text, definition jsonb)
), manifest_differences as (
  select coalesce(e.kind, a.kind) as kind, coalesce(e.name, a.name) as name,
    e.definition as expected, a.definition as actual
  from expected_manifest e full join actual_manifest a using (kind, name)
  where e.definition is distinct from a.definition
), receipt_table_access as (
  select t.table_name,
    has_table_privilege('authenticated', c.oid, 'SELECT')
      and not has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE,REFERENCES')
      and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
      and not exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        where acl.grantee = 0 or (acl.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))
          and acl.is_grantable)) as compatible
  from receipt_tables t left join pg_catalog.pg_class c on c.oid = to_regclass('public.' || t.table_name)
), function_access as (
  select p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as function_name,
    not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 or (acl.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))
          and acl.is_grantable))
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') = exists (
        select 1 from exposed_functions e where to_regprocedure(e.signature) = p.oid
      ) as compatible
  from inspected_functions p
), source_contracts as (
  select
    (select prosrc from inspected_functions where oid = to_regprocedure('public.create_finance_receipt_draft_from_payment(uuid,boolean)')) as creator,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.refresh_finance_receipt_draft(uuid)')) as refresher,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.issue_finance_receipt(uuid,boolean,jsonb)')) as issuer,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.cancel_finance_receipt_draft(uuid,text)')) as canceller,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.void_finance_receipt(uuid,text,boolean)')) as voider,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.build_finance_receipt_source(uuid)')) as builder,
    (select prosrc from inspected_functions where oid = to_regprocedure('public.generate_finance_document_no(text,date)')) as allocator
), catalog_observations as (
  select
    coalesce((select jsonb_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
        and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S') and c.relname ~* '(receipt|tax_?invoice)'
        and not (n.nspname = 'public' and c.relname in (select table_name from receipt_tables))), '[]'::jsonb)
      as unexpected_receipt_or_tax_invoice_relations,
    coalesce((select jsonb_agg(p.oid::regprocedure::text) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname ~* 'tax_?invoice'), '[]'::jsonb) as operational_tax_invoice_functions,
    (select count(*) from public.finance_receipts) as receipt_rows,
    (select count(*) from public.finance_receipt_invoice_allocations) as receipt_allocation_rows,
    (select count(*) from public.finance_receipt_audit_events) as receipt_audit_rows,
    (select count(*) from public.finance_document_counters
      where lower(doc_type) in ('receipt', 'rc', 'vp-rc') or prefix ~* '^(VP-)?RC-') as receipt_counter_rows
), checks as (
  select
    exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
      as unrestricted_read_context,
    exists (select 1 from expected_manifest) as expected_manifest_embedded,
    not exists (select 1 from manifest_differences where kind = 'table') as exact_tables_and_rls,
    not exists (select 1 from manifest_differences where kind = 'column') as exact_columns_types_defaults_and_generated_amounts,
    not exists (select 1 from manifest_differences where kind = 'constraint') as exact_validated_constraints_and_foreign_keys,
    not exists (select 1 from manifest_differences where kind = 'index') as exact_active_coverage_and_number_uniqueness_indexes,
    not exists (select 1 from manifest_differences where kind = 'trigger') as exact_enabled_lifecycle_integrity_and_upstream_guards,
    not exists (select 1 from manifest_differences where kind = 'policy') as exact_select_only_capability_policies,
    not exists (select 1 from manifest_differences where kind = 'function') as exact_rpc_guard_and_allocator_source_contracts,
    not exists (select 1 from receipt_table_access where compatible is distinct from true)
      as authenticated_read_only_no_anon_or_public_access,
    not exists (select 1 from function_access where compatible is distinct from true)
      as exact_mutator_permissions_and_internal_function_isolation,
    not exists (select 1 from exposed_functions e left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.signature)
      where p.oid is null or p.prorettype <> to_regtype(e.result_type) or not p.prosecdef
        or p.proconfig is distinct from array['search_path=public']
        or (e.capability is not null and position('current_user_can_' || e.capability || '_finance_receipts()' in p.prosrc) = 0))
      as public_rpc_signatures_uuid_returns_and_dedicated_capabilities,
    s.creator like '%p_external_receipt_checked is distinct from true%'
      and s.creator like '%RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED%'
      and s.creator like '%''external_receipt_checked'',true%'
      as explicit_runtime_manual_receipt_clearance_acknowledgement,
    s.creator like '%v_payment.status <> ''confirmed''%'
      and s.creator like '%status in (''draft'',''issued'')%'
      and s.creator like '%if v_id is not null then return v_id%'
      and s.creator like '%v_payment.received_on%' and s.creator like '%for update%'
      as confirmed_payment_only_idempotent_full_payment_draft,
    s.issuer like '%RECEIPT_ISSUE_ACK_REQUIRED%'
      and s.issuer like '%v_receipt.status = ''issued'' then return p_receipt_id%'
      and s.issuer like '%RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED%'
      and s.issuer like '%generate_finance_document_no(''receipt'',v_receipt.receipt_date)%'
      and s.issuer like '%issued_snapshot_json = v_snapshot%'
      and s.issuer like '%jsonb_array_elements(v_snapshot->''invoices'')%'
      as issue_revalidates_freezes_all_allocations_and_allocates_once,
    s.canceller like '%RECEIPT_REASON_REQUIRED%' and s.canceller not like '%generate_finance_document_no%'
      and s.voider like '%RECEIPT_VOID_ACK_REQUIRED%' and s.voider like '%RECEIPT_REASON_REQUIRED%'
      and s.voider like '%v_receipt.status <> ''issued''%' and s.voider not like '%generate_finance_document_no%'
      as cancellation_and_void_reason_ack_history_number_contracts,
    s.builder like '%finance_payment_effective_invoice_allocations%'
      and s.builder like '%v_cash <> v_payment.cash_amount or v_wht <> v_payment.wht_amount%'
      and s.builder like '%RECEIPT_FROZEN_INVOICE_EVIDENCE_REQUIRED%'
      and s.builder like '%RECEIPT_SELLER_IDENTITY_REQUIRED%'
      and s.builder like '%RECEIPT_CUSTOMER_IDENTITY_REQUIRED%'
      and s.builder like '%''document_kind'',''receipt''%'
      and s.builder like '%''structured_wht_components''%'
      as frozen_authoritative_evidence_full_settlement_separate_cash_wht,
    (select prosrc like '%r.status = ''issued''%' and prosrc like '%r.payment_id = p_payment_id%'
      and prosrc like '%a.invoice_id = any(p_invoice_ids)%'
      and prosrc like '%FINANCE_ISSUED_RECEIPT_DEPENDENCY%'
      from inspected_functions where oid = to_regprocedure('public.assert_finance_receipt_dependencies(uuid,uuid[])'))
      as issued_only_payment_and_invoice_dependency_guard,
    not exists (select 1 from upstream_functions e
      left join inspected_functions p on p.oid = to_regprocedure(e.signature)
      where e.signature <> 'public.generate_finance_document_no(text,date)'
        and (p.oid is null or p.prosrc not like '%perform public.assert_finance_receipt_dependencies(%'
          or p.prosrc not like '%v_dependency.table_name = ''finance_receipts'' and v_dependency.column_name = ''payment_id''%'
          or p.prosrc not like '%v_dependency.table_name = ''finance_receipt_invoice_allocations'' and v_dependency.column_name = ''invoice_id''%'
          or p.prosrc not like '%then continue; end if;%'
          or p.prosrc not like '%finance_tax_invoices%' or p.prosrc not like '%finance_company_ledger%'
          or p.prosrc not like '%finance_compensation_batches%'))
      as upstream_guards_lifecycle_aware_other_registries_preserved,
    s.allocator like '%v_input_type in (''fee_agreement'', ''invoice'', ''receipt'')%'
      and s.allocator like '%current_user_can_issue_finance_receipts()%'
      and s.allocator like '%RECEIPT_NUMBERING_PROFILE_INVALID%'
      and s.allocator like '%RECEIPT_NUMBERING_EXHAUSTED%'
      and s.allocator like '%on conflict (doc_type, year, (coalesce(month, 0))) do update%'
      and s.allocator like '%returning last_no into v_next%'
      as receipt_allocator_authorized_atomic_explicit_branch,
    exists (select 1 from pg_catalog.pg_index i where i.indrelid = 'public.finance_document_counters'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indpred is null
      and pg_catalog.pg_get_indexdef(i.indexrelid) ~* '\(doc_type, year, COALESCE\(month, 0\)\)')
      as atomic_number_counter_conflict_index_valid,
    not exists (select 1 from inspected_functions p where p.proname like '%receipt%'
      and p.prosrc ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from|truncate([[:space:]]+table)?)[[:space:]]+(public\.)?finance_(payments|payment_[a-z_]+|invoices|invoice_[a-z_]+|cash_[a-z_]+|account_opening_balances|company_ledger|compensation[a-z_]*|revenue[a-z_]*|tax_invoices)\M')
      as receipt_has_no_upstream_or_downstream_financial_writes,
    not exists (select 1 from inspected_functions p where p.proname like '%receipt%'
      and p.prosrc ~* '(perform|select)[[:space:]]+(public\.)?(confirm_finance_payment|reverse_finance_payment|correct_erroneous_finance_payment|reallocate_finance_payment_allocation|post_confirmed_payment_to_finance_cash_transaction)[[:space:]]*\(')
      as receipt_code_never_invokes_payment_or_cash_mutators,
    (select count(*) = 1 from public.document_numbering_profiles where document_type = 'receipt'
      and display_prefix = 'VP-RC' and period_scope = 'monthly' and sequence_width = 6 and is_active)
      as receipt_profile_vp_rc_monthly_six_digits,
    o.receipt_counter_rows = 0 as no_receipt_numbers_consumed_by_migration,
    o.receipt_rows = 0 and o.receipt_allocation_rows = 0 and o.receipt_audit_rows = 0
      as zero_new_receipt_coverage_and_audit_rows,
    o.unexpected_receipt_or_tax_invoice_relations = '[]'::jsonb
      and o.operational_tax_invoice_functions = '[]'::jsonb as receipt_only_no_tax_invoice_or_alternate_implementation,
    not exists (select 1 from jsonb_each(w.checks - 'receipt_tax_invoice_absence_established_by_catalog') x
      where x.value is distinct from 'true'::jsonb) as protected_wht_evidence_unchanged,
    not exists (select 1 from pg_catalog.pg_class c where c.oid in (
      'public.finance_payments'::regclass, 'public.finance_payment_invoice_allocations'::regclass,
      'public.finance_cash_transactions'::regclass)
      and (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
        or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE')))
      as payment_and_cash_browser_writes_still_blocked,
    position('finance_receipt' in pg_catalog.pg_get_viewdef('public.finance_invoice_settlement_summary'::regclass)) = 0
      and position('finance_receipt' in pg_catalog.pg_get_viewdef('public.finance_payment_effective_invoice_allocations'::regclass)) = 0
      as receipt_not_a_settlement_source
  from source_contracts s cross join catalog_observations o cross join protected_wht w
)
select
  'RECEIPT_FOUNDATION_VERIFICATION_037'::text as report,
  true as external_manual_receipt_conflict_manual_check_required,
  false as external_manual_receipt_conflict_auto_verified,
  true as runtime_receipt_creation_acknowledgement_required,
  'Foundation verification only; no Receipt was created. External/manual coverage requires independent review '
    'and per-Payment acknowledgement. Source checks detect code drift, not arbitrary unlinked external writes. '
    'Protected WHT source receipt-absence result is superseded by exact 037 catalog and zero-row checks.'::text as limitations,
  to_jsonb(o) as foundation_observations,
  coalesce((select jsonb_agg(to_jsonb(d) order by kind, name) from manifest_differences d), '[]'::jsonb) as catalog_differences,
  coalesce((select jsonb_agg(to_jsonb(a)) from receipt_table_access a where compatible is distinct from true), '[]'::jsonb)
    as table_permission_failures,
  coalesce((select jsonb_agg(to_jsonb(a)) from function_access a where compatible is distinct from true), '[]'::jsonb)
    as function_permission_failures,
  to_jsonb(w) as protected_wht_source_evidence,
  coalesce((select jsonb_agg(x.key order by x.key)
    from jsonb_each(w.checks - 'receipt_tax_invoice_absence_established_by_catalog') x
    where x.value is distinct from 'true'::jsonb), '[]'::jsonb) as protected_wht_failed_checks,
  to_jsonb(ch) as checks,
  coalesce((select jsonb_agg(x.key order by x.key) from jsonb_each(to_jsonb(ch)) x
    where x.value is distinct from 'true'::jsonb), '[]'::jsonb) as failed_checks,
  not exists (select 1 from jsonb_each(to_jsonb(ch)) x where x.value is distinct from 'true'::jsonb)
    as receipt_foundation_verification_pass
from checks ch cross join catalog_observations o cross join protected_wht w;
