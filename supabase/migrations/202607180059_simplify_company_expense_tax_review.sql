-- CANDIDATE 059. Manual Production gate. No backfill or business-row mutation.
-- Creator declarations stay immutable; structured tax review owns reviewed totals.
create function public.company_expense_tax_calculation(p_expense uuid,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; mode text:=p_input->>'vat_mode'; ws text:=p_input->>'wht_state';
 base numeric; vat numeric:=0; gross numeric; rate numeric; wr numeric; wht numeric:=0; errors text[]:='{}';
begin
 select * into strict e from public.finance_expenses where id=p_expense;
 if e.origin<>'company_purchase' or e.personally_paid or jsonb_typeof(p_input) is distinct from 'object'
 then raise exception 'EXPENSE_COMPANY_TAX_INPUT_INVALID'; end if;
 if mode is null or mode not in ('none','inclusive','exclusive') then errors:=array_append(errors,'companyNeedVat');
 else
  rate:=case when mode='none' then 0 else (p_input->>'vat_rate')::numeric end;
  if rate is null or rate not in (0,7) then errors:=array_append(errors,'companyNeedVat');
  else
   base:=case when mode='inclusive' then round(e.gross_amount/(1+rate/100),2) else e.gross_amount end;
   vat:=case when mode='inclusive' then e.gross_amount-base else round(base*rate/100,2) end;
   gross:=base+vat;
  end if;
 end if;
 if ws is null or ws not in ('none','withhold') then wht:=null;errors:=array_append(errors,'companyNeedWht');
 elsif ws='withhold' then
  wr:=(p_input->>'wht_rate')::numeric;
  if wr is null or wr not in (1,3,5) then wht:=null;errors:=array_append(errors,'companyNeedWht');
  else wht:=round(base*wr/100,2);end if;
  if e.creator_payment_fact='company_paid' and (p_input->>'paid_withholding_ack') is distinct from 'true'
   then errors:=array_append(errors,'companyPaidWhtAck');end if;
  if e.creator_payment_fact='company_paid' and not exists(select 1 from public.finance_payees where id=e.supplier_payee_id and is_active and tax_id is not null)
   then errors:=array_append(errors,'companyNeedSupplier');end if;
  if exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='confirmed'
   and choices_json#>>'{0,expense_id}'=p_expense::text and wht_amount=0)
   then errors:=array_append(errors,'companyWhtExceptionBlock');end if;
 end if;
 if mode<>'none' then
  if p_input->>'eligibility' is null or p_input->>'eligibility' not in ('eligible','ineligible','pending') then errors:=array_append(errors,'companyNeedVat');end if;
  if p_input->>'eligibility'='eligible' and (coalesce(p_input->>'supplier_tax_id','') !~ '^[0-9]{13}$'
   or nullif(btrim(p_input->>'tax_document_reference'),'') is null or nullif(p_input->>'tax_document_date','') is null
   or p_input->>'company_name_status' is distinct from 'yes') then errors:=array_append(errors,'companyNeedVatEvidence');end if;
 end if;
 if (exists(select 1 from public.finance_expense_tax_reviews where expense_id=e.id)
  or (e.creator_payment_fact='company_paid' and ws='withhold')) and nullif(btrim(p_input->>'reason'),'') is null
 then errors:=array_append(errors,'companyNeedReason');end if;
 if exists(select 1 from public.finance_expense_settlements where expense_id=e.id and amount<>gross)
  or exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='confirmed' and choices_json#>>'{0,expense_id}'=e.id::text
   and (gross_amount<>gross or wht_amount<>wht)) then errors:=array_append(errors,'companyTaxMoneyFrozen');end if;
 return jsonb_build_object('schema_version',2,'declared_amount',e.gross_amount,'vat_mode',mode,'vat_base',base,'vat_rate',rate,
  'vat_amount',case when base is null then null else vat end,'gross',gross,'wht_base',case when ws='withhold' then base when ws='none' then 0 end,'wht_rate',coalesce(wr,0),
  'wht_amount',wht,'net',gross-wht,'ready',cardinality(errors)=0,'missing',to_jsonb(errors));
