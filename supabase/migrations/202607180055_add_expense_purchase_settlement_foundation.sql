-- CANDIDATE 055. No backfill, account grant, opening, payout, tax or cutover is executed.
-- Expense facts, tax review and settlement are independent, auditable axes.
create function public.expense_can_manage()
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and u.role not in ('partner','viewer') and coalesce((to_jsonb(u)->>'can_approve_expense_claims')::boolean,false));
$fn$;
create function public.expense_can_tax_review()
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.expense_can_manage() and public.tax_position_can_manage();
$fn$;
create function public.expense_can_view_all()
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.expense_can_manage() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and (u.role='partner' or coalesce((to_jsonb(u)->>'can_view_all_expense_claims')::boolean,false)));
$fn$;
create function public.expense_can_claim()
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.money_allocation_admin() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and u.active
  and u.role not in ('partner','viewer') and coalesce((to_jsonb(u)->>'can_submit_expense_claim')::boolean,false));
$fn$;

create table public.finance_treasury_account_authorities (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.user_profiles(id),
 bank_account_id uuid references public.finance_bank_accounts(id),
 cash_location_id uuid references public.finance_cash_locations(id),
 view_balance boolean not null default false,
 view_movements boolean not null default false,
 record_outflow boolean not null default false,
 confirm_outflow boolean not null default false,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.user_profiles(id),
 check(num_nonnulls(bank_account_id,cash_location_id)=1),
 check(not confirm_outflow or record_outflow)
);
create unique index expense_account_bank_authority on public.finance_treasury_account_authorities(user_id,bank_account_id) where bank_account_id is not null;
create unique index expense_account_cash_authority on public.finance_treasury_account_authorities(user_id,cash_location_id) where cash_location_id is not null;
create table public.finance_treasury_authority_audit (
 id uuid primary key default gen_random_uuid(), authority_id uuid not null references public.finance_treasury_account_authorities(id),
 version integer not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 1 and 2000), evidence_json jsonb not null,
 unique(authority_id,version)
);
create function public.expense_account_allowed(p_bank uuid,p_cash uuid,p_right text)
returns boolean language sql stable security definer set search_path=public as $fn$
 select num_nonnulls(p_bank,p_cash)=1 and p_right in ('view_balance','view_movements','record_outflow','confirm_outflow')
 and exists(select 1 from public.user_profiles where id=auth.uid() and active)
 and (public.money_allocation_admin()
  or (p_right in ('view_balance','view_movements') and public.treasury_can_view(p_bank,p_cash))
  or (p_right in ('record_outflow','confirm_outflow') and public.payout_can_manage() and public.treasury_can_view(p_bank,p_cash))
  or exists(select 1 from public.finance_treasury_account_authorities a join public.user_profiles u on u.id=a.user_id
   where a.user_id=auth.uid() and u.active and u.role not in ('partner','viewer')
    and a.bank_account_id is not distinct from p_bank and a.cash_location_id is not distinct from p_cash
    and (to_jsonb(a)->>p_right)::boolean));
$fn$;
create function public.set_finance_treasury_authority(p_user uuid,p_bank uuid,p_cash uuid,p_rights jsonb,p_version integer,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare a public.finance_treasury_account_authorities%rowtype; before_row jsonb;
begin
 if not public.money_allocation_admin() then raise exception 'EXPENSE_ADMIN_REQUIRED'; end if;
 if nullif(btrim(p_reason),'') is null or not public.treasury_location_active(p_bank,p_cash)
  or not exists(select 1 from public.user_profiles where id=p_user and active and role not in ('partner','viewer'))
  or jsonb_typeof(p_rights) is distinct from 'object' then raise exception 'EXPENSE_AUTHORITY_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense_authority:'||p_user,0));
 select * into a from public.finance_treasury_account_authorities where user_id=p_user
  and bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash for update;
 before_row:=to_jsonb(a);
 if a.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 if a.id is null then
  insert into public.finance_treasury_account_authorities(user_id,bank_account_id,cash_location_id,view_balance,view_movements,record_outflow,confirm_outflow,updated_by)
  values(p_user,p_bank,p_cash,coalesce((p_rights->>'view_balance')::boolean,false),coalesce((p_rights->>'view_movements')::boolean,false),
   coalesce((p_rights->>'record_outflow')::boolean,false),coalesce((p_rights->>'confirm_outflow')::boolean,false),auth.uid()) returning * into a;
 else
  update public.finance_treasury_account_authorities set view_balance=coalesce((p_rights->>'view_balance')::boolean,false),
   view_movements=coalesce((p_rights->>'view_movements')::boolean,false),record_outflow=coalesce((p_rights->>'record_outflow')::boolean,false),
   confirm_outflow=coalesce((p_rights->>'confirm_outflow')::boolean,false),version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid()
   where id=a.id returning * into a;
 end if;
 insert into public.finance_treasury_authority_audit(authority_id,version,actor_id,reason,evidence_json)
 values(a.id,a.version,auth.uid(),btrim(p_reason),jsonb_build_object('before',before_row,'after',to_jsonb(a)));
 return a.id;
end;
$fn$;

