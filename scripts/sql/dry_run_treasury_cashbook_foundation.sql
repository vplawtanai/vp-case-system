BEGIN;
-- Rollback-only schema rehearsal. No business RPC or cash/opening/source creation.
select set_config('vp.treasury049_before',upstream_evidence_hashes::text,true) from (-- ONE SELECT-only statement / ONE row. No application RPCs or mutations.
-- STOP on failed_checks. Compare upstream_evidence_hashes before/after apply.
-- No fixed Ledger/Compensation/Payment row-count baseline. No cutover or receipt backfill.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason']::text[],0,false,'u',false),
('public.current_user_can_view_finance_cash_transactions()','4752ce3f50858cae684320fc48d3d9c1',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.current_user_can_view_finance_cash_bank_account(uuid)','d6d07f8f1bf3e284372471729c93ffff',true,'v',false,'boolean','sql',array['p_bank_account_id']::text[],0,false,'u',false),
('public.enforce_finance_cash_transaction_lifecycle()','25b0d232b75fb166cfd7aed4db9208ac',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.validate_finance_cash_transaction_integrity(uuid)','44c9100afcaae32cdaa42a9ef69104aa',true,'v',false,'void','plpgsql',array['p_cash_transaction_id']::text[],0,false,'u',false),
('public.enforce_finance_opening_balance_lifecycle()','17376bfec1cf4029b366be16cfc73fc5',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.validate_finance_opening_balance_integrity(uuid)','9fa53788f776c9d47c32cedc08fcef1d',true,'v',false,'void','plpgsql',array['p_opening_balance_id']::text[],0,false,'u',false),
('public.protect_finance_cash_audit_event()','65fbae5a7c161b60242fe8ac96388aff',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.post_confirmed_payment_to_finance_cash_transaction(uuid)','5cff47abdf1ae86983b201d88cd8e64c',true,'v',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.direct_money_payload(jsonb)','93a1f42cb8b6e7ae05182558cf4f1e40',true,'s',false,'jsonb','plpgsql',array['p_input']::text[],0,false,'u',false),
('public.direct_money_snapshot(public.finance_direct_money_receipts)','287a1077274b2ebf3889f7cda0de3d7c',true,'s',false,'jsonb','sql',array['p']::text[],0,false,'u',false),
('public.save_finance_direct_money_receipt(uuid,integer,jsonb)','238cad995c70864a383522f5626f4b26',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_input']::text[],0,false,'u',false),
('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','621fd126935fcfac21556d0ac95a44ee',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.direct_money_guard()','f6ca48044ecbdb35d1aadd1191bcbe0e',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.direct_money_integrity()','9750729c08f92127574d751654214993',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r)-array['cash_location_id','source_direct_money_receipt_id','source_snapshot_json'] order by (to_jsonb(r)-array['cash_location_id','source_direct_money_receipt_id','source_snapshot_json'])::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'cash_location_id' order by (to_jsonb(r)-'cash_location_id')::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_account_opening_balance_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_account_opening_balance_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),
'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'receiving_cash_location_id' order by (to_jsonb(r)-'receiving_cash_location_id')::text),'[]')::text) from public.finance_direct_money_receipts r),
'finance_direct_money_receipt_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_direct_money_receipt_audit r),
'finance_payable_entitlement_sources',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_sources r),
'finance_payable_entitlements',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlements r),
'finance_payable_entitlement_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_audit r)) as hashes),checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),('no_cash_cutover',not exists(select 1 from finance_cash_transactions) and not exists(select 1 from finance_account_opening_balances)
 and not exists(select 1 from finance_cash_transaction_audit_events) and not exists(select 1 from finance_account_opening_balance_audit_events)),
 ('049_namespace_unused',to_regclass('public.finance_cash_locations') is null and to_regclass('public.finance_treasury_accounts') is null and to_regclass('public.finance_treasury_balances') is null
 and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'treasury_%' or proname in('treasury_direct_input_location','treasury_can_view','treasury_location_active','treasury_source','treasury_post_source','treasury_confirm_direct','treasury_source_reversal_guard','materialize_finance_treasury_source','save_finance_treasury_opening','confirm_finance_treasury_opening','get_finance_treasury','direct_money_payload_before_treasury','direct_money_snapshot_before_treasury')))
 and not exists(select 1 from pg_attribute where attrelid in('finance_cash_transactions'::regclass,'finance_account_opening_balances'::regclass,'finance_direct_money_receipts'::regclass) and attname in('cash_location_id','source_direct_money_receipt_id','source_snapshot_json','receiving_cash_location_id') and not attisdropped))
 ) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as treasury_cashbook_foundation_preflight_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 '[]'::jsonb as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments),'direct_money_rows',(select count(*) from finance_direct_money_receipts)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num) p;
