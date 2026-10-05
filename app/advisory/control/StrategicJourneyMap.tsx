'use client';
/* eslint-disable @next/next/no-img-element -- Exact private artwork at intrinsic ratio; no cropping or optimization proxy. */
import {useEffect,useId,useState,type ReactNode} from 'react';
import {Check,MapPin,SkipForward} from 'lucide-react';
import {artworkEdges,journeyArtworkAnchors,journeyArtworkKey,type ArtworkPayload} from '../../../lib/advisory-journey-artwork';
import {journeyName,type JourneySnapshot} from '../../../lib/advisory-flexible-journey';
import {stageVisitNumbers} from '../../../lib/advisory-journey-presentation';
import type {JourneyPathVisit} from '../../../lib/advisory-controlled-journey';
import type {Matter,Stage} from '../../../lib/advisory-control';
import {matterClosed} from '../../../lib/advisory-workflow';
import {useI18n} from '../../../lib/i18n/provider';
import css from './strategic-journey.module.css';
type Props={matter:Matter;snapshot:JourneySnapshot;stages:Stage[];path:JourneyPathVisit[];locale:string;selected:string;view?:'actual'|'possible';onSelect:(key:string,visit?:JourneyPathVisit)=>void;children:ReactNode};
export default function StrategicJourneyMap({matter,snapshot,stages,path,locale,selected,view='actual',onSelect,children}:Props){
 const {t}=useI18n();
 const en=locale==='en',marker=useId().replaceAll(':',''),requestKey=matter.id+':'+snapshot.version_id;
 const [state,setState]=useState<{key:string;asset:ArtworkPayload}|null>(null),[loaded,setLoaded]=useState('');
 const key=journeyArtworkKey(snapshot.family_key),anchors=key?journeyArtworkAnchors(key,snapshot.definition?.stages?.length||0):null;
 const eligible=!!anchors;
 useEffect(()=>{
  if(!eligible)return;
  const media=window.matchMedia('(min-width:768px)'),controller=new AbortController();let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  async function load(){
   if(!media.matches)return;
   try{
    const {supabase}=await import(/* webpackMode: 'eager' */ '../../../lib/supabase');
    const session=await supabase.auth.getSession();if(!live||!session.data.session)return;
    const response=await fetch('/api/advisory/journey-artwork?matter_id='+encodeURIComponent(matter.id),{headers:{Authorization:'Bearer '+session.data.session.access_token},cache:'no-store',signal:controller.signal});
    const {artwork}=await response.json();
    if(!live||!response.ok||!artwork||artwork.code!==journeyArtworkKey(snapshot.family_key)||artwork.expires_at<=Date.now())return;
    setState({key:requestKey,asset:artwork});clearTimeout(timer);
    timer=setTimeout(()=>{if(live)setState(null);},artwork.expires_at-Date.now());
   }catch{/* Optional artwork: retain the existing map. */}
  }
  void load();media.addEventListener('change',load);
  return()=>{live=false;controller.abort();clearTimeout(timer);media.removeEventListener('change',load);};
 },[requestKey,matter.id,snapshot.family_key,eligible]);
 const asset=state?.key===requestKey?state.asset:null;
 if(!asset||!anchors)return <>{children}</>;
 const definition=snapshot.definition,keys=Object.fromEntries(stages.map(s=>[s.id,s.stage_key])),counts=stageVisitNumbers(path),closed=matterClosed(matter);
 const edges=artworkEdges(definition,path,keys,view),ready=loaded===asset.url;
 const choose=(k:string)=>onSelect(k,path.findLast(v=>keys[v.stage_id]===k));
 return <>
 <section className={css.desktop} data-ready={ready} aria-label={en?'Strategic journey map':'แผนที่เส้นทางงาน'}>
  <div className={css.canvas} style={{aspectRatio:`${asset.width}/${asset.height}`}}>
   <img className={css.art} src={asset.url} width={asset.width} height={asset.height} alt="" onLoad={()=>setLoaded(asset.url)} onError={()=>setState(null)}/>
   <svg className={css.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>
    {edges.map((edge,i)=>{const from=definition.stages.findIndex(s=>s.key===edge.from),to=definition.stages.findIndex(s=>s.key===edge.to);if(from<0||to<0)return null;const [x,y]=anchors[from],[tx,ty]=anchors[to],loop=to<=from;
     // Curves route connectors only; Stage anchors remain the approved coordinates.
     const d=from===to?`M${x},${y} c-10,-10 10,-10 0,0`:loop?`M${x},${y} Q${(x+tx)/2+6},${Math.min(94,Math.max(y,ty)+12)} ${tx},${ty}`:`M${x},${y} L${tx},${ty}`;
     return <path key={edge.id+':'+i} d={d} markerEnd={`url(#${marker})`} data-loop={loop} data-view={view}/>;
    })}
   </svg>
   {definition.stages.map((s,i)=>{
    const visits=path.filter(v=>keys[v.stage_id]===s.key),last=visits.at(-1),current=!!last&&!last.exited_at&&!closed;
    const recordedSkip=stages.find(stage=>stage.stage_key===s.key)?.visits.some(v=>v.kind==='skip');
    const status=current?'current':last?.exit_reason==='completed'?'completed':last?.exit_reason==='skipped'?'skipped':last?'visited':recordedSkip?'skipped':'future';
    const [x,y]=anchors[i];return <button type="button" key={s.key} data-stage={s.key} data-state={status} data-low={y>72} data-edge={x>85?'right':x<12?'left':undefined} className={css.node} style={{left:x+'%',top:y+'%'}} onClick={()=>choose(s.key)} aria-pressed={selected===s.key} aria-current={current?'step':undefined} aria-label={`${i+1}. ${journeyName(s,locale)}`}>
     <span className={css.dot}>{current?<MapPin size={16}/>:status==='completed'?<Check size={16}/>:status==='skipped'?<SkipForward size={16}/>:i+1}</span>
     <span className={css.caption}><strong>{journeyName(s,locale)}</strong><small>{en?{current:'Current',completed:'Completed',visited:'Visited',skipped:'Skipped',future:s.conditional?'Not activated':'Not visited'}[status]:{current:'ขั้นตอนปัจจุบัน',completed:'เสร็จแล้ว',visited:'ผ่านขั้นตอนแล้ว',skipped:'ข้ามแล้ว',future:s.conditional?'ยังไม่เปิดขั้นตอน':'ยังไม่เข้าขั้นตอน'}[status]}{!s.required&&` · ${en?'Optional':'ทางเลือก'}`}{s.conditional&&` · ${en?'Conditional':'ตามเงื่อนไข'}`}</small>{visits.length>1&&<small>{en?'Visit':'ครั้งที่'} {visits.length}</small>}{current&&['waiting_client','waiting_external','waiting_internal','on_hold'].includes(matter.work_state||'')&&<small className={css.waiting}>{t('advisory.enum.'+matter.work_state)}</small>}{current&&matter.has_overdue_work&&<small className={css.overdue}>{en?'Overdue work':'มีงานเลยกำหนด'}</small>}</span>
    </button>;
   })}
  </div>
  <p className={css.hint}>{view==='actual'?(en?'Recorded visits only. Select a visit to inspect its history.':'เส้นทางจากการเข้าขั้นตอนจริง เลือกครั้งที่เข้าขั้นตอนเพื่อดูประวัติ'):(en?'Possible routes from this matter’s frozen journey; unchosen routes are not skips.':'เส้นทางที่เป็นไปได้จากรูปแบบที่บันทึกไว้ การไม่เลือกเส้นทางไม่ใช่การข้ามขั้นตอน')}</p>
  {view==='actual'&&<ol className={css.visits}>{path.map((v,i)=>{const k=keys[v.stage_id],s=definition.stages.find(s=>s.key===k);return s?<li key={v.id}><button type="button" onClick={()=>onSelect(k,v)} data-loop={counts[i]>1}>{i+1}. {journeyName(s,locale)} · {en?'Visit':'ครั้งที่'} {counts[i]}{counts[i]>1&&` ↶ ${en?'Return':'วนกลับ'}`}</button></li>:null;})}</ol>}
 </section>
 <div className={css.fallback} data-ready={ready}>{children}</div>
 </>;
}
