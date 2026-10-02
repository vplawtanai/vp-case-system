'use client';
import {journeyName,type JourneyStep} from '../../../lib/advisory-flexible-journey';
import {outcomeChoice,type JourneyOutcome} from '../../../lib/advisory-controlled-journey';
import {controlledText,type ControlledLabel} from './controlled-journey-labels';
import css from './outcome-fields.module.css';
export default function JourneyOutcomeFields({outcomes,stages,locale,choice,reason,onChoice,onReason,disabled}:{outcomes:JourneyOutcome[];stages:JourneyStep[];locale:string;choice:string;reason:string;onChoice:(key:string)=>void;onReason:(reason:string)=>void;disabled:boolean}){
 const t=(k:ControlledLabel)=>controlledText(locale,k),selected=outcomeChoice(outcomes,choice),target=(key:string)=>journeyName(stages.find(s=>s.key===key)||{},locale);
 return <div className={css.fields}><fieldset disabled={disabled}><legend>{t('outcomes')}</legend><p>{t(outcomes.length===1?'automatic':'choose')}</p>{outcomes.map(o=><label className={css.option} key={o.key} data-selected={selected?.key===o.key}>{outcomes.length>1&&<input type="radio" name="completion_outcome" value={o.key} checked={selected?.key===o.key} onChange={()=>onChoice(o.key)}/>}<strong>{journeyName(o,locale)}</strong><span>{t('target')}: {target(o.target)}{o.requires_reason&&<small>{t('reasonRequired')}</small>}</span></label>)}</fieldset>
 <div className={css.bottom}><label>{t('reason')}{selected?.requires_reason&&' *'}<textarea name="outcome_reason" aria-required={!!selected?.requires_reason} disabled={disabled} maxLength={4000} rows={3} value={reason} onChange={e=>onReason(e.target.value)}/><small>{reason.length}/4000</small></label><aside><strong>{t('summary')}</strong><p>{t('outcome')}: {selected?journeyName(selected,locale):'—'}</p><p>{t('target')}: {selected?target(selected.target):'—'}</p><small>{t('auditHint')}</small></aside></div>
 </div>;
}
