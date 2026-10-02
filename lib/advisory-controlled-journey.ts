import type {JourneyDefinition,JourneyStep} from './advisory-flexible-journey';
import type {Activity,Visit} from './advisory-control';
export type JourneyOutcome={key:string;name_th:string;name_en:string;target:string;requires_reason:boolean};
export type JourneyPathVisit=Visit&{stage_id:string;actor_id:string;recorded_at:string};
export type JourneyDecision=Activity&{detail:Activity['detail']&{journey_format?:number;from_visit_id?:string;to_visit_id?:string|null;outcome?:JourneyOutcome|null;outcome_reason?:string|null;from_stage?:JourneyStep;target_stage?:JourneyStep}};
export function controlledDraft(definition:JourneyDefinition):JourneyDefinition{
 if(definition.format===2)return structuredClone(definition);
 return {...structuredClone(definition),format:2,stages:definition.stages.map((s,i)=>({...s,conditional:false,outcomes:i===definition.stages.length-1?[]:[{key:'continue',name_th:'ไปต่อ',name_en:'Continue',target:definition.stages[i+1].key,requires_reason:false}]}))};
}
export function outcomeChoice(outcomes:JourneyOutcome[],key:string){return outcomes.length===1?outcomes[0]:outcomes.find(o=>o.key===key);}
// A skip never chooses an outcome or activates a branch. FJ-1 is unaffected.
export function controlledSkipAllowed(definition:JourneyDefinition,stageKey:string){const i=definition.stages.findIndex(s=>s.key===stageKey),s=definition.stages[i],next=definition.stages[i+1];return !!s&&!s.required&&s.outcomes?.length===1&&!s.outcomes[0].requires_reason&&s.outcomes[0].target===next?.key&&!next.conditional;}
export function routeProblem(definition:JourneyDefinition):'routeMissing'|'routeDisconnected'|null{
 if(definition.format!==2)return null;
 const stages=definition.stages,keys=new Set(stages.map(s=>s.key));
 if(stages.some(s=>s.key==='close'?!!s.outcomes?.length:!s.outcomes?.length||s.outcomes.length>8||s.outcomes.some(o=>!keys.has(o.target))))return 'routeMissing';
 const reached=new Set([stages[0].key]),closing=new Set(['close']);let changed=true;
 while(changed){changed=false;for(const s of stages)for(const o of s.outcomes||[]){if(reached.has(s.key)&&!reached.has(o.target)){reached.add(o.target);changed=true;}if(closing.has(o.target)&&!closing.has(s.key)){closing.add(s.key);changed=true;}}}
 return stages.some(s=>!reached.has(s.key)||!closing.has(s.key))?'routeDisconnected':null;
}