end;
$fn$;
create function public.preview_finance_company_expense_tax(p_expense uuid,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_can_tax_review() or not public.expense_can_read(p_expense) then raise exception 'EXPENSE_TAX_PERMISSION_DENIED';end if;
 return public.company_expense_tax_calculation(p_expense,p_input);
end;
$fn$;
create function public.company_expense_reviewed_gross(p_expense uuid)
returns numeric language sql stable security definer set search_path=public as $fn$
 select coalesce((select case when r.request_json->>'schema_version'='2' then (r.request_json#>>'{calculation,gross}')::numeric end from public.finance_expense_tax_reviews r
  where r.expense_id=e.id order by revision desc limit 1),e.gross_amount) from public.finance_expenses e where e.id=p_expense;
$fn$;

-- Optional company notes do not relax rejection, Claim or correction reasons.
do $constraints$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.finance_expenses'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%review_reason%' loop
  execute format('alter table public.finance_expenses drop constraint %I',c.conname);
 end loop;
 for c in select conname from pg_constraint where conrelid='public.finance_expense_tax_reviews'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%num_nonnulls(vat_base%' loop
  execute format('alter table public.finance_expense_tax_reviews drop constraint %I',c.conname);
 end loop;
end;
$constraints$;
alter table public.finance_expense_tax_reviews add constraint expense_review_vat_amount check(
 (vat_state='exists' and vat_base>0 and vat_rate>=0 and vat_rate<=100 and num_nonnulls(vat_base,vat_rate,vat_amount)=3
  and (vat_amount=round(vat_base*vat_rate/100,2) or (request_json->>'schema_version'='2' and request_json->>'vat_mode'='inclusive'
   and vat_base=round((request_json#>>'{calculation,declared_amount}')::numeric/(1+vat_rate/100),2)
   and vat_amount=(request_json#>>'{calculation,declared_amount}')::numeric-vat_base)))
 or (vat_state<>'exists' and num_nonnulls(vat_base,vat_rate,vat_amount)=0));
alter table public.finance_expenses add constraint expense_review_actor_reason check(
 (status in ('accepted','rejected'))=(reviewed_at is not null and reviewed_by is not null)
 and (status not in ('accepted','rejected') or (origin='company_purchase' and not personally_paid and status='accepted') or nullif(btrim(review_reason),'') is not null));
alter table public.finance_expense_tax_reviews drop constraint finance_expense_tax_reviews_reason_check;
alter table public.finance_expense_tax_reviews add constraint finance_expense_tax_reviews_reason_check check(
 length(btrim(reason)) between 1 and 2000 or (reason='' and revision=1 and not wht_exception and request_json->>'schema_version'='2'));
alter table public.finance_expense_settlements drop constraint finance_expense_settlements_reason_check;
alter table public.finance_expense_settlements add constraint finance_expense_settlements_reason_check check(length(btrim(reason))<=2000);
alter table public.finance_tax_source_revisions drop constraint finance_tax_source_revisions_reason_check;
alter table public.finance_tax_source_revisions add constraint finance_tax_source_revisions_reason_check check(
 length(btrim(reason)) between 1 and 2000 or (reason='' and source_type='expense'
  and evidence_json#>>'{source_evidence,tax_review,request_json,schema_version}'='2'
  and evidence_json#>>'{source_evidence,tax_review,revision}'='1'));

create or replace function public.review_finance_expense(p_id uuid,p_version integer,p_accept boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;

 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));select * into e from public.finance_expenses where id=p_id for update;
 if p_accept is null or ((not p_accept or e.origin<>'company_purchase' or e.personally_paid) and nullif(btrim(p_reason),'') is null)
  or length(coalesce(p_reason,''))>2000 then raise exception 'EXPENSE_REASON_REQUIRED';end if;
 if e.status is distinct from 'submitted' or e.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 update public.finance_expenses set status=case when p_accept then 'accepted' else 'rejected' end,version=version+1,
  reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),review_reason=btrim(p_reason),updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 select p_id,x.status,auth.uid(),to_jsonb(x) from public.finance_expenses x where id=p_id;
 return p_id;
end;
$fn$;

create or replace function public.review_finance_expense_tax(p_id uuid,p_expense uuid,p_previous uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; old public.finance_expense_tax_reviews%rowtype;r public.finance_expense_tax_reviews%rowtype;
 vb numeric; vr numeric; wb numeric; wr numeric; calc jsonb; raw_input jsonb:=p_input; structured boolean:=p_input->>'schema_version'='2'; effective numeric;
begin
 if not public.expense_can_tax_review() then raise exception 'EXPENSE_TAX_PERMISSION_DENIED'; end if;
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 select * into e from public.finance_expenses where id=p_expense for update;
 if e.status is distinct from 'accepted' then raise exception 'EXPENSE_ACCEPTED_REQUIRED'; end if;
 if exists(select 1 from public.finance_expense_tax_reviews where id=p_id) then
  select * into r from public.finance_expense_tax_reviews where id=p_id;
  if r.expense_id<>p_expense or coalesce(r.request_json->'raw_input',r.request_json) is distinct from p_input then raise exception 'EXPENSE_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 select * into old from public.finance_expense_tax_reviews where expense_id=p_expense order by revision desc limit 1;
 if old.id is distinct from p_previous then raise exception 'EXPENSE_STALE'; end if;
 if structured then
  calc:=public.company_expense_tax_calculation(p_expense,p_input);
  if calc->>'ready'<>'true' then raise exception 'EXPENSE_TAX_DECISIONS_REQUIRED: %',calc->'missing';end if;
  effective:=(calc->>'gross')::numeric;
  p_input:=p_input||jsonb_build_object('raw_input',raw_input,'calculation',calc,
   'vat_state',case when p_input->>'vat_mode'='none' then 'none' else 'exists' end,
   'vat_base',calc->'vat_base','vat_rate',calc->'vat_rate','wht_base',calc->'wht_base','wht_rate',calc->'wht_rate',
   'eligibility',case when p_input->>'vat_mode'='none' then 'ineligible' else p_input->>'eligibility' end,'reason',coalesce(btrim(p_input->>'reason'),''));
  if p_input->>'eligibility'<>'eligible' then p_input:=p_input||jsonb_build_object('supplier_tax_id',null,'tax_document_reference',null,'tax_document_date',null,'company_name_status','unknown');end if;
 else
  if p_input ? 'calculation' or p_input ? 'raw_input' then raise exception 'EXPENSE_STRUCTURED_REVIEW_REQUIRED';end if;
  if old.request_json->>'schema_version'='2' then raise exception 'EXPENSE_STRUCTURED_REVIEW_REQUIRED';end if;
  effective:=e.gross_amount;
 end if;
 perform pg_advisory_xact_lock(500050);
 if p_input->>'eligibility'='eligible' and exists(select 1 from public.finance_expense_tax_reviews x
  where x.expense_id<>p_expense and x.eligibility='eligible' and x.supplier_tax_id=btrim(p_input->>'supplier_tax_id')
   and x.tax_document_reference=btrim(p_input->>'tax_document_reference') and x.tax_document_date=(p_input->>'tax_document_date')::date
   and not exists(select 1 from public.finance_expense_tax_reviews n where n.supersedes_id=x.id))
 then raise exception 'EXPENSE_INPUT_VAT_ALREADY_REVIEWED'; end if;
 -- Issued tax filings retain their sources. Do not silently recalculate any frozen filing.
 if exists(select 1 from public.finance_tax_filing_allocations a join public.finance_tax_position_facts f on f.id=a.tax_fact_id
  join public.finance_tax_source_revisions s on s.id=f.revision_id where s.source_type='expense' and s.source_id=p_expense)
 then raise exception 'EXPENSE_TAX_FILED_SOURCE_LOCKED'; end if;
 vb:=case when p_input->>'vat_state'='exists' then (p_input->>'vat_base')::numeric end;
 vr:=case when p_input->>'vat_state'='exists' then (p_input->>'vat_rate')::numeric end;
 wb:=case when p_input->>'wht_state'='withhold' then (p_input->>'wht_base')::numeric end;
 wr:=case when p_input->>'wht_state'='withhold' then (p_input->>'wht_rate')::numeric end;
 if vb is not null and (vb<>round(vb,2) or vb+case when structured then (calc->>'vat_amount')::numeric else round(vb*vr/100,2) end<>effective) then raise exception 'EXPENSE_VAT_TOTAL_INVALID'; end if;
 if wb is not null and (wb<>round(wb,2) or wb>effective or round(wb*wr/100,2)>=effective) then raise exception 'EXPENSE_WHT_INVALID'; end if;
 insert into public.finance_expense_tax_reviews(id,expense_id,revision,supersedes_id,vat_state,vat_base,vat_rate,vat_amount,eligibility,
  supplier_tax_id,tax_document_reference,tax_document_date,company_name_status,wht_state,wht_base,wht_rate,wht_amount,wht_exception,reason,request_json,reviewed_by)
 values(p_id,p_expense,coalesce(old.revision,0)+1,old.id,p_input->>'vat_state',vb,vr,case when structured and vb is not null then (calc->>'vat_amount')::numeric else round(vb*vr/100,2) end,p_input->>'eligibility',
  nullif(btrim(p_input->>'supplier_tax_id'),''),nullif(btrim(p_input->>'tax_document_reference'),''),nullif(p_input->>'tax_document_date','')::date,
  p_input->>'company_name_status',p_input->>'wht_state',wb,wr,round(wb*wr/100,2),p_input->>'wht_state'<>'none' and (e.personally_paid
   or exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='confirmed' and wht_amount=0 and choices_json#>>'{0,expense_id}'=p_expense::text)),
  btrim(p_input->>'reason'),p_input,auth.uid()) returning * into r;
 perform public.tax_position_sync('expense',p_expense,r.reason);
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json) values(p_expense,'tax_reviewed',auth.uid(),to_jsonb(r));
 return p_id;
end;
$fn$;

create or replace function public.decide_finance_expense_settlement(p_id uuid,p_expense uuid,p_mode text,p_payee uuid,p_amount numeric,p_due_on date,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;s public.finance_expense_settlements%rowtype; effective numeric;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));select * into e from public.finance_expenses where id=p_expense for update;
 if e.status is distinct from 'accepted' then raise exception 'EXPENSE_ACCEPTED_REQUIRED'; end if;
 p_reason:=coalesce(btrim(p_reason),'');
 if (e.origin<>'company_purchase' or e.personally_paid or p_mode in ('reimburse','no_reimbursement')) and p_reason=''
 then raise exception 'EXPENSE_REASON_REQUIRED';end if;
 effective:=public.company_expense_reviewed_gross(p_expense);
 if p_mode in ('company_bank','company_cash') and exists(select 1 from public.finance_expense_tax_reviews r
  where r.expense_id=e.id and r.request_json->>'schema_version'='2' and r.wht_state='withhold'
   and not exists(select 1 from public.finance_expense_tax_reviews n where n.supersedes_id=r.id))
  and p_payee is distinct from e.supplier_payee_id then raise exception 'EXPENSE_PAYEE_INVALID';end if;
 select * into s from public.finance_expense_settlements where expense_id=p_expense;
 if s.id is not null then
  if s.id=p_id and s.mode=p_mode and s.payee_id is not distinct from p_payee and s.amount=p_amount and s.reason=btrim(p_reason) then return s.id; end if;
  raise exception 'EXPENSE_SETTLEMENT_ALREADY_DECIDED';
 end if;
 if p_mode is null or p_mode='undecided' or p_amount is null or p_amount<>round(p_amount,2) or p_amount>effective
  or (p_mode in ('company_bank','company_cash','supplier_unpaid') and (e.personally_paid or p_amount<>effective))
  or (p_mode in ('reimburse','no_reimbursement') and not e.personally_paid)
  or (p_mode='reimburse' and not exists(select 1 from public.finance_payees where id=p_payee and profile_id=e.claimant_id and is_active))
  or (p_mode='supplier_unpaid' and ((e.supplier_payee_id is not null and e.supplier_payee_id is distinct from p_payee) or not exists(select 1 from public.finance_payees where id=p_payee and is_active)))
 then raise exception 'EXPENSE_SETTLEMENT_INVALID'; end if;
 insert into public.finance_expense_settlements(id,expense_id,mode,payee_id,amount,reason,created_by)
 values(p_id,p_expense,p_mode,p_payee,p_amount,btrim(p_reason),auth.uid()) returning * into s;
 if p_mode in ('supplier_unpaid','reimburse') then
  insert into public.finance_expense_obligations(id,expense_id,settlement_id,source_type,payee_id,gross_amount,due_on,created_by)
  values(p_id,p_expense,p_id,case when p_mode='reimburse' then 'employee_reimbursement' else 'supplier_payable' end,p_payee,p_amount,p_due_on,auth.uid());
 end if;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json) values(p_expense,'settlement_decided',auth.uid(),to_jsonb(s));
 return p_id;
end;
$fn$;

create or replace function public.expense_integrity()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare eid uuid;e public.finance_expenses%rowtype;s public.finance_expense_settlements%rowtype;o public.finance_expense_obligations%rowtype;
begin
 if tg_table_name='finance_expenses' then eid:=new.id;
 elsif tg_table_name='finance_expense_obligation_waivers' then select expense_id into eid from public.finance_expense_obligations where id=new.obligation_id;
 else eid:=new.expense_id;end if;
 select * into strict e from public.finance_expenses where id=eid;
 if not exists(select 1 from public.finance_expense_audit where expense_id=e.id)
  or (e.status in ('accepted','rejected') and not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type=e.status))
 then raise exception 'EXPENSE_AUDIT_INTEGRITY';end if;
 select * into s from public.finance_expense_settlements where expense_id=e.id;
 select * into o from public.finance_expense_obligations where expense_id=e.id;
 if s.id is not null and (e.status not in ('accepted','submitted','rejected')
  or not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type='settlement_decided')
  or (s.mode in ('reimburse','no_reimbursement') and not e.personally_paid)
  or (s.mode in ('company_bank','company_cash','supplier_unpaid') and e.personally_paid)
  or s.amount>public.company_expense_reviewed_gross(e.id)
  or ((e.origin<>'company_purchase' or e.personally_paid) and nullif(btrim(s.reason),'') is null)
  or (s.mode in ('supplier_unpaid','reimburse') and (e.status<>'accepted' or o.id is null))
  or (s.mode not in ('supplier_unpaid','reimburse') and o.id is not null)) then raise exception 'EXPENSE_SETTLEMENT_INTEGRITY';end if;
 if o.id is not null and (o.settlement_id is distinct from s.id or o.payee_id is distinct from s.payee_id
  or o.gross_amount is distinct from s.amount or o.source_type is distinct from case s.mode when 'reimburse' then 'employee_reimbursement' when 'supplier_unpaid' then 'supplier_payable' end)
 then raise exception 'EXPENSE_OBLIGATION_INTEGRITY';end if;
 if exists(select 1 from public.finance_expense_obligation_waivers where obligation_id=o.id) and
  (o.source_type<>'employee_reimbursement' or exists(select 1 from public.finance_payout_allocations where expense_obligation_id=o.id)
   or not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type='waived'))
 then raise exception 'EXPENSE_WAIVER_INTEGRITY';end if;
 if exists(select 1 from public.finance_expense_tax_reviews r where r.expense_id=e.id and
  (e.status<>'accepted' or (r.vat_state='exists' and r.vat_base+r.vat_amount<>coalesce((r.request_json#>>'{calculation,gross}')::numeric,e.gross_amount))
   or (r.request_json->>'schema_version'='2' and (e.origin<>'company_purchase' or e.personally_paid
    or (r.request_json#>>'{calculation,declared_amount}')::numeric is distinct from e.gross_amount
    or (r.vat_state='exists' and r.vat_amount is distinct from (r.request_json#>>'{calculation,vat_amount}')::numeric)
    or (r.wht_state='withhold' and r.wht_amount is distinct from (r.request_json#>>'{calculation,wht_amount}')::numeric)))
   or (r.wht_state='withhold' and r.wht_base>coalesce((r.request_json#>>'{calculation,gross}')::numeric,e.gross_amount))
   or (r.revision=1 and r.supersedes_id is not null)
   or (r.revision>1 and not exists(select 1 from public.finance_expense_tax_reviews previous where previous.id=r.supersedes_id and previous.expense_id=e.id and previous.revision=r.revision-1))
   or not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type='tax_reviewed')))
 then raise exception 'EXPENSE_TAX_INTEGRITY';end if;
 return null;
end;
$fn$;

create or replace function public.expense_payout_choice(p_expense uuid,p_actual_wht boolean)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;s public.finance_expense_settlements%rowtype;o public.finance_expense_obligations%rowtype;
 r public.finance_expense_tax_reviews%rowtype; gross numeric;rate numeric:=0;base numeric:=0;wht numeric:=0;
begin
 select * into strict e from public.finance_expenses where id=p_expense;
 select * into s from public.finance_expense_settlements where expense_id=p_expense;
 select * into o from public.finance_expense_obligations where expense_id=p_expense;
 select * into r from public.finance_expense_tax_reviews where expense_id=p_expense order by revision desc limit 1;
 if s.id is null or s.mode in ('undecided','no_reimbursement') or e.status not in ('submitted','accepted')
  or (o.id is not null and e.status<>'accepted')
  or exists(select 1 from public.finance_expense_obligation_waivers where obligation_id=o.id)
  or exists(select 1 from public.finance_payout_allocations where expense_id=p_expense) then raise exception 'EXPENSE_PAYMENT_UNAVAILABLE'; end if;
 gross:=s.amount;
 if e.origin='company_purchase' and not e.personally_paid and e.status='accepted' then
  if r.id is null or r.wht_state='pending' then raise exception 'EXPENSE_WHT_DECISION_REQUIRED';end if;
  if r.request_json->>'schema_version'='2' and p_actual_wht is distinct from (r.wht_state='withhold')
  then raise exception 'EXPENSE_WHT_ACTUAL_FACTS_REQUIRED';end if;
 end if;
 if p_actual_wht is null then raise exception 'EXPENSE_ACTUAL_WITHHOLDING_REQUIRED'; end if;
 if p_actual_wht then
  if s.mode='reimburse' or e.personally_paid or r.wht_state is distinct from 'withhold' or r.wht_exception
   or not exists(select 1 from public.finance_payees where id=s.payee_id and is_active and tax_id is not null)
  then raise exception 'EXPENSE_WHT_ACTUAL_FACTS_REQUIRED'; end if;
  base:=r.wht_base;rate:=r.wht_rate;wht:=round(base*rate/100,2);
 end if;
 return jsonb_build_object('expense_id',e.id,'obligation_id',o.id,'payee_id',s.payee_id,'settlement',to_jsonb(s),
  'expense',to_jsonb(e),'tax_review',to_jsonb(r),'obligation',to_jsonb(o),'actual_withholding',p_actual_wht,
  'gross',gross,'wht_base',base,'rate',rate,'wht',wht,'treatment',case when p_actual_wht then 'withhold' else 'none' end);
end;
$fn$;

create or replace function public.expense_document(p_id uuid)
returns jsonb language sql stable security definer set search_path=public as $fn$
 select public.expense_document_before_requests(p_id)||jsonb_build_object('declared_gross_amount',(select gross_amount from public.finance_expenses where id=p_id),
  'gross_amount',public.company_expense_reviewed_gross(p_id),'request_id',i.request_id,'request_active',i.active,
  -- Entry authority context only, never a payment instruction or settlement decision.
  'request_entry_account',(select jsonb_build_object('bank_account_id',v->'input'->'bank_account_id','cash_location_id',v->'input'->'cash_location_id')
   from public.finance_expense_request_audit a cross join lateral jsonb_array_elements(a.input_json->'items') v
   join public.finance_expense_requests r on r.id=a.request_id
   where a.request_id=i.request_id and a.event_type='saved' and v->>'id'=p_id::text
    and r.status='draft' and r.created_by=auth.uid() order by a.version desc limit 1))
 from (select 1) seed left join public.finance_expense_request_items i on i.expense_id=p_id;
$fn$;

create or replace function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select jsonb_build_object('user_id',auth.uid(),'can_claim',public.expense_can_claim(),'can_manage',public.expense_can_manage(),
  'can_tax_review',public.expense_can_tax_review(),'can_view_all',public.expense_can_view_all(),'is_admin',public.money_allocation_admin(),
  'creator_payment_fact_supported',true,'company_tax_calculation_supported',true,
  'company_declaration_without_account_supported',true,
  'can_create_company',public.expense_can_manage() or public.expense_can_claim()
   or exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_view_accounts',jsonb_array_length(public.get_finance_expense_accounts())>0,
  'can_record',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_confirm',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_confirm'='true'));
$fn$;

revoke all on function public.company_expense_tax_calculation(uuid,jsonb), public.company_expense_reviewed_gross(uuid), public.preview_finance_company_expense_tax(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.preview_finance_company_expense_tax(uuid,jsonb) to authenticated;
