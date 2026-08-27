-- Phase 4B readiness post-apply verification. SELECT-only; returns one row and performs no RPC calls.
with column_checks as (
  select count(*) = 6 as readiness_columns_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_billing_installments'
    and column_name in (
      'readiness_event_date',
      'readiness_confirmed_at',
      'readiness_confirmed_by_user_id',
      'readiness_note',
      'readiness_reference',
      'readiness_evidence_json'
    )
), function_checks as (
  select
    function_record.prosecdef as readiness_rpc_security_definer,
    coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'] as readiness_rpc_fixed_public_search_path,
    has_function_privilege(
      'authenticated',
      'public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)',
      'EXECUTE'
    ) as authenticated_can_confirm_readiness,
    not has_function_privilege(
      'anon',
      'public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)',
      'EXECUTE'
    ) as anon_cannot_confirm_readiness,
    position('p_human_confirmed is distinct from true' in pg_get_functiondef(function_record.oid)) > 0
      and position('readiness_event_date' in pg_get_functiondef(function_record.oid)) > 0
      and position('for update' in lower(pg_get_functiondef(function_record.oid))) > 0
      as readiness_rpc_has_confirmation_evidence_and_locking
  from pg_proc as function_record
  where function_record.oid = 'public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)'::regprocedure
), status_rpc_check as (
  select position(
    'Use readiness confirmation to mark a Billing Installment ready'
    in pg_get_functiondef(function_record.oid)
  ) > 0 as generic_status_rpc_cannot_bypass_readiness
  from pg_proc as function_record
  where function_record.oid = 'public.set_finance_billing_installment_status(uuid,text)'::regprocedure
), audit_security as (
  select
    class.relrowsecurity as audit_rls_enabled,
    has_table_privilege('authenticated', class.oid, 'SELECT') as authenticated_can_select_audit,
    not has_table_privilege('authenticated', class.oid, 'INSERT')
      and not has_table_privilege('authenticated', class.oid, 'UPDATE')
      and not has_table_privilege('authenticated', class.oid, 'DELETE') as authenticated_cannot_write_audit
  from pg_class as class
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'finance_billing_installment_audit_events'
), constraint_checks as (
  select
    count(*) filter (where constraint_record.conname = 'finance_billing_installments_ready_evidence_check') = 1 as ready_evidence_constraint_present,
    count(*) filter (where constraint_record.conname = 'finance_billing_installment_audit_events_type_check') = 1 as audit_event_constraint_present
  from pg_constraint as constraint_record
  where constraint_record.conrelid in (
    'public.finance_billing_installments'::regclass,
      'public.finance_billing_installment_audit_events'::regclass
    )
), source_trigger_checks as (
  select count(*) = 2 as deferred_invoice_source_status_guards_present
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'finance_invoice_integrity_after_billing_plan_status',
      'finance_invoice_integrity_after_billing_installment_status'
    )
    and tgdeferrable
    and tginitdeferred
), data_checks as (
  select
    (select count(*) from public.finance_billing_installments where status = 'pending') as pending_installment_count,
    (select count(*) from public.finance_billing_installments where status = 'ready_to_invoice') as ready_installment_count,
    (select count(*) from public.finance_invoices) as invoice_count,
    (select count(*) from public.finance_billing_installment_audit_events) as readiness_audit_event_count,
    not exists (
      select 1
      from public.finance_billing_installments
      where status = 'ready_to_invoice'
        and (
          readiness_event_date is null
          or readiness_confirmed_at is null
          or readiness_confirmed_by_user_id is null
          or readiness_evidence_json is null
          or readiness_evidence_json = '{}'::jsonb
        )
    ) as all_current_ready_installments_have_evidence
)
select
  column_checks.*,
  to_regclass('public.finance_billing_installment_audit_events') is not null as readiness_audit_table_present,
  to_regprocedure('public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)') is not null as readiness_rpc_present,
  function_checks.*,
  status_rpc_check.*,
  audit_security.*,
  constraint_checks.*,
  source_trigger_checks.*,
  data_checks.*,
  (
    column_checks.readiness_columns_present
    and to_regclass('public.finance_billing_installment_audit_events') is not null
    and to_regprocedure('public.confirm_finance_billing_installment_ready(uuid,date,boolean,text,text)') is not null
    and function_checks.readiness_rpc_security_definer
    and function_checks.readiness_rpc_fixed_public_search_path
    and function_checks.authenticated_can_confirm_readiness
    and function_checks.anon_cannot_confirm_readiness
    and function_checks.readiness_rpc_has_confirmation_evidence_and_locking
    and status_rpc_check.generic_status_rpc_cannot_bypass_readiness
    and audit_security.audit_rls_enabled
    and audit_security.authenticated_can_select_audit
    and audit_security.authenticated_cannot_write_audit
    and constraint_checks.ready_evidence_constraint_present
    and constraint_checks.audit_event_constraint_present
    and source_trigger_checks.deferred_invoice_source_status_guards_present
    and data_checks.all_current_ready_installments_have_evidence
  ) as billing_installment_readiness_verification_pass
from column_checks
cross join function_checks
cross join status_rpc_check
cross join audit_security
cross join constraint_checks
cross join source_trigger_checks
cross join data_checks;