create table public.finance_expenses (
 id uuid primary key,
 origin text not null check(origin in ('company_purchase','employee_claim','legacy_claim')),
 -- Legacy predates repository migrations. Its canonical id::text is locked and checked by the bridge, never guessed as UUID.
 legacy_claim_id text unique,
 reference text generated always as ('EXP-'||upper(id::text)) stored unique,
 status text not null default 'draft' check(status in ('draft','submitted','accepted','rejected')),
 version integer not null default 1 check(version>0),
 expense_date date not null,
 description text not null check(length(btrim(description)) between 1 and 2000),
 category text not null check(length(btrim(category)) between 1 and 150),
 vendor_name text check(length(vendor_name)<=300),
 supplier_payee_id uuid references public.finance_payees(id),
 claimant_id uuid references public.user_profiles(id),
 client_id uuid references public.clients(id),
 case_id bigint references public.cases(id),
 advisory_matter_id uuid references public.advisory_matters(id),
 currency text not null default 'THB' check(currency='THB'),
 gross_amount numeric(14,2) not null check(gross_amount>0),
 personally_paid boolean not null default false,
 reimbursement_requested numeric(14,2) not null default 0 check(reimbursement_requested>=0 and reimbursement_requested<=gross_amount),
 vat_awareness text not null default 'unknown' check(vat_awareness in ('yes','no','unknown')),
 wht_awareness text not null default 'unknown' check(wht_awareness in ('yes','no','unknown')),
 note text not null default '' check(length(note)<=2000),
 submitted_at timestamptz,
 reviewed_at timestamptz, reviewed_by uuid references public.user_profiles(id), review_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid not null references public.user_profiles(id), updated_by uuid not null references public.user_profiles(id),
 check((origin='legacy_claim')=(legacy_claim_id is not null)),
 check(origin<>'employee_claim' or claimant_id=created_by),
 check(not personally_paid or claimant_id is not null),
 check(personally_paid or reimbursement_requested=0),
 check(case_id is null or advisory_matter_id is null),
 check(status='draft' or submitted_at is not null),
 check((status in ('accepted','rejected'))=(reviewed_at is not null and reviewed_by is not null and nullif(btrim(review_reason),'') is not null))
);
create index expense_claim_owner on public.finance_expenses(claimant_id,created_at,id);
create index expense_review_queue on public.finance_expenses(status,expense_date,id);
create table public.finance_expense_tax_reviews (
 id uuid primary key, expense_id uuid not null references public.finance_expenses(id),
 revision integer not null check(revision>0), supersedes_id uuid unique references public.finance_expense_tax_reviews(id),
 vat_state text not null check(vat_state in ('none','exists','pending')),
 vat_base numeric(14,2), vat_rate numeric(7,4), vat_amount numeric(14,2),
 eligibility text not null check(eligibility in ('eligible','ineligible','pending')),
 supplier_tax_id text check(supplier_tax_id ~ '^[0-9]{13}$'),
 tax_document_reference text, tax_document_date date,
 company_name_status text not null check(company_name_status in ('yes','no','unknown')),
 wht_state text not null check(wht_state in ('none','withhold','pending')),
 wht_base numeric(14,2), wht_rate numeric(7,4), wht_amount numeric(14,2),
 wht_exception boolean not null,
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 request_json jsonb not null check(jsonb_typeof(request_json)='object'),
 reviewed_by uuid not null references public.user_profiles(id), reviewed_at timestamptz not null default now(),
 unique(expense_id,revision),
 check((vat_state='exists' and vat_base>0 and vat_rate>=0 and vat_rate<=100 and vat_amount=round(vat_base*vat_rate/100,2)
   and num_nonnulls(vat_base,vat_rate,vat_amount)=3)
  or (vat_state<>'exists' and num_nonnulls(vat_base,vat_rate,vat_amount)=0)),
 check(eligibility<>'eligible' or (vat_state='exists' and company_name_status='yes' and supplier_tax_id is not null
  and nullif(btrim(tax_document_reference),'') is not null and tax_document_date is not null)),
 check(vat_state<>'pending' or eligibility='pending'),
 check(vat_state<>'none' or eligibility='ineligible'),
 check((wht_state='withhold' and wht_base>0 and wht_rate>0 and wht_rate<100 and wht_amount=round(wht_base*wht_rate/100,2)
   and num_nonnulls(wht_base,wht_rate,wht_amount)=3)
  or (wht_state<>'withhold' and num_nonnulls(wht_base,wht_rate,wht_amount)=0))
);
create table public.finance_expense_settlements (
 id uuid primary key, expense_id uuid not null unique references public.finance_expenses(id),
 mode text not null check(mode in ('undecided','company_bank','company_cash','supplier_unpaid','reimburse','no_reimbursement')),
 payee_id uuid references public.finance_payees(id),
 amount numeric(14,2) not null check(amount>=0),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 check((mode in ('supplier_unpaid','reimburse') and payee_id is not null and amount>0)
  or (mode in ('company_bank','company_cash') and amount>0) or (mode in ('undecided','no_reimbursement') and amount=0))
);
create table public.finance_expense_obligations (
 id uuid primary key, expense_id uuid not null unique references public.finance_expenses(id),
 settlement_id uuid not null unique references public.finance_expense_settlements(id),
 source_type text not null check(source_type in ('employee_reimbursement','supplier_payable')),
 payee_id uuid not null references public.finance_payees(id),
 gross_amount numeric(14,2) not null check(gross_amount>0), currency text not null default 'THB' check(currency='THB'),
 due_on date, created_at timestamptz not null default now(), created_by uuid not null references public.user_profiles(id)
);
create table public.finance_expense_obligation_waivers (
 obligation_id uuid primary key references public.finance_expense_obligations(id),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 disposition text not null check(disposition='person_paid_no_reimbursement'),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now()
);
create table public.finance_expense_audit (
 id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.finance_expenses(id),
 event_type text not null check(event_type in ('saved','submitted','accepted','rejected','tax_reviewed','settlement_decided','waived','legacy_bridged','payment_confirmed')),
 actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object')
);

-- Reuse the existing Payout parent, Cash source FK and outgoing WHT register.
alter table public.finance_payouts add column source_model text not null default 'revenue_distribution_v1'
 check(source_model in ('revenue_distribution_v1','expense_v1'));
alter table public.finance_payouts alter column payee_id drop not null;
alter table public.finance_payouts add constraint expense_payout_payee_contract check(source_model='expense_v1' or payee_id is not null);
alter table public.finance_payout_allocations alter column entitlement_id drop not null;
alter table public.finance_payout_allocations add column expense_id uuid unique references public.finance_expenses(id);
alter table public.finance_payout_allocations add column expense_obligation_id uuid unique references public.finance_expense_obligations(id);
alter table public.finance_payout_allocations add column wht_base numeric(14,2) check(wht_base>=0);
alter table public.finance_payout_allocations add constraint expense_allocation_source check(num_nonnulls(entitlement_id,expense_id)=1
 and (expense_obligation_id is null or expense_id is not null) and (expense_id is null or wht_base is not null));
alter table public.finance_payout_allocations drop constraint finance_payout_allocations_check;
alter table public.finance_payout_allocations add constraint finance_payout_allocations_check
 check(wht_amount=round(coalesce(wht_base,gross_amount)*rate/100,2));

create function public.expense_immutable()
returns trigger language plpgsql set search_path=public as $fn$
begin
 if tg_op='UPDATE' and tg_table_name='finance_expenses' then
  if new.id=old.id and new.origin=old.origin and new.legacy_claim_id is not distinct from old.legacy_claim_id
   and new.created_by=old.created_by and new.created_at=old.created_at and new.version=old.version+1
   and ((old.status='draft' and new.status in ('draft','submitted'))
    or (old.status='submitted' and new.status in ('accepted','rejected') and
     to_jsonb(old)-array['reference','status','version','reviewed_at','reviewed_by','review_reason','updated_by','updated_at']
      =to_jsonb(new)-array['reference','status','version','reviewed_at','reviewed_by','review_reason','updated_by','updated_at'])) then return new; end if;
 elsif tg_op='UPDATE' and tg_table_name='finance_treasury_account_authorities' then
  if new.id=old.id and new.user_id=old.user_id and new.bank_account_id is not distinct from old.bank_account_id
   and new.cash_location_id is not distinct from old.cash_location_id and new.version=old.version+1 then return new; end if;
 end if;
 raise exception 'EXPENSE_HISTORY_IMMUTABLE';
