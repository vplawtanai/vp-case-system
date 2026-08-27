-- Transactional Production dry-run for Migration 023 and its controlled
-- bank-master patch. Every schema/data change is rolled back at the end.

begin;

-- BEGIN EXACT MIGRATION 023
-- Minimal customer payment destination for Invoice Drafts and issued snapshots.

do $$
begin
  if to_regclass('public.finance_invoices') is null
    or to_regclass('public.finance_bank_accounts') is null
    or to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text)') is null
    or to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is null
  then
    raise exception 'Invoice payment destination requires Migrations 017 through 022 and finance_bank_accounts';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'account_name'
      and data_type = 'text'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'account_number'
      and data_type = 'text'
  ) then
    raise exception 'finance_bank_accounts requires text account_name and account_number columns';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name in (
        'payment_destination_bank_account_id',
        'payment_destination_snapshot_json'
      )
  ) then
    raise exception 'Invoice payment destination columns already exist';
  end if;

  if to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)') is not null
    or to_regprocedure('public.enforce_finance_invoice_payment_destination()') is not null
  then
    raise exception 'Invoice payment destination functions already exist';
  end if;
end;
$$;

alter table public.finance_invoices
  add column payment_destination_bank_account_id uuid null
    references public.finance_bank_accounts(id) on delete restrict,
  add column payment_destination_snapshot_json jsonb null;

alter table public.finance_invoices
  add constraint finance_invoices_payment_destination_snapshot_check
  check (
    payment_destination_snapshot_json is null
    or (
      document_status in ('issued', 'voided')
      and jsonb_typeof(payment_destination_snapshot_json) = 'object'
      and payment_destination_snapshot_json <> '{}'::jsonb
    )
  );

create index idx_finance_invoices_payment_destination_bank_account
on public.finance_invoices (payment_destination_bank_account_id)
where payment_destination_bank_account_id is not null;

create or replace function public.save_finance_invoice_draft(
  p_invoice_id uuid,
  p_issue_date date,
  p_due_date date,
  p_customer_note text,
  p_payment_terms_text text,
  p_internal_note text,
  p_language_code text,
  p_payment_destination_bank_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_customer_note text := nullif(btrim(coalesce(p_customer_note, '')), '');
  v_payment_terms text := nullif(btrim(coalesce(p_payment_terms_text, '')), '');
  v_internal_note text := nullif(btrim(coalesce(p_internal_note, '')), '');
  v_language text := lower(btrim(coalesce(p_language_code, '')));
  v_actor_email text;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save Invoice Draft';
  end if;
  if p_invoice_id is null then raise exception 'Invoice Draft is required'; end if;
  if v_language not in ('th', 'en') then raise exception 'Invoice language is invalid'; end if;
  if p_due_date is not null and p_issue_date is not null and p_due_date < p_issue_date then
    raise exception 'Invoice due date cannot be before issue date';
  end if;
  if length(coalesce(v_customer_note, '')) > 4000 then raise exception 'Invoice customer note is too long'; end if;
  if length(coalesce(v_payment_terms, '')) > 4000 then raise exception 'Invoice payment instructions are too long'; end if;
  if length(coalesce(v_internal_note, '')) > 4000 then raise exception 'Invoice internal note is too long'; end if;

  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then raise exception 'Invoice Draft not found'; end if;
  if v_invoice.document_status <> 'draft' then raise exception 'Only a Draft Invoice can be edited'; end if;

  if p_payment_destination_bank_account_id is not null and not exists (
    select 1
    from public.finance_bank_accounts as bank_account
    where bank_account.id = p_payment_destination_bank_account_id
      and bank_account.is_active = true
      and nullif(btrim(coalesce(bank_account.account_name, '')), '') is not null
      and nullif(btrim(coalesce(bank_account.account_number, '')), '') is not null
  ) then
    raise exception 'Selected Invoice payment bank account is not eligible';
  end if;

  if v_invoice.issue_date is not distinct from p_issue_date
    and v_invoice.due_date is not distinct from p_due_date
    and v_invoice.customer_note is not distinct from v_customer_note
    and v_invoice.payment_terms_text is not distinct from v_payment_terms
    and v_invoice.internal_note is not distinct from v_internal_note
    and v_invoice.language_code is not distinct from v_language
    and v_invoice.payment_destination_bank_account_id is not distinct from p_payment_destination_bank_account_id
  then
    return v_invoice.id;
  end if;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set
    issue_date = p_issue_date,
    due_date = p_due_date,
    customer_note = v_customer_note,
    payment_terms_text = v_payment_terms,
    internal_note = v_internal_note,
    language_code = v_language,
    payment_destination_bank_account_id = p_payment_destination_bank_account_id,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_invoice.id;

  insert into public.finance_invoice_audit_events (
    invoice_id, event_type, event_payload_json,
    actor_user_id, actor_email, actor_name
  ) values (
    v_invoice.id,
    'draft_saved',
    jsonb_build_object(
      'issue_date', p_issue_date,
      'due_date', p_due_date,
      'language_code', v_language,
      'customer_note_present', v_customer_note is not null,
      'payment_instructions_present', v_payment_terms is not null,
      'internal_note_present', v_internal_note is not null,
      'payment_destination_bank_account_id', p_payment_destination_bank_account_id,
      'payment_destination_selected', p_payment_destination_bank_account_id is not null,
      'financial_values_changed', false
    ),
    auth.uid(), v_actor_email, v_actor_name
  );

  return v_invoice.id;
end;
$$;

create or replace function public.enforce_finance_invoice_payment_destination()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_account public.finance_bank_accounts%rowtype;
  v_destination_snapshot jsonb;
begin
  if old.document_status = 'draft' and new.document_status = 'issued' then
    if new.payment_destination_bank_account_id is null then
      raise exception 'Invoice payment destination bank account is required before issue';
    end if;

    select * into v_bank_account
    from public.finance_bank_accounts as bank_account
    where bank_account.id = new.payment_destination_bank_account_id
    for share;

    if v_bank_account.id is null
      or v_bank_account.is_active is distinct from true
      or nullif(btrim(coalesce(v_bank_account.account_name, '')), '') is null
      or nullif(btrim(coalesce(v_bank_account.account_number, '')), '') is null
    then
      raise exception 'Invoice payment destination bank account is not eligible for issue';
    end if;

    v_destination_snapshot := jsonb_build_object(
      'bank_account_id', v_bank_account.id,
      'short_name', nullif(btrim(coalesce(v_bank_account.short_name, '')), ''),
      'bank_name', nullif(btrim(coalesce(v_bank_account.bank_name, '')), ''),
      'account_name', btrim(v_bank_account.account_name),
      'account_number', btrim(v_bank_account.account_number)
    );

    new.payment_destination_snapshot_json := v_destination_snapshot;
    new.issued_snapshot_json := jsonb_set(
      coalesce(new.issued_snapshot_json, '{}'::jsonb),
      '{payment_destination}',
      v_destination_snapshot,
      true
    );
  elsif old.document_status in ('issued', 'voided') and (
    new.payment_destination_bank_account_id is distinct from old.payment_destination_bank_account_id
    or new.payment_destination_snapshot_json is distinct from old.payment_destination_snapshot_json
    or new.issued_snapshot_json->'payment_destination'
      is distinct from old.issued_snapshot_json->'payment_destination'
  ) then
    raise exception 'Issued Invoice payment destination is immutable';
  end if;

  return new;
end;
$$;

create trigger enforce_finance_invoice_payment_destination
before update of document_status, payment_destination_bank_account_id,
  payment_destination_snapshot_json, issued_snapshot_json
on public.finance_invoices
for each row execute function public.enforce_finance_invoice_payment_destination();

revoke all on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)
  to authenticated;

