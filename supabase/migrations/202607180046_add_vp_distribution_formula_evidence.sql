-- CANDIDATE 046. Formula evidence only; no backfill or downstream posting.
-- Shared catalog is generated from compensation/formula-definitions.json.
do $pre$
begin
 if to_regprocedure('public.vp_distribution_choices(jsonb,jsonb,boolean)') is null
   or to_regprocedure('public.get_finance_vp_distribution(uuid)') is null
   or to_regprocedure('public.get_finance_vp_formula_context(uuid)') is not null
 then raise exception 'VP_FORMULA_PREDECESSOR_OR_CONFLICT'; end if;
end;
$pre$;

-- BEGIN GENERATED CATALOG AND LEGACY VALIDATOR
create function public.vp_compensation_formula_catalog() returns jsonb language sql immutable set search_path=public as $catalog$
 select $json${"version":1,"formulas":[{"code":"pao_line","label_key":"finance.compensation.formula.pao_line","mode":"percent","defaults":[{"type":"company","name":"Company","percent":20,"company":true,"role":"Company"},{"type":"lawyer","name":"ทนายเป้า","percent":55,"company":false,"role":"Lawyer"},{"type":"lawyer","name":"ทนายตุลย์","percent":25,"company":false,"role":"Lawyer"}]},{"code":"tun_line","label_key":"finance.compensation.formula.tun_line","mode":"percent","defaults":[{"type":"company","name":"Company","percent":20,"company":true,"role":"Company"},{"type":"lawyer","name":"ทนายเป้า","percent":40,"company":false,"role":"Lawyer"},{"type":"lawyer","name":"ทนายตุลย์","percent":40,"company":false,"role":"Lawyer"}]},{"code":"source_worker_qc","label_key":"finance.compensation.formula.source_worker_qc","mode":"work_pool","source_percent":20,"company_percent":40,"work_percent":40,"defaults":[{"type":"source","name":"","percent":20,"company":false,"role":"Client Source / Broker"},{"type":"company","name":"Company","percent":40,"company":true,"role":"Company Share"},{"type":"worker","name":"","percent":40,"company":false,"role":"Lead Lawyer / Case Owner"}]},{"code":"travel_fee","label_key":"finance.compensation.revenue.travel_fee","mode":"company_only","defaults":[{"type":"company","name":"Company","percent":100,"company":true,"role":"Company"}]},{"code":"custom","label_key":"finance.compensation.formula.custom","mode":"fixed","defaults":[]}],"recipient_buckets":{"company":"company_share_amount","source":"referral_amount","lawyer":"work_compensation_amount","lead_lawyer":"work_compensation_amount","worker":"work_compensation_amount","assistant":"work_compensation_amount","qc":"work_compensation_amount","other":"work_compensation_amount"},"distribution_calculation":"exact_cents_largest_remainder_v1"}$json$::jsonb;
$catalog$;

create function public.vp_distribution_amount_choices_v1(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare l jsonb; c jsonb; k text; amount numeric; total numeric; pool numeric; result jsonb:='[]';
begin
 if p_complete is null or jsonb_typeof(p_source->'lines') is distinct from 'array'
   or jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_choices) x where jsonb_typeof(x) is distinct from 'object')
   or jsonb_array_length(p_choices)<>(select count(*) from jsonb_array_elements(p_source->'lines') x where x->>'classification'='professional_fee')
 then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 for l in select value from jsonb_array_elements(p_source->'lines') where value->>'classification'='professional_fee' order by value->>'invoice_item_id' loop
  if (select count(*) from jsonb_array_elements(p_choices) x where x->>'invoice_item_id'=l->>'invoice_item_id')<>1
  then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
  select value into c from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=l->>'invoice_item_id';
  if jsonb_typeof(c->'invoice_item_id') is distinct from 'string'
    or exists(select 1 from jsonb_object_keys(c) as keys(key) where keys.key not in ('invoice_item_id','referral_amount','company_share_amount','work_compensation_amount'))
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
  result:=result||jsonb_build_array(jsonb_build_object('invoice_item_id',l->>'invoice_item_id',
   'referral_amount',(c->>'referral_amount')::numeric,'company_share_amount',(c->>'company_share_amount')::numeric,
   'work_compensation_amount',(c->>'work_compensation_amount')::numeric));
 end loop;
 return result;
