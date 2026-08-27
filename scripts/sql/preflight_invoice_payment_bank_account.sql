-- SELECT-only Production preflight for Migration 023 and the controlled bank-master patch.

with bank_contract as (
  select
    count(*) filter (where column_name = 'id' and udt_name = 'uuid') = 1 as id_present,
    count(*) filter (where column_name = 'short_name' and data_type = 'text') = 1 as short_name_present,
    count(*) filter (where column_name = 'bank_name' and data_type = 'text') = 1 as bank_name_present,
    count(*) filter (where column_name = 'account_name' and data_type = 'text') = 1 as account_name_present,
    count(*) filter (where column_name = 'account_number' and data_type = 'text') = 1 as account_number_present,
    count(*) filter (where column_name = 'is_active' and data_type = 'boolean') = 1 as is_active_present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_bank_accounts'
), target_names as (
  select
    count(*) filter (where column_name = 'payment_destination_bank_account_id') = 0
      as destination_id_name_available,
    count(*) filter (where column_name = 'payment_destination_snapshot_json') = 0
      as destination_snapshot_name_available,
    to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)') is null
      as extended_save_signature_available,
    to_regprocedure('public.enforce_finance_invoice_payment_destination()') is null
      as destination_guard_name_available
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'finance_invoices'
), source_contract as (
  select
    to_regclass('public.finance_invoices') is not null as invoices_present,
    to_regclass('public.finance_bank_accounts') is not null as bank_accounts_present,
    to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)') is not null
      as existing_save_rpc_present,
    to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is not null
      as issue_rpc_present
), bank_rows as (
  select
    count(*) filter (where short_name = 'KBANK') = 1 as kbank_found_once,
    count(*) filter (where short_name = 'KTB') = 1 as ktb_found_once,
    count(*) filter (where short_name = 'BAY') = 1 as bay_found_once,
    count(*) filter (
      where short_name = 'KBANK'
        and bank_name in ('Kasikornbank', 'ธนาคารกสิกรไทย จำกัด (มหาชน)')
        and (account_name is null or account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด')
        and (account_number is null or account_number = '182-8-12987-9')
    ) = 1 as kbank_patch_precondition_valid,
    count(*) filter (
      where short_name = 'KTB'
        and bank_name in ('Krungthai Bank', 'ธนาคารกรุงไทย จำกัด (มหาชน)')
        and (account_name is null or account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด')
        and (account_number is null or account_number = '017-0-72761-0')
    ) = 1 as ktb_patch_precondition_valid,
    count(*) filter (
      where short_name = 'BAY'
        and (nullif(btrim(coalesce(account_name, '')), '') is null
          or nullif(btrim(coalesce(account_number, '')), '') is null)
    ) = 1 as bay_remains_incomplete,
    jsonb_agg(to_jsonb(bank_account) order by short_name) as current_bank_accounts
  from public.finance_bank_accounts as bank_account
  where short_name in ('KBANK', 'KTB', 'BAY')
), historical_invoice as (
  select
    count(*) = 1 as historical_invoice_found_once,
    max(document_status) = 'issued' as historical_invoice_is_issued,
    md5(max(issued_snapshot_json::text)) as historical_issued_snapshot_md5
  from public.finance_invoices
  where invoice_no = 'VP-IV-202608-000001'
), financial_baseline as (
  select
    (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_company_ledger) as ledger_rows,
    (select count(*) from public.finance_compensation_batches) as compensation_rows
)
select
  'MIGRATION_023_PREFLIGHT' as report_section,
  current_database() as database_name,
  current_user as database_user,
  bank_contract.*,
  target_names.*,
  source_contract.*,
  bank_rows.*,
  historical_invoice.*,
  financial_baseline.*,
  (
    bank_contract.id_present
    and bank_contract.short_name_present
    and bank_contract.bank_name_present
    and bank_contract.account_name_present
    and bank_contract.account_number_present
    and bank_contract.is_active_present
    and target_names.destination_id_name_available
    and target_names.destination_snapshot_name_available
    and target_names.extended_save_signature_available
    and target_names.destination_guard_name_available
    and source_contract.invoices_present
    and source_contract.bank_accounts_present
    and source_contract.existing_save_rpc_present
    and source_contract.issue_rpc_present
    and bank_rows.kbank_found_once
    and bank_rows.ktb_found_once
    and bank_rows.bay_found_once
    and bank_rows.kbank_patch_precondition_valid
    and bank_rows.ktb_patch_precondition_valid
    and bank_rows.bay_remains_incomplete
    and historical_invoice.historical_invoice_found_once
    and historical_invoice.historical_invoice_is_issued
  ) as invoice_payment_bank_account_preflight_pass
from bank_contract
cross join target_names
cross join source_contract
cross join bank_rows
cross join historical_invoice
cross join financial_baseline;
