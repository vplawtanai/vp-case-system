-- CANDIDATE ONLY. Additive tax evidence; no backfill, documents or cash posting.
create function public.tax_position_can_view()
returns boolean language sql stable security definer set search_path=public as $view$
 select exists(select 1 from public.user_profiles where id=auth.uid() and active and
   (role in ('admin','partner') or can_view_finance_tax_invoices or can_manage_finance_tax_invoices or can_issue_finance_tax_invoices));
$view$;
create function public.tax_position_can_manage()
returns boolean language sql stable security definer set search_path=public as $manage$
 select public.current_user_can_manage_finance_tax_invoices();
$manage$;

-- A source revision owns immutable facts. Supersession is a new revision, not
-- an edit to a financial amount. Reversed sources have an empty new revision.
create table public.finance_tax_source_revisions (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check(source_type in ('direct_money_receipt','payment','tax_invoice','tax_correction')),
 source_id uuid not null,
 revision integer not null check(revision>0),
 fingerprint text not null check(length(fingerprint)=32),
 supersedes_id uuid unique references public.finance_tax_source_revisions(id),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_at timestamptz not null default now(),
 actor_id uuid references public.user_profiles(id),
 unique(source_type,source_id,revision),
 unique(source_type,source_id,fingerprint)
);
create table public.finance_tax_position_facts (
 id uuid primary key default gen_random_uuid(),
 revision_id uuid not null references public.finance_tax_source_revisions(id),
 source_line_id uuid not null,
 tax_kind text not null check(tax_kind in ('output_vat','incoming_wht')),
 effective_on date not null,
 period_month date not null check(extract(day from period_month)=1),
 currency text not null check(currency='THB'),
 base_amount numeric(14,2),
 rate_percent numeric(7,4) check(rate_percent between 0 and 100),
 tax_amount numeric(14,2) not null,
 treatment text not null,
 date_basis text not null check(date_basis in ('confirmed_receipt','approved_tax_point','document_adjustment')),
 document_reference text,
 payer_json jsonb not null,
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 check(period_month=date_trunc('month',effective_on)::date),
 check(tax_kind='output_vat' or (tax_amount>0 and (base_amount is null or base_amount>0))),
 unique(revision_id,source_line_id,tax_kind)
);
create index tax_position_period on public.finance_tax_position_facts(period_month,tax_kind);
create table public.finance_tax_periods (
 period_month date primary key check(extract(day from period_month)=1),
 status text not null default 'open' check(status in ('open','ready_for_review','filed')),
 version integer not null default 1 check(version>0),
 input_vat_status text not null default 'incomplete' check(input_vat_status='incomplete'),
 input_vat_amount numeric(14,2) check(input_vat_amount is null),
 net_vat_amount numeric(14,2) check(net_vat_amount is null),
 filing_reference text,
 filed_on date,
 check((status='filed')=(filing_reference is not null and filed_on is not null))
);
create table public.finance_tax_position_audit (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 revision_id uuid references public.finance_tax_source_revisions(id),
 fact_id uuid references public.finance_tax_position_facts(id),
 period_month date references public.finance_tax_periods(period_month),
 event_type text not null check(event_type in ('materialized','period_transition','source_changed','wht_evidence')),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 actor_id uuid references public.user_profiles(id),
 created_at timestamptz not null default now()
);
create index tax_position_evidence_history on public.finance_tax_position_audit(fact_id,created_at,id);
-- Reserved contract only. No insert path exists in this phase, even for Admin.
create table public.finance_outgoing_wht_obligations (
 id uuid primary key default gen_random_uuid(),
 payout_source_id uuid not null,
 source_line_id uuid not null,
 source_fingerprint text not null,
 payee_json jsonb not null check(jsonb_typeof(payee_json)='object'),
 gross_base numeric(14,2) not null check(gross_base>0),
 explicit_treatment text not null,
 explicit_rate numeric(7,4) not null check(explicit_rate>0 and explicit_rate<=100),
 withheld_amount numeric(14,2) not null check(withheld_amount=round(gross_base*explicit_rate/100,2)),
 withheld_on date not null,
 period_month date not null check(period_month=date_trunc('month',withheld_on)::date),
 currency text not null check(currency='THB'),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 filing_status text not null default 'unfiled' check(filing_status in ('unfiled','filed')),
 remittance_status text not null default 'not_remitted' check(remittance_status in ('not_remitted','partially_remitted','remitted')),
 remitted_amount numeric(14,2) not null default 0 check(remitted_amount>=0 and remitted_amount<=withheld_amount),
 unique(payout_source_id,source_line_id,source_fingerprint)
);

