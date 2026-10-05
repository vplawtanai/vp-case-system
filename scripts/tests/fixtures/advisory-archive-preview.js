// Synthetic localhost-only read model. Canonical rows retain archived canaries;
// operational views/RPCs exclude them, as independently tested in PostgreSQL.
import targets from './advisory-095-reviewed-targets.json';
import fixtures from './client-workspace.cjs';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const f=fixtures.fixture(today),archived=new Set(targets.targets.map(t=>t.id));
const numbers=Array.from({length:9},(_,i)=>({id:'00000000-0000-4000-8000-'+String(904+i).padStart(12,'0'),matter_no:'ADV-2026-'+String(i+4).padStart(3,'0')}));
const matters=[...numbers,...targets.targets].map(t=>({...f.matters[0],...t,title:(archived.has(t.id)?'ARCHIVED_CANARY ':'Preserved matter ')+t.matter_no,work_state:'working',responsible_lawyer:'Demo Admin',updated_at:today,next_action:(archived.has(t.id)?'ARCHIVED_CANARY ':'Live next ')+t.matter_no,next_due:today,has_overdue_work:true,overdue_items:1,overdue_preview:[],version:1,permissions:{manage:true}}));
const tasks=matters.map(m=>({id:'task-'+m.id,advisory_matter_id:m.id,client_id:m.client_id,title:(archived.has(m.id)?'ARCHIVED_CANARY ':'Live task ')+m.matter_no,status:'pending',priority:'normal',due_date:today,assignee_name:'Demo Admin',deleted_at:null}));
const tables={...f.tables,cases:[],case_tasks:[],case_deadlines:[],case_timeline:[],case_enforcements:[],case_notes:[],advisory_matter_activities:[],advisory_matters:matters,advisory_issue_tasks:tasks,advisory_issues:[],advisory_time_logs:[],advisory_advice_records:[],office_work_logs:[],case_time_logs:[],work_types:[]};
const aliases={advisory_operational_matters:['advisory_matters','id'],advisory_operational_tasks:['advisory_issue_tasks','advisory_matter_id'],advisory_operational_issues:['advisory_issues','advisory_matter_id'],advisory_operational_time:['advisory_time_logs','advisory_matter_id'],advisory_operational_advice:['advisory_advice_records','advisory_matter_id']};
window.calls=[];
export const supabase={
 auth:{async getUser(){return{data:{user:{id:'admin',email:'synthetic@example.invalid'}}};},onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}},
 from(table){
  const alias=aliases[table];let rows=alias?tables[alias[0]].filter(r=>!archived.has(r[alias[1]])):tables[table]||[],start=0,end=Infinity;
  const run=()=>{window.calls.push({table});return{data:rows.slice(start,end+1),count:rows.length,error:null};};
  const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},or(){return q;},order(){return q;},gte(){return q;},lte(){return q;},lt(){return q;},range(a,b){start=a;end=b;return q;},limit(n){end=n-1;return q;},async single(){const r=run();return{...r,data:r.data[0]||null};},async maybeSingle(){return q.single();},then(resolve,reject){return Promise.resolve(run()).then(resolve,reject);}};return q;
 },
 async rpc(name,args={}){
  window.calls.push({name,args});
  if(name==='get_finance_expense_access')return{data:{can_view_all:true,can_submit:true,can_review:true,can_approve:true}};
  if(name==='get_finance_statement_accounts')return{data:[]};
  if(name==='advisory_overdue_work')return{data:tasks.filter(t=>!archived.has(t.advisory_matter_id)&&t.advisory_matter_id===args.p_matter_id).map(t=>({...t,matter_id:t.advisory_matter_id,source:'task',source_id:t.id,due_date:'2020-01-01',overdue_days:1,is_next_action:true}))};
  if(name==='advisory_control_read'){
   const query=args.p_query||{};
   const items=matters.filter(m=>!archived.has(m.id)&&(!args.p_matter_id||m.id===args.p_matter_id)&&(!query.client_id||m.client_id===query.client_id)&&(!query.search||(m.matter_no+' '+m.title).includes(query.search)));
   if(args.p_matter_id&&!items.length)return{error:{message:'ADVISORY_MATTER_NOT_FOUND'}};
   const result={items:items.slice(query.offset||0,(query.offset||0)+(query.limit||20)),total:items.length,permissions:{manage:true,task:true,delete:true},summary:{open:9,overdue:9,overdue_items:9,waiting:0,closed_week:0},team:[],stages:[],other_matters:[],time:{minutes:0}};
   window.lastArchiveResult=result;return{data:result};
  }
  if(name==='advisory_control_section')return{data:{items:[],total:0}};
  throw Error('Unexpected RPC in read-only archive preview: '+name);
 }
};
