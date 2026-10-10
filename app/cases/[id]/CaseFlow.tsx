'use client';
import {useEffect,useRef,useState} from 'react';
import {Route,MapPin} from 'lucide-react';
import {supabase} from '../../../lib/supabase';
import CaseEditModal from './CaseEditModal';
import {useCaseDetailText} from './labels';
import {FILING_METHODS,hasCourtRecord,validCutInFiling,flowError,needsFlowReason,stageEvidence,flowStageTitle,type FlowAction,type FlowData} from './flow-model';
import base from './case-detail.module.css';
import css from './case-flow.module.css';

export default function CaseFlow({caseId,revision,canStart,canTransition,caseRecord={}}:{caseId:number;revision:number;canStart:boolean;canTransition:boolean;caseRecord?:{court_name?:string|null;case_number?:string|null}}){
 const {tr,locale}=useCaseDetailText();
 const [data,setData]=useState<FlowData|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const courtRecorded=hasCourtRecord(caseRecord);
 const [datedCourtEvent,setDatedCourtEvent]=useState(false);
 const [view,setView]=useState(false),[editor,setEditor]=useState<FlowAction|null>(null);
 useEffect(()=>{let live=true;void(async()=>{try{
  const r=await supabase.rpc('case101_read',{p_case_id:caseId});if(r.error)throw r.error;
  const value=r.data as FlowData;let datedEvent=false;
  // An existing filing/hearing date is evidence even when the court/number fields are blank.
  // Read only presence, including completed/past appointments; never infer a filing method.
  if(!value.instance&&!courtRecorded){const events=await supabase.from('case_timeline').select('id').eq('case_id',caseId).is('deleted_at',null).in('event_type',['filing','hearing']).not('event_date','is',null).limit(1);if(events.error)throw events.error;datedEvent=!!events.data?.length;}
  if(live){setDatedCourtEvent(datedEvent);setData(value);setFailed(false);}
 }catch{if(live)setFailed(true);}})();return()=>{live=false;};},[caseId,revision,reload,courtRecorded]);
 if(failed)return <p role="alert" className={base.notice}>{tr('Could not load case flow.')} <button onClick={()=>setReload(n=>n+1)}>{tr('Reload')}</button></p>;
 if(!data)return null;
 const i=data.instance,stage=data.stages.find(s=>s.stage_key===i?.current_stage);
 const edit=(action:FlowAction)=>{setView(false);setEditor(action);};
 return <section className={css.card} aria-label={tr('Case procedure')}>
  <div className={css.heading}><Route size={20}/><div><h2>{tr('Case procedure')}</h2><p>{tr('Civil / Ordinary / Plaintiff')}{i&&<> · {tr('filing.'+i.filing_method)}</>}</p></div></div>
  {i?<><div className={css.current}><span>{tr('Current stage')}</span><strong>{flowStageTitle(stage,locale)}</strong>{i.lifecycle!=='active'&&<small>{tr('flow.'+i.lifecycle)}</small>}</div><button className={base.secondary} onClick={()=>setView(true)}>{tr('View case flow')}</button></>:<div className={css.empty}><p>{tr('No case flow recorded. Existing case history stays unchanged.')}</p>{canStart&&<button className={base.secondary} onClick={()=>edit('start')}>{tr('Start flow from current state')}</button>}</div>}
  {view&&i&&<CaseEditModal title={tr('Case flow')} className={css.viewer} onClose={()=>setView(false)}><FlowView data={data} canTransition={canTransition} onEdit={edit}/></CaseEditModal>}
  {editor&&<FlowEditor action={editor} data={data} caseId={caseId} requiresFilingMethod={courtRecorded||datedCourtEvent} onClose={()=>setEditor(null)} onSaved={value=>{setData(value);setEditor(null);setView(true);window.dispatchEvent(new Event('case-detail-updated'));}}/>}
 </section>;
}

