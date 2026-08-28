begin;

-- Transactional dry-run of the exact Migration 026 body, followed by
-- rollback-only lifecycle probes. No test row or schema object is committed.
-- Phase 5D-C: controlled Opening Balance and manual Cash Transaction lifecycle.
-- This migration creates no finance rows and does not integrate Payment,
-- Legacy Ledger, Expense Claims, transfers, Receipts, or Tax Invoices.

do $finance_cash_lifecycle_preflight$
begin
  if to_regclass('public.finance_cash_transactions') is null
    or to_regclass('public.finance_account_opening_balances') is null
    or to_regclass('public.finance_cash_transaction_audit_events') is null
    or to_regclass('public.finance_account_opening_balance_audit_events') is null
    or to_regclass('public.finance_cash_account_balance_summary') is null
    or to_regprocedure('public.current_user_can_manage_finance_cash_transactions()') is null
    or to_regprocedure('public.current_user_can_confirm_finance_cash_transactions()') is null
    or to_regprocedure('public.current_user_can_view_finance_cash_bank_account(uuid)') is null
  then
    raise exception 'Finance Cash lifecycle requires the verified Migration 025 foundation';
  end if;

  if exists (select 1 from public.finance_cash_transactions)
    or exists (select 1 from public.finance_account_opening_balances)
    or exists (select 1 from public.finance_cash_transaction_audit_events)
    or exists (select 1 from public.finance_account_opening_balance_audit_events)
  then
    raise exception 'Finance Cash lifecycle must be installed before Production Cash or Opening Balance rows exist';
  end if;

  if to_regclass('public.uq_finance_opening_balances_supersedes') is null then
    raise exception 'Migration 025 Opening Balance supersession index is missing';
  end if;

  if to_regclass('public.uq_finance_opening_balances_initial_draft') is not null
    or exists (
      select 1
      from pg_proc as function_record
      join pg_namespace as namespace_record
        on namespace_record.oid = function_record.pronamespace
      where namespace_record.nspname = 'public'
        and function_record.proname in (
          'record_finance_cash_transaction_audit_event',
          'record_finance_opening_balance_audit_event',
          'assert_finance_opening_balance_input',
          'assert_finance_manual_cash_transaction_input',
          'create_finance_account_opening_balance_draft',
          'save_finance_account_opening_balance_draft',
          'create_finance_account_opening_balance_replacement_draft',
          'confirm_finance_account_opening_balance',
          'cancel_finance_account_opening_balance_draft',
          'create_finance_cash_transaction_draft',
          'save_finance_cash_transaction_draft',
          'confirm_finance_cash_transaction',
          'cancel_finance_cash_transaction_draft'
        )
    )
  then
    raise exception 'Finance Cash lifecycle object names already exist; inspect partial Production state';
  end if;
end;
$finance_cash_lifecycle_preflight$;

-- Cancelled replacement attempts remain immutable history but must not prevent
-- a later controlled correction of the same still-current Opening Balance.
drop index public.uq_finance_opening_balances_supersedes;

create unique index uq_finance_opening_balances_supersedes
on public.finance_account_opening_balances (supersedes_opening_balance_id)
where supersedes_opening_balance_id is not null
  and status <> 'cancelled';

create unique index uq_finance_opening_balances_initial_draft
on public.finance_account_opening_balances (bank_account_id, currency)
where status = 'draft'
  and supersedes_opening_balance_id is null;