revoke all on function public.enforce_finance_invoice_payment_destination()
  from public, anon, authenticated;

comment on column public.finance_invoices.payment_destination_bank_account_id is
  'Bank account communicated to the customer on an Invoice; distinct from the account where a Payment later arrives.';
comment on column public.finance_invoices.payment_destination_snapshot_json is
  'Frozen customer-facing bank details captured atomically when a new Invoice is issued; null on Draft and historical issued rows.';
comment on function public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid) is
  'Controlled no-op-aware save for Invoice Draft presentation fields and one eligible customer payment destination.';
comment on function public.enforce_finance_invoice_payment_destination() is
  'Requires and freezes one eligible customer payment destination during new Invoice issuance and protects it afterward.';
-- END EXACT MIGRATION 023
-- BEGIN CONTROLLED BANK-MASTER PATCH DRY-RUN

do $$
begin
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

select
  'MIGRATION_023_TRANSACTIONAL_DRY_RUN' as report_section,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'payment_destination_bank_account_id'
  ) as destination_id_present_inside_transaction,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'payment_destination_snapshot_json'
  ) as destination_snapshot_present_inside_transaction,
  to_regprocedure('public.save_finance_invoice_draft(uuid,date,date,text,text,text,text,uuid)') is not null
    as extended_save_rpc_present_inside_transaction,
  to_regprocedure('public.enforce_finance_invoice_payment_destination()') is not null
    as destination_guard_present_inside_transaction,
  (select count(*) = 1 from public.finance_bank_accounts where short_name = 'KBANK'
    and bank_name = 'ธนาคารกสิกรไทย จำกัด (มหาชน)'
    and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
    and account_number = '182-8-12987-9'
    and is_active = true) as kbank_ready_inside_transaction,
  (select count(*) = 1 from public.finance_bank_accounts where short_name = 'KTB'
    and bank_name = 'ธนาคารกรุงไทย จำกัด (มหาชน)'
    and account_name = 'บริษัท วีพี พาร์ทเนอร์ จำกัด'
    and account_number = '017-0-72761-0'
    and is_active = true) as ktb_ready_inside_transaction,
  (select count(*) = 1 from public.finance_invoices where invoice_no = 'VP-IV-202608-000001'
    and payment_destination_bank_account_id is null
    and payment_destination_snapshot_json is null
    and not (issued_snapshot_json ? 'payment_destination')) as historical_invoice_not_retrofitted;

rollback;
