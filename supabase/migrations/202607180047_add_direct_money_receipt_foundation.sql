-- Candidate only. No backfill, posting, document numbering or customer document creation.
-- Direct money is a cash event, not settlement of an invented receivable.
create table public.finance_direct_money_receipts (
 id uuid primary key,
 status text not null default 'draft' check(status in ('draft','confirmed','reversed')),
 version integer not null default 1 check(version>0),
 client_id uuid references public.clients(id) on delete restrict,
 payer_name text not null check(length(btrim(payer_name)) between 1 and 500),
 case_id bigint references public.cases(id) on delete restrict,
 advisory_matter_id uuid references public.advisory_matters(id) on delete restrict,
 received_on date not null,
 method text not null check(method in ('bank_transfer','cash','other')),
 receiving_bank_account_id uuid references public.finance_bank_accounts(id) on delete restrict,
 cash_location text,
 currency text not null check(currency='THB'),
 cash_amount numeric not null check(cash_amount>0 and cash_amount=round(cash_amount,2)),
 wht_amount numeric not null check(wht_amount>=0 and wht_amount=round(wht_amount,2)),
 amount_before_vat numeric not null check(amount_before_vat>0),
 vat_amount numeric not null check(vat_amount>=0),
 gross_amount numeric not null check(gross_amount=cash_amount+wht_amount and gross_amount=amount_before_vat+vat_amount),
 reference_no text check(length(reference_no) between 1 and 200),
 evidence_reference text check(length(evidence_reference) between 1 and 1000),
 note text not null check(length(note)<=2000),
 lines_json jsonb not null check(jsonb_typeof(lines_json)='array' and jsonb_array_length(lines_json) between 1 and 100),
 unclassified boolean not null,
 input_json jsonb not null check(jsonb_typeof(input_json)='object'),
 confirmed_snapshot_json jsonb,
 classification_json jsonb check(classification_json is null or jsonb_typeof(classification_json)='object'),
 created_at timestamptz not null,
 created_by uuid not null references public.user_profiles(id),
 updated_at timestamptz not null,
 confirmed_at timestamptz,
 confirmed_by uuid references public.user_profiles(id),
 reversed_at timestamptz,
 reversed_by uuid references public.user_profiles(id),
 reversal_reason text,
 check(case_id is null or advisory_matter_id is null),
 check((case_id is null and advisory_matter_id is null) or client_id is not null),
 check((method='bank_transfer' and receiving_bank_account_id is not null and cash_location is null)
   or (method<>'bank_transfer' and receiving_bank_account_id is null and length(btrim(cash_location)) between 1 and 300)),
 check((status='draft' and confirmed_at is null and confirmed_by is null and confirmed_snapshot_json is null and reversed_at is null and reversed_by is null and reversal_reason is null)
   or (status='confirmed' and confirmed_at is not null and confirmed_by is not null and confirmed_snapshot_json is not null and reversed_at is null and reversed_by is null and reversal_reason is null)
   or (status='reversed' and confirmed_at is not null and confirmed_by is not null and confirmed_snapshot_json is not null and reversed_at is not null and reversed_by is not null and length(btrim(reversal_reason)) between 1 and 2000))
);
create unique index direct_money_active_reference on public.finance_direct_money_receipts
 (method,coalesce(receiving_bank_account_id::text,cash_location),currency,received_on,lower(btrim(reference_no)))
 where status<>'reversed' and reference_no is not null;
create unique index direct_money_active_evidence on public.finance_direct_money_receipts(lower(btrim(evidence_reference)))
 where status<>'reversed' and evidence_reference is not null;
create index direct_money_list on public.finance_direct_money_receipts(created_at desc,id);
create table public.finance_direct_money_receipt_audit (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null references public.finance_direct_money_receipts(id) on delete restrict,
 event_type text not null check(event_type in ('created','saved','classified','confirmed','reversed')),
 version integer not null check(version>0),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null,
 evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
 unique(receipt_id,version)
);

-- The existing Payment line-review engine and Direct lines share this exact primitive.
create function public.finance_structured_wht_amount(p_base numeric,p_rate numeric)
returns numeric language plpgsql immutable set search_path=public as $wht$
begin
 if p_base is null or p_base<=0 or p_base<>round(p_base,2) or p_rate is null or p_rate<=0 or p_rate>100 or p_rate<>round(p_rate,4)
 then raise exception 'WHT_LINE_RATE_REQUIRED'; end if;
 return round(p_base*p_rate/100,2);
end;
$wht$;

create function public.direct_money_lines(p_lines jsonb)
returns jsonb language plpgsql immutable set search_path=public as $lines$
declare l jsonb; result jsonb:='[]'; amounts record; vat jsonb; wht numeric; base numeric; rate numeric; nature text; classification text;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100
 then raise exception 'DIRECT_MONEY_LINES_REQUIRED'; end if;
 if (select count(distinct (value->>'source_line_id')::uuid) from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines)
 then raise exception 'DIRECT_MONEY_LINE_ID_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_lines) order by value->>'source_line_id' loop
  if jsonb_typeof(l) is distinct from 'object' or exists(select 1 from jsonb_object_keys(l) k where k not in
   ('source_line_id','description','reason','money_nature','classification','base','vat_applicable','vat_rate','vat_treatment_json','wht_applicability','wht_base','wht_rate'))
   or nullif(btrim(l->>'description'),'') is null or length(l->>'description')>1000 or nullif(btrim(l->>'reason'),'') is null or length(l->>'reason')>2000
  then raise exception 'DIRECT_MONEY_LINE_INVALID'; end if;
  nature:=l->>'money_nature'; classification:=l->>'classification';
  if nature is null or nature not in('business_revenue','client_money','owner_or_partner_funding','loan_or_deposit','reimbursement_or_pass_through','other_non_revenue','unclassified')
   or (nature='business_revenue' and (classification is null or classification not in('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')))
   or (nature<>'business_revenue' and classification is not null) then raise exception 'DIRECT_MONEY_CLASSIFICATION_REQUIRED'; end if;
  if jsonb_typeof(l->'vat_applicable') is distinct from 'boolean' or jsonb_typeof(l->'base') is distinct from 'number'
   or jsonb_typeof(l->'vat_rate') is distinct from 'number' then raise exception 'DIRECT_MONEY_VAT_INVALID'; end if;
  base:=(l->>'base')::numeric; rate:=(l->>'vat_rate')::numeric;
  if base<=0 or base>999999999999 or rate>100 then raise exception 'DIRECT_MONEY_AMOUNT_INVALID'; end if;
  vat:=public.finance_vat_treatment(l->'vat_treatment_json',(l->>'vat_applicable')::boolean,rate);
  if vat->>'treatment'='unknown' and nature<>'unclassified' then raise exception 'DIRECT_MONEY_VAT_UNRESOLVED'; end if;
  select * into amounts from public.calculate_finance_billable_charge_amounts(1,base,case when (l->>'vat_applicable')::boolean then 'vat_exclusive' else 'non_vat' end,rate);
  if l->>'wht_applicability'='applies' then
   if jsonb_typeof(l->'wht_base') is distinct from 'number' or jsonb_typeof(l->'wht_rate') is distinct from 'number'
     or (l->>'wht_base')::numeric>base then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
   wht:=public.finance_structured_wht_amount((l->>'wht_base')::numeric,(l->>'wht_rate')::numeric);
   if wht<=0 then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
  elsif l->>'wht_applicability'='does_not_apply' then
   if l->>'wht_base' is not null or l->>'wht_rate' is not null then raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
   wht:=0;
  else raise exception 'DIRECT_MONEY_WHT_INVALID'; end if;
  result:=result||jsonb_build_array(l||jsonb_build_object('source_line_id',(l->>'source_line_id')::uuid,
   'description',btrim(l->>'description'),'reason',btrim(l->>'reason'),'vat_treatment_json',vat,
   'vat',amounts.vat_amount,'gross',amounts.total_amount,'wht',wht,'cash',amounts.total_amount-wht));
 end loop;
 return result;
end;
$lines$;

