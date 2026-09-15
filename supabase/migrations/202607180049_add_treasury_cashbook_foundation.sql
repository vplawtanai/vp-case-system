-- Candidate 049. No receipt backfill, opening, cash movement, payout or Ledger write.
-- Bank master data remains authoritative. Only the Office Cash location is seeded.
create table public.finance_cash_locations (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[a-z][a-z0-9_]{0,49}$'),
 name_th text not null check(length(btrim(name_th)) between 1 and 200),
 name_en text not null check(length(btrim(name_en)) between 1 and 200),
 is_active boolean not null default true
);
insert into public.finance_cash_locations(code,name_th,name_en)
 values('office_cash','เงินสดสำนักงาน','Office Cash');

alter table public.finance_cash_transactions alter column bank_account_id drop not null;
alter table public.finance_cash_transactions
 add column cash_location_id uuid references public.finance_cash_locations(id) on delete restrict,
 add column source_direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 add column source_snapshot_json jsonb,
 add constraint treasury_cash_location check(num_nonnulls(bank_account_id,cash_location_id)=1),
 add constraint treasury_cash_source check(num_nonnulls(source_payment_id,source_direct_money_receipt_id)<=1),
 add constraint treasury_cash_evidence check(source_snapshot_json is null or jsonb_typeof(source_snapshot_json)='object');
alter table public.finance_cash_transactions drop constraint finance_cash_transactions_type_check;
alter table public.finance_cash_transactions add constraint finance_cash_transactions_type_check check(transaction_type in
 ('customer_payment','direct_money_receipt','manual_inflow','manual_outflow','expense_claim','refund','tax_payment','transfer','reversal','other'));
alter table public.finance_cash_transactions drop constraint finance_cash_transactions_source_contract_check;
alter table public.finance_cash_transactions add constraint finance_cash_transactions_source_contract_check check(
 (reversal_of_transaction_id is null and (
  (transaction_type='customer_payment' and source_payment_id is not null and source_direct_money_receipt_id is null and direction='inflow')
  or (transaction_type='direct_money_receipt' and source_direct_money_receipt_id is not null and source_payment_id is null and direction='inflow' and source_snapshot_json is not null)
  or (transaction_type not in('customer_payment','direct_money_receipt','reversal') and source_payment_id is null and source_direct_money_receipt_id is null)))
 or (reversal_of_transaction_id is not null and transaction_type='reversal' and status='confirmed'));
create unique index treasury_cash_direct_original on public.finance_cash_transactions(source_direct_money_receipt_id)
 where source_direct_money_receipt_id is not null and reversal_of_transaction_id is null;
create index treasury_cash_location_date on public.finance_cash_transactions(cash_location_id,currency,occurred_at desc);

alter table public.finance_account_opening_balances alter column bank_account_id drop not null;
alter table public.finance_account_opening_balances
 add column cash_location_id uuid references public.finance_cash_locations(id) on delete restrict,
 add constraint treasury_opening_location check(num_nonnulls(bank_account_id,cash_location_id)=1);
create unique index treasury_opening_cash_current on public.finance_account_opening_balances(cash_location_id,currency) where status='confirmed';
create unique index treasury_opening_cash_initial on public.finance_account_opening_balances(cash_location_id,currency)
 where status='draft' and supersedes_opening_balance_id is null;

