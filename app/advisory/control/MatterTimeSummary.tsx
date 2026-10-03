"use client";

import type { CSSProperties } from 'react';
import { Clock3, Info, Plus } from 'lucide-react';
import type { ControlRead } from '../../../lib/advisory-control';
import { useAdvisoryLabels } from './shared';
import css from './control.module.css';
import ui from './overview.module.css';

export default function MatterTimeSummary({ time, onDetails, onAdd }: { matterId: string; time: ControlRead['time']; onDetails?:()=>void; onAdd?:()=>void }) {
  const { a } = useAdvisoryLabels();
  const total = time?.minutes ?? 0;
  const duration = (minutes: number) => a('hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  return <section className={`${css.panel} ${ui.panel}`}>
    <div className={ui.panelHeading}><h2><Clock3 size={19}/>{a('time')}</h2><div className={ui.panelActions}>{onAdd&&<button className={css.textButton} onClick={onAdd}><Plus size={15}/>{a('addTime')}</button>}{onDetails?<button className={css.textButton} onClick={onDetails}>{a('details')} →</button>:null}</div></div>
    <div className={ui.timeSummary}>
      <div className={ui.timeRing} data-empty={total === 0} style={{ '--core-angle': total ? 360 * (time?.core ?? 0) / total + 'deg' : '0deg' } as CSSProperties}><div><strong>{a('minutes', { n: total })}</strong><small>{duration(total)}</small></div></div>
      <dl className={ui.timeLegend}>{(['core', 'support'] as const).map(key => <div key={key} data-kind={key}><dt>{a(key)}</dt><dd>{a('minutes', { n: time?.[key] ?? 0 })}<small>{duration(time?.[key] ?? 0)}</small></dd></div>)}</dl>
    </div>
    <div className={ui.timeNote}><Info size={15}/><div>{a('timeHint')}{!!time?.unclassified && <span>{a('unclassifiedCount', { n: time.unclassified })}</span>}</div></div>
  </section>;
}
