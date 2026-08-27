-- SELECT-only Production verification for Migration 023 and the bank-master patch.

with columns_present as (
  select
    count(*) filter (
      where column_name = 'payment_destination_bank_account_id'
        and udt_name = 'uuid'
        and is_nullable = 'YES'
    ) = 1 as destination_id_present,
    count(*) filter (
      where column_name = 'payment_destination_snapshot_json'
        and udt_name = 'jsonb'
        and is_nullable = 'YES'
    ) = 1 as destination_snapshot_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_invoices'
), schema_contract as (
  select
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_invoices'::regclass
        and contype = 'f'
        and confrelid = 'public.finance_bank_accounts'::regclass
        and pg_get_constraintdef(oid) like '%(payment_destination_bank_account_id)%'
        and pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
    ) as destination_fk_restrict_present,
    exists (
      select 1
      from pg_constraint
      where conrelid = 'public.finance_invoices'::regclass
        and conname = 'finance_invoices_payment_destination_snapshot_check'
    ) as destination_snapshot_check_present,
    to_regclass('public.idx_finance_invoices_payment_destination_bank_account') is not null
      as destination_index_present,
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.finance_invoices'::regclass
        and tgname = 'enforce_finance_invoice_payment_destination'
        and not tgisinternal
    ) as destination_trigger_present
), function_contract as (
  select
    to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)') is not null
      as extended_save_rpc_present,
    to_regprocedure('public.enforce_finance_invoice_payment_destination()') is not null
      as destination_guard_present,
    has_function_privilege(
      'authenticated',
      'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)',
      'EXECUTE'
    ) as authenticated_can_save,
    not has_function_privilege(
      'anon',
      'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)',
      'EXECUTE'
    ) as anon_cannot_save,
    not has_function_privilege(
      'authenticated',
      'public.enforce_finance_invoice_payment_destination()',
      'EXECUTE'
    ) as guard_not_browser_executable,
    coalesce((
      select prosecdef
        and coalesce(proconfig, array[]::text[]) @> array['search_path=public']
      from pg_proc
      where oid = to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)')
    ), false) as save_fixed_security_definer,
    coalesce((
      select prosecdef
        and coalesce(proconfig, array[]::text[]) @> array['search_path=public']
      from pg_proc
      where oid = to_regprocedure('public.enforce_finance_invoice_payment_destination()')
    ), false) as guard_fixed_security_definer,
    position('account_name' in pg_get_functiondef(
      'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)'::regprocedure
    )) > 0
      and position('account_number' in pg_get_functiondef(
        'public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)'::regprocedure
      )) > 0 as save_validates_account_completeness,
    position('payment_destination' in pg_get_functiondef(
      'public.enforce_finance_invoice_payment_destination()'::regprocedure
    )) > 0
      and position('jsonb_set' in pg_get_functiondef(
        'public.enforce_finance_invoice_payment_destination()'::regprocedure
      )) > 0
      and position('immutable' in lower(pg_get_functiondef(
        'public.enforce_finance_invoice_payment_destination()'::regprocedure
      ))) > 0 as issue_freeze_and_immutability_present
), bank_master as (
  select
    count(*) filter (
      where short_name = 'KBANK'
        and bank_name = 'ธนาคารกสิกรไทย จำกัด (มหาชน)'
        and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
        and account_number = '182-8-12987-9'
        and is_active = true
    ) = 1 as kbank_ready,
    count(*) filter (
      where short_name = 'KTB'
        and bank_name = 'ธนาคารกรุงไทย จำกัด (มหาชน)'
        and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
        and account_number = '017-0-72761-0'
        and is_active = true
    ) = 1 as ktb_ready,
    count(*) filter (
      where short_name = 'BAY'
        and (nullif(btrim(coalesce(account_name, '')), '') is null
          or nullif(btrim(coalesce(account_number, '')), '') is null)
    ) = 1 as bay_not_eligible,
    jsonb_agg(to_jsonb(bank_account) order by short_name)
      filter (where short_name in ('KBANK', 'KTB', 'BAY')) as audited_bank_rows
  from public.finance_bank_accounts as bank_account
), historical_safety as (
  select
    count(*) = 1 as historical_invoice_found_once,
    count(*) filter (
      where document_status = 'issued'
        and payment_destination_bank_account_id is null
        and payment_destination_snapshot_json is null
        and not (issued_snapshot_json ? 'payment_destination')
    ) = 1 as historical_invoice_not_retrofitted
  from public.finance_invoices
  where invoice_no = 'VP-IV-202608-000001'
), downstream_safety as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
)
select
  'MIGRATION_023_VERIFICATION' as report_section,
  columns_present.*,
  schema_contract.*,
  function_contract.*,
  bank_master.*,
  historical_safety.*,
  downstream_safety.*,
  (
    columns_present.destination_id_present
    and columns_present.destination_snapshot_present
    and schema_contract.destination_fk_restrict_present
    and schema_contract.destination_snapshot_check_present
    and schema_contract.destination_index_present
    and schema_contract.destination_trigger_present
    and function_contract.extended_save_rpc_present
    and function_contract.destination_guard_present
    and function_contract.authenticated_can_save
    and function_contract.anon_cannot_save
    and function_contract.guard_not_browser_executable
    and function_contract.save_fixed_security_definer
    and function_contract.guard_fixed_security_definer
    and function_contract.save_validates_account_completeness
    and function_contract.issue_freeze_and_immutability_present
    and bank_master.kbank_ready
    and bank_master.ktb_ready
    and bank_master.bay_not_eligible
    and historical_safety.historical_invoice_found_once
    and historical_safety.historical_invoice_not_retrofitted
  ) as invoice_payment_bank_account_verification_pass
from columns_present
cross join schema_contract
cross join function_contract
cross join bank_master
cross join historical_safety
cross join downstream_safety;
