-- Phase 5D-E2 Production reallocation UAT verification.
-- SELECT-only: one statement, one result row, and no RPC calls.

with target_payment as (
  select
    count(*) as payment_count,
    max(payment.id::text) as payment_id,
    max(payment.internal_reference) as payment_reference,
    max(payment.status) as payment_status,
    max(payment.cash_amount) as payment_cash,
    max(payment.wht_amount) as payment_wht,
    max(payment.settlement_amount) as payment_settlement,
    max(bank_account.short_name) as receiving_bank_short_name,
    max(bank_account.bank_name) as receiving_bank_name
  from public.finance_payments as payment
  left join public.finance_bank_accounts as bank_account
    on bank_account.id = payment.receiving_bank_account_id
  where payment.id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
), invoice_identity as (
  select
    count(*) filter (where invoice.invoice_no = 'VP-IV-202608-000002') as source_invoice_count,
    max(invoice.id::text) filter (where invoice.invoice_no = 'VP-IV-202608-000002') as source_invoice_id,
    count(*) filter (where invoice.invoice_no = 'VP-IV-202608-000003') as target_invoice_count,
    max(invoice.id::text) filter (where invoice.invoice_no = 'VP-IV-202608-000003') as target_invoice_id
  from public.finance_invoices as invoice
  where invoice.invoice_no in ('VP-IV-202608-000002', 'VP-IV-202608-000003')
), reallocation as (
  select
    count(*) as payment_reallocation_event_count,
    count(*) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as relevant_reallocation_event_count,
    max(event.id::text) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_id,
    max(source_invoice.invoice_no) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_source_invoice_no,
    max(target_invoice.invoice_no) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_target_invoice_no,
    max(event.cash_moved) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_cash_moved,
    max(event.wht_moved) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_wht_moved,
    max(event.settlement_moved) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_settlement_moved,
    max(event.reason) filter (
      where source_invoice.invoice_no = 'VP-IV-202608-000002'
        and target_invoice.invoice_no = 'VP-IV-202608-000003'
    ) as reallocation_reason
  from public.finance_payment_allocation_reallocations as event
  join public.finance_invoices as source_invoice
    on source_invoice.id = event.source_invoice_id
  join public.finance_invoices as target_invoice
    on target_invoice.id = event.target_invoice_id
  where event.payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
), effective_allocations as (
  select
    count(*) as current_effective_allocation_count,
    count(*) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as source_effective_row_count,
    coalesce(sum(effective.effective_cash_allocated) filter (
      where invoice.invoice_no = 'VP-IV-202608-000002'
    ), 0)::numeric(14, 2) as source_effective_cash,
    coalesce(sum(effective.effective_wht_credit_allocated) filter (
      where invoice.invoice_no = 'VP-IV-202608-000002'
    ), 0)::numeric(14, 2) as source_effective_wht,
    coalesce(sum(effective.effective_settlement_total) filter (
      where invoice.invoice_no = 'VP-IV-202608-000002'
    ), 0)::numeric(14, 2) as source_effective_settlement,
    count(*) filter (where invoice.invoice_no = 'VP-IV-202608-000003')
      as target_effective_row_count,
    coalesce(sum(effective.effective_cash_allocated) filter (
      where invoice.invoice_no = 'VP-IV-202608-000003'
    ), 0)::numeric(14, 2) as target_effective_cash,
    coalesce(sum(effective.effective_wht_credit_allocated) filter (
      where invoice.invoice_no = 'VP-IV-202608-000003'
    ), 0)::numeric(14, 2) as target_effective_wht,
    coalesce(sum(effective.effective_settlement_total) filter (
      where invoice.invoice_no = 'VP-IV-202608-000003'
    ), 0)::numeric(14, 2) as target_effective_settlement,
    coalesce(sum(effective.effective_cash_allocated), 0)::numeric(14, 2)
      as all_effective_cash,
    coalesce(sum(effective.effective_wht_credit_allocated), 0)::numeric(14, 2)
      as all_effective_wht,
    coalesce(sum(effective.effective_settlement_total), 0)::numeric(14, 2)
      as all_effective_settlement
  from public.finance_payment_effective_invoice_allocations as effective
  join public.finance_invoices as invoice on invoice.id = effective.invoice_id
  where effective.payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
), invoice_summaries as (
  select
    count(*) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_summary_count,
    max(summary.invoice_status) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_invoice_status,
    max(summary.invoice_gross_amount) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_invoice_gross,
    max(summary.confirmed_cash_allocated) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_confirmed_cash,
    max(summary.confirmed_wht_credit_allocated) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_confirmed_wht,
    max(summary.economically_settled_amount) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_economically_settled,
    max(summary.outstanding_amount) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_outstanding,
    max(summary.payment_status) filter (where summary.invoice_no = 'VP-IV-202608-000002')
      as source_payment_status,
    count(*) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_summary_count,
    max(summary.invoice_status) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_invoice_status,
    max(summary.invoice_gross_amount) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_invoice_gross,
    max(summary.confirmed_cash_allocated) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_confirmed_cash,
    max(summary.confirmed_wht_credit_allocated) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_confirmed_wht,
    max(summary.economically_settled_amount) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_economically_settled,
    max(summary.outstanding_amount) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_outstanding,
    max(summary.payment_status) filter (where summary.invoice_no = 'VP-IV-202608-000003')
      as target_payment_status
  from public.finance_invoice_settlement_summary as summary
  where summary.invoice_no in ('VP-IV-202608-000002', 'VP-IV-202608-000003')
), original_allocation as (
  select
    count(*) as payment_raw_allocation_count,
    count(*) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as preserved_source_raw_allocation_count,
    max(allocation.id::text) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as preserved_source_raw_allocation_id,
    max(allocation.cash_allocated) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as preserved_source_raw_cash,
    max(allocation.wht_credit_allocated) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as preserved_source_raw_wht,
    max(allocation.settlement_total) filter (where invoice.invoice_no = 'VP-IV-202608-000002')
      as preserved_source_raw_settlement
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
  where allocation.payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
), reallocation_audit as (
  select
    count(*) as reallocation_audit_count,
    coalesce(bool_and(
      audit.event_payload_json ->> 'source_invoice_id' = invoice_identity.source_invoice_id
      and audit.event_payload_json ->> 'target_invoice_id' = invoice_identity.target_invoice_id
      and (audit.event_payload_json ->> 'cash_moved')::numeric = 4850.00::numeric
      and (audit.event_payload_json ->> 'wht_moved')::numeric = 150.00::numeric
      and (audit.event_payload_json ->> 'settlement_moved')::numeric = 5000.00::numeric
      and audit.event_payload_json ->> 'reason' = 'พนักงานบันทึกผิดพลาด'
      and audit.event_payload_json @> jsonb_build_object(
        'cash_transaction_changed', false,
        'payment_total_changed', false,
        'customer_refund_recorded', false
      )
    ), false) as reallocation_audit_preserves_financial_invariants
  from public.finance_payment_audit_events as audit
  cross join invoice_identity
  where audit.payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    and audit.event_type = 'allocation_reallocated'
), cash_safety as (
  select
    count(*) as cash_transaction_rows,
    count(*) filter (
      where cash_transaction.source_payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'::uuid
    ) as target_payment_cash_transaction_rows
  from public.finance_cash_transactions as cash_transaction
), production_baseline as (
  select
    (select count(*) from public.finance_account_opening_balances) as opening_balance_rows,
    (select count(*) from public.finance_company_ledger) as legacy_ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
), downstream_objects as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_receipt_payment_allocations') is null
      as receipt_objects_absent,
    to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as tax_invoice_objects_absent
)
select
  'PHASE_5D_E2_REALLOCATION_UAT_VERIFICATION' as report_section,
  target_payment.*,
  invoice_identity.*,
  reallocation.*,
  effective_allocations.*,
  invoice_summaries.*,
  original_allocation.*,
  reallocation_audit.*,
  cash_safety.*,
  production_baseline.*,
  downstream_objects.*,
  coalesce((
    target_payment.payment_count = 1
    and target_payment.payment_id = '3ecf3321-d5be-4ee8-9849-5fcf3973a57d'
    and target_payment.payment_status = 'confirmed'
    and target_payment.payment_cash = 4850.00::numeric
    and target_payment.payment_wht = 150.00::numeric
    and target_payment.payment_settlement = 5000.00::numeric
    and upper(btrim(target_payment.receiving_bank_short_name)) = 'KBANK'
    and invoice_identity.source_invoice_count = 1
    and invoice_identity.target_invoice_count = 1
    and reallocation.payment_reallocation_event_count = 1
    and reallocation.relevant_reallocation_event_count = 1
    and reallocation.reallocation_source_invoice_no = 'VP-IV-202608-000002'
    and reallocation.reallocation_target_invoice_no = 'VP-IV-202608-000003'
    and reallocation.reallocation_cash_moved = 4850.00::numeric
    and reallocation.reallocation_wht_moved = 150.00::numeric
    and reallocation.reallocation_settlement_moved = 5000.00::numeric
    and reallocation.reallocation_reason = 'พนักงานบันทึกผิดพลาด'
    and effective_allocations.current_effective_allocation_count = 1
    and effective_allocations.source_effective_row_count = 0
    and effective_allocations.source_effective_cash = 0.00::numeric
    and effective_allocations.source_effective_wht = 0.00::numeric
    and effective_allocations.source_effective_settlement = 0.00::numeric
    and effective_allocations.target_effective_row_count = 1
    and effective_allocations.target_effective_cash = 4850.00::numeric
    and effective_allocations.target_effective_wht = 150.00::numeric
    and effective_allocations.target_effective_settlement = 5000.00::numeric
    and effective_allocations.all_effective_cash = 4850.00::numeric
    and effective_allocations.all_effective_wht = 150.00::numeric
    and effective_allocations.all_effective_settlement = 5000.00::numeric
    and invoice_summaries.source_summary_count = 1
    and invoice_summaries.source_invoice_status = 'issued'
    and invoice_summaries.source_invoice_gross = 15000.00::numeric
    and invoice_summaries.source_confirmed_cash = 9700.00::numeric
    and invoice_summaries.source_confirmed_wht = 300.00::numeric
    and invoice_summaries.source_economically_settled = 10000.00::numeric
    and invoice_summaries.source_outstanding = 5000.00::numeric
    and invoice_summaries.source_payment_status = 'partially_settled'
    and invoice_summaries.target_summary_count = 1
    and invoice_summaries.target_invoice_status = 'issued'
    and invoice_summaries.target_invoice_gross = 15000.00::numeric
    and invoice_summaries.target_confirmed_cash = 4850.00::numeric
    and invoice_summaries.target_confirmed_wht = 150.00::numeric
    and invoice_summaries.target_economically_settled = 5000.00::numeric
    and invoice_summaries.target_outstanding = 10000.00::numeric
    and invoice_summaries.target_payment_status = 'partially_settled'
    and original_allocation.payment_raw_allocation_count = 1
    and original_allocation.preserved_source_raw_allocation_count = 1
    and original_allocation.preserved_source_raw_cash = 4850.00::numeric
    and original_allocation.preserved_source_raw_wht = 150.00::numeric
    and original_allocation.preserved_source_raw_settlement = 5000.00::numeric
    and reallocation_audit.reallocation_audit_count = 1
    and reallocation_audit.reallocation_audit_preserves_financial_invariants
    and cash_safety.cash_transaction_rows = 0
    and cash_safety.target_payment_cash_transaction_rows = 0
    and production_baseline.opening_balance_rows = 0
    and production_baseline.legacy_ledger_rows = 267
    and production_baseline.compensation_rows = 33
    and downstream_objects.receipt_objects_absent
    and downstream_objects.tax_invoice_objects_absent
  ), false) as phase_5d_e2_reallocation_uat_verification_pass
from target_payment
cross join invoice_identity
cross join reallocation
cross join effective_allocations
cross join invoice_summaries
cross join original_allocation
cross join reallocation_audit
cross join cash_safety
cross join production_baseline
cross join downstream_objects;
