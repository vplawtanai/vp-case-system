BEGIN;
-- Rollback-only schema rehearsal. No business RPC, synthetic business rows or historical materialization.
select set_config('vp.payables048_before',upstream_evidence_hashes::text,true) from (-- ONE SELECT-only statement / ONE row. No application RPC calls.
-- Stop on any failed check. Compare upstream_evidence_hashes before/after apply.
-- No backfill. Existing external/name-only and aggregate-only distributions require separate identity/evidence resolution.
with prerequisite_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','a81c9b3f218f662dd41e5092dc05e0fb',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','71ab2be543407aa3a1610c4882e227fd',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','234e3f2e768a7856af3515ad74076e84',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.vp_distribution_validate()','386dddc7e227fc12d3d0b12faaac3e62',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','240df9ff78400a6ed8aae924f36cbf20',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8',false,'i',false,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.vp_formula_result_guard()','c0e42b906d2a4198ee95ce82ab1cdf5a',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_received_frozen(jsonb)','4a6e39b62924cfb5cc6da2cbe209f96f',false,'i',false,'jsonb','sql',array['p_source']::text[],0,false,'u',false),
('public.vp_received_lock(uuid,uuid)','6ea0cee2f0d2bad0d46263ca6d11c6fd',true,'v',false,'void','plpgsql',array['p_payment_id','p_direct_id']::text[],0,false,'u',false),
('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)','845627702267502da870422c3f9f2b61',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_direct_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false)),
 prerequisite_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from prerequisite_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 prerequisite_differences as(select * from prerequisite_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),
'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_direct_money_receipts r),
'finance_direct_money_receipt_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_direct_money_receipt_audit r)) as hashes),checks(name,passed) as(values
 ('exact_upstream_functions',not exists(select 1 from prerequisite_differences)),
 ('048_namespace_unused',to_regclass('public.finance_payable_entitlement_sources') is null and to_regclass('public.finance_payable_entitlements') is null and to_regclass('public.finance_payable_entitlement_audit') is null
  and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('payable_frozen_components','payable_assert_distribution','payable_materialize','payable_assert_unpaid_contract','payable_distribution_transition','payable_immutable','payable_integrity','ensure_finance_payable_entitlements','get_finance_payable_entitlements'))
  and not exists(select 1 from pg_trigger where tgrelid='public.finance_vp_revenue_distributions'::regclass and tgname like 'payable_%'))
 ) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payable_entitlement_foundation_preflight_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 '[]'::jsonb as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from prerequisite_differences d) as prerequisite_differences,
 '[]'::jsonb as function_differences,
 jsonb_build_object('finalized_distributions',(select count(*) from finance_vp_revenue_distributions where status='finalized'),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ) as observability_only,
 current_setting('server_version_num')::integer as server_version_num) p;
