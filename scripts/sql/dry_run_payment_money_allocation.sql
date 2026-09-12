BEGIN;
-- ROLLBACK only. No business RPCs or UAT row creation.
select set_config('vp.money044_before',evidence::text,true) from (select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence) p;
-- BEGIN EMBEDDED MIGRATION 044
-- CANDIDATE 044. Internal evidence only: no posting, backfill or Payment mutation.
-- Human Production preflight and approval are required before application.
do $preflight$
begin
 if to_regprocedure('public.finance_document_invoice_lines(uuid)') is null
   or to_regprocedure('public.current_user_can_view_finance_payments()') is null
   or to_regclass('public.finance_tax_document_corrections') is null
   or to_regclass('public.finance_payment_wht_components') is null
 then raise exception 'MONEY_ALLOCATION_PREDECESSOR_MISSING'; end if;
 if exists(select 1 from pg_class c where c.relnamespace='public'::regnamespace
   and c.relkind in ('r','p','v','m') and c.relname ~ '(revenue_allocation|money_allocation)')
 then raise exception 'MONEY_ALLOCATION_COMPETING_DOMAIN'; end if;
end;
$preflight$;

create table public.finance_payment_money_allocations (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null references public.finance_payments(id) on delete restrict,
 revision integer not null check(revision>0),
 previous_id uuid unique references public.finance_payment_money_allocations(id) on delete restrict,
 status text not null default 'draft' check(status in ('draft','reviewed','finalized','superseded')),
 version integer not null default 1 check(version>0),
 source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
 decisions_json jsonb not null check(jsonb_typeof(decisions_json)='array'),
 note text not null default '' check(length(note)<=2000),
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
 check((reviewed_at is null)=(reviewed_by is null)),
 check((finalized_at is null)=(finalized_by is null)),
 check(status not in ('reviewed','finalized') or reviewed_at is not null),
 check((status='finalized' or (status='superseded' and finalized_at is not null))=(finalized_at is not null)),
 check((status='superseded')=(superseded_at is not null and superseded_by is not null and nullif(btrim(supersede_reason),'') is not null))
);
create unique index money_allocation_current_payment on public.finance_payment_money_allocations(payment_id) where status<>'superseded';
create table public.finance_payment_money_allocation_audit (
 id uuid primary key default gen_random_uuid(),
 allocation_id uuid not null references public.finance_payment_money_allocations(id) on delete restrict,
 event_type text not null check(event_type in ('created','saved','reviewed','finalized','superseded')),
 actor_id uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object')
);
create index money_allocation_audit_parent on public.finance_payment_money_allocation_audit(allocation_id,created_at,id);

create function public.money_allocation_admin()
returns boolean language sql stable security definer set search_path=public as $admin$
 select exists(select 1 from public.user_profiles where id=auth.uid() and active=true and role='admin');
$admin$;