create function public.tax_position_immutable()
returns trigger language plpgsql set search_path=public as $immutable$
begin raise exception 'TAX_POSITION_HISTORY_IMMUTABLE'; end;
$immutable$;
create function public.tax_position_outgoing_unavailable()
returns trigger language plpgsql set search_path=public as $outgoing$
begin raise exception 'TAX_POSITION_OUTGOING_NOT_IMPLEMENTED'; end;
$outgoing$;

-- Pure source projection. Invoice issue alone is not an approved tax point.
-- The Tax Invoice child is the single VAT key for standalone AND Combined.
create function public.tax_position_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare s jsonb; lines jsonb:='[]'; warnings jsonb:='[]'; l jsonb; d public.finance_direct_money_receipts%rowtype;
 p public.finance_payments%rowtype; t public.finance_tax_invoices%rowtype; point public.finance_tax_point_events%rowtype;
 c public.finance_tax_document_corrections%rowtype; r record; moment date; ref text; payer jsonb:='{}'; active boolean:=false;
begin
 if p_type='direct_money_receipt' then
  select * into strict d from public.finance_direct_money_receipts where id=p_id;
  active:=d.status='confirmed'; moment:=d.received_on; ref:=upper(left(d.id::text,8));
  payer:=jsonb_build_object('client_id',d.client_id,'name',d.confirmed_snapshot_json#>>'{facts,payer_name}');
  s:=jsonb_build_object('snapshot',d.confirmed_snapshot_json,'classification',d.classification_json,'version',d.version,'status',d.status);
  if active then
   for l in select value from jsonb_array_elements(coalesce(d.classification_json->'lines',d.confirmed_snapshot_json->'lines')) loop
    if l#>>'{vat_treatment_json,treatment}' in ('standard_rate','zero_rated','exempt','outside_scope','disbursement','pass_through') then
     lines:=lines||jsonb_build_array(jsonb_build_object('line_id',l->'source_line_id','kind','output_vat','base',l->'base',
      'rate',l->'vat_rate','tax',l->'vat','treatment',l#>>'{vat_treatment_json,treatment}','date_basis','confirmed_receipt','evidence',l));
    else warnings:=warnings||jsonb_build_array('vat_treatment_unresolved'); end if;
    if (l->>'wht')::numeric>0 then
     lines:=lines||jsonb_build_array(jsonb_build_object('line_id',l->'source_line_id','kind','incoming_wht','base',l->'wht_base',
      'rate',l->'wht_rate','tax',l->'wht','treatment','structured','date_basis','confirmed_receipt','evidence',l));
    end if;
   end loop;
  end if;
 elsif p_type='payment' then
  select * into strict p from public.finance_payments where id=p_id;
  active:=p.status='confirmed'; moment:=p.received_on; ref:=coalesce(p.internal_reference,upper(left(p.id::text,8)));
  payer:=jsonb_build_object('client_id',p.client_id,'name',p.payer_name);
  s:=jsonb_build_object('payment',to_jsonb(p),'components',(select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]') from public.finance_payment_wht_components w where w.payment_id=p.id),
   'certificates',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.finance_payment_evidence e where payment_id=p.id and evidence_type='wht_certificate'));
  if active and p.currency<>'THB' then warnings:=warnings||jsonb_build_array('currency_outside_phase_scope'); end if;
  if active and p.wht_amount>0 and p.currency='THB' then
   if (select sum(calculated_wht_amount) from public.finance_payment_wht_components where payment_id=p.id)=p.wht_amount then
    for r in select * from public.finance_payment_wht_components where payment_id=p.id and calculated_wht_amount>0 order by id loop
     lines:=lines||jsonb_build_array(jsonb_build_object('line_id',r.id,'kind','incoming_wht','base',r.base_amount,'rate',r.rate_percent,
      'tax',r.calculated_wht_amount,'treatment','structured','date_basis','confirmed_receipt','evidence',to_jsonb(r)||jsonb_build_object('certificates',s->'certificates')));
    end loop;
   else
    warnings:=warnings||jsonb_build_array('wht_structure_unavailable');
    lines:=jsonb_build_array(jsonb_build_object('line_id',p.id,'kind','incoming_wht','base',null,'rate',null,'tax',p.wht_amount,
     'treatment','legacy_unstructured','date_basis','confirmed_receipt','evidence',to_jsonb(p)||jsonb_build_object('certificates',s->'certificates')));
   end if;
  end if;
 elsif p_type='tax_invoice' then
  select * into strict t from public.finance_tax_invoices where id=p_id;
  select * into point from public.finance_tax_point_events where tax_invoice_id=t.id;
  active:=t.status='issued' and point.approved_at is not null; moment:=point.occurred_on; ref:=t.tax_invoice_no;
  payer:=coalesce(t.issued_snapshot_json->'customer','{}');
  s:=jsonb_build_object('snapshot',t.issued_snapshot_json,'point',to_jsonb(point),'status',t.status);
  if active then
   for r in select * from public.finance_tax_invoice_items where tax_invoice_id=t.id order by id loop
    l:=r.source_snapshot_json;
    -- Item source is the frozen Invoice item, not a newly calculated tax value.
    lines:=lines||jsonb_build_array(jsonb_build_object('line_id',r.id,'kind','output_vat','base',r.amount_before_vat,
     'rate',l->'vat_rate','tax',r.vat_amount,'treatment',coalesce(l#>>'{vat_treatment_json,treatment}',t.issued_snapshot_json->>'tax_treatment'),
     'date_basis','approved_tax_point','evidence',to_jsonb(r)));
   end loop;
  end if;
 elsif p_type='tax_correction' then
  select * into strict c from public.finance_tax_document_corrections where id=p_id;
  active:=c.status='issued' and c.correction_mode in ('credit_note','debit_note'); moment:=c.adjustment_date;
  select document_no into ref from public.finance_tax_correction_documents where id=c.id;
  payer:=coalesce(c.source_snapshot_json#>'{tax,customer}','{}');
  s:=jsonb_build_object('correction',to_jsonb(c),'document',(select to_jsonb(x) from public.finance_tax_correction_documents x where id=c.id));
  if active then
   for r in select x.*,i.source_snapshot_json as original_item from public.finance_tax_correction_lines x
    join public.finance_tax_invoice_items i on i.id=x.original_tax_invoice_item_id where correction_id=c.id order by x.id loop
    lines:=lines||jsonb_build_array(jsonb_build_object('line_id',r.id,'kind','output_vat',
     'base',r.base_change*case c.correction_mode when 'credit_note' then -1 else 1 end,
     'rate',r.original_item->'vat_rate','tax',r.vat_change*case c.correction_mode when 'credit_note' then -1 else 1 end,
     'treatment',c.correction_mode,'date_basis','document_adjustment','evidence',to_jsonb(r)));
   end loop;
  end if;
 else raise exception 'TAX_POSITION_SOURCE_INVALID'; end if;
 return jsonb_build_object('source_type',p_type,'source_id',p_id,'active',active,'reference',ref,'effective_on',moment,
  'currency',case when p_type='payment' then p.currency else 'THB' end,'payer',payer,'lines',lines,'warnings',warnings,'source_evidence',s);
end;
$source$;

create function public.tax_position_sync(p_type text,p_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $sync$
declare s jsonb; old public.finance_tax_source_revisions%rowtype; rid uuid; l jsonb; month date; fingerprint text;
begin
 -- One tax-domain lock also serializes period filing against source changes.
 perform pg_advisory_xact_lock(500050);
 s:=public.tax_position_source(p_type,p_id); fingerprint:=md5(s::text);
 select * into old from public.finance_tax_source_revisions where source_type=p_type and source_id=p_id order by revision desc limit 1;
 if old.fingerprint=fingerprint then return old.id; end if;
 if old.id is null and s->'lines'='[]'::jsonb then return null; end if;
 insert into public.finance_tax_source_revisions(source_type,source_id,revision,fingerprint,supersedes_id,evidence_json,reason,actor_id)
 values(p_type,p_id,coalesce(old.revision,0)+1,fingerprint,old.id,s,p_reason,auth.uid()) returning id into rid;
 for l in select value from jsonb_array_elements(s->'lines') loop
  month:=date_trunc('month',(s->>'effective_on')::date)::date;
  insert into public.finance_tax_periods(period_month) values(month) on conflict do nothing;
  insert into public.finance_tax_position_facts(revision_id,source_line_id,tax_kind,effective_on,period_month,currency,base_amount,
   rate_percent,tax_amount,treatment,date_basis,document_reference,payer_json,evidence_json)
  values(rid,(l->>'line_id')::uuid,l->>'kind',(s->>'effective_on')::date,month,s->>'currency',(l->>'base')::numeric,
   (l->>'rate')::numeric,(l->>'tax')::numeric,coalesce(l->>'treatment','unknown'),l->>'date_basis',s->>'reference',s->'payer',l->'evidence');
 end loop;
 for month in select distinct period_month from public.finance_tax_position_facts where revision_id in(rid,old.id) loop
  insert into public.finance_tax_position_audit(period_month,event_type,evidence_json,actor_id)
  select month,'source_changed',jsonb_build_object('previous_period',to_jsonb(p),'new_revision',rid,'reason',p_reason),auth.uid()
  from public.finance_tax_periods p where period_month=month;
  update public.finance_tax_periods set status='open',version=version+1,filing_reference=null,filed_on=null where period_month=month;
 end loop;
 insert into public.finance_tax_position_audit(revision_id,event_type,evidence_json,actor_id)
 values(rid,'materialized',jsonb_build_object('supersedes',old.id,'fingerprint',fingerprint,'reason',p_reason),auth.uid());
 return rid;
end;
$sync$;
create function public.materialize_finance_tax_source(p_type text,p_id uuid,p_expected_source jsonb,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $materialize$
declare s jsonb;
begin
 if public.money_allocation_admin() is distinct from true then raise exception 'TAX_POSITION_ADMIN_REQUIRED'; end if;
 if p_acknowledged is distinct from true or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'TAX_POSITION_ACK_REASON_REQUIRED'; end if;
 -- Source lock precedes the tax-domain lock, matching source confirmation.
 if p_type='payment' then perform 1 from public.finance_payments where id=p_id for update;
 elsif p_type='direct_money_receipt' then perform 1 from public.finance_direct_money_receipts where id=p_id for update;
 elsif p_type='tax_invoice' then perform 1 from public.finance_tax_invoices where id=p_id for update;
 elsif p_type='tax_correction' then perform 1 from public.finance_tax_document_corrections where id=p_id for update;
 else raise exception 'TAX_POSITION_SOURCE_INVALID'; end if;
 s:=public.tax_position_source(p_type,p_id);
 if s is distinct from p_expected_source then raise exception 'TAX_POSITION_SOURCE_CHANGED'; end if;
 return public.tax_position_sync(p_type,p_id,btrim(p_reason));
end;
$materialize$;

create function public.transition_finance_tax_period(p_month date,p_version integer,p_action text,p_reference text,p_filed_on date,p_acknowledged boolean)
returns void language plpgsql security definer set search_path=public as $period$
declare p public.finance_tax_periods%rowtype;
begin
 if public.tax_position_can_manage() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or nullif(btrim(p_reference),'') is null or length(p_reference)>2000 then raise exception 'TAX_POSITION_ACK_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(500050);
 select * into p from public.finance_tax_periods where period_month=p_month for update;
 if p.version is distinct from p_version or p.version is null then raise exception 'TAX_POSITION_SOURCE_CHANGED'; end if;
 if p_action is null or not ((p.status='open' and p_action='ready_for_review') or (p.status='ready_for_review' and p_action='filed')
   or (p.status in ('ready_for_review','filed') and p_action='open')) then raise exception 'TAX_POSITION_TRANSITION_INVALID'; end if;
 if p_action='filed' and (p_filed_on is null or p_filed_on<p_month or p_filed_on>(now() at time zone 'Asia/Bangkok')::date)
 then raise exception 'TAX_POSITION_FILING_DATE_REQUIRED'; end if;
 -- Filing records an external filing reference, never a calculated net or remittance.
 update public.finance_tax_periods set status=p_action,version=version+1,
  filing_reference=case when p_action='filed' then btrim(p_reference) end,filed_on=case when p_action='filed' then p_filed_on end where period_month=p_month;
 insert into public.finance_tax_position_audit(period_month,event_type,evidence_json,actor_id)
 values(p_month,'period_transition',jsonb_build_object('before',to_jsonb(p),'action',p_action,'reference',btrim(p_reference),'filed_on',p_filed_on,'remittance_recorded',false),auth.uid());
end;
$period$;
create function public.record_finance_incoming_wht_evidence(p_fact_id uuid,p_status text,p_reference text,p_acknowledged boolean)
returns void language plpgsql security definer set search_path=public as $evidence$
begin
 if public.tax_position_can_manage() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or nullif(btrim(p_reference),'') is null or length(p_reference)>2000 then raise exception 'TAX_POSITION_ACK_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(500050);
 if p_status is null or p_status not in ('awaiting_evidence','received','verified') or not exists(select 1 from public.finance_tax_position_facts f
  where id=p_fact_id and tax_kind='incoming_wht' and not exists(select 1 from public.finance_tax_source_revisions n where n.supersedes_id=f.revision_id))
 then raise exception 'TAX_POSITION_EVIDENCE_INVALID'; end if;
 insert into public.finance_tax_position_audit(fact_id,event_type,evidence_json,actor_id)
 values(p_fact_id,'wht_evidence',jsonb_build_object('status',p_status,'reference',btrim(p_reference),'claimed',false),auth.uid());
end;
$evidence$;

create function public.get_finance_tax_position()
returns jsonb language plpgsql stable security definer set search_path=public as $read$
declare facts jsonb; periods jsonb; pending jsonb; s jsonb; sources jsonb:='[]'; r record;
begin
 if public.tax_position_can_view() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('source_type',v.source_type,'source_id',v.source_id,
  'source_revision',v.revision,'fingerprint',v.fingerprint,'evidence_status',coalesce(a.evidence_json->>'status',
   case when jsonb_array_length(coalesce(f.evidence_json->'certificates','[]'))>0 then 'received' else 'awaiting_evidence' end),
  'certificate_reference',coalesce(a.evidence_json->>'reference',f.evidence_json#>>'{certificates,0,external_reference}')) order by f.effective_on desc,f.id),'[]') into facts
 from public.finance_tax_position_facts f join public.finance_tax_source_revisions v on v.id=f.revision_id
 left join lateral(select evidence_json from public.finance_tax_position_audit where fact_id=f.id and event_type='wht_evidence' order by sequence desc limit 1) a on true
 where not exists(select 1 from public.finance_tax_source_revisions n where n.supersedes_id=v.id);
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('known_output_vat',coalesce((select sum((f->>'tax_amount')::numeric)
  from jsonb_array_elements(facts) f where f->>'tax_kind'='output_vat' and f->>'period_month'=p.period_month::text),0)) order by p.period_month desc),'[]') into periods from public.finance_tax_periods p;
 if public.money_allocation_admin() then
  for r in select 'direct_money_receipt' as type,id from public.finance_direct_money_receipts where status in ('confirmed','reversed')
   union all select 'payment',id from public.finance_payments where status in ('confirmed','reversed') and wht_amount>0
   union all select 'tax_invoice',id from public.finance_tax_invoices where status='issued'
   union all select 'tax_correction',id from public.finance_tax_document_corrections where status='issued' and correction_mode in ('credit_note','debit_note') loop
   s:=public.tax_position_source(r.type,r.id);
   if (s->'lines'<>'[]'::jsonb or exists(select 1 from public.finance_tax_source_revisions where source_type=r.type and source_id=r.id))
    and not exists(select 1 from public.finance_tax_source_revisions v where source_type=r.type and source_id=r.id and fingerprint=md5(s::text)
      and not exists(select 1 from public.finance_tax_source_revisions n where n.supersedes_id=v.id)) then sources:=sources||jsonb_build_array(s); end if;
  end loop;
 end if;
 -- Observability, not a guessed VAT liability: unapproved/undocumented Invoice
 -- sources and unresolved Direct treatment mean register coverage is incomplete.
 select jsonb_build_object('invoice_items_without_approved_tax_point',(select count(*) from public.finance_invoice_items i
  join public.finance_invoices d on d.id=i.invoice_id where d.document_status='issued' and i.source_state='active' and i.vat_amount>0
   and not exists(select 1 from public.finance_tax_invoice_items ti join public.finance_tax_invoices t on t.id=ti.tax_invoice_id
    join public.finance_tax_point_events e on e.tax_invoice_id=t.id where ti.invoice_item_id=i.id and t.status='issued' and e.approved_at is not null)),
  'unresolved_direct_sources',(select count(*) from public.finance_direct_money_receipts d where status='confirmed'
    and public.tax_position_source('direct_money_receipt',d.id)->'warnings'<>'[]'::jsonb)) into pending;
 return jsonb_build_object('can_manage',public.tax_position_can_manage(),'can_materialize',public.money_allocation_admin(),
  'periods',periods,'facts',facts,'pending_sources',sources,'coverage',pending,'input_vat_complete',false,'outgoing_workflow_available',false,
  'incoming_wht_total',(select coalesce(sum((f->>'tax_amount')::numeric),0) from jsonb_array_elements(facts) f where f->>'tax_kind'='incoming_wht'),
  'history',(select coalesce(jsonb_agg(to_jsonb(a) order by sequence desc),'[]') from public.finance_tax_position_audit a));
end;
$read$;

-- Deferred hooks see the completed source transaction (including WHT components,
-- approved tax points and issued correction documents). No historical scan.
create function public.tax_position_source_changed()
returns trigger language plpgsql security definer set search_path=public as $hook$
begin
 if tg_table_name='finance_payments' then perform public.tax_position_sync('payment',new.id,'Atomic Payment tax evidence');
 elsif tg_table_name='finance_direct_money_receipts' then perform public.tax_position_sync('direct_money_receipt',new.id,'Atomic Direct Money tax evidence');
 elsif tg_table_name='finance_tax_invoices' then perform public.tax_position_sync('tax_invoice',new.id,'Atomic approved tax-point evidence');
 elsif tg_table_name='finance_tax_correction_documents' then
  perform public.tax_position_sync('tax_correction',new.id,'Atomic documentary tax adjustment');
 end if;
 return new;
end;
$hook$;
create constraint trigger tax_position_payment after update on public.finance_payments deferrable initially deferred for each row
 when(old.status is distinct from new.status) execute function public.tax_position_source_changed();
create constraint trigger tax_position_direct after update on public.finance_direct_money_receipts deferrable initially deferred for each row
 when(old.status is distinct from new.status or old.classification_json is distinct from new.classification_json) execute function public.tax_position_source_changed();
create constraint trigger tax_position_invoice after update on public.finance_tax_invoices deferrable initially deferred for each row
 when(old.status is distinct from new.status) execute function public.tax_position_source_changed();
create constraint trigger tax_position_correction after insert on public.finance_tax_correction_documents deferrable initially deferred for each row
 execute function public.tax_position_source_changed();

do $security$
declare t text;
begin
 foreach t in array array['finance_tax_source_revisions','finance_tax_position_facts','finance_tax_periods','finance_tax_position_audit','finance_outgoing_wht_obligations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy tax_position_read on public.%I for select to authenticated using (public.tax_position_can_view())',t);
  execute format('create trigger tax_position_no_truncate before truncate on public.%I for each statement execute function public.tax_position_immutable()',t);
  if t<>'finance_tax_periods' then
   execute format('create trigger tax_position_no_rewrite before update or delete on public.%I for each row execute function public.tax_position_immutable()',t);
  end if;
 end loop;
end;
$security$;
create trigger tax_position_no_outgoing before insert on public.finance_outgoing_wht_obligations for each row execute function public.tax_position_outgoing_unavailable();
revoke all on function public.tax_position_can_view(),public.tax_position_can_manage(),public.tax_position_immutable(),public.tax_position_outgoing_unavailable(),
 public.tax_position_source(text,uuid),public.tax_position_sync(text,uuid,text),public.tax_position_source_changed(),public.get_finance_tax_position(),
 public.materialize_finance_tax_source(text,uuid,jsonb,boolean,text),public.transition_finance_tax_period(date,integer,text,text,date,boolean),
 public.record_finance_incoming_wht_evidence(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.tax_position_can_view(),public.tax_position_can_manage(),public.get_finance_tax_position(),
 public.materialize_finance_tax_source(text,uuid,jsonb,boolean,text),public.transition_finance_tax_period(date,integer,text,text,date,boolean),
 public.record_finance_incoming_wht_evidence(uuid,text,text,boolean) to authenticated;
