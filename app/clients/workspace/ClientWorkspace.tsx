'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Building2,UserRound,BriefcaseBusiness,Scale,AlertCircle,Clock3,CalendarDays,ListTodo,StickyNote,Search,ArrowLeft,ChevronRight,RefreshCw} from 'lucide-react';
import {supabase} from '../../../lib/supabase';
import {useI18n} from '../../../lib/i18n/provider';
import {readClientDirectory,readClientWorkspace} from '../../../lib/client-workspace-read';
import {summarizeClient,workHref,type ClientRecord,type WorkspaceData,type WorkItem} from '../../../lib/client-workspace';
import {matterClosed} from '../../../lib/advisory-workflow';
import {Badge,useAdvisoryLabels} from '../../advisory/control/shared';
import {clientText,clientEnum,type ClientLabel} from './labels';
import css from './workspace.module.css';

export function ClientViewToggle({view,onChange}:{view:'matters'|'clients';onChange:(view:'matters'|'clients')=>void}){
 const {locale}=useI18n();return <div className={css.viewToggle} role="tablist" aria-label={clientText(locale,'view')}>{(['matters','clients'] as const).map(v=><button key={v} role="tab" aria-selected={view===v} onClick={()=>onChange(v)}>{v==='matters'?<BriefcaseBusiness size={17}/>:<Building2 size={17}/>} {clientText(locale,v==='matters'?'matterView':'clientView')}</button>)}</div>;
}
export default function ClientWorkspace({initialClientId=''}:{initialClientId?:string}){
 const {locale}=useI18n(),t=(key:ClientLabel)=>clientText(locale,key);
 const [clients,setClients]=useState<ClientRecord[]>([]),[clientId,setClientId]=useState(initialClientId),[search,setSearch]=useState(''),[data,setData]=useState<WorkspaceData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const sequence=useRef(0);
 useEffect(()=>{const token=++sequence.current;let live=true;
  const load=async()=>{setLoading(true);setData(null);setError('');try{
   if(clientId){const result=await readClientWorkspace(supabase,clientId);if(live&&token===sequence.current)setData(result);}
   else{const result=await readClientDirectory(supabase);if(live&&token===sequence.current)setClients(result);}
  }catch(e){if(live&&token===sequence.current)setError(e instanceof Error&&e.message==='CLIENT_ACCESS_DENIED'?'denied':'unavailable');}
  finally{if(live&&token===sequence.current)setLoading(false);}};void load();return()=>{live=false;};
 },[clientId,refresh]);
 const current=!loading&&data?.client.id===clientId?data:null;
 return <section className={css.workspace} aria-busy={loading}><div className={css.workspaceToolbar}>{clientId?<button onClick={()=>setClientId('')}><ArrowLeft size={16}/>{t('back')}</button>:<h2>{t('choose')}</h2>}<button onClick={()=>setRefresh(x=>x+1)} disabled={loading}><RefreshCw size={15}/>{t('refresh')}</button></div>
 {loading?<p role="status" className={css.empty}>{t('loading')}</p>:error?<p role="alert" className={css.error}>{t(error as ClientLabel)}</p>:current?<ClientWorkspaceContent key={current.client.id} data={current}/>:!clientId?<><label className={css.search}><Search size={18}/><span>{t('search')}</span><input value={search} onChange={e=>setSearch(e.target.value)}/></label><div className={css.clientGrid}>{clients.filter(c=>[c.name,c.contact_name].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(c=><button className={css.clientCard} key={c.id} onClick={()=>setClientId(c.id)}><Building2 size={22}/><span><strong>{c.name}</strong><small>{c.contact_name||t('noContact')}</small></span><ChevronRight size={18}/></button>)}</div>{!clients.some(c=>[c.name,c.contact_name].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))&&<p className={css.empty}>{t('emptyClients')}</p>}</>:null}</section>;
}
function WorkRows({items,empty}:{items:WorkItem[];empty:ClientLabel}){
 const {locale,date}=useI18n(),t=(key:ClientLabel)=>clientText(locale,key),[expanded,setExpanded]=useState(false);
 return !items.length?<p className={css.empty}>{t(empty)}</p>:<><ul className={css.rows}>{(expanded?items:items.slice(0,5)).map(item=><li key={item.key} data-overdue={item.overdueDays>0}><Link href={item.ref.href}><span className={css.workSource}>{item.ref.code}</span><strong>{item.title?(item.systemTitle?clientEnum(locale,item.title):item.title):t(item.kind)}</strong><small>{t(item.kind)} · {date(item.due)}</small></Link><span className={css.due}>{item.overdueDays>0?<>{t('overdue')} {item.overdueDays} {t('days')}</>:item.highPriority?t('priority'):date(item.due)}</span></li>)}</ul>{items.length>5&&<button className={css.more} onClick={()=>setExpanded(x=>!x)}>{t(expanded?'showLess':'showAll')} ({items.length})</button>}</>;
}
export function ClientWorkspaceContent({data}:{data:WorkspaceData}){
 const {locale,date}=useI18n(),{label,a}=useAdvisoryLabels(),t=(key:ClientLabel)=>clientText(locale,key),s=summarizeClient(data),c=data.client;
 const [matterSearch,setMatterSearch]=useState(''),[caseSearch,setCaseSearch]=useState(''),[notesExpanded,setNotesExpanded]=useState(false);
 const match=(q:string,...parts:(string|null|undefined)[])=>parts.join(' ').toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
 const visibleMatters=s.matters.filter(m=>match(matterSearch,m.matter_no,m.title,m.lead_name)),visibleCases=s.cases?.filter(item=>match(caseSearch,item.file_no,item.title,item.court_name))||[];
 return <><header className={css.clientHeader}><div className={css.clientIdentity}><span className={css.clientIcon}><Building2 size={30}/></span><div><small>{t('overview')}</small><h2>{c.name}</h2><span className={css.clientStatus}>{clientEnum(locale,c.status)}</span></div></div><div className={css.identityDetails}><div><small>{t('type')}</small><strong>{clientEnum(locale,c.client_type)}</strong>{c.address&&<p>{c.address}</p>}</div><div className={css.contact}><UserRound size={23}/><div><small>{t('contact')}</small><strong>{c.contact_name||t('noContact')}</strong>{c.phone&&<span>{c.phone}</span>}{c.email&&<span>{c.email}</span>}</div></div></div></header>
 <p className={css.scopeHint}>{t('scopeHint')}</p>
 <div className={css.summary}>{[{key:'openMatters',value:s.openMatters,icon:BriefcaseBusiness,tone:'blue'},{key:'openCases',value:s.openCases??'—',icon:Scale,tone:'blue'},{key:'urgent',value:s.urgent.length,icon:AlertCircle,tone:'red'},{key:'latest',value:date(s.latest,true),icon:Clock3,tone:'amber'}].map(({key,value,icon:Icon,tone})=><article key={key} data-tone={tone}><Icon size={24}/><div><strong>{value}</strong><span>{t(key as ClientLabel)}</span></div></article>)}</div>
 <div className={css.columns}><div className={css.mainColumn}>
 <section className={css.panel}><div className={css.panelHeading}><h2><BriefcaseBusiness size={20}/>{t('matters')} <small>({s.matters.length})</small></h2></div><label className={css.search}><Search size={15}/><span>{a('search')}</span><input value={matterSearch} onChange={e=>setMatterSearch(e.target.value)}/></label>
 {!visibleMatters.length?<p className={css.empty}>{t(s.matters.length?'noMatches':'emptyMatters')}</p>:<div className={css.workTable}><div className={css.tableHeading}><span>{t('number')} / {t('title')}</span><span>{t('lead')} / {t('stage')}</span><span>{t('next')} / {t('due')}</span><span>{t('status')}</span></div>{visibleMatters.map(m=>{const next=s.actions.find(x=>x.ref.kind==='advisory'&&x.ref.id===m.id&&(m.next_task_id?x.key==='advisory:task:'+m.next_task_id:x.kind==='next_action'));return <article className={css.workRow} key={m.id}><Link href={workHref('advisory',m.id)}><strong>{m.matter_no}</strong><span>{m.title}</span></Link><div><span>{m.lead_name||t('unset')}</span><small>{matterClosed(m)?label(m.status):m.stage_key?label(m.stage_key):a('unset')}</small></div><div><span>{next?.title||'—'}</span><small data-danger={!!next?.overdueDays}>{date(next?.due)}</small></div><Badge kind="lifecycle" value={m.status}/></article>;})}</div>}
 </section>
 <section className={css.panel}><div className={css.panelHeading}><div><h2><Scale size={20}/>{t('cases')} <small>({s.cases?.length??'—'})</small></h2><p>{t('readOnly')}</p></div></div>{s.cases===null?<p className={css.empty}>{t('caseDenied')}</p>:!s.cases.length?<p className={css.empty}>{t('emptyCases')}</p>:<><label className={css.search}><Search size={15}/><span>{t('number')} / {t('title')}</span><input value={caseSearch} onChange={e=>setCaseSearch(e.target.value)}/></label>{!visibleCases.length&&<p className={css.empty}>{t('noMatches')}</p>}<div className={css.workTable}><div className={css.tableHeading}><span>{t('number')} / {t('title')}</span><span>{t('court')} / {t('lead')}</span><span>{t('due')}</span><span>{t('status')}</span></div>{visibleCases.map(item=>{const next=[...s.urgent,...s.upcoming].find(x=>x.ref.kind==='case'&&x.ref.id===String(item.id));return <article className={css.workRow} key={item.id}><Link href={workHref('case',item.id)}><strong>{item.file_no||'—'}</strong><span>{item.title||'—'}</span></Link><div><span>{item.court_name||'—'}</span><small>{item.owner_name||t('unset')}</small></div><span data-danger={!!next?.overdueDays}>{date(next?.due)}</span><span className={css.lifecycle} data-status={item.status?.toLowerCase()}>{item.status?.toLowerCase()==='active'?t('open'):clientEnum(locale,item.status)}</span></article>;})}</div></>}
 </section>
 <details className={css.activity}><summary><Clock3 size={17}/>{t('activity')}</summary>{s.activities.length?<ul className={css.rows}>{s.activities.slice(0,5).map(item=><li key={item.id}><Link href={workHref('advisory',item.matter_id)}><strong>{label(item.kind)}</strong><small>{s.matters.find(m=>m.id===item.matter_id)?.matter_no} · {date(item.occurred_at,true)}</small></Link></li>)}</ul>:<p className={css.empty}>{t('emptyActivity')}</p>}</details>
 </div><aside className={css.sideColumn}>
 <section className={css.panel} data-tone="red"><h2><AlertCircle size={20}/>{t('urgent')} <small>({s.urgent.length})</small></h2><WorkRows items={s.urgent} empty="emptyUrgent"/></section>
 <section className={css.panel} data-tone="blue"><h2><ListTodo size={20}/>{t('actions')} <small>({s.actions.length})</small></h2><WorkRows items={s.actions} empty="emptyActions"/></section>
 <section className={css.panel} data-tone="amber"><h2><CalendarDays size={20}/>{t('upcoming')} <small>({s.upcoming.length})</small></h2><p className={css.caption}>{t('upcomingHint')}</p><WorkRows items={s.upcoming} empty="emptyUpcoming"/></section>
 <section className={css.panel}><h2><StickyNote size={20}/>{t('notes')}</h2>{c.note&&<div className={css.clientNote}><small>{t('clientNote')}</small><p>{c.note}</p></div>}{!c.note&&!s.notes.length?<p className={css.empty}>{t('emptyNotes')}</p>:<ul className={css.rows}>{(notesExpanded?s.notes:s.notes.slice(0,3)).map(note=><li key={note.key}><Link href={note.ref.href}><p className={css.noteText}>{note.text}</p><small>{note.ref.code} · {date(note.date)}</small></Link></li>)}</ul>}{s.notes.length>3&&<button className={css.more} onClick={()=>setNotesExpanded(x=>!x)}>{t(notesExpanded?'showLess':'showAll')} ({s.notes.length})</button>}</section>
 </aside></div></>;
}