end;
$fn$;
-- BEGIN EXPENSE TAX / SETTLEMENT
alter table public.finance_tax_source_revisions drop constraint finance_tax_source_revisions_source_type_check;
alter table public.finance_tax_source_revisions add constraint finance_tax_source_revisions_source_type_check
 check(source_type in ('direct_money_receipt','payment','tax_invoice','tax_correction','expense'));
alter table public.finance_tax_position_facts drop constraint finance_tax_position_facts_tax_kind_check;
alter table public.finance_tax_position_facts add constraint finance_tax_position_facts_tax_kind_check check(tax_kind in ('output_vat','incoming_wht','input_vat'));
alter table public.finance_tax_position_facts drop constraint finance_tax_position_facts_date_basis_check;
alter table public.finance_tax_position_facts add constraint finance_tax_position_facts_date_basis_check
 check(date_basis in ('confirmed_receipt','approved_tax_point','document_adjustment','reviewed_expense_document'));
alter function public.tax_position_source(text,uuid) rename to tax_position_source_before_expense;
create function public.tax_position_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; r public.finance_expense_tax_reviews%rowtype; lines jsonb:='[]';
begin
 if p_type<>'expense' then return public.tax_position_source_before_expense(p_type,p_id); end if;
 select * into strict e from public.finance_expenses where id=p_id;
 select * into r from public.finance_expense_tax_reviews where expense_id=p_id order by revision desc limit 1;
 if e.status='accepted' and r.eligibility='eligible' and r.vat_amount>0 then
  lines:=jsonb_build_array(jsonb_build_object('line_id',e.id,'kind','input_vat','base',r.vat_base,'rate',r.vat_rate,'tax',r.vat_amount,
   'treatment','reviewed_eligible','date_basis','reviewed_expense_document','evidence',to_jsonb(r)));
 end if;
 return jsonb_build_object('source_type','expense','source_id',e.id,'active',e.status='accepted','reference',r.tax_document_reference,
  'effective_on',r.tax_document_date,'currency',e.currency,'payer',jsonb_build_object('name',e.vendor_name,'supplier_tax_id',r.supplier_tax_id),
  'lines',lines,'warnings','[]'::jsonb,'source_evidence',jsonb_build_object('expense',to_jsonb(e),'tax_review',to_jsonb(r)));
end;
$fn$;
create function public.review_finance_expense_tax(p_id uuid,p_expense uuid,p_previous uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; old public.finance_expense_tax_reviews%rowtype;r public.finance_expense_tax_reviews%rowtype;
 vb numeric; vr numeric; wb numeric; wr numeric;
begin
 if not public.expense_can_tax_review() then raise exception 'EXPENSE_TAX_PERMISSION_DENIED'; end if;
 if p_id is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 select * into e from public.finance_expenses where id=p_expense for update;
 if e.status is distinct from 'accepted' then raise exception 'EXPENSE_ACCEPTED_REQUIRED'; end if;
 if exists(select 1 from public.finance_expense_tax_reviews where id=p_id) then
  select * into r from public.finance_expense_tax_reviews where id=p_id;
  if r.expense_id<>p_expense or r.request_json is distinct from p_input then raise exception 'EXPENSE_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 select * into old from public.finance_expense_tax_reviews where expense_id=p_expense order by revision desc limit 1;
 if old.id is distinct from p_previous then raise exception 'EXPENSE_STALE'; end if;
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
 if vb is not null and (vb<>round(vb,2) or vb+round(vb*vr/100,2)<>e.gross_amount) then raise exception 'EXPENSE_VAT_TOTAL_INVALID'; end if;
 if wb is not null and (wb<>round(wb,2) or wb>e.gross_amount or round(wb*wr/100,2)>=e.gross_amount) then raise exception 'EXPENSE_WHT_INVALID'; end if;
 insert into public.finance_expense_tax_reviews(id,expense_id,revision,supersedes_id,vat_state,vat_base,vat_rate,vat_amount,eligibility,
  supplier_tax_id,tax_document_reference,tax_document_date,company_name_status,wht_state,wht_base,wht_rate,wht_amount,wht_exception,reason,request_json,reviewed_by)
 values(p_id,p_expense,coalesce(old.revision,0)+1,old.id,p_input->>'vat_state',vb,vr,round(vb*vr/100,2),p_input->>'eligibility',
  nullif(btrim(p_input->>'supplier_tax_id'),''),nullif(btrim(p_input->>'tax_document_reference'),''),nullif(p_input->>'tax_document_date','')::date,
  p_input->>'company_name_status',p_input->>'wht_state',wb,wr,round(wb*wr/100,2),p_input->>'wht_state'<>'none' and (e.personally_paid
   or exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='confirmed' and wht_amount=0 and choices_json#>>'{0,expense_id}'=p_expense::text)),
  btrim(p_input->>'reason'),p_input,auth.uid()) returning * into r;
 perform public.tax_position_sync('expense',p_expense,r.reason);
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json) values(p_expense,'tax_reviewed',auth.uid(),to_jsonb(r));
 return p_id;
end;
$fn$;
create function public.decide_finance_expense_settlement(p_id uuid,p_expense uuid,p_mode text,p_payee uuid,p_amount numeric,p_due_on date,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;s public.finance_expense_settlements%rowtype;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));select * into e from public.finance_expenses where id=p_expense for update;
 if e.status is distinct from 'accepted' then raise exception 'EXPENSE_ACCEPTED_REQUIRED'; end if;
 select * into s from public.finance_expense_settlements where expense_id=p_expense;
 if s.id is not null then
  if s.id=p_id and s.mode=p_mode and s.payee_id is not distinct from p_payee and s.amount=p_amount and s.reason=btrim(p_reason) then return s.id; end if;
  raise exception 'EXPENSE_SETTLEMENT_ALREADY_DECIDED';
 end if;
 if p_mode is null or p_mode='undecided' or p_amount is null or p_amount<>round(p_amount,2) or p_amount>e.gross_amount
  or (p_mode in ('company_bank','company_cash','supplier_unpaid') and (e.personally_paid or p_amount<>e.gross_amount))
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
create function public.waive_finance_expense_reimbursement(p_obligation uuid,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare o public.finance_expense_obligations%rowtype;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or nullif(btrim(p_reason),'') is null then raise exception 'EXPENSE_ACK_REASON_REQUIRED'; end if;
 select * into o from public.finance_expense_obligations where id=p_obligation;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||o.expense_id,0));
 if o.id is null or o.source_type<>'employee_reimbursement' then raise exception 'EXPENSE_OBLIGATION_INVALID'; end if;
 if exists(select 1 from public.finance_expense_obligation_waivers where obligation_id=p_obligation) then return p_obligation; end if;
 if exists(select 1 from public.finance_payout_allocations where expense_obligation_id=p_obligation)
  or exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='draft' and choices_json#>>'{0,expense_id}'=o.expense_id::text)
 then raise exception 'EXPENSE_PAYMENT_EXISTS'; end if;
 insert into public.finance_expense_obligation_waivers(obligation_id,reason,disposition,created_by)
 values(p_obligation,btrim(p_reason),'person_paid_no_reimbursement',auth.uid());
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 values(o.expense_id,'waived',auth.uid(),jsonb_build_object('obligation',to_jsonb(o),'reason',btrim(p_reason),'cash_effect',false,'accounting_classification',null));
 return p_obligation;
