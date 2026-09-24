-- 068 candidate: direct participant actual-outflow confirmation using the existing payout engine.
-- No backfill, entitlement recalculation, Legacy/Company Statement posting or migration-time business writes.
-- Existing payout entry keeps its destination contract. Only the Admin direct entry records actual outflow without it.
create function public.payout_confirm_distribution_outflow(p_id uuid,p_expected_version integer,p_expected_payee_version integer,p_expected_destination_id uuid,p_acknowledged boolean,p_actual_outflow_only boolean)
returns uuid language plpgsql security definer set search_path=public as $confirm$
declare p public.finance_payouts%rowtype; payee public.finance_payees%rowtype; dest public.finance_payee_destinations%rowtype;
 opening public.finance_account_opening_balances%rowtype; r record; c jsonb; canonical jsonb; snapshot jsonb; allocation uuid; cash uuid; account jsonb;ts timestamptz:=clock_timestamp();
begin
 if not public.payout_can_manage() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'PAYOUT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 select * into p from public.finance_payouts where id=p_id;
 if p.id is null or p.source_model<>'revenue_distribution_v1' then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 if p.status='confirmed' then return p.id; end if;
 -- Source -> distribution -> rights -> payout: same order as supersession.
 for r in select distinct e.source_type,e.received_money_id from public.finance_payable_entitlements e
  where e.id in(select (x->>'entitlement_id')::uuid from jsonb_array_elements(p.choices_json) x) order by 1,2 loop
  perform public.vp_received_lock(case when r.source_type='payment' then r.received_money_id end,case when r.source_type='direct_money_receipt' then r.received_money_id end);
 end loop;
 perform 1 from public.finance_vp_revenue_distributions where id in(select (x#>>'{entitlement,distribution_id}')::uuid from jsonb_array_elements(p.choices_json) x) order by id for update;
 perform 1 from public.finance_payable_entitlements where id in(select (x->>'entitlement_id')::uuid from jsonb_array_elements(p.choices_json) x) order by id for update;
 select * into p from public.finance_payouts where id=p_id for update;
 if p.status<>'draft' or p.version is distinct from p_expected_version then raise exception 'PAYOUT_STALE'; end if;
 canonical:=public.payout_choices(p.payee_id,(select jsonb_agg(jsonb_build_object('entitlement_id',x->'entitlement_id','treatment',x->'treatment','rate',x->'rate')) from jsonb_array_elements(p.choices_json) x));
 if canonical is distinct from p.choices_json then raise exception 'PAYOUT_STALE'; end if;
 select * into payee from public.finance_payees where id=p.payee_id for share;
 if not payee.is_active or payee.version is distinct from p_expected_payee_version or (payee.profile_id is not null and not exists(select 1 from public.user_profiles where id=payee.profile_id and active))
 then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 select * into dest from public.finance_payee_destinations where payee_id=payee.id and is_active for share;
 if not p_actual_outflow_only and p.bank_account_id is not null and (dest.id is null or dest.id is distinct from p_expected_destination_id) then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
 if p.wht_amount>0 and payee.tax_id is null then raise exception 'PAYOUT_TAX_ID_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 if not public.treasury_location_active(p.bank_account_id,p.cash_location_id) or not public.treasury_can_view(p.bank_account_id,p.cash_location_id) then raise exception 'PAYOUT_ACCOUNT_REQUIRED'; end if;
 select * into opening from public.finance_account_opening_balances where bank_account_id is not distinct from p.bank_account_id
  and cash_location_id is not distinct from p.cash_location_id and currency='THB' and status='confirmed' for update;
 if opening.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
 if public.finance_bangkok_completed_day_end(p.paid_on)<=opening.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 select to_jsonb(a) into account from public.finance_treasury_balances a where a.bank_account_id is not distinct from p.bank_account_id and a.cash_location_id is not distinct from p.cash_location_id;
 snapshot:=jsonb_build_object('schema_version',1,'payee',to_jsonb(payee),'destination',case when p.bank_account_id is not null and dest.id is not null then to_jsonb(dest) end,
  'account',account,'opening',to_jsonb(opening),'choices',canonical,'gross',p.gross_amount,'wht',p.wht_amount,'net',p.net_amount,'paid_on',p.paid_on,'currency','THB');
 if p_actual_outflow_only then snapshot:=snapshot||jsonb_build_object('entry_point','distribution_participant','actual_company_cash_moved',true); end if;
 update public.finance_payouts set status='confirmed',version=version+1,confirmed_snapshot_json=snapshot,confirmed_at=ts,confirmed_by=auth.uid(),updated_by=auth.uid(),updated_at=ts where id=p.id;
 for c in select value from jsonb_array_elements(canonical) loop
  insert into public.finance_payout_allocations(payout_id,entitlement_id,gross_amount,treatment,rate,wht_amount,evidence_json)
   values(p.id,(c->>'entitlement_id')::uuid,(c->>'gross')::numeric,c->>'treatment',(c->>'rate')::numeric,(c->>'wht')::numeric,c) returning id into allocation;
  if (c->>'wht')::numeric>0 then
   insert into public.finance_outgoing_wht_obligations(payout_source_id,source_line_id,source_fingerprint,payee_json,gross_base,explicit_treatment,explicit_rate,withheld_amount,withheld_on,period_month,currency,evidence_json)
    values(p.id,allocation,md5(c::text),to_jsonb(payee),(c->>'gross')::numeric,c->>'treatment',(c->>'rate')::numeric,(c->>'wht')::numeric,p.paid_on,date_trunc('month',p.paid_on)::date,'THB',c);
  end if;
 end loop;
 insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,source_payout_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
  values(public.finance_bangkok_completed_day_end(p.paid_on),'outflow','other',p.bank_account_id,p.cash_location_id,p.net_amount,'THB','confirmed',p.id,upper(left(p.id::text,8)),'Payout',auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
 perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('payout_id',p.id,'payout',snapshot,'outgoing_wht_is_not_cash_outflow',true));
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'confirmed',p.version+1,auth.uid(),snapshot);
 return p.id;
end;
$confirm$;

create or replace function public.confirm_finance_payout_before_expense(p_id uuid,p_expected_version integer,p_expected_payee_version integer,p_expected_destination_id uuid,p_acknowledged boolean)
returns uuid language sql security definer set search_path=public as $fn$
 select public.payout_confirm_distribution_outflow(p_id,p_expected_version,p_expected_payee_version,p_expected_destination_id,p_acknowledged,false);
$fn$;

create function public.get_finance_distribution_payment_context(p_distribution_id uuid,p_entitlement_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_payable_entitlements%rowtype; w jsonb;
begin
 if not public.money_allocation_admin() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 select * into e from public.finance_payable_entitlements where id=p_entitlement_id and distribution_id=p_distribution_id and status='open';
 if e.id is null or not exists(select 1 from public.finance_vp_revenue_distributions where id=p_distribution_id and status='finalized')
  or exists(select 1 from public.finance_payout_allocations where entitlement_id=e.id) then raise exception 'PAYOUT_RIGHTS_UNAVAILABLE'; end if;
 perform public.payable_assert_distribution(p_distribution_id);
 w:=public.get_finance_payout_workspace(e.recipient_id,null);
 return jsonb_build_object('component',to_jsonb(e),'payee',(select p from jsonb_array_elements(w->'payees') p where p->>'id'=e.recipient_id::text),
  'accounts',w->'accounts','wht_treatment',null,'wht_rate',null);
 -- Recipient identity/entity/Tax ID do not establish an outgoing WHT rate. No history-based rate inference.
end;
$fn$;

create function public.pay_finance_distribution_participant(p_distribution_id uuid,p_entitlement_id uuid,p_request_id uuid,
 p_expected_payee_version integer,p_paid_on date,p_bank_account_id uuid,p_cash_location_id uuid,p_treatment text,p_rate numeric,p_note text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_payable_entitlements%rowtype; d public.finance_vp_revenue_distributions%rowtype;
 p public.finance_payouts%rowtype; payee public.finance_payees%rowtype; choice jsonb; dest uuid;
begin
 if not public.money_allocation_admin() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'PAYOUT_ACK_REQUIRED'; end if;
 if p_request_id is null or p_note is null or length(p_note)>2000 then raise exception 'PAYOUT_INPUT_INVALID'; end if;
 if p_treatment is null or p_rate is null or p_rate<>round(p_rate,4)
  or not ((p_treatment='none' and p_rate=0) or (p_treatment='withhold' and p_rate>0 and p_rate<100)) then raise exception 'PAYOUT_WHT_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0));
 select * into e from public.finance_payable_entitlements where id=p_entitlement_id and distribution_id=p_distribution_id;
 if e.id is null then raise exception 'PAYOUT_RIGHTS_UNAVAILABLE'; end if;
 -- Identical completed request retry is accepted before mutable master-data revalidation.
 select * into p from public.finance_payouts where id=p_request_id;
 if p.id is not null then
  if p.status='confirmed' and p.source_model='revenue_distribution_v1' and p.confirmed_snapshot_json->>'entry_point'='distribution_participant'
   and p.payee_id=e.recipient_id and p.paid_on=p_paid_on and p.bank_account_id is not distinct from p_bank_account_id
   and p.cash_location_id is not distinct from p_cash_location_id and p.note=p_note
   and jsonb_array_length(p.choices_json)=1 and p.choices_json#>>'{0,entitlement_id}'=e.id::text
   and p.choices_json#>>'{0,treatment}'=p_treatment and (p.choices_json#>>'{0,rate}')::numeric=p_rate then return p.id; end if;
  raise exception 'PAYOUT_STALE';
 end if;
 perform public.vp_received_lock(case when e.source_type='payment' then e.received_money_id end,case when e.source_type='direct_money_receipt' then e.received_money_id end);
 select * into d from public.finance_vp_revenue_distributions where id=p_distribution_id for update;
 select * into e from public.finance_payable_entitlements where id=p_entitlement_id for update;
 if d.status<>'finalized' or e.status<>'open' or exists(select 1 from public.finance_payout_allocations where entitlement_id=e.id)
 then raise exception 'PAYOUT_RIGHTS_UNAVAILABLE'; end if;
 perform public.payable_assert_distribution(d.id);
 -- Same deterministic internal identity as existing Payee save. Nothing is created on a read.
 perform pg_advisory_xact_lock(hashtextextended('payee:'||e.recipient_id,0));
 select * into payee from public.finance_payees where id=e.recipient_id for share;
 if payee.version is distinct from p_expected_payee_version then raise exception 'PAYOUT_STALE'; end if;
 if payee.id is null then
  if e.recipient_type<>'user' then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
  perform public.save_finance_payee(e.recipient_id,e.recipient_id,'{}',null);
  select * into payee from public.finance_payees where id=e.recipient_id for share;
 end if;
 choice:=jsonb_build_array(jsonb_build_object('entitlement_id',e.id,'treatment',p_treatment,'rate',p_rate));
 perform public.save_finance_payout(p_request_id,e.recipient_id,p_paid_on,p_bank_account_id,p_cash_location_id,choice,p_note,null);
 select id into dest from public.finance_payee_destinations where payee_id=e.recipient_id and is_active;
 return public.payout_confirm_distribution_outflow(p_request_id,1,payee.version,dest,true,true);
end;
$fn$;

create or replace function public.get_finance_revenue_distribution_detail(p_source_type text,p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare context jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_source_type='payment' then context:=public.get_finance_vp_formula_context(p_source_id);
 elsif p_source_type='direct_money_receipt' then context:=public.get_finance_direct_vp_formula_context(p_source_id);
 else raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return context||jsonb_build_object('summary',public.vp_distribution_workspace_row(p_source_type,p_source_id),
  'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'source_line_id',e.source_line_id,'component_no',e.component_no,
   'recipient_id',e.recipient_id,'gross_amount',e.gross_amount,'payout_id',p.id,'paid_on',p.paid_on,'net_amount',p.net_amount,'wht_amount',p.wht_amount,
   'account',coalesce(p.confirmed_snapshot_json#>>'{account,name_th}',p.confirmed_snapshot_json#>>'{account,name_en}')) order by e.source_line_id,e.component_no),'[]')
   from public.finance_payable_entitlements e left join public.finance_payout_allocations a on a.entitlement_id=e.id
   left join public.finance_payouts p on p.id=a.payout_id and p.status='confirmed'
   where e.distribution_id=(context#>>'{current,id}')::uuid and e.status='open'));
end;
$fn$;

-- Existing replaced functions retain their established owner/ACL; no defaults are relied upon for new helpers.
alter function public.payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean) owner to postgres;
revoke all on function public.payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean) from public,anon,authenticated,service_role;
alter function public.get_finance_distribution_payment_context(uuid,uuid) owner to postgres;
revoke all on function public.get_finance_distribution_payment_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_distribution_payment_context(uuid,uuid) to authenticated;
alter function public.pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean) owner to postgres;
revoke all on function public.pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean) to authenticated;
