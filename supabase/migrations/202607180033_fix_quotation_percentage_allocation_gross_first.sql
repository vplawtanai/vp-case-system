-- Gross-first percentage allocation for newly saved Quotation Payment Terms.
-- Historical version-1 rows and frozen snapshots are intentionally not rewritten.

alter table public.finance_quotation_payment_terms
  drop constraint finance_quotation_payment_terms_version_check;

alter table public.finance_quotation_payment_terms
  alter column snapshot_version set default 2;

alter table public.finance_quotation_payment_terms
  add constraint finance_quotation_payment_terms_version_check
  check (snapshot_version in (1, 2));

create or replace function public.finance_allocate_satang_by_weights(
  p_total bigint,
  p_weights bigint[]
)
returns bigint[]
language plpgsql
immutable
set search_path = public
as $gross_first_apportionment$
declare
  v_count integer := coalesce(array_length(p_weights, 1), 0);
  v_weight_total numeric := 0;
  v_allocations bigint[];
  v_remainders numeric[];
  v_allocated bigint := 0;
  v_residual bigint;
  v_index integer;
  v_candidate integer;
  v_best_remainder numeric;
begin
  if p_total < 0 then raise exception 'Allocation total must be non-negative'; end if;
  if v_count = 0 then
    if p_total <> 0 then raise exception 'Allocation weights are required'; end if;
    return array[]::bigint[];
  end if;

  v_allocations := array_fill(0::bigint, array[v_count]);
  v_remainders := array_fill(0::numeric, array[v_count]);
  for v_index in 1..v_count loop
    if coalesce(p_weights[v_index], 0) < 0 then raise exception 'Allocation weights must be non-negative'; end if;
    v_weight_total := v_weight_total + coalesce(p_weights[v_index], 0);
  end loop;
  if v_weight_total = 0 then
    if p_total <> 0 then raise exception 'Cannot allocate a positive amount without weights'; end if;
    return v_allocations;
  end if;

  for v_index in 1..v_count loop
    v_allocations[v_index] := floor((p_total::numeric * p_weights[v_index]) / v_weight_total)::bigint;
    v_remainders[v_index] := (p_total::numeric * p_weights[v_index])
      - (v_allocations[v_index]::numeric * v_weight_total);
    v_allocated := v_allocated + v_allocations[v_index];
  end loop;

  v_residual := p_total - v_allocated;
  while v_residual > 0 loop
    v_candidate := null;
    v_best_remainder := null;
    for v_index in 1..v_count loop
      if p_weights[v_index] > 0
        and (v_candidate is null or v_remainders[v_index] > v_best_remainder)
      then
        v_candidate := v_index;
        v_best_remainder := v_remainders[v_index];
      end if;
    end loop;
    if v_candidate is null then raise exception 'Unable to distribute allocation residual'; end if;
    v_allocations[v_candidate] := v_allocations[v_candidate] + 1;
    v_remainders[v_candidate] := -1;
    v_residual := v_residual - 1;
  end loop;
  return v_allocations;
end;
$gross_first_apportionment$;

create or replace function public.finance_round_satang_ratio(
  p_value bigint,
  p_multiplier bigint,
  p_denominator bigint
)
returns bigint
language sql
immutable
set search_path = public
as $gross_first_ratio$
  select case
    when p_value < 0 or p_multiplier < 0 or p_denominator <= 0
      then null
    else floor(((p_value::numeric * p_multiplier) / p_denominator) + 0.5)::bigint
  end;
$gross_first_ratio$;

create or replace function public.finance_compute_quotation_percentage_allocation_gross_first(
  p_items jsonb,
  p_installments jsonb,
  p_allocation_mode text
)
returns jsonb
language plpgsql
stable
set search_path = public
as $gross_first_contract$
declare
  c_percent_total constant bigint := 100000000;
  v_item_count integer;
  v_installment_count integer;
  v_item_ids text[];
  v_item_before bigint[];
  v_item_vat bigint[];
  v_item_gross bigint[];
  v_installment_ids text[];
  v_installment_numbers integer[];
  v_installment_weights bigint[];
  v_installment_targets bigint[];
  v_remaining_item_gross bigint[];
  v_cell_gross bigint[];
  v_cell_vat bigint[];
  v_allocations bigint[];
  v_weights bigint[];
  v_percentage_total bigint;
  v_quotation_gross bigint;
  v_allocated_target bigint;
  v_allocated_row_gross bigint;
  v_allocated_row_vat bigint;
  v_result jsonb := '[]'::jsonb;
  v_result_items jsonb;
  v_source_items jsonb;
  v_source_item jsonb;
  v_item_index integer;
  v_installment_index integer;
  v_cell_index integer;
  v_allocation_item_index integer;
  v_weight bigint;