-- BEGIN EMBEDDED MIGRATION 049
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
-- END EMBEDDED MIGRATION 049
-- ONE SELECT-only statement / ONE row. No application RPCs or mutations.
-- STOP on failed_checks. Compare upstream_evidence_hashes before/after apply.
-- No fixed Ledger/Compensation/Payment row-count baseline. No cutover or receipt backfill.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.direct_money_payload(jsonb)','d50d7432a81c880efab2f550af9888ca',true,'s',false,'jsonb','plpgsql',array['p_input']::text[],0,false,'u',false),
('public.treasury_direct_input_location()','fa54d76f8cf2d22e963af488731826ac',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.direct_money_snapshot(public.finance_direct_money_receipts)','494eb7c36d80f7709ffa2483f7dbc6f5',true,'s',false,'jsonb','sql',array['p']::text[],0,false,'u',false),
('public.treasury_can_view(uuid,uuid)','115fa322da6dad6019bb97f88aa366e9',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.treasury_location_active(uuid,uuid)','cee644694d7c7a5af8477d75e4f4be09',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.validate_finance_cash_transaction_integrity(uuid)','d52f7e871451c10e0d94668077dc624a',true,'v',false,'void','plpgsql',array['p_cash_transaction_id']::text[],0,false,'u',false),
('public.validate_finance_opening_balance_integrity(uuid)','4301bcd1eb26e8ddb17ce6efa97d67d9',true,'v',false,'void','plpgsql',array['p_opening_balance_id']::text[],0,false,'u',false),
('public.treasury_source(text,uuid)','8fbf5b81f8bdff1ee04843e052d46e91',true,'s',false,'jsonb','plpgsql',array['p_type','p_id']::text[],0,false,'u',false),
('public.treasury_post_source(text,uuid,boolean,uuid)','0ad9471344c95942098dba743b822b2c',true,'v',false,'jsonb','plpgsql',array['p_type','p_id','p_manual','p_cash_location_id']::text[],2,false,'u',false),
('public.post_confirmed_payment_to_finance_cash_transaction(uuid)','918e511da710da5e025100002d98660b',true,'v',false,'jsonb','sql',array['p_payment_id']::text[],0,false,'u',false),
('public.treasury_confirm_direct()','56b82ae995520ccb3b845799b60d8fc2',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.treasury_source_reversal_guard()','9546e3a3aa532845a68c9ec3d1f75be2',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.materialize_finance_treasury_source(text,uuid,jsonb,boolean,uuid)','97095864b26d88058cdb0c70626916e7',true,'v',false,'jsonb','plpgsql',array['p_source_type','p_source_id','p_expected_source','p_acknowledged','p_cash_location_id']::text[],1,false,'u',false),
('public.save_finance_treasury_opening(uuid,uuid,uuid,date,numeric,text,timestamptz,uuid)','2b4a6da6b0908fba8a1801907a193f79',true,'v',false,'uuid','plpgsql',array['p_id','p_bank_account_id','p_cash_location_id','p_start_date','p_amount','p_note','p_expected_updated_at','p_supersedes_id']::text[],2,false,'u',false),
('public.confirm_finance_treasury_opening(uuid,timestamptz,boolean)','c26ebf9bdc2caf137089b93e1a6c3e20',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_updated_at','p_acknowledged']::text[],0,false,'u',false),
('public.get_finance_treasury(integer)','82d0c09fbfd9cd07d0ed22f109e489d5',true,'s',false,'jsonb','plpgsql',array['p_offset']::text[],1,false,'u',false),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason']::text[],0,false,'u',false),
('public.current_user_can_view_finance_cash_transactions()','4752ce3f50858cae684320fc48d3d9c1',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.current_user_can_view_finance_cash_bank_account(uuid)','d6d07f8f1bf3e284372471729c93ffff',true,'v',false,'boolean','sql',array['p_bank_account_id']::text[],0,false,'u',false),
('public.enforce_finance_cash_transaction_lifecycle()','25b0d232b75fb166cfd7aed4db9208ac',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.enforce_finance_opening_balance_lifecycle()','17376bfec1cf4029b366be16cfc73fc5',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.protect_finance_cash_audit_event()','65fbae5a7c161b60242fe8ac96388aff',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.save_finance_direct_money_receipt(uuid,integer,jsonb)','238cad995c70864a383522f5626f4b26',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_input']::text[],0,false,'u',false),
('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','621fd126935fcfac21556d0ac95a44ee',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.direct_money_guard()','f6ca48044ecbdb35d1aadd1191bcbe0e',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.direct_money_integrity()','9750729c08f92127574d751654214993',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.direct_money_payload_before_treasury(jsonb)','93a1f42cb8b6e7ae05182558cf4f1e40',true,'s',false,'jsonb','plpgsql',array['p_input']::text[],0,false,'u',false),
('public.direct_money_snapshot_before_treasury(public.finance_direct_money_receipts)','287a1077274b2ebf3889f7cda0de3d7c',true,'s',false,'jsonb','sql',array['p']::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r)-array['cash_location_id','source_direct_money_receipt_id','source_snapshot_json'] order by (to_jsonb(r)-array['cash_location_id','source_direct_money_receipt_id','source_snapshot_json'])::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'cash_location_id' order by (to_jsonb(r)-'cash_location_id')::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_account_opening_balance_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_account_opening_balance_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),
'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'receiving_cash_location_id' order by (to_jsonb(r)-'receiving_cash_location_id')::text),'[]')::text) from public.finance_direct_money_receipts r),
'finance_direct_money_receipt_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_direct_money_receipt_audit r),
'finance_payable_entitlement_sources',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_sources r),
'finance_payable_entitlements',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlements r),
'finance_payable_entitlement_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_audit r)) as hashes),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,c.reloptions,case when c.relkind='v' then pg_get_viewdef(c.oid,true) end as view_definition,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_cash_locations','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events','finance_direct_money_receipts','finance_treasury_accounts','finance_treasury_balances') order by c.relname),
 expected_catalog as(select value as expected from jsonb_array_elements('[{"name":"finance_account_opening_balance_audit_events","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"opening_balance_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_payload_json","type":"jsonb","default":"''{}''::jsonb","identity":"","not_null":true,"generated":""},{"name":"actor_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"actor_email","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"actor_name","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_account_opening_balance_audit_e_opening_balance_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (opening_balance_id) REFERENCES finance_account_opening_balances(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balance_audit_events_actor_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_account_opening_balance_audit_events_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_opening_balance_audit_payload_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))","initially_deferred":false},{"name":"finance_opening_balance_audit_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''confirmed''::text, ''cancelled''::text, ''superseded''::text])))","initially_deferred":false}],"indexes":[{"name":"finance_account_opening_balance_audit_events_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_account_opening_balance_audit_events_pkey ON public.finance_account_opening_balance_audit_events USING btree (id)"},{"name":"idx_finance_opening_balance_audit_balance","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_opening_balance_audit_balance ON public.finance_account_opening_balance_audit_events USING btree (opening_balance_id, created_at)"}],"policies":[{"name":"finance cash viewers select opening balance audit","check":null,"roles":["public"],"using":"(current_user_can_view_finance_cash_transactions() AND (EXISTS ( SELECT 1\n   FROM finance_account_opening_balances opening_balance\n  WHERE ((opening_balance.id = finance_account_opening_balance_audit_events.opening_balance_id) AND current_user_can_view_finance_cash_bank_account(opening_balance.bank_account_id)))))","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"finance_opening_balance_audit_immutability","enabled":"O","definition":"CREATE TRIGGER finance_opening_balance_audit_immutability BEFORE DELETE OR UPDATE ON public.finance_account_opening_balance_audit_events FOR EACH ROW EXECUTE FUNCTION protect_finance_cash_audit_event()"}]},{"name":"finance_account_opening_balances","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"currency","type":"text","default":"''THB''::text","identity":"","not_null":true,"generated":""},{"name":"as_of","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"balance_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"evidence_reference","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"note","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"supersedes_opening_balance_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancel_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_account_opening_balan_supersedes_opening_balance_i_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (supersedes_opening_balance_id) REFERENCES finance_account_opening_balances(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (bank_account_id) REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_cancelled_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_cash_location_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cash_location_id) REFERENCES finance_cash_locations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_confirmed_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_created_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_account_opening_balances_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_account_opening_balances_superseded_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (superseded_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_account_opening_balances_updated_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_opening_balance_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_opening_balances_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency ~ ''^[A-Z]{3}$''::text))","initially_deferred":false},{"name":"finance_opening_balances_lifecycle_metadata_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''draft''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL) AND (superseded_at IS NULL) AND (superseded_by_user_id IS NULL)) OR ((status = ''confirmed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by_user_id IS NOT NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL) AND (superseded_at IS NULL) AND (superseded_by_user_id IS NULL)) OR ((status = ''cancelled''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(COALESCE(cancel_reason, ''''::text)), ''''::text) IS NOT NULL) AND (superseded_at IS NULL) AND (superseded_by_user_id IS NULL)) OR ((status = ''superseded''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by_user_id IS NOT NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL) AND (superseded_at IS NOT NULL) AND (superseded_by_user_id IS NOT NULL))))","initially_deferred":false},{"name":"finance_opening_balances_no_self_supersession_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((supersedes_opening_balance_id IS NULL) OR (supersedes_opening_balance_id <> id)))","initially_deferred":false},{"name":"finance_opening_balances_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''cancelled''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_opening_balances_text_length_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(COALESCE(evidence_reference, ''''::text)) <= 1000) AND (length(COALESCE(note, ''''::text)) <= 4000) AND (length(COALESCE(cancel_reason, ''''::text)) <= 2000)))","initially_deferred":false},{"name":"treasury_opening_location","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(bank_account_id, cash_location_id) = 1))","initially_deferred":false}],"indexes":[{"name":"finance_account_opening_balances_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_account_opening_balances_pkey ON public.finance_account_opening_balances USING btree (id)"},{"name":"idx_finance_opening_balances_account_as_of","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_opening_balances_account_as_of ON public.finance_account_opening_balances USING btree (bank_account_id, currency, as_of DESC)"},{"name":"idx_finance_opening_balances_status","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_opening_balances_status ON public.finance_account_opening_balances USING btree (status, as_of DESC)"},{"name":"treasury_opening_cash_current","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX treasury_opening_cash_current ON public.finance_account_opening_balances USING btree (cash_location_id, currency) WHERE (status = ''confirmed''::text)"},{"name":"treasury_opening_cash_initial","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX treasury_opening_cash_initial ON public.finance_account_opening_balances USING btree (cash_location_id, currency) WHERE ((status = ''draft''::text) AND (supersedes_opening_balance_id IS NULL))"},{"name":"uq_finance_opening_balances_current","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_opening_balances_current ON public.finance_account_opening_balances USING btree (bank_account_id, currency) WHERE (status = ''confirmed''::text)"},{"name":"uq_finance_opening_balances_initial_draft","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_opening_balances_initial_draft ON public.finance_account_opening_balances USING btree (bank_account_id, currency) WHERE ((status = ''draft''::text) AND (supersedes_opening_balance_id IS NULL))"},{"name":"uq_finance_opening_balances_supersedes","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_opening_balances_supersedes ON public.finance_account_opening_balances USING btree (supersedes_opening_balance_id) WHERE ((supersedes_opening_balance_id IS NOT NULL) AND (status <> ''cancelled''::text))"}],"policies":[{"name":"finance cash viewers select opening balances","check":null,"roles":["authenticated"],"using":"treasury_can_view(bank_account_id, cash_location_id)","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"finance_opening_balance_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER finance_opening_balance_integrity AFTER INSERT OR DELETE OR UPDATE ON public.finance_account_opening_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_opening_balance_integrity()"},{"name":"finance_opening_balance_lifecycle_guard","enabled":"O","definition":"CREATE TRIGGER finance_opening_balance_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.finance_account_opening_balances FOR EACH ROW EXECUTE FUNCTION enforce_finance_opening_balance_lifecycle()"},{"name":"treasury_opening_no_truncate","enabled":"O","definition":"CREATE TRIGGER treasury_opening_no_truncate BEFORE TRUNCATE ON public.finance_account_opening_balances FOR EACH STATEMENT EXECUTE FUNCTION protect_finance_cash_audit_event()"}]},{"name":"finance_cash_locations","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"code","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"name_th","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"name_en","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"is_active","type":"boolean","default":"true","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_cash_locations_code_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((code ~ ''^[a-z][a-z0-9_]{0,49}$''::text))","initially_deferred":false},{"name":"finance_cash_locations_code_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (code)","initially_deferred":false},{"name":"finance_cash_locations_name_en_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(name_en)) >= 1) AND (length(btrim(name_en)) <= 200)))","initially_deferred":false},{"name":"finance_cash_locations_name_th_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(name_th)) >= 1) AND (length(btrim(name_th)) <= 200)))","initially_deferred":false},{"name":"finance_cash_locations_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false}],"indexes":[{"name":"finance_cash_locations_code_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_locations_code_key ON public.finance_cash_locations USING btree (code)"},{"name":"finance_cash_locations_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_locations_pkey ON public.finance_cash_locations USING btree (id)"}],"policies":[{"name":"treasury_location_read","check":null,"roles":["authenticated"],"using":"treasury_can_view(NULL::uuid, id)","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":null},{"name":"finance_cash_transaction_audit_events","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"cash_transaction_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_payload_json","type":"jsonb","default":"''{}''::jsonb","identity":"","not_null":true,"generated":""},{"name":"actor_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"actor_email","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"actor_name","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_cash_transaction_audit_events_actor_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_cash_transaction_audit_events_cash_transaction_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cash_transaction_id) REFERENCES finance_cash_transactions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transaction_audit_events_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_cash_transaction_audit_payload_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(event_payload_json) = ''object''::text))","initially_deferred":false},{"name":"finance_cash_transaction_audit_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''draft_saved''::text, ''confirmed''::text, ''cancelled''::text, ''reversal_created''::text])))","initially_deferred":false}],"indexes":[{"name":"finance_cash_transaction_audit_events_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_transaction_audit_events_pkey ON public.finance_cash_transaction_audit_events USING btree (id)"},{"name":"idx_finance_cash_transaction_audit_transaction","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transaction_audit_transaction ON public.finance_cash_transaction_audit_events USING btree (cash_transaction_id, created_at)"}],"policies":[{"name":"finance cash viewers select transaction audit","check":null,"roles":["public"],"using":"(current_user_can_view_finance_cash_transactions() AND (EXISTS ( SELECT 1\n   FROM finance_cash_transactions cash_transaction\n  WHERE ((cash_transaction.id = finance_cash_transaction_audit_events.cash_transaction_id) AND current_user_can_view_finance_cash_bank_account(cash_transaction.bank_account_id)))))","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"finance_cash_transaction_audit_immutability","enabled":"O","definition":"CREATE TRIGGER finance_cash_transaction_audit_immutability BEFORE DELETE OR UPDATE ON public.finance_cash_transaction_audit_events FOR EACH ROW EXECUTE FUNCTION protect_finance_cash_audit_event()"}]},{"name":"finance_cash_transactions","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"occurred_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"direction","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"transaction_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"currency","type":"text","default":"''THB''::text","identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"source_payment_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reference_no","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"description","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"note","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversal_of_transaction_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancel_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"source_direct_money_receipt_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"source_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_cash_transaction_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_cash_transactions_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((cash_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_cash_transactions_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (bank_account_id) REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_cancelled_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_cash_location_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cash_location_id) REFERENCES finance_cash_locations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_confirmed_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_created_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_cash_transactions_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency ~ ''^[A-Z]{3}$''::text))","initially_deferred":false},{"name":"finance_cash_transactions_direction_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((direction = ANY (ARRAY[''inflow''::text, ''outflow''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_lifecycle_metadata_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''draft''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL)) OR ((status = ''confirmed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by_user_id IS NOT NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL)) OR ((status = ''cancelled''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(COALESCE(cancel_reason, ''''::text)), ''''::text) IS NOT NULL))))","initially_deferred":false},{"name":"finance_cash_transactions_no_self_reversal_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reversal_of_transaction_id IS NULL) OR (reversal_of_transaction_id <> id)))","initially_deferred":false},{"name":"finance_cash_transactions_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_cash_transactions_reversal_of_transaction_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reversal_of_transaction_id) REFERENCES finance_cash_transactions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_source_contract_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((reversal_of_transaction_id IS NULL) AND (((transaction_type = ''customer_payment''::text) AND (source_payment_id IS NOT NULL) AND (source_direct_money_receipt_id IS NULL) AND (direction = ''inflow''::text)) OR ((transaction_type = ''direct_money_receipt''::text) AND (source_direct_money_receipt_id IS NOT NULL) AND (source_payment_id IS NULL) AND (direction = ''inflow''::text) AND (source_snapshot_json IS NOT NULL)) OR ((transaction_type <> ALL (ARRAY[''customer_payment''::text, ''direct_money_receipt''::text, ''reversal''::text])) AND (source_payment_id IS NULL) AND (source_direct_money_receipt_id IS NULL)))) OR ((reversal_of_transaction_id IS NOT NULL) AND (transaction_type = ''reversal''::text) AND (status = ''confirmed''::text))))","initially_deferred":false},{"name":"finance_cash_transactions_source_direct_money_receipt_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_direct_money_receipt_id) REFERENCES finance_direct_money_receipts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_source_payment_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''cancelled''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_text_length_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(COALESCE(reference_no, ''''::text)) <= 500) AND (length(COALESCE(description, ''''::text)) <= 1000) AND (length(COALESCE(note, ''''::text)) <= 4000) AND (length(COALESCE(cancel_reason, ''''::text)) <= 2000)))","initially_deferred":false},{"name":"finance_cash_transactions_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((transaction_type = ANY (ARRAY[''customer_payment''::text, ''direct_money_receipt''::text, ''manual_inflow''::text, ''manual_outflow''::text, ''expense_claim''::text, ''refund''::text, ''tax_payment''::text, ''transfer''::text, ''reversal''::text, ''other''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_type_direction_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((transaction_type <> ''manual_inflow''::text) OR (direction = ''inflow''::text)) AND ((transaction_type <> ALL (ARRAY[''manual_outflow''::text, ''expense_claim''::text, ''refund''::text, ''tax_payment''::text])) OR (direction = ''outflow''::text))))","initially_deferred":false},{"name":"finance_cash_transactions_updated_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"treasury_cash_evidence","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((source_snapshot_json IS NULL) OR (jsonb_typeof(source_snapshot_json) = ''object''::text)))","initially_deferred":false},{"name":"treasury_cash_location","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(bank_account_id, cash_location_id) = 1))","initially_deferred":false},{"name":"treasury_cash_source","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(source_payment_id, source_direct_money_receipt_id) <= 1))","initially_deferred":false}],"indexes":[{"name":"finance_cash_transactions_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_transactions_pkey ON public.finance_cash_transactions USING btree (id)"},{"name":"idx_finance_cash_transactions_account_date","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_account_date ON public.finance_cash_transactions USING btree (bank_account_id, currency, occurred_at DESC)"},{"name":"idx_finance_cash_transactions_source_payment","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_source_payment ON public.finance_cash_transactions USING btree (source_payment_id) WHERE (source_payment_id IS NOT NULL)"},{"name":"idx_finance_cash_transactions_status_date","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_status_date ON public.finance_cash_transactions USING btree (status, occurred_at DESC)"},{"name":"treasury_cash_direct_original","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX treasury_cash_direct_original ON public.finance_cash_transactions USING btree (source_direct_money_receipt_id) WHERE ((source_direct_money_receipt_id IS NOT NULL) AND (reversal_of_transaction_id IS NULL))"},{"name":"treasury_cash_location_date","ready":true,"valid":true,"definition":"CREATE INDEX treasury_cash_location_date ON public.finance_cash_transactions USING btree (cash_location_id, currency, occurred_at DESC)"},{"name":"uq_finance_cash_transactions_reversal","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_cash_transactions_reversal ON public.finance_cash_transactions USING btree (reversal_of_transaction_id) WHERE (reversal_of_transaction_id IS NOT NULL)"},{"name":"uq_finance_cash_transactions_source_payment","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_cash_transactions_source_payment ON public.finance_cash_transactions USING btree (source_payment_id) WHERE ((source_payment_id IS NOT NULL) AND (reversal_of_transaction_id IS NULL))"}],"policies":[{"name":"finance cash viewers select transactions","check":null,"roles":["authenticated"],"using":"treasury_can_view(bank_account_id, cash_location_id)","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"finance_cash_transaction_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER finance_cash_transaction_integrity AFTER INSERT OR DELETE OR UPDATE ON public.finance_cash_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_cash_transaction_integrity()"},{"name":"finance_cash_transaction_lifecycle_guard","enabled":"O","definition":"CREATE TRIGGER finance_cash_transaction_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.finance_cash_transactions FOR EACH ROW EXECUTE FUNCTION enforce_finance_cash_transaction_lifecycle()"},{"name":"treasury_cash_no_truncate","enabled":"O","definition":"CREATE TRIGGER treasury_cash_no_truncate BEFORE TRUNCATE ON public.finance_cash_transactions FOR EACH STATEMENT EXECUTE FUNCTION protect_finance_cash_audit_event()"}]},{"name":"finance_direct_money_receipts","kind":"r","rls":true,"force_rls":false,"reloptions":null,"view_definition":null,"columns":[{"name":"id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"client_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"payer_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"case_id","type":"bigint","default":null,"identity":"","not_null":false,"generated":""},{"name":"advisory_matter_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"received_on","type":"date","default":null,"identity":"","not_null":true,"generated":""},{"name":"method","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"receiving_bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"cash_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"wht_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"amount_before_vat","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"vat_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric","default":null,"identity":"","not_null":true,"generated":""},{"name":"reference_no","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"evidence_reference","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"note","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"lines_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"unclassified","type":"boolean","default":null,"identity":"","not_null":true,"generated":""},{"name":"input_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"confirmed_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"classification_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversal_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"receiving_cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"direct_money_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_direct_money_receipts_advisory_matter_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (advisory_matter_id) REFERENCES advisory_matters(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_amount_before_vat_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((amount_before_vat > (0)::numeric))","initially_deferred":false},{"name":"finance_direct_money_receipts_case_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_cash_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((cash_amount > (0)::numeric) AND (cash_amount = round(cash_amount, 2))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((gross_amount = (cash_amount + wht_amount)) AND (gross_amount = (amount_before_vat + vat_amount))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((case_id IS NULL) OR (advisory_matter_id IS NULL)))","initially_deferred":false},{"name":"finance_direct_money_receipts_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((case_id IS NULL) AND (advisory_matter_id IS NULL)) OR (client_id IS NOT NULL)))","initially_deferred":false},{"name":"finance_direct_money_receipts_check3","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((method = ''bank_transfer''::text) AND (receiving_bank_account_id IS NOT NULL) AND (cash_location IS NULL)) OR ((method <> ''bank_transfer''::text) AND (receiving_bank_account_id IS NULL) AND ((length(btrim(cash_location)) >= 1) AND (length(btrim(cash_location)) <= 300)))))","initially_deferred":false},{"name":"finance_direct_money_receipts_check4","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''draft''::text) AND (confirmed_at IS NULL) AND (confirmed_by IS NULL) AND (confirmed_snapshot_json IS NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reversal_reason IS NULL)) OR ((status = ''confirmed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_snapshot_json IS NOT NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reversal_reason IS NULL)) OR ((status = ''reversed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_snapshot_json IS NOT NULL) AND (reversed_at IS NOT NULL) AND (reversed_by IS NOT NULL) AND ((length(btrim(reversal_reason)) >= 1) AND (length(btrim(reversal_reason)) <= 2000)))))","initially_deferred":false},{"name":"finance_direct_money_receipts_classification_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((classification_json IS NULL) OR (jsonb_typeof(classification_json) = ''object''::text)))","initially_deferred":false},{"name":"finance_direct_money_receipts_client_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_confirmed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency = ''THB''::text))","initially_deferred":false},{"name":"finance_direct_money_receipts_evidence_reference_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(evidence_reference) >= 1) AND (length(evidence_reference) <= 1000)))","initially_deferred":false},{"name":"finance_direct_money_receipts_input_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(input_json) = ''object''::text))","initially_deferred":false},{"name":"finance_direct_money_receipts_lines_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((jsonb_typeof(lines_json) = ''array''::text) AND ((jsonb_array_length(lines_json) >= 1) AND (jsonb_array_length(lines_json) <= 100))))","initially_deferred":false},{"name":"finance_direct_money_receipts_method_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((method = ANY (ARRAY[''bank_transfer''::text, ''cash''::text, ''other''::text])))","initially_deferred":false},{"name":"finance_direct_money_receipts_note_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((length(note) <= 2000))","initially_deferred":false},{"name":"finance_direct_money_receipts_payer_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(payer_name)) >= 1) AND (length(btrim(payer_name)) <= 500)))","initially_deferred":false},{"name":"finance_direct_money_receipts_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_direct_money_receipts_receiving_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (receiving_bank_account_id) REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_receiving_cash_location_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (receiving_cash_location_id) REFERENCES finance_cash_locations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_direct_money_receipts_reference_no_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(reference_no) >= 1) AND (length(reference_no) <= 200)))","initially_deferred":false},{"name":"finance_direct_money_receipts_reversed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reversed_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_direct_money_receipts_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''reversed''::text])))","initially_deferred":false},{"name":"finance_direct_money_receipts_vat_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((vat_amount >= (0)::numeric))","initially_deferred":false},{"name":"finance_direct_money_receipts_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false},{"name":"finance_direct_money_receipts_wht_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((wht_amount >= (0)::numeric) AND (wht_amount = round(wht_amount, 2))))","initially_deferred":false},{"name":"treasury_direct_location","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((receiving_cash_location_id IS NULL) OR (receiving_bank_account_id IS NULL)))","initially_deferred":false}],"indexes":[{"name":"direct_money_active_evidence","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX direct_money_active_evidence ON public.finance_direct_money_receipts USING btree (lower(btrim(evidence_reference))) WHERE ((status <> ''reversed''::text) AND (evidence_reference IS NOT NULL))"},{"name":"direct_money_active_reference","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX direct_money_active_reference ON public.finance_direct_money_receipts USING btree (method, COALESCE((receiving_bank_account_id)::text, cash_location), currency, received_on, lower(btrim(reference_no))) WHERE ((status <> ''reversed''::text) AND (reference_no IS NOT NULL))"},{"name":"direct_money_list","ready":true,"valid":true,"definition":"CREATE INDEX direct_money_list ON public.finance_direct_money_receipts USING btree (created_at DESC, id)"},{"name":"finance_direct_money_receipts_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_direct_money_receipts_pkey ON public.finance_direct_money_receipts USING btree (id)"}],"policies":[{"name":"direct_money_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"direct_money_immutable","enabled":"O","definition":"CREATE TRIGGER direct_money_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_direct_money_receipts FOR EACH ROW EXECUTE FUNCTION direct_money_guard()"},{"name":"direct_money_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER direct_money_integrity AFTER INSERT OR UPDATE ON public.finance_direct_money_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION direct_money_integrity()"},{"name":"direct_money_no_truncate","enabled":"O","definition":"CREATE TRIGGER direct_money_no_truncate BEFORE TRUNCATE ON public.finance_direct_money_receipts FOR EACH STATEMENT EXECUTE FUNCTION direct_money_guard()"},{"name":"treasury_confirm_direct","enabled":"O","definition":"CREATE TRIGGER treasury_confirm_direct AFTER UPDATE OF status ON public.finance_direct_money_receipts FOR EACH ROW EXECUTE FUNCTION treasury_confirm_direct()"},{"name":"treasury_direct_input_location","enabled":"O","definition":"CREATE TRIGGER treasury_direct_input_location BEFORE INSERT OR UPDATE OF input_json ON public.finance_direct_money_receipts FOR EACH ROW EXECUTE FUNCTION treasury_direct_input_location()"},{"name":"treasury_direct_reversal","enabled":"O","definition":"CREATE TRIGGER treasury_direct_reversal BEFORE UPDATE OF status ON public.finance_direct_money_receipts FOR EACH ROW EXECUTE FUNCTION treasury_source_reversal_guard()"}]},{"name":"finance_treasury_accounts","kind":"v","rls":false,"force_rls":false,"reloptions":["security_invoker=true"],"view_definition":" SELECT ''bank''::text AS kind,\n    finance_bank_accounts.id AS account_id,\n    finance_bank_accounts.id AS bank_account_id,\n    NULL::uuid AS cash_location_id,\n    finance_bank_accounts.short_name AS name_th,\n    finance_bank_accounts.short_name AS name_en,\n    finance_bank_accounts.bank_name,\n    finance_bank_accounts.account_number,\n    finance_bank_accounts.is_active\n   FROM finance_bank_accounts\n  WHERE treasury_can_view(finance_bank_accounts.id, NULL::uuid)\nUNION ALL\n SELECT ''cash''::text AS kind,\n    finance_cash_locations.id AS account_id,\n    NULL::uuid AS bank_account_id,\n    finance_cash_locations.id AS cash_location_id,\n    finance_cash_locations.name_th,\n    finance_cash_locations.name_en,\n    NULL::text AS bank_name,\n    NULL::text AS account_number,\n    finance_cash_locations.is_active\n   FROM finance_cash_locations\n  WHERE treasury_can_view(NULL::uuid, finance_cash_locations.id);","columns":[{"name":"kind","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"name_th","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"name_en","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"bank_name","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"account_number","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"is_active","type":"boolean","default":null,"identity":"","not_null":false,"generated":""}],"constraints":null,"indexes":null,"policies":null,"triggers":null},{"name":"finance_treasury_balances","kind":"v","rls":false,"force_rls":false,"reloptions":["security_invoker=true"],"view_definition":" SELECT a.kind,\n    a.account_id,\n    a.bank_account_id,\n    a.cash_location_id,\n    a.name_th,\n    a.name_en,\n    a.bank_name,\n    a.account_number,\n    a.is_active,\n    COALESCE(o.currency, ''THB''::text) AS currency,\n    o.id AS opening_id,\n    o.as_of AS opening_as_of,\n    o.balance_amount AS opening_amount,\n    o.balance_amount + COALESCE(m.inflow, 0::numeric) - COALESCE(m.outflow, 0::numeric) AS system_balance,\n    COALESCE(m.inflow, 0::numeric) AS inflow,\n    COALESCE(m.outflow, 0::numeric) AS outflow\n   FROM finance_treasury_accounts a\n     LEFT JOIN finance_account_opening_balances o ON NOT o.bank_account_id IS DISTINCT FROM a.bank_account_id AND NOT o.cash_location_id IS DISTINCT FROM a.cash_location_id AND o.currency = ''THB''::text AND o.status = ''confirmed''::text\n     LEFT JOIN LATERAL ( SELECT sum(c.cash_amount) FILTER (WHERE c.direction = ''inflow''::text) AS inflow,\n            sum(c.cash_amount) FILTER (WHERE c.direction = ''outflow''::text) AS outflow\n           FROM finance_cash_transactions c\n          WHERE NOT c.bank_account_id IS DISTINCT FROM a.bank_account_id AND NOT c.cash_location_id IS DISTINCT FROM a.cash_location_id AND c.currency = ''THB''::text AND c.status = ''confirmed''::text AND c.occurred_at > o.as_of) m ON true;","columns":[{"name":"kind","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"name_th","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"name_en","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"bank_name","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"account_number","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"is_active","type":"boolean","default":null,"identity":"","not_null":false,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"opening_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"opening_as_of","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"opening_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":false,"generated":""},{"name":"system_balance","type":"numeric","default":null,"identity":"","not_null":false,"generated":""},{"name":"inflow","type":"numeric","default":null,"identity":"","not_null":false,"generated":""},{"name":"outflow","type":"numeric","default":null,"identity":"","not_null":false,"generated":""}],"constraints":null,"indexes":null,"policies":null,"triggers":null}]'::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),('no_cash_cutover',not exists(select 1 from finance_cash_transactions) and not exists(select 1 from finance_account_opening_balances)
 and not exists(select 1 from finance_cash_transaction_audit_events) and not exists(select 1 from finance_account_opening_balance_audit_events)),
 ('office_cash_stable_identity',(select count(*)=1 and bool_and(is_active and name_th='เงินสดสำนักงาน' and name_en='Office Cash') from finance_cash_locations where code='office_cash')),
 ('private_and_rpc_permissions',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_payload(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_payload(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_direct_input_location()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_direct_input_location()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_direct_input_location()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_direct_input_location()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_snapshot(public.finance_direct_money_receipts)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_can_view(uuid,uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_can_view(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_can_view(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_can_view(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_location_active(uuid,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_location_active(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_location_active(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_location_active(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.validate_finance_cash_transaction_integrity(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_finance_opening_balance_integrity(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_finance_opening_balance_integrity(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.validate_finance_opening_balance_integrity(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.validate_finance_opening_balance_integrity(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_source(text,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_source(text,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_source(text,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_source(text,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_post_source(text,uuid,boolean,uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_post_source(text,uuid,boolean,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_post_source(text,uuid,boolean,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_post_source(text,uuid,boolean,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.post_confirmed_payment_to_finance_cash_transaction(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_confirm_direct()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_confirm_direct()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_confirm_direct()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_confirm_direct()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_source_reversal_guard()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.treasury_source_reversal_guard()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.treasury_source_reversal_guard()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.treasury_source_reversal_guard()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.materialize_finance_treasury_source(text,uuid,jsonb,boolean,uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.materialize_finance_treasury_source(text,uuid,jsonb,boolean,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.materialize_finance_treasury_source(text,uuid,jsonb,boolean,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.materialize_finance_treasury_source(text,uuid,jsonb,boolean,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_treasury_opening(uuid,uuid,uuid,date,numeric,text,timestamptz,uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_treasury_opening(uuid,uuid,uuid,date,numeric,text,timestamptz,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_treasury_opening(uuid,uuid,uuid,date,numeric,text,timestamptz,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_treasury_opening(uuid,uuid,uuid,date,numeric,text,timestamptz,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.confirm_finance_treasury_opening(uuid,timestamptz,boolean)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.confirm_finance_treasury_opening(uuid,timestamptz,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.confirm_finance_treasury_opening(uuid,timestamptz,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.confirm_finance_treasury_opening(uuid,timestamptz,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_treasury(integer)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_treasury(integer)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_treasury(integer)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_treasury(integer)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload_before_treasury(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_payload_before_treasury(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_payload_before_treasury(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_payload_before_treasury(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot_before_treasury(public.finance_direct_money_receipts)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.direct_money_snapshot_before_treasury(public.finance_direct_money_receipts)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.direct_money_snapshot_before_treasury(public.finance_direct_money_receipts)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.direct_money_snapshot_before_treasury(public.finance_direct_money_receipts)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('cash_browser_mutation_blocked',(select count(*)=5 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class
 where relnamespace='public'::regnamespace and relname in('finance_cash_locations','finance_cash_transactions','finance_account_opening_balances','finance_cash_transaction_audit_events','finance_account_opening_balance_audit_events'))),
 ('payment_reversal_guard',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=19 and tgfoid='treasury_source_reversal_guard()'::regprocedure and not tgisinternal)
 from pg_trigger where tgrelid='finance_payments'::regclass and tgname='treasury_payment_reversal')),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.treasury049_before',true),'') is null or current_setting('vp.treasury049_before',true)=(select hashes::text from protected))
 ) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as treasury_cashbook_foundation_verification_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'payment_rows',(select count(*) from finance_payments),'direct_money_rows',(select count(*) from finance_direct_money_receipts)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;
ROLLBACK;