end;
$fn$;
create function public.expense_can_read(p_id uuid)
returns boolean language sql stable security definer set search_path=public as $fn$
 select exists(select 1 from public.finance_expenses e join public.user_profiles u on u.id=auth.uid() and u.active where e.id=p_id and
  (public.expense_can_view_all() or e.created_by=u.id or (e.claimant_id=u.id and e.origin in ('employee_claim','legacy_claim'))
   or exists(select 1 from public.finance_payouts p where p.source_model='expense_v1' and p.choices_json#>>'{0,expense_id}'=e.id::text
    and public.expense_account_allowed(p.bank_account_id,p.cash_location_id,'record_outflow'))));
$fn$;

create function public.save_finance_expense(p_id uuid,p_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype; kind text:=p_input->>'origin'; claimant uuid; bank uuid; cash uuid;
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
  -- Complete optional facts in the same initial insert below via shared assignment is avoided: version/audit remains truthful.
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
  version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
  select p_id,'saved',auth.uid(),to_jsonb(x) from public.finance_expenses x where id=p_id;
 return p_id;
end;
$fn$;
create function public.submit_finance_expense(p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 select * into e from public.finance_expenses where id=p_id for update;
 if e.id is null or not public.expense_can_read(p_id) or (e.created_by<>auth.uid() and not public.expense_can_manage()) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if e.origin='employee_claim' and not public.expense_can_claim() and not public.expense_can_manage()
  then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if e.status='submitted' then return p_id; end if;
 if e.status<>'draft' or e.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 update public.finance_expenses set status='submitted',version=version+1,submitted_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 select p_id,'submitted',auth.uid(),to_jsonb(x) from public.finance_expenses x where id=p_id;
 return p_id;
end;
$fn$;
create function public.review_finance_expense(p_id uuid,p_version integer,p_accept boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_accept is null or nullif(btrim(p_reason),'') is null then raise exception 'EXPENSE_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));select * into e from public.finance_expenses where id=p_id for update;
 if e.status is distinct from 'submitted' or e.version is distinct from p_version then raise exception 'EXPENSE_STALE'; end if;
 update public.finance_expenses set status=case when p_accept then 'accepted' else 'rejected' end,version=version+1,
  reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),review_reason=btrim(p_reason),updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 select p_id,x.status,auth.uid(),to_jsonb(x) from public.finance_expenses x where id=p_id;
 return p_id;
end;
$fn$;

-- One private balance calculation serves both the existing Treasury view and scoped account reads.
create function public.expense_account_balance_private(p_bank uuid,p_cash uuid)
returns table(currency text,opening_id uuid,opening_as_of timestamptz,opening_amount numeric,system_balance numeric,inflow numeric,outflow numeric)
language sql stable security definer set search_path=public as $fn$
 select 'THB',o.id,o.as_of,o.balance_amount,o.balance_amount+coalesce(m.i,0)-coalesce(m.o,0),coalesce(m.i,0),coalesce(m.o,0)
 from (select 1) seed left join public.finance_account_opening_balances o on o.bank_account_id is not distinct from p_bank
 and o.cash_location_id is not distinct from p_cash and o.currency='THB' and o.status='confirmed'
 left join lateral(select sum(c.cash_amount) filter(where direction='inflow') i,sum(c.cash_amount) filter(where direction='outflow') o
  from public.finance_cash_transactions c where c.bank_account_id is not distinct from p_bank and c.cash_location_id is not distinct from p_cash
  and c.currency='THB' and c.status='confirmed' and c.occurred_at>o.as_of) m on true;
$fn$;
-- The view invokes the helper as the browser user; the helper itself checks the same account visibility.
create function public.expense_account_balance(p_bank uuid,p_cash uuid)
returns table(currency text,opening_id uuid,opening_as_of timestamptz,opening_amount numeric,system_balance numeric,inflow numeric,outflow numeric)
language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_account_allowed(p_bank,p_cash,'view_balance') then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 return query select * from public.expense_account_balance_private(p_bank,p_cash);
end;
$fn$;
create or replace view public.finance_treasury_balances with(security_invoker=true) as
 select a.*,b.currency,b.opening_id,b.opening_as_of,b.opening_amount::numeric(14,2),b.system_balance,b.inflow,b.outflow
 from public.finance_treasury_accounts a cross join lateral public.expense_account_balance(a.bank_account_id,a.cash_location_id) b;
create function public.get_finance_expense_accounts()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,'bank_account_id',a.bank,'cash_location_id',a.cash,
  'can_view_balance',public.expense_account_allowed(a.bank,a.cash,'view_balance'),'can_view_movements',public.expense_account_allowed(a.bank,a.cash,'view_movements'),
  'can_record',public.expense_account_allowed(a.bank,a.cash,'record_outflow'),'can_confirm',public.expense_account_allowed(a.bank,a.cash,'confirm_outflow'),
  'balance',case when public.expense_account_allowed(a.bank,a.cash,'view_balance') then b.system_balance end,
  'opening_as_of',b.opening_as_of) order by a.kind,a.name,a.id),'[]')
 from (select id,'bank'::text kind,short_name name,id bank,null::uuid cash from public.finance_bank_accounts where is_active
  union all select id,'cash',name_th,null,id from public.finance_cash_locations where is_active) a
 cross join lateral public.expense_account_balance_private(a.bank,a.cash) b
 where public.expense_account_allowed(a.bank,a.cash,'view_balance') or public.expense_account_allowed(a.bank,a.cash,'view_movements')
  or public.expense_account_allowed(a.bank,a.cash,'record_outflow');
$fn$;
create function public.get_finance_assigned_account_movements(p_bank uuid,p_cash uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_account_allowed(p_bank,p_cash,'view_movements') then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by occurred_at desc,id),'[]') from
  (select id,occurred_at,direction,cash_amount,currency,status,reference_no,source_payout_id from public.finance_cash_transactions
   where bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash order by occurred_at desc,id limit 50 offset p_offset) x);