begin
  if p_allocation_mode not in ('proportional_all_items', 'per_item')
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_typeof(p_installments) <> 'array'
  then
    raise exception 'Invalid gross-first allocation input';
  end if;

  v_item_count := jsonb_array_length(p_items);
  v_installment_count := jsonb_array_length(p_installments);
  if v_item_count = 0 or v_installment_count = 0 then raise exception 'Gross-first allocation requires items and installments'; end if;

  select
    array_agg(item.value->>'item_id' order by item.ordinality),
    array_agg(round((item.value->>'amount_before_tax')::numeric * 100)::bigint order by item.ordinality),
    array_agg(round((item.value->>'vat_amount')::numeric * 100)::bigint order by item.ordinality),
    array_agg(round((item.value->>'total_amount')::numeric * 100)::bigint order by item.ordinality)
  into v_item_ids, v_item_before, v_item_vat, v_item_gross
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  select
    array_agg(installment.value->>'installment_id' order by installment.ordinality),
    array_agg((installment.value->>'installment_no')::integer order by installment.ordinality),
    array_agg(round(coalesce((installment.value->>'percentage')::numeric, 0) * 1000000)::bigint order by installment.ordinality)
  into v_installment_ids, v_installment_numbers, v_installment_weights
  from jsonb_array_elements(p_installments) with ordinality as installment(value, ordinality);

  for v_item_index in 1..v_item_count loop
    if v_item_before[v_item_index] < 0
      or v_item_vat[v_item_index] < 0
      or v_item_gross[v_item_index] <> v_item_before[v_item_index] + v_item_vat[v_item_index]
    then
      raise exception 'Gross-first source item amounts do not reconcile';
    end if;
  end loop;

  v_cell_gross := array_fill(0::bigint, array[v_item_count * v_installment_count]);
  v_cell_vat := array_fill(0::bigint, array[v_item_count * v_installment_count]);

  if p_allocation_mode = 'proportional_all_items' then
    v_percentage_total := 0;
    for v_installment_index in 1..v_installment_count loop
      if v_installment_weights[v_installment_index] < 0 then raise exception 'Allocation percentage must be non-negative'; end if;
      v_percentage_total := v_percentage_total + v_installment_weights[v_installment_index];
    end loop;
    if v_percentage_total > c_percent_total then raise exception 'Allocation percentages exceed 100 percent'; end if;

    v_quotation_gross := 0;
    for v_item_index in 1..v_item_count loop v_quotation_gross := v_quotation_gross + v_item_gross[v_item_index]; end loop;
    v_allocated_target := public.finance_round_satang_ratio(v_quotation_gross, v_percentage_total, c_percent_total);
    v_installment_targets := public.finance_allocate_satang_by_weights(v_allocated_target, v_installment_weights);
    v_remaining_item_gross := v_item_gross;

    for v_installment_index in 1..v_installment_count loop
      if v_percentage_total = c_percent_total and v_installment_index = v_installment_count then
        v_allocations := v_remaining_item_gross;
      else
        v_allocations := public.finance_allocate_satang_by_weights(
          v_installment_targets[v_installment_index],
          v_remaining_item_gross
        );
      end if;
      for v_item_index in 1..v_item_count loop
        v_cell_index := (v_item_index - 1) * v_installment_count + v_installment_index;
        v_cell_gross[v_cell_index] := v_allocations[v_item_index];
        v_remaining_item_gross[v_item_index] := v_remaining_item_gross[v_item_index] - v_allocations[v_item_index];
      end loop;
    end loop;
  else
    for v_item_index in 1..v_item_count loop
      v_weights := array_fill(0::bigint, array[v_installment_count]);
      v_percentage_total := 0;
      for v_installment_index in 1..v_installment_count loop
        v_source_items := coalesce((p_installments->(v_installment_index - 1))->'items', '[]'::jsonb);
        select coalesce(round((source.value->>'allocation_percentage')::numeric * 1000000)::bigint, 0)
          into v_weight
        from jsonb_array_elements(v_source_items) as source(value)
        where source.value->>'item_id' = v_item_ids[v_item_index]
        limit 1;
        v_weights[v_installment_index] := coalesce(v_weight, 0);
        if v_weights[v_installment_index] < 0 then raise exception 'Allocation percentage must be non-negative'; end if;
        v_percentage_total := v_percentage_total + v_weights[v_installment_index];
      end loop;
      if v_percentage_total > c_percent_total then raise exception 'Allocation percentages exceed 100 percent'; end if;
      v_allocated_target := public.finance_round_satang_ratio(v_item_gross[v_item_index], v_percentage_total, c_percent_total);
      v_allocations := public.finance_allocate_satang_by_weights(v_allocated_target, v_weights);
      for v_installment_index in 1..v_installment_count loop
        v_cell_index := (v_item_index - 1) * v_installment_count + v_installment_index;
        v_cell_gross[v_cell_index] := v_allocations[v_installment_index];
      end loop;
    end loop;
  end if;

  for v_item_index in 1..v_item_count loop
    v_weights := array_fill(0::bigint, array[v_installment_count]);
    v_allocated_row_gross := 0;
    for v_installment_index in 1..v_installment_count loop
      v_cell_index := (v_item_index - 1) * v_installment_count + v_installment_index;
      v_weights[v_installment_index] := v_cell_gross[v_cell_index];
      v_allocated_row_gross := v_allocated_row_gross + v_cell_gross[v_cell_index];
    end loop;
    v_allocated_row_vat := case
      when v_item_gross[v_item_index] = 0 then 0
      else public.finance_round_satang_ratio(v_item_vat[v_item_index], v_allocated_row_gross, v_item_gross[v_item_index])
    end;
    v_allocations := public.finance_allocate_satang_by_weights(v_allocated_row_vat, v_weights);
    for v_installment_index in 1..v_installment_count loop
      v_cell_index := (v_item_index - 1) * v_installment_count + v_installment_index;
      v_cell_vat[v_cell_index] := v_allocations[v_installment_index];
    end loop;
  end loop;

  for v_installment_index in 1..v_installment_count loop
    v_result_items := '[]'::jsonb;
    v_allocated_target := 0;
    v_allocated_row_vat := 0;
    v_source_items := coalesce((p_installments->(v_installment_index - 1))->'items', '[]'::jsonb);
    if jsonb_array_length(v_source_items) > 0 then
      for v_allocation_item_index in 0..jsonb_array_length(v_source_items) - 1 loop
        v_source_item := v_source_items->v_allocation_item_index;
        v_item_index := array_position(v_item_ids, v_source_item->>'item_id');
        if v_item_index is null then raise exception 'Gross-first allocation references an unknown item'; end if;
        v_cell_index := (v_item_index - 1) * v_installment_count + v_installment_index;
        v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
          'allocation_id', v_source_item->>'allocation_id',
          'item_id', v_item_ids[v_item_index],
          'amount_before_tax', (v_cell_gross[v_cell_index] - v_cell_vat[v_cell_index])::numeric / 100,
          'vat_amount', v_cell_vat[v_cell_index]::numeric / 100,
          'total_amount', v_cell_gross[v_cell_index]::numeric / 100
        ));
        v_allocated_target := v_allocated_target + v_cell_gross[v_cell_index];
        v_allocated_row_vat := v_allocated_row_vat + v_cell_vat[v_cell_index];
      end loop;
    end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'installment_id', v_installment_ids[v_installment_index],
      'installment_no', v_installment_numbers[v_installment_index],
      'amount_before_tax', (v_allocated_target - v_allocated_row_vat)::numeric / 100,
      'vat_amount', v_allocated_row_vat::numeric / 100,
      'total_amount', v_allocated_target::numeric / 100,
      'items', v_result_items
    ));
  end loop;

  return jsonb_build_object(
    'version', 2,
    'allocation_contract', 'gross_first',
    'residual_rule', 'largest_remainder_installment_then_item_stable_order',
    'installments', v_result
  );
