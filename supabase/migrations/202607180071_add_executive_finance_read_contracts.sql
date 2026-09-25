-- Phase 5A: read-only aggregates. No postings, backfill, new tables or indexes.
-- Each domain retains its own authorization; amounts are never mixed across currencies.
create function public.get_finance_cash_flow_summary(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if public.current_user_can_view_finance_cash_transactions() is distinct from true then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from then raise exception 'FINANCE_SUMMARY_RANGE_INVALID'; end if;
 with visible as materialized (
  select c.currency,c.direction,c.cash_amount,l.transfer_id
  from public.finance_cash_transactions c
  left join public.finance_treasury_transfer_legs l on l.cash_transaction_id=c.id
  where c.status='confirmed' and c.occurred_at>=p_from::timestamp at time zone 'Asia/Bangkok'
   and c.occurred_at<(p_to+1)::timestamp at time zone 'Asia/Bangkok'
   and public.treasury_can_view(c.bank_account_id,c.cash_location_id)
 ), transfers as (
  -- The 070 bridge/integrity contract guarantees two equal immutable cash legs.
  -- Count a visible transfer once, including when the caller sees only one leg.
  -- Do not inspect or expose the hidden account/counterpart movement.
  select currency,transfer_id,max(cash_amount) amount from visible where transfer_id is not null group by currency,transfer_id
 ), totals as (
  select currency,count(*) filter(where transfer_id is null and direction='inflow') external_inflow_count,
   coalesce(sum(cash_amount) filter(where transfer_id is null and direction='inflow'),0) external_inflow,
   count(*) filter(where transfer_id is null and direction='outflow') external_outflow_count,
   coalesce(sum(cash_amount) filter(where transfer_id is null and direction='outflow'),0) external_outflow
  from visible group by currency
 )
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
  'internal_transfer_count',(select count(*) from transfers x where x.currency=t.currency),
  'internal_transfer_amount',(select coalesce(sum(x.amount),0) from transfers x where x.currency=t.currency)) order by currency),'[]') into result from totals t;
 return jsonb_build_object('schema_version',1,'semantics','period','from_date',p_from,'to_date',p_to,
  'timezone','Asia/Bangkok','as_of',statement_timestamp(),'scope','visible_accounts','currencies',result);
end;
$fn$;

create function public.get_finance_receivables_summary()
returns jsonb language plpgsql stable security invoker set search_path=public as $fn$
declare today date:=(statement_timestamp() at time zone 'Asia/Bangkok')::date; result jsonb;
begin
 -- Same guard as Invoice SELECT policies. INVOKER also preserves all underlying
 -- Invoice/Payment/allocation RLS through the existing security-invoker view.
 if public.current_user_can_manage_finance_quotations() is distinct from true then raise exception 'INVOICE_PERMISSION_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by currency),'[]') into result from (
  select currency,count(*) outstanding_count,sum(outstanding_amount) outstanding_amount,
   count(*) filter(where is_overdue) overdue_count,coalesce(sum(outstanding_amount) filter(where is_overdue),0) overdue_amount,
   count(*) filter(where due_date between today and today+30) due_soon_count,
   coalesce(sum(outstanding_amount) filter(where due_date between today and today+30),0) due_soon_amount,
   count(*) filter(where due_date is null) no_due_date_count,
   coalesce(sum(outstanding_amount) filter(where due_date is null),0) no_due_date_amount
  from public.finance_invoice_settlement_summary where invoice_status='issued' and outstanding_amount>0 group by currency
 ) x;
 return jsonb_build_object('schema_version',1,'semantics','current','as_of',statement_timestamp(),
  'as_of_date',today,'timezone','Asia/Bangkok','due_soon_from',today,'due_soon_through',today+30,'currencies',result);
end;
$fn$;

