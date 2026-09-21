-- Creator declaration only. No backfill or financial consequence.
alter table public.finance_expenses add column creator_payment_fact text;
alter table public.finance_expenses add constraint expense_creator_payment_fact_contract check (
 creator_payment_fact is null or (origin='company_purchase' and creator_payment_fact in ('unpaid','company_paid','personal_paid','unknown'))
);
comment on column public.finance_expenses.creator_payment_fact is 'Creator-declared payment fact, not settlement or payment evidence. NULL preserves historical/older-caller uncertainty.';

-- 056 request saves and standalone saves both delegate to this private core.
create or replace function public.save_finance_expense_before_requests(p_id uuid,p_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; kind text:=p_input->>'origin'; claimant uuid; bank uuid; cash uuid; declared text;
begin
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 select * into e from public.finance_expenses where id=p_id for update;
 if e.version is distinct from p_version or (e.id is not null and (e.status<>'draft' or e.origin<>kind)) then raise exception 'EXPENSE_STALE'; end if;
 bank:=nullif(p_input->>'bank_account_id','')::uuid;cash:=nullif(p_input->>'cash_location_id','')::uuid;
 if kind='employee_claim' then
  if not public.expense_can_claim() or (e.id is not null and e.created_by<>auth.uid()) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
  claimant:=auth.uid();
 elsif kind='company_purchase' then
  if not public.expense_can_manage() and not public.expense_account_allowed(bank,cash,'record_outflow') then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
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

-- Missing flag on 055/056 means the new capture UI stays gated.
create or replace function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select jsonb_build_object('user_id',auth.uid(),'can_claim',public.expense_can_claim(),'can_manage',public.expense_can_manage(),
  'can_tax_review',public.expense_can_tax_review(),'can_view_all',public.expense_can_view_all(),'is_admin',public.money_allocation_admin(),
  'creator_payment_fact_supported',true,
  'can_view_accounts',jsonb_array_length(public.get_finance_expense_accounts())>0,
  'can_record',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_confirm',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_confirm'='true'));
$fn$;
revoke all on function public.save_finance_expense_before_requests(uuid,integer,jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';
