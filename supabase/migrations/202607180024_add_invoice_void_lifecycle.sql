-- Atomic Issued Invoice -> Voided lifecycle with source installment reopening.

do $invoice_void_preflight$
begin
  if to_regclass('public.finance_invoices') is null
    or to_regclass('public.finance_invoice_audit_events') is null
    or to_regclass('public.finance_invoice_installment_allocations') is null
    or to_regclass('public.finance_billing_plans') is null
    or to_regclass('public.finance_billing_installments') is null
    or to_regclass('public.finance_billing_installment_audit_events') is null
    or to_regclass('public.finance_payments') is null
    or to_regclass('public.finance_payment_invoice_allocations') is null
    or to_regclass('public.finance_invoice_settlement_summary') is null
    or to_regprocedure('public.validate_finance_invoice_integrity(uuid)') is null
    or to_regprocedure('public.validate_finance_invoice_payment_settlement(uuid)') is null
    or to_regprocedure('public.issue_finance_invoice(uuid,boolean)') is null
    or to_regprocedure('public.cancel_finance_invoice_draft(uuid,text)') is null
    or to_regprocedure('public.current_user_can_manage_finance_quotations()') is null
  then
    raise exception 'Invoice Void lifecycle requires Migrations 017 through 023';
  end if;

  if to_regprocedure('public.assert_finance_invoice_has_no_void_dependencies(uuid)') is not null
    or to_regprocedure('public.void_finance_invoice(uuid,text,boolean)') is not null
  then
    raise exception 'Invoice Void lifecycle functions already exist; inspect partial Production state';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.finance_invoices'::regclass
      and conname = 'finance_invoices_document_status_check'
      and pg_get_constraintdef(oid) like '%voided%'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'voided_at'
      and data_type = 'timestamp with time zone'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'voided_by_user_id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'finance_invoices'
      and column_name = 'void_reason'
      and data_type = 'text'
  ) then
    raise exception 'Invoice Void status or metadata contract is incompatible';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.finance_invoice_audit_events'::regclass
      and conname = 'finance_invoice_audit_events_type_check'
      and pg_get_constraintdef(oid) like '%voided%'
  ) then
    raise exception 'Invoice audit events do not support the voided event type';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.finance_billing_installment_audit_events'::regclass
      and conname = 'finance_billing_installment_audit_events_type_check'
  ) then
    raise exception 'Billing Installment audit-event constraint is missing';
  end if;
end;
$invoice_void_preflight$;

alter table public.finance_billing_installment_audit_events
  drop constraint finance_billing_installment_audit_events_type_check;

alter table public.finance_billing_installment_audit_events
  add constraint finance_billing_installment_audit_events_type_check
  check (
    event_type in (
      'readiness_confirmed',
      'readiness_reset',
      'cancelled',
      'invoice_voided_reopened'
    )
  );

