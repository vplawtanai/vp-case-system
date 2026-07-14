-- Phase 3D-R2.2: additive Payment Terms foundation. No existing quotation is backfilled.
create table if not exists public.finance_quotation_payment_terms (
 id uuid primary key default gen_random_uuid(), quotation_id uuid not null unique references public.finance_quotations(id) on delete cascade,
 payment_method_type text not null, currency text not null default 'THB', amount_before_tax numeric(14,2) not null default 0, vat_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0, client_summary text null, snapshot_version integer not null default 1,
 created_by_user_id uuid null references public.user_profiles(id) on delete set null, updated_by_user_id uuid null references public.user_profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint finance_quotation_payment_terms_method_check check(payment_method_type in ('single','installments','milestone','recurring','manual')),
 constraint finance_quotation_payment_terms_amount_check check(amount_before_tax>=0 and vat_amount>=0 and total_amount=amount_before_tax+vat_amount),
 constraint finance_quotation_payment_terms_version_check check(snapshot_version=1)
);
create table if not exists public.finance_quotation_payment_installments (
 id uuid primary key default gen_random_uuid(), payment_terms_id uuid not null references public.finance_quotation_payment_terms(id) on delete cascade, installment_no integer not null, title text not null, calculation_type text not null, percentage numeric(9,6) null, trigger_type text not null, trigger_description text null, due_date date null, payment_due_days integer not null default 0, client_note text null, amount_before_tax numeric(14,2) not null default 0, vat_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint finance_quotation_payment_installments_number_unique unique(payment_terms_id,installment_no), constraint finance_quotation_payment_installments_number_check check(installment_no>0), constraint finance_quotation_payment_installments_title_check check(btrim(title)<>''), constraint finance_quotation_payment_installments_calculation_check check(calculation_type in ('fixed_amount','percentage')), constraint finance_quotation_payment_installments_percentage_check check((calculation_type='percentage' and percentage>0 and percentage<=100) or (calculation_type='fixed_amount' and percentage is null)), constraint finance_quotation_payment_installments_trigger_check check(trigger_type in ('quotation_acceptance','agreement_effective','date','case_milestone','recurring_period','manual')), constraint finance_quotation_payment_installments_trigger_data_check check((trigger_type='date' and due_date is not null) or (trigger_type not in ('date','case_milestone','recurring_period','manual')) or nullif(btrim(coalesce(trigger_description,'')),'') is not null), constraint finance_quotation_payment_installments_amount_check check(amount_before_tax>=0 and vat_amount>=0 and total_amount=amount_before_tax+vat_amount), constraint finance_quotation_payment_installments_due_check check(payment_due_days>=0 and sort_order>=0)
);
create table if not exists public.finance_quotation_payment_installment_items (
 id uuid primary key default gen_random_uuid(), payment_installment_id uuid not null references public.finance_quotation_payment_installments(id) on delete cascade, quotation_item_id uuid not null references public.finance_quotation_items(id) on delete restrict, allocated_amount_before_tax numeric(14,2) not null, allocated_vat_amount numeric(14,2) not null, allocated_total numeric(14,2) not null, allocation_percentage numeric(9,6) null, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint finance_quotation_payment_installment_items_unique unique(payment_installment_id,quotation_item_id), constraint finance_quotation_payment_installment_items_amount_check check(allocated_amount_before_tax>=0 and allocated_vat_amount>=0 and allocated_total=allocated_amount_before_tax+allocated_vat_amount), constraint finance_quotation_payment_installment_items_percentage_check check(allocation_percentage is null or(allocation_percentage>0 and allocation_percentage<=100)), constraint finance_quotation_payment_installment_items_sort_check check(sort_order>=0)
);
create index if not exists idx_finance_quotation_payment_terms_quotation on public.finance_quotation_payment_terms(quotation_id); create index if not exists idx_finance_quotation_payment_installments_terms_order on public.finance_quotation_payment_installments(payment_terms_id,sort_order,installment_no); create index if not exists idx_finance_quotation_payment_installment_items_item on public.finance_quotation_payment_installment_items(quotation_item_id);
alter table public.finance_quotation_payment_terms enable row level security; alter table public.finance_quotation_payment_installments enable row level security; alter table public.finance_quotation_payment_installment_items enable row level security;
drop policy if exists "finance quotation managers select payment terms" on public.finance_quotation_payment_terms;
create policy "finance quotation managers select payment terms" on public.finance_quotation_payment_terms for select using(public.current_user_can_manage_finance_quotations());
drop policy if exists "finance quotation managers select payment installments" on public.finance_quotation_payment_installments;
create policy "finance quotation managers select payment installments" on public.finance_quotation_payment_installments for select using(public.current_user_can_manage_finance_quotations());
drop policy if exists "finance quotation managers select payment installment items" on public.finance_quotation_payment_installment_items;
create policy "finance quotation managers select payment installment items" on public.finance_quotation_payment_installment_items for select using(public.current_user_can_manage_finance_quotations());

