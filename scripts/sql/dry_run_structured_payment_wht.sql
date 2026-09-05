-- Manual transactional dry-run only. No business RPC is invoked.
begin;
create temporary table structured_wht_dry_run_baseline as select jsonb_build_object(
  'payments',(select md5(coalesce(jsonb_agg(to_jsonb(p)-'wht_calculation_mode' order by p.id)::text,'[]')) from public.finance_payments p),
  'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id)::text,'[]')) from public.finance_payment_invoice_allocations a),
  'payment_audit',(select count(*) from public.finance_payment_audit_events),
  'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'[]')) from public.finance_invoices i),
  'cash',(select count(*) from public.finance_cash_transactions),
  'openings',(select count(*) from public.finance_account_opening_balances),
  'ledger',(select count(*) from public.finance_company_ledger),
  'compensation',(select count(*) from public.finance_compensation_batches),
  'preserved_functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
      'save_finance_payment_draft','confirm_finance_payment','post_confirmed_payment_to_finance_cash_transaction',
      'cancel_finance_payment_draft','reverse_finance_payment','correct_erroneous_finance_payment','reallocate_finance_payment_allocation'))
) as evidence;

-- BEGIN EMBEDDED MIGRATION 036 (byte-for-byte)
-- Structured WHT intent. No historical amounts or rate/base guesses are backfilled.
-- Version 1 permits only one fully settled, single-line V2 Invoice per Payment.
-- Rate selection is the user's assertion of applicability, never an economic-classification tax rule.
do $preflight$
begin
  if to_regprocedure('public.save_finance_payment_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb)') is null
    or to_regprocedure('public.confirm_finance_payment(uuid,boolean)') is null
    or to_regprocedure('public.finance_invoice_active_reserved_settlement(uuid,uuid)') is null
    or to_regprocedure('public.guard_finance_payment_child_mutation()') is null
    or to_regclass('public.finance_payment_allocation_reallocations') is null
    or to_regclass('public.finance_invoice_charge_allocations') is null
  then raise exception 'Structured WHT requires the current Payment and Invoice V2 contracts'; end if;
  if to_regclass('public.finance_payment_wht_components') is not null
    or exists (select 1 from information_schema.columns where table_schema='public' and table_name='finance_payments' and column_name='wht_calculation_mode')
  then raise exception 'Structured WHT objects already exist; inspect partial state'; end if;
end;
$preflight$;

alter table public.finance_payments add column wht_calculation_mode text null
  constraint finance_payments_wht_calculation_mode_check check (wht_calculation_mode in ('none','rate'));

create table public.finance_payment_wht_components (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  invoice_item_id uuid not null references public.finance_invoice_items(id) on delete restrict,
  calculation_rule text not null check (calculation_rule = 'single_line_full_invoice_v1'),
  base_amount numeric(14,2) not null check (base_amount > 0),
  rate_percent numeric(7,4) not null check (rate_percent > 0 and rate_percent <= 100),
  calculated_wht_amount numeric(14,2) not null,
  basis_snapshot_json jsonb not null check (jsonb_typeof(basis_snapshot_json)='object'),
  created_at timestamptz not null default now(),
  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
  constraint finance_payment_wht_calculation_check check (
    calculated_wht_amount > 0 and calculated_wht_amount = round(base_amount * rate_percent / 100, 2)
  ),
  constraint finance_payment_wht_line_unique unique (payment_id, invoice_id, invoice_item_id)
);
create index finance_payment_wht_invoice_idx on public.finance_payment_wht_components(invoice_id);

