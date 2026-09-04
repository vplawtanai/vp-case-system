-- Post-confirmation UAT verification for Payment 7F70C112.
-- SELECT-only: one statement, one result row, and no RPC calls.
-- Cash evidence is outcome-aware: M027 intentionally skips posting before a
-- confirmed Opening Balance cutoff and records that decision on the Payment event.

with
constants as (
  select
    '7f70c112-d5dc-46d2-adbb-8febe239068b'::uuid as payment_id,
    '026760aa-9396-4259-b46f-96da8a1120aa'::uuid as invoice_id,
    'VP-IV-202609-000002'::text as invoice_no,
    'be140a76-2479-4977-9899-3a4bbd9bf0a5'::uuid as billing_installment_id,
    '89a24d8a-0b05-4030-92ad-2b47b09c2c04'::uuid as travel_charge_id
),
function_contract_facts as (
  select
    lower(pg_get_functiondef(
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure
    )) as confirm_payment_definition,
    lower(pg_get_functiondef(
      'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure
    )) as cash_posting_definition
),
function_contract_checks as (
  select
    confirm_payment_definition like '%post_confirmed_payment_to_finance_cash_transaction%'
      and confirm_payment_definition like '%cash_posting_outcome%'
      and strpos(confirm_payment_definition, 'update public.finance_payments')
        < strpos(confirm_payment_definition, 'post_confirmed_payment_to_finance_cash_transaction')
      and strpos(confirm_payment_definition, 'post_confirmed_payment_to_finance_cash_transaction')
        < strpos(confirm_payment_definition, 'record_finance_payment_audit_event')
      as effective_confirm_function_has_cash_integration,
    cash_posting_definition like '%pre_cutover_no_opening%'
      and cash_posting_definition like '%v_opening_balance.id is null%'
      and cash_posting_definition like '%return jsonb_build_object%'
      as no_opening_pre_cutover_contract_present,
    cash_posting_definition like '%pre_cutover_date%'
      and cash_posting_definition like '%v_payment.received_on <= v_cutoff_date%'
      as cutoff_date_pre_cutover_contract_present,
    cash_posting_definition like '%insert into public.finance_cash_transactions%'
      and cash_posting_definition like '%''customer_payment''%'
      and cash_posting_definition like '%''inflow''%'
      and cash_posting_definition like '%v_payment.cash_amount%'
      as post_cutover_cash_contract_present
  from function_contract_facts
),
payment_facts as (
  select
    count(*) as payment_count,
    max(payment.internal_reference) as internal_reference,
    max(upper(substr(payment.id::text, 1, 8))) as ui_reference,
    max(payment.status) as payment_row_status,
    max(payment.received_on) as received_on,
    max(payment.currency) as currency,
    max(payment.payment_method) as payment_method,
    max(payment.receiving_bank_account_id::text)::uuid as receiving_bank_account_id,
    max(bank.short_name) as receiving_bank_short_name,
    max(payment.cash_amount) as cash_amount,
    max(payment.wht_amount) as wht_amount,
    max(payment.settlement_amount) as settlement_amount,
    max(payment.confirmed_at) as confirmed_at,
    max(payment.confirmed_by_user_id::text)::uuid as confirmed_by_user_id,
    max(payment.cancelled_at) as cancelled_at,
    max(payment.reversed_at) as reversed_at,
    coalesce(bool_and(
      payment.status = 'confirmed'
      and payment.confirmed_at is not null
      and payment.confirmed_by_user_id is not null
      and payment.cancelled_at is null
      and payment.cancelled_by_user_id is null
      and payment.cancel_reason is null
      and payment.reversed_at is null
      and payment.reversed_by_user_id is null
      and payment.reverse_reason is null
    ), false) as confirmed_lifecycle_metadata_valid
  from public.finance_payments as payment
  cross join constants
  left join public.finance_bank_accounts as bank
    on bank.id = payment.receiving_bank_account_id
  where payment.id = constants.payment_id
),
payment_audit_facts as (
  select
    count(*) filter (where audit.event_type = 'confirmed') as confirmed_event_count,
    count(*) filter (where audit.event_type = 'allocation_reallocated') as reallocation_event_count,
    count(*) filter (where audit.event_type = 'reversed') as reversed_event_count,
    count(*) filter (
      where audit.event_type = 'reversed'
        and audit.event_payload_json->>'correction_workflow' = 'full_erroneous_payment'
    ) as erroneous_correction_event_count,
    (max(audit.event_payload_json::text) filter (
      where audit.event_type = 'confirmed'
    ))::jsonb as confirmed_event_payload_json,
    max(audit.event_payload_json->>'cash_posting_outcome') filter (
      where audit.event_type = 'confirmed'
    ) as cash_posting_outcome,
    max(audit.event_payload_json->>'cash_transaction_id') filter (
      where audit.event_type = 'confirmed'
    ) as confirmed_event_cash_transaction_id,
    max((audit.event_payload_json->>'cash_amount_posted')::numeric) filter (
      where audit.event_type = 'confirmed'
    ) as confirmed_event_cash_amount_posted,
    coalesce(bool_and(
      audit.event_payload_json->>'wht_excluded_from_cash_posting' = 'true'
      and coalesce((audit.event_payload_json->>'ledger_created')::boolean, true) = false
      and coalesce((audit.event_payload_json->>'receipt_created')::boolean, true) = false
      and coalesce((audit.event_payload_json->>'tax_invoice_created')::boolean, true) = false
      and coalesce((audit.event_payload_json->>'compensation_created')::boolean, true) = false
      and (
        (
          audit.event_payload_json->>'cash_posting_outcome' = 'posted'
          and nullif(audit.event_payload_json->>'cash_transaction_id', '') is not null
          and (audit.event_payload_json->>'cash_amount_posted')::numeric = 10000.00
          and audit.event_payload_json->>'cash_receiving_bank_account_id'
            = payment_facts.receiving_bank_account_id::text
          and audit.event_payload_json->>'cash_currency' = 'THB'
          and nullif(
            audit.event_payload_json->>'cash_accounting_effective_occurred_at',
            ''
          ) is not null
        )
        or (
          audit.event_payload_json->>'cash_posting_outcome' in (
            'pre_cutover_no_opening',
            'pre_cutover_date'
          )
          and nullif(audit.event_payload_json->>'cash_transaction_id', '') is null
          and (audit.event_payload_json->>'cash_amount_posted') is null
          and audit.event_payload_json->>'cash_receiving_bank_account_id'
            = payment_facts.receiving_bank_account_id::text
          and audit.event_payload_json->>'cash_currency' = 'THB'
          and nullif(
            audit.event_payload_json->>'cash_accounting_effective_occurred_at',
            ''
          ) is null
        )
      )
    ) filter (where audit.event_type = 'confirmed'), false) as confirmed_event_contract_valid
  from public.finance_payment_audit_events as audit
  cross join constants
  cross join payment_facts
  where audit.payment_id = constants.payment_id
),
raw_allocation_facts as (
  select
    count(*) as raw_allocation_count,
    count(*) filter (where allocation.invoice_id = constants.invoice_id) as target_raw_allocation_count,
    count(*) filter (where allocation.invoice_id <> constants.invoice_id) as competing_raw_allocation_count,
    max(allocation.cash_allocated) filter (where allocation.invoice_id = constants.invoice_id) as target_raw_cash,
    max(allocation.wht_credit_allocated) filter (where allocation.invoice_id = constants.invoice_id) as target_raw_wht,
    max(allocation.settlement_total) filter (where allocation.invoice_id = constants.invoice_id) as target_raw_settlement
  from public.finance_payment_invoice_allocations as allocation
  cross join constants
  where allocation.payment_id = constants.payment_id
),
effective_allocation_facts as (
  select
    count(*) as effective_allocation_count,
    count(*) filter (where allocation.invoice_id = constants.invoice_id) as target_effective_allocation_count,
    count(*) filter (where allocation.invoice_id <> constants.invoice_id) as competing_effective_allocation_count,
    max(allocation.effective_cash_allocated) filter (where allocation.invoice_id = constants.invoice_id) as target_effective_cash,
    max(allocation.effective_wht_credit_allocated) filter (where allocation.invoice_id = constants.invoice_id) as target_effective_wht,
    max(allocation.effective_settlement_total) filter (where allocation.invoice_id = constants.invoice_id) as target_effective_settlement,
    coalesce(sum(allocation.effective_cash_allocated), 0)::numeric(14, 2) as total_effective_cash,
    coalesce(sum(allocation.effective_wht_credit_allocated), 0)::numeric(14, 2) as total_effective_wht,
    coalesce(sum(allocation.effective_settlement_total), 0)::numeric(14, 2) as total_effective_settlement
  from public.finance_payment_effective_invoice_allocations as allocation
  cross join constants
  where allocation.payment_id = constants.payment_id
),
reallocation_facts as (
  select count(*) as reallocation_row_count
  from public.finance_payment_allocation_reallocations as reallocation
  cross join constants
  where reallocation.payment_id = constants.payment_id
),
invoice_facts as (
  select
    count(*) as invoice_count,
    max(invoice.invoice_no) as invoice_no,
    max(invoice.document_status) as invoice_status,
    max(invoice.source_model) as source_model,
    max(invoice.currency) as currency,
    max(invoice.amount_before_vat) as amount_before_vat,
    max(invoice.vat_amount) as vat_amount,
    max(invoice.total_amount) as total_amount,
    max(invoice.billing_plan_id::text)::uuid as billing_plan_id,
    max(invoice.v2_bridge_id::text)::uuid as bridge_id,
    coalesce(bool_and(
      invoice.document_status = 'issued'
      and invoice.invoice_no = constants.invoice_no
      and invoice.source_model = 'billable_charge_v2'
      and invoice.issued_snapshot_json is not null
      and invoice.issued_snapshot_json <> '{}'::jsonb
      and invoice.voided_at is null
      and invoice.cancelled_at is null
    ), false) as issued_invoice_contract_valid
  from public.finance_invoices as invoice
  cross join constants
  where invoice.id = constants.invoice_id
),
settlement_facts as (
  select
    count(*) as settlement_summary_count,
    max(summary.invoice_status) as invoice_status,
    max(summary.invoice_gross_amount) as invoice_gross_amount,
    max(summary.confirmed_cash_allocated) as confirmed_money_received,
    max(summary.confirmed_wht_credit_allocated) as confirmed_wht_credit,
    max(summary.economically_settled_amount) as economically_settled_amount,
    max(summary.outstanding_amount) as outstanding_amount,
    max(summary.payment_status) as payment_status
  from public.finance_invoice_settlement_summary as summary
  cross join constants
  where summary.invoice_id = constants.invoice_id
),
composition_facts as (
  select
    count(*) as source_charge_count,
    count(*) filter (
      where charge.source_type = 'billing_installment_item'
        and installment_item.billing_installment_id = constants.billing_installment_id
        and charge.economic_classification = 'professional_fee'
        and charge.amount_before_vat = 9345.79
        and charge.vat_amount = 654.21
        and charge.total_amount = 10000.00
    ) as valid_installment_charge_count,
    count(*) filter (
      where charge.id = constants.travel_charge_id
        and charge.economic_classification = 'additional_service'
        and charge.amount_before_vat = 2000.00
        and charge.vat_amount = 0.00
        and charge.total_amount = 2000.00
    ) as valid_travel_charge_count,
    count(*) filter (where charge.status = 'invoiced') as invoiced_charge_count,
    count(*) filter (
      where allocation.status = 'invoiced'
        and allocation.invoiced_at is not null
        and allocation.released_at is null
    ) as invoiced_allocation_count,
    count(*) filter (
      where item.invoice_id <> constants.invoice_id
        or item.source_billable_charge_id <> charge.id
        or allocation.invoice_item_id <> item.id
        or allocation.billable_charge_id <> charge.id
        or item.source_state <> 'active'
        or item.amount_before_vat <> charge.amount_before_vat
        or item.vat_amount <> charge.vat_amount
        or item.line_total <> charge.total_amount
        or allocation.amount_before_vat <> charge.amount_before_vat
        or allocation.vat_amount <> charge.vat_amount
        or allocation.total_amount <> charge.total_amount
    ) as source_contract_mismatch_count,
    coalesce(sum(item.amount_before_vat), 0)::numeric(14, 2) as item_before_vat,
    coalesce(sum(item.vat_amount), 0)::numeric(14, 2) as item_vat,
    coalesce(sum(item.line_total), 0)::numeric(14, 2) as item_total
  from public.finance_invoice_charge_allocations as allocation
  cross join constants
  join public.finance_invoice_items as item
    on item.id = allocation.invoice_item_id
  join public.finance_billable_charges as charge
    on charge.id = allocation.billable_charge_id
  left join public.finance_billing_installment_items as installment_item
    on installment_item.id = charge.source_billing_installment_item_id
  where allocation.invoice_id = constants.invoice_id
),
bridge_facts as (
  select
    count(bridge.id) as bridge_count,
    max(installment.status) as installment_status,
    max(installment.amount_before_tax) as installment_before_vat,
    max(installment.vat_amount) as installment_vat,
    max(installment.total_amount) as installment_total,
    max(plan.status) as billing_plan_status,
    coalesce(bool_and(
      bridge.id = invoice.bridge_id
      and bridge.billing_installment_id = constants.billing_installment_id
      and installment.status = 'invoiced'
      and installment.invoiced_at is not null
      and plan.id = invoice.billing_plan_id
    ), false) as bridge_and_plan_contract_valid
  from invoice_facts as invoice
  cross join constants
  left join public.finance_billing_installment_charge_bridges as bridge
    on bridge.id = invoice.bridge_id
  left join public.finance_billing_installments as installment
    on installment.id = bridge.billing_installment_id
  left join public.finance_billing_plans as plan
    on plan.id = invoice.billing_plan_id
),
cash_facts as (
  select
    count(*) as linked_cash_transaction_count,
    count(*) filter (where cash_transaction.reversal_of_transaction_id is null) as original_cash_transaction_count,
    count(*) filter (where cash_transaction.reversal_of_transaction_id is not null) as cash_correction_count,
    (max(cash_transaction.id::text) filter (where cash_transaction.reversal_of_transaction_id is null))::uuid as original_cash_transaction_id,
    max(cash_transaction.status) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_status,
    max(cash_transaction.direction) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_direction,
    max(cash_transaction.transaction_type) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_transaction_type,
    (max(cash_transaction.bank_account_id::text) filter (where cash_transaction.reversal_of_transaction_id is null))::uuid as cash_bank_account_id,
    max(cash_transaction.cash_amount) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_subledger_amount,
    max(cash_transaction.currency) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_currency,
    max(cash_transaction.occurred_at) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_occurred_at,
    max(cash_transaction.confirmed_at) filter (where cash_transaction.reversal_of_transaction_id is null) as cash_confirmed_at
  from public.finance_cash_transactions as cash_transaction
  cross join constants
  where cash_transaction.source_payment_id = constants.payment_id
),
cash_audit_facts as (
  select
    count(*) filter (where audit.event_type = 'confirmed') as cash_confirmed_audit_count,
    coalesce(bool_and(
      audit.event_payload_json->>'automatic_source' = 'payment'
      and audit.event_payload_json->>'source_payment_id' = constants.payment_id::text
      and (audit.event_payload_json->>'cash_amount')::numeric = 10000.00
      and (audit.event_payload_json->>'wht_amount_excluded')::numeric = 0.00
      and audit.event_payload_json->>'bank_account_id' = payment_facts.receiving_bank_account_id::text
      and audit.event_payload_json->>'confirmed_creation' = 'true'
    ) filter (where audit.event_type = 'confirmed'), false) as cash_audit_contract_valid
  from public.finance_cash_transaction_audit_events as audit
  cross join constants
  cross join payment_facts
  cross join cash_facts
  where audit.cash_transaction_id = cash_facts.original_cash_transaction_id
),
cash_posting_contract as (
  select
    payment_audit_facts.cash_posting_outcome = 'posted'
      as cash_posting_required,
    payment_audit_facts.cash_posting_outcome in (
      'pre_cutover_no_opening',
      'pre_cutover_date'
    ) as pre_cutover_cash_posting_skipped,
    case
      when payment_audit_facts.cash_posting_outcome = 'posted' then
        cash_facts.linked_cash_transaction_count = 1
        and cash_facts.original_cash_transaction_count = 1
        and cash_facts.cash_correction_count = 0
        and cash_facts.cash_status = 'confirmed'
        and cash_facts.cash_direction = 'inflow'
        and cash_facts.cash_transaction_type = 'customer_payment'
        and cash_facts.cash_bank_account_id = payment_facts.receiving_bank_account_id
        and cash_facts.cash_subledger_amount = 10000.00
        and cash_facts.cash_currency = 'THB'
        and (cash_facts.cash_occurred_at at time zone 'Asia/Bangkok')::date
          = payment_facts.received_on
        and cash_facts.cash_confirmed_at = payment_facts.confirmed_at
        and cash_audit_facts.cash_confirmed_audit_count = 1
        and cash_audit_facts.cash_audit_contract_valid
      when payment_audit_facts.cash_posting_outcome in (
        'pre_cutover_no_opening',
        'pre_cutover_date'
      ) then
        cash_facts.linked_cash_transaction_count = 0
        and cash_facts.original_cash_transaction_count = 0
        and cash_facts.cash_correction_count = 0
        and cash_audit_facts.cash_confirmed_audit_count = 0
      else false
    end as cash_posting_state_contract_valid
  from payment_facts
  cross join payment_audit_facts
  cross join cash_facts
  cross join cash_audit_facts
),
legacy_and_compensation_safety as (
  select
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_observed,
    (select count(*) from public.finance_compensation_batches) as compensation_rows_observed,
    (select count(*) from public.finance_company_ledger as ledger
      cross join constants
      where to_jsonb(ledger)->>'source_payment_id' = constants.payment_id::text
        or to_jsonb(ledger)->>'payment_id' = constants.payment_id::text
        or position(constants.payment_id::text in to_jsonb(ledger)::text) > 0
    ) as payment_linked_legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches as compensation
      cross join constants
      where to_jsonb(compensation)->>'source_payment_id' = constants.payment_id::text
        or to_jsonb(compensation)->>'payment_id' = constants.payment_id::text
        or position(constants.payment_id::text in to_jsonb(compensation)::text) > 0
    ) as payment_linked_compensation_rows
),
downstream_facts as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_receipt_payment_allocations') is null
      as receipt_objects_absent,
    to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as tax_invoice_objects_absent
),
eligibility_observability as (
  select
    payment_facts.payment_row_status = 'confirmed'
      and effective_allocation_facts.effective_allocation_count = 1
      and reallocation_facts.reallocation_row_count = 0
      and payment_audit_facts.reversed_event_count = 0
      and downstream_facts.receipt_objects_absent
      and downstream_facts.tax_invoice_objects_absent
      and legacy_and_compensation_safety.payment_linked_legacy_ledger_rows = 0
      and legacy_and_compensation_safety.payment_linked_compensation_rows = 0
      as reallocation_source_data_prerequisites_met,
    payment_facts.payment_row_status = 'confirmed'
      and cash_facts.linked_cash_transaction_count in (0, 1)
      and cash_facts.original_cash_transaction_count
        = cash_facts.linked_cash_transaction_count
      and cash_facts.cash_correction_count = 0
      and cash_posting_contract.cash_posting_state_contract_valid
      and payment_audit_facts.erroneous_correction_event_count = 0
      and downstream_facts.receipt_objects_absent
      and downstream_facts.tax_invoice_objects_absent
      and legacy_and_compensation_safety.payment_linked_legacy_ledger_rows = 0
      and legacy_and_compensation_safety.payment_linked_compensation_rows = 0
      as erroneous_payment_correction_data_prerequisites_met
  from payment_facts
  cross join effective_allocation_facts
  cross join reallocation_facts
  cross join payment_audit_facts
  cross join cash_facts
  cross join cash_posting_contract
  cross join downstream_facts
  cross join legacy_and_compensation_safety
),
final_facts as (
  select
    payment_facts.payment_count = 1
      and payment_facts.ui_reference = '7F70C112'
      and payment_facts.payment_row_status = 'confirmed'
      and payment_facts.received_on = date '2026-09-04'
      and payment_facts.currency = 'THB'
      and payment_facts.payment_method = 'bank_transfer'
      and upper(btrim(payment_facts.receiving_bank_short_name)) = 'KBANK'
      and payment_facts.receiving_bank_account_id is not null
      and payment_facts.cash_amount = 10000.00
      and payment_facts.wht_amount = 0.00
      and payment_facts.settlement_amount = 10000.00
      and payment_facts.cash_amount + payment_facts.wht_amount = payment_facts.settlement_amount
      and payment_facts.confirmed_lifecycle_metadata_valid
      and function_contract_checks.effective_confirm_function_has_cash_integration
      and function_contract_checks.no_opening_pre_cutover_contract_present
      and function_contract_checks.cutoff_date_pre_cutover_contract_present
      and function_contract_checks.post_cutover_cash_contract_present
      and payment_audit_facts.confirmed_event_count = 1
      and payment_audit_facts.reallocation_event_count = 0
      and payment_audit_facts.reversed_event_count = 0
      and payment_audit_facts.erroneous_correction_event_count = 0
      and payment_audit_facts.confirmed_event_contract_valid
      and raw_allocation_facts.raw_allocation_count = 1
      and raw_allocation_facts.target_raw_allocation_count = 1
      and raw_allocation_facts.competing_raw_allocation_count = 0
      and raw_allocation_facts.target_raw_cash = 10000.00
      and raw_allocation_facts.target_raw_wht = 0.00
      and raw_allocation_facts.target_raw_settlement = 10000.00
      and effective_allocation_facts.effective_allocation_count = 1
      and effective_allocation_facts.target_effective_allocation_count = 1
      and effective_allocation_facts.competing_effective_allocation_count = 0
      and effective_allocation_facts.target_effective_cash = 10000.00
      and effective_allocation_facts.target_effective_wht = 0.00
      and effective_allocation_facts.target_effective_settlement = 10000.00
      and effective_allocation_facts.total_effective_cash = 10000.00
      and effective_allocation_facts.total_effective_wht = 0.00
      and effective_allocation_facts.total_effective_settlement = 10000.00
      and reallocation_facts.reallocation_row_count = 0
      and invoice_facts.invoice_count = 1
      and invoice_facts.invoice_no = constants.invoice_no
      and invoice_facts.invoice_status = 'issued'
      and invoice_facts.source_model = 'billable_charge_v2'
      and invoice_facts.currency = 'THB'
      and invoice_facts.amount_before_vat = 11345.79
      and invoice_facts.vat_amount = 654.21
      and invoice_facts.total_amount = 12000.00
      and invoice_facts.issued_invoice_contract_valid
      and settlement_facts.settlement_summary_count = 1
      and settlement_facts.invoice_status = 'issued'
      and settlement_facts.invoice_gross_amount = 12000.00
      and settlement_facts.confirmed_money_received = 10000.00
      and settlement_facts.confirmed_wht_credit = 0.00
      and settlement_facts.economically_settled_amount = 10000.00
      and settlement_facts.outstanding_amount = 2000.00
      and settlement_facts.payment_status = 'partially_settled'
      and composition_facts.source_charge_count = 2
      and composition_facts.valid_installment_charge_count = 1
      and composition_facts.valid_travel_charge_count = 1
      and composition_facts.invoiced_charge_count = 2
      and composition_facts.invoiced_allocation_count = 2
      and composition_facts.source_contract_mismatch_count = 0
      and composition_facts.item_before_vat = 11345.79
      and composition_facts.item_vat = 654.21
      and composition_facts.item_total = 12000.00
      and bridge_facts.bridge_count = 1
      and bridge_facts.installment_status = 'invoiced'
      and bridge_facts.installment_before_vat = 9345.79
      and bridge_facts.installment_vat = 654.21
      and bridge_facts.installment_total = 10000.00
      and bridge_facts.billing_plan_status = 'active'
      and bridge_facts.bridge_and_plan_contract_valid
      and cash_posting_contract.cash_posting_state_contract_valid
      and legacy_and_compensation_safety.payment_linked_legacy_ledger_rows = 0
      and legacy_and_compensation_safety.payment_linked_compensation_rows = 0
      and downstream_facts.receipt_objects_absent
      and downstream_facts.tax_invoice_objects_absent
      as verification_pass
  from constants
  cross join function_contract_checks
  cross join payment_facts
  cross join payment_audit_facts
  cross join raw_allocation_facts
  cross join effective_allocation_facts
  cross join reallocation_facts
  cross join invoice_facts
  cross join settlement_facts
  cross join composition_facts
  cross join bridge_facts
  cross join cash_facts
  cross join cash_audit_facts
  cross join cash_posting_contract
  cross join legacy_and_compensation_safety
  cross join downstream_facts
)
select
  constants.payment_id,
  constants.invoice_id,
  function_contract_checks.*,
  payment_facts.*,
  payment_audit_facts.*,
  raw_allocation_facts.*,
  effective_allocation_facts.*,
  reallocation_facts.*,
  invoice_facts.*,
  settlement_facts.*,
  composition_facts.*,
  bridge_facts.*,
  cash_facts.*,
  cash_audit_facts.*,
  cash_posting_contract.*,
  legacy_and_compensation_safety.*,
  downstream_facts.*,
  eligibility_observability.*,
  coalesce(final_facts.verification_pass, false)
    as partial_payment_confirmed_uat_verification_pass
from constants
cross join function_contract_checks
cross join payment_facts
cross join payment_audit_facts
cross join raw_allocation_facts
cross join effective_allocation_facts
cross join reallocation_facts
cross join invoice_facts
cross join settlement_facts
cross join composition_facts
cross join bridge_facts
cross join cash_facts
cross join cash_audit_facts
cross join cash_posting_contract
cross join legacy_and_compensation_safety
cross join downstream_facts
cross join eligibility_observability
cross join final_facts;
