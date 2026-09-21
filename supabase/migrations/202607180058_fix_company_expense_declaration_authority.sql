-- 058: Company Expense declarations are not payment instructions.
-- Function replacements only: no columns, backfill, grants, payout or cash changes.
-- Existing expense submitters, Finance and account recorders may record Company facts.
-- Ownership, active-user, personally-paid and lifecycle guards remain intact.
create or replace function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select jsonb_build_object('user_id',auth.uid(),'can_claim',public.expense_can_claim(),'can_manage',public.expense_can_manage(),
  'can_tax_review',public.expense_can_tax_review(),'can_view_all',public.expense_can_view_all(),'is_admin',public.money_allocation_admin(),
  'creator_payment_fact_supported',true,
  'company_declaration_without_account_supported',true,
  'can_create_company',public.expense_can_manage() or public.expense_can_claim()
   or exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_view_accounts',jsonb_array_length(public.get_finance_expense_accounts())>0,
  'can_record',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_confirm',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_confirm'='true'));
$fn$;

create or replace function public.save_finance_expense_before_requests(p_id uuid,p_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; kind text:=p_input->>'origin'; claimant uuid; declared text;
begin
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 select * into e from public.finance_expenses where id=p_id for update;
 if e.version is distinct from p_version or (e.id is not null and (e.status<>'draft' or e.origin<>kind)) then raise exception 'EXPENSE_STALE'; end if;
 if kind='employee_claim' then
  if not public.expense_can_claim() or (e.id is not null and e.created_by<>auth.uid()) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
  claimant:=auth.uid();
 elsif kind='company_purchase' then
  if not coalesce((public.get_finance_expense_access()->>'can_create_company')::boolean,false) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
  if e.id is not null and not public.expense_can_manage() and e.created_by<>auth.uid() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
  claimant:=nullif(p_input->>'claimant_id','')::uuid;
  if not public.expense_can_manage() and (claimant is not null or coalesce((p_input->>'personally_paid')::boolean,false)) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 else raise exception 'EXPENSE_ORIGIN_INVALID'; end if;
 declared:=case when p_input ? 'creator_payment_fact' then p_input->>'creator_payment_fact' else e.creator_payment_fact end;
 if declared is not null and (kind<>'company_purchase' or declared not in ('unpaid','company_paid','personal_paid','unknown')) then raise exception 'EXPENSE_PAYMENT_FACT_INVALID'; end if;
 if declared='personal_paid' and (not coalesce((p_input->>'personally_paid')::boolean,false) or claimant is null)
  or declared in ('unpaid','company_paid') and coalesce((p_input->>'personally_paid')::boolean,false) then raise exception 'EXPENSE_PAYMENT_FACT_CONFLICT'; end if;
 if (p_input->>'expense_date')::date is null or (p_input->>'expense_date')::date>(now() at time zone 'Asia/Bangkok')::date
  or (p_input->>'gross_amount')::numeric<>round((p_input->>'gross_amount')::numeric,2)
  or coalesce(p_input->>'currency','THB')<>'THB' then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if nullif(p_input->>'case_id','') is not null or nullif(p_input->>'advisory_matter_id','') is not null then
  perform public.assert_finance_billable_charge_context(nullif(p_input->>'client_id','')::uuid,
   nullif(p_input->>'case_id','')::bigint,nullif(p_input->>'advisory_matter_id','')::uuid);
 end if;
 if claimant is not null and not exists(select 1 from public.user_profiles where id=claimant and active)
  then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if e.id is null then
  insert into public.finance_expenses(id,origin,expense_date,description,category,gross_amount,claimant_id,created_by,updated_by)
   values(p_id,kind,(p_input->>'expense_date')::date,btrim(p_input->>'description'),btrim(p_input->>'category'),(p_input->>'gross_amount')::numeric,claimant,auth.uid(),auth.uid());
  select * into e from public.finance_expenses where id=p_id;
 else
  if not public.expense_can_read(p_id) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 end if;
 update public.finance_expenses set expense_date=(p_input->>'expense_date')::date,description=btrim(p_input->>'description'),category=btrim(p_input->>'category'),
  gross_amount=(p_input->>'gross_amount')::numeric,claimant_id=claimant,vendor_name=nullif(btrim(p_input->>'vendor_name'),''),
  supplier_payee_id=nullif(p_input->>'supplier_payee_id','')::uuid,client_id=nullif(p_input->>'client_id','')::uuid,
  case_id=nullif(p_input->>'case_id','')::bigint,advisory_matter_id=nullif(p_input->>'advisory_matter_id','')::uuid,
  personally_paid=coalesce((p_input->>'personally_paid')::boolean,false),reimbursement_requested=coalesce((p_input->>'reimbursement_requested')::numeric,0),
  vat_awareness=coalesce(p_input->>'vat_awareness','unknown'),wht_awareness=coalesce(p_input->>'wht_awareness','unknown'),note=coalesce(p_input->>'note',''),
  creator_payment_fact=declared,
  version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
  select p_id,'saved',auth.uid(),to_jsonb(x) from public.finance_expenses x where id=p_id;
 return p_id;
end;
$fn$;

create or replace function public.save_finance_expense_request(p_id uuid,p_operation uuid,p_version integer,p_kind text,p_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare r public.finance_expense_requests%rowtype; a public.finance_expense_request_audit%rowtype;
 item jsonb; child uuid; n integer:=0; payload jsonb;
begin
 if p_id is null or p_operation is null or p_kind is null or p_kind not in ('employee_claim','company_expense_batch')
  or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100
  or p_note is null or length(p_note)>2000 then raise exception 'EXPENSE_REQUEST_INPUT_INVALID'; end if;
 if (p_kind='employee_claim' and not public.expense_can_claim())
  or (p_kind='company_expense_batch' and not coalesce((public.get_finance_expense_access()->>'can_create_company')::boolean,false))
 then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense_request:'||p_id,0));
 select * into r from public.finance_expense_requests where id=p_id for update;
 if r.id is not null and (r.created_by<>auth.uid() or r.kind<>p_kind) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 payload:=jsonb_build_object('kind',p_kind,'note',p_note,'items',p_items,'expected_version',p_version);
 select * into a from public.finance_expense_request_audit where id=p_operation;
 if a.id is not null then
  if a.request_id=p_id and a.actor_id=auth.uid() and a.input_json=payload and a.event_type='saved' then return p_id; end if;
  raise exception 'EXPENSE_REQUEST_IDEMPOTENCY';
 end if;
 if r.version is distinct from p_version or (r.id is not null and r.status<>'draft') then raise exception 'EXPENSE_STALE'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'EXPENSE_REQUEST_DUPLICATE_ITEM'; end if;
 if r.id is null then
  insert into public.finance_expense_requests(id,kind,note,created_by) values(p_id,p_kind,p_note,auth.uid()) returning * into r;
 end if;
 -- Serialize each child against old RPCs; never adopt a pre-existing standalone item.
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  child:=(item->>'id')::uuid;
  if child is null or jsonb_typeof(item->'input') is distinct from 'object' then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('expense:'||child,0));
  if exists(select 1 from public.finance_expenses where id=child)
   and not exists(select 1 from public.finance_expense_request_items where request_id=p_id and expense_id=child and active)
  then raise exception 'EXPENSE_REQUEST_ITEM_INVALID'; end if;
  perform public.save_finance_expense_before_requests(child,(item->>'version')::integer,
   (item->'input')||jsonb_build_object('origin',case when p_kind='employee_claim' then 'employee_claim' else 'company_purchase' end));
 end loop;
 -- Removed Draft items remain as audit history, never as another standalone submission.
 update public.finance_expense_request_items set active=false where request_id=p_id and active;
 for item in select value from jsonb_array_elements(p_items) loop
  n:=n+1;child:=(item->>'id')::uuid;
  insert into public.finance_expense_request_items(request_id,expense_id,item_no) values(p_id,child,n)
   on conflict(expense_id) do update set active=true,item_no=excluded.item_no;
 end loop;
 if p_version is not null then
  update public.finance_expense_requests set note=p_note,version=version+1 where id=p_id returning * into r;
 end if;
 insert into public.finance_expense_request_audit(id,request_id,event_type,actor_id,input_json,version)
 values(p_operation,p_id,'saved',auth.uid(),payload,r.version);
 return p_id;
end;
$fn$;

revoke all on function public.save_finance_expense_before_requests(uuid,integer,jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';
