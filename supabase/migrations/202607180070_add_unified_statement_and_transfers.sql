-- Phase 4 candidate. No historical classification, backfill or cash posting.
-- One Expense is one indivisible economic/VAT unit. Mixed burdens require separate items.
create table public.finance_expense_economic_decisions (
 id uuid primary key,
 expense_id uuid not null references public.finance_expenses(id),
 revision integer not null check(revision>0),
 previous_id uuid unique references public.finance_expense_economic_decisions(id),
 treatment text not null check(treatment in ('COMPANY_COST','CLIENT_RECOVERABLE')),
 approved_recoverable_vat numeric(14,2) check(approved_recoverable_vat>=0),
 context_json jsonb not null check(jsonb_typeof(context_json)='object'),
 request_json jsonb not null check(jsonb_typeof(request_json)='object'),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(expense_id,revision)
);
alter table public.finance_expense_economic_decisions owner to postgres;
alter table public.finance_expense_economic_decisions enable row level security;
revoke all on public.finance_expense_economic_decisions from public,anon,authenticated,service_role;
grant select on public.finance_expense_economic_decisions to service_role;
create trigger expense_economic_immutable before update or delete on public.finance_expense_economic_decisions for each row execute function public.tax_position_immutable();
create trigger expense_economic_no_truncate before truncate on public.finance_expense_economic_decisions for each statement execute function public.protect_finance_cash_audit_event();

create function public.statement_expense_context(p_expense uuid)
returns jsonb language sql stable security definer set search_path=public as $fn$
 select jsonb_build_object('expense_id',e.id,'origin',e.origin,'status',e.status,
  'original_gross',public.company_expense_reviewed_gross(e.id),'approved_gross',s.amount,'settlement_id',s.id,
  'vat_review_id',r.id,'vat_status',public.tax_expense_input_vat_status(e.id),
  'source_vat',coalesce(r.vat_amount,0),'recoverable_vat',case public.tax_expense_input_vat_status(e.id)
    when 'eligible' then r.vat_amount when 'pending' then null else 0 end)
 from public.finance_expenses e left join public.finance_expense_settlements s on s.expense_id=e.id
 left join lateral(select * from public.finance_expense_tax_reviews where expense_id=e.id order by revision desc limit 1) r on true
 where e.id=p_expense and e.origin in ('company_purchase','employee_claim');
$fn$;

