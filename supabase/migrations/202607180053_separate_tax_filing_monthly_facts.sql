-- CANDIDATE 053 ONLY. No backfill, source materialization or business-row writes.
-- 052 remains applied and byte-identical. WHT/remittance contracts are unchanged.

create function public.tax_filing_monthly_facts(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $monthly$
declare r record; s jsonb; lines jsonb; l jsonb; evidence jsonb:='[]'; issues jsonb:='[]';
 total numeric:=0; unknown_output boolean:=false;
begin
 if p_month is null or extract(day from p_month)<>1 then raise exception 'TAX_FILING_INPUT_INVALID'; end if;
 -- Same source priority/month/status rules as dashboard-data.ts. The existing
 -- pure 050 projection supplies stored VAT and signed corrections, not new math.
 for r in
  select 'direct_money_receipt'::text as source_type,id as source_id from public.finance_direct_money_receipts
   where status='confirmed' and currency='THB' and received_on>=p_month and received_on<p_month+interval '1 month'
  union all
  select 'tax_invoice',t.id from public.finance_tax_invoices t
   where t.status='issued' and exists(select 1 from public.finance_tax_point_events p where p.tax_invoice_id=t.id
    and p.approved_at is not null and p.occurred_on>=p_month and p.occurred_on<p_month+interval '1 month')
  union all
  select 'tax_correction',id from public.finance_tax_document_corrections
   where status='issued' and correction_mode in ('credit_note','debit_note')
    and adjustment_date>=p_month and adjustment_date<p_month+interval '1 month'
  order by source_type,source_id
 loop
  s:=public.tax_position_source(r.source_type,r.source_id);
  select coalesce(jsonb_agg(x order by x->>'line_id'),'[]') into lines
   from jsonb_array_elements(s->'lines') x where x->>'kind'='output_vat';
  if (s->>'active')::boolean is distinct from true or s->>'currency'<>'THB'
   or (s->>'effective_on')::date<p_month or (s->>'effective_on')::date>=p_month+interval '1 month'
   then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
  if r.source_type in ('tax_invoice','tax_correction') and lines='[]'::jsonb then
   unknown_output:=true;
   issues:=issues||jsonb_build_array(jsonb_build_object('code','source_evidence_incomplete','count',1));
  end if;
  for l in select value from jsonb_array_elements(lines) loop
   if jsonb_typeof(l->'tax') is distinct from 'number' then unknown_output:=true;
   else total:=total+(l->>'tax')::numeric; end if;
  end loop;
  if s->'warnings'<>'[]'::jsonb then
   issues:=issues||jsonb_build_array(jsonb_build_object('code','source_evidence_incomplete','count',jsonb_array_length(s->'warnings')));
  end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('source_type',r.source_type,'source_id',r.source_id,
   'effective_on',s->'effective_on','reference',s->'reference','source_fingerprint',md5(s::text),'lines',lines));
 end loop;
 return jsonb_build_object('output_vat',case when unknown_output then null else total end,
  'input_vat',null,'input_vat_complete',false,'net_vat',null,
  'source_evidence',evidence,'issues',issues,'source_contract','tax_position_source_v1');
end;
$monthly$;

-- Preserve the exact allocated-register contract, also used by unchanged WHT.
alter function public.tax_filing_pool(date,text) rename to tax_filing_allocation_pool_v1;
create function public.tax_filing_pool(p_month date,p_type text)
returns jsonb language plpgsql stable security definer set search_path=public as $pool$
declare coverage jsonb; monthly jsonb;
begin
 coverage:=public.tax_filing_allocation_pool_v1(p_month,p_type);
 if p_type<>'vat' then return coverage; end if;
 monthly:=public.tax_filing_monthly_facts(p_month);
 return jsonb_build_object('schema_version',2,'period_month',p_month,'filing_type',p_type,'currency','THB',
  'monthly_facts',monthly,'allocation_coverage',jsonb_build_object('base_amount',coverage->'base_amount',
   'output_vat',coverage->'output_vat','source_count',coverage->'source_count','sources',coverage->'sources'),
  'tax_amount',monthly->'net_vat','ready',false,'issues',(coverage->'issues')||(monthly->'issues'));
end;
$pool$;

