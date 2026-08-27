-- Phase 4B: human-confirmed Billing Installment readiness. No Invoice is created by this migration.

do $$
begin
  if to_regclass('public.finance_billing_plans') is null
    or to_regclass('public.finance_billing_installments') is null
    or to_regclass('public.finance_invoices') is null
    or to_regprocedure('public.create_finance_invoice_draft_from_installment(uuid)') is null
  then
    raise exception 'Billing Installment readiness requires the Billing Plan and Invoice foundations';
  end if;
end;
$$;

alter table public.finance_billing_installments
  add column readiness_event_date date null,
  add column readiness_confirmed_at timestamptz null,
  add column readiness_confirmed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
  add column readiness_note text null,
  add column readiness_reference text null,
  add column readiness_evidence_json jsonb null;

alter table public.finance_billing_installments
  add constraint finance_billing_installments_readiness_note_check
    check (readiness_note is null or btrim(readiness_note) <> ''),
  add constraint finance_billing_installments_readiness_reference_check
    check (readiness_reference is null or btrim(readiness_reference) <> ''),
  add constraint finance_billing_installments_readiness_evidence_shape_check
    check (readiness_evidence_json is null or jsonb_typeof(readiness_evidence_json) = 'object'),
  add constraint finance_billing_installments_ready_evidence_check
    check (
      status <> 'ready_to_invoice'
      or (
        readiness_event_date is not null
        and ready_to_invoice_at is not null
        and readiness_confirmed_at is not null
        and readiness_confirmed_by_user_id is not null
        and readiness_evidence_json is not null
        and readiness_evidence_json <> '{}'::jsonb
      )
    ) not valid;

create index idx_finance_billing_installments_readiness_event_date
on public.finance_billing_installments (readiness_event_date)
where readiness_event_date is not null;

create table public.finance_billing_installment_audit_events (
  id uuid primary key default gen_random_uuid(),
  billing_installment_id uuid not null references public.finance_billing_installments(id) on delete restrict,
  billing_plan_id uuid not null references public.finance_billing_plans(id) on delete restrict,
  event_type text not null,
  event_payload_json jsonb not null default '{}'::jsonb,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_billing_installment_audit_events_type_check
    check (event_type in ('readiness_confirmed', 'readiness_reset', 'cancelled')),
  constraint finance_billing_installment_audit_events_payload_shape_check
    check (jsonb_typeof(event_payload_json) = 'object')
);

create index idx_finance_billing_installment_audit_events_installment
on public.finance_billing_installment_audit_events (billing_installment_id, created_at desc);

create index idx_finance_billing_installment_audit_events_plan
on public.finance_billing_installment_audit_events (billing_plan_id, created_at desc);

alter table public.finance_billing_installment_audit_events enable row level security;

create policy "finance managers select billing installment audit events"
on public.finance_billing_installment_audit_events for select
using (public.current_user_can_manage_finance_quotations());

revoke all on table public.finance_billing_installment_audit_events from public, anon, authenticated;
grant select on table public.finance_billing_installment_audit_events to authenticated;

