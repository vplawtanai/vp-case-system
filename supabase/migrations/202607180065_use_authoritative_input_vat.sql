-- CANDIDATE 065: authoritative Input VAT; manual Production gate required.
-- No historical row updates/backfill. Existing source/review/fact revisions remain immutable.
-- No money, WHT, deadline, tax-period mapping, table, policy or role changes.

-- A missing review is not evidence of VAT. Only explicit VAT evidence can be ambiguous.
create function public.tax_expense_input_vat_status(p_id uuid)
returns text language sql stable security definer set search_path=public as $fn$
 select case
  when e.status<>'accepted' or r.vat_state='none' or r.vat_amount=0 then 'none'
  when r.vat_state='exists' and r.vat_base is not null and r.vat_amount>0 then
   case when r.eligibility='ineligible' then 'ineligible' else 'eligible' end
  when r.vat_state='pending' or e.vat_awareness='yes' then 'pending'
  else 'none' end
 from public.finance_expenses e left join lateral
  (select * from public.finance_expense_tax_reviews where expense_id=e.id order by revision desc limit 1) r on true
 where e.id=p_id;
$fn$;

create or replace function public.tax_position_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare s jsonb;e public.finance_expenses%rowtype;r public.finance_expense_tax_reviews%rowtype;
 d public.finance_external_input_vat%rowtype;x public.finance_external_input_vat_reviews%rowtype;lines jsonb:='[]';
begin
 if p_type='expense' then
  s:=public.tax_position_source_before_external_input(p_type,p_id);
  -- Preserve already-reviewed projections byte-for-byte (including their fingerprints).
  if public.tax_expense_input_vat_status(p_id)='eligible' and s->'lines'='[]'::jsonb then
   select * into strict e from public.finance_expenses where id=p_id;
   select * into strict r from public.finance_expense_tax_reviews where expense_id=p_id order by revision desc limit 1;
   s:=s||jsonb_build_object('effective_on',coalesce(r.tax_document_date,e.expense_date),'lines',
    jsonb_build_array(jsonb_build_object('line_id',e.id,'kind','input_vat','base',r.vat_base,'rate',r.vat_rate,'tax',r.vat_amount,
     'treatment','authoritative_source','date_basis','reviewed_expense_document','evidence',to_jsonb(r))));
  end if;
  return s;
 end if;
 if p_type<>'external_input_vat' then return public.tax_position_source_before_external_input(p_type,p_id); end if;
 select * into strict d from public.finance_external_input_vat where id=p_id;
 select * into x from public.finance_external_input_vat_reviews previous_review where evidence_id=p_id
  and not exists(select 1 from public.finance_external_input_vat_reviews n where n.previous_id=previous_review.id);
 -- Saving acknowledged external evidence establishes VAT. A later explicit exception wins.
 if x.id is null or x.status='eligible' then
  lines:=jsonb_build_array(jsonb_build_object('line_id',d.id,'kind','input_vat','base',d.tax_base,'rate',null,'tax',d.vat_amount,
   'treatment',case when x.id is null then 'authoritative_source' else 'reviewed_eligible' end,
   'date_basis','reviewed_external_document','evidence',case when x.id is null then to_jsonb(d) else to_jsonb(x) end));
 end if;
 return jsonb_build_object('source_type',p_type,'source_id',d.id,'active',true,'reference',d.invoice_number,
  'effective_on',d.invoice_date,'currency','THB','payer',jsonb_build_object('name',d.vendor),'lines',lines,'warnings','[]'::jsonb,
  'source_evidence',jsonb_build_object('document',to_jsonb(d),'review',to_jsonb(x)));
end;
$fn$;

