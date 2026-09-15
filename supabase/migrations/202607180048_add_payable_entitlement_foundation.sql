-- Candidate only. Rights, not payments. No historical materialization in this migration.
create table public.finance_payable_entitlement_sources (
 distribution_id uuid primary key references public.finance_vp_revenue_distributions(id) on delete restrict,
 frozen_distribution_json jsonb not null check (jsonb_typeof(frozen_distribution_json)='object'),
 components_json jsonb not null check (jsonb_typeof(components_json)='array'),
 status text not null default 'open' check (status in ('open','superseded')),
 materialized_at timestamptz not null,
 materialized_by uuid not null references public.user_profiles(id) on delete restrict,
 superseded_at timestamptz,
 check ((status='superseded')=(superseded_at is not null))
);
create table public.finance_payable_entitlements (
 id uuid primary key default gen_random_uuid(),
 distribution_id uuid not null references public.finance_payable_entitlement_sources(distribution_id) on delete restrict,
 distribution_revision integer not null check (distribution_revision>0),
 distribution_version integer not null check (distribution_version>0),
 distribution_fingerprint text not null check (distribution_fingerprint ~ '^[0-9a-f]{32}$'),
 source_type text not null check (source_type in ('payment','direct_money_receipt')),
 received_money_id uuid not null,
 source_line_id uuid not null,
 component_key text not null check (component_key ~ '^[0-9a-f]{32}$'),
 component_no integer not null check (component_no>0),
 formula_code text not null,
 formula_version integer not null check (formula_version>0),
 bucket text not null check (bucket in ('referral','work')),
 role_label text not null check (nullif(btrim(role_label),'') is not null),
 recipient_type text not null check (recipient_type='user'),
 recipient_id uuid not null references public.user_profiles(id) on delete restrict,
 recipient_name text not null check (nullif(btrim(recipient_name),'') is not null),
 currency text not null check (currency ~ '^[A-Z]{3}$'),
 gross_amount numeric(18,2) not null check (gross_amount>0),
 finalized_at timestamptz not null,
 evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
 status text not null default 'open' check (status in ('open','superseded')),
 created_at timestamptz not null,
 superseded_at timestamptz,
 unique(distribution_id,source_line_id,component_key),
 check ((status='superseded')=(superseded_at is not null))
);
create index payable_recipient_status on public.finance_payable_entitlements(recipient_id,currency,status);
create index payable_received_source on public.finance_payable_entitlements(source_type,received_money_id);
create table public.finance_payable_entitlement_audit (
 id uuid primary key default gen_random_uuid(),
 distribution_id uuid not null references public.finance_payable_entitlement_sources(distribution_id) on delete restrict,
 event_type text not null check (event_type in ('materialized','superseded')),
 actor_id uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null,
 evidence_json jsonb not null check (jsonb_typeof(evidence_json)='object'),
 unique(distribution_id,event_type)
);

-- Derive only from frozen evidence. Never consult the live formula catalog or names.
create function public.payable_frozen_components(d jsonb)
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
   if r->>'recipient_kind' is distinct from 'user' or r->>'recipient_user_id' is null
   then raise exception 'PAYABLE_CANONICAL_RECIPIENT_REQUIRED'; end if;
   result:=result||jsonb_build_array(jsonb_build_object(
    'distribution_id',(d->>'id')::uuid,'distribution_revision',(d->>'revision')::integer,
    'distribution_version',(d->>'version')::integer,'distribution_fingerprint',md5(d::text),
    'source_type',source_kind,'received_money_id',source_id,'source_line_id',(c->>line_key)::uuid,
    'component_key',md5(jsonb_build_array(c->>line_key,f->>'formula_code',f->'formula_version',r->'component_no',
      r->>'recipient_kind',r->>'recipient_user_id',r->>'role_label',r->>'bucket')::text),
    'component_no',(r->>'component_no')::integer,'formula_code',f->>'formula_code','formula_version',(f->>'formula_version')::integer,
    'bucket',case r->>'bucket' when 'referral_amount' then 'referral' when 'work_compensation_amount' then 'work' end,
    'role_label',r->>'role_label','recipient_type','user','recipient_id',(r->>'recipient_user_id')::uuid,
    'recipient_name',r->>'recipient_name','currency',currency_code,'gross_amount',(r->>'amount')::numeric,
    'finalized_at',(d->>'finalized_at')::timestamptz,
    'evidence_json',jsonb_build_object('schema_version',1,'line',l,'formula',f,'recipient',r)));
  end loop;
 end loop;
 return coalesce((select jsonb_agg(x order by x->>'source_line_id',x->>'component_key') from jsonb_array_elements(result) x),'[]');
