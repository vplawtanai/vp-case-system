// Synthetic identities only. This adapter has no network or mutation implementation.
function fixture(today='2026-10-01') {
 const day=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const client={id:'client-a',name:'ABC Trade',client_type:'limited_company',contact_name:'Demo Contact',phone:'000-000-0000',email:'demo@example.invalid',address:'Demo office',status:'active',note:'Client internal note'};
 const matter=(id,extra={})=>({id,client_id:client.id,client_name:client.name,matter_no:'ADV-DEMO-'+id,title:'Review '+id,matter_type:'contract_review',status:'active',lead_name:'Demo Lawyer',lead_id:'admin',created_at:day(-30)+'T00:00:00Z',updated_at:day(-2)+'T00:00:00Z',closed_at:null,next_task_id:null,next_action:null,next_due:null,stage_key:null,stage_days:null,age_days:30,work_state:'working',...extra});
 const matters=[matter('one',{stage_key:'analysis',next_task_id:'open',next_action:'Draft reply',next_due:day(-2)}),matter('two',{next_task_id:'done',next_action:'Completed task must stay completed',next_due:day(-5)}),matter('three',{next_action:'Confirm meeting',next_due:day(2)}),matter('four',{status:'completed',closed_at:day(-1)+'T00:00:00Z'}),matter('foreign',{client_id:'client-b'})];
 const task=(id,m,status,due)=>({id,advisory_matter_id:m,title:id==='open'?'Draft reply':id+' task',status,priority:'normal',due_date:due,completed_at:status==='completed'?day(-1)+'T00:00:00Z':null,deleted_at:null,assignee_name:'Demo Lawyer'});
 const tasks=[task('open','one','pending',day(-2)),task('done','two','completed',day(-5)),task('cancelled','one','cancelled',day(-4)),task('removed','one','pending',day(-3)),task('closed','four','pending',day(-3)),task('foreign','foreign','pending',day(-8))];tasks.find(t=>t.id==='removed').deleted_at=day(-1);
 const cases=[{id:101,client_id:client.id,file_no:'LIT-DEMO-101',title:'Contract dispute',status:'Active',court_name:'Demo Court',owner_name:'Demo Lawyer',phase:'Trial',created_at:day(-30),updated_at:day(-1)},{id:102,client_id:client.id,file_no:'LIT-DEMO-102',title:'Closed case',status:'Done'},{id:103,client_id:'client-b',file_no:'LIT-FOREIGN',title:'Other client case',status:'Active'}];
 const activities=[{id:'activity',matter_id:'one',kind:'note',occurred_at:day(-1)+'T10:00:00Z',detail:{input:{text:'Discussed the review plan'}}}];
 const overdue=[{matter_id:'one',source:'task',source_id:'open',title:'Draft reply',due_date:day(-2),overdue_days:2,is_next_action:true,assignee_name:'Demo Lawyer'}];
 const profile={id:'admin',role:'admin',active:true,must_change_password:false,full_name:'Demo Admin',account_type:'operational',assignable:true};
 const tables={clients:[client,{...client,id:'client-b',contact_name:'Different Contact',note:null},{...client,id:'client-empty',name:'Empty Client',contact_name:null,note:null},{...client,id:'deleted-client',status:'deleted'}],user_profiles:[profile],cases,advisory_operational_tasks:tasks,advisory_matter_activities:activities,
  case_tasks:[{id:'ct',case_id:101,task_type:'เตรียมเอกสาร',task_other:'',due_date:day(2),status:'Pending',deleted_at:null},{id:'ct-done',case_id:101,task_type:'Completed',due_date:day(-1),status:'Done',deleted_at:null}],
  case_deadlines:[{id:'cd',case_id:101,deadline_type:'answer',deadline_other:'',current_due_date:day(7),status:'Pending',deleted_at:null},{id:'cd-filed',case_id:101,deadline_type:'answer',current_due_date:day(-4),status:'filed',deleted_at:null}],
  case_timeline:[{id:'hearing',case_id:101,event_type:'hearing',event_date:day(10),appointment_type:'นัดไกล่เกลี่ย',status:'Scheduled',deleted_at:null},{id:'note-event',case_id:101,event_type:'note',event_date:day(-6),status:'Pending',deleted_at:null}],
  case_enforcements:[{id:'enforced',case_id:101,final_due_date:day(-4),status:'writ_requested',writ_request_date:day(-2),writ_issued_date:null,deleted_at:null}],
  case_notes:[{id:'cn',case_id:101,note_title:'Case note',note_text:'Read-only existing note',note_date:day(-1),created_at:day(-1),deleted_at:null}]
 };
 return {client,matters,cases,tasks,activities,overdue,tables,profile};
}
function database(f=fixture(),options={}) {
 const calls=[],state={fail:null,...options};
 const db={auth:{async getUser(){return {data:{user:{id:'admin'}},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
  from(table){const filters=[];let start=0,end=Infinity,fields='*';const run=()=>{calls.push({table,fields,filters:[...filters],start,end});if(state.fail===table)return {data:null,error:{message:'Synthetic read failure'}};let rows=f.tables[table];if(!rows)throw Error('Unexpected table '+table);rows=rows.filter(r=>filters.every(([op,k,v])=>op==='in'?v.includes(r[k]):op==='is'?r[k]===v:r[k]===v));return {data:rows.slice(start,Math.min(end+1,start+(state.cap||3))),error:null};};
   const q={select(value){fields=value;return q;},eq(k,v){filters.push(['eq',k,v]);return q;},in(k,v){filters.push(['in',k,v]);return q;},is(k,v){filters.push(['is',k,v]);return q;},order(){return q;},range(a,b){start=a;end=b;return q;},limit(n){end=n-1;return q;},async single(){const r=run();return {...r,data:r.data?.[0]??null};},async maybeSingle(){return q.single();},then(resolve,reject){return Promise.resolve().then(run).then(resolve,reject);}};return q;
  },
  async rpc(name,args={}) {calls.push({name,args});if(state.fail===name)return {data:null,error:{message:'Synthetic read failure'}};
   if(name==='get_finance_statement_accounts')return {data:[],error:null};
   if(name==='get_finance_expense_access')return {data:{can_view_all:true},error:null};
   if(name==='advisory_overdue_work')return {data:f.overdue.filter(o=>o.matter_id===args.p_matter_id),error:null};
   if(name!=='advisory_control_read')throw Error('Unexpected RPC '+name);
   const query=args.p_query||{},items=f.matters.filter(m=>(!query.client_id||m.client_id===query.client_id)&&(!query.search||(m.title+m.matter_no).includes(query.search))),offset=query.offset||0;
   return {data:{items:items.slice(offset,offset+Math.min(query.limit||20,state.cap||3)),total:items.length,permissions:{manage:true},summary:{open:4,overdue:1,overdue_items:1,waiting:0,closed_week:1}},error:null};
  }};
 return {db,calls,state};
}
module.exports={fixture,database};