create function public.direct_money_payload(p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $payload$
declare lines jsonb; result jsonb; client uuid; case_id bigint; advisory uuid; bank uuid; amount numeric;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in
  ('client_id','payer_name','case_id','advisory_matter_id','received_on','method','receiving_bank_account_id','cash_location','currency','cash_amount','reference_no','evidence_reference','note','lines'))
 then raise exception 'DIRECT_MONEY_FACTS_REQUIRED'; end if;
 client:=(p_input->>'client_id')::uuid; case_id:=(p_input->>'case_id')::bigint; advisory:=(p_input->>'advisory_matter_id')::uuid; bank:=(p_input->>'receiving_bank_account_id')::uuid;
 if client is not null then perform public.assert_finance_billable_charge_context(client,case_id,advisory);
 elsif case_id is not null or advisory is not null then raise exception 'DIRECT_MONEY_CONTEXT_INVALID'; end if;
 if nullif(btrim(p_input->>'payer_name'),'') is null or length(p_input->>'payer_name')>500
  or p_input->>'currency' is distinct from 'THB' or (p_input->>'received_on')::date is null
  or (p_input->>'received_on')::date>(current_timestamp at time zone 'Asia/Bangkok')::date
  or p_input->>'method' is null or p_input->>'method' not in('bank_transfer','cash','other')
  or jsonb_typeof(p_input->'cash_amount') is distinct from 'number' or p_input->>'note' is null or length(p_input->>'note')>2000
 then raise exception 'DIRECT_MONEY_FACTS_REQUIRED'; end if;
 if p_input->>'method'='bank_transfer' then
  if bank is null or not exists(select 1 from public.finance_bank_accounts b where b.id=bank and b.is_active)
   or nullif(btrim(p_input->>'cash_location'),'') is not null then raise exception 'DIRECT_MONEY_ACCOUNT_REQUIRED'; end if;
 elsif bank is not null or nullif(btrim(p_input->>'cash_location'),'') is null or length(p_input->>'cash_location')>300
 then raise exception 'DIRECT_MONEY_ACCOUNT_REQUIRED'; end if;
 lines:=public.direct_money_lines(p_input->'lines'); amount:=(p_input->>'cash_amount')::numeric;
 if amount<=0 or amount<>round(amount,2) or amount<>(select sum((l->>'cash')::numeric) from jsonb_array_elements(lines) l)
 then raise exception 'DIRECT_MONEY_RECONCILE'; end if;
 result:=p_input-'lines'||jsonb_build_object('payer_name',btrim(p_input->>'payer_name'),'note',btrim(p_input->>'note'),
  'reference_no',nullif(btrim(p_input->>'reference_no'),''),'evidence_reference',nullif(btrim(p_input->>'evidence_reference'),''),
  'cash_location',nullif(btrim(p_input->>'cash_location'),''),'lines_json',lines,
  'amount_before_vat',(select sum((l->>'base')::numeric) from jsonb_array_elements(lines) l),
  'vat_amount',(select sum((l->>'vat')::numeric) from jsonb_array_elements(lines) l),
  'wht_amount',(select sum((l->>'wht')::numeric) from jsonb_array_elements(lines) l),
  'gross_amount',(select sum((l->>'gross')::numeric) from jsonb_array_elements(lines) l),
  'unclassified',exists(select 1 from jsonb_array_elements(lines) l where l->>'money_nature'='unclassified'));
 return result;
end;
$payload$;

create function public.direct_money_snapshot(p public.finance_direct_money_receipts)
returns jsonb language sql stable security definer set search_path=public as $snapshot$
 select jsonb_build_object('schema_version',1,'source_type','direct_money_receipt','source_id',p.id,'source_version',p.version,
  'currency',p.currency,'actual_cash',p.cash_amount,'wht_credit',p.wht_amount,'gross_received',p.gross_amount,
  'before_vat',p.amount_before_vat,'vat',p.vat_amount,'lines',p.lines_json,
  'facts',to_jsonb(p)-'confirmed_snapshot_json',
  'client',case when p.client_id is null then null else (select to_jsonb(c) from (select id,name from public.clients where id=p.client_id) c) end,
  'bank',case when p.receiving_bank_account_id is null then null else (select to_jsonb(b) from (select id,short_name,bank_name from public.finance_bank_accounts where id=p.receiving_bank_account_id) b) end,
  'document_policy',jsonb_build_object('state','requires_review','automatic_issue',false,'reason','direct_source_integration_not_enabled'),
  'cashbook',jsonb_build_object('posting_enabled',false,'original_leg_key','direct_money_receipt:'||p.id::text||':original'));
$snapshot$;

create function public.save_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $save_direct$
declare a public.finance_direct_money_receipts%rowtype; n public.finance_direct_money_receipts%rowtype; data jsonb; ts timestamptz:=clock_timestamp(); ev text;
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'DIRECT_MONEY_STALE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is not null and a.status<>'draft' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 data:=public.direct_money_payload(p_input);
 if a.id is not null and a.input_json=p_input and a.created_by=auth.uid() and p_expected_version in(a.version,a.version-1) then return a.id; end if;
 if coalesce(a.version,0)<>p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 n:=jsonb_populate_record(null::public.finance_direct_money_receipts,data);
 if a.id is null then
  n.id:=p_id; n.status:='draft'; n.version:=1; n.created_by:=auth.uid(); n.created_at:=ts; n.updated_at:=ts; n.input_json:=p_input;
  insert into public.finance_direct_money_receipts select n.* returning * into a; ev:='created';
 else
  update public.finance_direct_money_receipts set client_id=n.client_id,payer_name=n.payer_name,case_id=n.case_id,advisory_matter_id=n.advisory_matter_id,
   received_on=n.received_on,method=n.method,receiving_bank_account_id=n.receiving_bank_account_id,cash_location=n.cash_location,currency=n.currency,
   cash_amount=n.cash_amount,wht_amount=n.wht_amount,amount_before_vat=n.amount_before_vat,vat_amount=n.vat_amount,gross_amount=n.gross_amount,
   reference_no=n.reference_no,evidence_reference=n.evidence_reference,note=n.note,lines_json=n.lines_json,unclassified=n.unclassified,input_json=p_input,
   version=version+1,updated_at=ts where id=p_id returning * into a; ev:='saved';
 end if;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,ev,a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$save_direct$;

-- One shared distribution table with an exclusive source identity. No existing rows are rewritten.
alter table public.finance_vp_revenue_distributions alter column payment_id drop not null;
alter table public.finance_vp_revenue_distributions add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict;
alter table public.finance_vp_revenue_distributions add constraint vp_distribution_source_identity check(
 (payment_id is not null and direct_money_receipt_id is null) or (payment_id is null and direct_money_receipt_id is not null and money_allocation_id is null));
create unique index vp_distribution_direct_revision on public.finance_vp_revenue_distributions(direct_money_receipt_id,revision);
create unique index vp_distribution_current_direct on public.finance_vp_revenue_distributions(direct_money_receipt_id) where status<>'superseded';

