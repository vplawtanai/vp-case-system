-- Phase 3D-C1: draft metadata only. Source documents, commercial terms, items, and totals remain immutable.
create or replace function public.save_finance_fee_agreement_draft_metadata(
  p_fee_agreement_id uuid,
  p_title text,
  p_effective_date date,
  p_expiry_date date,
  p_billing_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.finance_fee_agreements%rowtype;
  v_billing_method text := lower(btrim(coalesce(p_billing_method, '')));
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save fee agreement';
  end if;

  select * into v_agreement
  from public.finance_fee_agreements
  where id = p_fee_agreement_id
  for update;

  if v_agreement.id is null then
    raise exception 'Fee agreement not found';
  end if;
  if v_agreement.status <> 'draft' then
    raise exception 'Only draft fee agreements can be edited';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Title is required';
  end if;
  if v_billing_method not in ('single', 'installments', 'milestone', 'recurring', 'manual') then
    raise exception 'Invalid billing method';
  end if;
  if p_expiry_date is not null and p_effective_date is not null and p_expiry_date < p_effective_date then
    raise exception 'Expiry date cannot be before effective date';
  end if;

  update public.finance_fee_agreements
  set
    title = btrim(p_title),
    effective_date = p_effective_date,
    expiry_date = p_expiry_date,
    billing_method = v_billing_method,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_agreement.id;

  return v_agreement.id;
end;
$$;

revoke all on function public.save_finance_fee_agreement_draft_metadata(uuid, text, date, date, text) from public, anon, authenticated;
grant execute on function public.save_finance_fee_agreement_draft_metadata(uuid, text, date, date, text) to authenticated;