create or replace function public.confirm_finance_billing_installment_ready(
  p_installment_id uuid,
  p_readiness_event_date date,
  p_human_confirmed boolean,
  p_note text default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing_plan_id uuid;
  v_plan public.finance_billing_plans%rowtype;
  v_installment public.finance_billing_installments%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_confirmed_at timestamptz := now();
  v_actor_email text;
  v_actor_name text;
  v_evidence jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to confirm Billing Installment readiness';
  end if;
  if p_installment_id is null then
    raise exception 'Billing Installment is required';
  end if;
  if p_human_confirmed is distinct from true then
    raise exception 'Human readiness confirmation is required';
  end if;
  if p_readiness_event_date is null then
    raise exception 'Actual readiness event date is required';
  end if;
  if p_readiness_event_date > (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'Readiness event date cannot be in the future';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'Readiness note is too long';
  end if;
  if length(coalesce(v_reference, '')) > 500 then
    raise exception 'Readiness reference is too long';
  end if;

  select billing_plan_id into v_billing_plan_id
  from public.finance_billing_installments
  where id = p_installment_id;
  if v_billing_plan_id is null then
    raise exception 'Billing Installment not found';
  end if;

  select * into v_plan
  from public.finance_billing_plans
  where id = v_billing_plan_id
  for update;
  if v_plan.id is null then
    raise exception 'Billing Plan not found';
  end if;

  select * into v_installment
  from public.finance_billing_installments
  where id = p_installment_id
  for update;
  if v_installment.id is null or v_installment.billing_plan_id <> v_plan.id then
    raise exception 'Billing Installment does not belong to the locked Billing Plan';
  end if;
  if v_plan.status <> 'active' then
    raise exception 'Billing Installment readiness requires an active Billing Plan';
  end if;

  if v_installment.status = 'ready_to_invoice' then
    if v_installment.readiness_event_date is null
      or v_installment.readiness_confirmed_at is null
      or v_installment.readiness_confirmed_by_user_id is null
      or v_installment.readiness_evidence_json is null
      or v_installment.readiness_evidence_json = '{}'::jsonb
    then
      raise exception 'Billing Installment readiness evidence is incomplete';
    end if;
    return v_installment.id;
  end if;

  if v_installment.status <> 'pending' then
    raise exception 'Only a pending Billing Installment can be confirmed ready';
  end if;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  v_evidence := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'human_confirmed', true,
    'readiness_event_date', p_readiness_event_date,
    'recorded_at', v_confirmed_at,
    'recorded_by_user_id', auth.uid(),
    'note', v_note,
    'reference', v_reference,
    'source_trigger', jsonb_strip_nulls(jsonb_build_object(
      'trigger_type', v_installment.trigger_type,
      'trigger_description', v_installment.trigger_description,
      'due_date', v_installment.due_date,
      'milestone_code', v_installment.milestone_code,
      'recurring_period_start', v_installment.recurring_period_start,
      'recurring_period_end', v_installment.recurring_period_end
    ))
  ));

  update public.finance_billing_installments
  set
    status = 'ready_to_invoice',
    ready_to_invoice_at = v_confirmed_at,
    readiness_event_date = p_readiness_event_date,
    readiness_confirmed_at = v_confirmed_at,
    readiness_confirmed_by_user_id = auth.uid(),
    readiness_note = v_note,
    readiness_reference = v_reference,
    readiness_evidence_json = v_evidence,
    updated_by_user_id = auth.uid(),
    updated_at = v_confirmed_at
  where id = v_installment.id;

  insert into public.finance_billing_installment_audit_events (
    billing_installment_id,
    billing_plan_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    v_installment.id,
    v_plan.id,
    'readiness_confirmed',
    v_evidence,
    auth.uid(),
    v_actor_email,
    v_actor_name
  );

  return v_installment.id;
end;
$$;

