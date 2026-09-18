-- CANDIDATE 052. No backfill, filing, remittance, opening or cash creation.
-- VAT remains blocked: 050 has no authoritative complete Input VAT register.
create function public.tax_filing_can_manage()
returns boolean language sql stable security definer set search_path=public as $manage$
 select public.tax_position_can_manage() and exists(select 1 from public.user_profiles where id=auth.uid() and active and role not in ('partner','viewer'));
$manage$;
create function public.tax_filing_can_remit()
returns boolean language sql stable security definer set search_path=public as $remit$
 select public.tax_filing_can_manage() and public.current_user_can_confirm_finance_cash_transactions();
$remit$;

create table public.finance_tax_filings (
 id uuid primary key,
 period_month date not null check(extract(day from period_month)=1),
 filing_type text not null check(filing_type in ('vat','wht_natural','wht_juristic')),
 filing_version integer not null default 1 check(filing_version=1),
 amendment_of_id uuid references public.finance_tax_filings(id) check(amendment_of_id is null),
 status text not null default 'draft' check(status in ('draft','ready_for_review','filed','cancelled')),
 version integer not null default 1 check(version>0),
 due_date date,
 due_date_evidence text,
 source_fingerprint text not null check(length(source_fingerprint)=32),
 source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
 base_amount numeric(14,2) not null,
 tax_amount numeric(14,2) check(tax_amount>=0),
 currency text not null default 'THB' check(currency='THB'),
 filed_on date, filed_at timestamptz, filed_by uuid references public.user_profiles(id),
 external_reference text, filing_evidence text, filed_snapshot_json jsonb,
 cancelled_at timestamptz, cancelled_by uuid references public.user_profiles(id), cancellation_reason text,
 created_at timestamptz not null default now(), created_by uuid not null references public.user_profiles(id),
 check((due_date is null and due_date_evidence is null) or (due_date is not null and due_date_evidence is not null and due_date>=period_month and length(btrim(due_date_evidence)) between 1 and 2000)),
 check((status='filed')=(num_nonnulls(filed_on,filed_at,filed_by,external_reference,filing_evidence,filed_snapshot_json)=6)),
 check(status='filed' or num_nonnulls(filed_on,filed_at,filed_by,external_reference,filing_evidence,filed_snapshot_json)=0),
 check(status<>'filed' or (tax_amount is not null and filed_on>=period_month and length(btrim(external_reference)) between 1 and 300 and length(btrim(filing_evidence)) between 1 and 2000)),
 check((status='cancelled')=(num_nonnulls(cancelled_at,cancelled_by,cancellation_reason)=3)),
 check(status='cancelled' or num_nonnulls(cancelled_at,cancelled_by,cancellation_reason)=0)
);
create unique index tax_filing_effective_period on public.finance_tax_filings(period_month,filing_type) where status<>'cancelled';
create table public.finance_tax_filing_allocations (
 id uuid primary key default gen_random_uuid(),
 filing_id uuid not null references public.finance_tax_filings(id),
 tax_fact_id uuid references public.finance_tax_position_facts(id),
 outgoing_wht_id uuid references public.finance_outgoing_wht_obligations(id),
 economic_key text not null,
 source_fingerprint text not null check(length(source_fingerprint)=32),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 check(num_nonnulls(tax_fact_id,outgoing_wht_id)=1),
 unique(filing_id,economic_key)
);
create index tax_filing_fact_coverage on public.finance_tax_filing_allocations(economic_key);
create table public.finance_tax_filing_audit (
 id uuid primary key default gen_random_uuid(), filing_id uuid not null references public.finance_tax_filings(id),
 event_type text not null check(event_type in ('created','ready_for_review','filed','cancelled')),
 version integer not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'), unique(filing_id,version)
);
create table public.finance_tax_remittances (
 id uuid primary key, filing_id uuid not null references public.finance_tax_filings(id),
 status text not null default 'draft' check(status in ('draft','confirmed','cancelled')),
 version integer not null default 1 check(version>0),
 amount numeric(14,2) not null check(amount>0), currency text not null default 'THB' check(currency='THB'),
 paid_on date not null, bank_account_id uuid references public.finance_bank_accounts(id), cash_location_id uuid references public.finance_cash_locations(id),
 external_reference text not null check(length(btrim(external_reference)) between 1 and 300),
 payment_evidence text not null check(length(btrim(payment_evidence)) between 1 and 2000),
 draft_snapshot_json jsonb not null check(jsonb_typeof(draft_snapshot_json)='object'),
 confirmed_snapshot_json jsonb, confirmed_at timestamptz, confirmed_by uuid references public.user_profiles(id),
 cancelled_at timestamptz,cancelled_by uuid references public.user_profiles(id),
 created_at timestamptz not null default now(),created_by uuid not null references public.user_profiles(id),
 check(num_nonnulls(bank_account_id,cash_location_id)=1),
 check((status='confirmed')=(num_nonnulls(confirmed_snapshot_json,confirmed_at,confirmed_by)=3)),
 check(status='confirmed' or num_nonnulls(confirmed_snapshot_json,confirmed_at,confirmed_by)=0),
 check((status='cancelled')=(num_nonnulls(cancelled_at,cancelled_by)=2)),
 check(status='cancelled' or num_nonnulls(cancelled_at,cancelled_by)=0)
);
create unique index tax_remittance_once on public.finance_tax_remittances(filing_id) where status<>'cancelled';
create table public.finance_tax_remittance_audit (
 id uuid primary key default gen_random_uuid(),remittance_id uuid not null references public.finance_tax_remittances(id),
 event_type text not null check(event_type in ('created','confirmed','cancelled')),
 version integer not null,actor_id uuid not null references public.user_profiles(id),created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),unique(remittance_id,version)
);
alter table public.finance_cash_transactions add column source_tax_remittance_id uuid unique references public.finance_tax_remittances(id);
alter table public.finance_cash_transactions add constraint tax_remittance_cash_source check(source_tax_remittance_id is null or
 (direction='outflow' and transaction_type='other' and status='confirmed' and source_payment_id is null and source_direct_money_receipt_id is null
 and source_payout_id is null and reversal_of_transaction_id is null and source_snapshot_json is null));

