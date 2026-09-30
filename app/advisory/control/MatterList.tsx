"use client";
import {Fragment,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {BriefcaseBusiness,Clock3,Users,CheckCircle2,Plus,Search,ChevronRight} from 'lucide-react';
import AppTopNav from '../../components/AppTopNav';
import AuthGuard from '../../components/AuthGuard';
import {types,workStates,type Matter} from '../../../lib/advisory-control';
import {OverdueIndicator,OverduePreview} from './MatterOverdue';
import {Badge,Pagination,useAdvisoryLabels,useControl,usePeople} from './shared';
import MatterEditor,{type EditRequest} from './MatterEditor';
import css from './control.module.css';
export default function MatterList(){const {a,label,date}=useAdvisoryLabels(),people=usePeople();const searchParams=useSearchParams();const [filters,setFilters]=useState<Record<string,string>>(()=>({client_id:searchParams.get('client_id')||''})),[offset,setOffset]=useState(0),[edit,setEdit]=useState<EditRequest|null>(null);const {data,error,loading,reload}=useControl(undefined,JSON.stringify({...filters,offset}));
 const [expandedOverdue,setExpandedOverdue]=useState<string|null>(null);
 const overdueTab=useRef<HTMLButtonElement>(null),listData=loading?null:data;
 function filter(key:string,value:string){setExpandedOverdue(null);setOffset(0);setFilters(f=>({...f,[key]:value}));}
 function showOverdue(){
  // The RPC summary covers all visible Matters, independently of list filters.
  // Use its existing overdue tab and remove narrowing filters; keep only sort.
  setFilters(f=>({tab:'overdue',sort:f.sort||''}));setOffset(0);setExpandedOverdue(null);
  overdueTab.current?.focus({preventScroll:true});overdueTab.current?.scrollIntoView({block:'nearest'});
 }
 function indicator(m:Matter,mode:string){return <OverdueIndicator matter={m} expanded={expandedOverdue===m.id} controls={`overdue-${mode}-${m.id}`} onToggle={()=>setExpandedOverdue(old=>old===m.id?null:m.id)}/>;}
 const matterCount=data?.summary.overdue,itemCount=data?.summary.overdue_items;
 const totalsKey=matterCount===1?(itemCount===1?'overdueTotalsOneItem':'overdueTotalsOneMatter'):'overdueTotals';
 return <AuthGuard><main className={css.page}><div className={css.shellHeader}><AppTopNav title={a('title')} activePage="advisory"/></div><header className={css.pageHeader}><div><small>{a('title')}</small><h1>{a('title')}</h1><p>{a('subtitle')}</p></div><div className={css.actions}><Link href="/advisory/reports">{a('reports')}</Link><button onClick={reload}>{a('refresh')}</button>{data?.permissions.manage&&<button className={css.primary} onClick={()=>setEdit({action:'create',title:a('create')})}><Plus size={17}/>{a('create')}</button>}</div></header>
 {error?<p role="alert" className={css.error}>{a('loadError')}</p>:null}
 <div className={css.metrics}>{(['open','overdue','waiting','closed_week'] as const).map((key,i)=>{const Icon=[BriefcaseBusiness,Clock3,Users,CheckCircle2][i],content=<><Icon aria-hidden="true"/><div>{key==='overdue'?<><span>{a(key)}</span><strong className={css.overdueTotals}>{a(totalsKey,{matters:matterCount??'—',items:itemCount??'—'})}</strong></>:<><strong>{data?data.summary[key]:'—'}</strong><span>{a(key)}</span></>}</div></>;return key==='overdue'?<button key={key} type="button" className={css.overdueMetric} data-tone={i} aria-pressed={filters.tab==='overdue'} aria-controls="advisory-results" disabled={loading||!data||error} onClick={showOverdue}>{content}<ChevronRight className={css.metricArrow} aria-hidden="true"/></button>:<article key={key} data-tone={i}>{content}</article>;})}</div>
 <div className={css.filters}><label className={css.search}><span><Search size={15}/>{a('search')}</span><input value={filters.search||''} onChange={e=>filter('search',e.target.value)}/></label>
 <label>{a('type')}<select value={filters.type||''} onChange={e=>filter('type',e.target.value)}><option value="">{a('all')}</option>{types.map(t=><option value={t} key={t}>{label(t)}</option>)}</select></label>
 <label>{a('lead')}<select value={filters.lead||''} onChange={e=>filter('lead',e.target.value)}><option value="">{a('all')}</option>{people.filter(p=>['admin','partner','lawyer','assistant_lawyer'].includes(p.role)).map(p=><option value={p.id} key={p.id}>{p.staff_name||p.full_name}</option>)}</select></label>
 <label>{a('state')}<select value={filters.state||''} onChange={e=>filter('state',e.target.value)}><option value="">{a('all')}</option>{workStates.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label>
 <label>{a('sort')}<select value={filters.sort||''} onChange={e=>filter('sort',e.target.value)}><option value="">{a('recent')}</option><option value="due">{a('due')}</option></select></label>
 <button onClick={()=>{setFilters({});setOffset(0);setExpandedOverdue(null);}}>{a('clear')}</button></div>
 {filters.client_id&&<p className={css.clientFilter}>{a('clientFilter')}: <strong>{data?.items[0]?.client_name||a('client')}</strong> <button className={css.textButton} onClick={()=>filter('client_id','')}>{a('clear')}</button></p>}
 <nav className={css.tabs} aria-label={a('status')}>{['all','mine','overdue','missing','closed'].map(k=><button key={k} ref={k==='overdue'?overdueTab:undefined} aria-pressed={(filters.tab||'all')===k} onClick={()=>k==='overdue'?showOverdue():filter('tab',k)}>{a(k)}</button>)}</nav>
 <div id="advisory-results" aria-busy={loading}>
 <div className={css.tableWrap}><table className={css.table}><thead><tr>{['matterNo','matterTitle','client','type','lead','stage','actor','next','due','stageDays','age','status'].map(k=><th key={k}>{a(k)}</th>)}</tr></thead><tbody>{listData?.items.map(m=><Fragment key={m.id}><tr data-overdue={m.has_overdue_work||undefined}><td><Link href={'/advisory/'+m.id}>{m.matter_no}</Link></td><td className={css.titleCell}><Link href={'/advisory/'+m.id}>{m.title}</Link>{indicator(m,'table')}</td><td><button className={css.textButton} onClick={()=>filter('client_id',m.client_id)}>{m.client_name}</button></td><td>{label(m.matter_type)}</td><td>{m.lead_name||a('unassigned')}</td><td><span className={css.stagePill}>{m.closed_at?a('finished'):m.stage_key?label(m.stage_key):a('unset')}</span></td><td>{m.next_owner_name||'—'}</td><td>{m.next_action||'—'}</td><td><span className={m.next_action_overdue_days?css.overdueDate:undefined}>{date(m.next_due)}</span></td><td>{m.stage_days===null?'—':a('days',{n:m.stage_days})}</td><td>{a('days',{n:m.age_days})}</td><td><Badge kind="lifecycle" value={m.status}/></td></tr>{m.has_overdue_work&&<tr id={`overdue-table-${m.id}`} className={css.overduePreviewRow} hidden={expandedOverdue!==m.id}><td colSpan={12}><OverduePreview matter={m}/></td></tr>}</Fragment>)}</tbody></table></div>
 <div className={css.mobileList}>{listData?.items.map(m=><article key={m.id} className={css.mobileMatter} data-overdue={m.has_overdue_work||undefined}>
 <Link href={'/advisory/'+m.id} className={css.mobileMatterLink}><div><strong>{m.matter_no}</strong><Badge kind="lifecycle" value={m.status}/></div><h2>{m.title}</h2><p>{m.client_name}</p><span>{a('lead')}: {m.lead_name||a('unassigned')}</span><p className={css.stagePill}>{m.closed_at?a('finished'):m.stage_key?label(m.stage_key):a('unset')}</p><p>{a('next')}: {m.next_action||'—'}</p><small><span className={m.next_action_overdue_days?css.overdueDate:undefined}>{a('due')}: {date(m.next_due)}</span> · {a('age')}: {a('days',{n:m.age_days})}</small></Link>
 {indicator(m,'mobile')}{m.has_overdue_work&&<div id={`overdue-mobile-${m.id}`} hidden={expandedOverdue!==m.id}><OverduePreview matter={m}/></div>}
 </article>)}</div>
 {!listData?.items.length&&!error&&<p className={css.empty} role="status">{a(loading?'loading':'empty')}</p>}
 <Pagination offset={offset} total={listData?.total||0} onChange={setOffset}/>
 </div>
 <footer className={css.secondaryLinks}><Link href="/advisory/records">{a('registry')} →</Link></footer>
 {edit&&<MatterEditor request={edit} people={people} onClose={()=>setEdit(null)} onSaved={reload}/>}</main></AuthGuard>;
}