-- Preserve cancellation and Admin reset behavior, but readiness itself must use the evidence RPC.
create or replace function public.set_finance_billing_installment_status(
  p_installment_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installment public.finance_billing_installments%rowtype;
  v_billing_plan_id uuid;
  v_plan_status text;
  v_next_status text := lower(btrim(coalesce(p_next_status, '')));
  v_actor_email text;
  v_actor_name text;
  v_event_type text;
  v_event_payload jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance billing installment status';
  end if;

  select billing_plan_id into v_billing_plan_id
  from public.finance_billing_installments
  where id = p_installment_id;
  if v_billing_plan_id is null then
    raise exception 'Billing installment not found';
  end if;

  select status into v_plan_status
  from public.finance_billing_plans
  where id = v_billing_plan_id
  for update;
  if v_plan_status is null then
    raise exception 'Billing plan not found';
  end if;

  select * into v_installment
  from public.finance_billing_installments
  where id = p_installment_id
  for update;

  if v_plan_status <> 'active' then
    raise exception 'Billing installment status can only change while its billing plan is active';
  end if;
  if v_next_status = 'ready_to_invoice' then
    raise exception 'Use readiness confirmation to mark a Billing Installment ready';
  end if;
  if not (
    (v_installment.status = 'pending' and v_next_status = 'cancelled')
    or (v_installment.status = 'ready_to_invoice' and v_next_status in ('pending', 'cancelled'))
  ) then
    raise exception 'Invalid finance billing installment status transition';
  end if;
  if v_installment.status = 'ready_to_invoice'
    and v_next_status = 'pending'
    and not public.current_user_is_admin()
  then
    raise exception 'Only an admin can reset a ready billing installment';
  end if;
  if exists (
    select 1 from public.finance_invoices
    where primary_billing_installment_id = v_installment.id
      and document_status not in ('cancelled', 'voided')
  ) then
    raise exception 'Billing Installment status cannot change while an active Invoice exists';
  end if;

  select
    profile.email,
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email)
  into v_actor_email, v_actor_name
  from public.user_profiles as profile
  where profile.id = auth.uid();

  v_event_type := case when v_next_status = 'pending' then 'readiness_reset' else 'cancelled' end;
  v_event_payload := jsonb_strip_nulls(jsonb_build_object(
    'from_status', v_installment.status,
    'to_status', v_next_status,
    'previous_readiness_evidence', v_installment.readiness_evidence_json
  ));

  update public.finance_billing_installments
  set
    status = v_next_status,
    ready_to_invoice_at = case when v_next_status = 'pending' then null else ready_to_invoice_at end,
    readiness_event_date = case when v_next_status = 'pending' then null else readiness_event_date end,
    readiness_confirmed_at = case when v_next_status = 'pending' then null else readiness_confirmed_at end,
    readiness_confirmed_by_user_id = case when v_next_status = 'pending' then null else readiness_confirmed_by_user_id end,
    readiness_note = case when v_next_status = 'pending' then null else readiness_note end,
    readiness_reference = case when v_next_status = 'pending' then null else readiness_reference end,
    readiness_evidence_json = case when v_next_status = 'pending' then null else readiness_evidence_json end,
    cancelled_at = case when v_next_status = 'cancelled' then now() else cancelled_at end,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_installment.id;

  insert into public.finance_billing_installment_audit_events (
    billing_installment_id,
    billing_plan_id,
    event_type,
    event_payload_json,
    actor_user_id,
    actor_email,
    actor_name
  ) values (
    v_installment.id,
    v_billing_plan_id,
    v_event_type,
    v_event_payload,
    auth.uid(),
    v_actor_email,
    v_actor_name
  );

  return v_installment.id;
end;
$$;

create or replace function public.enforce_finance_invoice_source_status_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id uuid;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if tg_table_name = 'finance_billing_plans' then
    for v_invoice_id in
      select invoice.id
      from public.finance_invoices as invoice
      where invoice.billing_plan_id = new.id
        and invoice.document_status not in ('cancelled', 'voided')
    loop
      perform public.validate_finance_invoice_integrity(v_invoice_id);
    end loop;
  else
    for v_invoice_id in
      select invoice.id
      from public.finance_invoices as invoice
      where invoice.primary_billing_installment_id = new.id
        and invoice.document_status not in ('cancelled', 'voided')
    loop
      perform public.validate_finance_invoice_integrity(v_invoice_id);
    end loop;
  end if;

  return null;
end;
$$;

create constraint trigger finance_invoice_integrity_after_billing_plan_status
after update on public.finance_billing_plans
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_source_status_integrity();

create constraint trigger finance_invoice_integrity_after_billing_installment_status
after update on public.finance_billing_installments
deferrable initially deferred
for each row execute function public.enforce_finance_invoice_source_status_integrity();

revoke all on function public.confirm_finance_billing_installment_ready(uuid, date, boolean, text, text) from public, anon;
grant execute on function public.confirm_finance_billing_installment_ready(uuid, date, boolean, text, text) to authenticated;

revoke all on function public.set_finance_billing_installment_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_finance_billing_installment_status(uuid, text) to authenticated;
revoke all on function public.enforce_finance_invoice_source_status_integrity() from public, anon, authenticated;

comment on column public.finance_billing_installments.readiness_event_date is
  'Actual operational date on which staff confirmed the installment billing condition had occurred.';
comment on table public.finance_billing_installment_audit_events is
  'Append-only operational evidence for Billing Installment readiness, reset, and cancellation actions.';
