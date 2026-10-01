import type {Matter, OverdueItem} from './advisory-control';
import {matterClosed} from './advisory-workflow';
import {getDueStatus, isClosedStatus} from './dueStatus';

export type ClientRecord = {id:string;name:string;client_type:string|null;contact_name:string|null;phone:string|null;email:string|null;address:string|null;status:string|null;note:string|null};
export type ClientMatter = Matter & {updated_at?:string|null};
export type ClientCase = {id:number;client_id:string;file_no:string|null;title:string|null;court_name:string|null;owner_name:string|null;phase:string|null;status:string|null;created_at:string|null;updated_at:string|null};
export type ClientTask = {id:string;advisory_matter_id:string;title:string;status:string;priority:string;assignee_name:string|null;due_date:string|null;completed_at:string|null};
export type ClientActivity = {id:string;matter_id:string;kind:string;occurred_at:string;detail:{title?:string;input?:{text?:string;title?:string;summary?:string}}};
export type CaseTask = {id:string;case_id:number;task_type:string|null;task_other:string|null;due_date:string|null;status:string|null};
export type CaseDate = {id:string;case_id:number;kind:'deadline'|'hearing'|'enforcement';date:string|null;title:string|null;systemTitle?:boolean;status:string|null;writ_request_date?:string|null;writ_issued_date?:string|null};
export type CaseNote = {id:string;case_id:number;note_title:string|null;note_text:string|null;note_date:string|null;created_at:string|null};
export type WorkspaceData = {client:ClientRecord;matters:ClientMatter[];cases:ClientCase[]|null;tasks:ClientTask[];overdue:(OverdueItem & {matter_id:string})[];activities:ClientActivity[];caseTasks:CaseTask[];caseDates:CaseDate[];caseNotes:CaseNote[]};
// Shared Client identity; source ownership/routes stay with their original module.
// A later Case-from-Matter contract can add an explicit origin link without re-keying either work item.
export type WorkRef = {kind:'advisory'|'case';id:string;clientId:string;code:string;href:string};
export type WorkItem = {key:string;ref:WorkRef;title:string;systemTitle?:boolean;due:string|null;overdueDays:number;urgent:boolean;highPriority?:boolean;kind:'task'|'next_action'|'deadline'|'hearing'|'enforcement'};
export const workHref=(kind:WorkRef['kind'],id:string|number)=>`/${kind==='case'?'cases':'advisory'}/${encodeURIComponent(id)}`;
export const bangkokDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const caseOpen=(c:ClientCase)=>['active','waiting'].includes((c.status||'').toLowerCase());
const days=(today:string,due:string)=>Math.max(0,Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(due.slice(0,10)+'T00:00:00Z'))/86400000));
const order=(a:WorkItem,b:WorkItem)=>b.overdueDays-a.overdueDays||Number(b.urgent)-Number(a.urgent)||(a.due||'9999').localeCompare(b.due||'9999')||a.key.localeCompare(b.key);
export function summarizeClient(data:WorkspaceData,today=bangkokDay()){
 const matters=data.matters.filter(m=>m.client_id===data.client.id),cases=data.cases?.filter(c=>c.client_id===data.client.id)??null;
 const matterMap=new Map(matters.map(m=>[m.id,m])),caseMap=new Map((cases||[]).map(c=>[c.id,c]));
 const ref=(kind:WorkRef['kind'],id:string|number):WorkRef=>({kind,id:String(id),clientId:data.client.id,code:kind==='advisory'?matterMap.get(String(id))!.matter_no:caseMap.get(Number(id))!.file_no||String(id),href:workHref(kind,id)});
 const overdue=new Map(data.overdue.filter(o=>matterMap.has(o.matter_id)).map(o=>[o.source+':'+o.source_id,o]));
 const actions:WorkItem[]=[];
 for(const task of data.tasks){
  const m=matterMap.get(task.advisory_matter_id);if(!m||matterClosed(m)||task.completed_at||!['pending','in_progress','waiting'].includes(task.status))continue;
  const o=overdue.get('task:'+task.id);
  actions.push({key:'advisory:task:'+task.id,ref:ref('advisory',m.id),title:task.title,due:task.due_date,overdueDays:o?.overdue_days||0,urgent:!!o||['high','urgent'].includes(task.priority),highPriority:['high','urgent'].includes(task.priority),kind:'task'});
 }
 for(const m of matters){
  // Linked tasks are represented once above. Never resurrect a completed/missing linked task as free text.
  if(matterClosed(m)||m.next_task_id||!m.next_action?.trim())continue;
  const o=overdue.get('next_action:'+m.id);
  actions.push({key:'advisory:next_action:'+m.id,ref:ref('advisory',m.id),title:m.next_action,due:m.next_due,overdueDays:o?.overdue_days||0,urgent:!!o,kind:'next_action'});
 }
 for(const task of data.caseTasks){
  const c=caseMap.get(task.case_id);if(!c||!caseOpen(c)||isClosedStatus(task.status))continue;
  const risk=getDueStatus(task.due_date,task.status,today);
  actions.push({key:'case:task:'+task.id,ref:ref('case',c.id),title:task.task_type==='อื่นๆ'?task.task_other||'':task.task_type||'',systemTitle:task.task_type!=='อื่นๆ',due:task.due_date,overdueDays:risk==='overdue'?days(today,task.due_date!):0,urgent:['overdue','today','dueSoon'].includes(risk),kind:'task'});
 }
 const schedules:WorkItem[]=[...actions.filter(a=>a.due)];
 for(const event of data.caseDates){
  const c=caseMap.get(event.case_id),status=(event.status||'').toLowerCase();
  if(!c||!caseOpen(c)||isClosedStatus(status)||!event.date)continue;
  if(event.kind==='deadline'&&['filed','submitted'].includes(status))continue;
  if(event.kind==='enforcement'&&(event.writ_request_date||event.writ_issued_date||['writ_requested','writ_issued','asset_searching','no_asset_found','asset_found_waiting_approval','client_rejected','approved_waiting_seizure','seized_waiting_auction','sold'].includes(status)))continue;
  const risk=getDueStatus(event.date,status,today);
  schedules.push({key:'case:'+event.kind+':'+event.id,ref:ref('case',c.id),title:event.title||'',systemTitle:event.systemTitle,due:event.date,overdueDays:risk==='overdue'?days(today,event.date):0,urgent:['overdue','today','dueSoon'].includes(risk),kind:event.kind});
 }
 const urgent=[...new Map([...actions,...schedules].filter(x=>x.urgent).map(x=>[x.key,x])).values()].sort(order);
 const upcoming=schedules.filter(x=>x.due&&x.due>=today&&['today','dueSoon','upcoming','planned'].includes(getDueStatus(x.due,null,today))).sort((a,b)=>a.due!.localeCompare(b.due!)||a.key.localeCompare(b.key));
 const activities=data.activities.filter(a=>matterMap.has(a.matter_id)).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at));
 const notes=[...activities.filter(a=>a.kind==='note').map(a=>({key:'advisory:'+a.id,text:a.detail.input?.text||a.detail.title||'',date:a.occurred_at,ref:ref('advisory',a.matter_id)})),...data.caseNotes.filter(n=>caseMap.has(n.case_id)).map(n=>({key:'case:'+n.id,text:[n.note_title,n.note_text].filter(Boolean).join('\n'),date:n.note_date||n.created_at||'',ref:ref('case',n.case_id)}))].filter(n=>n.text).sort((a,b)=>b.date.localeCompare(a.date));
 const updates=[...matters.map(m=>m.updated_at||m.created_at),...(cases||[]).map(c=>c.updated_at||c.created_at),...activities.map(a=>a.occurred_at),...notes.map(n=>n.date)].filter((d):d is string=>!!d&&Number.isFinite(Date.parse(d)));
 const latest=updates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 return {matters,cases,openMatters:matters.filter(m=>!matterClosed(m)).length,openCases:cases?.filter(caseOpen).length??null,actions:actions.sort(order),urgent,upcoming,activities,notes,latest};
}
