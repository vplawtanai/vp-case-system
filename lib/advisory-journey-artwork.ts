import config from './advisory-journey-artwork-config.json';
import {visualMappingCandidates} from './visual-assets';
import type {JourneyDefinition} from './advisory-flexible-journey';
import type {JourneyPathVisit} from './advisory-controlled-journey';
export type ArtworkPayload={code:string;url:string;width:number;height:number;expires_at:number};
export const ARTWORK_TTL=180;
const mappings=Object.entries(config.families).map(([family_key,artwork_key])=>({scope:'both',family_key,artwork_key}));
export function journeyArtworkKey(family:string){return visualMappingCandidates(mappings,'non_litigation',family)[0]?.artwork_key;}
export function journeyArtworkAnchors(key:string,count:number):number[][]|null{
 const anchors=config.assets[key as keyof typeof config.assets];
 if(!anchors||count<2||count>anchors.length)return null;
 // Never invent coordinates. Preserve entry/close and ordered middle anchors.
 return [...anchors.slice(0,count-1),anchors[anchors.length-1]];
}
// Presentation only. Actual edges never come from the template or artwork.
export function artworkEdges(definition:JourneyDefinition,path:JourneyPathVisit[],stageKeys:Record<string,string>,view:'actual'|'possible'){
 if(view==='actual')return path.slice(1).flatMap((visit,i)=>{
  const from=stageKeys[path[i].stage_id],to=stageKeys[visit.stage_id];
  return from&&to?[{id:visit.id,from,to,visitId:visit.id}]:[];
 });
 // FJ-1 has no outcome graph. Do not manufacture possible branches.
 return definition.format===2?definition.stages.flatMap(s=>(s.outcomes||[]).map(o=>({id:s.key+':'+o.key,from:s.key,to:o.target,visitId:''}))):[];
}
