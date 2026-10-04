-- 091: additive line-controlled monthly container; no business-row DML.
ALTER TABLE public.finance_payroll_periods DROP CONSTRAINT finance_payroll_periods_status_check;
ALTER TABLE public.finance_payroll_periods ADD CONSTRAINT finance_payroll_periods_status_check CHECK(status IN ('draft','approved','open'));

create or replace function public.payroll089_protect() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 if tg_op='TRUNCATE' then raise exception 'PAYROLL_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='finance_payroll_periods' then
  if tg_op='UPDATE' and old.status in ('draft','open') and (old.status<>'open' or new.status='open') and new.version=old.version+1
   and (to_jsonb(old)-array['status','version','approved_by','approved_at','target_payment_date','note'])=(to_jsonb(new)-array['status','version','approved_by','approved_at','target_payment_date','note']) then return new; end if;
 elsif tg_table_name='finance_payroll_lines' then
  if exists(select 1 from finance_payroll_periods where id=old.period_id and status='open') then
   if old.frozen_json is not null then raise exception 'PAYROLL_LINE_FROZEN';end if;
   if tg_op='UPDATE' and (new.id,new.period_id,new.payee_id) is not distinct from (old.id,old.period_id,old.payee_id) then return new;end if;
   raise exception 'PAYROLL_LINE_IDENTITY_IMMUTABLE';
  end if;
  if exists(select 1 from finance_payroll_periods where id=old.period_id and status='draft') then
   if tg_op='DELETE' then return old; end if;
   if (new.id,new.period_id,new.payee_id,new.engagement_id,new.rate_id,new.kind,new.service_from,new.service_to,new.source_json,new.requires_base_review)
    is not distinct from (old.id,old.period_id,old.payee_id,old.engagement_id,old.rate_id,old.kind,old.service_from,old.service_to,old.source_json,old.requires_base_review) then return new; end if;
  end if;
 elsif tg_table_name='finance_payroll_payments' then
  if tg_op='UPDATE' and old.status='draft' and new.status in ('confirmed','cancelled')
   and to_jsonb(old)-array['status','confirm_json']=to_jsonb(new)-array['status','confirm_json'] then return new; end if;
 end if;
 raise exception 'PAYROLL_HISTORY_IMMUTABLE';
end; $$;

-- Public read and selected-line commands are defined below the compatibility
-- functions. Reads never ensure/create a period, a payee, a line or a payment.

