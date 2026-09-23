-- Candidate 063: narrow claimant reimbursement destination exemption; no backfill.
create or replace function public.confirm_finance_expense_payout(p_id uuid,p_version integer,p_payee_version integer,p_destination uuid,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare p public.finance_payouts%rowtype;c jsonb;canonical jsonb;recipient jsonb;claimant_reimbursement boolean;payee public.finance_payees%rowtype;dest public.finance_payee_destinations%rowtype;
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
 -- Approved claimant reimbursement records actual company outflow, not a transfer instruction.
 -- Keep canonical source, identity, version, amount and acknowledgement checks above unchanged.
 claimant_reimbursement:=coalesce(c#>>'{expense,origin}'='employee_claim'
  and c#>>'{expense,status}'='accepted' and (c#>>'{expense,personally_paid}')::boolean
  and c#>>'{expense,claimant_id}'=payee.profile_id::text
  and c#>>'{settlement,mode}'='reimburse' and c#>>'{settlement,payee_id}'=p.payee_id::text
  and c->>'obligation_id' is not null and p.wht_amount=0,false);
 if recipient is null and not claimant_reimbursement and c->>'obligation_id' is not null and p.bank_account_id is not null and (dest.id is null or dest.id is distinct from p_destination)
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
