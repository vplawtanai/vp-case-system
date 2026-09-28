/* eslint-disable @typescript-eslint/no-require-imports */
// Offline builder only. Surgical replacements retain the reviewed accounting bodies.
const assert=require('node:assert/strict');
const changes=[];
const replace=(name,from,to)=>changes.push({name,from,to});
const prepend=(name,guard)=>changes.push({name,from:'\nbegin\n',to:`\nbegin\n ${guard}\n`,once:true});
const deny="IF NOT public.finance078_admin() THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;";
const routine='public.finance078_operations()';
const helpers={};
for(const n of ['manage_finance_quotations','manage_finance_payments','view_finance_payments','manage_finance_receipts','view_finance_receipts','issue_finance_receipts','manage_finance_tax_invoices','view_finance_tax_invoices','issue_finance_tax_invoices','manage_finance_billable_charges','view_finance_billable_charges','approve_finance_billable_charges'])helpers['current_user_can_'+n]=routine;
for(const n of ['confirm_finance_payments','reverse_finance_payments','reallocate_finance_payments','manage_finance_cash_transactions','confirm_finance_cash_transactions','reverse_finance_cash_transactions','void_finance_receipts'])helpers['current_user_can_'+n]='public.finance078_admin()';
Object.assign(helpers,{
 current_user_can_view_finance_cash_transactions: 'public.finance078_operations()',
 expense_can_manage:'public.finance078_admin()', expense_can_tax_review:'public.finance078_admin()', expense_can_view_all:routine,
 expense_can_claim:'public.finance078_self_service()', payout_can_manage:'public.finance078_admin() OR public.finance078_operator()',
 tax_position_can_view:routine,tax_position_can_manage:'public.finance078_admin() OR public.finance078_operator()',
 tax_filing_can_manage:'public.finance078_admin() OR public.finance078_operator()',tax_filing_can_remit:'public.finance078_admin() OR public.finance078_operator()',
 statement_transfer_allowed:'public.finance078_admin()',money_allocation_admin:'public.finance078_admin()',
 current_user_can_view_finance_cash_bank_account:"public.expense_account_allowed(p_bank_account_id,null,'view_balance')",
});
// Control-plane mutations do not inherit the broadened routine-document helper.
for(const n of ['void_finance_invoice','record_finance_paid_expense','bridge_finance_legacy_expense',
 'delete_finance_authorized_signer','set_finance_authorized_signer_active','set_finance_authorized_signer_default',
 'save_finance_quotation_service_pattern','set_finance_quotation_service_pattern_active',
 'approve_retired_template_use_for_fee_agreement'])prepend(n,deny);
// Non-draft cancellations are high risk; routine draft editing remains possible.
for(const n of ['set_finance_quotation_status','set_finance_quotation_status_v2','set_finance_fee_agreement_status','set_finance_billing_plan_status']){
 // Parameter spelling is resolved from the reviewed definition by builder below.
 changes.push({name:n,cancelGuard:true});
}
prepend('cancel_finance_accepted_quotation_engagement',deny);
for(const n of ['create_finance_tax_correction_draft','approve_finance_tax_correction','issue_finance_tax_correction'])prepend(n,deny);
for(const n of ['clone_document_template_version','replace_document_template_draft_structure','save_document_template_alternative_group_draft',
 'save_document_template_clause_slot_draft','save_document_template_family_draft','save_document_template_section_draft',
 'save_document_template_variable_binding_draft','save_document_template_version_draft','set_document_template_version_status'])prepend(n,deny);
// Preparation is separate from the accepted-source prerequisite. Existing locks,
// expected versions, source freeze, uniqueness, audit and cash integrity remain.
replace('prepare_finance_expense_payout',"if not public.expense_can_manage() and (e.created_by<>auth.uid() or e.origin<>'company_purchase'\n  or exists(select 1 from public.finance_expense_obligations where expense_id=e.id) or p_actual_wht is distinct from false)\n then raise exception 'EXPENSE_FINANCE_PREPARATION_REQUIRED'; end if;",
 "if not public.finance078_admin() and (e.status<>'accepted' or e.reviewed_by is null) then raise exception 'FINANCE_APPROVED_SOURCE_REQUIRED'; end if;");
