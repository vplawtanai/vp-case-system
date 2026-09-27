// Phase 8C UI contract. Source facts and permission decisions come from PostgreSQL.
export type Matter = {
 id:string;client_id:string;client_name:string;matter_no:string;title:string;matter_type:string;status:string;
 responsible_lawyer:string|null;start_date:string|null;end_date:string|null;created_at:string;version:number;
 lead_id:string|null;lead_name:string|null;next_task_id:string|null;next_action:string|null;next_owner_id:string|null;next_owner_name:string|null;next_due:string|null;
 work_state:string|null;closed_at:string|null;outcome:string|null;outcome_summary:string|null;follow_up:string|null;case_reference:string|null;
 stage_key:string|null;template_key:string|null;entered_at:string|null;stage_days:number|null;age_days:number;
};
export type Person={id:string;full_name:string;staff_name:string|null;role:string};
export type Task={id:string;title:string;status:string;priority:string;assignee_user_id:string|null;assignee_name:string|null;stage_id:string|null;advisory_issue_id:string|null;due_date:string|null;completed_at:string|null;note:string|null};
export type Visit={id:string;kind:string;entered_at:string|null;exited_at:string|null;exit_reason:string|null};
export type Stage={id:string;stage_key:string;template_key:string;position:number;visits:Visit[];minutes:number|null;elapsed_seconds?:number|null;task_total?:number;task_completed?:number};
export type Deliverable={id:string;title:string;status:string;owner_id:string|null;due_date:string|null;version_label:string|null;drive_url:string|null};
export type Activity={id:string;kind:string;actor_id:string;occurred_at:string;detail:{input?:Record<string,string>;title?:string}};
export type ControlRead={items:Matter[];total:number;summary:{open:number;overdue:number;waiting:number;closed_week:number};permissions:{manage:boolean;task:boolean;delete:boolean};state_history?:{work_state:string;started_at:string;ended_at:string|null;reason:string|null}[];team?:{user_id:string;team_role:string;name:string}[];stages?:Stage[];time?:{minutes:number;core:number;support:number;unclassified:number};other_matters?:Pick<Matter,'id'|'matter_no'|'title'|'status'>[]};
export const workStates=['working','waiting_client','waiting_external','waiting_internal','on_hold'] as const;
// Work starters reuse existing database-backed sequences, never new Stage keys.
export const workPresets = [
 {key:'general_advisory',template:'general'},
 {key:'contract_work',template:'contract'},
 {key:'contract_review',template:'contract'},
 {key:'legal_opinion',template:'opinion'},
 {key:'monthly_advisory',template:'general'},
 {key:'negotiation',template:'negotiation'},
 {key:'corporate_registration',template:'license'},
 {key:'license_regulatory',template:'license'},
 {key:'government_registration',template:'license'},
 {key:'employment_hr',template:'contract'},
 {key:'intellectual_property',template:'license'},
 {key:'compliance',template:'general'},
 {key:'real_estate_review',template:'opinion'},
 {key:'pre_litigation_debt',template:'negotiation'},
 {key:'transactions_review',template:'opinion'},
 {key:'data_privacy',template:'opinion'},
 {key:'government_coordination',template:'general'},
] as const;
export const types=[...workPresets.map(p=>p.key),'document_drafting','meeting_consultation','corporate_support','other'] as const;
export const templates:Record<string,string[]>={contract:['intake','information','analysis','draft','review','client_delivery','negotiation','final','close'],license:['intake','requirements','preparation','submission','authority_wait','amendment','result','close'],opinion:['brief','facts','research','analysis','review','opinion_delivery','close'],negotiation:['intake','facts','strategy','contact','negotiation','result','close'],general:['intake','information','analysis','execution','delivery','close']};
export function defaultTemplate(type:string){return workPresets.find(p=>p.key===type)?.template||'general';}
export function stageState(stage:Stage,current:string|null,closed:boolean){if(stage.stage_key==='close'&&closed)return 'finished';if(stage.stage_key===current)return 'current';if(stage.visits.some(v=>v.kind==='visit'&&v.exited_at))return 'visited';if(stage.visits.some(v=>v.kind==='skip'))return 'skipped';return 'planned';}
export function personName(people:Person[],id:string|null,legacy?:string|null){const p=people.find(p=>p.id===id);return p?.staff_name||p?.full_name||legacy||'—';}
// A preview is a plan, never evidence that a stage has been visited.
export function journeyPlan(matter:Matter,stages:Stage[],template=defaultTemplate(matter.matter_type)):Stage[]{
 return stages.length?[...stages].sort((a,b)=>a.position-b.position):(templates[template]||templates.general).map((stage_key,position)=>({id:'',stage_key,template_key:template,position,visits:[],minutes:null}));
}
export function journeyProgress(stages:Stage[],current:string|null,closed:boolean){
 const states=stages.map(s=>stageState(s,current,closed));
 return {visited:states.filter(s=>s==='visited'||s==='finished').length,skipped:states.filter(s=>s==='skipped').length,total:stages.length};
}
export function errorKey(message:string){if(message.includes('ADVISORY_CHANGED'))return 'changed';if(message.includes('FORBIDDEN')||message.includes('permission denied'))return 'forbidden';if(message.includes('NOT_ASSIGNABLE'))return 'personUnavailable';if(message.includes('ISSUE_NOT_AVAILABLE'))return 'issueUnavailable';if(message.includes('COMPLETION_INVALID'))return 'completionInvalid';return 'saveError';}
