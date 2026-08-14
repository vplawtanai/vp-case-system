-- Add standalone Prospect and unlinked-matter support to Quotations.
-- Existing quotation RPCs remain available for zero-downtime deployment.

alter table public.finance_quotations
  alter column client_id drop not null,
  add column if not exists customer_source_type text null,
  add column if not exists prospect_name text null,
  add column if not exists prospect_contact_person text null,
  add column if not exists prospect_phone text null,
  add column if not exists prospect_email text null,
  add column if not exists prospect_tax_id text null,
  add column if not exists prospect_address text null,
  add column if not exists matter_source_type text null,
  add column if not exists unlinked_matter_name text null,
  add column if not exists unlinked_matter_description text null,
  add column if not exists client_linked_at timestamptz null,
  add column if not exists client_linked_by_user_id uuid null references public.user_profiles(id) on delete set null,
  add column if not exists matter_linked_at timestamptz null,
  add column if not exists matter_linked_by_user_id uuid null references public.user_profiles(id) on delete set null;

alter table public.finance_quotations
  drop constraint if exists finance_quotations_customer_source_type_check,
  add constraint finance_quotations_customer_source_type_check
    check (customer_source_type is null or customer_source_type in ('existing_client', 'prospect')),
  drop constraint if exists finance_quotations_matter_source_type_check,
  add constraint finance_quotations_matter_source_type_check
    check (matter_source_type is null or matter_source_type in ('unlinked', 'case', 'advisory')),
  drop constraint if exists finance_quotations_customer_identity_check,
  add constraint finance_quotations_customer_identity_check check (
    customer_source_type is null
    or (customer_source_type = 'existing_client' and client_id is not null)
    or (customer_source_type = 'prospect' and nullif(btrim(coalesce(prospect_name, '')), '') is not null)
  );

create index if not exists idx_finance_quotations_customer_source_type
  on public.finance_quotations (customer_source_type);
create index if not exists idx_finance_quotations_matter_source_type
  on public.finance_quotations (matter_source_type);

create or replace function public.normalize_finance_quotation_party_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer_source text;
  v_matter_source text;
begin
  v_customer_source := lower(coalesce(
    nullif(btrim(new.client_snapshot_json->>'source_type'), ''),
    case when new.client_id is not null then 'existing_client' else null end,
    new.customer_source_type
  ));

  if v_customer_source = 'existing_client' then
    if new.client_id is null or not exists (select 1 from public.clients c where c.id = new.client_id) then
      raise exception 'Quotation client not found';
    end if;
    new.prospect_name := null;
    new.prospect_contact_person := null;
    new.prospect_phone := null;
    new.prospect_email := null;
    new.prospect_tax_id := null;
    new.prospect_address := null;
  elsif v_customer_source = 'prospect' then
    new.prospect_name := nullif(btrim(coalesce(new.client_snapshot_json->>'name', new.prospect_name, '')), '');
    if new.prospect_name is null then raise exception 'Prospect name is required'; end if;
    new.prospect_contact_person := nullif(btrim(coalesce(new.client_snapshot_json->>'contact_person', new.prospect_contact_person, '')), '');
    new.prospect_phone := nullif(btrim(coalesce(new.client_snapshot_json->>'phone', new.prospect_phone, '')), '');
    new.prospect_email := nullif(btrim(coalesce(new.client_snapshot_json->>'email', new.prospect_email, '')), '');
    new.prospect_tax_id := nullif(btrim(coalesce(new.client_snapshot_json->>'tax_id', new.prospect_tax_id, '')), '');
    new.prospect_address := nullif(btrim(coalesce(new.client_snapshot_json->>'address', new.prospect_address, '')), '');
  else
    raise exception 'Quotation customer source is required';
  end if;
  new.customer_source_type := v_customer_source;

  if new.case_id is not null and new.advisory_matter_id is not null then
    raise exception 'Select either case or advisory matter, not both';
  end if;
  if new.case_id is not null and not exists (select 1 from public.cases c where c.id = new.case_id) then
    raise exception 'Quotation case not found';
  end if;
  if new.advisory_matter_id is not null and not exists (select 1 from public.advisory_matters a where a.id = new.advisory_matter_id) then
    raise exception 'Quotation advisory matter not found';
  end if;

  v_matter_source := lower(coalesce(
    case when new.status = 'draft' and new.case_id is not null then 'case'
         when new.status = 'draft' and new.advisory_matter_id is not null then 'advisory'
         else null end,
    nullif(btrim(new.matter_snapshot_json->>'source_type'), ''),
    nullif(btrim(new.matter_snapshot_json->>'type'), ''),
    case when new.case_id is not null then 'case' when new.advisory_matter_id is not null then 'advisory' else 'unlinked' end
  ));
  if v_matter_source = 'advisory_matter' then v_matter_source := 'advisory'; end if;
  if v_matter_source not in ('unlinked', 'case', 'advisory') then
    raise exception 'Invalid quotation matter source';
  end if;
  if v_matter_source = 'case' and new.case_id is null then raise exception 'Quotation case is required'; end if;
  if v_matter_source = 'advisory' and new.advisory_matter_id is null then raise exception 'Quotation advisory matter is required'; end if;
  new.matter_source_type := v_matter_source;

  if v_matter_source = 'unlinked' then
    new.unlinked_matter_name := nullif(btrim(coalesce(new.matter_snapshot_json->>'title', new.unlinked_matter_name, '')), '');
    new.unlinked_matter_description := nullif(btrim(coalesce(new.matter_snapshot_json->>'description', new.unlinked_matter_description, '')), '');
  elsif tg_op = 'INSERT' or new.status = 'draft' then
    new.unlinked_matter_name := null;
    new.unlinked_matter_description := null;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_finance_quotation_party_context() from public, anon, authenticated;