end;
$fn$;

create function public.expense_payout_choice(p_expense uuid,p_actual_wht boolean)
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
create function public.prepare_finance_expense_payout(p_id uuid,p_expense uuid,p_version integer,p_paid_on date,p_bank uuid,p_cash uuid,p_actual_wht boolean,p_note text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;p public.finance_payouts%rowtype;c jsonb;
begin
 if not public.expense_account_allowed(p_bank,p_cash,'record_outflow') then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_expense,0));
 select * into strict e from public.finance_expenses where id=p_expense for update;
 if not public.expense_can_manage() and (e.created_by<>auth.uid() or e.origin<>'company_purchase'
  or exists(select 1 from public.finance_expense_obligations where expense_id=e.id) or p_actual_wht is distinct from false)
 then raise exception 'EXPENSE_FINANCE_PREPARATION_REQUIRED'; end if;
 if p_id is null or p_paid_on is null or p_paid_on<e.expense_date or p_paid_on>(now() at time zone 'Asia/Bangkok')::date
  or not public.treasury_location_active(p_bank,p_cash) then raise exception 'EXPENSE_PAYMENT_INVALID'; end if;
 select * into p from public.finance_payouts where id=p_id for update;
 if p.version is distinct from p_version or (p.id is not null and (p.source_model<>'expense_v1' or p.status<>'draft'
  or p.choices_json#>>'{0,expense_id}'<>p_expense::text)) then raise exception 'EXPENSE_STALE'; end if;
 c:=public.expense_payout_choice(p_expense,p_actual_wht);
 if (c#>>'{settlement,mode}'='company_bank' and p_bank is null) or (c#>>'{settlement,mode}'='company_cash' and p_cash is null)
 then raise exception 'EXPENSE_ACCOUNT_KIND_INVALID'; end if;
 if exists(select 1 from public.finance_payouts where source_model='expense_v1' and status='draft' and id<>p_id
  and choices_json#>>'{0,expense_id}'=p_expense::text) then raise exception 'EXPENSE_PAYMENT_DRAFT_EXISTS'; end if;
 if p.id is null then
  insert into public.finance_payouts(id,source_model,payee_id,paid_on,bank_account_id,cash_location_id,choices_json,gross_amount,wht_amount,net_amount,note,created_by,updated_by)
  values(p_id,'expense_v1',(c->>'payee_id')::uuid,p_paid_on,p_bank,p_cash,jsonb_build_array(c),(c->>'gross')::numeric,(c->>'wht')::numeric,
   (c->>'gross')::numeric-(c->>'wht')::numeric,coalesce(p_note,''),auth.uid(),auth.uid());
 else
  update public.finance_payouts set paid_on=p_paid_on,bank_account_id=p_bank,cash_location_id=p_cash,choices_json=jsonb_build_array(c),
   payee_id=(c->>'payee_id')::uuid,gross_amount=(c->>'gross')::numeric,wht_amount=(c->>'wht')::numeric,net_amount=(c->>'gross')::numeric-(c->>'wht')::numeric,
   note=coalesce(p_note,''),version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 end if;
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json)
 select p_id,'saved',version,auth.uid(),to_jsonb(x) from public.finance_payouts x where id=p_id;
 return p_id;
end;
$fn$;
create function public.confirm_finance_expense_payout(p_id uuid,p_version integer,p_payee_version integer,p_destination uuid,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare p public.finance_payouts%rowtype;c jsonb;canonical jsonb;payee public.finance_payees%rowtype;dest public.finance_payee_destinations%rowtype;
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
 select * into payee from public.finance_payees where id=p.payee_id for share;
 select * into dest from public.finance_payee_destinations where payee_id=p.payee_id and is_active for share;
 if p.payee_id is not null and (payee.is_active is distinct from true or payee.version is distinct from p_payee_version
  or (payee.profile_id is not null and not exists(select 1 from public.user_profiles where id=payee.profile_id and active))) then raise exception 'PAYOUT_PAYEE_INVALID'; end if;
 -- Prepared liabilities require an exact bank destination; already-paid direct purchases retain vendor/reference instead.
 if c->>'obligation_id' is not null and p.bank_account_id is not null and (dest.id is null or dest.id is distinct from p_destination)
 then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
 if p.wht_amount>0 and payee.tax_id is null then raise exception 'PAYOUT_TAX_ID_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_cash_cutover:THB',0));
 if not public.treasury_location_active(p.bank_account_id,p.cash_location_id) then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 select * into o from public.finance_account_opening_balances where bank_account_id is not distinct from p.bank_account_id
  and cash_location_id is not distinct from p.cash_location_id and currency='THB' and status='confirmed' for update;
 if o.id is null then raise exception 'FINANCE_CASH_OPENING_BALANCE_REQUIRED'; end if;
 if public.finance_bangkok_completed_day_end(p.paid_on)<=o.as_of then raise exception 'FINANCE_CASH_TRANSACTION_BEFORE_CUTOVER'; end if;
 snapshot:=jsonb_build_object('schema_version',2,'source_model','expense_v1','choices',p.choices_json,'payee',to_jsonb(payee),
  'destination',case when p.bank_account_id is not null then to_jsonb(dest) end,'opening',to_jsonb(o),
  'bank_account_id',p.bank_account_id,'cash_location_id',p.cash_location_id,'paid_on',p.paid_on,'currency',p.currency,
  'gross',p.gross_amount,'wht',p.wht_amount,'net',p.net_amount,'confirmed_by',auth.uid(),'actual_company_cash_moved',true);
 update public.finance_payouts set status='confirmed',version=version+1,confirmed_snapshot_json=snapshot,confirmed_at=ts,confirmed_by=auth.uid(),updated_at=ts,updated_by=auth.uid() where id=p_id;
 insert into public.finance_payout_allocations(payout_id,expense_id,expense_obligation_id,gross_amount,treatment,rate,wht_base,wht_amount,evidence_json)
 values(p_id,(c->>'expense_id')::uuid,(c->>'obligation_id')::uuid,p.gross_amount,c->>'treatment',(c->>'rate')::numeric,(c->>'wht_base')::numeric,p.wht_amount,c) returning id into allocation;
 if p.wht_amount>0 then
  insert into public.finance_outgoing_wht_obligations(payout_source_id,source_line_id,source_fingerprint,payee_json,gross_base,explicit_treatment,explicit_rate,withheld_amount,withheld_on,period_month,currency,evidence_json)
  values(p_id,allocation,md5(c::text),to_jsonb(payee),(c->>'wht_base')::numeric,'withhold',(c->>'rate')::numeric,p.wht_amount,p.paid_on,date_trunc('month',p.paid_on)::date,'THB',c);
 end if;
 insert into public.finance_cash_transactions(occurred_at,direction,transaction_type,bank_account_id,cash_location_id,cash_amount,currency,status,source_payout_id,reference_no,description,created_by_user_id,updated_by_user_id,confirmed_at,confirmed_by_user_id)
 values(public.finance_bangkok_completed_day_end(p.paid_on),'outflow','other',p.bank_account_id,p.cash_location_id,p.net_amount,'THB','confirmed',p.id,upper(left(p.id::text,8)),'Expense payout',auth.uid(),auth.uid(),ts,auth.uid()) returning id into cash;
 perform public.record_finance_cash_transaction_audit_event(cash,'confirmed',jsonb_build_object('payout_id',p.id,'payout',snapshot,'outgoing_wht_is_not_cash_outflow',true));
 insert into public.finance_payout_audit(payout_id,event_type,version,actor_id,evidence_json) values(p.id,'confirmed',p.version+1,auth.uid(),snapshot);
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json) values((c->>'expense_id')::uuid,'payment_confirmed',auth.uid(),snapshot);
 return p_id;
end;
$fn$;
-- Minimal custodian entry: facts + pending tax + actual payment, in one transaction. No fake Payable/payee master.
create function public.record_finance_paid_expense(p_id uuid,p_input jsonb,p_bank uuid,p_cash uuid,p_paid_on date,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;v integer;
begin
 if not public.expense_account_allowed(p_bank,p_cash,'record_outflow') or not public.expense_account_allowed(p_bank,p_cash,'confirm_outflow') then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'EXPENSE_ACTUAL_PAYMENT_ACK_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('expense:'||p_id,0));
 select * into e from public.finance_expenses where id=p_id;
 if e.id is not null then
  if exists(select 1 from public.finance_payouts where id=p_id and source_model='expense_v1' and status='confirmed'
   and bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash and paid_on=p_paid_on
   and gross_amount=(p_input->>'gross_amount')::numeric) and e.created_by=auth.uid()
   and exists(select 1 from public.finance_expense_audit a where a.expense_id=p_id and a.event_type='saved'
    and a.evidence_json->'immediate_request' = p_input) then return p_id; end if;
  raise exception 'EXPENSE_IDEMPOTENCY_CONFLICT';
 end if;
 perform public.save_finance_expense(p_id,null,p_input||jsonb_build_object('origin','company_purchase','bank_account_id',p_bank,'cash_location_id',p_cash,
  'personally_paid',false,'claimant_id',null,'reimbursement_requested',0,'vat_awareness','unknown','wht_awareness','unknown'));
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 values(p_id,'saved',auth.uid(),jsonb_build_object('immediate_request',p_input));
 select version into v from public.finance_expenses where id=p_id;perform public.submit_finance_expense(p_id,v);
 insert into public.finance_expense_settlements(id,expense_id,mode,amount,reason,created_by)
 values(p_id,p_id,case when p_bank is not null then 'company_bank' else 'company_cash' end,(p_input->>'gross_amount')::numeric,'Actual company payment recorded; tax review pending',auth.uid());
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 select p_id,'settlement_decided',auth.uid(),to_jsonb(s) from public.finance_expense_settlements s where id=p_id;
 perform public.prepare_finance_expense_payout(p_id,p_id,null,p_paid_on,p_bank,p_cash,false,p_input->>'note');
 perform public.confirm_finance_expense_payout(p_id,1,null,null,true);
 return p_id;
end;
$fn$;

alter function public.payout_assert(uuid) rename to payout_assert_before_expense;
create function public.payout_assert(p_id uuid)
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
   and o.expense_id=e.id and o.payee_id=p.payee_id and o.gross_amount=p.gross_amount and to_jsonb(o)=f->'obligation'))
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
-- Existing revenue-distribution entry points cannot reinterpret an Expense Payout.
alter function public.save_finance_payout(uuid,uuid,date,uuid,uuid,jsonb,text,integer) rename to save_finance_payout_before_expense;
create function public.save_finance_payout(p_id uuid,p_payee_id uuid,p_paid_on date,p_bank_account_id uuid,p_cash_location_id uuid,p_choices jsonb,p_note text,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 if exists(select 1 from public.finance_payouts where id=p_id and source_model<>'revenue_distribution_v1') then raise exception 'PAYOUT_SOURCE_MODEL_MISMATCH'; end if;
 return public.save_finance_payout_before_expense(p_id,p_payee_id,p_paid_on,p_bank_account_id,p_cash_location_id,p_choices,p_note,p_expected_version);
end;
$fn$;
alter function public.confirm_finance_payout(uuid,integer,integer,uuid,boolean) rename to confirm_finance_payout_before_expense;
create function public.confirm_finance_payout(p_id uuid,p_expected_version integer,p_expected_payee_version integer,p_expected_destination_id uuid,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
begin
 if exists(select 1 from public.finance_payouts where id=p_id and source_model='expense_v1') then
  return public.confirm_finance_expense_payout(p_id,p_expected_version,p_expected_payee_version,p_expected_destination_id,p_acknowledged);
 end if;
 return public.confirm_finance_payout_before_expense(p_id,p_expected_version,p_expected_payee_version,p_expected_destination_id,p_acknowledged);
end;
$fn$;
create function public.expense_payout_model_guard()
returns trigger language plpgsql set search_path=public as $fn$
begin
 if old.source_model<>new.source_model then raise exception 'PAYOUT_SOURCE_MODEL_IMMUTABLE'; end if;
 return new;
end;
$fn$;
create trigger expense_payout_model_guard before update on public.finance_payouts for each row execute function public.expense_payout_model_guard();

-- The established entitlement editor must not open a different source model.
-- Expense payment history remains available on its source Expense detail.
alter function public.get_finance_payout_workspace(uuid,uuid) rename to get_finance_payout_workspace_before_expense;
create function public.get_finance_payout_workspace(p_payee_id uuid,p_payout_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'PAYOUT_PERMISSION_DENIED'; end if;
 if exists(select 1 from public.finance_payouts where id=p_payout_id and source_model<>'revenue_distribution_v1')
  then raise exception 'PAYOUT_SOURCE_MODEL_MISMATCH'; end if;
 result:=public.get_finance_payout_workspace_before_expense(p_payee_id,p_payout_id);
 return jsonb_set(result,'{history}',(select coalesce(jsonb_agg(h.value order by h.ordinality),'[]')
  from jsonb_array_elements(result->'history') with ordinality h
  join public.finance_payouts p on p.id=(h.value->>'id')::uuid where p.source_model='revenue_distribution_v1'));
end;
$fn$;

-- Legacy bridge freezes source facts and blocks double settlement of THAT opted-in row only.
create function public.bridge_finance_legacy_expense(p_legacy_id text,p_id uuid,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare l jsonb;existing uuid;
begin
 if not public.expense_can_manage() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or nullif(btrim(p_reason),'') is null or p_id is null then raise exception 'EXPENSE_ACK_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('legacy_expense:'||p_legacy_id,0));
 select to_jsonb(c) into l from public.finance_expense_claims c where c.id::text=p_legacy_id for update;
 select id into existing from public.finance_expenses where legacy_claim_id=p_legacy_id;
 if existing is not null then return existing; end if;
 if l is null or l->>'status' not in ('submitted','approved') or l->>'ledger_entry_id' is not null
  or exists(select 1 from public.finance_company_ledger x where to_jsonb(x)->>'source_expense_claim_id'=p_legacy_id)
  or not exists(select 1 from public.user_profiles where id=nullif(l->>'claimant_user_id','')::uuid and active)
 then raise exception 'EXPENSE_LEGACY_BRIDGE_INELIGIBLE'; end if;
 insert into public.finance_expenses(id,origin,legacy_claim_id,status,expense_date,description,category,claimant_id,client_id,case_id,advisory_matter_id,
  gross_amount,personally_paid,reimbursement_requested,note,submitted_at,created_by,updated_by)
 values(p_id,'legacy_claim',p_legacy_id,'submitted',(l->>'claim_date')::date,coalesce(nullif(btrim(l->>'description'),''),'Legacy expense claim'),
  coalesce(nullif(btrim(l->>'category'),''),'Legacy'),(l->>'claimant_user_id')::uuid,nullif(l->>'client_id','')::uuid,
  nullif(l->>'case_id','')::bigint,nullif(l->>'advisory_matter_id','')::uuid,(l->>'amount')::numeric,true,(l->>'amount')::numeric,
  coalesce(l->>'note',''),clock_timestamp(),auth.uid(),auth.uid());
 insert into public.finance_expense_audit(expense_id,event_type,actor_id,evidence_json)
 values(p_id,'legacy_bridged',auth.uid(),jsonb_build_object('legacy',l,'reason',btrim(p_reason),'no_payment_posted',true));
 return p_id;
end;
$fn$;
create function public.expense_legacy_bridge_guard()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare key text;
begin
 key:=case when tg_table_name='finance_company_ledger' then to_jsonb(new)->>'source_expense_claim_id' else to_jsonb(old)->>'id' end;
 if key is not null then
  perform pg_advisory_xact_lock(hashtextextended('legacy_expense:'||key,0));
  if exists(select 1 from public.finance_expenses where legacy_claim_id=key) then raise exception 'EXPENSE_LEGACY_ROW_BRIDGED_USE_NEW_WORKFLOW'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;return new;
end;
$fn$;
create trigger expense_legacy_bridge_guard before update or delete on public.finance_expense_claims for each row execute function public.expense_legacy_bridge_guard();
create trigger expense_legacy_double_payment_guard before insert or update on public.finance_company_ledger for each row execute function public.expense_legacy_bridge_guard();

-- Reviewed, eligible Input VAT is visible independently from full-period completeness.
-- No assumption that the new Expense register covers every purchase in the month.
alter function public.tax_filing_monthly_facts(date) rename to tax_filing_monthly_facts_before_expense;
create function public.tax_filing_monthly_facts(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb;known jsonb;
begin
 result:=public.tax_filing_monthly_facts_before_expense(p_month);
 select coalesce(jsonb_agg(jsonb_build_object('fact_id',f.id,'source_id',s.source_id,'amount',f.tax_amount,'base',f.base_amount,'reference',f.document_reference,
  'review_id',f.evidence_json->'id','fingerprint',s.fingerprint) order by f.id),'[]') into known
 from public.finance_tax_position_facts f join public.finance_tax_source_revisions s on s.id=f.revision_id
 where f.tax_kind='input_vat' and f.period_month=p_month and not exists(select 1 from public.finance_tax_source_revisions n where n.supersedes_id=s.id);
 return result||jsonb_build_object('reviewed_input_vat',coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(known) x),0),
  'reviewed_input_sources',known,'input_vat_complete',false,'input_vat',null,'net_vat',null);
end;
$fn$;

create function public.get_finance_expense_access()
returns jsonb language sql stable security definer set search_path=public as $fn$
 select jsonb_build_object('user_id',auth.uid(),'can_claim',public.expense_can_claim(),'can_manage',public.expense_can_manage(),
  'can_tax_review',public.expense_can_tax_review(),'can_view_all',public.expense_can_view_all(),'is_admin',public.money_allocation_admin(),
  'can_view_accounts',jsonb_array_length(public.get_finance_expense_accounts())>0,
  'can_record',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true'),
  'can_confirm',exists(select 1 from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_confirm'='true'));
$fn$;
create function public.expense_document(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare e public.finance_expenses%rowtype;r jsonb;s jsonb;o jsonb;p jsonb;staff boolean;
begin
 if not public.expense_can_read(p_id) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 select * into strict e from public.finance_expenses where id=p_id;
 staff:=public.expense_can_view_all();
 select to_jsonb(x) into r from public.finance_expense_tax_reviews x where expense_id=p_id order by revision desc limit 1;
 select to_jsonb(x) into s from public.finance_expense_settlements x where expense_id=p_id;
 select to_jsonb(x)||jsonb_build_object('waived',exists(select 1 from public.finance_expense_obligation_waivers where obligation_id=x.id),
  'settled',exists(select 1 from public.finance_payout_allocations where expense_obligation_id=x.id)) into o from public.finance_expense_obligations x where expense_id=p_id;
 select jsonb_build_object('id',x.id,'status',x.status,'version',x.version,'paid_on',x.paid_on,'gross',x.gross_amount,'wht',x.wht_amount,'net',x.net_amount,
  'bank_account_id',case when staff or public.expense_account_allowed(x.bank_account_id,x.cash_location_id,'record_outflow') then x.bank_account_id end,
  'cash_location_id',case when staff or public.expense_account_allowed(x.bank_account_id,x.cash_location_id,'record_outflow') then x.cash_location_id end,
  'payee_id',x.payee_id,'can_confirm',x.status='draft' and public.expense_account_allowed(x.bank_account_id,x.cash_location_id,'confirm_outflow'),
  'can_cancel',x.status='draft' and public.payout_can_manage(),
  'payee_version',case when staff or public.expense_account_allowed(x.bank_account_id,x.cash_location_id,'confirm_outflow') then y.version end,
  'destination',case when staff or public.expense_account_allowed(x.bank_account_id,x.cash_location_id,'confirm_outflow') then
    (select jsonb_build_object('id',d.id,'bank_name',d.bank_name,'account_name',d.account_name,'account_number',d.account_number) from public.finance_payee_destinations d where d.payee_id=x.payee_id and is_active) end)
 into p from public.finance_payouts x left join public.finance_payees y on y.id=x.payee_id
 where x.source_model='expense_v1' and x.choices_json#>>'{0,expense_id}'=p_id::text order by (x.status='confirmed') desc,(x.status='draft') desc,x.created_at desc limit 1;
 return to_jsonb(e)||jsonb_build_object('claimant_name',(select coalesce(staff_name,full_name,email) from public.user_profiles where id=e.claimant_id),
  'tax_review',r,'settlement',s,'obligation',o,'payout',p,
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'event_type',a.event_type,'created_at',a.created_at,
    'actor_name',coalesce(u.staff_name,u.full_name,u.email),'evidence_json',case when public.money_allocation_admin() then a.evidence_json end)
    order by a.created_at,a.id),'[]') from public.finance_expense_audit a left join public.user_profiles u on u.id=a.actor_id where expense_id=p_id));
end;
$fn$;
create function public.get_finance_expenses(p_id uuid default null,p_claims boolean default false,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where id=auth.uid() and active) then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 if p_id is not null then return jsonb_build_object('access',public.get_finance_expense_access(),'record',public.expense_document(p_id),'accounts',public.get_finance_expense_accounts()); end if;
 return jsonb_build_object('access',public.get_finance_expense_access(),'accounts',public.get_finance_expense_accounts(),
  'rows',(select coalesce(jsonb_agg(public.expense_document(x.id) order by x.created_at desc,x.id),'[]') from
   (select e.id,e.created_at from public.finance_expenses e where public.expense_can_read(e.id) and (not p_claims or e.origin in ('employee_claim','legacy_claim')) order by created_at desc,id limit 50 offset p_offset) x),
  'has_next',(select count(*)>p_offset+50 from public.finance_expenses e where public.expense_can_read(e.id) and (not p_claims or e.origin in ('employee_claim','legacy_claim'))));
end;
$fn$;
create function public.get_finance_expense_parties()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_can_view_all() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 return jsonb_build_object('payees',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'legal_name',legal_name,'profile_id',profile_id) order by legal_name,id),'[]') from public.finance_payees where is_active),
  'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(staff_name,full_name,email)) order by id),'[]') from public.user_profiles where active));
