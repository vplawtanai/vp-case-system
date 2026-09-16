BEGIN;
-- Rollback-only schema rehearsal. Never creates Payees, Payouts, Cash or WHT.
select set_config('vp.payout051_before',upstream_evidence_hashes::text,true) from (-- SELECT-only / ONE statement / ONE row. STOP on failed_checks.
-- No fixed mutable financial row-count baselines. Compare upstream_evidence_hashes across apply.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8',false,'i',false,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','621fd126935fcfac21556d0ac95a44ee',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.payable_frozen_components(jsonb)','b18f7e50d059d9cea8813307c0e1195f',false,'i',false,'jsonb','plpgsql',array['d']::text[],0,false,'u',false),
('public.payable_assert_distribution(uuid)','87c336d1c6b8a410facd769731e1de62',true,'v',false,'void','plpgsql',array['p_id']::text[],0,false,'u',false),
('public.payable_assert_unpaid_contract()','976cbcc3ae09c60c2cd1c71d63ddedd3',true,'s',false,'void','plpgsql',null::text[],0,false,'u',false),
('public.payable_distribution_transition()','a90d017b8412e06a9220e9cfc01c845c',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_payable_entitlements(text,text,text,text,integer)','d03fc12d9301c4f04cbb35d169d8ba3d',true,'s',false,'jsonb','plpgsql',array['p_search','p_source_type','p_bucket','p_status','p_offset']::text[],5,false,'u',false),
('public.treasury_can_view(uuid,uuid)','115fa322da6dad6019bb97f88aa366e9',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.treasury_location_active(uuid,uuid)','cee644694d7c7a5af8477d75e4f4be09',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.get_finance_treasury(integer)','82d0c09fbfd9cd07d0ed22f109e489d5',true,'s',false,'jsonb','plpgsql',array['p_offset']::text[],1,false,'u',false),
('public.get_finance_tax_position()','0e3c35def2e84cb56af13aeb77af8f38',true,'s',false,'jsonb','plpgsql',null::text[],0,false,'u',false),
('public.tax_position_source_changed()','24f6879940fe53c4306bd405dd4e05a4',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payments r),'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_wht_components r),'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_invoice_allocations r),'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_audit_events r),'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoices r),'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_items r),'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipts r),'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoices r),'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_point_events r),'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_documents r),'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_document_counters r),'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_company_ledger r),'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_allocations r),'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_direct_money_receipts r),'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distributions r),'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),'finance_payable_entitlements',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlements r),'finance_payable_entitlement_sources',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_sources r),'finance_payable_entitlement_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_audit r),'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_account_opening_balances r),'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'source_payout_id' order by (to_jsonb(r)-'source_payout_id')::text),'[]')::text) from public.finance_cash_transactions r),'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_cash_transaction_audit_events r),'finance_tax_position_facts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_position_facts r),'finance_tax_periods',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_periods r),'finance_tax_position_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_position_audit r)) as hashes),checks(name,passed) as(values
 ('upstream_functions_exact',not exists(select 1 from function_differences)),
 ('051_namespace_unused',to_regclass('public.finance_payees') is null and to_regclass('public.finance_payee_destinations') is null and to_regclass('public.finance_payee_audit') is null and to_regclass('public.finance_payouts') is null and to_regclass('public.finance_payout_allocations') is null and to_regclass('public.finance_payout_audit') is null and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'payout_%' or proname in('payout_can_manage','payout_immutable','save_finance_payee','payout_choices','save_finance_payout','confirm_finance_payout','cancel_finance_payout','payout_recipient_guard','payout_assert','payout_integrity','get_finance_payees','get_finance_payout_workspace','payout_profile_delete_guard','vp_formula_calculate_before_payee','get_finance_tax_position_before_payout')))
 and not exists(select 1 from pg_attribute where attrelid='public.finance_cash_transactions'::regclass and attname='source_payout_id' and not attisdropped)),
 ('reserved_outgoing_empty',not exists(select 1 from public.finance_outgoing_wht_obligations)),
 ('no_existing_settlement_integration',not exists(select 1 from pg_constraint where contype='f' and confrelid='public.finance_payable_entitlements'::regclass))
 ) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payee_payout_foundation_preflight_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 '[]'::jsonb as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num) p;
-- BEGIN EMBEDDED MIGRATION 051
-- CANDIDATE 051. No historical backfill, payment, opening or number allocation.
create function public.payout_can_manage()
returns boolean language sql stable security definer set search_path=public as $manage$
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles where id=auth.uid() and active
  and role not in ('partner','viewer') and can_manage_finance_payments and can_confirm_finance_cash_transactions);
$manage$;
create table public.finance_payees (
 id uuid primary key,
 kind text not null check(kind in ('internal','external')),
 profile_id uuid unique references public.user_profiles(id),
 entity_type text not null check(entity_type in ('natural_person','juristic_person')),
 legal_name text not null check(length(btrim(legal_name)) between 1 and 300),
 tax_id text check(tax_id ~ '^[0-9]{13}$'),
 is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_by uuid not null references public.user_profiles(id),
 updated_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((kind='internal' and profile_id=id and entity_type='natural_person') or (kind='external' and profile_id is null))
);
create table public.finance_payee_destinations (
 id uuid primary key,
 payee_id uuid not null references public.finance_payees(id),
 bank_name text not null check(length(btrim(bank_name)) between 1 and 200),
 account_name text not null check(length(btrim(account_name)) between 1 and 300),
 account_number text not null check(length(btrim(account_number)) between 4 and 50),
 is_active boolean not null default true,
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 unique(payee_id,id)
);
create unique index payout_destination_current on public.finance_payee_destinations(payee_id) where is_active;
create table public.finance_payee_audit (
 id uuid primary key default gen_random_uuid(),payee_id uuid not null references public.finance_payees(id),
 actor_id uuid not null references public.user_profiles(id),created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object')
);
create table public.finance_payouts (
 id uuid primary key,
 payee_id uuid not null references public.finance_payees(id),
 status text not null default 'draft' check(status in ('draft','confirmed','cancelled')),
 version integer not null default 1 check(version>0),
 paid_on date not null,
 bank_account_id uuid references public.finance_bank_accounts(id),
 cash_location_id uuid references public.finance_cash_locations(id),
 currency text not null default 'THB' check(currency='THB'),
 choices_json jsonb not null check(jsonb_typeof(choices_json)='array' and jsonb_array_length(choices_json) between 1 and 100),
 gross_amount numeric(14,2) not null check(gross_amount>0),
 wht_amount numeric(14,2) not null check(wht_amount>=0),
 net_amount numeric(14,2) not null check(net_amount>0 and net_amount=gross_amount-wht_amount),
 note text not null default '' check(length(note)<=2000),
 confirmed_snapshot_json jsonb,
 confirmed_at timestamptz,confirmed_by uuid references public.user_profiles(id),
 cancelled_at timestamptz,cancelled_by uuid references public.user_profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.user_profiles(id),updated_by uuid not null references public.user_profiles(id),
 check(num_nonnulls(bank_account_id,cash_location_id)=1),
 check((status='confirmed')=(confirmed_at is not null and confirmed_by is not null and confirmed_snapshot_json is not null)),
 check((status='cancelled')=(cancelled_at is not null and cancelled_by is not null))
);
create table public.finance_payout_allocations (
 id uuid primary key default gen_random_uuid(),
 payout_id uuid not null references public.finance_payouts(id),
 entitlement_id uuid not null unique references public.finance_payable_entitlements(id),
 gross_amount numeric(14,2) not null check(gross_amount>0),
 treatment text not null check(treatment in ('none','withhold')),
 rate numeric(7,4) not null,
 wht_amount numeric(14,2) not null check(wht_amount=round(gross_amount*rate/100,2)),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 check((treatment='none' and rate=0) or (treatment='withhold' and rate>0 and rate<100))
);
create table public.finance_payout_audit (
 id uuid primary key default gen_random_uuid(),payout_id uuid not null references public.finance_payouts(id),
 event_type text not null check(event_type in ('saved','confirmed','cancelled')),
 version integer not null,actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 unique(payout_id,version)
);
alter table public.finance_cash_transactions add column source_payout_id uuid unique references public.finance_payouts(id);
alter table public.finance_cash_transactions add constraint payout_cash_source check(source_payout_id is null or
 (transaction_type='other' and direction='outflow' and status='confirmed' and source_payment_id is null
 and source_direct_money_receipt_id is null and reversal_of_transaction_id is null and source_snapshot_json is null));
alter table public.finance_outgoing_wht_obligations add constraint payout_wht_source foreign key(payout_source_id) references public.finance_payouts(id);
alter table public.finance_outgoing_wht_obligations add constraint payout_wht_component foreign key(source_line_id) references public.finance_payout_allocations(id);
create unique index payout_wht_once on public.finance_outgoing_wht_obligations(source_line_id);

create function public.payout_immutable()
returns trigger language plpgsql set search_path=public as $immutable$
begin
 if tg_op in ('DELETE','TRUNCATE') then raise exception 'PAYOUT_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='finance_payouts' then
  if old.status='draft' and new.id=old.id and new.created_by=old.created_by
   and new.created_at=old.created_at and new.version=old.version+1 then return new; end if;
 elsif tg_table_name='finance_payees' then
  if new.id=old.id and new.kind=old.kind and new.profile_id is not distinct from old.profile_id
   and new.created_at=old.created_at and new.created_by=old.created_by and new.version=old.version+1 then return new; end if;
 elsif tg_table_name='finance_payee_destinations' then
  if old.is_active and not new.is_active and to_jsonb(old)-'is_active'=to_jsonb(new)-'is_active' then return new; end if;
 end if;
 raise exception 'PAYOUT_HISTORY_IMMUTABLE';
