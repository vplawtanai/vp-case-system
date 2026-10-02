'use client';
import {journeyName,type JourneyDefinition} from '../../../lib/advisory-flexible-journey';
import {stageVisitNumbers} from '../../../lib/advisory-journey-presentation';
import type {JourneyPathVisit,JourneyDecision} from '../../../lib/advisory-controlled-journey';
import type {Stage} from '../../../lib/advisory-control';
import {controlledText} from './controlled-journey-labels';
import css from './controlled-journey.module.css';

type Props={definition:JourneyDefinition;stages:Stage[];path:JourneyPathVisit[];decisions:JourneyDecision[];locale:string;closed:boolean;selectedVisit:string;onSelect:(visit:JourneyPathVisit)=>void;date:(value:string)=>string};
export default function JourneyActualMap({definition,stages,path,decisions,locale,closed,selectedVisit,onSelect,date}:Props){
 const numbers=stageVisitNumbers(path),t=(key:Parameters<typeof controlledText>[1])=>controlledText(locale,key);
 return <><p className={css.mapHint}>{t('visitHint')}</p>{!path.length?<p>{t('noVisits')}</p>:<div className={css.pathScroll} tabIndex={0} role="region" aria-label={t('actual')}><ol className={css.pathMap}>
 {path.map((visit,i)=>{
  const stage=stages.find(s=>s.id===visit.stage_id),meta=definition.stages.find(s=>s.key===stage?.stage_key),decision=decisions.find(d=>d.detail.from_visit_id===visit.id),current=!visit.exited_at&&!closed;
  return <li key={visit.id} data-loop={numbers[i]>1}>
   {numbers[i]>1&&<span className={css.returnVisit}>↶ {t('returnVisit')}</span>}
   <button type="button" className={css.visitNode} data-current={current} data-completed={visit.exit_reason==='completed'} data-skipped={visit.exit_reason==='skipped'} aria-pressed={selectedVisit===visit.id} onClick={()=>onSelect(visit)}>
    <span className={css.visitState}>{current?'●':visit.exit_reason==='completed'?'✓':'○'} {current?t('currentStage'):visit.exit_reason==='skipped'?t('skipped'):visit.exit_reason==='completed'?t('completedStage'):'—'}</span>
    <strong>{journeyName(meta||stage||{},locale)}</strong><span className={css.visitNumber}>{t('visit')} {numbers[i]}</span><small>{visit.entered_at?date(visit.entered_at):'—'}</small>
   </button>
   {decision?.detail.outcome&&<span className={css.pathOutcome}>{journeyName(decision.detail.outcome,locale)} →</span>}
  </li>;
 })}
 </ol></div>}</>;
}
