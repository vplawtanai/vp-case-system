-- Phase 3D-C2: canonical allocation contract used by draft save and activation.
create or replace function public.validate_finance_fee_agreement_allocation(p_allocation_method text,p_allocation_snapshot_json jsonb,p_allocation_base_policy text)
returns void language plpgsql security definer set search_path = public as $$
declare m text:=lower(btrim(coalesce(p_allocation_method,''))); e jsonb; roles text[]:='{}'; keys text[]:='{}'; r text; k text; total numeric:=0; c integer:=0;
begin
 if m not in ('pao_line','tun_line','source_worker_qc','custom','no_allocation') or p_allocation_base_policy<>'received_professional_fee_before_vat' or jsonb_typeof(p_allocation_snapshot_json)<>'object' or coalesce((p_allocation_snapshot_json->>'version')::int,0)<>1 or p_allocation_snapshot_json->>'method'<>m or p_allocation_snapshot_json->>'base_policy'<>p_allocation_base_policy or jsonb_typeof(p_allocation_snapshot_json->'eligible_categories')<>'array' or jsonb_typeof(p_allocation_snapshot_json->'excluded_categories')<>'array' or not (p_allocation_snapshot_json->'eligible_categories' @> '["professional_fee"]') or not (p_allocation_snapshot_json->'excluded_categories' @> '["vat","court_fee","government_fee","reimbursable_expense","pass_through","non_professional_service"]') then raise exception 'Invalid allocation snapshot'; end if;
 if m='no_allocation' then if nullif(btrim(coalesce(p_allocation_snapshot_json->>'reason','')),'') is null or p_allocation_snapshot_json ? 'entries' then raise exception 'No Allocation requires a reason and no entries'; end if; return; end if;
 if jsonb_typeof(p_allocation_snapshot_json->'entries')<>'array' or jsonb_array_length(p_allocation_snapshot_json->'entries')=0 then raise exception 'Allocation entries are required'; end if;
 for e in select value from jsonb_array_elements(p_allocation_snapshot_json->'entries') loop
  r:=coalesce(e->>'role',''); if nullif(btrim(r),'') is null or nullif(btrim(coalesce(e->>'label','')),'') is null or (e->>'percent') !~ '^[0-9]+(\.[0-9]+)?$' or (e->>'percent')::numeric<=0 then raise exception 'Invalid allocation entry'; end if;
  if r<>'company_share' and nullif(btrim(coalesce(e->>'recipient_name_snapshot','')),'') is null then raise exception 'Allocation recipient is required'; end if;
  if nullif(e->>'recipient_user_id','') is not null and not exists(select 1 from public.user_profiles where id=(e->>'recipient_user_id')::uuid) then raise exception 'Allocation recipient does not exist'; end if;
  if r='company_share' and nullif(e->>'recipient_user_id','') is not null then raise exception 'Company entry cannot bind a user'; end if;
  k:=lower(r||'|'||coalesce(e->>'recipient_user_id',e->>'recipient_name_snapshot','')); if k=any(keys) then raise exception 'Duplicate allocation recipient/role'; end if; keys:=array_append(keys,k); roles:=array_append(roles,r); total:=total+(e->>'percent')::numeric; c:=c+1;
 end loop;
 if abs(total-100)>0.000001 then raise exception 'Allocation percent must equal 100'; end if;
 if m='pao_line' and (c<>3 or roles<>array['company_share','pao','tul'] or not(p_allocation_snapshot_json->'entries' @> '[{"role":"company_share","percent":20},{"role":"pao","percent":55},{"role":"tul","percent":25}]')) then raise exception 'Invalid Pao Line formula'; end if;
 if m='tun_line' and (c<>3 or roles<>array['company_share','pao','tul'] or not(p_allocation_snapshot_json->'entries' @> '[{"role":"company_share","percent":20},{"role":"pao","percent":40},{"role":"tul","percent":40}]')) then raise exception 'Invalid Tun Line formula'; end if;
 if m='source_worker_qc' and (c<>3 or roles<>array['source','company_share','worker'] or not(p_allocation_snapshot_json->'entries' @> '[{"role":"source","percent":20},{"role":"company_share","percent":40},{"role":"worker","percent":40}]') or nullif(btrim(coalesce((select value->>'recipient_name_snapshot' from jsonb_array_elements(p_allocation_snapshot_json->'entries') where value->>'role'='source'),'')),'') is null or nullif(btrim(coalesce((select value->>'recipient_name_snapshot' from jsonb_array_elements(p_allocation_snapshot_json->'entries') where value->>'role'='worker'),'')),'') is null) then raise exception 'Invalid Source / Worker / QC formula'; end if;
 if m='custom' and exists(select 1 from jsonb_array_elements(p_allocation_snapshot_json->'entries') value where value->>'role'<>'company_share' and nullif(btrim(coalesce(value->>'recipient_user_id','')),'') is null) then raise exception 'Custom recipient is required'; end if;
end; $$;
revoke all on function public.validate_finance_fee_agreement_allocation(text,jsonb,text) from public,anon,authenticated;

create or replace function public.save_finance_fee_agreement_allocation_draft(p_fee_agreement_id uuid,p_allocation_method text,p_allocation_snapshot_json jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.finance_fee_agreements%rowtype;
begin
 if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save allocation'; end if;
 select * into a from public.finance_fee_agreements where id=p_fee_agreement_id for update;
 if a.id is null then raise exception 'Fee agreement not found'; end if;
 if a.status<>'draft' then raise exception 'Only draft fee agreements can be edited'; end if;
 perform public.validate_finance_fee_agreement_allocation(p_allocation_method,p_allocation_snapshot_json,'received_professional_fee_before_vat');
 update public.finance_fee_agreements set allocation_method=lower(btrim(p_allocation_method)),allocation_snapshot_json=p_allocation_snapshot_json,allocation_base_policy='received_professional_fee_before_vat',updated_by_user_id=auth.uid(),updated_at=now() where id=a.id;
 return a.id;
end; $$;
revoke all on function public.save_finance_fee_agreement_allocation_draft(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_finance_fee_agreement_allocation_draft(uuid,text,jsonb) to authenticated;
