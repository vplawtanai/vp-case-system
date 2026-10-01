"use client";

import {matterClosed} from '../../../lib/advisory-workflow';
import type { ReactNode } from 'react';
import { CalendarDays, Clock3, Timer, UserRound, Compass, ArrowUpRight, Activity, ListTodo } from 'lucide-react';
import { workStates, type Matter, type Stage } from '../../../lib/advisory-control';
import { Badge, useAdvisoryLabels } from './shared';
import { OverdueDays } from './MatterOverdue';
import type { EditRequest } from './MatterEditor';
import css from './control.module.css';
import ui from './overview.module.css';

export default function MatterOverview({ matter, stages = [], canEdit, onEdit, onOpenMap, children }: { matter: Matter; stages?: Stage[]; canEdit: boolean; onEdit: (request: EditRequest) => void; onOpenMap?: () => void; children?: ReactNode }) {
  const { a, label, date } = useAdvisoryLabels();
  const editable = canEdit && !matterClosed(matter);
  // Lifecycle is deliberately not a fallback for Work State.
  const state = workStates.find(value => value === matter.work_state);
  const supporting = [
    { key: 'lead', Icon: UserRound, value: matter.lead_name || a('unassigned') },
    { key: 'stageDays', Icon: Clock3, value: matter.stage_days === null ? '—' : a('days', { n: matter.stage_days }) },
    { key: 'age', Icon: Timer, value: a('days', { n: matter.age_days }) },
  ];
  return <section className={ui.command} aria-labelledby="matter-control-title">
    <h2 id="matter-control-title" className={ui.commandTitle}><Compass size={18}/>{a('overviewControlTitle')}</h2>
    <div className={ui.commandGrid}>
      <div className={ui.stageBlock}>
        <Compass size={23}/><div><span className={ui.caption}>{a('stage')}</span><h3>{matter.stage_key ? label(matter.stage_key,matter.template_key) : a(stages.length?'noCurrentStage':'unset')}</h3>
        {!matter.stage_key && <p>{a(matterClosed(matter) ? 'unsetClosedStageHint' : stages.length?'noCurrentStageHint':'unsetStageHelp')}</p>}
        {matter.stage_key && <p>{a('compactJourneyHint')}</p>}
        <div className={ui.stageActions}>{editable && matter.stage_key && <button type="button" className={css.primary} onClick={()=>onEdit({action:'stage_complete',title:a('completeStage')})}>{a('completeStage')}</button>}
        {onOpenMap && <button type="button" className={matter.stage_key?css.textButton:css.primary} onClick={onOpenMap}>{a(!matter.stage_key && !stages.length && editable ? 'startStagePlan' : 'openMap')}<ArrowUpRight size={14}/></button>}</div></div>
      </div>
      <div className={ui.controls}>
        <dl className={ui.controlTop}>
          <div><Activity size={18}/><div><dt>{a('state')}</dt><dd>{state ? <Badge value={state}/> : <span className={ui.notSet}>{a('workStateUnset')}</span>}</dd>{editable && <button type="button" className={css.textButton} aria-label={a('editWorkState')} onClick={() => onEdit({ action: 'work_state', title: a('state'), values: { state: state || 'working' } })}>{a('edit')}</button>}</div></div>
          <div id="next-action"><ListTodo size={18}/><div><dt>{a('next')}</dt><dd>{matter.next_action || a('noNext')}</dd>{editable && <button type="button" className={css.textButton} aria-label={a(matter.next_action?'editNextAction':'setNextAction')} onClick={() => onEdit({ action: 'next_action', title: a('next'), values: { title: matter.next_task_id ? '' : matter.next_action, owner_id: matter.next_task_id ? '' : matter.next_owner_id, due_date: matter.next_task_id ? '' : matter.next_due } })}>{a(matter.next_action?'edit':'setNextAction')}</button>}</div></div>
          <div><UserRound size={18}/><div><dt>{a('actor')}</dt><dd>{matter.next_owner_name || a('unassigned')}</dd></div></div>
          <div><CalendarDays size={18}/><div><dt>{a('due')}</dt><dd className={matter.next_action_overdue_days?css.overdueDate:undefined}>{date(matter.next_due)}</dd><OverdueDays days={matter.next_action_overdue_days}/></div></div>
        </dl>
        <dl className={ui.controlBottom}>{supporting.map(({ key, Icon, value }) => <div key={key}><Icon size={18}/><div><dt>{a(key)}</dt><dd>{value}{key === 'age' && <small>{a('matterAgeHint')}</small>}</dd></div></div>)}</dl>
      </div>
    </div>
    {children}
  </section>;
}
