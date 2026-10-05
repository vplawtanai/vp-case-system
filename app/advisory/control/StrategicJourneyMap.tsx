'use client';
/* eslint-disable @next/next/no-img-element -- Exact private artwork at intrinsic ratio; no cropping or optimization proxy. */
import {useEffect,useLayoutEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronDown,ChevronUp,MapPin,SkipForward} from 'lucide-react';
import {artworkEdges,journeyArtworkAnchors,journeyArtworkKey} from '../../../lib/advisory-journey-artwork';
import {journeyName,type JourneySnapshot} from '../../../lib/advisory-flexible-journey';
import {stageVisitNumbers} from '../../../lib/advisory-journey-presentation';
import type {JourneyPathVisit} from '../../../lib/advisory-controlled-journey';
import type {Matter,Stage} from '../../../lib/advisory-control';
import {matterClosed} from '../../../lib/advisory-workflow';
import {useI18n} from '../../../lib/i18n/provider';
import {useJourneyArtwork} from './useJourneyArtwork';
import css from './strategic-journey.module.css';
type Props={matter:Matter;snapshot:JourneySnapshot;stages:Stage[];path:JourneyPathVisit[];locale:string;selected:string;view?:'actual'|'possible';onSelect:(key:string,visit?:JourneyPathVisit)=>void;children:ReactNode;detail?:ReactNode;primaryAction?:ReactNode;selectedVisit?:JourneyPathVisit};
export default function StrategicJourneyMap({matter,snapshot,stages,path,locale,selected,view='actual',onSelect,children,detail,primaryAction,selectedVisit}:Props){
 const {t,date}=useI18n();
 const en=locale==='en',marker=useId().replaceAll(':','');
 const {asset,pending}=useJourneyArtwork(matter.id,snapshot);
 const [loaded,setLoaded]=useState(''),[failed,setFailed]=useState(''),[expanded,setExpanded]=useState(false),[position,setPosition]=useState({left:12,top:12});
 const canvasRef=useRef<HTMLDivElement>(null),panelRef=useRef<HTMLElement>(null);
 const key=journeyArtworkKey(snapshot.family_key),anchors=key?journeyArtworkAnchors(key,snapshot.definition?.stages?.length||0):null;
 const ready=!!asset&&failed!==asset.url;
 const selectedX=anchors?.[Math.max(0,snapshot.definition.stages.findIndex(stage=>stage.key===selected))]?.[0]??50;
 // Fit the entire intrinsic artwork in the viewport, including taller approved masters.
 // This property is scoped to this open modal and is removed for mobile/fallback rendering.
 useEffect(()=>{
  const modal=canvasRef.current?.closest<HTMLElement>('[role=dialog]');if(!ready||!asset||!modal)return;
  modal.style.setProperty('--journey-map-width',`calc((94dvh - 220px) * ${asset.width/asset.height} + 34px)`);
  return()=>{modal.style.removeProperty('--journey-map-width');};
 },[ready,asset]);
 // Measure the rendered captions (including TH/EN wraps), never move approved anchors.
 // Start at the bottom corner opposite the selected stage, then avoid other labels on that side.
 useLayoutEffect(()=>{
  const canvas=canvasRef.current,panel=panelRef.current;if(!ready||!canvas||!panel)return;
  function place(){
   const box=canvas!.getBoundingClientRect(),size=panel!.getBoundingClientRect(),gap=12;
   if(!box.width||!size.width)return;
   const obstacles=Array.from(canvas!.querySelectorAll('[data-stage]')).flatMap(node=>[node,...node.querySelectorAll('span')].map(part=>({box:part.getBoundingClientRect(),weight:node.getAttribute('aria-pressed')==='true'?8:1})));
   const maxY=Math.max(gap,box.height-size.height-gap),maxX=Math.max(gap,box.width-size.width-gap);
   const preferLeft=selectedX>=50,sideMin=preferLeft?gap:Math.min(maxX,box.width/2-size.width/2+gap),sideMax=preferLeft?Math.max(gap,box.width/2-size.width/2-gap):maxX;
   const preferredX=preferLeft?gap:maxX;
   const candidates=[maxY,...Array.from({length:10},(_,i)=>gap+i*(maxY-gap)/10)].map(top=>({left:preferredX,top}));
   const score=({left,top}:typeof position)=>obstacles.reduce((sum,item)=>sum+item.weight*Math.max(0,Math.min(box.left+left+size.width+5,item.box.right)-Math.max(box.left+left-5,item.box.left))*Math.max(0,Math.min(box.top+top+size.height+5,item.box.bottom)-Math.max(box.top+top-5,item.box.top)),0);
   // If corners are occupied, test exact free-space boundaries between captions.
   // This also handles long English labels and an actionable (taller) panel on tablet.
   const xs=new Set([preferredX]),ys=new Set([maxY,gap]);
   for(const {box:obstacle} of obstacles){
    for(const x of [obstacle.left-box.left-size.width-8,obstacle.right-box.left+8])xs.add(Math.max(sideMin,Math.min(sideMax,x)));
    for(const y of [obstacle.top-box.top-size.height-8,obstacle.bottom-box.top+8])ys.add(Math.max(gap,Math.min(maxY,y)));
   }
   for(const top of ys)for(const left of xs)candidates.push({left,top});
   const best=candidates.reduce((best,candidate)=>{const delta=score(candidate)-score(best);return delta<0||delta===0&&candidate.top>best.top?candidate:best;});
   setPosition(previous=>previous.left===best.left&&previous.top===best.top?previous:best);
  }
  const observer=new ResizeObserver(place);observer.observe(canvas);observer.observe(panel);place();
  return()=>observer.disconnect();
 },[ready,selected,selectedX,selectedVisit,locale,asset,expanded]);
 if(pending)return <section className={css.loading} role="status" aria-live="polite"><div className={css.skeleton} aria-hidden="true"><span/><span/><span/></div><p>{en?'Loading journey map…':'กำลังโหลดแผนที่งาน…'}</p></section>;
 if(!ready||!asset||!anchors)return <>{children}{detail}</>;
 const definition=snapshot.definition,keys=Object.fromEntries(stages.map(s=>[s.id,s.stage_key])),counts=stageVisitNumbers(path),closed=matterClosed(matter);
 const edges=artworkEdges(definition,path,keys,view);
 const focused=snapshot.definition.stages.find(s=>s.key===selected)||snapshot.definition.stages[0],visits=path.filter(v=>keys[v.stage_id]===focused.key),visit=selectedVisit&&keys[selectedVisit.stage_id]===focused.key?selectedVisit:visits.at(-1);
 const status=visit?(!visit.exited_at&&!closed?'current':visit.exit_reason==='skipped'?'skipped':visit.exit_reason==='completed'?'completed':'visited'):stages.find(s=>s.stage_key===focused.key)?.visits.some(v=>v.kind==='skip')?'skipped':'future';
 const stateLabel=en?{current:'Current',completed:'Completed',visited:'Visited',skipped:'Skipped',future:focused.conditional?'Not activated':'Not visited'}[status]:{current:'ขั้นตอนปัจจุบัน',completed:'เสร็จแล้ว',visited:'ผ่านขั้นตอนแล้ว',skipped:'ข้ามแล้ว',future:focused.conditional?'ยังไม่เปิดขั้นตอน':'ยังไม่เข้าขั้นตอน'}[status];
 const choose=(k:string)=>onSelect(k,path.findLast(v=>keys[v.stage_id]===k));
 return <>
 <section className={css.desktop} data-ready={loaded===asset.url} aria-label={en?'Strategic journey map':'แผนที่เส้นทางงาน'}>
  <div ref={canvasRef} className={css.canvas} aria-busy={loaded!==asset.url} style={{aspectRatio:`${asset.width}/${asset.height}`}}>
   <img className={css.art} src={asset.url} width={asset.width} height={asset.height} alt="" decoding="async" onLoad={event=>{void event.currentTarget.decode().then(()=>setLoaded(asset.url),()=>setFailed(asset.url));}} onError={()=>setFailed(asset.url)}/>
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
     <span className={css.dot}>{current?<MapPin size={23}/>:status==='completed'?<Check size={16}/>:status==='skipped'?<SkipForward size={16}/>:i+1}</span>
     <span className={css.caption}><strong>{journeyName(s,locale)}</strong><small>{en?{current:'Current',completed:'Completed',visited:'Visited',skipped:'Skipped',future:s.conditional?'Not activated':'Not visited'}[status]:{current:'ขั้นตอนปัจจุบัน',completed:'เสร็จแล้ว',visited:'ผ่านขั้นตอนแล้ว',skipped:'ข้ามแล้ว',future:s.conditional?'ยังไม่เปิดขั้นตอน':'ยังไม่เข้าขั้นตอน'}[status]}{!s.required&&` · ${en?'Optional':'ทางเลือก'}`}{s.conditional&&` · ${en?'Conditional':'ตามเงื่อนไข'}`}</small>{visits.length>1&&<small>{en?'Visit':'ครั้งที่'} {visits.length}</small>}{current&&['waiting_client','waiting_external','waiting_internal','on_hold'].includes(matter.work_state||'')&&<small className={css.waiting}>{t('advisory.enum.'+matter.work_state)}</small>}{current&&matter.has_overdue_work&&<small className={css.overdue}>{en?'Overdue work':'มีงานเลยกำหนด'}</small>}</span>
    </button>;
   })}
   {detail&&<aside ref={panelRef} className={css.panel} style={position} data-state={status} data-expanded={expanded} aria-label={en?'Stage detail':'รายละเอียดขั้นตอน'}>
    <div className={css.panelHeader}>
    <h3>{journeyName(focused,locale)}</h3>
    <p className={css.panelState}><strong>{stateLabel}</strong> · {en?(focused.required?'Required':'Optional'):(focused.required?'บังคับ':'ทางเลือก')}{focused.conditional&&` · ${en?'Conditional':'ตามเงื่อนไข'}`}</p>
    {!expanded&&visit&&<p className={css.panelDate}>{en?'Visit':'ครั้งที่'} {counts[path.indexOf(visit)]} · {date(visit.entered_at,true)}</p>}
    <div className={css.panelControls}>{!expanded&&status==='current'&&primaryAction&&<div className={css.panelAction}>{primaryAction}</div>}
    <button type="button" className={css.expand} aria-expanded={expanded} aria-controls={marker+'-details'} onClick={()=>setExpanded(value=>!value)}>{expanded?(en?'Collapse details':'ย่อรายละเอียด'):(en?'View details':'ดูรายละเอียด')}{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button></div>
    </div>
    {expanded&&<div className={css.panelBody} id={marker+'-details'} role="region" aria-label={en?'Full stage details':'รายละเอียดขั้นตอนทั้งหมด'} tabIndex={0}>{detail}</div>}
   </aside>}
  </div>
  <p className={css.hint}>{view==='actual'?(en?'Recorded visits only. Select a visit to inspect its history.':'เส้นทางจากการเข้าขั้นตอนจริง เลือกครั้งที่เข้าขั้นตอนเพื่อดูประวัติ'):(en?'Possible routes from this matter’s frozen journey; unchosen routes are not skips.':'เส้นทางที่เป็นไปได้จากรูปแบบที่บันทึกไว้ การไม่เลือกเส้นทางไม่ใช่การข้ามขั้นตอน')}</p>
  {view==='actual'&&<ol className={css.visits}>{path.map((v,i)=>{const k=keys[v.stage_id],s=definition.stages.find(s=>s.key===k);return s?<li key={v.id}><button type="button" onClick={()=>onSelect(k,v)} data-loop={counts[i]>1}>{i+1}. {journeyName(s,locale)} · {en?'Visit':'ครั้งที่'} {counts[i]}{counts[i]>1&&` ↶ ${en?'Return':'วนกลับ'}`}</button></li>:null;})}</ol>}
 </section>
 </>;
}
