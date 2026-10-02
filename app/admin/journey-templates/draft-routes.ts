import {controlledDraft} from '../../../lib/advisory-controlled-journey';
import type {JourneyDefinition,JourneyStep} from '../../../lib/advisory-flexible-journey';

// Local editing conveniences only. Publishing still uses the existing version API.
export function builderDraft(definition:JourneyDefinition){return controlledDraft(definition);}
function nextNormal(stages:JourneyStep[],index:number){return stages.slice(index+1).find(s=>!s.conditional);}
function ordinaryRoute(definition:JourneyDefinition,stage:JourneyStep){
 const o=stage.outcomes?.[0],next=nextNormal(definition.stages,definition.stages.indexOf(stage));
 return stage.outcomes?.length===1&&o?.key==='continue'&&o.name_th==='ไปต่อ'&&o.name_en==='Continue'&&!o.requires_reason&&o.target===next?.key;
}
const forward=(target:string)=>[{key:'continue',name_th:'ไปต่อ',name_en:'Continue',target,requires_reason:false}];

// Reconnect only ordinary, unmodified Continue routes after editing the order.
// Explicit branches, loops, labels and reason requirements are never rewritten.
export function arrangeDraft(definition:JourneyDefinition,ordered:JourneyStep[]):JourneyDefinition{
 const automatic=new Set(definition.stages.filter(s=>ordinaryRoute(definition,s)).map(s=>s.key));
 return {...definition,stages:ordered.map((s,i)=>{
  const next=nextNormal(ordered,i),isNew=!definition.stages.some(old=>old.key===s.key);
  return {...s,...(i===0?{required:true,conditional:false}:{}),...(s.key!=='close'&&next&&(automatic.has(s.key)||isNew&&!s.outcomes)?{outcomes:forward(next.key)}:{})};
 })};
}
export function canRemoveStage(definition:JourneyDefinition,key:string){
 return key!==definition.stages[0].key&&key!=='close'&&!definition.stages.some(s=>s.key!==key&&!ordinaryRoute(definition,s)&&s.outcomes?.some(o=>o.target===key));
}
export function addDraftChoice(definition:JourneyDefinition,key:string,outcomeKey:string):JourneyDefinition{
 return {...definition,stages:definition.stages.map(s=>s.key!==key||s.key==='close'||(s.outcomes?.length||0)>=8?s:{...s,outcomes:[...(s.outcomes||[]),{key:outcomeKey,name_th:'',name_en:'',target:'',requires_reason:false}]})};
}
