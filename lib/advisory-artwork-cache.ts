import {ARTWORK_TTL,type ArtworkPayload} from './advisory-journey-artwork';

// Ephemeral capability cache: never written to localStorage, sessionStorage or an HTTP cache.
// Scope includes the current authentication token. Logout/token changes invalidate pending work too.
export function createArtworkCache(now=Date.now){
 let scope='',generation=0;
 const entries=new Map<string,{promise:Promise<ArtworkPayload|null>;expires:number;timer?:ReturnType<typeof setTimeout>}>();
 const listeners=new Set<(key?:string)=>void>();
 function clear(){generation++;for(const item of entries.values())clearTimeout(item.timer);entries.clear();listeners.forEach(fn=>fn());}
 return {
  setScope(next:string){if(next!==scope){scope=next;clear();}},
  clear,
  subscribe(fn:(key?:string)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  load(key:string,resolve:()=>Promise<ArtworkPayload|null>,decode:(url:string)=>Promise<void>){
   if(!scope)return Promise.resolve(null);
   const existing=entries.get(key);if(existing&&existing.expires>now())return existing.promise;
   if(existing){clearTimeout(existing.timer);entries.delete(key);}
   const current=generation,started=now();
   // Bound retained capabilities even if many Matters are opened without navigation.
   if(entries.size>=8){const oldest=entries.keys().next().value!;clearTimeout(entries.get(oldest)?.timer);entries.delete(oldest);}
   const entry={expires:started+ARTWORK_TTL*1000,promise:Promise.resolve(null) as Promise<ArtworkPayload|null>,timer:undefined as ReturnType<typeof setTimeout>|undefined};
   entries.set(key,entry);
   entry.promise=(async()=>{
    try{
     const asset=await resolve();
     if(!asset||current!==generation)return null;
     entry.expires=Math.min(asset.expires_at,started+ARTWORK_TTL*1000);
     if(entry.expires<=now())return null;
     await decode(asset.url);
     if(current!==generation||entry.expires<=now()||entries.get(key)!==entry)return null;
     entry.timer=setTimeout(()=>{if(entries.get(key)===entry){entries.delete(key);listeners.forEach(fn=>fn(key));}},entry.expires-now());
     return {...asset,expires_at:entry.expires};
    }catch{return null;}finally{if(!entry.timer&&entries.get(key)===entry)entries.delete(key);}
   })();
   return entry.promise;
  },
 };
}
