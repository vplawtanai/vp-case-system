-- Candidate 061. Atomic reimbursement review only; no historical updates or payment changes.
create function public.review_finance_employee_reimbursement(p_operation uuid,p_expense uuid,p_version integer,p_accept boolean,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; a public.finance_expense_audit%rowtype; payload jsonb; person public.user_profiles%rowtype;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED';end if;
 if p_operation is null or p_expense is null or p_version is null or p_accept is null or length(coalesce(p_reason,''))>2000 then raise exception 'EXPENSE_INPUT_INVALID';end if;
 p_reason:=coalesce(btrim(p_reason),'');
 if not p_accept and p_reason='' then raise exception 'EXPENSE_REASON_REQUIRED';end if;
 payload:=jsonb_build_object('operation',p_operation,'expected_version',p_version,'accept',p_accept,'amount',p_amount,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 select * into e from public.finance_expenses where id=p_expense for update;
 select * into a from public.finance_expense_audit where id=p_operation;
 if a.id is not null then
  if a.expense_id=p_expense and a.actor_id=auth.uid() and a.evidence_json->'employee_reimbursement_review'=payload
   and a.event_type=(case when p_accept then 'accepted' else 'rejected' end) then return p_expense;end if;
  raise exception 'EXPENSE_IDEMPOTENCY_CONFLICT';
 end if;
 if e.status is distinct from 'submitted' or e.version is distinct from p_version then raise exception 'EXPENSE_STALE';end if;
 if e.origin is distinct from 'employee_claim' or not e.personally_paid or e.claimant_id is null
  then raise exception 'EXPENSE_REQUEST_ITEM_INVALID';end if;
 if p_accept then
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>e.reimbursement_requested or p_amount>e.gross_amount
   then raise exception 'EXPENSE_SETTLEMENT_INVALID';end if;
  -- Existing deterministic internal Payee contract; never overwrite an existing profile/destination.
  perform pg_advisory_xact_lock(hashtextextended('payee:'||e.claimant_id,0));
  if not exists(select 1 from public.finance_payees where id=e.claimant_id) then
   select * into person from public.user_profiles where id=e.claimant_id for share;
   if person.id is null or not person.active then raise exception 'PAYOUT_PAYEE_INVALID';end if;
   -- The expense reviewer may provision only this claimant identity, never bank/tax metadata.
   insert into public.finance_payees(id,kind,profile_id,entity_type,legal_name,created_by,updated_by)
   values(person.id,'internal',person.id,'natural_person',
    coalesce(nullif(btrim(person.staff_name),''),nullif(btrim(person.full_name),''),nullif(btrim(person.email),''),person.id::text),auth.uid(),auth.uid());
   insert into public.finance_payee_audit(payee_id,actor_id,evidence_json)
   values(person.id,auth.uid(),jsonb_build_object('previous',null,'payee',(select to_jsonb(p) from public.finance_payees p where p.id=person.id),'destination',null));
  end if;
 end if;
 update public.finance_expenses set status=case when p_accept then 'accepted' else 'rejected' end,version=version+1,
  reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),review_reason=coalesce(nullif(p_reason,''),'Approved reimbursement of personally paid expense'),updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_expense returning * into e;
 insert into public.finance_expense_audit(id,expense_id,event_type,actor_id,evidence_json)
 values(p_operation,p_expense,e.status,auth.uid(),to_jsonb(e)||jsonb_build_object('employee_reimbursement_review',payload));
 if p_accept then
  perform public.decide_finance_expense_settlement(p_operation,p_expense,'reimburse',e.claimant_id,p_amount,null,
   coalesce(nullif(p_reason,''),'Approved reimbursement of personally paid expense'));
 end if;
 return p_expense;
end;
$fn$;
revoke all on function public.review_finance_employee_reimbursement(uuid,uuid,integer,boolean,numeric,text) from public,anon;
grant execute on function public.review_finance_employee_reimbursement(uuid,uuid,integer,boolean,numeric,text) to authenticated;
-- Same access contract plus one capability; no changes to permissions.
create or replace function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select public.get_finance_expense_access_before_purchase_flow()||jsonb_build_object('company_purchase_request_supported',true,'employee_reimbursement_review_supported',true);
$fn$;