end;
$immutable$;

-- Internal identity is deterministic. Reads never create master records.
create function public.save_finance_payee(p_id uuid,p_profile_id uuid,p_input jsonb,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $save_payee$
declare old public.finance_payees%rowtype; person public.user_profiles%rowtype; name text; entity text; tax text; dest jsonb;
begin
 if not public.payout_can_manage() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payee:'||p_id,0));
 select * into old from public.finance_payees where id=p_id for update;
 if old.version is distinct from p_expected_version then raise exception 'PAYOUT_STALE'; end if;
 name:=nullif(btrim(p_input->>'legal_name'),'');entity:=p_input->>'entity_type';tax:=nullif(btrim(p_input->>'tax_id'),'');
 if p_profile_id is not null then
  select * into person from public.user_profiles where id=p_profile_id for share;
  if person.id is null or not person.active or p_id<>p_profile_id then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
  name:=coalesce(nullif(btrim(person.staff_name),''),nullif(btrim(person.full_name),''),nullif(btrim(person.email),''),person.id::text);
  entity:='natural_person';
 elsif exists(select 1 from public.user_profiles where id=p_id) then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 if name is null or entity is null or entity not in ('natural_person','juristic_person') then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 if old.id is null then
  insert into public.finance_payees(id,kind,profile_id,entity_type,legal_name,tax_id,created_by,updated_by)
   values(p_id,case when p_profile_id is null then 'external' else 'internal' end,p_profile_id,entity,name,tax,auth.uid(),auth.uid());
 else
  if old.profile_id is distinct from p_profile_id then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
  update public.finance_payees set legal_name=name,entity_type=entity,tax_id=tax,is_active=coalesce((p_input->>'is_active')::boolean,true),
   version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 end if;
 dest:=p_input->'destination';
 if dest is not null and dest<>'null'::jsonb then
  if jsonb_typeof(dest) is distinct from 'object' then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
  if not exists(select 1 from public.finance_payee_destinations where payee_id=p_id and is_active and bank_name=dest->>'bank_name'
   and account_name=dest->>'account_name' and account_number=dest->>'account_number') then
   update public.finance_payee_destinations set is_active=false where payee_id=p_id and is_active;
   insert into public.finance_payee_destinations(id,payee_id,bank_name,account_name,account_number,created_by)
    values(gen_random_uuid(),p_id,btrim(dest->>'bank_name'),btrim(dest->>'account_name'),btrim(dest->>'account_number'),auth.uid());
  end if;
 end if;
 insert into public.finance_payee_audit(payee_id,actor_id,evidence_json) values(p_id,auth.uid(),jsonb_build_object('previous',to_jsonb(old),
  'payee',(select to_jsonb(p) from public.finance_payees p where id=p_id),'destination',(select to_jsonb(d) from public.finance_payee_destinations d where payee_id=p_id and is_active)));
 return p_id;
end;
$save_payee$;

create function public.payout_choices(p_payee uuid,p_choices jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $choices$
declare r jsonb;e public.finance_payable_entitlements%rowtype; rate numeric; result jsonb:='[]';
begin
 if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices) not between 1 and 100
  or jsonb_array_length(p_choices)<>(select count(distinct value->>'entitlement_id') from jsonb_array_elements(p_choices)) then raise exception 'PAYOUT_RIGHTS_INVALID'; end if;
 for r in select value from jsonb_array_elements(p_choices) order by value->>'entitlement_id' loop
  if exists(select 1 from jsonb_object_keys(r) k where k not in ('entitlement_id','treatment','rate')) then raise exception 'PAYOUT_FULL_COMPONENT_REQUIRED'; end if;
  select * into e from public.finance_payable_entitlements where id=(r->>'entitlement_id')::uuid;
  if e.id is null or e.recipient_id<>p_payee or e.currency<>'THB' or e.status<>'open'
   or exists(select 1 from public.finance_payout_allocations where entitlement_id=e.id) then raise exception 'PAYOUT_RIGHTS_UNAVAILABLE'; end if;
  perform public.payable_assert_distribution(e.distribution_id);
  if jsonb_typeof(r->'rate') is distinct from 'number' then raise exception 'PAYOUT_WHT_REQUIRED'; end if;
  rate:=(r->>'rate')::numeric;
  if r->>'treatment' is null or not ((r->>'treatment'='none' and rate=0) or (r->>'treatment'='withhold' and rate>0 and rate<100))
   or rate<>round(rate,4) then raise exception 'PAYOUT_WHT_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('entitlement_id',e.id,'treatment',r->>'treatment','rate',rate,
   'gross',e.gross_amount,'wht',round(e.gross_amount*rate/100,2),'entitlement',to_jsonb(e)));
 end loop;
 return result;
end;
$choices$;

create function public.save_finance_payout(p_id uuid,p_payee_id uuid,p_paid_on date,p_bank_account_id uuid,p_cash_location_id uuid,p_choices jsonb,p_note text,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $save$
declare old public.finance_payouts%rowtype; choices jsonb; gross numeric; wht numeric;
begin
 if not public.payout_can_manage() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 select * into old from public.finance_payouts where id=p_id for update;
 if old.id is not null and old.status<>'draft' then raise exception 'PAYOUT_HISTORY_IMMUTABLE'; end if;
 if old.version is distinct from p_expected_version then raise exception 'PAYOUT_STALE'; end if;
 if p_id is null or p_paid_on is null or p_paid_on>(now() at time zone 'Asia/Bangkok')::date
  or not exists(select 1 from public.finance_payees where id=p_payee_id and is_active)
  or not public.treasury_location_active(p_bank_account_id,p_cash_location_id)
  or not public.treasury_can_view(p_bank_account_id,p_cash_location_id) then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 choices:=public.payout_choices(p_payee_id,p_choices);
 select sum((x->>'gross')::numeric),sum((x->>'wht')::numeric) into gross,wht from jsonb_array_elements(choices) x;
 if gross-wht<=0 then raise exception 'PAYOUT_NET_REQUIRED'; end if;
 if old.id is null then
  insert into public.finance_payouts(id,payee_id,paid_on,bank_account_id,cash_location_id,choices_json,gross_amount,wht_amount,net_amount,note,created_by,updated_by)
   values(p_id,p_payee_id,p_paid_on,p_bank_account_id,p_cash_location_id,choices,gross,wht,gross-wht,coalesce(p_note,''),auth.uid(),auth.uid());
 else
  update public.finance_payouts set payee_id=p_payee_id,paid_on=p_paid_on,bank_account_id=p_bank_account_id,cash_location_id=p_cash_location_id,
   choices_json=choices,gross_amount=gross,wht_amount=wht,net_amount=gross-wht,note=coalesce(p_note,''),version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 end if;
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json)
  select id,'saved',version,auth.uid(),to_jsonb(p) from public.finance_payouts p where id=p_id;
 return p_id;
end;
$save$;