-- Pure snapshot inspection, not a new VAT calculation or lookup of mutable source data.
create function public.finance_invoice_wht_basis_v1(p_snapshot jsonb)
returns jsonb language plpgsql immutable set search_path = public
as $basis$
declare v_invoice jsonb; v_item jsonb; v_base numeric; v_vat numeric; v_gross numeric;
begin
  if p_snapshot->>'schema_version' is distinct from '2'
    or p_snapshot->>'source_model' is distinct from 'billable_charge_v2'
    or jsonb_typeof(p_snapshot->'items') is distinct from 'array'
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  if jsonb_array_length(p_snapshot->'items') <> 1 then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
  v_invoice := p_snapshot->'invoice';
  v_item := p_snapshot->'items'->0->'invoice_item';
  if v_invoice->>'document_status' is distinct from 'issued'
    or v_item->>'source_state' is distinct from 'active'
    or v_item->>'invoice_id' is distinct from v_invoice->>'id'
    or nullif(v_invoice->>'currency','') is null
    or nullif(v_invoice->>'id','') is null or nullif(v_item->>'id','') is null
    or jsonb_typeof(v_item->'vat_applicable') is distinct from 'boolean'
    or exists (select 1 from (values ('amount_before_vat'),('vat_amount'),('total_amount')) f(key)
      where jsonb_typeof(v_invoice->f.key) is distinct from 'number')
    or exists (select 1 from (values ('amount_before_vat'),('vat_amount'),('line_total')) f(key)
      where jsonb_typeof(v_item->f.key) is distinct from 'number')
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  v_base := (v_invoice->>'amount_before_vat')::numeric;
  v_vat := (v_invoice->>'vat_amount')::numeric;
  v_gross := (v_invoice->>'total_amount')::numeric;
  if v_base <= 0 or v_vat < 0 or v_gross <= 0 or v_base+v_vat <> v_gross
    or v_base <> round(v_base,2) or v_vat <> round(v_vat,2) or v_gross <> round(v_gross,2)
    or (v_item->>'amount_before_vat')::numeric <> v_base
    or (v_item->>'vat_amount')::numeric <> v_vat or (v_item->>'line_total')::numeric <> v_gross
    or (v_item->>'vat_applicable' = 'false' and v_vat <> 0)
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  return jsonb_build_object('invoice_id',v_invoice->>'id','invoice_item_id',v_item->>'id',
    'currency',v_invoice->>'currency','amount_before_vat',v_base,'vat_amount',v_vat,'total_amount',v_gross,
    'vat_applicable',(v_item->>'vat_applicable')::boolean,'calculation_rule','single_line_full_invoice_v1');
end;
$basis$;

