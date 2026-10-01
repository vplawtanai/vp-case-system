"use client";
import {journeyName,type JourneySnapshot} from '../../../lib/advisory-flexible-journey';
import {matterClosed} from '../../../lib/advisory-workflow';

import { useState } from 'react';
import { Map, ArrowUpRight, Check, SkipForward, List, Info } from 'lucide-react';
import DetailModal from '../../components/DetailModal';
import { defaultTemplate, journeyPlan, stageState, workPresets, type Matter, type Stage } from '../../../lib/advisory-control';
import { useAdvisoryLabels } from './shared';
import Journey from './Journey';
import type { EditRequest } from './MatterEditor';
import css from './journey.module.css';

type Props = { snapshot?:JourneySnapshot|null; matter: Matter; stages: Stage[]; canEdit: boolean; onEdit: (request: EditRequest) => void; compact?: boolean; requestedOpen?: boolean; onCloseMap?: () => void };

export default function MatterJourney({ snapshot, matter, stages, canEdit, onEdit, compact = false, requestedOpen = false, onCloseMap }: Props) {
  const { a, label, locale, date } = useAdvisoryLabels();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [preset, setPreset] = useState(workPresets.find(p => p.key === matter.matter_type)?.key || 'general_advisory');
  const template = stages[0]?.template_key || matter.template_key || workPresets.find(p => p.key === preset)?.template || defaultTemplate(matter.matter_type);
  const plan = journeyPlan(matter, stages, template);
  function inspect(stage: string) { setSelected(stage); setOpen(true); }

  return <section className={`${css.compactJourney} ${compact ? css.overviewJourney : ''}`} id="journey">
    <div className={css.compactHeading}>
      <div>{!compact && <span className={css.eyebrow}>{a('stageOrder')}</span>}<h2>{compact && <List size={19}/>} {a(compact ? 'journeyPlan' : 'journey')}</h2>{!compact && <p>{a('compactJourneyHint')}</p>}</div>
      <button type="button" className={css.openMap} onClick={() => inspect(matter.stage_key || plan[0].stage_key)}><Map size={18} />{a('openMap')}<ArrowUpRight size={14} /></button>
    </div>
    {snapshot&&<p className={css.sequenceLabel}>{a('fjSnapshot')}: <strong>{journeyName(snapshot.definition,locale)} · v{snapshot.version}</strong> · {date(snapshot.captured_at)} · {a('fjFrozen')}</p>}
    {stages.length > 0 && !compact && <p className={css.sequenceLabel}>{a('recordedSequence')}: <strong>{a('family.'+stages[0].template_key)}</strong></p>}
    {!matter.stage_key && !matterClosed(matter) && <p className={css.unsetNotice}><Info size={16}/><span><strong>{a(stages.length?'noCurrentStage':'unset')}</strong> · {a(stages.length?'noCurrentStageHint':'stageUnsetHint')}</span></p>}
    {snapshot?<ol className={css.snapshotList} aria-label={a('stageOrder')}>
      {plan.map((stage,i)=>{const state=stageState(stage,matter.stage_key,matterClosed(matter));return <li key={stage.stage_key} data-state={state}>
        <button type="button" className={css.snapshotStage} onClick={()=>inspect(stage.stage_key)} aria-current={state==='current'?'step':undefined}><span className={css.stepDot}>{state==='visited'||state==='finished'?<Check size={16}/>:state==='skipped'?<SkipForward size={16}/>:i+1}</span><span><strong>{journeyName(stage,locale,label(stage.stage_key,stage.template_key))}</strong><small>{a(state)} · {a(stage.required?'fjRequired':'fjOptional')}</small></span></button>
        {canEdit&&!matterClosed(matter)&&state==='current'&&<button type="button" className={css.snapshotAction} onClick={()=>onEdit({action:'stage_complete',title:a('completeStage')})}>{a('completeStage')}</button>}
        {canEdit&&!matterClosed(matter)&&stage.required===false&&['planned','current'].includes(state)&&<button type="button" className={css.snapshotAction} onClick={()=>onEdit({action:'stage_skip',title:a('skip'),values:{stage_key:stage.stage_key,stage_name:journeyName(stage,locale)}})}>{a('skip')}</button>}
      </li>;})}
    </ol>:<ol className={css.stepper} aria-label={a('stageOrder')}>
      {plan.map((stage, i) => {
        const state = stageState(stage, matter.stage_key, matterClosed(matter));
        return <li key={stage.stage_key} data-state={state}><button type="button" onClick={() => inspect(stage.stage_key)} aria-current={state === 'current' ? 'step' : undefined}>
          <span className={css.stepDot}>{state === 'visited' || state === 'finished' ? <Check size={14} /> : state === 'skipped' ? <SkipForward size={13} /> : i + 1}</span>
          <span><strong>{journeyName(stage,locale,label(stage.stage_key,stage.template_key))}</strong><small>{a(state)}{stage.required!==undefined&&` · ${a(stage.required?'fjRequired':'fjOptional')}`}</small></span>
        </button></li>;
      })}
    </ol>}
    {(open || requestedOpen) && <DetailModal open size="workflow" className={css.mapModal} title={a('journey')} subtitle={`${matter.matter_no} · ${matter.title}`} closeLabel={a('closeMap')} onClose={() => { setOpen(false); onCloseMap?.(); }}>
      {!stages.length && !matterClosed(matter) && <div className={css.starterPicker}><label className={css.templateField}>{a('starterCatalog')}<select value={preset} onChange={e => { setPreset(e.target.value as typeof preset); setSelected(''); }}>{workPresets.map(p => <option key={p.key} value={p.key}>{a('preset.' + p.key)}</option>)}</select></label><p>{a('presetHint', { template: label(template) })} {a('previewOnly')}</p></div>}
      <Journey key={template} matter={matter} stages={stages} canEdit={canEdit} initialStage={selected} template={template} onEdit={request=>{setOpen(false);onCloseMap?.();onEdit(request);}} />
    </DetailModal>}
  </section>;
}
