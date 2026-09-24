-- 067 candidate: versioned economic distribution basis and primary workspace.
-- No backfill, new tables, money posting, tax facts or Legacy writes.
create function public.vp_distribution_policy(p_v1 jsonb,p_policy text)
returns jsonb language plpgsql immutable set search_path=public as $fn$
declare lines jsonb; pool numeric;
begin
 if p_policy='vp_distribution_v1' then return p_v1; end if;
 if p_policy is distinct from 'vp_distribution_v2' or p_v1->>'policy_version' is distinct from 'vp_distribution_v1'
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 -- Reuse every v1 source/classification blocker. Only proven professional basis changes.
 select coalesce(jsonb_agg(case when l->>'classification'='professional_fee'
  then jsonb_set(l,'{professional_pool}',l->'base') else l end order by n),'[]') into lines
 from jsonb_array_elements(p_v1->'lines') with ordinality x(l,n);
 select coalesce(sum((l->>'professional_pool')::numeric),0) into pool from jsonb_array_elements(lines) l;
 return jsonb_set(p_v1||jsonb_build_object('policy_version',p_policy,'lines',lines),'{totals,professional_pool}',to_jsonb(pool));
end;
$fn$;

create or replace function public.vp_received_frozen(p_source jsonb)
returns jsonb language sql immutable set search_path=public as $fn$
 select public.vp_distribution_policy(case when p_source ? 'received_money_source'
  then public.vp_direct_frozen_source(p_source->'received_money_source')
  else public.vp_distribution_frozen_source(p_source->'money_source',p_source->'money_allocation') end,p_source->>'policy_version');
$fn$;