end;
$components$;

create function public.payable_assert_distribution(p_id uuid)
returns void language plpgsql security definer set search_path=public as $assert$
declare s public.finance_payable_entitlement_sources%rowtype; d public.finance_vp_revenue_distributions%rowtype;
 actual jsonb; expected jsonb; evidence jsonb;
begin
 select * into s from public.finance_payable_entitlement_sources where distribution_id=p_id;
 if not found then raise exception 'PAYABLE_MATERIALIZATION_REQUIRED'; end if;
 select * into d from public.finance_vp_revenue_distributions where id=p_id;
 expected:=public.payable_frozen_components(s.frozen_distribution_json);
 if s.components_json is distinct from expected or s.frozen_distribution_json->>'id' is distinct from p_id::text
  or not exists(select 1 from public.finance_vp_revenue_distribution_audit a where a.distribution_id=p_id
   and a.event_type='finalized'
   and to_jsonb(jsonb_populate_record(null::public.finance_vp_revenue_distributions,a.evidence_json))=s.frozen_distribution_json)
  or (d.status='finalized' and s.frozen_distribution_json is distinct from to_jsonb(d))
  or d.status not in ('finalized','superseded')
  or s.status is distinct from (case d.status when 'finalized' then 'open' else 'superseded' end)
  or s.superseded_at is distinct from d.superseded_at
 then raise exception 'PAYABLE_FROZEN_EVIDENCE_INVALID'; end if;
 select coalesce(jsonb_agg(to_jsonb(e)-array['id','status','created_at','superseded_at']
  order by e.source_line_id::text,e.component_key),'[]') into actual from public.finance_payable_entitlements e where distribution_id=p_id;
 if actual is distinct from expected or exists(select 1 from public.finance_payable_entitlements e where distribution_id=p_id
  and (e.status<>s.status or e.superseded_at is distinct from s.superseded_at or e.created_at<>s.materialized_at))
 then raise exception 'PAYABLE_COMPONENT_INTEGRITY'; end if;
 evidence:=jsonb_build_object('distribution',s.frozen_distribution_json,'components',s.components_json);
 if not exists(select 1 from public.finance_payable_entitlement_audit a where distribution_id=p_id and event_type='materialized'
  and evidence_json=evidence and actor_id=s.materialized_by and created_at=s.materialized_at)
  or (s.status='superseded' and not exists(select 1 from public.finance_payable_entitlement_audit a
   where distribution_id=p_id and event_type='superseded' and evidence_json=evidence
    and actor_id=d.superseded_by and created_at=d.superseded_at))
  or (s.status='open' and exists(select 1 from public.finance_payable_entitlement_audit where distribution_id=p_id and event_type='superseded'))
 then raise exception 'PAYABLE_AUDIT_REQUIRED'; end if;
end;
$assert$;

