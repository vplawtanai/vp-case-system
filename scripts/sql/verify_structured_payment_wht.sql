-- SELECT only. One row. Immediate post-apply foundation verification, before any WHT UAT save.
with contracts as (
  select
    pg_get_functiondef('public.guard_finance_payment_wht_confirmation()'::regprocedure) as confirmation_guard,
    pg_get_functiondef('public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)'::regprocedure) as saver,
    pg_get_functiondef('public.assert_finance_payment_structured_wht(uuid)'::regprocedure) as validator,
    pg_get_functiondef('public.confirm_finance_payment(uuid,boolean)'::regprocedure) as confirmation
), checks as (
  select
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='finance_payments'
      and column_name='wht_calculation_mode' and is_nullable='YES' and column_default is null) as nullable_legacy_mode,
    (select count(*)=11 from information_schema.columns where table_schema='public' and table_name='finance_payment_wht_components') as component_columns_present,
    (select relrowsecurity from pg_class where oid='public.finance_payment_wht_components'::regclass) as component_rls_enabled,
    exists (select 1 from pg_policies where schemaname='public' and tablename='finance_payment_wht_components'
      and cmd='SELECT' and qual like '%current_user_can_view_finance_payments%') as component_read_policy,
    not has_table_privilege('authenticated','public.finance_payment_wht_components','INSERT,UPDATE,DELETE') as component_browser_writes_blocked,
    not has_table_privilege('anon','public.finance_payment_wht_components','SELECT,INSERT,UPDATE,DELETE') as anonymous_component_access_blocked,
    has_table_privilege('authenticated','public.finance_payment_wht_components','SELECT') as authorized_component_read,
    has_function_privilege('authenticated','public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)','EXECUTE') as structured_save_available,
    not has_function_privilege('anon','public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)','EXECUTE') as anonymous_save_blocked,
    not has_function_privilege('authenticated','public.assert_finance_payment_structured_wht(uuid)','EXECUTE') as internal_validator_not_callable,
    (select count(*)=3 from pg_trigger where not tgisinternal and tgenabled='O' and tgname in (
      'finance_payment_structured_wht_before_write','finance_payment_wht_component_draft_guard','finance_payment_structured_wht_reallocation_guard')) as guards_enabled,
    confirmation_guard like '%old.status=''draft'' and new.status=''confirmed''%'
      and confirmation_guard like '%assert_finance_payment_structured_wht(old.id)%' as confirmation_requires_structured_evidence,
    saver like '%public.save_finance_payment_draft(%' and saver like '%current_user_can_manage_finance_payments()%'
      and saver like '%''previous_components'',v_old_components%' as save_delegates_existing_guards_and_audits,
    validator like '%finance_invoice_active_reserved_settlement(i.id,p.id) <> 0%'
      and validator like '%WHT_PARTIAL_SCOPE_UNSUPPORTED%' as partial_and_duplicate_base_guard,
    confirmation like '%post_confirmed_payment_to_finance_cash_transaction(v_payment.id)%'
      and confirmation like '%''wht_excluded_from_cash_posting'', true%' as cash_integration_preserved,
    (select count(*)=0 from public.finance_payment_wht_components) as no_components_backfilled,
    (select count(*)=0 from public.finance_payments where wht_calculation_mode is not null) as no_payment_modes_backfilled
  from contracts
), observability as (
  select (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status='draft' and wht_amount>0) as legacy_wht_drafts,
    (select count(*) from public.finance_payments where status='confirmed') as confirmed_payments,
    (select count(*) from public.finance_cash_transactions) as cash_transactions,
    (select count(*) from public.finance_account_opening_balances) as opening_balances
)
select checks.*, observability.*,
  not exists (select 1 from jsonb_each(to_jsonb(checks)) c where c.value is distinct from 'true'::jsonb)
    as structured_payment_wht_verification_pass
from checks cross join observability;
