const people=['30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003'];
const distributionId='30000000-0000-4000-8000-000000000004';
function fixture(){
 const components=[['Pam',people[0],'referral','Client Source / Broker',1940],['Tangmo',people[1],'work','Lead Lawyer / Case Owner',1940],['Pam',people[0],'work','Co-Lawyer / Co-Worker',1164],['Pao',people[2],'work','Quality Controller',776]].map(([name,id,bucket,role,amount],i)=>({
  id:'30000000-0000-4000-8001-'+String(i+1).padStart(12,'0'),distribution_id:distributionId,distribution_revision:1,distribution_version:3,distribution_fingerprint:'a'.repeat(32),
  source_type:'direct_money_receipt',received_money_id:'30000000-0000-4000-8000-000000000005',source_line_id:'30000000-0000-4000-8000-000000000006',component_key:String(i).repeat(32),component_no:i+1,
  formula_code:'source_worker_qc',formula_version:1,bucket,role_label:role,recipient_type:'user',recipient_id:id,recipient_name:name,currency:'THB',gross_amount:amount,finalized_at:'2026-07-01T12:00:00Z',status:'open',
  evidence_json:{schema_version:1,line:{description:'Synthetic professional work',vat:700,wht:300},formula:{company_share_amount:3880}} }));
 return {groups:people.map(id=>{const rows=components.filter(r=>r.recipient_id===id);return {recipient_id:id,recipient_name:rows[0].recipient_name,currency:'THB',open_amount:rows.reduce((n,r)=>n+r.gross_amount,0),components:rows};}),has_next:false};
}
module.exports={fixture,distributionId};