create function public.tax_filing_pool(p_month date,p_type text)
returns jsonb language plpgsql stable security definer set search_path=public as $pool$
declare rows jsonb; review_rows jsonb:='[]'; issues jsonb:='[]'; total numeric; base numeric; unclassified integer; broken integer;
begin
 if p_month is null or extract(day from p_month)<>1 or p_type is null or p_type not in ('vat','wht_natural','wht_juristic') then raise exception 'TAX_FILING_INPUT_INVALID'; end if;
 if p_type='vat' then
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'tax_fact_id',f.id,'outgoing_wht_id',null,
   'economic_key',v.source_type||':'||v.source_id||':'||f.source_line_id||':output_vat','fingerprint',v.fingerprint,
   'base',f.base_amount,'amount',f.tax_amount,'date',f.effective_on,'rate',f.rate_percent,'reference',f.document_reference,
   'source_type',v.source_type,'source_id',v.source_id,'evidence',to_jsonb(f)) order by f.id),'[]') into rows
  from public.finance_tax_position_facts f join public.finance_tax_source_revisions v on v.id=f.revision_id
  where f.period_month=p_month and f.tax_kind='output_vat' and not exists(select 1 from public.finance_tax_source_revisions n where n.supersedes_id=v.id);
  issues:=jsonb_build_array(jsonb_build_object('code','input_vat_incomplete','count',null));
  -- No typed/manual total or acknowledgement can override 050's incomplete input register.
  total:=null;
 else
  select count(*) filter(where coalesce(w.payee_json->>'entity_type','') not in ('natural_person','juristic_person')),
   count(*) filter(where w.source_fingerprint is distinct from md5(w.evidence_json::text) or w.payee_json is distinct from p.confirmed_snapshot_json->'payee'
    or coalesce(w.payee_json->>'tax_id','')!~'^[0-9]{13}$') into unclassified,broken
  from public.finance_outgoing_wht_obligations w join public.finance_payouts p on p.id=w.payout_source_id
  where p.status='confirmed' and w.period_month=p_month;
  if unclassified>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','unclassified_wht','count',unclassified)); end if;
  if broken>0 then issues:=issues||jsonb_build_array(jsonb_build_object('code','source_evidence_incomplete','count',broken)); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'source_id',w.payout_source_id,'source_type','payout',
   'economic_key','payout:'||w.payout_source_id||':'||w.source_line_id,'fingerprint',w.source_fingerprint,
   'reference',upper(left(w.payout_source_id::text,8)),'date',w.withheld_on,'base',w.gross_base,'amount',w.withheld_amount,
   'rate',w.explicit_rate,'payee_name',w.payee_json->>'legal_name','entity_type',w.payee_json->>'entity_type','evidence',to_jsonb(w)) order by w.id),'[]') into review_rows
  from public.finance_outgoing_wht_obligations w join public.finance_payouts p on p.id=w.payout_source_id
  where p.status='confirmed' and w.period_month=p_month and (coalesce(w.payee_json->>'entity_type','') not in ('natural_person','juristic_person')
   or w.source_fingerprint is distinct from md5(w.evidence_json::text) or w.payee_json is distinct from p.confirmed_snapshot_json->'payee'
   or coalesce(w.payee_json->>'tax_id','')!~'^[0-9]{13}$');
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'tax_fact_id',null,'outgoing_wht_id',w.id,
   'economic_key','payout:'||w.payout_source_id||':'||w.source_line_id,'fingerprint',w.source_fingerprint,
   'base',w.gross_base,'amount',w.withheld_amount,'date',w.withheld_on,'rate',w.explicit_rate,
   'reference',upper(left(w.payout_source_id::text,8)),'source_type','payout','source_id',w.payout_source_id,
   'payee_name',w.payee_json->>'legal_name','entity_type',w.payee_json->>'entity_type','evidence',to_jsonb(w)) order by w.id),'[]') into rows
  from public.finance_outgoing_wht_obligations w join public.finance_payouts p on p.id=w.payout_source_id
  where p.status='confirmed' and w.period_month=p_month and w.payee_json->>'entity_type'=
   case p_type when 'wht_natural' then 'natural_person' else 'juristic_person' end;
  select coalesce(sum((r->>'amount')::numeric),0) into total from jsonb_array_elements(rows) r;
 end if;
 -- 050 recorded untyped external filing evidence. Never assume it is safe to file again.
 if exists(select 1 from public.finance_tax_periods where period_month=p_month and status='filed')
  or exists(select 1 from public.finance_tax_position_audit where period_month=p_month and
   (evidence_json->>'action'='filed' or evidence_json#>>'{previous_period,status}'='filed')) then
  issues:=issues||jsonb_build_array(jsonb_build_object('code','legacy_filing_review','count',1));
 end if;
 select coalesce(sum((r->>'base')::numeric),0) into base from jsonb_array_elements(rows) r;
 return jsonb_build_object('schema_version',1,'period_month',p_month,'filing_type',p_type,'currency','THB','sources',rows,'review_sources',review_rows,
  'source_count',jsonb_array_length(rows),'base_amount',base,'tax_amount',total,
  'output_vat',case when p_type='vat' then (select coalesce(sum((r->>'amount')::numeric),0) from jsonb_array_elements(rows) r) end,
  'input_vat_complete',false,'input_vat',null,'issues',issues,'ready',issues='[]'::jsonb);
end;
$pool$;

create function public.tax_filing_immutable()
returns trigger language plpgsql set search_path=public as $immutable$
begin
 if tg_op<>'UPDATE' then raise exception 'TAX_FILING_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='finance_tax_filings' then
 if old.status in ('draft','ready_for_review') and new.version=old.version+1
  and ((old.status='draft' and new.status in ('ready_for_review','cancelled')) or (old.status='ready_for_review' and new.status in ('filed','cancelled')))
  and to_jsonb(old)-array['status','version','filed_on','filed_at','filed_by','external_reference','filing_evidence','filed_snapshot_json','cancelled_at','cancelled_by','cancellation_reason']
   =to_jsonb(new)-array['status','version','filed_on','filed_at','filed_by','external_reference','filing_evidence','filed_snapshot_json','cancelled_at','cancelled_by','cancellation_reason'] then return new; end if;
 elsif tg_table_name='finance_tax_remittances' then
 if old.status='draft' and new.status in ('confirmed','cancelled') and new.version=old.version+1
  and to_jsonb(old)-array['status','version','confirmed_snapshot_json','confirmed_at','confirmed_by','cancelled_at','cancelled_by']
   =to_jsonb(new)-array['status','version','confirmed_snapshot_json','confirmed_at','confirmed_by','cancelled_at','cancelled_by'] then return new; end if;
 end if;
 raise exception 'TAX_FILING_HISTORY_IMMUTABLE';
end;
$immutable$;
create function public.tax_filing_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $assert$
declare f public.finance_tax_filings%rowtype; actual jsonb;
begin
 select * into strict f from public.finance_tax_filings where id=p_id;
 select coalesce(jsonb_agg(evidence_json order by evidence_json->>'id'),'[]') into actual from public.finance_tax_filing_allocations where filing_id=p_id;
 if actual is distinct from f.source_snapshot_json->'sources' or f.source_fingerprint<>md5(f.source_snapshot_json::text)
  or f.base_amount is distinct from (f.source_snapshot_json->>'base_amount')::numeric or f.tax_amount is distinct from (f.source_snapshot_json->>'tax_amount')::numeric
  or f.period_month::text is distinct from f.source_snapshot_json->>'period_month' or f.filing_type is distinct from f.source_snapshot_json->>'filing_type'
  or (f.status in ('ready_for_review','filed') and (f.source_snapshot_json->>'ready')::boolean is distinct from true)
  or not exists(select 1 from public.finance_tax_filing_audit where filing_id=p_id and version=f.version
   and event_type=case when f.status='draft' then 'created' else f.status end and evidence_json=to_jsonb(f))
 then raise exception 'TAX_FILING_INTEGRITY'; end if;
 if f.status='filed' and f.filed_snapshot_json is distinct from jsonb_build_object('source',f.source_snapshot_json,'due_date',f.due_date,
  'due_date_evidence',f.due_date_evidence,'external_reference',f.external_reference,'filing_evidence',f.filing_evidence,'filed_on',f.filed_on)
 then raise exception 'TAX_FILING_INTEGRITY'; end if;
 if exists(select 1 from public.finance_tax_filing_allocations a where a.filing_id=p_id and
  (a.economic_key is distinct from a.evidence_json->>'economic_key' or a.source_fingerprint is distinct from a.evidence_json->>'fingerprint'
   or a.tax_fact_id is distinct from (a.evidence_json->>'tax_fact_id')::uuid or a.outgoing_wht_id is distinct from (a.evidence_json->>'outgoing_wht_id')::uuid
   or (a.tax_fact_id is not null and not exists(select 1 from public.finance_tax_position_facts s join public.finance_tax_source_revisions v on v.id=s.revision_id
    where s.id=a.tax_fact_id and s.tax_kind='output_vat' and s.period_month=f.period_month and f.filing_type='vat' and to_jsonb(s)=a.evidence_json->'evidence' and v.fingerprint=a.source_fingerprint))
   or (a.outgoing_wht_id is not null and not exists(select 1 from public.finance_outgoing_wht_obligations w join public.finance_payouts p on p.id=w.payout_source_id
    where w.id=a.outgoing_wht_id and p.status='confirmed' and w.period_month=f.period_month and to_jsonb(w)=a.evidence_json->'evidence'
     and w.source_fingerprint=a.source_fingerprint and w.payee_json->>'entity_type'=case f.filing_type when 'wht_natural' then 'natural_person' when 'wht_juristic' then 'juristic_person' end))))
 then raise exception 'TAX_FILING_SOURCE_INTEGRITY'; end if;
 if f.status<>'cancelled' and exists(select 1 from public.finance_tax_filing_allocations a join public.finance_tax_filing_allocations b on b.economic_key=a.economic_key and b.filing_id<>a.filing_id
  join public.finance_tax_filings other on other.id=b.filing_id where a.filing_id=p_id and other.status<>'cancelled') then raise exception 'TAX_FILING_DUPLICATE_COVERAGE'; end if;
end;
$assert$;

create function public.create_finance_tax_filing(p_id uuid,p_month date,p_type text,p_expected_fingerprint text,p_due_date date,p_due_evidence text)
returns uuid language plpgsql security definer set search_path=public as $create$
declare s jsonb; f public.finance_tax_filings%rowtype; r jsonb;
begin
 if public.tax_filing_can_manage() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 -- Same order as Payout/source producers; no source row or Cash lock taken here.
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0)); perform pg_advisory_xact_lock(500050); perform pg_advisory_xact_lock(500052);
 select * into f from public.finance_tax_filings where id=p_id;
 if found then
  if f.period_month is distinct from p_month or f.filing_type is distinct from p_type or f.source_fingerprint is distinct from p_expected_fingerprint
   or f.due_date is distinct from p_due_date or f.due_date_evidence is distinct from nullif(btrim(p_due_evidence),'') then raise exception 'TAX_FILING_IDEMPOTENCY_CONFLICT'; end if;
  return f.id;
 end if;
 if exists(select 1 from public.finance_tax_filings where period_month=p_month and filing_type=p_type and status<>'cancelled') then raise exception 'TAX_FILING_ALREADY_EXISTS'; end if;
 s:=public.tax_filing_pool(p_month,p_type);
 if md5(s::text) is distinct from p_expected_fingerprint then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
 if (p_due_date is null)<>(nullif(btrim(p_due_evidence),'') is null) then raise exception 'TAX_FILING_DUE_EVIDENCE_REQUIRED'; end if;
 insert into public.finance_tax_filings(id,period_month,filing_type,due_date,due_date_evidence,source_fingerprint,source_snapshot_json,base_amount,tax_amount,created_by)
 values(p_id,p_month,p_type,p_due_date,nullif(btrim(p_due_evidence),''),md5(s::text),s,(s->>'base_amount')::numeric,(s->>'tax_amount')::numeric,auth.uid());
 for r in select value from jsonb_array_elements(s->'sources') loop
  insert into public.finance_tax_filing_allocations(filing_id,tax_fact_id,outgoing_wht_id,economic_key,source_fingerprint,evidence_json)
  values(p_id,(r->>'tax_fact_id')::uuid,(r->>'outgoing_wht_id')::uuid,r->>'economic_key',r->>'fingerprint',r);
 end loop;
 insert into public.finance_tax_filing_audit(filing_id,event_type,version,actor_id,evidence_json)
 select id,'created',version,auth.uid(),to_jsonb(x) from public.finance_tax_filings x where id=p_id;
 return p_id;