create function public.get_finance_expense_economics(p_expense uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare c jsonb; d public.finance_expense_economic_decisions%rowtype;
begin
 if not public.expense_can_read(p_expense) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 c:=public.statement_expense_context(p_expense);
 select * into d from public.finance_expense_economic_decisions where expense_id=p_expense order by revision desc limit 1;
 return jsonb_build_object('context',c,'decision',to_jsonb(d),'effective',d.id is not null and d.approved_recoverable_vat is not null and d.context_json=c,
  'can_manage',public.expense_can_manage());
end;
$fn$;

create function public.classify_finance_expense(p_id uuid,p_expense uuid,p_previous uuid,p_treatment text,p_approved_vat numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare c jsonb; d public.finance_expense_economic_decisions%rowtype; old public.finance_expense_economic_decisions%rowtype;
 payload jsonb; vat numeric; gross numeric; original numeric; available numeric;
begin
 if not public.expense_can_manage() or not public.expense_can_read(p_expense) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_id is null or p_treatment is null or p_treatment not in ('COMPANY_COST','CLIENT_RECOVERABLE')
  or length(coalesce(btrim(p_reason),'')) not between 1 and 2000 then raise exception 'STATEMENT_ECONOMIC_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 perform 1 from public.finance_expenses where id=p_expense for update;
 payload:=jsonb_build_object('expense',p_expense,'previous',p_previous,'treatment',p_treatment,'vat',p_approved_vat,'reason',btrim(p_reason));
 select * into d from public.finance_expense_economic_decisions where id=p_id;
 if d.id is not null then
  if d.request_json=payload and d.created_by=auth.uid() then return p_id; end if;
  raise exception 'STATEMENT_IDEMPOTENCY_CONFLICT';
 end if;
 select * into old from public.finance_expense_economic_decisions where expense_id=p_expense order by revision desc limit 1;
 if old.id is distinct from p_previous then raise exception 'EXPENSE_STALE'; end if;
 c:=public.statement_expense_context(p_expense);
 gross:=(c->>'approved_gross')::numeric; original:=(c->>'original_gross')::numeric; available:=(c->>'recoverable_vat')::numeric;
 if c is null or c->>'status'<>'accepted' or gross is null or gross<=0 or gross>original then raise exception 'STATEMENT_SETTLEMENT_REQUIRED'; end if;
 -- Preserve legacy approval when VAT evidence is unresolved. NULL is not zero:
 -- this records only burden, and cannot enter Company Statement until corrected.
 if available is null then
  if p_approved_vat is not null then raise exception 'STATEMENT_VAT_UNRESOLVED'; end if;
  vat:=null;
 elsif gross<original and (c->>'source_vat')::numeric>0 then
  if p_approved_vat is null then raise exception 'STATEMENT_APPROVED_VAT_REQUIRED'; end if;
  vat:=p_approved_vat;
 else
  vat:=available;
  if p_approved_vat is not null and p_approved_vat<>vat then raise exception 'STATEMENT_VAT_DERIVED'; end if;
 end if;
 if vat<0 or vat<>round(vat,2) or vat>available or vat>gross or vat='NaN'::numeric then raise exception 'STATEMENT_APPROVED_VAT_INVALID'; end if;
 insert into public.finance_expense_economic_decisions(id,expense_id,revision,previous_id,treatment,approved_recoverable_vat,context_json,request_json,reason,created_by)
 values(p_id,p_expense,coalesce(old.revision,0)+1,old.id,p_treatment,vat,c,payload,btrim(p_reason),auth.uid());
 return p_id;
end;
$fn$;

-- Existing approval/payment/Tax Position contracts are unchanged. New UI composes
-- approval and the economic decision atomically; old callers remain UNCLASSIFIED.
create function public.review_finance_expense_with_economics(p_kind text,p_operation uuid,p_expense uuid,p_version integer,p_accept boolean,p_input jsonb,p_amount numeric,p_reason text,p_treatment text,p_approved_vat numeric)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 if p_kind='company_purchase' then
  perform public.review_finance_company_purchase_request(p_operation,p_expense,p_version,p_accept,p_input,p_reason);
 elsif p_kind='employee_claim' then
  perform public.review_finance_employee_reimbursement(p_operation,p_expense,p_version,p_accept,p_amount,p_reason);
 else raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if p_accept then
  perform public.classify_finance_expense(p_operation,p_expense,null,p_treatment,p_approved_vat,coalesce(nullif(btrim(p_reason),''),'Finance approved expense burden'));
 end if;
 return p_expense;
end;
$fn$;

create table public.finance_treasury_transfers (
 id uuid primary key,
 from_bank_id uuid references public.finance_bank_accounts(id), from_cash_id uuid references public.finance_cash_locations(id),
 to_bank_id uuid references public.finance_bank_accounts(id), to_cash_id uuid references public.finance_cash_locations(id),
 amount numeric(14,2) not null check(amount>0 and amount<>'NaN'::numeric),
 transferred_on date not null, currency text not null default 'THB' check(currency='THB'),
 reference text generated always as ('TRF-'||upper(id::text)) stored unique,
 note text not null default '' check(length(note)<=2000),
 confirmed_by uuid not null references public.user_profiles(id), confirmed_at timestamptz not null default clock_timestamp(),
 check(num_nonnulls(from_bank_id,from_cash_id)=1 and num_nonnulls(to_bank_id,to_cash_id)=1),
 check(from_bank_id is distinct from to_bank_id or from_cash_id is distinct from to_cash_id)
);
alter table public.finance_treasury_transfers owner to postgres;
alter table public.finance_treasury_transfers enable row level security;
revoke all on public.finance_treasury_transfers from public,anon,authenticated,service_role;
grant select on public.finance_treasury_transfers to service_role;
create trigger treasury_transfer_immutable before update or delete on public.finance_treasury_transfers for each row execute function public.tax_position_immutable();
create trigger treasury_transfer_no_truncate before truncate on public.finance_treasury_transfers for each statement execute function public.protect_finance_cash_audit_event();
-- Separate bridge preserves every existing Cashbook row/column and its source contracts.
create table public.finance_treasury_transfer_legs (
 transfer_id uuid not null references public.finance_treasury_transfers(id),
 direction text not null check(direction in ('inflow','outflow')),
 cash_transaction_id uuid not null unique references public.finance_cash_transactions(id),
 primary key(transfer_id,direction)
);
alter table public.finance_treasury_transfer_legs owner to postgres;
alter table public.finance_treasury_transfer_legs enable row level security;
revoke all on public.finance_treasury_transfer_legs from public,anon,authenticated,service_role;
grant select on public.finance_treasury_transfer_legs to service_role;
create trigger treasury_transfer_leg_immutable before update or delete on public.finance_treasury_transfer_legs for each row execute function public.tax_position_immutable();
create trigger treasury_transfer_leg_no_truncate before truncate on public.finance_treasury_transfer_legs for each statement execute function public.protect_finance_cash_audit_event();

create function public.statement_transfer_allowed(p_from_bank uuid,p_from_cash uuid,p_to_bank uuid,p_to_cash uuid)
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.current_user_can_manage_finance_cash_transactions() and public.current_user_can_confirm_finance_cash_transactions()
  and public.treasury_can_view(p_from_bank,p_from_cash) and public.treasury_can_view(p_to_bank,p_to_cash);
$fn$;

create function public.statement_transfer_integrity()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare tid uuid; t public.finance_treasury_transfers%rowtype;
begin
 if tg_table_name='finance_cash_transactions' then
  if new.reversal_of_transaction_id is not null and exists(select 1 from public.finance_treasury_transfer_legs where cash_transaction_id=new.reversal_of_transaction_id)
   then raise exception 'STATEMENT_TRANSFER_IMMUTABLE'; end if;
  select transfer_id into tid from public.finance_treasury_transfer_legs where cash_transaction_id=new.id;
 elsif tg_table_name='finance_treasury_transfers' then tid:=new.id;
 else tid:=new.transfer_id; end if;
 if tid is null then return null; end if;
 select * into strict t from public.finance_treasury_transfers where id=tid;
 if (select count(*) from public.finance_treasury_transfer_legs where transfer_id=tid)<>2 or exists(
  select 1 from public.finance_treasury_transfer_legs l join public.finance_cash_transactions c on c.id=l.cash_transaction_id where l.transfer_id=tid and (
   c.direction<>l.direction or c.status<>'confirmed' or c.transaction_type<>'transfer' or c.cash_amount<>t.amount or c.currency<>t.currency
   or c.bank_account_id is distinct from case l.direction when 'outflow' then t.from_bank_id else t.to_bank_id end
   or c.cash_location_id is distinct from case l.direction when 'outflow' then t.from_cash_id else t.to_cash_id end
   or c.occurred_at<>public.finance_bangkok_completed_day_end(t.transferred_on)
   or c.confirmed_at<>t.confirmed_at or c.confirmed_by_user_id<>t.confirmed_by
   or num_nonnulls(c.source_payment_id,c.source_direct_money_receipt_id,c.source_payout_id,c.source_tax_remittance_id,c.reversal_of_transaction_id,c.source_snapshot_json)<>0
   or not exists(select 1 from public.finance_cash_transaction_audit_events a where a.cash_transaction_id=c.id and a.event_type='confirmed')
  )) then raise exception 'STATEMENT_TRANSFER_PAIR_INVALID'; end if;
 return null;
end;
$fn$;
create constraint trigger statement_transfer_integrity after insert on public.finance_treasury_transfers deferrable initially deferred for each row execute function public.statement_transfer_integrity();
create constraint trigger statement_transfer_leg_integrity after insert on public.finance_treasury_transfer_legs deferrable initially deferred for each row execute function public.statement_transfer_integrity();
create constraint trigger statement_transfer_cash_integrity after insert or update on public.finance_cash_transactions deferrable initially deferred for each row execute function public.statement_transfer_integrity();

create function public.confirm_finance_treasury_transfer(p_id uuid,p_from_bank uuid,p_from_cash uuid,p_to_bank uuid,p_to_cash uuid,p_amount numeric,p_date date,p_note text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare t public.finance_treasury_transfers%rowtype; leg text; cash uuid; bank uuid; location uuid; opening public.finance_account_opening_balances%rowtype;
begin
 if public.statement_transfer_allowed(p_from_bank,p_from_cash,p_to_bank,p_to_cash) is distinct from true then raise exception 'STATEMENT_TRANSFER_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'STATEMENT_TRANSFER_ACK_REQUIRED'; end if;
 if p_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount='NaN'::numeric
  or p_date is null or p_date>(current_timestamp at time zone 'Asia/Bangkok')::date or p_note is null or length(p_note)>2000
  or num_nonnulls(p_from_bank,p_from_cash)<>1 or num_nonnulls(p_to_bank,p_to_cash)<>1
  or (p_from_bank is not distinct from p_to_bank and p_from_cash is not distinct from p_to_cash) then raise exception 'STATEMENT_TRANSFER_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('treasury_transfer:'||p_id,0));
 select * into t from public.finance_treasury_transfers where id=p_id;
 if t.id is not null then
  if t.from_bank_id is not distinct from p_from_bank and t.from_cash_id is not distinct from p_from_cash
   and t.to_bank_id is not distinct from p_to_bank and t.to_cash_id is not distinct from p_to_cash
   and t.amount=p_amount and t.transferred_on=p_date and t.note=btrim(p_note) and t.confirmed_by=auth.uid() then return p_id; end if;
  raise exception 'STATEMENT_IDEMPOTENCY_CONFLICT';
 end if;
 -- Existing cutover lock serializes openings and actual money confirmation.
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 perform 1 from public.finance_bank_accounts where id in (p_from_bank,p_to_bank) order by id for share;
 perform 1 from public.finance_cash_locations where id in (p_from_cash,p_to_cash) order by id for share;
 if not public.treasury_location_active(p_from_bank,p_from_cash) or not public.treasury_location_active(p_to_bank,p_to_cash) then raise exception 'STATEMENT_TRANSFER_ACCOUNT_INVALID'; end if;
 foreach leg in array array['outflow','inflow'] loop
  bank:=case leg when 'outflow' then p_from_bank else p_to_bank end; location:=case leg when 'outflow' then p_from_cash else p_to_cash end;
  select * into opening from public.finance_account_opening_balances where bank_account_id is not distinct from bank and cash_location_id is not distinct from location and currency='THB' and status='confirmed' for update;
  if opening.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
  if public.finance_bangkok_completed_day_end(p_date)<=opening.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 end loop;
 insert into public.finance_treasury_transfers(id,from_bank_id,from_cash_id,to_bank_id,to_cash_id,amount,transferred_on,note,confirmed_by)
 values(p_id,p_from_bank,p_from_cash,p_to_bank,p_to_cash,p_amount,p_date,btrim(p_note),auth.uid()) returning * into t;
 foreach leg in array array['outflow','inflow'] loop
  insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
  values(public.finance_bangkok_completed_day_end(p_date),leg,'transfer',case leg when 'outflow' then p_from_bank else p_to_bank end,
   case leg when 'outflow' then p_from_cash else p_to_cash end,p_amount,'THB','confirmed',t.reference,'Inter-account transfer',auth.uid(),auth.uid(),t.confirmed_at,auth.uid()) returning id into cash;
  insert into public.finance_treasury_transfer_legs values(p_id,leg,cash);
  perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('transfer',to_jsonb(t),'direction',leg,'company_economic_effect',0));
 end loop;
 return p_id;
end;
$fn$;

-- The 069 projection is preserved verbatim through its projected CTE; only
-- pagination/filtering is lifted so the unified read can total both source families.
create function public.statement_company_income()
returns setof jsonb language sql stable security definer set search_path=public as $fn$
 with sources as (
  select 'payment'::text kind,p.id,to_jsonb(p) facts from public.finance_payments p where p.status='confirmed'
  union all select 'direct_money_receipt',p.id,to_jsonb(p) from public.finance_direct_money_receipts p where p.status='confirmed'
 ), projected as materialized (
  select d.id distribution_id,d.revision,d.finalized_at,d.source_snapshot_json->>'policy_version' policy,s.kind source_type,s.id source_id,
   (s.facts->>'received_on')::date received_on,s.facts->>'currency' currency,
   public.company_statement_frozen_share(d.source_snapshot_json,d.decisions_json) share,
   coalesce(receipts.reference,nullif(s.facts->>'internal_reference',''),nullif(s.facts->>'reference_no','')) reference,
   coalesce(cl.name,s.facts->>'payer_name') client,
   receipts.references document_references,
   case when s.kind='payment' then (
    select string_agg(distinct coalesce(nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'')),' / ')
    from public.finance_payment_effective_invoice_allocations e join public.finance_invoices i on i.id=e.invoice_id
    left join public.cases c on c.id=i.case_id left join public.advisory_matters a on a.id=i.advisory_matter_id where e.payment_id=s.id
   ) else coalesce((select nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),'') from public.cases c where c.id=nullif(s.facts->>'case_id','')::bigint),
    (select nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'') from public.advisory_matters a where a.id=nullif(s.facts->>'advisory_matter_id','')::uuid)) end matter
  from public.finance_vp_revenue_distributions d join sources s on (s.kind='payment' and d.payment_id=s.id) or (s.kind='direct_money_receipt' and d.direct_money_receipt_id=s.id)
  left join public.clients cl on cl.id=nullif(s.facts->>'client_id','')::uuid
  left join lateral (select min(r.receipt_no) reference,string_agg(r.receipt_no,' · ' order by r.receipt_no) references from public.finance_receipts r where r.status='issued' and ((s.kind='payment' and r.payment_id=s.id) or (s.kind='direct_money_receipt' and r.direct_money_receipt_id=s.id))) receipts on true
  where d.status='finalized' and d.finalized_at is not null
   -- Existing partial unique source indexes enforce one active revision.
   and not exists(select 1 from public.finance_vp_revenue_distributions newer where newer.status<>'superseded' and newer.revision>d.revision and ((d.payment_id is not null and newer.payment_id=d.payment_id) or (d.direct_money_receipt_id is not null and newer.direct_money_receipt_id=d.direct_money_receipt_id)))
 )
