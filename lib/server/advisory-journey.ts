import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {peopleClientsFor,type PeopleClients} from './people-admin';
import {isActiveAdmin} from '../people';
import {JOURNEY_COOKIE} from '../advisory-flexible-journey';
export class JourneyAdminError extends Error {constructor(message:string,public status=400){super(message);}}
export async function authorizeJourney(caller:SupabaseClient){
 const user=await caller.auth.getUser();if(user.error||!user.data.user)throw new JourneyAdminError('ADVISORY_UNAUTHORIZED',401);
 const profile=await caller.from('user_profiles').select('id,role,active,must_change_password').eq('id',user.data.user.id).single();
 if(profile.error||!isActiveAdmin(profile.data)||profile.data.must_change_password!==false)throw new JourneyAdminError('ADVISORY_FORBIDDEN',403);
}
export async function journeyPageAllowed(token:string){await authorizeJourney(peopleClientsFor(new Request('https://internal.invalid',{headers:{authorization:'Bearer '+token}})).caller);}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleJourneyRequest(request:Request,supplied?:PeopleClients){
 try{
  const caller=(supplied||peopleClientsFor(request)).caller;await authorizeJourney(caller);
  if(request.method==='GET'){const r=await caller.rpc('advisory_journey_catalog',{p_family:null});if(r.error)throw r.error;return reply(r.data);}
  if(request.method!=='POST')return reply({error:'ADVISORY_INVALID_INPUT'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new JourneyAdminError('ADVISORY_FORBIDDEN',403);
  if(Number(request.headers.get('content-length')||0)>40000)throw new JourneyAdminError('ADVISORY_INVALID_INPUT');
  const raw=await request.text();if(raw.length>40000)throw new JourneyAdminError('ADVISORY_INVALID_INPUT');
  const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw new JourneyAdminError('ADVISORY_INVALID_INPUT');
  if(b.action==='session'){
   const token=request.headers.get('authorization')?.slice(7)||'';if(!/^[A-Za-z0-9._-]+$/.test(token))throw new JourneyAdminError('ADVISORY_UNAUTHORIZED',401);
   const response=reply({ready:true});response.headers.set('Set-Cookie',`${JOURNEY_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/admin/journey-templates; Max-Age=1800${new URL(request.url).protocol==='https:'?'; Secure':''}`);return response;
  }
  if(!['create','publish','configure'].includes(b.action))throw new JourneyAdminError('ADVISORY_INVALID_INPUT');
  const r=await caller.rpc('advisory_journey_manage',{p_id:b.id||null,p_action:b.action,p_payload:b.payload,p_request_id:b.request_id,p_expected_revision:b.revision??null});if(r.error)throw r.error;return reply(r.data);
 }catch(e){return reply({error:e instanceof JourneyAdminError?e.message:String((e as {message?:string})?.message||'').match(/ADVISORY_[A-Z_]+/)?.[0]||'ADVISORY_INVALID_INPUT'},e instanceof JourneyAdminError?e.status:409);}
}
