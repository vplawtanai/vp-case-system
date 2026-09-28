"use client";

import Link from 'next/link';
import { ArrowUpRight, Building2 } from 'lucide-react';
import type { Matter } from '../../../lib/advisory-control';
import { Badge, useAdvisoryLabels, useControl } from './shared';
import css from './control.module.css';
import ui from './overview.module.css';

export default function OtherClientMatters({ matter }: { matter: Matter }) {
  const { a, label } = useAdvisoryLabels();
  // One bounded, permission-preserving read; no N+1 detail requests or direct joins.
  const { data, loading, error, reload } = useControl(undefined, JSON.stringify({ client_id: matter.client_id, limit: 6 }));
  const others = (data?.items || []).filter(item => item.id !== matter.id).slice(0, 5);
  return <section className={`${css.panel} ${css.clientMatters} ${ui.panel} ${ui.otherMatters}`} id="otherMatters">
    <div className={ui.panelHeading}><h2><Building2 size={19}/>{a('otherMatters')}</h2><Link href={`/advisory?client_id=${encodeURIComponent(matter.client_id)}`}>{a('viewAll')} →</Link></div>
    <Link className={css.clientHeading} href={`/clients/${matter.client_id}`}>{matter.client_name}<ArrowUpRight size={14} /></Link>
    {error ? <p role="alert" className={css.error}>{a('loadError')} <button onClick={reload}>{a('refresh')}</button></p> : loading ? <p className={css.empty}>{a('loading')}</p> : !others.length ? <p className={css.clientEmpty}>{a('noOtherMatters')}</p> : <ul className={css.clientMatterRows}>
      {others.map(item => <li key={item.id}><div className={css.clientMatterHeading}><Link href={`/advisory/${item.id}`}><strong>{item.matter_no}</strong><span>{item.title}</span></Link><Badge kind="lifecycle" value={item.status} /></div>
        <dl><div><dt>{a('stage')}</dt><dd>{item.stage_key ? label(item.stage_key) : a('unset')}</dd></div><div><dt>{a('lead')}</dt><dd>{item.lead_name || a('unassigned')}</dd></div><div><dt>{a('age')}</dt><dd>{a('days', { n: item.age_days })}</dd></div></dl>
        <Link className={css.quickOpen} href={`/advisory/${item.id}`}>{a('openMatter')}<ArrowUpRight size={14} /></Link>
      </li>)}
    </ul>}
  </section>;
}
