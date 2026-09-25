/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic evidence shaped exactly like the existing 053/065/066 read contracts.
const {snapshotFixture}=require('./tax-filing-fixture.cjs');
function input(id,vat,base,origin='company_purchase') {
 const expense={id,origin,gross_amount:Number((base+vat).toFixed(2)),description:'รายการตัวอย่าง / Sample expense'};
 return {source_type:'expense',source_id:id,amount:vat,source:{source_type:'expense',source_id:id,active:true,currency:'THB',effective_on:'2026-09-25',reference:null,payer:{name:'ผู้ขายตัวอย่าง / Sample supplier '+id},lines:[{line_id:id,kind:'input_vat',tax:vat,base}],source_evidence:{expense}}};
}
function fixture() {
 const filing=snapshotFixture(),pool=filing.pools[0];
 Object.assign(pool,{ready:true,issues:[],tax_amount:610.37});
 Object.assign(pool.monthly_facts,{input_contract:'authoritative_input_v1',input_vat:89.63,reviewed_input_vat:89.63,input_vat_complete:true,net_vat:610.37,
  source_evidence:[{source_type:'direct_money_receipt',source_id:'direct-sample',reference:'DM-SAMPLE',effective_on:'2026-09-15',lines:[{line_id:'line-1',kind:'output_vat',base:10000,tax:700}]}],input_sources:[input('purchase-1',19.63,280.37),input('purchase-2',70,1000)]});
 return {month:'2026-09',filing,inputs:{can_manage:true,external:[],expenses:[]},deadlines:{},sources:{money:{payments:[],components:[],certificates:[],direct:[{id:'direct-sample',status:'confirmed',currency:'THB',received_on:'2026-09-15',payer_name:'ลูกค้าตัวอย่าง / Sample customer',gross_amount:10700,cash_amount:10400,wht_amount:300,classification_json:null,confirmed_snapshot_json:{lines:[{source_line_id:'line-1',base:10000,vat:700,wht:300,wht_base:10000,wht_rate:3,vat_treatment_json:{treatment:'standard_rate'}}]}}]},taxes:{documents:[],corrections:[]},treasury:null,payables:null,register:null}};
}
module.exports={fixture,input};
