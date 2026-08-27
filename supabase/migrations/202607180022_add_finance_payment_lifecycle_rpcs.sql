-- Phase 5B: controlled Payment Draft, confirmation, cancellation, and reversal RPCs.
-- This migration creates no Payment and performs no Ledger, Compensation,
-- Receipt, Tax Invoice, or other downstream business-data write.

do $payment_lifecycle_preflight$
begin
  if to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_payment_invoice_allocations') is null
    or to_regclass('public.finance_payment_audit_events') is null
    or to_regclass('public.finance_invoice_settlement_summary') is null
    or to_regprocedure('public.validate_finance_payment_integrity(uuid)') is null
    or to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is null
  then
    raise exception 'Payment lifecycle RPCs require Migration 021';
  end if;

  if (select count(*) from public.finance_payments) <> 0 then
    raise exception 'Phase 5B must be reviewed before any Production Payment exists';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'active'
      and data_type = 'boolean'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'role'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_bank_accounts'
      and column_name = 'is_active'
      and data_type = 'boolean'
  ) then
    raise exception 'Payment lifecycle permission or bank-account source contract is incompatible';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name in (
        'can_manage_finance_payments',
        'can_confirm_finance_payments',
        'can_reverse_finance_payments'
      )
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_payments'
      and column_name = 'draft_origin_invoice_id'
  ) then
    raise exception 'Payment lifecycle schema fields already exist; inspect partial Production state';
  end if;

  if to_regprocedure('public.current_user_can_view_finance_payments()') is not null
    or to_regprocedure('public.current_user_can_manage_finance_payments()') is not null
    or to_regprocedure('public.current_user_can_confirm_finance_payments()') is not null
    or to_regprocedure('public.current_user_can_reverse_finance_payments()') is not null
    or to_regprocedure('public.protect_finance_payment_permission_fields()') is not null
    or to_regprocedure('public.record_finance_payment_audit_event(uuid,text,jsonb)') is not null
    or to_regprocedure('public.assert_finance_payment_has_no_downstream_dependencies(uuid)') is not null
    or to_regprocedure('public.create_finance_payment_draft_from_invoice(uuid)') is not null
    or to_regprocedure('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)') is not null
    or to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is not null
    or to_regprocedure('public.cancel_finance_payment_draft(uuid,text)') is not null
    or to_regprocedure('public.reverse_finance_payment(uuid,text)') is not null
  then
    raise exception 'Payment lifecycle functions already exist; inspect partial Production state';
  end if;

  if to_regclass('public.uq_finance_payments_open_draft_origin_invoice') is not null
    or to_regclass('public.idx_finance_payments_draft_origin_invoice') is not null
    or exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.user_profiles'::regclass
        and tgname = 'protect_finance_payment_permission_fields'
        and not tgisinternal
    )
  then
    raise exception 'Payment lifecycle index or trigger names already exist; inspect partial Production state';
  end if;
end;
$payment_lifecycle_preflight$;

alter table public.user_profiles
  add column can_manage_finance_payments boolean not null default false,
  add column can_confirm_finance_payments boolean not null default false,
  add column can_reverse_finance_payments boolean not null default false;

alter table public.finance_payments
  add column draft_origin_invoice_id uuid null
    references public.finance_invoices(id) on delete restrict;

create or replace function public.protect_finance_payment_permission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $payment_permission_guard$
begin
  if not exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and role = 'admin'
  ) then
    raise exception 'Only an active Admin can change Payment authority';
  end if;
  return new;
end;
$payment_permission_guard$;

create trigger protect_finance_payment_permission_fields
before update of
  can_manage_finance_payments,
  can_confirm_finance_payments,
  can_reverse_finance_payments
on public.user_profiles
for each row execute function public.protect_finance_payment_permission_fields();

create unique index uq_finance_payments_open_draft_origin_invoice
on public.finance_payments (draft_origin_invoice_id)
where status = 'draft' and draft_origin_invoice_id is not null;

