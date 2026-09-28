"use client";
import {useState,type FormEvent} from 'react';
import {Users,Plus,UserRound} from 'lucide-react';
import DetailModal from '../../components/DetailModal';
import {SearchableCombobox} from '../../finance/expenses/searchable-combobox';
import type {Matter,Person} from '../../../lib/advisory-control';
import {matterClosed,teamConflict,type TeamMember} from '../../../lib/advisory-workflow';
import {Badge,useAdvisoryLabels} from './shared';
import {useMatterWrite} from './workflow-shared';
import css from './control.module.css';
import ui from './overview.module.css';
type TeamEdit={mode:'add'|'edit'|'remove';member?:TeamMember;role?:string};
export default function MatterTeam({matter,team,people,canEdit,onSaved}:{matter:Matter;team:TeamMember[];people:Person[];canEdit:boolean;onSaved:()=>Promise<void>}){const {a}=useAdvisoryLabels();const [edit,setEdit]=useState<TeamEdit|null>(null);const editable=canEdit&&!matterClosed(matter);
 return <section className={`${css.panel} ${ui.panel}`}><div className={ui.panelHeading}><h2><Users size={19}/>{a('team')} <small>({team.length})</small></h2>{editable&&<button className={css.textButton} onClick={()=>setEdit({mode:'add'})}><Plus size={15}/>{a('addMember')}</button>}</div>
 <ul className={ui.teamRows}>{team.map(t=><li key={t.user_id+t.team_role}><UserRound size={19}/><strong>{t.name}</strong><Badge value={t.team_role}/>{editable&&<div className={css.rowActions}>{t.team_role!=='lead'?<><button className={css.textButton} onClick={()=>setEdit({mode:'edit',member:t})}>{a('editRole')}</button><button className={css.textButton} onClick={()=>setEdit({mode:'remove',member:t})}>{a('remove')}</button></>:<button className={css.textButton} onClick={()=>setEdit({mode:'add',role:'lead'})}>{a('replaceLead')}</button>}</div>}</li>)}</ul>
 {!team.length&&<div className={ui.teamEmpty}><UserRound size={20}/><div><strong>{a('noAssignedTeam')}</strong>{matter.responsible_lawyer&&<small>{a('legacyPerson',{name:matter.responsible_lawyer})}</small>}</div></div>}
 {edit&&<TeamDialog key={JSON.stringify(edit)} edit={edit} matter={matter} team={team} people={people} onClose={()=>setEdit(null)} onSaved={onSaved}/>}</section>;
}
function TeamDialog({edit,matter,team,people,onClose,onSaved}:{edit:TeamEdit;matter:Matter;team:TeamMember[];people:Person[];onClose:()=>void;onSaved:()=>Promise<void>}){
 const {a,label}=useAdvisoryLabels(),{write,busy,error}=useMatterWrite(matter);const [person,setPerson]=useState(edit.member?.user_id||''),[role,setRole]=useState(edit.role||edit.member?.team_role||'co_work'),[replace,setReplace]=useState(false);
 const pool=role==='lead'?people.filter(p=>['admin','partner','lawyer','assistant_lawyer'].includes(p.role)):people;
 const existingLead=team.find(t=>t.team_role==='lead'&&t.user_id!==person),duplicate=teamConflict(team,person,role,edit.mode==='edit'?edit.member?.team_role:undefined);
 const disabled=edit.mode==='remove'?edit.member?.team_role==='lead':!pool.some(p=>p.id===person)||duplicate||edit.mode==='edit'&&role===edit.member?.team_role||role==='lead'&&!!existingLead&&(edit.mode==='edit'||!replace);
 async function submit(e:FormEvent){e.preventDefault();if(disabled||busy)return;const result=await write(edit.mode==='edit'?'team_edit':'team',{user_id:person,role,...(edit.mode==='edit'?{previous_role:edit.member!.team_role}:edit.mode==='remove'?{remove:true}:{})});if(result){await onSaved();onClose();}}
 return <DetailModal open size="edit" title={a(edit.mode==='add'?'addMember':edit.mode==='edit'?'editRole':'remove')} onClose={()=>{if(!busy)onClose();}}><form className={css.form} onSubmit={submit}>
 {error&&<p role="alert" className={css.error}>{error}</p>}
 {edit.mode==='add'?<div className={css.wide}><label htmlFor="team-person">{a('selectPerson')}</label><SearchableCombobox id="team-person" value={person} options={pool.map(p=>({value:p.id,label:{th:p.staff_name||p.full_name,en:p.staff_name||p.full_name},keywords:p.full_name}))} disabled={busy} onChange={setPerson} label={a('selectPerson')} placeholder={a('searchPerson')} requiredMessage={a('requiredFields')}/></div>:<p className={css.notice}>{edit.member?.name} · {label(edit.member?.team_role)}</p>}
 {edit.mode==='remove'?<p className={css.wide}>{a('removeMemberHint')}</p>:<label>{a('role')}<select value={role} onChange={e=>{setRole(e.target.value);setReplace(false);}}>{['lead','co_work','assistant','qa'].map(r=><option key={r} value={r}>{label(r)}</option>)}</select></label>}
 {duplicate&&edit.mode!=='remove'&&<p role="alert" className={css.error}>{a('duplicateMember')}</p>}
 {role==='lead'&&existingLead&&edit.mode==='add'&&<label className={`${css.check} ${css.wide}`}><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>{a('replaceLeadConfirm',{name:existingLead.name})}</label>}
 {role==='lead'&&existingLead&&edit.mode==='edit'&&<p className={css.notice}>{a('leadExists')}</p>}
 <div className={css.formActions}><button type="button" onClick={onClose} disabled={busy}>{a('cancel')}</button><button type="submit" className={css.primary} disabled={busy||disabled}>{a(busy?'saving':edit.mode==='remove'?'remove':'save')}</button></div></form></DetailModal>;
}