create function public.assert_finance_payment_structured_wht(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public
as $assert_wht$
declare
  p public.finance_payments%rowtype; c public.finance_payment_wht_components%rowtype;
  i public.finance_invoices%rowtype; a public.finance_payment_invoice_allocations%rowtype;
  v_count integer; v_basis jsonb;
begin
  select * into p from public.finance_payments where id=p_payment_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  select count(*) into v_count from public.finance_payment_wht_components where payment_id=p.id;
  if p.wht_amount = 0 then
    if p.wht_calculation_mode = 'rate' or v_count <> 0 then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
    return;
  end if;
  if p.wht_calculation_mode is distinct from 'rate' then raise exception 'WHT_LEGACY_RECALCULATION_REQUIRED'; end if;
  if v_count <> 1 or (select count(*) from public.finance_payment_invoice_allocations where payment_id=p.id) <> 1
  then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
  select * into c from public.finance_payment_wht_components where payment_id=p.id;
  select * into a from public.finance_payment_invoice_allocations where payment_id=p.id;
  select * into i from public.finance_invoices where id=a.invoice_id for update;
  if i.document_status is distinct from 'issued' or i.client_id <> p.client_id or i.currency <> p.currency
  then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
  v_basis := public.finance_invoice_wht_basis_v1(i.issued_snapshot_json);
  if v_basis->>'invoice_id' is distinct from i.id::text or v_basis->>'currency' is distinct from i.currency
    or c.invoice_id <> i.id or c.invoice_item_id::text is distinct from v_basis->>'invoice_item_id'
    or not exists (select 1 from public.finance_invoice_items where id=c.invoice_item_id and invoice_id=i.id and source_state='active')
    or c.basis_snapshot_json is distinct from v_basis
    or c.base_amount <> (v_basis->>'amount_before_vat')::numeric
    or c.calculated_wht_amount <> p.wht_amount
    or a.wht_credit_allocated <> p.wht_amount or a.cash_allocated <> p.cash_amount
    or i.total_amount <> (v_basis->>'total_amount')::numeric
  then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  if p.cash_amount+p.wht_amount <> i.total_amount
    or public.finance_invoice_active_reserved_settlement(i.id,p.id) <> 0
  then raise exception 'WHT_PARTIAL_SCOPE_UNSUPPORTED'; end if;
end;
$assert_wht$;

-- A guard on the actual transition covers the existing confirm RPC and cannot
-- be bypassed by the old monetary-only save RPC. Confirmed history is not revalidated.
create function public.guard_finance_payment_wht_confirmation()
returns trigger language plpgsql security definer set search_path = public
as $confirm_guard$
begin
  if tg_op='INSERT' then
    if new.wht_amount=0 and new.wht_calculation_mode is null then new.wht_calculation_mode:='none'; end if;
  elsif old.status='draft' and new.status='confirmed' then
    if new.cash_amount is distinct from old.cash_amount or new.wht_amount is distinct from old.wht_amount
      or new.wht_calculation_mode is distinct from old.wht_calculation_mode
    then raise exception 'WHT_SAVE_BEFORE_CONFIRM'; end if;
    perform public.assert_finance_payment_structured_wht(old.id);
    if new.wht_amount=0 then new.wht_calculation_mode:='none'; end if;
  end if;
  return new;
end;
$confirm_guard$;
create trigger finance_payment_structured_wht_before_write before insert or update on public.finance_payments
for each row execute function public.guard_finance_payment_wht_confirmation();
create trigger finance_payment_wht_component_draft_guard before insert or update or delete on public.finance_payment_wht_components
for each row execute function public.guard_finance_payment_child_mutation();

create function public.guard_structured_wht_reallocation()
returns trigger language plpgsql security definer set search_path = public
as $reallocation_guard$
begin
  if exists (select 1 from public.finance_payment_wht_components where payment_id=new.payment_id)
  then raise exception 'WHT_REALLOCATION_REQUIRES_COMPONENT_WORKFLOW'; end if;
  return new;
end;
$reallocation_guard$;
create trigger finance_payment_structured_wht_reallocation_guard before insert on public.finance_payment_allocation_reallocations
for each row execute function public.guard_structured_wht_reallocation();

create function public.save_finance_payment_tax_draft(
  p_payment_id uuid, p_received_on date, p_payment_method text, p_receiving_bank_account_id uuid,
  p_receiving_account_reference text, p_external_transaction_reference text, p_payer_name text, p_note text,
  p_cash_amount numeric, p_wht_amount numeric, p_allocations_json jsonb,
  p_wht_calculation_mode text, p_wht_rate_percent numeric
)
returns uuid language plpgsql security definer set search_path = public
as $save_tax$
declare
  p public.finance_payments%rowtype; i public.finance_invoices%rowtype;
  v_basis jsonb; v_calculated numeric; v_old_components jsonb; v_new_components jsonb;
begin
  if not public.current_user_can_manage_finance_payments() then raise exception 'Not allowed to save Payment Draft'; end if;
  select * into p from public.finance_payments where id=p_payment_id for update;
  if p.id is null or p.status<>'draft' then raise exception 'Only a Draft Payment can be saved'; end if;
  if p_wht_calculation_mode is null or p_wht_calculation_mode not in ('none','rate') then raise exception 'WHT_LEGACY_RECALCULATION_REQUIRED'; end if;
  if p_wht_calculation_mode='none' then
    if p_wht_amount is distinct from 0 or p_wht_rate_percent is not null then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  else
    if p_wht_rate_percent is null or p_wht_rate_percent <= 0 or p_wht_rate_percent > 100
      or p_wht_rate_percent <> round(p_wht_rate_percent,4)
    then raise exception 'WHT_RATE_REQUIRED'; end if;
    if jsonb_typeof(p_allocations_json) is distinct from 'array' then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
    if jsonb_array_length(p_allocations_json) <> 1 then raise exception 'WHT_COMPONENT_SCOPE_UNSUPPORTED'; end if;
    select * into i from public.finance_invoices where id=(p_allocations_json->0->>'invoice_id')::uuid;
    if i.id is null or i.document_status<>'issued' then raise exception 'WHT_SNAPSHOT_INVALID'; end if;
    v_basis := public.finance_invoice_wht_basis_v1(i.issued_snapshot_json);
    v_calculated := round((v_basis->>'amount_before_vat')::numeric*p_wht_rate_percent/100,2);
    if p_wht_amount is distinct from v_calculated or v_calculated <= 0
      or p_cash_amount is distinct from ((v_basis->>'total_amount')::numeric-v_calculated)
    then raise exception 'WHT_CALCULATION_MISMATCH'; end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(c)-array['id','created_at','created_by_user_id'] order by c.invoice_id,c.invoice_item_id),'[]')
  into v_old_components from public.finance_payment_wht_components c where payment_id=p.id;
  v_new_components := case when p_wht_calculation_mode='none' then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
    'payment_id',p.id,'invoice_id',i.id,'invoice_item_id',(v_basis->>'invoice_item_id')::uuid,
    'calculation_rule','single_line_full_invoice_v1','base_amount',(v_basis->>'amount_before_vat')::numeric,
    'rate_percent',p_wht_rate_percent,'calculated_wht_amount',v_calculated,'basis_snapshot_json',v_basis)) end;

  -- Delegate all existing normalization, permissions, Invoice locking, reservation,
  -- allocation, date/method and financial guards to the canonical Draft saver.
  perform public.save_finance_payment_draft(p_payment_id,p_received_on,p_payment_method,p_receiving_bank_account_id,
    p_receiving_account_reference,p_external_transaction_reference,p_payer_name,p_note,p_cash_amount,p_wht_amount,p_allocations_json);
  if p.wht_calculation_mode is distinct from p_wht_calculation_mode or v_old_components is distinct from v_new_components then
    delete from public.finance_payment_wht_components where payment_id=p.id;
    if p_wht_calculation_mode='rate' then
      insert into public.finance_payment_wht_components(payment_id,invoice_id,invoice_item_id,calculation_rule,base_amount,rate_percent,calculated_wht_amount,basis_snapshot_json,created_by_user_id)
      values(p.id,i.id,(v_basis->>'invoice_item_id')::uuid,'single_line_full_invoice_v1',(v_basis->>'amount_before_vat')::numeric,p_wht_rate_percent,v_calculated,v_basis,auth.uid());
    end if;
    update public.finance_payments set wht_calculation_mode=p_wht_calculation_mode,updated_at=now(),updated_by_user_id=auth.uid() where id=p.id;
    perform public.record_finance_payment_audit_event(p.id,'draft_saved',jsonb_build_object(
      'operation','structured_wht_saved','wht_calculation_mode',p_wht_calculation_mode,
      'previous_components',v_old_components,'components',v_new_components,'rate_selected_by_user',true));
  end if;
  perform public.assert_finance_payment_structured_wht(p.id);
  return p.id;