drop trigger if exists finance_quotation_party_context_before_write on public.finance_quotations;
create trigger finance_quotation_party_context_before_write
before insert or update of client_id, case_id, advisory_matter_id, client_snapshot_json, matter_snapshot_json
on public.finance_quotations
for each row execute function public.normalize_finance_quotation_party_context();

create or replace function public.create_finance_quotation_draft_atomic_v3(
  p_client_id uuid,p_case_id bigint,p_advisory_matter_id uuid,p_issue_date date,p_valid_until date,
  p_scope_of_legal_services text,p_included_services text,p_excluded_services text,p_note text,p_internal_note text,
  p_authorized_signer_key text,p_authorized_signer_name text,p_authorized_signer_position text,p_authorized_signer_email text,
  p_client_snapshot_json jsonb,p_matter_snapshot_json jsonb,p_document_data_snapshot_json jsonb,p_items jsonb,
  p_payment_method_type text,p_payment_client_summary text,p_installments_json jsonb
)
returns table(quotation_id uuid, quotation_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation_id uuid;
  v_quotation_no text;
  v_actor_name text;
  v_tax_items jsonb;
  v_mapped_installments jsonb;
  v_mode text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create quotation draft'; end if;
  if p_client_id is not null then
    if not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'Quotation client not found'; end if;
  elsif lower(coalesce(p_client_snapshot_json->>'source_type', '')) <> 'prospect'
    or nullif(btrim(coalesce(p_client_snapshot_json->>'name', '')), '') is null then
    raise exception 'Prospect name is required';
  end if;
  if p_case_id is not null and p_advisory_matter_id is not null then raise exception 'Select either case or advisory matter, not both'; end if;
  if p_case_id is not null and not exists (select 1 from public.cases c where c.id = p_case_id) then raise exception 'Quotation case not found'; end if;
  if p_advisory_matter_id is not null and not exists (select 1 from public.advisory_matters a where a.id = p_advisory_matter_id) then raise exception 'Quotation advisory matter not found'; end if;
  if p_issue_date is null or (p_valid_until is not null and p_valid_until < p_issue_date) then raise exception 'Valid until cannot be before issue date'; end if;
  if nullif(btrim(coalesce(p_authorized_signer_key, '')), '') is null then raise exception 'Authorized signer is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Quotation draft requires at least one line item'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or nullif(btrim(coalesce(item->>'client_item_key', '')), '') is null
      or nullif(btrim(coalesce(item->>'description', '')), '') is null
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
      or coalesce((item->>'sort_order')::integer, -1) < 0
  ) then raise exception 'Quotation draft contains invalid line items'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct item->>'client_item_key') from jsonb_array_elements(p_items) item) then
    raise exception 'Quotation draft contains duplicate client item keys';
  end if;
  if p_installments_json is null or jsonb_typeof(p_installments_json) <> 'array' then raise exception 'Payment installments must be a JSON array'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_installments_json) installment,
      jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) allocation
    where nullif(allocation->>'client_item_key', '') is null
      or not exists (
        select 1 from jsonb_array_elements(p_items) source
        where source->>'client_item_key' = allocation->>'client_item_key'
      )
  ) then raise exception 'Payment allocation item does not match a quotation line item'; end if;

  select coalesce(nullif(btrim(up.staff_name), ''), nullif(btrim(up.full_name), ''), '')
    into v_actor_name from public.user_profiles up where up.id = auth.uid();
  v_quotation_no := public.generate_finance_document_no('QT', p_issue_date);

  insert into public.finance_quotations (
    quotation_no, client_id, case_id, advisory_matter_id, issue_date, valid_until, status,
    scope_of_legal_services, included_services, excluded_services, note, internal_note,
    authorized_signer_key, authorized_signer_name, authorized_signer_position, authorized_signer_email,
    client_snapshot_json, matter_snapshot_json, document_data_snapshot_json,
    created_by_user_id, created_by_name, updated_by_user_id, updated_by_name
  ) values (
    v_quotation_no, p_client_id, p_case_id, p_advisory_matter_id, p_issue_date, p_valid_until, 'draft',
    nullif(btrim(coalesce(p_scope_of_legal_services, '')), ''), nullif(btrim(coalesce(p_included_services, '')), ''),
    nullif(btrim(coalesce(p_excluded_services, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), nullif(btrim(coalesce(p_internal_note, '')), ''),
    nullif(btrim(coalesce(p_authorized_signer_key, '')), ''), nullif(btrim(coalesce(p_authorized_signer_name, '')), ''),
    nullif(btrim(coalesce(p_authorized_signer_position, '')), ''), nullif(btrim(coalesce(p_authorized_signer_email, '')), ''),
    coalesce(p_client_snapshot_json, '{}'::jsonb), coalesce(p_matter_snapshot_json, '{}'::jsonb), coalesce(p_document_data_snapshot_json, '{}'::jsonb),
    auth.uid(), v_actor_name, auth.uid(), v_actor_name
  ) returning id into v_quotation_id;

  perform public.save_finance_quotation_draft_impl(
    v_quotation_id, p_client_id, p_case_id, p_advisory_matter_id, p_issue_date, p_valid_until,
    p_scope_of_legal_services, p_included_services, p_excluded_services, p_note, p_internal_note,
    p_authorized_signer_key, p_authorized_signer_name, p_authorized_signer_position, p_authorized_signer_email,
    0, 0, 0, 0, p_client_snapshot_json, p_matter_snapshot_json, p_document_data_snapshot_json,
    auth.uid(), null, v_actor_name, p_items
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', qi.id,
    'price_tax_mode', coalesce(nullif(source.item->>'price_tax_mode', ''), case when coalesce((source.item->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    'vat_rate', source.item->>'vat_rate'
  ) order by qi.sort_order), '[]'::jsonb)
  into v_tax_items
  from jsonb_array_elements(p_items) with ordinality source(item, ordinal_position)
  join public.finance_quotation_items qi
    on qi.quotation_id = v_quotation_id
   and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.ordinal_position - 1);
  perform public.apply_finance_quotation_draft_item_tax_modes(v_quotation_id, v_tax_items);

  -- The stable-ID save helper initially inserts new rows with the table's tax-mode
  -- default. Re-freeze only the Draft totals after explicit tax modes are applied.
  update public.finance_quotations quotation set
    document_data_snapshot_json = coalesce(p_document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
      'totals', jsonb_build_object(
        'subtotalVatable', quotation.subtotal_vatable,
        'subtotalNonVatable', quotation.subtotal_non_vatable,
        'vatAmount', quotation.vat_amount,
        'grandTotal', quotation.grand_total
      )
    )
  where quotation.id = v_quotation_id;

  v_mode := coalesce(nullif(p_installments_json->0->>'allocation_mode', ''), 'proportional_all_items');
  select coalesce(jsonb_agg(jsonb_set(installment.item, '{items}', coalesce((
    select jsonb_agg(
      (allocation.value - 'client_item_key') || jsonb_build_object('quotation_item_id', qi.id)
      order by allocation.ordinal_position
    )
    from jsonb_array_elements(coalesce(installment.item->'items', '[]'::jsonb)) with ordinality allocation(value, ordinal_position)
    join jsonb_array_elements(p_items) with ordinality source(item, source_ordinal_position)
      on source.item->>'client_item_key' = allocation.value->>'client_item_key'
    join public.finance_quotation_items qi
      on qi.quotation_id = v_quotation_id
     and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.source_ordinal_position - 1)
  ), '[]'::jsonb)) order by installment.ordinal_position), '[]'::jsonb)
  into v_mapped_installments
  from jsonb_array_elements(p_installments_json) with ordinality installment(item, ordinal_position);

  perform public.save_finance_quotation_payment_terms_draft_v2(
    v_quotation_id, p_payment_method_type, p_payment_client_summary, v_mode, v_mapped_installments
  );
  return query select v_quotation_id, v_quotation_no;
end;
$$;

revoke all on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) from public, anon;
grant execute on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) to authenticated;

