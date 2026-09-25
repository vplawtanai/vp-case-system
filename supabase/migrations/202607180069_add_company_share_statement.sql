-- Phase 3: read-only economic Company Share projection. No posting/backfill.
-- Frozen professional choices only; never company_economic/company_cash routing.
create function public.company_statement_frozen_share(p_source jsonb,p_choices jsonb)
returns jsonb language plpgsql immutable set search_path=public as $fn$
declare l jsonb; c jsonb; f jsonb; amount numeric:=0; basis numeric:=0; part numeric; pool numeric; seen text[]:='{}'; key text; components numeric;
begin
 if coalesce(p_source->>'policy_version','') not in ('vp_distribution_v1','vp_distribution_v2')
   or p_source->'blockers' is distinct from '[]'::jsonb
   or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then return null; end if;
 if jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee') then return null; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' loop
  key:=coalesce(l->>'source_line_id',l->>'invoice_item_id');
  if key is null or key=any(seen) then return null; end if; seen:=array_append(seen,key);
  if (select count(*) from jsonb_array_elements(p_choices) x where coalesce(x->>'source_line_id',x->>'invoice_item_id')=key)<>1 then return null; end if;
  select value into c from jsonb_array_elements(p_choices) x where coalesce(x->>'source_line_id',x->>'invoice_item_id')=key;
  if jsonb_typeof(c->'company_share_amount') is distinct from 'number' or jsonb_typeof(l->'professional_pool') is distinct from 'number' then return null; end if;
  part:=(c->>'company_share_amount')::numeric; pool:=(l->>'professional_pool')::numeric;
  if part<0 or pool<0 or part>pool or round(part,2)<>part or round(pool,2)<>pool then return null; end if;
  if jsonb_typeof(c->'referral_amount') is distinct from 'number' or jsonb_typeof(c->'work_compensation_amount') is distinct from 'number'
   or (c->>'referral_amount')::numeric<0 or (c->>'work_compensation_amount')::numeric<0
   or part+(c->>'referral_amount')::numeric+(c->>'work_compensation_amount')::numeric<>pool then return null; end if;
  -- Pre-046 v1 amount choices remain authoritative. Later formula evidence, when
  -- present, must agree exactly; we do not recalculate any historical formula.
  f:=nullif(c->'formula_result','null'::jsonb);
  if f is null and p_source->>'policy_version'='vp_distribution_v2' then return null; end if;
  if f is not null then
   if f->'company_share_amount' is distinct from c->'company_share_amount'
    or f->'pool' is distinct from l->'professional_pool'
    or jsonb_typeof(f->'recipients') is distinct from 'array' then return null; end if;
   if exists(select 1 from jsonb_array_elements(f->'recipients') r where (r->>'recipient_kind'='company') is distinct from (r->>'bucket'='company_share_amount')) then return null; end if;
   if exists(select 1 from jsonb_array_elements(f->'recipients') r where jsonb_typeof(r->'amount') is distinct from 'number' or (r->>'amount')::numeric<0 or round((r->>'amount')::numeric,2)<>(r->>'amount')::numeric) then return null; end if;
   select coalesce(sum((r->>'amount')::numeric),0) into components from jsonb_array_elements(f->'recipients') r where r->>'recipient_kind'='company';
   if components<>part then return null; end if;
  end if;
  amount:=amount+part; basis:=basis+pool;
 end loop;
 return jsonb_build_object('amount',amount,'basis',basis);
end;
$fn$;

create function public.get_finance_company_statement(p_month date default null,p_source_type text default 'all',p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'COMPANY_STATEMENT_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or p_source_type is null or p_source_type not in ('all','payment','direct_money_receipt')
  or p_search is null or length(p_search)>200 or (p_month is not null and extract(day from p_month)<>1) then raise exception 'COMPANY_STATEMENT_FILTER_INVALID'; end if;
 with sources as (
  select 'payment'::text kind,p.id,to_jsonb(p) facts from public.finance_payments p where p.status='confirmed'
  union all select 'direct_money_receipt',p.id,to_jsonb(p) from public.finance_direct_money_receipts p where p.status='confirmed'
 ), projected as materialized (
  select d.id distribution_id,d.revision,d.finalized_at,d.source_snapshot_json->>'policy_version' policy,s.kind source_type,s.id source_id,
   (s.facts->>'received_on')::date received_on,s.facts->>'currency' currency,
   public.company_statement_frozen_share(d.source_snapshot_json,d.decisions_json) share,
   coalesce(receipts.reference,nullif(s.facts->>'internal_reference',''),nullif(s.facts->>'reference_no','')) reference,
   coalesce(cl.name,s.facts->>'payer_name') client,
   receipts.references document_references,
   case when s.kind='payment' then (
    select string_agg(distinct coalesce(nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'')),' / ')
    from public.finance_payment_effective_invoice_allocations e join public.finance_invoices i on i.id=e.invoice_id
    left join public.cases c on c.id=i.case_id left join public.advisory_matters a on a.id=i.advisory_matter_id where e.payment_id=s.id
   ) else coalesce((select nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),'') from public.cases c where c.id=nullif(s.facts->>'case_id','')::bigint),
    (select nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'') from public.advisory_matters a where a.id=nullif(s.facts->>'advisory_matter_id','')::uuid)) end matter
  from public.finance_vp_revenue_distributions d join sources s on (s.kind='payment' and d.payment_id=s.id) or (s.kind='direct_money_receipt' and d.direct_money_receipt_id=s.id)
  left join public.clients cl on cl.id=nullif(s.facts->>'client_id','')::uuid
  left join lateral (select min(r.receipt_no) reference,string_agg(r.receipt_no,' · ' order by r.receipt_no) references from public.finance_receipts r where r.status='issued' and ((s.kind='payment' and r.payment_id=s.id) or (s.kind='direct_money_receipt' and r.direct_money_receipt_id=s.id))) receipts on true
  where d.status='finalized' and d.finalized_at is not null
   -- Existing partial unique source indexes enforce one active revision.
   and not exists(select 1 from public.finance_vp_revenue_distributions newer where newer.status<>'superseded' and newer.revision>d.revision and ((d.payment_id is not null and newer.payment_id=d.payment_id) or (d.direct_money_receipt_id is not null and newer.direct_money_receipt_id=d.direct_money_receipt_id)))
 ), filtered as materialized (
  select * from projected where (p_month is null or (received_on>=p_month and received_on<p_month+interval '1 month'))
   and (p_source_type='all' or source_type=p_source_type)
   and (btrim(p_search)='' or strpos(lower(concat_ws(' ',reference,document_references,client,matter)),lower(btrim(p_search)))>0)
 ), proven as (select * from filtered where share is not null and (share->>'amount')::numeric>0),
 page as (select * from proven order by received_on desc,source_type,source_id limit 50 offset p_offset)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p)-'share'||p.share order by received_on desc,source_type,source_id),'[]') from page p),
  'count',(select count(*) from proven),'excluded_count',(select count(*) from filtered where share is null),
  'totals',(select coalesce(jsonb_agg(to_jsonb(t) order by currency),'[]') from (select currency,sum((share->>'amount')::numeric) amount from proven group by currency) t)) into result;
 return result;
end;
$fn$;

alter function public.company_statement_frozen_share(jsonb,jsonb) owner to postgres;
alter function public.get_finance_company_statement(date,text,text,integer) owner to postgres;
revoke all on function public.company_statement_frozen_share(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_finance_company_statement(date,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.company_statement_frozen_share(jsonb,jsonb) to service_role;
grant execute on function public.get_finance_company_statement(date,text,text,integer) to authenticated,service_role;
