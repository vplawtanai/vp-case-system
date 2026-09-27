"use client";

import { useState } from 'react';
import { Map, ArrowUpRight, Check, SkipForward } from 'lucide-react';
import DetailModal from '../../components/DetailModal';
import { defaultTemplate, journeyPlan, stageState, workPresets, type Matter, type Stage } from '../../../lib/advisory-control';
import { useAdvisoryLabels } from './shared';
import Journey from './Journey';
import type { EditRequest } from './MatterEditor';
import css from './journey.module.css';

type Props = { matter: Matter; stages: Stage[]; canEdit: boolean; onEdit: (request: EditRequest) => void };

export default function MatterJourney({ matter, stages, canEdit, onEdit }: Props) {
  const { a, label } = useAdvisoryLabels();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [preset, setPreset] = useState(workPresets.find(p => p.key === matter.matter_type)?.key || 'general_advisory');
  const template = workPresets.find(p => p.key === preset)?.template || defaultTemplate(matter.matter_type);
  const plan = journeyPlan(matter, stages, template);
  function inspect(stage: string) { setSelected(stage); setOpen(true); }

  return <section className={css.compactJourney} id="journey">
    <div className={css.compactHeading}>
      <div><span className={css.eyebrow}>{a('stageOrder')}</span><h2>{a('journey')}</h2><p>{a('compactJourneyHint')}</p></div>
      <button type="button" className={css.openMap} onClick={() => inspect(matter.stage_key || plan[0].stage_key)}><Map size={18} />{a('openMap')}<ArrowUpRight size={14} /></button>
    </div>
    {!stages.length && !matter.closed_at ? <div className={css.starterPicker}><label className={css.templateField}>{a('starterCatalog')}<select value={preset} onChange={e => setPreset(e.target.value as typeof preset)}>{workPresets.map(p => <option key={p.key} value={p.key}>{a('preset.' + p.key)}</option>)}</select></label><p>{a('presetHint', { template: label(template) })} {a('previewOnly')}</p></div> : stages.length > 0 && <p className={css.sequenceLabel}>{a('recordedSequence')}: <strong>{label(stages[0].template_key)}</strong></p>}
    {!matter.stage_key && !matter.closed_at && <p className={css.unsetNotice}>{a('unset')} · {a('stageUnsetHint')}</p>}
    <ol className={css.stepper} aria-label={a('stageOrder')}>
      {plan.map((stage, i) => {
        const state = stageState(stage, matter.stage_key, !!matter.closed_at);
        return <li key={stage.stage_key} data-state={state}><button type="button" onClick={() => inspect(stage.stage_key)} aria-current={state === 'current' ? 'step' : undefined}>
          <span className={css.stepDot}>{state === 'visited' || state === 'finished' ? <Check size={14} /> : state === 'skipped' ? <SkipForward size={13} /> : i + 1}</span>
          <span><strong>{label(stage.stage_key)}</strong><small>{a(state)}</small></span>
        </button></li>;
      })}
    </ol>
    {open && <DetailModal open size="workflow" className={css.mapModal} title={a('journey')} subtitle={`${matter.matter_no} · ${matter.title}`} closeLabel={a('closeMap')} onClose={() => setOpen(false)}>
      <Journey matter={matter} stages={stages} canEdit={canEdit} initialStage={selected} template={template} onEdit={onEdit} />
    </DetailModal>}
  </section>;
}
