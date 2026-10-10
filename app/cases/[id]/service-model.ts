import type {FlowData} from './flow-model';
export type ServiceAttempt={id:string;method:'normal'|'posting'|'electronic'|'other'|null;attempted_on:string|null;result:'pending'|'served'|'failed'|'void';failure_kind:string|null;failure_reason:string|null;note:string|null;void_reason:string|null;recorded_at:string;recorded_by:string};
export type ServiceDeadline={id:string;deadline_type:string;deadline_other:string|null;current_due_date:string|null;original_due_date:string|null;updated_at:string|null;status:string|null;deleted_at:string|null};
export type ServicePerson={id:string;name:string;order_no:number|null;control:null|{version:number;required:boolean;exemption_reason:string|null;lawful_attempt_id:string|null;lawful_at:string|null;answer_deadline_id:string|null;default_deadline_id:string|null;answer_filed_on:string|null;absent_hearing_id:string|null};attempts:ServiceAttempt[];answer_deadline:ServiceDeadline|null;default_deadline:ServiceDeadline|null;extensions:{id:string;extension_no:number;granted_until_date:string;note:string|null}[]};
export type ServiceData={today:string;flow:FlowData['instance'];defendants:ServicePerson[];deadlines:ServiceDeadline[];hearings:{id:string;event_date:string|null;appointment_type:string|null;appointment_other:string|null}[];history:{id:string;party_id:string|null;action:string;actor_name:string;occurred_at:string;before_data:unknown;after_data:unknown}[]};
export type ServiceAction='attempt'|'lawful'|'void'|'required'|'deadline'|'answer'|'absence'|'next'|'advance'|'branch';
export function addCalendarDays(day:string,days:number){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const d=new Date(day+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)return null;d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function lawfulAttempt(p:ServicePerson){return p.attempts.find(a=>a.id===p.control?.lawful_attempt_id&&a.result==='served')||null;}
export function answerSuggestion(p:ServicePerson){const a=lawfulAttempt(p);return a&&a.attempted_on&&a.method&&a.method!=='other'?addCalendarDays(a.attempted_on,a.method==='normal'?15:30):null;}
export function defaultSuggestion(p:ServicePerson,today:string){const d=p.answer_deadline;return lawfulAttempt(p)&&!p.control?.answer_filed_on&&d&&!d.deleted_at&&d.status==='Active'&&d.current_due_date&&d.current_due_date<today?addCalendarDays(d.current_due_date,15):null;}
export function latestServiceAttempt(p:ServicePerson){return p.attempts.find(a=>a.result!=='void')||null;}
export function serviceStatus(p:ServicePerson){if(p.control?.required===false)return 'exempt';return lawfulAttempt(p)?'served':latestServiceAttempt(p)?.result||'unrecorded';}
export function answerStatus(p:ServicePerson,today:string){
 if(p.control?.answer_filed_on)return 'answered';
 const d=p.answer_deadline;
 if(d&&!d.deleted_at&&d.status==='Active'&&d.current_due_date)return d.current_due_date<today?'overdue':'awaitingAnswer';
 if(d)return 'inactive';
 if(p.control?.required===false)return 'exempt';
 return serviceStatus(p)==='served'?'pendingDeadline':'beforeService';
}
export function serviceNextSuggestion(p:ServicePerson){const a=latestServiceAttempt(p);if(!a||a.result==='pending')return 'service.followupNext';if(a.failure_kind==='demolished')return 'service.demolishedNext';if(a.failure_kind==='not_found')return 'service.notFoundNext';return a.result==='failed'?'service.investigateSuggestion':null;}
// Only display changes from stored audit snapshots; never reconstruct historical facts.
export function serviceAttemptChanges(event:ServiceData['history'][number]){
 const attempts=(value:unknown):ServiceAttempt[]=>{if(!value||typeof value!=='object'||!('attempts' in value)||!Array.isArray(value.attempts))return [];return value.attempts.filter((a):a is ServiceAttempt=>!!a&&typeof a==='object'&&typeof a.id==='string');};
 const before=attempts(event.before_data);return attempts(event.after_data).flatMap(after=>{const old=before.find(a=>a.id===after.id);return old&&JSON.stringify(old)!==JSON.stringify(after)?[{before:old,after}]:[];});
}
export function serviceFlowSuggestions(data:ServiceData){const required=data.defendants.filter(p=>p.control?.required!==false);const all=required.length>0&&required.every(p=>lawfulAttempt(p));return {advance:!!(all&&data.flow?.lifecycle==='active'&&data.flow.current_stage==='service'),branch:!!(all&&data.flow?.lifecycle==='active'&&['service','defence'].includes(data.flow.current_stage)&&required.every(p=>p.control?.absent_hearing_id&&!p.control?.answer_filed_on))};}
export function serviceError(message:string){const code=message.match(/CASE102_[A-Z_]+/)?.[0];return code|| (message.includes('STALE')?'CASE102_STALE':message.includes('PERSON_INELIGIBLE')?'CASE102_PERSON_INELIGIBLE':'service.saveError');}

// Canonical 102 foreign keys, never a title/name match. Used only by the Deadline read model.
export type ServiceDeadlineLink={party_id:string;answer_deadline_id:string|null;default_deadline_id:string|null;answer_filed_on:string|null;party:{entity_type:string;company_name:string|null;title:string|null;first_name:string|null;last_name:string|null;deleted_at:string|null}|null;attempt:{method:ServiceAttempt['method'];attempted_on:string|null}|null};
export function linkedServiceDeadline(links:ServiceDeadlineLink[],id:string){
 const link=links.find(p=>p.answer_deadline_id===id||p.default_deadline_id===id);
 if(!link)return null;
 const name=link.party?.entity_type==='company'?link.party.company_name:[link.party?.title,link.party?.first_name,link.party?.last_name].filter(Boolean).join(' ');
 return {...link,name:name||'',kind:link.answer_deadline_id===id?'answer' as const:'default' as const};
}
export type AnswerRequest={partyId:string;key:number};
export type AnswerExtensionRequest=AnswerRequest&{deadlineId:string};