create or replace function public.validate_finance_quotation_payment_terms(
  p_quotation_id uuid,
  p_require_complete boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.finance_quotations%rowtype;
  v_terms public.finance_quotation_payment_terms%rowtype;
  v_installment_count integer;
  v_method_count integer;
  v_installment_before_tax numeric(14,2);
  v_installment_vat numeric(14,2);
  v_installment_total numeric(14,2);
begin
  select * into v_quotation
  from public.finance_quotations
  where id = p_quotation_id;

  if v_quotation.id is null then
    raise exception 'Quotation not found';
  end if;

  select * into v_terms
  from public.finance_quotation_payment_terms
  where quotation_id = p_quotation_id;

  if v_terms.id is null then
    if p_require_complete then
      raise exception 'Payment terms are required';
    end if;
    return;
  end if;

  if v_terms.currency <> 'THB' then
    raise exception 'Unsupported payment terms currency';
  end if;

  select count(*) into v_installment_count
  from public.finance_quotation_payment_installments
  where payment_terms_id = v_terms.id;

  if v_installment_count = 0 then
    raise exception 'At least one payment installment is required';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    where i.payment_terms_id = v_terms.id
      and (
        i.payment_due_days < 0
        or (i.trigger_type = 'date' and i.due_date is null)
        or (
          i.trigger_type in ('case_milestone', 'recurring_period', 'manual')
          and nullif(btrim(coalesce(i.trigger_description, '')), '') is null
        )
      )
  ) then
    raise exception 'Payment installment trigger data is incomplete';
  end if;

  select count(distinct calculation_type) into v_method_count
  from public.finance_quotation_payment_installments
  where payment_terms_id = v_terms.id;

  if v_method_count > 1 then
    raise exception 'Mixed fixed-amount and percentage installments are not supported';
  end if;

  case v_terms.payment_method_type
    when 'single' then
      if v_installment_count <> 1 then
        raise exception 'Single payment terms require exactly one installment';
      end if;
    when 'installments' then
      if v_installment_count < 2 or exists (
        select 1
        from public.finance_quotation_payment_installments
        where payment_terms_id = v_terms.id
          and trigger_type = 'recurring_period'
      ) then
        raise exception 'Installment payment terms require at least two non-recurring installments';
      end if;
    when 'milestone' then
      if exists (
        select 1
        from public.finance_quotation_payment_installments
        where payment_terms_id = v_terms.id
          and trigger_type <> 'case_milestone'
      ) then
        raise exception 'Milestone payment terms require milestone triggers';
      end if;
    when 'recurring' then
      if exists (
        select 1
        from public.finance_quotation_payment_installments
        where payment_terms_id = v_terms.id
          and trigger_type <> 'recurring_period'
      ) then
        raise exception 'Recurring payment terms require recurring triggers';
      end if;
    when 'manual' then
      if exists (
        select 1
        from public.finance_quotation_payment_installments
        where payment_terms_id = v_terms.id
          and trigger_type <> 'manual'
      ) then
        raise exception 'Manual payment terms require manual triggers';
      end if;
  end case;

  if exists (
    select 1
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms.id
    group by calculation_type
    having calculation_type = 'percentage'
       and coalesce(sum(percentage), 0) > 100.000000
  ) then
    raise exception 'Percentage payment installments cannot exceed 100.000000';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    join public.finance_quotation_payment_installment_items ai
      on ai.payment_installment_id = i.id
    join public.finance_quotation_items qi
      on qi.id = ai.quotation_item_id
    where i.payment_terms_id = v_terms.id
      and (
        qi.quotation_id <> p_quotation_id
        or (not qi.vat_applicable and ai.allocated_vat_amount <> 0)
      )
  ) then
    raise exception 'Payment allocation does not match its quotation item';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    left join public.finance_quotation_payment_installment_items ai
      on ai.payment_installment_id = i.id
    group by i.id, i.amount_before_tax, i.vat_amount, i.total_amount
    having coalesce(sum(ai.allocated_amount_before_tax), 0) > i.amount_before_tax
      or coalesce(sum(ai.allocated_vat_amount), 0) > i.vat_amount
      or coalesce(sum(ai.allocated_total), 0) > i.total_amount
  ) then
    raise exception 'Payment allocation exceeds its installment total';
  end if;

  if exists (
    select 1
    from public.finance_quotation_items qi
    left join public.finance_quotation_payment_installment_items ai
      on ai.quotation_item_id = qi.id
    left join public.finance_quotation_payment_installments i
      on i.id = ai.payment_installment_id
      and i.payment_terms_id = v_terms.id
    where qi.quotation_id = p_quotation_id
    group by qi.id, qi.amount_before_tax, qi.vat_amount, qi.line_total
    having coalesce(sum(case when i.id is not null then ai.allocated_amount_before_tax else 0 end), 0) > qi.amount_before_tax
      or coalesce(sum(case when i.id is not null then ai.allocated_vat_amount else 0 end), 0) > qi.vat_amount
      or coalesce(sum(case when i.id is not null then ai.allocated_total else 0 end), 0) > qi.line_total
  ) then
    raise exception 'Payment allocation exceeds its source quotation item';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms.id
      and trigger_type = 'recurring_period'
  ) and exists (
    select 1
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms.id
      and trigger_type = 'case_milestone'
  ) then
    raise exception 'Recurring and milestone installments cannot be mixed';
  end if;

  if not p_require_complete then
    return;
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    where i.payment_terms_id = v_terms.id
      and i.installment_no <> (
        select count(*)
        from public.finance_quotation_payment_installments prior
        where prior.payment_terms_id = v_terms.id
          and prior.installment_no <= i.installment_no
      )
  ) then
    raise exception 'Payment installment numbers must be sequential from 1';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    left join public.finance_quotation_payment_installment_items ai
      on ai.payment_installment_id = i.id
    where i.payment_terms_id = v_terms.id
    group by i.id
    having count(ai.id) = 0
  ) then
    raise exception 'Every payment installment requires at least one allocation';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments i
    left join public.finance_quotation_payment_installment_items ai
      on ai.payment_installment_id = i.id
    where i.payment_terms_id = v_terms.id
    group by i.id, i.amount_before_tax, i.vat_amount, i.total_amount
    having coalesce(sum(ai.allocated_amount_before_tax), 0) <> i.amount_before_tax
      or coalesce(sum(ai.allocated_vat_amount), 0) <> i.vat_amount
      or coalesce(sum(ai.allocated_total), 0) <> i.total_amount
  ) then
    raise exception 'Payment installment totals do not reconcile with allocations';
  end if;

  if exists (
    select 1
    from public.finance_quotation_items qi
    left join public.finance_quotation_payment_installment_items ai
      on ai.quotation_item_id = qi.id
    left join public.finance_quotation_payment_installments i
      on i.id = ai.payment_installment_id
      and i.payment_terms_id = v_terms.id
    where qi.quotation_id = p_quotation_id
    group by qi.id, qi.amount_before_tax, qi.vat_amount, qi.line_total
    having coalesce(sum(case when i.id is not null then ai.allocated_amount_before_tax else 0 end), 0) <> qi.amount_before_tax
      or coalesce(sum(case when i.id is not null then ai.allocated_vat_amount else 0 end), 0) <> qi.vat_amount
      or coalesce(sum(case when i.id is not null then ai.allocated_total else 0 end), 0) <> qi.line_total
  ) then
    raise exception 'Every quotation item must be allocated exactly in full';
  end if;

  select
    coalesce(sum(amount_before_tax), 0),
    coalesce(sum(vat_amount), 0),
    coalesce(sum(total_amount), 0)
  into v_installment_before_tax, v_installment_vat, v_installment_total
  from public.finance_quotation_payment_installments
  where payment_terms_id = v_terms.id;

  if v_installment_before_tax <> v_terms.amount_before_tax
    or v_installment_vat <> v_terms.vat_amount
    or v_installment_total <> v_terms.total_amount
    or v_installment_before_tax <> v_quotation.subtotal_vatable + v_quotation.subtotal_non_vatable
    or v_installment_vat <> v_quotation.vat_amount
    or v_installment_total <> v_quotation.grand_total then
    raise exception 'Payment terms totals do not reconcile with the quotation';
  end if;

  if exists (
    select 1
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms.id
    group by calculation_type
    having calculation_type = 'percentage'
       and coalesce(sum(percentage), 0) <> 100.000000
  ) then
    raise exception 'Percentage payment installments must total exactly 100.000000';
  end if;