function FlowView({data,canTransition,onEdit}:{data:FlowData;canTransition:boolean;onEdit:(a:FlowAction)=>void}){
 const {tr,date,locale}=useCaseDetailText();const [all,setAll]=useState(false);const i=data.instance!;
 const stageName=(key:string|null)=>data.stages.find(s=>s.stage_key===key)?.[locale==='th'?'title_th':'title_en']||tr('Flow starting point');
 return <div className={css.body}>
  <p className={css.meta}>{tr('Civil / Ordinary / Plaintiff')} · {tr('filing.'+i.filing_method)} · {tr('Template version')} {data.template.version}</p>
  <div className={css.hint}><MapPin size={18}/><p>{tr('Flow starts at the recorded point. Earlier stages are not marked complete.')}<br/>{tr(i.start_kind==='cut_in'?'Started from current state':'New flow recorded')} · {date(i.started_at,true)}</p></div>
  <ol className={css.stages}>{data.stages.map(s=>{const evidence=stageEvidence(data,s.stage_key);return <li key={s.stage_key} data-evidence={evidence} aria-current={evidence==='current'?'step':undefined}><span className={css.number}>{s.ordinal}</span><div><strong>{flowStageTitle(s,locale)}</strong><small>{tr('flow.'+evidence)}</small></div></li>;})}</ol>
  <div className={css.actions}>{canTransition&&<>{i.lifecycle==='active'&&<button className={base.primary} onClick={()=>onEdit('advance')}>{tr('Record next stage')}</button>}{i.lifecycle==='paused'&&<button className={base.primary} onClick={()=>onEdit('resume')}>{tr('Resume case flow')}</button>}<details><summary>{tr('Other flow actions')}</summary><div className={css.actions}>{i.lifecycle==='active'&&<button className={base.secondary} onClick={()=>onEdit('pause')}>{tr('Pause case flow')}</button>}{i.lifecycle!=='exited'&&<button className={base.secondary} onClick={()=>onEdit('exit')}>{tr('End this flow')}</button>}{data.history.length>0&&<button className={base.secondary} onClick={()=>onEdit('correct')}>{tr('Correct latest stage record')}</button>}</div></details></>}</div>
  <section className={css.history}><h3>{tr('Recent transitions')}</h3>{(all?data.history:data.history.slice(0,10)).map(e=><article key={e.id}><strong>{e.from_stage?stageName(e.from_stage)+' → ':''}{stageName(e.to_stage)}</strong><span>{tr(e.event_kind==='start'?'Flow starting point':e.event_kind==='correction'?'Controlled correction':'flow.code.'+e.transition_code)}</span>{e.reason&&<p>{e.reason}</p>}<small>{e.actor_name} · {date(e.occurred_at,true)}</small>{data.history.some(c=>c.corrects_id===e.id)&&<small>{tr('Corrected by a later record; original preserved.')}</small>}</article>)}{data.history.length>10&&<button className={base.coreTextButton} onClick={()=>setAll(!all)}>{tr(all?'Show recent history':'Show all history')}</button>}</section>
 </div>;
}

