-- Propagate prospective commercial item meaning through the existing Invoice V2 lineage.
-- Historical rows are intentionally not backfilled.

do $semantic_preflight$
begin
  if to_regprocedure('public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb)') is null
    or to_regprocedure('public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb)') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'finance_quotation_items'
        and column_name in ('unit', 'economic_classification')
      group by table_schema, table_name having count(*) = 2
    )
  then
    raise exception 'Commercial item semantic propagation requires the current Quotation and Invoice V2 foundations';
  end if;
  if to_regprocedure('public.inherit_finance_fee_agreement_item_semantics()') is not null
    or to_regprocedure('public.inherit_finance_billing_installment_item_semantics()') is not null
  then
    raise exception 'Commercial item semantic propagation objects already exist; inspect partial state';
  end if;
end;
$semantic_preflight$;

create or replace function public.apply_finance_quotation_draft_item_tax_modes(
  p_quotation_id uuid,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare q public.finance_quotations%rowtype;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update quotation tax modes'; end if;
  select * into q from public.finance_quotations where id = p_quotation_id for update;
  if q.id is null or q.status <> 'draft' then raise exception 'Only draft quotations can change tax modes'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Quotation items are required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) p
    where nullif(btrim(coalesce(p->>'unit', '')), '') is null
      or length(btrim(p->>'unit')) > 100
      or lower(btrim(coalesce(p->>'economic_classification', ''))) not in (
        'professional_fee', 'additional_service', 'reimbursable_expense', 'government_or_court_fee', 'other'
      )
  ) then raise exception 'Quotation item unit and economic classification are required'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) p join public.finance_quotation_items qi on qi.id = (p->>'id')::uuid
    where qi.quotation_id = p_quotation_id and coalesce(p->>'price_tax_mode', case when qi.vat_applicable then 'vat_exclusive' else 'non_vat' end) <> qi.price_tax_mode
      and exists (select 1 from public.finance_quotation_payment_installment_items ai where ai.quotation_item_id = qi.id)
  ) then raise exception 'This quotation item is already used in Payment Terms. Revise the payment terms before changing its commercial amounts.'; end if;
  update public.finance_quotation_items qi set
    price_tax_mode = coalesce(nullif(p->>'price_tax_mode', ''), case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    vat_rate = case when coalesce(p->>'price_tax_mode', case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end) = 'non_vat' then 0 else coalesce((p->>'vat_rate')::numeric, 7) end,
    unit = btrim(p->>'unit'),
    economic_classification = lower(btrim(p->>'economic_classification')),
    updated_at = now()
  from jsonb_array_elements(p_items) p
  where qi.quotation_id = p_quotation_id
    and ((nullif(p->>'id','') is not null and qi.id = (p->>'id')::uuid)
      or (nullif(p->>'id','') is null and qi.sort_order = (p->>'sort_order')::integer));
  update public.finance_quotations fq set
    subtotal_vatable = (select coalesce(sum(i.amount_before_tax) filter (where i.price_tax_mode <> 'non_vat'), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    subtotal_non_vatable = (select coalesce(sum(i.amount_before_tax) filter (where i.price_tax_mode = 'non_vat'), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    vat_amount = (select coalesce(sum(i.vat_amount), 0) from public.finance_quotation_items i where i.quotation_id = fq.id),
    grand_total = (select coalesce(sum(i.line_total), 0) from public.finance_quotation_items i where i.quotation_id = fq.id), updated_at = now()
  where fq.id = p_quotation_id;
  return p_quotation_id;
end;
$$;

create or replace function public.create_finance_quotation_draft_atomic_v3(
  p_client_id uuid,p_case_id bigint,p_advisory_matter_id uuid,p_issue_date date,p_valid_until date,
  p_scope_of_legal_services text,p_included_services text,p_excluded_services text,p_note text,p_internal_note text,
  p_authorized_signer_key text,p_authorized_signer_name text,p_authorized_signer_position text,p_authorized_signer_email text,
  p_client_snapshot_json jsonb,p_matter_snapshot_json jsonb,p_document_data_snapshot_json jsonb,p_items jsonb,
  p_payment_method_type text,p_payment_client_summary text,p_installments_json jsonb
)
returns table(quotation_id uuid, quotation_no text)
language plpgsql security definer set search_path = public
as $$
declare
  v_quotation_id uuid; v_quotation_no text; v_actor_name text; v_tax_items jsonb;
  v_mapped_installments jsonb; v_mode text;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create quotation draft'; end if;
  if p_client_id is not null then
    if not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'Quotation client not found'; end if;
  elsif lower(coalesce(p_client_snapshot_json->>'source_type', '')) <> 'prospect'
    or nullif(btrim(coalesce(p_client_snapshot_json->>'name', '')), '') is null then raise exception 'Prospect name is required';
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
      or nullif(btrim(coalesce(item->>'unit', '')), '') is null
      or lower(btrim(coalesce(item->>'economic_classification', ''))) not in ('professional_fee','additional_service','reimbursable_expense','government_or_court_fee','other')
      or coalesce((item->>'quantity')::numeric, 0) <= 0
      or coalesce((item->>'unit_price')::numeric, -1) < 0
      or coalesce((item->>'sort_order')::integer, -1) < 0
  ) then raise exception 'Quotation draft contains invalid line items'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct item->>'client_item_key') from jsonb_array_elements(p_items) item) then raise exception 'Quotation draft contains duplicate client item keys'; end if;
  if p_installments_json is null or jsonb_typeof(p_installments_json) <> 'array' then raise exception 'Payment installments must be a JSON array'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_installments_json) installment,
      jsonb_array_elements(coalesce(installment->'items', '[]'::jsonb)) allocation
    where nullif(allocation->>'client_item_key', '') is null
      or not exists (select 1 from jsonb_array_elements(p_items) source where source->>'client_item_key' = allocation->>'client_item_key')
  ) then raise exception 'Payment allocation item does not match a quotation line item'; end if;

  select coalesce(nullif(btrim(up.staff_name), ''), nullif(btrim(up.full_name), ''), '') into v_actor_name from public.user_profiles up where up.id = auth.uid();
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
    'id', qi.id, 'price_tax_mode', coalesce(nullif(source.item->>'price_tax_mode', ''), case when coalesce((source.item->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    'vat_rate', source.item->>'vat_rate', 'unit', source.item->>'unit', 'economic_classification', source.item->>'economic_classification'
  ) order by qi.sort_order), '[]'::jsonb)
  into v_tax_items
  from jsonb_array_elements(p_items) with ordinality source(item, ordinal_position)
  join public.finance_quotation_items qi on qi.quotation_id = v_quotation_id and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.ordinal_position - 1);
  perform public.apply_finance_quotation_draft_item_tax_modes(v_quotation_id, v_tax_items);
  update public.finance_quotations quotation set document_data_snapshot_json = coalesce(p_document_data_snapshot_json, '{}'::jsonb) || jsonb_build_object(
    'totals', jsonb_build_object('subtotalVatable', quotation.subtotal_vatable, 'subtotalNonVatable', quotation.subtotal_non_vatable, 'vatAmount', quotation.vat_amount, 'grandTotal', quotation.grand_total)
  ) where quotation.id = v_quotation_id;
  v_mode := coalesce(nullif(p_installments_json->0->>'allocation_mode', ''), 'proportional_all_items');
  select coalesce(jsonb_agg(jsonb_set(installment.item, '{items}', coalesce((
    select jsonb_agg((allocation.value - 'client_item_key') || jsonb_build_object('quotation_item_id', qi.id) order by allocation.ordinal_position)
    from jsonb_array_elements(coalesce(installment.item->'items', '[]'::jsonb)) with ordinality allocation(value, ordinal_position)
    join jsonb_array_elements(p_items) with ordinality source(item, source_ordinal_position) on source.item->>'client_item_key' = allocation.value->>'client_item_key'
    join public.finance_quotation_items qi on qi.quotation_id = v_quotation_id and qi.sort_order = coalesce((source.item->>'sort_order')::integer, source.source_ordinal_position - 1)
  ), '[]'::jsonb)) order by installment.ordinal_position), '[]'::jsonb)
  into v_mapped_installments from jsonb_array_elements(p_installments_json) with ordinality installment(item, ordinal_position);
  perform public.save_finance_quotation_payment_terms_draft_v2(v_quotation_id, p_payment_method_type, p_payment_client_summary, v_mode, v_mapped_installments);
  return query select v_quotation_id, v_quotation_no;
