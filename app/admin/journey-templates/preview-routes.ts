import type {JourneyDefinition,JourneyStep} from '../../../lib/advisory-flexible-journey';

export function previewIncoming(definition:JourneyDefinition,key:string){
 return definition.stages.flatMap(stage=>(stage.outcomes||[]).filter(o=>o.target===key).map(outcome=>({stage,outcome})));
}

// Presentation only. Follow sole outcomes; never invent a default at a branch.
export function previewContinuation(definition:JourneyDefinition,source:JourneyStep,targetKey:string){
 const steps:{stage:JourneyStep;via:NonNullable<JourneyStep['outcomes']>[number]}[]=[];
 const seen=new Set([source.key]),target=definition.stages.find(s=>s.key===targetKey);
 let current=target;
 while(current){
  if(seen.has(current.key)||definition.stages.indexOf(current)<=definition.stages.indexOf(source))return {steps,end:'return' as const,at:current};
  seen.add(current.key);
  if(current.key==='close')return {steps,end:'close' as const,at:current};
  if(current.outcomes?.length!==1)return {steps,end:'choice' as const,at:current};
  const via=current.outcomes[0],next=definition.stages.find(s=>s.key===via.target);
  if(!next)return {steps,end:'missing' as const,at:current};
  steps.push({stage:next,via});current=next;
 }
 return {steps,end:'missing' as const,at:target};
}

// A reading aid for reaching Close, not an automatic route or a workflow choice.
export function previewClosingPath(definition:JourneyDefinition,from:string){
 const queue=[{key:from,path:[] as {stage:JourneyStep;outcome:NonNullable<JourneyStep['outcomes']>[number]}[]}],seen=new Set<string>();
 while(queue.length){
  const item=queue.shift()!;
  if(item.key==='close')return item.path;
  if(seen.has(item.key))continue;
  seen.add(item.key);
  const stage=definition.stages.find(s=>s.key===item.key);
  for(const outcome of stage?.outcomes||[]){const target=definition.stages.find(s=>s.key===outcome.target);if(target)queue.push({key:target.key,path:[...item.path,{stage:target,outcome}]});}
 }
 return null;
}
