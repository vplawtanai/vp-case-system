/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic UI evidence only. No Production identifiers or connections.
const id=n=>'52000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(future=false){
 const source={id:id(1),source_id:id(2),source_type:'payout',economic_key:'synthetic',fingerprint:'synthetic',base:3104,amount:93.12,date:'2026-09-01',rate:3,reference:'TEST-PAYOUT',payee_name:'ผู้รับทดสอบ / Test recipient',entity_type:'natural_person',evidence:{synthetic:true}};
 const pools=['vat','wht_natural','wht_juristic'].map(filing_type=>({period_month:'2026-09-01',filing_type,source_count:filing_type==='vat'?0:future?1:0,base_amount:filing_type==='vat'?0:future?3104:0,tax_amount:filing_type==='vat'?null:future?93.12:0,output_vat:filing_type==='vat'?0:null,input_vat:null,input_vat_complete:false,ready:filing_type!=='vat',sources:filing_type==='vat'?[]:future?[{...source,id:id(filing_type==='wht_natural'?1:3),entity_type:filing_type==='wht_natural'?'natural_person':'juristic_person'}]:[],issues:filing_type==='vat'?[{code:'input_vat_incomplete',count:1}]:[],fingerprint:'synthetic'}));
 pools[0].issues[0].count=null;
 return{can_manage:true,can_remit:true,period_month:'2026-09-01',pools,filings:[],incoming_wht_credit:0,history:[],accounts:[{kind:'bank',account_id:id(8),bank_account_id:id(8),cash_location_id:null,name_th:'KBANK',name_en:'KBANK',is_active:true,currency:'THB',opening_id:id(9),opening_as_of:'2026-08-31T16:59:59.999999Z',opening_amount:10000,inflow:0,outflow:0,system_balance:10000}]};
}
function monthlyFixture(){
 const f=require('./tax-dashboard-fixture.cjs').fixture();
 // No issued tax child in this UAT shape: known VAT comes from Direct Money.
 f.tables.finance_tax_invoices[0].status='draft';
 f.register.outgoing_workflow_available=true;f.register.outgoing=[];
 f.tables.finance_payouts=[{id:id(77),status:'cancelled',wht_amount:93.12}];
 return f;
}
module.exports={fixture,monthlyFixture,id};
