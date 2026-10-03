'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import AppTopNav from '../../components/AppTopNav';
import { supabase } from '../../../lib/supabase';
import { useAdvisoryLabels } from '../control/shared';
import { readLegacyDetail, readLegacyMatters, type ArchiveDetail, type ArchiveMatter, type ArchiveRow, type ArchiveSection } from '../../../lib/advisory-legacy-archive';
import { archiveLabels, fieldLabels, legacyValueLabels, recordFields, type ArchiveLabel } from './labels';
import css from './archive.module.css';

type View = 'list' | 'matter' | 'issue';
type State = { loading?: boolean; error?: boolean; matters?: ArchiveMatter[]; detail?: ArchiveDetail | null };
const matterFields = ['matter_no','matter_type','status','responsible_lawyer','start_date','end_date','retainer_type','monthly_retainer_amount','scope_of_work','note'];
const timestamps = ['created_at','updated_at','deleted_at','deleted_by'];
function text(value: unknown) { return value === null || value === undefined ? '' : String(value); }
function matches(row: ArchiveRow, search: string) {
  return !search || Object.values(row).some(v => typeof v === 'string' && v.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
}

export default function LegacyArchive({ view = 'list' }: { view?: View }) {
  const params = useParams(), matterId = text(params?.id), issueId = text(params?.issueId);
  const { a: advisory, locale, label } = useAdvisoryLabels();
  const a = (key: ArchiveLabel) => archiveLabels[key][locale === 'th' ? 0 : 1];
  const [state, setState] = useState<State>({ loading: true });
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [limit, setLimit] = useState(30);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => { setState({ loading: true }); setRevision(n => n + 1); }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const next = view === 'list' ? { matters: await readLegacyMatters(supabase) } : { detail: await readLegacyDetail(supabase, matterId) };
        if (live) setState(next);
      } catch { if (live) setState({ error: true }); }
    })();
    return () => { live = false; };
  }, [view, matterId, revision]);
  const matters = (state.matters || []).filter(m => (!status || m.status === status) && (matches(m, search) || text(m.client?.name).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  const detail = state.detail, issue = detail?.records.issues.find(i => i.id === issueId);
  return <AuthGuard><main className={css.page} data-legacy-archive={view}>
    <AppTopNav title={advisory('title')} activePage="advisory" />
    <div className={css.links}><Link href="/advisory">← {a('current')}</Link>{view !== 'list' && <Link href="/advisory/records">{a('list')}</Link>}</div>
    <header className={css.banner}><h1>{a('title')}</h1><p>{a('note')}</p><small>{a('scope')}</small></header>
    {state.loading ? <p role="status" className={css.empty}>{a('loading')}</p> : state.error ? <p role="alert" className={css.error}>{a('error')} <button type="button" onClick={reload}>{a('retry')}</button></p> : view === 'list' ? <>
      <div className={css.filters}><label>{a('search')}<input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(30); }}/></label><label>{a('status')}<select value={status} onChange={e => { setStatus(e.target.value); setLimit(30); }}><option value="">{a('all')}</option>{Array.from(new Set((state.matters || []).map(m => m.status))).sort().map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label></div>
      <p className={css.muted}>{matters.length} {a('records')}</p>
      <ul className={css.list}>{matters.slice(0, limit).map(m => <li key={m.id}><Link className={css.matter} href={`/advisory/${m.id}/records`}><div className={css.row}><strong>{m.matter_no}</strong><span className={css.badge}>{label(m.status)}</span></div><h2>{m.title}</h2><p>{m.client?.name || '—'}</p><small>{label(m.matter_type as string)} · {text(m.responsible_lawyer) || '—'}</small></Link></li>)}</ul>
      {!matters.length && <p className={css.empty}>{a('empty')}</p>}{matters.length > limit && <button onClick={() => setLimit(n => n + 30)}>{a('more')}</button>}
    </> : !detail ? <p className={css.notice}>{a('unavailable')}</p> : view === 'issue' && !issue ? <p className={css.notice}>{a('issueUnavailable')}</p> : <>
      <section className={css.panel}><h2>{detail.matter.matter_no} · {detail.matter.title}</h2><p>{detail.matter.client?.name || '—'}</p><Fields row={detail.matter} fields={matterFields}/></section>
      {view === 'issue' && issue && <section className={css.panel}><div className={css.links}><Link href={`/advisory/${matterId}/records`}>← {a('list')}</Link></div><h2>{text(issue.issue_no)} · {text(issue.title)}</h2><Fields row={issue} fields={[...recordFields.issues, ...timestamps]}/></section>}
      <div className={css.filters}><label>{a('searchRecords')}<input type="search" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
      {(Object.keys(recordFields) as ArchiveSection[]).filter(s => view !== 'issue' || s !== 'issues').map(section => <Records key={section} section={section} matterId={matterId} rows={detail.records[section].filter(r => (view !== 'issue' || r.advisory_issue_id === issueId) && matches(r, search))}/>) }
      <section className={css.panel}><details><summary>{a('history')} <span className={css.count}>({detail.history.length})</span></summary>{detail.historyUnavailable ? <p className={css.notice}>{a('historyUnavailable')}</p> : !detail.history.length ? <p className={css.empty}>{a('empty')}</p> : detail.history.map(row => <article className={css.record} key={row.id}><Fields row={row} fields={['created_at','user_name','action','note']}/><details><summary>{a('details')}</summary><Fields row={row} fields={['old_data','new_data']}/></details></article>)}</details></section>
    </>}
  </main></AuthGuard>;
}
function Fields({ row, fields }: { row: ArchiveRow; fields: readonly string[] }) {
  const { locale, label, date } = useAdvisoryLabels();
  function value(key: string, v: unknown) {
    if (typeof v === 'boolean') return locale === 'th' ? v ? 'ใช่' : 'ไม่ใช่' : v ? 'Yes' : 'No';
    if (typeof v === 'object') return <pre>{JSON.stringify(v, null, 2)}</pre>;
    if (key.endsWith('_at') || key.endsWith('_date')) return date(text(v), key.endsWith('_at'));
    if (['status','matter_type','issue_type','priority','task_type','retainer_type','channel','work_type','action'].includes(key)) return legacyValueLabels[text(v)]?.[locale === 'th' ? 0 : 1] || label(text(v));
    return text(v);
  }
  return <dl className={css.fields}>{fields.filter(key => row[key] !== undefined && row[key] !== null && row[key] !== '').map(key => <div key={key}><dt>{fieldLabels[key]?.[locale === 'th' ? 0 : 1] || key}</dt><dd>{value(key, row[key])}</dd></div>)}</dl>;
}
function Records({ section, rows, matterId }: { section: ArchiveSection; rows: ArchiveRow[]; matterId: string }) {
  const { locale } = useAdvisoryLabels(), [limit, setLimit] = useState(20);
  const a = (key: ArchiveLabel) => archiveLabels[key][locale === 'th' ? 0 : 1];
  return <section className={css.panel} id={section}><h2>{a(section)} <span className={css.count}>({rows.length})</span></h2>{!rows.length ? <p className={css.empty}>{a('empty')}</p> : rows.slice(0, limit).map(row => <article className={css.record} key={row.id}>
    <div className={css.row}><h3>{text(row.title || (section === 'time' ? row.note : row.question)) || a(section)}</h3>{!!row.deleted_at && <span className={css.badge}>{a('deleted')}</span>}</div>
    <Fields row={row} fields={recordFields[section]}/>
    <details><summary>{a('details')}</summary><Fields row={row} fields={[...timestamps,'assignee_user_id','stage_id','advisory_issue_id','created_by_name']}/></details>
    {section === 'issues' && <div className={css.links}><Link href={`/advisory/${matterId}/issues/${row.id}`}>{a('details')} →</Link></div>}
  </article>)}{rows.length > limit && <button onClick={() => setLimit(n => n + 20)}>{a('more')}</button>}</section>;
}