end;
$gross_first_contract$;

alter function public.save_finance_quotation_payment_terms_draft_v2(uuid, text, text, text, jsonb)
  rename to save_finance_quotation_payment_terms_v1_internal;

revoke all on function public.save_finance_quotation_payment_terms_v1_internal(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.save_finance_quotation_payment_terms_draft_v2(
  p_quotation_id uuid,
  p_payment_method_type text,
  p_client_summary text,
  p_allocation_mode text,
  p_installments_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $gross_first_save$
declare
  v_terms_id uuid;
  v_contract jsonb;
  v_items jsonb;
  v_installments jsonb;
begin
  v_terms_id := public.save_finance_quotation_payment_terms_v1_internal(
    p_quotation_id,
    p_payment_method_type,
    p_client_summary,
    p_allocation_mode,
    p_installments_json
  );

  if not exists (
    select 1
    from public.finance_quotation_payment_installments as installment
    where installment.payment_terms_id = v_terms_id
      and installment.calculation_type <> 'percentage'
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item.id,
      'amount_before_tax', item.amount_before_tax,
      'vat_amount', item.vat_amount,
      'total_amount', item.line_total,
      'sort_order', item.sort_order
    ) order by item.sort_order, item.id), '[]'::jsonb)
    into v_items
    from public.finance_quotation_items as item
    where item.quotation_id = p_quotation_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'installment_id', installment.id,
      'installment_no', installment.installment_no,
      'percentage', installment.percentage,
      'sort_order', installment.sort_order,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'allocation_id', allocation.id,
          'item_id', allocation.quotation_item_id,
          'allocation_percentage', allocation.allocation_percentage,
          'sort_order', allocation.sort_order
        ) order by allocation.sort_order, allocation.id)
        from public.finance_quotation_payment_installment_items as allocation
        where allocation.payment_installment_id = installment.id
      ), '[]'::jsonb)
    ) order by installment.installment_no, installment.sort_order, installment.id), '[]'::jsonb)
    into v_installments
    from public.finance_quotation_payment_installments as installment
    where installment.payment_terms_id = v_terms_id;

    v_contract := public.finance_compute_quotation_percentage_allocation_gross_first(
      v_items,
      v_installments,
      p_allocation_mode
    );

    with computed as (
      select item.value as item
      from jsonb_array_elements(v_contract->'installments') as installment(value)
      cross join lateral jsonb_array_elements(installment.value->'items') as item(value)
    )
    update public.finance_quotation_payment_installment_items as allocation
    set allocated_amount_before_tax = (computed.item->>'amount_before_tax')::numeric,
        allocated_vat_amount = (computed.item->>'vat_amount')::numeric,
        allocated_total = (computed.item->>'total_amount')::numeric,
        updated_at = now()
    from computed
    where allocation.id = (computed.item->>'allocation_id')::uuid;

    with computed as (
      select installment.value as installment
      from jsonb_array_elements(v_contract->'installments') as installment(value)
    )
    update public.finance_quotation_payment_installments as installment
    set amount_before_tax = (computed.installment->>'amount_before_tax')::numeric,
        vat_amount = (computed.installment->>'vat_amount')::numeric,
        total_amount = (computed.installment->>'total_amount')::numeric,
        updated_at = now()
    from computed
    where installment.id = (computed.installment->>'installment_id')::uuid;

    update public.finance_quotation_payment_terms as terms
    set amount_before_tax = coalesce((select sum(amount_before_tax) from public.finance_quotation_payment_installments where payment_terms_id = v_terms_id), 0),
        vat_amount = coalesce((select sum(vat_amount) from public.finance_quotation_payment_installments where payment_terms_id = v_terms_id), 0),
        total_amount = coalesce((select sum(total_amount) from public.finance_quotation_payment_installments where payment_terms_id = v_terms_id), 0),
        snapshot_version = 2,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where terms.id = v_terms_id;
  else
    update public.finance_quotation_payment_terms
    set snapshot_version = 2,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where id = v_terms_id;
  end if;

  perform public.validate_finance_quotation_payment_terms(p_quotation_id, false);
  return v_terms_id;
