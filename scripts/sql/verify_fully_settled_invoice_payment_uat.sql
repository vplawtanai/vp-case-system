-- Full-settlement UAT verification for VP-IV-202609-000002.
-- SELECT-only: one statement, one result row, and no RPC calls.

with
constants as (
  select
    '026760aa-9396-4259-b46f-96da8a1120aa'::uuid as invoice_id,
    'VP-IV-202609-000002'::text as invoice_no,
    'd0abbc47-e304-44a5-b032-49dea699db25'::uuid as billing_plan_id,
    'be140a76-2479-4977-9899-3a4bbd9bf0a5'::uuid as billing_installment_id,
    '89a24d8a-0b05-4030-92ad-2b47b09c2c04'::uuid as travel_charge_id
),
expected_payments as (
  select *
  from (values
    (
      '7f70c112-d5dc-46d2-adbb-8febe239068b'::uuid,
      '7F70C112'::text,
      date '2026-09-04',
      10000.00::numeric(14, 2),
      0.00::numeric(14, 2),
      10000.00::numeric(14, 2)
    ),
    (
      'd3dd20c0-7706-4941-bf65-b72b9f6d6d77'::uuid,
      'D3DD20C0'::text,
      date '2026-09-04',
      2000.00::numeric(14, 2),
      0.00::numeric(14, 2),
      2000.00::numeric(14, 2)
    )
  ) as expected(
    payment_id,
    ui_reference,
    received_on,
    cash_amount,
    wht_amount,
    settlement_amount
  )
),
function_contract_facts as (
  select
    lower(pg_get_functiondef(
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure
    )) as create_payment_definition,
    lower(pg_get_functiondef(
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure
    )) as confirm_payment_definition,
    lower(pg_get_functiondef(
      'public.post_confirmed_payment_to_finance_cash_transaction(uuid)'::regprocedure
    )) as cash_posting_definition
),
function_contract_checks as (
  select
    create_payment_definition like '%v_outstanding <= 0%'
      and create_payment_definition like '%invoice is already economically settled%'
      and create_payment_definition like '%v_invoice.document_status <> ''issued''%'
      as settled_invoice_draft_guard_present,
    confirm_payment_definition like '%post_confirmed_payment_to_finance_cash_transaction%'
      and confirm_payment_definition like '%cash_posting_outcome%'
      as payment_cash_integration_present,
    cash_posting_definition like '%pre_cutover_no_opening%'
      and cash_posting_definition like '%pre_cutover_date%'
      and cash_posting_definition like '%insert into public.finance_cash_transactions%'
      and cash_posting_definition like '%v_payment.cash_amount%'
      as conditional_cash_contract_present
  from function_contract_facts
),
invoice_facts as (
  select
    count(*) as invoice_count,
    max(invoice.invoice_no) as invoice_no,
    max(invoice.document_status) as document_status,
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
      and invoice.issued_at is not null
      and invoice.issued_by_user_id is not null
      and invoice.issued_snapshot_json is not null
      and invoice.issued_snapshot_json <> '{}'::jsonb
      and invoice.cancelled_at is null
      and invoice.voided_at is null
    ), false) as issued_contract_valid
  from public.finance_invoices as invoice
  cross join constants
  where invoice.id = constants.invoice_id
),
settlement_facts as (
  select
    count(*) as summary_count,
    max(summary.invoice_status) as invoice_status,
    max(summary.invoice_gross_amount) as invoice_gross_amount,
    max(summary.confirmed_cash_allocated) as confirmed_cash,
    max(summary.confirmed_wht_credit_allocated) as confirmed_wht,
    max(summary.economically_settled_amount) as settled_amount,
    max(summary.outstanding_amount) as outstanding_amount,
    max(summary.payment_status) as payment_status
  from public.finance_invoice_settlement_summary as summary
  cross join constants
  where summary.invoice_id = constants.invoice_id
),
payment_checks as (
  select
    expected.payment_id,
    expected.ui_reference,
    payment.internal_reference,
    payment.status,
    payment.received_on,
    payment.payment_method,
    payment.currency,
    bank.short_name as receiving_bank,
    payment.cash_amount,
    payment.wht_amount,
    payment.settlement_amount,
    payment.confirmed_at,
    payment.confirmed_by_user_id,
    payment.cancelled_at,
    payment.reversed_at,
    (select count(*) from public.finance_payment_invoice_allocations as raw
      where raw.payment_id = expected.payment_id) as raw_allocation_count,
    (select count(*) from public.finance_payment_invoice_allocations as raw
      cross join constants
      where raw.payment_id = expected.payment_id
        and raw.invoice_id = constants.invoice_id
        and raw.cash_allocated = expected.cash_amount
        and raw.wht_credit_allocated = expected.wht_amount
        and raw.settlement_total = expected.settlement_amount
    ) as valid_raw_allocation_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations as effective
      where effective.payment_id = expected.payment_id) as effective_allocation_count,
    (select count(*) from public.finance_payment_effective_invoice_allocations as effective
      cross join constants
      where effective.payment_id = expected.payment_id
        and effective.invoice_id = constants.invoice_id
        and effective.effective_cash_allocated = expected.cash_amount
        and effective.effective_wht_credit_allocated = expected.wht_amount
        and effective.effective_settlement_total = expected.settlement_amount
    ) as valid_effective_allocation_count,
    (select count(*) from public.finance_payment_allocation_reallocations as reallocation
      where reallocation.payment_id = expected.payment_id) as reallocation_count,
    (select count(*) from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'confirmed') as confirmed_event_count,
    (select count(*) from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'draft_created') as draft_created_event_count,
    (select count(*) from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'confirmed'
        and coalesce((audit.event_payload_json->>'ledger_created')::boolean, true) = false
        and coalesce((audit.event_payload_json->>'receipt_created')::boolean, true) = false
        and coalesce((audit.event_payload_json->>'tax_invoice_created')::boolean, true) = false
        and coalesce((audit.event_payload_json->>'compensation_created')::boolean, true) = false
        and audit.event_payload_json->>'wht_excluded_from_cash_posting' = 'true'
        and audit.event_payload_json->>'cash_receiving_bank_account_id'
          = payment.receiving_bank_account_id::text
        and audit.event_payload_json->>'cash_currency' = payment.currency
        and (
          (
            audit.event_payload_json->>'cash_posting_outcome' = 'posted'
            and nullif(audit.event_payload_json->>'cash_transaction_id', '') is not null
            and (audit.event_payload_json->>'cash_amount_posted')::numeric
              = expected.cash_amount
          )
          or (
            audit.event_payload_json->>'cash_posting_outcome' in (
              'pre_cutover_no_opening',
              'pre_cutover_date'
            )
            and nullif(audit.event_payload_json->>'cash_transaction_id', '') is null
            and audit.event_payload_json->>'cash_amount_posted' is null
          )
        )
    ) as valid_confirmed_event_count,
    (select count(*) from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'allocation_reallocated') as reallocation_event_count,
    (select count(*) from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'reversed') as reversed_event_count,
    (select max(audit.event_payload_json->>'cash_posting_outcome')
      from public.finance_payment_audit_events as audit
      where audit.payment_id = expected.payment_id
        and audit.event_type = 'confirmed') as cash_posting_outcome,
    (select count(*) from public.finance_cash_transactions as cash_transaction
      where cash_transaction.source_payment_id = expected.payment_id) as linked_cash_count,
    (select count(*) from public.finance_cash_transactions as cash_transaction
      where cash_transaction.source_payment_id = expected.payment_id
        and cash_transaction.reversal_of_transaction_id is null
        and cash_transaction.status = 'confirmed'
        and cash_transaction.direction = 'inflow'
        and cash_transaction.transaction_type = 'customer_payment'
        and cash_transaction.bank_account_id = payment.receiving_bank_account_id
        and cash_transaction.currency = payment.currency
        and cash_transaction.cash_amount = expected.cash_amount
        and (cash_transaction.occurred_at at time zone 'Asia/Bangkok')::date = expected.received_on
        and cash_transaction.confirmed_at = payment.confirmed_at
    ) as valid_original_cash_count,
    (select count(*)
      from public.finance_cash_transaction_audit_events as cash_audit
      join public.finance_cash_transactions as cash_transaction
        on cash_transaction.id = cash_audit.cash_transaction_id
      where cash_transaction.source_payment_id = expected.payment_id
        and cash_transaction.reversal_of_transaction_id is null
        and cash_audit.event_type = 'confirmed'
        and cash_audit.event_payload_json->>'automatic_source' = 'payment'
        and cash_audit.event_payload_json->>'source_payment_id' = expected.payment_id::text
        and (cash_audit.event_payload_json->>'cash_amount')::numeric = expected.cash_amount
        and (cash_audit.event_payload_json->>'wht_amount_excluded')::numeric = expected.wht_amount
    ) as valid_cash_audit_count,
    (select count(*) from public.finance_company_ledger as ledger
      where position(expected.payment_id::text in to_jsonb(ledger)::text) > 0
    ) as linked_legacy_ledger_count,
    (select count(*) from public.finance_compensation_batches as compensation
      where position(expected.payment_id::text in to_jsonb(compensation)::text) > 0
    ) as linked_compensation_count,
    payment.id is not null
      and upper(substr(payment.id::text, 1, 8)) = expected.ui_reference
      and payment.status = 'confirmed'
      and payment.received_on = expected.received_on
      and payment.payment_method = 'bank_transfer'
      and payment.currency = 'THB'
      and upper(btrim(bank.short_name)) = 'KBANK'
      and payment.cash_amount = expected.cash_amount
      and payment.wht_amount = expected.wht_amount
      and payment.settlement_amount = expected.settlement_amount
      and payment.confirmed_at is not null
      and payment.confirmed_by_user_id is not null
      and payment.cancelled_at is null
      and payment.reversed_at is null
      as payment_row_valid
  from expected_payments as expected
  left join public.finance_payments as payment on payment.id = expected.payment_id
  left join public.finance_bank_accounts as bank
    on bank.id = payment.receiving_bank_account_id
),
payment_contracts as (
  select
    payment_checks.*,
    case
      when payment_checks.cash_posting_outcome = 'posted' then
        payment_checks.linked_cash_count = 1
        and payment_checks.valid_original_cash_count = 1
        and payment_checks.valid_cash_audit_count = 1
      when payment_checks.cash_posting_outcome in (
        'pre_cutover_no_opening',
        'pre_cutover_date'
      ) then
        payment_checks.linked_cash_count = 0
        and payment_checks.valid_original_cash_count = 0
        and payment_checks.valid_cash_audit_count = 0
      else false
    end as cash_posting_state_contract_valid,
    payment_checks.payment_row_valid
      and payment_checks.raw_allocation_count = 1
      and payment_checks.valid_raw_allocation_count = 1
      and payment_checks.effective_allocation_count = 1
      and payment_checks.valid_effective_allocation_count = 1
      and payment_checks.reallocation_count = 0
      and payment_checks.confirmed_event_count = 1
      and payment_checks.draft_created_event_count = 1
      and payment_checks.valid_confirmed_event_count = 1
      and payment_checks.reallocation_event_count = 0
      and payment_checks.reversed_event_count = 0
      and payment_checks.linked_legacy_ledger_count = 0
      and payment_checks.linked_compensation_count = 0
      as lifecycle_and_allocation_valid
  from payment_checks
),
payment_aggregate as (
  select
    count(*) as expected_payment_rows,
    count(*) filter (where payment_row_valid) as valid_payment_rows,
    count(*) filter (where lifecycle_and_allocation_valid) as valid_lifecycle_rows,
    count(*) filter (where cash_posting_state_contract_valid) as valid_cash_contract_rows,
    count(*) filter (
      where lifecycle_and_allocation_valid
        and effective_allocation_count = 1
        and reallocation_count = 0
    ) as reallocation_prerequisite_rows,
    count(*) filter (
      where payment_row_valid
        and cash_posting_state_contract_valid
        and reversed_event_count = 0
        and linked_legacy_ledger_count = 0
        and linked_compensation_count = 0
    ) as erroneous_correction_prerequisite_rows,
    count(*) filter (where cash_posting_outcome = 'pre_cutover_no_opening')
      as no_opening_outcome_count,
    coalesce(sum(cash_amount), 0)::numeric(14, 2) as payment_cash_total,
    coalesce(sum(wht_amount), 0)::numeric(14, 2) as payment_wht_total,
    coalesce(sum(settlement_amount), 0)::numeric(14, 2) as payment_settlement_total,
    coalesce(sum(linked_cash_count), 0) as linked_cash_total,
    coalesce(jsonb_agg(jsonb_build_object(
      'payment_id', payment_id,
      'ui_reference', ui_reference,
      'status', status,
      'cash', cash_amount,
      'wht', wht_amount,
      'settlement', settlement_amount,
      'cash_posting_outcome', cash_posting_outcome,
      'cash_contract_valid', cash_posting_state_contract_valid,
      'allocation_contract_valid', lifecycle_and_allocation_valid,
      'reallocation_prerequisites_valid', (
        lifecycle_and_allocation_valid
        and effective_allocation_count = 1
        and reallocation_count = 0
      ),
      'erroneous_correction_prerequisites_valid', (
        payment_row_valid
        and cash_posting_state_contract_valid
        and reversed_event_count = 0
        and linked_legacy_ledger_count = 0
        and linked_compensation_count = 0
      )
    ) order by cash_amount desc), '[]'::jsonb) as payment_details
  from payment_contracts
),
invoice_payment_population as (
  select
    count(*) as effective_confirmed_payment_count,
    count(*) filter (
      where effective.payment_id not in (select payment_id from expected_payments)
    ) as unexpected_effective_confirmed_payment_count,
    coalesce(sum(effective.effective_cash_allocated), 0)::numeric(14, 2) as effective_cash,
    coalesce(sum(effective.effective_wht_credit_allocated), 0)::numeric(14, 2) as effective_wht,
    coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2) as effective_settlement
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_payments as payment on payment.id = effective.payment_id
  cross join constants
  where effective.invoice_id = constants.invoice_id
    and payment.status = 'confirmed'
),
payment_draft_facts as (
  select
    count(*) filter (where payment.status = 'draft') as active_draft_count,
    count(*) filter (
      where payment.status = 'draft'
        and (
          payment.draft_origin_invoice_id = constants.invoice_id
          or exists (
            select 1
            from public.finance_payment_invoice_allocations as allocation
            where allocation.payment_id = payment.id
              and allocation.invoice_id = constants.invoice_id
          )
        )
    ) as target_active_draft_count
  from public.finance_payments as payment
  cross join constants
  where payment.draft_origin_invoice_id = constants.invoice_id
     or exists (
       select 1
       from public.finance_payment_invoice_allocations as allocation
       where allocation.payment_id = payment.id
         and allocation.invoice_id = constants.invoice_id
     )
),
opening_balance_facts as (
  select
    (select count(*) from public.finance_account_opening_balances)
      as global_opening_balance_count,
    count(*) as confirmed_kbank_thb_opening_count,
    max(opening_balance.as_of) as latest_confirmed_kbank_thb_cutoff
  from public.finance_account_opening_balances as opening_balance
  join public.finance_bank_accounts as bank on bank.id = opening_balance.bank_account_id
  where opening_balance.status = 'confirmed'
    and opening_balance.currency = 'THB'
    and upper(btrim(bank.short_name)) = 'KBANK'
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
        and charge.status = 'invoiced'
        and allocation.status = 'invoiced'
    ) as valid_installment_source_count,
    count(*) filter (
      where charge.id = constants.travel_charge_id
        and charge.economic_classification = 'additional_service'
        and charge.amount_before_vat = 2000.00
        and charge.vat_amount = 0.00
        and charge.total_amount = 2000.00
        and charge.status = 'invoiced'
        and allocation.status = 'invoiced'
    ) as valid_travel_source_count,
    count(*) filter (
      where item.invoice_id <> constants.invoice_id
        or item.source_billable_charge_id <> charge.id
        or allocation.invoice_item_id <> item.id
        or allocation.invoice_id <> constants.invoice_id
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
  join public.finance_invoice_items as item on item.id = allocation.invoice_item_id
  join public.finance_billable_charges as charge on charge.id = allocation.billable_charge_id
  left join public.finance_billing_installment_items as installment_item
    on installment_item.id = charge.source_billing_installment_item_id
  where allocation.invoice_id = constants.invoice_id
),
bridge_and_plan_facts as (
  select
    count(distinct bridge.id) as bridge_count,
    max(installment.status) as source_installment_status,
    max(plan.status) as billing_plan_status,
    max(plan.amount_before_tax) as billing_plan_before_vat,
    max(plan.vat_amount) as billing_plan_vat,
    max(plan.total_amount) as billing_plan_total,
    count(other_installment.id) filter (
      where other_installment.installment_no in (2, 3)
    ) as remaining_installment_count,
    count(other_installment.id) filter (
      where other_installment.installment_no in (2, 3)
        and (
          other_installment.status = 'invoiced'
          or other_installment.invoiced_at is not null
        )
    ) as unexpectedly_invoiced_remaining_count,
    coalesce(bool_and(
      bridge.id = invoice_facts.bridge_id
      and bridge.billing_plan_id = constants.billing_plan_id
      and bridge.billing_installment_id = constants.billing_installment_id
      and installment.status = 'invoiced'
      and installment.invoiced_at is not null
      and installment.amount_before_tax = 9345.79
      and installment.vat_amount = 654.21
      and installment.total_amount = 10000.00
      and plan.id = constants.billing_plan_id
      and plan.status = 'active'
    ), false) as bridge_plan_contract_valid
  from invoice_facts
  cross join constants
  left join public.finance_billing_installment_charge_bridges as bridge
    on bridge.id = invoice_facts.bridge_id
  left join public.finance_billing_installments as installment
    on installment.id = bridge.billing_installment_id
  left join public.finance_billing_plans as plan on plan.id = invoice_facts.billing_plan_id
  left join public.finance_billing_installments as other_installment
    on other_installment.billing_plan_id = constants.billing_plan_id
),
downstream_facts as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_receipt_payment_allocations') is null
      as receipt_objects_absent,
    to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as tax_invoice_objects_absent,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_observed,
    (select count(*) from public.finance_compensation_batches) as compensation_rows_observed
),
eligibility_facts as (
  select
    invoice_facts.document_status = 'issued'
      and settlement_facts.outstanding_amount > 0
      as normal_new_payment_eligible,
    payment_draft_facts.target_active_draft_count = 0
      and settlement_facts.outstanding_amount = 0
      and settlement_facts.payment_status = 'settled'
      and function_contract_checks.settled_invoice_draft_guard_present
      as zero_outstanding_guard_valid,
    coalesce(bool_and(
      payment_contracts.payment_row_valid
      and payment_contracts.effective_allocation_count = 1
      and payment_contracts.reallocation_count = 0
      and payment_contracts.reallocation_event_count = 0
      and payment_contracts.reversed_event_count = 0
      and payment_contracts.linked_legacy_ledger_count = 0
      and payment_contracts.linked_compensation_count = 0
    ), false) as reallocation_prerequisites_valid_for_both,
    coalesce(bool_and(
      payment_contracts.payment_row_valid
      and payment_contracts.cash_posting_state_contract_valid
      and payment_contracts.reversed_event_count = 0
      and payment_contracts.linked_legacy_ledger_count = 0
      and payment_contracts.linked_compensation_count = 0
    ), false) as erroneous_correction_prerequisites_valid_for_both
  from invoice_facts
  cross join settlement_facts
  cross join payment_draft_facts
  cross join function_contract_checks
  cross join payment_contracts
  group by
    invoice_facts.document_status,
    settlement_facts.outstanding_amount,
    settlement_facts.payment_status,
    payment_draft_facts.target_active_draft_count,
    function_contract_checks.settled_invoice_draft_guard_present
),
final_facts as (
  select
    invoice_facts.invoice_count = 1
      and invoice_facts.invoice_no = constants.invoice_no
      and invoice_facts.document_status = 'issued'
      and invoice_facts.source_model = 'billable_charge_v2'
      and invoice_facts.currency = 'THB'
      and invoice_facts.amount_before_vat = 11345.79
      and invoice_facts.vat_amount = 654.21
      and invoice_facts.total_amount = 12000.00
      and invoice_facts.issued_contract_valid
      and settlement_facts.summary_count = 1
      and settlement_facts.invoice_status = 'issued'
      and settlement_facts.invoice_gross_amount = 12000.00
      and settlement_facts.confirmed_cash = 12000.00
      and settlement_facts.confirmed_wht = 0.00
      and settlement_facts.settled_amount = 12000.00
      and settlement_facts.outstanding_amount = 0.00
      and settlement_facts.payment_status = 'settled'
      and payment_aggregate.expected_payment_rows = 2
      and payment_aggregate.valid_payment_rows = 2
      and payment_aggregate.valid_lifecycle_rows = 2
      and payment_aggregate.valid_cash_contract_rows = 2
      and payment_aggregate.reallocation_prerequisite_rows = 2
      and payment_aggregate.erroneous_correction_prerequisite_rows = 2
      and payment_aggregate.payment_cash_total = 12000.00
      and payment_aggregate.payment_wht_total = 0.00
      and payment_aggregate.payment_settlement_total = 12000.00
      and invoice_payment_population.effective_confirmed_payment_count = 2
      and invoice_payment_population.unexpected_effective_confirmed_payment_count = 0
      and invoice_payment_population.effective_cash = 12000.00
      and invoice_payment_population.effective_wht = 0.00
      and invoice_payment_population.effective_settlement = 12000.00
      and invoice_payment_population.effective_settlement <= invoice_facts.total_amount
      and opening_balance_facts.global_opening_balance_count = 0
      and opening_balance_facts.confirmed_kbank_thb_opening_count = 0
      and payment_aggregate.no_opening_outcome_count = 2
      and payment_aggregate.linked_cash_total = 0
      and composition_facts.source_charge_count = 2
      and composition_facts.valid_installment_source_count = 1
      and composition_facts.valid_travel_source_count = 1
      and composition_facts.source_contract_mismatch_count = 0
      and composition_facts.item_before_vat = 11345.79
      and composition_facts.item_vat = 654.21
      and composition_facts.item_total = 12000.00
      and bridge_and_plan_facts.bridge_count = 1
      and bridge_and_plan_facts.source_installment_status = 'invoiced'
      and bridge_and_plan_facts.billing_plan_status = 'active'
      and bridge_and_plan_facts.billing_plan_before_vat = 18691.59
      and bridge_and_plan_facts.billing_plan_vat = 1308.41
      and bridge_and_plan_facts.billing_plan_total = 20000.00
      and bridge_and_plan_facts.remaining_installment_count = 2
      and bridge_and_plan_facts.unexpectedly_invoiced_remaining_count = 0
      and bridge_and_plan_facts.bridge_plan_contract_valid
      and function_contract_checks.payment_cash_integration_present
      and function_contract_checks.conditional_cash_contract_present
      and eligibility_facts.normal_new_payment_eligible = false
      and eligibility_facts.zero_outstanding_guard_valid
      and eligibility_facts.reallocation_prerequisites_valid_for_both
      and eligibility_facts.erroneous_correction_prerequisites_valid_for_both
      and downstream_facts.receipt_objects_absent
      and downstream_facts.tax_invoice_objects_absent
      as verification_pass
  from constants
  cross join invoice_facts
  cross join settlement_facts
  cross join payment_aggregate
  cross join invoice_payment_population
  cross join payment_draft_facts
  cross join opening_balance_facts
  cross join composition_facts
  cross join bridge_and_plan_facts
  cross join function_contract_checks
  cross join eligibility_facts
  cross join downstream_facts
)
select
  constants.invoice_id,
  invoice_facts.invoice_count,
  invoice_facts.invoice_no,
  invoice_facts.document_status,
  invoice_facts.source_model,
  invoice_facts.amount_before_vat,
  invoice_facts.vat_amount,
  invoice_facts.total_amount,
  settlement_facts.confirmed_cash,
  settlement_facts.confirmed_wht,
  settlement_facts.settled_amount,
  settlement_facts.outstanding_amount,
  settlement_facts.payment_status,
  invoice_payment_population.effective_confirmed_payment_count,
  invoice_payment_population.unexpected_effective_confirmed_payment_count,
  payment_aggregate.payment_cash_total,
  payment_aggregate.payment_wht_total,
  payment_aggregate.payment_settlement_total,
  payment_aggregate.payment_details,
  opening_balance_facts.global_opening_balance_count,
  opening_balance_facts.confirmed_kbank_thb_opening_count,
  opening_balance_facts.latest_confirmed_kbank_thb_cutoff,
  payment_aggregate.no_opening_outcome_count,
  payment_aggregate.linked_cash_total,
  payment_draft_facts.target_active_draft_count,
  eligibility_facts.normal_new_payment_eligible,
  eligibility_facts.zero_outstanding_guard_valid,
  eligibility_facts.reallocation_prerequisites_valid_for_both,
  eligibility_facts.erroneous_correction_prerequisites_valid_for_both,
  composition_facts.source_charge_count,
  composition_facts.valid_installment_source_count,
  composition_facts.valid_travel_source_count,
  bridge_and_plan_facts.bridge_count,
  bridge_and_plan_facts.source_installment_status,
  bridge_and_plan_facts.billing_plan_before_vat,
  bridge_and_plan_facts.billing_plan_vat,
  bridge_and_plan_facts.billing_plan_total,
  bridge_and_plan_facts.remaining_installment_count,
  bridge_and_plan_facts.unexpectedly_invoiced_remaining_count,
  downstream_facts.legacy_ledger_rows_observed,
  downstream_facts.compensation_rows_observed,
  downstream_facts.receipt_objects_absent,
  downstream_facts.tax_invoice_objects_absent,
  coalesce(final_facts.verification_pass, false)
    as fully_settled_invoice_payment_uat_verification_pass
from constants
cross join invoice_facts
cross join settlement_facts
cross join payment_aggregate
cross join invoice_payment_population
cross join payment_draft_facts
cross join opening_balance_facts
cross join composition_facts
cross join bridge_and_plan_facts
cross join eligibility_facts
cross join downstream_facts
cross join final_facts;