create index idx_finance_payments_draft_origin_invoice
on public.finance_payments (draft_origin_invoice_id)
where draft_origin_invoice_id is not null;

create or replace function public.current_user_can_view_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_view_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (
        role in ('admin', 'partner')
        or can_manage_finance_payments
        or can_confirm_finance_payments
        or can_reverse_finance_payments
      )
  );
$payment_view_permission$;

create or replace function public.current_user_can_manage_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_manage_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_manage_finance_payments)
  );
$payment_manage_permission$;

create or replace function public.current_user_can_confirm_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_confirm_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_confirm_finance_payments)
  );
$payment_confirm_permission$;

create or replace function public.current_user_can_reverse_finance_payments()
returns boolean
language sql
security definer
set search_path = public
as $payment_reverse_permission$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or can_reverse_finance_payments)
  );
$payment_reverse_permission$;

drop policy "finance managers select payments" on public.finance_payments;
drop policy "finance managers select payment invoice allocations" on public.finance_payment_invoice_allocations;
drop policy "finance managers select payment evidence" on public.finance_payment_evidence;
drop policy "finance managers select payment audit events" on public.finance_payment_audit_events;

create policy "finance managers select payments"
on public.finance_payments for select
using (public.current_user_can_view_finance_payments());

create policy "finance managers select payment invoice allocations"
on public.finance_payment_invoice_allocations for select
using (public.current_user_can_view_finance_payments());

create policy "finance managers select payment evidence"
on public.finance_payment_evidence for select
using (public.current_user_can_view_finance_payments());

create policy "finance managers select payment audit events"
on public.finance_payment_audit_events for select
using (public.current_user_can_view_finance_payments());

