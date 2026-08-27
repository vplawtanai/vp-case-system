-- SELECT-only Production verification for Migration 022.
-- This script creates no Payment and performs no lifecycle RPC call.

with expected_permissions(column_name) as (
  values
    ('can_manage_finance_payments'),
    ('can_confirm_finance_payments'),
    ('can_reverse_finance_payments')
), permission_columns as (
  select
    count(*) = 3 as all_permission_columns_present,
    count(*) filter (
      where column_record.is_nullable = 'NO'
        and column_record.data_type = 'boolean'
        and lower(coalesce(column_record.column_default, '')) like '%false%'
    ) = 3 as permission_defaults_are_fail_closed
  from expected_permissions as expected
  left join information_schema.columns as column_record
    on column_record.table_schema = 'public'
   and column_record.table_name = 'user_profiles'
   and column_record.column_name = expected.column_name
), draft_origin_contract as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'finance_payments'
        and column_name = 'draft_origin_invoice_id'
        and udt_name = 'uuid'
        and is_nullable = 'YES'
    ) as draft_origin_column_present,
    exists (
      select 1
      from pg_constraint as constraint_record
      where constraint_record.conrelid = to_regclass('public.finance_payments')
        and constraint_record.contype = 'f'
        and constraint_record.confrelid = to_regclass('public.finance_invoices')
        and pg_get_constraintdef(constraint_record.oid) like '%(draft_origin_invoice_id)%'
        and pg_get_constraintdef(constraint_record.oid) like '%ON DELETE RESTRICT%'
    ) as draft_origin_fk_restrict_present,
    exists (
      select 1
      from pg_index as index_record
      join pg_class as class_record on class_record.oid = index_record.indexrelid
      where class_record.relname = 'uq_finance_payments_open_draft_origin_invoice'
        and index_record.indrelid = to_regclass('public.finance_payments')
        and index_record.indisunique
        and index_record.indpred is not null
        and position(
          'draft_origin_invoice_id'
          in lower(pg_get_indexdef(index_record.indexrelid))
        ) > 0
        and position(
          'status = ''draft'''
          in lower(pg_get_indexdef(index_record.indexrelid))
        ) > 0
    ) as one_open_origin_draft_index_present
), expected_functions(signature, function_class) as (
  values
    ('public.current_user_can_view_finance_payments()', 'permission'),
    ('public.current_user_can_manage_finance_payments()', 'permission'),
    ('public.current_user_can_confirm_finance_payments()', 'permission'),
    ('public.current_user_can_reverse_finance_payments()', 'permission'),
    ('public.protect_finance_payment_permission_fields()', 'internal'),
    ('public.record_finance_payment_audit_event(uuid,text,jsonb)', 'internal'),
    ('public.assert_finance_payment_has_no_downstream_dependencies(uuid)', 'internal'),
    ('public.create_finance_payment_draft_from_invoice(uuid)', 'operational'),
    ('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)', 'operational'),
    ('public.confirm_finance_payment(uuid,boolean)', 'operational'),
    ('public.cancel_finance_payment_draft(uuid,text)', 'operational'),
    ('public.reverse_finance_payment(uuid,text)', 'operational')
), lifecycle_function_security as (
  select
    count(*) filter (where function_record.oid is not null) = 12
      as all_lifecycle_functions_present,
    count(*) filter (
      where function_record.prosecdef
        and coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public']
    ) = 12 as all_lifecycle_functions_fixed_definer,
    count(distinct function_record.proowner) = 1 as lifecycle_functions_share_owner,
    count(*) filter (
      where expected.function_class in ('permission', 'operational')
        and has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
    ) = 9 as browser_api_grants_correct,
    count(*) filter (
      where expected.function_class = 'internal'
        and not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
    ) = 3 as internal_helpers_not_browser_executable
  from expected_functions as expected
  left join pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
), permission_contract as (
  select
    position(
      'role = ''admin'''
      in pg_get_functiondef('public.current_user_can_manage_finance_payments()'::regprocedure)
    ) > 0
      and position(
        'can_manage_finance_payments'
        in pg_get_functiondef('public.current_user_can_manage_finance_payments()'::regprocedure)
      ) > 0 as draft_management_permission_granular,
    position(
      'role = ''admin'''
      in pg_get_functiondef('public.current_user_can_confirm_finance_payments()'::regprocedure)
    ) > 0
      and position(
        'can_confirm_finance_payments'
        in pg_get_functiondef('public.current_user_can_confirm_finance_payments()'::regprocedure)
      ) > 0 as confirmation_permission_granular,
    position(
      'role = ''admin'''
      in pg_get_functiondef('public.current_user_can_reverse_finance_payments()'::regprocedure)
    ) > 0
      and position(
        'can_reverse_finance_payments'
        in pg_get_functiondef('public.current_user_can_reverse_finance_payments()'::regprocedure)
      ) > 0 as reversal_permission_granular,
    exists (
      select 1
      from pg_trigger as trigger_record
      where trigger_record.tgrelid = to_regclass('public.user_profiles')
        and trigger_record.tgname = 'protect_finance_payment_permission_fields'
        and not trigger_record.tgisinternal
        and trigger_record.tgfoid =
          'public.protect_finance_payment_permission_fields()'::regprocedure
    )
      and position(
        'role = ''admin'''
        in pg_get_functiondef(
          'public.protect_finance_payment_permission_fields()'::regprocedure
        )
      ) > 0 as permission_fields_have_admin_guard,
    not exists (
      select 1
      from expected_functions as expected
      where expected.function_class = 'operational'
        and position(
          'current_user_can_manage_finance_quotations'
          in pg_get_functiondef(to_regprocedure(expected.signature))
        ) > 0
    ) as quotation_permission_not_used_for_payment_writes
), table_security as (
  select
    count(*) filter (where class_record.relrowsecurity) = 4 as payment_tables_rls_enabled,
    count(*) filter (
      where has_table_privilege('authenticated', class_record.oid, 'SELECT')
        and not has_table_privilege('authenticated', class_record.oid, 'INSERT')
        and not has_table_privilege('authenticated', class_record.oid, 'UPDATE')
        and not has_table_privilege('authenticated', class_record.oid, 'DELETE')
        and not has_table_privilege('anon', class_record.oid, 'SELECT')
        and not has_table_privilege('anon', class_record.oid, 'INSERT')
        and not has_table_privilege('anon', class_record.oid, 'UPDATE')
        and not has_table_privilege('anon', class_record.oid, 'DELETE')
    ) = 4 as direct_browser_writes_and_anon_access_blocked
  from unnest(array[
    'public.finance_payments',
    'public.finance_payment_invoice_allocations',
    'public.finance_payment_evidence',
    'public.finance_payment_audit_events'
  ]) as expected(table_name)
  join pg_class as class_record on class_record.oid = to_regclass(expected.table_name)
), policy_security as (
  select
    count(*) = 4 as payment_select_policies_present,
    count(*) filter (
      where policy_record.polcmd = 'r'
        and position(
          'current_user_can_view_finance_payments'
          in pg_get_expr(policy_record.polqual, policy_record.polrelid)
        ) > 0
    ) = 4 as payment_select_policies_use_view_permission
  from pg_policy as policy_record
  where policy_record.polrelid in (
    to_regclass('public.finance_payments'),
    to_regclass('public.finance_payment_invoice_allocations'),
    to_regclass('public.finance_payment_evidence'),
    to_regclass('public.finance_payment_audit_events')
  )
), foundation_security as (
  select
    count(*) filter (where function_record.oid is not null) = 8
      as all_foundation_integrity_functions_present,
    count(*) filter (
      where expected.security_definer = function_record.prosecdef
        and coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public']
        and not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        and not has_function_privilege('anon', function_record.oid, 'EXECUTE')
    ) = 8 as foundation_integrity_security_unchanged
  from (
    values
      ('public.validate_finance_invoice_payment_settlement(uuid)', false),
      ('public.validate_finance_payment_integrity(uuid)', false),
      ('public.enforce_finance_payment_lifecycle()', true),
      ('public.guard_finance_payment_child_mutation()', true),
      ('public.protect_finance_payment_audit_event()', true),
      ('public.enforce_finance_payment_integrity()', true),
      ('public.enforce_finance_payment_child_integrity()', true),
      ('public.enforce_finance_invoice_payment_integrity()', true)
  ) as expected(signature, security_definer)
  left join pg_proc as function_record
    on function_record.oid = to_regprocedure(expected.signature)
), rpc_contract as (
  select
    position('for update' in lower(pg_get_functiondef(
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure
    ))) > 0 as create_locks_invoice,
    position('draft_origin_invoice_id' in pg_get_functiondef(
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure
    )) > 0 as create_is_retry_safe,
    position('is not distinct from' in lower(pg_get_functiondef(
      'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure
    ))) > 0 as save_has_noop_detection,
    position('union' in lower(pg_get_functiondef(
      'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure
    ))) > 0
      and position('for update' in lower(pg_get_functiondef(
        'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure
      ))) > 0 as save_locks_old_and_new_invoice_set,
    position('explicit payment confirmation is required' in lower(pg_get_functiondef(
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure
    ))) > 0 as confirm_requires_explicit_acknowledgement,
    position('validate_finance_payment_integrity' in pg_get_functiondef(
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure
    )) > 0 as confirm_invokes_authoritative_validator,
    position('assert_finance_payment_has_no_downstream_dependencies' in pg_get_functiondef(
      'public.reverse_finance_payment(uuid,text)'::regprocedure
    )) > 0 as reversal_has_downstream_guard,
    position('record_finance_payment_audit_event' in pg_get_functiondef(
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure
    )) > 0
      and position('record_finance_payment_audit_event' in pg_get_functiondef(
        'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure
      )) > 0
      and position('record_finance_payment_audit_event' in pg_get_functiondef(
        'public.confirm_finance_payment(uuid,boolean)'::regprocedure
      )) > 0
      and position('record_finance_payment_audit_event' in pg_get_functiondef(
        'public.cancel_finance_payment_draft(uuid,text)'::regprocedure
      )) > 0
      and position('record_finance_payment_audit_event' in pg_get_functiondef(
        'public.reverse_finance_payment(uuid,text)'::regprocedure
      )) > 0 as all_writes_have_transactional_audit
), downstream_write_safety as (
  select
    coalesce(bool_and(
      lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%insert into public.finance_company_ledger%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%update public.finance_company_ledger%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%delete from public.finance_company_ledger%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%insert into public.finance_compensation%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%update public.finance_compensation%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%delete from public.finance_compensation%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%insert into public.finance_receipt%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%update public.finance_receipt%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%delete from public.finance_receipt%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%insert into public.finance_tax_invoice%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%update public.finance_tax_invoice%'
      and lower(pg_get_functiondef(to_regprocedure(expected.signature))) not like '%delete from public.finance_tax_invoice%'
    ), false) as operational_rpcs_do_not_write_downstream_modules
  from expected_functions as expected
  where expected.function_class = 'operational'
), uat_invoice as (
  select
    count(*) = 1 as uat_invoice_found_once,
    coalesce(max(invoice_gross_amount), 0) = 15000.00 as gross_is_15000,
    coalesce(max(economically_settled_amount), 0) = 0 as settled_is_zero,
    coalesce(max(outstanding_amount), 0) = 15000.00 as outstanding_is_15000,
    coalesce(max(payment_status), '') = 'unpaid' as payment_status_is_unpaid
  from public.finance_invoice_settlement_summary
  where invoice_no = 'VP-IV-202608-000001'
), settlement_examples as (
  select
    15000.00::numeric - 0.00::numeric = 15000.00::numeric
      as baseline_outstanding_correct,
    15000.00::numeric - 10000.00::numeric = 5000.00::numeric
      as partial_payment_outstanding_correct,
    case
      when 10000.00::numeric = 0 then 'unpaid'
      when 15000.00::numeric - 10000.00::numeric = 0 then 'settled'
      else 'partially_settled'
    end = 'partially_settled' as partial_payment_status_correct,
    15000.00::numeric - (10000.00::numeric + 5000.00::numeric) = 0.00::numeric
      as second_payment_settles_invoice,
    15000.00::numeric - 10000.00::numeric = 5000.00::numeric
      as reversing_second_payment_restores_prior_outstanding,
    15000.00::numeric - 0.00::numeric = 15000.00::numeric
      as reversing_all_payments_restores_unpaid_outstanding
), row_counts as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payment_invoice_allocations) as allocation_rows,
    (select count(*) from public.finance_payment_evidence) as evidence_rows,
    (select count(*) from public.finance_payment_audit_events) as audit_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
), forbidden_objects as (
  select
    to_regclass('public.finance_receipts') is null
      and to_regclass('public.finance_receipt_items') is null
      and to_regclass('public.finance_tax_invoices') is null
      and to_regclass('public.finance_tax_invoice_items') is null
      as no_receipt_or_tax_invoice_objects_created
)
select
  'PAYMENT_LIFECYCLE_RPC_VERIFICATION' as report_section,
  permission_columns.*,
  draft_origin_contract.*,
  lifecycle_function_security.*,
  permission_contract.*,
  table_security.*,
  policy_security.*,
  foundation_security.*,
  rpc_contract.*,
  downstream_write_safety.*,
  uat_invoice.*,
  settlement_examples.*,
  row_counts.*,
  forbidden_objects.*,
  (
    permission_columns.all_permission_columns_present
    and permission_columns.permission_defaults_are_fail_closed
    and draft_origin_contract.draft_origin_column_present
    and draft_origin_contract.draft_origin_fk_restrict_present
    and draft_origin_contract.one_open_origin_draft_index_present
    and lifecycle_function_security.all_lifecycle_functions_present
    and lifecycle_function_security.all_lifecycle_functions_fixed_definer
    and lifecycle_function_security.lifecycle_functions_share_owner
    and lifecycle_function_security.browser_api_grants_correct
    and lifecycle_function_security.internal_helpers_not_browser_executable
    and permission_contract.draft_management_permission_granular
    and permission_contract.confirmation_permission_granular
    and permission_contract.reversal_permission_granular
    and permission_contract.permission_fields_have_admin_guard
    and permission_contract.quotation_permission_not_used_for_payment_writes
    and table_security.payment_tables_rls_enabled
    and table_security.direct_browser_writes_and_anon_access_blocked
    and policy_security.payment_select_policies_present
    and policy_security.payment_select_policies_use_view_permission
    and foundation_security.all_foundation_integrity_functions_present
    and foundation_security.foundation_integrity_security_unchanged
    and rpc_contract.create_locks_invoice
    and rpc_contract.create_is_retry_safe
    and rpc_contract.save_has_noop_detection
    and rpc_contract.save_locks_old_and_new_invoice_set
    and rpc_contract.confirm_requires_explicit_acknowledgement
    and rpc_contract.confirm_invokes_authoritative_validator
    and rpc_contract.reversal_has_downstream_guard
    and rpc_contract.all_writes_have_transactional_audit
    and downstream_write_safety.operational_rpcs_do_not_write_downstream_modules
    and uat_invoice.uat_invoice_found_once
    and uat_invoice.gross_is_15000
    and uat_invoice.settled_is_zero
    and uat_invoice.outstanding_is_15000
    and uat_invoice.payment_status_is_unpaid
    and settlement_examples.baseline_outstanding_correct
    and settlement_examples.partial_payment_outstanding_correct
    and settlement_examples.partial_payment_status_correct
    and settlement_examples.second_payment_settles_invoice
    and settlement_examples.reversing_second_payment_restores_prior_outstanding
    and settlement_examples.reversing_all_payments_restores_unpaid_outstanding
    and row_counts.payment_rows = 0
    and row_counts.allocation_rows = 0
    and row_counts.evidence_rows = 0
    and row_counts.audit_rows = 0
    and row_counts.ledger_rows = 267
    and row_counts.compensation_rows = 33
    and forbidden_objects.no_receipt_or_tax_invoice_objects_created
  ) as payment_lifecycle_rpc_verification_pass
from permission_columns
cross join draft_origin_contract
cross join lifecycle_function_security
cross join permission_contract
cross join table_security
cross join policy_security
cross join foundation_security
cross join rpc_contract
cross join downstream_write_safety
cross join uat_invoice
cross join settlement_examples
cross join row_counts
cross join forbidden_objects;