create or replace function public.save_finance_external_input_vat(p_id uuid,p_input jsonb,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare old public.finance_external_input_vat%rowtype;
begin
 if public.tax_position_can_manage() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 if p_acknowledged is distinct from true or p_id is null or jsonb_typeof(p_input) is distinct from 'object'
  or p_input->>'funding_source' is distinct from 'third_party_no_reimbursement'
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('vendor','invoice_date','invoice_number','tax_base','vat_amount','note','funding_source'))
  or (p_input->>'tax_base')::numeric<>round((p_input->>'tax_base')::numeric,2)
  or (p_input->>'vat_amount')::numeric<>round((p_input->>'vat_amount')::numeric,2)
  then raise exception 'TAX_POSITION_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(500050);
 select * into old from public.finance_external_input_vat where id=p_id;
 if found then
  if old.input_json is distinct from p_input then raise exception 'TAX_POSITION_IDEMPOTENCY_CONFLICT'; end if;
  return p_id;
 end if;
 insert into public.finance_external_input_vat(id,vendor,invoice_date,invoice_number,tax_base,vat_amount,note,created_by,input_json)
 values(p_id,btrim(p_input->>'vendor'),(p_input->>'invoice_date')::date,btrim(p_input->>'invoice_number'),
  (p_input->>'tax_base')::numeric,(p_input->>'vat_amount')::numeric,btrim(p_input->>'note'),auth.uid(),p_input);
 perform public.tax_position_sync('external_input_vat',p_id,'Acknowledged external Input VAT evidence');
 return p_id;
end;
$fn$;

-- One read model shared by the queue and monthly facts; no source writes on read.
create function public.tax_input_vat_evidence(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if p_month is null or extract(day from p_month)<>1 then raise exception 'TAX_POSITION_INPUT_INVALID'; end if;
 return jsonb_build_object('external',
  (select coalesce(jsonb_agg(to_jsonb(e)-'input_json'||jsonb_build_object('status',coalesce(r.status,'eligible'),'review',to_jsonb(r)) order by e.invoice_date,e.id),'[]')
   from public.finance_external_input_vat e left join lateral
    (select * from public.finance_external_input_vat_reviews x where x.evidence_id=e.id
     and not exists(select 1 from public.finance_external_input_vat_reviews n where n.previous_id=x.id)) r on true
   where e.invoice_date>=p_month and e.invoice_date<p_month+interval '1 month'),
  'expenses',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'origin',e.origin,'vendor',e.vendor_name,'reference',r.tax_document_reference,
   'invoice_date',coalesce(r.tax_document_date,e.expense_date),'tax_base',r.vat_base,'vat_amount',r.vat_amount,'status',public.tax_expense_input_vat_status(e.id)) order by e.id),'[]')
   from public.finance_expenses e left join lateral
    (select * from public.finance_expense_tax_reviews x where x.expense_id=e.id order by revision desc limit 1) r on true
   where e.status='accepted' and coalesce(r.tax_document_date,e.expense_date)>=p_month
    and coalesce(r.tax_document_date,e.expense_date)<p_month+interval '1 month' and public.tax_expense_input_vat_status(e.id)<>'none'));