create or replace function public.vp_received_source(p_payment_id uuid,p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare a public.finance_direct_money_receipts%rowtype; s jsonb; policy text;
begin
 if (p_payment_id is null)=(p_direct_id is null) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 -- Existing active drafts/reviewed/finalized records retain their original policy.
 -- After explicit supersession, a new revision uses v2. Nothing is revalued in place.
 select source_snapshot_json->>'policy_version' into policy from public.finance_vp_revenue_distributions
 where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded';
 policy:=coalesce(policy,'vp_distribution_v2');
 if p_payment_id is not null then s:=public.vp_distribution_source(p_payment_id);
 else
  select * into a from public.finance_direct_money_receipts where id=p_direct_id;
  if a.id is null then raise exception 'DIRECT_MONEY_MISSING'; end if;
  s:=coalesce(a.confirmed_snapshot_json,public.direct_money_snapshot(a))||jsonb_build_object('status',a.status,'source_version',a.version);
  if a.classification_json is not null then s:=s||jsonb_build_object('lines',a.classification_json->'lines','classification_evidence',a.classification_json); end if;
  s:=s||jsonb_build_object('source_fingerprint',md5(s::text));
  s:=public.vp_direct_frozen_source(s);
 end if;
 return public.vp_distribution_policy(s,policy);
end;
$fn$;

create function public.confirm_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare d public.finance_vp_revenue_distributions%rowtype; prior public.finance_vp_revenue_distributions%rowtype; canonical jsonb; result uuid;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'VP_DISTRIBUTION_ACK_REQUIRED'; end if;
 if (p_expected_id is null)<>(p_expected_version is null) or p_expected_version<1 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 perform public.vp_received_lock(p_payment_id,p_direct_id);
 if p_source is distinct from public.vp_received_source(p_payment_id,p_direct_id) or p_source->'blockers' is distinct from '[]'::jsonb
 then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
 canonical:=public.vp_distribution_choices(p_source,p_choices,true);
 select * into d from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id
  and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded' for update;
 if d.status='finalized' then
  -- Immediate identical retry only; an unrelated/stale confirmation cannot be accepted.
  if d.source_snapshot_json=p_source and d.decisions_json=canonical and d.note=btrim(p_note) and d.finalized_by=auth.uid() then
   if d.version=3 and d.created_by=auth.uid() then
    select * into prior from public.finance_vp_revenue_distributions where id=d.previous_id;
    if (d.revision=1 and p_expected_id is null) or (d.previous_id=p_expected_id and prior.status='superseded' and prior.version=p_expected_version) then return d.id; end if;
   end if;
   if p_expected_id=d.id and exists(select 1 from public.finance_vp_revenue_distribution_audit a where a.distribution_id=d.id
    and (a.evidence_json->>'version')::integer=p_expected_version
    and ((a.evidence_json->>'status'='reviewed' and d.version=p_expected_version+1)
      or (a.evidence_json->>'status'='draft' and d.version in(p_expected_version+2,p_expected_version+3)))) then return d.id; end if;
  end if;
  raise exception 'VP_DISTRIBUTION_STALE';
 end if;
 if d.status='reviewed' then
  if d.id is distinct from p_expected_id or d.version is distinct from p_expected_version or d.decisions_json is distinct from canonical or d.note is distinct from btrim(p_note)
  then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 else
  result:=public.save_finance_vp_received_distribution(p_payment_id,p_direct_id,p_expected_id,p_expected_version,p_source,canonical,p_note);
  select * into d from public.finance_vp_revenue_distributions where id=result;
  perform public.transition_finance_vp_distribution(d.id,d.version,p_source,'review',true,'');
  select * into d from public.finance_vp_revenue_distributions where id=result;
 end if;
 -- Existing trigger materializes rights; no payout, cash or Company Statement event.
 return public.transition_finance_vp_distribution(d.id,d.version,p_source,'finalize',true,'');
end;
$fn$;

create function public.vp_distribution_workspace_row(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare facts jsonb; s jsonb; d public.finance_vp_revenue_distributions%rowtype; client text; account text; matters text; reference text; rights integer; settled integer; document_refs text; receipt_ref text;
begin
 if p_type='payment' then
  select to_jsonb(p) into facts from public.finance_payments p where id=p_id;
  select string_agg(distinct coalesce(nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'')), ' / ')
  into matters from public.finance_payment_effective_invoice_allocations e join public.finance_invoices i on i.id=e.invoice_id
  left join public.cases c on c.id=i.case_id left join public.advisory_matters a on a.id=i.advisory_matter_id where e.payment_id=p_id;
  reference:=coalesce(nullif(facts->>'internal_reference',''),upper(left(p_id::text,8)));
 elsif p_type='direct_money_receipt' then
  select to_jsonb(p) into facts from public.finance_direct_money_receipts p where id=p_id;
  select nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),'') into matters from public.cases c where c.id=nullif(facts->>'case_id','')::bigint;
  if matters is null then select nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'') into matters from public.advisory_matters a where a.id=nullif(facts->>'advisory_matter_id','')::uuid; end if;
  reference:=coalesce(nullif(facts->>'reference_no',''),upper(left(p_id::text,8)));
 else raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if facts is null then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 select string_agg(r.receipt_no,' · ' order by r.receipt_no),min(r.receipt_no) into document_refs,receipt_ref from public.finance_receipts r
 where r.status='issued' and ((p_type='payment' and r.payment_id=p_id) or (p_type='direct_money_receipt' and r.direct_money_receipt_id=p_id));
 document_refs:=concat_ws(' ',document_refs,reference);
 reference:=coalesce(receipt_ref,reference);
 select name into client from public.clients where id=nullif(facts->>'client_id','')::uuid;
 select short_name into account from public.finance_bank_accounts where id=nullif(facts->>'receiving_bank_account_id','')::uuid;
 if account is null then select name_th into account from public.finance_cash_locations where id=nullif(facts->>'receiving_cash_location_id','')::uuid; end if;
 s:=public.vp_received_source(case when p_type='payment' then p_id end,case when p_type='direct_money_receipt' then p_id end);
 select * into d from public.finance_vp_revenue_distributions where payment_id=case when p_type='payment' then p_id end or direct_money_receipt_id=case when p_type='direct_money_receipt' then p_id end
 order by (status<>'superseded') desc,revision desc limit 1;
 select count(*),count(a.id) into rights,settled from public.finance_payable_entitlements e left join public.finance_payout_allocations a on a.entitlement_id=e.id where e.distribution_id=d.id and e.status='open';
 return jsonb_build_object('source_type',p_type,'source_id',p_id,'reference',reference,'received_on',facts->'received_on',
  'document_references',document_refs,'client',coalesce(client,facts->>'payer_name'),'matter',matters,'account',coalesce(account,facts->>'cash_location',facts->>'receiving_account_reference'),
  'currency',facts->'currency','cash',facts->'cash_amount','vat',s#>'{totals,vat}','wht',facts->'wht_amount',
  'gross',coalesce(facts->'gross_amount',facts->'settlement_amount'),'basis',case when s->'blockers'='[]'::jsonb then s#>'{totals,professional_pool}' end,
  'blockers',s->'blockers','policy',s->'policy_version','distribution_id',d.id,'distribution_status',d.status,'rights',rights,'settled',settled,
  'state',case when facts->>'status'<>'confirmed' then 'history' when d.status='finalized' and rights=0 then 'confirmed'
   when d.status='finalized' and settled=rights then 'paid' when d.status='finalized' and settled>0 then 'partial'
   when d.status='finalized' then 'unpaid' else 'pending' end);
