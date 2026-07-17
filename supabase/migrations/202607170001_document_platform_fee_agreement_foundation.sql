-- Milestone 2: Document Platform foundation scoped to Fee Agreements.
-- Additive only. Existing Fee Agreements, quotations, counters, and snapshots are not rewritten.

create table if not exists public.document_numbering_profiles (
  document_type text primary key,
  display_prefix text not null,
  period_scope text not null default 'monthly',
  sequence_width integer not null default 4,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_numbering_profiles_period_scope_check check (period_scope in ('monthly', 'annual')),
  constraint document_numbering_profiles_sequence_width_check check (sequence_width between 4 and 12)
);

insert into public.document_numbering_profiles (document_type, display_prefix, period_scope, sequence_width)
values
  ('fee_agreement', 'VP-AG', 'annual', 6),
  ('invoice', 'VP-IV', 'monthly', 6),
  ('receipt', 'VP-RC', 'monthly', 6),
  ('tax_invoice', 'VP-TI', 'monthly', 6),
  ('legal_report', 'VP-LR', 'monthly', 6)
on conflict (document_type) do nothing;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  template_code text not null,
  name text not null,
  language_code text not null default 'th',
  status text not null default 'draft',
  metadata_json jsonb null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_language_check check (language_code in ('th', 'en')),
  constraint document_templates_status_check check (status in ('draft', 'active', 'retired')),
  constraint document_templates_type_code_unique unique (document_type, template_code)
);

create table if not exists public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.document_templates(id) on delete restrict,
  version_no integer not null,
  language_code text not null default 'th',
  definition_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  effective_from date null,
  effective_to date null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_template_versions_version_check check (version_no > 0),
  constraint document_template_versions_language_check check (language_code in ('th', 'en')),
  constraint document_template_versions_status_check check (status in ('draft', 'published', 'retired')),
  constraint document_template_versions_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint document_template_versions_unique unique (template_id, version_no, language_code)
);

create table if not exists public.document_clause_libraries (
  id uuid primary key default gen_random_uuid(),
  clause_code text not null unique,
  category text null,
  jurisdiction text null,
  metadata_json jsonb null,
  is_active boolean not null default true,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_clause_versions (
  id uuid primary key default gen_random_uuid(),
  clause_id uuid not null references public.document_clause_libraries(id) on delete restrict,
  version_no integer not null,
  language_code text not null default 'th',
  title text not null,
  content text not null,
  metadata_json jsonb null,
  effective_from date null,
  effective_to date null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_clause_versions_version_check check (version_no > 0),
  constraint document_clause_versions_language_check check (language_code in ('th', 'en')),
  constraint document_clause_versions_content_check check (btrim(content) <> ''),
  constraint document_clause_versions_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint document_clause_versions_unique unique (clause_id, version_no, language_code)
);

alter table public.finance_fee_agreements
  add column if not exists legal_terms_json jsonb null,
  add column if not exists signatories_json jsonb null,
  add column if not exists custom_clauses_json jsonb null,
  add column if not exists selected_template_id uuid null references public.document_templates(id) on delete restrict,
  add column if not exists selected_template_version_id uuid null references public.document_template_versions(id) on delete restrict,
  add column if not exists resolved_document_snapshot_json jsonb null,
  add column if not exists signed_document_snapshot_json jsonb null,
  add column if not exists document_version integer not null default 1,
  add column if not exists language_code text not null default 'th',
  add column if not exists commencement_date date null,
  add column if not exists sent_at timestamptz null,
  add column if not exists sent_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists signed_at timestamptz null,
  add column if not exists signed_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists signed_evidence_reference text null,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists cancelled_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists cancel_reason text null;

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_status_check;

alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_status_check
  check (status in ('draft', 'under_review', 'sent', 'signed', 'completed', 'cancelled', 'active'));

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_document_version_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_document_version_check
  check (document_version >= 0);

alter table public.finance_fee_agreements
  drop constraint if exists finance_fee_agreements_language_check;
alter table public.finance_fee_agreements
  add constraint finance_fee_agreements_language_check
  check (language_code in ('th', 'en'));

create unique index if not exists uq_finance_fee_agreements_agreement_no
  on public.finance_fee_agreements (agreement_no)
  where agreement_no is not null;

create table if not exists public.finance_fee_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  version_no integer not null,
  event_type text not null,
  reason text null,
  previous_version_id uuid null references public.finance_fee_agreement_versions(id) on delete set null,
  source_quotation_id uuid null references public.finance_quotations(id) on delete set null,
  template_id uuid null references public.document_templates(id) on delete set null,
  template_version_id uuid null references public.document_template_versions(id) on delete set null,
  document_snapshot_json jsonb not null,
  change_metadata_json jsonb null,
  actor_user_id uuid null references public.user_profiles(id) on delete set null,
  actor_email text null,
  actor_name text null,
  created_at timestamptz not null default now(),
  constraint finance_fee_agreement_versions_version_check check (version_no > 0),
  constraint finance_fee_agreement_versions_unique unique (fee_agreement_id, version_no)
);

