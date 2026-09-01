with
constants as (
  select
    'e92cc766-a7fb-456b-b615-7be2c7a3cf52'::uuid as invoice_id,
    'VP-IV-202609-000001'::text as invoice_no,
    '08a67268-b449-4d54-a0f9-cd47d10217be'::uuid as court_fee_charge_id,
    'e3276c4c-fbfd-4e88-bebe-7ba7409780c4'::uuid as travel_charge_id
),
target_invoice as (
  select invoice.*
  from public.finance_invoices as invoice
  cross join constants
  where invoice.id = constants.invoice_id
),
invoice_facts as (
  select
    count(*) as target_invoice_count,
    max(invoice.invoice_no) as invoice_no,
    max(invoice.source_model) as source_model,
    max(invoice.document_status) as document_status,
    max(invoice.issue_date) as issue_date,
    max(invoice.due_date) as due_date,
    max(invoice.amount_before_vat) as amount_before_vat,
    max(invoice.vat_amount) as vat_amount,
    max(invoice.total_amount) as total_amount,
    bool_and(
      invoice.primary_billing_installment_id is null
      and invoice.billing_plan_id is null
      and invoice.fee_agreement_id is null
      and invoice.case_id is null
      and invoice.advisory_matter_id is null
      and invoice.v2_bridge_id is null
    ) as charge_only_lineage,
    bool_and(
      invoice.issued_at is not null
      and invoice.issued_snapshot_json is not null
      and invoice.issued_snapshot_json <> '{}'::jsonb
      and invoice.issued_snapshot_json->>'schema_version' = '2'
      and invoice.issued_snapshot_json->>'source_model' = 'billable_charge_v2'
      and invoice.source_snapshot_json->>'schema_version' = '2'
      and invoice.source_snapshot_json->>'invoice_source_model' = 'billable_charge_v2'
    ) as issued_v2_snapshot_valid,
    bool_and(
      invoice.payment_destination_bank_account_id is not null
      and invoice.payment_destination_snapshot_json is not null
      and invoice.payment_destination_snapshot_json <> '{}'::jsonb
      and invoice.payment_destination_snapshot_json->>'short_name' = 'KBANK'
      and invoice.issued_snapshot_json->'payment_destination'->>'short_name' = 'KBANK'
    ) as frozen_payment_destination_is_kbank,
    max(invoice.v2_creation_request_id::text)::uuid as creation_request_id,
    max(invoice.v2_creation_fingerprint) as creation_fingerprint
  from target_invoice as invoice
),
bank_facts as (
  select
    count(*) as destination_bank_row_count,
    coalesce(bool_and(bank.short_name = 'KBANK'), false) as destination_bank_is_kbank
  from target_invoice as invoice
  join public.finance_bank_accounts as bank
    on bank.id = invoice.payment_destination_bank_account_id
),
target_items as (
  select item.*
  from public.finance_invoice_items as item
  cross join constants
  where item.invoice_id = constants.invoice_id
),
item_facts as (
  select
    count(*) as invoice_item_history_count,
    count(*) filter (where item.source_state = 'active') as effective_item_count,
    count(*) filter (where item.source_state = 'released') as released_item_count,
    count(distinct item.source_billable_charge_id)
      filter (where item.source_state = 'active') as effective_source_charge_count,
    coalesce(sum(item.amount_before_vat) filter (where item.source_state = 'active'), 0) as effective_before_vat,
    coalesce(sum(item.vat_amount) filter (where item.source_state = 'active'), 0) as effective_vat,
    coalesce(sum(item.line_total) filter (where item.source_state = 'active'), 0) as effective_total,
    count(*) filter (
      where item.source_state = 'active'
        and item.source_billable_charge_id = constants.court_fee_charge_id
        and item.amount_before_vat = 5000
        and item.vat_amount = 0
        and item.line_total = 5000
        and item.source_snapshot_json <> '{}'::jsonb
        and item.source_snapshot_json->'ready_snapshot'->'economic'->>'classification' = 'government_or_court_fee'
    ) as valid_court_fee_item_count,
    count(*) filter (
      where item.source_state = 'active'
        and item.source_billable_charge_id = constants.travel_charge_id
        and item.amount_before_vat = 2000
        and item.vat_amount = 0
        and item.line_total = 2000
        and item.source_snapshot_json <> '{}'::jsonb
        and item.source_snapshot_json->'ready_snapshot'->'economic'->>'classification' = 'additional_service'
    ) as valid_travel_item_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoice_item_id', item.id,
          'source_billable_charge_id', item.source_billable_charge_id,
          'source_state', item.source_state,
          'description', item.description,
          'classification', item.source_snapshot_json->'ready_snapshot'->'economic'->>'classification',
          'amount_before_vat', item.amount_before_vat,
          'vat_amount', item.vat_amount,
          'line_total', item.line_total
        ) order by item.sort_order, item.id
      ),
      '[]'::jsonb
    ) as invoice_items
  from target_items as item
  cross join constants
),
target_allocations as (
  select allocation.*
  from public.finance_invoice_charge_allocations as allocation
  cross join constants
  where allocation.invoice_id = constants.invoice_id
),
allocation_facts as (
  select
    count(*) as allocation_history_count,
    count(*) filter (where allocation.status = 'invoiced') as effective_allocation_count,
    count(*) filter (where allocation.status = 'reserved') as reserved_allocation_count,
    count(*) filter (where allocation.status = 'released') as released_allocation_count,
    count(distinct allocation.billable_charge_id)
      filter (where allocation.status = 'invoiced') as effective_allocated_charge_count,
    count(distinct allocation.invoice_item_id)
      filter (where allocation.status = 'invoiced') as effective_allocated_item_count,
    coalesce(sum(allocation.amount_before_vat) filter (where allocation.status = 'invoiced'), 0) as allocated_before_vat,
    coalesce(sum(allocation.vat_amount) filter (where allocation.status = 'invoiced'), 0) as allocated_vat,
    coalesce(sum(allocation.total_amount) filter (where allocation.status = 'invoiced'), 0) as allocated_total,
    count(*) filter (
      where allocation.status = 'invoiced'
        and allocation.billable_charge_id = constants.court_fee_charge_id
        and allocation.amount_before_vat = 5000
        and allocation.vat_amount = 0
        and allocation.total_amount = 5000
        and allocation.source_snapshot_json <> '{}'::jsonb
        and allocation.source_snapshot_json->'ready_snapshot'->'economic'->>'classification' = 'government_or_court_fee'
    ) as valid_court_fee_allocation_count,
    count(*) filter (
      where allocation.status = 'invoiced'
        and allocation.billable_charge_id = constants.travel_charge_id
        and allocation.amount_before_vat = 2000
        and allocation.vat_amount = 0
        and allocation.total_amount = 2000
        and allocation.source_snapshot_json <> '{}'::jsonb
        and allocation.source_snapshot_json->'ready_snapshot'->'economic'->>'classification' = 'additional_service'
    ) as valid_travel_allocation_count,
    count(*) filter (
      where item.id is null
        or item.invoice_id <> allocation.invoice_id
        or item.source_billable_charge_id <> allocation.billable_charge_id
        or item.source_state <> 'active'
        or item.amount_before_vat <> allocation.amount_before_vat
        or item.vat_amount <> allocation.vat_amount
        or item.line_total <> allocation.total_amount
    ) as allocation_item_mismatch_count
  from target_allocations as allocation
  cross join constants
  left join public.finance_invoice_items as item
    on item.id = allocation.invoice_item_id
),
charge_facts as (
  select
    count(*) as source_charge_count,
    count(*) filter (where charge.status = 'invoiced') as invoiced_charge_count,
    count(*) filter (where charge.status in ('ready_to_invoice', 'reserved')) as nonfinal_charge_count,
    count(*) filter (where charge.source_type = 'billing_installment_item') as installment_generated_charge_count,
    count(*) filter (
      where charge.id = constants.court_fee_charge_id
        and charge.status = 'invoiced'
        and charge.economic_classification = 'government_or_court_fee'
        and charge.amount_before_vat = 5000
        and charge.vat_amount = 0
        and charge.total_amount = 5000
        and nullif(btrim(coalesce(charge.description, '')), '') is not null
        and charge.ready_snapshot_json <> '{}'::jsonb
        and charge.ready_snapshot_json->'charge'->>'status' = 'ready_to_invoice'
        and charge.ready_snapshot_json->'commercial'->>'description' = charge.description
        and (charge.ready_snapshot_json->'commercial'->>'amount_before_vat')::numeric = charge.amount_before_vat
        and (charge.ready_snapshot_json->'commercial'->>'vat_amount')::numeric = charge.vat_amount
        and (charge.ready_snapshot_json->'commercial'->>'total_amount')::numeric = charge.total_amount
        and charge.ready_snapshot_json->'economic'->>'classification' = charge.economic_classification
        and item.source_snapshot_json->'ready_snapshot' = charge.ready_snapshot_json
        and item.description = charge.description
    ) as valid_court_fee_charge_count,
    count(*) filter (
      where charge.id = constants.travel_charge_id
        and charge.status = 'invoiced'
        and charge.economic_classification = 'additional_service'
        and charge.amount_before_vat = 2000
        and charge.vat_amount = 0
        and charge.total_amount = 2000
        and nullif(btrim(coalesce(charge.description, '')), '') is not null
        and charge.ready_snapshot_json <> '{}'::jsonb
        and charge.ready_snapshot_json->'charge'->>'status' = 'ready_to_invoice'
        and charge.ready_snapshot_json->'commercial'->>'description' = charge.description
        and (charge.ready_snapshot_json->'commercial'->>'amount_before_vat')::numeric = charge.amount_before_vat
        and (charge.ready_snapshot_json->'commercial'->>'vat_amount')::numeric = charge.vat_amount
        and (charge.ready_snapshot_json->'commercial'->>'total_amount')::numeric = charge.total_amount
        and charge.ready_snapshot_json->'economic'->>'classification' = charge.economic_classification
        and item.source_snapshot_json->'ready_snapshot' = charge.ready_snapshot_json
        and item.description = charge.description
    ) as valid_travel_charge_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'charge_id', charge.id,
          'status', charge.status,
          'source_type', charge.source_type,
          'description', charge.description,
          'classification', charge.economic_classification,
          'amount_before_vat', charge.amount_before_vat,
          'vat_amount', charge.vat_amount,
          'total_amount', charge.total_amount
        ) order by charge.id
      ),
      '[]'::jsonb
    ) as source_charges
  from public.finance_billable_charges as charge
  cross join constants
  left join target_items as item
    on item.source_billable_charge_id = charge.id
   and item.source_state = 'active'
  where charge.id in (constants.court_fee_charge_id, constants.travel_charge_id)
),
composition_facts as (
  select
    count(request.request_id) as creation_request_count,
    count(request.request_id) filter (
      where request.operation = 'create'
        and request.invoice_id = constants.invoice_id
        and request.request_fingerprint = invoice_facts.creation_fingerprint
        and request.result_snapshot_json->>'invoice_id' = constants.invoice_id::text
        and jsonb_array_length(request.result_snapshot_json->'charge_ids') = 2
        and request.result_snapshot_json->'charge_ids' ? constants.court_fee_charge_id::text
        and request.result_snapshot_json->'charge_ids' ? constants.travel_charge_id::text
    ) as valid_creation_request_count,
    (
      select count(*)
      from public.finance_invoices as duplicate_invoice
      where duplicate_invoice.v2_creation_request_id = invoice_facts.creation_request_id
    ) as invoices_for_creation_request
  from constants
  cross join invoice_facts
  left join public.finance_invoice_v2_composition_requests as request
    on request.request_id = invoice_facts.creation_request_id
  group by constants.invoice_id, constants.court_fee_charge_id, constants.travel_charge_id,
    invoice_facts.creation_request_id, invoice_facts.creation_fingerprint
),
invoice_audit_facts as (
  select
    count(*) filter (where audit.event_type = 'v2_draft_composed') as draft_composed_event_count,
    count(*) filter (
      where audit.event_type = 'issued'
        and audit.event_payload_json->>'schema_version' = '2'
        and audit.event_payload_json->>'source_model' = 'billable_charge_v2'
        and audit.event_payload_json->>'invoice_no' = (select invoice_no from constants)
        and coalesce((audit.event_payload_json->>'payment_created')::boolean, false) = false
        and coalesce((audit.event_payload_json->>'ledger_entry_created')::boolean, false) = false
        and coalesce((audit.event_payload_json->>'compensation_entry_created')::boolean, false) = false
    ) as valid_issued_event_count,
    count(*) filter (where audit.event_type in ('cancelled', 'voided')) as invalid_terminal_event_count
  from public.finance_invoice_audit_events as audit
  where audit.invoice_id = (select invoice_id from constants)
),
allocation_audit_facts as (
  select
    count(*) filter (where audit.event_type = 'reserved') as reserved_event_count,
    count(*) filter (where audit.event_type = 'invoiced') as invoiced_event_count,
    count(*) filter (where audit.event_type = 'released') as released_event_count,
    count(distinct audit.allocation_id) filter (where audit.event_type = 'reserved') as reserved_allocation_history_count,
    count(distinct audit.allocation_id) filter (where audit.event_type = 'invoiced') as invoiced_allocation_history_count
  from public.finance_invoice_charge_allocation_audit_events as audit
  cross join constants
  where audit.invoice_id = constants.invoice_id
),
charge_audit_facts as (
  select
    count(*) filter (where audit.event_type = 'reserved') as reserved_event_count,
    count(*) filter (where audit.event_type = 'invoiced') as invoiced_event_count,
    count(*) filter (where audit.event_type in ('reservation_released', 'invoice_voided_returned_ready')) as released_event_count
  from public.finance_billable_charge_audit_events as audit
  cross join constants
  where audit.charge_id in (constants.court_fee_charge_id, constants.travel_charge_id)
),
invoice_number_facts as (
  select count(*) as invoice_number_owner_count
  from public.finance_invoices as invoice
  cross join constants
  where invoice.invoice_no = constants.invoice_no
),
settlement_facts as (
  select
    count(*) as settlement_summary_count,
    coalesce(max(summary.confirmed_cash_allocated), 0) as confirmed_cash,
    coalesce(max(summary.confirmed_wht_credit_allocated), 0) as confirmed_wht,
    coalesce(max(summary.economically_settled_amount), 0) as confirmed_settlement,
    coalesce(max(summary.outstanding_amount), 0) as outstanding_amount,
    max(summary.payment_status) as payment_status
  from public.finance_invoice_settlement_summary as summary
  cross join constants
  where summary.invoice_id = constants.invoice_id
),
target_related_payment_ids as (
  select payment.id as payment_id
  from public.finance_payments as payment
  cross join constants
  where payment.draft_origin_invoice_id = constants.invoice_id

  union

  select allocation.payment_id
  from public.finance_payment_invoice_allocations as allocation
  cross join constants
  where allocation.invoice_id = constants.invoice_id

  union

  select effective.payment_id
  from public.finance_payment_effective_invoice_allocations as effective
  cross join constants
  where effective.invoice_id = constants.invoice_id
),
target_payment_details as (
  select
    payment.id,
    payment.status,
    payment.draft_origin_invoice_id,
    payment.created_at,
    invoice.issued_at as invoice_issued_at,
    raw_allocation.raw_allocation_count,
    raw_allocation.raw_cash_allocated,
    raw_allocation.raw_wht_allocated,
    raw_allocation.raw_settlement_allocated,
    effective_allocation.effective_allocation_count,
    effective_allocation.effective_cash_allocated,
    effective_allocation.effective_wht_allocated,
    effective_allocation.effective_settlement_allocated,
    cash_transaction.cash_transaction_count,
    audit.audit_event_count,
    audit.draft_created_event_count,
    audit.draft_created_side_effect_violation_count
  from target_related_payment_ids as related
  join public.finance_payments as payment on payment.id = related.payment_id
  cross join target_invoice as invoice
  left join lateral (
    select
      count(*) as raw_allocation_count,
      coalesce(sum(allocation.cash_allocated), 0)::numeric(14, 2) as raw_cash_allocated,
      coalesce(sum(allocation.wht_credit_allocated), 0)::numeric(14, 2) as raw_wht_allocated,
      coalesce(sum(allocation.settlement_total), 0)::numeric(14, 2) as raw_settlement_allocated
    from public.finance_payment_invoice_allocations as allocation
    cross join constants
    where allocation.payment_id = payment.id
      and allocation.invoice_id = constants.invoice_id
  ) as raw_allocation on true
  left join lateral (
    select
      count(*) as effective_allocation_count,
      coalesce(sum(effective.effective_cash_allocated), 0)::numeric(14, 2) as effective_cash_allocated,
      coalesce(sum(effective.effective_wht_credit_allocated), 0)::numeric(14, 2) as effective_wht_allocated,
      coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2) as effective_settlement_allocated
    from public.finance_payment_effective_invoice_allocations as effective
    cross join constants
    where effective.payment_id = payment.id
      and effective.invoice_id = constants.invoice_id
  ) as effective_allocation on true
  left join lateral (
    select count(*) as cash_transaction_count
    from public.finance_cash_transactions as cash_transaction
    where cash_transaction.source_payment_id = payment.id
  ) as cash_transaction on true
  left join lateral (
    select
      count(*) as audit_event_count,
      count(*) filter (where audit.event_type = 'draft_created') as draft_created_event_count,
      count(*) filter (
        where audit.event_type = 'draft_created'
          and (
            coalesce((audit.event_payload_json->>'authoritative_settlement_created')::boolean, false)
            or coalesce((audit.event_payload_json->>'ledger_created')::boolean, false)
            or coalesce((audit.event_payload_json->>'receipt_created')::boolean, false)
            or coalesce((audit.event_payload_json->>'tax_invoice_created')::boolean, false)
            or coalesce((audit.event_payload_json->>'compensation_created')::boolean, false)
          )
      ) as draft_created_side_effect_violation_count
    from public.finance_payment_audit_events as audit
    where audit.payment_id = payment.id
  ) as audit on true
),
target_payment_facts as (
  select
    count(*) as payment_row_count,
    count(*) filter (where payment.status = 'draft') as draft_payment_row_count,
    count(*) filter (where payment.status = 'confirmed') as confirmed_payment_row_count,
    count(*) filter (where payment.status = 'cancelled') as cancelled_payment_row_count,
    count(*) filter (where payment.status = 'reversed') as reversed_payment_row_count,
    coalesce(sum(payment.raw_allocation_count), 0) as raw_allocation_count,
    coalesce(sum(payment.raw_cash_allocated) filter (where payment.status = 'draft'), 0)::numeric(14, 2)
      as draft_reserved_cash,
    coalesce(sum(payment.raw_wht_allocated) filter (where payment.status = 'draft'), 0)::numeric(14, 2)
      as draft_reserved_wht,
    coalesce(sum(payment.raw_settlement_allocated) filter (where payment.status = 'draft'), 0)::numeric(14, 2)
      as draft_reserved_settlement,
    coalesce(sum(payment.effective_cash_allocated) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_effective_cash,
    coalesce(sum(payment.effective_wht_allocated) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_effective_wht,
    coalesce(sum(payment.effective_settlement_allocated) filter (where payment.status = 'confirmed'), 0)::numeric(14, 2)
      as confirmed_effective_settlement,
    coalesce(sum(payment.cash_transaction_count), 0) as payment_origin_cash_transaction_count,
    count(*) filter (
      where payment.status = 'draft'
        and payment.draft_origin_invoice_id = (select invoice_id from constants)
        and payment.created_at > payment.invoice_issued_at
    ) as post_issue_origin_draft_count,
    count(*) filter (where payment.created_at <= payment.invoice_issued_at)
      as payment_rows_at_or_before_invoice_issue,
    count(*) filter (
      where payment.status = 'draft'
        and payment.audit_event_count = 1
        and payment.draft_created_event_count = 1
    ) as draft_with_only_draft_created_audit_count,
    coalesce(sum(payment.draft_created_side_effect_violation_count), 0)
      as draft_created_side_effect_violation_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id', payment.id,
          'short_ui_identifier', upper(left(payment.id::text, 8)),
          'status', payment.status,
          'draft_origin_invoice_id', payment.draft_origin_invoice_id,
          'created_at', payment.created_at,
          'invoice_issued_at', payment.invoice_issued_at,
          'created_after_invoice_issue', payment.created_at > payment.invoice_issued_at,
          'raw_allocation_count', payment.raw_allocation_count,
          'raw_cash_allocated', payment.raw_cash_allocated,
          'raw_wht_allocated', payment.raw_wht_allocated,
          'raw_settlement_allocated', payment.raw_settlement_allocated,
          'effective_allocation_count', payment.effective_allocation_count,
          'effective_cash_allocated', payment.effective_cash_allocated,
          'effective_wht_allocated', payment.effective_wht_allocated,
          'effective_settlement_allocated', payment.effective_settlement_allocated,
          'cash_transaction_count', payment.cash_transaction_count,
          'audit_event_count', payment.audit_event_count,
          'draft_created_event_count', payment.draft_created_event_count,
          'draft_created_side_effect_violation_count', payment.draft_created_side_effect_violation_count
        ) order by payment.created_at, payment.id
      ),
      '[]'::jsonb
    ) as target_payments
  from target_payment_details as payment
),
bridge_facts as (
  select
    count(*) as target_bridge_count,
    (select count(*) from public.finance_billing_installment_charge_bridges) as global_bridge_rows,
    (
      select count(*)
      from public.finance_billable_charges
      where source_type = 'billing_installment_item'
    ) as global_installment_generated_charge_rows
  from target_invoice as invoice
  join public.finance_billing_installment_charge_bridges as bridge
    on bridge.id = invoice.v2_bridge_id
),
historical_v1_facts as (
  select
    count(*) as historical_v1_invoice_count,
    count(*) filter (
      where invoice.invoice_no = 'VP-IV-202608-000001'
        and invoice.source_model = 'installment_v1'
        and invoice.document_status = 'voided'
    ) as valid_v1_000001_count,
    count(*) filter (
      where invoice.invoice_no = 'VP-IV-202608-000002'
        and invoice.source_model = 'installment_v1'
        and invoice.document_status = 'issued'
    ) as valid_v1_000002_count,
    count(*) filter (
      where invoice.invoice_no = 'VP-IV-202608-000003'
        and invoice.source_model = 'installment_v1'
        and invoice.document_status = 'issued'
    ) as valid_v1_000003_count
  from public.finance_invoices as invoice
  where invoice.invoice_no in (
    'VP-IV-202608-000001',
    'VP-IV-202608-000002',
    'VP-IV-202608-000003'
  )
),
finance_observability as (
  select
    (select count(*) from public.finance_payments) as total_payment_rows,
    (select count(*) from public.finance_payments where status = 'confirmed') as confirmed_payment_rows,
    (select coalesce(sum(cash_amount), 0) from public.finance_payments where status = 'confirmed') as confirmed_payment_cash,
    (select coalesce(sum(wht_amount), 0) from public.finance_payments where status = 'confirmed') as confirmed_payment_wht,
    (select coalesce(sum(settlement_amount), 0) from public.finance_payments where status = 'confirmed') as confirmed_payment_settlement,
    (select count(*) from public.finance_cash_transactions) as cash_transaction_rows,
    (select count(*) from public.finance_cash_transactions where source_payment_id is not null) as payment_origin_cash_transaction_rows,
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_receipt_payment_allocations') is null
      as receipt_objects_absent,
    to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as tax_invoice_objects_absent
)
select
  constants.invoice_id as target_invoice_id,
  invoice_facts.target_invoice_count,
  invoice_facts.invoice_no,
  invoice_facts.source_model,
  invoice_facts.document_status,
  invoice_facts.issue_date,
  invoice_facts.due_date,
  invoice_facts.amount_before_vat,
  invoice_facts.vat_amount,
  invoice_facts.total_amount,
  invoice_facts.charge_only_lineage,
  invoice_facts.issued_v2_snapshot_valid,
  invoice_facts.frozen_payment_destination_is_kbank,
  bank_facts.destination_bank_row_count,
  bank_facts.destination_bank_is_kbank,
  item_facts.effective_item_count,
  item_facts.released_item_count,
  item_facts.effective_source_charge_count,
  item_facts.effective_before_vat as invoice_items_before_vat,
  item_facts.effective_vat as invoice_items_vat,
  item_facts.effective_total as invoice_items_total,
  item_facts.invoice_items,
  allocation_facts.effective_allocation_count,
  allocation_facts.reserved_allocation_count,
  allocation_facts.released_allocation_count,
  allocation_facts.effective_allocated_charge_count,
  allocation_facts.effective_allocated_item_count,
  allocation_facts.allocated_before_vat,
  allocation_facts.allocated_vat,
  allocation_facts.allocated_total,
  allocation_facts.allocation_item_mismatch_count,
  charge_facts.source_charge_count,
  charge_facts.invoiced_charge_count,
  charge_facts.nonfinal_charge_count,
  charge_facts.installment_generated_charge_count,
  charge_facts.source_charges,
  composition_facts.creation_request_count,
  composition_facts.valid_creation_request_count,
  composition_facts.invoices_for_creation_request,
  invoice_audit_facts.draft_composed_event_count,
  invoice_audit_facts.valid_issued_event_count,
  invoice_audit_facts.invalid_terminal_event_count,
  allocation_audit_facts.reserved_event_count as allocation_reserved_audit_events,
  allocation_audit_facts.invoiced_event_count as allocation_invoiced_audit_events,
  allocation_audit_facts.released_event_count as allocation_released_audit_events,
  charge_audit_facts.reserved_event_count as charge_reserved_audit_events,
  charge_audit_facts.invoiced_event_count as charge_invoiced_audit_events,
  charge_audit_facts.released_event_count as charge_released_audit_events,
  invoice_number_facts.invoice_number_owner_count,
  settlement_facts.confirmed_cash,
  settlement_facts.confirmed_wht,
  settlement_facts.confirmed_settlement,
  settlement_facts.outstanding_amount,
  settlement_facts.payment_status,
  target_payment_facts.payment_row_count as target_payment_rows,
  target_payment_facts.draft_payment_row_count as target_draft_payment_rows,
  target_payment_facts.confirmed_payment_row_count as target_confirmed_payment_rows,
  target_payment_facts.cancelled_payment_row_count as target_cancelled_payment_rows,
  target_payment_facts.reversed_payment_row_count as target_reversed_payment_rows,
  target_payment_facts.raw_allocation_count as target_raw_payment_allocations,
  target_payment_facts.draft_reserved_cash as target_draft_reserved_cash,
  target_payment_facts.draft_reserved_wht as target_draft_reserved_wht,
  target_payment_facts.draft_reserved_settlement as target_draft_reserved_settlement,
  target_payment_facts.confirmed_effective_cash as target_confirmed_effective_cash,
  target_payment_facts.confirmed_effective_wht as target_confirmed_effective_wht,
  target_payment_facts.confirmed_effective_settlement as target_confirmed_effective_settlement,
  target_payment_facts.payment_origin_cash_transaction_count as target_invoice_payment_origin_cash_transactions,
  target_payment_facts.post_issue_origin_draft_count,
  target_payment_facts.payment_rows_at_or_before_invoice_issue,
  target_payment_facts.draft_with_only_draft_created_audit_count,
  target_payment_facts.draft_created_side_effect_violation_count,
  target_payment_facts.target_payments,
  bridge_facts.target_bridge_count,
  bridge_facts.global_bridge_rows,
  bridge_facts.global_installment_generated_charge_rows,
  historical_v1_facts.historical_v1_invoice_count,
  historical_v1_facts.valid_v1_000001_count,
  historical_v1_facts.valid_v1_000002_count,
  historical_v1_facts.valid_v1_000003_count,
  finance_observability.total_payment_rows,
  finance_observability.confirmed_payment_rows,
  finance_observability.confirmed_payment_cash,
  finance_observability.confirmed_payment_wht,
  finance_observability.confirmed_payment_settlement,
  finance_observability.cash_transaction_rows,
  finance_observability.payment_origin_cash_transaction_rows,
  finance_observability.opening_balance_rows,
  finance_observability.legacy_ledger_rows,
  finance_observability.compensation_rows,
  finance_observability.receipt_objects_absent,
  finance_observability.tax_invoice_objects_absent,
  coalesce((
    invoice_facts.target_invoice_count = 1
    and invoice_facts.invoice_no = constants.invoice_no
    and invoice_facts.source_model = 'billable_charge_v2'
    and invoice_facts.document_status = 'issued'
    and invoice_facts.issue_date = date '2026-09-01'
    and invoice_facts.due_date = date '2026-09-03'
    and invoice_facts.amount_before_vat = 7000
    and invoice_facts.vat_amount = 0
    and invoice_facts.total_amount = 7000
    and coalesce(invoice_facts.charge_only_lineage, false)
    and coalesce(invoice_facts.issued_v2_snapshot_valid, false)
    and coalesce(invoice_facts.frozen_payment_destination_is_kbank, false)
    and bank_facts.destination_bank_row_count = 1
    and bank_facts.destination_bank_is_kbank
    and item_facts.invoice_item_history_count = 2
    and item_facts.effective_item_count = 2
    and item_facts.released_item_count = 0
    and item_facts.effective_source_charge_count = 2
    and item_facts.effective_before_vat = 7000
    and item_facts.effective_vat = 0
    and item_facts.effective_total = 7000
    and item_facts.valid_court_fee_item_count = 1
    and item_facts.valid_travel_item_count = 1
    and allocation_facts.allocation_history_count = 2
    and allocation_facts.effective_allocation_count = 2
    and allocation_facts.reserved_allocation_count = 0
    and allocation_facts.released_allocation_count = 0
    and allocation_facts.effective_allocated_charge_count = 2
    and allocation_facts.effective_allocated_item_count = 2
    and allocation_facts.allocated_before_vat = 7000
    and allocation_facts.allocated_vat = 0
    and allocation_facts.allocated_total = 7000
    and allocation_facts.valid_court_fee_allocation_count = 1
    and allocation_facts.valid_travel_allocation_count = 1
    and allocation_facts.allocation_item_mismatch_count = 0
    and charge_facts.source_charge_count = 2
    and charge_facts.invoiced_charge_count = 2
    and charge_facts.nonfinal_charge_count = 0
    and charge_facts.installment_generated_charge_count = 0
    and charge_facts.valid_court_fee_charge_count = 1
    and charge_facts.valid_travel_charge_count = 1
    and composition_facts.creation_request_count = 1
    and composition_facts.valid_creation_request_count = 1
    and composition_facts.invoices_for_creation_request = 1
    and invoice_audit_facts.draft_composed_event_count = 1
    and invoice_audit_facts.valid_issued_event_count = 1
    and invoice_audit_facts.invalid_terminal_event_count = 0
    and allocation_audit_facts.reserved_event_count = 2
    and allocation_audit_facts.invoiced_event_count = 2
    and allocation_audit_facts.released_event_count = 0
    and allocation_audit_facts.reserved_allocation_history_count = 2
    and allocation_audit_facts.invoiced_allocation_history_count = 2
    and charge_audit_facts.reserved_event_count = 2
    and charge_audit_facts.invoiced_event_count = 2
    and charge_audit_facts.released_event_count = 0
    and invoice_number_facts.invoice_number_owner_count = 1
    and settlement_facts.settlement_summary_count = 1
    and settlement_facts.confirmed_cash = 0
    and settlement_facts.confirmed_wht = 0
    and settlement_facts.confirmed_settlement = 0
    and settlement_facts.outstanding_amount = 7000
    and settlement_facts.payment_status = 'unpaid'
    and target_payment_facts.confirmed_payment_row_count = 0
    and target_payment_facts.confirmed_effective_cash = 0
    and target_payment_facts.confirmed_effective_wht = 0
    and target_payment_facts.confirmed_effective_settlement = 0
    and target_payment_facts.payment_origin_cash_transaction_count = 0
    and target_payment_facts.payment_rows_at_or_before_invoice_issue = 0
    and target_payment_facts.draft_created_side_effect_violation_count = 0
    and bridge_facts.target_bridge_count = 0
    and historical_v1_facts.historical_v1_invoice_count = 3
    and historical_v1_facts.valid_v1_000001_count = 1
    and historical_v1_facts.valid_v1_000002_count = 1
    and historical_v1_facts.valid_v1_000003_count = 1
    and finance_observability.receipt_objects_absent
    and finance_observability.tax_invoice_objects_absent
  ), false) as phase_b3c_first_invoice_v2_uat_verification_pass
from constants
cross join invoice_facts
cross join bank_facts
cross join item_facts
cross join allocation_facts
cross join charge_facts
cross join composition_facts
cross join invoice_audit_facts
cross join allocation_audit_facts
cross join charge_audit_facts
cross join invoice_number_facts
cross join settlement_facts
cross join target_payment_facts
cross join bridge_facts
cross join historical_v1_facts
cross join finance_observability;
