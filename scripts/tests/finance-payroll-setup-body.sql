-- 093: update only mistaken, unfinalized effective-dated facts. No seed/backfill.
-- Private resolver covers BOTH the old and proposed effective intervals, including
-- predecessor months affected by moving a start date. Explicit snapshot references
-- remain dependencies even if their dates do not agree with those intervals.
create function public.payroll093_affected(p_kind text,p_target uuid,p_effective date) returns setof uuid
language plpgsql stable security definer set search_path=public as $$
declare person uuid;old_date date;old_until date;new_until date;
begin
 perform public.payroll089_require_admin();
 if p_kind='engagement' then
  select payee_id,effective_from into person,old_date from finance_payroll_engagements where id=p_target;
  select coalesce(min(effective_from) filter(where effective_from>old_date),'infinity'::date),
   coalesce(min(effective_from) filter(where effective_from>p_effective),'infinity'::date)
   into old_until,new_until from finance_payroll_engagements where payee_id=person and id<>p_target;
 elsif p_kind='rate' then
  select payee_id,effective_from into person,old_date from finance_payroll_rates where id=p_target;
  select coalesce(min(effective_from) filter(where effective_from>old_date),'infinity'::date),
   coalesce(min(effective_from) filter(where effective_from>p_effective),'infinity'::date)
   into old_until,new_until from finance_payroll_rates where payee_id=person and id<>p_target;
 else raise exception 'PAYROLL_SETUP_INVALID';end if;
 if person is null or p_effective is null or not isfinite(p_effective) then raise exception 'PAYROLL_SETUP_INVALID';end if;
 return query select l.id from finance_payroll_lines l join finance_payroll_periods p on p.id=l.period_id
 where l.payee_id=person and (
  l.engagement_id=p_target or l.rate_id=p_target
  or position(p_target::text in l.source_json::text)>0 or position(p_target::text in coalesce(l.frozen_json::text,''))>0
  or (p.month<greatest(old_until,new_until) and (p.month+interval '1 month')::date>least(old_date,p_effective)));
end; $$;

-- Simulate the effective timeline before any write. A new/ending relationship may
-- start/end mid-month. Two active tax treatments in the same month are not P1.
create function public.payroll093_engagement_check(p_payee uuid,p_target uuid,p_kind text,p_active boolean,p_effective date) returns void
language plpgsql stable security definer set search_path=public as $$
declare old_date date;until_date date;
begin
 perform public.payroll089_require_admin();
 if p_kind is null or p_kind not in ('employee','contractor') or p_active is null or p_effective is null or not isfinite(p_effective) then raise exception 'PAYROLL_SETUP_INVALID';end if;
 select effective_from into old_date from finance_payroll_engagements where id=p_target and payee_id=p_payee;
 select greatest(coalesce(min(effective_from) filter(where effective_from>coalesce(old_date,p_effective)),'infinity'::date),
  coalesce(min(effective_from) filter(where effective_from>p_effective),'infinity'::date)) into until_date
  from finance_payroll_engagements where payee_id=p_payee and id<>p_target;
 if exists(
  with proposed as (
   select id,kind,active,effective_from from finance_payroll_engagements where payee_id=p_payee and id<>p_target
   union all select p_target,p_kind,p_active,p_effective
  ), intervals as (
   select *,coalesce(lead(effective_from) over(order by effective_from),'infinity'::date)-1 last_date from proposed
  ) select 1 from intervals a join intervals b on a.id<b.id and a.active and b.active and a.kind<>b.kind
  where greatest(date_trunc('month',a.effective_from),date_trunc('month',b.effective_from),date_trunc('month',least(coalesce(old_date,p_effective),p_effective)))
   <=least(date_trunc('month',a.last_date),date_trunc('month',b.last_date),date_trunc('month',until_date-1))
 ) then raise exception 'PAYROLL_TYPE_MONTH_BOUNDARY_REQUIRED';end if;
end; $$;