end;
$create$;
create function public.transition_finance_tax_filing(p_id uuid,p_version integer,p_action text,p_filed_on date,p_reference text,p_evidence text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $transition$
declare f public.finance_tax_filings%rowtype; s jsonb;
begin
 if public.tax_filing_can_manage() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'TAX_FILING_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0)); perform pg_advisory_xact_lock(500050); perform pg_advisory_xact_lock(500052);
 select * into strict f from public.finance_tax_filings where id=p_id for update;
 if f.status=p_action then
  if p_action='filed' and (f.filed_on is distinct from p_filed_on or f.external_reference is distinct from btrim(p_reference) or f.filing_evidence is distinct from btrim(p_evidence))
   then raise exception 'TAX_FILING_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 if f.version is distinct from p_version or not ((f.status='draft' and p_action in ('ready_for_review','cancelled')) or (f.status='ready_for_review' and p_action in ('filed','cancelled')))
  or p_action is null then raise exception 'TAX_FILING_STALE'; end if;
 if p_action<>'cancelled' then
  s:=public.tax_filing_pool(f.period_month,f.filing_type);
  if md5(s::text)<>f.source_fingerprint then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
  if (s->>'ready')::boolean is distinct from true or f.tax_amount is null then raise exception 'TAX_FILING_NOT_READY'; end if;
 end if;
 if p_action='filed' and (p_filed_on is null or p_filed_on<f.period_month or p_filed_on>(now() at time zone 'Asia/Bangkok')::date
  or nullif(btrim(p_reference),'') is null or nullif(btrim(p_evidence),'') is null) then raise exception 'TAX_FILING_EVIDENCE_REQUIRED'; end if;
 if p_action='cancelled' and (nullif(btrim(p_evidence),'') is null or length(p_evidence)>2000) then raise exception 'TAX_FILING_EVIDENCE_REQUIRED'; end if;
 update public.finance_tax_filings set status=p_action,version=version+1,
  filed_on=case when p_action='filed' then p_filed_on end,filed_at=case when p_action='filed' then clock_timestamp() end,filed_by=case when p_action='filed' then auth.uid() end,
  external_reference=case when p_action='filed' then btrim(p_reference) end,filing_evidence=case when p_action='filed' then btrim(p_evidence) end,
  filed_snapshot_json=case when p_action='filed' then jsonb_build_object('source',f.source_snapshot_json,'due_date',f.due_date,'due_date_evidence',f.due_date_evidence,
   'external_reference',btrim(p_reference),'filing_evidence',btrim(p_evidence),'filed_on',p_filed_on) end,
  cancelled_at=case when p_action='cancelled' then clock_timestamp() end,cancelled_by=case when p_action='cancelled' then auth.uid() end,cancellation_reason=case when p_action='cancelled' then btrim(p_evidence) end where id=p_id;
 insert into public.finance_tax_filing_audit(filing_id,event_type,version,actor_id,evidence_json)
 select id,p_action,version,auth.uid(),to_jsonb(x) from public.finance_tax_filings x where id=p_id;
 return p_id;
end;
$transition$;

create function public.tax_filing_account(p_bank uuid,p_cash uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $account$
declare account jsonb;
begin
 if not public.treasury_location_active(p_bank,p_cash) or public.treasury_can_view(p_bank,p_cash) is distinct from true then raise exception 'TAX_FILING_ACCOUNT_REQUIRED'; end if;
 select to_jsonb(a) into account from public.finance_treasury_balances a where bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash;
 return account;
end;
$account$;
create function public.create_finance_tax_remittance(p_id uuid,p_filing_id uuid,p_bank uuid,p_cash uuid,p_paid_on date,p_reference text,p_evidence text,p_expected_account jsonb)
returns uuid language plpgsql security definer set search_path=public as $payment$
declare f public.finance_tax_filings%rowtype;r public.finance_tax_remittances%rowtype; account jsonb;
begin
 if public.tax_filing_can_remit() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(500052); perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 select * into r from public.finance_tax_remittances where id=p_id;
 if found then
  if r.filing_id is distinct from p_filing_id or r.bank_account_id is distinct from p_bank or r.cash_location_id is distinct from p_cash or r.paid_on is distinct from p_paid_on
   or r.external_reference is distinct from btrim(p_reference) or r.payment_evidence is distinct from btrim(p_evidence) or r.draft_snapshot_json->'account' is distinct from p_expected_account then raise exception 'TAX_FILING_IDEMPOTENCY_CONFLICT'; end if;
  return r.id;
 end if;
 select * into f from public.finance_tax_filings where id=p_filing_id;
 if f.id is null or f.status<>'filed' or coalesce(f.tax_amount,0)<=0 then raise exception 'TAX_FILING_PAYMENT_NOT_REQUIRED'; end if;
 if exists(select 1 from public.finance_tax_remittances where filing_id=p_filing_id and status<>'cancelled') then raise exception 'TAX_FILING_ALREADY_EXISTS'; end if;
 if p_paid_on is null or p_paid_on<f.filed_on or p_paid_on>(now() at time zone 'Asia/Bangkok')::date then raise exception 'TAX_FILING_PAYMENT_DATE_INVALID'; end if;
 account:=public.tax_filing_account(p_bank,p_cash);
 if account is distinct from p_expected_account then raise exception 'TAX_FILING_ACCOUNT_CHANGED'; end if;
 insert into public.finance_tax_remittances(id,filing_id,amount,paid_on,bank_account_id,cash_location_id,external_reference,payment_evidence,draft_snapshot_json,created_by)
 values(p_id,f.id,f.tax_amount,p_paid_on,p_bank,p_cash,btrim(p_reference),btrim(p_evidence),jsonb_build_object('schema_version',1,'filing',f.filed_snapshot_json,'account',account,'amount_due',f.tax_amount),auth.uid());
 insert into public.finance_tax_remittance_audit(remittance_id,event_type,version,actor_id,evidence_json)
 select id,'created',version,auth.uid(),to_jsonb(x) from public.finance_tax_remittances x where id=p_id;
 return p_id;
end;
$payment$;
create function public.transition_finance_tax_remittance(p_id uuid,p_version integer,p_action text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $confirm$
declare r public.finance_tax_remittances%rowtype; account jsonb; snapshot jsonb; cash uuid; ts timestamptz:=clock_timestamp();
begin
 if public.tax_filing_can_remit() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'TAX_FILING_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(500052);
 select * into strict r from public.finance_tax_remittances where id=p_id for update;
 if r.status=p_action and p_action in ('confirmed','cancelled') then return r.id; end if;
 if r.status<>'draft' or r.version is distinct from p_version or p_action is null or p_action not in ('confirmed','cancelled') then raise exception 'TAX_FILING_STALE'; end if;
 if p_action='confirmed' then
  perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
  account:=public.tax_filing_account(r.bank_account_id,r.cash_location_id);
  if account->>'opening_id' is null or account->>'system_balance' is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
  if public.finance_bangkok_completed_day_end(r.paid_on)<=(account->>'opening_as_of')::timestamptz then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
  if account is distinct from r.draft_snapshot_json->'account' then raise exception 'TAX_FILING_ACCOUNT_CHANGED'; end if;
  snapshot:=r.draft_snapshot_json||jsonb_build_object('paid_on',r.paid_on,'reference',r.external_reference,'evidence',r.payment_evidence,
   'actual_cash_paid',r.amount,'balance_before',(account->>'system_balance')::numeric,'balance_after',(account->>'system_balance')::numeric-r.amount);
  update public.finance_tax_remittances set status='confirmed',version=version+1,confirmed_at=ts,confirmed_by=auth.uid(),confirmed_snapshot_json=snapshot where id=p_id;
  insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,
   source_tax_remittance_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
  values(public.finance_bangkok_completed_day_end(r.paid_on),'outflow','other',r.bank_account_id,r.cash_location_id,r.amount,'THB','confirmed',r.id,
   r.external_reference,'Tax remittance',auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
  perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('tax_remittance_id',r.id,'remittance',snapshot));
 else
  update public.finance_tax_remittances set status='cancelled',version=version+1,cancelled_at=ts,cancelled_by=auth.uid() where id=p_id;
 end if;
 insert into public.finance_tax_remittance_audit(remittance_id,event_type,version,actor_id,evidence_json)
 select id,p_action,version,auth.uid(),to_jsonb(x) from public.finance_tax_remittances x where id=p_id;
 return p_id;
end;
$confirm$;
create function public.tax_filing_remittance_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $payment_assert$
declare r public.finance_tax_remittances%rowtype; f public.finance_tax_filings%rowtype;c public.finance_cash_transactions%rowtype;
begin
 select * into strict r from public.finance_tax_remittances where id=p_id;
 select * into strict f from public.finance_tax_filings where id=r.filing_id;
 select * into c from public.finance_cash_transactions where source_tax_remittance_id=p_id;
 if f.status<>'filed' or r.amount<>f.tax_amount or r.draft_snapshot_json->'filing' is distinct from f.filed_snapshot_json
  or r.amount is distinct from (r.draft_snapshot_json->>'amount_due')::numeric
  or r.bank_account_id is distinct from (r.draft_snapshot_json#>>'{account,bank_account_id}')::uuid
  or r.cash_location_id is distinct from (r.draft_snapshot_json#>>'{account,cash_location_id}')::uuid
  or not exists(select 1 from public.finance_tax_remittance_audit where remittance_id=p_id and version=r.version
   and event_type=case r.status when 'draft' then 'created' else r.status end and evidence_json=to_jsonb(r))
 then raise exception 'TAX_FILING_REMITTANCE_INTEGRITY'; end if;
 if r.status='confirmed' then
  if c.id is null or c.direction<>'outflow' or c.status<>'confirmed' or c.cash_amount<>r.amount or c.currency<>r.currency
   or c.bank_account_id is distinct from r.bank_account_id or c.cash_location_id is distinct from r.cash_location_id
   or c.occurred_at<>public.finance_bangkok_completed_day_end(r.paid_on)
   or r.confirmed_snapshot_json is distinct from r.draft_snapshot_json||jsonb_build_object('paid_on',r.paid_on,'reference',r.external_reference,'evidence',r.payment_evidence,
    'actual_cash_paid',r.amount,'balance_before',(r.draft_snapshot_json#>>'{account,system_balance}')::numeric,'balance_after',(r.draft_snapshot_json#>>'{account,system_balance}')::numeric-r.amount)
   or not exists(select 1 from public.finance_cash_transaction_audit_events where cash_transaction_id=c.id and event_type='confirmed'
    and event_payload_json->'remittance'=r.confirmed_snapshot_json and event_payload_json->>'tax_remittance_id'=r.id::text)
   then raise exception 'TAX_FILING_CASH_INTEGRITY'; end if;
 elsif c.id is not null then raise exception 'TAX_FILING_CASH_INTEGRITY'; end if;
end;
$payment_assert$;
create function public.tax_filing_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
begin
 if tg_table_name='finance_tax_filings' then perform public.tax_filing_assert(new.id);
 elsif tg_table_name in ('finance_tax_filing_allocations','finance_tax_filing_audit') then perform public.tax_filing_assert(new.filing_id);
 elsif tg_table_name='finance_tax_remittances' then perform public.tax_filing_remittance_assert(new.id);
 elsif tg_table_name='finance_tax_remittance_audit' then perform public.tax_filing_remittance_assert(new.remittance_id);
 elsif tg_table_name='finance_cash_transactions' and new.source_tax_remittance_id is not null then perform public.tax_filing_remittance_assert(new.source_tax_remittance_id);
 end if; return new;
end;
$integrity$;
create function public.tax_filing_cash_reversal_guard()
returns trigger language plpgsql security definer set search_path=public as $reversal$
begin
 if new.reversal_of_transaction_id is not null and exists(select 1 from public.finance_cash_transactions where id=new.reversal_of_transaction_id and source_tax_remittance_id is not null)
 then raise exception 'TAX_FILING_COORDINATED_REVERSAL_REQUIRED'; end if;
 return new;
end;
$reversal$;
create constraint trigger tax_filing_integrity after insert or update on public.finance_tax_filings deferrable initially deferred for each row execute function public.tax_filing_integrity();
create constraint trigger tax_filing_allocation_integrity after insert on public.finance_tax_filing_allocations deferrable initially deferred for each row execute function public.tax_filing_integrity();
create constraint trigger tax_filing_audit_integrity after insert on public.finance_tax_filing_audit deferrable initially deferred for each row execute function public.tax_filing_integrity();
create constraint trigger tax_remittance_integrity after insert or update on public.finance_tax_remittances deferrable initially deferred for each row execute function public.tax_filing_integrity();
create constraint trigger tax_remittance_audit_integrity after insert on public.finance_tax_remittance_audit deferrable initially deferred for each row execute function public.tax_filing_integrity();
create constraint trigger tax_remittance_cash_integrity after insert or update on public.finance_cash_transactions deferrable initially deferred for each row execute function public.tax_filing_integrity();
create trigger tax_remittance_no_generic_reversal before insert on public.finance_cash_transactions for each row execute function public.tax_filing_cash_reversal_guard();

create function public.get_finance_tax_filings(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $read$
declare pools jsonb:='[]'; s jsonb; kind text; filings jsonb; accounts jsonb;
begin
 if public.tax_position_can_view() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 foreach kind in array array['vat','wht_natural','wht_juristic'] loop
  s:=public.tax_filing_pool(p_month,kind);pools:=pools||jsonb_build_array(s||jsonb_build_object('fingerprint',md5(s::text)));
 end loop;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('source_changed',f.source_fingerprint<>md5(public.tax_filing_pool(f.period_month,f.filing_type)::text),
  'remittance',(select to_jsonb(r) from public.finance_tax_remittances r where r.filing_id=f.id and r.status<>'cancelled'),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.version),'[]') from public.finance_tax_filing_audit a where a.filing_id=f.id),
  'payment_history',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('audit',(select jsonb_agg(to_jsonb(a) order by a.version) from public.finance_tax_remittance_audit a where a.remittance_id=r.id)) order by r.created_at,r.id),'[]') from public.finance_tax_remittances r where r.filing_id=f.id)) order by f.created_at desc,f.id),'[]')
 into filings from public.finance_tax_filings f where f.period_month=p_month;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.kind,a.name_en),'[]') into accounts from public.finance_treasury_balances a
 where public.treasury_can_view(a.bank_account_id,a.cash_location_id);
 return jsonb_build_object('can_manage',public.tax_filing_can_manage(),'can_remit',public.tax_filing_can_remit(),'period_month',p_month,
  'pools',pools,'filings',filings,'accounts',accounts,'incoming_wht_credit',(select coalesce(sum(f.tax_amount),0) from public.finance_tax_position_facts f
   where f.period_month=p_month and f.tax_kind='incoming_wht' and not exists(select 1 from public.finance_tax_source_revisions v where v.supersedes_id=f.revision_id)),
  'history',(select coalesce(jsonb_agg(to_jsonb(x) order by x.period_month desc,x.created_at desc),'[]') from (select id,period_month,filing_type,status,tax_amount,filed_on,external_reference,created_at,
   case when status='filed' and tax_amount=0 then 'no_payment_required' when exists(select 1 from public.finance_tax_remittances r where r.filing_id=f.id and status='confirmed') then 'remitted' when status='filed' then 'awaiting_payment' else status end as payment_state
   from public.finance_tax_filings f order by period_month desc,created_at desc limit 20) x));