create or replace function public.set_finance_quotation_status_v2(
  p_quotation_id uuid,
  p_next_status text,
  p_cancel_reason text,
  p_user_id uuid,
  p_user_email text,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.finance_quotations%rowtype;
  v_next_status text := lower(btrim(coalesce(p_next_status, '')));
  v_item_before numeric(14,2);
  v_item_vat numeric(14,2);
  v_item_total numeric(14,2);
  v_payment public.finance_quotation_payment_terms%rowtype;
  v_client jsonb;
  v_matter jsonb;
  v_company jsonb := '{}'::jsonb;
  v_signer jsonb := '{}'::jsonb;
  v_items jsonb;
  v_installments jsonb;
  v_snapshot jsonb;
  v_actor_name text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update finance quotation status'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;

  if not (q.status = 'draft' and v_next_status = 'sent' and q.client_id is null) then
    return public.set_finance_quotation_status(p_quotation_id, p_next_status, p_cancel_reason, p_user_id, p_user_email, p_user_name);
  end if;
  if q.customer_source_type <> 'prospect' or nullif(btrim(coalesce(q.prospect_name, '')), '') is null then
    raise exception 'Prospect identity is incomplete';
  end if;
  if q.valid_until is not null and q.valid_until < q.issue_date then raise exception 'Valid until cannot be before issue date'; end if;
  if q.case_id is not null and q.advisory_matter_id is not null then raise exception 'Select either case or advisory matter, not both'; end if;

  v_client := coalesce(q.client_snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'source_type', 'prospect', 'id', null, 'name', q.prospect_name,
    'client_display_name', q.prospect_name, 'contact_person', q.prospect_contact_person,
    'phone', q.prospect_phone, 'email', q.prospect_email, 'tax_id', q.prospect_tax_id, 'address', q.prospect_address
  );
  v_matter := coalesce(q.matter_snapshot_json, '{}'::jsonb);

  select coalesce(jsonb_agg(jsonb_build_object(
    'quotation_item_id', i.id, 'description', i.description, 'quantity', i.quantity,
    'unit_price', i.unit_price, 'price_tax_mode', i.price_tax_mode,
    'vat_applicable', i.vat_applicable, 'vat_rate', i.vat_rate,
    'amount_before_tax', i.amount_before_tax, 'vat_amount', i.vat_amount,
    'line_total', i.line_total, 'sort_order', i.sort_order
  ) order by i.sort_order, i.id), '[]'::jsonb),
    coalesce(sum(i.amount_before_tax), 0), coalesce(sum(i.vat_amount), 0), coalesce(sum(i.line_total), 0)
  into v_items, v_item_before, v_item_vat, v_item_total
  from public.finance_quotation_items i where i.quotation_id = q.id;
  if jsonb_array_length(v_items) = 0 then raise exception 'Quotation requires at least one item'; end if;
  if exists (select 1 from public.finance_quotation_items i where i.quotation_id = q.id and (
    nullif(btrim(i.description), '') is null or i.quantity <= 0 or i.unit_price < 0 or
    i.amount_before_tax < 0 or i.vat_amount < 0 or i.line_total <> i.amount_before_tax + i.vat_amount or
    (not i.vat_applicable and (i.vat_rate <> 0 or i.vat_amount <> 0))
  )) then raise exception 'Quotation contains invalid line items'; end if;
  if v_item_before <> q.subtotal_vatable + q.subtotal_non_vatable or v_item_vat <> q.vat_amount or v_item_total <> q.grand_total then
    raise exception 'Quotation totals do not reconcile with line items';
  end if;

  select * into v_payment from public.finance_quotation_payment_terms where quotation_id = q.id for update;
  if v_payment.id is null then raise exception 'Payment terms are required'; end if;
  perform public.validate_finance_quotation_payment_terms(q.id, true);
  if v_payment.amount_before_tax <> q.subtotal_vatable + q.subtotal_non_vatable or v_payment.vat_amount <> q.vat_amount or v_payment.total_amount <> q.grand_total then
    raise exception 'Payment terms totals do not reconcile with the quotation';
  end if;

  select jsonb_build_object(
    'company_name_th', p.company_name_th, 'company_name_en', p.company_name_en, 'tax_id', p.tax_id,
    'branch_label', p.branch_label, 'address_th', p.address_th, 'phone', p.phone, 'email', p.email,
    'website', p.website, 'description', p.description, 'quotation_prefix', p.quotation_prefix,
    'logo_storage_path', p.logo_storage_path
  ) into v_company from public.finance_company_profiles p where p.id = 'default';
  v_company := coalesce(v_company, coalesce(q.document_data_snapshot_json->'company_profile', '{}'::jsonb));
  select jsonb_build_object('key', s.signer_key, 'name', s.display_name,
    'position', concat_ws(' / ', nullif(s.position_th, ''), nullif(s.position_en, '')),
    'email', s.email, 'signature_storage_path', s.signature_storage_path)
  into v_signer from public.finance_authorized_signers s where s.signer_key = q.authorized_signer_key;
  v_signer := coalesce(v_signer, jsonb_build_object('key', q.authorized_signer_key, 'name', q.authorized_signer_name, 'position', q.authorized_signer_position, 'email', q.authorized_signer_email));

  select coalesce(jsonb_agg(jsonb_build_object(
    'installment_no', pi.installment_no, 'title', pi.title, 'calculation_type', pi.calculation_type,
    'percentage', pi.percentage, 'trigger_type', pi.trigger_type, 'trigger_description', pi.trigger_description,
    'due_date', pi.due_date, 'payment_due_days', pi.payment_due_days, 'client_note', pi.client_note,
    'amount_before_tax', pi.amount_before_tax, 'vat_amount', pi.vat_amount, 'total_amount', pi.total_amount,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'quotation_item_id', ai.quotation_item_id, 'description_snapshot', qi.description,
      'price_tax_mode', qi.price_tax_mode, 'vat_applicable', qi.vat_applicable, 'vat_rate', qi.vat_rate,
      'allocation_percentage', ai.allocation_percentage, 'allocated_amount_before_tax', ai.allocated_amount_before_tax,
      'allocated_vat_amount', ai.allocated_vat_amount, 'allocated_total', ai.allocated_total
    ) order by ai.sort_order, ai.id) from public.finance_quotation_payment_installment_items ai
      join public.finance_quotation_items qi on qi.id = ai.quotation_item_id where ai.payment_installment_id = pi.id), '[]'::jsonb)
  ) order by pi.installment_no), '[]'::jsonb)
  into v_installments from public.finance_quotation_payment_installments pi where pi.payment_terms_id = v_payment.id;

  select coalesce(nullif(btrim(up.staff_name), ''), nullif(btrim(up.full_name), ''), '')
    into v_actor_name from public.user_profiles up where up.id = auth.uid();
  v_snapshot := coalesce(q.document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'version', 2,
    'quotation', jsonb_build_object('quotation_no', q.quotation_no, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'currency', 'THB', 'status_at_freeze', 'sent'),
    'client', v_client, 'matter', v_matter, 'company', v_company, 'company_profile', v_company,
    'commercial', jsonb_build_object('scope_of_legal_services', q.scope_of_legal_services, 'included_services', q.included_services, 'excluded_services', q.excluded_services, 'note', q.note, 'authorized_signer', v_signer),
    'authorized_signer', v_signer, 'items', v_items,
    'totals', jsonb_build_object('subtotal_vatable', q.subtotal_vatable, 'subtotal_non_vatable', q.subtotal_non_vatable, 'vat_amount', q.vat_amount, 'grand_total', q.grand_total),
    'payment_terms', jsonb_build_object('version', v_payment.snapshot_version, 'payment_method_type', v_payment.payment_method_type, 'allocation_mode', v_payment.allocation_mode, 'currency', v_payment.currency, 'client_summary', v_payment.client_summary, 'amount_before_tax', v_payment.amount_before_tax, 'vat_amount', v_payment.vat_amount, 'total_amount', v_payment.total_amount, 'installments', v_installments),
    'frozen_at', now(), 'frozen_by', jsonb_build_object('user_id', auth.uid(), 'email', '', 'name', coalesce(v_actor_name, ''))
  );

  update public.finance_quotations quotation set
    status = 'sent', document_data_snapshot_json = v_snapshot,
    sent_at = now(), sent_by_user_id = auth.uid(),
    updated_by_user_id = auth.uid(), updated_by_email = null, updated_by_name = v_actor_name, updated_at = now()
  where quotation.id = q.id;
  return q.id;
