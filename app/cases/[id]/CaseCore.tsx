"use client";
import { useEffect, useState } from 'react';
import { UsersRound, ListTodo } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SearchableCombobox } from '../../finance/expenses/searchable-combobox';
import CaseEditModal from './CaseEditModal';
import CaseSummary from './CaseSummary';
import { useCaseDetailText } from './labels';
import { coreError, linkedTaskAvailable, personLabel, primaryAction, TEAM_ROLES, WORK_STATES, type CoreData, type TeamRole } from './core-model';
import css from './case-detail.module.css';

export default function CaseCore({caseId,revision,canManage,canNext,onSection}:{caseId:number;revision:number;canManage:boolean;canNext:boolean;onSection:(section:string)=>void}) {
 const {tr,date}=useCaseDetailText();
 const [data,setData]=useState<CoreData|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const [editing,setEditing]=useState<'team'|'next'|'work'|null>(null);
 useEffect(()=>{let current=true;const load=async()=>{const r=await supabase.rpc('case098_read',{p_case_id:caseId});if(!current)return;setFailed(!!r.error);if(!r.error)setData(r.data as CoreData);};void load().catch(()=>{if(current)setFailed(true);});return()=>{current=false;};},[caseId,revision,reload]);
 const next=data?primaryAction(data):null;
 const nextTitle=next?.title?(next.linked?tr(next.title):next.title):tr('No primary next action');
 const work=data?.core?.work_state?tr(data.core.work_state):tr('Work state not recorded');
 return <>
  <CaseSummary caseId={caseId} revision={revision} onSection={onSection} coreSummary={{next:nextTitle,nextDetail:next?[next.assignee||tr('Unassigned'),next.due?date(next.due):tr('No Due Date')].join(' · '):'',work,onNext:()=>{if(canNext&&data&&!failed)setEditing('next');},onWork:()=>{if(canManage&&data&&!failed)setEditing('work');}}}/>
  {failed?<div role="alert" className={css.notice}>{tr('Could not load case data. Please refresh.')} <button type="button" onClick={()=>setReload(n=>n+1)}>{tr('Reload')}</button></div>:!data?<p role="status">{tr('Loading...')}</p>:<div className={css.coreGrid}>
   <section className={css.coreCard} aria-label={tr('Case team & accountability')}>
    <header><h2><UsersRound size={21}/>{tr('Case team & accountability')}</h2>{canManage&&<button className={css.secondary} onClick={()=>setEditing('team')}>{tr('Manage team')}</button>}</header>
    <dl className={css.coreRoles}>{TEAM_ROLES.map(role=>{const assignment=data.team.find(t=>t.team_role===role);return <div key={role}><dt>{tr('role.'+role)}</dt><dd>{data.people.find(p=>p.id===assignment?.person_id)?.name||tr('Unassigned')}</dd></div>;})}</dl>
    <div className={css.coreMembers}><strong>{tr('Additional team')}</strong><div>{data.team.filter(t=>t.team_role==='member').map(t=><span key={t.person_id}>{data.people.find(p=>p.id===t.person_id)?.name||t.person_id}</span>)}{!data.team.some(t=>t.team_role==='member')&&<p>{tr('No additional team members')}</p>}</div></div>
   </section>
   <section className={css.coreCard} aria-label={tr('Primary next action')}>
    <header><h2><ListTodo size={21}/>{tr('Primary next action')}</h2>{canNext&&<button className={css.secondary} onClick={()=>setEditing('next')}>{tr(next?'Edit primary next action':'Set primary next action')}</button>}</header>
    {next?<dl className={css.coreRoles}><div><dt>{tr('Action')}</dt><dd>{nextTitle}</dd></div><div><dt>{tr('Responsible person')}</dt><dd>{next.assignee||tr('Unassigned')}</dd></div><div><dt>{tr('Due date')}</dt><dd>{next.due?date(next.due):tr('No Due Date')}</dd></div></dl>:<p className={css.coreMuted}>{tr('No primary next action')}</p>}
    {data.core?.next_mode==='task'&&<p className={css.coreMuted}>{tr(next?'Linked to an existing task. Edit its details in Tasks.':'The linked task is completed or removed. Choose a new action when needed.')} <button className={css.coreTextButton} onClick={()=>onSection('tasks')}>{tr('View tasks')}</button></p>}
    <div className={css.coreWork}><div><small>{tr('Work state')}</small><strong>{work}</strong></div>{canManage&&<button className={css.secondary} onClick={()=>setEditing('work')}>{tr('Change work state')}</button>}</div>
   </section>
  </div>}
  {editing&&data&&<CoreEditor key={editing} mode={editing} data={data} caseId={caseId} onClose={()=>setEditing(null)} onSaved={value=>{setData(value);setEditing(null);window.dispatchEvent(new Event('case-detail-updated'));}}/>}
 </>;
}