create index if not exists idx_finance_fee_agreement_versions_agreement
  on public.finance_fee_agreement_versions (fee_agreement_id, version_no desc);

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
alter table public.document_clause_libraries enable row level security;
alter table public.document_clause_versions enable row level security;
alter table public.finance_fee_agreement_versions enable row level security;
alter table public.document_numbering_profiles enable row level security;

drop policy if exists "finance managers select document numbering profiles" on public.document_numbering_profiles;
create policy "finance managers select document numbering profiles" on public.document_numbering_profiles
  for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select document templates" on public.document_templates;
create policy "finance managers select document templates" on public.document_templates
  for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select document template versions" on public.document_template_versions;
create policy "finance managers select document template versions" on public.document_template_versions
  for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select document clauses" on public.document_clause_libraries;
create policy "finance managers select document clauses" on public.document_clause_libraries
  for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select document clause versions" on public.document_clause_versions;
create policy "finance managers select document clause versions" on public.document_clause_versions
  for select using (public.current_user_can_manage_finance_quotations());
drop policy if exists "finance managers select fee agreement versions" on public.finance_fee_agreement_versions;
create policy "finance managers select fee agreement versions" on public.finance_fee_agreement_versions
  for select using (public.current_user_can_manage_finance_quotations());

-- Keep current quotation behavior unchanged. Only fee_agreement gets an annual VP-AG sequence.
create or replace function public.generate_finance_document_no(
  p_doc_type text,
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_type text := lower(trim(coalesce(p_doc_type, '')));
  v_counter_type text;
  v_year integer := extract(year from p_issue_date)::integer;
  v_month integer;
  v_prefix_code text;
  v_prefix text;
  v_next integer;
  v_width integer := 4;
  v_period_scope text;
begin
  if v_input_type = '' then raise exception 'Document type is required'; end if;
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to allocate document number'; end if;

  if v_input_type = 'fee_agreement' then
    select display_prefix, period_scope, sequence_width
      into v_prefix_code, v_period_scope, v_width
    from public.document_numbering_profiles
    where document_type = 'fee_agreement' and is_active;
    if v_prefix_code is null then raise exception 'Fee Agreement numbering profile is not active'; end if;
    v_counter_type := 'fee_agreement';
    v_month := case when v_period_scope = 'annual' then null else extract(month from p_issue_date)::integer end;
    v_prefix := v_prefix_code || '-' || case when v_period_scope = 'annual' then to_char(p_issue_date, 'YYYY') else to_char(p_issue_date, 'YYYYMM') end || '-';
  else
    v_counter_type := upper(v_input_type);
    v_month := extract(month from p_issue_date)::integer;
    if v_counter_type = 'QT' then
      select nullif(trim(quotation_prefix), '') into v_prefix_code
      from public.finance_company_profiles where id = 'default';
      v_prefix_code := coalesce(v_prefix_code, 'VP-QT');
    else
      v_prefix_code := v_counter_type;
    end if;
    v_prefix := v_prefix_code || '-' || to_char(p_issue_date, 'YYYYMM') || '-';
  end if;

  insert into public.finance_document_counters (doc_type, year, month, prefix, last_no)
  values (v_counter_type, v_year, v_month, v_prefix, 1)
  on conflict (doc_type, year, (coalesce(month, 0))) do update set
    last_no = public.finance_document_counters.last_no + 1,
    prefix = excluded.prefix,
    updated_at = now()
  returning last_no into v_next;

  return v_prefix || lpad(v_next::text, v_width, '0');
end;
$$;

create or replace function public.build_finance_fee_agreement_document_snapshot(
  p_fee_agreement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_template jsonb := null;
  v_template_definition jsonb := null;
  v_resolved_clause_versions jsonb := '[]'::jsonb;
  v_items jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to build fee agreement document snapshot'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;

  if v_agreement.selected_template_version_id is not null then
    select tv.definition_json into v_template_definition
    from public.document_template_versions tv
    join public.document_templates t on t.id = tv.template_id
    where tv.id = v_agreement.selected_template_version_id
      and tv.template_id = v_agreement.selected_template_id
      and tv.status = 'published'
      and t.document_type = 'fee_agreement'
      and tv.language_code = v_agreement.language_code;
    if v_template_definition is null then raise exception 'Selected document template version not found'; end if;

    -- Template definitions may carry clause_version_ids. Resolve immutable clause content now;
    -- the resulting snapshot never relies on a mutable clause-library reference.
    if exists (
      select 1
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_template_definition->'clause_version_ids') = 'array'
          then v_template_definition->'clause_version_ids' else '[]'::jsonb end
      ) requested(clause_version_id_text)
      left join public.document_clause_versions cv
        on cv.id = case
          when requested.clause_version_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then requested.clause_version_id_text::uuid
          else null
        end
        and cv.language_code = v_agreement.language_code
      where cv.id is null
    ) then
      raise exception 'Selected template contains an unavailable or language-mismatched clause version';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'clause_id', cv.clause_id,
      'clause_version_id', cv.id,
      'clause_code', cl.clause_code,
      'version_no', cv.version_no,
      'language_code', cv.language_code,
      'title', cv.title,
      'content', cv.content,
      'metadata', cv.metadata_json
    ) order by requested.ordinality), '[]'::jsonb)
    into v_resolved_clause_versions
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_template_definition->'clause_version_ids') = 'array'
        then v_template_definition->'clause_version_ids' else '[]'::jsonb end
    ) with ordinality requested(clause_version_id_text, ordinality)
    join public.document_clause_versions cv
      on cv.id = requested.clause_version_id_text::uuid
    join public.document_clause_libraries cl on cl.id = cv.clause_id;

    select jsonb_build_object(
      'template_id', tv.template_id,
      'template_version_id', tv.id,
      'template_code', t.template_code,
      'template_name', t.name,
      'language_code', tv.language_code,
      'version_no', tv.version_no,
      'definition', tv.definition_json,
      'resolved_clause_versions', v_resolved_clause_versions
    ) into v_template
    from public.document_template_versions tv
    join public.document_templates t on t.id = tv.template_id
    where tv.id = v_agreement.selected_template_version_id
      and tv.template_id = v_agreement.selected_template_id
      and tv.status = 'published'
      and t.document_type = 'fee_agreement'
      and tv.language_code = v_agreement.language_code;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'source_quotation_item_id', i.source_quotation_item_id,
    'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
    'vat_applicable', i.vat_applicable, 'vat_rate', i.vat_rate,
    'amount_before_tax', i.amount_before_tax, 'vat_amount', i.vat_amount,
    'line_total', i.line_total, 'tax_category', i.tax_category,
    'sort_order', i.sort_order, 'source_item_snapshot', i.item_snapshot_json
  ) order by i.sort_order, i.id), '[]'::jsonb)
  into v_items
  from public.finance_fee_agreement_items i
  where i.fee_agreement_id = v_agreement.id;

  return jsonb_build_object(
    'schema_version', 1,
    'document_type', 'fee_agreement',
    'agreement', jsonb_build_object(
      'id', v_agreement.id,
      'agreement_no', v_agreement.agreement_no,
      'title', v_agreement.title,
      'status', v_agreement.status,
      'language_code', v_agreement.language_code,
      'effective_date', v_agreement.effective_date,
      'commencement_date', v_agreement.commencement_date,
      'expiry_date', v_agreement.expiry_date,
      'currency', v_agreement.currency,
      'totals', jsonb_build_object('amount_before_tax', v_agreement.amount_before_tax, 'vat_amount', v_agreement.vat_amount, 'total_amount', v_agreement.total_amount)
    ),
    'source_quotation_snapshot', coalesce(v_agreement.source_document_snapshot_json, '{}'::jsonb),
    'agreement_items', v_items,
    'commercial_terms', coalesce(v_agreement.commercial_terms_snapshot_json, '{}'::jsonb),
    'legal_terms', coalesce(v_agreement.legal_terms_json, '{}'::jsonb),
    'signatories', coalesce(v_agreement.signatories_json, '[]'::jsonb),
    'custom_clauses', coalesce(v_agreement.custom_clauses_json, '[]'::jsonb),
    'template', v_template,
    'source_snapshots', jsonb_build_object('client', coalesce(v_agreement.client_snapshot_json, '{}'::jsonb), 'matter', coalesce(v_agreement.matter_snapshot_json, '{}'::jsonb), 'company', coalesce(v_agreement.company_snapshot_json, '{}'::jsonb))
  );
