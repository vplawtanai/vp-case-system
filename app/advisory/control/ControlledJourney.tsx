'use client';
import {useState} from 'react';
import {Map,ArrowRight,Check,GitBranch} from 'lucide-react';
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
 const {t:translate,locale,date}=useI18n(),a=(key:string)=>translate('advisory.'+key),t=(k:ControlledLabel)=>controlledText(locale,k),[open,setOpen]=useState(false),[selected,setSelected]=useState('');
 const definition=snapshot.definition,stageFor=(id:string)=>stages.find(s=>s.id===id),frozen=(key?:string)=>definition.stages.find(s=>s.key===key),current=frozen(matter.stage_key||''),viewStage=frozen(selected)||current||definition.stages[0],closed=matterClosed(matter);
 function edit(action:string,key?:string){setOpen(false);onCloseMap?.();onEdit({action,title:a(action==='stage_skip'?'skip':'completeStage'),...(key?{values:{stage_key:key,stage_name:journeyName(frozen(key)||{},locale)}}:{})});}
 function routes(key:string){const s=frozen(key);return <div className={css.routes}>{s?.outcomes?.map(o=><div key={o.key} className={css.route}><span>{journeyName(o,locale)}{o.requires_reason&&<small>{t('reasonRequired')}</small>}</span><ArrowRight size={16}/><span><strong>{journeyName(frozen(o.target)||{},locale)}</strong>{frozen(o.target)?.conditional&&<small>{t('conditional')}</small>}</span></div>)}{s?.key==='close'&&<p>{t('terminal')}</p>}</div>;}
 return <section className={css.journey} id="journey"><header><h2>{a('journeyPlan')}</h2><button type="button" onClick={()=>setOpen(true)}><Map size={18}/>{t('showRoutes')}</button></header>
 <p className={css.snapshot}>{a('fjSnapshot')}: <strong>{journeyName(definition,locale)} · v{snapshot.version}</strong><small>{a('fjFrozen')}</small></p>
 <h3>{t('actual')}</h3>{path.length?<ol className={css.actual}>{path.map((v,i)=>{const s=stageFor(v.stage_id),meta=frozen(s?.stage_key),isCurrent=!v.exited_at&&!closed,decision=decisions.find(d=>d.detail.from_visit_id===v.id);return <li key={v.id} data-current={isCurrent} data-skipped={v.exit_reason==='skipped'}>
 <span className={css.marker}>{isCurrent?i+1:v.exit_reason==='completed'?<Check size={18}/>:i+1}</span><div><strong>{journeyName(meta||s||{},locale)}</strong><small>{t('visit')} {i+1} · {a(meta?.required?'fjRequired':'fjOptional')}{meta?.conditional&&` · ${t('conditional')}`}</small><p>{a(isCurrent?'current':v.exit_reason==='skipped'?'skipped':v.exit_reason==='completed'?'visited':'closed')} · {v.entered_at?date(v.entered_at,true):'—'}</p>
 {decision?.detail.outcome&&<p className={css.recorded}><strong>{t('outcome')}:</strong> {journeyName(decision.detail.outcome,locale)}{decision.detail.outcome_reason&&<span>{t('reason')}: {decision.detail.outcome_reason}</span>}</p>}
 {v.exit_reason==='skipped'&&decision?.detail.input?.reason&&<p className={css.recorded}>{t('skipReason')}: {decision.detail.input.reason}</p>}
 {isCurrent&&canEdit&&<div className={css.actions}><button type="button" className={css.primary} onClick={()=>edit('stage_complete')}>{a('completeStage')}</button>{meta&&!meta.required&&(controlledSkipAllowed(definition,meta.key)?<button type="button" onClick={()=>edit('stage_skip',meta.key)}>{a('skip')}</button>:<small>{t('completeInstead')}</small>)}</div>}
 </div></li>;})}</ol>:<p>{t('noVisits')}</p>}
 {current&&<aside className={css.possible}><h3><GitBranch size={17}/>{t('possible')}</h3><p>{t('possibleHint')}</p>{routes(current.key)}</aside>}
 <section className={css.audit}><h3>{t('decisions')}</h3>{decisions.length?<ol>{decisions.map(d=><li key={d.id}><div><strong>{journeyName(d.detail.from_stage||{},locale)}</strong> → {journeyName(d.detail.target_stage||{},locale)}<small>{d.detail.actor_name||personName(people,d.actor_id,d.actor_id)} · {date(d.occurred_at,true)}</small></div><div><strong>{d.detail.outcome?journeyName(d.detail.outcome,locale):t('skipped')}</strong>{(d.detail.outcome_reason||d.detail.input?.reason)&&<p>{t('reason')}: {d.detail.outcome_reason||d.detail.input?.reason}</p>}</div></li>)}</ol>:<p>{t('emptyDecisions')}</p>}</section>
 {(open||requestedOpen)&&<DetailModal open size="workflow" title={t('showRoutes')} subtitle={`${matter.matter_no} · ${journeyName(definition,locale)} · v${snapshot.version}`} closeLabel={a('closeMap')} onClose={()=>{setOpen(false);onCloseMap?.();}}><div className={css.map}><p>{t('possibleHint')}</p><div className={css.mapColumns}><nav aria-label={t('stage')}>{definition.stages.map(s=><button key={s.key} type="button" aria-current={viewStage.key===s.key?'step':undefined} onClick={()=>setSelected(s.key)}>{journeyName(s,locale)}{s.conditional&&<small>{t('conditional')}</small>}</button>)}</nav><section><h3>{journeyName(viewStage,locale)}</h3><p>{a(viewStage.required?'fjRequired':'fjOptional')}{viewStage.conditional&&` · ${t('conditional')}`}</p>{routes(viewStage.key)}{canEdit&&!closed&&current?.key===viewStage.key&&<button type="button" className={css.primary} onClick={()=>edit('stage_complete')}>{a('completeStage')}</button>}</section></div></div></DetailModal>}
 </section>;
}
