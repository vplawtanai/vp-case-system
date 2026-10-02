'use client';
import {ArrowDown,ArrowRight,CornerUpLeft,Flag,GitBranch} from 'lucide-react';
import {journeyName,type JourneyDefinition} from '../../../lib/advisory-flexible-journey';
import {previewContinuation,previewClosingPath} from './preview-routes';
import {journeyText} from './labels';
import css from './journey-templates.module.css';

type Props={definition:JourneyDefinition;locale:string;selected:string;onSelect:(key:string)=>void};
export default function JourneyPreview({definition,locale,selected,onSelect}:Props){
 const t=(key:Parameters<typeof journeyText>[1])=>journeyText(locale,key),stages=definition.stages,stage=stages.find(s=>s.key===selected)||stages[0];
 const name=(s:Parameters<typeof journeyName>[0])=>journeyName(s,locale),position=(key:string)=>stages.findIndex(s=>s.key===key)+1;
 const outcomes=stage.outcomes||[],closing=previewClosingPath(definition,stage.key);
 return <div className={css.focusPreview} role="region" aria-label={t('preview')}>
  <div className={css.previewHeading}><GitBranch size={18}/><h4>{t('preview')}</h4></div>
  <p className={css.previewDescription}>{t('previewFocus')}</p>
  <button type="button" className={css.previewSource} onClick={()=>onSelect(stage.key)} aria-label={`${position(stage.key)}. ${name(stage)}`} aria-pressed="true"><span className={css.stageNumber}>{position(stage.key)}</span><strong>{name(stage)}</strong><small>{t('selectedStage')}</small></button>
  {stage.key==='close'?<div className={css.closeMessage}><Flag size={18}/>{t('closingSeparate')}</div>:<>
   <p className={css.routeExplanation}>{t(outcomes.length===1?'soleRoute':'choiceRoutes')}</p>
   <div className={css.branchBoard} style={{'--branches':Math.min(3,Math.max(1,outcomes.length))} as React.CSSProperties}>
   {outcomes.map((outcome,i)=>{
    const target=stages.find(s=>s.key===outcome.target),continuation=previewContinuation(definition,stage,outcome.target),returnNow=!!target&&stages.indexOf(target)<=stages.indexOf(stage),kind=returnNow?'return':target?.key==='close'?'close':target?.conditional?'conditional':'forward';
    return <div key={outcome.key} className={css.previewBranch} data-route={`${stage.key}:${outcome.key}`} data-target={outcome.target} data-kind={kind}>
     <ArrowDown className={css.branchArrow} size={18}/><div className={css.outcomePill}><span>{i+1}</span>{name(outcome)||t('unnamedOutcome')}</div><small className={css.previewReason}>{t(outcome.requires_reason?'reasonRequired':'reasonOptional')}</small>
     <ArrowDown className={css.branchArrow} size={16}/>
     {target?<button type="button" className={css.previewTarget} aria-label={`${position(target.key)}. ${name(target)}`} onClick={()=>onSelect(target.key)}>{returnNow?<CornerUpLeft size={18}/>:target.key==='close'?<Flag size={18}/>:<span className={css.stageNumber}>{position(target.key)}</span>}<strong>{name(target)}</strong></button>:<p className={css.error}>{t('chooseTarget')}</p>}
     {target?.conditional&&<small className={css.conditionalCaption}>{t('opensOnChoice')}</small>}
     {returnNow&&<p className={css.returnCaption}><CornerUpLeft size={15}/>{t('returnTo')} {position(target!.key)}<small>{t('newVisit')}</small></p>}
     {!returnNow&&continuation.steps.map(({stage:next,via},n)=><div key={`${next.key}-${n}`} className={css.continuation}><span className={css.viaLabel}>↓ {name(via)}</span><button type="button" onClick={()=>onSelect(next.key)}>{next.key==='close'?<Flag size={14}/>:continuation.end==='return'&&n===continuation.steps.length-1?<CornerUpLeft size={14}/>:<ArrowRight size={14}/>}<span>{name(next)}</span></button>{next.conditional&&<small>{t('opensOnChoice')}</small>}</div>)}
     {!returnNow&&continuation.end==='return'&&<p className={css.returnCaption}><CornerUpLeft size={15}/>{t('returnTo')} {position(continuation.at!.key)}<small>{t('newVisit')}</small></p>}
     {continuation.end==='choice'&&<small className={css.nextChoice}>{t('chooseAgain')}</small>}
     {continuation.end==='close'&&<small className={css.closeCaption}>{t('reachesClose')}</small>}
    </div>;
   })}
   </div>
   {outcomes.length===0&&<p className={css.error}>{t('addOutcomeHint')}</p>}
  </>}
  {stage.key!=='close'&&closing&&<details className={css.closePath}><summary><Flag size={15}/>{t('exampleClosePath')}</summary><p>{t('exampleOnly')}</p><ol>{closing.map(({stage:next,outcome},i)=><li key={i}><span>{name(outcome)}</span><ArrowRight size={13}/><button type="button" onClick={()=>onSelect(next.key)}>{name(next)}</button></li>)}</ol></details>}
  <p className={css.previewFootnote}>{t('previewFootnote')}</p>
 </div>;
}
