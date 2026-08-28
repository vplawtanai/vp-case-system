-- SELECT-only Production diagnostic for the Phase 5D clean-cutover audit.
-- Returns one row. It does not infer that the legacy-calculated balance equals
-- the actual bank balance. The latter must be confirmed from bank evidence.

with ledger_by_bank as (
  select
    bank.id as bank_account_id,
    bank.short_name,
    bank.bank_name,
    bank.account_name,
    bank.account_number,
    bank.is_active,
    count(ledger.id) as legacy_row_count,
    count(ledger.id) filter (where ledger.status = 'active') as active_row_count,
    count(ledger.id) filter (where ledger.status = 'voided') as voided_row_count,
    count(ledger.id) filter (
      where ledger.status not in ('active', 'voided') or ledger.status is null
    ) as unexpected_status_row_count,
    count(ledger.id) filter (
      where ledger.entry_type not in ('income', 'expense', 'transfer_in', 'transfer_out')
        or ledger.entry_type is null
    ) as unexpected_entry_type_row_count,
    count(ledger.id) filter (
      where ledger.status = 'active'
        and ledger.entry_type in ('transfer_in', 'transfer_out')
    ) as active_transfer_leg_count,
    coalesce(sum(
      case
        when ledger.status = 'active' and ledger.entry_type in ('income', 'transfer_in')
          then ledger.amount
        when ledger.status = 'active' and ledger.entry_type in ('expense', 'transfer_out')
          then -ledger.amount
        else 0
      end
    ), 0)::numeric(14, 2) as legacy_calculated_active_balance,
    coalesce(sum(
      case
        when ledger.entry_type in ('income', 'transfer_in') then ledger.amount
        when ledger.entry_type in ('expense', 'transfer_out') then -ledger.amount
        else 0
      end
    ), 0)::numeric(14, 2) as legacy_calculated_balance_including_voided,
    min(ledger.transaction_date) as first_transaction_date,
    max(ledger.transaction_date) as last_transaction_date,
    max(ledger.created_at) as last_created_at
  from public.finance_bank_accounts as bank
  left join public.finance_company_ledger as ledger
    on ledger.bank_account_id = bank.id
  group by
    bank.id,
    bank.short_name,
    bank.bank_name,
    bank.account_name,
    bank.account_number,
    bank.is_active
), ledger_summary as (
  select
    count(*) as total_legacy_rows,
    count(*) filter (where status = 'active') as active_legacy_rows,
    count(*) filter (where status = 'voided') as voided_legacy_rows,
    count(*) filter (where bank_account_id is null) as rows_without_bank_account,
    count(*) filter (
      where status not in ('active', 'voided') or status is null
    ) as unexpected_status_rows,
    count(*) filter (
      where entry_type not in ('income', 'expense', 'transfer_in', 'transfer_out')
        or entry_type is null
    ) as unexpected_entry_type_rows,
    count(*) filter (
      where nullif(to_jsonb(finance_company_ledger) ->> 'source_expense_claim_id', '') is not null
    ) as expense_claim_source_rows,
    count(*) filter (
      where nullif(to_jsonb(finance_company_ledger) ->> 'source_compensation_batch_id', '') is not null
    ) as compensation_source_rows,
    min(transaction_date) as first_transaction_date,
    max(transaction_date) as last_transaction_date,
    max(created_at) as last_created_at
  from public.finance_company_ledger
), workflow_blockers as (
  select
    (select count(*)
     from public.finance_expense_claims
     where status = 'approved'
       and ledger_entry_id is null) as approved_expense_claims_not_posted,
    (select count(*)
     from public.finance_expense_claims
     where status = 'paid'
       and ledger_entry_id is not null) as paid_expense_claims_with_legacy_link,
    (select count(*)
     from public.finance_compensation_batches
     where status = 'finalized'
       and ledger_entry_id is null) as finalized_compensation_not_posted,
    (select count(*)
     from public.finance_compensation_batches
     where status = 'posted'
       and ledger_entry_id is not null) as posted_compensation_with_legacy_link
), ledger_catalog as (
  select
    class_record.relrowsecurity as rls_enabled,
    class_record.relforcerowsecurity as rls_forced
  from pg_class as class_record
  where class_record.oid = 'public.finance_company_ledger'::regclass
), ledger_columns as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ordinal_position', columns.ordinal_position,
      'column_name', columns.column_name,
      'data_type', columns.data_type,
      'is_nullable', columns.is_nullable,
      'column_default', columns.column_default
    ) order by columns.ordinal_position
  ), '[]'::jsonb) as value
  from information_schema.columns as columns
  where columns.table_schema = 'public'
    and columns.table_name = 'finance_company_ledger'
), ledger_constraints as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', constraint_record.conname,
      'type', constraint_record.contype,
      'definition', pg_get_constraintdef(constraint_record.oid, true)
    ) order by constraint_record.conname
  ), '[]'::jsonb) as value
  from pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.finance_company_ledger'::regclass
), ledger_indexes as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', indexes.indexname,
      'definition', indexes.indexdef
    ) order by indexes.indexname
  ), '[]'::jsonb) as value
  from pg_indexes as indexes
  where indexes.schemaname = 'public'
    and indexes.tablename = 'finance_company_ledger'
), ledger_policies as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', policies.policyname,
      'command', policies.cmd,
      'roles', policies.roles,
      'using', policies.qual,
      'with_check', policies.with_check
    ) order by policies.policyname
  ), '[]'::jsonb) as value
  from pg_policies as policies
  where policies.schemaname = 'public'
    and policies.tablename = 'finance_company_ledger'
), ledger_privileges as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'grantee', grants.grantee,
      'privilege', grants.privilege_type,
      'is_grantable', grants.is_grantable
    ) order by grants.grantee, grants.privilege_type
  ), '[]'::jsonb) as value
  from information_schema.role_table_grants as grants
  where grants.table_schema = 'public'
    and grants.table_name = 'finance_company_ledger'
), public_functions as materialized (
  select
    procedure_record.oid,
    procedure_record.proname,
    procedure_record.prosecdef,
    namespace_record.nspname,
    pg_get_function_identity_arguments(procedure_record.oid) as identity_arguments,
    pg_get_functiondef(procedure_record.oid) as definition
  from pg_proc as procedure_record
  join pg_namespace as namespace_record
    on namespace_record.oid = procedure_record.pronamespace
  where namespace_record.nspname = 'public'
    and procedure_record.prokind in ('f', 'p')
), referencing_functions as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'function', format(
        '%I.%I(%s)',
        public_functions.nspname,
        public_functions.proname,
        public_functions.identity_arguments
      ),
      'security_definer', public_functions.prosecdef
    ) order by public_functions.nspname, public_functions.proname
  ), '[]'::jsonb) as value
  from public_functions
  where public_functions.definition ilike '%finance_company_ledger%'
), referencing_views as (
  select coalesce(jsonb_agg(
    format('%I.%I', views.schemaname, views.viewname)
    order by views.schemaname, views.viewname
  ), '[]'::jsonb) as value
  from pg_views as views
  where views.schemaname = 'public'
    and views.definition ilike '%finance_company_ledger%'
), referencing_triggers as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'table', format('%I.%I', namespace_record.nspname, table_record.relname),
      'trigger', trigger_record.tgname,
      'definition', pg_get_triggerdef(trigger_record.oid, true)
    ) order by table_record.relname, trigger_record.tgname
  ), '[]'::jsonb) as value
  from pg_trigger as trigger_record
  join pg_class as table_record
    on table_record.oid = trigger_record.tgrelid
  join pg_namespace as namespace_record
    on namespace_record.oid = table_record.relnamespace
  join pg_proc as procedure_record
    on procedure_record.oid = trigger_record.tgfoid
  where not trigger_record.tgisinternal
    and namespace_record.nspname = 'public'
    and (
      pg_get_triggerdef(trigger_record.oid, true) ilike '%finance_company_ledger%'
      or pg_get_functiondef(procedure_record.oid) ilike '%finance_company_ledger%'
    )
), bank_access_summary as (
  select
    count(*) as access_row_count,
    count(distinct bank_account_id) as bank_accounts_with_access_rules,
    count(distinct user_profile_id) as users_with_access_rules
  from public.finance_bank_account_access
)
select
  'PHASE_5D_LEGACY_LEDGER_CUTOVER_DIAGNOSTIC' as report_section,
  now() as inspected_at,
  to_jsonb(ledger_summary) as legacy_ledger_summary,
  coalesce((
    select jsonb_agg(to_jsonb(ledger_by_bank) order by is_active desc, short_name, bank_account_id)
    from ledger_by_bank
  ), '[]'::jsonb) as legacy_balance_by_bank,
  to_jsonb(workflow_blockers) as legacy_workflow_blockers,
  to_jsonb(ledger_catalog) as legacy_ledger_rls,
  ledger_columns.value as legacy_ledger_columns,
  ledger_constraints.value as legacy_ledger_constraints,
  ledger_indexes.value as legacy_ledger_indexes,
  ledger_policies.value as legacy_ledger_policies,
  ledger_privileges.value as legacy_ledger_privileges,
  referencing_functions.value as database_functions_referencing_legacy_ledger,
  referencing_views.value as database_views_referencing_legacy_ledger,
  referencing_triggers.value as database_triggers_referencing_legacy_ledger,
  to_jsonb(bank_access_summary) as bank_access_summary,
  'Legacy-calculated balances are diagnostic only. Confirm actual bank balances independently at cutover.'
    as opening_balance_warning
from ledger_summary
cross join workflow_blockers
cross join ledger_catalog
cross join ledger_columns
cross join ledger_constraints
cross join ledger_indexes
cross join ledger_policies
cross join ledger_privileges
cross join referencing_functions
cross join referencing_views
cross join referencing_triggers
cross join bank_access_summary;
