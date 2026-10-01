"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {CheckCircle2,AlertCircle} from 'lucide-react';
import DetailModal from '../../components/DetailModal';
import {supabase} from '../../../lib/supabase';
import type {Matter} from '../../../lib/advisory-control';
import {successfulOutcome} from '../../../lib/advisory-workflow';
import {useAdvisoryLabels} from './shared';
import {useMatterWrite,useWorkflowChecks} from './workflow-shared';
import css from './control.module.css';
export default function MatterWorkflowDialog({mode,matter,onClose,onSaved,onFinish,onTasks}:{mode:'stage_complete'|'close'|'reopen';matter:Matter;onClose:()=>void;onSaved:()=>Promise<void>;onFinish:()=>void;onTasks:()=>void}){
 const {a,label}=useAdvisoryLabels(),{checks,loading,error:loadError,reload}=useWorkflowChecks(matter),{write,busy,error}=useMatterWrite(matter);
 const [blockingTasks,setBlockingTasks]=useState<{id:string;title:string}[]>([]),[taskLoadError,setTaskLoadError]=useState(false);
 const currentStage=checks?.current_stage_id,blockingCount=checks?.current_stage_open_tasks;
 useEffect(()=>{let live=true;if(mode!=='stage_complete'||!currentStage||!blockingCount)return;void Promise.resolve(supabase.from('advisory_issue_tasks').select('id,title').eq('advisory_matter_id',matter.id).eq('stage_id',currentStage).is('deleted_at',null).not('status','in','(completed,cancelled)').order('title').order('id').limit(20)).then(r=>{if(live){setBlockingTasks(r.data||[]);setTaskLoadError(!!r.error);}}).catch(()=>{if(live)setTaskLoadError(true);});return()=>{live=false;};},[mode,matter.id,currentStage,blockingCount]);
 const [resolve,setResolve]=useState(false),[outcome,setOutcome]=useState('completed');
 const stage=mode==='stage_complete',closing=mode==='close',fresh=checks?.version===matter.version;
 const blocked=!checks||!fresh||loading||(stage&&(!checks.current_visit_id||checks.closed||checks.current_stage_open_tasks>0||(checks.has_next_action&&!resolve)))||(closing&&(checks.closed||successfulOutcome(outcome)&&!checks.ready_to_close));
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(blocked||busy)return;const fields=Object.fromEntries(new FormData(e.currentTarget));const result=await write(mode,stage?{visit_id:checks!.current_visit_id,resolve_next_action:resolve}:fields);if(result){await onSaved();if(stage&&result.ready_for_closing)onFinish();else onClose();}}
 const rows=stage?[['stageTasksClear','stageTasksPending',checks?.current_stage_open_tasks===0,checks?.current_stage_open_tasks]]:[['tasksClear','tasksPending',checks?.open_tasks===0,checks?.open_tasks],['nextClear','nextPending',!checks?.has_next_action,null],['deliverablesClear','deliverablesPending',checks?.pending_deliverables===0,checks?.pending_deliverables],['stagesClear','stagesPending',checks?.stage_ready,checks?.uncompleted_stages]];
 return <DetailModal open size="edit" title={a(stage?'completeStage':closing?'closeMatter':'reopen')} subtitle={matter.matter_no} onClose={()=>{if(!busy)onClose();}}><form className={css.form} onSubmit={submit}>
 {error&&<p role="alert" className={css.error}>{error}</p>}
 {loading?<p role="status">{a('loading')}</p>:loadError?<p className={css.error} role="alert">{a('loadError')} <button type="button" onClick={reload}>{a('refresh')}</button></p>:!fresh?<p role="alert" className={css.error}>{a('changed')} <button type="button" onClick={onSaved}>{a('refresh')}</button></p>:<>
 {stage&&<p className={css.notice}>{label(checks?.current_stage_key,matter.template_key)} · {a('stageCompletionHint')}</p>}
 {mode!=='reopen'&&<ul className={`${css.checklist} ${css.wide}`}>{rows.map(([key,pendingKey,ok,count])=><li key={String(key)} data-ok={!!ok}>{ok?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<span>{a(String(ok?key:pendingKey))}{typeof count==='number'&&count>0?` (${count})`:''}</span></li>)}</ul>}
 {stage&&!!checks?.current_stage_open_tasks&&<p role="alert" className={css.error}>{a('stageBlocked')} <button type="button" onClick={onTasks}>{a('viewTasks')}</button></p>}
 {stage&&!!checks?.current_stage_open_tasks&&<div className={css.wide}>{taskLoadError?<p>{a('loadError')}</p>:<ul className={css.rows}>{blockingTasks.map(t=><li key={t.id}>{t.title}</li>)}</ul>}</div>}
 {stage&&checks?.has_next_action&&<label className={`${css.check} ${css.wide}`}><input type="checkbox" checked={resolve} onChange={e=>setResolve(e.target.checked)}/><span>{a('resolveNextHint')}</span></label>}
 {closing&&<><label>{a('outcome')}<select name="outcome" value={outcome} onChange={e=>setOutcome(e.target.value)}>{['completed','agreement','client_stopped','external_refusal','litigation','cancelled'].map(k=><option key={k} value={k}>{label(k)}</option>)}</select></label><label className={css.wide}>{a('summary')}<textarea name="summary" required maxLength={4000} rows={3}/></label>{!checks?.ready_to_close&&(successfulOutcome(outcome)?<p role="alert" className={css.error}>{a('closeBlocked')}</p>:<label className={css.wide}>{a('unresolvedReason')}<textarea name="unresolved_reason" required maxLength={4000} rows={2}/><small>{a('exceptionCloseHint')}</small></label>)}<details className={css.wide}><summary>{a('optionalDetails')}</summary><label>{a('followUp')}<textarea name="follow_up" maxLength={4000}/></label><label>{a('caseReference')}<input name="case_reference" maxLength={500}/></label></details></>}
 {mode==='reopen'&&<><p className={css.notice}>{a('reopenHint')}</p><label className={css.wide}>{a('reason')}<textarea name="reason" required maxLength={4000} rows={3}/></label></>}
 </>}
 <div className={css.formActions}><button type="button" disabled={busy} onClick={onClose}>{a('cancel')}</button><button type="submit" className={css.primary} disabled={busy||blocked}>{a(busy?'saving':stage?'confirmAdvance':closing?'closeMatter':'reopen')}</button></div>
 </form></DetailModal>;
}
