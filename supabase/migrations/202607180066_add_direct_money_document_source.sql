-- CANDIDATE 066: typed Direct Money source for the EXISTING document engine.
-- No historical backfill. No money posting. Applied migrations remain unchanged.

alter table public.finance_receipts add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 alter column payment_id drop not null,
 add constraint receipt_source_066 check ((payment_id is null)<>(direct_money_receipt_id is null));
alter table public.finance_tax_invoices add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 alter column payment_id drop not null,alter column invoice_id drop not null,
 add constraint tax_source_066 check ((payment_id is not null and invoice_id is not null and direct_money_receipt_id is null)
 or (payment_id is null and invoice_id is null and direct_money_receipt_id is not null));
alter table public.finance_combined_documents add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 alter column payment_id drop not null,
 add constraint combined_source_066 check ((payment_id is null)<>(direct_money_receipt_id is null));
create unique index receipt_active_direct_066 on public.finance_receipts(direct_money_receipt_id) where status in ('draft','issued');
create unique index tax_active_direct_066 on public.finance_tax_invoices(direct_money_receipt_id) where status in ('draft','issued');
create unique index combined_active_direct_066 on public.finance_combined_documents(direct_money_receipt_id) where status in ('draft','issued');

alter table public.finance_receipt_invoice_allocations add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 add column direct_source_line_id uuid,alter column invoice_id drop not null,alter column invoice_no drop not null,
 add constraint receipt_coverage_source_066 check ((invoice_id is not null and invoice_no is not null and direct_money_receipt_id is null and direct_source_line_id is null)
 or (invoice_id is null and invoice_no is null and direct_money_receipt_id is not null and direct_source_line_id is not null)),
 add constraint receipt_direct_line_once_066 unique(receipt_id,direct_source_line_id);
alter table public.finance_tax_invoice_items add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 add column direct_source_line_id uuid,alter column invoice_item_id drop not null,
 add constraint tax_item_source_066 check ((invoice_item_id is not null and direct_money_receipt_id is null and direct_source_line_id is null)
 or (invoice_item_id is null and direct_money_receipt_id is not null and direct_source_line_id is not null)),
 add constraint tax_direct_line_once_066 unique(tax_invoice_id,direct_source_line_id);
alter table public.finance_tax_invoice_source_coverages add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 add column direct_source_line_id uuid,alter column invoice_item_id drop not null,
 add constraint tax_coverage_source_066 check ((invoice_item_id is not null and direct_money_receipt_id is null and direct_source_line_id is null)
 or (invoice_item_id is null and direct_money_receipt_id is not null and direct_source_line_id is not null));
create unique index tax_direct_coverage_once_066 on public.finance_tax_invoice_source_coverages(direct_money_receipt_id,direct_source_line_id) where status in ('reserved','issued');
alter table public.finance_tax_point_events drop constraint finance_tax_point_events_event_type_check,
 add constraint finance_tax_point_events_event_type_check check(event_type in ('payment_received','direct_money_received'));
alter table public.finance_tax_document_corrections add column direct_money_receipt_id uuid references public.finance_direct_money_receipts(id) on delete restrict,
 alter column payment_id drop not null,alter column invoice_id drop not null,
 add constraint correction_source_066 check ((payment_id is not null and invoice_id is not null and direct_money_receipt_id is null)
 or (payment_id is null and invoice_id is null and direct_money_receipt_id is not null));

