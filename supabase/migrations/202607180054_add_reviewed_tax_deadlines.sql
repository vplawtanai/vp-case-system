-- CANDIDATE 054. Do not apply before human review. No statutory dates/calendar seeded.
-- No business-row backfill or financial mutation. 001-053 are immutable.
DO $zero_gate$ BEGIN
 if exists(select 1 from public.finance_tax_filings) then raise exception '054 requires zero Filing rows; stop for compatibility review'; end if;
END $zero_gate$;
create table public.finance_tax_deadline_rules (
 id uuid primary key,
 version bigint generated always as identity unique,
 filing_type text not null check(filing_type in ('vat','wht_natural','wht_juristic')),
 channel text not null check(channel in ('online','paper')),
 effective_from date not null check(extract(day from effective_from)=1),
 effective_to date not null check(extract(day from effective_to)=1 and effective_to>=effective_from),
 status text not null check(status in ('reviewed','withdrawn')),
 supersedes_id uuid unique references public.finance_tax_deadline_rules(id),
 spec jsonb not null check(jsonb_typeof(spec)='object'),
 reviewed_by uuid not null references public.user_profiles(id),
 reviewed_at timestamptz not null default now()
);
alter table public.finance_tax_deadline_rules enable row level security;
revoke all on public.finance_tax_deadline_rules from public,anon,authenticated;
revoke all on sequence public.finance_tax_deadline_rules_version_seq from public,anon,authenticated;
create trigger tax_deadline_rules_immutable before update or delete or truncate on public.finance_tax_deadline_rules
 for each statement execute function public.tax_position_immutable();

