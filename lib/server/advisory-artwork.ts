import 'server-only';
import {peopleClientsFor,type PeopleClients} from './people-admin';
import {ARTWORK_TTL,journeyArtworkAnchors,journeyArtworkKey} from '../advisory-journey-artwork';
import {VISUAL_BUCKET} from '../visual-assets';
import type {JourneySnapshot} from '../advisory-flexible-journey';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reply=(artwork:unknown=null,status=200)=>Response.json({artwork},{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
export async function handleJourneyArtwork(request:Request,supplied?:PeopleClients){
 if(request.method!=='GET')return reply(null,405);
 const params=new URL(request.url).searchParams,id=params.get('matter_id');
 if(!id||!uuid.test(id)||params.size!==1)return reply(null,400);
 if(!request.headers.get('authorization')?.startsWith('Bearer '))return reply(null,401);
 try{
  const clients=supplied||peopleClientsFor(request),{data:auth,error:authError}=await clients.caller.auth.getUser();
  if(authError||!auth.user)return reply(null,401);
  // Caller-scoped RPC enforces current Advisory permissions + Matter RLS.
  // Never use the privileged client for Matter visibility or family selection.
  const read=await clients.caller.rpc('advisory_control_read',{p_matter_id:id,p_query:{}});
  if(read.error||read.data?.items?.length!==1||read.data.items[0].id!==id)return reply(null,403);
  const snapshot=read.data.journey_snapshot as JourneySnapshot|null;
  if(!snapshot||typeof snapshot.family_key!=='string'||!Array.isArray(snapshot.definition?.stages))return reply();
  const key=journeyArtworkKey(snapshot.family_key);
  if(!key||!journeyArtworkAnchors(key,snapshot.definition.stages.length))return reply();
  const server=clients.privileged();
  const {data:asset,error}=await server.rpc('journey_artwork094_read',{p_artwork_key:key});
  if(error||!asset||asset.artwork_key!==key||typeof asset.master_path!=='string'||!Number.isInteger(asset.width)||!Number.isInteger(asset.height)||asset.width<1||asset.height<1||asset.width>2560||asset.height>2560)return reply();
  if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/master\.webp$/.test(asset.master_path))return reply();
  const signed=await server.storage.from(VISUAL_BUCKET).createSignedUrl(asset.master_path,ARTWORK_TTL);
  if(signed.error||!signed.data?.signedUrl)return reply();
  return reply({code:key,url:signed.data.signedUrl,width:asset.width,height:asset.height,expires_at:Date.now()+ARTWORK_TTL*1000});
 }catch{return reply();} // Optional presentation must not break Matter Detail.
}
