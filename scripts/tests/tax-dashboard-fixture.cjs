// Synthetic records only. The adapter exposes SELECT and three existing read RPCs.
function fixture(month = '2026-09') {
 const day = n => `${month}-${String(n).padStart(2,'0')}`;
 const payments = [
  {id:'10000001-0000-4000-8000-000000000001',status:'confirmed',received_on:day(11),currency:'THB',internal_reference:null,payer_name:'Synthetic client',cash_amount:19160,wht_amount:120,settlement_amount:19280},
  {id:'10000002-0000-4000-8000-000000000002',status:'confirmed',received_on:day(5),currency:'THB',internal_reference:null,payer_name:'Synthetic client',cash_amount:4859.81,wht_amount:140.19,settlement_amount:5000},
 ];
 const line = {source_line_id:'30000000-0000-4000-8000-000000000001',description:'Synthetic legal service',base:10000,vat:700,gross:10700,cash:10400,vat_rate:7,vat_treatment_json:{treatment:'standard_rate'},wht:300,wht_base:10000,wht_rate:3};
 const direct = [{id:'20000000-0000-4000-8000-000000000001',status:'confirmed',received_on:day(15),currency:'THB',payer_name:'Synthetic direct payer',cash_amount:10400,wht_amount:300,gross_amount:10700,confirmed_snapshot_json:{lines:[line]},classification_json:null}];
 const components = payments.map((p,i)=>({id:`4000000${i}-0000-4000-8000-000000000001`,payment_id:p.id,base_amount:i?4672.9:4000,rate_percent:3,calculated_wht_amount:p.wht_amount}));
 const tax = {id:'50000000-0000-4000-8000-000000000001',payment_id:payments[1].id,status:'issued',tax_invoice_no:'SYNTHETIC-TI-1'};
 const points = [{id:'60000000-0000-4000-8000-000000000001',tax_invoice_id:tax.id,occurred_on:day(5),approved_at:day(7)+'T00:00:00Z'}];
 const items = [{id:'70000000-0000-4000-8000-000000000001',tax_invoice_id:tax.id,amount_before_vat:4672.9,vat_amount:327.1,total_amount:5000}];
 const account=(id,name,kind,balance)=>({account_id:id,kind,bank_account_id:kind==='bank'?id:null,cash_location_id:kind==='cash'?id:null,name_th:name,name_en:kind==='cash'?'Office Cash':name,is_active:true,currency:'THB',opening_id:balance===null?null:'synthetic-opening',system_balance:balance});
 const groups = [1800,2020,2000].map((amount,i)=>({recipient_id:`user-${i}`,recipient_name:`Synthetic recipient ${i}`,currency:'THB',open_amount:amount,components:[{id:`right-${i}`,recipient_id:`user-${i}`,status:'open',currency:'THB',bucket:i?'work':'referral',gross_amount:amount}]}));
 const register={can_manage:true,can_materialize:true,periods:[],facts:[],pending_sources:[],coverage:{invoice_items_without_approved_tax_point:1,unresolved_direct_sources:0},incoming_wht_total:0,history:[],input_vat_complete:false,outgoing_workflow_available:false};
 const treasury={can_manage:true,accounts:[account('bank','KBANK','bank',29560),account('cash','เงินสดสำนักงาน','cash',20000)],openings:[],transactions:[],pending_sources:[],has_next:false};
 const tables={finance_payments:payments,finance_direct_money_receipts:direct,finance_payment_wht_components:components,finance_payment_evidence:[],finance_tax_point_events:points,finance_tax_invoices:[tax],finance_tax_invoice_items:items,finance_tax_document_corrections:[],finance_tax_correction_lines:[]};
 return {tables,register,treasury,groups};
}
function adapter(f) {
 const calls=[];
 const client={from(table){
  if(!Object.hasOwn(f.tables,table))throw Error('Unexpected table '+table);
  let rows=[...f.tables[table]],range=null;const call={table,filters:[]};calls.push(call);
  const q={select(columns){call.columns=columns;return q;},order(){return q;},gte(key,value){call.filters.push(['gte',key,value]);rows=rows.filter(r=>r[key]>=value);return q;},lt(key,value){call.filters.push(['lt',key,value]);rows=rows.filter(r=>r[key]<value);return q;},in(key,values){call.filters.push(['in',key,values]);rows=rows.filter(r=>values.includes(r[key]));return q;},range(start,end){range=[start,end];call.range=range;return q;},then(resolve,reject){return Promise.resolve(f.fail?{error:Error('Synthetic read failure'),data:null}:{error:null,data:structuredClone(range?rows.slice(range[0],range[1]+1):rows)}).then(resolve,reject);}};return q;
 },async rpc(name,p){calls.push({rpc:name,p});if(f.fail)return {data:null,error:{message:'Synthetic read failure'}};
  if(name==='get_finance_tax_position')return {data:structuredClone(f.register),error:null};
  if(name==='get_finance_treasury')return {data:structuredClone(f.treasury),error:null};
  if(name==='get_finance_payable_entitlements')return {data:{groups:structuredClone(f.groups.slice(p.p_offset,p.p_offset+25)),has_next:f.groups.length>p.p_offset+25},error:null};
  throw Error('Forbidden RPC '+name);
 }};return {client,calls};
}
module.exports={fixture,adapter};