select to_jsonb(p)-'share'||p.share from projected p where share is not null and (share->>'amount')::numeric>0;
$fn$;

create function public.get_finance_unified_company_statement(p_from date,p_to date,p_type text default 'all',p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'COMPANY_STATEMENT_PERMISSION_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>200
  or p_type is null or p_type not in ('all','income','company_purchase','employee_claim') then raise exception 'COMPANY_STATEMENT_FILTER_INVALID'; end if;
 with income as (
  select x||jsonb_build_object('id',x->>'distribution_id','kind','income','economic_date',x->>'received_on','income',x->'amount','expense',0,
   'href','/finance/revenue-distribution/'||(x->>'source_type')||'/'||(x->>'source_id')) row from public.statement_company_income() x
 ), candidates as materialized (
  select e.*,a.gross_amount settled_gross,p.paid_on,p.confirmed_at,p.net_amount,p.wht_amount,d.id decision_id,d.treatment,d.approved_recoverable_vat,
   d.approved_recoverable_vat is not null and d.context_json=public.statement_expense_context(e.id) valid,cl.name client,
   coalesce(nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(m)->>'matter_no',to_jsonb(m)->>'title'),'')) matter
  from public.finance_expenses e join public.finance_payout_allocations a on a.expense_id=e.id
  join public.finance_payouts p on p.id=a.payout_id and p.status='confirmed' and p.source_model='expense_v1'
  join public.finance_cash_transactions cash on cash.source_payout_id=p.id and cash.status='confirmed' and cash.reversal_of_transaction_id is null
  left join lateral(select * from public.finance_expense_economic_decisions where expense_id=e.id order by revision desc limit 1) d on true
  left join public.clients cl on cl.id=e.client_id left join public.cases c on c.id=e.case_id left join public.advisory_matters m on m.id=e.advisory_matter_id
  where e.origin in ('company_purchase','employee_claim') and e.status='accepted' and public.expense_can_read(e.id)
   and not exists(select 1 from public.finance_cash_transactions reversed where reversed.reversal_of_transaction_id=cash.id and reversed.status='confirmed')
   and not exists(select 1 from public.finance_expense_obligation_waivers w where w.obligation_id=a.expense_obligation_id)
 ), expenses as (
  select jsonb_build_object('id',id,'source_id',id,'kind',origin,'source_type',origin,'economic_date',paid_on,'confirmed_at',confirmed_at,'currency',currency,
   'reference',reference,'description',description,'category',category,'vendor',vendor_name,'client',client,'matter',matter,
   'income',0,'expense',settled_gross-approved_recoverable_vat,'gross',settled_gross,'recoverable_vat',approved_recoverable_vat,'wht',wht_amount,'cash',net_amount,
   'href','/finance/expenses/'||case origin when 'employee_claim' then 'claims/' else '' end||id) row
  from candidates where treatment='COMPANY_COST' and valid and settled_gross>=approved_recoverable_vat
 ), filtered as materialized (
  select row from (select row from income union all select row from expenses) x where (row->>'economic_date')::date between p_from and p_to
   and (p_type='all' or row->>'kind'=p_type)
   and (btrim(p_search)='' or strpos(lower(concat_ws(' ',row->>'reference',row->>'document_references',row->>'description',row->>'category',row->>'vendor',row->>'client',row->>'matter')),lower(btrim(p_search)))>0)
 ), page as(select row from filtered order by row->>'economic_date' desc,row->>'kind',row->>'id' limit 50 offset p_offset)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(row order by row->>'economic_date' desc,row->>'kind',row->>'id'),'[]') from page),
  'count',(select count(*) from filtered),'income',(select coalesce(sum((row->>'income')::numeric),0) from filtered),
  'expense',(select coalesce(sum((row->>'expense')::numeric),0) from filtered),
  'unclassified_count',(select count(*) from candidates where paid_on between p_from and p_to and (decision_id is null or valid is distinct from true))) into result;
 return result;
