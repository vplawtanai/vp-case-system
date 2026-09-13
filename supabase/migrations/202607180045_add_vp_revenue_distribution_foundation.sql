-- CANDIDATE 045. VP policy evidence downstream of 044; no posting or backfill.
-- Human preflight/apply/verification required. Never mutates Payment or 044 rows.
do $preflight$
begin
 if to_regprocedure('public.money_allocation_source(uuid)') is null
   or to_regprocedure('public.money_allocation_admin()') is null
   or to_regprocedure('public.money_allocation_lock(uuid)') is null
   or to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)') is null
   or to_regprocedure('public.current_user_can_view_finance_payments()') is null
   or to_regclass('public.finance_payment_money_allocations') is null
 then raise exception 'VP_DISTRIBUTION_PREDECESSOR_MISSING'; end if;
 if to_regclass('public.finance_vp_revenue_distributions') is not null
   or to_regclass('public.finance_vp_revenue_distribution_audit') is not null
 then raise exception 'VP_DISTRIBUTION_COMPETING_DOMAIN'; end if;
end;
$preflight$;

create table public.finance_vp_revenue_distributions (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null references public.finance_payments(id) on delete restrict,
 money_allocation_id uuid references public.finance_payment_money_allocations(id) on delete restrict,
 revision integer not null check(revision>0),
 previous_id uuid unique references public.finance_vp_revenue_distributions(id) on delete restrict,
 status text not null default 'draft' check(status in ('draft','reviewed','finalized','superseded')),
 version integer not null default 1 check(version>0),
 source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
 decisions_json jsonb not null check(jsonb_typeof(decisions_json)='array'),
 note text not null default '' check(length(note)<=2000 and note=btrim(note)),
 created_at timestamptz not null default now(),
 created_by uuid not null references public.user_profiles(id) on delete restrict,
 updated_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.user_profiles(id) on delete restrict,
 finalized_at timestamptz,
 finalized_by uuid references public.user_profiles(id) on delete restrict,
 superseded_at timestamptz,
 superseded_by uuid references public.user_profiles(id) on delete restrict,
 supersede_reason text check(length(supersede_reason)<=2000),
 unique(payment_id,revision),
 check((revision=1)=(previous_id is null)),
 check(updated_at>=created_at),
 check((reviewed_at is null)=(reviewed_by is null)),
 check((finalized_at is null)=(finalized_by is null)),
 check(status<>'draft' or (reviewed_at is null and finalized_at is null)),
 check(status not in ('reviewed','finalized') or reviewed_at is not null),
 check(status<>'reviewed' or finalized_at is null),
 check(status<>'finalized' or finalized_at is not null),
 check(finalized_at is null or (reviewed_at is not null and status in ('finalized','superseded'))),
 check(reviewed_at is null or (reviewed_at>=created_at and reviewed_at<=updated_at)),
 check(finalized_at is null or (finalized_at>=reviewed_at and finalized_at<=updated_at)),
 check((status='superseded' and superseded_at is not null and superseded_by is not null
     and coalesce(nullif(btrim(supersede_reason),''),'')<>'' and supersede_reason=btrim(supersede_reason)
     and superseded_at>=coalesce(finalized_at,reviewed_at,created_at) and superseded_at<=updated_at)
   or (status<>'superseded' and superseded_at is null and superseded_by is null and supersede_reason is null))
);
create unique index vp_distribution_current_payment on public.finance_vp_revenue_distributions(payment_id) where status<>'superseded';
create index vp_distribution_money_allocation on public.finance_vp_revenue_distributions(money_allocation_id) where money_allocation_id is not null;

create table public.finance_vp_revenue_distribution_audit (
 id uuid primary key default gen_random_uuid(),
 distribution_id uuid not null references public.finance_vp_revenue_distributions(id) on delete restrict,
 event_type text not null check(event_type in ('created','saved','reviewed','finalized','superseded')),
 actor_id uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 check(coalesce(jsonb_typeof(evidence_json->'version')='number'
   and (evidence_json->>'version')::numeric>=1
   and (evidence_json->>'version')::numeric=trunc((evidence_json->>'version')::numeric),false))
);
create index vp_distribution_audit_parent on public.finance_vp_revenue_distribution_audit(distribution_id,created_at,id);
create unique index vp_distribution_audit_version on public.finance_vp_revenue_distribution_audit(distribution_id,((evidence_json->>'version')::integer));

