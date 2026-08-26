-- Add a truthful accepted-Quotation engagement basis without creating a formal Agreement document.
-- Existing rows are not backfilled; null basis remains historical/formal compatibility.

alter table public.finance_fee_agreements
  add column if not exists engagement_basis text null,
  add column if not exists engagement_confirmed_on date null,
  add column if not exists engagement_confirmed_at timestamptz null,
  add column if not exists engagement_confirmed_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists engagement_confirmation_channel text null,
  add column if not exists engagement_confirmation_note text null,
  add column if not exists engagement_confirmation_snapshot_json jsonb null;

-- A non-document engagement has no document version. Existing formal rows retain their values.
alter table public.finance_fee_agreements
  alter column document_version drop not null;

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_status_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_status_check
  check (status in ('draft', 'under_review', 'sent', 'signed', 'completed', 'cancelled', 'active', 'engagement_confirmed'));

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_engagement_basis_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_engagement_basis_check
  check (engagement_basis is null or engagement_basis in ('formal_agreement', 'accepted_quotation'));

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_engagement_confirmation_channel_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_engagement_confirmation_channel_check
  check (
    engagement_confirmation_channel is null
    or engagement_confirmation_channel in ('line', 'email', 'phone', 'meeting', 'written', 'other')
  );

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_engagement_confirmation_snapshot_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_engagement_confirmation_snapshot_check
  check (
    engagement_confirmation_snapshot_json is null
    or jsonb_typeof(engagement_confirmation_snapshot_json) = 'object'
  );

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_engagement_basis_state_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_engagement_basis_state_check
  check (
    (
      engagement_basis is null
      and status <> 'engagement_confirmed'
      and engagement_confirmed_on is null
      and engagement_confirmed_at is null
      and engagement_confirmed_by_user_id is null
      and engagement_confirmation_channel is null
      and engagement_confirmation_note is null
      and engagement_confirmation_snapshot_json is null
    )
    or (
      engagement_basis = 'formal_agreement'
      and status <> 'engagement_confirmed'
      and engagement_confirmed_on is null
      and engagement_confirmed_at is null
      and engagement_confirmed_by_user_id is null
      and engagement_confirmation_channel is null
      and engagement_confirmation_note is null
      and engagement_confirmation_snapshot_json is null
    )
    or coalesce((
      engagement_basis = 'accepted_quotation'
      and status in ('engagement_confirmed', 'cancelled')
      and source_type = 'quotation'
      and source_quotation_id is not null
      and (
        (
          status = 'engagement_confirmed'
          and cancelled_at is null
          and cancelled_by_user_id is null
          and cancel_reason is null
        )
        or (
          status = 'cancelled'
          and cancelled_at is not null
          and cancelled_by_user_id is not null
          and nullif(btrim(coalesce(cancel_reason, '')), '') is not null
        )
      )
      and agreement_no is null
      and agreement_date is null
      and document_version is null
      and execution_mode is null
      and legal_terms_json is null
      and signatories_json is null
      and custom_clauses_json is null
      and selected_template_id is null
      and selected_template_version_id is null
      and resolved_document_snapshot_json is null
      and signed_document_snapshot_json is null
      and sent_at is null
      and sent_by_user_id is null
      and signed_at is null
      and signed_by_user_id is null
      and executed_on is null
      and signed_evidence_reference is null
      and signed_evidence_json is null
      and engagement_confirmed_on is not null
      and engagement_confirmed_at is not null
      and engagement_confirmed_by_user_id is not null
      and engagement_confirmation_channel is not null
      and engagement_confirmation_snapshot_json is not null
      and jsonb_typeof(engagement_confirmation_snapshot_json) = 'object'
      and engagement_confirmation_snapshot_json <> '{}'::jsonb
      and engagement_confirmation_snapshot_json->>'schema_version' = '1'
      and engagement_confirmation_snapshot_json->>'engagement_basis' = 'accepted_quotation'
      and engagement_confirmation_snapshot_json#>>'{source_quotation,id}' = source_quotation_id::text
      and engagement_confirmation_snapshot_json#>>'{source_quotation,quotation_no}' = source_reference
      and engagement_confirmation_snapshot_json#>>'{confirmation,confirmed_on}' = engagement_confirmed_on::text
      and engagement_confirmation_snapshot_json#>>'{confirmation,channel}' = engagement_confirmation_channel
      and engagement_confirmation_snapshot_json#>>'{confirmation,recorded_by,user_id}' = engagement_confirmed_by_user_id::text
      and (engagement_confirmation_snapshot_json#>>'{confirmation,recorded_at}')::timestamptz = engagement_confirmed_at
      and engagement_confirmation_snapshot_json#>>'{source_quotation,snapshot_version}' = source_document_snapshot_json->>'version'
      and (engagement_confirmation_snapshot_json#>>'{source_quotation,frozen_at}')::timestamptz
        = (source_document_snapshot_json->>'frozen_at')::timestamptz
      and source_document_snapshot_json is not null
      and jsonb_typeof(source_document_snapshot_json) = 'object'
      and source_document_snapshot_json <> '{}'::jsonb
      and source_document_snapshot_json->>'version' is not null
      and source_document_snapshot_json->>'frozen_at' is not null
      and commercial_terms_snapshot_json is not null
      and jsonb_typeof(commercial_terms_snapshot_json) = 'object'
      and commercial_terms_snapshot_json <> '{}'::jsonb
    ), false)
  );

comment on column public.finance_fee_agreements.engagement_basis is
  'Commercial engagement basis. Null preserves historical/formal compatibility; accepted_quotation never represents a formal Agreement document.';
comment on column public.finance_fee_agreements.engagement_confirmed_on is
  'Actual client engagement-confirmation date, distinct from the VP OS recording timestamp.';
comment on column public.finance_fee_agreements.engagement_confirmed_at is
  'System timestamp when VP OS recorded the accepted-Quotation engagement confirmation.';
comment on column public.finance_fee_agreements.engagement_confirmation_snapshot_json is
  'Immutable evidence identifying the frozen accepted Quotation and the human-recorded engagement confirmation.';

create or replace function public.enforce_finance_accepted_quotation_engagement_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.engagement_basis is distinct from new.engagement_basis then
    raise exception 'Finance engagement basis is immutable';
  end if;

  if old.engagement_basis = 'accepted_quotation' then
    if new.status not in ('engagement_confirmed', 'cancelled') then
      raise exception 'Accepted quotation engagements cannot enter formal document lifecycle states';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'engagement_confirmed' and new.status = 'cancelled')
    then
      raise exception 'Invalid accepted quotation engagement status transition';
    end if;
    if old.status = 'cancelled'
      and (
        new.cancelled_at is distinct from old.cancelled_at
        or new.cancelled_by_user_id is distinct from old.cancelled_by_user_id
        or new.cancel_reason is distinct from old.cancel_reason
      )
    then
      raise exception 'Accepted quotation engagement cancellation evidence is immutable';
    end if;
    if new.engagement_confirmed_on is distinct from old.engagement_confirmed_on
      or new.engagement_confirmed_at is distinct from old.engagement_confirmed_at
      or new.engagement_confirmed_by_user_id is distinct from old.engagement_confirmed_by_user_id
      or new.engagement_confirmation_channel is distinct from old.engagement_confirmation_channel
      or new.engagement_confirmation_note is distinct from old.engagement_confirmation_note
      or new.engagement_confirmation_snapshot_json is distinct from old.engagement_confirmation_snapshot_json
    then
      raise exception 'Accepted quotation engagement confirmation evidence is immutable';
    end if;
    if new.source_quotation_id is distinct from old.source_quotation_id
      or new.client_id is distinct from old.client_id
      or new.case_id is distinct from old.case_id
      or new.advisory_matter_id is distinct from old.advisory_matter_id
      or new.currency is distinct from old.currency
      or new.amount_before_tax is distinct from old.amount_before_tax
      or new.vat_amount is distinct from old.vat_amount
      or new.total_amount is distinct from old.total_amount
      or new.billing_method is distinct from old.billing_method
      or new.client_snapshot_json is distinct from old.client_snapshot_json
      or new.matter_snapshot_json is distinct from old.matter_snapshot_json
      or new.company_snapshot_json is distinct from old.company_snapshot_json
      or new.commercial_terms_snapshot_json is distinct from old.commercial_terms_snapshot_json
      or new.source_document_snapshot_json is distinct from old.source_document_snapshot_json
    then
      raise exception 'Accepted quotation engagement commercial evidence is immutable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_finance_accepted_quotation_engagement_immutability
  on public.finance_fee_agreements;
create trigger enforce_finance_accepted_quotation_engagement_immutability
before update on public.finance_fee_agreements
for each row execute function public.enforce_finance_accepted_quotation_engagement_immutability();

create or replace function public.finance_fee_agreement_is_billing_eligible(
  p_fee_agreement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_fee_agreements as agreement
    where agreement.id = p_fee_agreement_id
      and (
        (
          agreement.engagement_basis = 'accepted_quotation'
          and agreement.status = 'engagement_confirmed'
          and agreement.engagement_confirmed_on is not null
          and agreement.engagement_confirmed_at is not null
          and agreement.engagement_confirmed_by_user_id is not null
          and agreement.engagement_confirmation_channel is not null
          and agreement.engagement_confirmation_snapshot_json is not null
          and jsonb_typeof(agreement.engagement_confirmation_snapshot_json) = 'object'
          and agreement.engagement_confirmation_snapshot_json <> '{}'::jsonb
          and agreement.source_document_snapshot_json is not null
          and jsonb_typeof(agreement.source_document_snapshot_json) = 'object'
          and agreement.source_document_snapshot_json <> '{}'::jsonb
          and agreement.source_document_snapshot_json->>'version' is not null
          and agreement.source_document_snapshot_json->>'frozen_at' is not null
          and agreement.commercial_terms_snapshot_json is not null
          and jsonb_typeof(agreement.commercial_terms_snapshot_json) = 'object'
          and agreement.commercial_terms_snapshot_json <> '{}'::jsonb
        )
        or (
          agreement.engagement_basis is distinct from 'accepted_quotation'
          and agreement.status in ('signed', 'completed')
        )
        or (
          agreement.engagement_basis is null
          and agreement.status = 'active'
        )
      )
  );
$$;

create or replace function public.confirm_finance_accepted_quotation_engagement(
  p_quotation_id uuid,
  p_confirmed_on date,
  p_confirmation_channel text,
  p_confirmation_note text default null
)
returns table(fee_agreement_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.finance_quotations%rowtype;
  v_snapshot jsonb;
  v_client_snapshot jsonb;
  v_matter_snapshot jsonb;
  v_confirmation_snapshot jsonb;
  v_id uuid;
  v_existing_basis text;
  v_existing_status text;
  v_existing_confirmed_on date;
  v_existing_channel text;
  v_existing_note text;
  v_existing_count integer;
  v_channel text := lower(btrim(coalesce(p_confirmation_channel, '')));
  v_note text := nullif(btrim(coalesce(p_confirmation_note, '')), '');
  v_recorded_at timestamptz := now();
  v_actor_name text;
  v_actor_email text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to confirm accepted quotation engagement';
  end if;
  if p_confirmed_on is null then
    raise exception 'Engagement confirmation date is required';
  end if;
  if p_confirmed_on > current_date then
    raise exception 'Engagement confirmation date cannot be in the future';
  end if;
  if v_channel not in ('line', 'email', 'phone', 'meeting', 'written', 'other') then
    raise exception 'Invalid engagement confirmation channel';
  end if;
  if length(coalesce(v_note, '')) > 4000 then
    raise exception 'Engagement confirmation note must not exceed 4000 characters';
  end if;

  select *
  into v_quotation
  from public.finance_quotations as quotation
  where quotation.id = p_quotation_id
  for update;

  if v_quotation.id is null then raise exception 'Quotation not found'; end if;
  if v_quotation.status <> 'accepted' then
    raise exception 'Only accepted quotations can confirm an engagement';
  end if;
  if v_quotation.client_id is null then
    raise exception 'Link this accepted prospect quotation to a Client before confirming the engagement';
  end if;

  v_snapshot := v_quotation.document_data_snapshot_json;
  if v_snapshot is null
    or v_snapshot->>'frozen_at' is null
    or jsonb_typeof(v_snapshot->'items') <> 'array'
    or jsonb_typeof(v_snapshot->'payment_terms') <> 'object'
  then
    raise exception 'Accepted quotation has no frozen document snapshot';
  end if;

  select jsonb_build_object(
    'source_type', 'existing_client',
    'id', client.id,
    'name', client.name,
    'client_type', client.client_type,
    'tax_id', client.tax_id,
    'address', client.address,
    'phone', client.phone,
    'email', client.email
  )
  into v_client_snapshot
  from public.clients as client
  where client.id = v_quotation.client_id;
  if v_client_snapshot is null then raise exception 'Linked Client not found'; end if;

  if v_quotation.case_id is not null then
    select jsonb_build_object(
      'type', 'case', 'source_type', 'case', 'id', case_record.id,
      'file_no', case_record.file_no, 'title', case_record.title,
      'client_name', case_record.client_name
    )
    into v_matter_snapshot
    from public.cases as case_record
    where case_record.id = v_quotation.case_id;
    if v_matter_snapshot is null then raise exception 'Linked Case not found'; end if;
  elsif v_quotation.advisory_matter_id is not null then
    select jsonb_build_object(
      'type', 'advisory', 'source_type', 'advisory', 'id', matter.id,
      'matter_no', matter.matter_no, 'title', matter.title
    )
    into v_matter_snapshot
    from public.advisory_matters as matter
    where matter.id = v_quotation.advisory_matter_id;
    if v_matter_snapshot is null then raise exception 'Linked Advisory matter not found'; end if;
  else
    v_matter_snapshot := coalesce(
      nullif(v_quotation.matter_snapshot_json, '{}'::jsonb),
      nullif(v_snapshot->'matter', '{}'::jsonb),
      jsonb_build_object('type', 'unlinked', 'source_type', 'unlinked')
    );
  end if;

  select count(*)::integer
  into v_existing_count
  from public.finance_fee_agreements as agreement
  where agreement.source_type = 'quotation'
    and agreement.source_quotation_id = v_quotation.id
    and agreement.status <> 'cancelled';
  if v_existing_count > 1 then
    raise exception 'Conflicting commercial engagements exist for this quotation';
  end if;

  select
    agreement.id,
    agreement.engagement_basis,
    agreement.status,
    agreement.engagement_confirmed_on,
    agreement.engagement_confirmation_channel,
    agreement.engagement_confirmation_note
  into
    v_id,
    v_existing_basis,
    v_existing_status,
    v_existing_confirmed_on,
    v_existing_channel,
    v_existing_note
  from public.finance_fee_agreements as agreement
  where agreement.source_type = 'quotation'
    and agreement.source_quotation_id = v_quotation.id
    and agreement.status <> 'cancelled'
  order by agreement.created_at, agreement.id
  limit 1
  for update;

  if v_id is not null then
    if v_existing_basis = 'accepted_quotation'
      and v_existing_status = 'engagement_confirmed'
      and v_existing_confirmed_on is not distinct from p_confirmed_on
      and v_existing_channel is not distinct from v_channel
      and v_existing_note is not distinct from v_note
    then
      return query select v_id, false;
      return;
    end if;
    if v_existing_basis = 'accepted_quotation' then
      raise exception 'Accepted quotation engagement already exists with different confirmation evidence';
    end if;
    raise exception 'A formal Fee Agreement already exists for this quotation';
  end if;

  select
    coalesce(nullif(btrim(profile.staff_name), ''), nullif(btrim(profile.full_name), ''), profile.email),
    profile.email
  into v_actor_name, v_actor_email
  from public.user_profiles as profile
  where profile.id = auth.uid();

  v_confirmation_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'engagement_basis', 'accepted_quotation',
    'source_quotation', jsonb_build_object(
      'id', v_quotation.id,
      'quotation_no', v_quotation.quotation_no,
      'status', v_quotation.status,
      'accepted_at', v_quotation.accepted_at,
      'accepted_by_user_id', v_quotation.accepted_by_user_id,
      'snapshot_version', v_snapshot->'version',
      'frozen_at', v_snapshot->>'frozen_at'
    ),
    'client', v_client_snapshot,
    'matter', coalesce(v_matter_snapshot, '{}'::jsonb),
    'confirmation', jsonb_build_object(
      'confirmed_on', p_confirmed_on,
      'channel', v_channel,
      'recorded_at', v_recorded_at,
      'recorded_by', jsonb_build_object(
        'user_id', auth.uid(),
        'name', v_actor_name,
        'email', v_actor_email
      ),
      'note', v_note
    )
  ));

  insert into public.finance_fee_agreements (
    agreement_no,
    title,
    client_id,
    case_id,
    advisory_matter_id,
    source_type,
    source_quotation_id,
    source_reference,
    status,
    currency,
    amount_before_tax,
    vat_amount,
    total_amount,
    billing_method,
    client_snapshot_json,
    matter_snapshot_json,
    company_snapshot_json,
    commercial_terms_snapshot_json,
    source_document_snapshot_json,
    legal_terms_json,
    signatories_json,
    custom_clauses_json,
    selected_template_id,
    selected_template_version_id,
    resolved_document_snapshot_json,
    signed_document_snapshot_json,
    document_version,
    execution_mode,
    engagement_basis,
    engagement_confirmed_on,
    engagement_confirmed_at,
    engagement_confirmed_by_user_id,
    engagement_confirmation_channel,
    engagement_confirmation_note,
    engagement_confirmation_snapshot_json,
    created_by_user_id,
    updated_by_user_id
  ) values (
    null,
    concat('การว่าจ้างตามใบเสนอราคา ', v_quotation.quotation_no),
    v_quotation.client_id,
    v_quotation.case_id,
    v_quotation.advisory_matter_id,
    'quotation',
    v_quotation.id,
    v_quotation.quotation_no,
    'engagement_confirmed',
    coalesce(nullif(v_snapshot->'payment_terms'->>'currency', ''), 'THB'),
    (v_snapshot->'totals'->>'subtotal_vatable')::numeric
      + (v_snapshot->'totals'->>'subtotal_non_vatable')::numeric,
    (v_snapshot->'totals'->>'vat_amount')::numeric,
    (v_snapshot->'totals'->>'grand_total')::numeric,
    coalesce(v_snapshot->'payment_terms'->>'payment_method_type', 'single'),
    v_client_snapshot,
    v_matter_snapshot,
    v_snapshot->'company',
    jsonb_build_object(
      'commercial', v_snapshot->'commercial',
      'payment_terms', v_snapshot->'payment_terms'
    ),
    v_snapshot,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'accepted_quotation',
    p_confirmed_on,
    v_recorded_at,
    auth.uid(),
    v_channel,
    v_note,
    v_confirmation_snapshot,
    auth.uid(),
    auth.uid()
  )
  returning id into v_id;

  insert into public.finance_fee_agreement_items (
    fee_agreement_id,
    source_quotation_item_id,
    description,
    quantity,
    unit_price,
    amount_before_tax,
    vat_applicable,
    vat_rate,
    vat_amount,
    line_total,
    sort_order,
    item_snapshot_json
  )
  select
    v_id,
    (item->>'quotation_item_id')::uuid,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'amount_before_tax')::numeric,
    coalesce((item->>'vat_applicable')::boolean, false),
    coalesce((item->>'vat_rate')::numeric, 0),
    (item->>'vat_amount')::numeric,
    (item->>'line_total')::numeric,
    coalesce((item->>'sort_order')::integer, 0),
    item || jsonb_build_object(
      'source_quotation_id', v_quotation.id,
      'source_quotation_no', v_quotation.quotation_no,
      'engagement_basis', 'accepted_quotation'
    )
  from jsonb_array_elements(v_snapshot->'items') as item
  order by coalesce((item->>'sort_order')::integer, 0);

  return query select v_id, true;