end;
$$;

create or replace function public.record_finance_fee_agreement_version(
  p_fee_agreement_id uuid,
  p_event_type text,
  p_reason text default null,
  p_change_metadata_json jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_previous_version_id uuid;
  v_next_version integer;
  v_snapshot jsonb;
  v_actor_name text;
  v_actor_email text;
  v_version_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to record fee agreement version'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if nullif(btrim(coalesce(p_event_type, '')), '') is null then raise exception 'Version event is required'; end if;

  select id into v_previous_version_id from public.finance_fee_agreement_versions
  where fee_agreement_id = v_agreement.id order by version_no desc limit 1;
  v_next_version := coalesce(v_agreement.document_version, 0) + 1;
  select coalesce(nullif(btrim(staff_name), ''), nullif(btrim(full_name), ''), email), email
    into v_actor_name, v_actor_email
  from public.user_profiles where id = auth.uid();
  v_snapshot := public.build_finance_fee_agreement_document_snapshot(v_agreement.id) || jsonb_build_object(
    'version_context', jsonb_build_object(
      'version_no', v_next_version, 'event_type', btrim(p_event_type), 'recorded_at', now(),
      'actor_user_id', auth.uid(), 'actor_email', v_actor_email, 'actor_name', v_actor_name
    )
  );

  update public.finance_fee_agreements set
    document_version = v_next_version,
    resolved_document_snapshot_json = case when p_event_type = 'sent' then v_snapshot else resolved_document_snapshot_json end,
    signed_document_snapshot_json = case when p_event_type = 'signed' then v_snapshot else signed_document_snapshot_json end,
    updated_at = now()
  where id = v_agreement.id;

  insert into public.finance_fee_agreement_versions (
    fee_agreement_id, version_no, event_type, reason, previous_version_id, source_quotation_id,
    template_id, template_version_id, document_snapshot_json, change_metadata_json,
    actor_user_id, actor_email, actor_name
  ) values (
    v_agreement.id, v_next_version, btrim(p_event_type), nullif(btrim(coalesce(p_reason, '')), ''), v_previous_version_id,
    v_agreement.source_quotation_id, v_agreement.selected_template_id, v_agreement.selected_template_version_id,
    v_snapshot, p_change_metadata_json, auth.uid(), v_actor_email, v_actor_name
  ) returning id into v_version_id;
  return v_version_id;
end;
$$;

create or replace function public.create_finance_fee_agreement_from_quotation(p_quotation_id uuid)
returns table (fee_agreement_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare q public.finance_quotations%rowtype; v_snapshot jsonb; v_id uuid; v_existing_count integer; v_agreement_no text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create fee agreement'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can create fee agreements'; end if;
  v_snapshot := q.document_data_snapshot_json;
  if v_snapshot is null or v_snapshot->>'frozen_at' is null or jsonb_typeof(v_snapshot->'items') <> 'array' or jsonb_typeof(v_snapshot->'payment_terms') <> 'object' then raise exception 'Accepted quotation has no frozen document snapshot'; end if;
  select count(*)::integer into v_existing_count from public.finance_fee_agreements where source_type = 'quotation' and source_quotation_id = q.id and status <> 'cancelled';
  if v_existing_count > 1 then raise exception 'Conflicting fee agreements exist for this quotation'; end if;
  select id into v_id from public.finance_fee_agreements where source_type = 'quotation' and source_quotation_id = q.id and status <> 'cancelled' order by created_at, id limit 1 for update;
  if v_id is not null then return query select v_id, false; return; end if;

  v_agreement_no := public.generate_finance_document_no('fee_agreement', coalesce(q.accepted_at::date, q.issue_date, current_date));
  insert into public.finance_fee_agreements (
    agreement_no, title, client_id, case_id, advisory_matter_id, source_type, source_quotation_id, status,
    currency, amount_before_tax, vat_amount, total_amount, billing_method, client_snapshot_json,
    matter_snapshot_json, company_snapshot_json, commercial_terms_snapshot_json, source_document_snapshot_json,
    legal_terms_json, signatories_json, custom_clauses_json, document_version, language_code,
    created_by_user_id, updated_by_user_id
  ) values (
    v_agreement_no, concat('Fee Agreement - ', q.quotation_no), q.client_id, q.case_id, q.advisory_matter_id,
    'quotation', q.id, 'draft', 'THB',
    (v_snapshot->'totals'->>'subtotal_vatable')::numeric + (v_snapshot->'totals'->>'subtotal_non_vatable')::numeric,
    (v_snapshot->'totals'->>'vat_amount')::numeric, (v_snapshot->'totals'->>'grand_total')::numeric,
    coalesce(v_snapshot->'payment_terms'->>'payment_method_type', 'single'),
    v_snapshot->'client', v_snapshot->'matter', v_snapshot->'company',
    jsonb_build_object('commercial', v_snapshot->'commercial', 'payment_terms', v_snapshot->'payment_terms'),
    v_snapshot, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, 'th', auth.uid(), auth.uid()
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
  from jsonb_array_elements(v_snapshot->'items') item order by coalesce((item->>'sort_order')::integer, 0);
  perform public.record_finance_fee_agreement_version(v_id, 'created', null, jsonb_build_object('source_quotation_id', q.id, 'source_snapshot_schema_version', v_snapshot->>'version'));
  return query select v_id, true;
end;
$$;

create or replace function public.save_finance_fee_agreement_draft_metadata(
  p_fee_agreement_id uuid, p_title text, p_effective_date date, p_expiry_date date, p_billing_method text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save fee agreement'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.status not in ('draft', 'under_review') then raise exception 'Only draft or under review fee agreements can be edited'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Title is required'; end if;
  if v_billing_method not in ('single', 'installments', 'milestone', 'recurring', 'manual') then raise exception 'Invalid billing method'; end if;
  if p_expiry_date is not null and p_effective_date is not null and p_expiry_date < p_effective_date then raise exception 'Expiry date cannot be before effective date'; end if;
  update public.finance_fee_agreements set title = btrim(p_title), effective_date = p_effective_date, expiry_date = p_expiry_date, billing_method = v_billing_method, updated_by_user_id = auth.uid(), updated_at = now() where id = v_agreement.id;
  perform public.record_finance_fee_agreement_version(v_agreement.id, case when v_agreement.status = 'under_review' then 'under_review_metadata_saved' else 'draft_metadata_saved' end, null, jsonb_build_object('fields', jsonb_build_array('title', 'effective_date', 'expiry_date', 'billing_method')));
  return v_agreement.id;
end;
$$;

create or replace function public.save_finance_fee_agreement_draft_legal_terms(
  p_fee_agreement_id uuid, p_legal_terms_json jsonb, p_signatories_json jsonb,
  p_custom_clauses_json jsonb, p_template_version_id uuid, p_language_code text,
  p_commencement_date date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_template_id uuid; v_language text := lower(btrim(coalesce(p_language_code, 'th')));
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save fee agreement legal terms'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if v_agreement.status not in ('draft', 'under_review') then raise exception 'Only draft or under review fee agreements can be edited'; end if;
  if v_language not in ('th', 'en') then raise exception 'Invalid agreement language'; end if;
  if p_legal_terms_json is not null and jsonb_typeof(p_legal_terms_json) <> 'object' then raise exception 'Legal terms must be an object'; end if;
  if p_signatories_json is not null and jsonb_typeof(p_signatories_json) <> 'array' then raise exception 'Signatories must be an array'; end if;
  if p_custom_clauses_json is not null and jsonb_typeof(p_custom_clauses_json) <> 'array' then raise exception 'Custom clauses must be an array'; end if;
  if p_template_version_id is not null then
    select tv.template_id into v_template_id
    from public.document_template_versions tv
    join public.document_templates t on t.id = tv.template_id
    where tv.id = p_template_version_id
      and tv.status = 'published'
      and t.document_type = 'fee_agreement'
      and tv.language_code = v_language;
    if v_template_id is null then raise exception 'Selected template version is not published'; end if;
  end if;
  update public.finance_fee_agreements set legal_terms_json = coalesce(p_legal_terms_json, '{}'::jsonb), signatories_json = coalesce(p_signatories_json, '[]'::jsonb), custom_clauses_json = coalesce(p_custom_clauses_json, '[]'::jsonb), selected_template_id = v_template_id, selected_template_version_id = p_template_version_id, language_code = v_language, commencement_date = p_commencement_date, updated_by_user_id = auth.uid(), updated_at = now() where id = v_agreement.id;
  perform public.record_finance_fee_agreement_version(v_agreement.id, case when v_agreement.status = 'under_review' then 'under_review_legal_terms_saved' else 'draft_legal_terms_saved' end, null, jsonb_build_object('fields', jsonb_build_array('legal_terms', 'signatories', 'custom_clauses', 'template_version', 'language_code', 'commencement_date')));
  return v_agreement.id;
end;
$$;

create or replace function public.set_finance_fee_agreement_status(p_fee_agreement_id uuid, p_next_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agreement public.finance_fee_agreements%rowtype; v_next text := lower(btrim(coalesce(p_next_status, ''))); v_event text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update finance fee agreement status'; end if;
  select * into v_agreement from public.finance_fee_agreements where id = p_fee_agreement_id for update;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;
  if not (
    (v_agreement.status = 'draft' and v_next in ('under_review', 'cancelled')) or
    (v_agreement.status = 'under_review' and v_next in ('sent', 'cancelled')) or
    (v_agreement.status = 'sent' and v_next in ('signed', 'cancelled')) or
    (v_agreement.status = 'signed' and v_next = 'completed') or
    -- Preserve the deployed legacy detail page during the migration/code rollout window.
    (v_agreement.status = 'draft' and v_next = 'active') or
    (v_agreement.status = 'active' and v_next in ('completed', 'cancelled'))
  ) then raise exception 'Invalid finance fee agreement status transition'; end if;
  if v_next in ('under_review', 'sent', 'active') and (v_agreement.source_document_snapshot_json is null or v_agreement.commercial_terms_snapshot_json is null) then raise exception 'Fee agreement source evidence is required'; end if;
  if v_next = 'sent' and (v_agreement.agreement_no is null or v_agreement.legal_terms_json is null or v_agreement.signatories_json is null) then raise exception 'Fee agreement legal document data is not ready'; end if;
  if v_next = 'cancelled' and exists (select 1 from public.finance_billing_plans where fee_agreement_id = v_agreement.id and status <> 'cancelled') then raise exception 'Cancel the Billing Plan before cancelling this agreement'; end if;
  update public.finance_fee_agreements set
    status = v_next,
    sent_at = case when v_next = 'sent' then now() else sent_at end,
    sent_by_user_id = case when v_next = 'sent' then auth.uid() else sent_by_user_id end,
    signed_at = case when v_next = 'signed' then now() else signed_at end,
    signed_by_user_id = case when v_next = 'signed' then auth.uid() else signed_by_user_id end,
    cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end,
    cancelled_by_user_id = case when v_next = 'cancelled' then auth.uid() else cancelled_by_user_id end,
    updated_by_user_id = auth.uid(), updated_at = now()
  where id = v_agreement.id;
  v_event := v_next;
  perform public.record_finance_fee_agreement_version(v_agreement.id, v_event, null, jsonb_build_object('from_status', v_agreement.status, 'to_status', v_next));
  return v_agreement.id;
end;
$$;

revoke all on function public.build_finance_fee_agreement_document_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.record_finance_fee_agreement_version(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.generate_finance_document_no(text, date) from public, anon, authenticated;
revoke all on function public.create_finance_fee_agreement_from_quotation(uuid) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_metadata(uuid, text, date, date, text) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
revoke all on function public.set_finance_fee_agreement_status(uuid, text) from public, anon, authenticated;
grant execute on function public.create_finance_fee_agreement_from_quotation(uuid) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_metadata(uuid, text, date, date, text) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_legal_terms(uuid, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid, text) to authenticated;
