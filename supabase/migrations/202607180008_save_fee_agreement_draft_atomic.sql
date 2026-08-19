-- Persist all editable Fee Agreement draft domains as one coherent version.

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
  v_language text := lower(btrim(coalesce(p_language_code, 'th')));
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

  v_legal_terms := coalesce(p_legal_terms_json, '{}'::jsonb);
  v_signatories := public.normalize_finance_fee_agreement_signatories(coalesce(p_signatories_json, '[]'::jsonb));
  v_custom_clauses := coalesce(p_custom_clauses_json, '[]'::jsonb);

  if p_template_version_id is not null then
    select tv.template_id
    into v_template_id
    from public.document_template_versions tv
    join public.document_templates t on t.id = tv.template_id
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
    and v_agreement.effective_date is not distinct from p_effective_date
    and v_agreement.expiry_date is not distinct from p_expiry_date
    and v_agreement.billing_method is not distinct from v_billing_method
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
      effective_date = p_effective_date,
      expiry_date = p_expiry_date,
      billing_method = v_billing_method,
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
        'effective_date',
        'expiry_date',
        'billing_method',
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

revoke all on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) from public, anon, authenticated;
grant execute on function public.save_finance_fee_agreement_draft_atomic(uuid, text, date, date, text, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;
