"use client";
import {useRef,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft,Plus,RefreshCw,House,ListTodo,List,FileCheck2,Clock3,Users,Database,Flag,UserRound} from 'lucide-react';
import AppTopNav from '../../components/AppTopNav';
import AuthGuard from '../../components/AuthGuard';
import {supabase} from '../../../lib/supabase';
import {errorKey} from '../../../lib/advisory-control';
import {Badge,useAdvisoryLabels,useControl,usePeople} from './shared';
import MatterEditor,{type EditRequest} from './MatterEditor';
import MatterSections from './MatterSections';
import MatterJourney from './MatterJourney';
import MatterOverview from './MatterOverview';
import OtherClientMatters from './OtherClientMatters';
import MatterTimeSummary from './MatterTimeSummary';
import css from './control.module.css';
import ui from './overview.module.css';
type DetailView='overview'|'tasks'|'activity'|'deliverables'|'time'|'team';
const views=[{key:'overview',Icon:House},{key:'tasks',Icon:ListTodo},{key:'activity',Icon:List},{key:'deliverables',Icon:FileCheck2},{key:'time',Icon:Clock3},{key:'team',Icon:Users}] as const;
export default function MatterDetail(){const params=useParams(),id=String(params.id);const {data,loading,error,reload}=useControl(id),people=usePeople(),{a,label,date}=useAdvisoryLabels();const [edit,setEdit]=useState<EditRequest|null>(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');const pending=useRef<{body:string;id:string}|null>(null);
 const [view,setView]=useState<DetailView>('overview'),[mapOpen,setMapOpen]=useState(false);
 const m=data?.items[0],permissions=data?.permissions;
 async function action(name:string,payload:Record<string,string>){if(!m||busy)return;setBusy(true);setActionError('');const body=JSON.stringify({name,payload,version:m.version});if(pending.current?.body!==body)pending.current={body,id:crypto.randomUUID()};try{const r=await supabase.rpc('advisory_control_write',{p_matter_id:id,p_action:name,p_payload:payload,p_request_id:pending.current.id,p_expected_version:m.version});if(r.error)throw r.error;pending.current=null;await reload();}catch(e){setActionError(a(errorKey(String((e as {message?:string})?.message||e))));}finally{setBusy(false);}}
 return <AuthGuard><main className={`${css.page} ${ui.page}`}><div className={css.shellHeader}><AppTopNav title={a('title')} activePage="advisory"/></div><Link className={css.back} href="/advisory"><ArrowLeft size={16}/>{a('back')}</Link>{(error||actionError)&&<p role="alert" className={css.error}>{actionError||a('loadError')} <button onClick={reload}>{a('refresh')}</button></p>}
 {!m?<p className={css.empty}>{a(loading?'loading':'empty')}</p>:<>
 <header className={ui.header}>
   <div><div className={css.headingLine}><h1>{m.title}</h1><Badge value={m.status}/></div><p><strong>{m.matter_no}</strong> · <Link href={'/clients/'+m.client_id}>{m.client_name}</Link></p></div>
   <div className={css.actions}><button onClick={reload}><RefreshCw size={15}/>{a('refresh')}</button>{permissions?.manage&&<button className={css.primary} onClick={()=>setEdit({action:m.closed_at?'reopen':'task_save',title:a(m.closed_at?'reopen':'addTask')})}><Plus size={16}/>{a(m.closed_at?'reopen':'addTask')}</button>}</div>
 </header>
 <div className={ui.metadata}><span>{a('type')}: <strong>{label(m.matter_type)}</strong></span><span>{a('lead')}: <strong>{m.lead_name||a('unassigned')}</strong></span></div>
 <nav className={ui.navigation} aria-label={a('matterSections')}>
   {views.map(({key,Icon})=><button key={key} type="button" aria-current={view===key?'page':undefined} onClick={()=>setView(key)}><Icon size={17}/>{a('tab.'+key)}</button>)}
   <Link href={`/advisory/${id}/records`}><Database size={17}/>{a('tab.records')}</Link>
 </nav>
 <div hidden={view!=='overview'}>
   <MatterOverview matter={m} canEdit={!!permissions?.manage} onEdit={setEdit} onOpenMap={()=>setMapOpen(true)}>
     {!!data?.state_history?.length&&<details className={ui.stateHistory}><summary>{a('stateHistory')}</summary><ul className={css.rows}>{data.state_history.map(h=><li key={h.started_at}><Badge value={h.work_state}/><span>{date(h.started_at,true)} → {h.ended_at?date(h.ended_at,true):a('current')}</span>{h.reason&&<p>{h.reason}</p>}</li>)}</ul></details>}
   </MatterOverview>
 </div>
 <div className={ui.contentGrid} data-focused={view!=='overview'}>
   <div className={ui.primaryColumn} hidden={!['overview','tasks','activity'].includes(view)}>
     <div id="tasks" hidden={view!=='overview'&&view!=='tasks'}><MatterSections overview focused={view==='tasks'} onFocus={()=>setView('tasks')} matter={m} section="tasks" canSetNext={!!permissions?.manage} canDelete={!!permissions?.delete} people={people} canEdit={!!permissions?.task} onEdit={setEdit} onAction={action} busy={busy}/></div>
     <div id="activity" hidden={view!=='overview'&&view!=='activity'}><MatterSections overview focused={view==='activity'} onFocus={()=>setView('activity')} matter={m} section="activity" people={people} canEdit={!!permissions?.manage} onEdit={setEdit} onAction={action} busy={busy}/></div>
     <div className={ui.journeySlot} hidden={view!=='overview'}><MatterJourney key={m.id} matter={m} stages={data?.stages||[]} canEdit={!!permissions?.manage} onEdit={setEdit} requestedOpen={mapOpen} onCloseMap={()=>setMapOpen(false)} compact/></div>
   </div>
   <div className={ui.secondaryColumn} hidden={!['overview','time','deliverables','team'].includes(view)}>
     <div id="time" hidden={view!=='overview'&&view!=='time'}><MatterTimeSummary matterId={id} time={data?.time}/></div>
     <div id="deliverables" hidden={view!=='overview'&&view!=='deliverables'}><MatterSections overview focused={view==='deliverables'} onFocus={()=>setView('deliverables')} matter={m} section="deliverables" people={people} canEdit={!!permissions?.manage} onEdit={setEdit} onAction={action} busy={busy}/></div>
     <section className={`${css.panel} ${ui.panel}`} id="team" hidden={view!=='overview'&&view!=='team'}>
       <div className={ui.panelHeading}><h2><Users size={19}/>{a('team')} <small>({data?.team?.length||0})</small></h2>{permissions?.manage&&!m.closed_at&&<button className={css.textButton} onClick={()=>setEdit({action:'team',title:a('team'),values:{role:'lead'}})}>{a('manageTeam')} →</button>}</div>
       <ul className={ui.teamRows}>{data?.team?.map(t=><li key={t.user_id+t.team_role}><UserRound size={19}/><strong>{t.name}</strong><Badge value={t.team_role}/>{permissions?.manage&&!m.closed_at&&<button className={css.textButton} onClick={()=>setEdit({action:'team',title:a('team'),values:{user_id:t.user_id,role:t.team_role,name:t.name}})}>{a('edit')}</button>}</li>)}</ul>
       {!data?.team?.length&&<div className={ui.teamEmpty}><UserRound size={20}/><div><strong>{a('noAssignedTeam')}</strong>{m.responsible_lawyer&&<small>{a('legacyPerson',{name:m.responsible_lawyer})}</small>}</div></div>}
     </section>
     <div hidden={view!=='overview'}><OtherClientMatters key={m.id} matter={m}/></div>
   </div>
 </div>
 <section className={ui.closing} hidden={view!=='overview'}>
   <div><Flag size={20}/><h2>{a(m.closed_at?'outcome':'closeMatter')}</h2></div>
   <div>{m.closed_at?<><p><Badge value={m.outcome}/> · {date(m.closed_at,true)}</p><p>{m.outcome_summary}</p><p>{m.follow_up}</p><p>{m.case_reference}</p></>:<p>{a('closingHint')}</p>}</div>
   {permissions?.manage&&<button onClick={()=>setEdit({action:m.closed_at?'reopen':'close',title:a(m.closed_at?'reopen':'closeMatter')})}>{a(m.closed_at?'reopen':'closeMatter')}</button>}
 </section>
 {edit&&<MatterEditor key={JSON.stringify(edit)} request={edit} matter={m} people={people} stages={data?.stages} onClose={()=>setEdit(null)} onSaved={reload}/>}
 </>}</main></AuthGuard>;
}
