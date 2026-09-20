/* eslint-disable @typescript-eslint/no-require-imports */
const {fixture,expense,obligation,id,tax}=require('./expense-foundation-fixture.cjs');
const stamp=day=>`2026-09-${String(day).padStart(2,'0')}T04:42:00+00:00`;
const event=(n,event_type,day,evidence_json=null)=>({id:id(n),event_type,created_at:stamp(day),actor_name:'Synthetic reviewer',evidence_json});
function workflowFixture(){
 const f=fixture('list');
 const claim={origin:'employee_claim',claimant_id:id(1),personally_paid:true,reimbursement_requested:10700};
 const late=expense(101,{...claim,status:'submitted',expense_date:'2026-09-05',created_at:stamp(15),submitted_at:stamp(20),description:'Late September claim',audit:[event(201,'submitted',20)],review_reason:null});
 const older=expense(102,{...claim,status:'submitted',expense_date:'2026-09-19',created_at:stamp(19),submitted_at:stamp(19),description:'Earlier submission',audit:[event(202,'submitted',19)],review_reason:null});
 const draft=expense(103,{origin:'employee_claim',status:'draft',expense_date:'2026-09-01',created_at:stamp(15),submitted_at:null,description:'Unsubmitted draft',audit:[],review_reason:null});
 const missing=expense(104,{origin:'employee_claim',status:'submitted',expense_date:'2026-09-20',created_at:stamp(20),submitted_at:null,description:'Unknown queue time',audit:[],review_reason:null});
 const company={...late,id:id(105),origin:'company_purchase',expense_date:'2026-09-08',description:'Late Company expense'};
 const approved=expense(106,{expense_date:'2026-09-05',created_at:stamp(15),submitted_at:stamp(18),reviewed_at:stamp(20),tax_review:tax,obligation:obligation(301,id(106),{source_type:'employee_reimbursement',created_at:stamp(20),payee_name:'Z New recipient',payee_id:id(900)}),audit:[event(206,'accepted',20)]});
 const expenses=[approved.obligation,obligation(302,id(107),{created_at:stamp(19),payee_name:'A Older recipient',payee_id:id(901)}),obligation(303,id(108),{source_type:'employee_reimbursement',created_at:stamp(18),payee_name:'Z New recipient',payee_id:id(900)})];
 const revenue=f.revenue.map(g=>({...g,components:g.components.map(c=>({...c,created_at:stamp(17)}))}));
 return {data:{...f.data,rows:[older,late,draft,missing,company,approved]},lookups:f.lookups,claims:[older,late,draft,missing],company:[older,company,approved,missing],late,older,draft,missing,approved,expenses,revenue};
}
module.exports={workflowFixture,stamp,event};