create function public.payroll093_correct(p_kind text,p_payee uuid,p_target uuid,p_expected_hash text,p_values jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare req finance_payroll_requests%rowtype;before_state jsonb;old_row jsonb;new_row jsonb;payload jsonb;result jsonb;
 effective date;amount numeric;chosen uuid[];old_context text;
begin
 perform public.payroll089_require_admin();
 if p_kind is null or p_kind not in ('engagement','rate') or p_payee is null or p_target is null or p_request_id is null
  or p_expected_hash is null or p_expected_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_values) is distinct from 'object'
  or octet_length(p_values::text)>10000 or coalesce(p_values->>'effective_from','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or length(btrim(coalesce(p_values->>'reason',''))) not between 1 and 2000
  or exists(select 1 from jsonb_object_keys(p_values) k where k<>all(case p_kind when 'rate' then array['effective_from','monthly_amount','reason'] else array['effective_from','kind','reason'] end))
  then raise exception 'PAYROLL_SETUP_INVALID';end if;
 begin effective:=(p_values->>'effective_from')::date;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'PAYROLL_SETUP_INVALID';end;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 perform pg_advisory_xact_lock(hashtextextended('payroll089',0));
 payload:=jsonb_build_object('kind',p_kind,'payee_id',p_payee,'target',p_target,'expected_hash',p_expected_hash,'values',p_values);
 select * into req from finance_payroll_requests where id=p_request_id;
 if req.id is not null then
  if req.actor_id<>auth.uid() or req.action<>'setup_correct' or req.payload<>payload then raise exception 'PAYROLL_RETRY_CHANGED';end if;
  return req.result;
 end if;
 perform 1 from finance_payees where id=p_payee and profile_id=id and kind='internal' and entity_type='natural_person' for update;
 if not found then raise exception 'PAYROLL_INTERNAL_PERSON_REQUIRED';end if;
 perform 1 from finance_payroll_periods where id in(select period_id from finance_payroll_lines where payee_id=p_payee) order by id for update;
 perform 1 from finance_payroll_lines where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_engagements where payee_id=p_payee order by id for update;
 perform 1 from finance_payroll_rates where payee_id=p_payee order by id for update;
 before_state:=public.payroll092_state(p_payee);
 if encode(sha256(convert_to(before_state::text,'UTF8')),'hex')<>p_expected_hash then raise exception 'PAYROLL_CORRECTION_STALE';end if;
 if p_kind='engagement' then
  select to_jsonb(e) into old_row from finance_payroll_engagements e where id=p_target and payee_id=p_payee;
  if exists(select 1 from finance_payroll_engagements where payee_id=p_payee and id<>p_target and effective_from=effective) then raise exception 'PAYROLL_EFFECTIVE_DATE_COLLISION';end if;
  perform public.payroll093_engagement_check(p_payee,p_target,p_values->>'kind',(old_row->>'active')::boolean,effective);
  new_row:=old_row||jsonb_build_object('kind',p_values->>'kind','effective_from',effective,'reason',p_values->>'reason');
 else
  select to_jsonb(r) into old_row from finance_payroll_rates r where id=p_target and payee_id=p_payee;
  if coalesce(p_values->>'monthly_amount','')!~'^[0-9]{1,12}(\.[0-9]{1,2})?$' then raise exception 'PAYROLL_SETUP_INVALID';end if;
  amount:=(p_values->>'monthly_amount')::numeric;if amount<=0 then raise exception 'PAYROLL_SETUP_INVALID';end if;
  if exists(select 1 from finance_payroll_rates where payee_id=p_payee and id<>p_target and effective_from=effective) then raise exception 'PAYROLL_EFFECTIVE_DATE_COLLISION';end if;
  new_row:=old_row||jsonb_build_object('monthly_amount',amount,'effective_from',effective,'reason',p_values->>'reason');
 end if;
 if old_row is null then raise exception 'PAYROLL_SETUP_INVALID';end if;
 select array_agg(x order by x) into chosen from public.payroll093_affected(p_kind,p_target,effective) x;
 if exists(select 1 from unnest(chosen) x where not public.payroll092_line_safe(x))
  -- Also reject detached snapshot references, rather than relying only on FKs.
  or exists(select 1 from finance_payroll_obligations o where position(p_target::text in o.source_json::text)>0)
  or exists(select 1 from finance_payroll_payments x where position(p_target::text in to_jsonb(x)::text)>0)
  or exists(select 1 from finance_payouts x where x.source_model='payroll_v1' and position(p_target::text in to_jsonb(x)::text)>0)
  or exists(select 1 from finance_cash_transactions x where position(p_target::text in to_jsonb(x)::text)>0)
  then raise exception 'PAYROLL_SETUP_FINALIZED';end if;
 result:=jsonb_build_object('transaction_id',txid_current(),'kind',p_kind,'before',old_row,'after',new_row,
  'invalidated_lines',(select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') from finance_payroll_lines l where id=any(chosen)));
 -- Immutable request supplies an exact old/new, actor- and transaction-bound
 -- trigger permit. No UPDATE/DELETE grant is given to any application role.
 insert into finance_payroll_requests(id,actor_id,action,payload,result) values(p_request_id,auth.uid(),'setup_correct',payload,result);
 old_context:=current_setting('vp.payroll093_request',true);perform set_config('vp.payroll093_request',p_request_id::text,true);
 if p_kind='engagement' then
  update finance_payroll_engagements set kind=p_values->>'kind',effective_from=effective,reason=p_values->>'reason' where id=p_target;
 else
  update finance_payroll_rates set monthly_amount=amount,effective_from=effective,reason=p_values->>'reason' where id=p_target;
 end if;
 -- Only dependent unfinished reviews are invalidated. Preview re-resolves from
 -- the corrected history; tax/SS/amounts require fresh explicit Admin review.
 delete from finance_payroll_lines where id=any(chosen);
 perform set_config('vp.payroll093_request',coalesce(old_context,''),true);
 insert into finance_payroll_audit(request_id,actor_id,action,evidence_json)
  values(p_request_id,auth.uid(),'setup_correct',jsonb_build_object('input',payload,'before',before_state,'result',result));
 return result;
end; $$;

-- PATCH_093_PROTECT: retain the entire 092 guard after the narrow new permit.
-- PATCH_093_MANAGE: retain the 091 manage body; guard effective events before INSERT.

DO $security$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'payroll093_%' loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname='payroll093_correct' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end;$security$;
