import type {JourneyOutcome} from './advisory-controlled-journey';
// FJ-1 labels are frozen in each Matter snapshot, independent of later template versions.
export type JourneyStep={key:string;name_th:string;name_en:string;required:boolean;conditional?:boolean;outcomes?:JourneyOutcome[]};
export type JourneyDefinition={format?:2;name_th:string;name_en:string;stages:JourneyStep[]};
export type JourneyVariant={id:string;family_key:string;active:boolean;is_default:boolean;revision:number;version:number;version_id:string;definition:JourneyDefinition};
export type JourneySnapshot={variant_id:string;version_id:string;version:number;family_key:string;definition:JourneyDefinition;captured_at:string};
export const JOURNEY_COOKIE='vp_journey_admin';
export function journeyName(value:{name_th?:string;name_en?:string},locale:string,fallback=''){return (locale==='en'?value.name_en:value.name_th)||fallback;}
export function availableVariants(variants:JourneyVariant[],family:string){return variants.filter(v=>v.active&&v.family_key===family);}
export function defaultVariant(variants:JourneyVariant[]){return variants.find(v=>v.is_default)||(variants.length===1?variants[0]:undefined);}
// Resolve the form's version identifier against the catalog shown to this user.
// An unknown explicit value must never turn into a default Journey.
export function resolveJourneySelection(variants:JourneyVariant[],family:string,versionId:unknown){
 if(typeof versionId!=='string'||!versionId)return null;
 const matches=availableVariants(variants,family).filter(v=>v.version_id===versionId);
 return matches.length===1?{variant_id:matches[0].id,journey_version_id:matches[0].version_id}:null;
}