end;
$$;

create or replace function public.freeze_finance_quotation_commercial_terms_v2()
returns trigger language plpgsql security definer set search_path = public
as $semantic_snapshot$
declare v_client jsonb; v_items jsonb; v_payment jsonb; v_snapshot jsonb;
begin
  if not (old.status = 'draft' and new.status = 'sent') then return new; end if;
  if new.client_id is not null then
    select jsonb_build_object('source_type','existing_client','id',c.id,'name',c.name,'client_type',c.client_type,'client_display_name',case when c.client_type='individual' then 'คุณ'||regexp_replace(c.name,'^(นาย|นางสาว|นาง|คุณ)[[:space:]]*','','g') else c.name end,'tax_id',c.tax_id,'address',c.address,'phone',c.phone,'email',c.email)
      into v_client from public.clients c where c.id = new.client_id;
  else v_client := coalesce(new.client_snapshot_json, '{}'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'quotation_item_id',i.id,'description',i.description,'unit',i.unit,'economic_classification',i.economic_classification,
    'quantity',i.quantity,'unit_price',i.unit_price,'price_tax_mode',i.price_tax_mode,'vat_applicable',i.vat_applicable,
    'vat_rate',i.vat_rate,'amount_before_tax',i.amount_before_tax,'vat_amount',i.vat_amount,'line_total',i.line_total,'sort_order',i.sort_order
  ) order by i.sort_order,i.id),'[]'::jsonb) into v_items from public.finance_quotation_items i where i.quotation_id = new.id;
  select jsonb_build_object(
    'version', pt.snapshot_version,
    'allocation_contract', case
      when exists (select 1 from public.finance_quotation_payment_installments ci where ci.payment_terms_id = pt.id and ci.calculation_type <> 'percentage') then 'fixed_amount'
      when pt.snapshot_version >= 2 then 'gross_first' else 'component_first' end,
    'payment_method_type', pt.payment_method_type, 'allocation_mode', pt.allocation_mode, 'currency', pt.currency,
    'client_summary', pt.client_summary, 'amount_before_tax', pt.amount_before_tax, 'vat_amount', pt.vat_amount, 'total_amount', pt.total_amount,
    'installments', coalesce(jsonb_agg(jsonb_build_object(
      'installment_no',pi.installment_no,'title',pi.title,'calculation_type',pi.calculation_type,'percentage',pi.percentage,
      'trigger_type',pi.trigger_type,'trigger_description',pi.trigger_description,'due_date',pi.due_date,'payment_due_days',pi.payment_due_days,
      'client_note',pi.client_note,'amount_before_tax',pi.amount_before_tax,'vat_amount',pi.vat_amount,'total_amount',pi.total_amount,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'quotation_item_id',ai.quotation_item_id,'description_snapshot',qi.description,'unit',qi.unit,'economic_classification',qi.economic_classification,
        'price_tax_mode',qi.price_tax_mode,'vat_applicable',qi.vat_applicable,'vat_rate',qi.vat_rate,
        'allocation_percentage',ai.allocation_percentage,'allocated_amount_before_tax',ai.allocated_amount_before_tax,
        'allocated_vat_amount',ai.allocated_vat_amount,'allocated_total',ai.allocated_total
      ) order by ai.sort_order,ai.id) from public.finance_quotation_payment_installment_items ai
        join public.finance_quotation_items qi on qi.id=ai.quotation_item_id where ai.payment_installment_id=pi.id),'[]'::jsonb)
    ) order by pi.installment_no),'[]'::jsonb)
  ) into v_payment from public.finance_quotation_payment_terms pt
  join public.finance_quotation_payment_installments pi on pi.payment_terms_id=pt.id
  where pt.quotation_id=new.id group by pt.id;
  v_snapshot := coalesce(new.document_data_snapshot_json,'{}'::jsonb) || jsonb_build_object(
    'version',2,'client',coalesce(v_client,'{}'::jsonb),
    'matter',coalesce(new.document_data_snapshot_json->'matter',new.matter_snapshot_json,'{}'::jsonb),
    'items',v_items,'payment_terms',coalesce(v_payment,'{}'::jsonb)
  );
  update public.finance_quotations quotation set document_data_snapshot_json=v_snapshot where quotation.id=new.id;
  return new;