-- BEGIN EMBEDDED MIGRATION 048
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
-- END EMBEDDED MIGRATION 048
-- ONE SELECT-only statement / ONE row. No application RPC calls.
-- Stop on any failed check. Compare upstream_evidence_hashes before/after apply.
-- No backfill. Existing external/name-only and aggregate-only distributions require separate identity/evidence resolution.
with prerequisite_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','a81c9b3f218f662dd41e5092dc05e0fb',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','71ab2be543407aa3a1610c4882e227fd',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','234e3f2e768a7856af3515ad74076e84',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.vp_distribution_validate()','386dddc7e227fc12d3d0b12faaac3e62',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean)','240df9ff78400a6ed8aae924f36cbf20',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb)','db2a144bd77af5c64a72f28cf81fa4f8',false,'i',false,'jsonb','plpgsql',array['p_pool','p_code','p_version','p_definition','p_recipients']::text[],0,false,'u',false),
('public.vp_formula_result_guard()','c0e42b906d2a4198ee95ce82ab1cdf5a',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_received_frozen(jsonb)','4a6e39b62924cfb5cc6da2cbe209f96f',false,'i',false,'jsonb','sql',array['p_source']::text[],0,false,'u',false),
('public.vp_received_lock(uuid,uuid)','6ea0cee2f0d2bad0d46263ca6d11c6fd',true,'v',false,'void','plpgsql',array['p_payment_id','p_direct_id']::text[],0,false,'u',false),
('public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)','845627702267502da870422c3f9f2b61',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_direct_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false)),
 prerequisite_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from prerequisite_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 prerequisite_differences as(select * from prerequisite_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.payable_frozen_components(jsonb)','b18f7e50d059d9cea8813307c0e1195f',false,'i',false,'jsonb','plpgsql',array['d']::text[],0,false,'u',false),
('public.payable_assert_distribution(uuid)','87c336d1c6b8a410facd769731e1de62',true,'v',false,'void','plpgsql',array['p_id']::text[],0,false,'u',false),
('public.payable_materialize(uuid)','32e2aeab47abc6b3e69a94ff20fe9ec2',true,'v',false,'uuid','plpgsql',array['p_id']::text[],0,false,'u',false),
('public.payable_assert_unpaid_contract()','976cbcc3ae09c60c2cd1c71d63ddedd3',true,'s',false,'void','plpgsql',null::text[],0,false,'u',false),
('public.payable_distribution_transition()','a90d017b8412e06a9220e9cfc01c845c',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.payable_immutable()','95e50bf5e5f3c9b74a5fcc6673f10da3',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.payable_integrity()','0b546f81f9d0f45acff78a697abf01bc',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.ensure_finance_payable_entitlements(uuid,integer,boolean)','1b803886f5f74a4295b537aaca5758ac',true,'v',false,'uuid','plpgsql',array['p_distribution_id','p_expected_version','p_acknowledged']::text[],0,false,'u',false),
('public.get_finance_payable_entitlements(text,text,text,text,integer)','d03fc12d9301c4f04cbb35d169d8ba3d',true,'s',false,'jsonb','plpgsql',array['p_search','p_source_type','p_bucket','p_status','p_offset']::text[],5,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),
'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),
'finance_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_items r),
'finance_invoice_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_audit_events r),
'finance_invoice_settlement_summary',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoice_settlement_summary r),
'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),
'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),
'finance_cash_transaction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transaction_audit_events r),
'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),
'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),
'finance_compensation_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_allocations r),
'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),
'finance_receipt_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_invoice_allocations r),
'finance_receipt_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipt_audit_events r),
'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),
'finance_tax_invoice_items',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoice_items r),
'finance_tax_point_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_point_events r),
'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),
'finance_combined_document_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_document_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r),
'finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_vp_revenue_distributions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distributions r),
'finance_vp_revenue_distribution_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_vp_revenue_distribution_audit r),
'finance_direct_money_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_direct_money_receipts r),
'finance_direct_money_receipt_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_direct_money_receipt_audit r)) as hashes),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payable_entitlement_sources','finance_payable_entitlements','finance_payable_entitlement_audit','finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit') order by c.relname),
 expected_catalog as(select value as expected from jsonb_array_elements('[{"name":"finance_payable_entitlement_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_payable_entitlement_audi_distribution_id_event_type_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (distribution_id, event_type)","initially_deferred":false},{"name":"finance_payable_entitlement_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlement_audit_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_payable_entitlement_sources(distribution_id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlement_audit_event_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''materialized''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_payable_entitlement_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payable_entitlement_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"payable_audit_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payable_entitlement_audi_distribution_id_event_type_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlement_audi_distribution_id_event_type_key ON public.finance_payable_entitlement_audit USING btree (distribution_id, event_type)"},{"name":"finance_payable_entitlement_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlement_audit_pkey ON public.finance_payable_entitlement_audit USING btree (id)"}],"policies":[{"name":"payable_audit_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payable_audit_immutable","enabled":"O","definition":"CREATE TRIGGER payable_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_payable_entitlement_audit FOR EACH ROW EXECUTE FUNCTION payable_immutable()"},{"name":"payable_audit_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payable_audit_integrity AFTER INSERT ON public.finance_payable_entitlement_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payable_integrity()"},{"name":"payable_audit_no_truncate","enabled":"O","definition":"CREATE TRIGGER payable_audit_no_truncate BEFORE TRUNCATE ON public.finance_payable_entitlement_audit FOR EACH STATEMENT EXECUTE FUNCTION payable_immutable()"}]},{"name":"finance_payable_entitlement_sources","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"frozen_distribution_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"components_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''open''::text","identity":"","not_null":true,"generated":""},{"name":"materialized_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"materialized_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_payable_entitlement_sour_frozen_distribution_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(frozen_distribution_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payable_entitlement_sources_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status = ''superseded''::text) = (superseded_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_payable_entitlement_sources_components_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(components_json) = ''array''::text))","initially_deferred":false},{"name":"finance_payable_entitlement_sources_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlement_sources_materialized_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (materialized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlement_sources_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (distribution_id)","initially_deferred":false},{"name":"finance_payable_entitlement_sources_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''open''::text, ''superseded''::text])))","initially_deferred":false},{"name":"payable_sources_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payable_entitlement_sources_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlement_sources_pkey ON public.finance_payable_entitlement_sources USING btree (distribution_id)"}],"policies":[{"name":"payable_sources_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payable_sources_immutable","enabled":"O","definition":"CREATE TRIGGER payable_sources_immutable BEFORE DELETE OR UPDATE ON public.finance_payable_entitlement_sources FOR EACH ROW EXECUTE FUNCTION payable_immutable()"},{"name":"payable_sources_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payable_sources_integrity AFTER INSERT OR UPDATE ON public.finance_payable_entitlement_sources DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payable_integrity()"},{"name":"payable_sources_no_truncate","enabled":"O","definition":"CREATE TRIGGER payable_sources_no_truncate BEFORE TRUNCATE ON public.finance_payable_entitlement_sources FOR EACH STATEMENT EXECUTE FUNCTION payable_immutable()"}]},{"name":"finance_payable_entitlements","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_revision","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"distribution_fingerprint","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"received_money_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"source_line_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"component_key","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"component_no","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"formula_code","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"formula_version","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"bucket","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"role_label","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"recipient_name","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"currency","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"gross_amount","type":"numeric(18,2)","default":null,"identity":"","not_null":true,"generated":""},{"name":"finalized_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"status","type":"text","default":"''open''::text","identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":null,"identity":"","not_null":true,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_payable_entitlements_bucket_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((bucket = ANY (ARRAY[''referral''::text, ''work''::text])))","initially_deferred":false},{"name":"finance_payable_entitlements_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status = ''superseded''::text) = (superseded_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_payable_entitlements_component_key_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((component_key ~ ''^[0-9a-f]{32}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_component_no_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((component_no > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_currency_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((currency ~ ''^[A-Z]{3}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_fingerprint_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_fingerprint ~ ''^[0-9a-f]{32}$''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_payable_entitlement_sources(distribution_id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_id_source_line_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (distribution_id, source_line_id, component_key)","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_revision_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_revision > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_distribution_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((distribution_version > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_formula_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((formula_version > 0))","initially_deferred":false},{"name":"finance_payable_entitlements_gross_amount_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((gross_amount > (0)::numeric))","initially_deferred":false},{"name":"finance_payable_entitlements_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_payable_entitlements_recipient_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (recipient_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_payable_entitlements_recipient_name_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((NULLIF(btrim(recipient_name), ''''::text) IS NOT NULL))","initially_deferred":false},{"name":"finance_payable_entitlements_recipient_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((recipient_type = ''user''::text))","initially_deferred":false},{"name":"finance_payable_entitlements_role_label_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((NULLIF(btrim(role_label), ''''::text) IS NOT NULL))","initially_deferred":false},{"name":"finance_payable_entitlements_source_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((source_type = ANY (ARRAY[''payment''::text, ''direct_money_receipt''::text])))","initially_deferred":false},{"name":"finance_payable_entitlements_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''open''::text, ''superseded''::text])))","initially_deferred":false},{"name":"payable_components_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_payable_entitlements_distribution_id_source_line_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlements_distribution_id_source_line_id_key ON public.finance_payable_entitlements USING btree (distribution_id, source_line_id, component_key)"},{"name":"finance_payable_entitlements_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_payable_entitlements_pkey ON public.finance_payable_entitlements USING btree (id)"},{"name":"payable_received_source","ready":true,"valid":true,"definition":"CREATE INDEX payable_received_source ON public.finance_payable_entitlements USING btree (source_type, received_money_id)"},{"name":"payable_recipient_status","ready":true,"valid":true,"definition":"CREATE INDEX payable_recipient_status ON public.finance_payable_entitlements USING btree (recipient_id, currency, status)"}],"policies":[{"name":"payable_components_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payable_components_immutable","enabled":"O","definition":"CREATE TRIGGER payable_components_immutable BEFORE DELETE OR UPDATE ON public.finance_payable_entitlements FOR EACH ROW EXECUTE FUNCTION payable_immutable()"},{"name":"payable_components_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payable_components_integrity AFTER INSERT OR UPDATE ON public.finance_payable_entitlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payable_integrity()"},{"name":"payable_components_no_truncate","enabled":"O","definition":"CREATE TRIGGER payable_components_no_truncate BEFORE TRUNCATE ON public.finance_payable_entitlements FOR EACH STATEMENT EXECUTE FUNCTION payable_immutable()"}]},{"name":"finance_vp_revenue_distribution_audit","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"distribution_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"event_type","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"name":"actor_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"evidence_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""}],"constraints":[{"name":"finance_vp_revenue_distribution_audit_actor_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_distribution_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_event_type_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_evidence_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(evidence_json) = ''object''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_evidence_json_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK (COALESCE(((jsonb_typeof((evidence_json -> ''version''::text)) = ''number''::text) AND (((evidence_json ->> ''version''::text))::numeric >= (1)::numeric) AND (((evidence_json ->> ''version''::text))::numeric = trunc(((evidence_json ->> ''version''::text))::numeric))), false))","initially_deferred":false},{"name":"finance_vp_revenue_distribution_audit_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"vp_distribution_audit_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true}],"indexes":[{"name":"finance_vp_revenue_distribution_audit_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distribution_audit_pkey ON public.finance_vp_revenue_distribution_audit USING btree (id)"},{"name":"vp_distribution_audit_parent","ready":true,"valid":true,"definition":"CREATE INDEX vp_distribution_audit_parent ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, created_at, id)"},{"name":"vp_distribution_audit_version","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_audit_version ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, (((evidence_json ->> ''version''::text))::integer))"}],"policies":[{"name":"vp_distribution_audit_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"vp_distribution_audit_immutable","enabled":"O","definition":"CREATE TRIGGER vp_distribution_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_vp_revenue_distribution_audit FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_distribution_audit_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER vp_distribution_audit_integrity AFTER INSERT ON public.finance_vp_revenue_distribution_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"},{"name":"vp_distribution_audit_no_truncate","enabled":"O","definition":"CREATE TRIGGER vp_distribution_audit_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distribution_audit FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"}]},{"name":"finance_vp_revenue_distributions","kind":"r","rls":true,"force_rls":false,"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"name":"payment_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"money_allocation_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"revision","type":"integer","default":null,"identity":"","not_null":true,"generated":""},{"name":"previous_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"status","type":"text","default":"''draft''::text","identity":"","not_null":true,"generated":""},{"name":"version","type":"integer","default":"1","identity":"","not_null":true,"generated":""},{"name":"source_snapshot_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"decisions_json","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"name":"note","type":"text","default":"''''::text","identity":"","not_null":true,"generated":""},{"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"created_by","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"name":"updated_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""},{"name":"reviewed_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"reviewed_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"finalized_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"finalized_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""},{"name":"superseded_by","type":"uuid","default":null,"identity":"","not_null":false,"generated":""},{"name":"supersede_reason","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"name":"direct_money_receipt_id","type":"uuid","default":null,"identity":"","not_null":false,"generated":""}],"constraints":[{"name":"finance_vp_revenue_distributions_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((revision = 1) = (previous_id IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check1","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((updated_at >= created_at))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check10","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) OR ((finalized_at >= reviewed_at) AND (finalized_at <= updated_at))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check11","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((status = ''superseded''::text) AND (superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (COALESCE(NULLIF(btrim(supersede_reason), ''''::text), ''''::text) <> ''''::text) AND (supersede_reason = btrim(supersede_reason)) AND (superseded_at >= COALESCE(finalized_at, reviewed_at, created_at)) AND (superseded_at <= updated_at)) OR ((status <> ''superseded''::text) AND (superseded_at IS NULL) AND (superseded_by IS NULL) AND (supersede_reason IS NULL))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check2","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check3","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check4","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''draft''::text) OR ((reviewed_at IS NULL) AND (finalized_at IS NULL))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check5","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check6","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''reviewed''::text) OR (finalized_at IS NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check7","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((status <> ''finalized''::text) OR (finalized_at IS NOT NULL)))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check8","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((finalized_at IS NULL) OR ((reviewed_at IS NOT NULL) AND (status = ANY (ARRAY[''finalized''::text, ''superseded''::text])))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_check9","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((reviewed_at IS NULL) OR ((reviewed_at >= created_at) AND (reviewed_at <= updated_at))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_created_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_decisions_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(decisions_json) = ''array''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_direct_money_receipt_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (direct_money_receipt_id) REFERENCES finance_direct_money_receipts(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_finalized_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_money_allocation_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (money_allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_note_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK (((length(note) <= 2000) AND (note = btrim(note))))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_payment_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_payment_id_revision_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (payment_id, revision)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_pkey","type":"p","validated":true,"deferrable":false,"definition":"PRIMARY KEY (id)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_previous_id_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (previous_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_previous_id_key","type":"u","validated":true,"deferrable":false,"definition":"UNIQUE (previous_id)","initially_deferred":false},{"name":"finance_vp_revenue_distributions_reviewed_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_revision_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((revision > 0))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_source_snapshot_json_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_status_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_supersede_reason_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((length(supersede_reason) <= 2000))","initially_deferred":false},{"name":"finance_vp_revenue_distributions_superseded_by_fkey","type":"f","validated":true,"deferrable":false,"definition":"FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT","initially_deferred":false},{"name":"finance_vp_revenue_distributions_version_check","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((version > 0))","initially_deferred":false},{"name":"payable_finalize_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"vp_distribution_integrity","type":"t","validated":true,"deferrable":true,"definition":"TRIGGER DEFERRABLE INITIALLY DEFERRED","initially_deferred":true},{"name":"vp_distribution_source_identity","type":"c","validated":true,"deferrable":false,"definition":"CHECK ((((payment_id IS NOT NULL) AND (direct_money_receipt_id IS NULL)) OR ((payment_id IS NULL) AND (direct_money_receipt_id IS NOT NULL) AND (money_allocation_id IS NULL))))","initially_deferred":false}],"indexes":[{"name":"finance_vp_revenue_distributions_payment_id_revision_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_payment_id_revision_key ON public.finance_vp_revenue_distributions USING btree (payment_id, revision)"},{"name":"finance_vp_revenue_distributions_pkey","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_pkey ON public.finance_vp_revenue_distributions USING btree (id)"},{"name":"finance_vp_revenue_distributions_previous_id_key","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX finance_vp_revenue_distributions_previous_id_key ON public.finance_vp_revenue_distributions USING btree (previous_id)"},{"name":"vp_distribution_current_direct","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_current_direct ON public.finance_vp_revenue_distributions USING btree (direct_money_receipt_id) WHERE (status <> ''superseded''::text)"},{"name":"vp_distribution_current_payment","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_current_payment ON public.finance_vp_revenue_distributions USING btree (payment_id) WHERE (status <> ''superseded''::text)"},{"name":"vp_distribution_direct_revision","ready":true,"valid":true,"definition":"CREATE UNIQUE INDEX vp_distribution_direct_revision ON public.finance_vp_revenue_distributions USING btree (direct_money_receipt_id, revision)"},{"name":"vp_distribution_money_allocation","ready":true,"valid":true,"definition":"CREATE INDEX vp_distribution_money_allocation ON public.finance_vp_revenue_distributions USING btree (money_allocation_id) WHERE (money_allocation_id IS NOT NULL)"}],"policies":[{"name":"vp_distribution_read","check":null,"roles":["authenticated"],"using":"current_user_can_view_finance_payments()","command":"SELECT","permissive":"PERMISSIVE"}],"triggers":[{"name":"payable_distribution_transition","enabled":"O","definition":"CREATE TRIGGER payable_distribution_transition AFTER UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION payable_distribution_transition()"},{"name":"payable_finalize_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER payable_finalize_integrity AFTER UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION payable_integrity()"},{"name":"vp_distribution_immutable","enabled":"O","definition":"CREATE TRIGGER vp_distribution_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_distribution_integrity","enabled":"O","definition":"CREATE CONSTRAINT TRIGGER vp_distribution_integrity AFTER INSERT OR UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"},{"name":"vp_distribution_no_truncate","enabled":"O","definition":"CREATE TRIGGER vp_distribution_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distributions FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"},{"name":"vp_formula_result_guard","enabled":"O","definition":"CREATE TRIGGER vp_formula_result_guard BEFORE INSERT OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_formula_result_guard()"}]}]'::jsonb)),
 catalog_differences as(select e.expected->>'name' as expected_name,a.name as actual_name,e.expected,to_jsonb(a) as actual
  from expected_catalog e full join actual_catalog a on a.name=e.expected->>'name' where e.expected is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_catalog',not exists(select 1 from catalog_differences)),
 ('exact_functions',not exists(select 1 from function_differences)),
 ('upstream_functions_unchanged',not exists(select 1 from prerequisite_differences)),
 ('private_and_rpc_permissions',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_frozen_components(jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_frozen_components(jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_distribution(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_distribution(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_assert_distribution(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_assert_distribution(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_materialize(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_materialize(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_materialize(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_materialize(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_assert_unpaid_contract()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_assert_unpaid_contract()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_distribution_transition()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_distribution_transition()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_integrity()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.payable_integrity()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.payable_integrity()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.payable_integrity()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.ensure_finance_payable_entitlements(uuid,integer,boolean)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.ensure_finance_payable_entitlements(uuid,integer,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.ensure_finance_payable_entitlements(uuid,integer,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.ensure_finance_payable_entitlements(uuid,integer,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_payable_entitlements(text,text,text,text,integer)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('browser_direct_mutation_blocked',(select count(*)=3 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT')
  and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
  and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a where a.grantee=0))
  from pg_class where relnamespace='public'::regnamespace and relname in('finance_payable_entitlement_sources','finance_payable_entitlements','finance_payable_entitlement_audit'))),
 ('new_zero_state',not exists(select 1 from public.finance_payable_entitlement_sources) and not exists(select 1 from public.finance_payable_entitlements) and not exists(select 1 from public.finance_payable_entitlement_audit)),
 ('rehearsal_upstream_unchanged',nullif(current_setting('vp.payables048_before',true),'') is null or current_setting('vp.payables048_before',true)=(select hashes::text from protected))
 ) select (select jsonb_object_agg(name,passed order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payable_entitlement_foundation_verification_pass,
 (select hashes from protected) as upstream_evidence_hashes,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from prerequisite_differences d) as prerequisite_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_differences d) as function_differences,
 jsonb_build_object('finalized_distributions',(select count(*) from finance_vp_revenue_distributions where status='finalized'),
 'legacy_ledger_rows',(select count(*) from finance_company_ledger),'compensation_rows',(select count(*) from finance_compensation_allocations),
 'cash_rows',(select count(*) from finance_cash_transactions),'opening_rows',(select count(*) from finance_account_opening_balances)
 ,'finance_payable_entitlement_sources',(select count(*) from public.finance_payable_entitlement_sources),'finance_payable_entitlements',(select count(*) from public.finance_payable_entitlements),'finance_payable_entitlement_audit',(select count(*) from public.finance_payable_entitlement_audit)) as observability_only,
 current_setting('server_version_num')::integer as server_version_num;
ROLLBACK;
