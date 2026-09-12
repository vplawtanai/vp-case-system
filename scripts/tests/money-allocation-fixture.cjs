// Synthetic evidence only; these IDs cannot identify Production UAT records.
function fixture() {
 const lines=[['Translation',4000,280,120,'standard_rate'],['Professional fee',10000,0,0,'outside_scope'],['Travel',4672.90,327.10,0,'standard_rate']].map(([description,base,vat,wht,treatment],n)=>({invoice_id:'synthetic-invoice',invoice_no:'VP-IV-LOCAL-ONLY',invoice_item_id:'synthetic-line-'+n,description,base,vat,settlement:base+vat,cash:base+vat-wht,wht,vat_treatment:{treatment},wht_evidence:wht?{base_amount:base,rate_percent:3}:null}));
 return {can_manage:true,current:null,source_current:false,posting_enabled:false,eligible_for_future_policy_review:false,history:[],audit:[],source:{schema_version:1,payment:{id:'synthetic-payment',currency:'THB',status:'confirmed',cash:19160,wht:120,settlement:19280},lines,proven_base:18672.90,proven_vat:607.10,unallocated_settlement:0,blockers:[]}};
}
module.exports={fixture};