create function public.transition_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition_direct$
declare a public.finance_direct_money_receipts%rowtype; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'DIRECT_MONEY_ACK_REQUIRED'; end if;
 if p_action is null or p_action not in('confirm','reverse') then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is null then raise exception 'DIRECT_MONEY_MISSING'; end if;
 if a.version=p_expected_version+1 and ((p_action='confirm' and a.status='confirmed' and a.confirmed_by=auth.uid())
  or (p_action='reverse' and a.status='reversed' and a.reversed_by=auth.uid() and a.reversal_reason=btrim(p_reason))) then return a.id; end if;
 if a.version is distinct from p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 if p_action='confirm' and a.status='draft' then
  perform public.direct_money_payload(a.input_json);
  a.status:='confirmed'; a.version:=a.version+1; a.updated_at:=ts; a.confirmed_at:=ts; a.confirmed_by:=auth.uid();
  update public.finance_direct_money_receipts set status=a.status,version=a.version,updated_at=ts,confirmed_at=ts,confirmed_by=auth.uid(),
    confirmed_snapshot_json=public.direct_money_snapshot(a) where id=a.id returning * into a;
 elsif p_action='reverse' and a.status='confirmed' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'DIRECT_MONEY_REASON_REQUIRED'; end if;
  if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=a.id and status in('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
  update public.finance_direct_money_receipts set status='reversed',version=version+1,updated_at=ts,reversed_at=ts,reversed_by=auth.uid(),reversal_reason=btrim(p_reason)
   where id=a.id returning * into a;
 else raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,a.status,a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$transition_direct$;

create function public.direct_money_guard()
returns trigger language plpgsql security definer set search_path=public as $guard_direct$
begin
 if tg_op in('DELETE','TRUNCATE') or tg_table_name='finance_direct_money_receipt_audit' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.version<>1 then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if; return new;
 end if;
 if new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.version<>old.version+1 or new.updated_at<old.updated_at
  or old.status='reversed' then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 if old.status='confirmed' then
  if new.status='confirmed' then
   if new.classification_json is null or new.classification_json is not distinct from old.classification_json
     or (to_jsonb(new)-array['version','updated_at','classification_json','unclassified']) is distinct from
       (to_jsonb(old)-array['version','updated_at','classification_json','unclassified']) then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  elsif new.status<>'reversed' or (to_jsonb(new)-array['status','version','updated_at','reversed_at','reversed_by','reversal_reason']) is distinct from
    (to_jsonb(old)-array['status','version','updated_at','reversed_at','reversed_by','reversal_reason']) then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=old.id and status in('reviewed','finalized'))
  then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
 elsif new.status not in('draft','confirmed') then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 return new;
end;
$guard_direct$;
create trigger direct_money_immutable before insert or update or delete on public.finance_direct_money_receipts for each row execute function public.direct_money_guard();
create trigger direct_money_audit_immutable before update or delete on public.finance_direct_money_receipt_audit for each row execute function public.direct_money_guard();
create trigger direct_money_no_truncate before truncate on public.finance_direct_money_receipts for each statement execute function public.direct_money_guard();
create trigger direct_money_audit_no_truncate before truncate on public.finance_direct_money_receipt_audit for each statement execute function public.direct_money_guard();

create function public.direct_money_classification_lines(p_original jsonb,p_choices jsonb)
returns jsonb language plpgsql immutable set search_path=public as $classification_lines$
declare l jsonb; c jsonb; lines jsonb:='[]'; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' or jsonb_array_length(p_choices)<>jsonb_array_length(p_original)
 then raise exception 'DIRECT_MONEY_LINES_REQUIRED'; end if;
 for l in select value from jsonb_array_elements(p_original) loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'source_line_id'=l->>'source_line_id')<>1
  then raise exception 'DIRECT_MONEY_LINE_ID_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'source_line_id'=l->>'source_line_id';
  if exists(select 1 from jsonb_object_keys(c) k where k not in('source_line_id','money_nature','classification','vat_treatment_json'))
  then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
  if c->>'money_nature' is null or c->>'money_nature'='unclassified' then raise exception 'DIRECT_MONEY_CLASSIFICATION_REQUIRED'; end if;
  lines:=lines||jsonb_build_array((l-array['cash','wht','vat','gross'])||c);
 end loop;
 canonical:=public.direct_money_lines(lines);
 if (select jsonb_agg(x-array['money_nature','classification','vat_treatment_json'] order by x->>'source_line_id') from jsonb_array_elements(canonical) x)
  is distinct from (select jsonb_agg(x-array['money_nature','classification','vat_treatment_json'] order by x->>'source_line_id') from jsonb_array_elements(p_original) x)
 then raise exception 'DIRECT_MONEY_IMMUTABLE'; end if;
 return canonical;
end;
$classification_lines$;

create function public.direct_money_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity_direct$
declare a public.finance_direct_money_receipts%rowtype; projected jsonb; ev text;
begin
 if tg_table_name='finance_direct_money_receipt_audit' then
  select * into a from public.finance_direct_money_receipts where id=new.receipt_id;
  if a.id is null or new.version>a.version or new.evidence_json->>'id' is distinct from a.id::text
   or new.version is distinct from (new.evidence_json->>'version')::integer
   or (new.version=a.version and new.evidence_json is distinct from to_jsonb(a))
   or new.created_at is distinct from (new.evidence_json->>'updated_at')::timestamptz
   or (new.event_type='created' and new.actor_id is distinct from (new.evidence_json->>'created_by')::uuid)
   or (new.event_type='confirmed' and new.actor_id is distinct from (new.evidence_json->>'confirmed_by')::uuid)
   or (new.event_type='reversed' and new.actor_id is distinct from (new.evidence_json->>'reversed_by')::uuid)
   or (new.event_type='classified' and new.actor_id is distinct from (new.evidence_json#>>'{classification_json,actor_id}')::uuid)
   or (new.version>1 and not exists(select 1 from public.finance_direct_money_receipt_audit e where e.receipt_id=a.id and e.version=new.version-1))
  then raise exception 'DIRECT_MONEY_AUDIT_INVALID'; end if;
  return null;
 end if;
 ev:=case when tg_op='INSERT' then 'created' when new.status='draft' then 'saved' when new.status='confirmed' and old.status='confirmed' then 'classified' else new.status end;
 if not exists(select 1 from public.finance_direct_money_receipt_audit e where e.receipt_id=new.id and e.version=new.version and e.event_type=ev and e.evidence_json=to_jsonb(new))
 then raise exception 'DIRECT_MONEY_AUDIT_REQUIRED'; end if;
 -- Validate stored line arithmetic without depending on mutable bank/client master data.
 projected:=public.direct_money_lines(new.input_json->'lines');
 if new.lines_json is distinct from projected or new.cash_amount<>(select sum((l->>'cash')::numeric) from jsonb_array_elements(projected) l)
  or new.wht_amount<>(select sum((l->>'wht')::numeric) from jsonb_array_elements(projected) l)
  or new.vat_amount<>(select sum((l->>'vat')::numeric) from jsonb_array_elements(projected) l)
  or new.amount_before_vat<>(select sum((l->>'base')::numeric) from jsonb_array_elements(projected) l)
  or new.unclassified is distinct from exists(select 1 from jsonb_array_elements(coalesce(new.classification_json->'lines',projected)) l where l->>'money_nature'='unclassified')
 then raise exception 'DIRECT_MONEY_RECONCILE'; end if;
 if new.classification_json is not null then
  if new.status='draft' or new.classification_json->'schema_version' is distinct from '1'::jsonb
   or nullif(btrim(new.classification_json->>'reason'),'') is null
   or length(new.classification_json->>'reason')>2000
   or (new.classification_json->>'actor_id')::uuid is null
   or new.classification_json->'lines' is distinct from public.direct_money_classification_lines(new.lines_json,new.classification_json->'choices')
   or (ev='classified' and (new.classification_json->>'created_at')::timestamptz is distinct from new.updated_at)
  then raise exception 'DIRECT_MONEY_CLASSIFICATION_INVALID'; end if;
 end if;
 if new.status='confirmed' and old.status='draft' and new.confirmed_snapshot_json is distinct from public.direct_money_snapshot(new)
 then raise exception 'DIRECT_MONEY_SNAPSHOT_INVALID'; end if;
 return null;
end;
$integrity_direct$;
create constraint trigger direct_money_integrity after insert or update on public.finance_direct_money_receipts deferrable initially deferred for each row execute function public.direct_money_integrity();
create constraint trigger direct_money_audit_integrity after insert on public.finance_direct_money_receipt_audit deferrable initially deferred for each row execute function public.direct_money_integrity();

alter table public.finance_direct_money_receipts enable row level security;
alter table public.finance_direct_money_receipt_audit enable row level security;
create policy direct_money_read on public.finance_direct_money_receipts for select to authenticated using(public.current_user_can_view_finance_payments());
create policy direct_money_audit_read on public.finance_direct_money_receipt_audit for select to authenticated using(public.current_user_can_view_finance_payments());
revoke all on public.finance_direct_money_receipts,public.finance_direct_money_receipt_audit from public,anon,authenticated;
grant select on public.finance_direct_money_receipts,public.finance_direct_money_receipt_audit to authenticated;
revoke all on function public.finance_structured_wht_amount(numeric,numeric),public.direct_money_lines(jsonb),public.direct_money_classification_lines(jsonb,jsonb),public.direct_money_payload(jsonb),public.direct_money_snapshot(public.finance_direct_money_receipts),public.direct_money_guard(),public.direct_money_integrity(),
 public.save_finance_direct_money_receipt(uuid,integer,jsonb),public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.save_finance_direct_money_receipt(uuid,integer,jsonb),public.transition_finance_direct_money_receipt(uuid,integer,text,boolean,text) to authenticated;

-- Classification revises only economic evidence. Original confirmed cash/tax facts stay frozen.
create function public.classify_finance_direct_money_receipt(p_id uuid,p_expected_version integer,p_choices jsonb,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $classify$
declare a public.finance_direct_money_receipts%rowtype; canonical jsonb; ts timestamptz:=clock_timestamp();
begin
 if not public.money_allocation_admin() then raise exception 'DIRECT_MONEY_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'DIRECT_MONEY_ACK_REQUIRED'; end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'DIRECT_MONEY_REASON_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_id::text,0));
 select * into a from public.finance_direct_money_receipts where id=p_id for update;
 if a.id is null or a.status<>'confirmed' then raise exception 'DIRECT_MONEY_TRANSITION_INVALID'; end if;
 if a.version=p_expected_version+1 and a.classification_json->'choices'=p_choices and a.classification_json->>'reason'=btrim(p_reason)
  and a.classification_json->>'actor_id'=auth.uid()::text then return a.id; end if;
 if a.version is distinct from p_expected_version then raise exception 'DIRECT_MONEY_STALE'; end if;
 if exists(select 1 from public.finance_vp_revenue_distributions where direct_money_receipt_id=a.id and status in('reviewed','finalized')) then raise exception 'VP_DISTRIBUTION_SUPERSEDE_REQUIRED'; end if;
 canonical:=public.direct_money_classification_lines(a.lines_json,p_choices);
 update public.finance_direct_money_receipts set version=version+1,updated_at=ts,unclassified=false,
  classification_json=jsonb_build_object('schema_version',1,'lines',canonical,'choices',p_choices,'reason',btrim(p_reason),'actor_id',auth.uid(),'created_at',ts)
  where id=a.id returning * into a;
 insert into public.finance_direct_money_receipt_audit(receipt_id,event_type,version,actor_id,created_at,evidence_json)
 values(a.id,'classified',a.version,auth.uid(),ts,to_jsonb(a)); return a.id;
end;
$classify$;
revoke all on function public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text) from public,anon;
grant execute on function public.classify_finance_direct_money_receipt(uuid,integer,jsonb,boolean,text) to authenticated;