end;
$$;

revoke all on function public.set_finance_quotation_status_v2(uuid,text,text,uuid,text,text) from public, anon;
grant execute on function public.set_finance_quotation_status_v2(uuid,text,text,uuid,text,text) to authenticated;

create or replace function public.freeze_finance_quotation_commercial_terms_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_client jsonb; v_items jsonb; v_payment jsonb; v_snapshot jsonb;
begin
  if not (old.status = 'draft' and new.status = 'sent') then return new; end if;
  if new.client_id is not null then
    select jsonb_build_object('source_type','existing_client','id',c.id,'name',c.name,'client_type',c.client_type,'client_display_name',case when c.client_type='individual' then 'คุณ'||regexp_replace(c.name,'^(นาย|นางสาว|นาง|คุณ)[[:space:]]*','','g') else c.name end,'tax_id',c.tax_id,'address',c.address,'phone',c.phone,'email',c.email)
      into v_client from public.clients c where c.id = new.client_id;
  else
    v_client := coalesce(new.client_snapshot_json, '{}'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('quotation_item_id',i.id,'description',i.description,'quantity',i.quantity,'unit_price',i.unit_price,'price_tax_mode',i.price_tax_mode,'vat_applicable',i.vat_applicable,'vat_rate',i.vat_rate,'amount_before_tax',i.amount_before_tax,'vat_amount',i.vat_amount,'line_total',i.line_total,'sort_order',i.sort_order) order by i.sort_order,i.id),'[]'::jsonb)
    into v_items from public.finance_quotation_items i where i.quotation_id = new.id;
  select jsonb_build_object(
    'version', 2,
    'payment_method_type', pt.payment_method_type,
    'allocation_mode', pt.allocation_mode,
    'currency', pt.currency,
    'client_summary', pt.client_summary,
    'amount_before_tax', pt.amount_before_tax,
    'vat_amount', pt.vat_amount,
    'total_amount', pt.total_amount,
    'installments', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installment_no', pi.installment_no,
          'title', pi.title,
          'calculation_type', pi.calculation_type,
          'percentage', pi.percentage,
          'trigger_type', pi.trigger_type,
          'trigger_description', pi.trigger_description,
          'due_date', pi.due_date,
          'payment_due_days', pi.payment_due_days,
          'client_note', pi.client_note,
          'amount_before_tax', pi.amount_before_tax,
          'vat_amount', pi.vat_amount,
          'total_amount', pi.total_amount,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'quotation_item_id', ai.quotation_item_id,
                'description_snapshot', qi.description,
                'price_tax_mode', qi.price_tax_mode,
                'vat_applicable', qi.vat_applicable,
                'vat_rate', qi.vat_rate,
                'allocation_percentage', ai.allocation_percentage,
                'allocated_amount_before_tax', ai.allocated_amount_before_tax,
                'allocated_vat_amount', ai.allocated_vat_amount,
                'allocated_total', ai.allocated_total
              )
              order by ai.sort_order, ai.id
            )
            from public.finance_quotation_payment_installment_items ai
            join public.finance_quotation_items qi on qi.id = ai.quotation_item_id
            where ai.payment_installment_id = pi.id
          ), '[]'::jsonb)
        )
        order by pi.installment_no
      )
    )
  )
  into v_payment
  from public.finance_quotation_payment_terms pt
  join public.finance_quotation_payment_installments pi on pi.payment_terms_id = pt.id
  where pt.quotation_id = new.id
  group by pt.id;
  v_snapshot := coalesce(new.document_data_snapshot_json,'{}'::jsonb) || jsonb_build_object(
    'version',2,'client',coalesce(v_client,'{}'::jsonb),
    'matter',coalesce(new.document_data_snapshot_json->'matter',new.matter_snapshot_json,'{}'::jsonb),
    'items',v_items,'payment_terms',coalesce(v_payment,'{}'::jsonb)
  );
  update public.finance_quotations quotation set document_data_snapshot_json = v_snapshot where quotation.id = new.id;
  return new;