create or replace function public.payroll089_manage(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.finance_payroll_requests%rowtype; p public.finance_payroll_periods%rowtype; l public.finance_payroll_lines%rowtype;
 e public.finance_payroll_engagements%rowtype; payee public.finance_payees%rowtype; source jsonb; sources jsonb; result jsonb;
 item jsonb; new_id uuid; effective date; month_date date; amount numeric; snapshot jsonb;
begin
 perform public.payroll089_require_admin();
 if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>100000 then raise exception 'PAYROLL_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>p_action or req.payload<>p_payload then raise exception 'PAYROLL_RETRY_CHANGED'; end if;
  return req.result;
 end if;
 if p_action in ('engagement','rate') then
  new_id:=(p_payload->>'id')::uuid;effective:=(p_payload->>'effective_from')::date;
  select * into payee from finance_payees where id=(p_payload->>'payee_id')::uuid for share;
  if new_id is null or effective is null or payee.id is null or payee.entity_type<>'natural_person'
   or length(btrim(coalesce(p_payload->>'reason',''))) not between 1 and 2000 then raise exception 'PAYROLL_PERSON_INVALID'; end if;
  if exists(select 1 from finance_payroll_lines x join finance_payroll_periods z on z.id=x.period_id where x.payee_id=payee.id and (z.status='approved' or (z.status='open' and x.frozen_json is not null)) and effective<(z.month+interval '1 month')::date)
   then raise exception 'PAYROLL_APPROVED_HISTORY'; end if;
  if p_action='engagement' then
   if p_payload->>'kind'='employee' and payee.profile_id is null then raise exception 'PAYROLL_EMPLOYEE_IDENTITY_REQUIRED'; end if;
   insert into finance_payroll_engagements(id,payee_id,kind,active,effective_from,reason,created_by)
    values(new_id,payee.id,p_payload->>'kind',(p_payload->>'active')::boolean,effective,p_payload->>'reason',auth.uid());
  else
   if coalesce(p_payload->>'monthly_amount','')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_INPUT_INVALID';end if;
   insert into finance_payroll_rates(id,payee_id,effective_from,monthly_amount,reason,created_by)
    values(new_id,payee.id,effective,(p_payload->>'monthly_amount')::numeric,p_payload->>'reason',auth.uid());
  end if;
  result:=jsonb_build_object('id',new_id);
 elsif p_action='create_period' then
  new_id:=(p_payload->>'id')::uuid;month_date:=(p_payload->>'month')::date;
  if new_id is null or month_date is null or month_date<>date_trunc('month',month_date)::date then raise exception 'PAYROLL_MONTH_INVALID'; end if;
  insert into finance_payroll_periods(id,month,target_payment_date,note,created_by)
   values(new_id,month_date,(p_payload->>'target_payment_date')::date,coalesce(p_payload->>'note',''),auth.uid()) returning * into p;
  sources:=public.payroll089_sources(p.month);
  if jsonb_array_length(sources)=0 then raise exception 'PAYROLL_NO_ELIGIBLE_PEOPLE'; end if;
  if (select count(distinct value->>'payee_id') from jsonb_array_elements(sources))<>jsonb_array_length(sources) then raise exception 'PAYROLL_MIXED_ENGAGEMENT_MONTH';end if;
  for source in select value from jsonb_array_elements(sources) loop
   if source->>'rate_id' is null then raise exception 'PAYROLL_RATE_MISSING: %',source->>'payee_id'; end if;
   insert into finance_payroll_lines(id,period_id,payee_id,engagement_id,rate_id,kind,service_from,service_to,base_amount,source_json,requires_base_review)
    values(gen_random_uuid(),p.id,(source->>'payee_id')::uuid,(source->>'engagement_id')::uuid,(source->>'rate_id')::uuid,source->>'kind',
     (source->>'service_from')::date,(source->>'service_to')::date,(source->>'monthly_amount')::numeric,source->'source_json',(source->>'requires_base_review')::boolean);
  end loop;
  result:=jsonb_build_object('id',p.id,'version',p.version);
 elsif p_action in ('line','approve','period','reload_period') then
  select * into p from finance_payroll_periods where id=(p_payload->>'period_id')::uuid for update;
  if p.id is null or p.status<>'draft' or p.version is distinct from (p_payload->>'version')::integer then raise exception 'PAYROLL_STALE_OR_FROZEN'; end if;
  if p_action='line' then
   select * into l from finance_payroll_lines where id=(p_payload->>'line_id')::uuid and period_id=p.id for update;
   if l.id is null then raise exception 'PAYROLL_LINE_INVALID'; end if;
   for item in select to_jsonb(k) from unnest(array['base_amount','additions','deductions','employee_ss','employer_ss','wht_amount']) k loop
    if coalesce(p_payload->>(item#>>'{}'),'')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_INPUT_INVALID';end if;
   end loop;
   amount:=(p_payload->>'base_amount')::numeric;
   if (l.requires_base_review or amount is distinct from (l.source_json#>>'{rate,monthly_amount}')::numeric)
    and length(btrim(coalesce(p_payload->>'adjustment_reason','')))=0 then raise exception 'PAYROLL_BASE_REASON_REQUIRED'; end if;
   if length(btrim(coalesce(p_payload->>'note','')))=0 then raise exception 'PAYROLL_REVIEW_EVIDENCE_REQUIRED'; end if;
   update finance_payroll_lines set base_amount=amount,additions=(p_payload->>'additions')::numeric,deductions=(p_payload->>'deductions')::numeric,
    employee_ss=(p_payload->>'employee_ss')::numeric,employer_ss=(p_payload->>'employer_ss')::numeric,
    wht_treatment=p_payload->>'wht_treatment',wht_amount=(p_payload->>'wht_amount')::numeric,
    adjustment_reason=coalesce(p_payload->>'adjustment_reason',''),note=p_payload->>'note',reviewed=true where id=l.id;
  elsif p_action='reload_period' then
   if p_payload->>'acknowledged' is distinct from 'true' then raise exception 'PAYROLL_APPROVAL_ACK_REQUIRED'; end if;
   sources:=public.payroll089_sources(p.month);
   if jsonb_array_length(sources)=0 then raise exception 'PAYROLL_NO_ELIGIBLE_PEOPLE';end if;
   if (select count(distinct value->>'payee_id') from jsonb_array_elements(sources))<>jsonb_array_length(sources) then raise exception 'PAYROLL_MIXED_ENGAGEMENT_MONTH';end if;
   delete from finance_payroll_lines where period_id=p.id;
   for source in select value from jsonb_array_elements(sources) loop
    if source->>'rate_id' is null then raise exception 'PAYROLL_RATE_MISSING';end if;
    insert into finance_payroll_lines(id,period_id,payee_id,engagement_id,rate_id,kind,service_from,service_to,base_amount,source_json,requires_base_review)
     values(gen_random_uuid(),p.id,(source->>'payee_id')::uuid,(source->>'engagement_id')::uuid,(source->>'rate_id')::uuid,source->>'kind',
      (source->>'service_from')::date,(source->>'service_to')::date,(source->>'monthly_amount')::numeric,source->'source_json',(source->>'requires_base_review')::boolean);
   end loop;
   update finance_payroll_periods set version=version+1 where id=p.id;
  elsif p_action='period' then
   update finance_payroll_periods set target_payment_date=(p_payload->>'target_payment_date')::date,note=coalesce(p_payload->>'note',''),version=version+1 where id=p.id;
  else
   if p_payload->>'acknowledged' is distinct from 'true' then raise exception 'PAYROLL_APPROVAL_ACK_REQUIRED'; end if;
   sources:=public.payroll089_sources(p.month);
   if jsonb_array_length(sources)<>(select count(*) from finance_payroll_lines where period_id=p.id)
    or exists(select 1 from jsonb_array_elements(sources) s where not exists(select 1 from finance_payroll_lines x where x.period_id=p.id and x.engagement_id=(s->>'engagement_id')::uuid and x.source_json=s->'source_json'))
    then raise exception 'PAYROLL_DRAFT_SOURCES_CHANGED'; end if;
   if exists(select 1 from finance_payroll_lines where period_id=p.id and (not reviewed or net_amount<0 or (requires_base_review and btrim(adjustment_reason)='')))
    then raise exception 'PAYROLL_REVIEW_REQUIRED'; end if;
   for l in select * from finance_payroll_lines where period_id=p.id order by id loop
    select * into payee from finance_payees where id=l.payee_id for share;
    if payee.id is null or not payee.is_active or (l.wht_amount>0 and payee.tax_id is null) then raise exception 'PAYROLL_PAYEE_OR_TAX_ID_REQUIRED'; end if;
    snapshot:=to_jsonb(l)-'frozen_json'||jsonb_build_object('payee',jsonb_build_object('id',payee.id,'profile_id',payee.profile_id,'legal_name',payee.legal_name,'tax_id',payee.tax_id),'month',p.month,'approved_by',auth.uid());
    update finance_payroll_lines set frozen_json=snapshot where id=l.id;
    for item in select jsonb_build_object('kind',kind,'amount',value) from (values
     (case l.kind when 'employee' then 'employee_wht' else 'contractor_wht' end,l.wht_amount),('employee_ss',l.employee_ss),('employer_ss',l.employer_ss)) v(kind,value) where value>0 loop
     insert into finance_payroll_obligations(period_id,line_id,kind,amount,source_json) values(p.id,l.id,item->>'kind',(item->>'amount')::numeric,snapshot);
    end loop;
   end loop;
   update finance_payroll_periods set status='approved',approved_by=auth.uid(),approved_at=clock_timestamp(),version=version+1 where id=p.id;
  end if;
  if p_action='line' then update finance_payroll_periods set version=version+1 where id=p.id; end if;
  result:=jsonb_build_object('id',p.id,'version',p.version+1);
 else raise exception 'PAYROLL_ACTION_INVALID'; end if;
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),p_action,p_payload,result);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json) values(p_request_id,auth.uid(),p_action,jsonb_build_object('input',p_payload,'result',result));
 return result;
end; $$;

create or replace function public.payroll089_period_assert() returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid; p public.finance_payroll_periods%rowtype;l public.finance_payroll_lines%rowtype; expected jsonb;actual jsonb;
begin
 if tg_table_name='finance_payroll_periods' then pid:=new.id;else pid:=coalesce(new.period_id,old.period_id);end if;
 select * into p from finance_payroll_periods where id=pid;
 for l in select * from finance_payroll_lines where period_id=pid loop
  if p.status='draft' or (p.status='open' and l.frozen_json is null) then
   if l.frozen_json is not null or exists(select 1 from finance_payroll_obligations where line_id=l.id) then raise exception 'PAYROLL_DRAFT_INTEGRITY';end if;
  else
   if l.frozen_json is null or l.frozen_json-array['payee','month','approved_by'] is distinct from to_jsonb(l)-'frozen_json' then raise exception 'PAYROLL_FROZEN_INTEGRITY';end if;
   select coalesce(jsonb_object_agg(kind,amount),'{}') into expected from (values
    (case l.kind when 'employee' then 'employee_wht' else 'contractor_wht' end,l.wht_amount),('employee_ss',l.employee_ss),('employer_ss',l.employer_ss)) v(kind,amount) where amount>0;
   select coalesce(jsonb_object_agg(kind,amount),'{}') into actual from finance_payroll_obligations where line_id=l.id;
   if actual<>expected or exists(select 1 from finance_payroll_obligations where line_id=l.id and (source_json<>l.frozen_json or period_id<>pid)) then raise exception 'PAYROLL_OBLIGATION_INTEGRITY';end if;
  end if;
 end loop;
 return null;
end; $$;

create or replace function public.payroll091_source(p_month date,p_payee uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare sources jsonb;
begin
 perform public.payroll089_require_admin();
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'PAYROLL_MONTH_INVALID'; end if;
 if not exists(select 1 from finance_payees where id=p_payee and profile_id=id and kind='internal' and entity_type='natural_person') then
  return jsonb_build_object('issue','internal_person_required');end if;
 with engagements as (
  select e.*,coalesce(lead(effective_from) over(partition by payee_id order by effective_from),'infinity'::date) until_date
  from finance_payroll_engagements e
 ), rates as (
  select r.*,coalesce(lead(effective_from) over(partition by payee_id order by effective_from),'infinity'::date) until_date
  from finance_payroll_rates r
 ), eligible as (
  select e.*,greatest(p_month,e.effective_from) service_from,
   least((p_month+interval '1 month')::date,e.until_date)-1 service_to
  from engagements e where e.payee_id=p_payee and e.active and e.effective_from<(p_month+interval '1 month')::date and e.until_date>p_month
 ), matched_intervals as (
  select e.*,r.rate_evidence,r.rate_count,r.first_rate,r.first_from,r.rate_ends_inside,
   array_remove(array[
    case when e.service_from>p_month then 'engagement_starts_mid_month' end,
    case when e.service_to<(p_month+interval '1 month')::date-1 then 'engagement_ends_mid_month' end,
    case when r.first_from>e.service_from then 'rate_starts_after_service_start' end,
    case when r.rate_ends_inside then 'rate_ends_before_service_end' end,
    case when r.rate_count>1 then 'rate_changes_during_service' end
   ]::text[],null) review_reasons
  from eligible e cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object('rate',to_jsonb(r)-'until_date',
     'overlap_from',greatest(r.effective_from,e.service_from),
     'overlap_to',least(r.until_date-1,e.service_to)) order by r.effective_from,r.id),'[]') rate_evidence,
    count(*) rate_count,(jsonb_agg(to_jsonb(r)-'until_date' order by r.effective_from,r.id))->0 first_rate,
    min(r.effective_from) first_from,bool_or(r.until_date<=e.service_to) rate_ends_inside
   from rates r where r.payee_id=e.payee_id and r.effective_from<=e.service_to and r.until_date>e.service_from
  ) r
 ), sources as (
  select e.id engagement_id,e.payee_id,e.kind,e.service_from,e.service_to,e.first_rate->>'id' rate_id,
   -- Zero is an unresolved draft placeholder, NOT computed pay or proration.
   -- The unchanged manage RPC requires reviewed=true + reason + note before approval.
   case when cardinality(review_reasons)>0 then 0 else (first_rate->>'monthly_amount')::numeric end monthly_amount,
   cardinality(review_reasons)>0 requires_base_review,
   jsonb_build_object('contract','payroll090_overlap_v1',
    'engagement',to_jsonb(e)-array['until_date','service_from','service_to','rate_evidence','rate_count','first_rate','first_from','rate_ends_inside','review_reasons'],
    'rate',first_rate,'service_from',service_from,'service_to',service_to,
    'rate_intervals',rate_evidence,'manual_review_required',cardinality(review_reasons)>0,
    'manual_review_reasons',to_jsonb(review_reasons)) source_json
  from matched_intervals e
 ) select coalesce(jsonb_agg(to_jsonb(s) order by payee_id,service_from),'[]') into sources from sources s;

 if jsonb_array_length(sources)=0 then return jsonb_build_object('issue','no_engagement');end if;
 if jsonb_array_length(sources)>1 then return jsonb_build_object('issue','mixed_engagement');end if;
 if sources->0->>'rate_id' is null then return jsonb_build_object('issue','missing_rate','source',sources->0);end if;
 return jsonb_build_object('source',sources->0,'source_hash',encode(sha256(convert_to((sources->0)::text,'UTF8')),'hex'));
