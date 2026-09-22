-- Revised candidate 060. Supersedes the unapplied paid-WHT acknowledgement candidate.
-- New Company requests ask the company to pay; historical declarations are not rewritten.
create function public.company_purchase_tax_choices(p_input jsonb)
returns jsonb language plpgsql immutable set search_path=public as $fn$
begin
 if jsonb_typeof(p_input) is distinct from 'object'
  or coalesce(p_input->>'vat_mode','') not in ('none','inclusive','exclusive')
  or coalesce(p_input->>'wht_state','') not in ('none','withhold')
  or (p_input->>'vat_mode'<>'none' and (p_input->>'vat_rate' is null or (p_input->>'vat_rate')::numeric not in (0,7)))
  or (p_input->>'wht_state'='withhold' and (p_input->>'wht_rate' is null or (p_input->>'wht_rate')::numeric not in (1,3,5)))
 then raise exception 'EXPENSE_REQUEST_TAX_CHOICES_REQUIRED';end if;
 return jsonb_build_object('vat_mode',p_input->>'vat_mode','vat_rate',case when p_input->>'vat_mode'='none' then 0 else (p_input->>'vat_rate')::numeric end,
  'wht_state',p_input->>'wht_state','wht_rate',case when p_input->>'wht_state'='none' then 0 else (p_input->>'wht_rate')::numeric end);
end;
$fn$;

create function public.company_purchase_request_declaration(p_expense uuid)
returns jsonb language sql stable security definer set search_path=public as $fn$
 select case when item->'input'->>'company_request_version'='1' then item->'input'->'creator_tax' end
 from public.finance_expense_request_items i
 join public.finance_expense_requests r on r.id=i.request_id and r.kind='company_expense_batch'
 join public.finance_expense_request_audit a on a.request_id=r.id and a.event_type='saved'
 cross join lateral jsonb_array_elements(a.input_json->'items') item
 where i.expense_id=p_expense and item->>'id'=p_expense::text order by a.version desc limit 1;
$fn$;

