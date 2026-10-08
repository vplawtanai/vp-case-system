export const TEAM_ROLES = ['lead','strategy','qc','current_actor'] as const;
export type TeamRole = typeof TEAM_ROLES[number] | 'member';
export const WORK_STATES = ['action_required','waiting_court','waiting_client','waiting_opponent','waiting_external','no_current_action'] as const;
export type CorePerson = {id:string;name:string;full_name:string|null;eligible:boolean};
export type CoreTask = {id:string;task_type:string|null;task_other:string|null;assignee_name:string|null;due_date:string|null;status:string|null;deleted_at:string|null};
export type CoreData = {
 core: null | {version:number;work_state:string|null;next_mode:'none'|'manual'|'task';next_task_id:string|null;next_title:string|null;next_assignee_id:string|null;next_due:string|null};
 team: {person_id:string;team_role:TeamRole}[]; people:CorePerson[];tasks:CoreTask[];
};
export function personLabel(p:CorePerson) { return `${p.name}${p.full_name && p.full_name!==p.name ? ' · '+p.full_name : ''} · ${p.id.slice(0,8)}`; }
export function linkedTaskAvailable(t:CoreTask|undefined) { return !!t && !t.deleted_at && t.status!=='Done'; }
export function primaryAction(data:CoreData) {
 const c=data.core;
 if(!c || c.next_mode==='none')return null;
 if(c.next_mode==='task') {const task=data.tasks.find(t=>t.id===c.next_task_id);if(!linkedTaskAvailable(task))return null;return {title:task!.task_type==='อื่นๆ'?task!.task_other:task!.task_type,assignee:task!.assignee_name,due:task!.due_date,linked:true};}
 return {title:c.next_title,assignee:data.people.find(p=>p.id===c.next_assignee_id)?.name||null,due:c.next_due,linked:false};
}
export function coreError(message:string) {
 return ['CASE098_FORBIDDEN','CASE098_NOT_FOUND','CASE098_STALE','CASE098_INVALID_INPUT','CASE098_PERSON_INELIGIBLE','CASE098_TASK_UNAVAILABLE'].find(code=>message.includes(code)) || 'Core could not be saved. Please refresh and try again.';
}