create or replace function public.assert_finance_invoice_has_no_void_dependencies(
  p_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $invoice_void_dependency_guard$
declare
  v_dependency record;
  v_exists boolean;
begin
  if p_invoice_id is null then
    raise exception 'Invoice is required for downstream dependency validation';
  end if;

  -- Future downstream migrations must retain or extend this conservative
  -- registry before exposing Invoice-linked documents. A recognized reference
  -- blocks Void until that module provides a coordinated lifecycle contract.
  for v_dependency in
    select *
    from (
      values
        ('finance_receipts', 'invoice_id'),
        ('finance_receipts', 'source_invoice_id'),
        ('finance_receipt_invoice_allocations', 'invoice_id'),
        ('finance_tax_invoices', 'invoice_id'),
        ('finance_tax_invoices', 'source_invoice_id'),
        ('finance_credit_notes', 'invoice_id'),
        ('finance_credit_notes', 'source_invoice_id'),
        ('finance_invoice_credit_note_allocations', 'invoice_id'),
        ('finance_company_ledger', 'source_invoice_id'),
        ('finance_invoice_ledger_postings', 'invoice_id'),
        ('finance_revenue_allocations', 'invoice_id'),
        ('finance_revenue_allocations', 'source_invoice_id'),
        ('finance_compensation_batches', 'source_invoice_id')
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
      using p_invoice_id;

      if v_exists then
        raise exception 'Invoice has a downstream document dependency and cannot be voided';
      end if;
    end if;
  end loop;
end;
$invoice_void_dependency_guard$;

create or replace function public.void_finance_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $void_invoice$
declare
  v_invoice public.finance_invoices%rowtype;
  v_voided_invoice public.finance_invoices%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_voided_at timestamptz := now();
  v_actor_email text;
  v_actor_name text;
  v_draft_payment_count integer;
  v_confirmed_payment_count integer;
  v_confirmed_settlement numeric(14, 2);
  v_plan_reopened boolean := false;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to void Invoice';
  end if;
  if p_invoice_id is null then
    raise exception 'Issued Invoice is required';
  end if;
  if v_reason is null then
    raise exception 'Invoice Void reason is required';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'Invoice Void reason is too long';
  end if;
  if p_acknowledged is distinct from true then
    raise exception 'Invoice Void acknowledgement is required';
  end if;

  -- Invoice is the serialization boundary shared with Payment creation and
  -- confirmation. Payment rows are inspected after this lock without taking
  -- the opposite Payment -> Invoice lock order used by existing Payment RPCs.
  select * into v_invoice
  from public.finance_invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.document_status <> 'issued' then
    raise exception 'Only an Issued Invoice can be voided';
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_invoice.billing_plan_id
  for update;

  select * into v_installment
  from public.finance_billing_installments
  where id = v_invoice.primary_billing_installment_id
  for update;

  if v_plan.id is null
    or v_installment.id is null
    or v_installment.billing_plan_id <> v_plan.id
    or v_plan.id <> v_invoice.billing_plan_id
  then
    raise exception 'Invoice source Billing Plan or Installment lineage is inconsistent';
  end if;
  if v_plan.status not in ('active', 'completed') then
    raise exception 'Invoice source Billing Plan is not eligible for reopening';
  end if;
  if v_installment.status <> 'invoiced' then
    raise exception 'Invoice source Billing Installment is not invoiced';
  end if;
  if v_installment.readiness_event_date is null
    or v_installment.ready_to_invoice_at is null
    or v_installment.readiness_confirmed_at is null
    or v_installment.readiness_confirmed_by_user_id is null
    or v_installment.readiness_evidence_json is null
    or v_installment.readiness_evidence_json = '{}'::jsonb
  then
    raise exception 'Invoice source Billing Installment readiness evidence is incomplete';
  end if;

  perform public.validate_finance_invoice_integrity(v_invoice.id);

  select
    (count(*) filter (where payment.status = 'draft'))::integer,
    (count(*) filter (where payment.status = 'confirmed'))::integer
  into
    v_draft_payment_count,
    v_confirmed_payment_count
  from public.finance_payment_invoice_allocations as allocation
  join public.finance_payments as payment on payment.id = allocation.payment_id
  where allocation.invoice_id = v_invoice.id;

  select settlement.economically_settled_amount
  into v_confirmed_settlement
  from public.finance_invoice_settlement_summary as settlement
  where settlement.invoice_id = v_invoice.id;

  if v_confirmed_settlement is null then
    raise exception 'Invoice settlement summary is unavailable';
  end if;

  if v_draft_payment_count > 0 then
    raise exception 'Invoice has an active Payment Draft that must be cancelled before Void';
  end if;
  if v_confirmed_payment_count > 0 then
    raise exception 'Invoice has a Confirmed Payment that must be reversed before Void';
  end if;
  if v_confirmed_settlement <> 0 then
    raise exception 'Invoice settlement must be zero before Void';
  end if;

  perform public.assert_finance_invoice_has_no_void_dependencies(v_invoice.id);

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  update public.finance_invoices
  set
    document_status = 'voided',
    voided_at = v_voided_at,
    voided_by_user_id = auth.uid(),
    void_reason = v_reason,
    updated_by_user_id = auth.uid(),
    updated_at = v_voided_at
  where id = v_invoice.id;

  select * into v_voided_invoice
  from public.finance_invoices
  where id = v_invoice.id;

  if v_voided_invoice.invoice_no is distinct from v_invoice.invoice_no
    or v_voided_invoice.issue_date is distinct from v_invoice.issue_date
    or v_voided_invoice.issued_at is distinct from v_invoice.issued_at
    or v_voided_invoice.issued_by_user_id is distinct from v_invoice.issued_by_user_id
    or v_voided_invoice.issued_snapshot_json is distinct from v_invoice.issued_snapshot_json
    or v_voided_invoice.payment_destination_bank_account_id is distinct from v_invoice.payment_destination_bank_account_id
    or v_voided_invoice.payment_destination_snapshot_json is distinct from v_invoice.payment_destination_snapshot_json
    or v_voided_invoice.amount_before_vat is distinct from v_invoice.amount_before_vat
    or v_voided_invoice.vat_amount is distinct from v_invoice.vat_amount
    or v_voided_invoice.total_amount is distinct from v_invoice.total_amount
    or v_voided_invoice.seller_snapshot_json is distinct from v_invoice.seller_snapshot_json
    or v_voided_invoice.customer_snapshot_json is distinct from v_invoice.customer_snapshot_json
    or v_voided_invoice.matter_snapshot_json is distinct from v_invoice.matter_snapshot_json
    or v_voided_invoice.source_snapshot_json is distinct from v_invoice.source_snapshot_json
  then
    raise exception 'Invoice Void must preserve the original issued document evidence';
  end if;

  update public.finance_billing_installments
  set
    status = 'ready_to_invoice',
    invoiced_at = null,
    updated_by_user_id = auth.uid(),
    updated_at = v_voided_at
  where id = v_installment.id;

  if v_plan.status = 'completed' then
    update public.finance_billing_plans
    set
      status = 'active',
      updated_by_user_id = auth.uid(),
      updated_at = v_voided_at
    where id = v_plan.id;
    v_plan_reopened := true;
  end if;

  insert into public.finance_invoice_audit_events (
    invoice_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name,
    created_at
  ) values (
    v_invoice.id,
    'voided',
    jsonb_build_object(
      'schema_version', 1,
      'reason', v_reason,
      'voided_at', v_voided_at,
      'invoice_no', v_invoice.invoice_no,
      'from_status', 'issued',
      'to_status', 'voided',
      'source_billing_plan_id', v_plan.id,
      'source_billing_installment_id', v_installment.id,
      'installment_status_changed_from', 'invoiced',
      'installment_status_changed_to', 'ready_to_invoice',
      'billing_plan_status_changed_from', v_plan.status,
      'billing_plan_status_changed_to', case when v_plan_reopened then 'active' else v_plan.status end,
      'replacement_invoice_number_reused', false,
      'payment_cancelled', false,
      'payment_reversed', false,
      'ledger_changed', false,
      'compensation_changed', false
    ),
    auth.uid(),
    v_actor_email,
    v_actor_name,
    v_voided_at
  );

  insert into public.finance_billing_installment_audit_events (
    billing_installment_id,
    billing_plan_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name,
    created_at
  ) values (
    v_installment.id,
    v_plan.id,
    'invoice_voided_reopened',
    jsonb_build_object(
      'schema_version', 1,
      'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no,
      'invoice_voided_at', v_voided_at,
      'from_status', 'invoiced',
      'to_status', 'ready_to_invoice',
      'readiness_evidence_preserved', true,
      'billing_plan_reopened', v_plan_reopened
    ),
    auth.uid(),
    v_actor_email,
    v_actor_name,
    v_voided_at
  );

  perform public.validate_finance_invoice_integrity(v_invoice.id);
  perform public.validate_finance_invoice_payment_settlement(v_invoice.id);

  return v_invoice.id;
end;
$void_invoice$;

revoke all on function public.assert_finance_invoice_has_no_void_dependencies(uuid)
  from public, anon, authenticated;

revoke all on function public.void_finance_invoice(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.void_finance_invoice(uuid,text,boolean)
  to authenticated;

comment on function public.assert_finance_invoice_has_no_void_dependencies(uuid) is
  'Internal future-aware guard that blocks Invoice Void when a recognized downstream document reference exists.';
comment on function public.void_finance_invoice(uuid,text,boolean) is
  'Atomically voids one Issued Invoice with zero effective settlement, preserves its issued history, and reopens the source installment for a replacement Invoice.';
