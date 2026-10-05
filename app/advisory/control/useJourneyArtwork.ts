'use client';
import {useEffect,useState} from 'react';
import {createArtworkCache} from '../../../lib/advisory-artwork-cache';
import {journeyArtworkAnchors,journeyArtworkKey,type ArtworkPayload} from '../../../lib/advisory-journey-artwork';
import type {JourneySnapshot} from '../../../lib/advisory-flexible-journey';

const cache=createArtworkCache();
let watching=false,authEpoch=0,currentToken='';
async function resolveArtwork(matterId:string,version:string,key:string){
 const {supabase}=await import(/* webpackMode: 'eager' */ '../../../lib/supabase');
 if(!watching){watching=true;supabase.auth.onAuthStateChange((_event,session)=>{currentToken=session?.access_token||'';authEpoch++;cache.setScope(currentToken);});}
 const epoch=authEpoch,{data:{session}}=await supabase.auth.getSession();
 if(epoch!==authEpoch&&currentToken!==(session?.access_token||''))return null;
 cache.setScope(session?.access_token||'');
 if(!session)return null;
 return cache.load(matterId+':'+version+':'+key,async()=>{
  const response=await fetch('/api/advisory/journey-artwork?matter_id='+encodeURIComponent(matterId),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
  const {artwork}=await response.json();
  if(!response.ok||!artwork||artwork.code!==key||typeof artwork.url!=='string'||!Number.isFinite(artwork.expires_at)||artwork.expires_at<=Date.now()||!Number.isInteger(artwork.width)||!Number.isInteger(artwork.height)||artwork.width<1||artwork.height<1)return null;
  return artwork as ArtworkPayload;
 },async url=>{
  const image=new Image();image.decoding='async';image.src=url;
  await image.decode();
 });
}
export function useJourneyArtwork(matterId:string,snapshot?:JourneySnapshot|null){
 const family=snapshot?.family_key||'',key=journeyArtworkKey(family),version=snapshot?.version_id||'';
 const eligible=!!snapshot&&!!key&&!!journeyArtworkAnchors(key,snapshot.definition.stages.length),identity=matterId+':'+version+':'+key;
 const [state,setState]=useState<{identity:string;asset:ArtworkPayload|null;pending:boolean}|null>(null);
 useEffect(()=>{
  if(!eligible||!key)return;
  const media=window.matchMedia('(min-width:768px)');let live=true,run=0;
  const unsubscribe=cache.subscribe(invalidated=>{if(live&&(!invalidated||invalidated===identity))setState({identity,asset:null,pending:false});});
  async function load(){
   const request=++run;if(!media.matches){setState(null);return;}
   setState({identity,asset:null,pending:true});
   const asset=await resolveArtwork(matterId,version,key!).catch(()=>null);
   if(live&&request===run)setState({identity,asset,pending:false});
  }
  void load();media.addEventListener('change',load);
  return()=>{live=false;run++;unsubscribe();media.removeEventListener('change',load);};
 },[identity,matterId,version,key,eligible]);
 return state?.identity===identity?state:{asset:null,pending:eligible};
}