prepend('confirm_finance_expense_payout',"PERFORM public.finance078_require_payout(p_id,'confirm_outflow');");
prepend('save_finance_payout_before_expense',"IF NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,'record_outflow') THEN RAISE EXCEPTION 'EXPENSE_ACCOUNT_DENIED'; END IF;");

prepend('payout_confirm_distribution_outflow',"PERFORM public.finance078_require_payout(p_id,'confirm_outflow');");
prepend('cancel_finance_payout',"PERFORM public.finance078_require_payout(p_id,'record_outflow');");
replace('pay_finance_distribution_participant','if not public.money_allocation_admin()',"if not (public.finance078_admin() or public.finance078_operator())");
prepend('pay_finance_distribution_participant',"IF NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,'record_outflow') OR NOT public.expense_account_allowed(p_bank_account_id,p_cash_location_id,'confirm_outflow') THEN RAISE EXCEPTION 'EXPENSE_ACCOUNT_DENIED'; END IF;");
replace('tax_filing_account',"public.treasury_can_view(p_bank,p_cash)","public.expense_account_allowed(p_bank,p_cash,'record_outflow')");
replace('transition_finance_tax_remittance',"select * into strict r from public.finance_tax_remittances where id=p_id for update;", "select * into strict r from public.finance_tax_remittances where id=p_id for update;\n if not public.expense_account_allowed(r.bank_account_id,r.cash_location_id,case when p_action='confirmed' then 'confirm_outflow' else 'record_outflow' end) then raise exception 'EXPENSE_ACCOUNT_DENIED'; end if;");
replace('save_finance_payout_before_expense',"public.treasury_can_view(p_bank_account_id,p_cash_location_id)","public.expense_account_allowed(p_bank_account_id,p_cash_location_id,'record_outflow')");
replace('payout_confirm_distribution_outflow',"public.treasury_can_view(p.bank_account_id,p.cash_location_id)","public.expense_account_allowed(p.bank_account_id,p.cash_location_id,'confirm_outflow')");
replace('payout_confirm_distribution_outflow',"select to_jsonb(a) into account from public.finance_treasury_balances a where a.bank_account_id is not distinct from p.bank_account_id and a.cash_location_id is not distinct from p.cash_location_id;","account:=public.finance078_execution_account(p.bank_account_id,p.cash_location_id);");
replace('tax_filing_account',"select to_jsonb(a) into account from public.finance_treasury_balances a where bank_account_id is not distinct from p_bank and cash_location_id is not distinct from p_cash;","account:=public.finance078_execution_account(p_bank,p_cash);");
// Generic cash entry remains Admin-only, tax authority is a separate bundle.
prepend('transition_finance_direct_money_receipt',deny);
replace('save_finance_direct_money_receipt','public.money_allocation_admin()','public.finance078_operations()');
// Existing People optimistic version and profile-audit transaction is retained.
replace('people_admin_save_profile',"'role','active','account_type','assignable','financial_access'", "'role','active','account_type','assignable','finance_operator','financial_access'");
replace('people_admin_save_profile',"('active','assignable','financial_access')", "('active','assignable','finance_operator','financial_access')");
replace('expense_document',"select public.expense_document_before_purchase_flow(p_id)||jsonb_build_object('creator_tax',public.company_purchase_request_declaration(p_id),'reviewed_recipient_name',public.company_purchase_request_recipient(p_id));",
 "select public.finance078_expense_projection(p_id,public.expense_document_before_purchase_flow(p_id)||jsonb_build_object('creator_tax',public.company_purchase_request_declaration(p_id),'reviewed_recipient_name',public.company_purchase_request_recipient(p_id)));");
