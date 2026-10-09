export const FILING_METHODS = ['not_filed','paper','efiling_v3','efiling_v4'] as const;
export type FlowStage = { stage_key:string; ordinal:number; title_th:string; title_en:string };
export type FlowEvent = { id:string; sequence_no:number; event_kind:'start'|'transition'|'correction'; transition_code:string|null; from_stage:string|null; to_stage:string; from_lifecycle:string|null; to_lifecycle:string; reason:string|null; corrects_id:string|null; actor_name:string; occurred_at:string };
export type FlowData = {
 template:{ id:string; version:number; family:string; variant:string; represented_role:string; title_th:string; title_en:string };
 stages:FlowStage[];
 instance:null|{id:string;case_id:number;track_key:string;current_stage:string;started_stage:string;filing_method:typeof FILING_METHODS[number];lifecycle:'active'|'paused'|'exited';version:number;start_kind:'new'|'cut_in';started_at:string};
 history:FlowEvent[];
};
export type FlowAction='start'|'advance'|'pause'|'resume'|'exit'|'correct';
export function flowPermissions(role?:string|null){return {start:['lawyer','partner','admin'].includes(role||''),transition:['assistant_lawyer','lawyer','partner','admin'].includes(role||'')};}
export function stageEvidence(data:FlowData,key:string){
 if(data.instance?.current_stage===key)return 'current';
 const superseded=new Set(data.history.filter(e=>e.corrects_id).map(e=>e.corrects_id));
 if(data.history.some(e=>!superseded.has(e.id)&&e.to_stage===key))return 'recorded';
 return 'unrecorded';
}
export function needsFlowReason(data:FlowData,action:FlowAction,target:string){
 if(action==='start')return false;
 if(action!=='advance')return true;
 const from=data.stages.find(s=>s.stage_key===data.instance?.current_stage)?.ordinal;
 return data.stages.find(s=>s.stage_key===target)?.ordinal!==(from??-2)+1;
}
export function flowError(message:string){return ['FORBIDDEN','NOT_FOUND','STALE','REQUEST_CONFLICT','INVALID_INPUT','REASON_REQUIRED','CUT_IN_REQUIRED','STATE','IMMUTABLE'].map(v=>'CASE101_'+v).find(v=>message.includes(v))||'Flow could not be saved. Please try again.';}
