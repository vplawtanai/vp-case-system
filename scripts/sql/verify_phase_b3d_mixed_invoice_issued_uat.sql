with
constants as (
  select
    '026760aa-9396-4259-b46f-96da8a1120aa'::uuid as invoice_id,
    'VP-IV-202609-000002'::text as invoice_no,
    'd0abbc47-e304-44a5-b032-49dea699db25'::uuid as billing_plan_id,
    'be140a76-2479-4977-9899-3a4bbd9bf0a5'::uuid as billing_installment_id,
    '89a24d8a-0b05-4030-92ad-2b47b09c2c04'::uuid as travel_charge_id,
    'VP-QT-202609-0002'::text as quotation_no
),
target_invoice as (
  select invoice.*
  from public.finance_invoices as invoice
  cross join constants
  where invoice.id = constants.invoice_id
),
invoice_facts as (
  select
    count(*) as invoice_count,
    max(invoice.invoice_no) as invoice_no,
    max(invoice.document_status) as document_status,
    max(invoice.source_model) as source_model,
    max(invoice.billing_plan_id::text)::uuid as billing_plan_id,
    max(invoice.source_quotation_id::text)::uuid as source_quotation_id,
    max(invoice.v2_bridge_id::text)::uuid as bridge_id,
    max(invoice.v2_creation_request_id::text)::uuid as creation_request_id,
    max(invoice.currency) as currency,
    max(invoice.issue_date) as issue_date,
    max(invoice.due_date) as due_date,
    max(invoice.issued_at) as issued_at,
    max(invoice.amount_before_vat) as amount_before_vat,
    max(invoice.vat_amount) as vat_amount,
    max(invoice.total_amount) as total_amount,
    max(invoice.payment_destination_bank_account_id::text)::uuid as bank_account_id,
    coalesce(bool_and(
      invoice.document_status = 'issued'
      and invoice.invoice_no is not null
      and invoice.issue_date is not null
      and invoice.issued_at is not null
      and invoice.issued_by_user_id is not null
      and invoice.issued_snapshot_json is not null
      and invoice.issued_snapshot_json <> '{}'::jsonb
      and invoice.cancelled_at is null
      and invoice.cancelled_by_user_id is null
      and invoice.cancel_reason is null
      and invoice.voided_at is null
      and invoice.voided_by_user_id is null
      and invoice.void_reason is null
    ), false) as issue_metadata_valid,
    (array_agg(invoice.issued_snapshot_json))[1] as issued_snapshot
  from target_invoice as invoice
),
numbering_facts as (
  select count(*) as invoice_number_owner_count
  from public.finance_invoices as invoice
  cross join constants
  where invoice.invoice_no = constants.invoice_no
),
lineage_facts as (
  select
    count(*) as lineage_count,
    max(quotation.quotation_no) as quotation_no,
    max(plan.status) as billing_plan_status,
    coalesce(bool_and(
      plan.id = constants.billing_plan_id
      and plan.id = invoice.billing_plan_id
      and plan.fee_agreement_id = invoice.fee_agreement_id
      and agreement.source_quotation_id = invoice.source_quotation_id
      and quotation.quotation_no = constants.quotation_no
      and invoice.client_id = agreement.client_id
      and invoice.case_id is not distinct from agreement.case_id
      and invoice.advisory_matter_id is not distinct from agreement.advisory_matter_id
    ), false) as lineage_valid
  from target_invoice as invoice
  cross join constants
  join public.finance_billing_plans as plan on plan.id = invoice.billing_plan_id
  join public.finance_fee_agreements as agreement on agreement.id = invoice.fee_agreement_id
  join public.finance_quotations as quotation on quotation.id = invoice.source_quotation_id
),
bridge_facts as (
  select
    count(bridge.id) as bridge_count,
    max(bridge.id::text)::uuid as bridge_id,
    max(installment.installment_no) as installment_no,
    max(installment.status) as installment_status,
    max(installment.invoiced_at) as installment_invoiced_at,
    coalesce(bool_and(
      bridge.id = invoice.v2_bridge_id
      and bridge.billing_plan_id = constants.billing_plan_id
      and bridge.billing_installment_id = constants.billing_installment_id
      and bridge.fee_agreement_id = invoice.fee_agreement_id
      and bridge.client_id = invoice.client_id
      and bridge.case_id is not distinct from invoice.case_id
      and bridge.advisory_matter_id is not distinct from invoice.advisory_matter_id
      and bridge.currency = invoice.currency
      and bridge.request_id = invoice.v2_creation_request_id
      and bridge.source_snapshot_json->>'schema_version' = '1'
      and bridge.certification_snapshot_json->>'schema_version' = '1'
      and coalesce((bridge.certification_snapshot_json->>'human_confirmed')::boolean, false)
      and installment.billing_plan_id = constants.billing_plan_id
      and installment.installment_no = 1
      and installment.status = 'invoiced'
      and installment.invoiced_at is not null
      and installment.amount_before_tax = 9345.79
      and installment.vat_amount = 654.21
      and installment.total_amount = 10000.00
    ), false) as bridge_and_installment_valid
  from target_invoice as invoice
  cross join constants
  left join public.finance_billing_installment_charge_bridges as bridge
    on bridge.id = invoice.v2_bridge_id
  left join public.finance_billing_installments as installment
    on installment.id = bridge.billing_installment_id
),
other_installment_facts as (
  select
    count(*) filter (where installment.installment_no in (2, 3)) as other_installment_count,
    count(*) filter (
      where installment.installment_no in (2, 3)
        and (installment.status = 'invoiced' or installment.invoiced_at is not null)
    ) as improperly_invoiced_count,
    count(*) filter (
      where installment.installment_no in (2, 3)
        and bridge.id is not null
    ) as unexpected_bridge_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'installment_id', installment.id,
        'installment_no', installment.installment_no,
        'status', installment.status,
        'ready_to_invoice_at', installment.ready_to_invoice_at,
        'invoiced_at', installment.invoiced_at,
        'total_amount', installment.total_amount,
        'bridge_id', bridge.id
      ) order by installment.installment_no
    ) filter (where installment.installment_no in (2, 3)), '[]'::jsonb) as other_installments
  from public.finance_billing_installments as installment
  cross join constants
  left join public.finance_billing_installment_charge_bridges as bridge
    on bridge.billing_installment_id = installment.id
  where installment.billing_plan_id = constants.billing_plan_id
),
source_rows as (
  select
    allocation.id as allocation_id,
    allocation.status as allocation_status,
    allocation.invoiced_at as allocation_invoiced_at,
    allocation.released_at as allocation_released_at,
    allocation.invoice_id as allocation_invoice_id,
    allocation.billable_charge_id as allocation_charge_id,
    allocation.amount_before_vat as allocation_before_vat,
    allocation.vat_amount as allocation_vat,
    allocation.total_amount as allocation_total,
    allocation.source_snapshot_json as allocation_snapshot,
    item.id as invoice_item_id,
    item.invoice_id as item_invoice_id,
    item.source_billable_charge_id as item_charge_id,
    item.source_state as item_state,
    item.amount_before_vat as item_before_vat,
    item.vat_amount as item_vat,
    item.line_total as item_total,
    item.source_snapshot_json as item_snapshot,
    charge.*,
    installment_item.billing_installment_id as source_installment_id
  from public.finance_invoice_charge_allocations as allocation
  cross join constants
  join public.finance_invoice_items as item on item.id = allocation.invoice_item_id
  join public.finance_billable_charges as charge on charge.id = allocation.billable_charge_id
  left join public.finance_billing_installment_items as installment_item
    on installment_item.id = charge.source_billing_installment_item_id
  where allocation.invoice_id = constants.invoice_id
),
source_facts as (
  select
    count(*) as source_count,
    count(*) filter (
      where source_type = 'billing_installment_item'
        and source_installment_id = constants.billing_installment_id
        and economic_classification = 'professional_fee'
        and calculation_basis = 'source_fixed_allocation'
        and amount_before_vat = 9345.79 and vat_amount = 654.21 and total_amount = 10000.00
        and source_semantics_json->>'economic_classification' = 'professional_fee'
        and ready_snapshot_json->'economic'->>'classification' = 'professional_fee'
    ) as valid_generated_count,
    count(*) filter (
      where id = constants.travel_charge_id
        and source_type = 'ad_hoc_service'
        and economic_classification = 'additional_service'
        and amount_before_vat = 2000.00 and vat_amount = 0 and total_amount = 2000.00
        and ready_snapshot_json->'economic'->>'classification' = 'additional_service'
    ) as valid_travel_count,
    count(*) filter (where status = 'invoiced') as invoiced_charge_count,
    count(*) filter (
      where allocation_status = 'invoiced'
        and allocation_invoiced_at is not null
        and allocation_released_at is null
    ) as invoiced_allocation_count,
    count(*) filter (where allocation_status = 'reserved') as reserved_allocation_count,
    count(*) filter (where allocation_status = 'released') as released_allocation_count,
    count(*) filter (where item_state = 'active') as active_item_count,
    coalesce(sum(item_before_vat), 0)::numeric(14, 2) as item_before_vat,
    coalesce(sum(item_vat), 0)::numeric(14, 2) as item_vat,
    coalesce(sum(item_total), 0)::numeric(14, 2) as item_total,
    coalesce(sum(allocation_before_vat), 0)::numeric(14, 2) as allocation_before_vat,
    coalesce(sum(allocation_vat), 0)::numeric(14, 2) as allocation_vat,
    coalesce(sum(allocation_total), 0)::numeric(14, 2) as allocation_total,
    count(*) filter (
      where allocation_invoice_id <> constants.invoice_id
        or item_invoice_id <> constants.invoice_id
        or allocation_charge_id <> id
        or item_charge_id <> id
        or item_state <> 'active'
        or item_before_vat <> amount_before_vat
        or item_vat <> vat_amount
        or item_total <> total_amount
        or allocation_before_vat <> amount_before_vat
        or allocation_vat <> vat_amount
        or allocation_total <> total_amount
        or item_snapshot->>'billable_charge_id' <> id::text
        or item_snapshot->'ready_snapshot' is distinct from ready_snapshot_json
        or allocation_snapshot->'ready_snapshot' is distinct from ready_snapshot_json
    ) as source_contract_mismatch_count,
    coalesce(jsonb_agg(jsonb_build_object(
      'charge_id', id,
      'source_type', source_type,
      'classification', economic_classification,
      'charge_status', status,
      'allocation_id', allocation_id,
      'allocation_status', allocation_status,
      'amount_before_vat', amount_before_vat,
      'vat_amount', vat_amount,
      'total_amount', total_amount
    ) order by source_type desc, id), '[]'::jsonb) as composition
  from source_rows
  cross join constants
),
reservation_facts as (
  select
    count(*) filter (
      where allocation.status in ('reserved', 'invoiced')
        and allocation.invoice_id <> constants.invoice_id
    ) as competing_active_allocation_count,
    count(*) filter (
      where allocation.status = 'reserved'
        and allocation.billable_charge_id in (select id from source_rows)
    ) as any_reserved_allocation_count
  from public.finance_invoice_charge_allocations as allocation
  cross join constants
  where allocation.billable_charge_id in (select id from source_rows)
),
audit_facts as (
  select
    count(*) filter (where audit.event_type = 'v2_draft_composed') as composed_event_count,
    count(*) filter (
      where audit.event_type = 'issued'
        and audit.event_payload_json->>'source_model' = 'billable_charge_v2'
        and audit.event_payload_json->>'invoice_no' = constants.invoice_no
        and coalesce((audit.event_payload_json->>'payment_created')::boolean, true) = false
        and coalesce((audit.event_payload_json->>'ledger_entry_created')::boolean, true) = false
        and coalesce((audit.event_payload_json->>'compensation_entry_created')::boolean, true) = false
    ) as valid_issue_event_count,
    count(*) filter (where audit.event_type = 'issued') as issue_event_count,
    count(*) filter (where audit.event_type in ('cancelled', 'voided')) as terminal_event_count
  from public.finance_invoice_audit_events as audit
  cross join constants
  where audit.invoice_id = constants.invoice_id
),
source_audit_facts as (
  select
    (select count(*) from public.finance_invoice_charge_allocation_audit_events as audit
      cross join constants
      where audit.invoice_id = constants.invoice_id and audit.event_type = 'reserved') as allocation_reserved_events,
    (select count(*) from public.finance_invoice_charge_allocation_audit_events as audit
      cross join constants
      where audit.invoice_id = constants.invoice_id and audit.event_type = 'invoiced') as allocation_invoiced_events,
    (select count(*) from public.finance_invoice_charge_allocation_audit_events as audit
      cross join constants
      where audit.invoice_id = constants.invoice_id and audit.event_type = 'released') as allocation_released_events,
    (select count(distinct audit.charge_id) from public.finance_billable_charge_audit_events as audit
      where audit.charge_id in (select id from source_rows) and audit.event_type = 'invoiced') as charge_invoiced_history_count,
    (select count(*) from public.finance_billing_installment_charge_bridge_audit_events as audit
      cross join invoice_facts
      cross join constants
      where audit.bridge_id = invoice_facts.bridge_id
        and audit.billing_installment_id = constants.billing_installment_id
        and audit.event_type = 'v2_path_claimed') as bridge_claim_event_count
),
snapshot_item_facts as (
  select
    count(*) as snapshot_item_count,
    count(*) filter (
      where item->'charge'->>'source_type' = 'billing_installment_item'
        and item->'charge'->>'economic_classification' = 'professional_fee'
        and (item->'invoice_item'->>'amount_before_vat')::numeric = 9345.79
        and (item->'invoice_item'->>'vat_amount')::numeric = 654.21
        and (item->'invoice_item'->>'line_total')::numeric = 10000.00
    ) as frozen_generated_count,
    count(*) filter (
      where item->'charge'->>'id' = constants.travel_charge_id::text
        and item->'charge'->>'economic_classification' = 'additional_service'
        and (item->'invoice_item'->>'amount_before_vat')::numeric = 2000.00
        and (item->'invoice_item'->>'vat_amount')::numeric = 0
        and (item->'invoice_item'->>'line_total')::numeric = 2000.00
    ) as frozen_travel_count
  from invoice_facts
  cross join constants
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(invoice_facts.issued_snapshot->'items') = 'array'
      then invoice_facts.issued_snapshot->'items' else '[]'::jsonb end
  ) as snapshot_item(item)
),
snapshot_facts as (
  select
    invoice_facts.issued_snapshot->>'schema_version' = '2'
      and invoice_facts.issued_snapshot->>'source_model' = 'billable_charge_v2'
      and invoice_facts.issued_snapshot->'invoice'->>'id' = constants.invoice_id::text
      and invoice_facts.issued_snapshot->'invoice'->>'invoice_no' = constants.invoice_no
      and invoice_facts.issued_snapshot->'invoice'->>'document_status' = 'issued'
      and (invoice_facts.issued_snapshot->'invoice'->>'issue_date')::date = date '2026-09-03'
      and invoice_facts.issued_snapshot->'invoice'->>'due_date' is null
      and (invoice_facts.issued_snapshot->'invoice'->>'amount_before_vat')::numeric = 11345.79
      and (invoice_facts.issued_snapshot->'invoice'->>'vat_amount')::numeric = 654.21
      and (invoice_facts.issued_snapshot->'invoice'->>'total_amount')::numeric = 12000.00
      and nullif(btrim(coalesce(invoice_facts.issued_snapshot->'invoice'->>'payment_terms_text', '')), '') is null
      and jsonb_typeof(invoice_facts.issued_snapshot->'seller') = 'object'
      and invoice_facts.issued_snapshot->'seller' <> '{}'::jsonb
      and jsonb_typeof(invoice_facts.issued_snapshot->'customer') = 'object'
      and invoice_facts.issued_snapshot->'customer' <> '{}'::jsonb
      and jsonb_typeof(invoice_facts.issued_snapshot->'source') = 'object'
      and invoice_facts.issued_snapshot->'source'->>'invoice_source_model' = 'billable_charge_v2'
      and invoice_facts.issued_snapshot->'bridge'->>'id' = invoice_facts.bridge_id::text
      and invoice_facts.issued_snapshot->'payment_destination'->>'bank_account_id' = invoice_facts.bank_account_id::text
      and invoice_facts.issued_snapshot->'payment_destination'->>'short_name' = 'KBANK'
      and nullif(btrim(coalesce(invoice_facts.issued_snapshot->'payment_destination'->>'account_name', '')), '') is not null
      and nullif(btrim(coalesce(invoice_facts.issued_snapshot->'payment_destination'->>'account_number', '')), '') is not null
      and snapshot_item_facts.snapshot_item_count = 2
      and snapshot_item_facts.frozen_generated_count = 1
      and snapshot_item_facts.frozen_travel_count = 1
      as frozen_document_valid
  from invoice_facts
  cross join constants
  cross join snapshot_item_facts
),
bank_facts as (
  select
    count(bank.id) as bank_count,
    coalesce(bool_and(
      bank.short_name = 'KBANK'
      and invoice.payment_destination_snapshot_json->>'bank_account_id' = bank.id::text
      and invoice.payment_destination_snapshot_json->>'short_name' = 'KBANK'
      and nullif(btrim(coalesce(invoice.payment_destination_snapshot_json->>'account_name', '')), '') is not null
      and nullif(btrim(coalesce(invoice.payment_destination_snapshot_json->>'account_number', '')), '') is not null
    ), false) as frozen_kbank_valid
  from target_invoice as invoice
  left join public.finance_bank_accounts as bank on bank.id = invoice.payment_destination_bank_account_id
),
payment_facts as (
  select
    (select count(*) from public.finance_payments as payment
      where payment.draft_origin_invoice_id = constants.invoice_id) as origin_payment_count,
    (select count(*) from public.finance_payment_invoice_allocations as allocation
      where allocation.invoice_id = constants.invoice_id) as raw_allocation_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations as allocation
      join public.finance_payments as payment on payment.id = allocation.payment_id
      where allocation.invoice_id = constants.invoice_id and payment.status = 'confirmed') as confirmed_effective_allocation_count
  from constants
),
settlement_facts as (
  select
    count(*) as summary_count,
    max(summary.confirmed_cash_allocated) as confirmed_cash,
    max(summary.confirmed_wht_credit_allocated) as confirmed_wht,
    max(summary.economically_settled_amount) as settled_amount,
    max(summary.outstanding_amount) as outstanding_amount,
    max(summary.payment_status) as payment_status
  from public.finance_invoice_settlement_summary as summary
  cross join constants
  where summary.invoice_id = constants.invoice_id
),
cash_facts as (
  select count(*) as linked_cash_transaction_count
  from public.finance_cash_transactions as cash_transaction
  where cash_transaction.source_payment_id in (
    select payment.id from public.finance_payments as payment cross join constants
    where payment.draft_origin_invoice_id = constants.invoice_id
    union
    select allocation.payment_id from public.finance_payment_invoice_allocations as allocation cross join constants
    where allocation.invoice_id = constants.invoice_id
  )
),
downstream_facts as (
  select
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'finance_company_ledger'
        and column_name in ('invoice_id', 'source_invoice_id')
    ) as legacy_ledger_has_no_invoice_link,
    not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'finance_compensation_batches'
        and column_name in ('invoice_id', 'source_invoice_id')
    ) as compensation_has_no_invoice_link,
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_receipt_payment_allocations') is null as receipt_objects_absent,
    to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null as tax_invoice_objects_absent
),
v1_safety_facts as (
  select
    (select count(*) from public.finance_invoice_installment_allocations as allocation
      cross join constants where allocation.billing_installment_id = constants.billing_installment_id) as v1_allocation_count,
    (select count(*) from public.finance_invoices as invoice
      cross join constants
      where invoice.primary_billing_installment_id = constants.billing_installment_id
        and invoice.source_model = 'installment_v1') as v1_invoice_count
),
final_facts as (
  select
    invoice_facts.invoice_count = 1
      and invoice_facts.invoice_no = constants.invoice_no
      and invoice_facts.document_status = 'issued'
      and invoice_facts.source_model = 'billable_charge_v2'
      and invoice_facts.billing_plan_id = constants.billing_plan_id
      and invoice_facts.currency = 'THB'
      and invoice_facts.issue_date = date '2026-09-03'
      and invoice_facts.due_date is null
      and invoice_facts.issued_at is not null
      and invoice_facts.amount_before_vat = 11345.79
      and invoice_facts.vat_amount = 654.21
      and invoice_facts.total_amount = 12000.00
      and invoice_facts.issue_metadata_valid
      and numbering_facts.invoice_number_owner_count = 1
      and lineage_facts.lineage_count = 1
      and lineage_facts.quotation_no = constants.quotation_no
      and lineage_facts.billing_plan_status = 'active'
      and lineage_facts.lineage_valid
      and bridge_facts.bridge_count = 1
      and bridge_facts.bridge_and_installment_valid
      and other_installment_facts.other_installment_count = 2
      and other_installment_facts.improperly_invoiced_count = 0
      and other_installment_facts.unexpected_bridge_count = 0
      and source_facts.source_count = 2
      and source_facts.valid_generated_count = 1
      and source_facts.valid_travel_count = 1
      and source_facts.invoiced_charge_count = 2
      and source_facts.invoiced_allocation_count = 2
      and source_facts.reserved_allocation_count = 0
      and source_facts.released_allocation_count = 0
      and source_facts.active_item_count = 2
      and source_facts.item_before_vat = 11345.79
      and source_facts.item_vat = 654.21
      and source_facts.item_total = 12000.00
      and source_facts.allocation_before_vat = 11345.79
      and source_facts.allocation_vat = 654.21
      and source_facts.allocation_total = 12000.00
      and source_facts.source_contract_mismatch_count = 0
      and reservation_facts.competing_active_allocation_count = 0
      and reservation_facts.any_reserved_allocation_count = 0
      and audit_facts.composed_event_count = 1
      and audit_facts.valid_issue_event_count = 1
      and audit_facts.issue_event_count = 1
      and audit_facts.terminal_event_count = 0
      and source_audit_facts.allocation_reserved_events = 2
      and source_audit_facts.allocation_invoiced_events = 2
      and source_audit_facts.allocation_released_events = 0
      and source_audit_facts.charge_invoiced_history_count = 2
      and source_audit_facts.bridge_claim_event_count = 1
      and snapshot_facts.frozen_document_valid
      and bank_facts.bank_count = 1
      and bank_facts.frozen_kbank_valid
      and payment_facts.origin_payment_count = 0
      and payment_facts.raw_allocation_count = 0
      and payment_facts.confirmed_effective_allocation_count = 0
      and settlement_facts.summary_count = 1
      and settlement_facts.confirmed_cash = 0
      and settlement_facts.confirmed_wht = 0
      and settlement_facts.settled_amount = 0
      and settlement_facts.outstanding_amount = 12000.00
      and settlement_facts.payment_status = 'unpaid'
      and cash_facts.linked_cash_transaction_count = 0
      and downstream_facts.legacy_ledger_has_no_invoice_link
      and downstream_facts.compensation_has_no_invoice_link
      and downstream_facts.receipt_objects_absent
      and downstream_facts.tax_invoice_objects_absent
      and v1_safety_facts.v1_allocation_count = 0
      and v1_safety_facts.v1_invoice_count = 0
      as verification_pass
  from constants
  cross join invoice_facts
  cross join numbering_facts
  cross join lineage_facts
  cross join bridge_facts
  cross join other_installment_facts
  cross join source_facts
  cross join reservation_facts
  cross join audit_facts
  cross join source_audit_facts
  cross join snapshot_facts
  cross join bank_facts
  cross join payment_facts
  cross join settlement_facts
  cross join cash_facts
  cross join downstream_facts
  cross join v1_safety_facts
)
select
  constants.invoice_id as target_invoice_id,
  invoice_facts.invoice_count,
  invoice_facts.invoice_no,
  numbering_facts.invoice_number_owner_count,
  invoice_facts.document_status,
  invoice_facts.source_model,
  invoice_facts.issue_date,
  invoice_facts.due_date,
  invoice_facts.issued_at,
  invoice_facts.issue_metadata_valid,
  (invoice_facts.document_status <> 'draft') as draft_editing_closed,
  invoice_facts.amount_before_vat,
  invoice_facts.vat_amount,
  invoice_facts.total_amount,
  lineage_facts.quotation_no,
  lineage_facts.billing_plan_status,
  lineage_facts.lineage_valid,
  bridge_facts.bridge_id,
  bridge_facts.bridge_count,
  bridge_facts.installment_no,
  bridge_facts.installment_status,
  bridge_facts.installment_invoiced_at,
  bridge_facts.bridge_and_installment_valid,
  other_installment_facts.other_installment_count,
  other_installment_facts.improperly_invoiced_count,
  other_installment_facts.unexpected_bridge_count,
  other_installment_facts.other_installments,
  source_facts.source_count,
  source_facts.valid_generated_count,
  source_facts.valid_travel_count,
  source_facts.invoiced_charge_count,
  source_facts.invoiced_allocation_count,
  source_facts.reserved_allocation_count,
  source_facts.released_allocation_count,
  source_facts.source_contract_mismatch_count,
  source_facts.item_before_vat,
  source_facts.item_vat,
  source_facts.item_total,
  source_facts.allocation_before_vat,
  source_facts.allocation_vat,
  source_facts.allocation_total,
  source_facts.composition,
  reservation_facts.competing_active_allocation_count,
  audit_facts.composed_event_count,
  audit_facts.issue_event_count,
  audit_facts.valid_issue_event_count,
  audit_facts.terminal_event_count,
  source_audit_facts.allocation_reserved_events,
  source_audit_facts.allocation_invoiced_events,
  source_audit_facts.allocation_released_events,
  source_audit_facts.charge_invoiced_history_count,
  source_audit_facts.bridge_claim_event_count,
  snapshot_facts.frozen_document_valid,
  bank_facts.frozen_kbank_valid,
  payment_facts.origin_payment_count,
  payment_facts.raw_allocation_count,
  payment_facts.confirmed_effective_allocation_count,
  settlement_facts.confirmed_cash,
  settlement_facts.confirmed_wht,
  settlement_facts.settled_amount,
  settlement_facts.outstanding_amount,
  settlement_facts.payment_status,
  cash_facts.linked_cash_transaction_count,
  downstream_facts.legacy_ledger_rows,
  downstream_facts.compensation_rows,
  downstream_facts.receipt_objects_absent,
  downstream_facts.tax_invoice_objects_absent,
  (
    invoice_facts.document_status = 'issued'
    and payment_facts.raw_allocation_count = 0
    and payment_facts.confirmed_effective_allocation_count = 0
  ) as currently_meets_no_payment_void_prerequisite,
  coalesce(final_facts.verification_pass, false)
    as phase_b3d_mixed_invoice_issued_uat_verification_pass
from constants
cross join invoice_facts
cross join numbering_facts
cross join lineage_facts
cross join bridge_facts
cross join other_installment_facts
cross join source_facts
cross join reservation_facts
cross join audit_facts
cross join source_audit_facts
cross join snapshot_facts
cross join bank_facts
cross join payment_facts
cross join settlement_facts
cross join cash_facts
cross join downstream_facts
cross join v1_safety_facts
cross join final_facts;
