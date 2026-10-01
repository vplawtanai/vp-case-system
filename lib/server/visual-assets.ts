import 'server-only';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {peopleClientsFor,type PeopleClients} from './people-admin';
import {isActiveAdmin} from '../people';
import {VISUAL_BUCKET,VISUAL_COOKIE,visualMetadata,validKey,type VisualAsset} from '../visual-assets';
import {optimizeVisualImage} from './visual-image';

export class VisualError extends Error {constructor(message:string,public status=400){super(message);}}
export async function authorizeVisual(caller:SupabaseClient){
 const user=await caller.auth.getUser();if(user.error||!user.data.user)throw new VisualError('VISUAL_UNAUTHORIZED',401);
 const profile=await caller.from('user_profiles').select('id,role,active,must_change_password').eq('id',user.data.user.id).single();
 if(profile.error||!isActiveAdmin(profile.data)||profile.data.must_change_password!==false)throw new VisualError('VISUAL_FORBIDDEN',403);
 return user.data.user.id;
}
export async function visualPageAllowed(token:string){
 const clients=peopleClientsFor(new Request('https://internal.invalid',{headers:{authorization:'Bearer '+token}}));
 await authorizeVisual(clients.caller);
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function checked<T>(r:{data:T;error:{message?:string}|null}):T {if(r.error){const known=r.error.message?.match(/VISUAL_[A-Z_]+/)?.[0];throw new VisualError(known||'VISUAL_OPERATION_FAILED',known==='VISUAL_FORBIDDEN'?403:409);}return r.data;}
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleVisualRequest(request:Request,supplied?:PeopleClients){
 try{
  // Clearing only our scoped cookie never grants access and also works after
  // Supabase sign-out. A cross-origin request may not change the browser session.
  if(request.method==='DELETE'){
   if(request.headers.get('origin')!==new URL(request.url).origin)throw new VisualError('VISUAL_FORBIDDEN',403);
   const response=reply({cleared:true});
   response.headers.set('Set-Cookie',`${VISUAL_COOKIE}=; HttpOnly; SameSite=Strict; Path=/admin/visual-assets; Max-Age=0${new URL(request.url).protocol==='https:'?'; Secure':''}`);
   return response;
  }
  const clients=supplied||peopleClientsFor(request),caller=clients.caller,actor=await authorizeVisual(caller);
  if(request.method==='GET'){
   const assets=checked(await caller.from('visual_assets').select('*').order('updated_at',{ascending:false})) as VisualAsset[];
   const mappings=checked(await caller.from('visual_asset_mappings').select('scope,family_key,artwork_key'));
   const signed=await Promise.all(assets.map(async a=>{
    if(a.delete_pending)return a;
    const r=checked(await caller.storage.from(VISUAL_BUCKET).createSignedUrls([a.master_path,a.thumbnail_path],600));
    if(!r?.[0]?.signedUrl||!r?.[1]?.signedUrl)throw new VisualError('VISUAL_OPERATION_FAILED',502);
    return {...a,master_url:r[0].signedUrl,thumbnail_url:r[1].signedUrl};
   }));return reply({assets:signed,mappings});
  }
  if(request.method!=='POST')return reply({error:'VISUAL_INVALID'},405);
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new VisualError('VISUAL_FORBIDDEN',403);
  if(Number(request.headers.get('content-length')||0)>20000)throw new VisualError('VISUAL_INVALID');
  const raw=await request.text();if(raw.length>20000)throw new VisualError('VISUAL_INVALID');
  const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw new VisualError('VISUAL_INVALID');
  if(b.action==='session'){
   const token=request.headers.get('authorization')?.slice(7)||'';
   if(!/^[A-Za-z0-9._-]+$/.test(token))throw new VisualError('VISUAL_UNAUTHORIZED',401);
   const response=reply({ready:true});
   response.headers.set('Set-Cookie',`${VISUAL_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/admin/visual-assets; Max-Age=1800${new URL(request.url).protocol==='https:'?'; Secure':''}`);
   return response;
  }
  const write=async(action:string,id:string|null,version:number|null,data:unknown)=>checked(await caller.rpc('visual_assets_write',{p_action:action,p_id:id,p_version:version,p_data:data}));
  if(b.action==='upload-start'){
   if(!['image/jpeg','image/png','image/webp'].includes(b.type)||!Number.isInteger(b.size)||b.size<=0||b.size>20*1024*1024)throw new VisualError('VISUAL_FILE_SIZE');
   const id=randomUUID(),path=`${actor}/${id}/original`;
   const signed=checked(await clients.privileged().storage.from(VISUAL_BUCKET).createSignedUploadUrl(path,{upsert:false}));
   if(!signed?.token)throw new VisualError('VISUAL_OPERATION_FAILED',502);
   return reply({id,path,token:signed.token});
  }
  if(b.action==='upload-finish'){
   if(!uuid(b.id))throw new VisualError('VISUAL_INVALID');
   const metadata=visualMetadata(b.metadata),original=`${actor}/${b.id}/original`;
   const existing=checked(await caller.from('visual_assets').select('*').eq('id',b.id).maybeSingle());
   if(existing)return reply({asset:existing});
   const store=clients.privileged().storage.from(VISUAL_BUCKET);
   const file=checked(await store.download(original));
   if(!file)throw new VisualError('VISUAL_IMAGE_INVALID');
   let processed;try{processed=await optimizeVisualImage(Buffer.from(await file.arrayBuffer()));}catch(e){await store.remove([original]);throw e;}
   const prefix=`${actor}/${b.id}/${randomUUID()}`,master_path=prefix+'/master.webp',thumbnail_path=prefix+'/thumbnail.webp';
   try{
    checked(await store.upload(master_path,processed.master,{contentType:'image/webp',upsert:false}));
    checked(await store.upload(thumbnail_path,processed.thumbnail,{contentType:'image/webp',upsert:false}));
    await authorizeVisual(caller);
    const {master:_master,thumbnail:_thumbnail,...metrics}=processed;void _master;void _thumbnail;
    const asset=await write('create',b.id,null,{...metadata,...metrics,master_path,thumbnail_path});
    await store.remove([original]);return reply({asset},201);
   }catch(e){
    // An ambiguous RPC failure may have committed. Never remove referenced files.
    const back=await caller.from('visual_assets').select('*').eq('id',b.id).maybeSingle();
    if(!back.error){
     if(!back.data||back.data.master_path!==master_path)await store.remove([master_path,thumbnail_path]);
     if(back.data)return reply({asset:back.data});
    }throw e;
   }
  }
  if(b.action==='map'||b.action==='unmap'){
   if(!validKey(b.family_key)||!['non_litigation','case','both'].includes(b.scope)||!(b.expected_key===null||validKey(b.expected_key))||(b.action==='map'&&!validKey(b.artwork_key)))throw new VisualError('VISUAL_INVALID');
   return reply(await write(b.action,null,null,{scope:b.scope,family_key:b.family_key,artwork_key:b.artwork_key,expected_key:b.expected_key}));
  }
  if(!uuid(b.id)||!Number.isInteger(b.version))throw new VisualError('VISUAL_INVALID');
  if(b.action==='edit')return reply({asset:await write('edit',b.id,b.version,visualMetadata(b.metadata))});
  if(b.action==='delete'){
   const pending=await write('delete_begin',b.id,b.version,{});
   checked(await clients.privileged().storage.from(VISUAL_BUCKET).remove([pending.master_path,pending.thumbnail_path]));
   return reply(await write('delete_finish',b.id,pending.version,{}));
  }
  throw new VisualError('VISUAL_INVALID');
 }catch(e){const code=e instanceof Error&&/^VISUAL_[A-Z_]+$/.test(e.message)?e.message:'VISUAL_OPERATION_FAILED';return reply({error:code},e instanceof VisualError?e.status:400);}
}
