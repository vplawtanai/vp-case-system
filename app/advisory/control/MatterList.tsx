"use client";
import {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {BriefcaseBusiness,Clock3,Users,CheckCircle2,Plus,Search} from 'lucide-react';
import AppTopNav from '../../components/AppTopNav';
import AuthGuard from '../../components/AuthGuard';
import {types,workStates} from '../../../lib/advisory-control';
import {Badge,Pagination,useAdvisoryLabels,useControl,usePeople} from './shared';
import MatterEditor,{type EditRequest} from './MatterEditor';
import css from './control.module.css';
export default function MatterList(){const {a,label,date}=useAdvisoryLabels(),people=usePeople();const searchParams=useSearchParams();const [filters,setFilters]=useState<Record<string,string>>(()=>({client_id:searchParams.get('client_id')||''})),[offset,setOffset]=useState(0),[edit,setEdit]=useState<EditRequest|null>(null);const {data,error,loading,reload}=useControl(undefined,JSON.stringify({...filters,offset}));
 function filter(key:string,value:string){setOffset(0);setFilters(f=>({...f,[key]:value}));}
 return <AuthGuard><main className={css.page}><div className={css.shellHeader}><AppTopNav title={a('title')} activePage="advisory"/></div><header className={css.pageHeader}><div><small>{a('title')}</small><h1>{a('title')}</h1><p>{a('subtitle')}</p></div><div className={css.actions}><Link href="/advisory/reports">{a('reports')}</Link><button onClick={reload}>{a('refresh')}</button>{data?.permissions.manage&&<button className={css.primary} onClick={()=>setEdit({action:'create',title:a('create')})}><Plus size={17}/>{a('create')}</button>}</div></header>
 {error?<p role="alert" className={css.error}>{a('loadError')}</p>:null}
 <div className={css.metrics}>{(['open','overdue','waiting','closed_week'] as const).map((key,i)=>{const Icon=[BriefcaseBusiness,Clock3,Users,CheckCircle2][i];return <article key={key} data-tone={i}><Icon/><div><strong>{data?data.summary[key]:'—'}</strong><span>{a(key)}</span></div></article>;})}</div>
 <div className={css.filters}><label className={css.search}><span><Search size={15}/>{a('search')}</span><input value={filters.search||''} onChange={e=>filter('search',e.target.value)}/></label>
 <label>{a('type')}<select value={filters.type||''} onChange={e=>filter('type',e.target.value)}><option value="">{a('all')}</option>{types.map(t=><option value={t} key={t}>{label(t)}</option>)}</select></label>
 <label>{a('lead')}<select value={filters.lead||''} onChange={e=>filter('lead',e.target.value)}><option value="">{a('all')}</option>{people.filter(p=>['admin','partner','lawyer','assistant_lawyer'].includes(p.role)).map(p=><option value={p.id} key={p.id}>{p.staff_name||p.full_name}</option>)}</select></label>
 <label>{a('state')}<select value={filters.state||''} onChange={e=>filter('state',e.target.value)}><option value="">{a('all')}</option>{workStates.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
 <label>{a('sort')}<select value={filters.sort||''} onChange={e=>filter('sort',e.target.value)}><option value="">{a('recent')}</option><option value="due">{a('due')}</option></select></label>
 <button onClick={()=>{setFilters({});setOffset(0);}}>{a('clear')}</button></div>
 {filters.client_id&&<p className={css.clientFilter}>{a('clientFilter')}: <strong>{data?.items[0]?.client_name||a('client')}</strong> <button className={css.textButton} onClick={()=>filter('client_id','')}>{a('clear')}</button></p>}
 <nav className={css.tabs} aria-label={a('status')}>{['all','mine','overdue','missing','closed'].map(k=><button key={k} aria-pressed={(filters.tab||'all')===k} onClick={()=>filter('tab',k)}>{a(k)}</button>)}</nav>
 <div className={css.tableWrap}><table className={css.table}><thead><tr>{['matterNo','matterTitle','client','type','lead','stage','actor','next','due','stageDays','age','status'].map(k=><th key={k}>{a(k)}</th>)}</tr></thead><tbody>{data?.items.map(m=><tr key={m.id}><td><Link href={'/advisory/'+m.id}>{m.matter_no}</Link></td><td className={css.titleCell}><Link href={'/advisory/'+m.id}>{m.title}</Link></td><td><button className={css.textButton} onClick={()=>filter('client_id',m.client_id)}>{m.client_name}</button></td><td>{label(m.matter_type)}</td><td>{m.lead_name||a('unassigned')}</td><td><span className={css.stagePill}>{m.closed_at?a('finished'):m.stage_key?label(m.stage_key):a('unset')}</span></td><td>{m.next_owner_name||'—'}</td><td>{m.next_action||'—'}</td><td>{date(m.next_due)}</td><td>{m.stage_days===null?'—':a('days',{n:m.stage_days})}</td><td>{a('days',{n:m.age_days})}</td><td><Badge kind="lifecycle" value={m.status}/></td></tr>)}</tbody></table></div>
 <div className={css.mobileList}>{data?.items.map(m=><Link key={m.id} href={'/advisory/'+m.id} className={css.mobileMatter}><div><strong>{m.matter_no}</strong><Badge kind="lifecycle" value={m.status}/></div><h2>{m.title}</h2><p>{m.client_name}</p><span>{a('lead')}: {m.lead_name||a('unassigned')}</span><p className={css.stagePill}>{m.closed_at?a('finished'):m.stage_key?label(m.stage_key):a('unset')}</p><p>{a('next')}: {m.next_action||'—'}</p><small>{a('due')}: {date(m.next_due)} · {a('age')}: {a('days',{n:m.age_days})}</small></Link>)}</div>
 {!data?.items.length&&!error&&<p className={css.empty}>{a(loading?'loading':'empty')}</p>}
 <Pagination offset={offset} total={data?.total||0} onChange={setOffset}/>
 <footer className={css.secondaryLinks}><Link href="/advisory/records">{a('registry')} →</Link></footer>
 {edit&&<MatterEditor request={edit} people={people} onClose={()=>setEdit(null)} onSaved={reload}/>}</main></AuthGuard>;
}
