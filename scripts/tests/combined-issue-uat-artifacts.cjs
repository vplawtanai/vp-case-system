/* eslint-disable @typescript-eslint/no-require-imports */
// Emits SELECT-only operator artifacts. Never connects to a database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const root=path.resolve(__dirname,'../..');
function migration(n){const dir=path.join(root,'supabase/migrations');return fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.startsWith(`2026071800${n}_`))),'utf8');}
function contracts(){
  return [
    ...['issue_finance_combined_document','generate_finance_document_no','validate_finance_combined_document',
      'protect_finance_combined_document','validate_finance_document_tax_integrity','finance_tax_invoice_issue_blockers',
      'tax_blockers_pre040','void_finance_receipt','cancel_finance_combined_document_draft',
      'issue_finance_receipt','issue_finance_tax_invoice','current_user_can_issue_combined_documents'].map(n=>[40,n,n]),
    ...['build_finance_receipt_source','document_logo_evidence','guard_receipt_logo_issue'].map(n=>[38,n,n]),
    ...['build_finance_document_tax_source','finance_tax_invoice_draft_snapshot'].map(n=>[42,n,n]),
    [40,'build_finance_document_tax_source','document_tax_source_pre042'],
    [40,'finance_tax_invoice_draft_snapshot','document_tax_snapshot_pre042'],
  ].map(([m,n,actual])=>{const fn=definition(migration(m),n),q=/\bas\s+(\$\w*\$)/i.exec(fn);
    const body=fn.slice(q.index+q[0].length,fn.lastIndexOf(q[1]));
    return `('${actual}','${crypto.createHash('md5').update(body).digest('hex')}')`;}).join(',\n    ');
}
function sql(issued){return `-- Combined VP-RTI ${issued?'post-issue verification':'pre-issue technical preflight'}: ONE SELECT-only statement, ONE row, NO RPCs.
-- Run manually with unrestricted catalog/table/Storage read access.
-- This is NOT permission to issue a fictitious tax document. Issued Combined
-- correction/void/replacement is not implemented. Keep the Production Draft.
-- Final review/delay checkboxes are RPC arguments, not persisted before Issue.
-- External absence is a human attestation, not independently provable by SQL.
-- Counters and mutable global financial counts are observability only. Compare
-- with the preflight output; a later read cannot attribute unrelated writes.
-- query_to_xml below executes only a catalog-built SELECT with escaped names.
with
k as (select ${issued} as after_issue,
  'd903b209-1e29-4a60-a453-032611a7202f'::uuid as combined_id,
  '95e22d0e-1996-4f16-98e4-218db1cbd857'::uuid as payment_id,
  'a392a5ec-cc84-4c74-bd7a-5636a984f9c6'::uuid as invoice_id,
  'c8132235-f5df-47ad-b0a8-8d60ad335bf5'::uuid as client_id,
  'VP-IV-202609-000004'::text as invoice_no,
  '2026-09-11'::date as tax_date,'2026-09-12'::date as issue_date),
s as (
  select k.*,to_jsonb(c) as c,to_jsonb(r) as r,to_jsonb(t) as t,to_jsonb(p) as p,to_jsonb(i) as i,
    to_jsonb(profile) as current_profile,to_jsonb(client) as current_client,to_jsonb(company) as current_company,
    jsonb_build_object('id',bank.id,'short_name',bank.short_name,'bank_name',bank.bank_name,
      'account_name',bank.account_name,'account_number',bank.account_number,'branch_name',to_jsonb(bank)->>'branch_name') as current_bank,
    case when k.after_issue then t.issued_snapshot_json else t.draft_snapshot_json end as ts,
    case when k.after_issue then r.issued_snapshot_json else r.draft_snapshot_json end as rs
  from k left join public.finance_combined_documents c on c.id=k.combined_id
  left join public.finance_receipts r on r.id=c.receipt_id
  left join public.finance_tax_invoices t on t.id=c.tax_invoice_id
  left join public.finance_payments p on p.id=k.payment_id
  left join public.finance_invoices i on i.id=k.invoice_id
  left join public.clients client on client.id=k.client_id
  left join public.finance_customer_tax_profiles profile on profile.client_id=k.client_id
  left join public.finance_company_profiles company on company.id='default'
  left join public.finance_bank_accounts bank on bank.id=p.receiving_bank_account_id
),
expected_functions(name,body_md5) as (values
    ${contracts()}
),
function_facts as (
  select e.name,e.body_md5 as expected_md5,count(p.oid)=1 and bool_and(md5(p.prosrc)=e.body_md5) as valid,
    jsonb_agg(md5(p.prosrc)) as actual_md5
  from expected_functions e left join pg_catalog.pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.name group by e.name,e.body_md5
),
lines as (
  select item from s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.ts->'document_lines')='array' then s.ts->'document_lines' else '[]'::jsonb end) item
),
line_facts as (
  select count(*)=3 and count(distinct item->>'id')=3
    and count(*) filter(where item @> '{"description":"ค่าแปลเอกสาร","amount_before_vat":4000,"vat_amount":280,"line_total":4280,"vat_rate":7,"resolved_vat_treatment":{"treatment":"standard_rate"}}')=1
    and count(*) filter(where item @> '{"description":"ค่าวิชาชีพทนาย งวดที่ 1","amount_before_vat":10000,"vat_amount":0,"line_total":10000,"resolved_vat_treatment":{"treatment":"outside_scope"}}')=1
    and count(*) filter(where item @> '{"description":"ค่าเดินทางไปศาล","amount_before_vat":4672.90,"vat_amount":327.10,"line_total":5000,"vat_rate":7,"resolved_vat_treatment":{"treatment":"standard_rate"}}')=1 as exact_lines,
    coalesce(jsonb_agg(item order by item->>'id'),'[]') as observed
  from lines
),
wht_facts as (
  select count(*)=3 and count(distinct w.invoice_item_id)=3
    and count(*) filter(where w.invoice_id=k.invoice_id and w.calculation_rule='line_review_full_invoice_v2'
      and w.base_amount=(l.item->>'amount_before_vat')::numeric
      and w.basis_snapshot_json->'basis' @> jsonb_build_object('invoice_id',k.invoice_id,'invoice_item_id',w.invoice_item_id,
        'currency','THB','amount_before_vat',w.base_amount,'vat_amount',l.item->'vat_amount','total_amount',l.item->'line_total',
        'vat_applicable',l.item->'vat_applicable','calculation_rule','line_review_full_invoice_v2')
      and case when l.item->>'description'='ค่าแปลเอกสาร' then
        w.base_amount=4000 and w.rate_percent=3 and w.calculated_wht_amount=120 and w.basis_snapshot_json->>'applicability'='applies'
      else w.rate_percent is null and w.calculated_wht_amount=0 and w.basis_snapshot_json->>'applicability'='does_not_apply' end)=3
    and sum(w.calculated_wht_amount)=120 as exact_components,
    coalesce(jsonb_agg(to_jsonb(w) order by w.invoice_item_id),'[]') as observed,
    coalesce(jsonb_agg(jsonb_build_object('id',w.id,'invoice_id',w.invoice_id,'invoice_item_id',w.invoice_item_id,
      'calculation_rule',w.calculation_rule,'base_amount',w.base_amount,'rate_percent',w.rate_percent,
      'calculated_wht_amount',w.calculated_wht_amount,'basis_snapshot_json',w.basis_snapshot_json) order by w.id),'[]') as frozen_components
  from k join public.finance_payment_wht_components w on w.payment_id=k.payment_id
  left join lines l on l.item->>'id'=w.invoice_item_id::text
),
tax_components as (
  select count(*)=2 and sum(a.amount_before_vat)=8672.90 and sum(a.vat_amount)=607.10 and sum(a.total_amount)=9280
    and count(*) filter(where a.source_snapshot_json=l.item and l.item #>> '{resolved_vat_treatment,treatment}'='standard_rate'
      and v.tax_invoice_id=a.tax_invoice_id and v.invoice_item_id=a.invoice_item_id
      and v.tax_point_event_id=point.id and v.status=case when s.after_issue then 'issued' else 'reserved' end
      and v.amount_before_vat=a.amount_before_vat and v.vat_amount=a.vat_amount and v.total_amount=a.total_amount
      and v.source_snapshot_json=jsonb_build_object('invoice_id',s.invoice_id,'payment_id',s.payment_id,'invoice_item',l.item,'rule','explicit_full_line_v2')
      and (select count(*) from public.finance_tax_invoice_source_coverages other where other.invoice_item_id=a.invoice_item_id and other.status in ('reserved','issued'))=1)=2 as exact_coverage,
    jsonb_agg(jsonb_build_object('item',to_jsonb(a),'coverage',to_jsonb(v))) as observed
  from s join public.finance_tax_invoice_items a on a.tax_invoice_id::text=s.t->>'id'
  left join public.finance_tax_invoice_source_coverages v on v.tax_invoice_item_id=a.id
  left join public.finance_tax_point_events point on point.tax_invoice_id=a.tax_invoice_id
  left join lines l on l.item->>'id'=a.invoice_item_id::text
),
audits as (
  select 'combined' as domain,a.event_type,a.event_payload_json as payload,a.actor_user_id,a.created_at
  from s join public.finance_combined_document_audit_events a on a.combined_document_id=s.combined_id
  union all select 'receipt',a.event_type,a.event_payload_json,a.actor_user_id,a.created_at
  from s join public.finance_receipt_audit_events a on a.receipt_id::text=s.r->>'id'
  union all select 'tax',a.event_type,a.event_payload_json,a.actor_user_id,a.created_at
  from s join public.finance_tax_invoice_audit_events a on a.tax_invoice_id::text=s.t->>'id'
),
numbering as (
  select
    (select count(*)=1 from public.document_numbering_profiles where document_type='receipt_tax_invoice'
      and display_prefix='VP-RTI' and period_scope='monthly' and sequence_width=6 and is_active) as profile_valid,
    (select coalesce(jsonb_agg(to_jsonb(n) order by n.doc_type),'[]') from public.finance_document_counters n
      where n.doc_type in ('receipt','tax_invoice','receipt_tax_invoice') and n.year=extract(year from k.issue_date) and n.month=extract(month from k.issue_date)) as period_counters,
    (select max(n.last_no) from public.finance_document_counters n where n.doc_type='receipt_tax_invoice'
      and n.year=extract(year from k.issue_date) and n.month=extract(month from k.issue_date)) as rti_last_no
  from k
),
downstream_relations as (
  select c.oid,n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m') and
    (c.relname in ('finance_cash_transactions','finance_company_ledger','finance_compensation_batches')
      or c.relname ~ '^finance_.*(revenue_allocat|compensation|ledger_postings)')
),
link_columns as (
  select distinct d.oid,a.attname::text as name from downstream_relations d join pg_catalog.pg_attribute a on a.attrelid=d.oid
  where a.attnum>0 and not a.attisdropped and (a.attname in
    ('payment_id','source_payment_id','receipt_id','source_receipt_id','tax_invoice_id','source_tax_invoice_id',
     'combined_document_id','source_combined_document_id','invoice_id','source_invoice_id','source_id','source_record_id','source_document_id','origin_id')
    or exists(select 1 from pg_catalog.pg_constraint f where f.contype='f' and f.conrelid=d.oid and a.attnum=any(f.conkey)
      and f.confrelid in ('public.finance_payments'::regclass,'public.finance_receipts'::regclass,'public.finance_tax_invoices'::regclass,
        'public.finance_combined_documents'::regclass,'public.finance_invoices'::regclass)))
),
downstream_scan as (
  select d.relname,coalesce((select array_agg(name order by name) from link_columns where oid=d.oid),array[]::text[]) as link_columns,
    query_to_xml(format($scan$
      select count(*) as rows_observed,count(*) filter(where exists(select 1 from jsonb_each_text(to_jsonb(r)) f
        where f.key=any(%L::text[]) and f.value=any(%L::text[]))) as linked_rows,
        count(*) filter(where to_jsonb(r)::text like any(%L::text[])) as uuid_mentions
      from %I.%I r
    $scan$,(select array_agg(name) from link_columns where oid=d.oid),
      array[s.payment_id::text,s.invoice_id::text,s.combined_id::text,s.r->>'id',s.t->>'id'],
      array['%'||s.payment_id::text||'%','%'||s.combined_id::text||'%','%'||(s.r->>'id')||'%','%'||(s.t->>'id')||'%'],d.nspname,d.relname),false,false,'') as result
  from downstream_relations d cross join s
),
downstream as (
  select relname,link_columns,((xpath('/table/row/rows_observed/text()',result))[1]::text)::bigint as rows_observed,
    ((xpath('/table/row/linked_rows/text()',result))[1]::text)::bigint as linked_rows,
    ((xpath('/table/row/uuid_mentions/text()',result))[1]::text)::bigint as uuid_mentions
  from downstream_scan
),
checks as (
  select
    s.c->>'id'=s.combined_id::text and s.c->>'status'=case when s.after_issue then 'issued' else 'draft' end as target_lifecycle,
    s.c->>'payment_id'=s.payment_id::text and s.r->>'payment_id'=s.payment_id::text and s.t->>'payment_id'=s.payment_id::text
      and s.t->>'invoice_id'=s.invoice_id::text and s.r->>'client_id'=s.client_id::text and s.t->>'client_id'=s.client_id::text
      and s.r->>'combined_document_id'=s.combined_id::text and s.t->>'combined_document_id'=s.combined_id::text
      and s.r->>'status'=s.c->>'status' and s.t->>'status'=s.c->>'status' as paired_child_links_and_states,
    s.p @> jsonb_build_object('id',s.payment_id,'client_id',s.client_id,'status','confirmed','currency','THB','received_on',s.tax_date,
      'cash_amount',19160,'wht_amount',120,'settlement_amount',19280,'wht_calculation_mode','line_review',
      'cancelled_at',null,'reversed_at',null) and s.p->>'confirmed_at' is not null as payment_unchanged,
    s.i @> jsonb_build_object('id',s.invoice_id,'client_id',s.client_id,'invoice_no',s.invoice_no,'document_status','issued','source_model','billable_charge_v2',
      'currency','THB','amount_before_vat',18672.90,'vat_amount',607.10,'total_amount',19280,'cancelled_at',null,'voided_at',null) as invoice_unchanged,
    (select count(*)=1 and count(*) filter(where invoice_id=s.invoice_id and effective_cash_allocated=19160
      and effective_wht_credit_allocated=120 and effective_settlement_total=19280)=1
      from public.finance_payment_effective_invoice_allocations where payment_id=s.payment_id) as exact_payment_allocation,
    (select count(*)=1 and count(*) filter(where payment_status='settled' and outstanding_amount=0 and economically_settled_amount=19280
      and confirmed_cash_allocated=19160 and confirmed_wht_credit_allocated=120 and invoice_gross_amount=19280)=1
      from public.finance_invoice_settlement_summary where invoice_id=s.invoice_id) as invoice_settlement_exact,
    w.exact_components as stored_wht_line_evidence_exact,
    s.rs->'structured_wht_components'=w.frozen_components and s.ts->'structured_wht_components'=w.frozen_components as frozen_wht_components_exact,
    l.exact_lines and s.ts->'document_lines'=s.c #> '{source_snapshot_json,document_lines}'
      and not exists(select 1 from lines where not exists(select 1 from jsonb_array_elements(s.i #> '{issued_snapshot_json,items}') e
        where e->'invoice_item'=item-'resolved_vat_treatment')) as frozen_commercial_lines_unchanged,
    tc.exact_coverage and (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id::text=s.t->>'id')=2 as tax_8672_90_vat_607_10_excludes_nonvat_10000,
    s.r @> '{"currency":"THB","cash_amount":19160,"wht_amount":120,"settlement_amount":19280}'
      and s.rs->'payment' @> jsonb_build_object('id',s.payment_id,'cash_amount',19160,'wht_amount',120,'settlement_amount',19280,'currency','THB','received_on',s.tax_date)
      and s.rs->'payment'=s.ts->'payment' and 19160+120=19280 as cash_plus_wht_is_receipt_settlement_not_tax_reduction,
    s.c->>'issue_date'=s.issue_date::text and s.t->>'issue_date'=s.issue_date::text and s.r->>'receipt_date'=s.tax_date::text
      and s.ts->>'issue_date'=s.issue_date::text and s.ts #>> '{tax_point,date}'=s.tax_date::text
      and (select count(*)=1 and count(*) filter(where event_type='payment_received' and occurred_on=s.tax_date
        and approved_at is not null and approved_by_user_id is not null and evidence_json=jsonb_build_object('payment',s.ts->'payment','policy_version','vp_v1')
        and (not s.after_issue or s.ts->'tax_point'=(s.t #> '{draft_snapshot_json,tax_point}')||to_jsonb(point)))=1
        from public.finance_tax_point_events point where tax_invoice_id::text=s.t->>'id') as distinct_approved_tax_point_and_issue_date,
    s.c->'external_receipt_checked'='true'::jsonb and s.r->>'external_receipt_checked_at' is not null
      and s.r->>'external_receipt_checked_by_user_id' is not null
      and s.c->'decisions_json'=s.t->'decisions_json'
      and s.c->'decisions_json' @> '{"external_coverage_checked":true,"no_earlier_event":true}'
      and s.ts->'external_coverage_checked'='true'::jsonb
      and s.ts #> '{tax_point,no_earlier_event_acknowledged}'='true'::jsonb
      and exists(select 1 from audits where domain='combined' and event_type='draft_created' and payload @> '{"external_receipt_checked":true,"external_tax_checked":true,"number_allocated":false}') as persisted_external_and_tax_point_acknowledgements,
    s.ts #>> '{buyer_tax_profile,status}'='verified'
      and s.ts->'buyer_tax_profile'=s.c #> '{source_snapshot_json,buyer_tax_profile}'
      and s.ts #> '{buyer_tax_profile,profile}' @> '{"vat_registered":true,"branch_type":"head_office","branch_code":"00000"}'
      and s.ts #>> '{buyer_tax_profile,profile,verified_at}' is not null and s.ts #>> '{buyer_tax_profile,profile,verified_by_user_id}' is not null
      and s.ts->'customer' @> '{"vat_registered":true,"branch_type":"head_office","branch_code":"00000"}'
      and nullif(btrim(s.ts #>> '{customer,name}'),'') is not null and nullif(btrim(s.ts #>> '{customer,address}'),'') is not null
      and s.ts #>> '{customer,tax_id}' ~ '^[0-9]{13}$'
      and s.ts #>> '{customer,id}'=s.client_id::text
      and s.ts #>> '{customer,name}'=s.ts #>> '{buyer_tax_profile,profile,identity_snapshot_json,name}'
      and s.ts #>> '{customer,address}'=s.ts #>> '{buyer_tax_profile,profile,identity_snapshot_json,address}'
      and s.ts #>> '{customer,tax_id}'=s.ts #>> '{buyer_tax_profile,profile,identity_snapshot_json,tax_id}'
      and s.ts #>> '{customer,supplemental_evidence}'=s.ts #>> '{buyer_tax_profile,profile,identity_evidence}'
      and nullif(btrim(s.ts #>> '{customer,supplemental_evidence}'),'') is not null as frozen_reviewed_head_office_with_supplemental_evidence,
    case when s.after_issue then true else s.ts #> '{buyer_tax_profile,profile}'=s.current_profile
      and s.current_profile->'identity_snapshot_json'=jsonb_build_object('id',s.client_id,'name',nullif(btrim(s.current_client->>'name'),''),
        'tax_id',nullif(btrim(s.current_client->>'tax_id'),''),'address',nullif(btrim(s.current_client->>'address'),''),'client_type',s.current_client->'client_type')
      and s.current_client->>'status' is distinct from 'deleted' end as reviewed_profile_current_before_issue_only,
    s.c->'source_snapshot_json'=s.t->'source_snapshot_json' and s.c->'draft_snapshot_json'=s.t->'draft_snapshot_json'
      and s.ts->'schema_version'='2'::jsonb and s.rs->'schema_version'='2'::jsonb
      and s.ts->'invoice_snapshot'=s.i->'issued_snapshot_json'
      and s.ts->'seller' @> '{"vat_registered":true,"branch_type":"head_office","branch_code":"00000"}'
      and nullif(btrim(s.ts #>> '{seller,company_name_th}'),'') is not null and nullif(btrim(s.ts #>> '{seller,address_th}'),'') is not null
      and s.ts #>> '{seller,tax_id}' ~ '^[0-9]{13}$' as source_and_seller_evidence,
    s.rs #>> '{payment,receiving_bank_account,id}'=s.p->>'receiving_bank_account_id'
      and nullif(btrim(s.rs #>> '{payment,receiving_bank_account,bank_name}'),'') is not null
      and nullif(btrim(s.rs #>> '{payment,receiving_bank_account,account_name}'),'') is not null
      and nullif(btrim(s.rs #>> '{payment,receiving_bank_account,account_number}'),'') is not null as frozen_receiving_account_evidence,
    case when s.after_issue then true else
      (s.rs->'seller')-'logo_asset'=jsonb_build_object(
        'company_name_th',s.current_company->>'company_name_th','company_name_en',s.current_company->>'company_name_en',
        'tax_id',s.current_company->>'tax_id','address_th',s.current_company->>'address_th','address_en',s.current_company->>'address_en',
        'branch_label_th',coalesce(nullif(btrim(s.current_company->>'branch_th'),''),nullif(btrim(s.current_company->>'branch_label'),''),'สำนักงานใหญ่'),
        'branch_label_en',coalesce(nullif(btrim(s.current_company->>'branch_en'),''),'Head Office'),
        'phone',s.current_company->>'phone','email',s.current_company->>'email','website',s.current_company->>'website')
      and s.rs #>> '{seller,logo_asset,path}'=s.current_company->>'logo_storage_path'
      and s.rs->'payment'=jsonb_build_object('id',s.payment_id,'internal_reference',s.p->'internal_reference',
        'received_on',s.p->'received_on','payment_method',s.p->'payment_method','receiving_bank_account',s.current_bank,
        'receiving_account_reference',s.p->'receiving_account_reference','external_transaction_reference',s.p->'external_transaction_reference',
        'payer_name',s.p->'payer_name','cash_amount',s.p->'cash_amount','wht_amount',s.p->'wht_amount',
        'settlement_amount',s.p->'settlement_amount','currency',s.p->'currency') end as live_seller_bank_and_payment_match_draft_before_issue_only,
    exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id where
      s.ts #> '{seller,logo_asset}'=jsonb_build_object('bucket',o.bucket_id,'path',o.name,'object_id',o.id,'storage_version',to_jsonb(o)->>'version')
      and s.rs #> '{seller,logo_asset}'=s.ts #> '{seller,logo_asset}' and o.bucket_id='vp-document-assets' and not b.public
      and o.name ~ '^company/logo/[^/]+$' and o.name not like '%..%'
      and lower(o.metadata->>'mimetype') in ('image/png','image/jpeg','image/webp','image/svg+xml')) as frozen_logo_reference_matches_retained_object,
    s.rs->'invoices' @> jsonb_build_array(jsonb_build_object('invoice_id',s.invoice_id,'invoice_no',s.invoice_no,'currency','THB',
      'cash_allocated',19160,'wht_allocated',120,'settlement_allocated',19280)) and jsonb_array_length(s.rs->'invoices')=1
      and case when s.after_issue then (select count(*)=1 and count(*) filter(where invoice_id=s.invoice_id and invoice_no=s.invoice_no
        and cash_allocated=19160 and wht_allocated=120 and settlement_allocated=19280 and currency='THB'
        and source_snapshot_json=s.rs->'invoices'->0)=1 from public.finance_receipt_invoice_allocations where receipt_id::text=s.r->>'id')
      else not exists(select 1 from public.finance_receipt_invoice_allocations where receipt_id::text=s.r->>'id') end as receipt_invoice_allocation_by_lifecycle,
    (select count(*)=1 from public.finance_combined_documents where payment_id=s.payment_id and status in ('draft','issued'))
      and (select count(*)=1 from public.finance_receipts where payment_id=s.payment_id and status in ('draft','issued'))
      and (select count(*)=1 from public.finance_tax_invoices where payment_id=s.payment_id and status in ('draft','issued')) as no_duplicate_active_document_coverage,
    n.profile_valid and coalesce(n.rti_last_no,0)<case when s.after_issue then 1000000 else 999999 end as active_rti_numbering_profile,
    case when s.after_issue then s.c->>'combined_no' ~ ('^VP-RTI-'||to_char(s.issue_date,'YYYYMM')||'-[0-9]{6}$')
      and s.r->>'receipt_no'=s.c->>'combined_no' and s.t->>'tax_invoice_no'=s.c->>'combined_no'
      and (select count(*)=1 from public.finance_combined_documents where combined_no=s.c->>'combined_no')
      and (select count(*)=1 from public.finance_receipts where receipt_no=s.c->>'combined_no')
      and (select count(*)=1 from public.finance_tax_invoices where tax_invoice_no=s.c->>'combined_no')
      and n.rti_last_no>=right(s.c->>'combined_no',6)::integer
    else s.c->>'combined_no' is null and s.r->>'receipt_no' is null and s.t->>'tax_invoice_no' is null
      and s.c->>'issued_at' is null and s.r->>'issued_at' is null and s.t->>'issued_at' is null
      and s.c->>'issued_snapshot_json' is null and s.r->>'issued_snapshot_json' is null and s.t->>'issued_snapshot_json' is null end as one_rti_number_only_at_issue,
    case when s.after_issue then s.c->>'issued_at' is not null and s.c->>'issued_by_user_id' is not null
      and s.c->'issued_at'=s.r->'issued_at' and s.c->'issued_at'=s.t->'issued_at'
      and s.c->'issued_by_user_id'=s.r->'issued_by_user_id' and s.c->'issued_by_user_id'=s.t->'issued_by_user_id'
      and s.rs-'receipt'=s.r->'draft_snapshot_json'
      and s.ts-array['document','tax_point']=(s.t->'draft_snapshot_json')-'tax_point'
      and s.rs->'receipt' @> jsonb_build_object('id',s.r->'id','receipt_no',s.c->'combined_no','combined_document_id',s.combined_id,'issued_at',s.c->'issued_at','receipt_date',s.tax_date)
      and s.ts->'document' @> jsonb_build_object('id',s.t->'id','tax_invoice_no',s.c->'combined_no','combined_document_id',s.combined_id,'issued_at',s.c->'issued_at','issue_date',s.issue_date)
      and s.c->'issued_snapshot_json'=jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',s.combined_id,
        'combined_no',s.c->'combined_no','issued_at',s.c->'issued_at','issue_date',s.issue_date,'receipt',s.rs,'tax_invoice',s.ts)
    else true end as immutable_parent_and_child_issued_snapshots,
    not exists(select 1 from audits where event_type in ('cancelled','voided'))
      and case when s.after_issue then
        (select count(*)=3 and count(distinct domain)=3 and bool_and(actor_user_id::text=s.c->>'issued_by_user_id'
          and to_jsonb(created_at)=s.c->'issued_at' and payload->'documentary_only'='true'::jsonb)
          from audits where event_type='issued')
        and exists(select 1 from audits where domain='combined' and event_type='issued' and payload @> jsonb_build_object('combined_no',s.c->'combined_no',
          'receipt_id',s.r->'id','tax_invoice_id',s.t->'id','external_receipt_checked',true,'external_tax_checked',true,
          'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false))
        and exists(select 1 from audits where domain='tax' and event_type='issued' and payload @> jsonb_build_object('delayed_issue_acknowledged',true,'tax_invoice_no',s.c->'combined_no','combined_document_id',s.combined_id))
        and exists(select 1 from audits where domain='receipt' and event_type='issued' and payload @> jsonb_build_object('receipt_no',s.c->'combined_no','combined_document_id',s.combined_id))
      else not exists(select 1 from audits where event_type='issued') end as exact_issue_audits_and_delayed_ack_by_lifecycle,
    (select count(*)=1 and count(*) filter(where event_payload_json @> '{"cash_amount":19160,"wht_amount":120,"settlement_amount":19280,"cash_posting_outcome":"pre_cutover_no_opening","cash_transaction_id":null,"wht_excluded_from_cash_posting":true}')=1
      from public.finance_payment_audit_events where payment_id=s.payment_id and event_type='confirmed') as payment_original_cash_branch_unchanged,
    (select count(*)=0 from public.finance_account_opening_balances) as no_cash_cutover,
    (select count(*)=3 from downstream where relname in ('finance_cash_transactions','finance_company_ledger','finance_compensation_batches'))
      and not exists(select 1 from downstream where linked_rows is distinct from 0
        or (relname ~ 'revenue_allocat' and rows_observed>0 and cardinality(link_columns)=0)) as no_detectable_linked_cash_ledger_compensation_revenue_effect,
    (select bool_and(valid) from function_facts) as exact_deployed_issue_numbering_guard_and_source_bodies,
    (select count(*)=3 from pg_catalog.pg_trigger g where g.tgname='combined_integrity'
      and g.tgrelid in ('public.finance_combined_documents'::regclass,'public.finance_receipts'::regclass,'public.finance_tax_invoices'::regclass)
      and g.tgenabled<>'D' and g.tgdeferrable and g.tginitdeferred
      and g.tgfoid='public.validate_finance_combined_document()'::regprocedure) as paired_deferred_integrity_triggers
  from s cross join wht_facts w cross join line_facts l cross join tax_components tc cross join numbering n
)
select to_jsonb(checks) as checks,
  coalesce((select jsonb_agg(e.key order by e.key) from jsonb_each(to_jsonb(checks)) e where e.value is distinct from 'true'::jsonb),'[]') as failed_checks,
  ${issued?"jsonb_build_object('combined_no',s.c->'combined_no','receipt_no',s.r->'receipt_no','tax_invoice_no',s.t->'tax_invoice_no','period_counters',n.period_counters,'counter_method','Transactional table UPSERT, not a sequence; compare preflight baseline for unrelated RC/TI changes') as numbering_observability,":""}
  jsonb_build_object('captured_at',statement_timestamp(),'combined_id',s.combined_id,'status',s.c->'status','receipt_id',s.r->'id','tax_invoice_id',s.t->'id',
    'payment_id',s.payment_id,'invoice_id',s.invoice_id,'period_counters',n.period_counters,'rti_last_no',n.rti_last_no,
    'payment_fingerprint',md5(s.p::text),'invoice_fingerprint',md5(s.i::text),'draft_source_fingerprint',md5((s.c->'source_snapshot_json')::text),
    'frozen_tax_profile',s.ts->'buyer_tax_profile','logo_evidence',s.ts #> '{seller,logo_asset}',
    'line_facts',l.observed,'wht_components',w.observed,'tax_coverage',tc.observed,
    'audits',(select jsonb_agg(to_jsonb(a) order by domain,created_at) from audits a),
    'downstream',(select jsonb_agg(to_jsonb(d) order by relname) from downstream d),
    'payment_rows',(select count(*) from public.finance_payments),'opening_balance_rows',(select count(*) from public.finance_account_opening_balances),
    'function_differences',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from function_facts f where valid is distinct from true),
    'runtime_only_acknowledgements',jsonb_build_array('reviewed_snapshot','final_issue_acknowledged','delayed_issue_acknowledged','external_receipt_checked','external_tax_checked'),
    'limitations','Technical check only, not Production UAT authorization. Final UI acknowledgements are not stored before Issue. External absence is human-attested. Current counts cannot attribute unlinked writes or prove individual RC/TI counter non-consumption; exact allocator body and isolated rollback tests establish that contract. Compare captured baselines separately. Storage identity is checked, not downloadability. Post-issue identity never depends on current Client/profile.')
    as ${issued?'financial_observability':'observability'},
  not exists(select 1 from jsonb_each(to_jsonb(checks)) e where e.value is distinct from 'true'::jsonb)
    as ${issued?'combined_vp_rti_issue_verification_pass':'combined_vp_rti_preissue_pass'}
from s cross join checks cross join numbering n cross join line_facts l cross join wht_facts w cross join tax_components tc;
`.replace(/[ \t]+$/gm,'');}
function artifacts(){return {'scripts/sql/preflight_combined_vp_rti_issue.sql':sql(false),'scripts/sql/verify_combined_vp_rti_issue.sql':sql(true)};}
module.exports={artifacts};
if(require.main===module)process.stdout.write(JSON.stringify(artifacts()));
