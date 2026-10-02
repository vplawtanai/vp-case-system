'use client';
import {useId} from 'react';
import {journeyName,type JourneyDefinition} from '../../../lib/advisory-flexible-journey';
import {journeyLayout} from '../../../lib/advisory-journey-presentation';
import {controlledText} from './controlled-journey-labels';
import css from './journey-route-map.module.css';

type Props = {definition:JourneyDefinition; locale:string; selected?:string; onSelect:(key:string)=>void; current?:string; completed?:string[]; matter?:boolean};
export default function JourneyRouteMap({definition,locale,selected,onSelect,current,completed=[],matter=false}:Props) {
  const id = useId().replaceAll(':',''), layout = journeyLayout(definition), t = (key:Parameters<typeof controlledText>[1])=>controlledText(locale,key);
  const edges = definition.stages.flatMap((stage,i)=>(stage.outcomes||[]).flatMap((outcome,j)=>{
    const from = layout.nodes[i], to = layout.nodes.find(n=>n.key===outcome.target);
    if (!to) return [];
    const loop = to.rank <= from.rank, conditional = !!definition.stages.find(s=>s.key===outcome.target)?.conditional;
    const detour = loop || to.rank > from.rank+1;
    const lane = loop ? 22+j*14 : layout.width-22-j*14;
    const startX = detour ? from.x+(loop?-76:76) : from.x, startY = detour ? from.y+42 : from.y+84;
    const endX = detour ? to.x+(loop?-76:76) : to.x, endY = detour ? to.y+42 : to.y;
    const d = from.key===to.key ? `M ${startX} ${startY} H ${lane} V ${from.y-16} H ${from.x} V ${from.y}` : detour ? `M ${startX} ${startY} H ${lane} V ${endY} H ${endX}` : `M ${startX} ${startY} V ${startY+36} H ${endX} V ${endY}`;
    return [{key:stage.key+':'+outcome.key,from:stage.key,to:outcome.target,outcome,loop,conditional,detour,branch:(stage.outcomes?.length||0)>1,d,labelX:detour?(startX+lane)/2:(from.x+to.x)/2,labelY:detour?startY-32:startY+33}];
  }));
  return <div className={css.diagram}>
    <div className={css.legend}><span>{t('continuousRoute')}</span><span data-kind="branch">{t('branchRoute')}</span><span data-kind="loop">{t('loopRoute')}</span></div>
    <div className={css.scroll} tabIndex={0} role="region" aria-label={t('preview')}>
      <div className={css.canvas} style={{maxWidth:layout.width,minWidth:Math.max(320,(layout.width-160)/180*140+80),height:layout.height}}>
        <svg width="100%" height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>{['route','loop'].map(kind=><marker key={kind} id={`${id}-${kind}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill={kind==='loop'?'#8264ad':'#6a8bb5'}/></marker>)}</defs>
          {edges.map(edge=><path key={edge.key} data-route={edge.key} data-target={edge.to} data-loop={edge.loop} data-conditional={edge.conditional} d={edge.d} fill="none" stroke={edge.loop?'#8264ad':'#6a8bb5'} strokeWidth={edge.from===selected?2.4:1.5} strokeDasharray={edge.loop||edge.conditional||edge.branch?'5 4':undefined} opacity={matter&&edge.from!==selected?0.45:1} markerEnd={`url(#${id}-${edge.loop?'loop':'route'})`}/>)}
        </svg>
        {edges.filter(edge=>edge.from===selected).map(edge=><span key={edge.key} className={css.edgeLabel} style={{left:`${edge.labelX/layout.width*100}%`,top:edge.labelY,maxWidth:edge.detour?'20%':undefined}} data-loop={edge.loop}>{edge.loop?'↶ ':''}{journeyName(edge.outcome,locale)}</span>)}
        {layout.nodes.map((node,i)=>{
          const stage = definition.stages[i], state = stage.key===current?'current':completed.includes(stage.key)?'completed':'possible';
          return <button key={node.key} type="button" className={css.node} style={{left:`${node.x/layout.width*100}%`,top:node.y,width:`${152/layout.width*100}%`}} title={journeyName(stage,locale)} onClick={()=>onSelect(node.key)} aria-pressed={selected===node.key} data-state={matter?state:undefined} data-conditional={!!stage.conditional} aria-label={`${i+1}. ${journeyName(stage,locale)}`}>
            <strong><span>{matter&&state==='completed'?'✓':i+1}</span>{journeyName(stage,locale)}</strong>
            <small>{matter&&state==='current'?t('currentStage'):matter&&state==='completed'?t('completedStage'):stage.conditional?t('conditional'):stage.key==='close'?t('closeStage'):t(stage.required?'requiredStage':'optionalStage')}</small>
            {matter&&stage.conditional&&state==='possible'&&<small>{t('notActivated')}</small>}
          </button>;
        })}
      </div>
    </div>
    <p className={css.hint}>{t('previewHint')}{matter&&` ${t('possibleHint')}`}</p>
  </div>;
}
