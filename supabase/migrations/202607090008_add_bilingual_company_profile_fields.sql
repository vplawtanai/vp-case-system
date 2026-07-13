-- Phase 2.13: additive bilingual company-profile master data.
alter table public.finance_company_profiles
  add column if not exists address_en text null,
  add column if not exists branch_th text null,
  add column if not exists branch_en text null;

-- Preserve existing production values and only backfill the new Thai branch field.
update public.finance_company_profiles
set branch_th = branch_label
where coalesce(trim(branch_th), '') = ''
  and coalesce(trim(branch_label), '') <> '';
