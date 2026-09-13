BEGIN;
-- ROLLBACK only. No business RPCs or UAT row creation. Run the SELECT-only preflight first.
select set_config('vp.distribution045_before',evidence::text,true) from (select jsonb_build_object('finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
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
'finance_tax_document_corrections',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_document_corrections r),
'finance_tax_correction_lines',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_lines r),
'finance_tax_correction_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_documents r),
'finance_tax_correction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence) p;
-- BEGIN EMBEDDED MIGRATION 045
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
-- END EMBEDDED MIGRATION 045
-- BEGIN EMBEDDED VP DISTRIBUTION VERIFIER
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Compare every upstream_evidence_hashes entry before and after apply, including both 044 tables.
-- Legacy row counts are not readiness gates; only opening cutover must be absent.
with expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v',false,'boolean','sql',null::text[],0,false,'u',false),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_confirmation_acknowledged']::text[],0,false,'u',false),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason']::text[],0,false,'u',false),
('public.void_finance_invoice(uuid,text,boolean)','d9055e3d53fbf60cc1554726cc1a5156',true,'v',false,'uuid','plpgsql',array['p_invoice_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_reason','p_acknowledged']::text[],0,false,'u',false),
('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)','12bf09cf010f9516d5fcec9055473cd3',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_source_invoice_id','p_target_invoice_id','p_cash_amount','p_wht_amount','p_reason','p_acknowledged','p_request_id']::text[],0,false,'u',false),
('public.assert_finance_payment_structured_wht(uuid)','52cd73f8b3ba91ff9b297041129cc391',true,'v',false,'void','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v',false,'uuid','plpgsql',array['p_receipt_id','p_acknowledged','p_reviewed_snapshot_json']::text[],1,false,'u',false),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v',false,'uuid','plpgsql',array['p_tax_invoice_id','p_reviewed_snapshot_json','p_acknowledged','p_delayed_issue_acknowledged']::text[],0,false,'u',false),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,'i',false,'jsonb','plpgsql',array['p_evidence','p_applicable','p_rate']::text[],0,false,'u',false),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',true,'s',false,'jsonb','plpgsql',array['p_invoice_id']::text[],0,false,'u',false),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v',false,'uuid','plpgsql',array['p_combined_id','p_reviewed_snapshot_json','p_acknowledged','p_delayed_issue_acknowledged','p_external_receipt_checked','p_external_tax_checked']::text[],0,false,'u',false),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v',false,'uuid','plpgsql',array['p_id','p_reviewed_snapshot_json','p_acknowledged','p_external_number_checked']::text[],0,false,'u',false),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s',false,'boolean','sql',null::text[],0,false,'u',false),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.money_allocation_decisions(jsonb,jsonb,boolean)','cd4387f642a85fa521e93daef15ab206',false,'i',false,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.money_allocation_immutable()','74c569bf901aea6b2a38e62113e6c68a',false,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.money_allocation_lock(uuid)','c77b913cc89847591d3e43837af11ce9',true,'v',false,'void','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','6c2fa19bcee3e7a58c113f13f91ae1c6',true,'v',false,'uuid','plpgsql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','dc4eebfb5f3626aa1068d7ab22adc937',true,'v',false,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.guard_money_allocation_source()','5b3756000c2780512c22c8ed0beef83b',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.validate_money_allocation()','07f745780468339d6e4fb68008c67885',true,'v',false,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s',false,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_frozen_source(jsonb,jsonb)','dd7c249818f0918fd05b711d4af60d2d',false,'i',true,'jsonb','plpgsql',array['p_money_source','p_money_allocation']::text[],0,false,'u',false),
('public.vp_distribution_source(uuid)','db9cc5233dae9af6e728416b96b23989',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false),
('public.vp_distribution_choices(jsonb,jsonb,boolean)','6bc574a243fe094d1443ff0ff6343c78',false,'i',true,'jsonb','plpgsql',array['p_source','p_choices','p_complete']::text[],0,false,'u',false),
('public.vp_distribution_immutable()','b11fdf476b490cc8971fc62d33ba7ea1',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)','276a63b50873c2ae5fd971207c0d6a69',true,'v',true,'uuid','plpgsql',array['p_payment_id','p_expected_id','p_expected_version','p_source','p_choices','p_note']::text[],0,false,'u',false),
('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)','1c80933e8c6df2b50a601cd3f5182a2b',true,'v',true,'uuid','plpgsql',array['p_id','p_expected_version','p_source','p_action','p_acknowledged','p_reason']::text[],0,false,'u',false),
('public.guard_vp_distribution_source()','d9c2dfe4aedd09392bf393e1a91587ab',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.vp_distribution_validate()','28858e2881c548358be1eedd2f8f178d',true,'v',true,'trigger','plpgsql',null::text[],0,false,'u',false),
('public.get_finance_vp_distribution(uuid)','6e6d47836c88dd5616e7e42b6b9aa015',true,'s',true,'jsonb','plpgsql',array['p_payment_id']::text[],0,false,'u',false)),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof),protected as(select jsonb_build_object('finance_payment_money_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocations r),
'finance_payment_money_allocation_audit',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_money_allocation_audit r),
'finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),
'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),
'finance_payment_effective_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_effective_invoice_allocations r),
'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),
'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),
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
'finance_tax_document_corrections',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_document_corrections r),
'finance_tax_correction_lines',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_lines r),
'finance_tax_correction_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_documents r),
'finance_tax_correction_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_correction_audit_events r),
'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence),
 expected_money_catalog as(select value from jsonb_array_elements('[
  {
    "name": "finance_payment_money_allocation_audit",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "allocation_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "actor_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_payment_money_allocation_audit_actor_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocation_audit_allocation_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocation_audit_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))"
      },
      {
        "name": "finance_payment_money_allocation_audit_evidence_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))"
      },
      {
        "name": "finance_payment_money_allocation_audit_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_payment_money_allocation_audit_pkey",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocation_audit_pkey ON public.finance_payment_money_allocation_audit USING btree (id)"
      },
      {
        "name": "money_allocation_audit_parent",
        "definition": "CREATE INDEX money_allocation_audit_parent ON public.finance_payment_money_allocation_audit USING btree (allocation_id, created_at, id)"
      }
    ],
    "policies": [
      {
        "name": "money_allocation_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "money_allocation_audit_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER money_allocation_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_payment_money_allocation_audit FOR EACH ROW EXECUTE FUNCTION money_allocation_immutable()"
      }
    ]
  },
  {
    "name": "finance_payment_money_allocations",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "revision",
        "type": "integer",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "not_null": true
      },
      {
        "name": "version",
        "type": "integer",
        "default": "1",
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "note",
        "type": "text",
        "default": "''''::text",
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "reviewed_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "reviewed_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "superseded_by",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "supersede_reason",
        "type": "text",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_payment_money_allocations_check",
        "type": "c",
        "definition": "CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check1",
        "type": "c",
        "definition": "CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check2",
        "type": "c",
        "definition": "CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check3",
        "type": "c",
        "definition": "CHECK ((((status = ''finalized''::text) OR ((status = ''superseded''::text) AND (finalized_at IS NOT NULL))) = (finalized_at IS NOT NULL)))"
      },
      {
        "name": "finance_payment_money_allocations_check4",
        "type": "c",
        "definition": "CHECK (((status = ''superseded''::text) = ((superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (NULLIF(btrim(supersede_reason), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_payment_money_allocations_created_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_decisions_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''array''::text))"
      },
      {
        "name": "finance_payment_money_allocations_finalized_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_note_check",
        "type": "c",
        "definition": "CHECK ((length(note) <= 2000))"
      },
      {
        "name": "finance_payment_money_allocations_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_payment_id_revision_key",
        "type": "u",
        "definition": "UNIQUE (payment_id, revision)"
      },
      {
        "name": "finance_payment_money_allocations_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (previous_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_key",
        "type": "u",
        "definition": "UNIQUE (previous_id)"
      },
      {
        "name": "finance_payment_money_allocations_reviewed_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_revision_check",
        "type": "c",
        "definition": "CHECK ((revision > 0))"
      },
      {
        "name": "finance_payment_money_allocations_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_payment_money_allocations_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))"
      },
      {
        "name": "finance_payment_money_allocations_supersede_reason_check",
        "type": "c",
        "definition": "CHECK ((length(supersede_reason) <= 2000))"
      },
      {
        "name": "finance_payment_money_allocations_superseded_by_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_payment_money_allocations_version_check",
        "type": "c",
        "definition": "CHECK ((version > 0))"
      },
      {
        "name": "money_allocation_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_payment_money_allocations_payment_id_revision_key",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_payment_id_revision_key ON public.finance_payment_money_allocations USING btree (payment_id, revision)"
      },
      {
        "name": "finance_payment_money_allocations_pkey",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_pkey ON public.finance_payment_money_allocations USING btree (id)"
      },
      {
        "name": "finance_payment_money_allocations_previous_id_key",
        "definition": "CREATE UNIQUE INDEX finance_payment_money_allocations_previous_id_key ON public.finance_payment_money_allocations USING btree (previous_id)"
      },
      {
        "name": "money_allocation_current_payment",
        "definition": "CREATE UNIQUE INDEX money_allocation_current_payment ON public.finance_payment_money_allocations USING btree (payment_id) WHERE (status <> ''superseded''::text)"
      }
    ],
    "policies": [
      {
        "name": "money_allocation_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "money_allocation_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER money_allocation_immutable BEFORE DELETE OR UPDATE ON public.finance_payment_money_allocations FOR EACH ROW EXECUTE FUNCTION money_allocation_immutable()"
      },
      {
        "name": "money_allocation_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER money_allocation_integrity AFTER INSERT OR UPDATE ON public.finance_payment_money_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_money_allocation()"
      }
    ]
  }
]
'::jsonb)),actual_money_catalog as(select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal and t.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()')) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit') order by c.relname),
 money_catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_money_catalog e full join actual_money_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 money_expected_guards(table_name,trigger_name,trigger_type) as (values ('finance_payments','money_allocation_payment_guard',27),
('finance_invoices','money_allocation_invoice_guard',27),
('finance_invoice_items','money_allocation_item_guard',31),
('finance_payment_allocation_reallocations','money_allocation_reallocation_guard',7),
('finance_payment_invoice_allocations','money_allocation_raw_guard',31),
('finance_payment_wht_components','money_allocation_wht_guard',31),
('finance_tax_document_corrections','money_allocation_correction_guard',23)),
 money_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure('public.guard_money_allocation_source()') or (n.nspname='public' and t.tgname in ('money_allocation_payment_guard','money_allocation_invoice_guard','money_allocation_item_guard','money_allocation_reallocation_guard','money_allocation_raw_guard','money_allocation_wht_guard','money_allocation_correction_guard'))),
 money_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from money_expected_guards e full join money_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure('public.guard_money_allocation_source()') or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null),
 source_contracts(table_name,kind) as(values ('finance_payment_money_allocations','r'),('finance_payment_money_allocation_audit','r'),('finance_payments','r'),('finance_payment_invoice_allocations','r'),('finance_payment_effective_invoice_allocations','v'),('finance_payment_allocation_reallocations','r'),('finance_payment_wht_components','r'),('finance_payment_audit_events','r'),('finance_invoices','r'),('finance_invoice_items','r'),('finance_invoice_audit_events','r'),('finance_invoice_settlement_summary','v'),('finance_cash_transactions','r'),('finance_account_opening_balances','r'),('finance_cash_transaction_audit_events','r'),('finance_company_ledger','r'),('finance_compensation_batches','r'),('finance_compensation_allocations','r'),('finance_receipts','r'),('finance_receipt_invoice_allocations','r'),('finance_receipt_audit_events','r'),('finance_tax_invoices','r'),('finance_tax_invoice_items','r'),('finance_tax_point_events','r'),('finance_combined_documents','r'),('finance_combined_document_audit_events','r'),('finance_tax_document_corrections','r'),('finance_tax_correction_lines','r'),('finance_tax_correction_documents','r'),('finance_tax_correction_audit_events','r'),('finance_document_counters','r')),
 source_columns(table_name,column_name,data_type) as(values ('finance_payments','id','uuid'),('finance_payments','status','text'),('finance_payments','cash_amount','numeric'),('finance_payments','wht_amount','numeric'),('finance_payments','settlement_amount','numeric'),('finance_invoices','id','uuid'),('finance_invoices','document_status','text'),('finance_invoices','issued_snapshot_json','jsonb'),('finance_invoices','amount_before_vat','numeric'),('finance_invoices','vat_amount','numeric'),('finance_invoices','total_amount','numeric'),('finance_invoice_items','id','uuid'),('finance_invoice_items','invoice_id','uuid'),('finance_payment_effective_invoice_allocations','payment_id','uuid'),('finance_payment_effective_invoice_allocations','invoice_id','uuid'),('finance_payment_effective_invoice_allocations','effective_cash_allocated','numeric'),('finance_payment_effective_invoice_allocations','effective_wht_credit_allocated','numeric'),('finance_payment_effective_invoice_allocations','effective_settlement_total','numeric'),('finance_payment_wht_components','payment_id','uuid'),('finance_payment_wht_components','invoice_id','uuid'),('finance_payment_wht_components','invoice_item_id','uuid'),('finance_payment_wht_components','basis_snapshot_json','jsonb'),('finance_payment_wht_components','calculated_wht_amount','numeric'),('finance_payment_money_allocations','id','uuid'),('finance_payment_money_allocations','payment_id','uuid'),('finance_payment_money_allocations','status','text'),('finance_payment_money_allocations','version','integer'),('finance_payment_money_allocations','source_snapshot_json','jsonb'),('finance_payment_money_allocations','decisions_json','jsonb'),('finance_payment_money_allocation_audit','allocation_id','uuid'),('finance_payment_money_allocation_audit','evidence_json','jsonb'),('finance_tax_document_corrections','original_tax_invoice_id','uuid'),('finance_tax_document_corrections','status','text'),('finance_tax_document_corrections','correction_mode','text')),
 source_contract_differences as(select s.table_name,null::text as column_name from source_contracts s left join pg_class c on c.oid=to_regclass('public.'||s.table_name) where c.oid is null or c.relkind::text<>s.kind
 union all select s.table_name,s.column_name from source_columns s left join pg_attribute a on a.attrelid=to_regclass('public.'||s.table_name) and a.attname=s.column_name and a.attnum>0 and not a.attisdropped where a.attname is null or a.atttypid is distinct from to_regtype(s.data_type)),
  expected_catalog as(select value from jsonb_array_elements('[
  {
    "name": "finance_vp_revenue_distribution_audit",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "distribution_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "event_type",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "actor_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "evidence_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distribution_audit_actor_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_distribution_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (distribution_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_event_type_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((event_type = ANY (ARRAY[''created''::text, ''saved''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(evidence_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_evidence_json_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (COALESCE(((jsonb_typeof((evidence_json -> ''version''::text)) = ''number''::text) AND (((evidence_json ->> ''version''::text))::numeric >= (1)::numeric) AND (((evidence_json ->> ''version''::text))::numeric = trunc(((evidence_json ->> ''version''::text))::numeric))), false))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_audit_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distribution_audit_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distribution_audit_pkey ON public.finance_vp_revenue_distribution_audit USING btree (id)"
      },
      {
        "name": "vp_distribution_audit_parent",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_audit_parent ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, created_at, id)"
      },
      {
        "name": "vp_distribution_audit_version",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_audit_version ON public.finance_vp_revenue_distribution_audit USING btree (distribution_id, (((evidence_json ->> ''version''::text))::integer))"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_audit_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_immutable BEFORE DELETE OR UPDATE ON public.finance_vp_revenue_distribution_audit FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_audit_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_audit_integrity AFTER INSERT ON public.finance_vp_revenue_distribution_audit DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_audit_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_audit_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distribution_audit FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  },
  {
    "name": "finance_vp_revenue_distributions",
    "kind": "r",
    "rls": true,
    "force_rls": false,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "money_allocation_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "revision",
        "type": "integer",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "previous_id",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "version",
        "type": "integer",
        "default": "1",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "decisions_json",
        "type": "jsonb",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "note",
        "type": "text",
        "default": "''''::text",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "created_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "updated_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "identity": "",
        "not_null": true,
        "generated": ""
      },
      {
        "name": "reviewed_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "reviewed_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "finalized_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_at",
        "type": "timestamp with time zone",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "superseded_by",
        "type": "uuid",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      },
      {
        "name": "supersede_reason",
        "type": "text",
        "default": null,
        "identity": "",
        "not_null": false,
        "generated": ""
      }
    ],
    "constraints": [
      {
        "name": "finance_vp_revenue_distributions_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((revision = 1) = (previous_id IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check1",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((updated_at >= created_at))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check10",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((finalized_at >= reviewed_at) AND (finalized_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check11",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((((status = ''superseded''::text) AND (superseded_at IS NOT NULL) AND (superseded_by IS NOT NULL) AND (COALESCE(NULLIF(btrim(supersede_reason), ''''::text), ''''::text) <> ''''::text) AND (supersede_reason = btrim(supersede_reason)) AND (superseded_at >= COALESCE(finalized_at, reviewed_at, created_at)) AND (superseded_at <= updated_at)) OR ((status <> ''superseded''::text) AND (superseded_at IS NULL) AND (superseded_by IS NULL) AND (supersede_reason IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check2",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) = (reviewed_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check3",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) = (finalized_by IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check4",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''draft''::text) OR ((reviewed_at IS NULL) AND (finalized_at IS NULL))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check5",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ALL (ARRAY[''reviewed''::text, ''finalized''::text])) OR (reviewed_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check6",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''reviewed''::text) OR (finalized_at IS NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check7",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((status <> ''finalized''::text) OR (finalized_at IS NOT NULL)))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check8",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((finalized_at IS NULL) OR ((reviewed_at IS NOT NULL) AND (status = ANY (ARRAY[''finalized''::text, ''superseded''::text])))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_check9",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((reviewed_at IS NULL) OR ((reviewed_at >= created_at) AND (reviewed_at <= updated_at))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_created_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_decisions_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(decisions_json) = ''array''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_finalized_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (finalized_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_money_allocation_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (money_allocation_id) REFERENCES finance_payment_money_allocations(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_note_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK (((length(note) <= 2000) AND (note = btrim(note))))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (payment_id, revision)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "type": "p",
        "validated": true,
        "deferrable": false,
        "definition": "PRIMARY KEY (id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (previous_id) REFERENCES finance_vp_revenue_distributions(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "type": "u",
        "validated": true,
        "deferrable": false,
        "definition": "UNIQUE (previous_id)",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_reviewed_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_revision_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((revision > 0))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_source_snapshot_json_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_status_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''reviewed''::text, ''finalized''::text, ''superseded''::text])))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_supersede_reason_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((length(supersede_reason) <= 2000))",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_superseded_by_fkey",
        "type": "f",
        "validated": true,
        "deferrable": false,
        "definition": "FOREIGN KEY (superseded_by) REFERENCES user_profiles(id) ON DELETE RESTRICT",
        "initially_deferred": false
      },
      {
        "name": "finance_vp_revenue_distributions_version_check",
        "type": "c",
        "validated": true,
        "deferrable": false,
        "definition": "CHECK ((version > 0))",
        "initially_deferred": false
      },
      {
        "name": "vp_distribution_integrity",
        "type": "t",
        "validated": true,
        "deferrable": true,
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED",
        "initially_deferred": true
      }
    ],
    "indexes": [
      {
        "name": "finance_vp_revenue_distributions_payment_id_revision_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_payment_id_revision_key ON public.finance_vp_revenue_distributions USING btree (payment_id, revision)"
      },
      {
        "name": "finance_vp_revenue_distributions_pkey",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_pkey ON public.finance_vp_revenue_distributions USING btree (id)"
      },
      {
        "name": "finance_vp_revenue_distributions_previous_id_key",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX finance_vp_revenue_distributions_previous_id_key ON public.finance_vp_revenue_distributions USING btree (previous_id)"
      },
      {
        "name": "vp_distribution_current_payment",
        "ready": true,
        "valid": true,
        "definition": "CREATE UNIQUE INDEX vp_distribution_current_payment ON public.finance_vp_revenue_distributions USING btree (payment_id) WHERE (status <> ''superseded''::text)"
      },
      {
        "name": "vp_distribution_money_allocation",
        "ready": true,
        "valid": true,
        "definition": "CREATE INDEX vp_distribution_money_allocation ON public.finance_vp_revenue_distributions USING btree (money_allocation_id) WHERE (money_allocation_id IS NOT NULL)"
      }
    ],
    "policies": [
      {
        "name": "vp_distribution_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "current_user_can_view_finance_payments()",
        "command": "SELECT",
        "permissive": "PERMISSIVE"
      }
    ],
    "triggers": [
      {
        "name": "vp_distribution_immutable",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.finance_vp_revenue_distributions FOR EACH ROW EXECUTE FUNCTION vp_distribution_immutable()"
      },
      {
        "name": "vp_distribution_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER vp_distribution_integrity AFTER INSERT OR UPDATE ON public.finance_vp_revenue_distributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION vp_distribution_validate()"
      },
      {
        "name": "vp_distribution_no_truncate",
        "enabled": "O",
        "definition": "CREATE TRIGGER vp_distribution_no_truncate BEFORE TRUNCATE ON public.finance_vp_revenue_distributions FOR EACH STATEMENT EXECUTE FUNCTION vp_distribution_immutable()"
      }
    ]
  }
]
'::jsonb)),actual_catalog as(select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit') order by c.relname),
  catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 expected_domain_relations(name,kind) as(values ('finance_vp_revenue_distribution_audit','r'),('finance_vp_revenue_distribution_audit_pkey','i'),('vp_distribution_audit_parent','i'),('vp_distribution_audit_version','i'),('finance_vp_revenue_distributions','r'),('finance_vp_revenue_distributions_payment_id_revision_key','i'),('finance_vp_revenue_distributions_pkey','i'),('finance_vp_revenue_distributions_previous_id_key','i'),('vp_distribution_current_payment','i'),('vp_distribution_money_allocation','i')),
 actual_domain_relations as(select c.relname as name,c.relkind::text as kind from pg_class c where c.relnamespace='public'::regnamespace and (c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)' or c.relname in(select name from expected_domain_relations))),
 relation_inventory_differences as(select e.name as expected_name,e.kind as expected_kind,a.name as actual_name,a.kind as actual_kind from expected_domain_relations e full join actual_domain_relations a on a.name=e.name where e.name is null or a.name is null or a.kind is distinct from e.kind),
 actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname ~ '^vp_distribution_' or p.proname='guard_vp_distribution_source' or p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution'))),
 function_inventory_differences as(select e.signature as expected_signature,a.signature as actual_signature from (select * from expected_functions where is_new) e full join actual_domain_functions a on a.oid=to_regprocedure(e.signature) where e.signature is null or a.oid is null),
 distribution_expected_guards(table_name,trigger_name,trigger_type) as (values ('finance_payments','vp_distribution_payment_guard',27),
('finance_invoices','vp_distribution_invoice_guard',27),
('finance_invoice_items','vp_distribution_item_guard',31),
('finance_payment_allocation_reallocations','vp_distribution_reallocation_guard',31),
('finance_payment_invoice_allocations','vp_distribution_raw_guard',31),
('finance_payment_wht_components','vp_distribution_wht_guard',31),
('finance_tax_document_corrections','vp_distribution_correction_guard',31),
('finance_payment_money_allocations','vp_distribution_money_allocation_guard',31),
('finance_payments','vp_distribution_source_no_truncate',34),
('finance_invoices','vp_distribution_source_no_truncate',34),
('finance_invoice_items','vp_distribution_source_no_truncate',34),
('finance_payment_allocation_reallocations','vp_distribution_source_no_truncate',34),
('finance_payment_invoice_allocations','vp_distribution_source_no_truncate',34),
('finance_payment_wht_components','vp_distribution_source_no_truncate',34),
('finance_tax_document_corrections','vp_distribution_source_no_truncate',34),
('finance_payment_money_allocations','vp_distribution_source_no_truncate',34)),
 distribution_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure('public.guard_vp_distribution_source()') or (n.nspname='public' and t.tgname in ('vp_distribution_payment_guard','vp_distribution_invoice_guard','vp_distribution_item_guard','vp_distribution_reallocation_guard','vp_distribution_raw_guard','vp_distribution_wht_guard','vp_distribution_correction_guard','vp_distribution_money_allocation_guard','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate','vp_distribution_source_no_truncate'))),
 distribution_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from distribution_expected_guards e full join distribution_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()') or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null),
 checks(name,passed) as(values
 ('predecessor_functions_exact',not exists(select 1 from function_differences where not is_new)),
 ('044_catalog_preserved',not exists(select 1 from money_catalog_differences)),
 ('044_source_guards_preserved',not exists(select 1 from money_guard_differences)),
 ('044_privileges_preserved',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_admin()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_admin()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_admin()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_admin()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_source(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_source(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_decisions(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.money_allocation_lock(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.money_allocation_lock(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.guard_money_allocation_source()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.guard_money_allocation_source()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_money_allocation()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.validate_money_allocation()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.validate_money_allocation()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.validate_money_allocation()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_money_allocation(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_money_allocation(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and (select count(*)=2 and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit'))),
 ('source_contracts_present',not exists(select 1 from source_contract_differences)),
 ('no_opening_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_relation_inventory',not exists(select 1 from relation_inventory_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_new_function_inventory',not exists(select 1 from function_inventory_differences)),
 ('zero_state',not exists(select 1 from public.finance_vp_revenue_distributions) and not exists(select 1 from public.finance_vp_revenue_distribution_audit)),
 ('source_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where (trigger_type & 1)=1)),
 ('source_truncate_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where trigger_type=34)),
 ('private_and_rpc_privileges',(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_frozen_source(jsonb,jsonb)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_source(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_source(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_immutable()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_immutable()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.save_finance_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.guard_vp_distribution_source()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.guard_vp_distribution_source()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)=false
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.vp_distribution_validate()'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.vp_distribution_validate()') and acl.grantee=0 and acl.privilege_type='EXECUTE')) and
(coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)=true
 and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure('public.get_finance_vp_distribution(uuid)'),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure('public.get_finance_vp_distribution(uuid)') and acl.grantee=0 and acl.privilege_type='EXECUTE'))),
 ('only_three_authenticated_rpcs',(select count(*)=3 and bool_and(p.proname in ('get_finance_vp_distribution','save_finance_vp_distribution','transition_finance_vp_distribution')) from actual_domain_functions a join pg_proc p on p.oid=a.oid where has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 ('no_anon_execute',not exists(select 1 from actual_domain_functions where has_function_privilege('anon',oid,'EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('explicit_read_policies',(select count(*)=2 and count(distinct tablename)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_payments()' and with_check is null and permissive='PERMISSIVE') from pg_policies where schemaname='public' and tablename in ('finance_vp_revenue_distributions','finance_vp_revenue_distribution_audit'))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.distribution045_before',true),'') is null or current_setting('vp.distribution045_before',true)=(select evidence::text from protected)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as vp_revenue_distribution_foundation_verification_pass,
 (select coalesce(jsonb_agg(to_jsonb(f) order by signature),'[]') from function_differences f) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from money_catalog_differences d) as money_catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from money_guard_differences d) as money_guard_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,column_name),'[]') from source_contract_differences d) as missing_source_contracts,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from relation_inventory_differences d) as relation_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_inventory_differences d) as function_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from distribution_guard_differences d) as source_guard_differences,
 nullif(current_setting('vp.distribution045_before',true),'') is not null as dry_run_baseline_present,
 jsonb_build_object('finance_vp_revenue_distributions',(select count(*) from public.finance_vp_revenue_distributions),'finance_vp_revenue_distribution_audit',(select count(*) from public.finance_vp_revenue_distribution_audit)) as new_rows;
-- END EMBEDDED VP DISTRIBUTION VERIFIER
ROLLBACK;
