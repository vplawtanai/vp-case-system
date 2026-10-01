import type {SupabaseClient} from '@supabase/supabase-js';
import {buildPermissions} from './permissions';
import type {ClientRecord,ClientMatter,ClientCase,ClientTask,ClientActivity,CaseTask,CaseDate,CaseNote,WorkspaceData} from './client-workspace';
import type {OverdueItem} from './advisory-control';

// Only caller-scoped SELECTs and existing read RPCs; no service client or writes.
async function access(db:SupabaseClient){
 const user=await db.auth.getUser();if(user.error||!user.data.user)throw Error('CLIENT_ACCESS_DENIED');
 const p=await db.from('user_profiles').select('role,active,must_change_password').eq('id',user.data.user.id).single();
 if(p.error||p.data?.active!==true||p.data?.must_change_password!==false)throw Error('CLIENT_ACCESS_DENIED');
 const permissions=buildPermissions(p.data);if(!permissions.canViewDashboard)throw Error('CLIENT_ACCESS_DENIED');return permissions;
}
const CLIENT_FIELDS='id,name,client_type,contact_name,phone,email,address,status,note';
// Traverse actual returned pages (including server-imposed caps), never silently report a partial total.
async function allRows<T>(query:(offset:number)=>PromiseLike<{data:unknown;error:unknown}>){
 const result:T[]=[];let offset=0;
 for(;;){const r=await query(offset);if(r.error||!Array.isArray(r.data))throw Error('CLIENT_READ_FAILED');if(!r.data.length)return result;result.push(...r.data as T[]);offset+=r.data.length;}
}
async function linkedRows<T>(db:SupabaseClient,table:string,fields:string,key:string,ids:(string|number)[],softDelete=false){
 const rows:T[]=[];
 for(let i=0;i<ids.length;i+=50){const chunk=ids.slice(i,i+50);rows.push(...await allRows<T>(offset=>{let q=db.from(table).select(fields).in(key,chunk).order('id').range(offset,offset+199);if(softDelete)q=q.is('deleted_at',null);return q;}));}
 return rows;
}
export async function readClientDirectory(db:SupabaseClient){
 await access(db);
 const rows=await allRows<ClientRecord>(offset=>db.from('clients').select(CLIENT_FIELDS).order('id').range(offset,offset+199));
 return rows.filter(c=>c.status!=='deleted').sort((a,b)=>(a.name||'').localeCompare(b.name||''));
}
export async function readClientWorkspace(db:SupabaseClient,clientId:string):Promise<WorkspaceData>{
 const permissions=await access(db);
 const cr=await db.from('clients').select(CLIENT_FIELDS).eq('id',clientId).maybeSingle();
 if(cr.error||!cr.data||cr.data.status==='deleted')throw Error('CLIENT_READ_FAILED');
 const client=cr.data as ClientRecord,matters:ClientMatter[]=[];
 for(let offset=0;;){
  const r=await db.rpc('advisory_control_read',{p_matter_id:null,p_query:{client_id:client.id,limit:50,offset}});
  if(r.error||!Array.isArray(r.data?.items)||!Number.isInteger(r.data.total))throw Error('CLIENT_READ_FAILED');
  const items=r.data.items as ClientMatter[];if(items.some(m=>m.client_id!==client.id))throw Error('CLIENT_READ_FAILED');
  matters.push(...items);offset+=items.length;if(offset>=r.data.total)break;if(!items.length)throw Error('CLIENT_READ_FAILED');
 }
 const cases=permissions.canViewCases?await allRows<ClientCase>(offset=>db.from('cases').select('id,client_id,file_no,title,court_name,owner_name,phase,status,created_at,updated_at').eq('client_id',client.id).order('id').range(offset,offset+199)):null;
 if(cases?.some(c=>c.client_id!==client.id))throw Error('CLIENT_READ_FAILED');
 const matterIds=matters.map(m=>m.id),caseIds=(cases||[]).map(c=>c.id);
 const [tasks,activities,overdue,caseTasks,deadlines,hearings,enforcements,caseNotes]=await Promise.all([
  linkedRows<ClientTask>(db,'advisory_issue_tasks','id,advisory_matter_id,title,status,priority,assignee_name,due_date,completed_at','advisory_matter_id',matterIds,true),
  linkedRows<ClientActivity>(db,'advisory_matter_activities','id,matter_id,kind,occurred_at,detail','matter_id',matterIds),
  (async()=>{const rows:(OverdueItem & {matter_id:string})[]=[];for(const id of matterIds){const r=await db.rpc('advisory_overdue_work',{p_matter_id:id});if(r.error||!Array.isArray(r.data))throw Error('CLIENT_READ_FAILED');rows.push(...r.data);}return rows;})(),
  linkedRows<CaseTask>(db,'case_tasks','id,case_id,task_type,task_other,due_date,status','case_id',caseIds,true),
  linkedRows<{id:string;case_id:number;deadline_type:string|null;deadline_other:string|null;current_due_date:string|null;status:string|null}>(db,'case_deadlines','id,case_id,deadline_type,deadline_other,current_due_date,status','case_id',caseIds,true),
  linkedRows<{id:string;case_id:number;event_type:string;event_date:string|null;appointment_type:string|null;appointment_other:string|null;status:string|null}>(db,'case_timeline','id,case_id,event_type,event_date,appointment_type,appointment_other,status','case_id',caseIds,true),
  linkedRows<{id:string;case_id:number;final_due_date:string|null;status:string|null;writ_request_date:string|null;writ_issued_date:string|null}>(db,'case_enforcements','id,case_id,final_due_date,status,writ_request_date,writ_issued_date','case_id',caseIds,true),
  linkedRows<CaseNote>(db,'case_notes','id,case_id,note_title,note_text,note_date,created_at','case_id',caseIds,true),
 ]);
 const caseDates:CaseDate[]=[...deadlines.map(d=>({id:d.id,case_id:d.case_id,kind:'deadline' as const,date:d.current_due_date,title:d.deadline_type==='other'?d.deadline_other:d.deadline_type,systemTitle:d.deadline_type!=='other',status:d.status})),...hearings.filter(e=>e.event_type==='hearing').map(e=>({id:e.id,case_id:e.case_id,kind:'hearing' as const,date:e.event_date,title:e.appointment_type==='นัดอื่นๆ'?e.appointment_other:e.appointment_type,systemTitle:e.appointment_type!=='นัดอื่นๆ',status:e.status})),...enforcements.map(e=>({...e,kind:'enforcement' as const,date:e.final_due_date,title:null}))];
 return {client,matters,cases,tasks,activities,overdue,caseTasks,caseDates,caseNotes};
}