end;
$$;
revoke all on function public.validate_finance_quotation_payment_terms(uuid,boolean) from public,anon,authenticated;
create or replace function public.create_default_finance_quotation_payment_terms(p_quotation_id uuid,p_payment_due_days integer default 0) returns uuid language plpgsql security definer set search_path=public as $$ declare q public.finance_quotations%rowtype; h uuid; i record; installment uuid; begin if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed'; end if; select * into q from public.finance_quotations where id=p_quotation_id for update; if q.id is null or q.status<>'draft' or p_payment_due_days<0 then raise exception 'Invalid draft quotation or due days'; end if; select id into h from public.finance_quotation_payment_terms where quotation_id=q.id; if h is not null then return h; end if; if not exists(select 1 from public.finance_quotation_items where quotation_id=q.id) then raise exception 'Quotation items are required'; end if; insert into public.finance_quotation_payment_terms(quotation_id,payment_method_type,currency,amount_before_tax,vat_amount,total_amount,created_by_user_id,updated_by_user_id) values(q.id,'single','THB',q.subtotal_vatable+q.subtotal_non_vatable,q.vat_amount,q.grand_total,auth.uid(),auth.uid()) returning id into h; insert into public.finance_quotation_payment_installments(payment_terms_id,installment_no,title,calculation_type,percentage,trigger_type,payment_due_days,amount_before_tax,vat_amount,total_amount) values(h,1,'ชำระเต็มจำนวน / Full Payment','percentage',100,'quotation_acceptance',p_payment_due_days,q.subtotal_vatable+q.subtotal_non_vatable,q.vat_amount,q.grand_total) returning id into installment; for i in select * from public.finance_quotation_items where quotation_id=q.id order by sort_order,id loop insert into public.finance_quotation_payment_installment_items(payment_installment_id,quotation_item_id,allocated_amount_before_tax,allocated_vat_amount,allocated_total,allocation_percentage,sort_order) values(installment,i.id,i.amount_before_tax,i.vat_amount,i.line_total,100,i.sort_order); end loop; perform public.validate_finance_quotation_payment_terms(q.id,true); return h; end; $$;
revoke all on function public.create_default_finance_quotation_payment_terms(uuid,integer) from public,anon,authenticated; grant execute on function public.create_default_finance_quotation_payment_terms(uuid,integer) to authenticated;