function CoreEditor({mode,data,caseId,onClose,onSaved}:{mode:'team'|'next'|'work';data:CoreData;caseId:number;onClose:()=>void;onSaved:(data:CoreData)=>void}){
 const {tr,date}=useCaseDetailText();const c=data.core;
 const [team,setTeam]=useState(data.team),[member,setMember]=useState('');
 const [nextMode,setNextMode]=useState(c?.next_mode||'none'),[task,setTask]=useState(c?.next_task_id||'');
 const [title,setTitle]=useState(c?.next_title||''),[assignee,setAssignee]=useState(c?.next_assignee_id||''),[due,setDue]=useState(c?.next_due||''),[work,setWork]=useState(c?.work_state||'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const person=(id:string,value:string,onChange:(id:string)=>void,original?:string)=> <div className={css.coreField}><label htmlFor={id}>{tr(id)}</label><SearchableCombobox id={id} label={tr(id)} placeholder={tr('Search people')} disabled={busy} value={value} onChange={onChange} options={[{value:'',label:{th:tr('Unassigned'),en:tr('Unassigned')}},...data.people.filter(p=>p.eligible||p.id===original).map(p=>({value:p.id,label:{th:personLabel(p),en:personLabel(p)},keywords:p.full_name||p.name}))]}/></div>;
 const setRole=(role:TeamRole,id:string)=>setTeam(prev=>[...prev.filter(t=>t.team_role!==role),...(id?[{person_id:id,team_role:role}]:[])]);
 const selected=data.tasks.find(t=>t.id===task);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const payload=mode==='team'?{assignments:team}:mode==='work'?{work_state:work||null}:nextMode==='none'?{mode:'none'}:nextMode==='task'?{mode:'task',task_id:task}:{mode:'manual',title,assignee_id:assignee||null,due:due||null};const r=await supabase.rpc('case098_save',{p_case_id:caseId,p_version:c?.version||0,p_section:mode,p_data:payload});if(r.error){setError(coreError(r.error.message));return;}onSaved(r.data as CoreData);}catch{setError('Core could not be saved. Please refresh and try again.');}finally{setBusy(false);}}
 return <CaseEditModal title={tr(mode==='team'?'Manage team':mode==='next'?'Primary next action':'Work state')} onClose={onClose} busy={busy}><form onSubmit={save} className={css.coreForm}>
  {mode==='team'&&<><p className={css.coreMuted}>{tr('One person can hold several roles. The lead and current actor are separate.')}</p><div className={css.coreFormGrid}>{TEAM_ROLES.map(role=><div key={role}>{person('role.'+role,team.find(t=>t.team_role===role)?.person_id||'',id=>setRole(role,id),data.team.find(t=>t.team_role===role)?.person_id)}</div>)}</div>{person('Additional team',member,id=>{setMember('');if(id&&!team.some(t=>t.team_role==='member'&&t.person_id===id))setTeam([...team,{person_id:id,team_role:'member'}]);})}<div className={css.coreChips}>{team.filter(t=>t.team_role==='member').map(t=><span key={t.person_id}>{data.people.find(p=>p.id===t.person_id)?.name||t.person_id}<button type="button" disabled={busy} aria-label={tr('Remove member')+' '+(data.people.find(p=>p.id===t.person_id)?.name||'')} onClick={()=>setTeam(team.filter(x=>x!==t))}>×</button></span>)}</div></>}
  {mode==='work'&&<><p className={css.coreMuted}>{tr('Work state describes current work, not a legal status or procedural stage.')}</p><label>{tr('Work state')}<select value={work} disabled={busy} onChange={e=>setWork(e.target.value)}><option value="">{tr('Work state not recorded')}</option>{WORK_STATES.map(w=><option key={w} value={w}>{tr(w)}</option>)}</select></label></>}
  {mode==='next'&&<><label>{tr('Action source')}<select disabled={busy} value={nextMode} onChange={e=>setNextMode(e.target.value as typeof nextMode)}><option value="none">{tr('No primary next action')}</option><option value="task">{tr('Link existing task')}</option><option value="manual">{tr('Record an action without creating a task')}</option></select></label>
   {nextMode==='manual'&&<><label>{tr('Action')}<input required maxLength={500} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>{person('Responsible person',assignee,setAssignee,c?.next_assignee_id||'')}<label>{tr('Due date')}<input type="date" value={due} disabled={busy} onChange={e=>setDue(e.target.value)}/></label></>}
   {nextMode==='task'&&<><label>{tr('Task')}<select required value={task} disabled={busy} onChange={e=>setTask(e.target.value)}><option value="">{tr('Choose an existing task')}</option>{data.tasks.filter(linkedTaskAvailable).map(t=><option key={t.id} value={t.id}>{t.task_type==='อื่นๆ'?t.task_other:tr(t.task_type)}</option>)}</select></label>{selected&&linkedTaskAvailable(selected)&&<div className={css.notice}><p>{tr('Responsible person')}: {selected.assignee_name||tr('Unassigned')}</p><p>{tr('Due date')}: {selected.due_date?date(selected.due_date):tr('No Due Date')}</p></div>}<p className={css.coreMuted}>{tr('Task facts stay in the existing task. Names are not matched to People automatically.')}</p></>}
  </>}
  {error&&<p role="alert" className={css.coreError}>{tr(error)}</p>}
  <footer className={css.coreFooter}><button className={css.secondary} type="button" disabled={busy} onClick={onClose}>{tr('Cancel')}</button><button className={css.primary} disabled={busy}>{tr(busy?'Saving...':'Save')}</button></footer>
 </form></CaseEditModal>;
}