end;
$fn$;

create function public.get_finance_statement_accounts()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.current_user_can_view_finance_cash_transactions() then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 return jsonb_build_object('can_transfer',public.current_user_can_manage_finance_cash_transactions() and public.current_user_can_confirm_finance_cash_transactions(),
  'can_manage_openings',public.money_allocation_admin(),
  'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by kind,name_th,account_id),'[]') from public.finance_treasury_accounts a));
end;
$fn$;

create function public.get_finance_account_statement(p_bank uuid,p_cash uuid,p_from date,p_to date,p_type text default 'all',p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare o public.finance_account_opening_balances%rowtype; start_at timestamptz; end_at timestamptz; result jsonb; covered boolean;
begin
 if public.treasury_can_view(p_bank,p_cash) is distinct from true then raise exception 'TREASURY_PERMISSION_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_offset is null or p_offset<0 or p_offset>100000 or p_search is null or length(p_search)>200
  or p_type is null or p_type not in ('all','payment','direct_money_receipt','company_purchase','employee_claim','participant_payout','tax_remittance','transfer','other') then raise exception 'STATEMENT_FILTER_INVALID'; end if;
 start_at:=p_from::timestamp at time zone 'Asia/Bangkok'; end_at:=(p_to+1)::timestamp at time zone 'Asia/Bangkok';
 select * into o from public.finance_account_opening_balances where bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash and currency='THB' and status='confirmed';
 covered:=o.id is not null and start_at>o.as_of;
 with history as materialized (
  select c.*,case when c.occurred_at>o.as_of then o.balance_amount+sum(case when c.occurred_at>o.as_of then case c.direction when 'inflow' then c.cash_amount else -c.cash_amount end else 0 end)
   over(order by c.occurred_at,c.confirmed_at,c.id rows between unbounded preceding and current row) end balance
  from public.finance_cash_transactions c where c.bank_account_id is not distinct from p_bank and c.cash_location_id is not distinct from p_cash and c.currency='THB' and c.status='confirmed' and c.occurred_at<end_at
 ), enriched as materialized (
  select h.id,h.occurred_at,h.confirmed_at,h.direction,h.cash_amount,h.balance,h.reference_no,case when leg.transfer_id is not null then t.note when e.id is not null then coalesce(nullif(e.description,''),e.category) else h.description end description,h.reversal_of_transaction_id,
   coalesce(cl.name,payment.payer_name,dm.payer_name) client,coalesce(payment_matter.matter,nullif(concat_ws(' · ',to_jsonb(cs)->>'file_no',to_jsonb(cs)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(am)->>'matter_no',to_jsonb(am)->>'title'),'')) matter,
   coalesce(nullif(u.staff_name,''),u.full_name) confirmed_by,
   case when leg.transfer_id is not null then 'transfer' when h.source_payment_id is not null then 'payment' when h.source_direct_money_receipt_id is not null then 'direct_money_receipt'
    when h.source_tax_remittance_id is not null then 'tax_remittance' when p.source_model='expense_v1' then coalesce(e.origin,'other') when h.source_payout_id is not null then 'participant_payout' else 'other' end kind,
   coalesce(e.reference,receipts.reference,dm.reference_no,payment.internal_reference,h.reference_no) reference,
   case when leg.transfer_id is not null then '/finance/statement/transfers'
    when payment.id is not null then '/finance/payments/'||payment.id when dm.id is not null then '/finance/direct-money/'||dm.id
    when h.source_tax_remittance_id is not null and public.tax_position_can_view() then '/finance/tax-position/filings' when e.id is not null then '/finance/expenses/'||case e.origin when 'employee_claim' then 'claims/' else '' end||e.id
    when h.source_payout_id is not null and public.current_user_can_view_finance_payments() then '/finance/payouts/'||h.source_payout_id end href,
   coalesce(e.vendor_name,dm.payer_name) party,leg.transfer_id,case when leg.transfer_id is not null then
    (select coalesce(a.name_th,a.name_en) from public.finance_treasury_accounts a where a.bank_account_id is not distinct from case h.direction when 'outflow' then t.to_bank_id else t.from_bank_id end
      and a.cash_location_id is not distinct from case h.direction when 'outflow' then t.to_cash_id else t.from_cash_id end) end counterpart,t.note transfer_note
  from history h left join public.finance_payouts p on p.id=h.source_payout_id left join public.finance_payout_allocations pa on pa.payout_id=p.id and pa.expense_id is not null
  left join public.finance_expenses e on e.id=pa.expense_id and public.expense_can_read(e.id) left join public.finance_payments payment on payment.id=h.source_payment_id and public.current_user_can_view_finance_payments()
  left join public.finance_direct_money_receipts dm on dm.id=h.source_direct_money_receipt_id and public.current_user_can_view_finance_payments()
  left join lateral(select min(r.receipt_no) reference from public.finance_receipts r where r.status='issued' and (r.payment_id=payment.id or r.direct_money_receipt_id=dm.id)) receipts on true
  left join lateral(select string_agg(distinct coalesce(nullif(concat_ws(' · ',to_jsonb(c)->>'file_no',to_jsonb(c)->>'title'),''),nullif(concat_ws(' · ',to_jsonb(a)->>'matter_no',to_jsonb(a)->>'title'),'')),' / ') matter
   from public.finance_payment_effective_invoice_allocations allocation join public.finance_invoices i on i.id=allocation.invoice_id
   left join public.cases c on c.id=i.case_id left join public.advisory_matters a on a.id=i.advisory_matter_id where allocation.payment_id=payment.id) payment_matter on true
  left join public.clients cl on cl.id=coalesce(e.client_id,payment.client_id,dm.client_id)
  left join public.cases cs on cs.id=coalesce(e.case_id,dm.case_id) left join public.advisory_matters am on am.id=coalesce(e.advisory_matter_id,dm.advisory_matter_id)
  left join public.user_profiles u on u.id=h.confirmed_by_user_id
  left join public.finance_treasury_transfer_legs leg on leg.cash_transaction_id=h.id left join public.finance_treasury_transfers t on t.id=leg.transfer_id
  where h.occurred_at>=start_at
 ), filtered as materialized (
  select * from enriched where (p_type='all' or kind=p_type) and (btrim(p_search)='' or strpos(lower(concat_ws(' ',reference,description,party,client,matter,counterpart,transfer_note)),lower(btrim(p_search)))>0)
 ), page as(select * from filtered order by occurred_at desc,confirmed_at desc,id desc limit 50 offset p_offset)
 select jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(p) order by occurred_at desc,confirmed_at desc,id desc),'[]') from page p),
  'count',(select count(*) from filtered),'balance_covered',covered,'opening_start',((o.as_of at time zone 'Asia/Bangkok')::date+1),
  'opening',case when covered then o.balance_amount+(select coalesce(sum(case direction when 'inflow' then cash_amount else -cash_amount end),0) from history where occurred_at>o.as_of and occurred_at<start_at) end,
  'inflow',(select coalesce(sum(cash_amount) filter(where direction='inflow'),0) from history where occurred_at>=start_at),
  'outflow',(select coalesce(sum(cash_amount) filter(where direction='outflow'),0) from history where occurred_at>=start_at),
  'closing',case when covered then o.balance_amount+(select coalesce(sum(case direction when 'inflow' then cash_amount else -cash_amount end),0) from history where occurred_at>o.as_of) end) into result;
 return result;
end;
$fn$;

-- Explicit ownership/ACLs; no default-privilege assumptions or permissive policies.
do $security$
declare f record;
begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in (
  'statement_expense_context','get_finance_expense_economics','classify_finance_expense','review_finance_expense_with_economics',
  'statement_transfer_allowed','statement_transfer_integrity','confirm_finance_treasury_transfer','statement_company_income',
  'get_finance_unified_company_statement','get_finance_statement_accounts','get_finance_account_statement') loop
  execute format('alter function %s owner to postgres',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname in ('get_finance_expense_economics','classify_finance_expense','review_finance_expense_with_economics','confirm_finance_treasury_transfer',
   'get_finance_unified_company_statement','get_finance_statement_accounts','get_finance_account_statement') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end;
$security$;