alter function public.save_finance_expense_request(uuid,uuid,integer,text,text,jsonb) rename to save_finance_expense_request_before_purchase_flow;
create function public.save_finance_expense_request(p_id uuid,p_operation uuid,p_version integer,p_kind text,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare item jsonb; normalized jsonb:='[]'; choices jsonb; prospective boolean;
begin
 if p_kind='company_expense_batch' then
  if not coalesce((public.get_finance_expense_access()->>'can_create_company')::boolean,false) then raise exception 'EXPENSE_PERMISSION_DENIED';end if;
  perform pg_advisory_xact_lock(hashtextextended('expense_request:'||p_id,0));
  prospective:=not exists(select 1 from public.finance_expense_requests where id=p_id)
   or exists(select 1 from public.finance_expense_request_audit a cross join lateral jsonb_array_elements(a.input_json->'items') x
    where a.request_id=p_id and a.event_type='saved' and x->'input'->>'company_request_version'='1');
  if prospective then
   if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'EXPENSE_REQUEST_INPUT_INVALID';end if;
   for item in select value from jsonb_array_elements(p_items) loop
    if item->'input'->>'company_request_version' is distinct from '1'
     or coalesce(item->'input'->>'creator_payment_fact','unpaid')<>'unpaid'
     or coalesce((item->'input'->>'personally_paid')::boolean,false)
     or nullif(item->'input'->>'claimant_id','') is not null
     or coalesce((item->'input'->>'reimbursement_requested')::numeric,0)<>0
     or nullif(item->'input'->>'bank_account_id','') is not null or nullif(item->'input'->>'cash_location_id','') is not null
    then raise exception 'EXPENSE_REQUEST_UNPAID_ONLY';end if;
    if nullif(btrim(item->'input'->>'vendor_name'),'') is null or length(btrim(item->'input'->>'vendor_name'))>300 then raise exception 'EXPENSE_REQUEST_PAYEE_REQUIRED';end if;
    choices:=public.company_purchase_tax_choices(item->'input'->'creator_tax');
    item:=jsonb_set(item,'{input}',(item->'input')||jsonb_build_object('creator_payment_fact','unpaid','personally_paid',false,
     'claimant_id',null,'reimbursement_requested',0,'creator_tax',choices,'supplier_payee_id',null,'vendor_name',btrim(item->'input'->>'vendor_name'),
     'vat_awareness',case when choices->>'vat_mode'='none' then 'no' else 'yes' end,
     'wht_awareness',case when choices->>'wht_state'='none' then 'no' else 'yes' end));
    normalized:=normalized||jsonb_build_array(item);
   end loop;
   p_items:=normalized;
  elsif exists(select 1 from jsonb_array_elements(p_items) x where x->'input' ? 'company_request_version') then
   raise exception 'EXPENSE_HISTORICAL_REQUEST_READ_ONLY';
  end if;
 end if;
 return public.save_finance_expense_request_before_purchase_flow(p_id,p_operation,p_version,p_kind,p_note,p_items);
end;
$fn$;

-- Only a prospective, accepted request with immutable Finance approval evidence qualifies.
-- The original vendor_name remains the creator's declaration; no Payee is fabricated.
create function public.company_purchase_request_recipient(p_expense uuid)
returns text language sql stable security definer set search_path=public as $fn$
 select btrim(a.evidence_json#>>'{purchase_request_review,input,recipient_name}')
 from public.finance_expenses e join public.finance_expense_audit a on a.expense_id=e.id and a.event_type='accepted'
 where e.id=p_expense and e.origin='company_purchase' and not e.personally_paid and e.creator_payment_fact='unpaid'
  and e.status='accepted' and e.supplier_payee_id is null and a.actor_id=e.reviewed_by
  and a.evidence_json#>>'{purchase_request_review,accept}'='true'
  and length(btrim(a.evidence_json#>>'{purchase_request_review,input,recipient_name}')) between 1 and 300
  and public.company_purchase_request_declaration(e.id) is not null
 order by a.created_at desc,a.id limit 1;
$fn$;

-- Preserve the profile requirement for reimbursements. Deferred integrity below restricts
-- null-ID supplier obligations to the exact approved request evidence above.
alter table public.finance_expense_settlements drop constraint finance_expense_settlements_check;
alter table public.finance_expense_settlements add constraint finance_expense_settlements_check
 check((mode='supplier_unpaid' and amount>0) or (mode='reimburse' and payee_id is not null and amount>0)
  or (mode in ('company_bank','company_cash') and amount>0) or (mode in ('undecided','no_reimbursement') and amount=0));
alter table public.finance_expense_obligations alter column payee_id drop not null;
alter table public.finance_expense_obligations add constraint expense_obligation_recipient_kind
 check(payee_id is not null or source_type='supplier_payable');

alter function public.expense_document(uuid) rename to expense_document_before_purchase_flow;
create function public.expense_document(p_id uuid)
returns jsonb language sql stable security definer set search_path=public as $fn$
 select public.expense_document_before_purchase_flow(p_id)||jsonb_build_object('creator_tax',public.company_purchase_request_declaration(p_id),'reviewed_recipient_name',public.company_purchase_request_recipient(p_id));
$fn$;

-- A prospective request cannot bypass atomic tax/payable review via the legacy header action.
alter function public.review_finance_expense(uuid,integer,boolean,text) rename to review_finance_expense_before_purchase_flow;
create function public.review_finance_expense(p_id uuid,p_version integer,p_accept boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 if public.company_purchase_request_declaration(p_id) is not null then raise exception 'EXPENSE_REQUEST_REVIEW_REQUIRED';end if;
 return public.review_finance_expense_before_purchase_flow(p_id,p_version,p_accept,p_reason);
end;
$fn$;

-- Review, tax and payable are one transaction. No payout/cash function is called here.
create function public.review_finance_company_purchase_request(p_operation uuid,p_expense uuid,p_version integer,p_accept boolean,p_input jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; a public.finance_expense_audit%rowtype; payload jsonb; choices jsonb; tax_input jsonb; calc jsonb;
begin
 if not public.expense_can_manage() or (p_accept and not public.expense_can_tax_review()) then raise exception 'EXPENSE_PERMISSION_DENIED';end if;
 if p_operation is null or p_expense is null or p_version is null or p_accept is null or length(coalesce(p_reason,''))>2000 then raise exception 'EXPENSE_INPUT_INVALID';end if;
 p_reason:=coalesce(btrim(p_reason),'');
 if not p_accept and p_reason='' then raise exception 'EXPENSE_REASON_REQUIRED';end if;
 payload:=jsonb_build_object('operation',p_operation,'expected_version',p_version,'accept',p_accept,'input',p_input,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 select * into e from public.finance_expenses where id=p_expense for update;
 select * into a from public.finance_expense_audit where id=p_operation;
 if a.id is not null then
  if a.expense_id=p_expense and a.actor_id=auth.uid() and a.evidence_json->'purchase_request_review'=payload
   and a.event_type=(case when p_accept then 'accepted' else 'rejected' end) then return p_expense;end if;
  raise exception 'EXPENSE_IDEMPOTENCY_CONFLICT';
 end if;
 if e.status is distinct from 'submitted' or e.version is distinct from p_version then raise exception 'EXPENSE_STALE';end if;
 if e.origin<>'company_purchase' or e.personally_paid or e.creator_payment_fact is distinct from 'unpaid'
  or public.company_purchase_request_declaration(p_expense) is null
  or not exists(select 1 from public.finance_expense_request_items i join public.finance_expense_requests r on r.id=i.request_id
   where i.expense_id=p_expense and i.active and r.status='submitted') then raise exception 'EXPENSE_REQUEST_ITEM_INVALID';end if;
 if p_accept then
  if nullif(btrim(p_input->>'recipient_name'),'') is null or length(btrim(p_input->>'recipient_name'))>300
   then raise exception 'EXPENSE_REQUEST_PAYEE_REQUIRED';end if;
  choices:=public.company_purchase_tax_choices(p_input);
  tax_input:=choices||jsonb_build_object('schema_version',2,'eligibility','pending','reason',p_reason);
  calc:=public.company_expense_tax_calculation(p_expense,tax_input);
  if calc->>'ready'<>'true' then raise exception 'EXPENSE_TAX_DECISIONS_REQUIRED: %',calc->'missing';end if;
 end if;
 update public.finance_expenses set status=case when p_accept then 'accepted' else 'rejected' end,version=version+1,
  reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_expense returning * into e;
 insert into public.finance_expense_audit(id,expense_id,event_type,actor_id,evidence_json)
 values(p_operation,p_expense,e.status,auth.uid(),to_jsonb(e)||jsonb_build_object('purchase_request_review',payload));
 if p_accept then
  perform public.review_finance_expense_tax(p_operation,p_expense,null,tax_input);
  perform public.decide_finance_expense_settlement(p_operation,p_expense,'supplier_unpaid',null,(calc->>'gross')::numeric,null,p_reason);
 end if;
 return p_expense;
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
 if public.company_purchase_request_declaration(p_expense) is not null and
  (p_mode is distinct from 'supplier_unpaid' or p_payee is not null or public.company_purchase_request_recipient(p_expense) is null)
 then raise exception 'EXPENSE_REQUEST_REVIEW_REQUIRED';end if;
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
  or (p_mode='supplier_unpaid' and ((e.supplier_payee_id is not null and e.supplier_payee_id is distinct from p_payee) or (not (p_payee is null and public.company_purchase_request_recipient(p_expense) is not null) and not exists(select 1 from public.finance_payees where id=p_payee and is_active))))
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
 if (s.mode='supplier_unpaid' and s.payee_id is null and public.company_purchase_request_recipient(e.id) is null)
  or (public.company_purchase_request_declaration(e.id) is not null and s.id is not null and
   (s.mode<>'supplier_unpaid' or s.payee_id is not null or public.company_purchase_request_recipient(e.id) is null))
 then raise exception 'EXPENSE_REQUEST_RECIPIENT_INTEGRITY';end if;
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
   or (public.company_purchase_request_recipient(p_expense) is null and not exists(select 1 from public.finance_payees where id=s.payee_id and is_active and tax_id is not null))
  then raise exception 'EXPENSE_WHT_ACTUAL_FACTS_REQUIRED'; end if;
  base:=r.wht_base;rate:=r.wht_rate;wht:=round(base*rate/100,2);
 end if;
 return jsonb_build_object('expense_id',e.id,'obligation_id',o.id,'payee_id',s.payee_id,'settlement',to_jsonb(s),
  'expense',to_jsonb(e),'tax_review',to_jsonb(r),'obligation',to_jsonb(o),'actual_withholding',p_actual_wht,
  'gross',gross,'wht_base',base,'rate',rate,'wht',wht,'treatment',case when p_actual_wht then 'withhold' else 'none' end)||case when public.company_purchase_request_recipient(p_expense) is not null then
  jsonb_build_object('recipient',jsonb_build_object('legal_name',public.company_purchase_request_recipient(p_expense),'identity_source','company_purchase_request','expense_id',p_expense)) else '{}'::jsonb end;
end;
$fn$;


create or replace function public.confirm_finance_expense_payout(p_id uuid,p_version integer,p_payee_version integer,p_destination uuid,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare p public.finance_payouts%rowtype;c jsonb;canonical jsonb;recipient jsonb;payee public.finance_payees%rowtype;dest public.finance_payee_destinations%rowtype;
 o public.finance_account_opening_balances%rowtype;snapshot jsonb;allocation uuid;cash uuid;ts timestamptz:=clock_timestamp();
begin
 select * into p from public.finance_payouts where id=p_id;
 if p.id is null or p.source_model<>'expense_v1' or not public.expense_account_allowed(p.bank_account_id,p.cash_location_id,'confirm_outflow')
 then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'EXPENSE_ACTUAL_PAYMENT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||(p.choices_json#>>'{0,expense_id}'),0));
 select * into p from public.finance_payouts where id=p_id for update;
 if not public.expense_account_allowed(p.bank_account_id,p.cash_location_id,'confirm_outflow') then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 if p.status='confirmed' then return p_id; end if;
 if p.status<>'draft' or p.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 c:=p.choices_json->0;
 canonical:=public.expense_payout_choice((c->>'expense_id')::uuid,(c->>'actual_withholding')::boolean);
 if canonical is distinct from c then raise exception 'EXPENSE_PAYMENT_SOURCE_CHANGED'; end if;
 recipient:=c->'recipient';
 select * into payee from public.finance_payees where id=p.payee_id for share;
 select * into dest from public.finance_payee_destinations where payee_id=p.payee_id and is_active for share;
 if p.payee_id is not null and (payee.is_active is distinct from true or payee.version is distinct from p_payee_version
  or (payee.profile_id is not null and not exists(select 1 from public.user_profiles where id=payee.profile_id and active))) then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 -- Prepared liabilities require an exact bank destination; already-paid direct purchases retain vendor/reference instead.
 if recipient is null and c->>'obligation_id' is not null and p.bank_account_id is not null and (dest.id is null or dest.id is distinct from p_destination)
 then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
 if recipient is null and p.wht_amount>0 and payee.tax_id is null then raise exception 'PAYOUT_TAX_ID_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 if not public.treasury_location_active(p.bank_account_id,p.cash_location_id) then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 select * into o from public.finance_account_opening_balances where bank_account_id is not distinct from p.bank_account_id
  and cash_location_id is not distinct from p.cash_location_id and currency='THB' and status='confirmed' for update;
 if o.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
 if public.finance_bangkok_completed_day_end(p.paid_on)<=o.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 snapshot:=jsonb_build_object('schema_version',2,'source_model','expense_v1','choices',p.choices_json,'payee',coalesce(recipient,to_jsonb(payee)),
  'destination',case when p.bank_account_id is not null then to_jsonb(dest) end,'opening',to_jsonb(o),
  'bank_account_id',p.bank_account_id,'cash_location_id',p.cash_location_id,'paid_on',p.paid_on,'currency',p.currency,
  'gross',p.gross_amount,'wht',p.wht_amount,'net',p.net_amount,'confirmed_by',auth.uid(),'actual_company_cash_moved',true);
 update public.finance_payouts set status='confirmed',version=version+1,confirmed_snapshot_json=snapshot,confirmed_at=ts,confirmed_by=auth.uid(),updated_at=ts,updated_by=auth.uid() where id=p_id;
 insert into public.finance_payout_allocations(payout_id,expense_id,expense_obligation_id,gross_amount,treatment,rate,wht_base,wht_amount,evidence_json)
 values(p_id,(c->>'expense_id')::uuid,(c->>'obligation_id')::uuid,p.gross_amount,c->>'treatment',(c->>'rate')::numeric,(c->>'wht_base')::numeric,p.wht_amount,c) returning id into allocation;
 if p.wht_amount>0 then
  insert into public.finance_outgoing_wht_obligations(payout_source_id,source_line_id,source_fingerprint,payee_json,gross_base,explicit_treatment,explicit_rate,withheld_amount,withheld_on,period_month,currency,evidence_json)
  values(p_id,allocation,md5(c::text),coalesce(recipient,to_jsonb(payee)),(c->>'wht_base')::numeric,'withhold',(c->>'rate')::numeric,p.wht_amount,p.paid_on,date_trunc('month',p.paid_on)::date,'THB',c);
 end if;
 insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,source_payout_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
 values(public.finance_bangkok_completed_day_end(p.paid_on),'outflow','other',p.bank_account_id,p.cash_location_id,p.net_amount,'THB','confirmed',p.id,upper(left(p.id::text,8)),'Expense payout',auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
 perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('payout_id',p.id,'payout',snapshot,'outgoing_wht_is_not_cash_outflow',true));
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'confirmed',p.version+1,auth.uid(),snapshot);
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json) values((c->>'expense_id')::uuid,'payment_confirmed',auth.uid(),snapshot);
 return p_id;
end;
$fn$;


create or replace function public.payout_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare p public.finance_payouts%rowtype;a public.finance_payout_allocations%rowtype;c public.finance_cash_transactions%rowtype;
 w public.finance_outgoing_wht_obligations%rowtype;e public.finance_expenses%rowtype;s public.finance_expense_settlements%rowtype;f jsonb;
begin
 select * into strict p from public.finance_payouts where id=p_id;
 if p.source_model='revenue_distribution_v1' then perform public.payout_assert_before_expense(p_id);return; end if;
 if jsonb_array_length(p.choices_json)<>1 then raise exception 'EXPENSE_PAYOUT_INTEGRITY'; end if;
 f:=p.choices_json->0;select * into e from public.finance_expenses where id=(f->>'expense_id')::uuid;
 select * into s from public.finance_expense_settlements where expense_id=e.id;
 if e.id is null or s.id is null or f->'settlement' is distinct from to_jsonb(s) or s.payee_id is distinct from p.payee_id
  or p.gross_amount<>s.amount or p.gross_amount is distinct from (f->>'gross')::numeric or p.wht_amount is distinct from (f->>'wht')::numeric
  or p.wht_amount is distinct from round((f->>'wht_base')::numeric*(f->>'rate')::numeric/100,2)
  or (p.wht_amount>0 and (e.personally_paid or s.mode='reimburse' or f->>'actual_withholding' is distinct from 'true'))
 then raise exception 'EXPENSE_PAYOUT_INTEGRITY'; end if;
 if (f ? 'recipient') and (public.company_purchase_request_recipient(e.id) is null or p.payee_id is not null
  or f->'recipient' is distinct from jsonb_build_object('legal_name',public.company_purchase_request_recipient(e.id),'identity_source','company_purchase_request','expense_id',e.id)
  or (p.status='confirmed' and p.confirmed_snapshot_json->'payee' is distinct from f->'recipient'))
  or (public.company_purchase_request_recipient(e.id) is not null and not (f ? 'recipient'))
 then raise exception 'EXPENSE_REQUEST_RECIPIENT_INTEGRITY';end if;
 if p.status<>'confirmed' then
  if exists(select 1 from public.finance_payout_allocations where payout_id=p_id)
   or exists(select 1 from public.finance_cash_transactions where source_payout_id=p_id)
   or exists(select 1 from public.finance_outgoing_wht_obligations where payout_source_id=p_id) then raise exception 'EXPENSE_PAYOUT_INTEGRITY'; end if;
  return;
 end if;
 select * into a from public.finance_payout_allocations where payout_id=p_id;
 if (select count(*) from public.finance_payout_allocations where payout_id=p_id)<>1 or a.expense_id<>e.id
  or a.expense_obligation_id is distinct from (f->>'obligation_id')::uuid or a.evidence_json is distinct from f
  or a.entitlement_id is not null or a.gross_amount<>p.gross_amount or a.wht_amount<>p.wht_amount
  or a.wht_base is distinct from (f->>'wht_base')::numeric or a.rate is distinct from (f->>'rate')::numeric
  or a.treatment is distinct from f->>'treatment'
  or exists(select 1 from public.finance_expense_obligation_waivers where obligation_id=a.expense_obligation_id)
  or (a.expense_obligation_id is not null and not exists(select 1 from public.finance_expense_obligations o where o.id=a.expense_obligation_id
   and o.expense_id=e.id and o.payee_id is not distinct from p.payee_id and o.gross_amount=p.gross_amount and to_jsonb(o)=f->'obligation'))
  or p.confirmed_snapshot_json->'choices' is distinct from p.choices_json
  or (p.confirmed_snapshot_json->>'gross')::numeric is distinct from p.gross_amount
  or (p.confirmed_snapshot_json->>'wht')::numeric is distinct from p.wht_amount
  or (p.confirmed_snapshot_json->>'net')::numeric is distinct from p.net_amount
  or (p.confirmed_snapshot_json->>'paid_on')::date is distinct from p.paid_on
  or (p.confirmed_snapshot_json->>'bank_account_id')::uuid is distinct from p.bank_account_id
  or (p.confirmed_snapshot_json->>'cash_location_id')::uuid is distinct from p.cash_location_id
 then raise exception 'EXPENSE_PAYOUT_ALLOCATION_INTEGRITY'; end if;
 select * into c from public.finance_cash_transactions where source_payout_id=p_id;
 if c.id is null or c.direction<>'outflow' or c.status<>'confirmed' or c.cash_amount<>p.net_amount or c.currency<>p.currency
  or c.bank_account_id is distinct from p.bank_account_id or c.cash_location_id is distinct from p.cash_location_id
  or c.occurred_at<>public.finance_bangkok_completed_day_end(p.paid_on)
  or not exists(select 1 from public.finance_cash_transaction_audit_events where cash_transaction_id=c.id and event_type='confirmed'
    and event_payload_json->'payout'=p.confirmed_snapshot_json)
 then raise exception 'EXPENSE_PAYOUT_CASH_INTEGRITY'; end if;
 select * into w from public.finance_outgoing_wht_obligations where source_line_id=a.id;
 if (p.wht_amount=0 and w.id is not null) or (p.wht_amount>0 and (w.id is null or w.payout_source_id<>p_id or w.gross_base<>a.wht_base
  or w.explicit_rate<>a.rate or w.withheld_amount<>p.wht_amount or w.withheld_on<>p.paid_on or w.payee_json is distinct from p.confirmed_snapshot_json->'payee'
  or w.evidence_json is distinct from f or w.source_fingerprint<>md5(f::text)))
  or not exists(select 1 from public.finance_payout_audit where payout_id=p_id and event_type='confirmed' and version=p.version and evidence_json=p.confirmed_snapshot_json)
  or not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type='payment_confirmed' and evidence_json=p.confirmed_snapshot_json)
 then raise exception 'EXPENSE_PAYOUT_TAX_AUDIT_INTEGRITY'; end if;
end;
$fn$;


create or replace function public.get_finance_expense_obligations(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_can_view_all() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x) order by due_on nulls last,created_at,id),'[]') from
  (select o.*,coalesce(public.company_purchase_request_recipient(e.id),p.legal_name) as payee_name,e.description,e.reference,e.origin,
   case when w.obligation_id is not null then 'waived' when a.id is not null then 'settled' else 'open' end status,
   a.payout_id from public.finance_expense_obligations o join public.finance_expenses e on e.id=o.expense_id
   left join public.finance_payees p on p.id=o.payee_id left join public.finance_expense_obligation_waivers w on w.obligation_id=o.id
   left join public.finance_payout_allocations a on a.expense_obligation_id=o.id order by due_on nulls last,o.created_at,o.id limit 50 offset p_offset) x),
  'has_next',(select count(*)>p_offset+50 from public.finance_expense_obligations));
end;
$fn$;


alter function public.get_finance_expense_access() rename to get_finance_expense_access_before_purchase_flow;
create function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select public.get_finance_expense_access_before_purchase_flow()||jsonb_build_object('company_purchase_request_supported',true);
$fn$;

revoke all on function public.company_purchase_request_recipient(uuid),public.company_purchase_tax_choices(jsonb),public.company_purchase_request_declaration(uuid),
 public.save_finance_expense_request_before_purchase_flow(uuid,uuid,integer,text,text,jsonb),public.expense_document_before_purchase_flow(uuid),
 public.get_finance_expense_access_before_purchase_flow(),public.expense_document(uuid) from public,anon,authenticated;
revoke all on function public.review_finance_expense_before_purchase_flow(uuid,integer,boolean,text) from public,anon,authenticated;
revoke all on function public.review_finance_expense(uuid,integer,boolean,text) from public,anon;
grant execute on function public.review_finance_expense(uuid,integer,boolean,text) to authenticated;
revoke all on function public.save_finance_expense_request(uuid,uuid,integer,text,text,jsonb),public.get_finance_expense_access(),
 public.review_finance_company_purchase_request(uuid,uuid,integer,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_finance_expense_request(uuid,uuid,integer,text,text,jsonb),public.get_finance_expense_access(),
 public.review_finance_company_purchase_request(uuid,uuid,integer,boolean,jsonb,text) to authenticated;
notify pgrst, 'reload schema';
