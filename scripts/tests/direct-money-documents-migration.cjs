/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit predecessor-preserving dispatch. Offline generator; never connects to a DB.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {definition}=require('./tax-invoice-sql-artifacts.cjs');
const path='supabase/migrations/202607180066_add_direct_money_document_source.sql';
const marker='-- SHARED EXISTING ENGINE DISPATCH (generated; predecessor branches unchanged).\n';
const read=n=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.startsWith('2026071800'+n+'_')),'utf8');
const fn=(n,v)=>definition(read(v),n).replace(/^create function/,'create or replace function');
const replace=(s,a,b)=>{assert.ok(s.includes(a),'Missing anchor '+a.slice(0,90));return s.replaceAll(a,b);};
function generated(){
 const out=[];
 const entries=[
 ['issue_finance_receipt','receipt','p_receipt_id','issue',"'ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json"],
 ['refresh_finance_receipt_draft','receipt','p_receipt_id','refresh',''],
 ['cancel_finance_receipt_draft','receipt','p_receipt_id','cancel',"'reason',p_reason"],
 ['void_finance_receipt','receipt','p_receipt_id','void',"'reason',p_reason,'ack',p_acknowledged"],
 ['save_finance_tax_invoice_draft','tax_invoice','p_tax_invoice_id','save',"'date',p_issue_date,'decisions',p_decisions_json,'expected',p_expected_updated_at"],
 ['refresh_finance_tax_invoice_draft','tax_invoice','p_tax_invoice_id','refresh',"'expected',p_expected_updated_at"],
 ['issue_finance_tax_invoice','tax_invoice','p_tax_invoice_id','issue',"'ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json,'delay',p_delayed_issue_acknowledged"],
 ['cancel_finance_tax_invoice_draft','tax_invoice','p_tax_invoice_id','cancel',"'reason',p_reason"],
 ['save_finance_combined_document_draft','receipt_tax_invoice','p_combined_id','save',"'date',p_issue_date,'decisions',p_decisions_json,'expected',p_expected_updated_at"],
 ['refresh_finance_combined_document_draft','receipt_tax_invoice','p_combined_id','refresh',"'expected',p_expected_updated_at"],
 ['issue_finance_combined_document','receipt_tax_invoice','p_combined_id','issue',"'ack',p_acknowledged,'reviewed',p_reviewed_snapshot_json,'delay',p_delayed_issue_acknowledged,'receipt_checked',p_external_receipt_checked,'tax_checked',p_external_tax_checked"],
 ['cancel_finance_combined_document_draft','receipt_tax_invoice','p_combined_id','cancel',"'reason',p_reason"],
 ];
 for(const[name,kind,id,action,args]of entries){
 const table=kind==='receipt'?'finance_receipts':kind==='tax_invoice'?'finance_tax_invoices':'finance_combined_documents';
 let sql=fn(name,'40');sql=sql.replace(/\bbegin\b/i,`begin\n  if exists(select 1 from public.${table} where id=${id} and direct_money_receipt_id is not null) then\n    return public.document_direct_action('${kind}',${id},'${action}',jsonb_build_object(${args}));\n  end if;`);out.push(sql);
 }
 let sql=fn('finance_tax_invoice_draft_snapshot','42').replace(/\bbegin\b/i,"begin\n if p_source->>'schema_version'='3' then return public.document_direct_snapshot(p_source,p_decisions,p_issue_date); end if;");out.push(sql);
 sql=fn('finance_tax_invoice_issue_blockers','40').replace(/\bbegin\b/i,"begin\n if p_snapshot->>'schema_version'='3' then return public.document_direct_blockers(p_snapshot); end if;");out.push(sql);
 sql=fn('validate_finance_receipt_integrity','37');
 const anchor='select * into strict v_receipt from public.finance_receipts where id = v_id;';
 sql=replace(sql,anchor,anchor+"\n  if v_receipt.direct_money_receipt_id is not null then perform public.validate_direct_document('receipt',v_id); return new; end if;");out.push(sql);
 sql=fn('validate_finance_tax_invoice_integrity','40');
 const a='select * into strict t from public.finance_tax_invoices where finance_tax_invoices.id=v_id;';
 sql=replace(sql,a,a+"\n  if t.direct_money_receipt_id is not null then perform public.validate_direct_document('tax_invoice',v_id); return new; end if;");out.push(sql);
 sql=fn('guard_receipt_logo_issue','38');sql=replace(sql,"(new.issued_snapshot_json->'schema_version') is distinct from '2'::jsonb", "coalesce(new.issued_snapshot_json->>'schema_version','') not in ('2','3')");out.push(sql);
 sql=fn('guard_finance_receipt_lifecycle','37');sql=replace(sql,'if new.id is distinct from old.id','if new.direct_money_receipt_id is distinct from old.direct_money_receipt_id or new.id is distinct from old.id');out.push(sql);
 sql=fn('validate_finance_combined_document','40');sql=replace(sql,'if r.payment_id<>c.payment_id or t.payment_id<>c.payment_id',
 'if r.payment_id is distinct from c.payment_id or t.payment_id is distinct from c.payment_id or r.direct_money_receipt_id is distinct from c.direct_money_receipt_id or t.direct_money_receipt_id is distinct from c.direct_money_receipt_id');out.push(sql);
 sql=fn('tax_correction_source','43');sql=replace(sql,'c.payment_id<>t.payment_id or r.payment_id<>t.payment_id',
 'c.payment_id is distinct from t.payment_id or r.payment_id is distinct from t.payment_id or c.direct_money_receipt_id is distinct from t.direct_money_receipt_id or r.direct_money_receipt_id is distinct from t.direct_money_receipt_id');
 sql=replace(sql,"'receipt',coalesce(replacement.issued_snapshot_json->'receipt',r.issued_snapshot_json));","'receipt',coalesce(replacement.issued_snapshot_json->'receipt',r.issued_snapshot_json))||case when t.direct_money_receipt_id is null then '{}'::jsonb else jsonb_build_object('direct_money_receipt_id',t.direct_money_receipt_id) end;");out.push(sql);
 sql=fn('create_finance_tax_correction_draft','43');sql=replace(sql,'invoice_id,payment_id,source_correction_id,','invoice_id,payment_id,direct_money_receipt_id,source_correction_id,');
 sql=replace(sql,"(src->>'payment_id')::uuid,\n   source_id,","(src->>'payment_id')::uuid,(src->>'direct_money_receipt_id')::uuid,\n   source_id,");out.push(sql);
 sql=fn('validate_tax_correction_document','43');sql=replace(sql,"if c.source_snapshot_json->>'tax_invoice_id'", "if c.source_snapshot_json->>'direct_money_receipt_id' is distinct from c.direct_money_receipt_id::text\n   or c.source_snapshot_json->>'tax_invoice_id'");out.push(sql);
 // No duplicate facts, revisions or cash movements when documentary coverage issues.
 sql=fn('tax_position_source','65').replace(/\bbegin\b/i,`begin
 if p_type='tax_invoice' and exists(select 1 from public.finance_tax_invoices where id=p_id and direct_money_receipt_id is not null) then
  return jsonb_build_object('active',false,'source_type',p_type,'source_id',p_id,'lines','[]'::jsonb,'warnings','[]'::jsonb,'documentary_only',true);
 end if;`);out.push(sql);
 sql=fn('tax_filing_monthly_facts','53');sql=replace(sql,'public.tax_filing_monthly_facts(','public.tax_filing_monthly_facts_before_expense(');
 sql=replace(sql,"where t.status='issued' and exists", "where t.status='issued' and t.direct_money_receipt_id is null and exists");out.push(sql);
 const core=fs.readFileSync(path,'utf8').split(marker)[0];
 const newFunctions=[...core.matchAll(/create function public\.(\w+)\(([^)]*)\)/g)].map(m=>({name:m[1],sig:m[2].split(',').map(v=>v.trim().split(/\s+/)[1]).join(',')}));
 out.push('-- New helpers are private; only permission-checked entry points are callable by authenticated.');
 for(const{name,sig}of newFunctions){out.push(`alter function public.${name}(${sig}) owner to postgres;\nrevoke all on function public.${name}(${sig}) from public,anon,authenticated,service_role;\ngrant execute on function public.${name}(${sig}) to service_role;`);
 if(name.startsWith('get_finance_')||name.startsWith('create_finance_'))out.push(`grant execute on function public.${name}(${sig}) to authenticated;`);}
 return out.join('\n\n')+'\n';
}
if(require.main===module){const current=fs.readFileSync(path,'utf8'),next=current.split(marker)[0]+marker+generated();if(process.argv.includes('--write'))fs.writeFileSync(path,next);else assert.equal(current,next,'066 dispatch is stale');}
module.exports={generated,path,marker};