create function public.confirm_finance_payout(p_id uuid,p_expected_version integer,p_expected_payee_version integer,p_expected_destination_id uuid,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $confirm$
declare p public.finance_payouts%rowtype; payee public.finance_payees%rowtype; dest public.finance_payee_destinations%rowtype;
 opening public.finance_account_opening_balances%rowtype; r record; c jsonb; canonical jsonb; snapshot jsonb; allocation uuid; cash uuid; account jsonb;ts timestamptz:=clock_timestamp();
begin
 if not public.payout_can_manage() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'PAYOUT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 select * into p from public.finance_payouts where id=p_id;
 if p.id is null then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 if p.status='confirmed' then return p.id; end if;
 -- Source -> distribution -> rights -> payout: same order as supersession.
 for r in select distinct e.source_type,e.received_money_id from public.finance_payable_entitlements e
  where e.id in(select (x->>'entitlement_id')::uuid from jsonb_array_elements(p.choices_json) x) order by 1,2 loop
  perform public.vp_received_lock(case when r.source_type='payment' then r.received_money_id end,case when r.source_type='direct_money_receipt' then r.received_money_id end);
 end loop;
 perform 1 from public.finance_vp_revenue_distributions where id in(select (x#>>'{entitlement,distribution_id}')::uuid from jsonb_array_elements(p.choices_json) x) order by id for update;
 perform 1 from public.finance_payable_entitlements where id in(select (x->>'entitlement_id')::uuid from jsonb_array_elements(p.choices_json) x) order by id for update;
 select * into p from public.finance_payouts where id=p_id for update;
 if p.status<>'draft' or p.version is distinct from p_expected_version then raise exception 'PAYOUT_STALE'; end if;
 canonical:=public.payout_choices(p.payee_id,(select jsonb_agg(jsonb_build_object('entitlement_id',x->'entitlement_id','treatment',x->'treatment','rate',x->'rate')) from jsonb_array_elements(p.choices_json) x));
 if canonical is distinct from p.choices_json then raise exception 'PAYOUT_STALE'; end if;
 select * into payee from public.finance_payees where id=p.payee_id for share;
 if not payee.is_active or payee.version is distinct from p_expected_payee_version or (payee.profile_id is not null and not exists(select 1 from public.user_profiles where id=payee.profile_id and active))
 then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 select * into dest from public.finance_payee_destinations where payee_id=payee.id and is_active for share;
 if p.bank_account_id is not null and (dest.id is null or dest.id is distinct from p_expected_destination_id) then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
 if p.wht_amount>0 and payee.tax_id is null then raise exception 'PAYOUT_TAX_ID_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 if not public.treasury_location_active(p.bank_account_id,p.cash_location_id) or not public.treasury_can_view(p.bank_account_id,p.cash_location_id) then raise exception 'PAYOUT_ACCOUNT_REQUIRED'; end if;
 select * into opening from public.finance_account_opening_balances where bank_account_id is not distinct from p.bank_account_id
  and cash_location_id is not distinct from p.cash_location_id and currency='THB' and status='confirmed' for update;
 if opening.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
 if public.finance_bangkok_completed_day_end(p.paid_on)<=opening.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 select to_jsonb(a) into account from public.finance_treasury_balances a where a.bank_account_id is not distinct from p.bank_account_id and a.cash_location_id is not distinct from p.cash_location_id;
 snapshot:=jsonb_build_object('schema_version',1,'payee',to_jsonb(payee),'destination',case when p.bank_account_id is not null then to_jsonb(dest) end,
  'account',account,'opening',to_jsonb(opening),'choices',canonical,'gross',p.gross_amount,'wht',p.wht_amount,'net',p.net_amount,'paid_on',p.paid_on,'currency','THB');
 update public.finance_payouts set status='confirmed',version=version+1,confirmed_snapshot_json=snapshot,confirmed_at=ts,confirmed_by=auth.uid(),updated_by=auth.uid(),updated_at=ts where id=p.id;
 for c in select value from jsonb_array_elements(canonical) loop
  insert into public.finance_payout_allocations(payout_id,entitlement_id,gross_amount,treatment,rate,wht_amount,evidence_json)
   values(p.id,(c->>'entitlement_id')::uuid,(c->>'gross')::numeric,c->>'treatment',(c->>'rate')::numeric,(c->>'wht')::numeric,c) returning id into allocation;
  if (c->>'wht')::numeric>0 then
   insert into public.finance_outgoing_wht_obligations(payout_source_id,source_line_id,source_fingerprint,payee_json,gross_base,explicit_treatment,explicit_rate,withheld_amount,withheld_on,period_month,currency,evidence_json)
    values(p.id,allocation,md5(c::text),to_jsonb(payee),(c->>'gross')::numeric,c->>'treatment',(c->>'rate')::numeric,(c->>'wht')::numeric,p.paid_on,date_trunc('month',p.paid_on)::date,'THB',c);
  end if;
 end loop;
 insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,source_payout_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
  values(public.finance_bangkok_completed_day_end(p.paid_on),'outflow','other',p.bank_account_id,p.cash_location_id,p.net_amount,'THB','confirmed',p.id,upper(left(p.id::text,8)),'Payout',auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
 perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('payout_id',p.id,'payout',snapshot,'outgoing_wht_is_not_cash_outflow',true));
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'confirmed',p.version+1,auth.uid(),snapshot);
 return p.id;
end;
$confirm$;

create function public.cancel_finance_payout(p_id uuid,p_expected_version integer,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare p public.finance_payouts%rowtype;
begin
 if not public.payout_can_manage() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'PAYOUT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));select * into p from public.finance_payouts where id=p_id for update;
 if p.status='cancelled' then return p.id; end if;
 if p.id is null or p.status<>'draft' or p.version is distinct from p_expected_version then raise exception 'PAYOUT_STALE'; end if;
 update public.finance_payouts set status='cancelled',version=version+1,cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),updated_by=auth.uid(),updated_at=clock_timestamp() where id=p_id;
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'cancelled',p.version+1,auth.uid(),to_jsonb(p));return p.id;
end;
$cancel$;
-- Prospective external recipients carry a canonical UUID, never a name key.
alter table public.finance_payable_entitlements drop constraint finance_payable_entitlements_recipient_id_fkey;
alter table public.finance_payable_entitlements drop constraint finance_payable_entitlements_recipient_type_check;
alter table public.finance_payable_entitlements add constraint finance_payable_entitlements_recipient_type_check check(recipient_type in ('user','payee'));
alter function public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb) rename to vp_formula_calculate_before_payee;
create function public.vp_formula_calculate(p_pool numeric,p_code text,p_version integer,p_definition jsonb,p_recipients jsonb)
returns jsonb language plpgsql immutable set search_path=public as $formula$
declare normalized jsonb; result jsonb; rows jsonb:='[]';r jsonb; original jsonb;i integer:=0;
begin
 select jsonb_agg(case when x->>'recipient_kind'='external' and x->>'recipient_payee_id' is not null
  then (x-'recipient_payee_id')||jsonb_build_object('recipient_name',(x->>'recipient_payee_id')::uuid::text) else x end order by n)
  into normalized from jsonb_array_elements(p_recipients) with ordinality a(x,n);
 result:=public.vp_formula_calculate_before_payee(p_pool,p_code,p_version,p_definition,normalized);
 for r in select value from jsonb_array_elements(result->'recipients') loop
  original:=p_recipients->i;i:=i+1;
  if original->>'recipient_kind'='external' and original->>'recipient_payee_id' is not null then
   if nullif(btrim(original->>'recipient_name'),'') is null or length(original->>'recipient_name')>300 then raise exception 'VP_FORMULA_RECIPIENT'; end if;
   r:=r||jsonb_build_object('recipient_payee_id',(original->>'recipient_payee_id')::uuid,'recipient_name',original->>'recipient_name');
  end if;
  rows:=rows||jsonb_build_array(r);
 end loop;
 return result||jsonb_build_object('recipients',rows);
