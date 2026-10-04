-- 092: controlled correction only. No new tables, columns, seed or backfill.
-- Private helpers expose no salary data or DELETE privilege to application roles.
create function public.payroll092_line_safe(p_line uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 return exists(select 1 from finance_payroll_lines l join finance_payroll_periods p on p.id=l.period_id
  where l.id=p_line and l.frozen_json is null and p.status in ('draft','open')
  and not exists(select 1 from finance_payroll_obligations o where o.line_id=l.id)
  and not exists(select 1 from finance_payroll_payments x where x.line_id=l.id)
  -- Check the payout source too, including cancelled payouts and orphaned links.
  -- Cash refers to this immutable payout identity; neither may be removed here.
  and not exists(select 1 from finance_payouts x where x.source_model='payroll_v1'
   and x.choices_json @> jsonb_build_array(jsonb_build_object('line_id',l.id))));
end; $$;

create function public.payroll092_rate_lines(p_rate uuid) returns setof uuid
language plpgsql stable security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 -- A mid-month rate may live only in rate_intervals, not the primary rate FK.
 -- Also invalidate unfinished amounts whose effective source would change.
 return query select l.id from finance_payroll_rates r join finance_payroll_lines l on l.payee_id=r.payee_id
 where r.id=p_rate and (l.rate_id=r.id
  or l.source_json @> jsonb_build_object('rate_intervals',jsonb_build_array(jsonb_build_object('rate',jsonb_build_object('id',r.id))))
  or (l.service_to>=r.effective_from and l.service_from<coalesce((select min(n.effective_from) from finance_payroll_rates n where n.payee_id=r.payee_id and n.effective_from>r.effective_from),'infinity'::date)));
end; $$;

create function public.payroll092_state(p_payee uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare s jsonb;
begin
 perform public.payroll089_require_admin();
 select jsonb_build_object(
  'has_payroll_payout',exists(select 1 from finance_payouts where payee_id=p_payee and source_model='payroll_v1'),
  'engagements',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from finance_payroll_engagements e where payee_id=p_payee),
  'rates',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from finance_payroll_rates r where payee_id=p_payee),
  'lines',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from finance_payroll_lines l where payee_id=p_payee),
  'periods',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from finance_payroll_periods p where exists(select 1 from finance_payroll_lines l where l.period_id=p.id and l.payee_id=p_payee)),
  'line_safe',(select coalesce(jsonb_object_agg(l.id,public.payroll092_line_safe(l.id)),'{}') from finance_payroll_lines l where payee_id=p_payee),
  'rate_lines',(select coalesce(jsonb_object_agg(r.id,(select coalesce(jsonb_agg(x order by x),'[]') from public.payroll092_rate_lines(r.id) x)),'{}') from finance_payroll_rates r where payee_id=p_payee)
 ) into s;
 return s;
end; $$;