end;
$semantic_snapshot$;

create function public.inherit_finance_fee_agreement_item_semantics()
returns trigger language plpgsql set search_path = public as $$
declare v_unit text; v_classification text;
begin
  if new.source_quotation_item_id is null then return new; end if;
  select item.unit, item.economic_classification into v_unit, v_classification
  from public.finance_quotation_items item where item.id = new.source_quotation_item_id;
  new.unit := coalesce(new.unit, v_unit);
  new.economic_classification := coalesce(new.economic_classification, v_classification);
  return new;
end;
$$;

create trigger finance_fee_agreement_item_semantics_before_write
before insert or update of source_quotation_item_id on public.finance_fee_agreement_items
for each row execute function public.inherit_finance_fee_agreement_item_semantics();

create function public.inherit_finance_billing_installment_item_semantics()
returns trigger language plpgsql set search_path = public as $$
declare v_source public.finance_fee_agreement_items%rowtype;
begin
  select * into v_source from public.finance_fee_agreement_items where id = new.fee_agreement_item_id;
  new.unit := coalesce(new.unit, v_source.unit);
  new.economic_classification := coalesce(new.economic_classification, v_source.economic_classification);
  if new.semantic_snapshot_json is null and new.economic_classification is not null then
    new.semantic_snapshot_json := jsonb_build_object(
      'schema_version', '1', 'source_type', 'fee_agreement_item',
      'source_fee_agreement_item_id', v_source.id, 'source_quotation_item_id', v_source.source_quotation_item_id,
      'unit', new.unit, 'economic_classification', new.economic_classification
    );
  end if;
  return new;
end;
$$;

create trigger finance_billing_installment_item_semantics_before_write
before insert or update of fee_agreement_item_id on public.finance_billing_installment_items
for each row execute function public.inherit_finance_billing_installment_item_semantics();

revoke all on function public.inherit_finance_fee_agreement_item_semantics() from public, anon, authenticated;
revoke all on function public.inherit_finance_billing_installment_item_semantics() from public, anon, authenticated;
revoke all on function public.freeze_finance_quotation_commercial_terms_v2() from public, anon, authenticated;
revoke all on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) from public, anon;
grant execute on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) to authenticated;
revoke all on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) from public, anon;
grant execute on function public.create_finance_quotation_draft_atomic_v3(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) to authenticated;

comment on function public.inherit_finance_fee_agreement_item_semantics() is 'Prospectively copies commercial item meaning from an immutable accepted Quotation item; performs no historical backfill.';
comment on function public.inherit_finance_billing_installment_item_semantics() is 'Prospectively freezes commercial item meaning from the Fee Agreement into each new Billing Installment item.';
