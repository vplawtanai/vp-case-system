const id=n=>'40000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(){
 const accounts=[['KBANK','KBANK','bank',29560],['เงินสดสำนักงาน','Office Cash','cash',20000],['BAY','BAY','bank',null],['KTB','KTB','bank',null]].map(([name_th,name_en,kind,system_balance],i)=>({
  kind,account_id:id(i+1),bank_account_id:kind==='bank'?id(i+1):null,cash_location_id:kind==='cash'?id(i+1):null,name_th,name_en,
  bank_name:kind==='bank'?'Synthetic Bank':null,account_number:kind==='bank'?'000-0-00000-0':null,is_active:true,currency:'THB',
  opening_id:system_balance!==null?id(i+10):null,opening_as_of:system_balance!==null?'2026-09-09T16:59:59.999999Z':null,opening_amount:i===0?0:i===1?20000:null,system_balance,inflow:i===0?29560:0,outflow:0,
 }));
 const source=(n,cash_amount,received_on,type='payment')=>({source_type:type,source_id:id(n),status:'confirmed',bank_account_id:id(1),cash_location_id:null,received_on,cash_amount,wht_amount:n===24?140.19:0,currency:'THB',payer_name:'Synthetic customer',reference:'TEST-'+n,description:'Synthetic receipt'});
 const pending_sources=[source(20,9700,'2026-08-27'),source(21,4850,'2026-08-28'),source(22,10000,'2026-09-04'),source(23,2000,'2026-09-04'),source(24,4859.81,'2026-09-05')];
 const transactions=[source(30,10400,'2026-09-15','direct_money_receipt'),source(31,19160,'2026-09-11')].map(s=>({id:id(Number(s.reference.split('-')[1])+100),bank_account_id:id(1),cash_location_id:null,occurred_at:s.received_on+'T16:59:59.999999Z',cash_amount:s.cash_amount,currency:'THB',direction:'inflow',transaction_type:s.source_type==='payment'?'payment_receipt':'direct_money_receipt',status:'confirmed',reference_no:s.reference,description:'Synthetic cash receipt',source_snapshot_json:s}));
 const openings=accounts.filter(a=>a.opening_id).map(a=>({id:a.opening_id,bank_account_id:a.bank_account_id,cash_location_id:a.cash_location_id,currency:'THB',as_of:a.opening_as_of,balance_amount:a.opening_amount,note:'Synthetic verified opening',status:'confirmed',updated_at:'2026-09-01T00:00:00Z',supersedes_opening_balance_id:null}));
 return {can_manage:true,accounts,openings,transactions,pending_sources,has_next:false};
}
module.exports={fixture};
