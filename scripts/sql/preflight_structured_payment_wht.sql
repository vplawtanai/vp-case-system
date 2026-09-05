-- SELECT only. One row. Run before Migration 036; this does not confirm any Payment.
with checks as (
  select
    to_regprocedure('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)') is not null as draft_save_present,
    to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is not null as confirmation_present,
    to_regprocedure('public.finance_invoice_active_reserved_settlement(uuid,uuid)') is not null as reservation_guard_present,
    to_regprocedure('public.guard_finance_payment_child_mutation()') is not null as historical_child_guard_present,
    to_regprocedure('public.current_user_can_manage_finance_payments()') is not null as save_permission_present,
    to_regprocedure('public.current_user_can_view_finance_payments()') is not null as read_permission_present,
    to_regclass('public.finance_invoice_charge_allocations') is not null as invoice_v2_present,
    to_regclass('public.finance_payment_allocation_reallocations') is not null as reallocation_present,
    to_regclass('public.finance_payment_wht_components') is null as component_table_absent,
    not exists (select 1 from information_schema.columns where table_schema='public' and table_name='finance_payments' and column_name='wht_calculation_mode') as mode_column_absent,
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='finance_invoices' and column_name='issued_snapshot_json' and udt_name='jsonb') as frozen_invoice_evidence_present,
    not has_table_privilege('authenticated','public.finance_payments','INSERT,UPDATE,DELETE') as direct_payment_mutation_blocked
), observability as (
  select (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status='draft' and wht_amount>0) as unstructured_wht_drafts,
    (select count(*) from public.finance_payments where status='confirmed') as confirmed_payments,
    (select count(*) from public.finance_cash_transactions) as cash_transactions,
    (select count(*) from public.finance_account_opening_balances) as opening_balances
)
select checks.*, observability.*,
  not exists (select 1 from jsonb_each(to_jsonb(checks)) c where c.value is distinct from 'true'::jsonb)
    as structured_payment_wht_preflight_pass
from checks cross join observability;