end;
$fn$;

create function public.get_finance_revenue_distribution_workspace(p_month date default null,p_source_type text default 'all',p_status text default 'all',p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>200
  or p_source_type is null or p_source_type not in('all','payment','direct_money_receipt')
  or p_status is null or p_status not in('all','pending','unpaid','partial','paid','history')
  or (p_month is not null and extract(day from p_month)<>1) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 with sources as (
  select 'payment'::text kind,p.id,p.received_on from public.finance_payments p where (p.status='confirmed' or exists(select 1 from public.finance_vp_revenue_distributions d where d.payment_id=p.id))
  union all select 'direct_money_receipt',p.id,p.received_on from public.finance_direct_money_receipts p where (p.status='confirmed' or exists(select 1 from public.finance_vp_revenue_distributions d where d.direct_money_receipt_id=p.id))
 ), rows as materialized(select public.vp_distribution_workspace_row(kind,id) r from sources where (p_source_type='all' or kind=p_source_type)
  and (p_month is null or (received_on>=p_month and received_on<p_month+interval '1 month'))),
 searched as(select r from rows where strpos(lower(concat_ws(' ',r->>'reference',r->>'document_references',r->>'client',r->>'matter')),lower(btrim(p_search)))>0),
 filtered as(select r from searched where p_status='all' or r->>'state'=p_status or (p_status='history' and r->>'distribution_id' is not null)),
 page as(select r from filtered order by r->>'received_on' desc,r->>'source_type',r->>'source_id' limit 50 offset p_offset)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(r order by r->>'received_on' desc,r->>'source_type',r->>'source_id'),'[]') from page),
  'count',(select count(*) from filtered),'summary',(select coalesce(jsonb_agg(x),'[]') from (
   select r->>'state' state,r->>'currency' currency,count(*) count,sum((r->>'basis')::numeric) amount,count(*) filter(where r->'basis'='null'::jsonb) unresolved from searched group by 1,2) x),
  'can_manage',public.money_allocation_admin()) into result;
 return result;
end;
$fn$;

create function public.get_finance_revenue_distribution_detail(p_source_type text,p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare context jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_source_type='payment' then context:=public.get_finance_vp_formula_context(p_source_id);
 elsif p_source_type='direct_money_receipt' then context:=public.get_finance_direct_vp_formula_context(p_source_id);
 else raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return context||jsonb_build_object('summary',public.vp_distribution_workspace_row(p_source_type,p_source_id));
end;
$fn$;

-- Explicit privilege contract. Existing two helpers retain their owner and ACL.
alter function public.vp_distribution_policy(jsonb,text) owner to postgres;
alter function public.vp_distribution_workspace_row(text,uuid) owner to postgres;
alter function public.confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean) owner to postgres;
alter function public.get_finance_revenue_distribution_workspace(date,text,text,text,integer) owner to postgres;
alter function public.get_finance_revenue_distribution_detail(text,uuid) owner to postgres;
revoke all on function public.vp_distribution_policy(jsonb,text),public.vp_distribution_workspace_row(text,uuid),
 public.confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean),
 public.get_finance_revenue_distribution_workspace(date,text,text,text,integer),public.get_finance_revenue_distribution_detail(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean),
 public.get_finance_revenue_distribution_workspace(date,text,text,text,integer),public.get_finance_revenue_distribution_detail(text,uuid) to authenticated;

-- Existing service_role access to the invoker vp_received_frozen helper must remain usable.
grant execute on function public.vp_distribution_policy(jsonb,text) to service_role;
