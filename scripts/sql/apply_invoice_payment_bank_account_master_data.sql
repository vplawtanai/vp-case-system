-- Controlled Production master-data patch for approved Invoice payment accounts.
-- This is intentionally separate from Migration 023 because these rows are
-- environment-owned master data, not schema seed data.

begin;

do $$
begin
  if to_regclass('public.finance_bank_accounts') is null then
    raise exception 'finance_bank_accounts is required';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'payment_destination_bank_account_id'
  ) then
    raise exception 'Migration 023 must be applied before the bank-master patch';
  end if;

  if (select count(*) from public.finance_bank_accounts where short_name = 'KBANK') <> 1
    or (select count(*) from public.finance_bank_accounts where short_name = 'KTB') <> 1
  then
    raise exception 'Expected exactly one KBANK and one KTB bank-account master row';
  end if;

  if exists (
    select 1
    from public.finance_bank_accounts
    where short_name = 'KBANK'
      and (
        bank_name is null
        or bank_name not in ('Kasikornbank', 'ธนาคารกสิกรไทย จำกัด (มหาชน)')
        or (account_name is not null and account_name <> 'บริษัท วีพี พาร์ทเนอร์ จำกัด')
        or (account_number is not null and account_number <> '182-8-12987-9')
      )
  ) then
    raise exception 'KBANK master data no longer matches the approved patch precondition';
  end if;

  if exists (
    select 1
    from public.finance_bank_accounts
    where short_name = 'KTB'
      and (
        bank_name is null
        or bank_name not in ('Krungthai Bank', 'ธนาคารกรุงไทย จำกัด (มหาชน)')
        or (account_name is not null and account_name <> 'บริษัท วีพี พาร์ทเนอร์ จำกัด')
        or (account_number is not null and account_number <> '017-0-72761-0')
      )
  ) then
    raise exception 'KTB master data no longer matches the approved patch precondition';
  end if;
end;
$$;

update public.finance_bank_accounts
set
  bank_name = 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
  account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด',
  account_number = '182-8-12987-9',
  updated_at = now()
where short_name = 'KBANK'
  and (
    bank_name is distinct from 'ธนาคารกสิกรไทย จำกัด (มหาชน)'
    or account_name is distinct from 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
    or account_number is distinct from '182-8-12987-9'
  );

update public.finance_bank_accounts
set
  bank_name = 'ธนาคารกรุงไทย จำกัด (มหาชน)',
  account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด',
  account_number = '017-0-72761-0',
  updated_at = now()
where short_name = 'KTB'
  and (
    bank_name is distinct from 'ธนาคารกรุงไทย จำกัด (มหาชน)'
    or account_name is distinct from 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
    or account_number is distinct from '017-0-72761-0'
  );

do $$
begin
  if not exists (
    select 1
    from public.finance_bank_accounts
    where short_name = 'KBANK'
      and bank_name = 'ธนาคารกสิกรไทย จำกัด (มหาชน)'
      and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
      and account_number = '182-8-12987-9'
      and is_active = true
  ) or not exists (
    select 1
    from public.finance_bank_accounts
    where short_name = 'KTB'
      and bank_name = 'ธนาคารกรุงไทย จำกัด (มหาชน)'
      and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
      and account_number = '017-0-72761-0'
      and is_active = true
  ) then
    raise exception 'Approved Invoice payment accounts were not established exactly';
  end if;
end;
$$;

commit;
