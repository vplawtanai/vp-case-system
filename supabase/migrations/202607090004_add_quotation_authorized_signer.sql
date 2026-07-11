alter table public.finance_quotations
  add column if not exists authorized_signer_key text null,
  add column if not exists authorized_signer_name text null,
  add column if not exists authorized_signer_position text null,
  add column if not exists authorized_signer_email text null;

drop function if exists public.save_finance_quotation_draft(
  uuid,
  uuid,
  bigint,
  uuid,
  date,
  date,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  text,
  text,
  jsonb
);

create or replace function public.save_finance_quotation_draft(
  p_quotation_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid,
  p_issue_date date,
  p_valid_until date,
  p_scope_of_legal_services text,
  p_note text,
  p_internal_note text,
  p_authorized_signer_key text,
  p_authorized_signer_name text,
  p_authorized_signer_position text,
  p_authorized_signer_email text,
  p_subtotal_vatable numeric,
  p_subtotal_non_vatable numeric,
  p_vat_amount numeric,
  p_grand_total numeric,
  p_client_snapshot_json jsonb,
  p_matter_snapshot_json jsonb,
  p_document_data_snapshot_json jsonb,
  p_updated_by_user_id uuid,
  p_updated_by_email text,
  p_updated_by_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save finance quotation draft';
  end if;

  if p_case_id is not null and p_advisory_matter_id is not null then
    raise exception 'Select either case or advisory matter, not both';
  end if;

  if p_valid_until is not null and p_valid_until < p_issue_date then
    raise exception 'Valid until cannot be before issue date';
  end if;

  if trim(coalesce(p_authorized_signer_key, '')) = '' then
    raise exception 'Authorized signer is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Quotation draft requires at least one line item';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    where trim(coalesce(item->>'description', '')) = ''
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
  ) then
    raise exception 'Quotation draft contains invalid line items';
  end if;

  select status
    into v_status
  from public.finance_quotations
  where id = p_quotation_id
  for update;

  if v_status is null then
    raise exception 'Quotation not found';
  end if;

  if v_status <> 'draft' then
    raise exception 'Only draft quotations can be edited';
  end if;

  update public.finance_quotations
  set
    client_id = p_client_id,
    case_id = p_case_id,
    advisory_matter_id = p_advisory_matter_id,
    issue_date = p_issue_date,
    valid_until = p_valid_until,
    scope_of_legal_services = nullif(trim(coalesce(p_scope_of_legal_services, '')), ''),
    authorized_signer_key = nullif(trim(coalesce(p_authorized_signer_key, '')), ''),
    authorized_signer_name = nullif(trim(coalesce(p_authorized_signer_name, '')), ''),
    authorized_signer_position = nullif(trim(coalesce(p_authorized_signer_position, '')), ''),
    authorized_signer_email = nullif(trim(coalesce(p_authorized_signer_email, '')), ''),
    subtotal_vatable = p_subtotal_vatable,
    subtotal_non_vatable = p_subtotal_non_vatable,
    vat_amount = p_vat_amount,
    grand_total = p_grand_total,
    note = nullif(trim(coalesce(p_note, '')), ''),
    internal_note = nullif(trim(coalesce(p_internal_note, '')), ''),
    client_snapshot_json = p_client_snapshot_json,
    matter_snapshot_json = p_matter_snapshot_json,
    document_data_snapshot_json = p_document_data_snapshot_json,
    updated_by_user_id = p_updated_by_user_id,
    updated_by_email = p_updated_by_email,
    updated_by_name = p_updated_by_name,
    updated_at = now()
  where id = p_quotation_id
    and status = 'draft';

  delete from public.finance_quotation_items
  where quotation_id = p_quotation_id;

  insert into public.finance_quotation_items (
    quotation_id,
    description,
    quantity,
    unit_price,
    amount_before_tax,
    vat_applicable,
    vat_rate,
    vat_amount,
    line_total,
    sort_order
  )
  select
    p_quotation_id,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'amount_before_tax')::numeric,
    coalesce((item->>'vat_applicable')::boolean, false),
    (item->>'vat_rate')::numeric,
    (item->>'vat_amount')::numeric,
    (item->>'line_total')::numeric,
    (item->>'sort_order')::integer
  from jsonb_array_elements(p_items) as item;

  return p_quotation_id;
end;
$$;
