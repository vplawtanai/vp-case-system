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
 next_owner_name:'Demo Admin',stage_key:null,stage_days:null,age_days:1,version:0,has_overdue_work:false,overdue_item_count:0,oldest_overdue_days:0,next_action_overdue_days:0,overdue_preview:[],
 created_at:'2026-09-'+String(30-i).padStart(2,'0')+'T00:00:00Z',
}));
Object.assign(rows[8],{client_id:'overdue-client',client_name:'Overdue Client',matter_type:'contract_review',lead_id:'lead',lead_name:'Demo Lead',work_state:'working',next_due:params.has('zeroOverdue')?null:'2026-09-28'});
Object.assign(rows[11],{status:'completed',closed_at:'2026-09-29T00:00:00Z',next_due:'2026-09-27'});
const overdueIds=params.has('zeroOverdue')?[]:params.has('unifiedOverdue')?[overdueId,rows[13].id]:[overdueId];
const tasks={};
function overdue(m,count,days){
 const all=Array.from({length:count},(_,i)=>({source:'task',source_id:m.id+'-task-'+i,title:i===0?'Overdue task':'Overdue task '+(i+1),assignee_user_id:'lead',assignee_name:'Demo Lead',due_date:'2026-09-'+(30-days+i),overdue_days:days-i,is_next_action:i===0&&m.id===overdueId}));
 Object.assign(m,{has_overdue_work:true,overdue_item_count:count,oldest_overdue_days:days,oldest_overdue_due:all[0].due_date,overdue_preview:all.slice(0,3),next_action_overdue_days:m.id===overdueId?days:0});
 tasks[m.id]=all.map(o=>({id:o.source_id,title:o.title,assignee_user_id:o.assignee_user_id,due_date:o.due_date,overdue_days:o.overdue_days,status:'pending',priority:'normal',advisory_issue_id:null,stage_id:null}));
 tasks[m.id].push({id:'completed',title:'Completed task',status:'completed',completed_at:'2026-09-29',priority:'normal',due_date:'2026-09-27',overdue_days:0});
}
if(overdueIds.length){overdue(rows[8],params.has('unifiedOverdue')?4:1,params.has('unifiedOverdue')?4:2);Object.assign(rows[8],{next_action:'Overdue task',next_due:rows[8].oldest_overdue_due,next_task_id:rows[8].id+'-task-0'});}
if(params.has('unifiedOverdue')){Object.assign(rows[13],{next_action:null,next_due:null,next_owner_name:null});overdue(rows[13],1,3);}

window.calls=[];
window.fixture={overdueIds,rows};
export const supabase={
 auth:{async getUser(){return {data:{user:{id:'admin',email:'synthetic@example.invalid'}}};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
 from(table){const b={select(){return b;},eq(){return b;},is(){return b;},order(){return b;},limit(){return b;},async single(){return {data:profile};},then(resolve){return Promise.resolve({data:table==='user_profiles'?[profile,lead]:[]}).then(resolve);}};return b;},
 async rpc(name,args){
  window.calls.push({name,args});
  if(name==='get_finance_expense_access')return {data:{can_view_all:true,can_submit:true,can_review:true,can_approve:true}};
  if(name==='get_finance_statement_accounts')return {data:{accounts:[],can_transfer:false,can_manage_openings:false}};
  if(name==='advisory_control_section'){const items=args.p_section==='tasks'?(tasks[args.p_matter_id]||[]):[];return{data:{items,total:items.length}};}
  if(name!=='advisory_control_read')throw Error('Preview forbids business/write RPC: '+name);
  if(args.p_matter_id){const m=rows.find(m=>m.id===args.p_matter_id);return{data:{items:m?[m]:[],total:m?1:0,permissions:{manage:false,task:false,delete:false},stages:[],team:[],time:{minutes:0,core:0,support:0,unclassified:0},state_history:[],other_matters:[]}};}
  const q=args.p_query||{};
  await new Promise(resolve=>setTimeout(resolve,q.tab==='overdue'?180:40));
  let items=rows.filter(m=>(!q.search||(m.title+m.matter_no+m.client_name).includes(q.search))&&(!q.client_id||m.client_id===q.client_id)&&(!q.type||m.matter_type===q.type)&&(!q.lead||m.lead_id===q.lead)&&(!q.state||m.work_state===q.state));
  if(q.tab==='overdue')items=items.filter(m=>overdueIds.includes(m.id));
  else if(q.tab==='closed')items=items.filter(m=>m.closed_at);
  else if(q.tab==='mine')items=items.filter(m=>m.lead_id==='admin');
  if(q.sort==='due')items.sort((a,b)=>(a.next_due||'9999').localeCompare(b.next_due||'9999'));
  const data={items:items.slice(q.offset||0,(q.offset||0)+20),total:items.length,
   summary:{open:25,overdue:overdueIds.length,overdue_items:rows.reduce((n,m)=>n+m.overdue_item_count,0),waiting:24,closed_week:1},permissions:{manage:false,task:false,delete:false}};
  window.lastResult=data;
  return {data};
 },
};
