-- Phase 3D-C3: authoritative activation/cancellation gate. Invoice checks are added in Phase 4.
create or replace function public.set_finance_fee_agreement_status(p_fee_agreement_id uuid, p_next_status text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.finance_fee_agreements%rowtype; n text:=lower(btrim(coalesce(p_next_status,''))); c integer; b numeric; v numeric; t numeric; e jsonb; total numeric:=0; keys text[]:='{}'; k text; source_count integer:=0;
begin
 if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to update finance fee agreement status'; end if;
 select * into a from public.finance_fee_agreements where id=p_fee_agreement_id for update;
 if a.id is null then raise exception 'Fee agreement not found'; end if;
 if not ((a.status='draft' and n in ('active','cancelled')) or (a.status='active' and n in ('completed','cancelled'))) then raise exception 'Invalid finance fee agreement status transition'; end if;
 if a.status='draft' and n='active' then
  if a.source_type not in ('quotation','master_rate','retainer','manual','legacy') or not exists(select 1 from public.clients where id=a.client_id) or (a.case_id is not null and a.advisory_matter_id is not null) or (a.case_id is not null and not exists(select 1 from public.cases where id=a.case_id)) or (a.advisory_matter_id is not null and not exists(select 1 from public.advisory_matters where id=a.advisory_matter_id)) then raise exception 'Invalid agreement source or matter'; end if;
  if a.source_type='quotation' and (a.source_quotation_id is null or not exists(select 1 from public.finance_quotations where id=a.source_quotation_id and status='accepted')) then raise exception 'Source quotation must be accepted'; end if;
  select count(*)::integer,coalesce(sum(amount_before_tax),0),coalesce(sum(vat_amount),0),coalesce(sum(line_total),0) into c,b,v,t from public.finance_fee_agreement_items where fee_agreement_id=a.id;
  if c=0 or b<>a.amount_before_tax or v<>a.vat_amount or t<>a.total_amount or exists(select 1 from public.finance_fee_agreement_items where fee_agreement_id=a.id and (btrim(description)='' or quantity<=0 or amount_before_tax<0 or vat_amount<0 or line_total<>amount_before_tax+vat_amount or (not vat_applicable and vat_amount<>0))) then raise exception 'Fee agreement items are invalid or totals do not reconcile'; end if;
  if a.effective_date is null or (a.expiry_date is not null and a.expiry_date<a.effective_date) or a.billing_method not in ('single','installments','milestone','recurring','manual') then raise exception 'Agreement metadata is not ready'; end if;
  perform public.validate_finance_fee_agreement_allocation(a.allocation_method,a.allocation_snapshot_json,a.allocation_base_policy);
  if a.commercial_terms_snapshot_json is null or a.source_document_snapshot_json is null then raise exception 'Commercial and source snapshots are required'; end if;
 end if;
 if a.status='active' and n='cancelled' and exists(select 1 from public.finance_billing_plans where fee_agreement_id=a.id and status<>'cancelled') then raise exception 'Cancel the Billing Plan before cancelling this agreement'; end if;
 -- Phase 4 must extend cancellation checks for Invoice and downstream records.
 update public.finance_fee_agreements set status=n,updated_by_user_id=auth.uid(),updated_at=now() where id=a.id;
 return a.id;
end; $$;
revoke all on function public.set_finance_fee_agreement_status(uuid,text) from public,anon,authenticated;
grant execute on function public.set_finance_fee_agreement_status(uuid,text) to authenticated;
