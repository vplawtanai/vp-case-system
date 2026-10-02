'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle2,Trash2} from 'lucide-react';
import {journeyName,type JourneyDefinition,type JourneyStep} from '../../../lib/advisory-flexible-journey';
import type {JourneyOutcome} from '../../../lib/advisory-controlled-journey';
import {controlledText,type ControlledLabel} from '../../advisory/control/controlled-journey-labels';
import {journeyIssues} from '../../../lib/advisory-journey-presentation';
import JourneyPreview from './JourneyPreview';
import {builderDraft,arrangeDraft,canRemoveStage,addDraftChoice} from './draft-routes';
import {previewIncoming} from './preview-routes';
import {journeyText,type JourneyLabel} from './labels';
import css from './journey-templates.module.css';

type Props={definition:JourneyDefinition;locale:string;onChange?:(d:JourneyDefinition)=>void;onMove?:(i:number,delta:number)=>void;onRemove?:(i:number)=>void;onAddStage?:()=>void;onBranch?:(key:string)=>void;onEditStage?:(key:string)=>void;selectedStage?:string;onSelectStage?:(key:string)=>void;focusRequest?:number;disabled?:boolean};
export default function JourneyRoutingEditor({definition:source,locale,onChange,onMove,onRemove,onAddStage,onBranch,onEditStage,selectedStage,onSelectStage,focusRequest=0,disabled=false}:Props){
 const [selected,setSelected]=useState('');
 const definition=source.format===2?source:builderDraft(source),detail=useRef<HTMLDivElement>(null);
 const t=(k:ControlledLabel)=>controlledText(locale,k),j=(k:JourneyLabel)=>journeyText(locale,k),stages=definition.stages,stage=stages.find(s=>s.key===(selectedStage??selected))||stages[0],index=stages.indexOf(stage),issues=journeyIssues(definition),incoming=previewIncoming(definition,stage.key);
 const select=(key:string)=>{if(onSelectStage)onSelectStage(key);else setSelected(key);};
 useEffect(()=>{if(focusRequest){detail.current?.focus({preventScroll:true});detail.current?.scrollIntoView({block:'nearest',behavior:'instant'});}},[focusRequest]);
 function update(patch:Partial<JourneyStep>){const next=stages.map(s=>s.key===stage.key?{...s,...patch}:s);onChange?.(patch.conditional!==undefined?arrangeDraft(definition,next):{...definition,stages:next});}
 function outcome(index:number,patch:Partial<JourneyOutcome>){update({outcomes:stage.outcomes?.map((o,i)=>i===index?{...o,...patch}:o)});}
 return <section className={css.routing}>
  <div className={css.workspaceHeading}><h3>{j('stageSetup')}</h3><span>{stages.length} {t('stage')}</span></div>
  {issues.length>0&&<div role="alert" className={css.error}><strong>{t('reviewIssues')}</strong><ul>{issues.map((issue,i)=>{const at=stages.findIndex(s=>s.key===issue.stage);return <li key={i}><button type="button" onClick={()=>{select(issue.stage);detail.current?.focus();}}>{t('stage')} {at+1} · {journeyName(stages[at]||{},locale)}{issue.outcome&&` · ${t('outcome')} ${issue.outcome}`}: {t(issue.problem)}</button></li>;})}</ul></div>}
  <div className={css.routeColumns}>
   <nav aria-label={t('stage')} className={css.stageNav}>{stages.map((s,i)=>{const count=s.outcomes?.length||0,target=stages.find(next=>next.key===s.outcomes?.[0]?.target);return <div className={css.stageCard} data-selected={s.key===stage.key} data-stage-key={s.key} key={s.key}>
    <button type="button" aria-label={`${i+1}. ${journeyName(s,locale,j('newStage'))}`} aria-current={s.key===stage.key?'step':undefined} onClick={()=>select(s.key)}><span className={css.stageNumber}>{i+1}</span><span>{journeyName(s,locale,j('newStage'))}<small>{s.key==='close'?j('lastStage'):s.conditional?t('conditional'):count>1?`${count} ${j('choices')}`:j('normalRoute')}</small></span>{s.key===stage.key&&<span className={css.selectedDot} aria-hidden="true"/>}</button>
    {s.key===stage.key&&count===1&&target&&<p className={css.normalNext}>{j('whenDone')} → {journeyName(target,locale,j('newStage'))}</p>}
    {s.key!=='close'&&onBranch&&<button type="button" className={css.stageBranchAction} data-branch-stage={s.key} disabled={disabled} onClick={()=>onBranch(s.key)}>{count>1?`${j('editChoices')} ${count} ${j('choices')}`:j('addFromStage')}</button>}
   </div>;})}{onAddStage&&<button type="button" className={css.addStage} aria-label={j('addStage')} disabled={disabled||stages.length>=20} onClick={onAddStage}>+ {j('addStage')}</button>}</nav>
   <div className={css.routeDetail} ref={detail} tabIndex={-1} data-stage-editor={stage.key}>
    <div className={css.stageHeading}><span>{t('stage')} {index+1}</span><h4>{journeyName(stage,locale,j('newStage'))}</h4>{!onChange&&<><span className={css.badge} data-required={stage.required}>{j(stage.required?'required':'optional')}</span>{onEditStage&&<button type="button" className={css.editStage} disabled={disabled} onClick={()=>onEditStage(stage.key)}>{j('editStage')}</button>}</>}</div>
    {onChange&&<><div className={css.names}><label>{t('nameTh')}<input required disabled={disabled} maxLength={160} value={stage.name_th} onChange={e=>update({name_th:e.target.value})}/></label><label>{t('nameEn')}<input required disabled={disabled} maxLength={160} value={stage.name_en} onChange={e=>update({name_en:e.target.value})}/></label></div>
    <div className={css.stageSettings}><label><input type="checkbox" checked={stage.required} disabled={disabled||index===0||stage.key==='close'} onChange={e=>update({required:e.target.checked})}/>{j('required')}</label><label><input type="checkbox" checked={!!stage.conditional} disabled={disabled||stage===stages[0]||stage.key==='close'} onChange={e=>update({conditional:e.target.checked})}/>{t('conditional')}</label><div className={css.stageTools}><button type="button" disabled={disabled||index===0||stage.key==='close'} aria-label={j('up')} onClick={()=>onMove?.(index,-1)}>↑</button><button type="button" disabled={disabled||index>=stages.length-2} aria-label={j('down')} onClick={()=>onMove?.(index,1)}>↓</button><button type="button" title={canRemoveStage(definition,stage.key)?j('remove'):j('removeLinked')} aria-label={j('remove')} disabled={disabled||!canRemoveStage(definition,stage.key)} onClick={()=>onRemove?.(index)}><Trash2 size={15}/></button></div></div></>}
    {stage.conditional&&<div className={css.conditionalNote}><strong>{j('opensWhen')}</strong>{incoming.length?<ul>{incoming.map(({stage:from,outcome:o})=><li key={`${from.key}:${o.key}`}><button type="button" onClick={()=>select(from.key)}>{journeyName(from,locale)}</button> · {j('via')} “{journeyName(o,locale)}” → {journeyName(stage,locale)}</li>)}</ul>:<p>{j('noIncoming')}</p>}<p>{j('conditionalExplanation')}</p></div>}
    {stage.key==='close'?<p className={css.notice}>{t('terminal')}</p>:<>
     <div className={css.outcomeHeading}><h4>{j('completionQuestion')}</h4><p>{t('completionHelp')}</p></div>
     <div className={css.outcomes}>{(stage.outcomes||[]).map((o,i)=><fieldset key={o.key} disabled={disabled} data-tone={stages.find(s=>s.key===o.target)?.conditional?'conditional':o.target==='close'?'close':'forward'}><legend>{i+1}</legend>{onChange?<>
      <div className={css.outcomeRow}><div className={css.outcomeNames}><label>{j('outcomeName')}<input aria-label={t('nameTh')} required maxLength={160} value={o.name_th} onChange={e=>outcome(i,{name_th:e.target.value})}/></label><label className={css.englishName}>{t('nameEn')}<input required maxLength={160} value={o.name_en} onChange={e=>outcome(i,{name_en:e.target.value})}/></label></div>
      <label className={css.target}>{j('targetStage')}<select required value={o.target} onChange={e=>outcome(i,{target:e.target.value})}><option value="">—</option>{stages.map(s=><option key={s.key} value={s.key}>{journeyName(s,locale)}</option>)}</select></label>
      <div className={css.outcomeOptions}><label><input type="checkbox" checked={o.requires_reason} onChange={e=>outcome(i,{requires_reason:e.target.checked})}/>{j('reasonQuestion')}</label><button type="button" title={t('removeOutcome')} aria-label={t('removeOutcome')} onClick={()=>update({outcomes:stage.outcomes?.filter((_,n)=>i!==n)})}><Trash2 size={15}/></button></div></div>
     </>:<div className={css.outcomeReadRow}><strong>{journeyName(o,locale)}</strong><ArrowRight size={16}/><span>{journeyName(stages.find(s=>s.key===o.target)||{},locale)}</span><small data-required={o.requires_reason}>{j(o.requires_reason?'reasonRequired':'reasonOptional')}</small></div>}</fieldset>)}</div>
     {onChange&&<button className={css.addOutcome} aria-label={t('addOutcome')} type="button" disabled={disabled||(stage.outcomes?.length||0)>=8} onClick={()=>onChange(addDraftChoice(definition,stage.key,'outcome_'+crypto.randomUUID().replaceAll('-','')))}>+ {t('addOutcome')}</button>}
    </>}
   </div>
   <aside className={css.preview}><JourneyPreview definition={definition} locale={locale} selected={stage.key} onSelect={select}/>{!issues.length&&<p className={css.valid}><CheckCircle2 size={17}/>{t('routesValid')}</p>}</aside>
  </div>
 </section>;
}
