-- SELECT-only Production verification for Migration 024.

with function_definitions as (
  select
    pg_get_functiondef(
      to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)')
    ) as dependency_guard_definition,
    pg_get_functiondef(
      to_regprocedure('public.void_finance_invoice(uuid,text,boolean)')
    ) as void_rpc_definition
), invoice_write_security as (
  select
    has_table_privilege('authenticated', invoice_table.oid, 'UPDATE')
      as invoice_table_update_privilege,
    exists (
      select 1
      from pg_attribute as invoice_column
      where invoice_column.attrelid = invoice_table.oid
        and invoice_column.attnum > 0
        and not invoice_column.attisdropped
        and has_column_privilege(
          'authenticated',
          invoice_table.oid,
          invoice_column.attnum,
          'UPDATE'
        )
    ) as invoice_column_update_privilege_present,
    exists (
      select 1
      from information_schema.table_privileges as invoice_grant
      where invoice_grant.table_schema = 'public'
        and invoice_grant.table_name = 'finance_invoices'
        and invoice_grant.privilege_type = 'UPDATE'
      union all
      select 1
      from information_schema.column_privileges as invoice_column_grant
      where invoice_column_grant.table_schema = 'public'
        and invoice_column_grant.table_name = 'finance_invoices'
        and invoice_column_grant.privilege_type = 'UPDATE'
    ) as invoice_update_acl_present,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'grantor', invoice_grant.grantor,
          'grantee', invoice_grant.grantee,
          'scope', invoice_grant.grant_scope,
          'column_name', invoice_grant.column_name,
          'is_grantable', invoice_grant.is_grantable
        ) order by invoice_grant.grant_scope, invoice_grant.grantee, invoice_grant.column_name
      )
      from (
        select
          table_grant.grantor,
          table_grant.grantee,
          'table'::text as grant_scope,
          null::text as column_name,
          table_grant.is_grantable
        from information_schema.table_privileges as table_grant
        where table_grant.table_schema = 'public'
          and table_grant.table_name = 'finance_invoices'
          and table_grant.privilege_type = 'UPDATE'
        union all
        select
          column_grant.grantor,
          column_grant.grantee,
          'column'::text as grant_scope,
          column_grant.column_name,
          column_grant.is_grantable
        from information_schema.column_privileges as column_grant
        where column_grant.table_schema = 'public'
          and column_grant.table_name = 'finance_invoices'
          and column_grant.privilege_type = 'UPDATE'
      ) as invoice_grant
    ), '[]'::jsonb) as invoice_update_acl_entries,
    invoice_table.relrowsecurity as invoice_rls_enabled,
    authenticated_role.rolbypassrls as authenticated_bypasses_rls,
    authenticated_role.oid = invoice_table.relowner
      as authenticated_is_invoice_table_owner,
    exists (
      select 1
      from pg_policies as invoice_policy
      cross join lateral unnest(invoice_policy.roles) as policy_role(role_name)
      where invoice_policy.schemaname = 'public'
        and invoice_policy.tablename = 'finance_invoices'
        and invoice_policy.cmd in ('UPDATE', 'ALL')
        and case
          when lower(policy_role.role_name::text) = 'public' then true
          else pg_has_role('authenticated', policy_role.role_name::text, 'MEMBER')
        end
    ) as authenticated_invoice_update_policy_present
  from pg_class as invoice_table
  join pg_namespace as invoice_schema on invoice_schema.oid = invoice_table.relnamespace
  join pg_roles as authenticated_role on authenticated_role.rolname = 'authenticated'
  where invoice_schema.nspname = 'public'
    and invoice_table.relname = 'finance_invoices'
), installment_write_security as (
  select
    has_table_privilege('authenticated', installment_table.oid, 'UPDATE')
      as installment_table_update_privilege,
    exists (
      select 1
      from pg_attribute as installment_column
      where installment_column.attrelid = installment_table.oid
        and installment_column.attnum > 0
        and not installment_column.attisdropped
        and has_column_privilege(
          'authenticated',
          installment_table.oid,
          installment_column.attnum,
          'UPDATE'
        )
    ) as installment_column_update_privilege_present,
    exists (
      select 1
      from information_schema.table_privileges as installment_grant
      where installment_grant.table_schema = 'public'
        and installment_grant.table_name = 'finance_billing_installments'
        and installment_grant.privilege_type = 'UPDATE'
      union all
      select 1
      from information_schema.column_privileges as installment_column_grant
      where installment_column_grant.table_schema = 'public'
        and installment_column_grant.table_name = 'finance_billing_installments'
        and installment_column_grant.privilege_type = 'UPDATE'
    ) as installment_update_acl_present,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'grantor', installment_grant.grantor,
          'grantee', installment_grant.grantee,
          'scope', installment_grant.grant_scope,
          'column_name', installment_grant.column_name,
          'is_grantable', installment_grant.is_grantable
        ) order by installment_grant.grant_scope, installment_grant.grantee, installment_grant.column_name
      )
      from (
        select
          table_grant.grantor,
          table_grant.grantee,
          'table'::text as grant_scope,
          null::text as column_name,
          table_grant.is_grantable
        from information_schema.table_privileges as table_grant
        where table_grant.table_schema = 'public'
          and table_grant.table_name = 'finance_billing_installments'
          and table_grant.privilege_type = 'UPDATE'
        union all
        select
          column_grant.grantor,
          column_grant.grantee,
          'column'::text as grant_scope,
          column_grant.column_name,
          column_grant.is_grantable
        from information_schema.column_privileges as column_grant
        where column_grant.table_schema = 'public'
          and column_grant.table_name = 'finance_billing_installments'
          and column_grant.privilege_type = 'UPDATE'
      ) as installment_grant
    ), '[]'::jsonb) as installment_update_acl_entries,
    installment_table.relrowsecurity as installment_rls_enabled,
    authenticated_role.rolbypassrls as installment_authenticated_bypasses_rls,
    authenticated_role.oid = installment_table.relowner
      as authenticated_is_installment_table_owner,
    exists (
      select 1
      from pg_policies as installment_policy
      cross join lateral unnest(installment_policy.roles) as policy_role(role_name)
      where installment_policy.schemaname = 'public'
        and installment_policy.tablename = 'finance_billing_installments'
        and installment_policy.cmd in ('UPDATE', 'ALL')
        and case
          when lower(policy_role.role_name::text) = 'public' then true
          else pg_has_role('authenticated', policy_role.role_name::text, 'MEMBER')
        end
    ) as authenticated_installment_update_policy_present
  from pg_class as installment_table
  join pg_namespace as installment_schema on installment_schema.oid = installment_table.relnamespace
  join pg_roles as authenticated_role on authenticated_role.rolname = 'authenticated'
  where installment_schema.nspname = 'public'
    and installment_table.relname = 'finance_billing_installments'
), function_contract as (
  select
    to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)') is not null
      as dependency_guard_present,
    to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null
      as void_rpc_present,
    coalesce((
      select prosecdef
        and coalesce(proconfig, array[]::text[]) @> array['search_path=public']
      from pg_proc
      where oid = to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)')
    ), false) as dependency_guard_fixed_security_definer,
    coalesce((
      select prosecdef
        and coalesce(proconfig, array[]::text[]) @> array['search_path=public']
      from pg_proc
      where oid = to_regprocedure('public.void_finance_invoice(uuid,text,boolean)')
    ), false) as void_rpc_fixed_security_definer,
    not has_function_privilege(
      'authenticated',
      'public.assert_finance_invoice_has_no_void_dependencies(uuid)',
      'EXECUTE'
    ) as dependency_guard_not_browser_executable,
    not has_function_privilege(
      'anon',
      'public.assert_finance_invoice_has_no_void_dependencies(uuid)',
      'EXECUTE'
    ) as dependency_guard_not_anon_executable,
    has_function_privilege(
      'authenticated',
      'public.void_finance_invoice(uuid,text,boolean)',
      'EXECUTE'
    ) as authenticated_can_call_void_rpc,
    not has_function_privilege(
      'anon',
      'public.void_finance_invoice(uuid,text,boolean)',
      'EXECUTE'
    ) as anon_cannot_call_void_rpc,
    invoice_write_security.invoice_table_update_privilege,
    invoice_write_security.invoice_column_update_privilege_present,
    invoice_write_security.invoice_update_acl_present,
    invoice_write_security.invoice_update_acl_entries,
    invoice_write_security.invoice_rls_enabled,
    invoice_write_security.authenticated_bypasses_rls,
    invoice_write_security.authenticated_is_invoice_table_owner,
    invoice_write_security.authenticated_invoice_update_policy_present,
    (
      invoice_write_security.invoice_rls_enabled
      and not invoice_write_security.authenticated_bypasses_rls
      and not invoice_write_security.authenticated_is_invoice_table_owner
      and not invoice_write_security.authenticated_invoice_update_policy_present
    ) as browser_cannot_update_invoices,
    installment_write_security.installment_table_update_privilege,
    installment_write_security.installment_column_update_privilege_present,
    installment_write_security.installment_update_acl_present,
    installment_write_security.installment_update_acl_entries,
    installment_write_security.installment_rls_enabled,
    installment_write_security.installment_authenticated_bypasses_rls,
    installment_write_security.authenticated_is_installment_table_owner,
    installment_write_security.authenticated_installment_update_policy_present,
    (
      installment_write_security.installment_rls_enabled
      and not installment_write_security.installment_authenticated_bypasses_rls
      and not installment_write_security.authenticated_is_installment_table_owner
      and not installment_write_security.authenticated_installment_update_policy_present
    ) as browser_cannot_update_installments
  from invoice_write_security
  cross join installment_write_security
), behavior_contract as (
  select
    position('current_user_can_manage_finance_quotations' in void_rpc_definition) > 0
      as admin_partner_authority_present,
    position('p_acknowledged is distinct from true' in lower(void_rpc_definition)) > 0
      as acknowledgement_required,
    position('invoice void reason is required' in lower(void_rpc_definition)) > 0
      as reason_required,
    position('only an issued invoice can be voided' in lower(void_rpc_definition)) > 0
      as issued_only_guard_present,
    position('payment.status = ''draft''' in void_rpc_definition) > 0
      and position('active Payment Draft' in void_rpc_definition) > 0
      as active_payment_draft_blocker_present,
    position('payment.status = ''confirmed''' in void_rpc_definition) > 0
      and position('Confirmed Payment' in void_rpc_definition) > 0
      as confirmed_payment_blocker_present,
    position('v_confirmed_settlement <> 0' in void_rpc_definition) > 0
      as settlement_zero_guard_present,
    position('finance_invoice_settlement_summary' in void_rpc_definition) > 0
      as authoritative_settlement_view_used,
    position('validate_finance_invoice_payment_settlement' in void_rpc_definition) > 0
      as authoritative_payment_validator_invoked,
    position('assert_finance_invoice_has_no_void_dependencies' in void_rpc_definition) > 0
      as downstream_guard_invoked,
    position('document_status = ''voided''' in void_rpc_definition) > 0
      and position('voided_at = v_voided_at' in void_rpc_definition) > 0
      and position('voided_by_user_id = auth.uid()' in void_rpc_definition) > 0
      and position('void_reason = v_reason' in void_rpc_definition) > 0
      as invoice_void_mutation_present,
    position('status = ''ready_to_invoice''' in void_rpc_definition) > 0
      and position('invoiced_at = null' in lower(void_rpc_definition)) > 0
      as installment_reopen_present,
    position('v_plan.status = ''completed''' in void_rpc_definition) > 0
      and position('status = ''active''' in void_rpc_definition) > 0
      as completed_plan_reopen_present,
    position('invoice_voided_reopened' in void_rpc_definition) > 0
      and position('''voided''' in void_rpc_definition) > 0
      as audit_writes_present,
    position('issued_snapshot_json is distinct from v_invoice.issued_snapshot_json' in lower(void_rpc_definition)) > 0
      and position('invoice_no is distinct from v_invoice.invoice_no' in lower(void_rpc_definition)) > 0
      and position('payment_destination_snapshot_json is distinct from v_invoice.payment_destination_snapshot_json' in lower(void_rpc_definition)) > 0
      as issued_evidence_preservation_guard_present,
    position('finance_receipts' in dependency_guard_definition) > 0
      and position('finance_tax_invoices' in dependency_guard_definition) > 0
      and position('finance_credit_notes' in dependency_guard_definition) > 0
      and position('finance_company_ledger' in dependency_guard_definition) > 0
      and position('finance_compensation_batches' in dependency_guard_definition) > 0
      as future_dependency_registry_present,
    position('to_regclass' in dependency_guard_definition) > 0
      and position('information_schema.columns' in dependency_guard_definition) > 0
      as dependency_guard_catalog_aware
  from function_definitions
), schema_contract as (
  select
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.finance_billing_installment_audit_events'::regclass
        and conname = 'finance_billing_installment_audit_events_type_check'
        and lower(pg_get_constraintdef(oid)) like '%invoice_voided_reopened%'
        and lower(pg_get_constraintdef(oid)) like '%readiness_confirmed%'
        and lower(pg_get_constraintdef(oid)) like '%readiness_reset%'
        and lower(pg_get_constraintdef(oid)) like '%cancelled%'
    ) as installment_audit_constraint_extended,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'uq_finance_invoices_invoice_no'
        and indexdef like '%UNIQUE%'
        and indexdef like '%invoice_no%'
    ) as invoice_number_unique,
    exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'uq_finance_invoices_active_primary_installment'
        and indexdef like '%cancelled%'
        and indexdef like '%voided%'
    ) as replacement_index_contract_preserved
), uat_safety as (
  select
    count(*) filter (
      where invoice_no = 'VP-IV-202608-000001'
        and document_status = 'issued'
        and issued_at is not null
        and issued_snapshot_json is not null
        and issued_snapshot_json <> '{}'::jsonb
        and voided_at is null
        and void_reason is null
    ) = 1 as invoice_000001_unchanged,
    count(*) filter (
      where invoice_no = 'VP-IV-202608-000002'
        and document_status = 'issued'
        and issued_at is not null
        and issued_snapshot_json is not null
        and issued_snapshot_json <> '{}'::jsonb
        and voided_at is null
        and void_reason is null
    ) = 1 as invoice_000002_unchanged,
    count(*) filter (where document_status = 'voided') = 0 as no_invoice_voided_by_migration
  from public.finance_invoices
), audit_safety as (
  select
    (select count(*) from public.finance_invoice_audit_events where event_type = 'voided') = 0
      as no_void_audit_event_created,
    (select count(*) from public.finance_billing_installment_audit_events where event_type = 'invoice_voided_reopened') = 0
      as no_installment_reopen_event_created
), downstream_safety as (
  select
    to_regclass('public.finance_receipts') is null as no_receipt_object_created,
    to_regclass('public.finance_tax_invoices') is null as no_tax_invoice_object_created,
    to_regclass('public.finance_credit_notes') is null as no_credit_note_object_created,
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
)
select
  'MIGRATION_024_VERIFICATION' as report_section,
  function_contract.*,
  behavior_contract.*,
  schema_contract.*,
  uat_safety.*,
  audit_safety.*,
  downstream_safety.*,
  (
    function_contract.dependency_guard_present
    and function_contract.void_rpc_present
    and function_contract.dependency_guard_fixed_security_definer
    and function_contract.void_rpc_fixed_security_definer
    and function_contract.dependency_guard_not_browser_executable
    and function_contract.dependency_guard_not_anon_executable
    and function_contract.authenticated_can_call_void_rpc
    and function_contract.anon_cannot_call_void_rpc
    and function_contract.browser_cannot_update_invoices
    and function_contract.browser_cannot_update_installments
    and behavior_contract.admin_partner_authority_present
    and behavior_contract.acknowledgement_required
    and behavior_contract.reason_required
    and behavior_contract.issued_only_guard_present
    and behavior_contract.active_payment_draft_blocker_present
    and behavior_contract.confirmed_payment_blocker_present
    and behavior_contract.settlement_zero_guard_present
    and behavior_contract.authoritative_settlement_view_used
    and behavior_contract.authoritative_payment_validator_invoked
    and behavior_contract.downstream_guard_invoked
    and behavior_contract.invoice_void_mutation_present
    and behavior_contract.installment_reopen_present
    and behavior_contract.completed_plan_reopen_present
    and behavior_contract.audit_writes_present
    and behavior_contract.issued_evidence_preservation_guard_present
    and behavior_contract.future_dependency_registry_present
    and behavior_contract.dependency_guard_catalog_aware
    and schema_contract.installment_audit_constraint_extended
    and schema_contract.invoice_number_unique
    and schema_contract.replacement_index_contract_preserved
    and uat_safety.invoice_000001_unchanged
    and uat_safety.invoice_000002_unchanged
    and uat_safety.no_invoice_voided_by_migration
    and audit_safety.no_void_audit_event_created
    and audit_safety.no_installment_reopen_event_created
    and downstream_safety.no_receipt_object_created
    and downstream_safety.no_tax_invoice_object_created
    and downstream_safety.no_credit_note_object_created
    and downstream_safety.ledger_rows = 267
    and downstream_safety.compensation_rows = 33
  ) as invoice_void_lifecycle_verification_pass
from function_contract
cross join behavior_contract
cross join schema_contract
cross join uat_safety
cross join audit_safety
cross join downstream_safety;
