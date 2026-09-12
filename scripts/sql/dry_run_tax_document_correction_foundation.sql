BEGIN;
-- Rollback-only rehearsal. No business lifecycle calls; transaction setting rolls back.
select set_config('vp.tax043_before',md5(evidence::text),true) from (select jsonb_build_object(
 'combined',(select to_jsonb(c) from public.finance_combined_documents c where id='d903b209-1e29-4a60-a453-032611a7202f'),
 'tax',(select to_jsonb(t) from public.finance_tax_invoices t where id=(select tax_invoice_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id=(select receipt_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'invoice',(select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'),
 'payment',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'client',(select to_jsonb(c) from public.clients c where id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'profile',(select to_jsonb(p) from public.finance_customer_tax_profiles p where client_id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by c.doc_type,c.year,c.month),'[]') from public.finance_document_counters c)
 ) as evidence) p;
-- BEGIN EMBEDDED MIGRATION 043
-- Candidate only. Documentary correction, never settlement or cash movement.
-- Originals remain byte-identical. Replaced state is derived from append-only links.
do $preflight$
begin
  if to_regclass('public.finance_tax_document_corrections') is not null
    or to_regprocedure('public.finance_customer_tax_identity(uuid)') is null
    or to_regprocedure('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)') is null
  then raise exception 'TAX_CORRECTION_PRECONDITION'; end if;
  if exists(select 1 from public.document_numbering_profiles where document_type in ('credit_note','debit_note') or display_prefix in ('VP-CN','VP-DN'))
    or exists(select 1 from public.finance_document_counters where lower(doc_type) in ('credit_note','debit_note','cn','dn','vp-cn','vp-dn') or prefix ~ '^VP-(CN|DN)-')
  then raise exception 'TAX_CORRECTION_NUMBERING_REVIEW_REQUIRED'; end if;
end;
$preflight$;

insert into public.document_numbering_profiles(document_type,display_prefix,period_scope,sequence_width,is_active)
values('credit_note','VP-CN','monthly',6,true),('debit_note','VP-DN','monthly',6,true);

create table public.finance_tax_document_corrections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  original_tax_invoice_id uuid not null references public.finance_tax_invoices(id) on delete restrict,
  original_combined_document_id uuid references public.finance_combined_documents(id) on delete restrict,
  original_receipt_id uuid references public.finance_receipts(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  payment_id uuid not null references public.finance_payments(id) on delete restrict,
  source_correction_id uuid references public.finance_tax_document_corrections(id) on delete restrict,
  correction_mode text not null check(correction_mode in ('credit_note','debit_note','cancel_and_reissue','replacement_copy')),
  reason text not null check(length(btrim(reason)) between 5 and 2000),
  legal_basis text not null,
  evidence_reference text not null check(length(btrim(evidence_reference)) between 5 and 2000),
  issue_date date not null,
  adjustment_date date not null,
  source_snapshot_json jsonb not null check(jsonb_typeof(source_snapshot_json)='object'),
  draft_snapshot_json jsonb not null check(jsonb_typeof(draft_snapshot_json)='object'),
  request_json jsonb not null,
  status text not null default 'draft' check(status in ('draft','approved','issued','cancelled')),
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references public.user_profiles(id),
  approved_at timestamptz,
  approved_by_user_id uuid references public.user_profiles(id),
  approval_evidence text,
  issued_at timestamptz,
  issued_by_user_id uuid references public.user_profiles(id),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.user_profiles(id),
  cancel_reason text,
  check((original_combined_document_id is null)=(original_receipt_id is null)),
  check((status in ('approved','issued'))=(approved_at is not null and approved_by_user_id is not null and nullif(btrim(approval_evidence),'') is not null)),
  check((status='issued')=(issued_at is not null and issued_by_user_id is not null)),
  check((status='cancelled')=(cancelled_at is not null and cancelled_by_user_id is not null and nullif(btrim(cancel_reason),'') is not null))
);
create unique index tax_correction_open_case on public.finance_tax_document_corrections(original_tax_invoice_id) where status in ('draft','approved');
create unique index tax_correction_evidence_once on public.finance_tax_document_corrections(original_tax_invoice_id,lower(btrim(evidence_reference))) where status<>'cancelled';
create index tax_correction_source_history on public.finance_tax_document_corrections(original_tax_invoice_id,created_at);
create unique index tax_correction_replacement_successor on public.finance_tax_document_corrections(original_tax_invoice_id,coalesce(source_correction_id,original_tax_invoice_id))
where correction_mode='cancel_and_reissue' and status='issued';
create table public.finance_tax_correction_lines (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.finance_tax_document_corrections(id) on delete restrict,
  original_tax_invoice_item_id uuid not null references public.finance_tax_invoice_items(id) on delete restrict,
  base_change numeric(14,2) not null check(base_change>0),
  vat_change numeric(14,2) not null check(vat_change>=0),
  previous_base numeric(14,2) not null check(previous_base>=0),
  previous_vat numeric(14,2) not null check(previous_vat>=0),
  resulting_base numeric(14,2) not null check(resulting_base>=0),
  resulting_vat numeric(14,2) not null check(resulting_vat>=0),
  source_snapshot_json jsonb not null,
  unique(correction_id,original_tax_invoice_item_id)
);
create table public.finance_tax_correction_documents (
  id uuid primary key references public.finance_tax_document_corrections(id) on delete restrict,
  document_type text not null check(document_type in ('credit_note','debit_note','tax_invoice','receipt_tax_invoice','replacement_copy')),
  document_no text not null,
  document_date date not null,
  issued_at timestamptz not null,
  issued_by_user_id uuid not null references public.user_profiles(id),
  copy_sequence integer,
  issued_snapshot_json jsonb not null check(jsonb_typeof(issued_snapshot_json)='object'),
  check((document_type='replacement_copy')=(copy_sequence is not null and copy_sequence>0))
);
create unique index tax_correction_permanent_number on public.finance_tax_correction_documents(document_no) where document_type<>'replacement_copy';
create unique index tax_correction_copy_sequence on public.finance_tax_correction_documents(document_no,copy_sequence) where document_type='replacement_copy';
create table public.finance_tax_correction_audit_events (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.finance_tax_document_corrections(id) on delete restrict,
  event_type text not null check(event_type in ('draft_created','approved','issued','cancelled','replacement_linked','copy_issued')),
  event_payload_json jsonb not null,
  actor_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now()
);
create index tax_correction_audit_history on public.finance_tax_correction_audit_events(correction_id,created_at);

create function public.tax_correction_authorized(p_combined boolean,p_action text)
returns boolean language sql stable security definer set search_path=public as $permission$
 select case p_action
   when 'view' then public.current_user_can_view_finance_tax_invoices() and (not p_combined or public.current_user_can_view_finance_receipts())
   when 'manage' then public.current_user_can_manage_finance_tax_invoices() and (not p_combined or public.current_user_can_manage_finance_receipts())
   when 'issue' then public.current_user_can_issue_finance_tax_invoices() and (not p_combined or public.current_user_can_issue_finance_receipts())
   else false end;
$permission$;
create function public.tax_correction_immutable()
returns trigger language plpgsql set search_path=public as $immutable$
begin
 if tg_op='DELETE' or tg_table_name<>'finance_tax_document_corrections' then raise exception 'TAX_CORRECTION_HISTORY_IMMUTABLE'; end if;
 if old.status not in ('draft','approved') or new.status not in ('approved','issued','cancelled')
   or (old.status='draft' and new.status='issued') or (old.status='approved' and new.status='approved')
   or (to_jsonb(new)-array['status','approved_at','approved_by_user_id','approval_evidence','issued_at','issued_by_user_id','cancelled_at','cancelled_by_user_id','cancel_reason'])
      is distinct from (to_jsonb(old)-array['status','approved_at','approved_by_user_id','approval_evidence','issued_at','issued_by_user_id','cancelled_at','cancelled_by_user_id','cancel_reason'])
 then raise exception 'TAX_CORRECTION_HISTORY_IMMUTABLE'; end if;
 if new.status='issued' and (new.approved_at is distinct from old.approved_at or new.approved_by_user_id is distinct from old.approved_by_user_id
   or new.approval_evidence is distinct from old.approval_evidence) then raise exception 'TAX_CORRECTION_HISTORY_IMMUTABLE'; end if;
 return new;
end;
$immutable$;

-- Canonical source is a frozen documentary envelope, never current Payment/Client.
-- Replacement history overlays originals; existing coverage/settlement remains intact.
create function public.tax_correction_source(p_tax_id uuid,p_combined_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
declare t public.finance_tax_invoices%rowtype; c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; replacement record;
begin
 select * into strict t from public.finance_tax_invoices where id=p_tax_id;
 if t.status<>'issued' or t.issued_snapshot_json is null then raise exception 'TAX_CORRECTION_ISSUED_ORIGINAL_REQUIRED'; end if;
 if t.combined_document_id is distinct from p_combined_id then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
 if p_combined_id is not null then
   select * into strict c from public.finance_combined_documents where id=p_combined_id;
   select * into strict r from public.finance_receipts where id=c.receipt_id;
   if c.status<>'issued' or r.status<>'issued' or c.tax_invoice_id<>t.id or c.payment_id<>t.payment_id or r.payment_id<>t.payment_id
     or r.combined_document_id<>c.id or r.receipt_no<>c.combined_no or t.tax_invoice_no<>c.combined_no
     or c.issued_snapshot_json->'tax_invoice' is distinct from t.issued_snapshot_json
     or c.issued_snapshot_json->'receipt' is distinct from r.issued_snapshot_json
   then raise exception 'TAX_CORRECTION_PAIR_INVALID'; end if;
 end if;
 select x.id,d.issued_snapshot_json into replacement from public.finance_tax_document_corrections x
 join public.finance_tax_correction_documents d on d.id=x.id
 where x.original_tax_invoice_id=t.id and x.correction_mode='cancel_and_reissue' and x.status='issued'
 and not exists(select 1 from public.finance_tax_document_corrections later
   where later.source_correction_id=x.id and later.correction_mode='cancel_and_reissue' and later.status='issued');
 return jsonb_build_object('tax_invoice_id',t.id,'combined_id',p_combined_id,'receipt_id',r.id,'invoice_id',t.invoice_id,'payment_id',t.payment_id,
   'source_correction_id',replacement.id,'document_no',coalesce(replacement.issued_snapshot_json->>'document_no',t.tax_invoice_no),
   'document_date',coalesce(replacement.issued_snapshot_json->>'document_date',t.issue_date::text),
   'tax',coalesce(replacement.issued_snapshot_json->'tax',t.issued_snapshot_json),
   'receipt',coalesce(replacement.issued_snapshot_json->'receipt',r.issued_snapshot_json));
end;
$source$;

create function public.create_finance_tax_correction_draft(p_request_id uuid,p_tax_invoice_id uuid,p_combined_id uuid,p_mode text,
 p_reason text,p_legal_basis text,p_evidence_reference text,p_issue_date date,p_adjustment_date date,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $create$
declare src jsonb; req jsonb; draft jsonb; prior public.finance_tax_document_corrections%rowtype; cid uuid:=gen_random_uuid();
 line jsonb; original public.finance_tax_invoice_items%rowtype; delta numeric; dv numeric; pb numeric; pv numeric;
 lines jsonb:='[]'; buyer jsonb; customer jsonb; sign integer; source_id uuid; totals jsonb;
begin
 if public.tax_correction_authorized(p_combined_id is not null,'manage') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 if p_request_id is null then raise exception 'TAX_CORRECTION_REQUEST_REQUIRED'; end if;
 perform 1 from public.finance_tax_invoices where id=p_tax_invoice_id for update;
 req:=jsonb_build_object('tax',p_tax_invoice_id,'combined',p_combined_id,'mode',p_mode,'reason',p_reason,'basis',p_legal_basis,
   'evidence',p_evidence_reference,'issue_date',p_issue_date,'adjustment_date',p_adjustment_date,'lines',p_lines);
 select * into prior from public.finance_tax_document_corrections where request_id=p_request_id;
 if found then if prior.request_json is distinct from req then raise exception 'TAX_CORRECTION_IDEMPOTENCY_CONFLICT'; end if; return prior.id; end if;
 src:=public.tax_correction_source(p_tax_invoice_id,p_combined_id); source_id:=(src->>'source_correction_id')::uuid;
 if p_mode is null or p_mode not in ('credit_note','debit_note','cancel_and_reissue','replacement_copy')
   or nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5
   or nullif(btrim(p_evidence_reference),'') is null or length(btrim(p_evidence_reference))<5
 then raise exception 'TAX_CORRECTION_REASON_EVIDENCE_REQUIRED'; end if;
 if p_issue_date is null or p_adjustment_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
   or p_adjustment_date>p_issue_date or p_adjustment_date<(src->>'document_date')::date
 then raise exception 'TAX_CORRECTION_DATES_INVALID'; end if;
 if p_mode in ('credit_note','debit_note') and p_issue_date>=(date_trunc('month',p_adjustment_date)+interval '2 months')::date
 then raise exception 'TAX_CORRECTION_ADJUSTMENT_PERIOD_REVIEW_REQUIRED'; end if;
 if p_legal_basis is null or not(case p_mode
   when 'credit_note' then p_legal_basis in ('service_overcharge','service_reduction','service_cancelled')
   when 'debit_note' then p_legal_basis in ('service_undercharge','additional_service')
   when 'cancel_and_reissue' then p_legal_basis='documentary_identity_error'
   when 'replacement_copy' then p_legal_basis in ('lost','destroyed','materially_damaged') else false end)
 then raise exception 'TAX_CORRECTION_MODE_BASIS_INCOMPATIBLE'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'TAX_CORRECTION_LINES_REQUIRED'; end if;
 if exists(select 1 from public.finance_tax_document_corrections where original_tax_invoice_id=p_tax_invoice_id and status in ('draft','approved'))
 then raise exception 'TAX_CORRECTION_OPEN_CASE_EXISTS'; end if;
 if p_mode in ('credit_note','debit_note') then
   if jsonb_array_length(p_lines)=0 then raise exception 'TAX_CORRECTION_LINES_REQUIRED'; end if;
   sign:=case when p_mode='credit_note' then -1 else 1 end;
   for line in select value from jsonb_array_elements(p_lines) loop
     if jsonb_typeof(line) is distinct from 'object' or line-array['item_id','base_change']<>'{}'::jsonb then raise exception 'TAX_CORRECTION_LINE_INVALID'; end if;
     select * into original from public.finance_tax_invoice_items where id=(line->>'item_id')::uuid and tax_invoice_id=p_tax_invoice_id;
     if not found or exists(select 1 from jsonb_array_elements(lines) l where l->>'item_id'=original.id::text)
     then raise exception 'TAX_CORRECTION_SOURCE_COVERAGE_INVALID'; end if;
     delta:=(line->>'base_change')::numeric;
     if delta is null or delta::text in ('NaN','Infinity','-Infinity') or delta<=0 or round(delta,2)<>delta then raise exception 'TAX_CORRECTION_AMOUNT_INVALID'; end if;
     select original.amount_before_vat+coalesce(sum(case x.correction_mode when 'credit_note' then -l.base_change else l.base_change end),0),
       original.vat_amount+coalesce(sum(case x.correction_mode when 'credit_note' then -l.vat_change else l.vat_change end),0)
     into pb,pv from public.finance_tax_correction_lines l join public.finance_tax_document_corrections x on x.id=l.correction_id
     where l.original_tax_invoice_item_id=original.id and x.status='issued';
     -- Credit reductions cannot exceed the effective tax position; debit increases have no original-base cap.
     if sign=-1 and delta>pb
     then raise exception 'TAX_CORRECTION_SOURCE_COVERAGE_EXCEEDED'; end if;
     dv:=case when sign=-1 and delta=pb then pv else round(delta*(original.source_snapshot_json->>'vat_rate')::numeric/100,2) end;
     if dv is null or dv<0 or (sign=-1 and dv>pv) then raise exception 'TAX_CORRECTION_VAT_INVALID'; end if;
     lines:=lines||jsonb_build_array(jsonb_build_object('item_id',original.id,'source',original.source_snapshot_json,
       'original_base',original.amount_before_vat,'original_vat',original.vat_amount,'previous_base',pb,'previous_vat',pv,
       'base_change',delta,'vat_change',dv,'resulting_base',pb+sign*delta,'resulting_vat',pv+sign*dv));
   end loop;
 elsif jsonb_array_length(p_lines)<>0 then raise exception 'TAX_CORRECTION_DOCUMENTARY_AMOUNTS_BLOCKED'; end if;
 draft:=src||jsonb_build_object('schema_version',1,'correction_mode',p_mode,'reason',btrim(p_reason),'legal_basis',p_legal_basis,
   'evidence_reference',btrim(p_evidence_reference),'issue_date',p_issue_date,'adjustment_date',p_adjustment_date,'lines',lines);
 select jsonb_build_object('original_base',sum(amount_before_vat),'original_vat',sum(vat_amount)) into totals
 from public.finance_tax_invoice_items where tax_invoice_id=p_tax_invoice_id;
 select totals||jsonb_build_object('previous_base',(totals->>'original_base')::numeric+coalesce(sum(case x.correction_mode when 'credit_note' then -l.base_change else l.base_change end),0),
   'previous_vat',(totals->>'original_vat')::numeric+coalesce(sum(case x.correction_mode when 'credit_note' then -l.vat_change else l.vat_change end),0)) into totals
 from public.finance_tax_correction_lines l join public.finance_tax_document_corrections x on x.id=l.correction_id
 where x.original_tax_invoice_id=p_tax_invoice_id and x.status='issued';
 select totals||jsonb_build_object('base_change',coalesce(sum((l->>'base_change')::numeric),0),
   'vat_change',coalesce(sum((l->>'vat_change')::numeric),0),
   'resulting_base',(totals->>'previous_base')::numeric+coalesce(sign,0)*coalesce(sum((l->>'base_change')::numeric),0),
   'resulting_vat',(totals->>'previous_vat')::numeric+coalesce(sign,0)*coalesce(sum((l->>'vat_change')::numeric),0)) into totals from jsonb_array_elements(lines) l;
 draft:=draft||jsonb_build_object('totals',totals);
 if p_mode='cancel_and_reissue' then
   buyer:=public.get_finance_customer_tax_profile((src #>> '{tax,customer,id}')::uuid);
   buyer:=jsonb_build_object('schema_version',1,'status',buyer->'status','profile',buyer->'profile');
   if buyer->>'status' is distinct from 'verified' then raise exception 'TAX_CORRECTION_REVIEWED_BUYER_REQUIRED'; end if;
   customer:=(src #> '{tax,customer}')||(buyer #> '{profile,identity_snapshot_json}')||jsonb_build_object(
     'vat_registered',buyer #> '{profile,vat_registered}','branch_type',buyer #> '{profile,branch_type}',
     'branch_code',buyer #> '{profile,branch_code}','supplemental_evidence',buyer #> '{profile,identity_evidence}');
   if nullif(btrim(customer->>'name'),'') is null or nullif(btrim(customer->>'address'),'') is null
     or customer->>'tax_id' !~ '^[0-9]{13}$' then raise exception 'TAX_CORRECTION_REVIEWED_BUYER_REQUIRED'; end if;
   draft:=jsonb_set(draft,'{tax}',(src->'tax')||jsonb_build_object('customer',customer,'buyer_tax_profile',buyer));
   if p_combined_id is not null then draft:=jsonb_set(draft,'{receipt}',(src->'receipt')||jsonb_build_object('customer',customer)); end if;
 end if;
 insert into public.finance_tax_document_corrections(id,request_id,original_tax_invoice_id,original_combined_document_id,original_receipt_id,
   invoice_id,payment_id,source_correction_id,correction_mode,reason,legal_basis,evidence_reference,issue_date,adjustment_date,
   source_snapshot_json,draft_snapshot_json,request_json,created_by_user_id)
 values(cid,p_request_id,p_tax_invoice_id,p_combined_id,(src->>'receipt_id')::uuid,(src->>'invoice_id')::uuid,(src->>'payment_id')::uuid,
   source_id,p_mode,btrim(p_reason),p_legal_basis,btrim(p_evidence_reference),p_issue_date,p_adjustment_date,src,draft,req,auth.uid());
 insert into public.finance_tax_correction_lines(correction_id,original_tax_invoice_item_id,base_change,vat_change,previous_base,previous_vat,resulting_base,resulting_vat,source_snapshot_json)
 select cid,(l->>'item_id')::uuid,(l->>'base_change')::numeric,(l->>'vat_change')::numeric,(l->>'previous_base')::numeric,
   (l->>'previous_vat')::numeric,(l->>'resulting_base')::numeric,(l->>'resulting_vat')::numeric,l->'source' from jsonb_array_elements(lines) l;
 insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id)
 values(cid,'draft_created',jsonb_build_object('reason',p_reason,'legal_basis',p_legal_basis,'evidence_reference',p_evidence_reference,'lines',lines,'number_allocated',false),auth.uid());
 return cid;
end;
$create$;

create function public.approve_finance_tax_correction(p_id uuid,p_reviewed_snapshot_json jsonb,p_legal_acknowledged boolean,p_review_evidence text,p_original_recovered boolean)
returns uuid language plpgsql security definer set search_path=public as $approve$
declare c public.finance_tax_document_corrections%rowtype;
begin
 select * into strict c from public.finance_tax_document_corrections where id=p_id for update;
 if public.tax_correction_authorized(c.original_combined_document_id is not null,'issue') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 if c.draft_snapshot_json is distinct from p_reviewed_snapshot_json then raise exception 'TAX_CORRECTION_STALE_REVIEW'; end if;
 if p_legal_acknowledged is distinct from true or length(btrim(coalesce(p_review_evidence,'')))<5
   or (c.correction_mode='cancel_and_reissue' and p_original_recovered is distinct from true)
 then raise exception 'TAX_CORRECTION_LEGAL_REVIEW_REQUIRED'; end if;
 if c.status='approved' then return c.id; end if;
 if c.status<>'draft' then raise exception 'TAX_CORRECTION_DRAFT_REQUIRED'; end if;
 update public.finance_tax_document_corrections set status='approved',approved_at=now(),approved_by_user_id=auth.uid(),approval_evidence=btrim(p_review_evidence) where id=c.id;
 insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id)
 values(c.id,'approved',jsonb_build_object('legal_acknowledged',true,'review_evidence',p_review_evidence,'original_recovered_and_cancelled',p_original_recovered,'reviewed_snapshot',p_reviewed_snapshot_json),auth.uid());
 return c.id;
end;
$approve$;

create function public.tax_correction_number(p_type text,p_date date)
returns text language plpgsql security definer set search_path=public as $number$
declare prefix text; n integer;
begin
 if p_type not in ('credit_note','debit_note') then return public.generate_finance_document_no(p_type,p_date); end if;
 if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 select display_prefix into prefix from public.document_numbering_profiles where document_type=p_type and is_active and period_scope='monthly' and sequence_width=6
   and display_prefix=case p_type when 'credit_note' then 'VP-CN' else 'VP-DN' end;
 if prefix is null then raise exception 'TAX_CORRECTION_NUMBERING_INVALID'; end if;
 prefix:=prefix||'-'||to_char(p_date,'YYYYMM')||'-';
 insert into public.finance_document_counters(doc_type,year,month,prefix,last_no) values(p_type,extract(year from p_date),extract(month from p_date),prefix,1)
 on conflict(doc_type,year,(coalesce(month,0))) do update set last_no=public.finance_document_counters.last_no+1,updated_at=now() returning last_no into n;
 if n>999999 then raise exception 'TAX_CORRECTION_NUMBERING_EXHAUSTED'; end if;
 return prefix||lpad(n::text,6,'0');
end;
$number$;

create function public.issue_finance_tax_correction(p_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_external_number_checked boolean)
returns uuid language plpgsql security definer set search_path=public as $issue$
declare c public.finance_tax_document_corrections%rowtype; snapshot jsonb; src jsonb; buyer jsonb; number text; typ text; doc_date date; seq integer; moment timestamptz:=now();
begin
 -- Serialize all cases for an original, including repeated Issue calls.
 perform 1 from public.finance_tax_invoices where id=(select original_tax_invoice_id from public.finance_tax_document_corrections where id=p_id) for update;
 select * into strict c from public.finance_tax_document_corrections where id=p_id for update;
 if public.tax_correction_authorized(c.original_combined_document_id is not null,'issue') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or p_external_number_checked is distinct from true then raise exception 'TAX_CORRECTION_ISSUE_ACK_REQUIRED'; end if;
 if c.status='issued' then return c.id; end if;
 if c.status<>'approved' then raise exception 'TAX_CORRECTION_APPROVAL_REQUIRED'; end if;
 if c.draft_snapshot_json is distinct from p_reviewed_snapshot_json then raise exception 'TAX_CORRECTION_STALE_REVIEW'; end if;
 src:=public.tax_correction_source(c.original_tax_invoice_id,c.original_combined_document_id);
 if src is distinct from c.source_snapshot_json then raise exception 'TAX_CORRECTION_SOURCE_SUPERSEDED'; end if;
 if src #> '{tax,seller,logo_asset}' is null or src #> '{tax,seller,logo_asset}' is distinct from
   public.document_logo_evidence(src #>> '{tax,seller,logo_asset,path}') then raise exception 'TAX_CORRECTION_LOGO_EVIDENCE_INVALID'; end if;
 if c.correction_mode='cancel_and_reissue' then
   perform 1 from public.clients where id=(src #>> '{tax,customer,id}')::uuid for share;
   perform 1 from public.finance_customer_tax_profiles where client_id=(src #>> '{tax,customer,id}')::uuid for share;
   buyer:=public.get_finance_customer_tax_profile((src #>> '{tax,customer,id}')::uuid);
   if buyer->>'status' is distinct from 'verified' or buyer->'profile' is distinct from c.draft_snapshot_json #> '{tax,buyer_tax_profile,profile}'
   then raise exception 'TAX_CORRECTION_REVIEWED_BUYER_REQUIRED'; end if;
 end if;
 if c.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_CORRECTION_DATES_INVALID'; end if;
 typ:=case when c.correction_mode='cancel_and_reissue' then case when c.original_combined_document_id is null then 'tax_invoice' else 'receipt_tax_invoice' end else c.correction_mode end;
 -- Documentary reissue retains the original face date (P.86/2542 clause 25).
 doc_date:=case when c.correction_mode in ('cancel_and_reissue','replacement_copy') then (src->>'document_date')::date else c.issue_date end;
 if typ='replacement_copy' then
   number:=src->>'document_no';
   select coalesce(max(copy_sequence),0)+1 into seq from public.finance_tax_correction_documents where document_no=number;
 else number:=public.tax_correction_number(typ,doc_date); end if;
 if typ<>'replacement_copy' and (exists(select 1 from public.finance_tax_invoices where tax_invoice_no=number)
   or exists(select 1 from public.finance_receipts where receipt_no=number)
   or exists(select 1 from public.finance_combined_documents where combined_no=number))
 then raise exception 'TAX_CORRECTION_NUMBER_COLLISION'; end if;
 snapshot:=c.draft_snapshot_json||jsonb_build_object('correction_id',c.id,'document_type',typ,'document_no',number,'document_date',doc_date,
   'original_document_no',src->>'document_no','original_document_date',src->>'document_date','issued_at',moment,'issued_by_user_id',auth.uid(),
   'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid()),
   'approval_evidence',c.approval_evidence,'copy_sequence',seq,'documentary_only',true,'payment_changed',false,'wht_changed',false);
 if c.correction_mode='cancel_and_reissue' then
   snapshot:=jsonb_set(snapshot,'{tax,document}',(snapshot #> '{tax,document}')||jsonb_build_object('tax_invoice_no',number,'issued_at',moment,'correction_id',c.id));
   if c.original_combined_document_id is not null then
     snapshot:=jsonb_set(snapshot,'{receipt,receipt}',(snapshot #> '{receipt,receipt}')||jsonb_build_object('receipt_no',number,'issued_at',moment,'correction_id',c.id));
   end if;
 end if;
 insert into public.finance_tax_correction_documents(id,document_type,document_no,document_date,issued_at,issued_by_user_id,copy_sequence,issued_snapshot_json)
 values(c.id,typ,number,doc_date,moment,auth.uid(),seq,snapshot);
 update public.finance_tax_document_corrections set status='issued',issued_at=moment,issued_by_user_id=auth.uid() where id=c.id;
 insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id)
 values(c.id,case when typ='replacement_copy' then 'copy_issued' else 'issued' end,
 jsonb_build_object('document_no',number,'original_document_no',src->>'document_no','documentary_only',true,'cash_created',false,'wht_changed',false,
   'external_number_checked',true,'lines',snapshot->'lines'),auth.uid());
 if c.correction_mode='cancel_and_reissue' then
   insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id)
   values(c.id,'replacement_linked',jsonb_build_object('original_tax_invoice_id',c.original_tax_invoice_id,'previous_correction_id',c.source_correction_id,
     'old_number',src->>'document_no','new_number',number,'original_state','replaced','original_row_unchanged',true),auth.uid());
 end if;
 return c.id;
end;
$issue$;

create function public.cancel_finance_tax_correction_draft(p_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare c public.finance_tax_document_corrections%rowtype;
begin
 select * into strict c from public.finance_tax_document_corrections where id=p_id for update;
 if public.tax_correction_authorized(c.original_combined_document_id is not null,'manage') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'TAX_CORRECTION_REASON_EVIDENCE_REQUIRED'; end if;
 if c.status='cancelled' then return c.id; end if;
 if c.status not in ('draft','approved') then raise exception 'TAX_CORRECTION_HISTORY_IMMUTABLE'; end if;
 update public.finance_tax_document_corrections set status='cancelled',approved_at=null,approved_by_user_id=null,approval_evidence=null,
   cancelled_at=now(),cancelled_by_user_id=auth.uid(),cancel_reason=btrim(p_reason) where id=c.id;
 insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id) values(c.id,'cancelled',jsonb_build_object('reason',p_reason),auth.uid());
 return c.id;
end;
$cancel$;

-- Fail closed even for a trusted direct SQL mistake. Issued documents must be paired
-- with exactly one issued case; all financial rows stay outside this domain.
create function public.validate_tax_correction_document()
returns trigger language plpgsql security definer set search_path=public as $integrity$
declare c public.finance_tax_document_corrections%rowtype; d public.finance_tax_correction_documents%rowtype; cid uuid; expected_tax jsonb; expected_receipt jsonb;
begin
 cid:=(to_jsonb(new)->>case when tg_table_name='finance_tax_correction_lines' then 'correction_id' else 'id' end)::uuid;
 select * into strict c from public.finance_tax_document_corrections where id=cid;
 select * into d from public.finance_tax_correction_documents where id=cid;
 if c.source_snapshot_json->>'tax_invoice_id' is distinct from c.original_tax_invoice_id::text
   or c.source_snapshot_json->>'combined_id' is distinct from c.original_combined_document_id::text
   or c.source_snapshot_json->>'receipt_id' is distinct from c.original_receipt_id::text
   or c.source_snapshot_json->>'invoice_id' is distinct from c.invoice_id::text
   or c.source_snapshot_json->>'payment_id' is distinct from c.payment_id::text
   or c.source_snapshot_json->>'source_correction_id' is distinct from c.source_correction_id::text
 then raise exception 'TAX_CORRECTION_SOURCE_INTEGRITY'; end if;
 if (select count(*) from public.finance_tax_correction_lines where correction_id=cid)<>jsonb_array_length(c.draft_snapshot_json->'lines')
   or exists(select 1 from jsonb_array_elements(c.draft_snapshot_json->'lines') j
     left join public.finance_tax_correction_lines l on l.correction_id=cid and l.original_tax_invoice_item_id=(j->>'item_id')::uuid
     left join public.finance_tax_invoice_items i on i.id=l.original_tax_invoice_item_id
     where l.id is null or i.tax_invoice_id is distinct from c.original_tax_invoice_id or l.source_snapshot_json is distinct from i.source_snapshot_json
       or l.source_snapshot_json is distinct from j->'source'
       or jsonb_build_array(l.base_change,l.vat_change,l.previous_base,l.previous_vat,l.resulting_base,l.resulting_vat)
          is distinct from jsonb_build_array(j->'base_change',j->'vat_change',j->'previous_base',j->'previous_vat',j->'resulting_base',j->'resulting_vat'))
 then raise exception 'TAX_CORRECTION_LINE_INTEGRITY'; end if;
 if (c.status='issued')<>(d.id is not null) then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 if d.id is not null and (d.issued_at<>c.issued_at or d.issued_by_user_id<>c.issued_by_user_id or d.issued_snapshot_json->>'document_no' is distinct from d.document_no
   or d.issued_snapshot_json->>'correction_id' is distinct from c.id::text
   or d.issued_snapshot_json #> '{tax,payment}' is distinct from c.source_snapshot_json #> '{tax,payment}'
   or d.issued_snapshot_json #> '{tax,tax_point}' is distinct from c.source_snapshot_json #> '{tax,tax_point}'
   or d.issued_snapshot_json #> '{tax,seller}' is distinct from c.source_snapshot_json #> '{tax,seller}'
   or d.issued_snapshot_json #> '{receipt,payment}' is distinct from c.source_snapshot_json #> '{receipt,payment}')
 then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 if d.id is not null then
   expected_tax:=c.draft_snapshot_json->'tax'; expected_receipt:=c.draft_snapshot_json->'receipt';
   if c.correction_mode='cancel_and_reissue' then
     expected_tax:=jsonb_set(expected_tax,'{document}',(expected_tax->'document')||jsonb_build_object('tax_invoice_no',d.document_no,'issued_at',d.issued_at,'correction_id',cid));
     if c.original_combined_document_id is not null then expected_receipt:=jsonb_set(expected_receipt,'{receipt}',(expected_receipt->'receipt')||jsonb_build_object('receipt_no',d.document_no,'issued_at',d.issued_at,'correction_id',cid)); end if;
   end if;
   if d.issued_snapshot_json->'tax' is distinct from expected_tax or d.issued_snapshot_json->'receipt' is distinct from expected_receipt
     or d.issued_snapshot_json->'lines' is distinct from c.draft_snapshot_json->'lines'
     or d.issued_snapshot_json->'totals' is distinct from c.draft_snapshot_json->'totals'
     or d.issued_snapshot_json->>'approval_evidence' is distinct from c.approval_evidence
   then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 end if;
 if d.id is not null and c.correction_mode='cancel_and_reissue' and
   (d.issued_snapshot_json #>> '{tax,document,tax_invoice_no}' is distinct from d.document_no
     or (c.original_combined_document_id is not null and d.issued_snapshot_json #>> '{receipt,receipt,receipt_no}' is distinct from d.document_no))
 then raise exception 'TAX_CORRECTION_PAIR_INVALID'; end if;
 return new;
end;
$integrity$;
create constraint trigger tax_correction_integrity after insert or update on public.finance_tax_document_corrections
deferrable initially deferred for each row execute function public.validate_tax_correction_document();
create constraint trigger tax_correction_integrity after insert on public.finance_tax_correction_documents
deferrable initially deferred for each row execute function public.validate_tax_correction_document();
create constraint trigger tax_correction_integrity after insert on public.finance_tax_correction_lines
deferrable initially deferred for each row execute function public.validate_tax_correction_document();

do $security$
declare tab text;
begin
 foreach tab in array array['finance_tax_document_corrections','finance_tax_correction_lines','finance_tax_correction_documents','finance_tax_correction_audit_events'] loop
   execute format('alter table public.%I enable row level security',tab);
   execute format('revoke all on public.%I from public,anon,authenticated',tab);
   execute format('grant select on public.%I to authenticated',tab);
   execute format('create trigger tax_correction_history before update or delete on public.%I for each row execute function public.tax_correction_immutable()',tab);
 end loop;
end;
$security$;
create policy tax_correction_read on public.finance_tax_document_corrections for select to authenticated
using(public.tax_correction_authorized(original_combined_document_id is not null,'view'));
create policy tax_correction_line_read on public.finance_tax_correction_lines for select to authenticated
using(exists(select 1 from public.finance_tax_document_corrections c where c.id=correction_id));
create policy tax_correction_document_read on public.finance_tax_correction_documents for select to authenticated
using(exists(select 1 from public.finance_tax_document_corrections c where c.id=finance_tax_correction_documents.id));
create policy tax_correction_audit_read on public.finance_tax_correction_audit_events for select to authenticated
using(exists(select 1 from public.finance_tax_document_corrections c where c.id=correction_id));
create function public.get_finance_tax_correction_context(p_tax_invoice_id uuid,p_combined_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $context$
declare source jsonb;
begin
 if public.tax_correction_authorized(p_combined_id is not null,'view') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 source:=public.tax_correction_source(p_tax_invoice_id,p_combined_id);
 return jsonb_build_object('source',source,
   'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.finance_tax_invoice_items i where tax_invoice_id=p_tax_invoice_id),
   'history',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'mode',c.correction_mode,'status',c.status,'created_at',c.created_at,
     'source_correction_id',c.source_correction_id,'number',d.document_no,'document_date',d.document_date) order by c.created_at,c.id),'[]')
     from public.finance_tax_document_corrections c left join public.finance_tax_correction_documents d on d.id=c.id where c.original_tax_invoice_id=p_tax_invoice_id));
end;
$context$;
revoke all on function public.tax_correction_authorized(boolean,text),public.tax_correction_source(uuid,uuid),public.tax_correction_immutable(),
public.tax_correction_number(text,date),public.validate_tax_correction_document() from public,anon,authenticated;
grant execute on function public.tax_correction_authorized(boolean,text) to authenticated;
revoke all on function public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb),
public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean),public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean),
public.cancel_finance_tax_correction_draft(uuid,text),public.get_finance_tax_correction_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb),
public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean),public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean),
public.cancel_finance_tax_correction_draft(uuid,text),public.get_finance_tax_correction_context(uuid,uuid) to authenticated;
-- END EMBEDDED MIGRATION 043
-- ONE SELECT-only statement / ONE result row. No application RPC calls.
-- Compare protected_evidence_and_counters_hash before and after apply. Stop on any failed check.
with expected_functions(signature,hash,security_definer,volatility) as (values ('public.confirm_finance_payment(uuid,boolean)','deae5aa01dc48eb0faa64afa82bca8b7',true,'v'),
('public.reverse_finance_payment(uuid,text)','ef2a35fb3570b503f7447614885b81b2',true,'v'),
('public.issue_finance_receipt(uuid,boolean,jsonb)','04ecfe81a3c72f36587f2e7ec06f0a35',true,'v'),
('public.void_finance_receipt(uuid,text,boolean)','1899822f8a5561379cc46ce002a6b202',true,'v'),
('public.generate_finance_document_no(text,date)','e8930fcf469ccd9980785d55355eef47',true,'v'),
('public.document_logo_evidence(text)','a76bf15714d1c4811e7845033b4afe72',true,'v'),
('public.issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)','db1ea3f2895a8eedb121493d8af86955',true,'v'),
('public.get_finance_document_decision(uuid)','17a217ed95ffb1cd2efb7262921f0f90',true,'v'),
('public.issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)','2207c2d70f98db33a2f18eabe05ca624',true,'v'),
('public.validate_finance_combined_document()','972428305229c19520c4e9b2004aed62',true,'v'),
('public.refresh_finance_combined_document_draft(uuid,timestamptz)','d89ddafc6bedf1d621950a427b9cffea',true,'v'),
('public.finance_customer_tax_identity(uuid)','259e4e1c344e24a112eaecd86bc0f6d6',true,'s'),
('public.get_finance_customer_tax_profile(uuid)','b0f24853759ff637123268398ca5cdba',true,'s'),
('public.tax_correction_authorized(boolean,text)','631685cb02d6f5341a7c3833e6e1c96c',true,'s'),
('public.tax_correction_immutable()','79e399a2ccc65a57c2de196a2b911c4b',false,'v'),
('public.tax_correction_source(uuid,uuid)','da2b8b3f4c32f445d7308d21215f0964',true,'v'),
('public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','0390f91b1d0de3fab08bb229aa1c4bca',true,'v'),
('public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','6c4e70d92395d516fc7ce197a5f533f5',true,'v'),
('public.tax_correction_number(text,date)','e5a4d61c92df8799fd184f0934702693',true,'v'),
('public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','b411350ebe4282d5523abb0716fb4087',true,'v'),
('public.cancel_finance_tax_correction_draft(uuid,text)','21275a37b590ff3b2c2460ceb5da7cf6',true,'v'),
('public.validate_tax_correction_document()','d723374037458f3a6de08361ad71fd14',true,'v'),
('public.get_finance_tax_correction_context(uuid,uuid)','b374fb20853762140b79eb9e1a79bce8',true,'s')),
 function_facts as (select e.*,p.oid,md5(p.prosrc)=e.hash as exact_body,p.proconfig,p.prosecdef,p.provolatile
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
 function_differences as (select * from function_facts where oid is null or exact_body is distinct from true or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or not coalesce(proconfig @> array['search_path=public'],false)),protected_evidence as (select jsonb_build_object(
 'combined',(select to_jsonb(c) from public.finance_combined_documents c where id='d903b209-1e29-4a60-a453-032611a7202f'),
 'tax',(select to_jsonb(t) from public.finance_tax_invoices t where id=(select tax_invoice_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'receipt',(select to_jsonb(r) from public.finance_receipts r where id=(select receipt_id from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 'invoice',(select to_jsonb(i) from public.finance_invoices i where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6'),
 'payment',(select to_jsonb(p) from public.finance_payments p where id='95e22d0e-1996-4f16-98e4-218db1cbd857'),
 'client',(select to_jsonb(c) from public.clients c where id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'profile',(select to_jsonb(p) from public.finance_customer_tax_profiles p where client_id=(select client_id from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 'counters',(select coalesce(jsonb_agg(to_jsonb(c) order by c.doc_type,c.year,c.month),'[]') from public.finance_document_counters c)
 ) as evidence),protected_checks(name,passed) as (values
 ('protected_combined_draft',(select count(*)=1 and bool_and(status='draft' and combined_no is null and issued_at is null and payment_id='95e22d0e-1996-4f16-98e4-218db1cbd857') from public.finance_combined_documents where id='d903b209-1e29-4a60-a453-032611a7202f')),
 ('protected_invoice',(select count(*)=1 and bool_and(document_status='issued' and invoice_no='VP-IV-202609-000004' and total_amount=19280 and amount_before_vat=18672.90 and vat_amount=607.10) from public.finance_invoices where id='a392a5ec-cc84-4c74-bd7a-5636a984f9c6')),
 ('protected_payment',(select count(*)=1 and bool_and(status='confirmed' and cash_amount=19160 and wht_amount=120 and settlement_amount=19280) from public.finance_payments where id='95e22d0e-1996-4f16-98e4-218db1cbd857')),
 ('no_cash_cutover',not exists(select 1 from public.finance_cash_transactions) and not exists(select 1 from public.finance_account_opening_balances)),
 ('existing_number_profiles_compatible',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'tax_invoice' then 'VP-TI' else 'VP-RTI' end) from public.document_numbering_profiles where document_type in ('tax_invoice','receipt_tax_invoice')))),
 expected_catalog as (select value from jsonb_array_elements('[
  {
    "name": "finance_tax_correction_audit_events",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "correction_id",
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
        "name": "event_payload_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "actor_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_correction_audit_events_actor_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_correction_audit_events_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_audit_events_event_type_check",
        "type": "c",
        "definition": "CHECK ((event_type = ANY (ARRAY[''draft_created''::text, ''approved''::text, ''issued''::text, ''cancelled''::text, ''replacement_linked''::text, ''copy_issued''::text])))"
      },
      {
        "name": "finance_tax_correction_audit_events_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_audit_events_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_audit_events_pkey ON public.finance_tax_correction_audit_events USING btree (id)"
      },
      {
        "name": "tax_correction_audit_history",
        "definition": "CREATE INDEX tax_correction_audit_history ON public.finance_tax_correction_audit_events USING btree (correction_id, created_at)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_audit_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_audit_events.correction_id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_audit_events FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      }
    ]
  },
  {
    "name": "finance_tax_correction_documents",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_type",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_no",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "document_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": true
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "copy_sequence",
        "type": "integer",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_correction_documents_check",
        "type": "c",
        "definition": "CHECK (((document_type = ''replacement_copy''::text) = ((copy_sequence IS NOT NULL) AND (copy_sequence > 0))))"
      },
      {
        "name": "finance_tax_correction_documents_document_type_check",
        "type": "c",
        "definition": "CHECK ((document_type = ANY (ARRAY[''credit_note''::text, ''debit_note''::text, ''tax_invoice''::text, ''receipt_tax_invoice''::text, ''replacement_copy''::text])))"
      },
      {
        "name": "finance_tax_correction_documents_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_documents_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_correction_documents_issued_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(issued_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_correction_documents_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_documents_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_documents_pkey ON public.finance_tax_correction_documents USING btree (id)"
      },
      {
        "name": "tax_correction_copy_sequence",
        "definition": "CREATE UNIQUE INDEX tax_correction_copy_sequence ON public.finance_tax_correction_documents USING btree (document_no, copy_sequence) WHERE (document_type = ''replacement_copy''::text)"
      },
      {
        "name": "tax_correction_permanent_number",
        "definition": "CREATE UNIQUE INDEX tax_correction_permanent_number ON public.finance_tax_correction_documents USING btree (document_no) WHERE (document_type <> ''replacement_copy''::text)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_document_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_documents.id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_documents FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT ON public.finance_tax_correction_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  },
  {
    "name": "finance_tax_correction_lines",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "correction_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_tax_invoice_item_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "base_change",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "vat_change",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_base",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "previous_vat",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "resulting_base",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "resulting_vat",
        "type": "numeric(14,2)",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_correction_lines_base_change_check",
        "type": "c",
        "definition": "CHECK ((base_change > (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_lines_correction_id_original_tax_inv_key",
        "type": "u",
        "definition": "UNIQUE (correction_id, original_tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_correction_lines_original_tax_invoice_item_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_tax_invoice_item_id) REFERENCES finance_tax_invoice_items(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_correction_lines_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_correction_lines_previous_base_check",
        "type": "c",
        "definition": "CHECK ((previous_base >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_previous_vat_check",
        "type": "c",
        "definition": "CHECK ((previous_vat >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_resulting_base_check",
        "type": "c",
        "definition": "CHECK ((resulting_base >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_resulting_vat_check",
        "type": "c",
        "definition": "CHECK ((resulting_vat >= (0)::numeric))"
      },
      {
        "name": "finance_tax_correction_lines_vat_change_check",
        "type": "c",
        "definition": "CHECK ((vat_change >= (0)::numeric))"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_correction_lines_correction_id_original_tax_inv_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_lines_correction_id_original_tax_inv_key ON public.finance_tax_correction_lines USING btree (correction_id, original_tax_invoice_item_id)"
      },
      {
        "name": "finance_tax_correction_lines_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_correction_lines_pkey ON public.finance_tax_correction_lines USING btree (id)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_line_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "(EXISTS ( SELECT 1\n   FROM finance_tax_document_corrections c\n  WHERE (c.id = finance_tax_correction_lines.correction_id)))",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_correction_lines FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT ON public.finance_tax_correction_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  },
  {
    "name": "finance_tax_document_corrections",
    "rls": true,
    "columns": [
      {
        "name": "id",
        "type": "uuid",
        "default": "gen_random_uuid()",
        "not_null": true
      },
      {
        "name": "request_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_tax_invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "original_combined_document_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "original_receipt_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "invoice_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "payment_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_correction_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "correction_mode",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "reason",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "legal_basis",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "evidence_reference",
        "type": "text",
        "default": null,
        "not_null": true
      },
      {
        "name": "issue_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "adjustment_date",
        "type": "date",
        "default": null,
        "not_null": true
      },
      {
        "name": "source_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "draft_snapshot_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "request_json",
        "type": "jsonb",
        "default": null,
        "not_null": true
      },
      {
        "name": "status",
        "type": "text",
        "default": "''draft''::text",
        "not_null": true
      },
      {
        "name": "created_at",
        "type": "timestamp with time zone",
        "default": "now()",
        "not_null": true
      },
      {
        "name": "created_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": true
      },
      {
        "name": "approved_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "approved_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "approval_evidence",
        "type": "text",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "issued_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "cancelled_at",
        "type": "timestamp with time zone",
        "default": null,
        "not_null": false
      },
      {
        "name": "cancelled_by_user_id",
        "type": "uuid",
        "default": null,
        "not_null": false
      },
      {
        "name": "cancel_reason",
        "type": "text",
        "default": null,
        "not_null": false
      }
    ],
    "constraints": [
      {
        "name": "finance_tax_document_correcti_original_combined_document_i_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_combined_document_id) REFERENCES finance_combined_documents(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_approved_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (approved_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_cancelled_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (cancelled_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_check",
        "type": "c",
        "definition": "CHECK (((original_combined_document_id IS NULL) = (original_receipt_id IS NULL)))"
      },
      {
        "name": "finance_tax_document_corrections_check1",
        "type": "c",
        "definition": "CHECK (((status = ANY (ARRAY[''approved''::text, ''issued''::text])) = ((approved_at IS NOT NULL) AND (approved_by_user_id IS NOT NULL) AND (NULLIF(btrim(approval_evidence), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_check2",
        "type": "c",
        "definition": "CHECK (((status = ''issued''::text) = ((issued_at IS NOT NULL) AND (issued_by_user_id IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_check3",
        "type": "c",
        "definition": "CHECK (((status = ''cancelled''::text) = ((cancelled_at IS NOT NULL) AND (cancelled_by_user_id IS NOT NULL) AND (NULLIF(btrim(cancel_reason), ''''::text) IS NOT NULL))))"
      },
      {
        "name": "finance_tax_document_corrections_correction_mode_check",
        "type": "c",
        "definition": "CHECK ((correction_mode = ANY (ARRAY[''credit_note''::text, ''debit_note''::text, ''cancel_and_reissue''::text, ''replacement_copy''::text])))"
      },
      {
        "name": "finance_tax_document_corrections_created_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_draft_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(draft_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_document_corrections_evidence_reference_check",
        "type": "c",
        "definition": "CHECK (((length(btrim(evidence_reference)) >= 5) AND (length(btrim(evidence_reference)) <= 2000)))"
      },
      {
        "name": "finance_tax_document_corrections_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_issued_by_user_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (issued_by_user_id) REFERENCES user_profiles(id)"
      },
      {
        "name": "finance_tax_document_corrections_original_receipt_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_receipt_id) REFERENCES finance_receipts(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_original_tax_invoice_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (original_tax_invoice_id) REFERENCES finance_tax_invoices(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_payment_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_pkey",
        "type": "p",
        "definition": "PRIMARY KEY (id)"
      },
      {
        "name": "finance_tax_document_corrections_reason_check",
        "type": "c",
        "definition": "CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 2000)))"
      },
      {
        "name": "finance_tax_document_corrections_request_id_key",
        "type": "u",
        "definition": "UNIQUE (request_id)"
      },
      {
        "name": "finance_tax_document_corrections_source_correction_id_fkey",
        "type": "f",
        "definition": "FOREIGN KEY (source_correction_id) REFERENCES finance_tax_document_corrections(id) ON DELETE RESTRICT"
      },
      {
        "name": "finance_tax_document_corrections_source_snapshot_json_check",
        "type": "c",
        "definition": "CHECK ((jsonb_typeof(source_snapshot_json) = ''object''::text))"
      },
      {
        "name": "finance_tax_document_corrections_status_check",
        "type": "c",
        "definition": "CHECK ((status = ANY (ARRAY[''draft''::text, ''approved''::text, ''issued''::text, ''cancelled''::text])))"
      },
      {
        "name": "tax_correction_integrity",
        "type": "t",
        "definition": "TRIGGER DEFERRABLE INITIALLY DEFERRED"
      }
    ],
    "indexes": [
      {
        "name": "finance_tax_document_corrections_pkey",
        "definition": "CREATE UNIQUE INDEX finance_tax_document_corrections_pkey ON public.finance_tax_document_corrections USING btree (id)"
      },
      {
        "name": "finance_tax_document_corrections_request_id_key",
        "definition": "CREATE UNIQUE INDEX finance_tax_document_corrections_request_id_key ON public.finance_tax_document_corrections USING btree (request_id)"
      },
      {
        "name": "tax_correction_evidence_once",
        "definition": "CREATE UNIQUE INDEX tax_correction_evidence_once ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, lower(btrim(evidence_reference))) WHERE (status <> ''cancelled''::text)"
      },
      {
        "name": "tax_correction_open_case",
        "definition": "CREATE UNIQUE INDEX tax_correction_open_case ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id) WHERE (status = ANY (ARRAY[''draft''::text, ''approved''::text]))"
      },
      {
        "name": "tax_correction_replacement_successor",
        "definition": "CREATE UNIQUE INDEX tax_correction_replacement_successor ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, COALESCE(source_correction_id, original_tax_invoice_id)) WHERE ((correction_mode = ''cancel_and_reissue''::text) AND (status = ''issued''::text))"
      },
      {
        "name": "tax_correction_source_history",
        "definition": "CREATE INDEX tax_correction_source_history ON public.finance_tax_document_corrections USING btree (original_tax_invoice_id, created_at)"
      }
    ],
    "policies": [
      {
        "name": "tax_correction_read",
        "check": null,
        "roles": [
          "authenticated"
        ],
        "using": "tax_correction_authorized((original_combined_document_id IS NOT NULL), ''view''::text)",
        "command": "SELECT"
      }
    ],
    "triggers": [
      {
        "name": "tax_correction_history",
        "enabled": "O",
        "definition": "CREATE TRIGGER tax_correction_history BEFORE DELETE OR UPDATE ON public.finance_tax_document_corrections FOR EACH ROW EXECUTE FUNCTION tax_correction_immutable()"
      },
      {
        "name": "tax_correction_integrity",
        "enabled": "O",
        "definition": "CREATE CONSTRAINT TRIGGER tax_correction_integrity AFTER INSERT OR UPDATE ON public.finance_tax_document_corrections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_tax_correction_document()"
      }
    ]
  }
]
'::jsonb)), actual_catalog as (select c.relname as name,c.relrowsecurity as rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid)) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('finance_tax_document_corrections','finance_tax_correction_lines','finance_tax_correction_documents','finance_tax_correction_audit_events') order by c.relname),
 catalog_differences as (select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 checks(name,passed) as (select * from protected_checks union all select * from (values
 ('exact_043_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_tables_policies_triggers',not exists(select 1 from catalog_differences)),
 ('rpc_private_privileges',(has_function_privilege('authenticated','public.tax_correction_authorized(boolean,text)','EXECUTE')=true and not has_function_privilege('anon','public.tax_correction_authorized(boolean,text)','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_immutable()','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_immutable()','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_source(uuid,uuid)','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_source(uuid,uuid)','EXECUTE')) and (has_function_privilege('authenticated','public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','EXECUTE')=true and not has_function_privilege('anon','public.create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)','EXECUTE')) and (has_function_privilege('authenticated','public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','EXECUTE')=true and not has_function_privilege('anon','public.approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.tax_correction_number(text,date)','EXECUTE')=false and not has_function_privilege('anon','public.tax_correction_number(text,date)','EXECUTE')) and (has_function_privilege('authenticated','public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','EXECUTE')=true and not has_function_privilege('anon','public.issue_finance_tax_correction(uuid,jsonb,boolean,boolean)','EXECUTE')) and (has_function_privilege('authenticated','public.cancel_finance_tax_correction_draft(uuid,text)','EXECUTE')=true and not has_function_privilege('anon','public.cancel_finance_tax_correction_draft(uuid,text)','EXECUTE')) and (has_function_privilege('authenticated','public.validate_tax_correction_document()','EXECUTE')=false and not has_function_privilege('anon','public.validate_tax_correction_document()','EXECUTE')) and (has_function_privilege('authenticated','public.get_finance_tax_correction_context(uuid,uuid)','EXECUTE')=true and not has_function_privilege('anon','public.get_finance_tax_correction_context(uuid,uuid)','EXECUTE'))),
 ('browser_direct_mutation_blocked',(select count(*)=4 and bool_and(relrowsecurity and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) from pg_class where oid in ('public.finance_tax_document_corrections'::regclass,'public.finance_tax_correction_lines'::regclass,'public.finance_tax_correction_documents'::regclass,'public.finance_tax_correction_audit_events'::regclass))),
 ('correction_zero_state',not exists(select 1 from public.finance_tax_document_corrections) and not exists(select 1 from public.finance_tax_correction_lines) and not exists(select 1 from public.finance_tax_correction_documents) and not exists(select 1 from public.finance_tax_correction_audit_events)),
 ('cn_dn_profiles',(select count(*)=2 and bool_and(is_active and period_scope='monthly' and sequence_width=6 and display_prefix=case document_type when 'credit_note' then 'VP-CN' else 'VP-DN' end) from public.document_numbering_profiles where document_type in ('credit_note','debit_note'))),
 ('no_cn_dn_numbers_consumed',not exists(select 1 from public.finance_document_counters where doc_type in ('credit_note','debit_note') or prefix ~ '^VP-(CN|DN)-')),
 ('dry_run_protected_evidence_unchanged',nullif(current_setting('vp.tax043_before',true),'') is null or current_setting('vp.tax043_before',true)=(select md5(evidence::text) from protected_evidence))
 ) x(name,passed)) select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as tax_document_correction_foundation_verification_pass,
 (select md5(evidence::text) from protected_evidence) as protected_evidence_and_counters_hash,
 (select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_differences f) as function_differences,
 current_setting('server_version_num')::integer as catalog_server_version_num,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from catalog_differences d) as catalog_differences,
 jsonb_build_object('finance_tax_document_corrections',(select count(*) from public.finance_tax_document_corrections),'finance_tax_correction_lines',(select count(*) from public.finance_tax_correction_lines),'finance_tax_correction_documents',(select count(*) from public.finance_tax_correction_documents),'finance_tax_correction_audit_events',(select count(*) from public.finance_tax_correction_audit_events)) as correction_rows;
ROLLBACK;