end;
$formula$;
create function public.payout_recipient_guard()
returns trigger language plpgsql security definer set search_path=public as $recipient$
declare r jsonb;
begin
 if tg_table_name='finance_payable_entitlements' then
  if (new.recipient_type='user' and not exists(select 1 from public.user_profiles where id=new.recipient_id))
   or (new.recipient_type='payee' and not exists(select 1 from public.finance_payees where id=new.recipient_id and kind='external'))
  then raise exception 'PAYABLE_CANONICAL_RECIPIENT_REQUIRED'; end if;
 else
  if new.status='superseded' then return new; end if;
  for r in select person from jsonb_array_elements(new.decisions_json) choice cross join lateral jsonb_array_elements(choice#>'{formula_result,recipients}') person
   where person->>'recipient_kind'='external' loop
   if r->>'recipient_payee_id' is null then
    if new.status='finalized' then raise exception 'PAYABLE_CANONICAL_RECIPIENT_REQUIRED'; end if;
   else
    perform 1 from public.finance_payees where id=(r->>'recipient_payee_id')::uuid and kind='external' and is_active and legal_name=r->>'recipient_name' for share;
    if not found then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
   end if;
  end loop;
 end if;
 return new;
end;
$recipient$;
create trigger payout_recipient_guard before insert or update on public.finance_vp_revenue_distributions for each row execute function public.payout_recipient_guard();
create trigger payout_component_recipient before insert on public.finance_payable_entitlements for each row execute function public.payout_recipient_guard();
create or replace function public.payable_assert_unpaid_contract()
returns void language plpgsql stable security definer set search_path=public as $unpaid$
begin
 if exists(select 1 from pg_constraint where contype='f' and confrelid='public.finance_payable_entitlements'::regclass
  and conrelid<>'public.finance_payout_allocations'::regclass) then raise exception 'PAYABLE_PAYOUT_INTEGRATION_REQUIRED'; end if;
end;
$unpaid$;

create function public.payout_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $assert$
declare p public.finance_payouts%rowtype;actual jsonb;c public.finance_cash_transactions%rowtype;
begin
 select * into p from public.finance_payouts where id=p_id;
 if p.id is null then raise exception 'PAYOUT_INTEGRITY'; end if;
 if p.status<>'confirmed' then
  if exists(select 1 from public.finance_payout_allocations where payout_id=p_id)
   or exists(select 1 from public.finance_cash_transactions where source_payout_id=p_id)
   or exists(select 1 from public.finance_outgoing_wht_obligations where payout_source_id=p_id) then raise exception 'PAYOUT_INTEGRITY'; end if;
  return;
 end if;
 select jsonb_agg(a.evidence_json order by a.entitlement_id::text) into actual from public.finance_payout_allocations a where payout_id=p_id;
 if actual is distinct from p.choices_json or p.confirmed_snapshot_json->'choices' is distinct from p.choices_json
  or p.payee_id::text is distinct from p.confirmed_snapshot_json#>>'{payee,id}'
  or p.gross_amount is distinct from (p.confirmed_snapshot_json->>'gross')::numeric
  or p.wht_amount is distinct from (p.confirmed_snapshot_json->>'wht')::numeric
  or p.net_amount is distinct from (p.confirmed_snapshot_json->>'net')::numeric
  or p.gross_amount is distinct from (select sum(gross_amount) from public.finance_payout_allocations where payout_id=p_id)
  or p.wht_amount is distinct from (select sum(wht_amount) from public.finance_payout_allocations where payout_id=p_id)
  or exists(select 1 from public.finance_payout_allocations a join public.finance_payable_entitlements e on e.id=a.entitlement_id where a.payout_id=p_id
   and (e.status<>'open' or e.recipient_id<>p.payee_id or e.gross_amount<>a.gross_amount or a.evidence_json->'entitlement'<>to_jsonb(e)
    or a.gross_amount is distinct from (a.evidence_json->>'gross')::numeric or a.wht_amount is distinct from (a.evidence_json->>'wht')::numeric
    or a.rate is distinct from (a.evidence_json->>'rate')::numeric or a.treatment is distinct from a.evidence_json->>'treatment'))
 then raise exception 'PAYOUT_ALLOCATION_INTEGRITY'; end if;
 select * into c from public.finance_cash_transactions where source_payout_id=p_id;
 if c.id is null or c.status<>'confirmed' or c.direction<>'outflow' or c.cash_amount<>p.net_amount or c.currency<>p.currency
  or c.bank_account_id is distinct from p.bank_account_id or c.cash_location_id is distinct from p.cash_location_id
  or c.occurred_at<>public.finance_bangkok_completed_day_end(p.paid_on)
  or not exists(select 1 from public.finance_cash_transaction_audit_events where cash_transaction_id=c.id and event_type='confirmed' and event_payload_json->'payout'=p.confirmed_snapshot_json)
 then raise exception 'PAYOUT_CASH_INTEGRITY'; end if;
 if exists(select 1 from public.finance_payout_allocations a left join public.finance_outgoing_wht_obligations w on w.source_line_id=a.id
  where a.payout_id=p_id and ((a.wht_amount>0 and (w.id is null or w.payout_source_id<>p_id or w.gross_base<>a.gross_amount or w.explicit_rate<>a.rate
   or w.withheld_amount<>a.wht_amount or w.explicit_treatment<>a.treatment or w.withheld_on<>p.paid_on or w.payee_json<>p.confirmed_snapshot_json->'payee'
   or w.evidence_json<>a.evidence_json or w.source_fingerprint<>md5(a.evidence_json::text) or w.filing_status<>'unfiled' or w.remittance_status<>'not_remitted' or w.remitted_amount<>0))
   or (a.wht_amount=0 and w.id is not null)))
  or not exists(select 1 from public.finance_payout_audit where payout_id=p_id and event_type='confirmed' and version=p.version and evidence_json=p.confirmed_snapshot_json)
 then raise exception 'PAYOUT_TAX_AUDIT_INTEGRITY'; end if;
end;
$assert$;
create function public.payout_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
begin
 if tg_table_name='finance_payouts' then perform public.payout_assert(new.id);
 elsif tg_table_name='finance_cash_transactions' then
  if new.source_payout_id is not null then perform public.payout_assert(new.source_payout_id); end if;
  if new.reversal_of_transaction_id is not null and exists(select 1 from public.finance_cash_transactions where id=new.reversal_of_transaction_id and source_payout_id is not null)
  then raise exception 'PAYOUT_REVERSAL_NOT_AVAILABLE'; end if;
 elsif tg_table_name='finance_outgoing_wht_obligations' then perform public.payout_assert(new.payout_source_id);
 else perform public.payout_assert(new.payout_id); end if;
 return null;
end;
$integrity$;
create constraint trigger payout_integrity after insert or update on public.finance_payouts deferrable initially deferred for each row execute function public.payout_integrity();
create constraint trigger payout_allocation_integrity after insert on public.finance_payout_allocations deferrable initially deferred for each row execute function public.payout_integrity();
create constraint trigger payout_audit_integrity after insert on public.finance_payout_audit deferrable initially deferred for each row execute function public.payout_integrity();
create constraint trigger payout_cash_integrity after insert or update on public.finance_cash_transactions deferrable initially deferred for each row execute function public.payout_integrity();
create constraint trigger payout_wht_integrity after insert on public.finance_outgoing_wht_obligations deferrable initially deferred for each row execute function public.payout_integrity();
-- Replace only the reserved outgoing insertion blocker; immutable history stays.
drop trigger tax_position_no_outgoing on public.finance_outgoing_wht_obligations;
create trigger payout_wht_immutable before update or delete on public.finance_outgoing_wht_obligations for each row execute function public.tax_position_immutable();

create function public.get_finance_payees(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $payees$
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_search is null or length(p_search)>200 then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 return (select coalesce(jsonb_agg(x order by x->>'legal_name'),'[]') from (
  select jsonb_build_object('id',p.id,'kind',p.kind,'profile_id',p.profile_id,'legal_name',p.legal_name,'entity_type',p.entity_type,
   'is_active',p.is_active,'version',p.version,'tax_id',case when public.payout_can_manage() then p.tax_id else case when p.tax_id is not null then '*********'||right(p.tax_id,4) end end,
   'destination',(select to_jsonb(d)||jsonb_build_object('account_number',case when public.payout_can_manage() then d.account_number else '****'||right(d.account_number,4) end) from public.finance_payee_destinations d where payee_id=p.id and is_active)) as x
  from public.finance_payees p where strpos(lower(p.legal_name),lower(btrim(p_search)))>0
  union all select jsonb_build_object('id',u.id,'kind','internal','profile_id',u.id,'legal_name',coalesce(nullif(btrim(u.staff_name),''),nullif(btrim(u.full_name),''),nullif(btrim(u.email),''),u.id::text),
   'entity_type','natural_person','is_active',u.active,'version',null,'tax_id',null,'destination',null)
  from public.user_profiles u where u.active and not exists(select 1 from public.finance_payees p where p.profile_id=u.id)
   and strpos(lower(coalesce(u.staff_name,u.full_name,u.email,'')),lower(btrim(p_search)))>0
 ) data);
end;
$payees$;
create function public.get_finance_payout_workspace(p_payee_id uuid,p_payout_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $workspace$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_payout_id is not null and not exists(select 1 from public.finance_payouts where id=p_payout_id and payee_id=p_payee_id) then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 select jsonb_build_object('can_manage',public.payout_can_manage(),'payees',public.get_finance_payees(),
  'payout',(select to_jsonb(p) from public.finance_payouts p where id=p_payout_id),
  'components',(select coalesce(jsonb_agg(to_jsonb(e) order by e.finalized_at,e.id),'[]') from public.finance_payable_entitlements e where e.recipient_id=p_payee_id and e.status='open'
   and not exists(select 1 from public.finance_payout_allocations a where a.entitlement_id=e.id)),
  'accounts',case when public.current_user_can_view_finance_cash_transactions() then (public.get_finance_treasury()->'accounts') else '[]'::jsonb end,
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'paid_on',p.paid_on,'status',p.status,'gross',p.gross_amount,'wht',p.wht_amount,'net',p.net_amount,'bank_account_id',p.bank_account_id,'cash_location_id',p.cash_location_id) order by p.created_at desc,p.id),'[]') from public.finance_payouts p where p.payee_id=p_payee_id)) into result;
 -- Non-managers receive masked documentary identity, not raw bank/tax snapshots.
 if not public.payout_can_manage() and result->'payout'<>'null'::jsonb then
  result:=jsonb_set(result,'{payout,confirmed_snapshot_json,payee,tax_id}',to_jsonb('*********'::text),false);
  result:=jsonb_set(result,'{payout,confirmed_snapshot_json,destination,account_number}',to_jsonb('********'::text),false);
  result:=jsonb_set(result,'{payout,confirmed_snapshot_json,account,account_number}',to_jsonb('********'::text),false);
 end if;
 return result;
end;
$workspace$;

-- Keep all existing VAT/incoming-credit calculations; expose only outgoing evidence.
alter function public.get_finance_tax_position() rename to get_finance_tax_position_before_payout;
revoke all on function public.get_finance_tax_position_before_payout() from public,anon,authenticated;
create function public.get_finance_tax_position()
returns jsonb language plpgsql stable security definer set search_path=public as $tax_read$
begin
 if not public.tax_position_can_view() then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 return public.get_finance_tax_position_before_payout()||jsonb_build_object('outgoing_workflow_available',true,
  'outgoing',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'payout_id',w.payout_source_id,'payee_name',w.payee_json->>'legal_name',
   'gross_base',w.gross_base,'rate',w.explicit_rate,'withheld_amount',w.withheld_amount,'withheld_on',w.withheld_on,
   'filing_status',w.filing_status,'remittance_status',w.remittance_status,'remitted_amount',w.remitted_amount) order by w.withheld_on,w.id),'[]')
   from public.finance_outgoing_wht_obligations w));
end;
$tax_read$;
revoke all on function public.get_finance_tax_position() from public,anon;
grant execute on function public.get_finance_tax_position() to authenticated;

create function public.payout_profile_delete_guard()
returns trigger language plpgsql security definer set search_path=public as $profile_guard$
begin
 if exists(select 1 from public.finance_payable_entitlements where recipient_type='user' and recipient_id=old.id)
 then raise exception 'PAYABLE_RECIPIENT_HISTORY_REQUIRED'; end if;
 return old;
end;
$profile_guard$;
create trigger payout_profile_delete_guard before delete on public.user_profiles for each row execute function public.payout_profile_delete_guard();