-- SHARED SOURCE ADAPTERS (generated from the unchanged 045/046 implementations).
create function public.vp_received_line_economics(p_base numeric,p_wht numeric,p_classification text)
returns jsonb language plpgsql immutable set search_path=public as $economics$
begin
 if p_base is null or p_wht is null or p_base<0 or p_wht<0 or p_base<p_wht or p_base<>round(p_base,2) or p_wht<>round(p_wht,2)
  or p_classification is null or p_classification not in('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return jsonb_build_object('professional_pool',case when p_classification='professional_fee' then p_base-p_wht else 0 end,
  'company_economic',case when p_classification='professional_fee' then 0 else p_base end,
  'company_cash',case when p_classification='professional_fee' then 0 else p_base-p_wht end);
end;
$economics$;

create or replace function public.vp_distribution_frozen_source(p_money_source jsonb,p_money_allocation jsonb)
returns jsonb language plpgsql immutable set search_path=public as $source$
declare s jsonb:=p_money_source; a jsonb:=nullif(p_money_allocation,'null'::jsonb);
 l jsonb; economics jsonb; item jsonb; ready jsonb; commercial jsonb; invoice_header jsonb; classification text; k text;
 lines jsonb:='[]'; blockers jsonb:='[]'; valid boolean; amount numeric;
 cash numeric; wht numeric; vat numeric; base numeric; pool numeric; economic numeric; company_cash numeric;
 total_pool numeric:=0; total_economic numeric:=0; total_company_cash numeric:=0;
 line_cash numeric:=0; line_wht numeric:=0; line_vat numeric:=0; line_base numeric:=0;