end;
$gross_first_save$;

create or replace function public.freeze_finance_quotation_commercial_terms_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $gross_first_snapshot$
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
    'version', pt.snapshot_version,
    'allocation_contract', case
      when exists (
        select 1
        from public.finance_quotation_payment_installments as contract_installment
        where contract_installment.payment_terms_id = pt.id
          and contract_installment.calculation_type <> 'percentage'
      ) then 'fixed_amount'
      when pt.snapshot_version >= 2 then 'gross_first'
      else 'component_first'
    end,
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
$gross_first_snapshot$;

revoke all on function public.finance_allocate_satang_by_weights(bigint, bigint[]) from public, anon, authenticated;
revoke all on function public.finance_round_satang_ratio(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finance_compute_quotation_percentage_allocation_gross_first(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.save_finance_quotation_payment_terms_draft_v2(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.save_finance_quotation_payment_terms_draft_v2(uuid, text, text, text, jsonb) to authenticated;
revoke all on function public.freeze_finance_quotation_commercial_terms_v2() from public, anon, authenticated;

comment on function public.finance_compute_quotation_percentage_allocation_gross_first(jsonb, jsonb, text) is
  'Version-2 gross-first percentage allocation. Gross installment targets are apportioned first in satang; item VAT is reconciled inside each allocated gross cell.';
