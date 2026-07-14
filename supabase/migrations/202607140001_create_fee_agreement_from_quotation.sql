create or replace function public.create_finance_fee_agreement_from_quotation(p_quotation_id uuid)
returns table (fee_agreement_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare q public.finance_quotations%rowtype; v_id uuid; v_before numeric(14,2); v_vat numeric(14,2); v_total numeric(14,2); v_existing_count integer;
begin
  if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to create fee agreement'; end if;
  select * into q from public.finance_quotations where id=p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  if q.status <> 'accepted' then raise exception 'Only accepted quotations can create fee agreements'; end if;
  if q.case_id is not null and q.advisory_matter_id is not null then raise exception 'Quotation has conflicting matter links'; end if;
  if not exists (select 1 from public.clients where id=q.client_id) then raise exception 'Quotation client not found'; end if;
  if q.case_id is not null and not exists (select 1 from public.cases where id=q.case_id) then raise exception 'Quotation case not found'; end if;
  if q.advisory_matter_id is not null and not exists (select 1 from public.advisory_matters where id=q.advisory_matter_id) then raise exception 'Quotation advisory matter not found'; end if;
  select id into v_id from public.finance_fee_agreements where source_type='quotation' and source_quotation_id=q.id and status <> 'cancelled' order by created_at, id limit 1 for update;
  select count(*)::integer into v_existing_count from public.finance_fee_agreements where source_type='quotation' and source_quotation_id=q.id and status <> 'cancelled';
  if v_existing_count > 1 then raise exception 'Conflicting fee agreements exist for this quotation'; end if;
  if v_id is not null then return query select v_id, false; return; end if;
  select coalesce(sum(amount_before_tax),0),coalesce(sum(vat_amount),0),coalesce(sum(line_total),0) into v_before,v_vat,v_total from public.finance_quotation_items where quotation_id=q.id;
  if v_total=0 and not exists (select 1 from public.finance_quotation_items where quotation_id=q.id) then raise exception 'Quotation requires at least one item'; end if;
  if v_before <> coalesce(q.subtotal_vatable,0)+coalesce(q.subtotal_non_vatable,0) or v_vat <> coalesce(q.vat_amount,0) or v_total <> coalesce(q.grand_total,0) then raise exception 'Quotation totals are inconsistent'; end if;
  insert into public.finance_fee_agreements (title,client_id,case_id,advisory_matter_id,source_type,source_quotation_id,status,effective_date,currency,amount_before_tax,vat_amount,total_amount,billing_method,allocation_method,client_snapshot_json,matter_snapshot_json,company_snapshot_json,commercial_terms_snapshot_json,source_document_snapshot_json,created_by_user_id,updated_by_user_id)
  values (concat('Fee Agreement - ',q.quotation_no),q.client_id,q.case_id,q.advisory_matter_id,'quotation',q.id,'draft',null,'THB',v_before,v_vat,v_total,'single',null,q.client_snapshot_json,q.matter_snapshot_json,q.document_data_snapshot_json->'company_profile',jsonb_build_object('scope_of_legal_services',q.scope_of_legal_services,'included_services',q.included_services,'excluded_services',q.excluded_services,'note',q.note,'source_quotation_no',q.quotation_no,'source_issue_date',q.issue_date),jsonb_build_object('quotation_id',q.id,'quotation_no',q.quotation_no,'status',q.status,'issue_date',q.issue_date,'valid_until',q.valid_until,'signer',q.document_data_snapshot_json->'authorized_signer','totals',jsonb_build_object('amount_before_tax',v_before,'vat_amount',v_vat,'total_amount',v_total)),auth.uid(),auth.uid()) returning id into v_id;
  insert into public.finance_fee_agreement_items (fee_agreement_id,source_quotation_item_id,description,quantity,unit_price,amount_before_tax,vat_applicable,vat_rate,vat_amount,line_total,sort_order,item_snapshot_json)
  select v_id,id,description,quantity,unit_price,amount_before_tax,vat_applicable,vat_rate,vat_amount,line_total,sort_order,jsonb_build_object('source_quotation_id',q.id,'source_quotation_no',q.quotation_no,'source_quotation_item_id',id,'description',description,'quantity',quantity,'unit_price',unit_price,'amount_before_tax',amount_before_tax,'vat_applicable',vat_applicable,'vat_rate',vat_rate,'vat_amount',vat_amount,'line_total',line_total) from public.finance_quotation_items where quotation_id=q.id order by sort_order,id;
  return query select v_id, true;
end; $$;

create or replace function public.save_finance_fee_agreement_draft_metadata(p_fee_agreement_id uuid,p_title text,p_effective_date date,p_expiry_date date,p_billing_method text,p_allocation_method text,p_allocation_snapshot_json jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.finance_fee_agreements%rowtype; v_method text:=lower(btrim(coalesce(p_billing_method,''))); v_allocation text:=nullif(btrim(coalesce(p_allocation_method,'')), '');
begin
 if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save fee agreement'; end if;
 select * into a from public.finance_fee_agreements where id=p_fee_agreement_id for update;
 if a.id is null then raise exception 'Fee agreement not found'; end if;
 if a.status <> 'draft' then raise exception 'Only draft fee agreements can be edited'; end if;
 if btrim(coalesce(p_title,''))='' then raise exception 'Title is required'; end if;
 if p_expiry_date is not null and p_effective_date is not null and p_expiry_date<p_effective_date then raise exception 'Expiry date cannot be before effective date'; end if;
 if v_method not in ('single','installments','milestone','recurring','manual') then raise exception 'Invalid billing method'; end if;
 if v_allocation is not null and v_allocation not in ('Pao Line','Tun Line','Source / Worker / QC','Custom','No Allocation') then raise exception 'Invalid allocation method'; end if;
 update public.finance_fee_agreements set title=btrim(p_title),effective_date=p_effective_date,expiry_date=p_expiry_date,billing_method=v_method,allocation_method=v_allocation,allocation_snapshot_json=p_allocation_snapshot_json,updated_by_user_id=auth.uid(),updated_at=now() where id=a.id;
 return a.id;
end; $$;

revoke all on function public.create_finance_fee_agreement_from_quotation(uuid) from public, anon, authenticated;
revoke all on function public.save_finance_fee_agreement_draft_metadata(uuid,text,date,date,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_finance_fee_agreement_from_quotation(uuid) to authenticated;
grant execute on function public.save_finance_fee_agreement_draft_metadata(uuid,text,date,date,text,text,jsonb) to authenticated;