prepend('get_finance_expense_economics',"IF NOT public.finance078_operations() THEN RAISE EXCEPTION 'EXPENSE_PERMISSION_DENIED'; END IF;");
replace('get_finance_expense_access',"'company_purchase_request_supported',true", "'can_create_company',public.finance078_operations(),'company_purchase_request_supported',true");
replace('get_finance_revenue_distribution_detail',"'summary',public.vp_distribution_workspace_row", "'can_pay',public.finance078_admin(),'summary',public.vp_distribution_workspace_row");
replace('get_finance_treasury_month_flow','public.treasury_can_view(r.bank_account_id,r.cash_location_id)',"public.expense_account_allowed(r.bank_account_id,r.cash_location_id,'view_movements')");
// Remittance history is Tax evidence, not a grant to unrelated account balances.
replace('get_finance_tax_filings','to_jsonb(r)', 'public.finance078_remittance_projection(r.id,to_jsonb(r))');
replace('get_finance_tax_filings',"'audit',(select jsonb_agg(to_jsonb(a) order by a.version) from public.finance_tax_remittance_audit a where a.remittance_id=r.id)","'audit',case when public.finance078_admin() then (select jsonb_agg(to_jsonb(a) order by a.version) from public.finance_tax_remittance_audit a where a.remittance_id=r.id) else '[]'::jsonb end");

replace('create_finance_tax_remittance',"r.draft_snapshot_json->'account' is distinct from p_expected_account", "public.finance078_account_projection(r.draft_snapshot_json->'account') is distinct from p_expected_account");
replace('create_finance_tax_remittance',"account is distinct from p_expected_account", "public.finance078_account_projection(account) is distinct from p_expected_account");
replace('get_finance_tax_filings',"select coalesce(jsonb_agg(to_jsonb(a) order by a.kind,a.name_en),'[]') into accounts from public.finance_treasury_balances a\n where public.treasury_can_view(a.bank_account_id,a.cash_location_id);", "select coalesce(jsonb_agg(public.finance078_account_projection(public.finance078_execution_account((a->>'bank_account_id')::uuid,(a->>'cash_location_id')::uuid)) order by a->>'kind',a->>'name'),'[]') into accounts from jsonb_array_elements(public.get_finance_expense_accounts()) a where a->>'can_record'='true';");

// Distribution read and mutation boundaries, including old public aliases.
replace('get_finance_revenue_distribution_workspace','public.current_user_can_view_finance_payments()', '(public.finance078_admin() OR public.finance078_partner())');
replace('get_finance_revenue_distribution_workspace',"where (p_source_type='all' or kind=p_source_type)","where public.finance078_distribution_allowed(case when kind='payment' then id end,case when kind='direct_money_receipt' then id end) and (p_source_type='all' or kind=p_source_type)");
prepend('get_finance_revenue_distribution_detail',"IF NOT public.finance078_distribution_allowed(case when p_source_type='payment' then p_source_id end,case when p_source_type='direct_money_receipt' then p_source_id end) THEN RAISE EXCEPTION 'VP_DISTRIBUTION_PERMISSION_DENIED'; END IF;");
replace('get_finance_vp_received_distribution','public.current_user_can_view_finance_payments()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)');
replace('get_finance_vp_received_distribution',"'can_manage',public.money_allocation_admin()", "'can_manage',public.finance078_distribution_allowed(p_payment_id,p_direct_id)");
replace('save_finance_vp_received_distribution','public.money_allocation_admin()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)');
replace('confirm_finance_vp_received_distribution','public.money_allocation_admin()','public.finance078_distribution_allowed(p_payment_id,p_direct_id)');
// Existing finalized, UUID-bound referral evidence also proves the same source
// when Admin has explicitly superseded it. Partner cannot supersede history.
replace('transition_finance_vp_distribution',"if not public.money_allocation_admin() then", "if not public.finance078_distribution_id_allowed(p_id) or (p_action='supersede' and not public.finance078_admin()) then");
// Static built-in choices carry no global allocation data. Context is source-scoped.
for(const n of ['get_finance_vp_formula_context','get_finance_direct_vp_formula_context']){replace(n,'if public.money_allocation_admin() then',"if (context->>'can_manage')::boolean then");replace(n,"'formula_catalog',public.vp_compensation_formula_catalog()", "'formula_catalog',case when (context->>'can_manage')::boolean then public.vp_compensation_formula_catalog() else '[]'::jsonb end");}
// Company business summaries remain Admin/Partner, not Operator analytics.
for(const n of ['get_finance_unpaid_participants_summary','get_finance_company_statement','get_finance_unified_company_statement'])prepend(n,"IF NOT (public.finance078_admin() OR public.finance078_partner()) THEN RAISE EXCEPTION 'FINANCE_BUSINESS_READ_DENIED'; END IF;");

