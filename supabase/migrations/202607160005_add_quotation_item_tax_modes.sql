-- Commercial Terms v2: retain the entered unit price and make its VAT treatment explicit.
alter table public.finance_quotation_items
  add column if not exists price_tax_mode text;

update public.finance_quotation_items
set price_tax_mode = case when vat_applicable then 'vat_exclusive' else 'non_vat' end
where price_tax_mode is null;

alter table public.finance_quotation_items
  alter column price_tax_mode set default 'vat_exclusive',
  alter column price_tax_mode set not null;

alter table public.finance_quotation_items
  drop constraint if exists finance_quotation_items_price_tax_mode_check;
alter table public.finance_quotation_items
  add constraint finance_quotation_items_price_tax_mode_check
  check (price_tax_mode in ('non_vat', 'vat_exclusive', 'vat_inclusive'));

create or replace function public.apply_finance_quotation_item_tax_mode()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entered_total numeric(14,2);
begin
  new.price_tax_mode := coalesce(nullif(btrim(new.price_tax_mode), ''), case when coalesce(new.vat_applicable, false) then 'vat_exclusive' else 'non_vat' end);
  if new.price_tax_mode not in ('non_vat', 'vat_exclusive', 'vat_inclusive') then
    raise exception 'Unsupported quotation item tax mode';
  end if;
  if new.quantity <= 0 or new.unit_price < 0 then raise exception 'Quotation item quantity and unit price are invalid'; end if;
  new.vat_applicable := new.price_tax_mode <> 'non_vat';
  new.vat_rate := case when new.vat_applicable then coalesce(nullif(new.vat_rate, 0), 7) else 0 end;
  v_entered_total := round(new.quantity * new.unit_price, 2);
  if new.price_tax_mode = 'vat_inclusive' then
    new.line_total := v_entered_total;
    new.amount_before_tax := round(v_entered_total / (1 + new.vat_rate / 100), 2);
    new.vat_amount := new.line_total - new.amount_before_tax;
  elsif new.price_tax_mode = 'vat_exclusive' then
    new.amount_before_tax := v_entered_total;
    new.vat_amount := round(new.amount_before_tax * new.vat_rate / 100, 2);
    new.line_total := new.amount_before_tax + new.vat_amount;
  else
    new.amount_before_tax := v_entered_total;
    new.vat_amount := 0;
    new.line_total := new.amount_before_tax;
  end if;
  return new;
end;
$$;

drop trigger if exists finance_quotation_item_tax_mode_before_write on public.finance_quotation_items;
create trigger finance_quotation_item_tax_mode_before_write
before insert or update of quantity, unit_price, price_tax_mode, vat_applicable, vat_rate
on public.finance_quotation_items
for each row execute function public.apply_finance_quotation_item_tax_mode();

-- Applies the explicit tax mode after the stable-ID draft RPC has completed its existing
-- validation and item preservation work. Referenced commercial items remain immutable.
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
    select 1 from jsonb_array_elements(p_items) p join public.finance_quotation_items qi on qi.id = (p->>'id')::uuid
    where qi.quotation_id = p_quotation_id and coalesce(p->>'price_tax_mode', case when qi.vat_applicable then 'vat_exclusive' else 'non_vat' end) <> qi.price_tax_mode
      and exists (select 1 from public.finance_quotation_payment_installment_items ai where ai.quotation_item_id = qi.id)
  ) then raise exception 'This quotation item is already used in Payment Terms. Revise the payment terms before changing its commercial amounts.'; end if;
  update public.finance_quotation_items qi set
    price_tax_mode = coalesce(nullif(p->>'price_tax_mode', ''), case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end),
    vat_rate = case when coalesce(p->>'price_tax_mode', case when coalesce((p->>'vat_applicable')::boolean, false) then 'vat_exclusive' else 'non_vat' end) = 'non_vat' then 0 else coalesce((p->>'vat_rate')::numeric, 7) end,
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
revoke all on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) from public, anon;
grant execute on function public.apply_finance_quotation_draft_item_tax_modes(uuid,jsonb) to authenticated;