function FlowEditor({action,data,caseId,requiresFilingMethod=false,onClose,onSaved}:{action:FlowAction;data:FlowData;caseId:number;requiresFilingMethod?:boolean;onClose:()=>void;onSaved:(v:FlowData)=>void}){
 const {tr,locale}=useCaseDetailText();const i=data.instance;
 const [stage,setStage]=useState(action==='start'?'':action==='advance'?(data.stages.find(s=>s.ordinal===(data.stages.find(x=>x.stage_key===i?.current_stage)?.ordinal||0)+1)?.stage_key||i?.current_stage||''):i?.current_stage||'');
 const [filing,setFiling]=useState(requiresFilingMethod?'':'not_filed'),[reason,setReason]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [instanceId]=useState(()=>i?.id||crypto.randomUUID());const retry=useRef<{body:string;id:string}|null>(null),lock=useRef(false);
 const title=action==='start'?'Start flow from current state':action==='correct'?'Correct latest stage record':action==='pause'?'Pause case flow':action==='resume'?'Resume case flow':action==='exit'?'End this flow':'Record next stage';
 const reasonRequired=needsFlowReason(data,action,stage);
 async function save(e:React.FormEvent){e.preventDefault();if(lock.current)return;if(action==='start'&&!validCutInFiling(filing,requiresFilingMethod)){setError('Choose the filing method before starting the flow.');return;}lock.current=true;setBusy(true);setError('');try{
  const payload=action==='start'?{stage,filing_method:filing,start_kind:'cut_in',acknowledged:ack}:{stage,reason:reason||null,...(action==='correct'?{corrects_id:data.history[0]?.id}:{})};
  const body=JSON.stringify(payload);if(retry.current?.body!==body)retry.current={body,id:crypto.randomUUID()};
  const r=await supabase.rpc('case101_save',{p_case_id:caseId,p_instance_id:instanceId,p_version:i?.version||0,p_request_id:retry.current!.id,p_action:action,p_data:payload});
  if(r.error){setError(flowError(r.error.message));return;}onSaved(r.data as FlowData);
 }catch{setError('Flow could not be saved. Please try again.');}finally{lock.current=false;setBusy(false);}}
 return <CaseEditModal title={tr(title)} className={css.editor} busy={busy} onClose={onClose}><form className={base.coreForm} onSubmit={save}><fieldset disabled={busy} className={css.fields}>
  {action==='start'&&<><label>{tr('Procedural variant')}<select value="ordinary" onChange={()=>{}}><option value="ordinary">{tr('Civil ordinary')}</option></select></label><label>{tr('Represented role')}<select value="plaintiff" onChange={()=>{}}><option value="plaintiff">{tr('Plaintiff')}</option></select></label><label>{tr('Filing method')}<select required value={filing} onChange={e=>setFiling(e.target.value)}>{requiresFilingMethod&&<option value="" disabled>{tr('Filing method not specified')}</option>}{FILING_METHODS.filter(m=>!requiresFilingMethod||m!=='not_filed').map(m=><option key={m} value={m}>{tr('filing.'+m)}</option>)}</select></label></>}
  {['start','advance','correct'].includes(action)?<label>{tr(action==='advance'?'Next stage':'Actual current stage')}<select required value={stage} onChange={e=>setStage(e.target.value)}><option value="">{tr('Choose the actual stage')}</option>{data.stages.map(s=><option key={s.stage_key} value={s.stage_key}>{flowStageTitle(s,locale)}</option>)}</select></label>:<p>{tr('Current stage')}: {flowStageTitle(data.stages.find(s=>s.stage_key===stage),locale)}</p>}
  {action==='start'?<><p className={css.hint}>{tr('Start a new flow from this stage. Only events from now onward will be recorded; no history is backfilled.')}</p><label className={css.check}><input type="checkbox" required checked={ack} onChange={e=>setAck(e.target.checked)}/>{tr('I confirm this is the actual current stage and recording starts here.')}</label></>:<><label>{tr(reasonRequired?'Reason for this change':'Notes (optional)')}<textarea required={reasonRequired} rows={3} maxLength={10000} value={reason} onChange={e=>setReason(e.target.value)}/></label>{action==='correct'&&<p className={css.hint}>{tr('This adds a correction to the latest record. The original history remains visible.')}</p>}{action==='exit'&&<p className={css.hint}>{tr('This ends only the flow. Legal case status and VP engagement stay unchanged.')}</p>}</>}
 </fieldset>{error&&<p role="alert" className={base.coreError}>{tr(error)}</p>}<footer className={base.coreFooter}><button type="button" disabled={busy} className={base.secondary} onClick={onClose}>{tr('Cancel')}</button><button disabled={busy} className={base.primary}>{tr(busy?'Saving...':'Save')}</button></footer></form></CaseEditModal>;
}
