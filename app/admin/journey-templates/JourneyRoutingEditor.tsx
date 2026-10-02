'use client';
import {useState} from 'react';
import {ArrowRight,CheckCircle2,Trash2} from 'lucide-react';
import {journeyName,type JourneyDefinition,type JourneyStep} from '../../../lib/advisory-flexible-journey';
import {controlledDraft,type JourneyOutcome} from '../../../lib/advisory-controlled-journey';
import {controlledText,type ControlledLabel} from '../../advisory/control/controlled-journey-labels';
import {journeyIssues} from '../../../lib/advisory-journey-presentation';
import JourneyPreview from './JourneyPreview';
import {journeyText,type JourneyLabel} from './labels';
import css from './journey-templates.module.css';

export default function JourneyRoutingEditor({definition,locale,onChange,onMove,onRemove,disabled=false}:{definition:JourneyDefinition;locale:string;onChange?:(d:JourneyDefinition)=>void;onMove?:(i:number,delta:number)=>void;onRemove?:(i:number)=>void;disabled?:boolean}){
 const [selected,setSelected]=useState('');
 const t=(k:ControlledLabel)=>controlledText(locale,k),j=(k:JourneyLabel)=>journeyText(locale,k),stages=definition.stages,stage=stages.find(s=>s.key===selected)||stages[0],index=stages.indexOf(stage),issues=journeyIssues(definition);
 function update(patch:Partial<JourneyStep>){onChange?.({...definition,stages:stages.map(s=>s.key===stage.key?{...s,...patch}:s)});}
 function outcome(index:number,patch:Partial<JourneyOutcome>){update({outcomes:stage.outcomes?.map((o,i)=>i===index?{...o,...patch}:o)});}
 if(definition.format!==2)return onChange?<div className={css.notice}><p>{t('enableHint')}</p><button type="button" disabled={disabled} onClick={()=>onChange(controlledDraft(definition))}>{t('enable')}</button></div>:null;
 return <section className={css.routing}>
  <div className={css.workspaceHeading}><h3>{j('stageSetup')}</h3><span>{stages.length} {t('stage')}</span></div>
  {issues.length>0&&<div role="alert" className={css.error}><strong>{t('reviewIssues')}</strong><ul>{issues.map((issue,i)=>{const at=stages.findIndex(s=>s.key===issue.stage);return <li key={i}><button type="button" onClick={()=>setSelected(issue.stage)}>{t('stage')} {at+1} · {journeyName(stages[at]||{},locale)}{issue.outcome&&` · ${t('outcome')} ${issue.outcome}`}: {t(issue.problem)}</button></li>;})}</ul></div>}
  <div className={css.routeColumns}>
   <nav aria-label={t('stage')} className={css.stageNav}>{stages.map((s,i)=><button key={s.key} type="button" aria-label={`${i+1}. ${journeyName(s,locale)}`} aria-current={s.key===stage.key?'step':undefined} onClick={()=>setSelected(s.key)}><span className={css.stageNumber}>{i+1}</span><span>{journeyName(s,locale)}{s.conditional&&<small>{t('conditional')}</small>}</span>{s.key===stage.key&&<span className={css.selectedDot} aria-hidden="true"/>}</button>)}</nav>
   <div className={css.routeDetail}>
    <div className={css.stageHeading}><span>{t('stage')} {index+1}</span><h4>{journeyName(stage,locale)}</h4>{!onChange&&<span className={css.badge} data-required={stage.required}>{j(stage.required?'required':'optional')}</span>}</div>
    {onChange&&<><div className={css.names}><label>{t('nameTh')}<input required disabled={disabled} maxLength={160} value={stage.name_th} onChange={e=>update({name_th:e.target.value})}/></label><label>{t('nameEn')}<input required disabled={disabled} maxLength={160} value={stage.name_en} onChange={e=>update({name_en:e.target.value})}/></label></div>
    <div className={css.stageSettings}><label><input type="checkbox" checked={stage.required} disabled={disabled||index===0||stage.key==='close'} onChange={e=>update({required:e.target.checked})}/>{j('required')}</label><label><input type="checkbox" checked={!!stage.conditional} disabled={disabled||stage===stages[0]||stage.key==='close'} onChange={e=>update({conditional:e.target.checked})}/>{t('conditional')}</label><div className={css.stageTools}><button type="button" disabled={disabled||index===0||stage.key==='close'} aria-label={j('up')} onClick={()=>onMove?.(index,-1)}>↑</button><button type="button" disabled={disabled||index>=stages.length-2} aria-label={j('down')} onClick={()=>onMove?.(index,1)}>↓</button><button type="button" title={j('remove')} aria-label={j('remove')} disabled={disabled||index===0||stage.key==='close'||stages.some(s=>s.outcomes?.some(o=>o.target===stage.key))} onClick={()=>onRemove?.(index)}><Trash2 size={15}/></button></div></div></>}
    {stage.conditional&&<p className={css.conditionalNote}>{j('conditionalExplanation')}</p>}
    {stage.key==='close'?<p className={css.notice}>{t('terminal')}</p>:<>
     <div className={css.outcomeHeading}><h4>{t('completionQuestion')}</h4><p>{t('completionHelp')}</p></div>
     <div className={css.outcomes}>{(stage.outcomes||[]).map((o,i)=><fieldset key={o.key} disabled={disabled} data-tone={stages.find(s=>s.key===o.target)?.conditional?'conditional':o.target==='close'?'close':'forward'}><legend>{i+1}</legend>{onChange?<>
      <div className={css.outcomeRow}><div className={css.outcomeNames}><label>{j('outcomeName')}<input aria-label={t('nameTh')} required maxLength={160} value={o.name_th} onChange={e=>outcome(i,{name_th:e.target.value})}/></label><label className={css.englishName}>{t('nameEn')}<input required maxLength={160} value={o.name_en} onChange={e=>outcome(i,{name_en:e.target.value})}/></label></div>
      <label className={css.target}>{j('targetStage')}<select required value={o.target} onChange={e=>outcome(i,{target:e.target.value})}><option value="">—</option>{stages.map(s=><option key={s.key} value={s.key}>{journeyName(s,locale)}</option>)}</select></label>
      <div className={css.outcomeOptions}><label><input type="checkbox" checked={o.requires_reason} onChange={e=>outcome(i,{requires_reason:e.target.checked})}/>{j('reasonQuestion')}</label><button type="button" title={t('removeOutcome')} aria-label={t('removeOutcome')} onClick={()=>update({outcomes:stage.outcomes?.filter((_,n)=>i!==n)})}><Trash2 size={15}/></button></div></div>
     </>:<div className={css.outcomeReadRow}><strong>{journeyName(o,locale)}</strong><ArrowRight size={16}/><span>{journeyName(stages.find(s=>s.key===o.target)||{},locale)}</span><small data-required={o.requires_reason}>{j(o.requires_reason?'reasonRequired':'reasonOptional')}</small></div>}</fieldset>)}</div>
     {onChange&&<button className={css.addOutcome} aria-label={t('addOutcome')} type="button" disabled={disabled||(stage.outcomes?.length||0)>=8} onClick={()=>update({outcomes:[...(stage.outcomes||[]),{key:'outcome_'+crypto.randomUUID().replaceAll('-',''),name_th:'',name_en:'',target:'',requires_reason:false}]})}>+ {t('addOutcome')}</button>}
    </>}
   </div>
   <aside className={css.preview}><JourneyPreview definition={definition} locale={locale} selected={stage.key} onSelect={setSelected}/>{!issues.length&&<p className={css.valid}><CheckCircle2 size={17}/>{t('routesValid')}</p>}</aside>
  </div>
 </section>;
}
