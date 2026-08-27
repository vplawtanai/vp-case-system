-- Phase 4A Invoice foundation post-apply verification. SELECT-only; returns one row and performs no RPC calls.
with object_checks as (
  select
    to_regclass('public.finance_invoices') is not null as invoice_header_present,
    to_regclass('public.finance_invoice_items') is not null as invoice_items_present,
    to_regclass('public.finance_invoice_installment_allocations') is not null as invoice_allocations_present,
    to_regclass('public.finance_invoice_audit_events') is not null as invoice_audit_present,
    to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is not null as draft_rpc_present,
    to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is not null as integrity_function_present
), security_checks as (
  select
    bool_and(class.relrowsecurity) as rls_enabled_on_all_tables,
    bool_and(has_table_privilege('authenticated', class.oid, 'SELECT')) as authenticated_select_on_all_tables,
    not bool_or(has_table_privilege('authenticated', class.oid, 'INSERT'))
      and not bool_or(has_table_privilege('authenticated', class.oid, 'UPDATE'))
      and not bool_or(has_table_privilege('authenticated', class.oid, 'DELETE')) as authenticated_direct_writes_blocked
  from pg_class as class
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname in (
      'finance_invoices',
      'finance_invoice_items',
      'finance_invoice_installment_allocations',
      'finance_invoice_audit_events'
    )
), policy_checks as (
  select count(*) = 4 as expected_select_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'finance_invoices',
      'finance_invoice_items',
      'finance_invoice_installment_allocations',
      'finance_invoice_audit_events'
    )
    and cmd = 'SELECT'
), function_checks as (
  select
    function_record.prosecdef as draft_rpc_security_definer,
    coalesce(function_record.proconfig, array[]::text[]) @> array['search_path=public'] as draft_rpc_fixed_public_search_path,
    has_function_privilege(
      'authenticated',
      'public.create_finance_invoice_draft_from_installment(uuid)',
      'EXECUTE'
    ) as authenticated_can_execute_draft_rpc,
    not has_function_privilege(
      'anon',
      'public.create_finance_invoice_draft_from_installment(uuid)',
      'EXECUTE'
    ) as anon_cannot_execute_draft_rpc
  from pg_proc as function_record
  where function_record.oid = 'public.create_finance_invoice_draft_from_installment(uuid)'::regprocedure
), generator_checks as (
  select
    generator.prosecdef as generator_security_definer,
    coalesce(generator.proconfig, array[]::text[]) @> array['search_path=public'] as generator_fixed_public_search_path,
    position('document_numbering_profiles' in pg_get_functiondef(generator.oid)) > 0
      and position('invoice' in pg_get_functiondef(generator.oid)) > 0 as generator_uses_invoice_profile
  from pg_proc as generator
  where generator.oid = 'public.generate_finance_document_no(text,date)'::regprocedure
), profile_check as (
  select count(*) = 1 as invoice_profile_ready
  from public.document_numbering_profiles
  where document_type = 'invoice'
    and display_prefix = 'VP-IV'
    and period_scope = 'monthly'
    and sequence_width = 6
    and is_active
), constraint_checks as (
  select
    count(*) filter (where constraint_record.contype = 'c') >= 20 as financial_and_lifecycle_checks_present,
    count(*) filter (where constraint_record.contype = 'f') >= 15 as source_foreign_keys_present,
    count(*) filter (where constraint_record.contype = 'u') >= 2 as source_uniqueness_constraints_present
  from pg_constraint as constraint_record
  where constraint_record.conrelid in (
    'public.finance_invoices'::regclass,
    'public.finance_invoice_items'::regclass,
    'public.finance_invoice_installment_allocations'::regclass,
    'public.finance_invoice_audit_events'::regclass
  )
), trigger_checks as (
  select count(*) = 3 as deferred_integrity_triggers_present
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'finance_invoice_integrity_after_header',
      'finance_invoice_integrity_after_item',
      'finance_invoice_integrity_after_allocation'
    )
    and tgdeferrable
    and tginitdeferred
), index_checks as (
  select
    count(*) filter (where indexname = 'uq_finance_invoices_invoice_no') = 1 as unique_invoice_number_index_present,
    count(*) filter (where indexname = 'uq_finance_invoices_active_primary_installment') = 1 as active_installment_duplicate_guard_present
  from pg_indexes
  where schemaname = 'public'
), data_checks as (
  select
    (select count(*) from public.finance_invoices) as invoice_count,
    (select count(*) from public.finance_invoice_items) as invoice_item_count,
    (select count(*) from public.finance_invoice_installment_allocations) as invoice_allocation_count,
    (select count(*) from public.finance_invoice_audit_events) as invoice_audit_event_count,
    (select count(*) from public.finance_billing_plans) as current_billing_plan_count,
    (select count(*) from public.finance_billing_installments) as current_billing_installment_count,
    (select count(*) from public.finance_billing_installment_items) as current_billing_installment_item_count,
    (select count(*) from public.finance_fee_agreements) as current_fee_agreement_count,
    (select count(*) from public.finance_fee_agreement_items) as current_fee_agreement_item_count,
    (select count(*) from public.finance_document_counters) as current_document_counter_count
)
select
  object_checks.*,
  security_checks.*,
  policy_checks.*,
  function_checks.*,
  generator_checks.*,
  profile_check.*,
  constraint_checks.*,
  trigger_checks.*,
  index_checks.*,
  data_checks.*,
  (
    object_checks.invoice_header_present
    and object_checks.invoice_items_present
    and object_checks.invoice_allocations_present
    and object_checks.invoice_audit_present
    and object_checks.draft_rpc_present
    and object_checks.integrity_function_present
    and security_checks.rls_enabled_on_all_tables
    and security_checks.authenticated_select_on_all_tables
    and security_checks.authenticated_direct_writes_blocked
    and policy_checks.expected_select_policy_count
    and function_checks.draft_rpc_security_definer
    and function_checks.draft_rpc_fixed_public_search_path
    and function_checks.authenticated_can_execute_draft_rpc
    and function_checks.anon_cannot_execute_draft_rpc
    and generator_checks.generator_security_definer
    and generator_checks.generator_fixed_public_search_path
    and generator_checks.generator_uses_invoice_profile
    and profile_check.invoice_profile_ready
    and constraint_checks.financial_and_lifecycle_checks_present
    and constraint_checks.source_foreign_keys_present
    and constraint_checks.source_uniqueness_constraints_present
    and trigger_checks.deferred_integrity_triggers_present
    and index_checks.unique_invoice_number_index_present
    and index_checks.active_installment_duplicate_guard_present
    and data_checks.invoice_count = 0
    and data_checks.invoice_item_count = 0
    and data_checks.invoice_allocation_count = 0
    and data_checks.invoice_audit_event_count = 0
  ) as invoice_foundation_verification_pass
from object_checks
cross join security_checks
cross join policy_checks
cross join function_checks
cross join generator_checks
cross join profile_check
cross join constraint_checks
cross join trigger_checks
cross join index_checks
cross join data_checks;