end;
$save_tax$;

alter table public.finance_payment_wht_components enable row level security;
create policy "payment viewers read wht components" on public.finance_payment_wht_components for select to authenticated
using (public.current_user_can_view_finance_payments());
revoke all on table public.finance_payment_wht_components from public,anon,authenticated;
grant select on table public.finance_payment_wht_components to authenticated;
revoke all on function public.finance_invoice_wht_basis_v1(jsonb) from public,anon,authenticated;
revoke all on function public.assert_finance_payment_structured_wht(uuid) from public,anon,authenticated;
revoke all on function public.guard_finance_payment_wht_confirmation() from public,anon,authenticated;
revoke all on function public.guard_structured_wht_reallocation() from public,anon,authenticated;
revoke all on function public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric) from public,anon,authenticated;
grant execute on function public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric) to authenticated;

comment on column public.finance_payments.wht_calculation_mode is
  'NULL is legacy/unstructured; never infer intent from wht_amount. Existing confirmed history remains valid.';
comment on table public.finance_payment_wht_components is
  'Allocation/Invoice-line WHT calculation evidence. Draft-only writes; immutable after confirmation. Rate applicability is explicitly selected, not inferred from economic_classification. Partial/mixed component scope and certificate exceptions require a later controlled workflow.';
-- END EMBEDDED MIGRATION 036

do $verify_no_business_writes$
declare after_evidence jsonb;
begin
  select jsonb_build_object(
  'payments',(select md5(coalesce(jsonb_agg(to_jsonb(p)-'wht_calculation_mode' order by p.id)::text,'[]')) from public.finance_payments p),
  'allocations',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id)::text,'[]')) from public.finance_payment_invoice_allocations a),
  'payment_audit',(select count(*) from public.finance_payment_audit_events),
  'invoices',(select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'[]')) from public.finance_invoices i),
  'cash',(select count(*) from public.finance_cash_transactions),
  'openings',(select count(*) from public.finance_account_opening_balances),
  'ledger',(select count(*) from public.finance_company_ledger),
  'compensation',(select count(*) from public.finance_compensation_batches),
  'preserved_functions',(select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
      'save_finance_payment_draft','confirm_finance_payment','post_confirmed_payment_to_finance_cash_transaction',
      'cancel_finance_payment_draft','reverse_finance_payment','correct_erroneous_finance_payment','reallocate_finance_payment_allocation'))
) into after_evidence;
  if after_evidence is distinct from (select evidence from structured_wht_dry_run_baseline) then
    raise exception 'Structured WHT dry-run changed business data or an existing lifecycle function';
  end if;