end;
$fn$;
create function public.get_finance_treasury_authorities()
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.money_allocation_admin() then raise exception 'EXPENSE_ADMIN_REQUIRED'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(a) order by user_id,id),'[]') from public.finance_treasury_account_authorities a);
end;
$fn$;
create function public.get_finance_expense_obligations(p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if not public.expense_can_view_all() then raise exception 'EXPENSE_PERMISSION_DENIED'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'EXPENSE_INPUT_INVALID'; end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x) order by due_on nulls last,created_at,id),'[]') from
  (select o.*,p.legal_name as payee_name,e.description,e.reference,e.origin,
   case when w.obligation_id is not null then 'waived' when a.id is not null then 'settled' else 'open' end status,
   a.payout_id from public.finance_expense_obligations o join public.finance_expenses e on e.id=o.expense_id
   join public.finance_payees p on p.id=o.payee_id left join public.finance_expense_obligation_waivers w on w.obligation_id=o.id
   left join public.finance_payout_allocations a on a.expense_obligation_id=o.id order by due_on nulls last,o.created_at,o.id limit 50 offset p_offset) x),
  'has_next',(select count(*)>p_offset+50 from public.finance_expense_obligations));
end;
$fn$;

-- Transaction-end checks protect source relationships even from accidental privileged writes.
create function public.expense_integrity()
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
  or s.amount>e.gross_amount
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
  (e.status<>'accepted' or (r.vat_state='exists' and r.vat_base+r.vat_amount<>e.gross_amount)
   or (r.wht_state='withhold' and r.wht_base>e.gross_amount)
   or (r.revision=1 and r.supersedes_id is not null)
   or (r.revision>1 and not exists(select 1 from public.finance_expense_tax_reviews previous where previous.id=r.supersedes_id and previous.expense_id=e.id and previous.revision=r.revision-1))
   or not exists(select 1 from public.finance_expense_audit where expense_id=e.id and event_type='tax_reviewed')))
 then raise exception 'EXPENSE_TAX_INTEGRITY';end if;
 return null;
