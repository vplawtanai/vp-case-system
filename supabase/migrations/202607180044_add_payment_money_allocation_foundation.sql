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
