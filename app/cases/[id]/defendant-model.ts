import {addCalendarDays, type ServiceAttempt, type ServiceDeadline} from './service-model';
import type {FlowData, FlowStage, FlowEvent} from './flow-model';

export type DefendantParty = {id:string;case_id:number;role:string;order_no:number|null;entity_type:string|null;title?:string|null;first_name?:string|null;last_name?:string|null;company_name?:string|null;deleted_at?:string|null};
export type Coverage = {party_id:string;coverage_version:number;side?:'claimant'|'target'};
export type Filing = {id:string;filed_on:string;document_ref:string|null;note:string|null;lifecycle:'active'|'void'|'corrected';version:number;coverage_version:number;replaces_id:string|null;reason:string|null;coverage:Coverage[];recorded_at:string;updated_at:string};
export type Counterclaim = Filing & {filing_id:string};
export type ExtensionGroup = {id:string;requested_on:string|null;lifecycle:'pending'|'granted';document_ref:string|null;note:string|null;version:number;coverage:{party_id:string;deadline_id:string;extension_id:string|null}[]};
export type Representation = {party_id:string;active:boolean;version:number;reason:string|null;party:DefendantParty;resolved:boolean;filed_on:string|null;control:{lawful_attempt_id:string|null;answer_deadline_id:string|null;answer_filed_on:string|null}|null;deadline:ServiceDeadline|null;attempts:ServiceAttempt[];extensions:{id:string;extension_no:number;requested_date:string|null;granted_until_date:string;deleted_at:string|null}[]};
export type DefendantData = {version:number;represented:Representation[];filings:Filing[];extension_groups:ExtensionGroup[];counterclaims:Counterclaim[];flow:(Omit<NonNullable<FlowData['instance']>,'filing_method'>&{filing_method:string|null})|null;template:FlowData['template'];stages:FlowStage[];transitions:(FlowEvent&{actor_id:string})[];all_resolved:boolean;flow_inconsistency:boolean;history:{id:string;action:string;actor_id:string;occurred_at:string;before_data:Record<string,unknown>;after_data:Record<string,unknown>}[]};
export type DefendantContext = {data:DefendantData;parties:DefendantParty[];manualDeadlines:ServiceDeadline[];actors:Record<string,string>};
export const DEFENDANT_TEMPLATE='civil_ordinary_defendant_v1';
export const liveRepresentations=(data:DefendantData)=>data.represented.filter(r=>r.active&&!r.party.deleted_at&&r.party.role==='defendant');
export const currentCoverage=(f:Filing)=>f.coverage.filter(c=>c.coverage_version===f.coverage_version);
export const filingsFor=(data:DefendantData,partyId:string)=>data.filings.filter(f=>f.lifecycle==='active'&&currentCoverage(f).some(c=>c.party_id===partyId));
export function partyName(p:DefendantParty){return p.entity_type==='company'?p.company_name||'': [p.title,p.first_name,p.last_name].filter(Boolean).join(' ');}
export function partyLabel(p:DefendantParty){return `${p.role==='defendant'?'D':'P'}${p.order_no??'—'} · ${partyName(p)}`;}
export function defendantObligation(data:DefendantData,r:Representation,today:string){
 const filings=filingsFor(data,r.party_id),deadline=r.deadline;
 const filed=filings.length>0;
 const linked=!!deadline&&deadline.id===r.control?.answer_deadline_id&&!deadline.deleted_at;
 const due=linked?deadline.current_due_date:null;
 const days=!filed&&r.active&&linked&&deadline.status==='Active'&&due ? Math.round((Date.parse(due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
 return {filings,filed,due,days:days!==null&&Number.isFinite(days)?days:null,extended:r.extensions.some(e=>!e.deleted_at),state:!r.active?'withdrawn':filed?'filed':!linked?'unconfirmed':deadline.status!=='Active'?'review':'open'};
}
export function defendantSuggestion(r:Representation){
 const attempt=r.attempts.find(a=>a.id===r.control?.lawful_attempt_id&&a.result==='served');
 if(!attempt?.attempted_on)return null;
 const days=attempt.method==='normal'?15:['posting','electronic'].includes(attempt.method||'')?30:null;
 return days?{days,date:addCalendarDays(attempt.attempted_on,days),attempt}:null;
}
export function flowReadiness(data:DefendantData){
 const active=liveRepresentations(data),allFiled=active.length>0&&active.every(r=>filingsFor(data,r.party_id).length>0);
 // Pending requests are context for open obligations, never a completion gate.
 const pending=data.extension_groups.filter(g=>g.lifecycle==='pending'&&g.coverage.some(c=>active.some(r=>r.party_id===c.party_id)&&!filingsFor(data,c.party_id).length));
 const readyForPreparation=active.length>0&&active.every(r=>r.deadline&&!r.deadline.deleted_at&&r.control?.answer_deadline_id===r.deadline.id);
 return {allFiled,pending,readyForPreparation,readyForHearing:allFiled,inconsistent:data.flow?.current_stage==='D-CIV-03'&&!allFiled&&active.length>0};
}
export function deadlineVersions(data:DefendantData,manual:ServiceDeadline[]=[]){
 return Object.fromEntries([...data.represented.flatMap(r=>r.deadline?[r.deadline]:[]),...manual].map(d=>[d.id,{due:d.current_due_date,updated_at:d.updated_at}]));
}
export type SaveRequest = {p_case_id:number;p_request_id:string;p_action:string;p_data:Record<string,unknown>;p_versions:{scope:number;entity:number;flow:number;deadlines:ReturnType<typeof deadlineVersions>}};
// Freeze the entire request, including versions. A transport retry must replay exactly the same operation.
export function prepareDefendantRequest(previous:SaveRequest|null,caseId:number,action:string,payload:Record<string,unknown>,data:DefendantData,entity:number,manual:ServiceDeadline[]=[],newId=()=>crypto.randomUUID()):SaveRequest{
 if(previous&&previous.p_case_id===caseId&&previous.p_action===action&&JSON.stringify(previous.p_data)===JSON.stringify(payload))return previous;
 return {p_case_id:caseId,p_request_id:newId(),p_action:action,p_data:structuredClone(payload),p_versions:{scope:data.version,entity,flow:data.flow?.version||0,deadlines:deadlineVersions(data,manual)}};
}
export function defendantError(message:string){
 if(/CASE104_STALE/.test(message))return 'stale';
 if(/CASE104_ACTIVE_COUNTERCLAIM|CASE104_COUNTERCLAIM_COVERAGE/.test(message))return 'dependency';
 if(/CASE104_CONTEXT_CONFLICT/.test(message))return 'conflict';
 if(/CASE104_LEGACY_FILING_REVIEW/.test(message))return 'legacyReview';
 if(/FORBIDDEN|LAWYER_REQUIRED|42501/.test(message))return 'forbidden';
 if(/DEADLINE_REVIEW|EXTENSION_REVIEW|DEADLINE_UNAVAILABLE|CONTROLLED_DEADLINE/.test(message))return 'deadlineReview';
 if(/PARTY_UNAVAILABLE|PARTIES_REQUIRED|DUPLICATE_PARTY/.test(message))return 'partyReview';
 if(/UNRESOLVED/.test(message))return 'unresolved';
 if(/REQUEST_CONFLICT/.test(message))return 'requestConflict';
 if(/ATTEMPT_FINAL|ATTEMPT_UNAVAILABLE/.test(message))return 'attemptFinal';
 if(/INVALID_DATE/.test(message))return 'invalidDate';
 if(/REASON_REQUIRED/.test(message))return 'reasonRequired';
 if(/CONFIRM_REQUIRED/.test(message))return 'confirmRequired';
 if(/CASE104_|CASE102_|CASE103_/.test(message))return 'invalid';
 return 'uncertain';
}
