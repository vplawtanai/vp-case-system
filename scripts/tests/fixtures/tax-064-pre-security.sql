-- CANDIDATE 064 — manual Production gate. No backfill or cash/expense writes.
create table public.finance_external_input_vat (
 id uuid primary key,
 vendor text not null check(length(btrim(vendor)) between 1 and 300),
 invoice_date date not null,
 invoice_number text not null check(length(btrim(invoice_number)) between 1 and 200),
 tax_base numeric(14,2) not null check(tax_base>0),
 vat_amount numeric(14,2) not null check(vat_amount>0 and vat_amount<=tax_base),
 note text not null check(length(btrim(note)) between 1 and 2000),
 funding_source text not null default 'third_party_no_reimbursement' check(funding_source='third_party_no_reimbursement'),
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now(),
 input_json jsonb not null
);
create unique index external_input_vat_invoice_unique on public.finance_external_input_vat(lower(btrim(vendor)),invoice_date,lower(btrim(invoice_number)));
create table public.finance_external_input_vat_reviews (
 id uuid primary key,
 evidence_id uuid not null references public.finance_external_input_vat(id),
 previous_id uuid unique references public.finance_external_input_vat_reviews(id),
 status text not null check(status in ('eligible','ineligible','pending')),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null default now()
);
create unique index external_input_vat_initial_review on public.finance_external_input_vat_reviews(evidence_id) where previous_id is null;
alter table public.finance_external_input_vat enable row level security;
alter table public.finance_external_input_vat_reviews enable row level security;
revoke all on public.finance_external_input_vat,public.finance_external_input_vat_reviews from public,anon,authenticated;
create trigger external_input_vat_immutable before update or delete or truncate on public.finance_external_input_vat for each statement execute function public.tax_position_immutable();
create trigger external_input_vat_reviews_immutable before update or delete or truncate on public.finance_external_input_vat_reviews for each statement execute function public.tax_position_immutable();

alter table public.finance_tax_source_revisions drop constraint finance_tax_source_revisions_source_type_check;
alter table public.finance_tax_source_revisions add constraint finance_tax_source_revisions_source_type_check
 check(source_type in ('direct_money_receipt','payment','tax_invoice','tax_correction','expense','external_input_vat'));
alter table public.finance_tax_position_facts drop constraint finance_tax_position_facts_date_basis_check;
alter table public.finance_tax_position_facts add constraint finance_tax_position_facts_date_basis_check
 check(date_basis in ('confirmed_receipt','approved_tax_point','document_adjustment','reviewed_expense_document','reviewed_external_document'));
alter function public.tax_position_source(text,uuid) rename to tax_position_source_before_external_input;
create function public.tax_position_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_external_input_vat%rowtype;r public.finance_external_input_vat_reviews%rowtype;lines jsonb:='[]';
begin
 if p_type<>'external_input_vat' then return public.tax_position_source_before_external_input(p_type,p_id); end if;
 select * into strict e from public.finance_external_input_vat where id=p_id;
 select * into r from public.finance_external_input_vat_reviews x where evidence_id=p_id
  and not exists(select 1 from public.finance_external_input_vat_reviews n where n.previous_id=x.id);
 if r.status='eligible' then lines:=jsonb_build_array(jsonb_build_object('line_id',e.id,'kind','input_vat',
  'base',e.tax_base,'rate',null,'tax',e.vat_amount,'treatment','reviewed_eligible','date_basis','reviewed_external_document','evidence',to_jsonb(r))); end if;
 return jsonb_build_object('source_type',p_type,'source_id',e.id,'active',true,'reference',e.invoice_number,
  'effective_on',e.invoice_date,'currency','THB','payer',jsonb_build_object('name',e.vendor),'lines',lines,'warnings','[]'::jsonb,
  'source_evidence',jsonb_build_object('document',to_jsonb(e),'review',to_jsonb(r)));