-- Reuse the frozen document-line reader. Never resolve live Charge descriptions,
-- rates or classifications. Full coverage means THIS Payment covers each Invoice,
-- not merely that several Payments happen to sum to its gross.
create function public.money_allocation_source(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare p public.finance_payments%rowtype; i public.finance_invoices%rowtype; a record; l jsonb; lines jsonb;
 w public.finance_payment_wht_components%rowtype; wht numeric; cash numeric;
 invoices jsonb:='[]'; components jsonb:='[]'; blockers jsonb:='[]'; corrections jsonb;
 invoice_components jsonb; invoice_blocked boolean; invoice_wht numeric; expected_basis jsonb;
 total_cash numeric:=0; total_wht numeric:=0; total_base numeric:=0; total_vat numeric:=0;
begin
 select * into p from public.finance_payments where id=p_payment_id;
 if p.id is null then raise exception 'MONEY_ALLOCATION_PAYMENT_MISSING'; end if;
 if p.status<>'confirmed' then blockers:=blockers||'"payment_not_confirmed"'::jsonb; end if;
 for a in select * from public.finance_payment_effective_invoice_allocations where payment_id=p.id order by invoice_id loop
  select * into strict i from public.finance_invoices where id=a.invoice_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'mode',c.correction_mode,'issued_at',c.issued_at) order by c.id),'[]') into corrections
   from public.finance_tax_document_corrections c join public.finance_tax_invoices t on t.id=c.original_tax_invoice_id
   where t.invoice_id=i.id and c.status='issued' and c.correction_mode<>'replacement_copy';
  invoices:=invoices||jsonb_build_array(jsonb_build_object('invoice_id',i.id,'invoice_no',i.invoice_no,
   'status',i.document_status,'cash',a.effective_cash_allocated,'wht',a.effective_wht_credit_allocated,
   'settlement',a.effective_settlement_total,'gross',i.total_amount,'issued_snapshot',i.issued_snapshot_json,'corrections',corrections));
  total_cash:=total_cash+a.effective_cash_allocated; total_wht:=total_wht+a.effective_wht_credit_allocated;
  if i.document_status<>'issued' or i.client_id is distinct from p.client_id or i.currency is distinct from p.currency then
   blockers:=blockers||'"invoice_context_invalid"'::jsonb; continue;
  end if;
  if corrections<>'[]' then blockers:=blockers||'"corrected_document_review_required"'::jsonb; continue; end if;
  if a.effective_settlement_total<>i.total_amount then blockers:=blockers||'"partial_line_evidence_missing"'::jsonb; continue; end if;
  begin
   if i.issued_snapshot_json#>>'{invoice,id}' is distinct from i.id::text
     or i.issued_snapshot_json#>>'{invoice,currency}' is distinct from i.currency
     or i.issued_snapshot_json#>>'{invoice,document_status}' is distinct from 'issued'
     or (i.issued_snapshot_json#>>'{invoice,total_amount}')::numeric is distinct from i.total_amount
     or (i.issued_snapshot_json#>>'{invoice,amount_before_vat}')::numeric is distinct from i.amount_before_vat
     or (i.issued_snapshot_json#>>'{invoice,vat_amount}')::numeric is distinct from i.vat_amount
   then raise exception 'SOURCE_INVALID'; end if;
   lines:=public.finance_document_invoice_lines(i.id);
   if exists(select 1 from jsonb_array_elements(lines) x where (x->>'amount_before_vat')::numeric<=0
     or (x->>'vat_amount')::numeric<0 or (x->>'line_total')::numeric<=0
     or x->>'source_state' is distinct from 'active'
     or exists(select 1 from (values('amount_before_vat'),('vat_amount'),('line_total')) k(name)
       where jsonb_typeof(x->k.name) is distinct from 'number' or (x->>k.name)::numeric<>round((x->>k.name)::numeric,2))) then raise exception 'SOURCE_INVALID'; end if;
  exception when others then blockers:=blockers||'"frozen_lines_invalid"'::jsonb; continue;
  end;
  invoice_components:='[]'; invoice_wht:=0; invoice_blocked:=false;
  for l in select value from jsonb_array_elements(lines) order by value->>'id' loop
   select * into w from public.finance_payment_wht_components where payment_id=p.id and invoice_id=i.id and invoice_item_id=(l->>'id')::uuid;
   wht:=coalesce(w.calculated_wht_amount,0);
   if w.id is not null then
    begin
     if w.calculation_rule='single_line_full_invoice_v1' then
      expected_basis:=public.finance_invoice_wht_basis_v1(i.issued_snapshot_json);
      if w.basis_snapshot_json is distinct from expected_basis or p.wht_calculation_mode is distinct from 'rate' then invoice_blocked:=true; end if;
     else
      select value into expected_basis from jsonb_array_elements(public.finance_invoice_wht_lines_v2(i.issued_snapshot_json)) x
       where value->>'invoice_item_id'=l->>'id';
      if w.basis_snapshot_json->'basis' is distinct from expected_basis or p.wht_calculation_mode is distinct from 'line_review'
        or w.basis_snapshot_json->>'applicability' not in ('applies','does_not_apply') then invoice_blocked:=true; end if;
     end if;
     if (wht>0 and (w.rate_percent is null or wht<>round(w.base_amount*w.rate_percent/100,2)))
       or (wht=0 and (w.rate_percent is not null or w.basis_snapshot_json->>'applicability' is distinct from 'does_not_apply'))
     then invoice_blocked:=true; end if;
    exception when others then invoice_blocked:=true;
    end;
   end if;
   if (a.effective_wht_credit_allocated>0 and w.id is null and p.wht_calculation_mode='line_review')
     or (w.id is not null and (w.base_amount is distinct from (l->>'amount_before_vat')::numeric
       or (w.calculation_rule='single_line_full_invoice_v1' and (w.basis_snapshot_json->>'invoice_item_id' is distinct from l->>'id'
         or w.basis_snapshot_json->>'invoice_id' is distinct from i.id::text))
       or (w.calculation_rule='line_review_full_invoice_v2' and (w.basis_snapshot_json#>>'{basis,invoice_item_id}' is distinct from l->>'id'
         or w.basis_snapshot_json#>>'{basis,invoice_id}' is distinct from i.id::text)))) then invoice_blocked:=true; end if;
   cash:=(l->>'line_total')::numeric-wht; invoice_wht:=invoice_wht+wht;
   if cash<0 then invoice_blocked:=true; end if;
   if l#>>'{resolved_vat_treatment,treatment}' is null or l#>>'{resolved_vat_treatment,treatment}'='unknown'
   then blockers:=blockers||'"vat_evidence_unknown"'::jsonb; end if;
   invoice_components:=invoice_components||jsonb_build_array(jsonb_build_object('invoice_id',i.id,'invoice_no',i.invoice_no,
    'invoice_item_id',l->>'id','description',l->>'description','base',(l->>'amount_before_vat')::numeric,
    'vat',(l->>'vat_amount')::numeric,'settlement',(l->>'line_total')::numeric,'cash',cash,'wht',wht,
    'vat_treatment',l->'resolved_vat_treatment','source_item',l,'wht_evidence',case when w.id is null then null else to_jsonb(w) end));
  end loop;
  if invoice_wht<>a.effective_wht_credit_allocated or invoice_blocked
    or exists(select 1 from public.finance_payment_wht_components c where c.payment_id=p.id and c.invoice_id=i.id
      and not exists(select 1 from jsonb_array_elements(lines) x where x->>'id'=c.invoice_item_id::text))
  then blockers:=blockers||'"wht_line_evidence_missing"'::jsonb; continue; end if;
  components:=components||invoice_components; total_base:=total_base+i.amount_before_vat; total_vat:=total_vat+i.vat_amount;
 end loop;
 if total_cash<>p.cash_amount or total_wht<>p.wht_amount or jsonb_array_length(invoices)=0
 then blockers:=blockers||'"settlement_evidence_invalid"'::jsonb; end if;
 if exists(select 1 from public.finance_payment_wht_components c where c.payment_id=p.id and not exists(
   select 1 from jsonb_array_elements(invoices) x where x->>'invoice_id'=c.invoice_id::text))
 then blockers:=blockers||'"wht_line_evidence_missing"'::jsonb; end if;
 return jsonb_build_object('schema_version',1,'payment',jsonb_build_object('id',p.id,'status',p.status,'currency',p.currency,
  'cash',p.cash_amount,'wht',p.wht_amount,'settlement',p.settlement_amount,'received_on',p.received_on,
  'receiving_bank_account_id',p.receiving_bank_account_id,'wht_calculation_mode',p.wht_calculation_mode),
  'invoices',invoices,'lines',components,'proven_base',total_base,'proven_vat',total_vat,
  'unallocated_settlement',p.settlement_amount-total_base-total_vat,
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$source$;

create function public.money_allocation_decisions(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $decisions$
declare l jsonb; c jsonb; result jsonb:='[]';
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'MONEY_ALLOCATION_CHOICES_INVALID'; end if;
 if jsonb_array_length(p_choices)<>jsonb_array_length(p_source->'lines')
   or exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x)<>'object')
 then raise exception 'MONEY_ALLOCATION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'invoice_item_id'=l->>'invoice_item_id')<>1
  then raise exception 'MONEY_ALLOCATION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=l->>'invoice_item_id';
  if exists(select 1 from jsonb_object_keys(c) k where k not in ('invoice_item_id','category','reason'))
    or coalesce(c->>'category','') not in ('unallocated','company_revenue','pass_through','disbursement','client_money','other')
    or length(coalesce(c->>'reason',''))>2000
  then raise exception 'MONEY_ALLOCATION_CHOICES_INVALID'; end if;
  if p_complete and (c->>'category'='unallocated' or nullif(btrim(c->>'reason'),'') is null)
  then raise exception 'MONEY_ALLOCATION_REVIEW_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object('invoice_item_id',l->>'invoice_item_id','category',c->>'category','reason',btrim(coalesce(c->>'reason',''))));
 end loop;
 return result;
end;
$decisions$;

create function public.money_allocation_immutable()
returns trigger language plpgsql set search_path=public as $immutable$
begin
 if tg_op='DELETE' or tg_table_name='finance_payment_money_allocation_audit' then raise exception 'MONEY_ALLOCATION_HISTORY_IMMUTABLE'; end if;
 if old.status='superseded' or new.payment_id<>old.payment_id or new.revision<>old.revision or new.id<>old.id
   or new.previous_id is distinct from old.previous_id or new.created_at<>old.created_at or new.created_by<>old.created_by
   or new.version<>old.version+1
 then raise exception 'MONEY_ALLOCATION_HISTORY_IMMUTABLE'; end if;
 if old.status in ('reviewed','finalized') and (new.source_snapshot_json is distinct from old.source_snapshot_json
   or new.decisions_json is distinct from old.decisions_json or new.note<>old.note
   or new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by)
 then raise exception 'MONEY_ALLOCATION_HISTORY_IMMUTABLE'; end if;
 if old.status='finalized' and (new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by)
 then raise exception 'MONEY_ALLOCATION_HISTORY_IMMUTABLE'; end if;
 if not ((old.status='draft' and new.status in ('draft','reviewed','superseded'))
   or (old.status='reviewed' and new.status in ('finalized','superseded'))
   or (old.status='finalized' and new.status='superseded')) then raise exception 'MONEY_ALLOCATION_TRANSITION_INVALID'; end if;
 return new;
end;
$immutable$;
create trigger money_allocation_immutable before update or delete on public.finance_payment_money_allocations for each row execute function public.money_allocation_immutable();
create trigger money_allocation_audit_immutable before update or delete on public.finance_payment_money_allocation_audit for each row execute function public.money_allocation_immutable();

-- Serializes against Payment reversal/reallocation. No financial row is updated.
create function public.money_allocation_lock(p_payment_id uuid)
returns void language plpgsql security definer set search_path=public as $lock$
begin
 perform 1 from public.finance_payments where id=p_payment_id for update;
 perform 1 from public.finance_invoices where id in (select invoice_id from public.finance_payment_effective_invoice_allocations where payment_id=p_payment_id) order by id for update;
end;
$lock$;

create function public.save_finance_money_allocation(p_payment_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.finance_payment_money_allocations%rowtype; s jsonb; d jsonb; prev public.finance_payment_money_allocations%rowtype; ev text;
begin
 if not public.money_allocation_admin() then raise exception 'MONEY_ALLOCATION_PERMISSION_DENIED'; end if;
 perform public.money_allocation_lock(p_payment_id); s:=public.money_allocation_source(p_payment_id);
 if s#>>'{payment,status}'<>'confirmed' then raise exception 'MONEY_ALLOCATION_CONFIRMED_REQUIRED'; end if;
 if s is distinct from p_source then raise exception 'MONEY_ALLOCATION_SOURCE_CHANGED'; end if;
 if p_note is null or length(p_note)>2000 then raise exception 'MONEY_ALLOCATION_CHOICES_INVALID'; end if;
 d:=public.money_allocation_decisions(s,p_choices,false);
 select * into a from public.finance_payment_money_allocations where payment_id=p_payment_id and status<>'superseded' for update;
 -- Identical retries do not append another revision/audit; incompatible stale clients fail.
 if a.id is not null and a.status='draft' and a.source_snapshot_json=s and a.decisions_json=d and a.note=btrim(p_note) then return a.id; end if;
 if a.id is distinct from p_expected_id or (a.id is not null and a.version is distinct from p_expected_version)
 then raise exception 'MONEY_ALLOCATION_STALE'; end if;
 if a.id is null then
  select * into prev from public.finance_payment_money_allocations where payment_id=p_payment_id order by revision desc limit 1;
  insert into public.finance_payment_money_allocations(payment_id,revision,previous_id,source_snapshot_json,decisions_json,note,created_by)
  values(p_payment_id,coalesce(prev.revision,0)+1,prev.id,s,d,btrim(p_note),auth.uid()) returning * into a; ev:='created';
 else
  if a.status<>'draft' then raise exception 'MONEY_ALLOCATION_HISTORY_IMMUTABLE'; end if;
  update public.finance_payment_money_allocations set source_snapshot_json=s,decisions_json=d,note=btrim(p_note),updated_at=clock_timestamp(),version=version+1 where id=a.id returning * into a; ev:='saved';
 end if;
 insert into public.finance_payment_money_allocation_audit(allocation_id,event_type,actor_id,evidence_json) values(a.id,ev,auth.uid(),to_jsonb(a));
 return a.id;
end;
$save$;

create function public.transition_finance_money_allocation(p_id uuid,p_expected_version integer,p_source jsonb,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition$
declare a public.finance_payment_money_allocations%rowtype; s jsonb; ev text;
begin
 if not public.money_allocation_admin() then raise exception 'MONEY_ALLOCATION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'MONEY_ALLOCATION_ACK_REQUIRED'; end if;
 select * into strict a from public.finance_payment_money_allocations where id=p_id;
 perform public.money_allocation_lock(a.payment_id);
 select * into strict a from public.finance_payment_money_allocations where id=p_id for update;
 if p_action not in ('review','finalize','supersede') or p_action is null then raise exception 'MONEY_ALLOCATION_TRANSITION_INVALID'; end if;
 if (p_action='review' and a.status='reviewed') or (p_action='finalize' and a.status='finalized') or (p_action='supersede' and a.status='superseded') then return a.id; end if;
 if a.version is distinct from p_expected_version then raise exception 'MONEY_ALLOCATION_STALE'; end if;
 if p_action='supersede' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'MONEY_ALLOCATION_REASON_REQUIRED'; end if;
  update public.finance_payment_money_allocations set status='superseded',version=version+1,updated_at=clock_timestamp(),superseded_at=now(),superseded_by=auth.uid(),supersede_reason=btrim(p_reason) where id=a.id returning * into a; ev:='superseded';
 else
  s:=public.money_allocation_source(a.payment_id);
  if s is distinct from p_source or s is distinct from a.source_snapshot_json then raise exception 'MONEY_ALLOCATION_SOURCE_CHANGED'; end if;
  if s->'blockers'<>'[]' or jsonb_array_length(s->'lines')=0 then raise exception 'MONEY_ALLOCATION_SOURCE_UNPROVEN'; end if;
  perform public.money_allocation_decisions(s,a.decisions_json,true);
  if p_action='review' and a.status='draft' then
   update public.finance_payment_money_allocations set status='reviewed',version=version+1,updated_at=clock_timestamp(),reviewed_at=now(),reviewed_by=auth.uid() where id=a.id returning * into a; ev:='reviewed';
  elsif p_action='finalize' and a.status='reviewed' then
   update public.finance_payment_money_allocations set status='finalized',version=version+1,updated_at=clock_timestamp(),finalized_at=now(),finalized_by=auth.uid() where id=a.id returning * into a; ev:='finalized';
  else raise exception 'MONEY_ALLOCATION_TRANSITION_INVALID'; end if;
 end if;
 insert into public.finance_payment_money_allocation_audit(allocation_id,event_type,actor_id,evidence_json) values(a.id,ev,auth.uid(),to_jsonb(a));
 return a.id;
end;
$transition$;

-- Guard actual source writes, not just the currently exposed mutation RPCs.
-- Draft evidence can become stale; reviewed/finalized evidence must first be superseded.
create function public.guard_money_allocation_source()
returns trigger language plpgsql security definer set search_path=public as $guard$
declare payments uuid[]; pid uuid; invoices uuid[]; inv uuid;
begin
 if tg_table_name='finance_payments' then
  if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
  payments:=array[old.id];
 elsif tg_table_name='finance_tax_document_corrections' then
  if new.status<>'issued' or (tg_op='UPDATE' and old.status='issued') or new.correction_mode='replacement_copy' then return new; end if;
  select invoice_id into inv from public.finance_tax_invoices where id=new.original_tax_invoice_id;
 elsif tg_table_name='finance_invoices' then
  if tg_op='UPDATE' and new.issued_snapshot_json is not distinct from old.issued_snapshot_json and new.document_status=old.document_status
   and new.total_amount=old.total_amount and new.vat_amount=old.vat_amount and new.amount_before_vat=old.amount_before_vat
   and new.client_id=old.client_id and new.currency=old.currency then return new; end if;
  inv:=old.id;
 elsif tg_table_name='finance_invoice_items' then
  invoices:=case when tg_op='INSERT' then array[new.invoice_id] when tg_op='DELETE' then array[old.invoice_id] else array[old.invoice_id,new.invoice_id] end;
 elsif tg_table_name='finance_payment_allocation_reallocations' then payments:=array[new.payment_id];
 else payments:=case when tg_op='INSERT' then array[new.payment_id] when tg_op='DELETE' then array[old.payment_id] else array[old.payment_id,new.payment_id] end; end if;
 if inv is not null then invoices:=array[inv]; end if;
 if invoices is not null then select array_agg(distinct payment_id order by payment_id) into payments from public.finance_payment_effective_invoice_allocations where invoice_id=any(invoices); end if;
 select array_agg(distinct value order by value) into payments from unnest(payments) value;
 foreach pid in array coalesce(payments,array[]::uuid[]) loop
  perform 1 from public.finance_payments where id=pid for update;
  if exists(select 1 from public.finance_payment_money_allocations where payment_id=pid and status in ('reviewed','finalized'))
  then raise exception 'MONEY_ALLOCATION_SUPERSEDE_REQUIRED'; end if;
 end loop;
 if tg_op='DELETE' then return old; end if; return new;
end;
$guard$;
create trigger money_allocation_payment_guard before update or delete on public.finance_payments for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_invoice_guard before update or delete on public.finance_invoices for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_item_guard before insert or update or delete on public.finance_invoice_items for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_reallocation_guard before insert on public.finance_payment_allocation_reallocations for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_raw_guard before insert or update or delete on public.finance_payment_invoice_allocations for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_wht_guard before insert or update or delete on public.finance_payment_wht_components for each row execute function public.guard_money_allocation_source();
create trigger money_allocation_correction_guard before insert or update on public.finance_tax_document_corrections for each row execute function public.guard_money_allocation_source();

create function public.validate_money_allocation()
returns trigger language plpgsql security definer set search_path=public as $validate$
declare a public.finance_payment_money_allocations%rowtype; s jsonb;
begin
 select * into strict a from public.finance_payment_money_allocations where id=new.id;
 if a.status in ('reviewed','finalized') then
  s:=public.money_allocation_source(a.payment_id);
  if s is distinct from a.source_snapshot_json or s->'blockers'<>'[]' or jsonb_array_length(s->'lines')=0
  then raise exception 'MONEY_ALLOCATION_SOURCE_UNPROVEN'; end if;
  perform public.money_allocation_decisions(s,a.decisions_json,true);
 end if;
 if a.previous_id is not null and not exists(select 1 from public.finance_payment_money_allocations p
   where p.id=a.previous_id and p.payment_id=a.payment_id and p.revision=a.revision-1 and p.status='superseded')
 then raise exception 'MONEY_ALLOCATION_REVISION_INVALID'; end if;
 if not exists(select 1 from public.finance_payment_money_allocation_audit e where e.allocation_id=a.id and e.evidence_json=to_jsonb(a))
 then raise exception 'MONEY_ALLOCATION_AUDIT_REQUIRED'; end if;
 return null;
end;
$validate$;
create constraint trigger money_allocation_integrity after insert or update on public.finance_payment_money_allocations
deferrable initially deferred for each row execute function public.validate_money_allocation();

create function public.get_finance_money_allocation(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $context$
declare s jsonb; a public.finance_payment_money_allocations%rowtype;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'MONEY_ALLOCATION_PERMISSION_DENIED'; end if;
 s:=public.money_allocation_source(p_payment_id);
 select * into a from public.finance_payment_money_allocations where payment_id=p_payment_id and status<>'superseded';
 return jsonb_build_object('source',s,'can_manage',public.money_allocation_admin(),'current',case when a.id is null then null else to_jsonb(a) end,
  'source_current',a.id is not null and s=a.source_snapshot_json,
  'eligible_for_future_policy_review',coalesce(a.status='finalized' and s=a.source_snapshot_json and s->'blockers'='[]',false),
  'posting_enabled',false,
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.revision desc),'[]') from public.finance_payment_money_allocations h where h.payment_id=p_payment_id),
  'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]') from public.finance_payment_money_allocation_audit e
   join public.finance_payment_money_allocations h on h.id=e.allocation_id where h.payment_id=p_payment_id));
end;
$context$;

alter table public.finance_payment_money_allocations enable row level security;
alter table public.finance_payment_money_allocation_audit enable row level security;
create policy money_allocation_read on public.finance_payment_money_allocations for select to authenticated using(public.current_user_can_view_finance_payments());
create policy money_allocation_audit_read on public.finance_payment_money_allocation_audit for select to authenticated using(public.current_user_can_view_finance_payments());
revoke all on public.finance_payment_money_allocations,public.finance_payment_money_allocation_audit from public,anon,authenticated;
grant select on public.finance_payment_money_allocations,public.finance_payment_money_allocation_audit to authenticated;
revoke all on function public.money_allocation_admin(),public.money_allocation_source(uuid),public.money_allocation_decisions(jsonb,jsonb,boolean),
 public.money_allocation_immutable(),public.money_allocation_lock(uuid),public.guard_money_allocation_source(),public.validate_money_allocation(),
 public.get_finance_money_allocation(uuid),public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text),
 public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text) from public,anon,authenticated;
grant execute on function public.get_finance_money_allocation(uuid),public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text),
 public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text) to authenticated;
-- END EMBEDDED MIGRATION 044
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Stop on failed_checks. Compare upstream_evidence_hashes before and after apply.
with expected_functions(signature,hash,security_definer,volatility) as (values ('public.current_user_can_view_finance_payments()','ee655ca91809471d32a79909a8178f66',true,'v'),
('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v'),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v'),
('public.void_finance_invoice(uuid,text,boolean)','d9055e3d53fbf60cc1554726cc1a5156',true,'v'),
('public.correct_erroneous_finance_payment(uuid,text,boolean)','fe65b1aa1657e9c8e093a0b5378b82a2',true,'v'),
('public.reallocate_finance_payment_allocation(uuid,uuid,uuid,numeric,numeric,text,boolean,uuid)','12bf09cf010f9516d5fcec9055473cd3',true,'v'),
('public.assert_finance_payment_structured_wht(uuid)','52cd73f8b3ba91ff9b297041129cc391',true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v'),
('public.finance_vat_treatment(jsonb,boolean,numeric)','d56bba89766a1ee28411a6854f8c573c',false,'i'),
('public.finance_document_invoice_lines(uuid)','5249d7c4e960e43a5ab134152aae2bb9',true,'s'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v'),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v'),
('public.money_allocation_admin()','b6c3626891400d6817c575526fedd1c0',true,'s'),
('public.money_allocation_source(uuid)','8d5731f472b38ccc8819bf895c7980ab',true,'s'),
('public.money_allocation_decisions(jsonb,jsonb,boolean)','cd4387f642a85fa521e93daef15ab206',false,'i'),
('public.money_allocation_immutable()','74c569bf901aea6b2a38e62113e6c68a',false,'v'),
('public.money_allocation_lock(uuid)','c77b913cc89847591d3e43837af11ce9',true,'v'),
('public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','6c2fa19bcee3e7a58c113f13f91ae1c6',true,'v'),
('public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','dc4eebfb5f3626aa1068d7ab22adc937',true,'v'),
('public.guard_money_allocation_source()','5b3756000c2780512c22c8ed0beef83b',true,'v'),
('public.validate_money_allocation()','07f745780468339d6e4fb68008c67885',true,'v'),
('public.get_finance_money_allocation(uuid)','7209f17b3b694ef00393b436f2d68ca0',true,'s')),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)),protected as(select jsonb_build_object('finance_payments',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payments r),'finance_payment_invoice_allocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_invoice_allocations r),'finance_payment_allocation_reallocations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_allocation_reallocations r),'finance_payment_wht_components',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_wht_components r),'finance_payment_audit_events',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_payment_audit_events r),'finance_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_invoices r),'finance_cash_transactions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_cash_transactions r),'finance_account_opening_balances',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_account_opening_balances r),'finance_company_ledger',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_company_ledger r),'finance_compensation_batches',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_compensation_batches r),'finance_receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_receipts r),'finance_tax_invoices',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_tax_invoices r),'finance_combined_documents',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_combined_documents r),'finance_document_counters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.finance_document_counters r)) as evidence),
 expected_catalog as(select value from jsonb_array_elements('[
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
'::jsonb)),actual_catalog as(select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_payment_money_allocations','finance_payment_money_allocation_audit') order by c.relname),
 catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as(values
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('zero_state',not exists(select 1 from public.finance_payment_money_allocations) and not exists(select 1 from public.finance_payment_money_allocation_audit)),
 ('no_cutover',not exists(select 1 from public.finance_account_opening_balances)),
 ('source_guards',(select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payments'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_invoices'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_invoice_items'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_allocation_reallocations'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_invoice_allocations'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_payment_wht_components'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure) and (select count(*)=1 and bool_and(tgenabled='O' and tgtype=case when tgrelid in ('public.finance_payment_allocation_reallocations'::regclass) then 7 when tgrelid in ('public.finance_tax_document_corrections'::regclass) then 23 when tgrelid in ('public.finance_payments'::regclass,'public.finance_invoices'::regclass) then 27 else 31 end) from pg_trigger where tgrelid='public.finance_tax_document_corrections'::regclass and tgfoid='public.guard_money_allocation_source()'::regprocedure)),
 ('private_and_rpc_privileges',(has_function_privilege('authenticated','public.money_allocation_admin()','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_admin()','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_source(uuid)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_source(uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_decisions(jsonb,jsonb,boolean)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_decisions(jsonb,jsonb,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_immutable()','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_immutable()','EXECUTE')) and (has_function_privilege('authenticated','public.money_allocation_lock(uuid)','EXECUTE')=false and not has_function_privilege('anon','public.money_allocation_lock(uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE')=true and not has_function_privilege('anon','public.save_finance_money_allocation(uuid,uuid,integer,jsonb,jsonb,text)','EXECUTE')) and (has_function_privilege('authenticated','public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','EXECUTE')=true and not has_function_privilege('anon','public.transition_finance_money_allocation(uuid,integer,jsonb,text,boolean,text)','EXECUTE')) and (has_function_privilege('authenticated','public.guard_money_allocation_source()','EXECUTE')=false and not has_function_privilege('anon','public.guard_money_allocation_source()','EXECUTE')) and (has_function_privilege('authenticated','public.validate_money_allocation()','EXECUTE')=false and not has_function_privilege('anon','public.validate_money_allocation()','EXECUTE')) and (has_function_privilege('authenticated','public.get_finance_money_allocation(uuid)','EXECUTE')=true and not has_function_privilege('anon','public.get_finance_money_allocation(uuid)','EXECUTE'))),
 ('browser_mutation_blocked',(select count(*)=2 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_payment_money_allocations'::regclass,'public.finance_payment_money_allocation_audit'::regclass))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.money044_before',true),'') is null or current_setting('vp.money044_before',true)=(select evidence::text from protected)))
 select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as payment_money_allocation_foundation_verification_pass,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num,(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_payment_money_allocations',(select count(*) from public.finance_payment_money_allocations),'finance_payment_money_allocation_audit',(select count(*) from public.finance_payment_money_allocation_audit)) as new_rows;
ROLLBACK;