end;
$read$;

-- The 051 obligation is immutable source evidence, not mutable workflow state.
-- Overlay operational status; never update its unfiled/not_remitted placeholders.
alter function public.get_finance_tax_position() rename to get_finance_tax_position_before_filing;
create function public.get_finance_tax_position()
returns jsonb language plpgsql stable security definer set search_path=public as $position$
declare result jsonb;
begin
 result:=public.get_finance_tax_position_before_filing();
 return result||jsonb_build_object('outgoing',(select coalesce(jsonb_agg(w||jsonb_build_object(
  'filing_status',case when f.status='filed' then 'filed' else 'unfiled' end,
  'remittance_status',case when r.status='confirmed' then 'remitted' else 'not_remitted' end,
  'remitted_amount',case when r.status='confirmed' then (w->>'withheld_amount')::numeric else 0 end) order by w->>'id'),'[]')
 from jsonb_array_elements(result->'outgoing') w
 left join public.finance_tax_filing_allocations a on a.outgoing_wht_id=(w->>'id')::uuid
  and exists(select 1 from public.finance_tax_filings x where x.id=a.filing_id and x.status='filed')
 left join public.finance_tax_filings f on f.id=a.filing_id
 left join public.finance_tax_remittances r on r.filing_id=f.id and r.status='confirmed'));