create function public.payable_materialize(p_id uuid)
returns uuid language plpgsql security definer set search_path=public as $materialize$
declare d public.finance_vp_revenue_distributions%rowtype; components jsonb; ts timestamptz:=clock_timestamp();
begin
 select * into d from public.finance_vp_revenue_distributions where id=p_id for update;
 if d.id is null or d.status<>'finalized' then raise exception 'PAYABLE_FINALIZED_REQUIRED'; end if;
 if exists(select 1 from public.finance_payable_entitlement_sources where distribution_id=p_id) then
  perform public.payable_assert_distribution(p_id);
  return p_id;
 end if;
 components:=public.payable_frozen_components(to_jsonb(d));
 insert into public.finance_payable_entitlement_sources(distribution_id,frozen_distribution_json,components_json,materialized_at,materialized_by)
 values(p_id,to_jsonb(d),components,ts,auth.uid());
 insert into public.finance_payable_entitlements(distribution_id,distribution_revision,distribution_version,distribution_fingerprint,
  source_type,received_money_id,source_line_id,component_key,component_no,formula_code,formula_version,bucket,role_label,
  recipient_type,recipient_id,recipient_name,currency,gross_amount,finalized_at,evidence_json,created_at)
 select x.distribution_id,x.distribution_revision,x.distribution_version,x.distribution_fingerprint,x.source_type,x.received_money_id,
  x.source_line_id,x.component_key,x.component_no,x.formula_code,x.formula_version,x.bucket,x.role_label,
  x.recipient_type,x.recipient_id,x.recipient_name,x.currency,x.gross_amount,x.finalized_at,x.evidence_json,ts
 from jsonb_populate_recordset(null::public.finance_payable_entitlements,components) x;
 insert into public.finance_payable_entitlement_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(p_id,'materialized',auth.uid(),ts,jsonb_build_object('distribution',to_jsonb(d),'components',components));
 return p_id;
end;
$materialize$;

-- A future allocation FK must not silently inherit today's unpaid-only invalidation.
-- The payout migration must replace this guard with a coordinated locked settlement check.
create function public.payable_assert_unpaid_contract()
returns void language plpgsql stable security definer set search_path=public as $unpaid$
begin
 if exists(select 1 from pg_constraint where contype='f'
  and confrelid='public.finance_payable_entitlements'::regclass)
 then raise exception 'PAYABLE_PAYOUT_INTEGRATION_REQUIRED'; end if;
end;
$unpaid$;

create function public.payable_distribution_transition()
returns trigger language plpgsql security definer set search_path=public as $transition$
declare s public.finance_payable_entitlement_sources%rowtype;
begin
 if new.status='finalized' and old.status='reviewed' then
  perform public.payable_materialize(new.id);
 elsif new.status='superseded' and old.status='finalized' then
  select * into s from public.finance_payable_entitlement_sources where distribution_id=new.id for update;
  if s.distribution_id is not null then
   perform public.payable_assert_unpaid_contract();
   update public.finance_payable_entitlement_sources set status='superseded',superseded_at=new.superseded_at where distribution_id=new.id;
   update public.finance_payable_entitlements set status='superseded',superseded_at=new.superseded_at where distribution_id=new.id;
   insert into public.finance_payable_entitlement_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
   values(new.id,'superseded',new.superseded_by,new.superseded_at,jsonb_build_object('distribution',s.frozen_distribution_json,'components',s.components_json));
  end if;
 end if;
 return null;
end;
$transition$;
create trigger payable_distribution_transition after update on public.finance_vp_revenue_distributions
 for each row execute function public.payable_distribution_transition();

create function public.payable_immutable()
returns trigger language plpgsql security definer set search_path=public as $immutable$
begin
 if tg_op in ('DELETE','TRUNCATE') or tg_table_name='finance_payable_entitlement_audit'
 then raise exception 'PAYABLE_HISTORY_IMMUTABLE'; end if;
 if old.status<>'open' or new.status<>'superseded'
  or (to_jsonb(new)-array['status','superseded_at']) is distinct from (to_jsonb(old)-array['status','superseded_at'])
 then raise exception 'PAYABLE_HISTORY_IMMUTABLE'; end if;
 return new;
end;
$immutable$;
create function public.payable_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
begin
 if tg_table_name='finance_vp_revenue_distributions' then
  if new.status='finalized' then perform public.payable_assert_distribution(new.id); end if;
 else perform public.payable_assert_distribution(new.distribution_id); end if;
 return null;
end;
$integrity$;
create constraint trigger payable_finalize_integrity after update on public.finance_vp_revenue_distributions
 deferrable initially deferred for each row execute function public.payable_integrity();

