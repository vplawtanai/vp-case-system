"use client";
import StrategicJourneyMap from './StrategicJourneyMap';
import type {JourneyPathVisit} from '../../../lib/advisory-controlled-journey';
import {journeyName,type JourneySnapshot} from '../../../lib/advisory-flexible-journey';
import {matterClosed} from '../../../lib/advisory-workflow';

import { useRef, useState, type CSSProperties } from 'react';
import { Flag, Search, FileText, Handshake, Check, SkipForward, Compass, MapPin, ArrowRight, Route } from 'lucide-react';
import { defaultTemplate, journeyPlan, journeyProgress, stageState, type Matter, type Stage } from '../../../lib/advisory-control';
import { useAdvisoryLabels } from './shared';
import type { EditRequest } from './MatterEditor';
import css from './journey.module.css';

type Props = {
  snapshot?: JourneySnapshot|null;
  path?: JourneyPathVisit[];
  matter: Matter;
  stages: Stage[];
  canEdit: boolean;
  onEdit: (request: EditRequest) => void;
  initialStage?: string;
  template?: string;
  skipReasons?: Record<string,string>;
};

export default function Journey({ snapshot, path:recordedPath=[], matter, stages, canEdit, onEdit, initialStage, skipReasons = {}, template = matter.template_key || defaultTemplate(matter.matter_type) }: Props) {
  const { a, label, date, locale } = useAdvisoryLabels();
  const [selected, setSelected] = useState(initialStage || matter.stage_key || '');
  const detailsRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  function inspect(key: string) {
    setSelected(key);
    if (sceneRef.current && window.matchMedia('(max-width:1023px)').matches) requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ block: 'start' }));
  }
  const plan = journeyPlan(matter, stages, template);
  const chosen = plan.find(s => s.stage_key === selected) || plan[0];
  const state = stageState(chosen, matter.stage_key, matterClosed(matter));
  const latest = chosen.visits.find(v => v.kind === 'visit');
  const current = chosen.visits.find(v => v.kind === 'visit' && !v.exited_at);
  const progress = journeyProgress(plan, matter.stage_key, matterClosed(matter));
  const nextStage = plan[plan.indexOf(chosen) + 1];
  const days = state === 'current' ? matter.stage_days : chosen.elapsed_seconds == null ? null : Math.max(0, Math.floor(chosen.elapsed_seconds / 86400));
  const points = plan.map((_, i) => ({ x: 7 + i * 86 / Math.max(1, plan.length - 1), y: [67, 45, 57, 33, 49, 29, 44, 28, 39][i % 9] }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x * 10},${p.y * 4}`).join(' ');

  const legacyMap=(<div ref={sceneRef} data-linear={plan.length>9&&stages.some(s=>s.required!==undefined)||undefined} className={css.mapScene} style={{ '--stage-count': plan.length } as CSSProperties}>
      <svg className={css.routeLines} viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
        <path d={path} className={css.routeShadow} /><path d={path} className={css.mainRoute} />
        {plan.map((s, i) => stageState(s, matter.stage_key, matterClosed(matter)) === 'skipped' && i > 0 && i < plan.length - 1
          ? <path key={s.stage_key} className={css.skippedRoute} d={`M${points[i - 1].x * 10},${points[i - 1].y * 4} Q${points[i].x * 10},${Math.min(points[i].y + 28, 94) * 4} ${points[i + 1].x * 10},${points[i + 1].y * 4}`} /> : null)}
      </svg>
      <ol className={css.stations} aria-label={a('stageOrder')}>
        {plan.map((s, i) => {
          const status = stageState(s, matter.stage_key, matterClosed(matter));
          const Icon = status === 'visited' || status === 'finished' ? Check : status === 'skipped' ? SkipForward : s.stage_key === 'close' ? Flag : ['analysis', 'research', 'facts'].includes(s.stage_key) ? Search : ['draft', 'review', 'preparation'].includes(s.stage_key) ? FileText : ['negotiation', 'delivery', 'client_delivery'].includes(s.stage_key) ? Handshake : i === 0 ? MapPin : Compass;
          return <li key={s.stage_key} style={{ '--node-x': `${points[i].x}%`, '--node-y': `${points[i].y}%` } as CSSProperties}>
            <button type="button" className={css.station} data-state={status} aria-current={status === 'current' ? 'step' : undefined} aria-pressed={chosen.stage_key === s.stage_key} aria-controls="journey-stage-details" onClick={() => inspect(s.stage_key)}>
              <span className={css.stationIcon}><Icon size={23} /></span>
              <span className={css.stationText}><span className={css.stepNumber}>{a('stepNumber', { n: i + 1 })}</span><strong>{journeyName(s,locale,label(s.stage_key,s.template_key))}</strong><small>{a(status)}{s.required!==undefined&&` · ${a(s.required?'fjRequired':'fjOptional')}`}</small>{status === 'current' && <small>{matter.stage_days === null ? '—' : a('days', { n: matter.stage_days })}</small>}</span>
            </button>
          </li>;
        })}
      </ol>
      <div className={css.routeCaption}><Route size={16} /><span>{a('mainRoute')}</span>{progress.skipped > 0 && <span>{a('skipRouteHint')}</span>}</div>
    </div>);

  const stageDetail=(<div className={css.mapBottom}>
      <aside className={css.progressCard}>
        <Compass size={24} /><h3>{a('routeProgress')}</h3>
        <strong>{progress.visited} <small>/ {progress.total}</small></strong>
        <p>{a('visitedCount', { n: progress.visited })}{progress.skipped > 0 && ` · ${a('skippedCount', { n: progress.skipped })}`}</p>
        <div className={css.progressTrack} aria-hidden="true"><span style={{ width: `${progress.total ? 100 * progress.visited / progress.total : 0}%` }} /></div>
        <p className={css.progressHint}>{a('progressHint')}</p>
      </aside>
      <section ref={detailsRef} id="journey-stage-details" className={css.stageDetail} aria-live="polite" aria-label={a('stageDetails')}>
        <button type="button" className={css.returnToRoute} onClick={() => sceneRef.current?.scrollIntoView({ block: 'start' })}>{a('backToRoute')}</button>
        <div className={css.detailHeading}><div><span className={css.eyebrow}>{a('stepNumber', { n: plan.indexOf(chosen) + 1 })}</span><h3>{journeyName(chosen,locale,label(chosen.stage_key,chosen.template_key))}</h3></div><span className={css.stateBadge} data-state={state}>{a(state)}</span></div>
        {state==='skipped'&&chosen.required===false&&<p className={css.skipReason}><strong>{a('fjSkipReason')}:</strong> {skipReasons[chosen.stage_key]||a('fjSkipReasonMissing')}</p>}
        <dl className={css.stageFacts}>
          <div><dt>{a('entered')}</dt><dd>{date(current?.entered_at || latest?.entered_at)}</dd></div>
          <div><dt>{a(state === 'current' ? 'stageDays' : 'stageTotalDays')}</dt><dd>{days === null ? '—' : a('days', { n: days })}</dd></div>
          <div><dt>{a('taskCompletion')}</dt><dd>{chosen.task_total == null || chosen.task_completed == null ? a('notAvailable') : `${chosen.task_completed} / ${chosen.task_total}`}</dd></div>
          <div><dt>{a('actual')}</dt><dd>{chosen.minutes === null ? a('notAvailable') : a('minutes', { n: chosen.minutes })}</dd></div>
        </dl>
        <div className={css.nextStage}><span>{a('followingStage')}</span><strong>{nextStage ? journeyName(nextStage,locale,label(nextStage.stage_key,nextStage.template_key)) : a('endOfRoute')}</strong><ArrowRight size={15} /></div>
        <div className={css.matterNext}>
          <span>{a('matterNextAction')}</span><strong>{matter.next_action || a('noNext')}</strong>
          <dl><div><dt>{a('actor')}</dt><dd>{matter.next_owner_name || a('unassigned')}</dd></div><div><dt>{a('due')}</dt><dd>{date(matter.next_due)}</dd></div></dl>
        </div>
        {canEdit && !matterClosed(matter) && state === 'current' && <div className={css.mapActions}><button type="button" className={css.primary} onClick={()=>onEdit({action:'stage_complete',title:a('completeStage')})}>{a('completeStage')}</button></div>}
        {canEdit && !matterClosed(matter) && (chosen.required===undefined||(!matter.stage_key&&state==='visited')) && chosen.stage_key !== 'close' && state !== 'current' && <div className={css.mapActions}>
          <button type="button" className={css.primary} onClick={() => onEdit({ action: 'stage', title: a('activate'), values: { template: chosen.template_key, stage_key: chosen.stage_key } })}>{a('activate')}<ArrowRight size={15} /></button>
          {!chosen.visits.length && <button type="button" onClick={() => onEdit({ action: 'stage_skip', title: a('skip'), values: { template: chosen.template_key, stage_key: chosen.stage_key } })}>{a('skip')}</button>}
        </div>}
        {canEdit&&!matterClosed(matter)&&chosen.required===false&&['planned','current'].includes(state)&&<div className={css.mapActions}><button type="button" onClick={()=>onEdit({action:'stage_skip',title:a('skip'),values:{stage_key:chosen.stage_key,stage_name:journeyName(chosen,locale)}})}>{a('skip')}</button></div>}
        {chosen.stage_key === 'close' && !matterClosed(matter) && <p className={css.progressHint}>{a('closeFromMatter')}</p>}
      </section>
    </div>);
  return <div className={css.mapContent}>
    <div className={css.mapIntro}>
      <div><span className={css.eyebrow}>{a('routeOverview')}</span><p>{a('journeyHint')}</p></div>
      <div className={css.legend} aria-label={a('mapLegend')}>
        <span data-state="visited"><Check size={13} />{a('visited')}</span>
        <span data-state="current"><MapPin size={13} />{a('current')}</span>
        <span data-state="planned"><span className={css.legendDot} />{a('planned')}</span>
        {progress.skipped > 0 && <span data-state="skipped"><SkipForward size={13} />{a('skipped')}</span>}
      </div>
    </div>
    {!matter.stage_key && !matterClosed(matter) && <p className={css.unsetNotice}>{a(stages.length?'noCurrentStage':'unset')} · {a(stages.length?'noCurrentStageHint':'stageUnsetHint')}</p>}
    {snapshot?<StrategicJourneyMap detail={stageDetail} primaryAction={canEdit&&!matterClosed(matter)&&state==='current'&&<button type="button" className={css.primary} onClick={()=>onEdit({action:'stage_complete',title:a('completeStage')})}>{locale==='en'?'Complete stage':'เสร็จขั้นตอน'}</button>} matter={matter} snapshot={snapshot} stages={stages} path={recordedPath} locale={locale} selected={chosen.stage_key} onSelect={key=>inspect(key)}>{legacyMap}</StrategicJourneyMap>:<>{legacyMap}{stageDetail}</>}

  </div>;
}
