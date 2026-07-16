-- Commercial Terms v2: payment schedules may be proportional across all items or per item.
alter table public.finance_quotation_payment_terms
  add column if not exists allocation_mode text not null default 'proportional_all_items';
alter table public.finance_quotation_payment_terms
  drop constraint if exists finance_quotation_payment_terms_allocation_mode_check;
alter table public.finance_quotation_payment_terms
  add constraint finance_quotation_payment_terms_allocation_mode_check
  check (allocation_mode in ('proportional_all_items', 'per_item'));

create or replace function public.validate_finance_quotation_payment_terms(p_quotation_id uuid, p_require_complete boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_terms public.finance_quotation_payment_terms%rowtype; v_count integer; v_total numeric; v_item record;
begin
  select * into v_terms from public.finance_quotation_payment_terms where quotation_id=p_quotation_id;
  if v_terms.id is null then raise exception 'Payment terms are required'; end if;
  select count(*) into v_count from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id;
  if v_count=0 then raise exception 'Payment terms require at least one installment'; end if;
  if v_terms.payment_method_type='single' and v_count<>1 then raise exception 'Single payment terms require exactly one installment'; end if;
  if v_terms.payment_method_type='installments' and v_count<2 then raise exception 'Installment payment terms require at least two installments'; end if;
  if (select min(installment_no) from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id)<>1 or (select max(installment_no) from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id)<>v_count then raise exception 'Payment installment numbers must be sequential'; end if;
  if exists(select 1 from public.finance_quotation_payment_installments i where i.payment_terms_id=v_terms.id and (i.title is null or btrim(i.title)='' or i.payment_due_days<0 or (i.trigger_type='date' and i.due_date is null) or (i.trigger_type in ('case_milestone','recurring_period','manual') and nullif(btrim(coalesce(i.trigger_description,'')),'') is null))) then raise exception 'Payment terms draft contains invalid installment data'; end if;
  if v_terms.payment_method_type='milestone' and exists(select 1 from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id and trigger_type<>'case_milestone') then raise exception 'Milestone payment terms require milestone triggers'; end if;
  if v_terms.payment_method_type='recurring' and (v_count<2 or exists(select 1 from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id and trigger_type<>'recurring_period')) then raise exception 'Recurring payment terms require recurring triggers'; end if;
  if v_terms.payment_method_type='manual' and exists(select 1 from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id and trigger_type<>'manual') then raise exception 'Manual payment terms require manual triggers'; end if;
  if v_terms.allocation_mode='proportional_all_items' then
    select coalesce(sum(percentage),0) into v_total from public.finance_quotation_payment_installments where payment_terms_id=v_terms.id and calculation_type='percentage';
    if v_total>100.000000 then raise exception 'Payment percentages exceed 100'; end if;
  end if;
  if exists(select 1 from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id left join public.finance_quotation_items qi on qi.id=ai.quotation_item_id where i.payment_terms_id=v_terms.id and (qi.id is null or qi.quotation_id<>p_quotation_id or ai.allocated_amount_before_tax<0 or ai.allocated_vat_amount<0 or ai.allocated_total<>ai.allocated_amount_before_tax+ai.allocated_vat_amount)) then raise exception 'Payment allocation item is invalid'; end if;
  for v_item in select id, amount_before_tax, vat_amount, line_total from public.finance_quotation_items where quotation_id=p_quotation_id loop
    select coalesce(sum(ai.allocation_percentage),0)
      into v_total from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id where i.payment_terms_id=v_terms.id and ai.quotation_item_id=v_item.id;
    if v_terms.allocation_mode='per_item' and v_total>100.000000 then raise exception 'Payment allocation percentage exceeds 100 for a quotation item'; end if;
    if p_require_complete then
      if v_terms.allocation_mode='per_item' and v_total<>100.000000 then raise exception 'Every quotation item must be allocated exactly 100 percent before sending'; end if;
      if v_terms.allocation_mode='proportional_all_items' and not exists(select 1 from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id where i.payment_terms_id=v_terms.id and ai.quotation_item_id=v_item.id) then raise exception 'Every quotation item must be allocated before sending'; end if;
      if (select coalesce(sum(ai.allocated_amount_before_tax),0) from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id where i.payment_terms_id=v_terms.id and ai.quotation_item_id=v_item.id) <> v_item.amount_before_tax
        or (select coalesce(sum(ai.allocated_vat_amount),0) from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id where i.payment_terms_id=v_terms.id and ai.quotation_item_id=v_item.id) <> v_item.vat_amount
        or (select coalesce(sum(ai.allocated_total),0) from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id where i.payment_terms_id=v_terms.id and ai.quotation_item_id=v_item.id) <> v_item.line_total then raise exception 'Payment allocation amounts do not reconcile with quotation item'; end if;
    end if;
  end loop;
end; $$;
revoke all on function public.validate_finance_quotation_payment_terms(uuid,boolean) from public, anon, authenticated;

create or replace function public.save_finance_quotation_payment_terms_draft_v2(p_quotation_id uuid,p_payment_method_type text,p_client_summary text,p_allocation_mode text,p_installments_json jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare q public.finance_quotations%rowtype; v_terms uuid; v_inst jsonb; v_inst_id uuid; v_item jsonb; v_idx integer:=0; v_item_idx integer; v_source public.finance_quotation_items%rowtype; v_mode text:=coalesce(nullif(btrim(p_allocation_mode),''),'proportional_all_items');
begin
 if not public.current_user_can_manage_finance_quotations() then raise exception 'Not allowed to save quotation payment terms'; end if;
 if v_mode not in ('proportional_all_items','per_item') or p_payment_method_type not in ('single','installments','milestone','recurring','manual') or p_installments_json is null or jsonb_typeof(p_installments_json)<>'array' then raise exception 'Invalid payment terms'; end if;
 select * into q from public.finance_quotations where id=p_quotation_id for update; if q.id is null or q.status<>'draft' then raise exception 'Only draft quotations can change payment terms'; end if;
 insert into public.finance_quotation_payment_terms(quotation_id,payment_method_type,allocation_mode,currency,client_summary,amount_before_tax,vat_amount,total_amount,created_by_user_id,updated_by_user_id) values(p_quotation_id,p_payment_method_type,v_mode,'THB',nullif(btrim(coalesce(p_client_summary,'')),''),0,0,0,auth.uid(),auth.uid()) on conflict(quotation_id) do update set payment_method_type=excluded.payment_method_type,allocation_mode=excluded.allocation_mode,client_summary=excluded.client_summary,updated_by_user_id=auth.uid(),updated_at=now() returning id into v_terms;
 delete from public.finance_quotation_payment_installments where payment_terms_id=v_terms;
 for v_inst in select value from jsonb_array_elements(p_installments_json) loop
  v_idx:=v_idx+1;
  if jsonb_typeof(v_inst)<>'object' or nullif(btrim(coalesce(v_inst->>'title','')),'') is null or coalesce(v_inst->>'calculation_type','') not in ('percentage','fixed_amount') then raise exception 'Payment terms draft contains invalid installment data'; end if;
  insert into public.finance_quotation_payment_installments(payment_terms_id,installment_no,title,calculation_type,percentage,trigger_type,trigger_description,due_date,payment_due_days,client_note,amount_before_tax,vat_amount,total_amount,sort_order) values(v_terms,coalesce((v_inst->>'installment_no')::integer,v_idx),btrim(v_inst->>'title'),v_inst->>'calculation_type',case when v_inst->>'calculation_type'='percentage' then coalesce((v_inst->>'percentage')::numeric,100) else null end,coalesce(v_inst->>'trigger_type','quotation_acceptance'),nullif(btrim(coalesce(v_inst->>'trigger_description','')),''),nullif(v_inst->>'due_date','')::date,coalesce((v_inst->>'payment_due_days')::integer,0),nullif(btrim(coalesce(v_inst->>'client_note','')),''),0,0,0,coalesce((v_inst->>'sort_order')::integer,v_idx-1)) returning id into v_inst_id;
  v_item_idx:=0;
  for v_item in select value from jsonb_array_elements(coalesce(v_inst->'items','[]'::jsonb)) loop
   v_item_idx:=v_item_idx+1; select * into v_source from public.finance_quotation_items where id=(v_item->>'quotation_item_id')::uuid and quotation_id=p_quotation_id; if v_source.id is null then raise exception 'Payment allocation item does not belong to this quotation'; end if;
   if v_mode='per_item' and v_inst->>'calculation_type'='percentage' then
    if coalesce((v_item->>'allocation_percentage')::numeric,-1)<=0 or coalesce((v_item->>'allocation_percentage')::numeric,0)>100 then raise exception 'Payment allocation percentage is invalid'; end if;
    insert into public.finance_quotation_payment_installment_items(payment_installment_id,quotation_item_id,allocated_amount_before_tax,allocated_vat_amount,allocated_total,allocation_percentage,sort_order) values(v_inst_id,v_source.id,0,0,0,(v_item->>'allocation_percentage')::numeric,coalesce((v_item->>'sort_order')::integer,v_item_idx-1));
   elsif v_mode='per_item' then
    if coalesce((v_item->>'allocated_amount_before_tax')::numeric,-1)<0 or coalesce((v_item->>'allocated_vat_amount')::numeric,-1)<0 or coalesce((v_item->>'allocated_total')::numeric,-1)<>coalesce((v_item->>'allocated_amount_before_tax')::numeric,0)+coalesce((v_item->>'allocated_vat_amount')::numeric,0) then raise exception 'Payment allocation amount is invalid'; end if;
    insert into public.finance_quotation_payment_installment_items(payment_installment_id,quotation_item_id,allocated_amount_before_tax,allocated_vat_amount,allocated_total,allocation_percentage,sort_order) values(v_inst_id,v_source.id,(v_item->>'allocated_amount_before_tax')::numeric,(v_item->>'allocated_vat_amount')::numeric,(v_item->>'allocated_total')::numeric,case when v_source.line_total=0 then 100 else round((v_item->>'allocated_total')::numeric*100/v_source.line_total,6) end,coalesce((v_item->>'sort_order')::integer,v_item_idx-1));
   elsif v_inst->>'calculation_type'='percentage' then
    insert into public.finance_quotation_payment_installment_items(payment_installment_id,quotation_item_id,allocated_amount_before_tax,allocated_vat_amount,allocated_total,allocation_percentage,sort_order) values(v_inst_id,v_source.id,0,0,0,(v_inst->>'percentage')::numeric,coalesce((v_item->>'sort_order')::integer,v_item_idx-1));
   else
    insert into public.finance_quotation_payment_installment_items(payment_installment_id,quotation_item_id,allocated_amount_before_tax,allocated_vat_amount,allocated_total,allocation_percentage,sort_order) values(v_inst_id,v_source.id,coalesce((v_item->>'allocated_amount_before_tax')::numeric,0),coalesce((v_item->>'allocated_vat_amount')::numeric,0),coalesce((v_item->>'allocated_total')::numeric,0),nullif(v_item->>'allocation_percentage','')::numeric,coalesce((v_item->>'sort_order')::integer,v_item_idx-1));
   end if;
  end loop;
 end loop;
 -- Allocate every percentage row from its own source item; the final 100% row receives the per-item residual.
 with a as (select ai.id,qi.id source_id,qi.amount_before_tax source_before,qi.vat_amount source_vat,ai.allocation_percentage,row_number() over(partition by qi.id order by i.installment_no,ai.sort_order,ai.id) n,count(*) over(partition by qi.id) c,sum(ai.allocation_percentage) over(partition by qi.id) pct from public.finance_quotation_payment_installment_items ai join public.finance_quotation_payment_installments i on i.id=ai.payment_installment_id join public.finance_quotation_items qi on qi.id=ai.quotation_item_id where i.payment_terms_id=v_terms and i.calculation_type='percentage'), r as (select *,round(source_before*allocation_percentage/100,2) b,round(source_vat*allocation_percentage/100,2) v from a), x as (select *,coalesce(sum(b) over(partition by source_id order by n rows between unbounded preceding and 1 preceding),0) pb,coalesce(sum(v) over(partition by source_id order by n rows between unbounded preceding and 1 preceding),0) pv from r) update public.finance_quotation_payment_installment_items ai set allocated_amount_before_tax=case when x.n=x.c and x.pct=100 then x.source_before-x.pb else x.b end,allocated_vat_amount=case when x.n=x.c and x.pct=100 then x.source_vat-x.pv else x.v end,allocated_total=case when x.n=x.c and x.pct=100 then x.source_before-x.pb+x.source_vat-x.pv else x.b+x.v end from x where ai.id=x.id;
 update public.finance_quotation_payment_installments i set amount_before_tax=t.b,vat_amount=t.v,total_amount=t.t,updated_at=now() from (select ai.payment_installment_id,coalesce(sum(ai.allocated_amount_before_tax),0)b,coalesce(sum(ai.allocated_vat_amount),0)v,coalesce(sum(ai.allocated_total),0)t from public.finance_quotation_payment_installment_items ai group by ai.payment_installment_id)t where i.id=t.payment_installment_id and i.payment_terms_id=v_terms;
 update public.finance_quotation_payment_terms h set amount_before_tax=coalesce((select sum(amount_before_tax) from public.finance_quotation_payment_installments where payment_terms_id=v_terms),0),vat_amount=coalesce((select sum(vat_amount) from public.finance_quotation_payment_installments where payment_terms_id=v_terms),0),total_amount=coalesce((select sum(total_amount) from public.finance_quotation_payment_installments where payment_terms_id=v_terms),0),updated_by_user_id=auth.uid(),updated_at=now() where h.id=v_terms;
 perform public.validate_finance_quotation_payment_terms(p_quotation_id,false); return v_terms;
end; $$;
revoke all on function public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.save_finance_quotation_payment_terms_draft_v2(uuid,text,text,text,jsonb) to authenticated;

-- New browser contract remains a single transaction while preserving the applied atomic RPC.
create or replace function public.create_finance_quotation_draft_atomic_v2(
  p_client_id uuid,p_case_id bigint,p_advisory_matter_id uuid,p_issue_date date,p_valid_until date,
  p_scope_of_legal_services text,p_included_services text,p_excluded_services text,p_note text,p_internal_note text,
  p_authorized_signer_key text,p_authorized_signer_name text,p_authorized_signer_position text,p_authorized_signer_email text,
  p_client_snapshot_json jsonb,p_matter_snapshot_json jsonb,p_document_data_snapshot_json jsonb,p_items jsonb,
  p_payment_method_type text,p_payment_client_summary text,p_installments_json jsonb
) returns table(quotation_id uuid, quotation_no text)
language plpgsql security definer set search_path=public as $$
declare v_q uuid; v_no text; v_tax_items jsonb; v_mapped_installments jsonb; v_mode text;
begin
  select r.quotation_id,r.quotation_no into v_q,v_no from public.create_finance_quotation_draft_atomic(p_client_id,p_case_id,p_advisory_matter_id,p_issue_date,p_valid_until,p_scope_of_legal_services,p_included_services,p_excluded_services,p_note,p_internal_note,p_authorized_signer_key,p_authorized_signer_name,p_authorized_signer_position,p_authorized_signer_email,p_client_snapshot_json,p_matter_snapshot_json,p_document_data_snapshot_json,p_items,p_payment_method_type,p_payment_client_summary,p_installments_json) r;
  select coalesce(jsonb_agg(jsonb_build_object('id',qi.id,'price_tax_mode',coalesce(nullif(src.item->>'price_tax_mode',''),case when coalesce((src.item->>'vat_applicable')::boolean,false) then 'vat_exclusive' else 'non_vat' end),'vat_rate',src.item->>'vat_rate') order by qi.sort_order),'[]'::jsonb)
    into v_tax_items from jsonb_array_elements(p_items) with ordinality src(item,n) join public.finance_quotation_items qi on qi.quotation_id=v_q and qi.sort_order=coalesce((src.item->>'sort_order')::integer,src.n-1);
  perform public.apply_finance_quotation_draft_item_tax_modes(v_q,v_tax_items);
  v_mode:=coalesce(nullif((p_installments_json->0->>'allocation_mode'),''),'proportional_all_items');
  select coalesce(jsonb_agg(jsonb_set(inst.item,'{items}',coalesce((select jsonb_agg((alloc.value-'client_item_key') || jsonb_build_object('quotation_item_id',qi.id) order by alloc.n) from jsonb_array_elements(coalesce(inst.item->'items','[]'::jsonb)) with ordinality alloc(value,n) join jsonb_array_elements(p_items) with ordinality src(item,src_n) on src.item->>'client_item_key'=alloc.value->>'client_item_key' join public.finance_quotation_items qi on qi.quotation_id=v_q and qi.sort_order=coalesce((src.item->>'sort_order')::integer,src_n-1)),'[]'::jsonb)) order by inst.n),'[]'::jsonb) into v_mapped_installments from jsonb_array_elements(p_installments_json) with ordinality inst(item,n);
  perform public.save_finance_quotation_payment_terms_draft_v2(v_q,p_payment_method_type,p_payment_client_summary,v_mode,v_mapped_installments);
  return query select v_q,v_no;
end; $$;
revoke all on function public.create_finance_quotation_draft_atomic_v2(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.create_finance_quotation_draft_atomic_v2(uuid,bigint,uuid,date,date,text,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,jsonb) to authenticated;