-- Pure policy projection also verifies frozen historical snapshots at commit.
-- No descriptions, live Charges, percentages, currency defaults or tax guesses.
create function public.vp_distribution_frozen_source(p_money_source jsonb,p_money_allocation jsonb)
returns jsonb language plpgsql immutable set search_path=public as $source$
declare s jsonb:=p_money_source; a jsonb:=nullif(p_money_allocation,'null'::jsonb);
 l jsonb; item jsonb; ready jsonb; commercial jsonb; invoice_header jsonb; classification text; k text;
 lines jsonb:='[]'; blockers jsonb:='[]'; valid boolean; amount numeric;
 cash numeric; wht numeric; vat numeric; base numeric; pool numeric; economic numeric; company_cash numeric;
 total_pool numeric:=0; total_economic numeric:=0; total_company_cash numeric:=0;
 line_cash numeric:=0; line_wht numeric:=0; line_vat numeric:=0; line_base numeric:=0;
begin
 if jsonb_typeof(s) is distinct from 'object' then
  return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1',
   'money_source',s,'money_allocation',a,'lines','[]'::jsonb,
   'totals',jsonb_build_object('cash',null,'wht',null,'vat',null,'base',null,
     'professional_pool',null,'company_economic',null,'company_cash',null),
   'blockers',jsonb_build_array('money_source_unavailable'));
 end if;
 if jsonb_typeof(s->'blockers')='array' then blockers:=s->'blockers';
 else blockers:=jsonb_build_array('money_source_invalid'); end if;
 begin
  if s->'schema_version' is distinct from '1'::jsonb
    or jsonb_typeof(s->'payment') is distinct from 'object'
    or jsonb_typeof(s#>'{payment,currency}') is distinct from 'string'
    or nullif(btrim(s#>>'{payment,currency}'),'') is null
    or jsonb_typeof(s#>'{payment,id}') is distinct from 'string'
    or nullif(s#>>'{payment,id}','') is null
    or jsonb_typeof(s->'lines') is distinct from 'array'
    or jsonb_typeof(s->'invoices') is distinct from 'array'
  then raise exception 'INVALID'; end if;
  perform (s#>>'{payment,id}')::uuid;
  for k in select unnest(array['cash','wht','settlement']) loop
   if jsonb_typeof(s->'payment'->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->'payment'->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  for k in select unnest(array['proven_base','proven_vat','unallocated_settlement']) loop
   if jsonb_typeof(s->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  cash:=(s#>>'{payment,cash}')::numeric; wht:=(s#>>'{payment,wht}')::numeric;
  base:=(s->>'proven_base')::numeric; vat:=(s->>'proven_vat')::numeric;
  if cash+wht is distinct from (s#>>'{payment,settlement}')::numeric
    or (s->>'unallocated_settlement')::numeric<>0 then blockers:=blockers||jsonb_build_array('settlement_evidence_invalid'); end if;
 exception when others then
  blockers:=blockers||jsonb_build_array('money_source_invalid');
  cash:=null; wht:=null; base:=null; vat:=null;
 end;
 if s#>>'{payment,status}' is distinct from 'confirmed' then blockers:=blockers||jsonb_build_array('payment_not_confirmed'); end if;
 if a is not null then
  if jsonb_typeof(a) is distinct from 'object'
    or a->>'payment_id' is distinct from s#>>'{payment,id}'
    or coalesce(a->>'status','') not in ('draft','reviewed','finalized')
    or a->'source_snapshot_json' is distinct from s
  then blockers:=blockers||jsonb_build_array('money_allocation_stale'); end if;
  begin
   if public.money_allocation_decisions(s,a->'decisions_json',false) is distinct from a->'decisions_json'
   then raise exception 'INVALID'; end if;
   if exists(select 1 from jsonb_array_elements(a->'decisions_json') x
     where coalesce(x->>'category','') not in ('company_revenue','unallocated'))
   then blockers:=blockers||jsonb_build_array('money_allocation_conflict'); end if;
  exception when others then blockers:=blockers||jsonb_build_array('money_allocation_invalid'); end;
 end if;
 for l in select value from jsonb_array_elements(case when jsonb_typeof(s->'lines')='array' then s->'lines' else '[]'::jsonb end) loop
  item:=l->'source_item'; ready:=item#>'{source_snapshot_json,ready_snapshot}'; commercial:=ready->'commercial';
  classification:=ready#>>'{economic,classification}'; valid:=true;
  pool:=0; economic:=0; company_cash:=0;
  if classification is null or classification not in ('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
  then blockers:=blockers||jsonb_build_array('classification_unsupported'); valid:=false; end if;
  begin
   if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(item) is distinct from 'object'
     or item->>'id' is distinct from l->>'invoice_item_id'
     or item->>'invoice_id' is distinct from l->>'invoice_id'
     or item->>'source_state' is distinct from 'active'
   then raise exception 'INVALID'; end if;
   if nullif(l->>'invoice_item_id','') is null or nullif(l->>'invoice_id','') is null then raise exception 'INVALID'; end if;
   perform (l->>'invoice_item_id')::uuid; perform (l->>'invoice_id')::uuid;
   if (select count(*) from jsonb_array_elements(s->'invoices') inv where inv->>'invoice_id'=l->>'invoice_id')<>1
   then raise exception 'INVALID'; end if;
   select inv#>'{issued_snapshot,invoice}' into invoice_header from jsonb_array_elements(s->'invoices') inv
    where inv->>'invoice_id'=l->>'invoice_id';
   if invoice_header->>'id' is distinct from l->>'invoice_id'
     or jsonb_typeof(invoice_header->'client_id') is distinct from 'string'
     or nullif(invoice_header->>'client_id','') is null
     or ready#>>'{charge,client_id}' is distinct from invoice_header->>'client_id'
   then raise exception 'INVALID'; end if;
   perform (invoice_header->>'client_id')::uuid;
   for k in select unnest(array['cash','wht','vat','base','settlement']) loop
    if jsonb_typeof(l->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(l->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   if (l->>'base')::numeric<=0
     or (l->>'base')::numeric+(l->>'vat')::numeric is distinct from (l->>'settlement')::numeric
     or (l->>'cash')::numeric+(l->>'wht')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
   line_cash:=line_cash+(l->>'cash')::numeric; line_wht:=line_wht+(l->>'wht')::numeric;
   line_base:=line_base+(l->>'base')::numeric; line_vat:=line_vat+(l->>'vat')::numeric;
   if (l->>'base')::numeric-(l->>'wht')::numeric<0 then
    blockers:=blockers||jsonb_build_array('base_less_than_wht'); valid:=false;
   end if;
   if jsonb_typeof(ready) is distinct from 'object' or ready->'schema_version' is distinct from '1'::jsonb
     or item#>'{source_snapshot_json,schema_version}' is distinct from '2'::jsonb
     or jsonb_typeof(item->'source_billable_charge_id') is distinct from 'string'
     or nullif(item->>'source_billable_charge_id','') is null
     or ready#>>'{charge,id}' is distinct from item->>'source_billable_charge_id'
     or item#>>'{source_snapshot_json,billable_charge_id}' is distinct from item->>'source_billable_charge_id'
     or ready#>>'{charge,status}' is distinct from 'ready_to_invoice'
     or jsonb_typeof(commercial) is distinct from 'object'
     or jsonb_typeof(commercial->'currency') is distinct from 'string'
     or nullif(btrim(commercial->>'currency'),'') is null
     or commercial->>'currency' is distinct from s#>>'{payment,currency}'
   then raise exception 'INVALID'; end if;
   perform (item->>'source_billable_charge_id')::uuid;
   for k in select unnest(array['amount_before_vat','vat_amount','total_amount']) loop
    if jsonb_typeof(commercial->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(commercial->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   for k in select unnest(array['amount_before_vat','vat_amount','line_total']) loop
    if jsonb_typeof(item->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   end loop;
   if (commercial->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (commercial->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (commercial->>'total_amount')::numeric is distinct from (l->>'settlement')::numeric
     or (item->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (item->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (item->>'line_total')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
  exception when others then blockers:=blockers||jsonb_build_array('frozen_economic_evidence_invalid'); valid:=false;
  end;
  if valid then
   if classification='professional_fee' then pool:=(l->>'base')::numeric-(l->>'wht')::numeric;
   else economic:=(l->>'base')::numeric; company_cash:=economic-(l->>'wht')::numeric; end if;
  end if;
  total_pool:=total_pool+pool; total_economic:=total_economic+economic; total_company_cash:=total_company_cash+company_cash;
  lines:=lines||jsonb_build_array(l||jsonb_build_object('classification',classification,'professional_pool',pool,
    'company_economic',economic,'company_cash',company_cash));
 end loop;
 if jsonb_array_length(lines)=0 then blockers:=blockers||jsonb_build_array('frozen_lines_missing'); end if;
 if (select count(distinct x->>'invoice_item_id') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines)
 then blockers:=blockers||jsonb_build_array('frozen_lines_invalid'); end if;
 if line_cash is distinct from cash or line_wht is distinct from wht or line_base is distinct from base or line_vat is distinct from vat
   or cash is distinct from total_company_cash+total_pool+vat
 then blockers:=blockers||jsonb_build_array('cash_reconciliation_invalid'); end if;
 return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1','money_source',s,'money_allocation',a,
  'lines',lines,'totals',jsonb_build_object('cash',cash,'wht',wht,'vat',vat,'base',base,
    'professional_pool',total_pool,'company_economic',total_economic,'company_cash',total_company_cash),
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$source$;

create function public.vp_distribution_source(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare s jsonb; result jsonb; a public.finance_payment_money_allocations%rowtype; p public.finance_payments%rowtype;
begin
 select * into p from public.finance_payments where id=p_payment_id;
 if p.id is null then raise exception 'VP_DISTRIBUTION_PAYMENT_MISSING'; end if;
 select * into a from public.finance_payment_money_allocations where payment_id=p_payment_id and status<>'superseded';
 begin s:=public.money_allocation_source(p_payment_id);
 exception when others then s:=null; end;
 result:=public.vp_distribution_frozen_source(s,case when a.id is null then null else to_jsonb(a) end);
 -- Preserve 044's full source; this additional client proof belongs only to 045.
 if s is not null and (p.client_id is null or jsonb_typeof(s->'invoices') is distinct from 'array'
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(s->'invoices')='array' then s->'invoices' else '[]'::jsonb end) inv
     where inv#>>'{issued_snapshot,invoice,client_id}' is distinct from p.client_id::text)) then
  result:=jsonb_set(result,'{blockers}',(select jsonb_agg(distinct value order by value)
    from jsonb_array_elements((result->'blockers')||jsonb_build_array('invoice_client_evidence_invalid'))));
 end if;
 return result;
end;
$source$;

create function public.vp_distribution_choices(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare l jsonb; c jsonb; k text; amount numeric; total numeric; pool numeric; result jsonb:='[]';
begin
 if p_complete is null or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x) is distinct from 'object')
   or jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee')
 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' order by value->>'invoice_item_id' loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'invoice_item_id'=l->>'invoice_item_id')<>1
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=l->>'invoice_item_id';
  if jsonb_typeof(c->'invoice_item_id') is distinct from 'string'
    or exists(select 1 from jsonb_object_keys(c) as keys(key) where keys.key not in ('invoice_item_id','referral_amount','company_share_amount','work_compensation_amount'))
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  total:=0;
  for k in select unnest(array['referral_amount','company_share_amount','work_compensation_amount']) loop
   if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   amount:=(c->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   total:=total+amount;
  end loop;
  if jsonb_typeof(l->'professional_pool') is distinct from 'number' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  pool:=(l->>'professional_pool')::numeric;
  if pool<0 or pool<>round(pool,2) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  if total>pool then raise exception 'VP_DISTRIBUTION_POOL_EXCEEDED'; end if;
  if p_complete and total<>pool then raise exception 'VP_DISTRIBUTION_REVIEW_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('invoice_item_id',l->>'invoice_item_id',
   'referral_amount',(c->>'referral_amount')::numeric,'company_share_amount',(c->>'company_share_amount')::numeric,
   'work_compensation_amount',(c->>'work_compensation_amount')::numeric));
 end loop;
 return result;
end;
$choices$;

create function public.vp_distribution_immutable()
returns trigger language plpgsql security definer set search_path=public as $immutable$
declare s jsonb;
begin
 if tg_op in ('DELETE','TRUNCATE') or tg_table_name='finance_vp_revenue_distribution_audit'
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.version<>1 then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
  perform public.money_allocation_lock(new.payment_id);
  s:=public.vp_distribution_source(new.payment_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  return new;
 end if;
 if old.status='superseded' or new.id<>old.id or new.payment_id<>old.payment_id or new.revision<>old.revision
   or new.previous_id is distinct from old.previous_id or new.created_at<>old.created_at or new.created_by<>old.created_by
   or new.version<>old.version+1 or new.updated_at<old.updated_at
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not ((old.status='draft' and new.status in ('draft','reviewed','superseded'))
   or (old.status='reviewed' and new.status in ('finalized','superseded'))
   or (old.status='finalized' and new.status='superseded')) then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if (old.status<>'draft' or new.status<>'draft') and (new.source_snapshot_json is distinct from old.source_snapshot_json
   or new.money_allocation_id is distinct from old.money_allocation_id or new.decisions_json is distinct from old.decisions_json or new.note<>old.note)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='draft' and new.status='reviewed') and (new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='reviewed' and new.status='finalized') and (new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.money_allocation_lock(new.payment_id);
 if new.status<>'superseded' then
  s:=public.vp_distribution_source(new.payment_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 end if;
 return new;
end;
$immutable$;
create trigger vp_distribution_immutable before insert or update or delete on public.finance_vp_revenue_distributions for each row execute function public.vp_distribution_immutable();
create trigger vp_distribution_audit_immutable before update or delete on public.finance_vp_revenue_distribution_audit for each row execute function public.vp_distribution_immutable();
create trigger vp_distribution_no_truncate before truncate on public.finance_vp_revenue_distributions for each statement execute function public.vp_distribution_immutable();
create trigger vp_distribution_audit_no_truncate before truncate on public.finance_vp_revenue_distribution_audit for each statement execute function public.vp_distribution_immutable();

create function public.save_finance_vp_distribution(p_payment_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.finance_vp_revenue_distributions%rowtype; prev public.finance_vp_revenue_distributions%rowtype;
 s jsonb; c jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if (p_expected_id is null)<>(p_expected_version is null) or (p_expected_version is not null and p_expected_version<1)
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 perform public.money_allocation_lock(p_payment_id); s:=public.vp_distribution_source(p_payment_id);
 if s is distinct from p_source then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
 if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_note is null or length(p_note)>2000 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 c:=public.vp_distribution_choices(s,p_choices,false);
 select * into a from public.finance_vp_revenue_distributions where payment_id=p_payment_id and status<>'superseded' for update;
 if a.id is null then
  select * into prev from public.finance_vp_revenue_distributions where payment_id=p_payment_id order by revision desc limit 1;
 elsif a.previous_id is not null then
  select * into prev from public.finance_vp_revenue_distributions where id=a.previous_id;
 end if;
 -- Only an identical current operation or its immediate retry is idempotent.
 if a.id is not null and a.status='draft' and a.source_snapshot_json=s and a.decisions_json=c and a.note=btrim(p_note)
   and ((p_expected_id=a.id and p_expected_version in (a.version,a.version-1))
     or (a.version=1 and a.created_by=auth.uid() and (
       (a.revision=1 and a.previous_id is null and p_expected_id is null and p_expected_version is null)
       or (a.previous_id=p_expected_id and prev.id=a.previous_id and prev.version=p_expected_version and prev.status='superseded')))) then return a.id; end if;
 if (a.id is not null and (a.id is distinct from p_expected_id or a.version is distinct from p_expected_version))
   or (a.id is null and (prev.id is distinct from p_expected_id or (prev.id is not null and prev.version is distinct from p_expected_version)))
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if a.id is null then
  insert into public.finance_vp_revenue_distributions(payment_id,money_allocation_id,revision,previous_id,source_snapshot_json,decisions_json,note,created_at,created_by,updated_at)
  values(p_payment_id,(s#>>'{money_allocation,id}')::uuid,coalesce(prev.revision,0)+1,prev.id,s,c,btrim(p_note),ts,auth.uid(),ts)
  returning * into a; ev:='created';
 else
  if a.status<>'draft' then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
  update public.finance_vp_revenue_distributions set money_allocation_id=(s#>>'{money_allocation,id}')::uuid,
   source_snapshot_json=s,decisions_json=c,note=btrim(p_note),version=version+1,updated_at=ts where id=a.id returning * into a; ev:='saved';
 end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$save$;

create function public.transition_finance_vp_distribution(p_id uuid,p_expected_version integer,p_source jsonb,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'VP_DISTRIBUTION_ACK_REQUIRED'; end if;
 if p_action is null or p_action not in ('review','finalize','supersede') then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if p_expected_version is null or p_expected_version<1 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 select * into a from public.finance_vp_revenue_distributions where id=p_id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_MISSING'; end if;
 perform public.money_allocation_lock(a.payment_id);
 select * into a from public.finance_vp_revenue_distributions where id=p_id for update;
 if p_action='supersede' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'VP_DISTRIBUTION_REASON_REQUIRED'; end if;
  -- Retirement must remain possible when the live source is stale or unreadable.
  if a.status='superseded' and a.version=p_expected_version+1 and a.supersede_reason=btrim(p_reason) then return a.id; end if;
 else
  s:=public.vp_distribution_source(a.payment_id);
  if s is distinct from p_source or s is distinct from a.source_snapshot_json then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
  if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
  if a.version=p_expected_version+1 and ((p_action='review' and a.status='reviewed') or (p_action='finalize' and a.status='finalized')) then return a.id; end if;
 end if;
 if a.version is distinct from p_expected_version then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if p_action='supersede' and a.status<>'superseded' then
  update public.finance_vp_revenue_distributions set status='superseded',version=version+1,updated_at=ts,
   superseded_at=ts,superseded_by=auth.uid(),supersede_reason=btrim(p_reason) where id=a.id returning * into a; ev:='superseded';
 elsif p_action='review' and a.status='draft' then
  update public.finance_vp_revenue_distributions set status='reviewed',version=version+1,updated_at=ts,
   reviewed_at=ts,reviewed_by=auth.uid() where id=a.id returning * into a; ev:='reviewed';
 elsif p_action='finalize' and a.status='reviewed' then
  update public.finance_vp_revenue_distributions set status='finalized',version=version+1,updated_at=ts,
   finalized_at=ts,finalized_by=auth.uid() where id=a.id returning * into a; ev:='finalized';
 else raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$transition$;

-- Additional triggers only: 044 functions and guards remain unchanged.
-- Lock the same Payment row as the distribution/044 RPCs before checking state.
create function public.guard_vp_distribution_source()
returns trigger language plpgsql security definer set search_path=public as $guard$
declare payments uuid[]; invoices uuid[]; pid uuid;
begin
 if tg_op='TRUNCATE' then
  if exists(select 1 from public.finance_vp_revenue_distributions where status in ('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
  return null;
 end if;
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 if tg_table_name='finance_payments' then payments:=array[old.id];
 elsif tg_table_name='finance_invoices' then
  if tg_op='UPDATE' and new.issued_snapshot_json is not distinct from old.issued_snapshot_json
    and new.document_status is not distinct from old.document_status and new.source_model is not distinct from old.source_model
    and new.invoice_no is not distinct from old.invoice_no and new.total_amount is not distinct from old.total_amount
    and new.vat_amount is not distinct from old.vat_amount and new.amount_before_vat is not distinct from old.amount_before_vat
    and new.client_id is not distinct from old.client_id and new.currency is not distinct from old.currency then return new; end if;
  invoices:=array[old.id];
 elsif tg_table_name='finance_invoice_items' then
  invoices:=case when tg_op='INSERT' then array[new.invoice_id] when tg_op='DELETE' then array[old.invoice_id] else array[old.invoice_id,new.invoice_id] end;
 elsif tg_table_name='finance_tax_document_corrections' then
  -- Both the old and new issued evidence can affect the 044 source projection.
  if tg_op<>'INSERT' and old.status='issued' and old.correction_mode<>'replacement_copy' then
   select array_agg(invoice_id) into invoices from public.finance_tax_invoices where id=old.original_tax_invoice_id;
  end if;
  if tg_op<>'DELETE' and new.status='issued' and new.correction_mode<>'replacement_copy' then
   select coalesce(invoices,array[]::uuid[])||array_agg(invoice_id) into invoices from public.finance_tax_invoices where id=new.original_tax_invoice_id;
  end if;
 else
  payments:=case when tg_op='INSERT' then array[new.payment_id] when tg_op='DELETE' then array[old.payment_id] else array[old.payment_id,new.payment_id] end;
 end if;
 if invoices is not null then
  select array_agg(distinct payment_id order by payment_id) into payments from public.finance_payment_effective_invoice_allocations where invoice_id=any(invoices);
 end if;
 select array_agg(distinct value order by value) into payments from unnest(payments) value where value is not null;
 foreach pid in array coalesce(payments,array[]::uuid[]) loop
  perform 1 from public.finance_payments where id=pid for update;
  if exists(select 1 from public.finance_vp_revenue_distributions where payment_id=pid and status in ('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if; return new;
end;
$guard$;
create trigger vp_distribution_payment_guard before update or delete on public.finance_payments for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_invoice_guard before update or delete on public.finance_invoices for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_item_guard before insert or update or delete on public.finance_invoice_items for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_reallocation_guard before insert or update or delete on public.finance_payment_allocation_reallocations for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_raw_guard before insert or update or delete on public.finance_payment_invoice_allocations for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_wht_guard before insert or update or delete on public.finance_payment_wht_components for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_correction_guard before insert or update or delete on public.finance_tax_document_corrections for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_money_allocation_guard before insert or update or delete on public.finance_payment_money_allocations for each row execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_payments for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_invoices for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_invoice_items for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_payment_allocation_reallocations for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_payment_invoice_allocations for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_payment_wht_components for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_tax_document_corrections for each statement execute function public.guard_vp_distribution_source();
create trigger vp_distribution_source_no_truncate before truncate on public.finance_payment_money_allocations for each statement execute function public.guard_vp_distribution_source();

create function public.vp_distribution_validate()
returns trigger language plpgsql security definer set search_path=public as $validate$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; actor uuid; evidence jsonb; event_version integer;
begin
 if tg_table_name='finance_vp_revenue_distribution_audit' then
  select * into a from public.finance_vp_revenue_distributions where id=new.distribution_id;
  event_version:=(new.evidence_json->>'version')::integer;
  if a.id is null or new.evidence_json->>'id' is distinct from a.id::text
    or new.evidence_json->>'payment_id' is distinct from a.payment_id::text
    or new.evidence_json->>'revision' is distinct from a.revision::text
    or event_version>a.version
    or (event_version=a.version and new.evidence_json is distinct from to_jsonb(a))
    or (event_version>1 and not exists(select 1 from public.finance_vp_revenue_distribution_audit e
      where e.distribution_id=a.id and (e.evidence_json->>'version')::integer=event_version-1))
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  evidence:=new.evidence_json;
  ev:=case when event_version=1 then 'created' when evidence->>'status'='draft' then 'saved' else evidence->>'status' end;
  actor:=case ev when 'created' then (evidence->>'created_by')::uuid when 'reviewed' then (evidence->>'reviewed_by')::uuid
   when 'finalized' then (evidence->>'finalized_by')::uuid when 'superseded' then (evidence->>'superseded_by')::uuid else new.actor_id end;
  if new.event_type is distinct from ev or new.actor_id is distinct from actor
    or new.created_at is distinct from (evidence->>'updated_at')::timestamptz
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  return null;
 end if;
 select * into a from public.finance_vp_revenue_distributions where id=new.id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.money_allocation_lock(a.payment_id);
 if new.source_snapshot_json is distinct from public.vp_distribution_frozen_source(
     new.source_snapshot_json->'money_source',new.source_snapshot_json->'money_allocation')
   or new.source_snapshot_json->'blockers' is distinct from '[]'::jsonb
   or new.source_snapshot_json#>>'{money_source,payment,id}' is distinct from new.payment_id::text
   or new.source_snapshot_json#>>'{money_allocation,id}' is distinct from new.money_allocation_id::text
   or (new.money_allocation_id is not null and not exists(select 1 from public.finance_payment_money_allocations m
     where m.id=new.money_allocation_id and m.payment_id=new.payment_id))
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if new.decisions_json is distinct from public.vp_distribution_choices(new.source_snapshot_json,new.decisions_json,
     new.reviewed_at is not null) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if new.previous_id is not null and not exists(select 1 from public.finance_vp_revenue_distributions p
   where p.id=new.previous_id and p.payment_id=new.payment_id and p.revision=new.revision-1 and p.status='superseded')
 then raise exception 'VP_DISTRIBUTION_REVISION_INVALID'; end if;
 -- Check every captured NEW version, not only the last row visible at commit.
 ev:=case when tg_op='INSERT' then 'created' when new.status='draft' then 'saved' else new.status end;
 if not exists(select 1 from public.finance_vp_revenue_distribution_audit e
   where e.distribution_id=new.id and e.event_type=ev and e.evidence_json=to_jsonb(new))
 then raise exception 'VP_DISTRIBUTION_AUDIT_REQUIRED'; end if;
 -- Drafts may subsequently become stale; protected states never may.
 if a.status in ('reviewed','finalized') then
  s:=public.vp_distribution_source(a.payment_id);
  if s is distinct from a.source_snapshot_json or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
 end if;
 return null;
end;
$validate$;
create constraint trigger vp_distribution_integrity after insert or update on public.finance_vp_revenue_distributions
deferrable initially deferred for each row execute function public.vp_distribution_validate();
create constraint trigger vp_distribution_audit_integrity after insert on public.finance_vp_revenue_distribution_audit
deferrable initially deferred for each row execute function public.vp_distribution_validate();

create function public.get_finance_vp_distribution(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $context$
declare s jsonb; a public.finance_vp_revenue_distributions%rowtype;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 s:=public.vp_distribution_source(p_payment_id);
 select * into a from public.finance_vp_revenue_distributions where payment_id=p_payment_id and status<>'superseded';
 return jsonb_build_object('source',s,'current',case when a.id is null then null else to_jsonb(a) end,
  'source_current',coalesce(a.id is not null and s=a.source_snapshot_json and s->'blockers'='[]'::jsonb,false),
  'can_manage',public.money_allocation_admin(),'posting_enabled',false,
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.revision desc),'[]') from public.finance_vp_revenue_distributions h where h.payment_id=p_payment_id),
  'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by h.revision,(e.evidence_json->>'version')::integer,e.id),'[]')
   from public.finance_vp_revenue_distribution_audit e join public.finance_vp_revenue_distributions h on h.id=e.distribution_id where h.payment_id=p_payment_id));
end;
$context$;

alter table public.finance_vp_revenue_distributions enable row level security;
alter table public.finance_vp_revenue_distribution_audit enable row level security;
create policy vp_distribution_read on public.finance_vp_revenue_distributions for select to authenticated using(public.current_user_can_view_finance_payments());
create policy vp_distribution_audit_read on public.finance_vp_revenue_distribution_audit for select to authenticated using(public.current_user_can_view_finance_payments());
revoke all on public.finance_vp_revenue_distributions,public.finance_vp_revenue_distribution_audit from public,anon,authenticated;
grant select on public.finance_vp_revenue_distributions,public.finance_vp_revenue_distribution_audit to authenticated;
revoke all on function public.vp_distribution_frozen_source(jsonb,jsonb),public.vp_distribution_source(uuid),
 public.vp_distribution_choices(jsonb,jsonb,boolean),public.vp_distribution_immutable(),public.vp_distribution_validate(),public.guard_vp_distribution_source(),
 public.get_finance_vp_distribution(uuid),public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),
 public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text) from public,anon,authenticated;
grant execute on function public.get_finance_vp_distribution(uuid),public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),
 public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text) to authenticated;