end;
$choices$;
-- END GENERATED CATALOG AND LEGACY VALIDATOR

create function public.vp_formula_calculate(p_pool numeric,p_code text,p_version integer,p_definition jsonb,p_recipients jsonb)
returns jsonb language plpgsql immutable set search_path=public as $calc$
declare r jsonb; i integer; n integer; mode text; parameter numeric; parameters numeric[]:='{}'; amounts numeric[]:='{}';
 floors numeric[]:='{}'; weights numeric[]:='{}'; pool_cents numeric; remaining integer; total numeric:=0;
 source_count integer:=0; company_count integer:=0; owner_count integer:=0;
 source_percent numeric:=0; company_percent numeric:=0; work_percent numeric:=0;
 recipient_type text; kind text; label text; role_label text; uid uuid; bucket text;
 output jsonb:='[]'; identity_keys text[]:='{}'; identity_key text;
 referral numeric:=0; company numeric:=0; work numeric:=0;
begin
 if p_pool is null or p_pool<0 or p_pool<>round(p_pool,2) or p_pool>90071992547409.91
   or p_version is null or p_version<1 or p_code is null
   or jsonb_typeof(p_definition) is distinct from 'object'
   or p_definition->>'code' is distinct from p_code
   or p_definition->'version' is distinct from to_jsonb(p_version)
   or p_definition->>'calculation' is distinct from 'exact_cents_largest_remainder_v1'
   or jsonb_typeof(p_definition->'recipient_buckets') is distinct from 'object'
   or jsonb_typeof(p_recipients) is distinct from 'array'
 then raise exception 'VP_FORMULA_INVALID'; end if;
 mode:=p_definition->>'mode'; n:=jsonb_array_length(p_recipients); pool_cents:=p_pool*100;
 if mode is null or mode not in ('percent','fixed','work_pool','company_only') or n not between 1 and 50
 then raise exception 'VP_FORMULA_INVALID'; end if;
 for i in 1..n loop
  r:=p_recipients->(i-1);
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'VP_FORMULA_INVALID'; end if;
  if mode='fixed' then
   if jsonb_typeof(r->'fixed_amount') is distinct from 'number' or r->'percent' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameter:=(r->>'fixed_amount')::numeric;
   if parameter<0 or parameter<>round(parameter,2) then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameters:=array_append(parameters,parameter); amounts:=array_append(amounts,parameter*100); weights:=array_append(weights,0);
  else
   if jsonb_typeof(r->'percent') is distinct from 'number' or r->'fixed_amount' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameter:=(r->>'percent')::numeric;
   if parameter<0 or parameter>100 or parameter<>round(parameter,4) then raise exception 'VP_FORMULA_PARAMETER'; end if;
   parameters:=array_append(parameters,parameter); amounts:=array_append(amounts,floor(pool_cents*parameter/100));
   weights:=array_append(weights,mod(pool_cents*parameter,100));
  end if;
  total:=total+parameter;
  recipient_type:=r->>'recipient_type';
  if recipient_type='source' then source_count:=source_count+1; source_percent:=source_percent+parameter;
  elsif recipient_type='company' then company_count:=company_count+1; company_percent:=company_percent+parameter;
  else work_percent:=work_percent+parameter;
   if r->>'role_label'='Lead Lawyer / Case Owner' then owner_count:=owner_count+1; end if;
  end if;
 end loop;
 if (mode='fixed' and total<>p_pool) or (mode<>'fixed' and total<>100) then raise exception 'VP_FORMULA_RECONCILE'; end if;
 if mode='company_only' and (n<>1 or company_count<>1) then raise exception 'VP_FORMULA_CONTRACT'; end if;
 if mode<>'fixed' and company_count=0 then raise exception 'VP_FORMULA_CONTRACT'; end if;
 if mode='work_pool' and (source_count<>1 or company_count<>1 or owner_count<>1
   or to_jsonb(source_percent) is distinct from p_definition->'source_percent'
   or to_jsonb(company_percent) is distinct from p_definition->'company_percent'
   or to_jsonb(work_percent) is distinct from p_definition->'work_percent') then raise exception 'VP_FORMULA_CONTRACT'; end if;
 floors:=amounts;
 if mode<>'fixed' then
  remaining:=(pool_cents-(select sum(value) from unnest(amounts) value))::integer;
  for i in select index from generate_series(1,n) index order by weights[index] desc,index limit remaining loop amounts[i]:=amounts[i]+1; end loop;
 end if;
 for i in 1..n loop
  r:=p_recipients->(i-1); recipient_type:=r->>'recipient_type'; kind:=r->>'recipient_kind';
  if p_pool>0 and amounts[i]<=0 then raise exception 'VP_FORMULA_PARAMETER'; end if;
  bucket:=p_definition->'recipient_buckets'->>recipient_type;
  if bucket is null or bucket not in ('referral_amount','company_share_amount','work_compensation_amount')
    or kind is null or kind not in ('company','user','external')
    or (recipient_type='company') is distinct from (kind='company')
    or (bucket='company_share_amount') is distinct from (kind='company')
  then raise exception 'VP_FORMULA_ROLE'; end if;
  label:=r->>'recipient_name'; role_label:=r->>'role_label'; uid:=null;
  if jsonb_typeof(r->'recipient_name') is distinct from 'string' or nullif(btrim(label),'') is null or length(label)>300 or label<>btrim(label)
    or jsonb_typeof(r->'role_label') is distinct from 'string' or nullif(btrim(role_label),'') is null or length(role_label)>200 or role_label<>btrim(role_label)
  then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  if kind='user' then
   if jsonb_typeof(r->'recipient_user_id') is distinct from 'string' then raise exception 'VP_FORMULA_RECIPIENT'; end if;
   uid:=(r->>'recipient_user_id')::uuid;
  elsif r->'recipient_user_id' is distinct from 'null'::jsonb then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  if kind='company' and label<>'Company' then raise exception 'VP_FORMULA_RECIPIENT'; end if;
  identity_key:=jsonb_build_array(kind,coalesce(uid::text,label),role_label,bucket)::text;
  if identity_key=any(identity_keys) then raise exception 'VP_FORMULA_DUPLICATE_RECIPIENT'; end if;
  identity_keys:=array_append(identity_keys,identity_key);
  output:=output||jsonb_build_array(jsonb_build_object('component_no',i,'recipient_type',recipient_type,'role_label',role_label,
   'recipient_kind',kind,'recipient_user_id',uid,'recipient_name',label,'percent',case when mode='fixed' then null else parameters[i] end,
   'fixed_amount',case when mode='fixed' then parameters[i] else null end,'amount',amounts[i]/100,'bucket',bucket,'rounding_adjustment_cents',amounts[i]-floors[i]));
  if bucket='referral_amount' then referral:=referral+amounts[i]/100;
  elsif bucket='company_share_amount' then company:=company+amounts[i]/100;
  else work:=work+amounts[i]/100; end if;
 end loop;
 return jsonb_build_object('schema_version',1,'formula_code',p_code,'formula_version',p_version,'formula_snapshot',p_definition,
  'calculation','exact_cents_largest_remainder_v1','pool',p_pool,'recipients',output,
  'referral_amount',referral,'company_share_amount',company,'work_compensation_amount',work);