end; $$;

create function public.payroll091_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare p public.finance_payroll_periods%rowtype; person public.finance_payees%rowtype;
 l public.finance_payroll_lines%rowtype; dest public.finance_payee_destinations%rowtype;
 src jsonb; payment jsonb; rows jsonb:='[]'; problems jsonb; state text; fresh boolean; info jsonb;
begin
 perform public.payroll089_require_admin();
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'PAYROLL_MONTH_INVALID';end if;
 select * into p from finance_payroll_periods where month=p_month;
 for person in select y.* from finance_payees y where (y.profile_id=y.id and y.kind='internal' and exists(select 1 from finance_payroll_engagements e where e.payee_id=y.id))
   or exists(select 1 from finance_payroll_lines x where x.period_id=p.id and x.payee_id=y.id)
   order by y.legal_name COLLATE "C",y.id loop
  select * into l from finance_payroll_lines where period_id=p.id and payee_id=person.id;
  src:=public.payroll091_source(p_month,person.id);
  if l.id is null and src->>'issue' in ('no_engagement','internal_person_required') then continue;end if;
  select * into dest from finance_payee_destinations where payee_id=person.id and is_active;
  select jsonb_build_object('id',y.id,'version',y.version,'status',y.status,'paid_on',y.paid_on,
    'bank_account_id',y.bank_account_id,'cash_location_id',y.cash_location_id,
    'destination_id',y.confirmed_snapshot_json#>>'{destination,id}',
    'destination_summary',case when y.confirmed_snapshot_json#>>'{destination,account_number}' is not null then
      (y.confirmed_snapshot_json#>>'{destination,bank_name}')||' ••••'||right(regexp_replace(y.confirmed_snapshot_json#>>'{destination,account_number}','[^0-9]','','g'),4) end)
   into payment from finance_payroll_payments pp join finance_payouts y on y.id=pp.payout_id where pp.line_id=l.id and pp.status<>'cancelled';
  fresh:=l.id is null or l.frozen_json is not null or (src->>'issue' is null and l.source_json=src#>'{source,source_json}');
  problems:='[]';
  if l.frozen_json is null then
   if src->>'issue' is not null then problems:=problems||jsonb_build_array(src->>'issue');end if;
   if not fresh then problems:=problems||'"source_changed"'::jsonb;end if;
  end if;
  if not person.is_active then problems:=problems||'"payee_inactive"'::jsonb;end if;
  if dest.id is null then problems:=problems||'"destination_missing"'::jsonb;end if;
  if l.wht_amount>0 and person.tax_id is null then problems:=problems||'"tax_id_missing"'::jsonb;end if;
  if payment->>'status'='confirmed' then state:='paid';problems:='[]';
  elsif l.frozen_json is not null and l.net_amount=0 then state:='settled_zero';problems:='[]';
  elsif payment->>'status'='draft' then state:='prepared';
  elsif jsonb_array_length(problems)>0 then state:='setup_incomplete';
  elsif coalesce(l.requires_base_review,(src#>>'{source,requires_base_review}')::boolean,false) and not coalesce(l.reviewed,false) then state:='amount_required';
  elsif not coalesce(l.reviewed,false) then state:='setup_incomplete';problems:=problems||'"monthly_facts_required"'::jsonb;
  else state:='ready';end if;
  info:=case when l.frozen_json is not null then l.source_json else src#>'{source,source_json}' end;
  rows:=rows||jsonb_build_array(jsonb_build_object('payee_id',person.id,'profile_id',person.profile_id,
    'name',coalesce(l.frozen_json#>>'{payee,legal_name}',person.legal_name),'kind',coalesce(l.kind,src#>>'{source,kind}'),
    'recurring_amount',info#>'{rate,monthly_amount}','source',src->'source','source_hash',src->>'source_hash',
    'line',case when l.id is not null then to_jsonb(l) end,
    'line_hash',case when l.id is not null then encode(sha256(convert_to(to_jsonb(l)::text,'UTF8')),'hex') end,
    'payee_version',person.version,'tax_id_present',person.tax_id is not null,
    'destination',case when dest.id is not null then jsonb_build_object('id',dest.id,'bank_name',dest.bank_name,
      'summary',dest.bank_name||' ••••'||right(regexp_replace(dest.account_number,'[^0-9]','','g'),4)) end,
    'payment',payment,'state',state,'issues',problems,'source_fresh',fresh));
 end loop;
 return jsonb_build_object('month',p_month,'period_id',p.id,'legacy_approved',p.status='approved','rows',rows,
  'obligations',(select coalesce(jsonb_object_agg(kind,amount),'{}') from (select o.kind,sum(o.amount) amount
   from finance_payroll_obligations o join finance_payroll_lines x on x.id=o.line_id
   where o.period_id=p.id and x.frozen_json is not null group by o.kind) q),
  'summary',jsonb_build_object('people',jsonb_array_length(rows),
   'paid',(select count(*) from jsonb_array_elements(rows) r where r->>'state' in ('paid','settled_zero')),
   'ready',(select count(*) from jsonb_array_elements(rows) r where r->>'state'='ready'),
   'amount_required',(select count(*) from jsonb_array_elements(rows) r where r->>'state'='amount_required'),
   'net_total',(select coalesce(sum((r#>>'{line,net_amount}')::numeric),0) from jsonb_array_elements(rows) r where coalesce((r#>>'{line,reviewed}')::boolean,false))));
end; $$;

-- One command for explicit monthly intent. No HTTP-level payment orchestration.
-- Same global lock order as 089 Payout lifecycle; stable item ordering; exact retry.
create function public.payroll091_manage(p_action text,p_month date,p_items jsonb,p_request_id uuid,p_acknowledged boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare req public.finance_payroll_requests%rowtype; p public.finance_payroll_periods%rowtype;
 l public.finance_payroll_lines%rowtype; payee public.finance_payees%rowtype;
 old_payment public.finance_payouts%rowtype; dest public.finance_payee_destinations%rowtype;
 item jsonb; src jsonb; source jsonb; facts jsonb; payload jsonb; snapshot jsonb; result jsonb; obligation jsonb;
 prepared jsonb:='[]'; confirmations jsonb:='[]'; results jsonb:='[]'; k text;
 payout_id uuid; amount numeric; new_line uuid; parent_period uuid;
begin
 perform public.payroll089_require_admin();
 if p_request_id is null or p_month is null or p_month<>date_trunc('month',p_month)::date
  or p_action not in ('save','reload','pay') or jsonb_typeof(p_items) is distinct from 'array'
  or jsonb_array_length(p_items) not between 1 and 50 or octet_length(p_items::text)>100000 then raise exception 'PAYROLL_MONTHLY_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x)<>'object' or x->>'payee_id' is null)
  or (select count(distinct x->>'payee_id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'PAYROLL_DUPLICATE_ITEM';end if;
 if p_action='pay' and p_acknowledged is distinct from true then raise exception 'PAYROLL_ACTUAL_PAYMENT_ACK_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 select jsonb_build_object('month',p_month,'items',jsonb_agg(x order by x->>'payee_id' COLLATE "C"),'acknowledged',p_acknowledged) into payload from jsonb_array_elements(p_items) x;
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>'monthly_'||p_action or req.payload<>payload then raise exception 'PAYROLL_RETRY_CHANGED';end if;
  return req.result;
 end if;
 select * into p from finance_payroll_periods where month=p_month for update;
 -- Ensure only on intentional mutation, never from month preview. A failed item
 -- rolls back this container as well as every earlier selected line/payment.
 if p.id is null then
  if p_action='reload' then raise exception 'PAYROLL_LINE_INVALID';end if;
  insert into finance_payroll_periods(id,month,target_payment_date,status,created_by)
   values(gen_random_uuid(),p_month,(p_month+interval '1 month')::date-1,'open',auth.uid()) returning * into p;
 elsif p.status='draft' then
  update finance_payroll_periods set status='open',version=version+1 where id=p.id returning * into p;
 end if;
 parent_period:=p.id;
 for item in select x from jsonb_array_elements(p_items) x order by x->>'payee_id' COLLATE "C" loop
 begin
  select * into payee from finance_payees where id=(item->>'payee_id')::uuid for share;
  if payee.id is null or payee.profile_id is distinct from payee.id or payee.kind<>'internal' then raise exception 'PAYROLL_INTERNAL_PERSON_REQUIRED';end if;
  select * into l from finance_payroll_lines where period_id=p.id and payee_id=payee.id for update;
  if not (item ? 'line_hash') or (item->>'line_hash') is distinct from (case when l.id is not null then encode(sha256(convert_to(to_jsonb(l)::text,'UTF8')),'hex') end) then raise exception 'PAYROLL_LINE_STALE';end if;
  if p_action='reload' and l.id is null then raise exception 'PAYROLL_LINE_INVALID';end if;
  if l.frozen_json is not null and item ? 'facts' then raise exception 'PAYROLL_LINE_FROZEN';end if;
  if l.frozen_json is not null and p_action<>'pay' then raise exception 'PAYROLL_LINE_FROZEN';end if;
  if p.status='approved' and l.frozen_json is null then raise exception 'PAYROLL_APPROVED_HISTORY';end if;
  if l.frozen_json is null then
   src:=public.payroll091_source(p_month,payee.id);
   if src->>'issue' is not null then raise exception using message='PAYROLL_PERSON_SETUP_INCOMPLETE',detail=jsonb_build_object('payee_id',payee.id,'reason',src->>'issue','month',p_month)::text;end if;
   if item->>'source_hash' is distinct from src->>'source_hash' then raise exception 'PAYROLL_SOURCE_STALE';end if;
   source:=src->'source';
   if l.id is not null and l.source_json is distinct from source->'source_json' and p_action<>'reload' then raise exception 'PAYROLL_SOURCE_CHANGED';end if;
   if l.id is null then
    new_line:=(item->>'line_id')::uuid;if new_line is null then raise exception 'PAYROLL_LINE_INVALID';end if;
    insert into finance_payroll_lines(id,period_id,payee_id,engagement_id,rate_id,kind,service_from,service_to,base_amount,source_json,requires_base_review)
     values(new_line,p.id,payee.id,(source->>'engagement_id')::uuid,(source->>'rate_id')::uuid,source->>'kind',
      (source->>'service_from')::date,(source->>'service_to')::date,(source->>'monthly_amount')::numeric,source->'source_json',(source->>'requires_base_review')::boolean) returning * into l;
   end if;
   if p_action='reload' then
    update finance_payroll_lines set engagement_id=(source->>'engagement_id')::uuid,rate_id=(source->>'rate_id')::uuid,kind=source->>'kind',
     service_from=(source->>'service_from')::date,service_to=(source->>'service_to')::date,base_amount=(source->>'monthly_amount')::numeric,
     source_json=source->'source_json',requires_base_review=(source->>'requires_base_review')::boolean,
     additions=0,deductions=0,employee_ss=0,employer_ss=0,wht_treatment='none',wht_amount=0,adjustment_reason='',note='',reviewed=false
     where id=l.id returning * into l;
   elsif p_action='save' or item ? 'facts' then
    facts:=item->'facts';
    if jsonb_typeof(facts) is distinct from 'object' or facts->>'confirmed' is distinct from 'true' then raise exception 'PAYROLL_MONTHLY_FACTS_REQUIRED';end if;
    foreach k in array array['base_amount','additions','deductions','employee_ss','employer_ss','wht_amount'] loop
     if coalesce(facts->>k,'')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_MONTHLY_FACTS_REQUIRED';end if;
    end loop;
    if facts->>'wht_treatment' is null or length(btrim(coalesce(facts->>'note','')))=0 then raise exception 'PAYROLL_MONTHLY_FACTS_REQUIRED';end if;
    amount:=(facts->>'base_amount')::numeric;
    if (l.requires_base_review or amount is distinct from (l.source_json#>>'{rate,monthly_amount}')::numeric)
     and length(btrim(coalesce(facts->>'adjustment_reason','')))=0 then raise exception 'PAYROLL_BASE_REASON_REQUIRED';end if;
    update finance_payroll_lines set base_amount=amount,additions=(facts->>'additions')::numeric,deductions=(facts->>'deductions')::numeric,
     employee_ss=(facts->>'employee_ss')::numeric,employer_ss=(facts->>'employer_ss')::numeric,wht_treatment=facts->>'wht_treatment',
     wht_amount=(facts->>'wht_amount')::numeric,adjustment_reason=coalesce(facts->>'adjustment_reason',''),note=facts->>'note',reviewed=true
     where id=l.id returning * into l;
   end if;
  end if;
  if p_action='pay' then
   if not l.reviewed or (l.requires_base_review and btrim(l.adjustment_reason)='') then raise exception 'PAYROLL_REVIEW_REQUIRED';end if;
   if not payee.is_active or (l.wht_amount>0 and payee.tax_id is null) then raise exception 'PAYROLL_PAYEE_OR_TAX_ID_REQUIRED';end if;
   if payee.version is distinct from (item->>'payee_version')::integer then raise exception 'PAYROLL_PAYEE_CHANGED';end if;
   select * into dest from finance_payee_destinations where payee_id=payee.id and is_active for share;
   if l.net_amount>0 and item->>'bank_account_id' is not null and (dest.id is null or dest.id is distinct from (item->>'destination_id')::uuid) then raise exception 'PAYROLL_DESTINATION_REQUIRED';end if;
   if l.frozen_json is null then
    snapshot:=to_jsonb(l)-'frozen_json'||jsonb_build_object('payee',jsonb_build_object('id',payee.id,'profile_id',payee.profile_id,'legal_name',payee.legal_name,'tax_id',payee.tax_id),'month',p_month,'approved_by',auth.uid());
    update finance_payroll_lines set frozen_json=snapshot where id=l.id returning * into l;
    for obligation in select jsonb_build_object('kind',kind,'amount',value) from (values
     (case l.kind when 'employee' then 'employee_wht' else 'contractor_wht' end,l.wht_amount),('employee_ss',l.employee_ss),('employer_ss',l.employer_ss)) v(kind,value) where value>0 loop
     insert into finance_payroll_obligations(period_id,line_id,kind,amount,source_json) values(p.id,l.id,obligation->>'kind',(obligation->>'amount')::numeric,snapshot);
    end loop;
   end if;
   if l.net_amount>0 then
    select y.* into old_payment from finance_payroll_payments pp join finance_payouts y on y.id=pp.payout_id where pp.line_id=l.id and pp.status<>'cancelled' for update of y;
    payout_id:=(item->>'payout_id')::uuid;
    if payout_id is null then raise exception 'PAYROLL_PAYMENT_STALE';end if;
    if old_payment.id is not null then
     if old_payment.id<>payout_id or old_payment.status<>'draft' or old_payment.version is distinct from (item->>'payout_version')::integer then raise exception 'PAYROLL_PAYMENT_STALE';end if;
     if old_payment.paid_on is distinct from (item->>'paid_on')::date or old_payment.bank_account_id is distinct from (item->>'bank_account_id')::uuid
      or old_payment.cash_location_id is distinct from (item->>'cash_location_id')::uuid then raise exception 'PAYROLL_PREPARED_PAYMENT_CHANGED';end if;
    else
     if item->>'payout_version' is not null then raise exception 'PAYROLL_PAYMENT_STALE';end if;
     prepared:=prepared||jsonb_build_array(jsonb_build_object('line_id',l.id,'payout_id',payout_id,
      'bank_account_id',item->>'bank_account_id','cash_location_id',item->>'cash_location_id','paid_on',item->>'paid_on',
      'payee_version',payee.version,'destination_id',dest.id));
    end if;
    confirmations:=confirmations||jsonb_build_array(jsonb_build_object('line_id',l.id,'payout_id',payout_id,
     'payout_version',coalesce(old_payment.version,1),'payee_version',payee.version,'destination_id',dest.id));
   else payout_id:=null;end if;
  else payout_id:=null;end if;
  results:=results||jsonb_build_array(jsonb_build_object('payee_id',payee.id,'line_id',l.id,'payout_id',payout_id,'net_amount',l.net_amount));
 exception when others then
  raise exception using message=SQLERRM,detail=jsonb_build_object('payee_id',item->>'payee_id','month',p_month)::text,errcode=SQLSTATE;
 end;
 end loop;
 if jsonb_array_length(prepared)>0 then perform public.payroll089_payment_batch('prepare',prepared,md5('payroll091:prepare:'||p_request_id::text)::uuid,false);end if;
 if jsonb_array_length(confirmations)>0 then perform public.payroll089_payment_batch('confirm',confirmations,md5('payroll091:confirm:'||p_request_id::text)::uuid,true);end if;
 if p.status='open' then update finance_payroll_periods set version=version+1 where id=p.id;end if;
 result:=jsonb_build_object('period_id',parent_period,'items',results);
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),'monthly_'||p_action,payload,result);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json) values(p_request_id,auth.uid(),'monthly_'||p_action,jsonb_build_object('input',payload,'result',result));
 return result;
end; $$;

ALTER FUNCTION public.payroll091_source(date,uuid) OWNER TO postgres;
ALTER FUNCTION public.payroll091_month(date) OWNER TO postgres;
ALTER FUNCTION public.payroll091_manage(text,date,jsonb,uuid,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.payroll091_source(date,uuid),public.payroll091_month(date),public.payroll091_manage(text,date,jsonb,uuid,boolean) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payroll091_month(date),public.payroll091_manage(text,date,jsonb,uuid,boolean) TO authenticated;