-- Prospective physical locations are explicit IDs, never guessed from legacy text.
alter table public.finance_direct_money_receipts add column receiving_cash_location_id uuid references public.finance_cash_locations(id) on delete restrict;
alter table public.finance_direct_money_receipts add constraint treasury_direct_location check(receiving_cash_location_id is null or receiving_bank_account_id is null);
alter function public.direct_money_payload(jsonb) rename to direct_money_payload_before_treasury;
create function public.direct_money_payload(p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $payload$
declare result jsonb; location uuid:=(p_input->>'receiving_cash_location_id')::uuid;
begin
 result:=public.direct_money_payload_before_treasury(p_input-'receiving_cash_location_id');
 if location is not null and (p_input->>'method'='bank_transfer' or not exists(select 1 from public.finance_cash_locations where id=location and is_active))
 then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
 return result||jsonb_build_object('receiving_cash_location_id',location);
end;
$payload$;
create function public.treasury_direct_input_location()
returns trigger language plpgsql security definer set search_path=public as $location$
begin
 if new.status='draft' then new.receiving_cash_location_id:=(new.input_json->>'receiving_cash_location_id')::uuid; end if;
 return new;
end;
$location$;
create trigger treasury_direct_input_location before insert or update of input_json on public.finance_direct_money_receipts
 for each row execute function public.treasury_direct_input_location();

-- Only future confirmations use this wrapper; existing frozen JSON is untouched.
alter function public.direct_money_snapshot(public.finance_direct_money_receipts) rename to direct_money_snapshot_before_treasury;
create function public.direct_money_snapshot(p public.finance_direct_money_receipts)
returns jsonb language sql stable security definer set search_path=public as $snapshot$
 select public.direct_money_snapshot_before_treasury(p)||jsonb_build_object(
  'cash_location',(select to_jsonb(l) from public.finance_cash_locations l where l.id=p.receiving_cash_location_id),
  'cashbook',jsonb_build_object('posting_policy','confirmed_opening_strict_cutoff',
   'original_leg_key','direct_money_receipt:'||p.id::text||':original'));
$snapshot$;

create function public.treasury_can_view(p_bank uuid,p_cash uuid)
returns boolean language sql stable security definer set search_path=public as $view$
 select public.current_user_can_view_finance_cash_transactions() and
 case when p_bank is not null then public.current_user_can_view_finance_cash_bank_account(p_bank)
 else exists(select 1 from public.user_profiles where id=auth.uid() and active and role in('admin','partner')) end;
$view$;
create function public.treasury_location_active(p_bank uuid,p_cash uuid)
returns boolean language sql stable security definer set search_path=public as $active$
 select num_nonnulls(p_bank,p_cash)=1 and (exists(select 1 from public.finance_bank_accounts where id=p_bank and is_active)
 or exists(select 1 from public.finance_cash_locations where id=p_cash and is_active));
$active$;

-- Existing immutable lifecycle and append-only audit guards remain in place.
-- Bank and physical cash use the same source and opening integrity contract.
create or replace function public.validate_finance_cash_transaction_integrity(p_cash_transaction_id uuid)
returns void language plpgsql security definer set search_path=public as $integrity$
declare c public.finance_cash_transactions%rowtype; o public.finance_cash_transactions%rowtype; opening public.finance_account_opening_balances%rowtype;
 p public.finance_payments%rowtype; d public.finance_direct_money_receipts%rowtype;
begin
 select * into c from public.finance_cash_transactions where id=p_cash_transaction_id; if not found then return; end if;
 if c.status='confirmed' then
  if not public.treasury_location_active(c.bank_account_id,c.cash_location_id) then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
  select * into opening from public.finance_account_opening_balances where bank_account_id is not distinct from c.bank_account_id
   and cash_location_id is not distinct from c.cash_location_id and currency=c.currency and status='confirmed';
  if opening.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
  if c.occurred_at<=opening.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 end if;
 if c.reversal_of_transaction_id is not null then
  select * into o from public.finance_cash_transactions where id=c.reversal_of_transaction_id;
  if o.source_snapshot_json is not null then raise exception 'TREASURY_CASH_CORRECTION_WORKFLOW_REQUIRED'; end if;
  if o.id is null or o.status<>'confirmed' or o.reversal_of_transaction_id is not null or c.status<>'confirmed'
   or c.direction=o.direction or c.cash_amount<>o.cash_amount or c.currency<>o.currency
   or c.bank_account_id is distinct from o.bank_account_id or c.cash_location_id is distinct from o.cash_location_id
   or c.source_payment_id is distinct from o.source_payment_id or c.source_direct_money_receipt_id is distinct from o.source_direct_money_receipt_id
   or c.occurred_at<o.occurred_at then raise exception 'TREASURY_REVERSAL_INTEGRITY'; end if;
 end if;
 if c.source_payment_id is not null then
  select * into p from public.finance_payments where id=c.source_payment_id;
  if p.id is null or p.status not in('confirmed','reversed') or p.cash_amount<=0 or c.cash_amount<>p.cash_amount or c.currency<>p.currency
   or c.bank_account_id is distinct from p.receiving_bank_account_id then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
 end if;
 if c.source_direct_money_receipt_id is not null then
  select * into d from public.finance_direct_money_receipts where id=c.source_direct_money_receipt_id;
  if d.id is null or d.status not in('confirmed','reversed') or c.cash_amount<>d.cash_amount or c.currency<>d.currency
   or c.bank_account_id is distinct from d.receiving_bank_account_id
   or (d.receiving_cash_location_id is not null and c.cash_location_id is distinct from d.receiving_cash_location_id)
  then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
 end if;
 if c.source_snapshot_json is not null then
  if c.status<>'confirmed' or c.direction<>'inflow' or c.reversal_of_transaction_id is not null
   or c.source_snapshot_json->>'source_id' is distinct from coalesce(c.source_payment_id,c.source_direct_money_receipt_id)::text
   or c.source_snapshot_json->>'source_type' is distinct from (case when c.source_payment_id is not null then 'payment' else 'direct_money_receipt' end)
   or c.source_snapshot_json->>'source_leg' is distinct from 'original'
   or c.source_snapshot_json->>'status' is distinct from 'confirmed'
   or c.source_snapshot_json->>'currency' is distinct from c.currency
   or (c.source_snapshot_json->>'bank_account_id')::uuid is distinct from c.bank_account_id
   or (c.source_snapshot_json->>'cash_location_id')::uuid is distinct from c.cash_location_id
   or c.occurred_at is distinct from public.finance_bangkok_completed_day_end((c.source_snapshot_json->>'received_on')::date)
   or (c.source_snapshot_json->>'cash_amount')::numeric is distinct from c.cash_amount
   or not exists(select 1 from public.finance_cash_transaction_audit_events a where a.cash_transaction_id=c.id and a.event_type='confirmed'
     and a.event_payload_json->'source'=c.source_snapshot_json)
  then raise exception 'TREASURY_SOURCE_EVIDENCE_REQUIRED'; end if;
 end if;
end;
$integrity$;

create or replace function public.validate_finance_opening_balance_integrity(p_opening_balance_id uuid)
returns void language plpgsql security definer set search_path=public as $opening_integrity$
declare b public.finance_account_opening_balances%rowtype; prior public.finance_account_opening_balances%rowtype;
begin
 select * into b from public.finance_account_opening_balances where id=p_opening_balance_id; if not found then return; end if;
 if b.status='confirmed' and not public.treasury_location_active(b.bank_account_id,b.cash_location_id) then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
 if b.supersedes_opening_balance_id is not null then
  select * into prior from public.finance_account_opening_balances where id=b.supersedes_opening_balance_id;
  if prior.id is null or prior.bank_account_id is distinct from b.bank_account_id or prior.cash_location_id is distinct from b.cash_location_id
   or prior.currency<>b.currency or prior.as_of>=b.as_of then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
  if b.status='confirmed' and prior.status<>'superseded' then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
 elsif b.status='confirmed' and exists(select 1 from public.finance_account_opening_balances h where h.id<>b.id
  and h.bank_account_id is not distinct from b.bank_account_id and h.cash_location_id is not distinct from b.cash_location_id
  and h.currency=b.currency and h.status in('confirmed','superseded')) then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
 if b.status='superseded' and not exists(select 1 from public.finance_account_opening_balances r where r.supersedes_opening_balance_id=b.id and r.status='confirmed')
 then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
end;
$opening_integrity$;

create function public.treasury_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare p public.finance_payments%rowtype; d public.finance_direct_money_receipts%rowtype;
begin
 if p_type='payment' then
  select * into p from public.finance_payments where id=p_id;
  if p.id is null then raise exception 'TREASURY_SOURCE_MISSING'; end if;
  return jsonb_build_object('source_type',p_type,'source_id',p.id,'status',p.status,'bank_account_id',p.receiving_bank_account_id,'cash_location_id',null,
   'received_on',p.received_on,'cash_amount',p.cash_amount,'wht_amount',p.wht_amount,'currency',p.currency,'payer_name',p.payer_name,
   'reference',coalesce(p.external_transaction_reference,p.internal_reference,upper(left(p.id::text,8))),
   'confirmed_at',p.confirmed_at,'confirmed_by',p.confirmed_by_user_id,'method',p.payment_method,
   'classification','invoice_payment','description',p.note);
 elsif p_type='direct_money_receipt' then
  select * into d from public.finance_direct_money_receipts where id=p_id;
  if d.id is null then raise exception 'TREASURY_SOURCE_MISSING'; end if;
  return jsonb_build_object('source_type',p_type,'source_id',d.id,'status',d.status,'bank_account_id',d.receiving_bank_account_id,'cash_location_id',d.receiving_cash_location_id,
   'received_on',d.received_on,'cash_amount',d.cash_amount,'wht_amount',d.wht_amount,'currency',d.currency,'payer_name',d.payer_name,
   'reference',coalesce(d.reference_no,upper(left(d.id::text,8))),'confirmed_at',d.confirmed_at,'confirmed_by',d.confirmed_by,
   'method',d.method,'legacy_cash_location',d.cash_location,'description',d.note,
   'classification',(select jsonb_agg(jsonb_build_object('money_nature',l->>'money_nature','classification',l->>'classification','description',l->>'description'))
     from jsonb_array_elements(d.confirmed_snapshot_json->'lines') l));
 end if;
 raise exception 'TREASURY_SOURCE_INVALID';
end;
$source$;

create function public.treasury_post_source(p_type text,p_id uuid,p_manual boolean default false,p_cash_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $post$
declare s jsonb; bank uuid; location uuid; opening public.finance_account_opening_balances%rowtype;
 c public.finance_cash_transactions%rowtype; amount numeric; ts timestamptz:=clock_timestamp(); evidence jsonb;
begin
 if p_type='payment' then perform 1 from public.finance_payments where id=p_id for update;
 elsif p_type='direct_money_receipt' then perform 1 from public.finance_direct_money_receipts where id=p_id for update;
 else raise exception 'TREASURY_SOURCE_INVALID'; end if;
 s:=public.treasury_source(p_type,p_id);
 if s->>'status'<>'confirmed' then raise exception 'TREASURY_CONFIRMED_REQUIRED'; end if;
 amount:=(s->>'cash_amount')::numeric;
 if amount=0 then return jsonb_build_object('outcome','not_required_zero_cash','wht_excluded_from_cash_posting',true); end if;
 bank:=(s->>'bank_account_id')::uuid; location:=(s->>'cash_location_id')::uuid;
 if p_cash_location_id is not null then
  if not p_manual or p_type<>'direct_money_receipt' or bank is not null or (location is not null and location<>p_cash_location_id)
  then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
  location:=p_cash_location_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:'||(s->>'currency'),0));
 select * into c from public.finance_cash_transactions where reversal_of_transaction_id is null and
  ((p_type='payment' and source_payment_id=p_id) or (p_type='direct_money_receipt' and source_direct_money_receipt_id=p_id)) for update;
 if c.id is not null then
  if c.status<>'confirmed' or c.cash_amount<>amount or c.currency<>s->>'currency' or c.bank_account_id is distinct from bank
   or (location is not null and c.cash_location_id is distinct from location) then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
  return jsonb_build_object('outcome','posted','cash_transaction_id',c.id,'idempotent_existing_row',true,'wht_excluded_from_cash_posting',true);
 end if;
 if num_nonnulls(bank,location)<>1 then
  if p_manual or exists(select 1 from public.finance_account_opening_balances where status='confirmed' and currency=s->>'currency')
  then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
  return jsonb_build_object('outcome','pre_cutover_no_opening','wht_excluded_from_cash_posting',true);
 end if;
 if not public.treasury_location_active(bank,location) then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
 select * into opening from public.finance_account_opening_balances where bank_account_id is not distinct from bank
  and cash_location_id is not distinct from location and currency=s->>'currency' and status='confirmed' for update;
 if opening.id is null then
  if exists(select 1 from public.finance_account_opening_balances h where h.bank_account_id is not distinct from bank
   and h.cash_location_id is not distinct from location and h.currency=s->>'currency' and h.status='superseded')
  then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
  if p_manual then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
  return jsonb_build_object('outcome','pre_cutover_no_opening','wht_excluded_from_cash_posting',true);
 end if;
 if (s->>'received_on')::date<=(opening.as_of at time zone 'Asia/Bangkok')::date then
  if p_manual then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
  return jsonb_build_object('outcome','pre_cutover_date','wht_excluded_from_cash_posting',true);
 end if;
 evidence:=s||jsonb_build_object('schema_version',1,'source_leg','original','cash_location_id',location,'opening_id',opening.id,
  'opening_as_of',opening.as_of,'materialization',case when p_manual then 'explicit' else 'on_confirmation' end,
  'materialized_by',auth.uid(),'materialized_at',ts,'wht_excluded',true,'vat_already_in_cash',true);
 insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,
  source_payment_id,source_direct_money_receipt_id,source_snapshot_json,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
 values(public.finance_bangkok_completed_day_end((s->>'received_on')::date),'inflow',case when p_type='payment' then 'customer_payment' else p_type end,
  bank,location,amount,s->>'currency','confirmed',case when p_type='payment' then p_id end,case when p_type='direct_money_receipt' then p_id end,
  evidence,left(s->>'reference',500),left(s->>'description',1000),auth.uid(),auth.uid(),ts,auth.uid()) returning * into c;
 perform public.record_finance_cash_transaction_audit_event(c.id,'confirmed',jsonb_build_object('source',evidence,'opening_balance_id',opening.id,'confirmed_creation',true));
 return jsonb_build_object('outcome','posted','cash_transaction_id',c.id,'cash_amount',amount,'currency',c.currency,'bank_account_id',bank,
  'cash_location_id',location,'idempotent_existing_row',false,'wht_excluded_from_cash_posting',true);
end;
$post$;
create or replace function public.post_confirmed_payment_to_finance_cash_transaction(p_payment_id uuid)
returns jsonb language sql security definer set search_path=public as $payment$
 select public.treasury_post_source('payment',p_payment_id);
$payment$;

create function public.treasury_confirm_direct()
returns trigger language plpgsql security definer set search_path=public as $direct$
begin
 if old.status='draft' and new.status='confirmed' then perform public.treasury_post_source('direct_money_receipt',new.id); end if;
 return new;
end;
$direct$;
create trigger treasury_confirm_direct after update of status on public.finance_direct_money_receipts
 for each row execute function public.treasury_confirm_direct();
create function public.treasury_source_reversal_guard()
returns trigger language plpgsql security definer set search_path=public as $reverse$
begin
 if new.status='reversed' and old.status<>'reversed' and exists(select 1 from public.finance_cash_transactions c where c.source_snapshot_json is not null and
  ((tg_table_name='finance_payments' and c.source_payment_id=old.id) or (tg_table_name='finance_direct_money_receipts' and c.source_direct_money_receipt_id=old.id)))
 then raise exception 'TREASURY_CASH_CORRECTION_WORKFLOW_REQUIRED'; end if;
 return new;
end;
$reverse$;
create trigger treasury_payment_reversal before update of status on public.finance_payments for each row execute function public.treasury_source_reversal_guard();
create trigger treasury_direct_reversal before update of status on public.finance_direct_money_receipts for each row execute function public.treasury_source_reversal_guard();

create function public.materialize_finance_treasury_source(p_source_type text,p_source_id uuid,p_expected_source jsonb,p_acknowledged boolean,p_cash_location_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $materialize$
begin
 if not public.money_allocation_admin() then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'TREASURY_ACK_REQUIRED'; end if;
 if p_source_type='payment' then perform 1 from public.finance_payments where id=p_source_id for update;
 elsif p_source_type='direct_money_receipt' then perform 1 from public.finance_direct_money_receipts where id=p_source_id for update; end if;
 if public.treasury_source(p_source_type,p_source_id) is distinct from p_expected_source then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
 return public.treasury_post_source(p_source_type,p_source_id,true,p_cash_location_id);
end;
$materialize$;

-- Treasury initial/replacement opening uses existing evidence and audit tables.
-- The explicit acknowledgement states that later receipts are NOT in this balance.
-- Missing post-opening sources remain visible as pending, never bulk-backfilled.
create function public.save_finance_treasury_opening(p_id uuid,p_bank_account_id uuid,p_cash_location_id uuid,p_start_date date,p_amount numeric,p_note text,p_expected_updated_at timestamptz default null,p_supersedes_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $save_opening$
declare b public.finance_account_opening_balances%rowtype; prior public.finance_account_opening_balances%rowtype; cutoff timestamptz; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_id is null or p_start_date is null or p_start_date>(now() at time zone 'Asia/Bangkok')::date or p_amount is null or p_amount<0
  or p_amount<>round(p_amount,2) or p_amount>999999999999.99 or nullif(btrim(p_note),'') is null or length(p_note)>4000
  or not public.treasury_location_active(p_bank_account_id,p_cash_location_id) then raise exception 'TREASURY_OPENING_INPUT'; end if;
 cutoff:=public.finance_bangkok_completed_day_end(p_start_date-1);
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 select * into b from public.finance_account_opening_balances where id=p_id for update;
 if b.id is not null and b.status<>'draft' then raise exception 'TREASURY_OPENING_IMMUTABLE'; end if;
 if b.id is not null and b.bank_account_id is not distinct from p_bank_account_id and b.cash_location_id is not distinct from p_cash_location_id
  and b.as_of=cutoff and b.balance_amount=p_amount and b.note=btrim(p_note) and b.supersedes_opening_balance_id is not distinct from p_supersedes_id then return b.id; end if;
 if b.updated_at is distinct from p_expected_updated_at then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
 if p_supersedes_id is not null then
  select * into prior from public.finance_account_opening_balances where id=p_supersedes_id for update;
  if prior.id is null or prior.status<>'confirmed' or prior.bank_account_id is distinct from p_bank_account_id
   or prior.cash_location_id is distinct from p_cash_location_id or cutoff<=prior.as_of then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
 elsif exists(select 1 from public.finance_account_opening_balances where status in('confirmed','superseded')
  and bank_account_id is not distinct from p_bank_account_id and cash_location_id is not distinct from p_cash_location_id and currency='THB')
 then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
 if b.id is null then
  insert into public.finance_account_opening_balances(id,bank_account_id,cash_location_id,currency,as_of,balance_amount,note,supersedes_opening_balance_id,
   created_by_user_id,updated_by_user_id,updated_at)
  values(p_id,p_bank_account_id,p_cash_location_id,'THB',cutoff,p_amount,btrim(p_note),p_supersedes_id,auth.uid(),auth.uid(),ts);
 else
  update public.finance_account_opening_balances set bank_account_id=p_bank_account_id,cash_location_id=p_cash_location_id,as_of=cutoff,
   balance_amount=p_amount,note=btrim(p_note),supersedes_opening_balance_id=p_supersedes_id,updated_by_user_id=auth.uid(),updated_at=ts where id=b.id;
 end if;
 perform public.record_finance_opening_balance_audit_event(p_id,case when b.id is null then 'draft_created' else 'draft_saved' end,
  jsonb_build_object('opening_balance_only',true,'not_revenue',true,'start_date',p_start_date,'amount',p_amount,'note',btrim(p_note)));
 return p_id;
end;
$save_opening$;
create function public.confirm_finance_treasury_opening(p_id uuid,p_expected_updated_at timestamptz,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $confirm_opening$
declare b public.finance_account_opening_balances%rowtype; prior public.finance_account_opening_balances%rowtype; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'TREASURY_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 select * into b from public.finance_account_opening_balances where id=p_id for update;
 if b.id is null then raise exception 'TREASURY_OPENING_INPUT'; end if;
 if b.status='confirmed' then return b.id; end if;
 if b.status<>'draft' or b.updated_at is distinct from p_expected_updated_at then raise exception 'TREASURY_SOURCE_CHANGED'; end if;
 if not public.treasury_location_active(b.bank_account_id,b.cash_location_id) then raise exception 'TREASURY_LOCATION_REQUIRED'; end if;
 if b.supersedes_opening_balance_id is not null then
  select * into prior from public.finance_account_opening_balances where id=b.supersedes_opening_balance_id for update;
  if prior.status is distinct from 'confirmed' then raise exception 'TREASURY_OPENING_LINEAGE'; end if;
  update public.finance_account_opening_balances set status='superseded',superseded_at=ts,superseded_by_user_id=auth.uid(),updated_at=ts,updated_by_user_id=auth.uid() where id=prior.id;
  perform public.record_finance_opening_balance_audit_event(prior.id,'superseded',jsonb_build_object('replacement_id',b.id));
 end if;
 update public.finance_account_opening_balances set status='confirmed',confirmed_at=ts,confirmed_by_user_id=auth.uid(),updated_at=ts,updated_by_user_id=auth.uid() where id=b.id;
 perform public.record_finance_opening_balance_audit_event(b.id,'confirmed',jsonb_build_object('opening_balance_only',true,'not_revenue',true,'later_receipts_excluded_acknowledged',true,'evidence',to_jsonb(b)));
 return b.id;
end;
$confirm_opening$;

create view public.finance_treasury_accounts with(security_invoker=true) as
 select 'bank'::text as kind,id as account_id,id as bank_account_id,null::uuid as cash_location_id,short_name as name_th,short_name as name_en,bank_name,account_number,is_active
 from public.finance_bank_accounts where public.treasury_can_view(id,null)
 union all select 'cash',id,null,id,name_th,name_en,null,null,is_active from public.finance_cash_locations where public.treasury_can_view(null,id);
create view public.finance_treasury_balances with(security_invoker=true) as
 select a.*,coalesce(o.currency,'THB') as currency,o.id as opening_id,o.as_of as opening_as_of,o.balance_amount as opening_amount,
 o.balance_amount+coalesce(m.inflow,0)-coalesce(m.outflow,0) as system_balance,coalesce(m.inflow,0) as inflow,coalesce(m.outflow,0) as outflow
 from public.finance_treasury_accounts a left join public.finance_account_opening_balances o on o.bank_account_id is not distinct from a.bank_account_id
  and o.cash_location_id is not distinct from a.cash_location_id and o.currency='THB' and o.status='confirmed'
 left join lateral(select sum(c.cash_amount) filter(where direction='inflow') as inflow,sum(c.cash_amount) filter(where direction='outflow') as outflow
  from public.finance_cash_transactions c where c.bank_account_id is not distinct from a.bank_account_id and c.cash_location_id is not distinct from a.cash_location_id
   and c.currency='THB' and c.status='confirmed' and c.occurred_at>o.as_of) m on true;

create function public.get_finance_treasury(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $read$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_cash_transactions() then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'TREASURY_FILTER_INVALID'; end if;
 select jsonb_build_object('can_manage',public.money_allocation_admin(),
  'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by kind,name_th,account_id),'[]') from public.finance_treasury_balances a),
  'openings',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id),'[]') from public.finance_account_opening_balances o
   where public.treasury_can_view(o.bank_account_id,o.cash_location_id)),
  'transactions',(select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at desc,c.id),'[]') from
   (select * from public.finance_cash_transactions c where public.treasury_can_view(c.bank_account_id,c.cash_location_id)
    order by c.occurred_at desc,c.id limit 50 offset p_offset) c),
  'has_next',(select count(*)>50 from (select 1 from public.finance_cash_transactions c where public.treasury_can_view(c.bank_account_id,c.cash_location_id) limit 51 offset p_offset) c),
  'pending_sources',case when public.money_allocation_admin() then (select coalesce(jsonb_agg(s.source order by s.received_on,s.id),'[]') from (
   select public.treasury_source('payment',p.id) as source,p.received_on,p.id from public.finance_payments p
    where p.status='confirmed' and p.cash_amount>0 and not exists(select 1 from public.finance_cash_transactions c where c.source_payment_id=p.id and c.reversal_of_transaction_id is null)
   union all select public.treasury_source('direct_money_receipt',d.id),d.received_on,d.id from public.finance_direct_money_receipts d
    where d.status='confirmed' and not exists(select 1 from public.finance_cash_transactions c where c.source_direct_money_receipt_id=d.id and c.reversal_of_transaction_id is null)
  ) s) else '[]'::jsonb end) into result;
 return result;
end;
$read$;

alter table public.finance_cash_locations enable row level security;
create policy treasury_location_read on public.finance_cash_locations for select to authenticated using(public.treasury_can_view(null,id));
drop policy "finance cash viewers select transactions" on public.finance_cash_transactions;
create policy "finance cash viewers select transactions" on public.finance_cash_transactions for select to authenticated using(public.treasury_can_view(bank_account_id,cash_location_id));
drop policy "finance cash viewers select opening balances" on public.finance_account_opening_balances;
create policy "finance cash viewers select opening balances" on public.finance_account_opening_balances for select to authenticated using(public.treasury_can_view(bank_account_id,cash_location_id));
create trigger treasury_cash_no_truncate before truncate on public.finance_cash_transactions for each statement execute function public.protect_finance_cash_audit_event();
create trigger treasury_opening_no_truncate before truncate on public.finance_account_opening_balances for each statement execute function public.protect_finance_cash_audit_event();
revoke all on public.finance_cash_locations,public.finance_treasury_accounts,public.finance_treasury_balances from public,anon,authenticated;
grant select on public.finance_cash_locations,public.finance_treasury_accounts,public.finance_treasury_balances to authenticated;
revoke all on function public.post_confirmed_payment_to_finance_cash_transaction(uuid),
 public.validate_finance_cash_transaction_integrity(uuid),public.validate_finance_opening_balance_integrity(uuid)
 from public,anon,authenticated;

do $grants$
declare f record;
begin
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and
  (proname like 'treasury_%' or proname in('direct_money_payload','direct_money_payload_before_treasury','direct_money_snapshot','direct_money_snapshot_before_treasury','get_finance_treasury','materialize_finance_treasury_source','save_finance_treasury_opening','confirm_finance_treasury_opening')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in('treasury_can_view','get_finance_treasury','materialize_finance_treasury_source','save_finance_treasury_opening','confirm_finance_treasury_opening')
  then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end;
$grants$;
