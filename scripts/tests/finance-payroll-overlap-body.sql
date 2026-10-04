-- 090: replace only the private source resolver. Existing manage/read/payment RPCs,
-- grants, RLS, review/audit/freeze guards and all stored rows are preserved.
create or replace function public.payroll089_sources(p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare sources jsonb; missing jsonb;
begin
 perform public.payroll089_require_admin();
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'PAYROLL_MONTH_INVALID'; end if;
 with engagements as (
  select e.*,coalesce(lead(effective_from) over(partition by payee_id order by effective_from),'infinity'::date) until_date
  from finance_payroll_engagements e
 ), rates as (
  select r.*,coalesce(lead(effective_from) over(partition by payee_id order by effective_from),'infinity'::date) until_date
  from finance_payroll_rates r
 ), eligible as (
  select e.*,greatest(p_month,e.effective_from) service_from,
   least((p_month+interval '1 month')::date,e.until_date)-1 service_to
  from engagements e where e.active and e.effective_from<(p_month+interval '1 month')::date and e.until_date>p_month
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
 select value into missing from jsonb_array_elements(sources) where value->>'rate_id' is null
  order by value->>'payee_id' COLLATE "C",value->>'service_from' COLLATE "C" limit 1;
 if missing is not null then
  raise exception using message='PAYROLL_RATE_MISSING',detail=jsonb_build_object(
   'payee_id',missing->>'payee_id','month',p_month,'reason','no_rate_overlap',
   'service_from',missing->>'service_from','service_to',missing->>'service_to')::text;
 end if;
 return sources;
end; $$;
