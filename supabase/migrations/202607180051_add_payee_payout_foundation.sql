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