end;
$$;

revoke all on function public.freeze_finance_quotation_commercial_terms_v2() from public, anon, authenticated;

create or replace function public.link_finance_quotation_master_records(
  p_quotation_id uuid,
  p_client_id uuid,
  p_case_id bigint,
  p_advisory_matter_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare q public.finance_quotations%rowtype;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to link quotation records'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can be linked for Fee Agreement conversion'; end if;
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'Client is required'; end if;
  if q.client_id is not null and q.client_id <> p_client_id then raise exception 'An accepted quotation client cannot be reassigned'; end if;
  if p_case_id is not null and p_advisory_matter_id is not null then raise exception 'Select either case or advisory matter, not both'; end if;
  if p_case_id is not null and not exists (select 1 from public.cases c where c.id = p_case_id) then raise exception 'Case not found'; end if;
  if p_advisory_matter_id is not null and not exists (select 1 from public.advisory_matters a where a.id = p_advisory_matter_id) then raise exception 'Advisory matter not found'; end if;
  if q.case_id is not null and q.case_id is distinct from p_case_id then raise exception 'An accepted quotation Case cannot be reassigned'; end if;
  if q.advisory_matter_id is not null and q.advisory_matter_id is distinct from p_advisory_matter_id then raise exception 'An accepted quotation Advisory matter cannot be reassigned'; end if;

  update public.finance_quotations quotation set
    client_id = p_client_id,
    case_id = p_case_id,
    advisory_matter_id = p_advisory_matter_id,
    client_linked_at = case when q.client_id is null then now() else quotation.client_linked_at end,
    client_linked_by_user_id = case when q.client_id is null then auth.uid() else quotation.client_linked_by_user_id end,
    matter_linked_at = case when q.case_id is null and q.advisory_matter_id is null and (p_case_id is not null or p_advisory_matter_id is not null) then now() else quotation.matter_linked_at end,
    matter_linked_by_user_id = case when q.case_id is null and q.advisory_matter_id is null and (p_case_id is not null or p_advisory_matter_id is not null) then auth.uid() else quotation.matter_linked_by_user_id end,
    updated_by_user_id = auth.uid(), updated_at = now()
  where quotation.id = q.id;
  return q.id;
end;
$$;

revoke all on function public.link_finance_quotation_master_records(uuid,uuid,bigint,uuid) from public, anon;
grant execute on function public.link_finance_quotation_master_records(uuid,uuid,bigint,uuid) to authenticated;

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
  select agreement.id into v_id
  from public.finance_fee_agreements agreement
  where agreement.source_type = 'quotation' and agreement.source_quotation_id = q.id and agreement.status <> 'cancelled'
  order by agreement.created_at, agreement.id limit 1 for update;
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
    v_client_snapshot, v_matter_snapshot, v_snapshot->'company',
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
  from jsonb_array_elements(v_snapshot->'items') item
  order by coalesce((item->>'sort_order')::integer, 0);

  perform public.record_finance_fee_agreement_version(
    v_id, 'created', null,
    jsonb_build_object('source_quotation_id', q.id, 'source_snapshot_schema_version', v_snapshot->>'version', 'master_linkage_applied', true)
  );
  return query select v_id, true;
end;
$$;

revoke all on function public.create_finance_fee_agreement_from_quotation_v2(uuid) from public, anon;
grant execute on function public.create_finance_fee_agreement_from_quotation_v2(uuid) to authenticated;