-- Source evidence is typed, never an Invoice/Payment surrogate. No allocation mutation.
create function public.document_direct_source(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source066$
declare d public.finance_direct_money_receipts%rowtype; evidence jsonb; company jsonb; seller jsonb; bank jsonb;
 identity jsonb; profile public.finance_customer_tax_profiles%rowtype; state text; customer jsonb; lines jsonb;
begin
 perform public.vp_received_lock(null,p_id);
 select * into strict d from public.finance_direct_money_receipts where id=p_id;
 if d.status<>'confirmed' or d.confirmed_snapshot_json is null then raise exception 'DIRECT_DOCUMENT_CONFIRMED_REQUIRED'; end if;
 if d.client_id is null then raise exception 'RECEIPT_CUSTOMER_IDENTITY_REQUIRED'; end if;
 if d.currency<>'THB' then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 evidence:=public.vp_received_source(null,p_id)->'received_money_source';
 if exists(select 1 from jsonb_array_elements(evidence->'lines') l where l->>'money_nature'<>'business_revenue'
 or nullif(btrim(l->>'description'),'') is null or l#>>'{vat_treatment_json,treatment}'='unknown')
 then raise exception 'DOCUMENT_DIRECT_CLASSIFICATION_REQUIRED'; end if;
 select jsonb_agg(l||jsonb_build_object('id',l->'source_line_id','amount_before_vat',l->'base','vat_amount',l->'vat',
 'line_total',l->'gross','resolved_vat_treatment',l->'vat_treatment_json') order by ordinal)
 into lines from jsonb_array_elements(evidence->'lines') with ordinality x(l,ordinal);
 select to_jsonb(c) into company from public.finance_company_profiles c where id='default' for share;
 seller:=company||jsonb_build_object('branch_label_th',coalesce(company->>'branch_th',company->>'branch_label','สำนักงานใหญ่'),
 'branch_label_en',coalesce(company->>'branch_en','Head Office'),'vat_registered',true,'registration_basis','approved_vp_v1_policy',
 'branch_type',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then 'head_office' end,
 'branch_code',case when lower(coalesce(nullif(btrim(company->>'branch_th'),''),btrim(company->>'branch_label'))) in ('สำนักงานใหญ่','head office') then '00000' end,
 'logo_asset',public.document_logo_evidence(company->>'logo_storage_path'));
 if nullif(btrim(seller->>'company_name_th'),'') is null or nullif(btrim(seller->>'address_th'),'') is null
 or nullif(btrim(seller->>'tax_id'),'') is null then raise exception 'RECEIPT_SELLER_IDENTITY_REQUIRED'; end if;
 if d.receiving_bank_account_id is not null then
 select jsonb_build_object('id',b.id,'short_name',b.short_name,'bank_name',b.bank_name,'account_name',b.account_name,'account_number',b.account_number)
 into bank from public.finance_bank_accounts b where id=d.receiving_bank_account_id for share;
 if nullif(btrim(bank->>'bank_name'),'') is null or nullif(btrim(bank->>'account_name'),'') is null
 or nullif(btrim(bank->>'account_number'),'') is null then raise exception 'RECEIPT_RECEIVING_ACCOUNT_REQUIRED'; end if;
 end if;
 perform 1 from public.clients where id=d.client_id for share;
 identity:=public.finance_customer_tax_identity(d.client_id);
 select * into profile from public.finance_customer_tax_profiles where client_id=d.client_id for share;
 state:=case when profile.client_id is null then 'missing' when identity is distinct from profile.identity_snapshot_json then 'stale'
 when profile.verified_at is null then 'unverified' else 'verified' end;
 customer:=coalesce(identity,'{}')||jsonb_build_object('id',d.client_id,'name',coalesce(evidence#>>'{client,name}',d.payer_name));
 if state='verified' then customer:=customer||jsonb_build_object('address',profile.identity_snapshot_json->'address','tax_id',profile.identity_snapshot_json->'tax_id',
 'vat_registered',profile.vat_registered,'branch_type',profile.branch_type,'branch_code',profile.branch_code,'supplemental_evidence',profile.identity_evidence); end if;
 return jsonb_build_object('schema_version',3,'document_kind','tax_invoice','source',jsonb_build_object('type','direct_money_receipt','id',d.id,
 'version',d.version,'fingerprint',evidence->'source_fingerprint','evidence',evidence),'seller',seller,'customer',customer,
 'buyer_tax_profile',jsonb_build_object('schema_version',1,'status',state,'profile',case when profile.client_id is not null then to_jsonb(profile) end),
 'money',jsonb_build_object('source_type','direct_money_receipt','id',d.id,'internal_reference',upper(left(d.id::text,8)),
 'received_on',d.received_on,'payment_method',d.method,'receiving_bank_account',bank,'receiving_account_reference',d.cash_location,
 'external_transaction_reference',d.reference_no,'payer_name',d.payer_name,'cash_amount',d.cash_amount,'wht_amount',d.wht_amount,
 'settlement_amount',d.gross_amount,'amount_before_vat',d.amount_before_vat,'vat_amount',d.vat_amount,'currency',d.currency),
 'receipt_reference',(select jsonb_build_object('id',r.id,'receipt_no',r.receipt_no,'issued_at',r.issued_at) from public.finance_receipts r where r.direct_money_receipt_id=d.id and r.status='issued' and r.combined_document_id is null),
 'document_lines',lines,'tax_lines',(select coalesce(jsonb_agg(l),'[]') from jsonb_array_elements(lines) l where l#>>'{resolved_vat_treatment,treatment}' in ('standard_rate','zero_rated')));
end;
$source066$;

create function public.document_direct_snapshot(p_source jsonb,p_decisions jsonb,p_date date)
returns jsonb language plpgsql immutable set search_path=public as $snapshot066$
begin
 if jsonb_typeof(p_decisions) is distinct from 'object' or exists(select 1 from jsonb_each(p_decisions) x
 where x.key not in ('no_earlier_event','external_coverage_checked') or jsonb_typeof(x.value)<>'boolean')
 then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
 return p_source||jsonb_build_object('issue_date',p_date,'external_coverage_checked',coalesce(p_decisions->'external_coverage_checked','false'),
 'tax_point',jsonb_build_object('event_type','direct_money_received','date',p_source#>'{money,received_on}',
 'no_earlier_event_acknowledged',coalesce(p_decisions->'no_earlier_event','false'),'policy_version','vp_v1'));
end;
$snapshot066$;

create function public.document_direct_blockers(p_snapshot jsonb)
returns text[] language plpgsql immutable set search_path=public as $blockers066$
declare result text[]:='{}'; l jsonb; treatment text;
begin
 if p_snapshot#>>'{buyer_tax_profile,status}' is distinct from 'verified' then result:=array_append(result,'TAX_INVOICE_CUSTOMER_IDENTITY_REQUIRED'); end if;
 for l in select value from jsonb_array_elements(p_snapshot->'tax_lines') loop
 treatment:=l#>>'{resolved_vat_treatment,treatment}';
 -- Reuse existing legal/identity/tax-point checks, with this real source line as their item input.
 result:=result||public.tax_blockers_pre040(p_snapshot||jsonb_build_object('invoice_item',l,
 'tax_treatment',case when treatment='standard_rate' then 'standard_rated' else treatment end,'treatment_reason',l#>'{resolved_vat_treatment,reason}'));
 end loop;
 return array(select distinct x from unnest(result) x order by x);
end;
$blockers066$;

create function public.document_direct_decision(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $decision066$
declare s jsonb; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype; c public.finance_combined_documents%rowtype;
 route text; taxable boolean;
begin
 s:=public.document_direct_source(p_id); taxable:=jsonb_array_length(s->'tax_lines')>0;
 select * into r from public.finance_receipts where direct_money_receipt_id=p_id and status in ('draft','issued');
 select * into t from public.finance_tax_invoices where direct_money_receipt_id=p_id and status in ('draft','issued');
 select * into c from public.finance_combined_documents where direct_money_receipt_id=p_id and status in ('draft','issued');
 route:=case when c.status='issued' or (r.status='issued' and (not taxable or t.status='issued')) then 'complete'
 when c.id is not null then 'combined_receipt_tax_invoice'
 when taxable and r.status='issued' then 'tax_invoice_completion_only'
 when taxable and t.status='issued' then 'receipt_completion_only'
 when taxable then 'combined_receipt_tax_invoice' else 'receipt_only' end;
 return jsonb_build_object('source_type','direct_money_receipt','source_id',p_id,'decision',route,'lines',s->'document_lines',
 'unknown_lines','[]'::jsonb,'receipt_id',r.id,'tax_invoice_id',t.id,'combined_id',c.id,
 'blockers',case when taxable then to_jsonb(public.document_direct_blockers(coalesce(t.draft_snapshot_json,public.document_direct_snapshot(s,'{}',(now() at time zone 'Asia/Bangkok')::date)))) else '[]'::jsonb end);
end;
$decision066$;

create function public.get_finance_received_document_decision(p_source_type text,p_source_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $decision_rpc066$
begin
 if not(public.current_user_can_view_finance_receipts() or public.current_user_can_view_finance_tax_invoices()) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 if p_source_type='invoice_payment' then return public.get_finance_document_decision(p_source_id); end if;
 if p_source_type<>'direct_money_receipt' or p_source_type is null then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 return public.document_direct_decision(p_source_id);
end;
$decision_rpc066$;

create function public.create_finance_received_document_draft(p_source_type text,p_source_id uuid,p_external_receipt_checked boolean,p_external_tax_checked boolean,p_no_earlier_event boolean default false)
returns uuid language plpgsql security definer set search_path=public as $create066$
declare d jsonb; s jsonb; rs jsonb; route text; receipt_needed boolean; tax_needed boolean; paired boolean;
 rid uuid; tid uuid; cid uuid; pid uuid; iid uuid; l jsonb; day date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 if not(public.current_user_can_manage_finance_receipts() or public.current_user_can_manage_finance_tax_invoices()) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 if p_source_type='invoice_payment' then
 d:=public.get_finance_document_decision(p_source_id); route:=d->>'decision';
 if route='combined_receipt_tax_invoice' then return public.create_finance_combined_document_draft(p_source_id,p_external_receipt_checked,p_external_tax_checked);
 elsif route in ('receipt_only','receipt_completion_only') then return public.create_finance_receipt_draft_from_payment(p_source_id,p_external_receipt_checked);
 elsif route='tax_invoice_completion_only' then return public.create_finance_tax_invoice_draft(p_source_id);
 else raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 end if;
 if p_source_type is distinct from 'direct_money_receipt' then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 perform public.vp_received_lock(null,p_source_id);
 d:=public.document_direct_decision(p_source_id); route:=d->>'decision';
 if d->>'combined_id' is not null then
 if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 return (d->>'combined_id')::uuid; end if;
 if route='complete' then
 if (d->>'tax_invoice_id' is not null and not public.current_user_can_manage_finance_tax_invoices())
 or (d->>'tax_invoice_id' is null and not public.current_user_can_manage_finance_receipts()) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 return coalesce((d->>'tax_invoice_id')::uuid,(d->>'receipt_id')::uuid); end if;
 paired:=route='combined_receipt_tax_invoice'; receipt_needed:=route in ('receipt_only','receipt_completion_only','combined_receipt_tax_invoice');
 tax_needed:=route in ('tax_invoice_completion_only','combined_receipt_tax_invoice');
 if (receipt_needed and not public.current_user_can_manage_finance_receipts()) or (tax_needed and not public.current_user_can_manage_finance_tax_invoices()) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 if not paired and receipt_needed and d->>'receipt_id' is not null then return (d->>'receipt_id')::uuid; end if;
 if not paired and tax_needed and d->>'tax_invoice_id' is not null then return (d->>'tax_invoice_id')::uuid; end if;
 if paired and (d->>'receipt_id' is not null or d->>'tax_invoice_id' is not null) then raise exception 'DOCUMENT_EXISTING_STANDALONE_DRAFT'; end if;
 if (receipt_needed and p_external_receipt_checked is distinct from true) or (tax_needed and p_external_tax_checked is distinct from true) then raise exception 'DOCUMENT_EXTERNAL_CHECK_REQUIRED'; end if;
 s:=public.document_direct_source(p_source_id); rs:=s||jsonb_build_object('document_kind','receipt');
 if receipt_needed then
 rid:=gen_random_uuid();
 insert into public.finance_receipts(id,direct_money_receipt_id,client_id,receipt_date,currency,cash_amount,wht_amount,draft_snapshot_json,
 external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id,replaces_receipt_id)
 values(rid,p_source_id,(s#>>'{customer,id}')::uuid,(s#>>'{money,received_on}')::date,s#>>'{money,currency}',(s#>>'{money,cash_amount}')::numeric,
 (s#>>'{money,wht_amount}')::numeric,rs,now(),auth.uid(),auth.uid(),(select id from public.finance_receipts where direct_money_receipt_id=p_source_id and status='voided' order by issued_at desc limit 1));
 perform public.record_finance_receipt_audit(rid,'draft_created',jsonb_build_object('direct_money_receipt_id',p_source_id,'external_receipt_checked',true));
 end if;
 if tax_needed then
 tid:=gen_random_uuid(); pid:=gen_random_uuid();
 insert into public.finance_tax_invoices(id,direct_money_receipt_id,client_id,issue_date,source_snapshot_json,draft_snapshot_json,created_by_user_id)
 values(tid,p_source_id,(s#>>'{customer,id}')::uuid,day,s,public.document_direct_snapshot(s,'{}',day),auth.uid());
 insert into public.finance_tax_point_events(id,tax_invoice_id,event_type,occurred_on,evidence_json)
 values(pid,tid,'direct_money_received',(s#>>'{money,received_on}')::date,jsonb_build_object('source',s->'source','money',s->'money','policy_version','vp_v1'));
 for l in select value from jsonb_array_elements(s->'tax_lines') loop
 iid:=gen_random_uuid();
 insert into public.finance_tax_invoice_items(id,tax_invoice_id,direct_money_receipt_id,direct_source_line_id,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
 values(iid,tid,p_source_id,(l->>'source_line_id')::uuid,(l->>'base')::numeric,(l->>'vat')::numeric,(l->>'gross')::numeric,l);
 insert into public.finance_tax_invoice_source_coverages(tax_invoice_id,tax_invoice_item_id,direct_money_receipt_id,direct_source_line_id,tax_point_event_id,status,amount_before_vat,vat_amount,total_amount,source_snapshot_json)
 values(tid,iid,p_source_id,(l->>'source_line_id')::uuid,pid,'reserved',(l->>'base')::numeric,(l->>'vat')::numeric,(l->>'gross')::numeric,l);
 end loop;
 perform public.record_finance_tax_invoice_audit(tid,'draft_created',jsonb_build_object('direct_money_receipt_id',p_source_id,'number_allocated',false));
 end if;
 if paired then
 cid:=gen_random_uuid();
 insert into public.finance_combined_documents(id,direct_money_receipt_id,receipt_id,tax_invoice_id,issue_date,source_snapshot_json,draft_snapshot_json,external_receipt_checked,created_by_user_id)
 values(cid,p_source_id,rid,tid,day,s,public.document_direct_snapshot(s,'{}',day),true,auth.uid());
 update public.finance_receipts set combined_document_id=cid where id=rid;
 update public.finance_tax_invoices set combined_document_id=cid where id=tid;
 insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
 values(cid,'draft_created',jsonb_build_object('direct_money_receipt_id',p_source_id,'external_receipt_checked',true,'external_tax_checked',true,'number_allocated',false),auth.uid());
 end if;
 if tax_needed and p_no_earlier_event is true then
 perform public.document_direct_action(case when paired then 'receipt_tax_invoice' else 'tax_invoice' end,coalesce(cid,tid),'save',
 jsonb_build_object('date',day,'decisions',jsonb_build_object('no_earlier_event',true,'external_coverage_checked',true)));
 end if;
 return coalesce(cid,tid,rid);
end;
$create066$;

-- Private source branch of the existing lifecycle RPCs. Same tables, counters,
-- renderers, correction system, audit and document permissions.
create function public.document_direct_action(p_kind text,p_id uuid,p_action text,p_args jsonb)
returns uuid language plpgsql security definer set search_path=public as $action066$
declare sid uuid; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype; c public.finance_combined_documents%rowtype;
 point public.finance_tax_point_events%rowtype; s jsonb; rs jsonb; ts jsonb; reviewed jsonb; status text; number text; l jsonb;
 moment timestamptz:=now(); day date; decisions jsonb; reason text:=nullif(btrim(p_args->>'reason'),''); allowed boolean; changed timestamptz;
begin
 if p_kind not in ('receipt','tax_invoice','receipt_tax_invoice') or p_action not in ('issue','save','refresh','cancel','void') then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 allowed:=case when p_action='void' then p_kind='receipt' and public.current_user_can_void_finance_receipts()
 when p_action='issue' then case p_kind when 'receipt' then public.current_user_can_issue_finance_receipts() when 'tax_invoice' then public.current_user_can_issue_finance_tax_invoices() else public.current_user_can_issue_combined_documents() end
 else case p_kind when 'receipt' then public.current_user_can_manage_finance_receipts() when 'tax_invoice' then public.current_user_can_manage_finance_tax_invoices() else public.current_user_can_manage_combined_documents() end end;
 if allowed is distinct from true then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
 if p_kind='receipt' then select direct_money_receipt_id into sid from public.finance_receipts where id=p_id;
 elsif p_kind='tax_invoice' then select direct_money_receipt_id into sid from public.finance_tax_invoices where id=p_id;
 else select direct_money_receipt_id into sid from public.finance_combined_documents where id=p_id; end if;
 if sid is null then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 perform public.vp_received_lock(null,sid);
 if p_kind='receipt_tax_invoice' then
 select * into strict c from public.finance_combined_documents where id=p_id for update;
 select * into strict r from public.finance_receipts where id=c.receipt_id for update;
 select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id for update;
 status:=c.status; reviewed:=c.draft_snapshot_json; changed:=c.updated_at;
 elsif p_kind='receipt' then
 select * into strict r from public.finance_receipts where id=p_id for update;
 if r.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
 status:=r.status; reviewed:=r.draft_snapshot_json; changed:=r.updated_at;
 else
 select * into strict t from public.finance_tax_invoices where id=p_id for update;
 if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
 status:=t.status; reviewed:=t.draft_snapshot_json; changed:=t.updated_at;
 end if;
 if p_action='void' then
 if reason is null or p_args->'ack' is distinct from 'true'::jsonb then raise exception 'RECEIPT_VOID_ACK_REQUIRED'; end if;
 if status='voided' then return p_id; end if;
 if status<>'issued' then raise exception 'RECEIPT_ISSUED_REQUIRED'; end if;
 if exists(select 1 from public.finance_tax_invoices other_tax where other_tax.direct_money_receipt_id=sid and other_tax.status in ('draft','issued')) then raise exception 'DOCUMENT_TAX_CORRECTION_REQUIRED'; end if;
 update public.finance_receipts set status='voided',voided_at=moment,voided_by_user_id=auth.uid(),void_reason=reason,updated_at=moment where id=r.id;
 perform public.record_finance_receipt_audit(r.id,'voided',jsonb_build_object('reason',reason,'acknowledged',true)); return p_id;
 end if;
 if p_action='issue' and p_args->'ack' is distinct from 'true'::jsonb then raise exception 'DOCUMENT_ISSUE_ACK_REQUIRED'; end if;
 if (p_action='issue' and status='issued') or (p_action='cancel' and status='cancelled') then return p_id; end if;
 if status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
 if p_args ? 'expected' and (p_args->>'expected')::timestamptz is distinct from changed then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
 if p_action='cancel' then
 if reason is null then raise exception 'DOCUMENT_CANCEL_REASON_REQUIRED'; end if;
 if r.id is not null then
 update public.finance_receipts set status='cancelled',cancelled_at=moment,cancelled_by_user_id=auth.uid(),cancel_reason=reason,updated_at=moment where id=r.id;
 perform public.record_finance_receipt_audit(r.id,'cancelled',jsonb_build_object('reason',reason)); end if;
 if t.id is not null then
 update public.finance_tax_invoice_source_coverages set status='released' where tax_invoice_id=t.id;
 update public.finance_tax_invoices set status='cancelled',cancelled_at=moment,cancelled_by_user_id=auth.uid(),cancel_reason=reason,updated_at=moment where id=t.id;
 perform public.record_finance_tax_invoice_audit(t.id,'cancelled',jsonb_build_object('reason',reason)); end if;
 if c.id is not null then
 update public.finance_combined_documents set status='cancelled',cancel_reason=reason,updated_at=moment where id=c.id;
 insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id) values(c.id,'cancelled',jsonb_build_object('reason',reason),auth.uid()); end if;
 return p_id;
 end if;
 s:=public.document_direct_source(sid); rs:=s||jsonb_build_object('document_kind','receipt');
 day:=case when p_action='save' then (p_args->>'date')::date else t.issue_date end;
 decisions:=case when p_action='save' then p_args->'decisions' when p_action='refresh' then '{}'::jsonb else t.decisions_json end;
 if p_action in ('save','refresh') then
 if t.id is not null then
 if p_action='save' and s is distinct from t.source_snapshot_json then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
 if day is null or day<(s#>>'{money,received_on}')::date or day>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
 ts:=public.document_direct_snapshot(s,decisions,day);
 update public.finance_tax_invoices set source_snapshot_json=s,draft_snapshot_json=ts,decisions_json=decisions,issue_date=day,updated_at=moment where id=t.id;
 update public.finance_tax_point_events set evidence_json=jsonb_build_object('source',s->'source','money',s->'money','policy_version','vp_v1'),
 approved_at=case when decisions->'no_earlier_event'='true' then moment end,approved_by_user_id=case when decisions->'no_earlier_event'='true' then auth.uid() end where tax_invoice_id=t.id;
 perform public.record_finance_tax_invoice_audit(t.id,case when p_action='save' then 'draft_saved' else 'draft_refreshed' end,jsonb_build_object('direct_money_receipt_id',sid));
 end if;
 if r.id is not null then update public.finance_receipts set draft_snapshot_json=rs,updated_at=moment where id=r.id;
 perform public.record_finance_receipt_audit(r.id,'draft_refreshed',jsonb_build_object('direct_money_receipt_id',sid)); end if;
 if c.id is not null then update public.finance_combined_documents set source_snapshot_json=s,draft_snapshot_json=ts,decisions_json=decisions,issue_date=day,updated_at=moment where id=c.id;
 insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
 values(c.id,case when p_action='save' then 'draft_saved' else 'draft_refreshed' end,jsonb_build_object('direct_money_receipt_id',sid),auth.uid()); end if;
 return p_id;
 end if;
 if reviewed is distinct from p_args->'reviewed' then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
 if (r.id is not null and r.draft_snapshot_json is distinct from rs) or (t.id is not null and t.source_snapshot_json is distinct from s) then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
 if c.id is not null and (p_args->'receipt_checked' is distinct from 'true'::jsonb or p_args->'tax_checked' is distinct from 'true'::jsonb) then raise exception 'DOCUMENT_EXTERNAL_CHECK_REQUIRED'; end if;
 if t.id is not null then
 if cardinality(public.document_direct_blockers(t.draft_snapshot_json))>0 then raise exception using message=(public.document_direct_blockers(t.draft_snapshot_json))[1]; end if;
 select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id for update;
 if point.approved_at is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
 if day<point.occurred_on or day>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
 if day>point.occurred_on and p_args->'delay' is distinct from 'true'::jsonb then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
 end if;
 number:=public.generate_finance_document_no(p_kind,coalesce(day,r.receipt_date));
 if r.id is not null then
 rs:=rs||jsonb_build_object('receipt',jsonb_build_object('id',r.id,'receipt_no',number,'receipt_date',r.receipt_date,'combined_document_id',c.id,'issued_at',moment,'issued_by_user_id',auth.uid(),
 'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())));
 update public.finance_receipts set status='issued',receipt_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=rs,updated_at=moment where id=r.id;
 for l in select value from jsonb_array_elements(s->'document_lines') loop
 insert into public.finance_receipt_invoice_allocations(receipt_id,direct_money_receipt_id,direct_source_line_id,currency,cash_allocated,wht_allocated,source_snapshot_json)
 values(r.id,sid,(l->>'source_line_id')::uuid,r.currency,(l->>'cash')::numeric,(l->>'wht')::numeric,l); end loop;
 perform public.record_finance_receipt_audit(r.id,'issued',jsonb_build_object('receipt_no',number,'documentary_only',true)); end if;
 if t.id is not null then
 ts:=t.draft_snapshot_json||jsonb_build_object('document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'combined_document_id',c.id,'issue_date',day,'issued_at',moment,
 'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())),
 'tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(point));
 update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
 update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=ts,updated_at=moment where id=t.id;
 perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'documentary_only',true,'delayed_issue_acknowledged',p_args->'delay')); end if;
 if c.id is not null then
 update public.finance_combined_documents set status='issued',combined_no=number,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment,
 issued_snapshot_json=jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',c.id,'combined_no',number,
 'issued_at',moment,'issue_date',day,'receipt',rs,'tax_invoice',ts) where id=c.id;
 insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
 values(c.id,'issued',jsonb_build_object('combined_no',number,'documentary_only',true,'cash_created',false,'revenue_allocation_created',false),auth.uid()); end if;
 return p_id;
end;
$action066$;

create function public.validate_direct_document(p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path=public as $integrity066$
declare r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype; point public.finance_tax_point_events%rowtype;
 s jsonb; issued jsonb; sid uuid; state text; l jsonb; expected integer; actual integer; x record;
begin
 if p_kind='receipt' then
 select * into strict r from public.finance_receipts where id=p_id; sid:=r.direct_money_receipt_id; s:=r.draft_snapshot_json; issued:=r.issued_snapshot_json; state:=r.status;
 if s->>'document_kind'<>'receipt' or (s#>>'{money,cash_amount}')::numeric is distinct from r.cash_amount
 or (s#>>'{money,wht_amount}')::numeric is distinct from r.wht_amount or s#>>'{money,currency}' is distinct from r.currency
 or (s#>>'{money,received_on}')::date is distinct from r.receipt_date or s#>>'{customer,id}' is distinct from r.client_id::text
 then raise exception 'RECEIPT_SOURCE_INVALID'; end if;
 else
 select * into strict t from public.finance_tax_invoices where id=p_id; sid:=t.direct_money_receipt_id; s:=t.source_snapshot_json; issued:=t.issued_snapshot_json; state:=t.status;
 if t.draft_snapshot_json is distinct from public.document_direct_snapshot(s,t.decisions_json,t.issue_date)
 or s#>>'{customer,id}' is distinct from t.client_id::text then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
 select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id;
 if point.event_type<>'direct_money_received' or point.occurred_on is distinct from (s#>>'{money,received_on}')::date
 or point.evidence_json is distinct from jsonb_build_object('source',s->'source','money',s->'money','policy_version','vp_v1')
 or ((t.decisions_json->'no_earlier_event'='true') is true)<>(point.approved_at is not null) then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
 expected:=jsonb_array_length(s->'tax_lines');
 if expected<1 or (select count(*) from public.finance_tax_invoice_items where tax_invoice_id=t.id)<>expected
 or (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id)<>expected then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
 for l in select value from jsonb_array_elements(s->'tax_lines') loop
 select i.*,c.direct_money_receipt_id as cs,c.direct_source_line_id as cl,c.source_snapshot_json as snapshot,c.status as coverage_status,c.tax_point_event_id,
 c.amount_before_vat as cb,c.vat_amount as cv,c.total_amount as ct into strict x
 from public.finance_tax_invoice_items i join public.finance_tax_invoice_source_coverages c on c.tax_invoice_item_id=i.id
 where i.tax_invoice_id=t.id and c.tax_invoice_id=t.id and i.direct_source_line_id=(l->>'source_line_id')::uuid;
 if x.direct_money_receipt_id is distinct from sid or x.cs is distinct from sid or x.cl is distinct from x.direct_source_line_id
 or x.tax_point_event_id is distinct from point.id or x.snapshot is distinct from l or x.source_snapshot_json is distinct from l
 or x.amount_before_vat is distinct from (l->>'base')::numeric or x.vat_amount is distinct from (l->>'vat')::numeric
 or x.total_amount is distinct from (l->>'gross')::numeric or x.cb<>x.amount_before_vat or x.cv<>x.vat_amount or x.ct<>x.total_amount
 or x.coverage_status is distinct from (case state when 'draft' then 'reserved' when 'issued' then 'issued' else 'released' end) then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
 end loop;
 if state='issued' then
 if cardinality(public.document_direct_blockers(t.draft_snapshot_json))>0
 or issued-array['document','tax_point'] is distinct from t.draft_snapshot_json-'tax_point'
 or issued->'tax_point' is distinct from t.draft_snapshot_json->'tax_point'||to_jsonb(point)
 or issued#>>'{document,id}' is distinct from t.id::text or issued#>>'{document,tax_invoice_no}' is distinct from t.tax_invoice_no
 or (issued#>>'{document,issue_date}')::date is distinct from t.issue_date or (issued#>>'{document,issued_at}')::timestamptz is distinct from t.issued_at
 or issued#>>'{document,issued_by_user_id}' is distinct from t.issued_by_user_id::text
 or not exists(select 1 from public.finance_tax_invoice_audit_events where tax_invoice_id=t.id and event_type='issued' and actor_user_id=t.issued_by_user_id
 and event_payload_json->>'tax_invoice_no'=t.tax_invoice_no and (t.issue_date=point.occurred_on or event_payload_json->'delayed_issue_acknowledged'='true'))
 then raise exception 'TAX_INVOICE_ISSUED_EVIDENCE_INVALID'; end if;
 end if;
 end if;
 if sid is null or s->>'schema_version'<>'3' or s#>>'{source,type}' is distinct from 'direct_money_receipt'
 or s#>>'{source,id}' is distinct from sid::text or s#>>'{money,id}' is distinct from sid::text
 or s ? 'payment' or s ? 'invoice' or s ? 'invoices' or jsonb_typeof(s->'document_lines') is distinct from 'array'
 or jsonb_array_length(s->'document_lines')=0 or (select count(distinct entry->>'source_line_id') from jsonb_array_elements(s->'document_lines') entry)<>jsonb_array_length(s->'document_lines')
 or (s#>>'{money,cash_amount}')::numeric is distinct from (select sum((entry->>'cash')::numeric) from jsonb_array_elements(s->'document_lines') entry)
 or (s#>>'{money,wht_amount}')::numeric is distinct from (select sum((entry->>'wht')::numeric) from jsonb_array_elements(s->'document_lines') entry)
 or (s#>>'{money,settlement_amount}')::numeric is distinct from (select sum((entry->>'gross')::numeric) from jsonb_array_elements(s->'document_lines') entry)
 then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 if s#>>'{source,evidence,source_id}' is distinct from sid::text
 or s#>>'{source,fingerprint}' is distinct from md5(((s#>'{source,evidence}')-'source_fingerprint')::text)
 or s#>>'{source,evidence,source_fingerprint}' is distinct from s#>>'{source,fingerprint}'
 or exists(select 1 from jsonb_array_elements(s->'document_lines') item
 where not exists(select 1 from jsonb_array_elements(s#>'{source,evidence,lines}') original
 where original->>'source_line_id'=item->>'source_line_id' and original is not distinct from item-array['id','amount_before_vat','vat_amount','line_total','resolved_vat_treatment']))
 then raise exception 'DOCUMENT_SOURCE_INVALID'; end if;
 if p_kind='receipt' then
 expected:=case when state in ('issued','voided') then jsonb_array_length(s->'document_lines') else 0 end;
 select count(*) into actual from public.finance_receipt_invoice_allocations where receipt_id=r.id;
 if actual<>expected then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
 if state in ('issued','voided') then
 for l in select value from jsonb_array_elements(s->'document_lines') loop
 select * into strict x from public.finance_receipt_invoice_allocations where receipt_id=r.id and direct_source_line_id=(l->>'source_line_id')::uuid;
 if x.direct_money_receipt_id is distinct from sid or x.source_snapshot_json is distinct from l or x.currency<>r.currency
 or x.cash_allocated is distinct from (l->>'cash')::numeric or x.wht_allocated is distinct from (l->>'wht')::numeric then raise exception 'RECEIPT_ALLOCATION_MISMATCH'; end if;
 end loop;
 if issued-'receipt' is distinct from s or issued#>>'{receipt,id}' is distinct from r.id::text or issued#>>'{receipt,receipt_no}' is distinct from r.receipt_no
 or (issued#>>'{receipt,receipt_date}')::date is distinct from r.receipt_date or (issued#>>'{receipt,issued_at}')::timestamptz is distinct from r.issued_at
 or issued#>>'{receipt,issued_by_user_id}' is distinct from r.issued_by_user_id::text
 or not exists(select 1 from public.finance_receipt_audit_events where receipt_id=r.id and event_type='issued' and actor_user_id=r.issued_by_user_id and event_payload_json->>'receipt_no'=r.receipt_no)
 then raise exception 'RECEIPT_ISSUED_EVIDENCE_INVALID'; end if;
 end if;
 end if;
 if issued is not null and issued#>'{seller,logo_asset}' is distinct from public.document_logo_evidence(issued#>>'{seller,logo_asset,path}') then raise exception 'DOCUMENT_LOGO_EVIDENCE_INVALID'; end if;
end;
$integrity066$;

create function public.guard_direct_document_dependencies()
returns trigger language plpgsql security definer set search_path=public as $dependency066$
begin
 if (new.status is distinct from old.status or new.classification_json is distinct from old.classification_json)
 and (exists(select 1 from public.finance_receipts where direct_money_receipt_id=old.id and status in ('draft','issued'))
 or exists(select 1 from public.finance_tax_invoices where direct_money_receipt_id=old.id and status in ('draft','issued')))
 then raise exception 'DIRECT_DOCUMENT_DEPENDENCY_CORRECTION_REQUIRED'; end if;
 return new;
end;
$dependency066$;
create trigger direct_document_dependencies_066 before update on public.finance_direct_money_receipts for each row execute function public.guard_direct_document_dependencies();

-- SHARED EXISTING ENGINE DISPATCH (generated; predecessor branches unchanged).
create or replace function public.issue_finance_receipt(p_receipt_id uuid,p_acknowledged boolean,p_reviewed_snapshot_json jsonb default null)
returns uuid language plpgsql security definer set search_path = public
as $receipt_issue$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb; v_number text; v_now timestamptz := now();
begin
  if exists(select 1 from public.finance_receipts where id=p_receipt_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt',p_receipt_id,'issue',jsonb_build_object('ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json));
  end if;
  if not public.current_user_can_issue_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  -- Retry must not consult changed master data or allocate another number.
  select * into v_receipt from public.finance_receipts where id = p_receipt_id;
  if v_receipt.status = 'issued' then return p_receipt_id; end if;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  perform public.assert_finance_document_route(v_payment_id,'receipt');
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_snapshot is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  if p_reviewed_snapshot_json is distinct from v_receipt.draft_snapshot_json then raise exception 'RECEIPT_REVIEW_REQUIRED'; end if;
  v_number := public.generate_finance_document_no('receipt',v_receipt.receipt_date);
  v_snapshot := v_snapshot || jsonb_build_object('receipt',jsonb_build_object('id',p_receipt_id,
    'receipt_no',v_number,'receipt_date',v_receipt.receipt_date,'issued_at',v_now,'issued_by_user_id',auth.uid(),
    'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id = auth.uid()),
    'replaces_receipt_id',v_receipt.replaces_receipt_id));
  update public.finance_receipts set status = 'issued',receipt_no = v_number,issued_snapshot_json = v_snapshot,
    issued_at = v_now,issued_by_user_id = auth.uid(),updated_at = v_now where id = p_receipt_id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,
    cash_allocated,wht_allocated,source_snapshot_json)
  select p_receipt_id,(item->>'invoice_id')::uuid,item->>'invoice_no',item->>'currency',
    (item->>'cash_allocated')::numeric,(item->>'wht_allocated')::numeric,item
  from jsonb_array_elements(v_snapshot->'invoices') as entries(item);
  perform public.record_finance_receipt_audit(p_receipt_id,'issued',jsonb_build_object(
    'payment_id',v_payment_id,'receipt_no',v_number,'cash_amount',v_receipt.cash_amount,
    'wht_amount',v_receipt.wht_amount,'settlement_amount',v_receipt.settlement_amount,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'tax_invoice_created',false));
  return p_receipt_id;
end;
$receipt_issue$;

create or replace function public.refresh_finance_receipt_draft(p_receipt_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $receipt_refresh$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype; v_snapshot jsonb;
begin
  if exists(select 1 from public.finance_receipts where id=p_receipt_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt',p_receipt_id,'refresh',jsonb_build_object());
  end if;
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  v_snapshot := public.build_finance_receipt_source(v_payment_id);
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  if v_snapshot = v_receipt.draft_snapshot_json then return p_receipt_id; end if;
  update public.finance_receipts set draft_snapshot_json = v_snapshot,
    receipt_date = (v_snapshot #>> '{payment,received_on}')::date,
    currency = v_snapshot #>> '{payment,currency}',cash_amount = (v_snapshot #>> '{payment,cash_amount}')::numeric,
    wht_amount = (v_snapshot #>> '{payment,wht_amount}')::numeric,updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'draft_refreshed',jsonb_build_object('payment_id',v_payment_id));
  return p_receipt_id;
end;
$receipt_refresh$;

create or replace function public.cancel_finance_receipt_draft(p_receipt_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $receipt_cancel$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if exists(select 1 from public.finance_receipts where id=p_receipt_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt',p_receipt_id,'cancel',jsonb_build_object('reason',p_reason));
  end if;
  if not public.current_user_can_manage_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status = 'cancelled' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
  update public.finance_receipts set status = 'cancelled',cancelled_at = now(),cancelled_by_user_id = auth.uid(),
    cancel_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'payment_changed',false));
  return p_receipt_id;
end;
$receipt_cancel$;

create or replace function public.void_finance_receipt(p_receipt_id uuid,p_reason text,p_acknowledged boolean)
returns uuid language plpgsql security definer set search_path = public
as $receipt_void$
declare v_payment_id uuid; v_receipt public.finance_receipts%rowtype;
begin
  if exists(select 1 from public.finance_receipts where id=p_receipt_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt',p_receipt_id,'void',jsonb_build_object('reason',p_reason,'ack',p_acknowledged));
  end if;
  if not public.current_user_can_void_finance_receipts() then raise exception 'RECEIPT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'RECEIPT_VOID_ACK_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason) > 2000 then raise exception 'RECEIPT_REASON_REQUIRED'; end if;
  select payment_id into v_payment_id from public.finance_receipts where id = p_receipt_id;
  if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
  perform 1 from public.finance_payments where id = v_payment_id for update;
  select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;
  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if v_receipt.status = 'voided' then return p_receipt_id; end if;
  if v_receipt.status <> 'issued' then raise exception 'RECEIPT_ISSUED_REQUIRED'; end if;
  update public.finance_receipts set status = 'voided',voided_at = now(),voided_by_user_id = auth.uid(),
    void_reason = btrim(p_reason),updated_at = now() where id = p_receipt_id;
  perform public.record_finance_receipt_audit(p_receipt_id,'voided',jsonb_build_object(
    'reason',btrim(p_reason),'receipt_no',v_receipt.receipt_no,'payment_changed',false,'cash_created',false));
  return p_receipt_id;
end;
$receipt_void$;

create or replace function public.save_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $save_draft$
declare t public.finance_tax_invoices%rowtype; snapshot jsonb; pid uuid;
begin
  if exists(select 1 from public.finance_tax_invoices where id=p_tax_invoice_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('tax_invoice',p_tax_invoice_id,'save',jsonb_build_object('date',p_issue_date,'decisions',p_decisions_json,'expected',p_expected_updated_at));
  end if;
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if p_issue_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
    or p_issue_date<(t.source_snapshot_json #>> '{payment,received_on}')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  snapshot:=public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,p_decisions_json,p_issue_date);
  if snapshot=t.draft_snapshot_json and p_decisions_json=t.decisions_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=case when p_decisions_json->'no_earlier_event'='true'::jsonb then now() end,
    approved_by_user_id=case when p_decisions_json->'no_earlier_event'='true'::jsonb then auth.uid() end where tax_invoice_id=t.id;
  update public.finance_tax_invoices set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=snapshot,updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_saved',jsonb_build_object('previous_decisions',t.decisions_json,'decisions',p_decisions_json,'issue_date',p_issue_date));
  return t.id;
end;
$save_draft$;

create or replace function public.refresh_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $refresh_draft$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid;
begin
  if exists(select 1 from public.finance_tax_invoices where id=p_tax_invoice_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('tax_invoice',p_tax_invoice_id,'refresh',jsonb_build_object('expected',p_expected_updated_at));
  end if;
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  source:=public.build_finance_tax_invoice_source(pid);
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found or t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  if source->'invoice_item' is distinct from t.source_snapshot_json->'invoice_item'
    or source->'payment' is distinct from t.source_snapshot_json->'payment'
  then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if source=t.source_snapshot_json then return t.id; end if;
  update public.finance_tax_point_events set approved_at=null,approved_by_user_id=null where tax_invoice_id=t.id;
  update public.finance_tax_invoices set source_snapshot_json=source,decisions_json='{}',
    draft_snapshot_json=public.finance_tax_invoice_draft_snapshot(source,'{}',t.issue_date),updated_at=clock_timestamp() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'draft_refreshed',jsonb_build_object('approvals_reset',true));
  return t.id;
end;
$refresh_draft$;

create or replace function public.issue_finance_tax_invoice(p_tax_invoice_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean)
returns uuid language plpgsql security definer set search_path=public as $issue$
declare t public.finance_tax_invoices%rowtype; source jsonb; pid uuid; number text; event public.finance_tax_point_events%rowtype; snapshot jsonb; moment timestamptz:=now(); b text[];
begin
  if exists(select 1 from public.finance_tax_invoices where id=p_tax_invoice_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('tax_invoice',p_tax_invoice_id,'issue',jsonb_build_object('ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json,'delay',p_delayed_issue_acknowledged));
  end if;
  if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'TAX_INVOICE_ISSUE_ACK_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='issued' then return t.id; end if;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  perform public.assert_finance_document_route(pid,'tax_invoice');
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  source:=public.build_finance_tax_invoice_source(pid);
  if source is distinct from t.source_snapshot_json then raise exception 'TAX_INVOICE_SOURCE_CHANGED'; end if;
  if p_reviewed_snapshot_json is distinct from t.draft_snapshot_json then raise exception 'TAX_INVOICE_STALE_REVIEW'; end if;
  b:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(b)>0 then raise exception using message=b[1]; end if;
  select * into strict event from public.finance_tax_point_events where tax_invoice_id=t.id;
  if event.approved_at is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if t.issue_date<event.occurred_on or t.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if t.issue_date>event.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id and status='reserved' for update;
  number:=public.generate_finance_document_no('tax_invoice',t.issue_date);
  snapshot:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(event),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,
      'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid())));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_at=moment,issued_by_user_id=auth.uid(),issued_snapshot_json=snapshot,updated_at=moment where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'tax_point_date',event.occurred_on,'issue_date',t.issue_date,
    'delayed_issue_acknowledged',t.issue_date>event.occurred_on and p_delayed_issue_acknowledged,'decisions',t.decisions_json,
    'documentary_only',true,'payment_changed',false,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false,'receipt_changed',false));
  return t.id;
end;
$issue$;

create or replace function public.cancel_finance_tax_invoice_draft(p_tax_invoice_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $cancel$
declare t public.finance_tax_invoices%rowtype; pid uuid;
begin
  if exists(select 1 from public.finance_tax_invoices where id=p_tax_invoice_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('tax_invoice',p_tax_invoice_id,'cancel',jsonb_build_object('reason',p_reason));
  end if;
  if not public.current_user_can_manage_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'TAX_INVOICE_REASON_REQUIRED'; end if;
  select payment_id into pid from public.finance_tax_invoices where id=p_tax_invoice_id;
  perform 1 from public.finance_payments where id=pid for update;
  select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;
  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
  if not found then raise exception 'TAX_INVOICE_NOT_FOUND'; end if;
  if t.status='cancelled' then return t.id; end if;
  if t.status<>'draft' then raise exception 'TAX_INVOICE_DRAFT_REQUIRED'; end if;
  update public.finance_tax_invoice_source_coverages set status='released' where tax_invoice_id=t.id;
  update public.finance_tax_invoices set status='cancelled',cancelled_at=now(),cancelled_by_user_id=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now() where id=t.id;
  perform public.record_finance_tax_invoice_audit(t.id,'cancelled',jsonb_build_object('reason',btrim(p_reason),'coverage_released',true));
  return t.id;
end;
$cancel$;

create or replace function public.save_finance_combined_document_draft(p_combined_id uuid,p_issue_date date,p_decisions_json jsonb,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $combined_save$
declare c public.finance_combined_documents%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if exists(select 1 from public.finance_combined_documents where id=p_combined_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt_tax_invoice',p_combined_id,'save',jsonb_build_object('date',p_issue_date,'decisions',p_decisions_json,'expected',p_expected_updated_at));
  end if;
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if c.updated_at is distinct from p_expected_updated_at then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  perform public.tax_save_pre040(t.id,p_issue_date,p_decisions_json,t.updated_at);
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  update public.finance_combined_documents set issue_date=p_issue_date,decisions_json=p_decisions_json,draft_snapshot_json=t.draft_snapshot_json,updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'draft_saved',jsonb_build_object('decisions',p_decisions_json,'issue_date',p_issue_date),auth.uid());
  return c.id;
end;
$combined_save$;

create or replace function public.refresh_finance_combined_document_draft(p_combined_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $combined_refresh$
declare c public.finance_combined_documents%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if exists(select 1 from public.finance_combined_documents where id=p_combined_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt_tax_invoice',p_combined_id,'refresh',jsonb_build_object('expected',p_expected_updated_at));
  end if;
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if c.updated_at is distinct from p_expected_updated_at then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  perform public.receipt_refresh_pre040(c.receipt_id);
  perform public.tax_refresh_pre040(t.id,t.updated_at);
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  if (t.source_snapshot_json,t.draft_snapshot_json,t.decisions_json) is not distinct from
    (c.source_snapshot_json,c.draft_snapshot_json,c.decisions_json) then return c.id; end if;
  update public.finance_combined_documents set source_snapshot_json=t.source_snapshot_json,draft_snapshot_json=t.draft_snapshot_json,
    decisions_json=t.decisions_json,updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'draft_refreshed',jsonb_build_object('approvals_reset',true),auth.uid());
  return c.id;
end;
$combined_refresh$;

create or replace function public.issue_finance_combined_document(p_combined_id uuid,p_reviewed_snapshot_json jsonb,p_acknowledged boolean,p_delayed_issue_acknowledged boolean,p_external_receipt_checked boolean,p_external_tax_checked boolean)
returns uuid language plpgsql security definer set search_path=public as $combined_issue$
declare c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype;
  point public.finance_tax_point_events%rowtype; source jsonb; rs jsonb; ts jsonb; number text; moment timestamptz:=now(); blockers text[];
begin
  if exists(select 1 from public.finance_combined_documents where id=p_combined_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt_tax_invoice',p_combined_id,'issue',jsonb_build_object('ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json,'delay',p_delayed_issue_acknowledged,'receipt_checked',p_external_receipt_checked,'tax_checked',p_external_tax_checked));
  end if;
  if not public.current_user_can_issue_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  if p_acknowledged is distinct from true then raise exception 'DOCUMENT_ISSUE_ACK_REQUIRED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status='issued' then return c.id; end if;
  if c.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  if p_external_receipt_checked is distinct from true or p_external_tax_checked is distinct from true then raise exception 'DOCUMENT_EXTERNAL_CHECK_REQUIRED'; end if;
  if public.finance_payment_document_decision(c.payment_id)->>'decision'<>'combined_receipt_tax_invoice' then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
  source:=public.build_finance_document_tax_source(c.payment_id);
  if source is distinct from c.source_snapshot_json then raise exception 'DOCUMENT_SOURCE_CHANGED'; end if;
  if c.draft_snapshot_json is distinct from p_reviewed_snapshot_json then raise exception 'DOCUMENT_STALE_REVIEW'; end if;
  select * into strict r from public.finance_receipts where id=c.receipt_id for update;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id for update;
  if r.status<>'draft' or t.status<>'draft' then raise exception 'DOCUMENT_DRAFT_REQUIRED'; end if;
  blockers:=public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json);
  if cardinality(blockers)>0 then raise exception using message=blockers[1]; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id for update;
  if point.approved_at is null or point.approved_by_user_id is null then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  if c.issue_date<point.occurred_on or c.issue_date>(moment at time zone 'Asia/Bangkok')::date then raise exception 'TAX_INVOICE_ISSUE_DATE_INVALID'; end if;
  if c.issue_date>point.occurred_on and p_delayed_issue_acknowledged is distinct from true then raise exception 'TAX_INVOICE_DELAY_ACK_REQUIRED'; end if;
  rs:=public.build_finance_receipt_source(c.payment_id);
  if rs is distinct from r.draft_snapshot_json then raise exception 'RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED'; end if;
  perform 1 from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id order by invoice_item_id for update;
  number:=public.generate_finance_document_no('receipt_tax_invoice',c.issue_date);
  rs:=rs||jsonb_build_object('receipt',jsonb_build_object('id',r.id,'receipt_no',number,'receipt_date',r.receipt_date,'issued_at',moment,
    'issued_by_user_id',auth.uid(),'issued_by_name',(select coalesce(nullif(full_name,''),email) from public.user_profiles where id=auth.uid()),'replaces_receipt_id',r.replaces_receipt_id,'combined_document_id',c.id));
  ts:=t.draft_snapshot_json||jsonb_build_object('tax_point',t.draft_snapshot_json->'tax_point'||to_jsonb(point),
    'document',jsonb_build_object('id',t.id,'tax_invoice_no',number,'issue_date',t.issue_date,'issued_at',moment,'issued_by_user_id',auth.uid(),'combined_document_id',c.id));
  update public.finance_tax_invoice_source_coverages set status='issued' where tax_invoice_id=t.id;
  update public.finance_receipts set status='issued',receipt_no=number,issued_snapshot_json=rs,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment where id=r.id;
  insert into public.finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,cash_allocated,wht_allocated,source_snapshot_json)
  select r.id,(value->>'invoice_id')::uuid,value->>'invoice_no',value->>'currency',(value->>'cash_allocated')::numeric,(value->>'wht_allocated')::numeric,value
    from jsonb_array_elements(rs->'invoices');
  update public.finance_tax_invoices set status='issued',tax_invoice_no=number,issued_snapshot_json=ts,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment where id=t.id;
  update public.finance_combined_documents set status='issued',combined_no=number,issued_at=moment,issued_by_user_id=auth.uid(),updated_at=moment,
    issued_snapshot_json=jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',c.id,'combined_no',number,
      'issued_at',moment,'issue_date',c.issue_date,'receipt',rs,'tax_invoice',ts) where id=c.id;
  perform public.record_finance_receipt_audit(r.id,'issued',jsonb_build_object('receipt_no',number,'combined_document_id',c.id,'documentary_only',true));
  perform public.record_finance_tax_invoice_audit(t.id,'issued',jsonb_build_object('tax_invoice_no',number,'combined_document_id',c.id,'delayed_issue_acknowledged',p_delayed_issue_acknowledged,'documentary_only',true));
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'issued',jsonb_build_object('combined_no',number,'receipt_id',r.id,'tax_invoice_id',t.id,'external_receipt_checked',true,'external_tax_checked',true,
    'documentary_only',true,'cash_created',false,'ledger_created',false,'compensation_created',false,'revenue_allocation_created',false),auth.uid());
  return c.id;
end;
$combined_issue$;

create or replace function public.cancel_finance_combined_document_draft(p_combined_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $combined_cancel$
declare c public.finance_combined_documents%rowtype;
begin
  if exists(select 1 from public.finance_combined_documents where id=p_combined_id and direct_money_receipt_id is not null) then
    return public.document_direct_action('receipt_tax_invoice',p_combined_id,'cancel',jsonb_build_object('reason',p_reason));
  end if;
  if not public.current_user_can_manage_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.finance_payments where id=(select payment_id from public.finance_combined_documents where id=p_combined_id) for update;
  select * into strict c from public.finance_combined_documents where id=p_combined_id for update;
  if c.status='cancelled' then return c.id; end if;
  if c.status<>'draft' then raise exception 'DOCUMENT_CORRECTION_WORKFLOW_REQUIRED'; end if;
  perform public.receipt_cancel_pre040(c.receipt_id,p_reason);
  perform public.tax_cancel_pre040(c.tax_invoice_id,p_reason);
  update public.finance_combined_documents set status='cancelled',cancel_reason=btrim(p_reason),updated_at=clock_timestamp() where id=c.id;
  insert into public.finance_combined_document_audit_events(combined_document_id,event_type,event_payload_json,actor_user_id)
  values(c.id,'cancelled',jsonb_build_object('reason',btrim(p_reason)),auth.uid());
  return c.id;
end;
$combined_cancel$;

create or replace function public.finance_tax_invoice_draft_snapshot(p_source jsonb,p_decisions jsonb,p_issue_date date)
returns jsonb language plpgsql immutable set search_path=public as $snapshot$
declare envelope jsonb:=p_source->'buyer_tax_profile'; profile jsonb:=envelope->'profile'; controlled jsonb; k text;
  decisions jsonb:=coalesce(p_decisions,'{}'); reviewed boolean:=envelope->>'status'='verified';
begin
 if p_source->>'schema_version'='3' then return public.document_direct_snapshot(p_source,p_decisions,p_issue_date); end if;
  -- Existing frozen Draft/Issued sources retain their exact predecessor semantics.
  if envelope is null then return public.document_tax_snapshot_pre042(p_source,p_decisions,p_issue_date); end if;
  if jsonb_typeof(decisions) is distinct from 'object' then raise exception 'TAX_INVOICE_DECISIONS_INVALID'; end if;
  controlled:=jsonb_build_object('buyer_vat_registered',case when reviewed then profile->'vat_registered' end,
    'buyer_branch_type',case when reviewed then profile->'branch_type' end,
    'buyer_branch_code',case when reviewed then profile->'branch_code' end,
    'identity_evidence',case when reviewed then profile->'identity_evidence' end);
  foreach k in array array['buyer_vat_registered','buyer_branch_type','buyer_branch_code','identity_evidence'] loop
    if decisions ? k and decisions->k is distinct from controlled->k then raise exception 'CUSTOMER_TAX_PROFILE_OVERRIDE_BLOCKED'; end if;
  end loop;
  if decisions ? 'customer_address' or decisions ? 'customer_tax_id' then raise exception 'CUSTOMER_TAX_PROFILE_OVERRIDE_BLOCKED'; end if;
  return public.document_tax_snapshot_pre042(p_source,decisions||controlled,p_issue_date);
end;
$snapshot$;

create or replace function public.finance_tax_invoice_issue_blockers(p_snapshot jsonb)
returns text[] language plpgsql immutable set search_path=public as $blockers_v2$
declare result text[]:='{}'; item jsonb; treatment text; b text[];
begin
 if p_snapshot->>'schema_version'='3' then return public.document_direct_blockers(p_snapshot); end if;
  if p_snapshot->>'schema_version'<>'2' then return public.tax_blockers_pre040(p_snapshot); end if;
  if jsonb_typeof(p_snapshot->'invoice_items') is distinct from 'array' or jsonb_array_length(p_snapshot->'invoice_items')=0 then return array['DOCUMENT_SOURCE_INVALID']; end if;
  for item in select value from jsonb_array_elements(p_snapshot->'invoice_items') loop
    treatment:=item #>> '{resolved_vat_treatment,treatment}';
    b:=public.tax_blockers_pre040(p_snapshot||jsonb_build_object('invoice_item',item,
      'tax_treatment',case when treatment='standard_rate' then 'standard_rated' else treatment end,'treatment_reason',item #> '{resolved_vat_treatment,reason}'));
    result:=result||b;
  end loop;
  return array(select distinct e from unnest(result) e order by e);
end;
$blockers_v2$;

create or replace function public.validate_finance_receipt_integrity()
returns trigger language plpgsql security definer set search_path = public
as $receipt_integrity$
declare v_receipt public.finance_receipts%rowtype; v_id uuid; v_cash numeric; v_wht numeric; v_count bigint;
begin
  if tg_table_name = 'finance_receipts' then v_id := new.id;
  else v_id := new.receipt_id; end if;
  select * into strict v_receipt from public.finance_receipts where id = v_id;
  if v_receipt.direct_money_receipt_id is not null then perform public.validate_direct_document('receipt',v_id); return new; end if;
  if v_receipt.replaces_receipt_id is not null and not exists (
    select 1 from public.finance_receipts prior where prior.id = v_receipt.replaces_receipt_id
      and prior.payment_id = v_receipt.payment_id and prior.status = 'voided'
  ) then raise exception 'RECEIPT_REPLACEMENT_SOURCE_INVALID'; end if;
  select count(*),coalesce(sum(cash_allocated),0),coalesce(sum(wht_allocated),0)
    into v_count,v_cash,v_wht from public.finance_receipt_invoice_allocations where receipt_id = v_id;
  if v_receipt.status in ('draft','cancelled') and v_count <> 0 then raise exception 'RECEIPT_DRAFT_COVERAGE_INVALID'; end if;
  if v_receipt.status in ('issued','voided') then
    if v_count = 0 or v_cash <> v_receipt.cash_amount or v_wht <> v_receipt.wht_amount
      or (v_receipt.issued_snapshot_json #>> '{receipt,receipt_no}') is distinct from v_receipt.receipt_no
      or (v_receipt.issued_snapshot_json #>> '{receipt,id}') is distinct from v_id::text
      or (v_receipt.issued_snapshot_json #>> '{receipt,receipt_date}') is distinct from v_receipt.receipt_date::text
      or (v_receipt.issued_snapshot_json #>> '{payment,id}') is distinct from v_receipt.payment_id::text
      or (v_receipt.issued_snapshot_json #>> '{payment,currency}') is distinct from v_receipt.currency
      or (v_receipt.issued_snapshot_json #>> '{payment,cash_amount}')::numeric is distinct from v_receipt.cash_amount
      or (v_receipt.issued_snapshot_json #>> '{payment,wht_amount}')::numeric is distinct from v_receipt.wht_amount
      or (v_receipt.issued_snapshot_json #>> '{payment,settlement_amount}')::numeric is distinct from v_receipt.settlement_amount
      or v_count <> jsonb_array_length(v_receipt.issued_snapshot_json->'invoices')
      or (v_receipt.issued_snapshot_json - 'receipt') is distinct from v_receipt.draft_snapshot_json
      or exists (select 1 from public.finance_receipt_invoice_allocations a where a.receipt_id = v_id
        and (a.currency <> v_receipt.currency
          or (a.source_snapshot_json->>'invoice_id') is distinct from a.invoice_id::text
          or (a.source_snapshot_json->>'invoice_no') is distinct from a.invoice_no
          or (a.source_snapshot_json->>'currency') is distinct from a.currency
          or (a.source_snapshot_json->>'cash_allocated')::numeric is distinct from a.cash_allocated
          or (a.source_snapshot_json->>'wht_allocated')::numeric is distinct from a.wht_allocated
          or (a.source_snapshot_json->>'settlement_allocated')::numeric is distinct from a.settlement_allocated
          or not (v_receipt.issued_snapshot_json->'invoices' @> jsonb_build_array(a.source_snapshot_json))))
    then raise exception 'RECEIPT_FROZEN_COVERAGE_INVALID'; end if;
  end if;
  return null;
end;
$receipt_integrity$;

create or replace function public.validate_finance_tax_invoice_integrity()
returns trigger language plpgsql security definer set search_path=public as $integrity$
declare t public.finance_tax_invoices%rowtype; v_id uuid; c record; item jsonb; point public.finance_tax_point_events%rowtype;
begin
  if tg_table_name='finance_tax_invoices' then v_id:=new.id; else v_id:=new.tax_invoice_id; end if;
  select * into strict t from public.finance_tax_invoices where finance_tax_invoices.id=v_id;
  if t.direct_money_receipt_id is not null then perform public.validate_direct_document('tax_invoice',v_id); return new; end if;
  if t.source_snapshot_json->>'schema_version'='2' then
    perform public.validate_finance_document_tax_integrity(t.id); return new;
  end if;
  item:=t.source_snapshot_json->'invoice_item';
  if t.draft_snapshot_json is distinct from public.finance_tax_invoice_draft_snapshot(t.source_snapshot_json,t.decisions_json,t.issue_date)
    or t.payment_id::text is distinct from t.source_snapshot_json #>> '{payment,id}'
    or t.invoice_id::text is distinct from t.source_snapshot_json #>> '{invoice,id}'
    or t.client_id::text is distinct from t.source_snapshot_json #>> '{customer,id}'
  then raise exception 'TAX_INVOICE_SOURCE_INVALID'; end if;
  if (select count(*) from public.finance_tax_invoice_items where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_point_events where tax_invoice_id=t.id)<>1
    or (select count(*) from public.finance_tax_invoice_source_coverages where tax_invoice_id=t.id)<>1
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  select * into strict point from public.finance_tax_point_events where tax_invoice_id=t.id;
  if point.event_type<>'payment_received' or point.occurred_on is distinct from (t.source_snapshot_json #>> '{payment,received_on}')::date
    or point.evidence_json is distinct from jsonb_build_object('payment',t.source_snapshot_json->'payment','policy_version','vp_v1')
    or ((t.decisions_json->'no_earlier_event'='true'::jsonb) is true)<>(point.approved_at is not null)
  then raise exception 'TAX_INVOICE_TAX_POINT_APPROVAL_REQUIRED'; end if;
  select coverage.*,i.invoice_item_id as item_source_id,i.amount_before_vat as ib,i.vat_amount as iv,i.total_amount as it,i.source_snapshot_json as frozen_item
  into strict c from public.finance_tax_invoice_source_coverages coverage join public.finance_tax_invoice_items i on i.id=coverage.tax_invoice_item_id
  where coverage.tax_invoice_id=t.id and i.tax_invoice_id=t.id;
  if c.invoice_item_id<>c.item_source_id or c.invoice_item_id::text is distinct from item->>'id' or c.tax_point_event_id<>point.id
    or c.amount_before_vat<>c.ib or c.vat_amount<>c.iv or c.total_amount<>c.it
    or c.ib is distinct from (item->>'amount_before_vat')::numeric or c.iv is distinct from (item->>'vat_amount')::numeric or c.it is distinct from (item->>'line_total')::numeric
    or c.frozen_item is distinct from item or c.status<>(case t.status when 'draft' then 'reserved' when 'issued' then 'issued' else 'released' end)
    or c.source_snapshot_json is distinct from jsonb_build_object('invoice_id',t.source_snapshot_json #> '{invoice,id}',
      'payment_id',t.payment_id,'invoice_item',item,'rule','single_line_full_payment_v1')
  then raise exception 'TAX_INVOICE_COVERAGE_INVALID'; end if;
  if t.status='issued' then
    if cardinality(public.finance_tax_invoice_issue_blockers(t.draft_snapshot_json))>0
      or t.issued_snapshot_json->>'document_kind' is distinct from 'tax_invoice'
      or t.issued_snapshot_json->'schema_version' is distinct from '1'::jsonb
      or (t.issued_snapshot_json-array['document','tax_point']) is distinct from (t.draft_snapshot_json-'tax_point')
      or t.issued_snapshot_json #>> '{document,tax_invoice_no}' is distinct from t.tax_invoice_no
      or t.issued_snapshot_json #>> '{document,id}' is distinct from t.id::text
      or (t.issued_snapshot_json #>> '{document,issue_date}')::date is distinct from t.issue_date
      or (t.issued_snapshot_json #>> '{document,issued_at}')::timestamptz is distinct from t.issued_at
      or t.issued_snapshot_json #>> '{document,issued_by_user_id}' is distinct from t.issued_by_user_id::text
      or t.issued_snapshot_json->'tax_point' is distinct from (t.draft_snapshot_json->'tax_point'||to_jsonb(point))
      or t.issued_snapshot_json #> '{seller,logo_asset}' is distinct from public.document_logo_evidence(t.issued_snapshot_json #>> '{seller,logo_asset,path}')
    then raise exception 'TAX_INVOICE_ISSUED_EVIDENCE_INVALID'; end if;
    if not exists(select 1 from public.finance_tax_invoice_audit_events where tax_invoice_id=t.id and event_type='issued'
      and event_payload_json->>'tax_invoice_no'=t.tax_invoice_no and actor_user_id=t.issued_by_user_id
      and (t.issue_date=point.occurred_on or event_payload_json->'delayed_issue_acknowledged'='true'::jsonb))
    then raise exception 'TAX_INVOICE_ISSUE_AUDIT_REQUIRED'; end if;
  end if;
  return new;
end;
$integrity$;

create or replace function public.guard_receipt_logo_issue()
returns trigger language plpgsql security definer set search_path = public
as $logo_issue$
begin
  if new.status = 'issued' and old.status is distinct from 'issued' then
    if coalesce(new.issued_snapshot_json->>'schema_version','') not in ('2','3')
      or (new.issued_snapshot_json #> '{seller,logo_asset}') is distinct from
        public.document_logo_evidence(new.issued_snapshot_json #>> '{seller,logo_asset,path}') then
      raise exception 'RECEIPT_LOGO_EVIDENCE_REQUIRED';
    end if;
  end if;
  return new;
end;
$logo_issue$;

create or replace function public.guard_finance_receipt_lifecycle()
returns trigger language plpgsql set search_path = public
as $receipt_lifecycle$
begin
  if tg_op = 'DELETE' then raise exception 'RECEIPT_HISTORY_IMMUTABLE'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'RECEIPT_DRAFT_REQUIRED'; end if;
    return new;
  end if;
  if new.direct_money_receipt_id is distinct from old.direct_money_receipt_id or new.id is distinct from old.id or new.payment_id is distinct from old.payment_id
    or new.client_id is distinct from old.client_id or new.replaces_receipt_id is distinct from old.replaces_receipt_id
    or new.created_at is distinct from old.created_at or new.created_by_user_id is distinct from old.created_by_user_id
    or new.external_receipt_checked_at is distinct from old.external_receipt_checked_at
    or new.external_receipt_checked_by_user_id is distinct from old.external_receipt_checked_by_user_id
  then raise exception 'RECEIPT_SOURCE_IMMUTABLE'; end if;
  if old.status = 'draft' and new.status in ('draft','issued','cancelled') then return new; end if;
  if old.status = 'issued' and new.status = 'voided' and
    (to_jsonb(new) - array['status','voided_at','voided_by_user_id','void_reason','updated_at','settlement_amount'])
      = (to_jsonb(old) - array['status','voided_at','voided_by_user_id','void_reason','updated_at','settlement_amount'])
  then return new; end if;
  raise exception 'RECEIPT_HISTORY_IMMUTABLE';
end;
$receipt_lifecycle$;

create or replace function public.validate_finance_combined_document()
returns trigger language plpgsql security definer set search_path=public as $combined_integrity$
declare cid uuid; c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; t public.finance_tax_invoices%rowtype;
begin
  if tg_table_name='finance_combined_documents' then cid:=new.id; else cid:=new.combined_document_id; end if;
  if cid is null then
    if tg_op='UPDATE' and old.combined_document_id is not null then raise exception 'DOCUMENT_PAIR_IMMUTABLE'; end if;
    return new;
  end if;
  if tg_op='UPDATE' and tg_table_name in ('finance_receipts','finance_tax_invoices') then
    if old.combined_document_id is not null and old.combined_document_id is distinct from new.combined_document_id then raise exception 'DOCUMENT_PAIR_IMMUTABLE'; end if;
  end if;
  select * into strict c from public.finance_combined_documents where id=cid;
  select * into strict r from public.finance_receipts where id=c.receipt_id;
  select * into strict t from public.finance_tax_invoices where id=c.tax_invoice_id;
  if r.payment_id is distinct from c.payment_id or t.payment_id is distinct from c.payment_id or r.direct_money_receipt_id is distinct from c.direct_money_receipt_id or t.direct_money_receipt_id is distinct from c.direct_money_receipt_id or r.combined_document_id is distinct from c.id or t.combined_document_id is distinct from c.id
    or r.status<>c.status or t.status<>c.status or c.issue_date<>t.issue_date
    or c.draft_snapshot_json is distinct from t.draft_snapshot_json or c.source_snapshot_json is distinct from t.source_snapshot_json
    or c.decisions_json is distinct from t.decisions_json or not c.external_receipt_checked
  then raise exception 'DOCUMENT_PAIR_INVALID'; end if;
  if c.status='issued' then
    if c.combined_no is distinct from r.receipt_no or c.combined_no is distinct from t.tax_invoice_no
      or c.issued_at is distinct from r.issued_at or c.issued_at is distinct from t.issued_at
      or c.issued_by_user_id is distinct from r.issued_by_user_id or c.issued_by_user_id is distinct from t.issued_by_user_id
      or c.issued_snapshot_json is distinct from jsonb_build_object('schema_version',1,'document_kind','receipt_tax_invoice','combined_document_id',c.id,
        'combined_no',c.combined_no,'issued_at',c.issued_at,'issue_date',c.issue_date,'receipt',r.issued_snapshot_json,'tax_invoice',t.issued_snapshot_json)
      or not exists(select 1 from public.finance_combined_document_audit_events where combined_document_id=c.id and event_type='issued'
        and event_payload_json->>'combined_no'=c.combined_no and actor_user_id=c.issued_by_user_id)
    then raise exception 'DOCUMENT_PAIR_ISSUED_EVIDENCE_INVALID'; end if;
  end if;
  return new;
end;
$combined_integrity$;

create or replace function public.tax_correction_source(p_tax_id uuid,p_combined_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
declare t public.finance_tax_invoices%rowtype; c public.finance_combined_documents%rowtype; r public.finance_receipts%rowtype; replacement record;
begin
 select * into strict t from public.finance_tax_invoices where id=p_tax_id;
 if t.status<>'issued' or t.issued_snapshot_json is null then raise exception 'TAX_CORRECTION_ISSUED_ORIGINAL_REQUIRED'; end if;
 if t.combined_document_id is distinct from p_combined_id then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;
 if p_combined_id is not null then
   select * into strict c from public.finance_combined_documents where id=p_combined_id;
   select * into strict r from public.finance_receipts where id=c.receipt_id;
   if c.status<>'issued' or r.status<>'issued' or c.tax_invoice_id<>t.id or c.payment_id is distinct from t.payment_id or r.payment_id is distinct from t.payment_id or c.direct_money_receipt_id is distinct from t.direct_money_receipt_id or r.direct_money_receipt_id is distinct from t.direct_money_receipt_id
     or r.combined_document_id<>c.id or r.receipt_no<>c.combined_no or t.tax_invoice_no<>c.combined_no
     or c.issued_snapshot_json->'tax_invoice' is distinct from t.issued_snapshot_json
     or c.issued_snapshot_json->'receipt' is distinct from r.issued_snapshot_json
   then raise exception 'TAX_CORRECTION_PAIR_INVALID'; end if;
 end if;
 select x.id,d.issued_snapshot_json into replacement from public.finance_tax_document_corrections x
 join public.finance_tax_correction_documents d on d.id=x.id
 where x.original_tax_invoice_id=t.id and x.correction_mode='cancel_and_reissue' and x.status='issued'
 and not exists(select 1 from public.finance_tax_document_corrections later
   where later.source_correction_id=x.id and later.correction_mode='cancel_and_reissue' and later.status='issued');
 return jsonb_build_object('tax_invoice_id',t.id,'combined_id',p_combined_id,'receipt_id',r.id,'invoice_id',t.invoice_id,'payment_id',t.payment_id,
   'source_correction_id',replacement.id,'document_no',coalesce(replacement.issued_snapshot_json->>'document_no',t.tax_invoice_no),
   'document_date',coalesce(replacement.issued_snapshot_json->>'document_date',t.issue_date::text),
   'tax',coalesce(replacement.issued_snapshot_json->'tax',t.issued_snapshot_json),
   'receipt',coalesce(replacement.issued_snapshot_json->'receipt',r.issued_snapshot_json))||case when t.direct_money_receipt_id is null then '{}'::jsonb else jsonb_build_object('direct_money_receipt_id',t.direct_money_receipt_id) end;
end;
$source$;

create or replace function public.create_finance_tax_correction_draft(p_request_id uuid,p_tax_invoice_id uuid,p_combined_id uuid,p_mode text,
 p_reason text,p_legal_basis text,p_evidence_reference text,p_issue_date date,p_adjustment_date date,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $create$
declare src jsonb; req jsonb; draft jsonb; prior public.finance_tax_document_corrections%rowtype; cid uuid:=gen_random_uuid();
 line jsonb; original public.finance_tax_invoice_items%rowtype; delta numeric; dv numeric; pb numeric; pv numeric;
 lines jsonb:='[]'; buyer jsonb; customer jsonb; sign integer; source_id uuid; totals jsonb;
begin
 if public.tax_correction_authorized(p_combined_id is not null,'manage') is distinct from true then raise exception 'TAX_CORRECTION_PERMISSION_DENIED'; end if;
 if p_request_id is null then raise exception 'TAX_CORRECTION_REQUEST_REQUIRED'; end if;
 perform 1 from public.finance_tax_invoices where id=p_tax_invoice_id for update;
 req:=jsonb_build_object('tax',p_tax_invoice_id,'combined',p_combined_id,'mode',p_mode,'reason',p_reason,'basis',p_legal_basis,
   'evidence',p_evidence_reference,'issue_date',p_issue_date,'adjustment_date',p_adjustment_date,'lines',p_lines);
 select * into prior from public.finance_tax_document_corrections where request_id=p_request_id;
 if found then if prior.request_json is distinct from req then raise exception 'TAX_CORRECTION_IDEMPOTENCY_CONFLICT'; end if; return prior.id; end if;
 src:=public.tax_correction_source(p_tax_invoice_id,p_combined_id); source_id:=(src->>'source_correction_id')::uuid;
 if p_mode is null or p_mode not in ('credit_note','debit_note','cancel_and_reissue','replacement_copy')
   or nullif(btrim(p_reason),'') is null or length(btrim(p_reason))<5
   or nullif(btrim(p_evidence_reference),'') is null or length(btrim(p_evidence_reference))<5
 then raise exception 'TAX_CORRECTION_REASON_EVIDENCE_REQUIRED'; end if;
 if p_issue_date is null or p_adjustment_date is null or p_issue_date>(now() at time zone 'Asia/Bangkok')::date
   or p_adjustment_date>p_issue_date or p_adjustment_date<(src->>'document_date')::date
 then raise exception 'TAX_CORRECTION_DATES_INVALID'; end if;
 if p_mode in ('credit_note','debit_note') and p_issue_date>=(date_trunc('month',p_adjustment_date)+interval '2 months')::date
 then raise exception 'TAX_CORRECTION_ADJUSTMENT_PERIOD_REVIEW_REQUIRED'; end if;
 if p_legal_basis is null or not(case p_mode
   when 'credit_note' then p_legal_basis in ('service_overcharge','service_reduction','service_cancelled')
   when 'debit_note' then p_legal_basis in ('service_undercharge','additional_service')
   when 'cancel_and_reissue' then p_legal_basis='documentary_identity_error'
   when 'replacement_copy' then p_legal_basis in ('lost','destroyed','materially_damaged') else false end)
 then raise exception 'TAX_CORRECTION_MODE_BASIS_INCOMPATIBLE'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'TAX_CORRECTION_LINES_REQUIRED'; end if;
 if exists(select 1 from public.finance_tax_document_corrections where original_tax_invoice_id=p_tax_invoice_id and status in ('draft','approved'))
 then raise exception 'TAX_CORRECTION_OPEN_CASE_EXISTS'; end if;
 if p_mode in ('credit_note','debit_note') then
   if jsonb_array_length(p_lines)=0 then raise exception 'TAX_CORRECTION_LINES_REQUIRED'; end if;
   sign:=case when p_mode='credit_note' then -1 else 1 end;
   for line in select value from jsonb_array_elements(p_lines) loop
     if jsonb_typeof(line) is distinct from 'object' or line-array['item_id','base_change']<>'{}'::jsonb then raise exception 'TAX_CORRECTION_LINE_INVALID'; end if;
     select * into original from public.finance_tax_invoice_items where id=(line->>'item_id')::uuid and tax_invoice_id=p_tax_invoice_id;
     if not found or exists(select 1 from jsonb_array_elements(lines) l where l->>'item_id'=original.id::text)
     then raise exception 'TAX_CORRECTION_SOURCE_COVERAGE_INVALID'; end if;
     delta:=(line->>'base_change')::numeric;
     if delta is null or delta::text in ('NaN','Infinity','-Infinity') or delta<=0 or round(delta,2)<>delta then raise exception 'TAX_CORRECTION_AMOUNT_INVALID'; end if;
     select original.amount_before_vat+coalesce(sum(case x.correction_mode when 'credit_note' then -l.base_change else l.base_change end),0),
       original.vat_amount+coalesce(sum(case x.correction_mode when 'credit_note' then -l.vat_change else l.vat_change end),0)
     into pb,pv from public.finance_tax_correction_lines l join public.finance_tax_document_corrections x on x.id=l.correction_id
     where l.original_tax_invoice_item_id=original.id and x.status='issued';
     -- Credit reductions cannot exceed the effective tax position; debit increases have no original-base cap.
     if sign=-1 and delta>pb
     then raise exception 'TAX_CORRECTION_SOURCE_COVERAGE_EXCEEDED'; end if;
     dv:=case when sign=-1 and delta=pb then pv else round(delta*(original.source_snapshot_json->>'vat_rate')::numeric/100,2) end;
     if dv is null or dv<0 or (sign=-1 and dv>pv) then raise exception 'TAX_CORRECTION_VAT_INVALID'; end if;
     lines:=lines||jsonb_build_array(jsonb_build_object('item_id',original.id,'source',original.source_snapshot_json,
       'original_base',original.amount_before_vat,'original_vat',original.vat_amount,'previous_base',pb,'previous_vat',pv,
       'base_change',delta,'vat_change',dv,'resulting_base',pb+sign*delta,'resulting_vat',pv+sign*dv));
   end loop;
 elsif jsonb_array_length(p_lines)<>0 then raise exception 'TAX_CORRECTION_DOCUMENTARY_AMOUNTS_BLOCKED'; end if;
 draft:=src||jsonb_build_object('schema_version',1,'correction_mode',p_mode,'reason',btrim(p_reason),'legal_basis',p_legal_basis,
   'evidence_reference',btrim(p_evidence_reference),'issue_date',p_issue_date,'adjustment_date',p_adjustment_date,'lines',lines);
 select jsonb_build_object('original_base',sum(amount_before_vat),'original_vat',sum(vat_amount)) into totals
 from public.finance_tax_invoice_items where tax_invoice_id=p_tax_invoice_id;
 select totals||jsonb_build_object('previous_base',(totals->>'original_base')::numeric+coalesce(sum(case x.correction_mode when 'credit_note' then -l.base_change else l.base_change end),0),
   'previous_vat',(totals->>'original_vat')::numeric+coalesce(sum(case x.correction_mode when 'credit_note' then -l.vat_change else l.vat_change end),0)) into totals
 from public.finance_tax_correction_lines l join public.finance_tax_document_corrections x on x.id=l.correction_id
 where x.original_tax_invoice_id=p_tax_invoice_id and x.status='issued';
 select totals||jsonb_build_object('base_change',coalesce(sum((l->>'base_change')::numeric),0),
   'vat_change',coalesce(sum((l->>'vat_change')::numeric),0),
   'resulting_base',(totals->>'previous_base')::numeric+coalesce(sign,0)*coalesce(sum((l->>'base_change')::numeric),0),
   'resulting_vat',(totals->>'previous_vat')::numeric+coalesce(sign,0)*coalesce(sum((l->>'vat_change')::numeric),0)) into totals from jsonb_array_elements(lines) l;
 draft:=draft||jsonb_build_object('totals',totals);
 if p_mode='cancel_and_reissue' then
   buyer:=public.get_finance_customer_tax_profile((src #>> '{tax,customer,id}')::uuid);
   buyer:=jsonb_build_object('schema_version',1,'status',buyer->'status','profile',buyer->'profile');
   if buyer->>'status' is distinct from 'verified' then raise exception 'TAX_CORRECTION_REVIEWED_BUYER_REQUIRED'; end if;
   customer:=(src #> '{tax,customer}')||(buyer #> '{profile,identity_snapshot_json}')||jsonb_build_object(
     'vat_registered',buyer #> '{profile,vat_registered}','branch_type',buyer #> '{profile,branch_type}',
     'branch_code',buyer #> '{profile,branch_code}','supplemental_evidence',buyer #> '{profile,identity_evidence}');
   if nullif(btrim(customer->>'name'),'') is null or nullif(btrim(customer->>'address'),'') is null
     or customer->>'tax_id' !~ '^[0-9]{13}$' then raise exception 'TAX_CORRECTION_REVIEWED_BUYER_REQUIRED'; end if;
   draft:=jsonb_set(draft,'{tax}',(src->'tax')||jsonb_build_object('customer',customer,'buyer_tax_profile',buyer));
   if p_combined_id is not null then draft:=jsonb_set(draft,'{receipt}',(src->'receipt')||jsonb_build_object('customer',customer)); end if;
 end if;
 insert into public.finance_tax_document_corrections(id,request_id,original_tax_invoice_id,original_combined_document_id,original_receipt_id,
   invoice_id,payment_id,direct_money_receipt_id,source_correction_id,correction_mode,reason,legal_basis,evidence_reference,issue_date,adjustment_date,
   source_snapshot_json,draft_snapshot_json,request_json,created_by_user_id)
 values(cid,p_request_id,p_tax_invoice_id,p_combined_id,(src->>'receipt_id')::uuid,(src->>'invoice_id')::uuid,(src->>'payment_id')::uuid,(src->>'direct_money_receipt_id')::uuid,
   source_id,p_mode,btrim(p_reason),p_legal_basis,btrim(p_evidence_reference),p_issue_date,p_adjustment_date,src,draft,req,auth.uid());
 insert into public.finance_tax_correction_lines(correction_id,original_tax_invoice_item_id,base_change,vat_change,previous_base,previous_vat,resulting_base,resulting_vat,source_snapshot_json)
 select cid,(l->>'item_id')::uuid,(l->>'base_change')::numeric,(l->>'vat_change')::numeric,(l->>'previous_base')::numeric,
   (l->>'previous_vat')::numeric,(l->>'resulting_base')::numeric,(l->>'resulting_vat')::numeric,l->'source' from jsonb_array_elements(lines) l;
 insert into public.finance_tax_correction_audit_events(correction_id,event_type,event_payload_json,actor_user_id)
 values(cid,'draft_created',jsonb_build_object('reason',p_reason,'legal_basis',p_legal_basis,'evidence_reference',p_evidence_reference,'lines',lines,'number_allocated',false),auth.uid());
 return cid;
end;
$create$;

create or replace function public.validate_tax_correction_document()
returns trigger language plpgsql security definer set search_path=public as $integrity$
declare c public.finance_tax_document_corrections%rowtype; d public.finance_tax_correction_documents%rowtype; cid uuid; expected_tax jsonb; expected_receipt jsonb;
begin
 cid:=(to_jsonb(new)->>case when tg_table_name='finance_tax_correction_lines' then 'correction_id' else 'id' end)::uuid;
 select * into strict c from public.finance_tax_document_corrections where id=cid;
 select * into d from public.finance_tax_correction_documents where id=cid;
 if c.source_snapshot_json->>'direct_money_receipt_id' is distinct from c.direct_money_receipt_id::text
   or c.source_snapshot_json->>'tax_invoice_id' is distinct from c.original_tax_invoice_id::text
   or c.source_snapshot_json->>'combined_id' is distinct from c.original_combined_document_id::text
   or c.source_snapshot_json->>'receipt_id' is distinct from c.original_receipt_id::text
   or c.source_snapshot_json->>'invoice_id' is distinct from c.invoice_id::text
   or c.source_snapshot_json->>'payment_id' is distinct from c.payment_id::text
   or c.source_snapshot_json->>'source_correction_id' is distinct from c.source_correction_id::text
 then raise exception 'TAX_CORRECTION_SOURCE_INTEGRITY'; end if;
 if (select count(*) from public.finance_tax_correction_lines where correction_id=cid)<>jsonb_array_length(c.draft_snapshot_json->'lines')
   or exists(select 1 from jsonb_array_elements(c.draft_snapshot_json->'lines') j
     left join public.finance_tax_correction_lines l on l.correction_id=cid and l.original_tax_invoice_item_id=(j->>'item_id')::uuid
     left join public.finance_tax_invoice_items i on i.id=l.original_tax_invoice_item_id
     where l.id is null or i.tax_invoice_id is distinct from c.original_tax_invoice_id or l.source_snapshot_json is distinct from i.source_snapshot_json
       or l.source_snapshot_json is distinct from j->'source'
       or jsonb_build_array(l.base_change,l.vat_change,l.previous_base,l.previous_vat,l.resulting_base,l.resulting_vat)
          is distinct from jsonb_build_array(j->'base_change',j->'vat_change',j->'previous_base',j->'previous_vat',j->'resulting_base',j->'resulting_vat'))
 then raise exception 'TAX_CORRECTION_LINE_INTEGRITY'; end if;
 if (c.status='issued')<>(d.id is not null) then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 if d.id is not null and (d.issued_at<>c.issued_at or d.issued_by_user_id<>c.issued_by_user_id or d.issued_snapshot_json->>'document_no' is distinct from d.document_no
   or d.issued_snapshot_json->>'correction_id' is distinct from c.id::text
   or d.issued_snapshot_json #> '{tax,payment}' is distinct from c.source_snapshot_json #> '{tax,payment}'
   or d.issued_snapshot_json #> '{tax,tax_point}' is distinct from c.source_snapshot_json #> '{tax,tax_point}'
   or d.issued_snapshot_json #> '{tax,seller}' is distinct from c.source_snapshot_json #> '{tax,seller}'
   or d.issued_snapshot_json #> '{receipt,payment}' is distinct from c.source_snapshot_json #> '{receipt,payment}')
 then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 if d.id is not null then
   expected_tax:=c.draft_snapshot_json->'tax'; expected_receipt:=c.draft_snapshot_json->'receipt';
   if c.correction_mode='cancel_and_reissue' then
     expected_tax:=jsonb_set(expected_tax,'{document}',(expected_tax->'document')||jsonb_build_object('tax_invoice_no',d.document_no,'issued_at',d.issued_at,'correction_id',cid));
     if c.original_combined_document_id is not null then expected_receipt:=jsonb_set(expected_receipt,'{receipt}',(expected_receipt->'receipt')||jsonb_build_object('receipt_no',d.document_no,'issued_at',d.issued_at,'correction_id',cid)); end if;
   end if;
   if d.issued_snapshot_json->'tax' is distinct from expected_tax or d.issued_snapshot_json->'receipt' is distinct from expected_receipt
     or d.issued_snapshot_json->'lines' is distinct from c.draft_snapshot_json->'lines'
     or d.issued_snapshot_json->'totals' is distinct from c.draft_snapshot_json->'totals'
     or d.issued_snapshot_json->>'approval_evidence' is distinct from c.approval_evidence
   then raise exception 'TAX_CORRECTION_DOCUMENT_INTEGRITY'; end if;
 end if;
 if d.id is not null and c.correction_mode='cancel_and_reissue' and
   (d.issued_snapshot_json #>> '{tax,document,tax_invoice_no}' is distinct from d.document_no
     or (c.original_combined_document_id is not null and d.issued_snapshot_json #>> '{receipt,receipt,receipt_no}' is distinct from d.document_no))
 then raise exception 'TAX_CORRECTION_PAIR_INVALID'; end if;
 return new;
end;
$integrity$;

create or replace function public.tax_position_source(p_type text,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare s jsonb;e public.finance_expenses%rowtype;r public.finance_expense_tax_reviews%rowtype;
 d public.finance_external_input_vat%rowtype;x public.finance_external_input_vat_reviews%rowtype;lines jsonb:='[]';
begin
 if p_type='tax_invoice' and exists(select 1 from public.finance_tax_invoices where id=p_id and direct_money_receipt_id is not null) then
  return jsonb_build_object('active',false,'source_type',p_type,'source_id',p_id,'lines','[]'::jsonb,'warnings','[]'::jsonb,'documentary_only',true);
 end if;
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

create or replace function public.tax_filing_monthly_facts_before_expense(p_month date)
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
   where t.status='issued' and t.direct_money_receipt_id is null and exists(select 1 from public.finance_tax_point_events p where p.tax_invoice_id=t.id
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

-- New helpers are private; only permission-checked entry points are callable by authenticated.

alter function public.document_direct_source(uuid) owner to postgres;
revoke all on function public.document_direct_source(uuid) from public,anon,authenticated,service_role;
grant execute on function public.document_direct_source(uuid) to service_role;

alter function public.document_direct_snapshot(jsonb,jsonb,date) owner to postgres;
revoke all on function public.document_direct_snapshot(jsonb,jsonb,date) from public,anon,authenticated,service_role;
grant execute on function public.document_direct_snapshot(jsonb,jsonb,date) to service_role;

alter function public.document_direct_blockers(jsonb) owner to postgres;
revoke all on function public.document_direct_blockers(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.document_direct_blockers(jsonb) to service_role;

alter function public.document_direct_decision(uuid) owner to postgres;
revoke all on function public.document_direct_decision(uuid) from public,anon,authenticated,service_role;
grant execute on function public.document_direct_decision(uuid) to service_role;

alter function public.get_finance_received_document_decision(text,uuid) owner to postgres;
revoke all on function public.get_finance_received_document_decision(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_finance_received_document_decision(text,uuid) to service_role;

grant execute on function public.get_finance_received_document_decision(text,uuid) to authenticated;

alter function public.create_finance_received_document_draft(text,uuid,boolean,boolean,boolean) owner to postgres;
revoke all on function public.create_finance_received_document_draft(text,uuid,boolean,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.create_finance_received_document_draft(text,uuid,boolean,boolean,boolean) to service_role;

grant execute on function public.create_finance_received_document_draft(text,uuid,boolean,boolean,boolean) to authenticated;

alter function public.document_direct_action(text,uuid,text,jsonb) owner to postgres;
revoke all on function public.document_direct_action(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.document_direct_action(text,uuid,text,jsonb) to service_role;

alter function public.validate_direct_document(text,uuid) owner to postgres;
revoke all on function public.validate_direct_document(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.validate_direct_document(text,uuid) to service_role;

alter function public.guard_direct_document_dependencies() owner to postgres;
revoke all on function public.guard_direct_document_dependencies() from public,anon,authenticated,service_role;
grant execute on function public.guard_direct_document_dependencies() to service_role;