create or replace function public.save_finance_quotation_payment_terms_draft(
  p_quotation_id uuid,
  p_payment_method_type text,
  p_client_summary text,
  p_installments_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotation public.finance_quotations%rowtype;
  v_terms_id uuid;
  v_installment_id uuid;
  v_installment jsonb;
  v_item jsonb;
  v_installment_index integer := 0;
  v_item_index integer;
  v_installment_no integer;
  v_calculation_type text;
  v_calculation_type_count integer;
  v_percentage numeric(9,6);
  v_before_tax numeric(14,2);
  v_vat numeric(14,2);
  v_total numeric(14,2);
  v_quotation_item_id uuid;
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to save quotation payment terms';
  end if;

  if p_installments_json is null or jsonb_typeof(p_installments_json) <> 'array' then
    raise exception 'Payment installments must be a JSON array';
  end if;

  select * into v_quotation
  from public.finance_quotations
  where id = p_quotation_id
  for update;

  if v_quotation.id is null then
    raise exception 'Quotation not found';
  end if;

  if v_quotation.status <> 'draft' then
    raise exception 'Only draft quotations can change payment terms';
  end if;

  if p_payment_method_type not in ('single', 'installments', 'milestone', 'recurring', 'manual') then
    raise exception 'Unsupported payment method type';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_installments_json) installment
    where jsonb_typeof(installment) <> 'object'
      or nullif(btrim(coalesce(installment->>'title', '')), '') is null
      or coalesce(installment->>'calculation_type', '') not in ('fixed_amount', 'percentage')
      or coalesce(installment->>'trigger_type', '') not in ('quotation_acceptance', 'agreement_effective', 'date', 'case_milestone', 'recurring_period', 'manual')
      or coalesce((installment->>'payment_due_days')::integer, 0) < 0
      or (
        installment->>'calculation_type' = 'percentage'
        and (coalesce((installment->>'percentage')::numeric, 0) <= 0 or (installment->>'percentage')::numeric > 100)
      )
      or (
        installment->>'calculation_type' = 'fixed_amount'
        and nullif(installment->>'percentage', '') is not null
      )
      or (installment->>'trigger_type' = 'date' and nullif(installment->>'due_date', '') is null)
      or (
        installment->>'trigger_type' in ('case_milestone', 'recurring_period', 'manual')
        and nullif(btrim(coalesce(installment->>'trigger_description', '')), '') is null
      )
      or (
        installment ? 'items'
        and jsonb_typeof(installment->'items') <> 'array'
      )
  ) then
    raise exception 'Payment terms draft contains invalid installment data';
  end if;

  insert into public.finance_quotation_payment_terms (
    quotation_id, payment_method_type, currency, client_summary,
    amount_before_tax, vat_amount, total_amount,
    created_by_user_id, updated_by_user_id
  ) values (
    p_quotation_id, p_payment_method_type, 'THB', nullif(btrim(coalesce(p_client_summary, '')), ''),
    0, 0, 0, auth.uid(), auth.uid()
  )
  on conflict (quotation_id) do update set
    payment_method_type = excluded.payment_method_type,
    client_summary = excluded.client_summary,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  returning id into v_terms_id;

  -- PostgreSQL rolls back this replacement if any later server-side validation fails.
  delete from public.finance_quotation_payment_installments
  where payment_terms_id = v_terms_id;

  -- Store only schedule metadata first. Allocation totals are derived below.
  for v_installment in select value from jsonb_array_elements(p_installments_json) loop
    v_installment_index := v_installment_index + 1;
    insert into public.finance_quotation_payment_installments (
      payment_terms_id, installment_no, title, calculation_type, percentage,
      trigger_type, trigger_description, due_date, payment_due_days, client_note,
      amount_before_tax, vat_amount, total_amount, sort_order
    ) values (
      v_terms_id,
      coalesce((v_installment->>'installment_no')::integer, v_installment_index),
      btrim(v_installment->>'title'),
      v_installment->>'calculation_type',
      case when v_installment->>'calculation_type' = 'percentage' then (v_installment->>'percentage')::numeric else null end,
      v_installment->>'trigger_type',
      nullif(btrim(coalesce(v_installment->>'trigger_description', '')), ''),
      nullif(v_installment->>'due_date', '')::date,
      coalesce((v_installment->>'payment_due_days')::integer, 0),
      nullif(btrim(coalesce(v_installment->>'client_note', '')), ''),
      0, 0, 0,
      coalesce((v_installment->>'sort_order')::integer, v_installment_index - 1)
    ) returning id into v_installment_id;
  end loop;

  select min(calculation_type), count(distinct calculation_type)
  into v_calculation_type, v_calculation_type_count
  from public.finance_quotation_payment_installments
  where payment_terms_id = v_terms_id;

  if v_calculation_type_count > 1 then
    raise exception 'Mixed fixed-amount and percentage installments are not supported';
  end if;

  v_installment_index := 0;
  for v_installment in select value from jsonb_array_elements(p_installments_json) loop
    v_installment_index := v_installment_index + 1;
    v_installment_no := coalesce((v_installment->>'installment_no')::integer, v_installment_index);

    select id, calculation_type, percentage
    into v_installment_id, v_calculation_type, v_percentage
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms_id
      and installment_no = v_installment_no;

    v_item_index := 0;
    for v_item in
      select value
      from jsonb_array_elements(coalesce(v_installment->'items', '[]'::jsonb))
    loop
      v_item_index := v_item_index + 1;
      if jsonb_typeof(v_item) <> 'object'
        or nullif(v_item->>'quotation_item_id', '') is null then
        raise exception 'Payment allocation item is invalid';
      end if;

      v_quotation_item_id := (v_item->>'quotation_item_id')::uuid;
      if not exists (
        select 1
        from public.finance_quotation_items
        where id = v_quotation_item_id
          and quotation_id = p_quotation_id
      ) then
        raise exception 'Payment allocation item does not belong to this quotation';
      end if;

      if v_calculation_type = 'percentage' then
        -- Browser identifies source items only; it cannot choose percentage-plan amounts.
        v_before_tax := 0;
        v_vat := 0;
        v_total := 0;
      else
        v_before_tax := coalesce((v_item->>'allocated_amount_before_tax')::numeric, -1);
        v_vat := coalesce((v_item->>'allocated_vat_amount')::numeric, -1);
        v_total := coalesce((v_item->>'allocated_total')::numeric, -1);
        if v_before_tax < 0 or v_vat < 0 or v_total < 0 or v_total <> v_before_tax + v_vat then
          raise exception 'Payment allocation amount is invalid';
        end if;
      end if;

      insert into public.finance_quotation_payment_installment_items (
        payment_installment_id, quotation_item_id,
        allocated_amount_before_tax, allocated_vat_amount, allocated_total,
        allocation_percentage, sort_order
      ) values (
        v_installment_id, v_quotation_item_id,
        v_before_tax, v_vat, v_total,
        case
          when v_calculation_type = 'percentage' then v_percentage
          when nullif(v_item->>'allocation_percentage', '') is null then null
          else (v_item->>'allocation_percentage')::numeric
        end,
        coalesce((v_item->>'sort_order')::integer, v_item_index - 1)
      );
    end loop;
  end loop;

  if v_calculation_type_count = 1 and v_calculation_type = 'percentage' then
    -- At 100%, the final selected installment receives the exact stored-precision residual.
    -- Below 100%, each selected installment receives only its rounded submitted percentage.
    with ordered as (
      select
        ai.id,
        qi.id as quotation_item_id,
        qi.amount_before_tax as source_before_tax,
        qi.vat_amount as source_vat,
        i.percentage,
        row_number() over (
          partition by qi.id
          order by i.installment_no, i.sort_order, i.id, ai.id
        ) as allocation_no,
        count(*) over (partition by qi.id) as allocation_count,
        sum(i.percentage) over (partition by qi.id) as item_percentage_total
      from public.finance_quotation_payment_installment_items ai
      join public.finance_quotation_payment_installments i
        on i.id = ai.payment_installment_id
      join public.finance_quotation_items qi
        on qi.id = ai.quotation_item_id
      where i.payment_terms_id = v_terms_id
    ), rounded as (
      select
        ordered.*,
        round(source_before_tax * percentage / 100, 2)::numeric(14,2) as rounded_before_tax,
        round(source_vat * percentage / 100, 2)::numeric(14,2) as rounded_vat
      from ordered
    ), allocated as (
      select
        rounded.*,
        coalesce(sum(rounded_before_tax) over (
          partition by quotation_item_id
          order by allocation_no
          rows between unbounded preceding and 1 preceding
        ), 0)::numeric(14,2) as prior_before_tax,
        coalesce(sum(rounded_vat) over (
          partition by quotation_item_id
          order by allocation_no
          rows between unbounded preceding and 1 preceding
        ), 0)::numeric(14,2) as prior_vat
      from rounded
    )
    update public.finance_quotation_payment_installment_items ai
    set
      allocated_amount_before_tax = case
        when allocation_no = allocation_count and item_percentage_total = 100.000000
          then source_before_tax - prior_before_tax
        else rounded_before_tax
      end,
      allocated_vat_amount = case
        when allocation_no = allocation_count and item_percentage_total = 100.000000
          then source_vat - prior_vat
        else rounded_vat
      end,
      allocated_total = case
        when allocation_no = allocation_count and item_percentage_total = 100.000000
          then (source_before_tax - prior_before_tax) + (source_vat - prior_vat)
        else rounded_before_tax + rounded_vat
      end
    from allocated
    where ai.id = allocated.id;
  end if;

  for v_installment_id in
    select id
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms_id
  loop
    update public.finance_quotation_payment_installments i
    set
      amount_before_tax = totals.amount_before_tax,
      vat_amount = totals.vat_amount,
      total_amount = totals.total_amount,
      updated_at = now()
    from (
      select
        coalesce(sum(allocated_amount_before_tax), 0)::numeric(14,2) as amount_before_tax,
        coalesce(sum(allocated_vat_amount), 0)::numeric(14,2) as vat_amount,
        coalesce(sum(allocated_total), 0)::numeric(14,2) as total_amount
      from public.finance_quotation_payment_installment_items
      where payment_installment_id = v_installment_id
    ) totals
    where i.id = v_installment_id;
  end loop;

  update public.finance_quotation_payment_terms h
  set
    amount_before_tax = totals.amount_before_tax,
    vat_amount = totals.vat_amount,
    total_amount = totals.total_amount,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  from (
    select
      coalesce(sum(amount_before_tax), 0)::numeric(14,2) as amount_before_tax,
      coalesce(sum(vat_amount), 0)::numeric(14,2) as vat_amount,
      coalesce(sum(total_amount), 0)::numeric(14,2) as total_amount
    from public.finance_quotation_payment_installments
    where payment_terms_id = v_terms_id
  ) totals
  where h.id = v_terms_id;

  perform public.validate_finance_quotation_payment_terms(p_quotation_id, false);
  return v_terms_id;
end;
$$;

revoke all on function public.save_finance_quotation_payment_terms_draft(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_finance_quotation_payment_terms_draft(uuid, text, text, jsonb) to authenticated;

-- Future document_data_snapshot_json.payment_terms contract (not written in this phase):
-- {
--   "version": 1, "payment_method_type": "...", "currency": "THB",
--   "client_summary": "...", "amount_before_tax": 0, "vat_amount": 0,
--   "total_amount": 0, "installments": [{
--     "installment_no": 1, "title": "...", "calculation_type": "percentage",
--     "percentage": 100, "trigger_type": "quotation_acceptance",
--     "trigger_description": null, "due_date": null, "payment_due_days": 0,
--     "client_note": null, "amount_before_tax": 0, "vat_amount": 0,
--     "total_amount": 0, "items": [{
--       "quotation_item_id": "uuid", "description_snapshot": "...",
--       "vat_applicable": false, "vat_rate": 0,
--       "allocated_amount_before_tax": 0, "allocated_vat_amount": 0,
--       "allocated_total": 0
--     }]
--   }]
-- }
