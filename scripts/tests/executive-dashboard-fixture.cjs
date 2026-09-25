/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic read-only responses, shared by behavioral and real-browser tests.
const {fixture:taxFixture,adapter:taxAdapter}=require('./tax-dashboard-fixture.cjs');
const {snapshotFixture}=require('./tax-filing-fixture.cjs');
function fixture(month='2026-09'){
 const f=taxFixture(month);f.tables.finance_tax_invoices[0].status='draft';
 f.register.outgoing_workflow_available=true;f.register.outgoing=[{withheld_on:month+'-15',withheld_amount:90,remitted_amount:30}];
 f.treasury.accounts.forEach(a=>Object.assign(a,{opening_as_of:'2026-08-31T16:59:59Z',opening_amount:1000,bank_name:a.kind==='bank'?'Kasikornbank':null,account_number:null}));
 const filing=snapshotFixture();filing.period_month=month+'-01';filing.pools[0].period_month=month+'-01';
 Object.assign(filing.pools[0],{tax_amount:630,ready:true,issues:[],monthly_facts:{input_contract:'authoritative_input_v1',input_vat:70,input_vat_complete:true,net_vat:630,source_contract:'tax_position_source_v1',output_vat:700,source_evidence:[]}});
 const aggregate=(currencies,period=false)=>({schema_version:1,semantics:period?'period':'current',timezone:'Asia/Bangkok',as_of:month+'-25T09:00:00Z',from_date:month+'-01',to_date:month+'-30',currencies});
 f.rpc={
  get_finance_expense_access:{can_view_all:true},get_finance_treasury:f.treasury,
  get_finance_cash_flow_summary:aggregate([{currency:'THB',external_inflow_count:2,external_inflow:10400,external_outflow_count:1,external_outflow:1070,internal_transfer_count:1,internal_transfer_amount:100}],true),
  get_finance_receivables_summary:aggregate([{currency:'THB',outstanding_count:3,outstanding_amount:5000,overdue_count:1,overdue_amount:1000,due_soon_count:1,due_soon_amount:2500,no_due_date_count:1,no_due_date_amount:1500}]),
  get_finance_general_payables_summary:aggregate([{currency:'THB',outstanding_count:2,outstanding_amount:1200,company_purchase_count:1,company_purchase_amount:700,reimbursement_count:1,reimbursement_amount:500,overdue_count:0,overdue_amount:0,due_soon_count:1,due_soon_amount:700,no_due_date_count:1,no_due_date_amount:500}]),
  get_finance_unpaid_participants_summary:aggregate([{currency:'THB',unpaid_entitlement_count:2,unpaid_participant_count:2,unpaid_amount:2910,oldest_unpaid_at:month+'-10T09:00:00Z'}]),
  get_finance_company_statement:{count:1,excluded_count:0,totals:[{currency:'THB',amount:2000}],rows:[{distribution_id:'synthetic-distribution',revision:1,finalized_at:month+'-15T09:00:00Z',policy:'vp_professional_v2',source_type:'direct_money_receipt',source_id:f.tables.finance_direct_money_receipts[0].id,received_on:month+'-15',currency:'THB',reference:'SYNTHETIC-DM',client:'บริษัท ตัวอย่าง / Example client',matter:null,amount:2000,basis:10000}]},
  // Deliberately absurd scalar income: the UI must use 069 per-currency totals.
  get_finance_unified_company_statement:{income:987654321,expense:1000,count:1,unclassified_count:1,rows:[{id:'synthetic-purchase',kind:'company_purchase',economic_date:month+'-20',description:'ค่าอุปกรณ์สำนักงาน / Office supplies',vendor:'Synthetic vendor',reference:'SYNTHETIC-EXP',expense:1000,gross:1070,recoverable_vat:70,wht:0,cash:1070,href:'/finance/expenses?request=synthetic-purchase'}]},
  get_finance_revenue_distribution_workspace:{rows:[],count:1,summary:[{state:'pending',currency:'THB',count:1,amount:10000,unresolved:0}]},
  get_finance_tax_position:f.register,get_finance_tax_filings:filing,
  get_finance_tax_input_evidence:{can_manage:true,external:[],expenses:[{id:'synthetic-purchase',origin:'company_purchase',vendor:'Synthetic vendor',invoice_date:month+'-20',tax_base:1000,vat_amount:70,status:'eligible'}]},
 };
 return f;
}
// Serialized into the local browser harness. Dependency passed explicitly.
function adapter(f,taxAdapter){
 const base=taxAdapter(f),calls=[];
 const client={...base.client,async rpc(name,args){calls.push({name,args});if(!Object.hasOwn(f.rpc,name)&&name!=='get_finance_tax_deadline')throw Error('Forbidden RPC '+name);
  if(f.fail===name)return {error:{message:'Synthetic unavailable'},data:null};
  if(name==='get_finance_tax_deadline')return{data:{filing_type:args.p_type,period_month:args.p_month,channel:'online',status:'pending_confirmation',due_date:null}};
  const data=structuredClone(f.rpc[name]);
  if(name==='get_finance_cash_flow_summary'){data.from_date=args.p_from;data.to_date=args.p_to;if(args.p_from.slice(0,7)!=='2026-09')data.currencies=[];}
  if(name==='get_finance_tax_filings'){data.period_month=args.p_month;data.pools.forEach(p=>p.period_month=args.p_month);}
  return{data};
 }};return{client,calls,tableCalls:base.calls};
}
module.exports={fixture,adapter,taxAdapter};
