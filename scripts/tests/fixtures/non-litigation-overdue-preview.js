// Synthetic read-only transport for the actual MatterList component. No network.
// Eligibility here is a fixed server response, not another date predicate.
// The real PostgreSQL predicate/count agreement is tested separately.
const params=new URLSearchParams(location.search);
const profile={id:'admin',role:'admin',active:true,full_name:'Demo Admin',account_type:'operational',assignable:true,must_change_password:false};
const lead={...profile,id:'lead',role:'lawyer',full_name:'Demo Lead'};
const overdueId='00000000-0000-4000-8000-000000000009';
const rows=Array.from({length:26},(_,i)=>({
 id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
 matter_no:'ADV-2026-'+String(i+1).padStart(3,'0'),title:'Synthetic matter '+(i+1),
 client_id:'normal-client',client_name:'Demo Client',matter_type:'general_advisory',
 status:'active',closed_at:null,lead_id:'admin',lead_name:'Demo Admin',
 work_state:'waiting_client',next_due:'2026-10-02',next_action:'Synthetic next action',
 next_owner_name:'Demo Admin',stage_key:null,stage_days:null,age_days:1,version:0,
 created_at:'2026-09-'+String(30-i).padStart(2,'0')+'T00:00:00Z',
}));
Object.assign(rows[8],{client_id:'overdue-client',client_name:'Overdue Client',matter_type:'contract_review',lead_id:'lead',lead_name:'Demo Lead',work_state:'working',next_due:params.has('zeroOverdue')?null:'2026-09-28'});
Object.assign(rows[11],{status:'completed',closed_at:'2026-09-29T00:00:00Z',next_due:'2026-09-27'});
const overdueIds=params.has('zeroOverdue')?[]:[overdueId];
window.calls=[];
window.fixture={overdueIds,rows};
export const supabase={
 auth:{async getUser(){return {data:{user:{id:'admin',email:'synthetic@example.invalid'}}};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
 from(table){const b={select(){return b;},eq(){return b;},is(){return b;},order(){return b;},limit(){return b;},async single(){return {data:profile};},then(resolve){return Promise.resolve({data:table==='user_profiles'?[profile,lead]:[]}).then(resolve);}};return b;},
 async rpc(name,args){
  window.calls.push({name,args});
  if(name==='get_finance_expense_access')return {data:{can_view_all:true,can_submit:true,can_review:true,can_approve:true}};
  if(name==='get_finance_statement_accounts')return {data:{accounts:[],can_transfer:false,can_manage_openings:false}};
  if(name!=='advisory_control_read')throw Error('Preview forbids business/write RPC: '+name);
  const q=args.p_query||{};
  await new Promise(resolve=>setTimeout(resolve,q.tab==='overdue'?180:40));
  let items=rows.filter(m=>(!q.search||(m.title+m.matter_no+m.client_name).includes(q.search))&&(!q.client_id||m.client_id===q.client_id)&&(!q.type||m.matter_type===q.type)&&(!q.lead||m.lead_id===q.lead)&&(!q.state||m.work_state===q.state));
  if(q.tab==='overdue')items=items.filter(m=>overdueIds.includes(m.id));
  else if(q.tab==='closed')items=items.filter(m=>m.closed_at);
  else if(q.tab==='mine')items=items.filter(m=>m.lead_id==='admin');
  if(q.sort==='due')items.sort((a,b)=>(a.next_due||'9999').localeCompare(b.next_due||'9999'));
  const data={items:items.slice(q.offset||0,(q.offset||0)+20),total:items.length,
   summary:{open:25,overdue:overdueIds.length,waiting:24,closed_week:1},permissions:{manage:false,task:false,delete:false}};
  window.lastResult=data;
  return {data};
 },
};