create trigger payable_sources_immutable before update or delete on public.finance_payable_entitlement_sources for each row execute function public.payable_immutable();
create trigger payable_sources_no_truncate before truncate on public.finance_payable_entitlement_sources for each statement execute function public.payable_immutable();
create trigger payable_components_immutable before update or delete on public.finance_payable_entitlements for each row execute function public.payable_immutable();
create trigger payable_components_no_truncate before truncate on public.finance_payable_entitlements for each statement execute function public.payable_immutable();
create trigger payable_audit_immutable before update or delete on public.finance_payable_entitlement_audit for each row execute function public.payable_immutable();
create trigger payable_audit_no_truncate before truncate on public.finance_payable_entitlement_audit for each statement execute function public.payable_immutable();
create constraint trigger payable_sources_integrity after insert or update on public.finance_payable_entitlement_sources deferrable initially deferred for each row execute function public.payable_integrity();
create constraint trigger payable_components_integrity after insert or update on public.finance_payable_entitlements deferrable initially deferred for each row execute function public.payable_integrity();
create constraint trigger payable_audit_integrity after insert on public.finance_payable_entitlement_audit deferrable initially deferred for each row execute function public.payable_integrity();

create function public.ensure_finance_payable_entitlements(p_distribution_id uuid,p_expected_version integer,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $ensure$
declare d public.finance_vp_revenue_distributions%rowtype;
begin
 if not public.money_allocation_admin() then raise exception 'PAYABLE_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'PAYABLE_ACK_REQUIRED'; end if;
 select * into d from public.finance_vp_revenue_distributions where id=p_distribution_id;
 if d.id is null then raise exception 'PAYABLE_FINALIZED_REQUIRED'; end if;
 -- Same source-first lock order as the existing finalize/supersede lifecycle.
 perform public.vp_received_lock(d.payment_id,d.direct_money_receipt_id);
 select * into d from public.finance_vp_revenue_distributions where id=p_distribution_id for update;
 if d.version is distinct from p_expected_version then raise exception 'PAYABLE_SOURCE_CHANGED'; end if;
 return public.payable_materialize(p_distribution_id);
end;
$ensure$;

-- Page complete recipient/currency groups, never incomplete component totals.
create function public.get_finance_payable_entitlements(p_search text default '',p_source_type text default 'all',p_bucket text default 'all',p_status text default 'open',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $list$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'PAYABLE_PERMISSION_DENIED'; end if;
 if p_search is null or length(p_search)>200 or p_source_type is null or p_source_type not in ('all','payment','direct_money_receipt')
  or p_bucket is null or p_bucket not in ('all','referral','work') or p_status is null or p_status not in ('all','open','superseded')
  or p_offset is null or p_offset<0 then raise exception 'PAYABLE_FILTER_INVALID'; end if;
 with filtered as(select e.* from public.finance_payable_entitlements e
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

alter table public.finance_payable_entitlement_sources enable row level security;
alter table public.finance_payable_entitlements enable row level security;
alter table public.finance_payable_entitlement_audit enable row level security;
create policy payable_sources_read on public.finance_payable_entitlement_sources for select to authenticated using(public.current_user_can_view_finance_payments());
create policy payable_components_read on public.finance_payable_entitlements for select to authenticated using(public.current_user_can_view_finance_payments());
create policy payable_audit_read on public.finance_payable_entitlement_audit for select to authenticated using(public.current_user_can_view_finance_payments());
revoke all on public.finance_payable_entitlement_sources,public.finance_payable_entitlements,public.finance_payable_entitlement_audit from public,anon,authenticated;
grant select on public.finance_payable_entitlement_sources,public.finance_payable_entitlements,public.finance_payable_entitlement_audit to authenticated;
revoke all on function public.payable_frozen_components(jsonb),public.payable_assert_distribution(uuid),public.payable_materialize(uuid),
 public.payable_assert_unpaid_contract(),public.payable_distribution_transition(),public.payable_immutable(),public.payable_integrity() from public,anon,authenticated;
revoke all on function public.ensure_finance_payable_entitlements(uuid,integer,boolean) from public,anon;
grant execute on function public.ensure_finance_payable_entitlements(uuid,integer,boolean) to authenticated;
revoke all on function public.get_finance_payable_entitlements(text,text,text,text,integer) from public,anon;
grant execute on function public.get_finance_payable_entitlements(text,text,text,text,integer) to authenticated;