end;
$calc$;

create or replace function public.vp_distribution_choices(p_source jsonb,p_choices jsonb,p_complete boolean)
returns jsonb language plpgsql immutable set search_path=public as $choices$
declare base jsonb; result jsonb:='[]'; c jsonb; l jsonb; f jsonb; canonical jsonb;
begin
 if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'VP_DISTRIBUTION_CHOICES_INVALID'; end if;
 base:=public.vp_distribution_amount_choices_v1(p_source,(select coalesce(jsonb_agg(value-'formula_result'),'[]') from jsonb_array_elements(p_choices)),p_complete);
 for c in select value from jsonb_array_elements(base) loop
  select value->'formula_result' into f from jsonb_array_elements(p_choices) where value->>'invoice_item_id'=c->>'invoice_item_id';
  if f is not null then
   select value into l from jsonb_array_elements(p_source->'lines') where value->>'invoice_item_id'=c->>'invoice_item_id';
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

create function public.vp_formula_result_guard()
returns trigger language plpgsql security definer set search_path=public as $guard$
declare choice jsonb; f jsonb; definition jsonb; person jsonb; profile public.user_profiles%rowtype; catalog jsonb;
begin
 -- Old aggregate-only evidence stays historical and may always be superseded.
 if new.status='superseded' then return new; end if;
 catalog:=public.vp_compensation_formula_catalog();
 if public.vp_distribution_choices(new.source_snapshot_json,new.decisions_json,true) is distinct from new.decisions_json
 then raise exception 'VP_FORMULA_EVIDENCE_INVALID'; end if;
 for choice in select value from jsonb_array_elements(new.decisions_json) loop
  f:=choice->'formula_result';
  if f is null then raise exception 'VP_FORMULA_REQUIRED'; end if;
  select value||jsonb_build_object('version',catalog->'version','recipient_buckets',catalog->'recipient_buckets','calculation',catalog->'distribution_calculation')
   into definition from jsonb_array_elements(catalog->'formulas') where value->>'code'=f->>'formula_code';
  if definition is null or f->'formula_version' is distinct from catalog->'version' or f->'formula_snapshot' is distinct from definition
  then raise exception 'VP_FORMULA_STALE'; end if;
  for person in select value from jsonb_array_elements(f->'recipients') where value->>'recipient_kind'='user' loop
   select * into profile from public.user_profiles where id=(person->>'recipient_user_id')::uuid for share;
   if profile.id is null or profile.active is distinct from true
     or person->>'recipient_name' is distinct from coalesce(nullif(btrim(profile.staff_name),''),nullif(btrim(profile.full_name),''),nullif(btrim(profile.email),''),profile.id::text)
   then raise exception 'VP_FORMULA_RECIPIENT_STALE'; end if;
  end loop;
 end loop;
 return new;
end;
$guard$;
create trigger vp_formula_result_guard before insert or update on public.finance_vp_revenue_distributions for each row execute function public.vp_formula_result_guard();

create function public.get_finance_vp_formula_context(p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $get$
declare context jsonb; people jsonb:='[]';
begin
 context:=public.get_finance_vp_distribution(p_payment_id);
 if public.money_allocation_admin() then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(btrim(staff_name),''),nullif(btrim(full_name),''),nullif(btrim(email),''),id::text)) order by id),'[]')
   into people from public.user_profiles where active is true;
 end if;
 return context||jsonb_build_object('formula_schema_version',1,'formula_catalog',public.vp_compensation_formula_catalog(),'formula_people',people);
end;
$get$;

revoke all on function public.vp_compensation_formula_catalog() from public,anon,authenticated;
revoke all on function public.vp_distribution_amount_choices_v1(jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.vp_formula_calculate(numeric,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.vp_formula_result_guard() from public,anon,authenticated;
revoke all on function public.vp_distribution_choices(jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.get_finance_vp_formula_context(uuid) from public,anon;
grant execute on function public.get_finance_vp_formula_context(uuid) to authenticated;