end;
$fn$;
create or replace function public.get_finance_tax_input_evidence(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
begin
 if public.tax_position_can_view() is distinct from true then raise exception 'TAX_POSITION_PERMISSION_DENIED'; end if;
 return public.tax_input_vat_evidence(p_month)||jsonb_build_object('can_manage',public.tax_position_can_manage());
end;
$fn$;

create or replace function public.tax_filing_monthly_facts(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare result jsonb; inputs jsonb; r record; s jsonb; total numeric:=0; known jsonb:='[]'; unresolved jsonb:='[]';
begin
 -- Existing Output VAT derivation and dates are unchanged.
 result:=public.tax_filing_monthly_facts_before_expense(p_month);
 inputs:=public.tax_input_vat_evidence(p_month);
 for r in select 'expense'::text as kind,value as item from jsonb_array_elements(inputs->'expenses')
  union all select 'external_input_vat',value from jsonb_array_elements(inputs->'external')
 loop
  if r.item->>'status'='pending' then
   unresolved:=unresolved||jsonb_build_array(jsonb_build_object('source_type',r.kind,'source_id',r.item->'id'));
  elsif r.item->>'status'='eligible' then
   -- Pure source projection also corrects previously unmaterialized records on read.
   -- The same projection is used by the append-only tax ledger; never sum both.
   s:=public.tax_position_source(r.kind,(r.item->>'id')::uuid);
   if (s->>'active')::boolean is distinct from true or s->>'currency'<>'THB' or jsonb_array_length(s->'lines')<>1
    or (s->>'effective_on')::date<p_month or (s->>'effective_on')::date>=p_month+interval '1 month'
    then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
   total:=total+(s#>>'{lines,0,tax}')::numeric;
   known:=known||jsonb_build_array(jsonb_build_object('source_type',r.kind,'source_id',r.item->'id',
    'amount',s#>'{lines,0,tax}','source_fingerprint',md5(s::text),'source',s));
  end if;
 end loop;
 return result||jsonb_build_object('input_contract','authoritative_input_v1','reviewed_input_vat',total,'reviewed_input_sources',known,
  'input_sources',known,'unresolved_input_sources',unresolved,'input_vat',total,'input_vat_complete',unresolved='[]'::jsonb,
  'net_vat',case when unresolved='[]'::jsonb then (result->>'output_vat')::numeric-total else null end);
end;
$fn$;

create or replace function public.tax_filing_pool(p_month date,p_type text)
returns jsonb language plpgsql stable security definer set search_path=public as $pool$
declare coverage jsonb; monthly jsonb; issues jsonb;
begin
 coverage:=public.tax_filing_allocation_pool_v1(p_month,p_type);
 if p_type<>'vat' then return coverage; end if;
 monthly:=public.tax_filing_monthly_facts(p_month);
 -- Replace only the old unconditional Input VAT placeholder; retain every other issue.
 select coalesce(jsonb_agg(x),'[]') into issues from jsonb_array_elements(coverage->'issues') x where x->>'code'<>'input_vat_incomplete';
 issues:=issues||(monthly->'issues');
 if (monthly->>'input_vat_complete')::boolean is not true then
  issues:=issues||jsonb_build_array(jsonb_build_object('code','input_vat_incomplete','count',jsonb_array_length(monthly->'unresolved_input_sources')));
 end if;
 return jsonb_build_object('schema_version',2,'period_month',p_month,'filing_type',p_type,'currency','THB',
  'monthly_facts',monthly,'allocation_coverage',jsonb_build_object('base_amount',coverage->'base_amount',
   'output_vat',coverage->'output_vat','source_count',coverage->'source_count','sources',coverage->'sources'),
  -- Signed net remains in monthly_facts. Existing remittance amount is nonnegative.
  -- An excess credit creates neither a payout nor an automatic refund/carry-forward.
  'tax_amount',case when monthly->'net_vat'<>'null'::jsonb then greatest((monthly->>'net_vat')::numeric,0) else null end,
  'ready',issues='[]'::jsonb and monthly->'net_vat'<>'null'::jsonb,'issues',issues);
end;
$pool$;

create or replace function public.tax_filing_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $assert$
declare f public.finance_tax_filings%rowtype; actual jsonb; coverage jsonb; monthly jsonb; output_total numeric; input_total numeric; expected_net numeric;
begin
 select * into strict f from public.finance_tax_filings where id=p_id;
 if f.source_snapshot_json->>'schema_version'='2' then
  coverage:=f.source_snapshot_json->'allocation_coverage'; monthly:=f.source_snapshot_json->'monthly_facts';
  if f.filing_type<>'vat' or jsonb_typeof(coverage) is distinct from 'object' or jsonb_typeof(monthly) is distinct from 'object'
   or jsonb_typeof(monthly->'source_evidence') is distinct from 'array'
   or jsonb_typeof(coverage->'sources') is distinct from 'array'
   or f.source_snapshot_json ?| array['output_vat','base_amount','source_count','sources']
   or monthly->>'source_contract' is distinct from 'tax_position_source_v1'
   or jsonb_typeof(monthly->'output_vat') is null or jsonb_typeof(monthly->'output_vat') not in ('number','null')
   then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
  if monthly->>'input_contract'='authoritative_input_v1' then
   if jsonb_typeof(monthly->'input_sources') is distinct from 'array'
    or jsonb_typeof(monthly->'unresolved_input_sources') is distinct from 'array'
    or jsonb_typeof(monthly->'input_vat') is distinct from 'number'
    or monthly->'input_vat_complete' is distinct from to_jsonb(monthly->'unresolved_input_sources'='[]'::jsonb)
    or (monthly->>'input_vat_complete')::boolean=(f.source_snapshot_json->'issues' @> '[{"code":"input_vat_incomplete"}]'::jsonb)
    then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
   if exists(select 1 from jsonb_array_elements(monthly->'input_sources') e where
    e->>'source_fingerprint' is distinct from md5((e->'source')::text)
    or e->>'source_type' not in ('expense','external_input_vat')
    or e->>'source_id' is distinct from e#>>'{source,source_id}'
    or e->>'source_type' is distinct from e#>>'{source,source_type}'
    or e#>'{source,active}' is distinct from 'true'::jsonb or e#>>'{source,currency}' is distinct from 'THB'
    or date_trunc('month',(e#>>'{source,effective_on}')::date)::date is distinct from f.period_month
    or jsonb_array_length(e#>'{source,lines}') is distinct from 1
    or e#>>'{source,lines,0,kind}' is distinct from 'input_vat'
    or e#>>'{source,lines,0,line_id}' is distinct from e->>'source_id'
    or jsonb_typeof(e#>'{source,lines,0,tax}') is distinct from 'number'
    or (e#>>'{source,lines,0,tax}')::numeric<=0
    or e->'amount' is distinct from e#>'{source,lines,0,tax}')
    or exists(select 1 from jsonb_array_elements(monthly->'input_sources') e group by e->>'source_type',e->>'source_id' having count(*)>1)
    then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
   select coalesce(sum((e->>'amount')::numeric),0) into input_total from jsonb_array_elements(monthly->'input_sources') e;
   expected_net:=case when (monthly->>'input_vat_complete')::boolean then (monthly->>'output_vat')::numeric-input_total end;
   if (monthly->>'input_vat')::numeric is distinct from input_total or (monthly->>'reviewed_input_vat')::numeric is distinct from input_total
    or (monthly->>'net_vat')::numeric is distinct from expected_net
    or f.tax_amount is distinct from (case when expected_net is null then null else greatest(expected_net,0) end)
    or f.source_snapshot_json->'ready' is distinct from to_jsonb(f.source_snapshot_json->'issues'='[]'::jsonb and expected_net is not null)
    then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
  else
   -- Every previously frozen 052/053/055/064 filing retains its original contract.
   if monthly ? 'input_contract' or monthly->'input_vat_complete' is distinct from 'false'::jsonb
    or monthly->'input_vat' is distinct from 'null'::jsonb or monthly->'net_vat' is distinct from 'null'::jsonb
    or f.tax_amount is not null or f.source_snapshot_json->'ready' is distinct from 'false'::jsonb
    or not (f.source_snapshot_json->'issues' @> '[{"code":"input_vat_incomplete"}]'::jsonb)
    then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
  end if;
  select coalesce(sum((l->>'tax')::numeric),0) into output_total
   from jsonb_array_elements(monthly->'source_evidence') e cross join lateral jsonb_array_elements(e->'lines') l;
  if monthly->'output_vat'<>'null'::jsonb and (monthly->>'output_vat')::numeric is distinct from output_total
   then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
 elsif f.source_snapshot_json->>'schema_version'='1' then coverage:=f.source_snapshot_json;
 else raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
 select coalesce(jsonb_agg(evidence_json order by evidence_json->>'id'),'[]') into actual from public.finance_tax_filing_allocations where filing_id=p_id;
 if actual is distinct from coverage->'sources' or f.source_fingerprint<>md5(f.source_snapshot_json::text)
  or f.base_amount is distinct from (coverage->>'base_amount')::numeric or f.tax_amount is distinct from (f.source_snapshot_json->>'tax_amount')::numeric
  or (coverage->>'source_count')::integer is distinct from jsonb_array_length(actual)
  or f.period_month::text is distinct from f.source_snapshot_json->>'period_month' or f.filing_type is distinct from f.source_snapshot_json->>'filing_type'
  or (f.status in ('ready_for_review','filed') and (f.source_snapshot_json->>'ready')::boolean is distinct from true)
  or not exists(select 1 from public.finance_tax_filing_audit where filing_id=p_id and version=f.version
   and event_type=case when f.status='draft' then 'created' else f.status end and evidence_json=to_jsonb(f))
 then raise exception 'TAX_FILING_INTEGRITY'; end if;
 if f.status='filed' and f.filed_snapshot_json is distinct from jsonb_build_object('source',f.source_snapshot_json,'due_date',f.due_date,
  'due_date_evidence',f.due_date_evidence,'external_reference',f.external_reference,'filing_evidence',f.filing_evidence,'filed_on',f.filed_on)
 then raise exception 'TAX_FILING_INTEGRITY'; end if;
 if exists(select 1 from public.finance_tax_filing_allocations a where a.filing_id=p_id and
  (a.economic_key is distinct from a.evidence_json->>'economic_key' or a.source_fingerprint is distinct from a.evidence_json->>'fingerprint'
   or a.tax_fact_id is distinct from (a.evidence_json->>'tax_fact_id')::uuid or a.outgoing_wht_id is distinct from (a.evidence_json->>'outgoing_wht_id')::uuid
   or (a.tax_fact_id is not null and not exists(select 1 from public.finance_tax_position_facts s join public.finance_tax_source_revisions v on v.id=s.revision_id
    where s.id=a.tax_fact_id and s.tax_kind='output_vat' and s.period_month=f.period_month and f.filing_type='vat' and to_jsonb(s)=a.evidence_json->'evidence' and v.fingerprint=a.source_fingerprint))
   or (a.outgoing_wht_id is not null and not exists(select 1 from public.finance_outgoing_wht_obligations w join public.finance_payouts p on p.id=w.payout_source_id
    where w.id=a.outgoing_wht_id and p.status='confirmed' and w.period_month=f.period_month and to_jsonb(w)=a.evidence_json->'evidence'
     and w.source_fingerprint=a.source_fingerprint and w.payee_json->>'entity_type'=case f.filing_type when 'wht_natural' then 'natural_person' when 'wht_juristic' then 'juristic_person' end))))
 then raise exception 'TAX_FILING_SOURCE_INTEGRITY'; end if;
 if f.status<>'cancelled' and exists(select 1 from public.finance_tax_filing_allocations a join public.finance_tax_filing_allocations b on b.economic_key=a.economic_key and b.filing_id<>a.filing_id
  join public.finance_tax_filings other on other.id=b.filing_id where a.filing_id=p_id and other.status<>'cancelled') then raise exception 'TAX_FILING_DUPLICATE_COVERAGE'; end if;
end;
$assert$;

-- Existing CREATE OR REPLACE functions retain their owners/ACLs. Pin new private helpers
-- explicitly: no reliance on Supabase creator/default privileges, no client execution.
alter function public.tax_expense_input_vat_status(uuid) owner to postgres;
alter function public.tax_input_vat_evidence(date) owner to postgres;
revoke all on function public.tax_expense_input_vat_status(uuid),public.tax_input_vat_evidence(date) from public,anon,authenticated,service_role;
grant execute on function public.tax_expense_input_vat_status(uuid),public.tax_input_vat_evidence(date) to service_role;
