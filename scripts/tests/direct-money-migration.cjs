/* eslint-disable @typescript-eslint/no-require-imports */
// Build explicit, reviewable replacement definitions from applied source, never edit applied files.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const migration=number=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(name=>name.startsWith('2026071800'+number+'_')),'utf8');
const file='supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql';
const marker='-- SHARED SOURCE ADAPTERS (generated from the unchanged 045/046 implementations).\n';
const replace=(s,a,b)=>{assert.ok(s.includes(a),'Missing exact anchor: '+a.slice(0,100));return s.replaceAll(a,b);};
const fn=(n,v='45')=>definition(migration(v),n).replace(/^create function/,'create or replace function');
function generated(){
 const sections=[];
 sections.push(`create function public.vp_received_line_economics(p_base numeric,p_wht numeric,p_classification text)
returns jsonb language plpgsql immutable set search_path=public as $economics$
begin
 if p_base is null or p_wht is null or p_base<0 or p_wht<0 or p_base<p_wht or p_base<>round(p_base,2) or p_wht<>round(p_wht,2)
  or p_classification is null or p_classification not in('professional_fee','additional_service','reimbursable_expense','government_or_court_fee')
 then raise exception 'VP_DISTRIBUTION_SOURCE_UNPROVEN'; end if;
 return jsonb_build_object('professional_pool',case when p_classification='professional_fee' then p_base-p_wht else 0 end,
  'company_economic',case when p_classification='professional_fee' then 0 else p_base end,
  'company_cash',case when p_classification='professional_fee' then 0 else p_base-p_wht end);
end;
$economics$;`);
 let frozen=fn('vp_distribution_frozen_source');
 frozen=replace(frozen,'l jsonb; item jsonb;','l jsonb; economics jsonb; item jsonb;');
 frozen=replace(frozen,"if classification='professional_fee' then pool:=(l->>'base')::numeric-(l->>'wht')::numeric;\n   else economic:=(l->>'base')::numeric; company_cash:=economic-(l->>'wht')::numeric; end if;",
 `economics:=public.vp_received_line_economics((l->>'base')::numeric,(l->>'wht')::numeric,classification);
   pool:=(economics->>'professional_pool')::numeric; economic:=(economics->>'company_economic')::numeric; company_cash:=(economics->>'company_cash')::numeric;`);
 sections.push(frozen);
 sections.push(`create function public.vp_direct_frozen_source(s jsonb)
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
$lock$;`);
 for(const [name,version] of [['vp_distribution_amount_choices_v1','46'],['vp_distribution_choices','46']]){
  let code=fn(name,version);
  code=replace(code,'declare ','declare identity_key text:=case when p_source ? \'received_money_source\' then \'source_line_id\' else \'invoice_item_id\' end; ');
  // Only references in the body, not the newly inserted identity selector.
  const i=code.indexOf('\nbegin'); code=code.slice(0,i)+code.slice(i).replaceAll("'invoice_item_id'",'identity_key');
  sections.push(code);
 }
 const route=code=>code.replace(/public\.money_allocation_lock\((new|a)\.payment_id\)/g,'public.vp_received_lock($1.payment_id,$1.direct_money_receipt_id)')
  .replace(/public\.vp_distribution_source\((new|a)\.payment_id\)/g,'public.vp_received_source($1.payment_id,$1.direct_money_receipt_id)');
 let immutable=route(fn('vp_distribution_immutable'));
 immutable=replace(immutable,'new.payment_id<>old.payment_id','new.payment_id is distinct from old.payment_id or new.direct_money_receipt_id is distinct from old.direct_money_receipt_id');
 sections.push(immutable);
 let validate=route(fn('vp_distribution_validate'));
 validate=replace(validate,"or new.evidence_json->>'payment_id' is distinct from a.payment_id::text", "or new.evidence_json->>'payment_id' is distinct from a.payment_id::text\n    or new.evidence_json->>'direct_money_receipt_id' is distinct from a.direct_money_receipt_id::text");
 validate=replace(validate,"public.vp_distribution_frozen_source(\n     new.source_snapshot_json->'money_source',new.source_snapshot_json->'money_allocation')",'public.vp_received_frozen(new.source_snapshot_json)');
 validate=replace(validate,"or new.source_snapshot_json#>>'{money_source,payment,id}' is distinct from new.payment_id::text", "or new.source_snapshot_json#>>'{money_source,payment,id}' is distinct from new.payment_id::text\n   or new.source_snapshot_json#>>'{received_money_source,source_id}' is distinct from new.direct_money_receipt_id::text");
 validate=replace(validate,'p.payment_id=new.payment_id','p.payment_id is not distinct from new.payment_id and p.direct_money_receipt_id is not distinct from new.direct_money_receipt_id');
 sections.push(validate,route(fn('transition_finance_vp_distribution')));
 let save=fn('save_finance_vp_distribution');
 save=replace(save,'save_finance_vp_distribution(p_payment_id uuid,','save_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid,');
 save=replace(save,'public.money_allocation_lock(p_payment_id)','public.vp_received_lock(p_payment_id,p_direct_id)');
 save=replace(save,'public.vp_distribution_source(p_payment_id)','public.vp_received_source(p_payment_id,p_direct_id)');
 save=replace(save,'where payment_id=p_payment_id','where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id');
 save=replace(save,'(payment_id,money_allocation_id,revision','(payment_id,direct_money_receipt_id,money_allocation_id,revision');
 save=replace(save,"values(p_payment_id,(s#>>'{money_allocation,id}')::uuid", "values(p_payment_id,p_direct_id,(s#>>'{money_allocation,id}')::uuid");
 sections.push(save,`create or replace function public.save_finance_vp_distribution(p_payment_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(p_payment_id,null,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;
create function public.save_finance_direct_vp_distribution(p_direct_id uuid,p_expected_id uuid,p_expected_version integer,p_source jsonb,p_choices jsonb,p_note text)
returns uuid language sql security definer set search_path=public as $save$
 select public.save_finance_vp_received_distribution(null,p_direct_id,p_expected_id,p_expected_version,p_source,p_choices,p_note);
$save$;`);
 let context=fn('get_finance_vp_distribution');
 context=replace(context,'get_finance_vp_distribution(p_payment_id uuid)','get_finance_vp_received_distribution(p_payment_id uuid,p_direct_id uuid)');
 context=replace(context,'public.vp_distribution_source(p_payment_id)','public.vp_received_source(p_payment_id,p_direct_id)');
 context=replace(context,'where payment_id=p_payment_id','where payment_id is not distinct from p_payment_id and direct_money_receipt_id is not distinct from p_direct_id');
 context=replace(context,'where h.payment_id=p_payment_id','where h.payment_id is not distinct from p_payment_id and h.direct_money_receipt_id is not distinct from p_direct_id');
 sections.push(context,`create or replace function public.get_finance_vp_distribution(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path=public as $get$
 select public.get_finance_vp_received_distribution(p_payment_id,null);
$get$;`);
 let formula=fn('get_finance_vp_formula_context','46');
 formula=replace(formula,'get_finance_vp_formula_context(p_payment_id uuid)','get_finance_direct_vp_formula_context(p_direct_id uuid)');
 formula=replace(formula,'public.get_finance_vp_distribution(p_payment_id)','public.get_finance_vp_received_distribution(null,p_direct_id)');
 sections.push(formula);
 let wht=fn('finance_payment_wht_review_v2','41');
 wht=replace(wht,"round((basis->>'amount_before_vat')::numeric*rate/100,2)","public.finance_structured_wht_amount((basis->>'amount_before_vat')::numeric,rate)"); sections.push(wht);
 sections.push(`-- A new normalized read contract. The existing 044 evidence and Payment JSON are unchanged.
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
 public.get_finance_received_money_source(text,uuid) to authenticated;`);
 return sections.join('\n\n')+'\n';
}
module.exports={file,generated,marker};
if(require.main===module){const source=fs.readFileSync(file,'utf8'),prefix=source.slice(0,source.indexOf(marker)+marker.length),expected=prefix+generated();
 if(process.argv.includes('--write'))fs.writeFileSync(file,expected);else assert.equal(source,expected);}
