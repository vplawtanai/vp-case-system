"use client";

import { CalendarDays, Clock3, Timer, UserRound, Compass, ArrowRight } from 'lucide-react';
import type { Matter } from '../../../lib/advisory-control';
import { Badge, useAdvisoryLabels } from './shared';
import type { EditRequest } from './MatterEditor';
import css from './control.module.css';

export default function MatterOverview({ matter, canEdit, onEdit }: { matter: Matter; canEdit: boolean; onEdit: (request: EditRequest) => void }) {
  const { a, label, date } = useAdvisoryLabels();
  const editable = canEdit && !matter.closed_at;
  const facts = [
    { key: 'actor', Icon: UserRound, value: matter.next_owner_name || a('unassigned') },
    { key: 'due', Icon: CalendarDays, value: date(matter.next_due) },
    { key: 'stageDays', Icon: Clock3, value: matter.stage_days === null ? '—' : a('days', { n: matter.stage_days }) },
    { key: 'age', Icon: Timer, value: a('days', { n: matter.age_days }) },
  ];
  return <section className={css.matterOverview} aria-label={a('controlOverview')}>
    <div className={css.overviewTop}>
      <div className={css.currentStage}>
        <Compass size={25} /><span>{a('stage')}</span><h2>{matter.closed_at ? a('finished') : matter.stage_key ? label(matter.stage_key) : a('unset')}</h2>
        <div className={css.workStateLine}><span>{a('state')}</span><Badge value={matter.work_state || matter.status} />{editable && <button type="button" className={css.textButton} onClick={() => onEdit({ action: 'work_state', title: a('state'), values: { state: matter.work_state || 'working' } })}>{a('edit')}</button>}</div>
      </div>
      <section className={css.overviewNext} id="next-action">
        <div className={css.sectionHeading}><h2><ArrowRight size={17} />{a('next')}</h2>{editable && <button type="button" className={css.textButton} onClick={() => onEdit({ action: 'next_action', title: a('standalone'), values: { title: matter.next_task_id ? '' : matter.next_action, owner_id: matter.next_task_id ? '' : matter.next_owner_id, due_date: matter.next_task_id ? '' : matter.next_due } })}>{a('edit')}</button>}</div>
        <strong>{matter.next_action || a('noNext')}</strong><p>{a('nextActionHint')}</p>
      </section>
    </div>
    <dl className={css.overviewFacts}>{facts.map(({ key, Icon, value }) => <div key={key}><Icon size={18} /><div><dt>{a(key)}</dt><dd>{value}</dd></div></div>)}</dl>
  </section>;
}