end;
$position$;

do $security$
declare t text;
begin
 foreach t in array array['finance_tax_filings','finance_tax_filing_allocations','finance_tax_filing_audit','finance_tax_remittances','finance_tax_remittance_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  -- Access is through permission-checked RPCs; no browser raw write/read path.
  execute format('create trigger tax_filing_no_rewrite before update or delete on public.%I for each row execute function public.tax_filing_immutable()',t);
  execute format('create trigger tax_filing_no_truncate before truncate on public.%I for each statement execute function public.tax_filing_immutable()',t);
 end loop;
end;
$security$;
revoke all on function public.tax_filing_can_manage(),public.tax_filing_can_remit(),public.tax_filing_pool(date,text),public.tax_filing_immutable(),
 public.tax_filing_assert(uuid),public.tax_filing_account(uuid,uuid),public.tax_filing_remittance_assert(uuid),public.tax_filing_integrity(),public.tax_filing_cash_reversal_guard(),
 public.create_finance_tax_filing(uuid,date,text,text,date,text),public.transition_finance_tax_filing(uuid,integer,text,date,text,text,boolean),
 public.create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb),public.transition_finance_tax_remittance(uuid,integer,text,boolean),public.get_finance_tax_filings(date)
 from public,anon,authenticated;
revoke all on function public.get_finance_tax_position_before_filing(),public.get_finance_tax_position() from public,anon,authenticated;
grant execute on function public.get_finance_tax_position() to authenticated;
grant execute on function public.create_finance_tax_filing(uuid,date,text,text,date,text),public.transition_finance_tax_filing(uuid,integer,text,date,text,text,boolean),
 public.create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb),public.transition_finance_tax_remittance(uuid,integer,text,boolean),public.get_finance_tax_filings(date) to authenticated;
-- Preserve the old function/history, but retire the untyped browser filing path.
revoke all on function public.transition_finance_tax_period(date,integer,text,text,date,boolean) from public,anon,authenticated;