create function public.publish_finance_tax_deadline_rule(p_id uuid,p_spec jsonb,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $publish$
declare prior public.finance_tax_deadline_rules%rowtype; existing public.finance_tax_deadline_rules%rowtype; d text;
begin
 if not public.money_allocation_admin() then raise exception 'TAX_DEADLINE_ADMIN_REQUIRED'; end if;
 if p_acknowledged is distinct from true then raise exception 'TAX_DEADLINE_ACK_REQUIRED'; end if;
 if p_id is null or jsonb_typeof(p_spec) is distinct from 'object'
  or nullif(btrim(p_spec->>'reference'),'') is null or nullif(btrim(p_spec->>'reason'),'') is null
  or length(p_spec::text)>100000 then raise exception 'TAX_DEADLINE_RULE_INVALID'; end if;
 perform pg_advisory_xact_lock(500054);
 select * into existing from public.finance_tax_deadline_rules where id=p_id;
 if found then
  if existing.spec is distinct from p_spec then raise exception 'TAX_DEADLINE_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 if p_spec->>'status'='reviewed' then
  if (p_spec->>'due_day')::integer not between 1 and 31 or p_spec->>'due_day' is null
   or p_spec->>'holiday_policy' is null or p_spec->>'holiday_policy' not in ('no_adjustment_reviewed','next_business_day_reviewed')
   or jsonb_typeof(p_spec->'closed_dates') is distinct from 'array'
   or jsonb_typeof(p_spec->'weekend_days') is distinct from 'array'
   or (p_spec->>'calendar_from')::date is null or (p_spec->>'calendar_to')::date is null
   or (p_spec->>'calendar_from')::date>(p_spec->>'calendar_to')::date
   then raise exception 'TAX_DEADLINE_RULE_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_spec->'closed_dates') e where jsonb_typeof(e) is distinct from 'string')
   or exists(select 1 from jsonb_array_elements(p_spec->'weekend_days') e where jsonb_typeof(e) is distinct from 'number' or e::text !~ '^[0-6]$')
   then raise exception 'TAX_DEADLINE_RULE_INVALID'; end if;
  for d in select jsonb_array_elements_text(p_spec->'closed_dates') loop
   if d::date::text<>d then raise exception 'TAX_DEADLINE_RULE_INVALID'; end if;
  end loop;
  for d in select jsonb_array_elements_text(p_spec->'weekend_days') loop
   if d::integer not between 0 and 6 then raise exception 'TAX_DEADLINE_RULE_INVALID'; end if;
  end loop;
 end if;
 if p_spec->>'supersedes_id' is not null then
  select * into prior from public.finance_tax_deadline_rules where id=(p_spec->>'supersedes_id')::uuid;
  if prior.id is null or prior.filing_type is distinct from p_spec->>'filing_type' or prior.channel is distinct from p_spec->>'channel'
   or prior.effective_from is distinct from (p_spec->>'effective_from')::date or prior.effective_to is distinct from (p_spec->>'effective_to')::date
   or exists(select 1 from public.finance_tax_deadline_rules where supersedes_id=prior.id)
   then raise exception 'TAX_DEADLINE_RULE_CONFLICT'; end if;
 elsif exists(select 1 from public.finance_tax_deadline_rules where filing_type=p_spec->>'filing_type' and channel=p_spec->>'channel'
  and effective_from<=(p_spec->>'effective_to')::date and effective_to>=(p_spec->>'effective_from')::date)
  then raise exception 'TAX_DEADLINE_RULE_CONFLICT'; end if;
 insert into public.finance_tax_deadline_rules(id,filing_type,channel,effective_from,effective_to,status,supersedes_id,spec,reviewed_by)
 values(p_id,p_spec->>'filing_type',p_spec->>'channel',(p_spec->>'effective_from')::date,(p_spec->>'effective_to')::date,
  p_spec->>'status',(p_spec->>'supersedes_id')::uuid,p_spec,auth.uid());
 return p_id;
end;
$publish$;

create function public.tax_filing_deadline(p_month date,p_type text,p_channel text)
returns jsonb language plpgsql stable security definer set search_path=public as $deadline$
declare r public.finance_tax_deadline_rules%rowtype; due date; nominal date; result jsonb; n integer;
begin
 if p_month is null or extract(day from p_month)<>1 or p_type is null or p_type not in ('vat','wht_natural','wht_juristic')
  or p_channel is null or p_channel not in ('online','paper') then raise exception 'TAX_DEADLINE_INPUT_INVALID'; end if;
 result:=jsonb_build_object('schema_version',1,'period_month',p_month,'filing_type',p_type,'channel',p_channel,'status','review_required','due_date',null,'rule',null);
 select * into r from public.finance_tax_deadline_rules where filing_type=p_type and channel=p_channel and p_month between effective_from and effective_to order by version desc limit 1;
 if r.id is null or r.status<>'reviewed' then return result; end if;
 result:=result||jsonb_build_object('rule',to_jsonb(r));
 -- No implicit weekend/holiday defaults. The reviewed rule explicitly owns policy and calendar coverage.
 due:=(p_month+interval '1 month')::date;
 if (r.spec->>'due_day')::integer>extract(day from (due+interval '1 month -1 day')) then return result; end if;
 due:=due+((r.spec->>'due_day')::integer-1); nominal:=due;
 for n in 0..31 loop
  if due not between (r.spec->>'calendar_from')::date and (r.spec->>'calendar_to')::date then return result; end if;
  if r.spec->>'holiday_policy'='no_adjustment_reviewed' or
   (not (r.spec->'closed_dates' @> to_jsonb(array[due::text])) and not (r.spec->'weekend_days' @> to_jsonb(array[extract(dow from due)::integer]))) then
   return result||jsonb_build_object('status','calculated','due_date',due,'normal_due_date',nominal);
  end if;
  due:=due+1;
 end loop;
 return result;
end;
$deadline$;
create function public.get_finance_tax_deadline(p_month date,p_type text,p_channel text)
returns jsonb language plpgsql stable security definer set search_path=public as $read_deadline$
begin
 if public.tax_position_can_view() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 return public.tax_filing_deadline(p_month,p_type,p_channel);
end;
$read_deadline$;

alter table public.finance_tax_filings add column deadline_snapshot_json jsonb;
alter table public.finance_tax_filings add constraint tax_filing_deadline_snapshot_shape check(deadline_snapshot_json is null or
 (jsonb_typeof(deadline_snapshot_json)='object' and deadline_snapshot_json->>'schema_version'='1'
 and deadline_snapshot_json->>'channel' in ('online','paper') and deadline_snapshot_json->>'status' in ('calculated','review_required','admin_override')));
-- Retain old implementation as evidence/private only; public callers cannot bypass reviewed deadlines.
revoke all on function public.create_finance_tax_filing(uuid,date,text,text,date,text) from public,anon,authenticated;
create function public.create_finance_tax_filing_review(p_id uuid,p_month date,p_type text,p_expected_fingerprint text,p_channel text,p_expected_deadline jsonb,p_override jsonb default null)
returns uuid language plpgsql security definer set search_path=public as $create_review$
declare s jsonb; coverage jsonb; deadline jsonb; due date; due_ref text; f public.finance_tax_filings%rowtype; r jsonb;
begin
 if public.tax_filing_can_manage() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 if p_override is not null and not public.money_allocation_admin() then raise exception 'TAX_DEADLINE_ADMIN_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0)); perform pg_advisory_xact_lock(500050); perform pg_advisory_xact_lock(500052); perform pg_advisory_xact_lock(500054);
 select * into f from public.finance_tax_filings where id=p_id;
 if found then
  if f.period_month is distinct from p_month or f.filing_type is distinct from p_type or f.source_fingerprint is distinct from p_expected_fingerprint
   or f.deadline_snapshot_json->>'channel' is distinct from p_channel or f.deadline_snapshot_json->'reviewed' is distinct from p_expected_deadline
   or f.deadline_snapshot_json->'override_input' is distinct from coalesce(p_override,'null'::jsonb)
   then raise exception 'TAX_FILING_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 if exists(select 1 from public.finance_tax_filings where period_month=p_month and filing_type=p_type and status<>'cancelled') then raise exception 'TAX_FILING_ALREADY_EXISTS'; end if;
 deadline:=public.tax_filing_deadline(p_month,p_type,p_channel);
 if deadline is distinct from p_expected_deadline then raise exception 'TAX_DEADLINE_SOURCE_CHANGED'; end if;
 deadline:=deadline||jsonb_build_object('reviewed',deadline,'override_input',p_override);
 if p_override is not null then
  if jsonb_typeof(p_override) is distinct from 'object' or nullif(btrim(p_override->>'reason'),'') is null
   or nullif(btrim(p_override->>'reference'),'') is null or (p_override->>'due_date')::date is null
   or (p_override->>'due_date')::date<p_month or length(p_override::text)>4000 then raise exception 'TAX_DEADLINE_OVERRIDE_INVALID'; end if;
  deadline:=deadline||jsonb_build_object('status','admin_override','due_date',(p_override->>'due_date')::date,'override_actor',auth.uid(),'override_at',now());
 end if;
 due:=(deadline->>'due_date')::date;
 due_ref:=case when due is null then null when p_override is not null then left(p_override->>'reference',2000) else left(deadline#>>'{rule,spec,reference}',2000) end;
 s:=public.tax_filing_pool(p_month,p_type);
 if md5(s::text) is distinct from p_expected_fingerprint then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
 coverage:=case when s->>'schema_version'='2' then s->'allocation_coverage' else s end;
 insert into public.finance_tax_filings(id,period_month,filing_type,due_date,due_date_evidence,deadline_snapshot_json,source_fingerprint,source_snapshot_json,base_amount,tax_amount,created_by)
 values(p_id,p_month,p_type,due,due_ref,deadline,md5(s::text),s,(coverage->>'base_amount')::numeric,(s->>'tax_amount')::numeric,auth.uid());
 for r in select value from jsonb_array_elements(coverage->'sources') loop
  insert into public.finance_tax_filing_allocations(filing_id,tax_fact_id,outgoing_wht_id,economic_key,source_fingerprint,evidence_json)
  values(p_id,(r->>'tax_fact_id')::uuid,(r->>'outgoing_wht_id')::uuid,r->>'economic_key',r->>'fingerprint',r);
 end loop;
 insert into public.finance_tax_filing_audit(filing_id,event_type,version,actor_id,evidence_json)
 select id,'created',version,auth.uid(),to_jsonb(x) from public.finance_tax_filings x where id=p_id;
 return p_id;
end;
$create_review$;

-- Complete monthly source aggregation, independent of the paginated Cashbook table.
create function public.get_finance_treasury_month_flow(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $flow$
declare result jsonb;
begin
 if public.current_user_can_view_finance_cash_transactions() is distinct from true then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'TREASURY_FILTER_INVALID'; end if;
 with receipts as (
  select 'payment'::text kind,id,receiving_bank_account_id as bank_account_id,null::uuid cash_location_id,cash_amount,received_on from public.finance_payments
   where status='confirmed' and currency='THB' and cash_amount>0 and received_on>=p_month and received_on<p_month+interval '1 month'
  union all select 'direct_money_receipt',id,receiving_bank_account_id,receiving_cash_location_id,cash_amount,received_on from public.finance_direct_money_receipts
   where status='confirmed' and currency='THB' and cash_amount>0 and received_on>=p_month and received_on<p_month+interval '1 month'
 ), classified as (
  select r.*,case when b.opening_id is null then 'unresolved'
   when r.received_on<=(b.opening_as_of at time zone 'Asia/Bangkok')::date then 'pre_cutoff'
   when exists(select 1 from public.finance_cash_transactions c where c.status='confirmed' and c.reversal_of_transaction_id is null
    and ((r.kind='payment' and c.source_payment_id=r.id) or (r.kind='direct_money_receipt' and c.source_direct_money_receipt_id=r.id))) then 'represented'
   when b.is_active then 'pending' else 'unresolved' end as category
  from receipts r left join public.finance_treasury_balances b on b.bank_account_id is not distinct from r.bank_account_id and b.cash_location_id is not distinct from r.cash_location_id
  where public.money_allocation_admin() or public.treasury_can_view(r.bank_account_id,r.cash_location_id)
 ) select jsonb_build_object('period_month',p_month,'currency','THB','receipt_count',count(*),'cash',coalesce(sum(cash_amount),0),
  'pre_cutoff',coalesce(sum(cash_amount) filter(where category='pre_cutoff'),0),'represented',coalesce(sum(cash_amount) filter(where category='represented'),0),
  'pending',coalesce(sum(cash_amount) filter(where category='pending'),0),'unresolved',coalesce(sum(cash_amount) filter(where category='unresolved'),0)) into result from classified;
 return result;
end;
$flow$;
revoke all on function public.tax_filing_deadline(date,text,text),public.publish_finance_tax_deadline_rule(uuid,jsonb,boolean),public.get_finance_tax_deadline(date,text,text),
 public.create_finance_tax_filing_review(uuid,date,text,text,text,jsonb,jsonb),public.get_finance_treasury_month_flow(date) from public,anon,authenticated;
grant execute on function public.publish_finance_tax_deadline_rule(uuid,jsonb,boolean),public.get_finance_tax_deadline(date,text,text),
 public.create_finance_tax_filing_review(uuid,date,text,text,text,jsonb,jsonb),public.get_finance_treasury_month_flow(date) to authenticated;
