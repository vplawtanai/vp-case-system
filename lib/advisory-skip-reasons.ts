import type {SupabaseClient} from '@supabase/supabase-js';

// Read the existing Activity evidence through the caller's unchanged RLS scope.
// Do not depend on the first page of the general activity feed.
export async function loadStageSkipReasons(client:SupabaseClient,matterId:string,stageKeys:string[]){
 const pending=new Set(stageKeys),reasons:Record<string,string|null>=Object.create(null);
 for(let offset=0;pending.size;offset+=100){
  const {data,error}=await client.from('advisory_matter_activities').select('detail')
   .eq('matter_id',matterId).eq('kind','stage_skip')
   .order('occurred_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+99);
  if(error)throw error;
  for(const row of data||[]){
   const input=row.detail?.input,key=input?.stage_key;
   if(typeof key==='string'&&pending.delete(key))reasons[key]=typeof input.reason==='string'&&input.reason.trim()?input.reason:null;
  }
  if(!data||data.length<100)break;
 }
 return reasons;
}