create or replace function public.create_finance_tax_filing(p_id uuid,p_month date,p_type text,p_expected_fingerprint text,p_due_date date,p_due_evidence text)
returns uuid language plpgsql security definer set search_path=public as $create$
declare s jsonb; coverage jsonb; f public.finance_tax_filings%rowtype; r jsonb;
begin
 if public.tax_filing_can_manage() is distinct from true then raise exception 'TAX_FILING_PERMISSION_DENIED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payout_lifecycle',0)); perform pg_advisory_xact_lock(500050); perform pg_advisory_xact_lock(500052);
 select * into f from public.finance_tax_filings where id=p_id;
 if found then
  if f.period_month is distinct from p_month or f.filing_type is distinct from p_type or f.source_fingerprint is distinct from p_expected_fingerprint
   or f.due_date is distinct from p_due_date or f.due_date_evidence is distinct from nullif(btrim(p_due_evidence),'') then raise exception 'TAX_FILING_IDEMPOTENCY_CONFLICT'; end if;
  return f.id;
 end if;
 if exists(select 1 from public.finance_tax_filings where period_month=p_month and filing_type=p_type and status<>'cancelled') then raise exception 'TAX_FILING_ALREADY_EXISTS'; end if;
 s:=public.tax_filing_pool(p_month,p_type);
 if md5(s::text) is distinct from p_expected_fingerprint then raise exception 'TAX_FILING_SOURCE_CHANGED'; end if;
 if (p_due_date is null)<>(nullif(btrim(p_due_evidence),'') is null) then raise exception 'TAX_FILING_DUE_EVIDENCE_REQUIRED'; end if;
 coverage:=case when s->>'schema_version'='2' then s->'allocation_coverage' else s end;
 insert into public.finance_tax_filings(id,period_month,filing_type,due_date,due_date_evidence,source_fingerprint,source_snapshot_json,base_amount,tax_amount,created_by)
 values(p_id,p_month,p_type,p_due_date,nullif(btrim(p_due_evidence),''),md5(s::text),s,(coverage->>'base_amount')::numeric,(s->>'tax_amount')::numeric,auth.uid());
 for r in select value from jsonb_array_elements(coverage->'sources') loop
  insert into public.finance_tax_filing_allocations(filing_id,tax_fact_id,outgoing_wht_id,economic_key,source_fingerprint,evidence_json)
  values(p_id,(r->>'tax_fact_id')::uuid,(r->>'outgoing_wht_id')::uuid,r->>'economic_key',r->>'fingerprint',r);
 end loop;
 insert into public.finance_tax_filing_audit(filing_id,event_type,version,actor_id,evidence_json)
 select id,'created',version,auth.uid(),to_jsonb(x) from public.finance_tax_filings x where id=p_id;
 return p_id;
end;
$create$;

create or replace function public.tax_filing_assert(p_id uuid)
returns void language plpgsql security definer set search_path=public as $assert$
declare f public.finance_tax_filings%rowtype; actual jsonb; coverage jsonb; monthly jsonb; output_total numeric;
begin
 select * into strict f from public.finance_tax_filings where id=p_id;
 if f.source_snapshot_json->>'schema_version'='2' then
  coverage:=f.source_snapshot_json->'allocation_coverage'; monthly:=f.source_snapshot_json->'monthly_facts';
  if f.filing_type<>'vat' or jsonb_typeof(coverage) is distinct from 'object' or jsonb_typeof(monthly) is distinct from 'object'
   or jsonb_typeof(monthly->'source_evidence') is distinct from 'array'
   or jsonb_typeof(coverage->'sources') is distinct from 'array'
   or monthly->'input_vat_complete' is distinct from 'false'::jsonb
   or monthly->'input_vat' is distinct from 'null'::jsonb or monthly->'net_vat' is distinct from 'null'::jsonb
   or f.tax_amount is not null or f.source_snapshot_json->'ready' is distinct from 'false'::jsonb
   or not (f.source_snapshot_json->'issues' @> '[{"code":"input_vat_incomplete"}]'::jsonb)
   or f.source_snapshot_json ?| array['output_vat','base_amount','source_count','sources']
   or monthly->>'source_contract' is distinct from 'tax_position_source_v1'
   or jsonb_typeof(monthly->'output_vat') is null or jsonb_typeof(monthly->'output_vat') not in ('number','null')
   then raise exception 'TAX_FILING_SNAPSHOT_CONTRACT'; end if;
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

revoke all on function public.tax_filing_monthly_facts(date),public.tax_filing_allocation_pool_v1(date,text),
 public.tax_filing_pool(date,text),public.tax_filing_assert(uuid) from public,anon,authenticated;
revoke all on function public.create_finance_tax_filing(uuid,date,text,text,date,text) from public,anon;
grant execute on function public.create_finance_tax_filing(uuid,date,text,text,date,text) to authenticated;