do $security$
declare t text; f record;
begin
 foreach t in array array['finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  -- Raw financial identity is not browser-readable; masked read RPCs are the UI path.
  execute format('create trigger payout_immutable before update or delete on public.%I for each row execute function public.payout_immutable()',t);
  execute format('create trigger payout_no_truncate before truncate on public.%I for each statement execute function public.payout_immutable()',t);
 end loop;
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace
  and (proname like 'payout_%' or proname in ('save_finance_payee','save_finance_payout','confirm_finance_payout','cancel_finance_payout','get_finance_payees','get_finance_payout_workspace','vp_formula_calculate','vp_formula_calculate_before_payee')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('save_finance_payee','save_finance_payout','confirm_finance_payout','cancel_finance_payout','get_finance_payees','get_finance_payout_workspace') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end;
$security$;
-- BEGIN GENERATED PAYABLE INTEGRATION
create or replace function public.payable_frozen_components(d jsonb)
returns jsonb language plpgsql immutable set search_path=public as $components$
declare s jsonb:=d->'source_snapshot_json'; c jsonb; f jsonb; r jsonb; l jsonb;
 result jsonb:='[]'; line_key text; source_kind text; source_id uuid; currency_code text;
begin
 if d->>'status' is distinct from 'finalized' or d->>'finalized_at' is null
  or jsonb_typeof(d->'decisions_json') is distinct from 'array'
 then raise exception 'PAYABLE_FINALIZED_REQUIRED'; end if;
 if s is distinct from public.vp_received_frozen(s) or s->'blockers' is distinct from '[]'::jsonb
  or public.vp_distribution_choices(s,d->'decisions_json',true) is distinct from d->'decisions_json'
 then raise exception 'PAYABLE_FROZEN_EVIDENCE_INVALID'; end if;
 source_kind:=case when d->>'payment_id' is not null then 'payment' else 'direct_money_receipt' end;
 source_id:=coalesce(d->>'payment_id',d->>'direct_money_receipt_id')::uuid;
 line_key:=case when source_kind='payment' then 'invoice_item_id' else 'source_line_id' end;
 currency_code:=case when source_kind='payment' then s#>>'{money_source,payment,currency}' else s#>>'{received_money_source,currency}' end;
 if source_id is null or currency_code is null or currency_code !~ '^[A-Z]{3}$'
 then raise exception 'PAYABLE_FROZEN_EVIDENCE_INVALID'; end if;
 for c in select value from jsonb_array_elements(d->'decisions_json') loop
  f:=c->'formula_result';
  if f is null then raise exception 'PAYABLE_FORMULA_EVIDENCE_REQUIRED'; end if;
  select value into l from jsonb_array_elements(s->'lines') where value->>line_key=c->>line_key;
  for r in select value from jsonb_array_elements(f->'recipients') loop
   if r->>'bucket'='company_share_amount' then continue; end if;
   if (r->>'amount')::numeric=0 then continue; end if;
   if not ((r->>'recipient_kind'='user' and r->>'recipient_user_id' is not null) or (r->>'recipient_kind'='external' and r->>'recipient_payee_id' is not null))
   then raise exception 'PAYABLE_CANONICAL_RECIPIENT_REQUIRED'; end if;
   result:=result||jsonb_build_array(jsonb_build_object(
    'distribution_id',(d->>'id')::uuid,'distribution_revision',(d->>'revision')::integer,
    'distribution_version',(d->>'version')::integer,'distribution_fingerprint',md5(d::text),
    'source_type',source_kind,'received_money_id',source_id,'source_line_id',(c->>line_key)::uuid,
    'component_key',md5(jsonb_build_array(c->>line_key,f->>'formula_code',f->'formula_version',r->'component_no',
      r->>'recipient_kind',coalesce(r->>'recipient_user_id',r->>'recipient_payee_id'),r->>'role_label',r->>'bucket')::text),
    'component_no',(r->>'component_no')::integer,'formula_code',f->>'formula_code','formula_version',(f->>'formula_version')::integer,
    'bucket',case r->>'bucket' when 'referral_amount' then 'referral' when 'work_compensation_amount' then 'work' end,
    'role_label',r->>'role_label','recipient_type',case when r->>'recipient_kind'='user' then 'user' else 'payee' end,'recipient_id',coalesce(r->>'recipient_user_id',r->>'recipient_payee_id')::uuid,
    'recipient_name',r->>'recipient_name','currency',currency_code,'gross_amount',(r->>'amount')::numeric,
    'finalized_at',(d->>'finalized_at')::timestamptz,
    'evidence_json',jsonb_build_object('schema_version',1,'line',l,'formula',f,'recipient',r)));
  end loop;
 end loop;
 return coalesce((select jsonb_agg(x order by x->>'source_line_id',x->>'component_key') from jsonb_array_elements(result) x),'[]');
end;
$components$;
create or replace function public.payable_distribution_transition()
returns trigger language plpgsql security definer set search_path=public as $transition$
declare s public.finance_payable_entitlement_sources%rowtype;
begin
 if new.status='finalized' and old.status='reviewed' then
  perform public.payable_materialize(new.id);
 elsif new.status='superseded' and old.status='finalized' then
  select * into s from public.finance_payable_entitlement_sources where distribution_id=new.id for update;
  if s.distribution_id is not null then
   perform public.payable_assert_unpaid_contract();
   if exists(select 1 from public.finance_payout_allocations a join public.finance_payable_entitlements e on e.id=a.entitlement_id where e.distribution_id=new.id)
   then raise exception 'PAYOUT_SETTLED_DISTRIBUTION_LOCKED'; end if;
   update public.finance_payable_entitlement_sources set status='superseded',superseded_at=new.superseded_at where distribution_id=new.id;
   update public.finance_payable_entitlements set status='superseded',superseded_at=new.superseded_at where distribution_id=new.id;
   insert into public.finance_payable_entitlement_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
   values(new.id,'superseded',new.superseded_by,new.superseded_at,jsonb_build_object('distribution',s.frozen_distribution_json,'components',s.components_json));
  end if;
 end if;
 return null;
end;
$transition$;
create or replace function public.get_finance_payable_entitlements(p_search text default '',p_source_type text default 'all',p_bucket text default 'all',p_status text default 'open',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $list$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'PAYABLE_PERMISSION_DENIED'; end if;
 if p_search is null or length(p_search)>200 or p_source_type is null or p_source_type not in ('all','payment','direct_money_receipt')
  or p_bucket is null or p_bucket not in ('all','referral','work') or p_status is null or p_status not in ('all','open','superseded','settled')
  or p_offset is null or p_offset<0 then raise exception 'PAYABLE_FILTER_INVALID'; end if;
 with effective as(select (jsonb_populate_record(null::public.finance_payable_entitlements,to_jsonb(e)||jsonb_build_object('status',
  case when exists(select 1 from public.finance_payout_allocations a where a.entitlement_id=e.id) then 'settled' else e.status end))).* from public.finance_payable_entitlements e),
 filtered as(select e.* from effective e
  where (p_source_type='all' or source_type=p_source_type) and (p_bucket='all' or bucket=p_bucket)
   and (p_status='all' or status=p_status)),
 groups as(select recipient_id,currency,
  (array_agg(recipient_name order by finalized_at desc,id))[1] as recipient_name,
  coalesce(sum(gross_amount) filter(where status='open'),0) as open_amount,
  jsonb_agg(to_jsonb(e) order by finalized_at,distribution_id,source_line_id,component_no) as components
  from filtered e group by recipient_id,currency
  having bool_or(strpos(lower(recipient_name),lower(btrim(p_search)))>0 or strpos(recipient_id::text,lower(btrim(p_search)))>0)),
 page as(select * from groups order by recipient_id,currency limit 26 offset p_offset)
 select jsonb_build_object('groups',(select coalesce(jsonb_agg(to_jsonb(g) order by recipient_id,currency),'[]')
  from (select * from page order by recipient_id,currency limit 25) g),
  'has_next',(select count(*)>25 from page)) into result;
 return result;
end;
$list$;
-- END GENERATED PAYABLE INTEGRATION
-- END EMBEDDED MIGRATION 051
-- SELECT-only / ONE statement / ONE row. STOP on failed_checks.
-- No fixed mutable financial row-count baselines. Compare upstream_evidence_hashes across apply.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.payout_can_manage()','db25a8767b50522c600262f7701aeaad',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.payout_immutable()','05d644bae8143f4803dc7a9fd7fcdacb',false,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.save_finance_payee(uuid,uuid,jsonb,integer)','c3e1897b3a42934e417207a0786c8b95',true,'v',false,'uuid','plpgsql',array['p_id','p_profile_id','p_input','p_expected_version']::text[],0,false,'u',false),
('public.payout_choices(uuid,jsonb)','7e0a11fb33408427019a09ebff887a57',true,'s',false,'jsonb','plpgsql',array['p_payee','p_choices']::text[],0,false,'u',false),
('public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)','1764726f779c70bdfdd3aff0c90e7fba',true,'v',false,'uuid','plpgsql',array['p_id','p_payee_id','p_paid_on','p_bank_account_id','p_cash_location_id','p_choices','p_note','p_expected_version']::text[],0,false,'u',false),
('public.confirm_finance_payout(uuid,integer,integer,uuid,boolean)','4e016367b9090c03d8b58a7c5a6b988d',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_expected_payee_version','p_expected_destination_id','p_acknowledged']::text[],0,false,'u',false),
('public.cancel_finance_payout(uuid,integer,boolean)','7fc9d1fa39b4dc4791fbbddb44605661',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_acknowledged']::text[],0,false,'u',false),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','4933aaf3fbfd9131f49a61b78637127b',false,'i',false,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.payout_recipient_guard()','bff44e351fca7c276d7eed4500584182',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.payable_assert_unpaid_contract()','1100b683ce2a0a2d363e58e80de923a5',true,'s',false,'void','plpgsql',null::text[],0,false,'u',false),
('public.payout_assert(uuid)','0a02795188a0128c0a050dc183e34ad5',true,'v',false,'void','plpgsql',array['p_id']::text[],0,false,'u',false),
('public.payout_integrity()','5eaf29de11ffb8832638b83f34a67985',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_payees(text)','fd2c37519abbc80d32bed28488131718',true,'s',false,'jsonb','plpgsql',array['p_search']::text[],1,false,'u',false),
('public.get_finance_payout_workspace(uuid,uuid)','004768edd6695f05667a406d01ced5a4',true,'s',false,'jsonb','plpgsql',array['p_payee_id','p_payout_id']::text[],1,false,'u',false),
('public.get_finance_tax_position()','9de642dd262f1bdb27c2c383b378f6e0',true,'s',false,'jsonb','plpgsql',null::text[],0,false,'u',false),
('public.payout_profile_delete_guard()','fd0dde117c1e7053c0f190975474e50c',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.payable_frozen_components(jsonb)','dfb273d2b1af9c68892d87a4d4d439b2',false,'i',false,'jsonb','plpgsql',array['d']::text[],0,false,'u',false),
('public.payable_distribution_transition()','ad60be15e532bd0909af72b34a76a249',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_payable_entitlements(text,text,text,text,integer)','f43ef91db0bca41c623d02b652f88509',true,'s',false,'jsonb','plpgsql',array['p_search','p_source_type','p_bucket','p_status','p_offset']::text[],5,false,'u',false),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)','621fd126935fcfac21556d0ac95a44ee',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.payable_assert_distribution(uuid)','87c336d1c6b8a410facd769731e1de62',true,'v',false,'void','plpgsql',array['p_id']::text[],0,false,'u',false),
('public.treasury_can_view(uuid,uuid)','115fa322da6dad6019bb97f88aa366e9',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.treasury_location_active(uuid,uuid)','cee644694d7c7a5af8477d75e4f4be09',true,'s',false,'boolean','sql',array['p_bank','p_cash']::text[],0,false,'u',false),
('public.get_finance_treasury(integer)','82d0c09fbfd9cd07d0ed22f109e489d5',true,'s',false,'jsonb','plpgsql',array['p_offset']::text[],1,false,'u',false),
('public.tax_position_source_changed()','24f6879940fe53c4306bd405dd4e05a4',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_formula_calculate_before_payee(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8',false,'i',false,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.get_finance_tax_position_before_payout()','0e3c35def2e84cb56af13aeb77af8f38',true,'s',false,'jsonb','plpgsql',null::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payments r),'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_wht_components r),'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_invoice_allocations r),'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payment_audit_events r),'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoices r),'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_invoice_items r),'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_receipts r),'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_invoices r),'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_point_events r),'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_combined_documents r),'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_document_counters r),'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_company_ledger r),'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_compensation_allocations r),'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_direct_money_receipts r),'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distributions r),'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),'finance_payable_entitlements',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlements r),'finance_payable_entitlement_sources',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_sources r),'finance_payable_entitlement_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_payable_entitlement_audit r),'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_account_opening_balances r),'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r)-'source_payout_id' order by (to_jsonb(r)-'source_payout_id')::text),'[]')::text) from public.finance_cash_transactions r),'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_cash_transaction_audit_events r),'finance_tax_position_facts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_position_facts r),'finance_tax_periods',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_periods r),'finance_tax_position_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by (to_jsonb(r))::text),'[]')::text) from public.finance_tax_position_audit r)) as hashes),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit','finance_payable_entitlements','finance_cash_transactions','finance_outgoing_wht_obligations') order by c.relname),
 expected_catalog as(select value as expected from jsonb_array_elements('[{"name":"finance_cash_transactions","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"occurred_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"direction","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"transaction_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"currency","type":"text","default":"''THB''::text","identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"source_payment_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"reference_no","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"description","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"note","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"reversal_of_transaction_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_by_user_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancel_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"source_direct_money_receipt_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"source_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"source_payout_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_cash_transaction_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"finance_cash_transactions_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((cash_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_cash_transactions_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (bank_account_id) REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_cancelled_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_cash_location_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cash_location_id) REFERENCES finance_cash_locations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_confirmed_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by_user_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_created_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"finance_cash_transactions_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency ~ ''^[A-Z]{3}$''::text))","initially_deferred":false},{"name":"finance_cash_transactions_direction_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((direction = ANY (ARRAY[''inflow''::text, ''outflow''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_lifecycle_metadata_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''draft''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL)) OR ((status = ''confirmed''::text) AND (confirmed_at IS NOT NULL) AND (confirmed_by_user_id IS NOT NULL) AND (cancelled_at IS NULL) AND (cancelled_by_user_id IS NULL) AND (cancel_reason IS NULL)) OR ((status = ''cancelled''::text) AND (confirmed_at IS NULL) AND (confirmed_by_user_id IS NULL) AND (cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(COALESCE(cancel_reason, ''''::text)), ''''::text) IS NOT NULL))))","initially_deferred":false},{"name":"finance_cash_transactions_no_self_reversal_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reversal_of_transaction_id IS NULL) OR (reversal_of_transaction_id <> id)))","initially_deferred":false},{"name":"finance_cash_transactions_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_cash_transactions_reversal_of_transaction_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reversal_of_transaction_id) REFERENCES finance_cash_transactions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_source_contract_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((reversal_of_transaction_id IS NULL) AND (((transaction_type = ''customer_payment''::text) AND (source_payment_id IS NOT NULL) AND (source_direct_money_receipt_id IS NULL) AND (direction = ''inflow''::text)) OR ((transaction_type = ''direct_money_receipt''::text) AND (source_direct_money_receipt_id IS NOT NULL) AND (source_payment_id IS NULL) AND (direction = ''inflow''::text) AND (source_snapshot_json IS NOT NULL)) OR ((transaction_type <> ALL (ARRAY[''customer_payment''::text, ''direct_money_receipt''::text, ''reversal''::text])) AND (source_payment_id IS NULL) AND (source_direct_money_receipt_id IS NULL)))) OR ((reversal_of_transaction_id IS NOT NULL) AND (transaction_type = ''reversal''::text) AND (status = ''confirmed''::text))))","initially_deferred":false},{"name":"finance_cash_transactions_source_direct_money_receipt_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_direct_money_receipt_id) REFERENCES finance_direct_money_receipts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_source_payment_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_cash_transactions_source_payout_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_payout_id) REFERENCES finance_payouts(id)","initially_deferred":false},{"name":"finance_cash_transactions_source_payout_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (source_payout_id)","initially_deferred":false},{"name":"finance_cash_transactions_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''cancelled''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_text_length_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(COALESCE(reference_no, ''''::text)) <= 500) AND (length(COALESCE(description, ''''::text)) <= 1000) AND (length(COALESCE(note, ''''::text)) <= 4000) AND (length(COALESCE(cancel_reason, ''''::text)) <= 2000)))","initially_deferred":false},{"name":"finance_cash_transactions_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((transaction_type = ANY (ARRAY[''customer_payment''::text, ''direct_money_receipt''::text, ''manual_inflow''::text, ''manual_outflow''::text, ''expense_claim''::text, ''refund''::text, ''tax_payment''::text, ''transfer''::text, ''reversal''::text, ''other''::text])))","initially_deferred":false},{"name":"finance_cash_transactions_type_direction_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((transaction_type <> ''manual_inflow''::text) OR (direction = ''inflow''::text)) AND ((transaction_type <> ALL (ARRAY[''manual_outflow''::text, ''expense_claim''::text, ''refund''::text, ''tax_payment''::text])) OR (direction = ''outflow''::text))))","initially_deferred":false},{"name":"finance_cash_transactions_updated_by_user_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL","initially_deferred":false},{"name":"payout_cash_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"payout_cash_source","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((source_payout_id IS NULL) OR ((transaction_type = ''other''::text) AND (direction = ''outflow''::text) AND (status = ''confirmed''::text) AND (source_payment_id IS NULL) AND (source_direct_money_receipt_id IS NULL) AND (reversal_of_transaction_id IS NULL) AND (source_snapshot_json IS NULL))))","initially_deferred":false},{"name":"treasury_cash_evidence","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((source_snapshot_json IS NULL) OR (jsonb_typeof(source_snapshot_json) = ''object''::text)))","initially_deferred":false},{"name":"treasury_cash_location","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(bank_account_id, cash_location_id) = 1))","initially_deferred":false},{"name":"treasury_cash_source","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(source_payment_id, source_direct_money_receipt_id) <= 1))","initially_deferred":false}],"indexes":[{"name":"finance_cash_transactions_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_transactions_pkey ON public.finance_cash_transactions USING btree (id)"},{"name":"finance_cash_transactions_source_payout_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_cash_transactions_source_payout_id_key ON public.finance_cash_transactions USING btree (source_payout_id)"},{"name":"idx_finance_cash_transactions_account_date","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_account_date ON public.finance_cash_transactions USING btree (bank_account_id, currency, occurred_at DESC)"},{"name":"idx_finance_cash_transactions_source_payment","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_source_payment ON public.finance_cash_transactions USING btree (source_payment_id) WHERE (source_payment_id IS NOT NULL)"},{"name":"idx_finance_cash_transactions_status_date","ready":true,"valid":true,"definition":"CREATE INDEX idx_finance_cash_transactions_status_date ON public.finance_cash_transactions USING btree (status, occurred_at DESC)"},{"name":"treasury_cash_direct_original","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX treasury_cash_direct_original ON public.finance_cash_transactions USING btree (source_direct_money_receipt_id) WHERE ((source_direct_money_receipt_id IS NOT NULL) AND (reversal_of_transaction_id IS NULL))"},{"name":"treasury_cash_location_date","ready":true,"valid":true,"definition":"CREATE INDEX treasury_cash_location_date ON public.finance_cash_transactions USING btree (cash_location_id, currency, occurred_at DESC)"},{"name":"uq_finance_cash_transactions_reversal","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_cash_transactions_reversal ON public.finance_cash_transactions USING btree (reversal_of_transaction_id) WHERE (reversal_of_transaction_id IS NOT NULL)"},{"name":"uq_finance_cash_transactions_source_payment","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX uq_finance_cash_transactions_source_payment ON public.finance_cash_transactions USING btree (source_payment_id) WHERE ((source_payment_id IS NOT NULL) AND (reversal_of_transaction_id IS NULL))"}],"policies":[{"name":"finance cash viewers select transactions","check":null,"roles":["authenticated"],"using":"treasury_can_view(bank_account_id, cash_location_id)","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"finance_cash_transaction_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER finance_cash_transaction_integrity AFTER INSERT OR DELETE OR UPDATE ON public.finance_cash_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_finance_cash_transaction_integrity()"},{"name":"finance_cash_transaction_lifecycle_guard","enabled":"O","definition":"CREATE TRIGGER finance_cash_transaction_lifecycle_guard BEFORE INSERT OR DELETE OR UPDATE ON public.finance_cash_transactions FOR EACH ROW EXECUTE FUNCTION enforce_finance_cash_transaction_lifecycle()"},{"name":"payout_cash_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payout_cash_integrity AFTER INSERT OR UPDATE ON public.finance_cash_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_integrity()"},{"name":"treasury_cash_no_truncate","enabled":"O","definition":"CREATE TRIGGER treasury_cash_no_truncate BEFORE TRUNCATE ON public.finance_cash_transactions FOR EACH STATEMENT EXECUTE FUNCTION protect_finance_cash_audit_event()"}]},{"name":"finance_outgoing_wht_obligations","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payout_source_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_line_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_fingerprint","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"payee_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_base","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"explicit_treatment","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"explicit_rate","type":"numeric(7,4)","default":null,"identity":"","not_null":true,"generated":""},{"name":"withheld_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"withheld_on","type":"date","default":null,"identity":"","not_null":true,"generated":""},{"name":"period_month","type":"date","default":null,"identity":"","not_null":true,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"filing_status","type":"text","default":"''unfiled''::text","identity":"","not_null":true,"generated":""},{"name":"remittance_status","type":"text","default":"''not_remitted''::text","identity":"","not_null":true,"generated":""},{"name":"remitted_amount","type":"numeric(14,2)","default":"0","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_outgoing_wht_obligati_payout_source_id_source_line__key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (payout_source_id, source_line_id, source_fingerprint)","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((withheld_amount = round(((gross_base * explicit_rate) / (100)::numeric), 2)))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((period_month = (date_trunc(''month''::text, (withheld_on)::timestamp with time zone))::date))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((remitted_amount >= (0)::numeric) AND (remitted_amount <= withheld_amount)))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency = ''THB''::text))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_explicit_rate_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((explicit_rate > (0)::numeric) AND (explicit_rate <= (100)::numeric)))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_filing_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((filing_status = ANY (ARRAY[''unfiled''::text, ''filed''::text])))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_gross_base_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((gross_base > (0)::numeric))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_payee_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(payee_json) = ''object''::text))","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_outgoing_wht_obligations_remittance_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((remittance_status = ANY (ARRAY[''not_remitted''::text, ''partially_remitted''::text, ''remitted''::text])))","initially_deferred":false},{"name":"payout_wht_component","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (source_line_id) REFERENCES finance_payout_allocations(id)","initially_deferred":false},{"name":"payout_wht_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"payout_wht_source","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payout_source_id) REFERENCES finance_payouts(id)","initially_deferred":false}],"indexes":[{"name":"finance_outgoing_wht_obligati_payout_source_id_source_line__key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_outgoing_wht_obligati_payout_source_id_source_line__key ON public.finance_outgoing_wht_obligations USING btree (payout_source_id, source_line_id, source_fingerprint)"},{"name":"finance_outgoing_wht_obligations_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_outgoing_wht_obligations_pkey ON public.finance_outgoing_wht_obligations USING btree (id)"},{"name":"payout_wht_once","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX payout_wht_once ON public.finance_outgoing_wht_obligations USING btree (source_line_id)"}],"policies":[{"name":"tax_position_read","check":null,"roles":["authenticated"],"using":"tax_position_can_view()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payout_wht_immutable","enabled":"O","definition":"CREATE TRIGGER payout_wht_immutable BEFORE DELETE OR UPDATE ON public.finance_outgoing_wht_obligations FOR EACH ROW EXECUTE FUNCTION tax_position_immutable()"},{"name":"payout_wht_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payout_wht_integrity AFTER INSERT ON public.finance_outgoing_wht_obligations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_integrity()"},{"name":"tax_position_no_rewrite","enabled":"O","definition":"CREATE TRIGGER tax_position_no_rewrite BEFORE DELETE OR UPDATE ON public.finance_outgoing_wht_obligations FOR EACH ROW EXECUTE FUNCTION tax_position_immutable()"},{"name":"tax_position_no_truncate","enabled":"O","definition":"CREATE TRIGGER tax_position_no_truncate BEFORE TRUNCATE ON public.finance_outgoing_wht_obligations FOR EACH STATEMENT EXECUTE FUNCTION tax_position_immutable()"}]},{"name":"finance_payable_entitlements","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_revision","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_fingerprint","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"received_money_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_line_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"component_key","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"component_no","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"formula_code","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"formula_version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"bucket","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"role_label","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric(18,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"finalized_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''open''::text","identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_payable_entitlements_bucket_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((bucket = ANY (ARRAY[''referral''::text, ''work''::text])))","initially_deferred":false},{"name":"finance_payable_entitlements_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status = ''superseded''::text) = (superseded_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_payable_entitlements_component_key_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((component_key ~ ''^[0-9a-f]{32}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_component_no_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((component_no > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency ~ ''^[A-Z]{3}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_fingerprint_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_fingerprint ~ ''^[0-9a-f]{32}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_payable_entitlement_sources(distribution_id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_id_source_line_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (distribution_id, source_line_id, component_key)","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_revision_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_revision > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_version > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_formula_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((formula_version > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_gross_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((gross_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_payable_entitlements_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_payable_entitlements_recipient_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((NULLIF(btrim(recipient_name), ''''::text) IS NOT NULL))","initially_deferred":false},{"name":"finance_payable_entitlements_recipient_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((recipient_type = ANY (ARRAY[''user''::text, ''payee''::text])))","initially_deferred":false},{"name":"finance_payable_entitlements_role_label_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((NULLIF(btrim(role_label), ''''::text) IS NOT NULL))","initially_deferred":false},{"name":"finance_payable_entitlements_source_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((source_type = ANY (ARRAY[''payment''::text, ''direct_money_receipt''::text])))","initially_deferred":false},{"name":"finance_payable_entitlements_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''open''::text, ''superseded''::text])))","initially_deferred":false},{"name":"payable_components_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payable_entitlements_distribution_id_source_line_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlements_distribution_id_source_line_id_key ON public.finance_payable_entitlements USING btree (distribution_id, source_line_id, component_key)"},{"name":"finance_payable_entitlements_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlements_pkey ON public.finance_payable_entitlements USING btree (id)"},{"name":"payable_received_source","ready":true,"valid":true,"definition":"CREATE INDEX payable_received_source ON public.finance_payable_entitlements USING btree (source_type, received_money_id)"},{"name":"payable_recipient_status","ready":true,"valid":true,"definition":"CREATE INDEX payable_recipient_status ON public.finance_payable_entitlements USING btree (recipient_id, currency, status)"}],"policies":[{"name":"payable_components_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payable_components_immutable","enabled":"O","definition":"CREATE TRIGGER payable_components_immutable BEFORE DELETE OR UPDATE ON public.finance_payable_entitlements FOR EACH ROW EXECUTE FUNCTION payable_immutable()"},{"name":"payable_components_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payable_components_integrity AFTER INSERT OR UPDATE ON public.finance_payable_entitlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payable_integrity()"},{"name":"payable_components_no_truncate","enabled":"O","definition":"CREATE TRIGGER payable_components_no_truncate BEFORE TRUNCATE ON public.finance_payable_entitlements FOR EACH STATEMENT EXECUTE FUNCTION payable_immutable()"},{"name":"payout_component_recipient","enabled":"O","definition":"CREATE TRIGGER payout_component_recipient BEFORE INSERT ON public.finance_payable_entitlements FOR EACH ROW EXECUTE FUNCTION payout_recipient_guard()"}]},{"name":"finance_payee_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payee_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payee_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payee_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payee_audit_payee_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payee_id) REFERENCES finance_payees(id)","initially_deferred":false},{"name":"finance_payee_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false}],"indexes":[{"name":"finance_payee_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payee_audit_pkey ON public.finance_payee_audit USING btree (id)"}],"policies":null,"triggers":[{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payee_audit FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payee_audit FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]},{"name":"finance_payee_destinations","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"payee_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"bank_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"account_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"account_number","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"is_active","type":"boolean","default":"true","identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payee_destinations_account_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(account_name)) >= 1) AND (length(btrim(account_name)) <= 300)))","initially_deferred":false},{"name":"finance_payee_destinations_account_number_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(account_number)) >= 4) AND (length(btrim(account_number)) <= 50)))","initially_deferred":false},{"name":"finance_payee_destinations_bank_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(bank_name)) >= 1) AND (length(btrim(bank_name)) <= 200)))","initially_deferred":false},{"name":"finance_payee_destinations_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payee_destinations_payee_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payee_id) REFERENCES finance_payees(id)","initially_deferred":false},{"name":"finance_payee_destinations_payee_id_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (payee_id, id)","initially_deferred":false},{"name":"finance_payee_destinations_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false}],"indexes":[{"name":"finance_payee_destinations_payee_id_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payee_destinations_payee_id_id_key ON public.finance_payee_destinations USING btree (payee_id, id)"},{"name":"finance_payee_destinations_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payee_destinations_pkey ON public.finance_payee_destinations USING btree (id)"},{"name":"payout_destination_current","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX payout_destination_current ON public.finance_payee_destinations USING btree (payee_id) WHERE is_active"}],"policies":null,"triggers":[{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payee_destinations FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payee_destinations FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]},{"name":"finance_payees","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"kind","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"profile_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"entity_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"legal_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"tax_id","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"is_active","type":"boolean","default":"true","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payees_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((kind = ''internal''::text) AND (profile_id = id) AND (entity_type = ''natural_person''::text)) OR ((kind = ''external''::text) AND (profile_id IS NULL))))","initially_deferred":false},{"name":"finance_payees_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payees_entity_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((entity_type = ANY (ARRAY[''natural_person''::text, ''juristic_person''::text])))","initially_deferred":false},{"name":"finance_payees_kind_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((kind = ANY (ARRAY[''internal''::text, ''external''::text])))","initially_deferred":false},{"name":"finance_payees_legal_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(btrim(legal_name)) >= 1) AND (length(btrim(legal_name)) <= 300)))","initially_deferred":false},{"name":"finance_payees_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_payees_profile_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (profile_id) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payees_profile_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (profile_id)","initially_deferred":false},{"name":"finance_payees_tax_id_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((tax_id ~ ''^[0-9]{13}$''::text))","initially_deferred":false},{"name":"finance_payees_updated_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (updated_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payees_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false}],"indexes":[{"name":"finance_payees_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payees_pkey ON public.finance_payees USING btree (id)"},{"name":"finance_payees_profile_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payees_profile_id_key ON public.finance_payees USING btree (profile_id)"}],"policies":null,"triggers":[{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payees FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payees FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]},{"name":"finance_payout_allocations","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payout_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"entitlement_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"treatment","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"rate","type":"numeric(7,4)","default":null,"identity":"","not_null":true,"generated":""},{"name":"wht_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payout_allocations_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((wht_amount = round(((gross_amount * rate) / (100)::numeric), 2)))","initially_deferred":false},{"name":"finance_payout_allocations_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((treatment = ''none''::text) AND (rate = (0)::numeric)) OR ((treatment = ''withhold''::text) AND (rate > (0)::numeric) AND (rate < (100)::numeric))))","initially_deferred":false},{"name":"finance_payout_allocations_entitlement_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (entitlement_id) REFERENCES finance_payable_entitlements(id)","initially_deferred":false},{"name":"finance_payout_allocations_entitlement_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (entitlement_id)","initially_deferred":false},{"name":"finance_payout_allocations_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payout_allocations_gross_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((gross_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_payout_allocations_payout_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payout_id) REFERENCES finance_payouts(id)","initially_deferred":false},{"name":"finance_payout_allocations_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_payout_allocations_treatment_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((treatment = ANY (ARRAY[''none''::text, ''withhold''::text])))","initially_deferred":false},{"name":"payout_allocation_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payout_allocations_entitlement_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payout_allocations_entitlement_id_key ON public.finance_payout_allocations USING btree (entitlement_id)"},{"name":"finance_payout_allocations_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payout_allocations_pkey ON public.finance_payout_allocations USING btree (id)"}],"policies":null,"triggers":[{"name":"payout_allocation_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payout_allocation_integrity AFTER INSERT ON public.finance_payout_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_integrity()"},{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payout_allocations FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payout_allocations FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]},{"name":"finance_payout_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payout_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payout_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payout_audit_event_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''saved''::text, ''confirmed''::text, ''cancelled''::text])))","initially_deferred":false},{"name":"finance_payout_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payout_audit_payout_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payout_id) REFERENCES finance_payouts(id)","initially_deferred":false},{"name":"finance_payout_audit_payout_id_version_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (payout_id, version)","initially_deferred":false},{"name":"finance_payout_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"payout_audit_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payout_audit_payout_id_version_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payout_audit_payout_id_version_key ON public.finance_payout_audit USING btree (payout_id, version)"},{"name":"finance_payout_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payout_audit_pkey ON public.finance_payout_audit USING btree (id)"}],"policies":null,"triggers":[{"name":"payout_audit_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payout_audit_integrity AFTER INSERT ON public.finance_payout_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_integrity()"},{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payout_audit FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payout_audit FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]},{"name":"finance_payouts","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"payee_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"paid_on","type":"date","default":null,"identity":"","not_null":true,"generated":""},{"name":"bank_account_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cash_location_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"currency","type":"text","default":"''THB''::text","identity":"","not_null":true,"generated":""},{"name":"choices_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"wht_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"net_amount","type":"numeric(14,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"note","type":"text","default":"''''::text","identity":"","not_null":true,"generated":""},{"name":"confirmed_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"confirmed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"cancelled_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payouts_bank_account_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (bank_account_id) REFERENCES finance_bank_accounts(id)","initially_deferred":false},{"name":"finance_payouts_cancelled_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cancelled_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payouts_cash_location_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (cash_location_id) REFERENCES finance_cash_locations(id)","initially_deferred":false},{"name":"finance_payouts_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((net_amount > (0)::numeric) AND (net_amount = (gross_amount - wht_amount))))","initially_deferred":false},{"name":"finance_payouts_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((num_nonnulls(bank_account_id, cash_location_id) = 1))","initially_deferred":false},{"name":"finance_payouts_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status = ''confirmed''::text) = ((confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL) AND (confirmed_snapshot_json IS NOT NULL))))","initially_deferred":false},{"name":"finance_payouts_check3","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status = ''cancelled''::text) = ((cancelled_at IS NOT NULL) AND (cancelled_by IS NOT NULL))))","initially_deferred":false},{"name":"finance_payouts_choices_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((jsonb_typeof(choices_json) = ''array''::text) AND ((jsonb_array_length(choices_json) >= 1) AND (jsonb_array_length(choices_json) <= 100))))","initially_deferred":false},{"name":"finance_payouts_confirmed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (confirmed_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payouts_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payouts_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency = ''THB''::text))","initially_deferred":false},{"name":"finance_payouts_gross_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((gross_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_payouts_note_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((length(note) <= 2000))","initially_deferred":false},{"name":"finance_payouts_payee_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payee_id) REFERENCES finance_payees(id)","initially_deferred":false},{"name":"finance_payouts_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_payouts_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''confirmed''::text, ''cancelled''::text])))","initially_deferred":false},{"name":"finance_payouts_updated_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (updated_by) REFERENCES user_profiles(id)","initially_deferred":false},{"name":"finance_payouts_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false},{"name":"finance_payouts_wht_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((wht_amount >= (0)::numeric))","initially_deferred":false},{"name":"payout_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payouts_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payouts_pkey ON public.finance_payouts USING btree (id)"}],"policies":null,"triggers":[{"name":"payout_immutable","enabled":"O","definition":"CREATE TRIGGER payout_immutable BEFORE DELETE OR UPDATE ON public.finance_payouts FOR EACH ROW EXECUTE FUNCTION payout_immutable()"},{"name":"payout_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payout_integrity AFTER INSERT OR UPDATE ON public.finance_payouts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payout_integrity()"},{"name":"payout_no_truncate","enabled":"O","definition":"CREATE TRIGGER payout_no_truncate BEFORE TRUNCATE ON public.finance_payouts FOR EACH STATEMENT EXECUTE FUNCTION payout_immutable()"}]}]'::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
 from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),('exact_functions',not exists(select 1 from function_differences)),
 ('new_zero_state',not exists(select 1 from public.finance_payees) and not exists(select 1 from public.finance_payee_destinations) and not exists(select 1 from public.finance_payee_audit) and not exists(select 1 from public.finance_payouts) and not exists(select 1 from public.finance_payout_allocations) and not exists(select 1 from public.finance_payout_audit) and not exists(select 1 from public.finance_outgoing_wht_obligations) and not exists(select 1 from finance_cash_transactions where source_payout_id is not null)),
 ('private_and_rpc_permissions',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_can_manage()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_can_manage()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_can_manage()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_can_manage()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_payee(uuid,uuid,jsonb,integer)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_payee(uuid,uuid,jsonb,integer)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_payee(uuid,uuid,jsonb,integer)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_payee(uuid,uuid,jsonb,integer)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_choices(uuid,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_choices(uuid,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_choices(uuid,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_choices(uuid,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.confirm_finance_payout(uuid,integer,integer,uuid,boolean)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.confirm_finance_payout(uuid,integer,integer,uuid,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.confirm_finance_payout(uuid,integer,integer,uuid,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.confirm_finance_payout(uuid,integer,integer,uuid,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.cancel_finance_payout(uuid,integer,boolean)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.cancel_finance_payout(uuid,integer,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.cancel_finance_payout(uuid,integer,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.cancel_finance_payout(uuid,integer,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_recipient_guard()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_recipient_guard()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_recipient_guard()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_recipient_guard()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_assert_unpaid_contract()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_assert(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_assert(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_assert(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_assert(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_integrity()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_integrity()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_integrity()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_integrity()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payees(text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payees(text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_payees(text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_payees(text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payout_workspace(uuid,uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payout_workspace(uuid,uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_payout_workspace(uuid,uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_payout_workspace(uuid,uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_tax_position()'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_tax_position()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_tax_position()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_tax_position()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_profile_delete_guard()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payout_profile_delete_guard()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payout_profile_delete_guard()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payout_profile_delete_guard()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_frozen_components(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_distribution_transition()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate_before_payee(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_formula_calculate_before_payee(numeric,text,integer,jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_formula_calculate_before_payee(numeric,text,integer,jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_formula_calculate_before_payee(numeric,text,integer,jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_tax_position_before_payout()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_tax_position_before_payout()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_tax_position_before_payout()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_tax_position_before_payout()') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('browser_raw_identity_and_mutation_blocked',(select count(*)=6 and bool_and(relrowsecurity
 and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_any_column_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from pg_class where relnamespace='public'::regnamespace and relname in('finance_payees','finance_payee_destinations','finance_payee_audit','finance_payouts','finance_payout_allocations','finance_payout_audit'))),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.payout051_before',true),'') is null or current_setting('vp.payout051_before',true)=(select hashes::text from protected))
 ) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payee_payout_foundation_verification_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances),'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),'payout_rows',(select count(*) from finance_payouts), 'payee_rows',(select count(*) from finance_payees)) as observability,
 current_setting('server_version_num')::integer as catalog_server_version_num;
ROLLBACK;