end;
$$;

create or replace function public.cancel_finance_accepted_quotation_engagement(
  p_fee_agreement_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_engagement public.finance_fee_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to cancel accepted quotation engagement';
  end if;
  if v_reason is null then raise exception 'Cancellation reason is required'; end if;
  if length(v_reason) > 2000 then raise exception 'Cancellation reason must not exceed 2000 characters'; end if;

  select *
  into v_engagement
  from public.finance_fee_agreements as engagement
  where engagement.id = p_fee_agreement_id
  for update;

  if v_engagement.id is null then raise exception 'Engagement not found'; end if;
  if v_engagement.engagement_basis <> 'accepted_quotation'
    or v_engagement.status <> 'engagement_confirmed'
  then
    raise exception 'Only a confirmed accepted quotation engagement can use this cancellation path';
  end if;
  if exists (
    select 1
    from public.finance_billing_plans as plan
    where plan.fee_agreement_id = v_engagement.id
      and plan.status <> 'cancelled'
  ) then
    raise exception 'Cancel the Billing Plan before cancelling this engagement';
  end if;

  update public.finance_fee_agreements
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by_user_id = auth.uid(),
      cancel_reason = v_reason,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_engagement.id;

  return v_engagement.id;
end;
$$;

-- Preserve the current formal conversion contract while making the engagement choice authoritative.
create or replace function public.create_finance_fee_agreement_from_quotation_v2(p_quotation_id uuid)
returns table(fee_agreement_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.finance_quotations%rowtype;
  v_snapshot jsonb;
  v_client_snapshot jsonb;
  v_matter_snapshot jsonb;
  v_id uuid;
  v_existing_basis text;
  v_existing_count integer;
  v_agreement_no text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create fee agreement'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can create fee agreements'; end if;
  if q.client_id is null then raise exception 'Link this accepted prospect quotation to a Client before creating a Fee Agreement'; end if;
  select jsonb_build_object(
    'source_type', 'existing_client', 'id', client.id, 'name', client.name,
    'client_type', client.client_type, 'tax_id', client.tax_id, 'address', client.address,
    'phone', client.phone, 'email', client.email
  ) into v_client_snapshot from public.clients client where client.id = q.client_id;
  if v_client_snapshot is null then raise exception 'Linked Client not found'; end if;

  if q.case_id is not null then
    select jsonb_build_object('type','case','source_type','case','id',case_record.id,'file_no',case_record.file_no,'title',case_record.title,'client_name',case_record.client_name)
      into v_matter_snapshot from public.cases case_record where case_record.id = q.case_id;
    if v_matter_snapshot is null then raise exception 'Linked Case not found'; end if;
  elsif q.advisory_matter_id is not null then
    select jsonb_build_object('type','advisory','source_type','advisory','id',matter.id,'matter_no',matter.matter_no,'title',matter.title)
      into v_matter_snapshot from public.advisory_matters matter where matter.id = q.advisory_matter_id;
    if v_matter_snapshot is null then raise exception 'Linked Advisory matter not found'; end if;
  else
    v_matter_snapshot := coalesce(q.matter_snapshot_json, '{}'::jsonb);
  end if;

  v_snapshot := q.document_data_snapshot_json;
  if v_snapshot is null or v_snapshot->>'frozen_at' is null or jsonb_typeof(v_snapshot->'items') <> 'array' or jsonb_typeof(v_snapshot->'payment_terms') <> 'object' then
    raise exception 'Accepted quotation has no frozen document snapshot';
  end if;
  select count(*)::integer into v_existing_count
  from public.finance_fee_agreements agreement
  where agreement.source_type = 'quotation' and agreement.source_quotation_id = q.id and agreement.status <> 'cancelled';
  if v_existing_count > 1 then raise exception 'Conflicting fee agreements exist for this quotation'; end if;
  select agreement.id, agreement.engagement_basis into v_id, v_existing_basis
  from public.finance_fee_agreements agreement
  where agreement.source_type = 'quotation' and agreement.source_quotation_id = q.id and agreement.status <> 'cancelled'
  order by agreement.created_at, agreement.id limit 1 for update;
  if v_id is not null then
    if v_existing_basis = 'accepted_quotation' then
      raise exception 'An accepted quotation engagement already exists for this quotation';
    end if;
    return query select v_id, false;
    return;
  end if;

  v_agreement_no := public.generate_finance_document_no('fee_agreement', coalesce(q.accepted_at::date, q.issue_date, current_date));
  insert into public.finance_fee_agreements (
    agreement_no, title, client_id, case_id, advisory_matter_id, source_type, source_quotation_id, status,
    currency, amount_before_tax, vat_amount, total_amount, billing_method, client_snapshot_json,
    matter_snapshot_json, company_snapshot_json, commercial_terms_snapshot_json, source_document_snapshot_json,
    legal_terms_json, signatories_json, custom_clauses_json, document_version, language_code, engagement_basis,
    created_by_user_id, updated_by_user_id
  ) values (
    v_agreement_no, concat('Fee Agreement - ', q.quotation_no), q.client_id, q.case_id, q.advisory_matter_id,
    'quotation', q.id, 'draft', 'THB',
    (v_snapshot->'totals'->>'subtotal_vatable')::numeric + (v_snapshot->'totals'->>'subtotal_non_vatable')::numeric,
    (v_snapshot->'totals'->>'vat_amount')::numeric, (v_snapshot->'totals'->>'grand_total')::numeric,
    coalesce(v_snapshot->'payment_terms'->>'payment_method_type', 'single'),
    v_client_snapshot, v_matter_snapshot, v_snapshot->'company',
    jsonb_build_object('commercial', v_snapshot->'commercial', 'payment_terms', v_snapshot->'payment_terms'),
    v_snapshot, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, 'th', 'formal_agreement', auth.uid(), auth.uid()
  ) returning id into v_id;

  insert into public.finance_fee_agreement_items (
    fee_agreement_id, source_quotation_item_id, description, quantity, unit_price, amount_before_tax,
    vat_applicable, vat_rate, vat_amount, line_total, sort_order, item_snapshot_json
  )
  select v_id, (item->>'quotation_item_id')::uuid, item->>'description', (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric, (item->>'amount_before_tax')::numeric,
    coalesce((item->>'vat_applicable')::boolean, false), coalesce((item->>'vat_rate')::numeric, 0),
    (item->>'vat_amount')::numeric, (item->>'line_total')::numeric, coalesce((item->>'sort_order')::integer, 0),
    item || jsonb_build_object('source_quotation_id', q.id, 'source_quotation_no', q.quotation_no)
  from jsonb_array_elements(v_snapshot->'items') item
  order by coalesce((item->>'sort_order')::integer, 0);

  perform public.record_finance_fee_agreement_version(
    v_id, 'created', null,
    jsonb_build_object('source_quotation_id', q.id, 'source_snapshot_schema_version', v_snapshot->>'version', 'master_linkage_applied', true)
  );
  return query select v_id, true;
end;
$$;

create or replace function public.create_finance_fee_agreement_from_quotation(p_quotation_id uuid)
returns table(fee_agreement_id uuid, created boolean)
language sql
security definer
set search_path = public
as $$
  select *
  from public.create_finance_fee_agreement_from_quotation_v2(p_quotation_id);
$$;

create or replace function public.get_finance_fee_agreement_template_preview(p_fee_agreement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to preview fee agreement template content';
  end if;
  if not exists (
    select 1
    from public.finance_fee_agreements as agreement
    where agreement.id = p_fee_agreement_id
      and agreement.engagement_basis is distinct from 'accepted_quotation'
      and agreement.status in ('draft', 'under_review')
  ) then
    raise exception 'Only formal draft or under review template content can be previewed live';
  end if;
  return public.resolve_finance_fee_agreement_template_content(p_fee_agreement_id);
end;
$$;

-- Formal lifecycle remains unchanged, but accepted-Quotation engagements must use their dedicated path.
create or replace function public.set_finance_fee_agreement_status(
  p_fee_agreement_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status, '')));
  v_event text;
  v_retired boolean;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance fee agreement status';
  end if;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.engagement_basis = 'accepted_quotation' then
    raise exception 'Accepted quotation engagements do not use formal document lifecycle actions';
  end if;
  if v_agreement.status = 'sent' and v_next = 'signed' then
    raise exception 'กรุณาบันทึกหลักฐานการลงนามก่อนเปลี่ยนสถานะเป็นลงนามแล้ว';
  end if;
  if not (
    (v_agreement.status = 'draft' and v_next in ('under_review', 'cancelled'))
    or (v_agreement.status = 'under_review' and v_next in ('sent', 'cancelled'))
    or (v_agreement.status = 'signed' and v_next = 'completed')
    or (v_agreement.status = 'draft' and v_next = 'active')
    or (v_agreement.status = 'active' and v_next in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid finance fee agreement status transition';
  end if;
  if v_next in ('under_review', 'sent', 'active')
    and (v_agreement.source_document_snapshot_json is null or v_agreement.commercial_terms_snapshot_json is null)
  then
    raise exception 'Fee agreement source evidence is required';
  end if;
  if v_next = 'sent' and v_agreement.agreement_date is null then
    raise exception 'กรุณาระบุวันที่ทำสัญญาก่อนส่งเอกสาร';
  end if;
  if v_next = 'sent'
    and (v_agreement.agreement_no is null or v_agreement.legal_terms_json is null or v_agreement.signatories_json is null)
  then
    raise exception 'Fee agreement legal document data is not ready';
  end if;
  if v_next = 'sent' and v_agreement.selected_template_version_id is not null then
    perform public.validate_finance_fee_agreement_template_ready(v_agreement.id);
    select tv.status = 'retired' or t.status = 'retired'
    into v_retired
    from public.document_template_versions as tv
    join public.document_templates as t on t.id = tv.template_id
    where tv.id = v_agreement.selected_template_version_id;
    if coalesce(v_retired, false)
      and (
        v_agreement.retired_template_use_approved_version_id is distinct from v_agreement.selected_template_version_id
        or v_agreement.retired_template_use_approved_by_user_id is null
        or nullif(btrim(coalesce(v_agreement.retired_template_use_reason, '')), '') is null
      )
    then
      raise exception 'Partner approval is required before sending an agreement that uses a retired template version';
    end if;
  end if;
  if v_next = 'cancelled'
    and exists (
      select 1 from public.finance_billing_plans
      where fee_agreement_id = v_agreement.id
        and status <> 'cancelled'
    )
  then
    raise exception 'Cancel the Billing Plan before cancelling this agreement';
  end if;

  update public.finance_fee_agreements
  set status = v_next,
      sent_at = case when v_next = 'sent' then now() else sent_at end,
      sent_by_user_id = case when v_next = 'sent' then auth.uid() else sent_by_user_id end,
      cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end,
      cancelled_by_user_id = case when v_next = 'cancelled' then auth.uid() else cancelled_by_user_id end,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  v_event := v_next;
  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    v_event,
    null,
    jsonb_build_object('from_status', v_agreement.status, 'to_status', v_next)
  );
  return v_agreement.id;
end;
$$;

revoke all on function public.enforce_finance_accepted_quotation_engagement_immutability() from public, anon, authenticated;
revoke all on function public.finance_fee_agreement_is_billing_eligible(uuid) from public, anon, authenticated;
revoke all on function public.confirm_finance_accepted_quotation_engagement(uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.cancel_finance_accepted_quotation_engagement(uuid, text) from public, anon, authenticated;
revoke all on function public.create_finance_fee_agreement_from_quotation_v2(uuid) from public, anon, authenticated;
revoke all on function public.create_finance_fee_agreement_from_quotation(uuid) from public, anon, authenticated;
revoke all on function public.get_finance_fee_agreement_template_preview(uuid) from public, anon, authenticated;
revoke all on function public.set_finance_fee_agreement_status(uuid, text) from public, anon, authenticated;

grant execute on function public.confirm_finance_accepted_quotation_engagement(uuid, date, text, text) to authenticated;
grant execute on function public.cancel_finance_accepted_quotation_engagement(uuid, text) to authenticated;
grant execute on function public.create_finance_fee_agreement_from_quotation_v2(uuid) to authenticated;
grant execute on function public.create_finance_fee_agreement_from_quotation(uuid) to authenticated;
grant execute on function public.get_finance_fee_agreement_template_preview(uuid) to authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid, text) to authenticated;

-- Recreate the current Billing Plan functions unchanged except for their shared basis-aware eligibility guard.
create or replace function public.save_finance_billing_plan_draft(
  p_billing_plan_id uuid,
  p_fee_agreement_id uuid,
  p_title text,
  p_description text,
  p_billing_method text,
  p_recurring_config_json jsonb,
  p_installments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_plan public.finance_billing_plans%rowtype;
  v_plan_id uuid := coalesce(p_billing_plan_id, gen_random_uuid());
  v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
  v_installment jsonb;
  v_installment_id uuid;
  v_item jsonb;
  v_installment_amount_before_tax numeric(14, 2);
  v_installment_vat_amount numeric(14, 2);
  v_installment_total_amount numeric(14, 2);
  v_plan_amount_before_tax numeric(14, 2);
  v_plan_vat_amount numeric(14, 2);
  v_plan_total_amount numeric(14, 2);
  v_installment_count integer;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save finance billing plan draft';
  end if;

  if p_billing_plan_id is not null then
    select *
      into v_plan
    from public.finance_billing_plans
    where id = p_billing_plan_id
    for update;

    if v_plan.id is null then
      raise exception 'Billing plan not found';
    end if;

    if v_plan.status <> 'draft' then
      raise exception 'Only draft billing plans can be edited';
    end if;

    if v_plan.fee_agreement_id <> p_fee_agreement_id then
      raise exception 'Billing plan fee agreement cannot be changed';
    end if;
  end if;

  select *
    into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;

  if not public.finance_fee_agreement_is_billing_eligible(v_agreement.id) then
    raise exception 'Billing plans require an eligible commercial engagement';
  end if;

  if v_billing_method not in ('single', 'installments', 'milestone', 'recurring', 'manual') then
    raise exception 'Invalid billing method';
  end if;

  if v_billing_method <> v_agreement.billing_method then
    raise exception 'Billing plan method must match the fee agreement';
  end if;

  if v_billing_method <> 'recurring' and p_recurring_config_json is not null then
    raise exception 'Recurring configuration is only valid for recurring billing plans';
  end if;

  if p_installments is null
    or jsonb_typeof(p_installments) <> 'array'
    or jsonb_array_length(p_installments) = 0 then
    raise exception 'Billing plan draft requires at least one installment';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) as installment(value)
    where coalesce(jsonb_typeof(installment.value), '') <> 'object'
      or coalesce((installment.value ->> 'installment_no')::integer, 0) <= 0
      or coalesce((installment.value ->> 'sort_order')::integer, 0) < 0
      or btrim(coalesce(installment.value ->> 'title', '')) = ''
      or coalesce(installment.value ->> 'trigger_type', '') not in (
        'agreement_effective', 'date', 'case_milestone', 'manual', 'recurring_period'
      )
      or coalesce(jsonb_typeof(installment.value -> 'items'), '') <> 'array'
      or jsonb_array_length(installment.value -> 'items') = 0
  ) then
    raise exception 'Billing plan draft contains invalid installments';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) as installment(value)
    where (installment.value ->> 'trigger_type' = 'agreement_effective'
      and nullif(btrim(coalesce(installment.value ->> 'milestone_code', '')), '') is not null)
      or (installment.value ->> 'trigger_type' = 'date'
        and nullif(btrim(coalesce(installment.value ->> 'due_date', '')), '') is null)
      or (installment.value ->> 'trigger_type' = 'case_milestone'
        and nullif(btrim(coalesce(installment.value ->> 'milestone_code', '')), '') is null
        and nullif(btrim(coalesce(installment.value ->> 'trigger_description', '')), '') is null)
      or (installment.value ->> 'trigger_type' = 'recurring_period'
        and (
          nullif(btrim(coalesce(installment.value ->> 'recurring_period_start', '')), '') is null
          or nullif(btrim(coalesce(installment.value ->> 'recurring_period_end', '')), '') is null
          or nullif(installment.value ->> 'recurring_period_end', '')::date
            < nullif(installment.value ->> 'recurring_period_start', '')::date
        ))
  ) then
    raise exception 'Billing plan draft contains invalid trigger metadata';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) as installment(value)
    group by installment.value ->> 'installment_no'
    having count(*) > 1
  ) then
    raise exception 'Billing plan draft contains duplicate installment numbers';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) with ordinality as installment(value, position)
    cross join lateral jsonb_array_elements(installment.value -> 'items') as item(value)
    group by installment.position, item.value ->> 'fee_agreement_item_id'
    having count(*) > 1
  ) then
    raise exception 'An agreement item can only appear once per installment';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) as installment(value)
    cross join lateral jsonb_array_elements(installment.value -> 'items') as item(value)
    where nullif(btrim(coalesce(item.value ->> 'fee_agreement_item_id', '')), '') is null
      or coalesce((item.value ->> 'amount_before_tax')::numeric, -1) < 0
      or coalesce((item.value ->> 'vat_amount')::numeric, -1) < 0
      or coalesce((item.value ->> 'total_amount')::numeric, -1) < 0
      or coalesce((item.value ->> 'sort_order')::integer, 0) < 0
      or (item.value ? 'allocation_percent'
        and item.value ->> 'allocation_percent' is not null
        and (
          (item.value ->> 'allocation_percent')::numeric < 0
          or (item.value ->> 'allocation_percent')::numeric > 100
        ))
      or (item.value ->> 'total_amount')::numeric
        <> (item.value ->> 'amount_before_tax')::numeric + (item.value ->> 'vat_amount')::numeric
  ) then
    raise exception 'Billing plan draft contains invalid installment items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments) as installment(value)
    cross join lateral jsonb_array_elements(installment.value -> 'items') as item(value)
    left join public.finance_fee_agreement_items agreement_item
      on agreement_item.id = (item.value ->> 'fee_agreement_item_id')::uuid
    where agreement_item.id is null
      or agreement_item.fee_agreement_id <> v_agreement.id
  ) then
    raise exception 'Billing plan draft cannot allocate items from another fee agreement';
  end if;

  -- VAT is retained per Agreement Item. The final allocation receives the exact
  -- residual after earlier allocations use round(before_tax * source_rate, 2).
  if exists (
    with allocation_input as (
      select
        installment.position as installment_position,
        item.position as item_position,
        (installment.value ->> 'installment_no')::integer as installment_no,
        coalesce((installment.value ->> 'sort_order')::integer, 0) as installment_sort_order,
        coalesce((item.value ->> 'sort_order')::integer, 0) as item_sort_order,
        agreement_item.id as fee_agreement_item_id,
        agreement_item.amount_before_tax as source_amount_before_tax,
        agreement_item.vat_amount as source_vat_amount,
        agreement_item.line_total as source_total_amount,
        agreement_item.vat_applicable,
        agreement_item.vat_rate,
        (item.value ->> 'amount_before_tax')::numeric as amount_before_tax,
        (item.value ->> 'vat_amount')::numeric as supplied_vat_amount,
        (item.value ->> 'total_amount')::numeric as supplied_total_amount
      from jsonb_array_elements(p_installments) with ordinality as installment(value, position)
      cross join lateral jsonb_array_elements(installment.value -> 'items') with ordinality as item(value, position)
      join public.finance_fee_agreement_items agreement_item
        on agreement_item.id = (item.value ->> 'fee_agreement_item_id')::uuid
    ), rounded as (
      select
        allocation_input.*,
        case when vat_applicable then round(amount_before_tax * vat_rate / 100, 2) else 0 end as rounded_vat_amount,
        row_number() over (
          partition by fee_agreement_item_id
          order by installment_no, installment_sort_order, item_sort_order, installment_position, item_position
        ) as allocation_row_no,
        count(*) over (partition by fee_agreement_item_id) as allocation_count,
        sum(amount_before_tax) over (partition by fee_agreement_item_id) as allocated_before_tax_total
      from allocation_input
    ), derived as (
      select
        rounded.*,
        case
          when not vat_applicable then 0
          when allocation_row_no = allocation_count then source_vat_amount
            - coalesce(sum(rounded_vat_amount) over (
              partition by fee_agreement_item_id
              order by installment_no, installment_sort_order, item_sort_order, installment_position, item_position
              rows between unbounded preceding and 1 preceding
            ), 0)
          else rounded_vat_amount
        end as expected_vat_amount
      from rounded
    )
    select 1
    from derived
    where supplied_vat_amount <> expected_vat_amount
      or supplied_total_amount <> amount_before_tax + expected_vat_amount
      or expected_vat_amount < 0
    union all
    select 1
    from derived
    group by fee_agreement_item_id, source_amount_before_tax, source_vat_amount, source_total_amount
    having sum(amount_before_tax) <> source_amount_before_tax
      or sum(expected_vat_amount) <> source_vat_amount
      or sum(amount_before_tax + expected_vat_amount) <> source_total_amount
  ) then
    raise exception 'Billing plan draft must preserve each fee agreement item VAT allocation and totals';
  end if;

  select
    coalesce(sum((item.value ->> 'amount_before_tax')::numeric), 0),
    coalesce(sum((item.value ->> 'vat_amount')::numeric), 0),
    coalesce(sum((item.value ->> 'total_amount')::numeric), 0)
  into
    v_plan_amount_before_tax,
    v_plan_vat_amount,
    v_plan_total_amount
  from jsonb_array_elements(p_installments) as installment(value)
  cross join lateral jsonb_array_elements(installment.value -> 'items') as item(value);

  v_installment_count := jsonb_array_length(p_installments);

  if p_billing_plan_id is null then
    insert into public.finance_billing_plans (
      id,
      fee_agreement_id,
      status,
      billing_method,
      currency,
      amount_before_tax,
      vat_amount,
      total_amount,
      title,
      description,
      installment_count,
      recurring_config_json,
      created_by_user_id,
      updated_by_user_id
    ) values (
      v_plan_id,
      v_agreement.id,
      'draft',
      v_billing_method,
      v_agreement.currency,
      v_plan_amount_before_tax,
      v_plan_vat_amount,
      v_plan_total_amount,
      nullif(btrim(coalesce(p_title, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      v_installment_count,
      p_recurring_config_json,
      auth.uid(),
      auth.uid()
    );
  else
    update public.finance_billing_plans
    set
      billing_method = v_billing_method,
      currency = v_agreement.currency,
      amount_before_tax = v_plan_amount_before_tax,
      vat_amount = v_plan_vat_amount,
      total_amount = v_plan_total_amount,
      title = nullif(btrim(coalesce(p_title, '')), ''),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      installment_count = v_installment_count,
      recurring_config_json = p_recurring_config_json,
      updated_by_user_id = auth.uid(),
      updated_at = now()
    where id = v_plan.id;

    delete from public.finance_billing_installments
    where billing_plan_id = v_plan.id;
  end if;

  for v_installment in
    select value from jsonb_array_elements(p_installments)
  loop
    select
      coalesce(sum((item.value ->> 'amount_before_tax')::numeric), 0),
      coalesce(sum((item.value ->> 'vat_amount')::numeric), 0),
      coalesce(sum((item.value ->> 'total_amount')::numeric), 0)
    into
      v_installment_amount_before_tax,
      v_installment_vat_amount,
      v_installment_total_amount
    from jsonb_array_elements(v_installment -> 'items') as item(value);

    insert into public.finance_billing_installments (
      billing_plan_id,
      installment_no,
      sort_order,
      title,
      trigger_description,
      trigger_type,
      due_date,
      milestone_code,
      recurring_period_start,
      recurring_period_end,
      status,
      amount_before_tax,
      vat_amount,
      total_amount,
      created_by_user_id,
      updated_by_user_id
    ) values (
      v_plan_id,
      (v_installment ->> 'installment_no')::integer,
      coalesce((v_installment ->> 'sort_order')::integer, 0),
      btrim(v_installment ->> 'title'),
      nullif(btrim(coalesce(v_installment ->> 'trigger_description', '')), ''),
      v_installment ->> 'trigger_type',
      nullif(btrim(coalesce(v_installment ->> 'due_date', '')), '')::date,
      nullif(btrim(coalesce(v_installment ->> 'milestone_code', '')), ''),
      nullif(btrim(coalesce(v_installment ->> 'recurring_period_start', '')), '')::date,
      nullif(btrim(coalesce(v_installment ->> 'recurring_period_end', '')), '')::date,
      'pending',
      v_installment_amount_before_tax,
      v_installment_vat_amount,
      v_installment_total_amount,
      auth.uid(),
      auth.uid()
    )
    returning id into v_installment_id;

    insert into public.finance_billing_installment_items (
      billing_installment_id,
      fee_agreement_item_id,
      amount_before_tax,
      vat_amount,
      total_amount,
      allocation_percent,
      sort_order,
      allocation_snapshot_json
    )
    select
      v_installment_id,
      (item.value ->> 'fee_agreement_item_id')::uuid,
      (item.value ->> 'amount_before_tax')::numeric,
      (item.value ->> 'vat_amount')::numeric,
      (item.value ->> 'total_amount')::numeric,
      nullif(btrim(coalesce(item.value ->> 'allocation_percent', '')), '')::numeric,
      coalesce((item.value ->> 'sort_order')::integer, 0),
      item.value -> 'allocation_snapshot_json'
    from jsonb_array_elements(v_installment -> 'items') as item(value);
  end loop;

  return v_plan_id;
end;
$$;

create or replace function public.set_finance_billing_plan_status(
  p_billing_plan_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.finance_billing_plans%rowtype;
  v_agreement public.finance_fee_agreements%rowtype;
  v_next_status text := lower(btrim(coalesce(p_next_status, '')));
  v_installment_count integer;
  v_amount_before_tax numeric(14, 2);
  v_vat_amount numeric(14, 2);
  v_total_amount numeric(14, 2);
  v_non_cancelled_installment_count integer;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance billing plan status';
  end if;

  select *
    into v_plan
  from public.finance_billing_plans
  where id = p_billing_plan_id
  for update;

  if v_plan.id is null then
    raise exception 'Billing plan not found';
  end if;

  if not (
    (v_plan.status = 'draft' and v_next_status in ('active', 'cancelled'))
    or (v_plan.status = 'active' and v_next_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid finance billing plan status transition';
  end if;

  if v_plan.status = 'draft' and v_next_status = 'active' then
    select *
      into v_agreement
    from public.finance_fee_agreements
    where id = v_plan.fee_agreement_id
    for update;

    if v_agreement.id is null then
      raise exception 'Fee agreement not found';
    end if;

    if not public.finance_fee_agreement_is_billing_eligible(v_agreement.id) then
      raise exception 'Billing plan requires an eligible commercial engagement';
    end if;

    if v_plan.billing_method <> v_agreement.billing_method then
      raise exception 'Billing plan method must match the fee agreement';
    end if;

    select count(*)::integer
      into v_installment_count
    from public.finance_billing_installments
    where billing_plan_id = v_plan.id
      and status <> 'cancelled';

    if v_installment_count = 0 then
      raise exception 'Billing plan requires at least one non-cancelled installment before activation';
    end if;

    if v_plan.installment_count <> v_installment_count then
      raise exception 'Billing plan installment count must match non-cancelled installments';
    end if;

    if (v_plan.billing_method = 'single' and v_installment_count <> 1)
      or (v_plan.billing_method = 'installments' and v_installment_count < 2) then
      raise exception 'Billing plan installment count is incompatible with its billing method';
    end if;

    if v_plan.amount_before_tax <> v_agreement.amount_before_tax
      or v_plan.vat_amount <> v_agreement.vat_amount
      or v_plan.total_amount <> v_agreement.total_amount then
      raise exception 'Billing plan totals must match the fee agreement before activation';
    end if;

    if exists (
      select 1
      from public.finance_billing_installments installment
      left join public.finance_billing_installment_items installment_item
        on installment_item.billing_installment_id = installment.id
      where installment.billing_plan_id = v_plan.id
      group by installment.id, installment.amount_before_tax, installment.vat_amount, installment.total_amount
      having count(installment_item.id) = 0
        or coalesce(sum(installment_item.amount_before_tax), 0) <> installment.amount_before_tax
        or coalesce(sum(installment_item.vat_amount), 0) <> installment.vat_amount
        or coalesce(sum(installment_item.total_amount), 0) <> installment.total_amount
    ) then
      raise exception 'Every billing installment must have matching installment items before activation';
    end if;

    select
      coalesce(sum(amount_before_tax), 0),
      coalesce(sum(vat_amount), 0),
      coalesce(sum(total_amount), 0)
    into
      v_amount_before_tax,
      v_vat_amount,
      v_total_amount
    from public.finance_billing_installments
    where billing_plan_id = v_plan.id
      and status <> 'cancelled';

    if v_amount_before_tax <> v_plan.amount_before_tax
      or v_vat_amount <> v_plan.vat_amount
      or v_total_amount <> v_plan.total_amount then
      raise exception 'Billing installment totals must match the billing plan before activation';
    end if;

    if exists (
      select 1
      from public.finance_billing_installment_items installment_item
      join public.finance_billing_installments installment
        on installment.id = installment_item.billing_installment_id
      join public.finance_fee_agreement_items agreement_item
        on agreement_item.id = installment_item.fee_agreement_item_id
      where installment.billing_plan_id = v_plan.id
        and agreement_item.fee_agreement_id <> v_agreement.id
    ) then
      raise exception 'Billing plan contains an item from another fee agreement';
    end if;

    if exists (
      select 1
      from public.finance_fee_agreement_items agreement_item
      left join public.finance_billing_installment_items installment_item
        on installment_item.fee_agreement_item_id = agreement_item.id
      left join public.finance_billing_installments installment
        on installment.id = installment_item.billing_installment_id
        and installment.billing_plan_id = v_plan.id
        and installment.status <> 'cancelled'
      where agreement_item.fee_agreement_id = v_agreement.id
      group by agreement_item.id, agreement_item.amount_before_tax, agreement_item.vat_amount, agreement_item.line_total
      having coalesce(sum(installment_item.amount_before_tax) filter (where installment.id is not null), 0)
          <> agreement_item.amount_before_tax
        or coalesce(sum(installment_item.vat_amount) filter (where installment.id is not null), 0)
          <> agreement_item.vat_amount
        or coalesce(sum(installment_item.total_amount) filter (where installment.id is not null), 0)
          <> agreement_item.line_total
    ) then
      raise exception 'Billing plan allocations must exactly match every fee agreement item before activation';
    end if;

    if exists (
      with allocation_input as (
        select
          agreement_item.id as fee_agreement_item_id,
          agreement_item.vat_applicable,
          agreement_item.vat_rate,
          agreement_item.vat_amount as source_vat_amount,
          installment_item.amount_before_tax,
          installment_item.vat_amount as allocated_vat_amount,
          installment_item.total_amount as allocated_total_amount,
          row_number() over (
            partition by agreement_item.id
            order by installment.installment_no, installment.sort_order, installment_item.sort_order, installment_item.id
          ) as allocation_row_no,
          count(*) over (partition by agreement_item.id) as allocation_count
        from public.finance_billing_installment_items installment_item
        join public.finance_billing_installments installment
          on installment.id = installment_item.billing_installment_id
        join public.finance_fee_agreement_items agreement_item
          on agreement_item.id = installment_item.fee_agreement_item_id
        where installment.billing_plan_id = v_plan.id
          and installment.status <> 'cancelled'
      ), rounded as (
        select
          allocation_input.*,
          case when vat_applicable then round(amount_before_tax * vat_rate / 100, 2) else 0 end as rounded_vat_amount
        from allocation_input
      ), derived as (
        select
          rounded.*,
          case
            when not vat_applicable then 0
            when allocation_row_no = allocation_count then source_vat_amount
              - coalesce(sum(rounded_vat_amount) over (
                partition by fee_agreement_item_id
                order by allocation_row_no
                rows between unbounded preceding and 1 preceding
              ), 0)
            else rounded_vat_amount
          end as expected_vat_amount
        from rounded
      )
      select 1
      from derived
      where allocated_vat_amount <> expected_vat_amount
        or allocated_total_amount <> amount_before_tax + expected_vat_amount
        or expected_vat_amount < 0
    ) then
      raise exception 'Billing plan VAT allocations must preserve the source fee agreement item tax treatment';
    end if;
  end if;

  -- Phase 4 Invoice issuance will set installments to invoiced through a controlled invoice RPC.
  if v_plan.status = 'active' and v_next_status = 'completed' then
    select count(*)::integer
      into v_non_cancelled_installment_count
    from public.finance_billing_installments
    where billing_plan_id = v_plan.id
      and status <> 'cancelled';

    if v_non_cancelled_installment_count = 0 then
      raise exception 'Billing plan requires at least one non-cancelled invoiced installment before completion';
    end if;

    if exists (
      select 1
      from public.finance_billing_installments
      where billing_plan_id = v_plan.id
        and status <> 'cancelled'
        and status <> 'invoiced'
    ) then
      raise exception 'Billing plan cannot be completed until every non-cancelled installment is invoiced';
    end if;
  end if;

  if v_next_status = 'cancelled' then
    if v_plan.status = 'draft' then
      if exists (
        select 1
        from public.finance_billing_installments
        where billing_plan_id = v_plan.id
          and status <> 'pending'
      ) then
        raise exception 'Draft billing plan contains an unexpected installment status';
      end if;

      update public.finance_billing_installments
      set
        status = 'cancelled',
        cancelled_at = now(),
        updated_by_user_id = auth.uid(),
        updated_at = now()
      where billing_plan_id = v_plan.id
        and status = 'pending';
    else
      if exists (
        select 1
        from public.finance_billing_installments
        where billing_plan_id = v_plan.id
          and status = 'invoiced'
      ) then
        raise exception 'Billing plan with invoiced installments cannot be cancelled in this phase';
      end if;

      update public.finance_billing_installments
      set
        status = 'cancelled',
        ready_to_invoice_at = null,
        cancelled_at = now(),
        updated_by_user_id = auth.uid(),
        updated_at = now()
      where billing_plan_id = v_plan.id
        and status in ('pending', 'ready_to_invoice');
    end if;
  end if;

  update public.finance_billing_plans
  set
    status = v_next_status,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_plan.id;

  return v_plan.id;
end;
$$;

create or replace function public.create_default_finance_billing_plan(
  p_fee_agreement_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_plan_id uuid := gen_random_uuid();
  v_installment_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to create a default finance billing plan';
  end if;

  select *
    into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;

  if not public.finance_fee_agreement_is_billing_eligible(v_agreement.id) then
    raise exception 'A default billing plan requires an eligible commercial engagement';
  end if;

  if v_agreement.billing_method <> 'single' then
    raise exception 'Default billing plan generation only supports single billing agreements';
  end if;

  if exists (
    select 1
    from public.finance_billing_plans
    where fee_agreement_id = v_agreement.id
      and status <> 'cancelled'
  ) then
    raise exception 'A non-cancelled billing plan already exists for this fee agreement';
  end if;

  insert into public.finance_billing_plans (
    id,
    fee_agreement_id,
    status,
    billing_method,
    currency,
    amount_before_tax,
    vat_amount,
    total_amount,
    title,
    installment_count,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_plan_id,
    v_agreement.id,
    'draft',
    v_agreement.billing_method,
    v_agreement.currency,
    v_agreement.amount_before_tax,
    v_agreement.vat_amount,
    v_agreement.total_amount,
    v_agreement.title,
    1,
    auth.uid(),
    auth.uid()
  );

  insert into public.finance_billing_installments (
    billing_plan_id,
    installment_no,
    sort_order,
    title,
    trigger_type,
    due_date,
    status,
    amount_before_tax,
    vat_amount,
    total_amount,
    created_by_user_id,
    updated_by_user_id
  ) values (
    v_plan_id,
    1,
    0,
    'งวดที่ 1 / Installment 1',
    'agreement_effective',
    v_agreement.effective_date,
    'pending',
    v_agreement.amount_before_tax,
    v_agreement.vat_amount,
    v_agreement.total_amount,
    auth.uid(),
    auth.uid()
  )
  returning id into v_installment_id;

  insert into public.finance_billing_installment_items (
    billing_installment_id,
    fee_agreement_item_id,
    amount_before_tax,
    vat_amount,
    total_amount,
    allocation_percent,
    sort_order,
    allocation_snapshot_json
  )
  select
    v_installment_id,
    agreement_item.id,
    agreement_item.amount_before_tax,
    agreement_item.vat_amount,
    agreement_item.line_total,
    100,
    agreement_item.sort_order,
    jsonb_build_object('source_fee_agreement_item_id', agreement_item.id)
  from public.finance_fee_agreement_items agreement_item
  where agreement_item.fee_agreement_id = v_agreement.id
  order by agreement_item.sort_order, agreement_item.created_at;

  return v_plan_id;
end;
$$;

revoke all on function public.save_finance_billing_plan_draft(uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.set_finance_billing_plan_status(uuid, text) from public, anon, authenticated;
revoke all on function public.create_default_finance_billing_plan(uuid) from public, anon, authenticated;
grant execute on function public.save_finance_billing_plan_draft(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.set_finance_billing_plan_status(uuid, text) to authenticated;
grant execute on function public.create_default_finance_billing_plan(uuid) to authenticated;
