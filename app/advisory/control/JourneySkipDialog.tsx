'use client';
import {useState,type FormEvent} from 'react';
import DetailModal from '../../components/DetailModal';
import {type Matter} from '../../../lib/advisory-control';
import {useAdvisoryLabels} from './shared';
import {useMatterWrite,useWorkflowChecks} from './workflow-shared';
import type {EditRequest} from './MatterEditor';
import css from './control.module.css';
export default function JourneySkipDialog({matter,request,onClose,onSaved}:{matter:Matter;request:EditRequest;onClose:()=>void;onSaved:()=>Promise<void>}){
 const {a}=useAdvisoryLabels(),{write,busy,error}=useMatterWrite(matter),{checks,loading,error:loadError}=useWorkflowChecks(matter),[reason,setReason]=useState(''),[resolve,setResolve]=useState(false),[invalid,setInvalid]=useState(false);
 const current=request.values?.stage_key===matter.stage_key,blocked=current&&!!checks?.current_stage_open_tasks;
 async function submit(e:FormEvent){e.preventDefault();if(!reason.trim()){setInvalid(true);return;}if(busy||loading||loadError||blocked||!checks||checks.version!==matter.version)return;const result=await write('stage_skip',{stage_key:request.values?.stage_key,reason:reason.trim(),...(current?{visit_id:checks.current_visit_id,resolve_next_action:resolve}:{})});if(result){await onSaved();onClose();}}
 return <DetailModal open title={a('skip')} onClose={()=>{if(!busy)onClose();}} size="edit"><form className={css.form} onSubmit={submit}>
 <div className={css.wide}><strong>{request.values?.stage_name}</strong><p>{a('fjSkipHint')}</p></div>{(error||loadError)&&<p role="alert" className={css.error}>{error||a('loadError')}</p>}{blocked&&<p role="alert">{a('stageBlocked')}</p>}
 <label className={css.wide}>{a('reason')}<textarea value={reason} onChange={e=>{setReason(e.target.value);setInvalid(false);}} maxLength={4000} aria-required aria-invalid={invalid}/>{invalid&&<small role="alert">{a('fjReasonRequired')}</small>}</label>
 {current&&checks?.has_next_action&&<label className={css.check}><input type="checkbox" checked={resolve} onChange={e=>setResolve(e.target.checked)}/>{a('fjResolveNext')}</label>}
 <div className={css.formActions}><button type="button" disabled={busy} onClick={onClose}>{a('cancel')}</button><button type="submit" disabled={busy||loading||loadError||blocked||!checks||(current&&checks.has_next_action&&!resolve)}>{a(busy?'saving':'skip')}</button></div>
 </form></DetailModal>;
}