// Broad raw compensation APIs are Admin-only. Other users use the minimal projection.
for(const n of ['get_finance_payable_entitlements','get_finance_payout_workspace','get_finance_payout_workspace_before_expense'])prepend(n,deny);
// Payment context is reconstructed below, rather than leaking the old workspace.

// Movement permission does not imply balance permission (or the inverse).
replace('expense_account_balance','return query select * from public.expense_account_balance_private(p_bank,p_cash);',"return query select b.currency,b.opening_id,b.opening_as_of,b.opening_amount,b.system_balance,case when public.expense_account_allowed(p_bank,p_cash,'view_movements') then b.inflow end,case when public.expense_account_allowed(p_bank,p_cash,'view_movements') then b.outflow end from public.expense_account_balance_private(p_bank,p_cash) b;");
replace('get_finance_treasury',"public.treasury_can_view(c.bank_account_id,c.cash_location_id)","public.expense_account_allowed(c.bank_account_id,c.cash_location_id,'view_movements')");
replace('get_finance_cash_flow_summary',"public.treasury_can_view(c.bank_account_id,c.cash_location_id)","public.expense_account_allowed(c.bank_account_id,c.cash_location_id,'view_movements')");
replace('get_finance_account_statement','public.treasury_can_view(p_bank,p_cash)',"public.expense_account_allowed(p_bank,p_cash,'view_movements')");
replace('get_finance_account_statement','return result;',"if not public.expense_account_allowed(p_bank,p_cash,'view_balance') then\n result:=result||jsonb_build_object('opening',null,'closing',null,'opening_start',null,'balance_covered',false,'rows',(select coalesce(jsonb_agg(v-'balance' order by ord),'[]') from jsonb_array_elements(result->'rows') with ordinality x(v,ord))); end if;\n return result;");

function buildDefinitions(before){
 const definitions=new Map(before.map(f=>[f.name,f.definition]));
 const changed=new Set();
 for(const [n,expr] of Object.entries(helpers)){
  const old=definitions.get(n);assert.ok(old,n+' missing');
  const s=old.replace(/AS (\$\w*\$)[\s\S]*?\1/,(_,tag)=>`AS ${tag}\n SELECT ${expr};\n${tag}`);
  assert.notEqual(s,old,n);definitions.set(n,s);changed.add(n);
 }
 for(const rule of changes){
  let sql=definitions.get(rule.name);assert.ok(sql,rule.name+' missing');
  if(rule.cancelGuard){
   const arg=sql.match(/\b(p_(?:new_|next_)?status) text/i)?.[1];assert.ok(arg,rule.name+' status');
   sql=sql.replace(/\bbegin\b/i,`begin\n IF ${arg}='cancelled' AND NOT public.finance078_admin() THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;`);
  }else{
   assert.ok(sql.includes(rule.from),rule.name+' anchor: '+rule.from);
   if(rule.once)assert.equal(sql.split(rule.from).length,2,rule.name+' unique body entry');
   sql=sql.replaceAll(rule.from,rule.to);
  }
  definitions.set(rule.name,sql);changed.add(rule.name);
 }
 return [...changed].sort().map(n=>definitions.get(n).trim().replace(/;?$/,';')).join('\n\n');
}
function patches(before){
 const current=new Map(before.map(f=>[f.name,f.definition])),out=[];
 function add(name,from,to){const sql=current.get(name);assert.ok(sql&&sql.includes(from),name+' patch missing');const count=sql.split(from).length-1;out.push({signature:before.find(f=>f.name===name).signature,from,to,count});current.set(name,sql.replaceAll(from,to));}
 for(const[name,expr]of Object.entries(helpers)){
  const sql=current.get(name),m=sql.match(/AS (\$\w*\$)([\s\S]*?)\1/);add(name,m[2],`\n SELECT ${expr};\n`);
 }
 for(const r of changes){if(r.cancelGuard){const sql=current.get(r.name),arg=sql.match(/\b(p_(?:new_|next_)?status) text/i)[1];add(r.name,'\nbegin\n',`\nbegin\n IF ${arg}='cancelled' AND NOT public.finance078_admin() THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;\n`);}else add(r.name,r.from,r.to);}
 return out;
}
module.exports={changes,helpers,buildDefinitions,patches};