begin
 if jsonb_typeof(s) is distinct from 'object' then
  return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1',
   'money_source',s,'money_allocation',a,'lines','[]'::jsonb,
   'totals',jsonb_build_object('cash',null,'wht',null,'vat',null,'base',null,
     'professional_pool',null,'company_economic',null,'company_cash',null),
   'blockers',jsonb_build_array('money_source_unavailable'));
 end if;
 if jsonb_typeof(s->'blockers')='array' then blockers:=s->'blockers';
 else blockers:=jsonb_build_array('money_source_invalid'); end if;
 begin
  if s->'schema_version' is distinct from '1'::jsonb
    or jsonb_typeof(s->'payment') is distinct from 'object'
    or jsonb_typeof(s#>'{payment,currency}') is distinct from 'string'
    or nullif(btrim(s#>>'{payment,currency}'),'') is null
    or jsonb_typeof(s#>'{payment,id}') is distinct from 'string'
    or nullif(s#>>'{payment,id}','') is null
    or jsonb_typeof(s->'lines') is distinct from 'array'
    or jsonb_typeof(s->'invoices') is distinct from 'array'
  then raise exception 'INVALID'; end if;
  perform (s#>>'{payment,id}')::uuid;
  for k in select unnest(array['cash','wht','settlement']) loop
   if jsonb_typeof(s->'payment'->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->'payment'->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  for k in select unnest(array['proven_base','proven_vat','unallocated_settlement']) loop
   if jsonb_typeof(s->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   amount:=(s->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
  end loop;
  cash:=(s#>>'{payment,cash}')::numeric; wht:=(s#>>'{payment,wht}')::numeric;
  base:=(s->>'proven_base')::numeric; vat:=(s->>'proven_vat')::numeric;
  if cash+wht is distinct from (s#>>'{payment,settlement}')::numeric
    or (s->>'unallocated_settlement')::numeric<>0 then blockers:=blockers||jsonb_build_array('settlement_evidence_invalid'); end if;
 exception when others then
  blockers:=blockers||jsonb_build_array('money_source_invalid');
  cash:=null; wht:=null; base:=null; vat:=null;
 end;
 if s#>>'{payment,status}' is distinct from 'confirmed' then blockers:=blockers||jsonb_build_array('payment_not_confirmed'); end if;
 if a is not null then
  if jsonb_typeof(a) is distinct from 'object'
    or a->>'payment_id' is distinct from s#>>'{payment,id}'
    or coalesce(a->>'status','') not in ('draft','reviewed','finalized')
    or a->'source_snapshot_json' is distinct from s
  then blockers:=blockers||jsonb_build_array('money_allocation_stale'); end if;
  begin
   if public.money_allocation_decisions(s,a->'decisions_json',false) is distinct from a->'decisions_json'
   then raise exception 'INVALID'; end if;
   if exists(select 1 from jsonb_array_elements(a->'decisions_json') x
     where coalesce(x->>'category','') not in ('company_revenue','unallocated'))
   then blockers:=blockers||jsonb_build_array('money_allocation_conflict'); end if;
  exception when others then blockers:=blockers||jsonb_build_array('money_allocation_invalid'); end;
 end if;
 for l in select value from jsonb_array_elements(case when jsonb_typeof(s->'lines')='array' then s->'lines' else '[]'::jsonb end) loop
  item:=l->'source_item'; ready:=item#>'{source_snapshot_json,ready_snapshot}'; commercial:=ready->'commercial';
  classification:=ready#>>'{economic,classification}'; valid:=true;
  pool:=0; economic:=0; company_cash:=0;
  if classification is null or classification not in ('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
  then blockers:=blockers||jsonb_build_array('classification_unsupported'); valid:=false; end if;
  begin
   if jsonb_typeof(l) is distinct from 'object' or jsonb_typeof(item) is distinct from 'object'
     or item->>'id' is distinct from l->>'invoice_item_id'
     or item->>'invoice_id' is distinct from l->>'invoice_id'
     or item->>'source_state' is distinct from 'active'
   then raise exception 'INVALID'; end if;
   if nullif(l->>'invoice_item_id','') is null or nullif(l->>'invoice_id','') is null then raise exception 'INVALID'; end if;
   perform (l->>'invoice_item_id')::uuid; perform (l->>'invoice_id')::uuid;
   if (select count(*) from jsonb_array_elements(s->'invoices') inv where inv->>'invoice_id'=l->>'invoice_id')<>1
   then raise exception 'INVALID'; end if;
   select inv#>'{issued_snapshot,invoice}' into invoice_header from jsonb_array_elements(s->'invoices') inv
    where inv->>'invoice_id'=l->>'invoice_id';
   if invoice_header->>'id' is distinct from l->>'invoice_id'
     or jsonb_typeof(invoice_header->'client_id') is distinct from 'string'
     or nullif(invoice_header->>'client_id','') is null
     or ready#>>'{charge,client_id}' is distinct from invoice_header->>'client_id'
   then raise exception 'INVALID'; end if;
   perform (invoice_header->>'client_id')::uuid;
   for k in select unnest(array['cash','wht','vat','base','settlement']) loop
    if jsonb_typeof(l->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(l->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   if (l->>'base')::numeric<=0
     or (l->>'base')::numeric+(l->>'vat')::numeric is distinct from (l->>'settlement')::numeric
     or (l->>'cash')::numeric+(l->>'wht')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
   line_cash:=line_cash+(l->>'cash')::numeric; line_wht:=line_wht+(l->>'wht')::numeric;
   line_base:=line_base+(l->>'base')::numeric; line_vat:=line_vat+(l->>'vat')::numeric;
   if (l->>'base')::numeric-(l->>'wht')::numeric<0 then
    blockers:=blockers||jsonb_build_array('base_less_than_wht'); valid:=false;
   end if;
   if jsonb_typeof(ready) is distinct from 'object' or ready->'schema_version' is distinct from '1'::jsonb
     or item#>'{source_snapshot_json,schema_version}' is distinct from '2'::jsonb
     or jsonb_typeof(item->'source_billable_charge_id') is distinct from 'string'
     or nullif(item->>'source_billable_charge_id','') is null
     or ready#>>'{charge,id}' is distinct from item->>'source_billable_charge_id'
     or item#>>'{source_snapshot_json,billable_charge_id}' is distinct from item->>'source_billable_charge_id'
     or ready#>>'{charge,status}' is distinct from 'ready_to_invoice'
     or jsonb_typeof(commercial) is distinct from 'object'
     or jsonb_typeof(commercial->'currency') is distinct from 'string'
     or nullif(btrim(commercial->>'currency'),'') is null
     or commercial->>'currency' is distinct from s#>>'{payment,currency}'
   then raise exception 'INVALID'; end if;
   perform (item->>'source_billable_charge_id')::uuid;
   for k in select unnest(array['amount_before_vat','vat_amount','total_amount']) loop
    if jsonb_typeof(commercial->k) is distinct from 'number' then raise exception 'INVALID'; end if;
    amount:=(commercial->>k)::numeric;
    if amount<0 or amount<>round(amount,2) then raise exception 'INVALID'; end if;
   end loop;
   for k in select unnest(array['amount_before_vat','vat_amount','line_total']) loop
    if jsonb_typeof(item->k) is distinct from 'number' then raise exception 'INVALID'; end if;
   end loop;
   if (commercial->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (commercial->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (commercial->>'total_amount')::numeric is distinct from (l->>'settlement')::numeric
     or (item->>'amount_before_vat')::numeric is distinct from (l->>'base')::numeric
     or (item->>'vat_amount')::numeric is distinct from (l->>'vat')::numeric
     or (item->>'line_total')::numeric is distinct from (l->>'settlement')::numeric
   then raise exception 'INVALID'; end if;
  exception when others then blockers:=blockers||jsonb_build_array('frozen_economic_evidence_invalid'); valid:=false;
  end;
  if valid then
   economics:=public.vp_received_line_economics((l->>'base')::numeric,(l->>'wht')::numeric,classification);
   pool:=(economics->>'professional_pool')::numeric; economic:=(economics->>'company_economic')::numeric; company_cash:=(economics->>'company_cash')::numeric;
  end if;
  total_pool:=total_pool+pool; total_economic:=total_economic+economic; total_company_cash:=total_company_cash+company_cash;
  lines:=lines||jsonb_build_array(l||jsonb_build_object('classification',classification,'professional_pool',pool,
    'company_economic',economic,'company_cash',company_cash));
 end loop;
 if jsonb_array_length(lines)=0 then blockers:=blockers||jsonb_build_array('frozen_lines_missing'); end if;
 if (select count(distinct x->>'invoice_item_id') from jsonb_array_elements(lines) x)<>jsonb_array_length(lines)
 then blockers:=blockers||jsonb_build_array('frozen_lines_invalid'); end if;
 if line_cash is distinct from cash or line_wht is distinct from wht or line_base is distinct from base or line_vat is distinct from vat
   or cash is distinct from total_company_cash+total_pool+vat
 then blockers:=blockers||jsonb_build_array('cash_reconciliation_invalid'); end if;
 return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1','money_source',s,'money_allocation',a,
  'lines',lines,'totals',jsonb_build_object('cash',cash,'wht',wht,'vat',vat,'base',base,
    'professional_pool',total_pool,'company_economic',total_economic,'company_cash',total_company_cash),
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$source$;

create function public.vp_direct_frozen_source(s jsonb)
returns jsonb language plpgsql immutable set search_path=public as $direct_source$
declare l jsonb; lines jsonb:='[]'; blockers jsonb:='[]'; economics jsonb; canonical jsonb; input_lines jsonb;
begin
 if s->>'source_type' is distinct from 'direct_money_receipt' or s->'schema_version' is distinct from '1'::jsonb
  or jsonb_typeof(s->'lines') is distinct from 'array' or nullif(s->>'source_id','') is null
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 perform (s->>'source_id')::uuid;
 if s->>'status' is distinct from 'confirmed' then blockers:=blockers||jsonb_build_array('direct_not_confirmed'); end if;
 select coalesce(jsonb_agg(x-array['cash','wht','vat','gross']),'[]') into input_lines from jsonb_array_elements(s->'lines') x;
 canonical:=public.direct_money_lines(input_lines);
 if canonical is distinct from s->'lines' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 for l in select value from jsonb_array_elements(canonical) loop
  economics:=jsonb_build_object('professional_pool',0,'company_economic',0,'company_cash',0);
  if l->>'money_nature'<>'business_revenue' then blockers:=blockers||jsonb_build_array('direct_'||(l->>'money_nature'));
  elsif l#>>'{vat_treatment_json,treatment}'='unknown' then blockers:=blockers||jsonb_build_array('direct_vat_unresolved');
  else economics:=public.vp_received_line_economics((l->>'base')::numeric,(l->>'wht')::numeric,l->>'classification'); end if;
  lines:=lines||jsonb_build_array(l||economics);
 end loop;
 if (s->>'actual_cash')::numeric is distinct from (select sum((x->>'cash')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'wht_credit')::numeric is distinct from (select sum((x->>'wht')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'before_vat')::numeric is distinct from (select sum((x->>'base')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'vat')::numeric is distinct from (select sum((x->>'vat')::numeric) from jsonb_array_elements(lines) x)
  or (s->>'gross_received')::numeric is distinct from (s->>'actual_cash')::numeric+(s->>'wht_credit')::numeric
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return jsonb_build_object('schema_version',1,'policy_version','vp_distribution_v1','received_money_source',s,
  'money_source',null,'money_allocation',null,'lines',lines,'totals',jsonb_build_object('cash',s->'actual_cash','wht',s->'wht_credit','base',s->'before_vat','vat',s->'vat',
   'professional_pool',(select sum((x->>'professional_pool')::numeric) from jsonb_array_elements(lines) x),
   'company_economic',(select sum((x->>'company_economic')::numeric) from jsonb_array_elements(lines) x),
   'company_cash',(select sum((x->>'company_cash')::numeric) from jsonb_array_elements(lines) x)),
  'blockers',(select coalesce(jsonb_agg(distinct value order by value),'[]') from jsonb_array_elements(blockers)));
end;
$direct_source$;

create function public.vp_received_source(p_payment_id uuid,p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $source$
declare a public.finance_direct_money_receipts%rowtype; s jsonb;
begin
 if (p_payment_id is null)=(p_direct_id is null) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_payment_id is not null then return public.vp_distribution_source(p_payment_id); end if;
 select * into a from public.finance_direct_money_receipts where id=p_direct_id;
 if a.id is null then raise exception 'DIRECT_MONEY_MISSING'; end if;
 s:=coalesce(a.confirmed_snapshot_json,public.direct_money_snapshot(a))||jsonb_build_object('status',a.status,'source_version',a.version);
 if a.classification_json is not null then s:=s||jsonb_build_object('lines',a.classification_json->'lines','classification_evidence',a.classification_json); end if;
 s:=s||jsonb_build_object('source_fingerprint',md5(s::text));
 return public.vp_direct_frozen_source(s);
end;
$source$;
create function public.vp_received_frozen(p_source jsonb)
returns jsonb language sql immutable set search_path=public as $frozen$
 select case when p_source ? 'received_money_source' then public.vp_direct_frozen_source(p_source->'received_money_source')
 else public.vp_distribution_frozen_source(p_source->'money_source',p_source->'money_allocation') end;
$frozen$;
create function public.vp_received_lock(p_payment_id uuid,p_direct_id uuid)
returns void language plpgsql security definer set search_path=public as $lock$
begin
 if (p_payment_id is null)=(p_direct_id is null) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_payment_id is not null then perform public.money_allocation_lock(p_payment_id); return; end if;
 perform pg_advisory_xact_lock(hashtextextended('direct_money:'||p_direct_id::text,0));
 perform 1 from public.finance_direct_money_receipts where id=p_direct_id for update;
 if not found then raise exception 'DIRECT_MONEY_MISSING'; end if;
end;
$lock$;

create or replace function public.vp_distribution_amount_choices_v1(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare identity_key text:=case when p_source ? 'received_money_source' then 'source_line_id' else 'invoice_item_id' end; l jsonb; c jsonb; k text; amount numeric; total numeric; pool numeric; result jsonb:='[]';
begin
 if p_complete is null or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x) is distinct from 'object')
   or jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee')
 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' order by value->>identity_key loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>identity_key=l->>identity_key)<>1
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>identity_key=l->>identity_key;
  if jsonb_typeof(c->identity_key) is distinct from 'string'
    or exists(select 1 from jsonb_object_keys(c) as keys(key) where keys.key not in (identity_key,'referral_amount','company_share_amount','work_compensation_amount'))
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  total:=0;
  for k in select unnest(array['referral_amount','company_share_amount','work_compensation_amount']) loop
   if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   amount:=(c->>k)::numeric;
   if amount<0 or amount<>round(amount,2) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
   total:=total+amount;
  end loop;
  if jsonb_typeof(l->'professional_pool') is distinct from 'number' then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  pool:=(l->>'professional_pool')::numeric;
  if pool<0 or pool<>round(pool,2) then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  if total>pool then raise exception 'VP_DISTRIBUTION_POOL_EXCEEDED'; end if;
  if p_complete and total<>pool then raise exception 'VP_DISTRIBUTION_REVIEW_REQUIRED'; end if;
  result:=result||jsonb_build_array(jsonb_build_object(identity_key,l->>identity_key,
   'referral_amount',(c->>'referral_amount')::numeric,'company_share_amount',(c->>'company_share_amount')::numeric,
   'work_compensation_amount',(c->>'work_compensation_amount')::numeric));
 end loop;
 return result;
end;
$choices$;

create or replace function public.vp_distribution_choices(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare identity_key text:=case when p_source ? 'received_money_source' then 'source_line_id' else 'invoice_item_id' end; base jsonb; result jsonb:='[]'; c jsonb; l jsonb; f jsonb; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 base:=public.vp_distribution_amount_choices_v1(p_source,(select coalesce(jsonb_agg(value-'formula_result'),'[]') from jsonb_array_elements(p_choices)),p_complete);
 for c in select value from jsonb_array_elements(base) loop
  select value->'formula_result' into f from jsonb_array_elements(p_choices) where value->>identity_key=c->>identity_key;
  if f is not null then
   select value into l from jsonb_array_elements(p_source->'lines') where value->>identity_key=c->>identity_key;
   canonical:=public.vp_formula_calculate((l->>'professional_pool')::numeric,f->>'formula_code',(f->>'formula_version')::integer,f->'formula_snapshot',f->'recipients');
   if canonical is distinct from f or c->'referral_amount' is distinct from f->'referral_amount'
     or c->'company_share_amount' is distinct from f->'company_share_amount' or c->'work_compensation_amount' is distinct from f->'work_compensation_amount'
   then raise exception 'VP_FORMULA_EVIDENCE_INVALID'; end if;
   c:=c||jsonb_build_object('formula_result',canonical);
  end if;
  result:=result||jsonb_build_array(c);
 end loop;
 return result;
end;
$choices$;

create or replace function public.vp_distribution_immutable()
returns trigger language plpgsql security definer set search_path=public as $immutable$
declare s jsonb;
begin
 if tg_op in ('DELETE','TRUNCATE') or tg_table_name='finance_vp_revenue_distribution_audit'
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if tg_op='INSERT' then
  if new.status<>'draft' or new.version<>1 then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
  perform public.vp_received_lock(new.payment_id,new.direct_money_receipt_id);
  s:=public.vp_received_source(new.payment_id,new.direct_money_receipt_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  return new;
 end if;
 if old.status='superseded' or new.id<>old.id or new.payment_id is distinct from old.payment_id or new.direct_money_receipt_id is distinct from old.direct_money_receipt_id or new.revision<>old.revision
   or new.previous_id is distinct from old.previous_id or new.created_at<>old.created_at or new.created_by<>old.created_by
   or new.version<>old.version+1 or new.updated_at<old.updated_at
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not ((old.status='draft' and new.status in ('draft','reviewed','superseded'))
   or (old.status='reviewed' and new.status in ('finalized','superseded'))
   or (old.status='finalized' and new.status='superseded')) then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if (old.status<>'draft' or new.status<>'draft') and (new.source_snapshot_json is distinct from old.source_snapshot_json
   or new.money_allocation_id is distinct from old.money_allocation_id or new.decisions_json is distinct from old.decisions_json or new.note<>old.note)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='draft' and new.status='reviewed') and (new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 if not (old.status='reviewed' and new.status='finalized') and (new.finalized_at is distinct from old.finalized_at or new.finalized_by is distinct from old.finalized_by)
 then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.vp_received_lock(new.payment_id,new.direct_money_receipt_id);
 if new.status<>'superseded' then
  s:=public.vp_received_source(new.payment_id,new.direct_money_receipt_id);
  if new.source_snapshot_json is distinct from s or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 end if;
 return new;
end;
$immutable$;

create or replace function public.vp_distribution_validate()
returns trigger language plpgsql security definer set search_path=public as $validate$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; actor uuid; evidence jsonb; event_version integer;
begin
 if tg_table_name='finance_vp_revenue_distribution_audit' then
  select * into a from public.finance_vp_revenue_distributions where id=new.distribution_id;
  event_version:=(new.evidence_json->>'version')::integer;
  if a.id is null or new.evidence_json->>'id' is distinct from a.id::text
    or new.evidence_json->>'payment_id' is distinct from a.payment_id::text
    or new.evidence_json->>'direct_money_receipt_id' is distinct from a.direct_money_receipt_id::text
    or new.evidence_json->>'revision' is distinct from a.revision::text
    or event_version>a.version
    or (event_version=a.version and new.evidence_json is distinct from to_jsonb(a))
    or (event_version>1 and not exists(select 1 from public.finance_vp_revenue_distribution_audit e
      where e.distribution_id=a.id and (e.evidence_json->>'version')::integer=event_version-1))
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  evidence:=new.evidence_json;
  ev:=case when event_version=1 then 'created' when evidence->>'status'='draft' then 'saved' else evidence->>'status' end;
  actor:=case ev when 'created' then (evidence->>'created_by')::uuid when 'reviewed' then (evidence->>'reviewed_by')::uuid
   when 'finalized' then (evidence->>'finalized_by')::uuid when 'superseded' then (evidence->>'superseded_by')::uuid else new.actor_id end;
  if new.event_type is distinct from ev or new.actor_id is distinct from actor
    or new.created_at is distinct from (evidence->>'updated_at')::timestamptz
  then raise exception 'VP_DISTRIBUTION_AUDIT_INVALID'; end if;
  return null;
 end if;
 select * into a from public.finance_vp_revenue_distributions where id=new.id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
 perform public.vp_received_lock(a.payment_id,a.direct_money_receipt_id);
 if new.source_snapshot_json is distinct from public.vp_received_frozen(new.source_snapshot_json)
   or new.source_snapshot_json->'blockers' is distinct from '[]'::jsonb
   or new.source_snapshot_json#>>'{money_source,payment,id}' is distinct from new.payment_id::text
   or new.source_snapshot_json#>>'{received_money_source,source_id}' is distinct from new.direct_money_receipt_id::text
   or new.source_snapshot_json#>>'{money_allocation,id}' is distinct from new.money_allocation_id::text
   or (new.money_allocation_id is not null and not exists(select 1 from public.finance_payment_money_allocations m
     where m.id=new.money_allocation_id and m.payment_id=new.payment_id))
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if new.decisions_json is distinct from public.vp_distribution_choices(new.source_snapshot_json,new.decisions_json,
     new.reviewed_at is not null) then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if new.previous_id is not null and not exists(select 1 from public.finance_vp_revenue_distributions p
   where p.id=new.previous_id and p.payment_id is not distinct from new.payment_id and p.direct_money_receipt_id is not distinct from new.direct_money_receipt_id and p.revision=new.revision-1 and p.status='superseded')
 then raise exception 'VP_DISTRIBUTION_REVISION_INVALID'; end if;
 -- Check every captured NEW version, not only the last row visible at commit.
 ev:=case when tg_op='INSERT' then 'created' when new.status='draft' then 'saved' else new.status end;
 if not exists(select 1 from public.finance_vp_revenue_distribution_audit e
   where e.distribution_id=new.id and e.event_type=ev and e.evidence_json=to_jsonb(new))
 then raise exception 'VP_DISTRIBUTION_AUDIT_REQUIRED'; end if;
 -- Drafts may subsequently become stale; protected states never may.
 if a.status in ('reviewed','finalized') then
  s:=public.vp_received_source(a.payment_id,a.direct_money_receipt_id);
  if s is distinct from a.source_snapshot_json or s->'blockers' is distinct from '[]'::jsonb
  then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
 end if;
 return null;
end;
$validate$;

create or replace function public.transition_finance_vp_distribution(p_id uuid,p_expected_version integer,p_source jsonb,p_action text,p_acknowledged boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $transition$
declare a public.finance_vp_revenue_distributions%rowtype; s jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true then raise exception 'VP_DISTRIBUTION_ACK_REQUIRED'; end if;
 if p_action is null or p_action not in ('review','finalize','supersede') then raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 if p_expected_version is null or p_expected_version<1 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 select * into a from public.finance_vp_revenue_distributions where id=p_id;
 if a.id is null then raise exception 'VP_DISTRIBUTION_MISSING'; end if;
 perform public.vp_received_lock(a.payment_id,a.direct_money_receipt_id);
 select * into a from public.finance_vp_revenue_distributions where id=p_id for update;
 if p_action='supersede' then
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'VP_DISTRIBUTION_REASON_REQUIRED'; end if;
  -- Retirement must remain possible when the live source is stale or unreadable.
  if a.status='superseded' and a.version=p_expected_version+1 and a.supersede_reason=btrim(p_reason) then return a.id; end if;
 else
  s:=public.vp_received_source(a.payment_id,a.direct_money_receipt_id);
  if s is distinct from p_source or s is distinct from a.source_snapshot_json then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
  if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
  perform public.vp_distribution_choices(s,a.decisions_json,true);
  if a.version=p_expected_version+1 and ((p_action='review' and a.status='reviewed') or (p_action='finalize' and a.status='finalized')) then return a.id; end if;
 end if;
 if a.version is distinct from p_expected_version then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if p_action='supersede' and a.status<>'superseded' then
  update public.finance_vp_revenue_distributions set status='superseded',version=version+1,updated_at=ts,
   superseded_at=ts,superseded_by=auth.uid(),supersede_reason=btrim(p_reason) where id=a.id returning * into a; ev:='superseded';
 elsif p_action='review' and a.status='draft' then
  update public.finance_vp_revenue_distributions set status='reviewed',version=version+1,updated_at=ts,
   reviewed_at=ts,reviewed_by=auth.uid() where id=a.id returning * into a; ev:='reviewed';
 elsif p_action='finalize' and a.status='reviewed' then
  update public.finance_vp_revenue_distributions set status='finalized',version=version+1,updated_at=ts,
   finalized_at=ts,finalized_by=auth.uid() where id=a.id returning * into a; ev:='finalized';
 else raise exception 'VP_DISTRIBUTION_TRANSITION_INVALID'; end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$transition$;

create or replace function public.save_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language plpgsql security definer set search_path=public as $save$
declare a public.finance_vp_revenue_distributions%rowtype; prev public.finance_vp_revenue_distributions%rowtype;
 s jsonb; c jsonb; ev text; ts timestamptz;
begin
 if not public.money_allocation_admin() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if (p_expected_id is null)<>(p_expected_version is null) or (p_expected_version is not null and p_expected_version<1)
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 perform public.vp_received_lock(p_payment_id,p_direct_id); s:=public.vp_received_source(p_payment_id,p_direct_id);
 if s is distinct from p_source then raise exception 'VP_DISTRIBUTION_SOURCE_CHANGED'; end if;
 if s->'blockers' is distinct from '[]'::jsonb or jsonb_array_length(s->'lines')=0 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 if p_note is null or length(p_note)>2000 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 c:=public.vp_distribution_choices(s,p_choices,false);
 select * into a from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded' for update;
 if a.id is null then
  select * into prev from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id order by revision desc limit 1;
 elsif a.previous_id is not null then
  select * into prev from public.finance_vp_revenue_distributions where id=a.previous_id;
 end if;
 -- Only an identical current operation or its immediate retry is idempotent.
 if a.id is not null and a.status='draft' and a.source_snapshot_json=s and a.decisions_json=c and a.note=btrim(p_note)
   and ((p_expected_id=a.id and p_expected_version in (a.version,a.version-1))
     or (a.version=1 and a.created_by=auth.uid() and (
       (a.revision=1 and a.previous_id is null and p_expected_id is null and p_expected_version is null)
       or (a.previous_id=p_expected_id and prev.id=a.previous_id and prev.version=p_expected_version and prev.status='superseded')))) then return a.id; end if;
 if (a.id is not null and (a.id is distinct from p_expected_id or a.version is distinct from p_expected_version))
   or (a.id is null and (prev.id is distinct from p_expected_id or (prev.id is not null and prev.version is distinct from p_expected_version)))
 then raise exception 'VP_DISTRIBUTION_STALE'; end if;
 ts:=clock_timestamp();
 if a.id is null then
  insert into public.finance_vp_revenue_distributions(payment_id,direct_money_receipt_id,money_allocation_id,revision,previous_id,source_snapshot_json,decisions_json,note,created_at,created_by,updated_at)
  values(p_payment_id,p_direct_id,(s#>>'{money_allocation,id}')::uuid,coalesce(prev.revision,0)+1,prev.id,s,c,btrim(p_note),ts,auth.uid(),ts)
  returning * into a; ev:='created';
 else
  if a.status<>'draft' then raise exception 'VP_DISTRIBUTION_HISTORY_IMMUTABLE'; end if;
  update public.finance_vp_revenue_distributions set money_allocation_id=(s#>>'{money_allocation,id}')::uuid,
   source_snapshot_json=s,decisions_json=c,note=btrim(p_note),version=version+1,updated_at=ts where id=a.id returning * into a; ev:='saved';
 end if;
 insert into public.finance_vp_revenue_distribution_audit(distribution_id,event_type,actor_id,created_at,evidence_json)
 values(a.id,ev,auth.uid(),ts,to_jsonb(a));
 return a.id;
end;
$save$;

create or replace function public.save_finance_vp_distribution(p_payment_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(p_payment_id,null,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;
create function public.save_finance_direct_vp_distribution(p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(null,p_direct_id,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;

create or replace function public.get_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $context$
declare s jsonb; a public.finance_vp_revenue_distributions%rowtype;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 s:=public.vp_received_source(p_payment_id,p_direct_id);
 select * into a from public.finance_vp_revenue_distributions where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id and status<>'superseded';
 return jsonb_build_object('source',s,'current',case when a.id is null then null else to_jsonb(a) end,
  'source_current',coalesce(a.id is not null and s=a.source_snapshot_json and s->'blockers'='[]'::jsonb,false),
  'can_manage',public.money_allocation_admin(),'posting_enabled',false,
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.revision desc),'[]') from public.finance_vp_revenue_distributions h where h.payment_id is not distinct from p_payment_id and h.direct_money_receipt_id is not distinct from p_direct_id),
  'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by h.revision,(e.evidence_json->>'version')::integer,e.id),'[]')
   from public.finance_vp_revenue_distribution_audit e join public.finance_vp_revenue_distributions h on h.id=e.distribution_id where h.payment_id is not distinct from p_payment_id and h.direct_money_receipt_id is not distinct from p_direct_id));
end;
$context$;

create or replace function public.get_finance_vp_distribution(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path=public as $get$
 select public.get_finance_vp_received_distribution(p_payment_id,null);
$get$;

create or replace function public.get_finance_direct_vp_formula_context(p_direct_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $get$
declare context jsonb; people jsonb:='[]';
begin
 context:=public.get_finance_vp_received_distribution(null,p_direct_id);
 if public.money_allocation_admin() then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(btrim(staff_name),''),nullif(btrim(full_name),''),nullif(btrim(email),''),id::text)) order by id),'[]')
   into people from public.user_profiles where active is true;
 end if;
 return context||jsonb_build_object('formula_schema_version',1,'formula_catalog',public.vp_compensation_formula_catalog(),'formula_people',people);
end;
$get$;

create or replace function public.finance_payment_wht_review_v2(p_snapshot jsonb,p_choices jsonb)
returns jsonb language plpgsql immutable set search_path=public
as $review$
declare lines jsonb; basis jsonb; choice jsonb; rate numeric; amount numeric; result jsonb:='[]';
begin
  lines:=public.finance_invoice_wht_lines_v2(p_snapshot);
  if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'WHT_LINE_CHOICES_REQUIRED'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c where jsonb_typeof(c) is distinct from 'object')
  then raise exception 'WHT_LINE_CHOICE_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c, jsonb_object_keys(c) k
    where k not in ('invoice_item_id','applicability','rate_percent'))
  then raise exception 'WHT_LINE_CHOICE_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c group by c->>'invoice_item_id' having count(*)>1)
  then raise exception 'WHT_DUPLICATE_LINE'; end if;
  if exists(select 1 from jsonb_array_elements(p_choices) c where not exists(
    select 1 from jsonb_array_elements(lines) l where l->>'invoice_item_id'=c->>'invoice_item_id'))
  then raise exception 'WHT_UNKNOWN_SOURCE_LINE'; end if;
  for basis in select l from jsonb_array_elements(lines) l order by l->>'invoice_item_id' loop
    select c into choice from jsonb_array_elements(p_choices) c where c->>'invoice_item_id'=basis->>'invoice_item_id';
    if choice is null or (choice->>'applicability') is null or choice->>'applicability' not in ('applies','does_not_apply')
    then raise exception 'WHT_LINE_APPLICABILITY_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
    rate:=null; amount:=0;
    if choice->>'applicability'='applies' then
      if jsonb_typeof(choice->'rate_percent') is distinct from 'number'
      then raise exception 'WHT_LINE_RATE_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
      rate:=(choice->>'rate_percent')::numeric;
      if rate<=0 or rate>100 or rate<>round(rate,4)
      then raise exception 'WHT_LINE_RATE_REQUIRED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
      amount:=public.finance_structured_wht_amount((basis->>'amount_before_vat')::numeric,rate);
      if amount<=0 then raise exception 'WHT_LINE_RATE_ROUNDS_TO_ZERO' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text; end if;
    elsif choice->'rate_percent' is not null and choice->'rate_percent'<>'null'::jsonb then
      raise exception 'WHT_NON_APPLICABLE_RATE_NOT_ALLOWED' using detail=jsonb_build_object('invoice_item_id',basis->>'invoice_item_id')::text;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('invoice_id',basis->>'invoice_id','invoice_item_id',basis->>'invoice_item_id',
      'calculation_rule','line_review_full_invoice_v2','base_amount',(basis->>'amount_before_vat')::numeric,
      'rate_percent',rate,'calculated_wht_amount',amount,'basis_snapshot_json',jsonb_build_object('applicability',choice->>'applicability','basis',basis)));
  end loop;
  return result;
end;
$review$;

-- A new normalized read contract. The existing 044 evidence and Payment JSON are unchanged.
create function public.get_finance_received_money_source(p_source_type text,p_source_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $normalized$
declare s jsonb; m jsonb;
begin
 if not public.current_user_can_view_finance_payments() then raise exception 'VP_DISTRIBUTION_PERMISSION_DENIED'; end if;
 if p_source_type='direct_money_receipt' then
  s:=public.vp_received_source(null,p_source_id); return s->'received_money_source'||jsonb_build_object('blockers',s->'blockers');
 elsif p_source_type='invoice_payment' then
  s:=public.vp_distribution_source(p_source_id); m:=s->'money_source';
  return jsonb_build_object('schema_version',1,'source_type',p_source_type,'source_id',p_source_id,'source_fingerprint',md5(s::text),
   'actual_cash',m#>'{payment,cash}','wht_credit',m#>'{payment,wht}','receivable_settlement',m#>'{payment,settlement}',
   'before_vat',s#>'{totals,base}','vat',s#>'{totals,vat}','currency',m#>'{payment,currency}',
   'lines',(select coalesce(jsonb_agg(l||jsonb_build_object('source_line_id',l->'invoice_item_id')),'[]') from jsonb_array_elements(s->'lines') l),
   'evidence',s,'blockers',s->'blockers','original_leg_key','invoice_payment:'||p_source_id::text||':original');
 end if;
 raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN';
end;
$normalized$;
revoke all on function public.vp_received_line_economics(numeric,numeric,text),public.vp_direct_frozen_source(jsonb),
 public.vp_received_source(uuid,uuid),public.vp_received_frozen(jsonb),public.vp_received_lock(uuid,uuid),
 public.save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_vp_received_distribution(uuid,uuid),
 public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_direct_vp_formula_context(uuid),
 public.get_finance_received_money_source(text,uuid) from public,anon,authenticated;
grant execute on function public.save_finance_direct_vp_distribution(uuid,uuid,integer,jsonb,jsonb,text),public.get_finance_direct_vp_formula_context(uuid),
 public.get_finance_received_money_source(text,uuid) to authenticated;