create or replace function public.record_finance_cash_transaction_audit_event(
  p_cash_transaction_id uuid,
  p_event_type text,
  p_event_payload_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_cash_transaction_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  if p_cash_transaction_id is null then
    raise exception 'Cash Transaction audit requires a Cash Transaction';
  end if;
  if jsonb_typeof(coalesce(p_event_payload_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Cash Transaction audit payload must be an object';
  end if;

  select
    profile.email,
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(profile.staff_name), ''),
      profile.email
    )
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  insert into public.finance_cash_transaction_audit_events (
    cash_transaction_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    p_cash_transaction_id,
    p_event_type,
    coalesce(p_event_payload_json, '{}'::jsonb),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );
end;
$finance_cash_transaction_audit_writer$;

create or replace function public.record_finance_opening_balance_audit_event(
  p_opening_balance_id uuid,
  p_event_type text,
  p_event_payload_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_opening_balance_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  if p_opening_balance_id is null then
    raise exception 'Opening Balance audit requires an Opening Balance';
  end if;
  if jsonb_typeof(coalesce(p_event_payload_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Opening Balance audit payload must be an object';
  end if;

  select
    profile.email,
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(profile.staff_name), ''),
      profile.email
    )
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  insert into public.finance_account_opening_balance_audit_events (
    opening_balance_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    p_opening_balance_id,
    p_event_type,
    coalesce(p_event_payload_json, '{}'::jsonb),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );
end;
$finance_opening_balance_audit_writer$;

create or replace function public.assert_finance_opening_balance_input(
  p_bank_account_id uuid,
  p_currency text,
  p_as_of timestamptz,
  p_balance_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_opening_balance_input_guard$
begin
  if p_bank_account_id is null then
    raise exception 'Opening Balance requires a bank account';
  end if;
  if not exists (
    select 1
    from public.finance_bank_accounts as bank_account
    where bank_account.id = p_bank_account_id
      and bank_account.is_active = true
  ) then
    raise exception 'Opening Balance requires an active bank account';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Opening Balance currency must be a three-letter uppercase code';
  end if;
  if p_as_of is null or p_as_of > now() then
    raise exception 'Opening Balance timestamp must not be in the future';
  end if;
  if p_balance_amount is null or p_balance_amount <> round(p_balance_amount, 2) then
    raise exception 'Opening Balance amount is required and must use no more than two decimal places';
  end if;
end;
$finance_opening_balance_input_guard$;

create or replace function public.assert_finance_manual_cash_transaction_input(
  p_occurred_at timestamptz,
  p_direction text,
  p_transaction_type text,
  p_bank_account_id uuid,
  p_cash_amount numeric,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_manual_cash_input_guard$
begin
  if p_occurred_at is null then
    raise exception 'Cash Transaction timestamp is required';
  end if;
  if p_direction not in ('inflow', 'outflow') then
    raise exception 'Cash Transaction direction is invalid';
  end if;
  if p_transaction_type in ('customer_payment', 'expense_claim', 'transfer', 'reversal') then
    raise exception using message = 'FINANCE_CASH_MANUAL_TYPE_REQUIRED';
  end if;
  if p_transaction_type not in (
    'manual_inflow',
    'manual_outflow',
    'refund',
    'tax_payment',
    'other'
  ) then
    raise exception using message = 'FINANCE_CASH_MANUAL_TYPE_REQUIRED';
  end if;
  if (p_transaction_type = 'manual_inflow' and p_direction <> 'inflow')
    or (p_transaction_type in ('manual_outflow', 'refund', 'tax_payment') and p_direction <> 'outflow')
  then
    raise exception 'Cash Transaction direction does not match its manual transaction type';
  end if;
  if p_bank_account_id is null or not exists (
    select 1
    from public.finance_bank_accounts as bank_account
    where bank_account.id = p_bank_account_id
      and bank_account.is_active = true
  ) then
    raise exception 'Cash Transaction requires an active bank account';
  end if;
  if p_cash_amount is null or p_cash_amount <= 0 or p_cash_amount <> round(p_cash_amount, 2) then
    raise exception 'Cash Transaction amount must be positive and use no more than two decimal places';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Cash Transaction currency must be a three-letter uppercase code';
  end if;
end;
$finance_manual_cash_input_guard$;

create or replace function public.validate_finance_cash_transaction_integrity(
  p_cash_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $finance_cash_integrity_validator$
declare
  v_transaction public.finance_cash_transactions%rowtype;
  v_original public.finance_cash_transactions%rowtype;
  v_payment public.finance_payments%rowtype;
  v_opening_balance public.finance_account_opening_balances%rowtype;
begin
  select * into v_transaction
  from public.finance_cash_transactions
  where id = p_cash_transaction_id;

  if v_transaction.id is null then
    return;
  end if;

  if v_transaction.status = 'confirmed' then
    if not exists (
      select 1
      from public.finance_bank_accounts
      where id = v_transaction.bank_account_id
        and is_active = true
    ) then
      raise exception 'Confirmed Finance Cash Transaction requires an active bank account';
    end if;

    select *
    into v_opening_balance
    from public.finance_account_opening_balances
    where bank_account_id = v_transaction.bank_account_id
      and currency = v_transaction.currency
      and status = 'confirmed';

    if v_opening_balance.id is null then
      raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_REQUIRED';
    end if;
    if v_transaction.occurred_at <= v_opening_balance.as_of then
      raise exception using message = 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER';
    end if;
  end if;

  if v_transaction.reversal_of_transaction_id is not null then
    select * into v_original
    from public.finance_cash_transactions
    where id = v_transaction.reversal_of_transaction_id;

    if v_original.id is null
      or v_original.status <> 'confirmed'
      or v_original.reversal_of_transaction_id is not null
      or v_transaction.status <> 'confirmed'
      or v_transaction.direction = v_original.direction
      or v_transaction.cash_amount <> v_original.cash_amount
      or v_transaction.currency <> v_original.currency
      or v_transaction.bank_account_id <> v_original.bank_account_id
      or v_transaction.source_payment_id is distinct from v_original.source_payment_id
      or v_transaction.occurred_at < v_original.occurred_at
    then
      raise exception 'Finance Cash reversal must be one confirmed opposite transaction preserving source, account, currency, and amount';
    end if;
  end if;

  if v_transaction.source_payment_id is not null then
    select * into v_payment
    from public.finance_payments
    where id = v_transaction.source_payment_id;

    if v_payment.id is null
      or v_payment.status not in ('confirmed', 'reversed')
      or v_payment.cash_amount <= 0
      or v_transaction.cash_amount <> v_payment.cash_amount
      or v_transaction.currency <> v_payment.currency
      or v_transaction.bank_account_id is distinct from v_payment.receiving_bank_account_id
    then
      raise exception 'Payment-linked Finance Cash Transaction must preserve confirmed Payment cash, currency, and receiving account';
    end if;
  end if;
end;
$finance_cash_integrity_validator$;

create or replace function public.create_finance_account_opening_balance_draft(
  p_bank_account_id uuid,
  p_currency text,
  p_as_of timestamptz,
  p_balance_amount numeric,
  p_evidence_reference text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_finance_opening_balance_draft$
declare
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_evidence_reference text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing_draft_id uuid;
  v_opening_balance_id uuid;
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to create Opening Balance Draft';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(p_bank_account_id) then
    raise exception 'Not allowed to manage this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = p_bank_account_id
  for update;

  perform public.assert_finance_opening_balance_input(
    p_bank_account_id,
    v_currency,
    p_as_of,
    p_balance_amount
  );

  if exists (
    select 1
    from public.finance_account_opening_balances
    where bank_account_id = p_bank_account_id
      and currency = v_currency
      and status = 'confirmed'
  ) then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_ALREADY_CONFIRMED';
  end if;

  select opening_balance.id
  into v_existing_draft_id
  from public.finance_account_opening_balances as opening_balance
  where opening_balance.bank_account_id = p_bank_account_id
    and opening_balance.currency = v_currency
    and opening_balance.status = 'draft'
    and opening_balance.supersedes_opening_balance_id is null
  order by opening_balance.created_at, opening_balance.id
  limit 1;

  if v_existing_draft_id is not null then
    return v_existing_draft_id;
  end if;

  insert into public.finance_account_opening_balances (
    bank_account_id,
    currency,
    as_of,
    balance_amount,
    evidence_reference,
    note,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_bank_account_id,
    v_currency,
    p_as_of,
    p_balance_amount,
    v_evidence_reference,
    v_note,
    auth.uid(),
    auth.uid()
  )
  returning id into v_opening_balance_id;

  perform public.record_finance_opening_balance_audit_event(
    v_opening_balance_id,
    'draft_created',
    jsonb_build_object(
      'bank_account_id', p_bank_account_id,
      'currency', v_currency,
      'as_of', p_as_of,
      'balance_amount', p_balance_amount,
      'is_replacement', false,
      'legacy_balance_used', false
    )
  );

  return v_opening_balance_id;
end;
$create_finance_opening_balance_draft$;

create or replace function public.save_finance_account_opening_balance_draft(
  p_opening_balance_id uuid,
  p_bank_account_id uuid,
  p_currency text,
  p_as_of timestamptz,
  p_balance_amount numeric,
  p_evidence_reference text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_finance_opening_balance_draft$
declare
  v_opening_balance public.finance_account_opening_balances%rowtype;
  v_prior public.finance_account_opening_balances%rowtype;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_evidence_reference text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to save Opening Balance Draft';
  end if;
  if p_opening_balance_id is null then
    raise exception 'Opening Balance Draft is required';
  end if;

  select *
  into v_opening_balance
  from public.finance_account_opening_balances
  where id = p_opening_balance_id
  for update;

  if v_opening_balance.id is null then
    raise exception 'Opening Balance Draft not found';
  end if;
  if v_opening_balance.status <> 'draft' then
    raise exception 'Only a Draft Opening Balance can be saved';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_opening_balance.bank_account_id)
    or not public.current_user_can_view_finance_cash_bank_account(p_bank_account_id)
  then
    raise exception 'Not allowed to manage this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id in (v_opening_balance.bank_account_id, p_bank_account_id)
  order by id
  for update;

  perform public.assert_finance_opening_balance_input(
    p_bank_account_id,
    v_currency,
    p_as_of,
    p_balance_amount
  );

  if v_opening_balance.supersedes_opening_balance_id is not null then
    select *
    into v_prior
    from public.finance_account_opening_balances
    where id = v_opening_balance.supersedes_opening_balance_id;

    if v_prior.id is null
      or v_prior.status <> 'confirmed'
      or p_bank_account_id <> v_prior.bank_account_id
      or v_currency <> v_prior.currency
      or p_as_of <= v_prior.as_of
    then
      raise exception 'Replacement Opening Balance must remain a later Draft for its current bank account and currency';
    end if;
  elsif exists (
    select 1
    from public.finance_account_opening_balances
    where bank_account_id = p_bank_account_id
      and currency = v_currency
      and status = 'confirmed'
  ) then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_ALREADY_CONFIRMED';
  end if;

  if v_opening_balance.bank_account_id is not distinct from p_bank_account_id
    and v_opening_balance.currency is not distinct from v_currency
    and v_opening_balance.as_of is not distinct from p_as_of
    and v_opening_balance.balance_amount is not distinct from p_balance_amount
    and v_opening_balance.evidence_reference is not distinct from v_evidence_reference
    and v_opening_balance.note is not distinct from v_note
  then
    return v_opening_balance.id;
  end if;

  update public.finance_account_opening_balances
  set
    bank_account_id = p_bank_account_id,
    currency = v_currency,
    as_of = p_as_of,
    balance_amount = p_balance_amount,
    evidence_reference = v_evidence_reference,
    note = v_note,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_opening_balance.id;

  perform public.record_finance_opening_balance_audit_event(
    v_opening_balance.id,
    'draft_saved',
    jsonb_build_object(
      'bank_account_id', p_bank_account_id,
      'currency', v_currency,
      'as_of', p_as_of,
      'balance_amount', p_balance_amount,
      'is_replacement', v_opening_balance.supersedes_opening_balance_id is not null
    )
  );

  return v_opening_balance.id;
end;
$save_finance_opening_balance_draft$;

create or replace function public.create_finance_account_opening_balance_replacement_draft(
  p_prior_opening_balance_id uuid,
  p_as_of timestamptz,
  p_balance_amount numeric,
  p_evidence_reference text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_finance_opening_replacement_draft$
declare
  v_prior public.finance_account_opening_balances%rowtype;
  v_existing_draft_id uuid;
  v_replacement_id uuid;
  v_evidence_reference text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to create replacement Opening Balance Draft';
  end if;
  if p_prior_opening_balance_id is null then
    raise exception 'Current confirmed Opening Balance is required';
  end if;

  select *
  into v_prior
  from public.finance_account_opening_balances
  where id = p_prior_opening_balance_id;

  if v_prior.id is null then
    raise exception 'Current confirmed Opening Balance not found';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_prior.bank_account_id) then
    raise exception 'Not allowed to manage this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = v_prior.bank_account_id
  for update;

  select *
  into v_prior
  from public.finance_account_opening_balances
  where id = p_prior_opening_balance_id
  for update;

  if v_prior.status <> 'confirmed' then
    raise exception 'Replacement Draft requires the current confirmed Opening Balance';
  end if;

  perform public.assert_finance_opening_balance_input(
    v_prior.bank_account_id,
    v_prior.currency,
    p_as_of,
    p_balance_amount
  );

  if p_as_of <= v_prior.as_of then
    raise exception 'Replacement Opening Balance must use a later verification timestamp';
  end if;

  select opening_balance.id
  into v_existing_draft_id
  from public.finance_account_opening_balances as opening_balance
  where opening_balance.supersedes_opening_balance_id = v_prior.id
    and opening_balance.status = 'draft'
  order by opening_balance.created_at, opening_balance.id
  limit 1;

  if v_existing_draft_id is not null then
    return v_existing_draft_id;
  end if;

  insert into public.finance_account_opening_balances (
    bank_account_id,
    currency,
    as_of,
    balance_amount,
    evidence_reference,
    note,
    supersedes_opening_balance_id,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_prior.bank_account_id,
    v_prior.currency,
    p_as_of,
    p_balance_amount,
    v_evidence_reference,
    v_note,
    v_prior.id,
    auth.uid(),
    auth.uid()
  )
  returning id into v_replacement_id;

  perform public.record_finance_opening_balance_audit_event(
    v_replacement_id,
    'draft_created',
    jsonb_build_object(
      'bank_account_id', v_prior.bank_account_id,
      'currency', v_prior.currency,
      'as_of', p_as_of,
      'balance_amount', p_balance_amount,
      'is_replacement', true,
      'supersedes_opening_balance_id', v_prior.id,
      'legacy_balance_used', false
    )
  );

  return v_replacement_id;
end;
$create_finance_opening_replacement_draft$;

create or replace function public.confirm_finance_account_opening_balance(
  p_opening_balance_id uuid,
  p_independent_balance_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $confirm_finance_opening_balance$
declare
  v_opening_balance public.finance_account_opening_balances%rowtype;
  v_prior public.finance_account_opening_balances%rowtype;
begin
  if not public.current_user_can_confirm_finance_cash_transactions() then
    raise exception 'Not allowed to confirm Opening Balance';
  end if;
  if p_independent_balance_acknowledged is distinct from true then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_ACKNOWLEDGEMENT_REQUIRED';
  end if;
  if p_opening_balance_id is null then
    raise exception 'Opening Balance Draft is required';
  end if;

  select *
  into v_opening_balance
  from public.finance_account_opening_balances
  where id = p_opening_balance_id
  for update;

  if v_opening_balance.id is null then
    raise exception 'Opening Balance Draft not found';
  end if;
  if v_opening_balance.status <> 'draft' then
    raise exception 'Only a Draft Opening Balance can be confirmed';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_opening_balance.bank_account_id) then
    raise exception 'Not allowed to confirm this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = v_opening_balance.bank_account_id
  for update;

  perform public.assert_finance_opening_balance_input(
    v_opening_balance.bank_account_id,
    v_opening_balance.currency,
    v_opening_balance.as_of,
    v_opening_balance.balance_amount
  );

  if v_opening_balance.supersedes_opening_balance_id is not null then
    select *
    into v_prior
    from public.finance_account_opening_balances
    where id = v_opening_balance.supersedes_opening_balance_id
    for update;

    if v_prior.id is null
      or v_prior.status <> 'confirmed'
      or v_prior.bank_account_id <> v_opening_balance.bank_account_id
      or v_prior.currency <> v_opening_balance.currency
      or v_prior.as_of >= v_opening_balance.as_of
    then
      raise exception 'Replacement Opening Balance no longer matches the current confirmed evidence';
    end if;

    update public.finance_account_opening_balances
    set
      status = 'superseded',
      superseded_at = now(),
      superseded_by_user_id = auth.uid(),
      updated_at = now(),
      updated_by_user_id = auth.uid()
    where id = v_prior.id;
  elsif exists (
    select 1
    from public.finance_account_opening_balances
    where bank_account_id = v_opening_balance.bank_account_id
      and currency = v_opening_balance.currency
      and status = 'confirmed'
      and id <> v_opening_balance.id
  ) then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_CONFLICT';
  end if;

  update public.finance_account_opening_balances
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = auth.uid(),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_opening_balance.id;

  if v_prior.id is not null then
    perform public.record_finance_opening_balance_audit_event(
      v_prior.id,
      'superseded',
      jsonb_build_object(
        'replacement_opening_balance_id', v_opening_balance.id,
        'replacement_as_of', v_opening_balance.as_of
      )
    );
  end if;

  perform public.record_finance_opening_balance_audit_event(
    v_opening_balance.id,
    'confirmed',
    jsonb_build_object(
      'bank_account_id', v_opening_balance.bank_account_id,
      'currency', v_opening_balance.currency,
      'as_of', v_opening_balance.as_of,
      'balance_amount', v_opening_balance.balance_amount,
      'independently_verified_actual_balance_acknowledged', true,
      'is_replacement', v_opening_balance.supersedes_opening_balance_id is not null,
      'legacy_balance_used', false
    )
  );

  return v_opening_balance.id;
end;
$confirm_finance_opening_balance$;

create or replace function public.cancel_finance_account_opening_balance_draft(
  p_opening_balance_id uuid,
  p_cancel_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $cancel_finance_opening_balance_draft$
declare
  v_opening_balance public.finance_account_opening_balances%rowtype;
  v_cancel_reason text := nullif(btrim(coalesce(p_cancel_reason, '')), '');
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to cancel Opening Balance Draft';
  end if;
  if v_cancel_reason is null then
    raise exception 'Opening Balance cancellation reason is required';
  end if;

  select *
  into v_opening_balance
  from public.finance_account_opening_balances
  where id = p_opening_balance_id
  for update;

  if v_opening_balance.id is null then
    raise exception 'Opening Balance Draft not found';
  end if;
  if v_opening_balance.status <> 'draft' then
    raise exception 'Only a Draft Opening Balance can be cancelled';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_opening_balance.bank_account_id) then
    raise exception 'Not allowed to manage this bank account';
  end if;

  update public.finance_account_opening_balances
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_user_id = auth.uid(),
    cancel_reason = v_cancel_reason,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_opening_balance.id;

  perform public.record_finance_opening_balance_audit_event(
    v_opening_balance.id,
    'cancelled',
    jsonb_build_object('cancel_reason', v_cancel_reason)
  );

  return v_opening_balance.id;
end;
$cancel_finance_opening_balance_draft$;

create or replace function public.create_finance_cash_transaction_draft(
  p_occurred_at timestamptz,
  p_direction text,
  p_transaction_type text,
  p_bank_account_id uuid,
  p_cash_amount numeric,
  p_currency text,
  p_reference_no text,
  p_description text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_finance_cash_transaction_draft$
declare
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_transaction_type text := lower(btrim(coalesce(p_transaction_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_cash_transaction_id uuid;
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to create Cash Transaction Draft';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(p_bank_account_id) then
    raise exception 'Not allowed to manage this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = p_bank_account_id
  for update;

  perform public.assert_finance_manual_cash_transaction_input(
    p_occurred_at,
    v_direction,
    v_transaction_type,
    p_bank_account_id,
    p_cash_amount,
    v_currency
  );

  insert into public.finance_cash_transactions (
    occurred_at,
    direction,
    transaction_type,
    bank_account_id,
    cash_amount,
    currency,
    source_payment_id,
    reference_no,
    description,
    note,
    reversal_of_transaction_id,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_occurred_at,
    v_direction,
    v_transaction_type,
    p_bank_account_id,
    p_cash_amount,
    v_currency,
    null,
    v_reference_no,
    v_description,
    v_note,
    null,
    auth.uid(),
    auth.uid()
  )
  returning id into v_cash_transaction_id;

  perform public.record_finance_cash_transaction_audit_event(
    v_cash_transaction_id,
    'draft_created',
    jsonb_build_object(
      'bank_account_id', p_bank_account_id,
      'currency', v_currency,
      'occurred_at', p_occurred_at,
      'direction', v_direction,
      'transaction_type', v_transaction_type,
      'cash_amount', p_cash_amount,
      'source_payment_id', null,
      'reversal_of_transaction_id', null
    )
  );

  return v_cash_transaction_id;
end;
$create_finance_cash_transaction_draft$;

create or replace function public.save_finance_cash_transaction_draft(
  p_cash_transaction_id uuid,
  p_occurred_at timestamptz,
  p_direction text,
  p_transaction_type text,
  p_bank_account_id uuid,
  p_cash_amount numeric,
  p_currency text,
  p_reference_no text,
  p_description text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_finance_cash_transaction_draft$
declare
  v_cash_transaction public.finance_cash_transactions%rowtype;
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_transaction_type text := lower(btrim(coalesce(p_transaction_type, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_reference_no text := nullif(btrim(coalesce(p_reference_no, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to save Cash Transaction Draft';
  end if;
  if p_cash_transaction_id is null then
    raise exception 'Cash Transaction Draft is required';
  end if;

  select *
  into v_cash_transaction
  from public.finance_cash_transactions
  where id = p_cash_transaction_id
  for update;

  if v_cash_transaction.id is null then
    raise exception 'Cash Transaction Draft not found';
  end if;
  if v_cash_transaction.status <> 'draft' then
    raise exception 'Only a Draft Cash Transaction can be saved';
  end if;
  if v_cash_transaction.source_payment_id is not null
    or v_cash_transaction.reversal_of_transaction_id is not null
  then
    raise exception using message = 'FINANCE_CASH_MANUAL_SOURCE_REQUIRED';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_cash_transaction.bank_account_id)
    or not public.current_user_can_view_finance_cash_bank_account(p_bank_account_id)
  then
    raise exception 'Not allowed to manage this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id in (v_cash_transaction.bank_account_id, p_bank_account_id)
  order by id
  for update;

  perform public.assert_finance_manual_cash_transaction_input(
    p_occurred_at,
    v_direction,
    v_transaction_type,
    p_bank_account_id,
    p_cash_amount,
    v_currency
  );

  if v_cash_transaction.occurred_at is not distinct from p_occurred_at
    and v_cash_transaction.direction is not distinct from v_direction
    and v_cash_transaction.transaction_type is not distinct from v_transaction_type
    and v_cash_transaction.bank_account_id is not distinct from p_bank_account_id
    and v_cash_transaction.cash_amount is not distinct from p_cash_amount
    and v_cash_transaction.currency is not distinct from v_currency
    and v_cash_transaction.reference_no is not distinct from v_reference_no
    and v_cash_transaction.description is not distinct from v_description
    and v_cash_transaction.note is not distinct from v_note
  then
    return v_cash_transaction.id;
  end if;

  update public.finance_cash_transactions
  set
    occurred_at = p_occurred_at,
    direction = v_direction,
    transaction_type = v_transaction_type,
    bank_account_id = p_bank_account_id,
    cash_amount = p_cash_amount,
    currency = v_currency,
    reference_no = v_reference_no,
    description = v_description,
    note = v_note,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_cash_transaction.id;

  perform public.record_finance_cash_transaction_audit_event(
    v_cash_transaction.id,
    'draft_saved',
    jsonb_build_object(
      'bank_account_id', p_bank_account_id,
      'currency', v_currency,
      'occurred_at', p_occurred_at,
      'direction', v_direction,
      'transaction_type', v_transaction_type,
      'cash_amount', p_cash_amount
    )
  );

  return v_cash_transaction.id;
end;
$save_finance_cash_transaction_draft$;

create or replace function public.confirm_finance_cash_transaction(
  p_cash_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $confirm_finance_cash_transaction$
declare
  v_cash_transaction public.finance_cash_transactions%rowtype;
  v_opening_balance public.finance_account_opening_balances%rowtype;
begin
  if not public.current_user_can_confirm_finance_cash_transactions() then
    raise exception 'Not allowed to confirm Cash Transaction';
  end if;
  if p_cash_transaction_id is null then
    raise exception 'Cash Transaction Draft is required';
  end if;

  select *
  into v_cash_transaction
  from public.finance_cash_transactions
  where id = p_cash_transaction_id
  for update;

  if v_cash_transaction.id is null then
    raise exception 'Cash Transaction Draft not found';
  end if;
  if v_cash_transaction.status <> 'draft' then
    raise exception 'Only a Draft Cash Transaction can be confirmed';
  end if;
  if v_cash_transaction.source_payment_id is not null
    or v_cash_transaction.reversal_of_transaction_id is not null
  then
    raise exception using message = 'FINANCE_CASH_MANUAL_SOURCE_REQUIRED';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_cash_transaction.bank_account_id) then
    raise exception 'Not allowed to confirm this bank account';
  end if;

  perform 1
  from public.finance_bank_accounts
  where id = v_cash_transaction.bank_account_id
  for update;

  perform public.assert_finance_manual_cash_transaction_input(
    v_cash_transaction.occurred_at,
    v_cash_transaction.direction,
    v_cash_transaction.transaction_type,
    v_cash_transaction.bank_account_id,
    v_cash_transaction.cash_amount,
    v_cash_transaction.currency
  );

  select *
  into v_opening_balance
  from public.finance_account_opening_balances
  where bank_account_id = v_cash_transaction.bank_account_id
    and currency = v_cash_transaction.currency
    and status = 'confirmed'
  for update;

  if v_opening_balance.id is null then
    raise exception using message = 'FINANCE_CASH_OPENING_BALANCE_REQUIRED';
  end if;
  if v_cash_transaction.occurred_at <= v_opening_balance.as_of then
    raise exception using message = 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER';
  end if;

  update public.finance_cash_transactions
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = auth.uid(),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_cash_transaction.id;

  perform public.record_finance_cash_transaction_audit_event(
    v_cash_transaction.id,
    'confirmed',
    jsonb_build_object(
      'bank_account_id', v_cash_transaction.bank_account_id,
      'currency', v_cash_transaction.currency,
      'occurred_at', v_cash_transaction.occurred_at,
      'direction', v_cash_transaction.direction,
      'transaction_type', v_cash_transaction.transaction_type,
      'cash_amount', v_cash_transaction.cash_amount,
      'opening_balance_id', v_opening_balance.id,
      'opening_balance_as_of', v_opening_balance.as_of,
      'source_payment_id', null,
      'reversal_of_transaction_id', null
    )
  );

  return v_cash_transaction.id;
end;
$confirm_finance_cash_transaction$;

create or replace function public.cancel_finance_cash_transaction_draft(
  p_cash_transaction_id uuid,
  p_cancel_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $cancel_finance_cash_transaction_draft$
declare
  v_cash_transaction public.finance_cash_transactions%rowtype;
  v_cancel_reason text := nullif(btrim(coalesce(p_cancel_reason, '')), '');
begin
  if not public.current_user_can_manage_finance_cash_transactions() then
    raise exception 'Not allowed to cancel Cash Transaction Draft';
  end if;
  if v_cancel_reason is null then
    raise exception 'Cash Transaction cancellation reason is required';
  end if;

  select *
  into v_cash_transaction
  from public.finance_cash_transactions
  where id = p_cash_transaction_id
  for update;

  if v_cash_transaction.id is null then
    raise exception 'Cash Transaction Draft not found';
  end if;
  if v_cash_transaction.status <> 'draft' then
    raise exception 'Only a Draft Cash Transaction can be cancelled';
  end if;
  if v_cash_transaction.source_payment_id is not null
    or v_cash_transaction.reversal_of_transaction_id is not null
  then
    raise exception using message = 'FINANCE_CASH_MANUAL_SOURCE_REQUIRED';
  end if;
  if not public.current_user_can_view_finance_cash_bank_account(v_cash_transaction.bank_account_id) then
    raise exception 'Not allowed to manage this bank account';
  end if;

  update public.finance_cash_transactions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_user_id = auth.uid(),
    cancel_reason = v_cancel_reason,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_cash_transaction.id;

  perform public.record_finance_cash_transaction_audit_event(
    v_cash_transaction.id,
    'cancelled',
    jsonb_build_object('cancel_reason', v_cancel_reason)
  );

  return v_cash_transaction.id;
end;
$cancel_finance_cash_transaction_draft$;

revoke all on function public.record_finance_cash_transaction_audit_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_finance_opening_balance_audit_event(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.assert_finance_opening_balance_input(uuid, text, timestamptz, numeric)
  from public, anon, authenticated;
revoke all on function public.assert_finance_manual_cash_transaction_input(timestamptz, text, text, uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.validate_finance_cash_transaction_integrity(uuid)
  from public, anon, authenticated;

revoke all on function public.create_finance_account_opening_balance_draft(uuid, text, timestamptz, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.save_finance_account_opening_balance_draft(uuid, uuid, text, timestamptz, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.create_finance_account_opening_balance_replacement_draft(uuid, timestamptz, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_finance_account_opening_balance(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.cancel_finance_account_opening_balance_draft(uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_finance_cash_transaction_draft(timestamptz, text, text, uuid, numeric, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.save_finance_cash_transaction_draft(uuid, timestamptz, text, text, uuid, numeric, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.confirm_finance_cash_transaction(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_finance_cash_transaction_draft(uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_finance_account_opening_balance_draft(uuid, text, timestamptz, numeric, text, text)
  to authenticated;
grant execute on function public.save_finance_account_opening_balance_draft(uuid, uuid, text, timestamptz, numeric, text, text)
  to authenticated;
grant execute on function public.create_finance_account_opening_balance_replacement_draft(uuid, timestamptz, numeric, text, text)
  to authenticated;
grant execute on function public.confirm_finance_account_opening_balance(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_finance_account_opening_balance_draft(uuid, text)
  to authenticated;
grant execute on function public.create_finance_cash_transaction_draft(timestamptz, text, text, uuid, numeric, text, text, text, text)
  to authenticated;
grant execute on function public.save_finance_cash_transaction_draft(uuid, timestamptz, text, text, uuid, numeric, text, text, text, text)
  to authenticated;
grant execute on function public.confirm_finance_cash_transaction(uuid)
  to authenticated;
grant execute on function public.cancel_finance_cash_transaction_draft(uuid, text)
  to authenticated;

do $finance_cash_lifecycle_security_check$
declare
  v_function_count integer;
  v_owner_count integer;
  v_expected_owner oid;
begin
  select proowner into v_expected_owner
  from pg_proc
  where oid = 'public.current_user_can_manage_finance_cash_transactions()'::regprocedure;

  select count(*)::integer, count(distinct function_record.proowner)::integer
  into v_function_count, v_owner_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
    'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
    'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
    'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
    'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
    'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
    'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
    'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
    'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
    'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
    'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
    'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
  );

  if v_function_count <> 14 or v_owner_count <> 1 or exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
      'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
      'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
      'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
      'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
      'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
    )
      and function_record.proowner <> v_expected_owner
  ) then
    raise exception 'Finance Cash lifecycle functions must share the trusted Migration 025 owner';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
      'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure,
      'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
      'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
      'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
      'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
    )
      and (
        not function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Finance Cash lifecycle functions require SECURITY DEFINER with fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.save_finance_account_opening_balance_draft(uuid,uuid,text,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.create_finance_account_opening_balance_replacement_draft(uuid,timestamp with time zone,numeric,text,text)'::regprocedure,
      'public.confirm_finance_account_opening_balance(uuid,boolean)'::regprocedure,
      'public.cancel_finance_account_opening_balance_draft(uuid,text)'::regprocedure,
      'public.create_finance_cash_transaction_draft(timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.save_finance_cash_transaction_draft(uuid,timestamp with time zone,text,text,uuid,numeric,text,text,text,text)'::regprocedure,
      'public.confirm_finance_cash_transaction(uuid)'::regprocedure,
      'public.cancel_finance_cash_transaction_draft(uuid,text)'::regprocedure
    )
      and (
        not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Finance Cash lifecycle browser RPC grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.record_finance_cash_transaction_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.record_finance_opening_balance_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.assert_finance_opening_balance_input(uuid,text,timestamp with time zone,numeric)'::regprocedure,
      'public.assert_finance_manual_cash_transaction_input(timestamp with time zone,text,text,uuid,numeric,text)'::regprocedure,
      'public.validate_finance_cash_transaction_integrity(uuid)'::regprocedure
    )
      and (
        has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Finance Cash lifecycle internal helpers must not be browser-executable';
  end if;
end;
$finance_cash_lifecycle_security_check$;

comment on function public.confirm_finance_account_opening_balance(uuid, boolean) is
  'Confirms independently verified actual bank balance evidence. It never derives balance from Legacy Ledger.';
comment on function public.confirm_finance_cash_transaction(uuid) is
  'Confirms one manual actual cash movement only after a current confirmed Opening Balance and strictly after its cutoff.';

do $finance_cash_lifecycle_dry_run_tests$
declare
  v_actor_user_id uuid;
  v_bank_account_id uuid;
  v_currency text := 'THB';
  v_cutoff timestamptz := clock_timestamp() - interval '2 days';
  v_opening_balance_id uuid;
  v_replacement_opening_balance_id uuid;
  v_cancelled_replacement_id uuid;
  v_second_replacement_id uuid;
  v_cash_before_opening_id uuid;
  v_inflow_id uuid;
  v_outflow_id uuid;
  v_cancelled_cash_id uuid;
  v_before_cutoff_id uuid;
  v_reserved_type text;
  v_error_message text;
begin
  perform set_config(
    'vp_cash_lifecycle_dry_run.legacy_ledger_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
      from public.finance_company_ledger as ledger_record
    ),
    true
  );
  perform set_config(
    'vp_cash_lifecycle_dry_run.payment_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
      from public.finance_payments as payment_record
    ),
    true
  );
  perform set_config(
    'vp_cash_lifecycle_dry_run.compensation_fingerprint',
    (
      select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
      from public.finance_compensation_batches as compensation_record
    ),
    true
  );

  if (select count(*) from public.finance_cash_transactions) <> 0
    or (select count(*) from public.finance_account_opening_balances) <> 0
    or (select count(*) from public.finance_cash_transaction_audit_events) <> 0
    or (select count(*) from public.finance_account_opening_balance_audit_events) <> 0
  then
    raise exception 'Dry-run requires the verified empty Finance Cash foundation';
  end if;
  if (select count(*) from public.finance_company_ledger) <> 267
    or (select count(*) from public.finance_compensation_batches) <> 33
  then
    raise exception 'Dry-run requires the verified Legacy Ledger and Compensation baselines';
  end if;

  select profile.id
  into v_actor_user_id
  from public.user_profiles as profile
  where profile.active = true
    and profile.role = 'admin'
  order by profile.id
  limit 1;

  select bank_account.id
  into v_bank_account_id
  from public.finance_bank_accounts as bank_account
  where bank_account.is_active = true
  order by bank_account.short_name, bank_account.id
  limit 1;

  if v_actor_user_id is null or v_bank_account_id is null then
    raise exception 'Dry-run requires one active Admin and one active bank account';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_user_id::text, true);

  select public.create_finance_cash_transaction_draft(
    v_cutoff + interval '1 hour',
    'inflow',
    'manual_inflow',
    v_bank_account_id,
    1000.00,
    v_currency,
    'ROLLBACK-NO-OPENING',
    'Rollback-only confirmation gate test',
    null
  ) into v_cash_before_opening_id;

  begin
    perform public.confirm_finance_cash_transaction(v_cash_before_opening_id);
    raise exception 'Cash confirmation without Opening Balance was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_CASH_OPENING_BALANCE_REQUIRED' then
        raise;
      end if;
  end;

  perform public.cancel_finance_cash_transaction_draft(
    v_cash_before_opening_id,
    'Rollback-only blocked confirmation cleanup'
  );

  select public.create_finance_account_opening_balance_draft(
    v_bank_account_id,
    v_currency,
    v_cutoff,
    100000.00,
    'ROLLBACK-ONLY-INDEPENDENT-BANK-EVIDENCE',
    'Rollback-only Opening Balance lifecycle test'
  ) into v_opening_balance_id;

  begin
    perform public.confirm_finance_account_opening_balance(v_opening_balance_id, false);
    raise exception 'Opening Balance confirmation without acknowledgement was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_CASH_OPENING_BALANCE_ACKNOWLEDGEMENT_REQUIRED' then
        raise;
      end if;
  end;

  perform public.confirm_finance_account_opening_balance(v_opening_balance_id, true);

  if not exists (
    select 1
    from public.finance_cash_account_balance_summary
    where bank_account_id = v_bank_account_id
      and currency = v_currency
      and is_initialized
      and opening_balance_amount = 100000.00::numeric
      and current_balance = 100000.00::numeric
  ) then
    raise exception 'Confirmed Opening Balance did not initialize the balance view';
  end if;

  begin
    update public.finance_account_opening_balances
    set note = 'ROLLBACK-ONLY-TAMPER'
    where id = v_opening_balance_id;
    raise exception 'Confirmed Opening Balance was unexpectedly mutable';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'Confirmed, Superseded, or Cancelled Opening Balance evidence is immutable' then
        raise;
      end if;
  end;

  select public.create_finance_cash_transaction_draft(
    v_cutoff + interval '2 hours',
    'inflow',
    'manual_inflow',
    v_bank_account_id,
    10000.00,
    v_currency,
    'ROLLBACK-INFLOW',
    'Rollback-only inflow',
    null
  ) into v_inflow_id;
  perform public.confirm_finance_cash_transaction(v_inflow_id);

  select public.create_finance_cash_transaction_draft(
    v_cutoff + interval '3 hours',
    'outflow',
    'manual_outflow',
    v_bank_account_id,
    4000.00,
    v_currency,
    'ROLLBACK-OUTFLOW',
    'Rollback-only outflow',
    null
  ) into v_outflow_id;
  perform public.confirm_finance_cash_transaction(v_outflow_id);

  if not exists (
    select 1
    from public.finance_cash_account_balance_summary
    where bank_account_id = v_bank_account_id
      and currency = v_currency
      and confirmed_inflow_after_opening = 10000.00::numeric
      and confirmed_outflow_after_opening = 4000.00::numeric
      and current_balance = 106000.00::numeric
  ) then
    raise exception 'Confirmed Cash movements did not reconcile through the balance view';
  end if;

  begin
    update public.finance_cash_transactions
    set note = 'ROLLBACK-ONLY-TAMPER'
    where id = v_inflow_id;
    raise exception 'Confirmed Cash Transaction was unexpectedly mutable';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'Confirmed or Cancelled Finance Cash Transactions are immutable' then
        raise;
      end if;
  end;

  select public.create_finance_cash_transaction_draft(
    v_cutoff + interval '4 hours',
    'outflow',
    'other',
    v_bank_account_id,
    500.00,
    v_currency,
    'ROLLBACK-CANCELLED',
    'Rollback-only cancelled Draft',
    null
  ) into v_cancelled_cash_id;
  perform public.cancel_finance_cash_transaction_draft(
    v_cancelled_cash_id,
    'Rollback-only cancellation test'
  );

  if not exists (
    select 1
    from public.finance_cash_account_balance_summary
    where bank_account_id = v_bank_account_id
      and currency = v_currency
      and current_balance = 106000.00::numeric
  ) then
    raise exception 'Cancelled Cash Draft unexpectedly affected the balance view';
  end if;

  select public.create_finance_cash_transaction_draft(
    v_cutoff,
    'inflow',
    'other',
    v_bank_account_id,
    250.00,
    v_currency,
    'ROLLBACK-BEFORE-CUTOVER',
    'Rollback-only cutoff test',
    null
  ) into v_before_cutoff_id;

  begin
    perform public.confirm_finance_cash_transaction(v_before_cutoff_id);
    raise exception 'Cash at the Opening Balance cutoff was unexpectedly accepted';
  exception
    when raise_exception then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER' then
        raise;
      end if;
  end;

  perform public.cancel_finance_cash_transaction_draft(
    v_before_cutoff_id,
    'Rollback-only cutoff rejection cleanup'
  );

  foreach v_reserved_type in array array['customer_payment', 'expense_claim', 'transfer', 'reversal']
  loop
    begin
      perform public.create_finance_cash_transaction_draft(
        v_cutoff + interval '5 hours',
        case when v_reserved_type = 'customer_payment' then 'inflow' else 'outflow' end,
        v_reserved_type,
        v_bank_account_id,
        100.00,
        v_currency,
        'ROLLBACK-RESERVED-TYPE',
        'Rollback-only reserved-type test',
        null
      );
      raise exception 'Reserved Cash Transaction type % was unexpectedly accepted', v_reserved_type;
    exception
      when raise_exception then
        get stacked diagnostics v_error_message = message_text;
        if v_error_message <> 'FINANCE_CASH_MANUAL_TYPE_REQUIRED' then
          raise;
        end if;
    end;
  end loop;

  select public.create_finance_account_opening_balance_replacement_draft(
    v_opening_balance_id,
    v_cutoff + interval '30 minutes',
    100500.00,
    'ROLLBACK-ONLY-REPLACEMENT-EVIDENCE',
    'Rollback-only supersession test'
  ) into v_replacement_opening_balance_id;
  perform public.confirm_finance_account_opening_balance(
    v_replacement_opening_balance_id,
    true
  );

  if not exists (
    select 1
    from public.finance_account_opening_balances as replacement
    join public.finance_account_opening_balances as prior
      on prior.id = replacement.supersedes_opening_balance_id
    where replacement.id = v_replacement_opening_balance_id
      and replacement.status = 'confirmed'
      and prior.id = v_opening_balance_id
      and prior.status = 'superseded'
  ) or not exists (
    select 1
    from public.finance_cash_account_balance_summary
    where bank_account_id = v_bank_account_id
      and currency = v_currency
      and opening_balance_id = v_replacement_opening_balance_id
      and current_balance = 106500.00::numeric
  ) then
    raise exception 'Opening Balance replacement did not supersede atomically';
  end if;

  select public.create_finance_account_opening_balance_replacement_draft(
    v_replacement_opening_balance_id,
    v_cutoff + interval '45 minutes',
    100600.00,
    'ROLLBACK-ONLY-CANCELLED-REPLACEMENT',
    null
  ) into v_cancelled_replacement_id;
  perform public.cancel_finance_account_opening_balance_draft(
    v_cancelled_replacement_id,
    'Rollback-only cancelled replacement attempt'
  );

  select public.create_finance_account_opening_balance_replacement_draft(
    v_replacement_opening_balance_id,
    v_cutoff + interval '50 minutes',
    100700.00,
    'ROLLBACK-ONLY-SECOND-REPLACEMENT',
    null
  ) into v_second_replacement_id;
  perform public.cancel_finance_account_opening_balance_draft(
    v_second_replacement_id,
    'Rollback-only second replacement attempt'
  );
end;
$finance_cash_lifecycle_dry_run_tests$;

set constraints all immediate;

select
  'FINANCE_CASH_TRANSACTION_LIFECYCLE_DRY_RUN' as report_section,
  (select count(*) from public.finance_cash_transactions) as rollback_only_cash_rows,
  (select count(*) from public.finance_account_opening_balances) as rollback_only_opening_rows,
  (select count(*) from public.finance_cash_transaction_audit_events) as rollback_only_cash_audit_rows,
  (select count(*) from public.finance_account_opening_balance_audit_events) as rollback_only_opening_audit_rows,
  current_setting('vp_cash_lifecycle_dry_run.legacy_ledger_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
    from public.finance_company_ledger as ledger_record
  ) as legacy_ledger_content_unchanged,
  current_setting('vp_cash_lifecycle_dry_run.payment_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
    from public.finance_payments as payment_record
  ) as payment_content_unchanged,
  current_setting('vp_cash_lifecycle_dry_run.compensation_fingerprint') = (
    select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
    from public.finance_compensation_batches as compensation_record
  ) as compensation_content_unchanged,
  (
    (select count(*) from public.finance_cash_transactions) = 5
    and (select count(*) from public.finance_account_opening_balances) = 4
    and (select count(*) from public.finance_cash_transaction_audit_events) = 10
    and (select count(*) from public.finance_account_opening_balance_audit_events) = 9
    and exists (
      select 1
      from public.finance_cash_account_balance_summary
      where bank_account_id = selected_bank.v_bank_account_id
    )
    and current_setting('vp_cash_lifecycle_dry_run.legacy_ledger_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(ledger_record) order by ledger_record.id)::text, '[]'))
      from public.finance_company_ledger as ledger_record
    )
    and current_setting('vp_cash_lifecycle_dry_run.payment_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(payment_record) order by payment_record.id)::text, '[]'))
      from public.finance_payments as payment_record
    )
    and current_setting('vp_cash_lifecycle_dry_run.compensation_fingerprint') = (
      select md5(coalesce(jsonb_agg(to_jsonb(compensation_record) order by compensation_record.id)::text, '[]'))
      from public.finance_compensation_batches as compensation_record
    )
  ) as finance_cash_transaction_lifecycle_dry_run_pass
from (
  select id as v_bank_account_id
  from public.finance_bank_accounts
  where is_active = true
  order by short_name, id
  limit 1
) as selected_bank;

rollback;

select
  'FINANCE_CASH_TRANSACTION_LIFECYCLE_DRY_RUN_ROLLBACK' as report_section,
  (select count(*) from public.finance_cash_transactions) as cash_transaction_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balances) as opening_balance_rows_after_rollback,
  (select count(*) from public.finance_cash_transaction_audit_events) as cash_audit_rows_after_rollback,
  (select count(*) from public.finance_account_opening_balance_audit_events) as opening_audit_rows_after_rollback,
  (select count(*) from public.finance_company_ledger) as legacy_ledger_rows_after_rollback,
  (select count(*) from public.finance_compensation_batches) as compensation_rows_after_rollback,
  (select count(*) from public.finance_payments) as payment_rows_after_rollback_observability,
  (
    (select count(*) from public.finance_cash_transactions) = 0
    and (select count(*) from public.finance_account_opening_balances) = 0
    and (select count(*) from public.finance_cash_transaction_audit_events) = 0
    and (select count(*) from public.finance_account_opening_balance_audit_events) = 0
    and (select count(*) from public.finance_company_ledger) = 267
    and (select count(*) from public.finance_compensation_batches) = 33
    and to_regprocedure(
      'public.create_finance_account_opening_balance_draft(uuid,text,timestamp with time zone,numeric,text,text)'
    ) is null
    and to_regprocedure('public.confirm_finance_cash_transaction(uuid)') is null
  ) as finance_cash_transaction_lifecycle_rollback_cleanup_pass;
