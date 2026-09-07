/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic artifacts are emitted for apply_patch, never applied to a database.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const migrationPath='supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function definition(sql,name){
  const start=new RegExp(`create (?:or replace )?function public\\.${name}\\(`,'i').exec(sql);
  assert.ok(start,name);const tail=sql.slice(start.index);const quote=/\bas\s+(\$\w*\$)/i.exec(tail);
  return tail.slice(0,tail.indexOf(quote[1]+';',quote.index+quote[0].length)+quote[1].length+1);
}
function integration(){
  const prior=read('supabase/migrations/202607180037_create_finance_receipt_foundation.sql');
  let allocator=definition(prior,'generate_finance_document_no');
  allocator=allocator.replace("if v_input_type = 'receipt' then", "if v_input_type = 'tax_invoice' then\n    if not public.current_user_can_issue_finance_tax_invoices() then raise exception 'TAX_INVOICE_PERMISSION_DENIED'; end if;\n  elsif v_input_type = 'receipt' then")
    .replace("('fee_agreement', 'invoice', 'receipt')","('fee_agreement', 'invoice', 'receipt', 'tax_invoice')")
    .replace("v_counter_type := v_input_type;", "if v_input_type = 'tax_invoice' and (v_prefix_code <> 'VP-TI' or v_period_scope <> 'monthly' or v_width <> 6) then\n      raise exception 'TAX_INVOICE_NUMBERING_PROFILE_INVALID';\n    end if;\n    v_counter_type := v_input_type;")
    .replace("if v_input_type = 'receipt' and length(v_next::text) > v_width then", "if v_input_type in ('receipt','tax_invoice') and length(v_next::text) > v_width then")
    .replace("raise exception 'RECEIPT_NUMBERING_EXHAUSTED';", "raise exception using message = case when v_input_type='tax_invoice' then 'TAX_INVOICE_NUMBERING_EXHAUSTED' else 'RECEIPT_NUMBERING_EXHAUSTED' end;");
  const names={assert_finance_payment_has_no_downstream_dependencies:'p_payment_id,null',
    assert_finance_erroneous_payment_correction_dependencies:'p_payment_id,null',
    assert_finance_payment_reallocation_dependencies:'p_payment_id,array[p_source_invoice_id,p_target_invoice_id]',
    assert_finance_invoice_has_no_void_dependencies:'null,array[p_invoice_id]'};
  const guards=Object.entries(names).map(([name,args])=>{
    let fn=definition(prior,name);
    fn=fn.replace('begin\n',`begin\n  perform public.assert_finance_tax_invoice_dependencies(${args});\n`);
    fn=fn.replace("if (v_dependency.table_name = 'finance_receipts'", "if v_dependency.table_name = 'finance_tax_invoices'\n      or (v_dependency.table_name = 'finance_receipts'");
    assert.ok(fn.includes("if v_dependency.table_name = 'finance_tax_invoices'"));return fn;
  });
  return [allocator,'revoke all on function public.generate_finance_document_no(text,date) from public,anon,authenticated;',...guards].join('\n\n')+'\n';
}
function artifacts(){
  const current=read(migrationPath);
  const start='-- BEGIN GENERATED ALLOCATOR AND DEPENDENCY INTEGRATION\n';
  const end='-- END GENERATED ALLOCATOR AND DEPENDENCY INTEGRATION';
  const migration=current.slice(0,current.indexOf(start)+start.length)+integration()+current.slice(current.indexOf(end));
  const files={[migrationPath]:migration};
  return {...files,...require('./tax-invoice-workflow.cjs').workflow(migration)};
}
module.exports={artifacts,definition};
if(require.main===module){if(process.argv.includes('--check')){for(const [file,content] of Object.entries(artifacts()))assert.equal(read(file),content,file);console.log('PASS exact allocator/dependency integration and rollback-only dry-run');}else console.log(JSON.stringify(artifacts()));}