create or replace function public.record_finance_payment_audit_event(
  p_payment_id uuid,
  p_event_type text,
  p_event_payload_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $payment_audit_writer$
declare
  v_actor_email text;
  v_actor_name text;
begin
  if p_payment_id is null then
    raise exception 'Payment audit requires a Payment';
  end if;
  if jsonb_typeof(coalesce(p_event_payload_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Payment audit payload must be an object';
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

  insert into public.finance_payment_audit_events (
    payment_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    p_payment_id,
    p_event_type,
    coalesce(p_event_payload_json, '{}'::jsonb),
    auth.uid(),
    v_actor_email,
    v_actor_name
  );
end;
$payment_audit_writer$;

create or replace function public.assert_finance_payment_has_no_downstream_dependencies(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $payment_downstream_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  -- Future downstream migrations must retain or extend this conservative
  -- registry. Any recognized source row blocks reversal until that module
  -- provides its own coordinated reversal contract.
  for v_dependency in
    select *
    from (
      values
        ('finance_receipts', 'payment_id'),
        ('finance_receipts', 'source_payment_id'),
        ('finance_receipt_payment_allocations', 'payment_id'),
        ('finance_tax_invoices', 'payment_id'),
        ('finance_tax_invoices', 'source_payment_id'),
        ('finance_company_ledger', 'source_payment_id'),
        ('finance_payment_ledger_postings', 'payment_id'),
        ('finance_revenue_allocations', 'payment_id'),
        ('finance_revenue_allocations', 'source_payment_id'),
        ('finance_compensation_batches', 'source_payment_id')
    ) as dependency(table_name, column_name)
  loop
    if to_regclass('public.' || v_dependency.table_name) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = v_dependency.table_name
          and column_name = v_dependency.column_name
      )
    then
      execute format(
        'select exists (select 1 from public.%I where %I = $1)',
        v_dependency.table_name,
        v_dependency.column_name
      )
      into v_exists
      using p_payment_id;

      if v_exists then
        raise exception 'Payment has downstream records and requires coordinated reversal';
      end if;
    end if;
  end loop;
end;
$payment_downstream_guard$;

create or replace function public.create_finance_payment_draft_from_invoice(
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_payment_draft$
declare
  v_invoice public.finance_invoices%rowtype;
  v_existing_payment_id uuid;
  v_payment_id uuid;
  v_confirmed_settlement numeric(14, 2);
  v_active_reserved_settlement numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_available numeric(14, 2);
begin
  if not public.current_user_can_manage_finance_payments() then
    raise exception 'Not allowed to create Payment Draft';
  end if;
  if p_invoice_id is null then
    raise exception 'Issued Invoice is required';
  end if;

  select *
  into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.document_status <> 'issued' then
    raise exception 'Payment Draft requires an Issued Invoice';
  end if;

  select payment.id
  into v_existing_payment_id
  from public.finance_payments as payment
  where payment.draft_origin_invoice_id = v_invoice.id
    and payment.status = 'draft'
  order by payment.created_at, payment.id
  limit 1;

  if v_existing_payment_id is not null then
    return v_existing_payment_id;
  end if;

  select
    coalesce(sum(allocation.settlement_total) filter (where payment.status = 'confirmed'), 0),
    coalesce(sum(allocation.settlement_total) filter (where payment.status in ('draft', 'confirmed')), 0)
  into v_confirmed_settlement, v_active_reserved_settlement
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment on payment.id = allocation.payment_id
  where allocation.invoice_id = v_invoice.id;

  v_outstanding := (v_invoice.total_amount - v_confirmed_settlement)::numeric(14, 2);
  v_available := (v_invoice.total_amount - v_active_reserved_settlement)::numeric(14, 2);

  if v_outstanding <= 0 then
    raise exception 'Invoice is already economically settled';
  end if;
  if v_available <= 0 then
    raise exception 'Invoice outstanding is already reserved by another Payment Draft';
  end if;

  insert into public.finance_payments (
    draft_origin_invoice_id,
    client_id,
    currency,
    cash_amount,
    wht_amount,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_invoice.id,
    v_invoice.client_id,
    v_invoice.currency,
    v_available,
    0,
    auth.uid(),
    auth.uid()
  )
  returning id into v_payment_id;

  insert into public.finance_payment_invoice_allocations (
    payment_id,
    invoice_id,
    cash_allocated,
    wht_credit_allocated,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_payment_id,
    v_invoice.id,
    v_available,
    0,
    auth.uid(),
    auth.uid()
  );

  perform public.record_finance_payment_audit_event(
    v_payment_id,
    'draft_created',
    jsonb_build_object(
      'draft_origin_invoice_id', v_invoice.id,
      'proposed_from_unreserved_outstanding', true,
      'proposed_settlement_amount', v_available,
      'authoritative_settlement_created', false,
      'ledger_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'compensation_created', false
    )
  );

  return v_payment_id;
end;
$create_payment_draft$;

create or replace function public.save_finance_payment_draft(
  p_payment_id uuid,
  p_received_on date,
  p_payment_method text,
  p_receiving_bank_account_id uuid,
  p_receiving_account_reference text,
  p_external_transaction_reference text,
  p_payer_name text,
  p_note text,
  p_cash_amount numeric,
  p_wht_amount numeric,
  p_allocations_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $save_payment_draft$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice record;
  v_invoice_id uuid;
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
  v_account_reference text := nullif(btrim(coalesce(p_receiving_account_reference, '')), '');
  v_transaction_reference text := nullif(btrim(coalesce(p_external_transaction_reference, '')), '');
  v_payer_name text := nullif(btrim(coalesce(p_payer_name, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_allocation_count integer;
  v_distinct_invoice_count integer;
  v_invalid_allocation_count integer;
  v_locked_invoice_count integer := 0;
  v_cash_allocated numeric;
  v_wht_allocated numeric;
  v_other_active_settlement numeric(14, 2);
  v_allocations_unchanged boolean;
begin
  if not public.current_user_can_manage_finance_payments() then
    raise exception 'Not allowed to save Payment Draft';
  end if;
  if p_payment_id is null then
    raise exception 'Payment Draft is required';
  end if;
  if p_cash_amount is null or p_wht_amount is null
    or p_cash_amount < 0 or p_wht_amount < 0
    or p_cash_amount + p_wht_amount <= 0
  then
    raise exception 'Payment settlement must be positive and contain non-negative cash and WHT amounts';
  end if;
  if p_cash_amount <> round(p_cash_amount, 2)
    or p_wht_amount <> round(p_wht_amount, 2)
  then
    raise exception 'Payment amounts must use no more than two decimal places';
  end if;
  if v_method is not null
    and v_method not in ('bank_transfer', 'cash', 'cheque', 'card_or_gateway', 'other')
  then
    raise exception 'Payment method is invalid';
  end if;
  if p_allocations_json is null
    or jsonb_typeof(p_allocations_json) <> 'array'
    or jsonb_array_length(p_allocations_json) = 0
    or jsonb_array_length(p_allocations_json) > 100
  then
    raise exception 'Payment allocations must be a non-empty array of no more than 100 Invoices';
  end if;

  select
    count(*)::integer,
    count(distinct allocation.invoice_id)::integer,
    count(*) filter (
      where allocation.invoice_id is null
        or allocation.cash_allocated is null
        or allocation.wht_credit_allocated is null
        or allocation.cash_allocated < 0
        or allocation.wht_credit_allocated < 0
        or allocation.cash_allocated + allocation.wht_credit_allocated <= 0
        or allocation.cash_allocated <> round(allocation.cash_allocated, 2)
        or allocation.wht_credit_allocated <> round(allocation.wht_credit_allocated, 2)
    )::integer,
    coalesce(sum(allocation.cash_allocated), 0),
    coalesce(sum(allocation.wht_credit_allocated), 0)
  into
    v_allocation_count,
    v_distinct_invoice_count,
    v_invalid_allocation_count,
    v_cash_allocated,
    v_wht_allocated
  from jsonb_to_recordset(p_allocations_json) as allocation(
    invoice_id uuid,
    cash_allocated numeric,
    wht_credit_allocated numeric
  );

  if v_invalid_allocation_count <> 0
    or v_allocation_count <> v_distinct_invoice_count
  then
    raise exception 'Payment allocations contain invalid or duplicated Invoice rows';
  end if;
  if v_cash_allocated <> p_cash_amount or v_wht_allocated <> p_wht_amount then
    raise exception 'Payment allocations must exactly reconcile to Payment cash and WHT totals';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment Draft not found';
  end if;
  if v_payment.status <> 'draft' then
    raise exception 'Only a Draft Payment can be saved';
  end if;
  if v_payment.draft_origin_invoice_id is not null and not exists (
    select 1
    from jsonb_to_recordset(p_allocations_json) as allocation(
      invoice_id uuid,
      cash_allocated numeric,
      wht_credit_allocated numeric
    )
    where allocation.invoice_id = v_payment.draft_origin_invoice_id
  ) then
    raise exception 'Payment Draft must retain its origin Invoice allocation';
  end if;

  -- Lock both released and newly proposed Invoice reservations in one stable
  -- order before checking availability or replacing allocation rows.
  for v_invoice_id in
    select invoice_id
    from (
      select allocation.invoice_id
      from public.finance_payment_invoice_allocations as allocation
      where allocation.payment_id = v_payment.id
      union
      select allocation.invoice_id
      from jsonb_to_recordset(p_allocations_json) as allocation(
        invoice_id uuid,
        cash_allocated numeric,
        wht_credit_allocated numeric
      )
    ) as affected_invoice
    order by invoice_id
  loop
    perform 1
    from public.finance_invoices
    where id = v_invoice_id
    for update;
  end loop;

  for v_invoice in
    select
      invoice.id,
      invoice.document_status,
      invoice.client_id,
      invoice.currency,
      invoice.total_amount,
      allocation.cash_allocated,
      allocation.wht_credit_allocated
    from jsonb_to_recordset(p_allocations_json) as allocation(
      invoice_id uuid,
      cash_allocated numeric,
      wht_credit_allocated numeric
    )
    join public.finance_invoices as invoice on invoice.id = allocation.invoice_id
    order by invoice.id
  loop
    v_locked_invoice_count := v_locked_invoice_count + 1;

    if v_invoice.document_status <> 'issued' then
      raise exception 'Payment allocations require Issued Invoices';
    end if;
    if v_invoice.client_id <> v_payment.client_id then
      raise exception 'All Payment allocations must belong to the same Client';
    end if;
    if v_invoice.currency <> v_payment.currency then
      raise exception 'All Payment allocations must use the Payment currency';
    end if;

    select coalesce(sum(existing_allocation.settlement_total), 0)
    into v_other_active_settlement
    from public.finance_payment_invoice_allocations as existing_allocation
    join public.finance_payments as existing_payment
      on existing_payment.id = existing_allocation.payment_id
    where existing_allocation.invoice_id = v_invoice.id
      and existing_allocation.payment_id <> v_payment.id
      and existing_payment.status in ('draft', 'confirmed');

    if v_other_active_settlement
      + v_invoice.cash_allocated
      + v_invoice.wht_credit_allocated
      > v_invoice.total_amount
    then
      raise exception 'Payment allocation exceeds the currently available Invoice outstanding amount';
    end if;
  end loop;

  if v_locked_invoice_count <> v_allocation_count then
    raise exception 'One or more allocated Invoices do not exist';
  end if;

  select not exists (
    select 1
    from (
      (
        select allocation.invoice_id, allocation.cash_allocated, allocation.wht_credit_allocated
        from public.finance_payment_invoice_allocations as allocation
        where allocation.payment_id = v_payment.id
        except
        select allocation.invoice_id, allocation.cash_allocated, allocation.wht_credit_allocated
        from jsonb_to_recordset(p_allocations_json) as allocation(
          invoice_id uuid,
          cash_allocated numeric,
          wht_credit_allocated numeric
        )
      )
      union all
      (
        select allocation.invoice_id, allocation.cash_allocated, allocation.wht_credit_allocated
        from jsonb_to_recordset(p_allocations_json) as allocation(
          invoice_id uuid,
          cash_allocated numeric,
          wht_credit_allocated numeric
        )
        except
        select allocation.invoice_id, allocation.cash_allocated, allocation.wht_credit_allocated
        from public.finance_payment_invoice_allocations as allocation
        where allocation.payment_id = v_payment.id
      )
    ) as allocation_difference
  ) into v_allocations_unchanged;

  if v_payment.received_on is not distinct from p_received_on
    and v_payment.payment_method is not distinct from v_method
    and v_payment.receiving_bank_account_id is not distinct from p_receiving_bank_account_id
    and v_payment.receiving_account_reference is not distinct from v_account_reference
    and v_payment.external_transaction_reference is not distinct from v_transaction_reference
    and v_payment.payer_name is not distinct from v_payer_name
    and v_payment.note is not distinct from v_note
    and v_payment.cash_amount = p_cash_amount
    and v_payment.wht_amount = p_wht_amount
    and v_allocations_unchanged
  then
    return v_payment.id;
  end if;

  update public.finance_payments
  set
    received_on = p_received_on,
    payment_method = v_method,
    receiving_bank_account_id = p_receiving_bank_account_id,
    receiving_account_reference = v_account_reference,
    external_transaction_reference = v_transaction_reference,
    payer_name = v_payer_name,
    note = v_note,
    cash_amount = p_cash_amount,
    wht_amount = p_wht_amount,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_payment.id;

  delete from public.finance_payment_invoice_allocations
  where payment_id = v_payment.id;

  insert into public.finance_payment_invoice_allocations (
    payment_id,
    invoice_id,
    cash_allocated,
    wht_credit_allocated,
    created_by_user_id,
    updated_by_user_id
  )
  select
    v_payment.id,
    allocation.invoice_id,
    allocation.cash_allocated,
    allocation.wht_credit_allocated,
    auth.uid(),
    auth.uid()
  from jsonb_to_recordset(p_allocations_json) as allocation(
    invoice_id uuid,
    cash_allocated numeric,
    wht_credit_allocated numeric
  );

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'draft_saved',
    jsonb_build_object(
      'cash_amount', p_cash_amount,
      'wht_amount', p_wht_amount,
      'settlement_amount', p_cash_amount + p_wht_amount,
      'allocation_count', v_allocation_count
    )
  );

  return v_payment.id;
end;
$save_payment_draft$;

create or replace function public.confirm_finance_payment(
  p_payment_id uuid,
  p_confirmation_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $confirm_payment$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_allocation_count integer;
begin
  if not public.current_user_can_confirm_finance_payments() then
    raise exception 'Not allowed to confirm Payment';
  end if;
  if coalesce(p_confirmation_acknowledged, false) is not true then
    raise exception 'Explicit Payment confirmation is required';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;
  if v_payment.status = 'confirmed' then
    return v_payment.id;
  end if;
  if v_payment.status <> 'draft' then
    raise exception 'Only a Draft Payment can be confirmed';
  end if;
  if v_payment.received_on is null then
    raise exception 'Actual Payment received date is required';
  end if;
  if v_payment.received_on > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'Actual Payment received date cannot be in the future';
  end if;
  if v_payment.payment_method is null then
    raise exception 'Payment method is required';
  end if;
  if v_payment.settlement_amount <= 0 then
    raise exception 'Payment settlement must be positive';
  end if;
  if v_payment.receiving_bank_account_id is not null and not exists (
    select 1
    from public.finance_bank_accounts
    where id = v_payment.receiving_bank_account_id
      and is_active = true
  ) then
    raise exception 'Selected receiving bank account is not active';
  end if;
  if v_payment.payment_method = 'bank_transfer'
    and v_payment.receiving_bank_account_id is null
  then
    raise exception 'Receiving bank account is required for bank transfer';
  end if;

  select count(*)::integer
  into v_allocation_count
  from public.finance_payment_invoice_allocations
  where payment_id = v_payment.id;

  if v_allocation_count = 0 then
    raise exception 'Payment requires at least one Invoice allocation';
  end if;

  for v_invoice_id in
    select allocation.invoice_id
    from public.finance_payment_invoice_allocations as allocation
    where allocation.payment_id = v_payment.id
    order by allocation.invoice_id
  loop
    perform 1
    from public.finance_invoices
    where id = v_invoice_id
    for update;
  end loop;

  perform public.validate_finance_payment_integrity(v_payment.id);

  update public.finance_payments
  set
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by_user_id = auth.uid(),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_payment.id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'confirmed',
    jsonb_build_object(
      'received_on', v_payment.received_on,
      'payment_method', v_payment.payment_method,
      'cash_amount', v_payment.cash_amount,
      'wht_amount', v_payment.wht_amount,
      'settlement_amount', v_payment.settlement_amount,
      'allocation_count', v_allocation_count,
      'ledger_created', false,
      'receipt_created', false,
      'tax_invoice_created', false,
      'compensation_created', false
    )
  );

  return v_payment.id;
end;
$confirm_payment$;

create or replace function public.cancel_finance_payment_draft(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $cancel_payment_draft$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.current_user_can_manage_finance_payments() then
    raise exception 'Not allowed to cancel Payment Draft';
  end if;
  if v_reason is null then
    raise exception 'Payment cancellation reason is required';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'Payment cancellation reason is too long';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment Draft not found';
  end if;
  if v_payment.status = 'cancelled' then
    return v_payment.id;
  end if;
  if v_payment.status <> 'draft' then
    raise exception 'Only a Draft Payment can be cancelled';
  end if;

  for v_invoice_id in
    select allocation.invoice_id
    from public.finance_payment_invoice_allocations as allocation
    where allocation.payment_id = v_payment.id
    order by allocation.invoice_id
  loop
    perform 1
    from public.finance_invoices
    where id = v_invoice_id
    for update;
  end loop;

  update public.finance_payments
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_user_id = auth.uid(),
    cancel_reason = v_reason,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_payment.id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'cancelled',
    jsonb_build_object(
      'reason', v_reason,
      'ledger_effect', false,
      'authoritative_settlement_created', false
    )
  );

  return v_payment.id;
end;
$cancel_payment_draft$;

create or replace function public.reverse_finance_payment(
  p_payment_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $reverse_payment$
declare
  v_payment public.finance_payments%rowtype;
  v_invoice_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.current_user_can_reverse_finance_payments() then
    raise exception 'Not allowed to reverse Payment';
  end if;
  if v_reason is null then
    raise exception 'Payment reversal reason is required';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'Payment reversal reason is too long';
  end if;

  select *
  into v_payment
  from public.finance_payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'Payment not found';
  end if;
  if v_payment.status = 'reversed' then
    return v_payment.id;
  end if;
  if v_payment.status <> 'confirmed' then
    raise exception 'Only a Confirmed Payment can be reversed';
  end if;

  for v_invoice_id in
    select allocation.invoice_id
    from public.finance_payment_invoice_allocations as allocation
    where allocation.payment_id = v_payment.id
    order by allocation.invoice_id
  loop
    perform 1
    from public.finance_invoices
    where id = v_invoice_id
    for update;
  end loop;

  perform public.assert_finance_payment_has_no_downstream_dependencies(v_payment.id);

  update public.finance_payments
  set
    status = 'reversed',
    reversed_at = now(),
    reversed_by_user_id = auth.uid(),
    reverse_reason = v_reason,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id = v_payment.id;

  perform public.record_finance_payment_audit_event(
    v_payment.id,
    'reversed',
    jsonb_build_object(
      'reason', v_reason,
      'cash_amount', v_payment.cash_amount,
      'wht_amount', v_payment.wht_amount,
      'settlement_amount', v_payment.settlement_amount,
      'negative_payment_created', false,
      'ledger_reversal_created', false,
      'receipt_reversal_created', false,
      'tax_invoice_reversal_created', false,
      'compensation_reversal_created', false
    )
  );

  return v_payment.id;
end;
$reverse_payment$;

revoke all on function public.current_user_can_view_finance_payments()
  from public, anon, authenticated;
revoke all on function public.current_user_can_manage_finance_payments()
  from public, anon, authenticated;
revoke all on function public.current_user_can_confirm_finance_payments()
  from public, anon, authenticated;
revoke all on function public.current_user_can_reverse_finance_payments()
  from public, anon, authenticated;
revoke all on function public.protect_finance_payment_permission_fields()
  from public, anon, authenticated;

grant execute on function public.current_user_can_view_finance_payments()
  to authenticated;
grant execute on function public.current_user_can_manage_finance_payments()
  to authenticated;
grant execute on function public.current_user_can_confirm_finance_payments()
  to authenticated;
grant execute on function public.current_user_can_reverse_finance_payments()
  to authenticated;

revoke all on function public.record_finance_payment_audit_event(uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.assert_finance_payment_has_no_downstream_dependencies(uuid)
  from public, anon, authenticated;

revoke all on function public.create_finance_payment_draft_from_invoice(uuid)
  from public, anon, authenticated;
revoke all on function public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)
  from public, anon, authenticated;
revoke all on function public.confirm_finance_payment(uuid,boolean)
  from public, anon, authenticated;
revoke all on function public.cancel_finance_payment_draft(uuid,text)
  from public, anon, authenticated;
revoke all on function public.reverse_finance_payment(uuid,text)
  from public, anon, authenticated;

grant execute on function public.create_finance_payment_draft_from_invoice(uuid)
  to authenticated;
grant execute on function public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)
  to authenticated;
grant execute on function public.confirm_finance_payment(uuid,boolean)
  to authenticated;
grant execute on function public.cancel_finance_payment_draft(uuid,text)
  to authenticated;
grant execute on function public.reverse_finance_payment(uuid,text)
  to authenticated;

do $payment_lifecycle_security_check$
declare
  v_function_count integer;
  v_owner_count integer;
begin
  select count(*)::integer, count(distinct function_record.proowner)::integer
  into v_function_count, v_owner_count
  from pg_proc as function_record
  where function_record.oid in (
    'public.current_user_can_view_finance_payments()'::regprocedure,
    'public.current_user_can_manage_finance_payments()'::regprocedure,
    'public.current_user_can_confirm_finance_payments()'::regprocedure,
    'public.current_user_can_reverse_finance_payments()'::regprocedure,
    'public.protect_finance_payment_permission_fields()'::regprocedure,
    'public.record_finance_payment_audit_event(uuid,text,jsonb)'::regprocedure,
    'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
    'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure,
    'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
    'public.confirm_finance_payment(uuid,boolean)'::regprocedure,
    'public.cancel_finance_payment_draft(uuid,text)'::regprocedure,
    'public.reverse_finance_payment(uuid,text)'::regprocedure
  );

  if v_function_count <> 12 or v_owner_count <> 1 then
    raise exception 'Payment lifecycle functions must exist under one trusted owner';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.current_user_can_view_finance_payments()'::regprocedure,
      'public.current_user_can_manage_finance_payments()'::regprocedure,
      'public.current_user_can_confirm_finance_payments()'::regprocedure,
      'public.current_user_can_reverse_finance_payments()'::regprocedure,
      'public.protect_finance_payment_permission_fields()'::regprocedure,
      'public.record_finance_payment_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure,
      'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure,
      'public.cancel_finance_payment_draft(uuid,text)'::regprocedure,
      'public.reverse_finance_payment(uuid,text)'::regprocedure
    )
      and (
        not function_record.prosecdef
        or not (
          coalesce(function_record.proconfig, array[]::text[])
          @> array['search_path=public']
        )
      )
  ) then
    raise exception 'Payment lifecycle functions require SECURITY DEFINER with fixed search_path=public';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.current_user_can_view_finance_payments()'::regprocedure,
      'public.current_user_can_manage_finance_payments()'::regprocedure,
      'public.current_user_can_confirm_finance_payments()'::regprocedure,
      'public.current_user_can_reverse_finance_payments()'::regprocedure,
      'public.create_finance_payment_draft_from_invoice(uuid)'::regprocedure,
      'public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)'::regprocedure,
      'public.confirm_finance_payment(uuid,boolean)'::regprocedure,
      'public.cancel_finance_payment_draft(uuid,text)'::regprocedure,
      'public.reverse_finance_payment(uuid,text)'::regprocedure
    )
      and (
        not has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Payment browser API execute grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_proc as function_record
    where function_record.oid in (
      'public.record_finance_payment_audit_event(uuid,text,jsonb)'::regprocedure,
      'public.assert_finance_payment_has_no_downstream_dependencies(uuid)'::regprocedure,
      'public.protect_finance_payment_permission_fields()'::regprocedure
    )
      and (
        has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        or has_function_privilege('anon', function_record.oid, 'EXECUTE')
      )
  ) then
    raise exception 'Payment internal helpers must not be browser-executable';
  end if;
end;
$payment_lifecycle_security_check$;

comment on column public.user_profiles.can_manage_finance_payments is
  'Explicit permission to create, save, and cancel Payment Drafts. Admin remains authorized by role.';

comment on column public.user_profiles.can_confirm_finance_payments is
  'Explicit authority to confirm factual settlement. Partner role alone does not grant this authority.';

comment on column public.user_profiles.can_reverse_finance_payments is
  'Explicit authority to reverse Confirmed Payments. Partner role alone does not grant this authority.';

comment on function public.protect_finance_payment_permission_fields() is
  'Database guard requiring an active Admin for changes to Payment authority fields.';

comment on column public.finance_payments.draft_origin_invoice_id is
  'Idempotent origin for Invoice-started Payment Drafts. It is lineage only and does not limit future multi-Invoice allocation.';

comment on function public.create_finance_payment_draft_from_invoice(uuid) is
  'Creates or returns one open Payment Draft for an Issued Invoice. Proposed outstanding does not count as settlement until explicit confirmation.';

comment on function public.assert_finance_payment_has_no_downstream_dependencies(uuid) is
  'Conservative reversal gate. Future Receipt, Ledger, Revenue Allocation, and Compensation migrations must retain or extend its dependency registry.';