create function public.get_finance_general_payables_summary()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare today date:=(statement_timestamp() at time zone 'Asia/Bangkok')::date; result jsonb;
begin
 if public.expense_can_view_all() is distinct from true then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 -- Same waiver/allocation lifecycle as get_finance_expense_obligations. An
 -- allocation settles the entire approved obligation; cash net of WHT is not its balance.
 select coalesce(jsonb_agg(to_jsonb(x) order by currency),'[]') into result from (
  select o.currency,count(*) outstanding_count,sum(o.gross_amount) outstanding_amount,
   count(*) filter(where o.source_type='supplier_payable') company_purchase_count,
   coalesce(sum(o.gross_amount) filter(where o.source_type='supplier_payable'),0) company_purchase_amount,
   count(*) filter(where o.source_type='employee_reimbursement') reimbursement_count,
   coalesce(sum(o.gross_amount) filter(where o.source_type='employee_reimbursement'),0) reimbursement_amount,
   count(*) filter(where o.due_on<today) overdue_count,coalesce(sum(o.gross_amount) filter(where o.due_on<today),0) overdue_amount,
   count(*) filter(where o.due_on between today and today+30) due_soon_count,
   coalesce(sum(o.gross_amount) filter(where o.due_on between today and today+30),0) due_soon_amount,
   count(*) filter(where o.due_on is null) no_due_date_count,
   coalesce(sum(o.gross_amount) filter(where o.due_on is null),0) no_due_date_amount
  from public.finance_expense_obligations o join public.finance_expenses e on e.id=o.expense_id
  where e.status='accepted' and o.source_type in ('supplier_payable','employee_reimbursement')
   and not exists(select 1 from public.finance_expense_obligation_waivers w where w.obligation_id=o.id)
   and not exists(select 1 from public.finance_payout_allocations a where a.expense_obligation_id=o.id)
  group by o.currency
 ) x;
 return jsonb_build_object('schema_version',1,'semantics','current','as_of',statement_timestamp(),
  'as_of_date',today,'timezone','Asia/Bangkok','due_soon_from',today,'due_soon_through',today+30,'currencies',result);
end;
$fn$;

create function public.get_finance_unpaid_participants_summary()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if public.current_user_can_view_finance_payments() is distinct from true then raise exception 'PAYABLE_PERMISSION_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by currency),'[]') into result from (
  select e.currency,count(*) unpaid_entitlement_count,count(distinct e.recipient_id) unpaid_participant_count,
   sum(e.gross_amount) unpaid_amount,min(e.finalized_at) oldest_unpaid_at
  from public.finance_payable_entitlements e
  join public.finance_payable_entitlement_sources s on s.distribution_id=e.distribution_id and s.status='open'
  join public.finance_vp_revenue_distributions d on d.id=e.distribution_id and d.status='finalized' and d.revision=e.distribution_revision
  where e.status='open' and e.recipient_type='user' and e.bucket in ('referral','work')
   and ((e.source_type='payment' and d.payment_id=e.received_money_id and exists(
     select 1 from public.finance_payments p where p.id=e.received_money_id and p.status='confirmed'))
    or (e.source_type='direct_money_receipt' and d.direct_money_receipt_id=e.received_money_id and exists(
     select 1 from public.finance_direct_money_receipts p where p.id=e.received_money_id and p.status='confirmed')))
   and not exists(select 1 from public.finance_payout_allocations a where a.entitlement_id=e.id)
  group by e.currency
 ) x;
 -- Current 051/068 lifecycle permits one full allocation per entitlement, never
 -- a partial entitlement payout. A partially paid distribution retains its other
 -- unpaid components at their full frozen gross amounts, including outgoing WHT.
 return jsonb_build_object('schema_version',1,'semantics','current','as_of',statement_timestamp(),
  'timezone','Asia/Bangkok','partial_entitlement_settlement_supported',false,'currencies',result);
end;
$fn$;

-- Explicit ownership/ACL; no creator/default privilege dependence or RLS changes.
alter function public.get_finance_cash_flow_summary(date,date) owner to postgres;
alter function public.get_finance_receivables_summary() owner to postgres;
alter function public.get_finance_general_payables_summary() owner to postgres;
alter function public.get_finance_unpaid_participants_summary() owner to postgres;
revoke all on function public.get_finance_cash_flow_summary(date,date),public.get_finance_receivables_summary(),
 public.get_finance_general_payables_summary(),public.get_finance_unpaid_participants_summary() from public,anon,authenticated,service_role;
grant execute on function public.get_finance_cash_flow_summary(date,date),public.get_finance_receivables_summary(),
 public.get_finance_general_payables_summary(),public.get_finance_unpaid_participants_summary() to authenticated,service_role;
notify pgrst, 'reload schema';
