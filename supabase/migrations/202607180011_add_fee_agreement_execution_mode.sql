-- Add the Fee Agreement execution-mode contract without rewriting historical snapshots.

alter table public.finance_fee_agreements
  add column if not exists execution_mode text null;

alter table public.finance_fee_agreements
  alter column execution_mode set default 'paper';

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.finance_fee_agreements'::regclass
      and conname = 'finance_fee_agreements_execution_mode_check'
  ) then
    alter table public.finance_fee_agreements
      add constraint finance_fee_agreements_execution_mode_check
      check (execution_mode is null or execution_mode in ('paper', 'electronic'));
  end if;
end;
$constraint$;

comment on column public.finance_fee_agreements.execution_mode is
  'Controlled execution presentation: paper or electronic. Null is retained only for legacy agreements created before this foundation.';

create or replace function public.save_finance_fee_agreement_draft_atomic_impl(
  p_fee_agreement_id uuid,
  p_title text,
  p_agreement_date date,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date,
  p_execution_mode text,
  p_preserve_agreement_date boolean,
  p_preserve_execution_mode boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
  v_language text := lower(btrim(coalesce(p_language_code, 'th')));
  v_agreement_date date;
  v_execution_mode text;
  v_legal_terms jsonb;
  v_signatories jsonb;
  v_custom_clauses jsonb;
  v_template_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save fee agreement';
  end if;

  select *
  into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;
  if v_agreement.status not in ('draft', 'under_review') then
    raise exception 'Only draft or under review fee agreements can be edited';
  end if;
  if v_title = '' then
    raise exception 'Title is required';
  end if;
  if v_billing_method not in ('single', 'installments', 'milestone', 'recurring', 'manual') then
    raise exception 'Invalid billing method';
  end if;
  if p_expiry_date is not null and p_effective_date is not null and p_expiry_date < p_effective_date then
    raise exception 'Expiry date cannot be before effective date';
  end if;
  if v_language not in ('th', 'en') then
    raise exception 'Invalid agreement language';
  end if;
  if p_legal_terms_json is not null and jsonb_typeof(p_legal_terms_json) <> 'object' then
    raise exception 'Legal terms must be an object';
  end if;
  if p_signatories_json is not null and jsonb_typeof(p_signatories_json) <> 'array' then
    raise exception 'Signatories must be an array';
  end if;
  if p_custom_clauses_json is not null and jsonb_typeof(p_custom_clauses_json) <> 'array' then
    raise exception 'Custom clauses must be an array';
  end if;

  v_agreement_date := case
    when coalesce(p_preserve_agreement_date, false) then v_agreement.agreement_date
    else p_agreement_date
  end;
  v_execution_mode := case
    when coalesce(p_preserve_execution_mode, false) then v_agreement.execution_mode
    else lower(btrim(coalesce(p_execution_mode, 'paper')))
  end;
  if v_execution_mode is not null and v_execution_mode not in ('paper', 'electronic') then
    raise exception 'Invalid fee agreement execution mode';
  end if;

  v_legal_terms := coalesce(p_legal_terms_json, '{}'::jsonb);
  v_signatories := public.normalize_finance_fee_agreement_signatories(coalesce(p_signatories_json, '[]'::jsonb));
  v_custom_clauses := coalesce(p_custom_clauses_json, '[]'::jsonb);

  if p_template_version_id is not null then
    select tv.template_id
    into v_template_id
    from public.document_template_versions as tv
    join public.document_templates as t on t.id = tv.template_id
    where tv.id = p_template_version_id
      and t.document_type = 'fee_agreement'
      and tv.language_code = v_language
      and (
        (p_template_version_id = v_agreement.selected_template_version_id and tv.status in ('published', 'retired'))
        or (
          tv.status = 'published'
          and t.status = 'active'
          and (tv.effective_from is null or tv.effective_from <= current_date)
          and (tv.effective_to is null or tv.effective_to >= current_date)
        )
      );

    if v_template_id is null then
      raise exception 'Selected template version is unavailable for this agreement';
    end if;
  end if;

  if v_agreement.title is not distinct from v_title
    and v_agreement.agreement_date is not distinct from v_agreement_date
    and v_agreement.effective_date is not distinct from p_effective_date
    and v_agreement.expiry_date is not distinct from p_expiry_date
    and v_agreement.billing_method is not distinct from v_billing_method
    and v_agreement.execution_mode is not distinct from v_execution_mode
    and v_agreement.legal_terms_json is not distinct from v_legal_terms
    and v_agreement.signatories_json is not distinct from v_signatories
    and v_agreement.custom_clauses_json is not distinct from v_custom_clauses
    and v_agreement.selected_template_id is not distinct from v_template_id
    and v_agreement.selected_template_version_id is not distinct from p_template_version_id
    and v_agreement.language_code is not distinct from v_language
    and v_agreement.commencement_date is not distinct from p_commencement_date
  then
    return v_agreement.id;
  end if;

  update public.finance_fee_agreements
  set title = v_title,
      agreement_date = v_agreement_date,
      effective_date = p_effective_date,
      expiry_date = p_expiry_date,
      billing_method = v_billing_method,
      execution_mode = v_execution_mode,
      legal_terms_json = v_legal_terms,
      signatories_json = v_signatories,
      custom_clauses_json = v_custom_clauses,
      selected_template_id = v_template_id,
      selected_template_version_id = p_template_version_id,
      language_code = v_language,
      commencement_date = p_commencement_date,
      updated_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_agreement.id;

  perform public.record_finance_fee_agreement_version(
    v_agreement.id,
    case when v_agreement.status = 'under_review' then 'under_review_saved' else 'draft_saved' end,
    null,
    jsonb_build_object(
      'fields',
      jsonb_build_array(
        'title',
        'agreement_date',
        'effective_date',
        'expiry_date',
        'billing_method',
        'execution_mode',
        'legal_terms',
        'signatories',
        'custom_clauses',
        'template_version',
        'language_code',
        'commencement_date'
      )
    )
  );

  return v_agreement.id;
end;
$$;

-- Compatibility signature for clients deployed before agreement_date and execution_mode.
create or replace function public.save_finance_fee_agreement_draft_atomic(
  p_fee_agreement_id uuid,
  p_title text,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.save_finance_fee_agreement_draft_atomic_impl(
    p_fee_agreement_id,
    p_title,
    null,
    p_effective_date,
    p_expiry_date,
    p_billing_method,
    p_legal_terms_json,
    p_signatories_json,
    p_custom_clauses_json,
    p_template_version_id,
    p_language_code,
    p_commencement_date,
    null,
    true,
    true
  );
$$;

-- Compatibility signature for the currently deployed frontend. It preserves execution_mode.
create or replace function public.save_finance_fee_agreement_draft_atomic(
  p_fee_agreement_id uuid,
  p_title text,
  p_agreement_date date,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.save_finance_fee_agreement_draft_atomic_impl(
    p_fee_agreement_id,
    p_title,
    p_agreement_date,
    p_effective_date,
    p_expiry_date,
    p_billing_method,
    p_legal_terms_json,
    p_signatories_json,
    p_custom_clauses_json,
    p_template_version_id,
    p_language_code,
    p_commencement_date,
    null,
    false,
    true
  );
$$;

-- New signature. PostgREST resolves it by the additional p_execution_mode argument name.
create or replace function public.save_finance_fee_agreement_draft_atomic(
  p_fee_agreement_id uuid,
  p_title text,
  p_agreement_date date,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text,
  p_legal_terms_json jsonb,
  p_signatories_json jsonb,
  p_custom_clauses_json jsonb,
  p_template_version_id uuid,
  p_language_code text,
  p_commencement_date date,
  p_execution_mode text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.save_finance_fee_agreement_draft_atomic_impl(
    p_fee_agreement_id,
    p_title,
    p_agreement_date,
    p_effective_date,
    p_expiry_date,
    p_billing_method,
    p_legal_terms_json,
    p_signatories_json,
    p_custom_clauses_json,
    p_template_version_id,
    p_language_code,
    p_commencement_date,
    p_execution_mode,
    false,
    false
  );
$$;

drop function if exists public.save_finance_fee_agreement_draft_atomic_impl(
  uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date, boolean
);

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
  v_template jsonb;
  v_items jsonb;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to build fee agreement document snapshot';
  end if;
  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id;
  if v_agreement.id is null then raise exception 'Fee agreement not found'; end if;

  v_template := public.resolve_finance_fee_agreement_template_content(v_agreement.id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'source_quotation_item_id', i.source_quotation_item_id,
    'description', i.description,
    'quantity', i.quantity,
    'unit_price', i.unit_price,
    'vat_applicable', i.vat_applicable,
    'vat_rate', i.vat_rate,
    'amount_before_tax', i.amount_before_tax,
    'vat_amount', i.vat_amount,
    'line_total', i.line_total,
    'tax_category', i.tax_category,
    'sort_order', i.sort_order,
    'source_item_snapshot', i.item_snapshot_json
  ) order by i.sort_order, i.id), '[]'::jsonb)
  into v_items
  from public.finance_fee_agreement_items as i
  where i.fee_agreement_id = v_agreement.id;

  return jsonb_build_object(
    'schema_version', 3,
    'resolver_schema_version', 3,
    'document_type', 'fee_agreement',
    'agreement', jsonb_build_object(
      'id', v_agreement.id,
      'agreement_no', v_agreement.agreement_no,
      'title', v_agreement.title,
      'status', v_agreement.status,
      'language_code', v_agreement.language_code,
      'execution_mode', coalesce(v_agreement.execution_mode, 'paper'),
      'agreement_date', v_agreement.agreement_date,
      'effective_date', v_agreement.effective_date,
      'commencement_date', v_agreement.commencement_date,
      'expiry_date', v_agreement.expiry_date,
      'currency', v_agreement.currency,
      'totals', jsonb_build_object(
        'amount_before_tax', v_agreement.amount_before_tax,
        'vat_amount', v_agreement.vat_amount,
        'total_amount', v_agreement.total_amount
      )
    ),
    'source_quotation_snapshot', coalesce(v_agreement.source_document_snapshot_json, '{}'::jsonb),
    'agreement_items', v_items,
    'commercial_terms', coalesce(v_agreement.commercial_terms_snapshot_json, '{}'::jsonb),
    'legal_terms', coalesce(v_agreement.legal_terms_json, '{}'::jsonb),
    'signatories', coalesce(v_agreement.signatories_json, '[]'::jsonb),
    'custom_clauses', coalesce(v_agreement.custom_clauses_json, '[]'::jsonb),
    'template', v_template,
    'source_snapshots', jsonb_build_object(
      'client', coalesce(v_agreement.client_snapshot_json, '{}'::jsonb),
      'matter', coalesce(v_agreement.matter_snapshot_json, '{}'::jsonb),
      'company', coalesce(v_agreement.company_snapshot_json, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.save_finance_fee_agreement_draft_atomic_impl(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.build_finance_fee_agreement_document_snapshot(uuid) from public, anon, authenticated;

grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, date, text, jsonb, jsonb, jsonb, uuid, text, date, text) to authenticated;