end;
$fn$;
do $integrity$
declare t text;
begin
 foreach t in array array['finance_expenses','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations','finance_expense_obligation_waivers'] loop
  execute format('create constraint trigger expense_integrity after insert or update on public.%I deferrable initially deferred for each row execute function public.expense_integrity()',t);
 end loop;
end;
$integrity$;

do $security$
declare t text;f record;
begin
 foreach t in array array['finance_expenses','finance_expense_tax_reviews','finance_expense_settlements','finance_expense_obligations',
  'finance_expense_obligation_waivers','finance_expense_audit','finance_treasury_account_authorities','finance_treasury_authority_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('create trigger expense_history_immutable before update or delete on public.%I for each row execute function public.expense_immutable()',t);
  execute format('create trigger expense_no_truncate before truncate on public.%I for each statement execute function public.expense_immutable()',t);
 end loop;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and
  (proname like 'expense_%' or proname like '%_before_expense' or proname in ('get_finance_expense_access','get_finance_expenses','get_finance_expense_accounts',
   'get_finance_assigned_account_movements','get_finance_expense_parties','get_finance_treasury_authorities','get_finance_expense_obligations','save_finance_expense','submit_finance_expense','review_finance_expense',
   'review_finance_expense_tax','decide_finance_expense_settlement','waive_finance_expense_reimbursement','prepare_finance_expense_payout',
   'confirm_finance_expense_payout','record_finance_paid_expense','bridge_finance_legacy_expense','set_finance_treasury_authority',
   'get_finance_payout_workspace','save_finance_payout','confirm_finance_payout','payout_assert','tax_position_source','tax_filing_monthly_facts')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('expense_account_balance','get_finance_expense_access','get_finance_expenses','get_finance_expense_accounts','get_finance_assigned_account_movements',
   'get_finance_expense_parties','get_finance_treasury_authorities','get_finance_expense_obligations','save_finance_expense','submit_finance_expense','review_finance_expense','review_finance_expense_tax',
   'decide_finance_expense_settlement','waive_finance_expense_reimbursement','prepare_finance_expense_payout','confirm_finance_expense_payout',
   'record_finance_paid_expense','bridge_finance_legacy_expense','set_finance_treasury_authority','get_finance_payout_workspace','save_finance_payout','confirm_finance_payout')
  then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end;
$security$;
