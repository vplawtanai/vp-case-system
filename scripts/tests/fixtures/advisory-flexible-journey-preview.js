// Local synthetic adapter. No credentials or external requests. DB tests cover real mutations.
import {supabase as base} from './non-litigation-operational-preview';
import catalog from '../../../lib/advisory-journey-catalog.json';
const p=new URLSearchParams(location.search);
let variants=catalog.families.map(f=>({id:'variant-'+f.key,family_key:f.key,revision:1,active:true,is_default:true,version:1,version_id:'version-'+f.key,definition:{name_th:'มาตรฐาน',name_en:'Standard',stages:f.stages.map((key,i)=>({key,name_th:f.stage_labels_th[i],name_en:f.stage_labels_en[i],required:!(f.key==='contract_business_documents'&&['internal_review','delivery_negotiation'].includes(key))}))}}));
const contract=variants.find(v=>v.family_key==='contract_business_documents');
if(p.has('multiple'))variants.push({...contract,id:'alternative',version_id:'version-alternative',is_default:false,definition:{...contract.definition,name_th:'มีการเจรจา',name_en:'With negotiation'}});
variants.push({...contract,id:'retired',active:false,is_default:false,definition:{...contract.definition,name_en:'Inactive excluded',name_th:'รูปแบบปิดใช้งาน'}});
const stages=contract.definition.stages.map((s,i)=>({...s,id:'fj-stage-'+i,stage_key:s.key,template_key:contract.family_key,position:i,task_total:0,task_completed:0,elapsed_seconds:i<2?86400:null,minutes:null,visits:i<2?[{id:'fj-visit-'+i,kind:'visit',entered_at:'2026-10-01T01:00:00Z',exited_at:i===0?'2026-10-01T02:00:00Z':null}]:[]}));
const skipActivities=[];
const realFetch=window.fetch.bind(window);
window.fetch=async(url,options={})=>{
 if(String(url)!=='/api/admin/journey-templates')throw Error('FJ preview blocks network: '+url);
 if(!options.body)return Response.json({variants});
 const b=JSON.parse(options.body);window.calls.push({api:b});let v=variants.find(v=>v.id===b.id);
 if(b.action==='create'){v={...contract,id:crypto.randomUUID(),family_key:b.payload.family_key,is_default:false,definition:b.payload.definition};variants.push(v);}
 if(b.action==='publish'){v.version++;v.revision++;v.definition=b.payload.definition;}
 if(b.action==='configure'){if(b.payload.is_default)variants.filter(x=>x.family_key===v.family_key).forEach(x=>x.is_default=false);Object.assign(v,b.payload);v.revision++;}
 return Response.json(v||{ready:true});
};
void realFetch;
export const supabase={...base,from(table){if(table!=='advisory_matter_activities')return base.from(table);const q={select(){return q;},eq(){return q;},order(){return q;},async range(a,b){return{data:skipActivities.slice(a,b+1),error:null};}};return q;},auth:{...base.auth,getSession:async()=>({data:{session:{access_token:'synthetic'}}})},async rpc(name,args){
 if(name==='advisory_journey_catalog'){window.calls.push({name,args});return{data:{manage:true,variants:variants.filter(v=>!args.p_family||v.family_key===args.p_family)}};}
 if(name==='advisory_control_read'){const r=await base.rpc(name,args);if(p.has('legacy'))return r;const m=r.data.items[0];Object.assign(m,{version:1+skipActivities.length,matter_type:'contract_business_documents',template_key:contract.family_key,stage_key:'requirements',stage_name_th:'รวบรวมความต้องการ',stage_name_en:'Requirements'});r.data.stages=structuredClone(stages);r.data.journey_snapshot={variant_id:contract.id,version_id:contract.version_id,version:1,family_key:contract.family_key,captured_at:'2026-10-01T01:00:00Z',definition:contract.definition};return r;}
 if(name==='advisory_control_section'&&args.p_section==='activity'&&skipActivities.length)return{data:{items:skipActivities,total:skipActivities.length}};
 if(name==='advisory_workflow_checks')return{data:{version:1,current_visit_id:'fj-visit-1',current_stage_id:'fj-stage-1',current_stage_key:'requirements',current_stage_open_tasks:0,has_next_action:false,closed:false}};
 if(name==='advisory_control_write'&&args.p_action==='stage_skip'){window.calls.push({name,args});const s=stages.find(s=>s.stage_key===args.p_payload.stage_key);s.visits.push({kind:'skip'});skipActivities.unshift({id:'skip-activity',kind:'stage_skip',actor_id:'lead',occurred_at:'2026-10-01T03:00:00Z',detail:{input:args.p_payload}});return{data:{matter_id:args.p_matter_id,version:2}};}
 return base.rpc(name,args);
}};