end;
$verify_no_business_writes$;

-- SELECT only. One row. Immediate post-apply foundation verification, before any WHT UAT save.
with contracts as (
  select
    pg_get_functiondef('public.guard_finance_payment_wht_confirmation()'::regprocedure) as confirmation_guard,
    pg_get_functiondef('public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)'::regprocedure) as saver,
    pg_get_functiondef('public.assert_finance_payment_structured_wht(uuid)'::regprocedure) as validator,
    pg_get_functiondef('public.confirm_finance_payment(uuid,boolean)'::regprocedure) as confirmation
), checks as (
  select
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='finance_payments'
      and column_name='wht_calculation_mode' and is_nullable='YES' and column_default is null) as nullable_legacy_mode,
    (select count(*)=11 from information_schema.columns where table_schema='public' and table_name='finance_payment_wht_components') as component_columns_present,
    (select relrowsecurity from pg_class where oid='public.finance_payment_wht_components'::regclass) as component_rls_enabled,
    exists (select 1 from pg_policies where schemaname='public' and tablename='finance_payment_wht_components'
      and cmd='SELECT' and qual like '%current_user_can_view_finance_payments%') as component_read_policy,
    not has_table_privilege('authenticated','public.finance_payment_wht_components','INSERT,UPDATE,DELETE') as component_browser_writes_blocked,
    not has_table_privilege('anon','public.finance_payment_wht_components','SELECT,INSERT,UPDATE,DELETE') as anonymous_component_access_blocked,
    has_table_privilege('authenticated','public.finance_payment_wht_components','SELECT') as authorized_component_read,
    has_function_privilege('authenticated','public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)','EXECUTE') as structured_save_available,
    not has_function_privilege('anon','public.save_finance_payment_tax_draft(uuid,date,text,uuid,text,text,text,text,numeric,numeric,jsonb,text,numeric)','EXECUTE') as anonymous_save_blocked,
    not has_function_privilege('authenticated','public.assert_finance_payment_structured_wht(uuid)','EXECUTE') as internal_validator_not_callable,
    (select count(*)=3 from pg_trigger where not tgisinternal and tgenabled='O' and tgname in (
      'finance_payment_structured_wht_before_write','finance_payment_wht_component_draft_guard','finance_payment_structured_wht_reallocation_guard')) as guards_enabled,
    confirmation_guard like '%old.status=''draft'' and new.status=''confirmed''%'
      and confirmation_guard like '%assert_finance_payment_structured_wht(old.id)%' as confirmation_requires_structured_evidence,
    saver like '%public.save_finance_payment_draft(%' and saver like '%current_user_can_manage_finance_payments()%'
      and saver like '%''previous_components'',v_old_components%' as save_delegates_existing_guards_and_audits,
    validator like '%finance_invoice_active_reserved_settlement(i.id,p.id) <> 0%'
      and validator like '%WHT_PARTIAL_SCOPE_UNSUPPORTED%' as partial_and_duplicate_base_guard,
    confirmation like '%post_confirmed_payment_to_finance_cash_transaction(v_payment.id)%'
      and confirmation like '%''wht_excluded_from_cash_posting'', true%' as cash_integration_preserved,
    (select count(*)=0 from public.finance_payment_wht_components) as no_components_backfilled,
    (select count(*)=0 from public.finance_payments where wht_calculation_mode is not null) as no_payment_modes_backfilled
  from contracts
), observability as (
  select (select count(*) from public.finance_payments) as payment_rows,
    (select count(*) from public.finance_payments where status='draft' and wht_amount>0) as legacy_wht_drafts,
    (select count(*) from public.finance_payments where status='confirmed') as confirmed_payments,
    (select count(*) from public.finance_cash_transactions) as cash_transactions,
    (select count(*) from public.finance_account_opening_balances) as opening_balances
)
select checks.*, observability.*,
  not exists (select 1 from jsonb_each(to_jsonb(checks)) c where c.value is distinct from 'true'::jsonb)
    as structured_payment_wht_verification_pass
from checks cross join observability;

rollback;
