-- Phase 3C: additive Billing Plan foundation. No invoices or legacy finance data are created.
create table if not exists public.finance_billing_plans (
  id uuid primary key default gen_random_uuid(),
  fee_agreement_id uuid not null references public.finance_fee_agreements(id) on delete restrict,
  status text not null default 'draft',
  billing_method text not null,
  currency text not null default 'THB',
  amount_before_tax numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  title text null,
  description text null,
  installment_count integer not null default 1,
  recurring_config_json jsonb null,
  plan_snapshot_json jsonb null,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_billing_plans_status_check
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  constraint finance_billing_plans_billing_method_check
    check (billing_method in ('single', 'installments', 'milestone', 'recurring', 'manual')),
  constraint finance_billing_plans_amounts_non_negative_check
    check (amount_before_tax >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_billing_plans_total_amount_check
    check (total_amount = amount_before_tax + vat_amount),
  constraint finance_billing_plans_installment_count_check
    check (installment_count > 0)
);

create table if not exists public.finance_billing_installments (
  id uuid primary key default gen_random_uuid(),
  billing_plan_id uuid not null references public.finance_billing_plans(id) on delete cascade,
  installment_no integer not null,
  sort_order integer not null default 0,
  title text not null,
  trigger_description text null,
  trigger_type text not null,
  due_date date null,
  milestone_code text null,
  recurring_period_start date null,
  recurring_period_end date null,
  status text not null default 'pending',
  ready_to_invoice_at timestamptz null,
  invoiced_at timestamptz null,
  cancelled_at timestamptz null,
  amount_before_tax numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_billing_installments_no_check check (installment_no > 0),
  constraint finance_billing_installments_sort_order_check check (sort_order >= 0),
  constraint finance_billing_installments_title_check check (btrim(title) <> ''),
  constraint finance_billing_installments_trigger_type_check
    check (trigger_type in ('agreement_effective', 'date', 'case_milestone', 'manual', 'recurring_period')),
  constraint finance_billing_installments_status_check
    check (status in ('pending', 'ready_to_invoice', 'invoiced', 'cancelled')),
  constraint finance_billing_installments_amounts_non_negative_check
    check (amount_before_tax >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_billing_installments_total_amount_check
    check (total_amount = amount_before_tax + vat_amount),
  constraint finance_billing_installments_trigger_metadata_check
    check (
      (trigger_type = 'agreement_effective' and milestone_code is null)
      or (trigger_type = 'date' and due_date is not null)
      or (
        trigger_type = 'case_milestone'
        and (
          nullif(btrim(coalesce(milestone_code, '')), '') is not null
          or nullif(btrim(coalesce(trigger_description, '')), '') is not null
        )
      )
      or trigger_type = 'manual'
      or (
        trigger_type = 'recurring_period'
        and recurring_period_start is not null
        and recurring_period_end is not null
        and recurring_period_end >= recurring_period_start
      )
    )
);

create table if not exists public.finance_billing_installment_items (
  id uuid primary key default gen_random_uuid(),
  billing_installment_id uuid not null references public.finance_billing_installments(id) on delete cascade,
  fee_agreement_item_id uuid not null references public.finance_fee_agreement_items(id) on delete restrict,
  amount_before_tax numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  allocation_percent numeric(9, 6) null,
  sort_order integer not null default 0,
  allocation_snapshot_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_billing_installment_items_amounts_non_negative_check
    check (amount_before_tax >= 0 and vat_amount >= 0 and total_amount >= 0),
  constraint finance_billing_installment_items_total_amount_check
    check (total_amount = amount_before_tax + vat_amount),
  constraint finance_billing_installment_items_allocation_percent_check
    check (allocation_percent is null or (allocation_percent >= 0 and allocation_percent <= 100)),
  constraint finance_billing_installment_items_sort_order_check
    check (sort_order >= 0),
  constraint uq_finance_billing_installment_items_agreement_item
    unique (billing_installment_id, fee_agreement_item_id)
);

create unique index if not exists uq_finance_billing_plans_active_agreement
on public.finance_billing_plans (fee_agreement_id)
where status <> 'cancelled';

create index if not exists idx_finance_billing_plans_fee_agreement_id
on public.finance_billing_plans (fee_agreement_id);

create index if not exists idx_finance_billing_plans_status
on public.finance_billing_plans (status);

create index if not exists idx_finance_billing_plans_billing_method
on public.finance_billing_plans (billing_method);

create index if not exists idx_finance_billing_plans_created_at
on public.finance_billing_plans (created_at desc);

create unique index if not exists uq_finance_billing_installments_plan_no
on public.finance_billing_installments (billing_plan_id, installment_no);

create index if not exists idx_finance_billing_installments_plan_id
on public.finance_billing_installments (billing_plan_id);

create index if not exists idx_finance_billing_installments_plan_sort_order
on public.finance_billing_installments (billing_plan_id, sort_order);

create index if not exists idx_finance_billing_installments_status
on public.finance_billing_installments (status);

create index if not exists idx_finance_billing_installments_due_date
on public.finance_billing_installments (due_date)
where due_date is not null;

create index if not exists idx_finance_billing_installments_milestone_code
on public.finance_billing_installments (milestone_code)
where milestone_code is not null;

create index if not exists idx_finance_billing_installments_ready_to_invoice_at
on public.finance_billing_installments (ready_to_invoice_at)
where ready_to_invoice_at is not null;

create index if not exists idx_finance_billing_installment_items_installment_id
on public.finance_billing_installment_items (billing_installment_id);

create index if not exists idx_finance_billing_installment_items_agreement_item_id
on public.finance_billing_installment_items (fee_agreement_item_id);

create index if not exists idx_finance_billing_installment_items_installment_sort_order
on public.finance_billing_installment_items (billing_installment_id, sort_order);

alter table public.finance_billing_plans enable row level security;
alter table public.finance_billing_installments enable row level security;
alter table public.finance_billing_installment_items enable row level security;

drop policy if exists "finance billing managers select plans" on public.finance_billing_plans;
create policy "finance billing managers select plans"
on public.finance_billing_plans
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance billing managers select installments" on public.finance_billing_installments;
create policy "finance billing managers select installments"
on public.finance_billing_installments
for select
using (public.current_user_can_manage_finance_quotations());

drop policy if exists "finance billing managers select installment items" on public.finance_billing_installment_items;
create policy "finance billing managers select installment items"
on public.finance_billing_installment_items
for select
using (public.current_user_can_manage_finance_quotations());

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

  if v_agreement.status <> 'active' then
    raise exception 'Billing plans can only be created from an active fee agreement';
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

-- SECURITY DEFINER lifecycle RPCs rely on the table owner's ordinary RLS bypass.
-- Reassess these functions before enabling FORCE ROW LEVEL SECURITY on billing tables.
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

    if v_agreement.id is null or v_agreement.status <> 'active' then
      raise exception 'Billing plan requires an active fee agreement';
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

create or replace function public.set_finance_billing_installment_status(
  p_installment_id uuid,
  p_next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installment public.finance_billing_installments%rowtype;
  v_billing_plan_id uuid;
  v_plan_status text;
  v_next_status text := lower(btrim(coalesce(p_next_status, '')));
begin
  if not public.current_user_can_manage_finance_quotations() then
    raise exception 'Not allowed to update finance billing installment status';
  end if;

  select billing_plan_id
    into v_billing_plan_id
  from public.finance_billing_installments
  where id = p_installment_id;

  if not found then
    raise exception 'Billing installment not found';
  end if;

  select status
    into v_plan_status
  from public.finance_billing_plans
  where id = v_billing_plan_id
  for update;

  if not found then
    raise exception 'Billing plan not found';
  end if;

  select *
    into v_installment
  from public.finance_billing_installments
  where id = p_installment_id
  for update;

  if v_plan_status <> 'active' then
    raise exception 'Billing installment status can only change while its billing plan is active';
  end if;

  if not (
    (v_installment.status = 'pending' and v_next_status in ('ready_to_invoice', 'cancelled'))
    or (v_installment.status = 'ready_to_invoice' and v_next_status in ('pending', 'cancelled'))
  ) then
    raise exception 'Invalid finance billing installment status transition';
  end if;

  if v_installment.status = 'ready_to_invoice'
    and v_next_status = 'pending'
    and not public.current_user_is_admin() then
    raise exception 'Only an admin can reset a ready billing installment';
  end if;

  update public.finance_billing_installments
  set
    status = v_next_status,
    ready_to_invoice_at = case
      when v_next_status = 'ready_to_invoice' then now()
      when v_next_status = 'pending' then null
      else ready_to_invoice_at
    end,
    cancelled_at = case when v_next_status = 'cancelled' then now() else cancelled_at end,
    updated_by_user_id = auth.uid(),
    updated_at = now()
  where id = v_installment.id;

  return v_installment.id;
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

  if v_agreement.status <> 'active' then
    raise exception 'A default billing plan requires an active fee agreement';
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
revoke all on function public.set_finance_billing_installment_status(uuid, text) from public, anon, authenticated;
revoke all on function public.create_default_finance_billing_plan(uuid) from public, anon, authenticated;
grant execute on function public.save_finance_billing_plan_draft(uuid, uuid, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.set_finance_billing_plan_status(uuid, text) to authenticated;
grant execute on function public.set_finance_billing_installment_status(uuid, text) to authenticated;
grant execute on function public.create_default_finance_billing_plan(uuid) to authenticated;