create function public.payroll092_read(p_month date default null,p_period uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare person uuid;s jsonb;result jsonb:='{}';rates jsonb; r jsonb; data jsonb;
begin
 perform public.payroll089_require_admin();
 for person in select payee_id from finance_payroll_engagements union select payee_id from finance_payroll_rates union select payee_id from finance_payroll_lines loop
  s:=public.payroll092_state(person);rates:='{}';
  for r in select value from jsonb_array_elements(s->'rates') loop
   rates:=rates||jsonb_build_object(r->>'id',jsonb_build_object('allowed',not exists(select 1 from jsonb_array_elements_text(s#>array['rate_lines',r->>'id']) x where s#>>array['line_safe',x] is distinct from 'true'),
    'affected_lines',jsonb_array_length(s#>array['rate_lines',r->>'id'])));
  end loop;
  result:=result||jsonb_build_object(person,jsonb_build_object('hash',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
   'setup_allowed',s->>'has_payroll_payout'='false' and not exists(select 1 from jsonb_each(s->'line_safe') x where x.value<>'true'::jsonb),
   'line_count',jsonb_array_length(s->'lines'),'rates',rates,'lines',s->'line_safe'));
 end loop;
 -- STABLE callees share this statement's snapshot. The displayed facts and
 -- correction token must never come from separate read transactions.
 data:=public.payroll089_read(p_period);
 return data||jsonb_build_object('corrections',result,'monthly',public.payroll091_month(coalesce(p_month,((data->>'today')::date-date_part('day',(data->>'today')::date)::integer+1))));
end; $$;

create function public.payroll092_correct(p_action text,p_payee uuid,p_target uuid,p_expected_hash text,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare req finance_payroll_requests%rowtype; s jsonb; payload jsonb; result jsonb; chosen uuid[]; old_context text;
begin
 perform public.payroll089_require_admin();
 if p_action is null or p_action not in ('setup','rate','line') or p_payee is null or p_request_id is null
  or p_expected_hash is null or p_expected_hash!~'^[0-9a-f]{64}$' or p_reason is null or length(btrim(p_reason)) not between 1 and 2000
  or (p_action='setup' and p_target is not null) or (p_action<>'setup' and p_target is null) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 payload:=jsonb_build_object('payee_id',p_payee,'target',p_target,'expected_hash',p_expected_hash,'reason',p_reason);
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>'correction_'||p_action or req.payload<>payload then raise exception 'PAYROLL_RETRY_CHANGED';end if;
  return req.result;
 end if;
 perform 1 from finance_payees where id=p_payee for update;
 -- Deterministic locks shared with the existing serialized Payroll money paths.
 perform 1 from finance_payroll_periods where id in (select period_id from finance_payroll_lines where payee_id=p_payee) order by id for update;
 perform 1 from finance_payroll_lines where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_engagements where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_rates where payee_id=p_payee order by id for update;
 s:=public.payroll092_state(p_payee);
 if encode(sha256(convert_to(s::text,'UTF8')),'hex')<>p_expected_hash then raise exception 'PAYROLL_CORRECTION_STALE';end if;
 if p_action='setup' then
  if s->>'has_payroll_payout' is distinct from 'false' then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
  if jsonb_array_length(s->'engagements')+jsonb_array_length(s->'rates')=0 then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  select array_agg(id order by id) into chosen from finance_payroll_lines where payee_id=p_payee;
 elsif p_action='rate' then
  if not exists(select 1 from finance_payroll_rates where id=p_target and payee_id=p_payee) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  select array_agg(x order by x) into chosen from public.payroll092_rate_lines(p_target) x;
 else
  if not exists(select 1 from finance_payroll_lines where id=p_target and payee_id=p_payee) then raise exception 'PAYROLL_CORRECTION_INVALID';end if;
  chosen:=array[p_target];
 end if;
 if exists(select 1 from unnest(chosen) x where not public.payroll092_line_safe(x)) then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
 result:=jsonb_build_object('transaction_id',txid_current(),'deleted',jsonb_build_object(
  'finance_payroll_lines',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from finance_payroll_lines l where id=any(chosen)),
  'finance_payroll_rates',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from finance_payroll_rates r where payee_id=p_payee and (p_action='setup' or (p_action='rate' and id=p_target))),
  'finance_payroll_engagements',case when p_action='setup' then s->'engagements' else '[]'::jsonb end));
 -- The immutable request is a transaction-bound deletion permit. A forged GUC
 -- alone cannot authorize deletion: role has no INSERT/DML on this table.
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),'correction_'||p_action,payload,result);
 old_context:=current_setting('vp.payroll092_request',true);
 perform set_config('vp.payroll092_request',p_request_id::text,true);
 delete from finance_payroll_lines where id=any(chosen);
 if p_action='setup' then
  delete from finance_payroll_rates where payee_id=p_payee;
  delete from finance_payroll_engagements where payee_id=p_payee;
 elsif p_action='rate' then delete from finance_payroll_rates where id=p_target;end if;
 perform set_config('vp.payroll092_request',coalesce(old_context,''),true);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json)
  values(p_request_id,auth.uid(),'correction_'||p_action,jsonb_build_object('input',payload,'before',s,'result',result));
 return result;
end; $$;

-- The complete 091 protection remains below this narrow, audited DELETE permit.
create or replace function public.payroll089_protect() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.payroll089_require_admin();
 if tg_op='DELETE' and tg_table_name in ('finance_payroll_engagements','finance_payroll_rates','finance_payroll_lines')
  and exists(select 1 from finance_payroll_requests q
   where q.id::text=current_setting('vp.payroll092_request',true) and q.actor_id=auth.uid()
    and q.action in ('correction_setup','correction_rate','correction_line')
    and q.result->>'transaction_id'=txid_current()::text
    and q.result#>array['deleted',tg_table_name] @> jsonb_build_array(to_jsonb(old))) then
  if tg_table_name='finance_payroll_lines' and not public.payroll092_line_safe(old.id) then raise exception 'PAYROLL_CORRECTION_FINALIZED';end if;
  return old;
 end if;
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

DO $security$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'payroll092_%' loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('payroll092_read','payroll092_correct') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$security$;
