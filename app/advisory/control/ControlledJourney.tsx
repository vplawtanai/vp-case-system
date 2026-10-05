'use client';
import {useJourneyArtwork} from './useJourneyArtwork';
import {useState} from 'react';
import {Map,ArrowRight,Check,GitBranch} from 'lucide-react';
import StrategicJourneyMap from './StrategicJourneyMap';
import JourneyRouteMap from './JourneyRouteMap';
import JourneyActualMap from './JourneyActualMap';
import {stageVisitNumbers} from '../../../lib/advisory-journey-presentation';
import DetailModal from '../../components/DetailModal';
import {journeyName,type JourneySnapshot} from '../../../lib/advisory-flexible-journey';
import {controlledSkipAllowed,type JourneyPathVisit,type JourneyDecision} from '../../../lib/advisory-controlled-journey';
import {personName,type Matter,type Person,type Stage} from '../../../lib/advisory-control';
import {matterClosed} from '../../../lib/advisory-workflow';
import {useI18n} from '../../../lib/i18n/provider';
import {controlledText,type ControlledLabel} from './controlled-journey-labels';
import type {EditRequest} from './MatterEditor';
import css from './controlled-journey.module.css';
type Props={snapshot:JourneySnapshot;matter:Matter;stages:Stage[];path:JourneyPathVisit[];decisions:JourneyDecision[];people:Person[];canEdit:boolean;onEdit:(request:EditRequest)=>void;requestedOpen?:boolean;onCloseMap?:()=>void};
export default function ControlledJourney({snapshot,matter,stages,path,decisions,people,canEdit,onEdit,requestedOpen,onCloseMap}:Props){
 const {t:translate,locale,date}=useI18n(),a=(key:string)=>translate('advisory.'+key),t=(k:ControlledLabel)=>controlledText(locale,k),[open,setOpen]=useState(false),[selected,setSelected]=useState(''),[mapView,setMapView]=useState<'actual'|'possible'>('actual'),[selectedVisit,setSelectedVisit]=useState('');
 useJourneyArtwork(matter.id,snapshot);
 const definition=snapshot.definition,stageFor=(id:string)=>stages.find(s=>s.id===id),frozen=(key?:string)=>definition.stages.find(s=>s.key===key),current=frozen(matter.stage_key||''),viewStage=frozen(selected)||current||definition.stages[0],closed=matterClosed(matter),visitNumbers=stageVisitNumbers(path);
 const completedKeys=path.filter(v=>v.exit_reason==='completed').map(v=>stageFor(v.stage_id)?.stage_key||'');
 const focusedVisit=path.find(v=>v.id===selectedVisit),stageVisits=path.filter(v=>stageFor(v.stage_id)?.stage_key===viewStage.key);
 function edit(action:string,key?:string){setOpen(false);onCloseMap?.();onEdit({action,title:a(action==='stage_skip'?'skip':'completeStage'),...(key?{values:{stage_key:key,stage_name:journeyName(frozen(key)||{},locale)}}:{})});}
 function routes(key:string){const s=frozen(key);return <div className={css.routes}>{s?.outcomes?.map(o=><div key={o.key} className={css.route}><span>{journeyName(o,locale)}{o.requires_reason&&<small>{t('reasonRequired')}</small>}</span><ArrowRight size={16}/><span><strong>{journeyName(frozen(o.target)||{},locale)}</strong>{frozen(o.target)?.conditional&&<small>{t('conditional')}</small>}</span></div>)}{s?.key==='close'&&<p>{t('terminal')}</p>}</div>;}
 const stageDetail=(<section className={css.stageSummary}><header><h3>{t('stageDetail')}: {journeyName(viewStage,locale)}</h3><span>{a(viewStage.required?'fjRequired':'fjOptional')}{viewStage.conditional&&` · ${t('conditional')}`}</span></header>
 {viewStage.conditional&&<p className={css.mapHint}>{t('conditionalHint')}</p>}
 {stageVisits.length>0?<div className={css.visitHistory}><h4>{t('recordedVisits')}</h4>{stageVisits.filter(v=>!focusedVisit||v.id===focusedVisit.id).map(v=>{const decision=decisions.find(d=>d.detail.from_visit_id===v.id);return <div key={v.id}><strong>{t('visit')} {visitNumbers[path.indexOf(v)]}</strong> · {date(v.entered_at,true)}{decision&&<><p>{t('actor')}: {decision.detail.actor_name||personName(people,decision.actor_id,decision.actor_id)} · {date(decision.occurred_at,true)}</p><p>{decision.detail.outcome?`${t('outcome')}: ${journeyName(decision.detail.outcome,locale)}`:t('skipped')}</p>{(decision.detail.outcome_reason||decision.detail.input?.reason)&&<p className={css.recorded}>{t('reason')}: {decision.detail.outcome_reason||decision.detail.input?.reason}</p>}</>}</div>;})}</div>:<p>{viewStage.conditional?t('notActivated'):t('noVisits')}</p>}
 <dl className={css.detailFacts}><div><dt>{a('taskCompletion')}</dt><dd>{(()=>{const stage=stages.find(s=>s.stage_key===viewStage.key);return stage?.task_total==null||stage.task_completed==null?a('notAvailable'):`${stage.task_completed} / ${stage.task_total}`;})()}</dd></div><div><dt>{a('actual')}</dt><dd>{(()=>{const minutes=stages.find(s=>s.stage_key===viewStage.key)?.minutes;return minutes==null?a('notAvailable'):translate('advisory.minutes',{n:minutes});})()}</dd></div></dl>
 <p className={css.mapHint}>{a('matterNextAction')}: {matter.next_action||a('noNext')} · {a('actor')}: {matter.next_owner_name||a('unassigned')} · {a('due')}: {date(matter.next_due)}</p>
 <h4>{t('completionQuestion')}</h4><p className={css.mapHint}>{t('possibleHint')}</p>{routes(viewStage.key)}{canEdit&&!closed&&current?.key===viewStage.key&&<button type="button" className={css.primary} onClick={()=>edit('stage_complete')}>{a('completeStage')}</button>}
 </section>);
 return <section className={css.journey} id="journey"><header><h2>{a('journeyPlan')}</h2><button type="button" onClick={()=>setOpen(true)}><Map size={18}/>{t('showRoutes')}</button></header>
 <p className={css.snapshot}>{a('fjSnapshot')}: <strong>{journeyName(definition,locale)} · v{snapshot.version}</strong><small>{a('fjFrozen')}</small></p>
 <h3>{t('actual')}</h3>{path.length?<ol className={css.actual}>{path.map((v,i)=>{const s=stageFor(v.stage_id),meta=frozen(s?.stage_key),isCurrent=!v.exited_at&&!closed,decision=decisions.find(d=>d.detail.from_visit_id===v.id);return <li key={v.id} data-current={isCurrent} data-skipped={v.exit_reason==='skipped'}>
 <span className={css.marker}>{!isCurrent&&v.exit_reason==='completed'?<Check size={18}/>:meta?definition.stages.indexOf(meta)+1:'—'}</span><div><strong>{journeyName(meta||s||{},locale)}</strong><small>{t('visit')} {visitNumbers[i]} · {a(meta?.required?'fjRequired':'fjOptional')}{meta?.conditional&&` · ${t('conditional')}`}</small><p>{a(isCurrent?'current':v.exit_reason==='skipped'?'skipped':v.exit_reason==='completed'?'visited':'closed')} · {v.entered_at?date(v.entered_at,true):'—'}</p>
 {decision?.detail.outcome&&<p className={css.recorded}><strong>{t('outcome')}:</strong> {journeyName(decision.detail.outcome,locale)}{decision.detail.outcome_reason&&<span>{t('reason')}: {decision.detail.outcome_reason}</span>}</p>}
 {v.exit_reason==='skipped'&&decision?.detail.input?.reason&&<p className={css.recorded}>{t('skipReason')}: {decision.detail.input.reason}</p>}
 {isCurrent&&canEdit&&<div className={css.actions}><button type="button" className={css.primary} onClick={()=>edit('stage_complete')}>{a('completeStage')}</button>{meta&&!meta.required&&(controlledSkipAllowed(definition,meta.key)?<button type="button" onClick={()=>edit('stage_skip',meta.key)}>{a('skip')}</button>:<small>{t('completeInstead')}</small>)}</div>}
 </div></li>;})}</ol>:<p>{t('noVisits')}</p>}
 {current&&<aside className={css.possible}><h3><GitBranch size={17}/>{t('possible')}</h3><p>{t('possibleHint')}</p>{routes(current.key)}</aside>}
 <section className={css.audit}><h3>{t('decisions')}</h3>{decisions.length?<ol>{decisions.map(d=><li key={d.id}><div><strong>{journeyName(d.detail.from_stage||{},locale)}</strong> → {journeyName(d.detail.target_stage||{},locale)}<small>{d.detail.actor_name||personName(people,d.actor_id,d.actor_id)} · {date(d.occurred_at,true)}</small></div><div><strong>{d.detail.outcome?journeyName(d.detail.outcome,locale):t('skipped')}</strong>{(d.detail.outcome_reason||d.detail.input?.reason)&&<p>{t('reason')}: {d.detail.outcome_reason||d.detail.input?.reason}</p>}</div></li>)}</ol>:<p>{t('emptyDecisions')}</p>}</section>
 {(open||requestedOpen)&&<DetailModal open size="workflow" className={css.mapDialog} title={t('showRoutes')} subtitle={`${matter.matter_no} · ${journeyName(definition,locale)} · v${snapshot.version}`} closeLabel={a('closeMap')} onClose={()=>{setOpen(false);onCloseMap?.();}}><div className={css.map}>
 <div className={css.mapTabs} role="group" aria-label={t('showRoutes')}><button type="button" aria-pressed={mapView==='actual'} onClick={()=>{setMapView('actual');const latest=path.find(v=>!v.exited_at)||path.at(-1);setSelectedVisit(latest?.id||'');setSelected(latest?stageFor(latest.stage_id)?.stage_key||'':'');}}>{t('actual')}</button><button type="button" aria-pressed={mapView==='possible'} onClick={()=>setMapView('possible')}>{t('allRoutes')}</button></div>
 <StrategicJourneyMap detail={stageDetail} selectedVisit={focusedVisit} primaryAction={canEdit&&!closed&&current?.key===viewStage.key&&<button type="button" className={css.primary} onClick={()=>edit('stage_complete')}>{locale==='en'?'Complete stage':'เสร็จขั้นตอน'}</button>} matter={matter} snapshot={snapshot} stages={stages} path={path} locale={locale} selected={viewStage.key} view={mapView} onSelect={(key,visit)=>{setSelected(key);setSelectedVisit(mapView==='actual'?visit?.id||'':'');}}>
 {mapView==='actual'?<JourneyActualMap definition={definition} stages={stages} path={path} decisions={decisions} locale={locale} closed={closed} selectedVisit={focusedVisit?.id||path.find(v=>!v.exited_at)?.id||''} onSelect={v=>{setSelected(stageFor(v.stage_id)?.stage_key||'');setSelectedVisit(v.id);}} date={value=>date(value,true)}/>:<JourneyRouteMap definition={definition} locale={locale} selected={viewStage.key} onSelect={key=>{setSelected(key);setSelectedVisit('');}} current={!closed?current?.key:undefined} completed={completedKeys} matter/>}
 </StrategicJourneyMap>
</div></DetailModal>}

 </section>;
}