end;
$fn$;
create function public.save_finance_external_input_vat(p_id uuid,p_input jsonb,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare old public.finance_external_input_vat%rowtype;
begin
 if public.tax_position_can_manage() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or p_id is null or jsonb_typeof(p_input) is distinct from 'object'
  or p_input->>'funding_source' is distinct from 'third_party_no_reimbursement'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('vendor','invoice_date','invoice_number','tax_base','vat_amount','note','funding_source'))
  or (p_input->>'tax_base')::numeric<>round((p_input->>'tax_base')::numeric,2)
  or (p_input->>'vat_amount')::numeric<>round((p_input->>'vat_amount')::numeric,2)
  then raise exception 'TAX_POSITION_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(500050);
 select * into old from public.finance_external_input_vat where id=p_id;
 if found then
  if old.input_json is distinct from p_input then raise exception 'TAX_POSITION_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 insert into public.finance_external_input_vat(id,vendor,invoice_date,invoice_number,tax_base,vat_amount,note,created_by,input_json)
 values(p_id,btrim(p_input->>'vendor'),(p_input->>'invoice_date')::date,btrim(p_input->>'invoice_number'),
  (p_input->>'tax_base')::numeric,(p_input->>'vat_amount')::numeric,btrim(p_input->>'note'),auth.uid(),p_input);
 return p_id;
end;
$fn$;
create function public.review_finance_external_input_vat(p_id uuid,p_evidence uuid,p_previous uuid,p_status text,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare old public.finance_external_input_vat_reviews%rowtype;latest uuid;
begin
 if public.tax_position_can_manage() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or p_id is null then raise exception 'TAX_POSITION_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(500050);
 select * into old from public.finance_external_input_vat_reviews where id=p_id;
 if found then
  if old.evidence_id is distinct from p_evidence or old.previous_id is distinct from p_previous or old.status is distinct from p_status or old.reason is distinct from btrim(p_reason)
   then raise exception 'TAX_POSITION_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 select id into latest from public.finance_external_input_vat_reviews x where evidence_id=p_evidence
  and not exists(select 1 from public.finance_external_input_vat_reviews n where n.previous_id=x.id);
 if latest is distinct from p_previous then raise exception 'TAX_POSITION_SOURCE_CHANGED'; end if;
 insert into public.finance_external_input_vat_reviews(id,evidence_id,previous_id,status,reason,actor_id)
 values(p_id,p_evidence,p_previous,p_status,btrim(p_reason),auth.uid());
 perform public.tax_position_sync('external_input_vat',p_evidence,btrim(p_reason));
 return p_id;
end;
$fn$;
create function public.get_finance_tax_input_evidence(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if public.tax_position_can_view() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'TAX_POSITION_INPUT_INVALID'; end if;
 return jsonb_build_object('can_manage',public.tax_position_can_manage(),'external',
  (select coalesce(jsonb_agg(to_jsonb(e)-'input_json'||jsonb_build_object('review',
   (select to_jsonb(r) from public.finance_external_input_vat_reviews r where r.evidence_id=e.id and not exists(select 1 from public.finance_external_input_vat_reviews n where n.previous_id=r.id))) order by e.invoice_date,e.id),'[]')
   from public.finance_external_input_vat e where date_trunc('month',e.invoice_date)::date=p_month),
  'expenses',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'origin',e.origin,'vendor',e.vendor_name,'reference',r.tax_document_reference,
   'invoice_date',coalesce(r.tax_document_date,e.expense_date),'tax_base',r.vat_base,'vat_amount',r.vat_amount,'status',coalesce(r.eligibility,'pending')) order by e.id),'[]')
   from public.finance_expenses e left join lateral(select * from public.finance_expense_tax_reviews x where x.expense_id=e.id order by revision desc limit 1) r on true
   where e.status='accepted' and date_trunc('month',coalesce(r.tax_document_date,e.expense_date))::date=p_month
    and (r.vat_state is distinct from 'none') and (r.vat_amount>0 or r.vat_amount is null)));
end;
$fn$;
revoke all on function public.tax_position_source(text,uuid),public.tax_position_source_before_external_input(text,uuid),
 public.save_finance_external_input_vat(uuid,jsonb,boolean),public.review_finance_external_input_vat(uuid,uuid,uuid,text,text,boolean),public.get_finance_tax_input_evidence(date) from public,anon,authenticated;
grant execute on function public.save_finance_external_input_vat(uuid,jsonb,boolean),public.review_finance_external_input_vat(uuid,uuid,uuid,text,text,boolean),public.get_finance_tax_input_evidence(date) to authenticated;
