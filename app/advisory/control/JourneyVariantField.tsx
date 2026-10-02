'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import {availableVariants,defaultVariant,journeyName,type JourneyVariant} from '../../../lib/advisory-flexible-journey';
import {useAdvisoryLabels} from './shared';
import {controlledText} from './controlled-journey-labels';
import css from './control.module.css';
import previewCss from './journey-variant-preview.module.css';
export default function JourneyVariantField({family,onCatalog}:{family:string;onCatalog?:(variants:JourneyVariant[])=>void}){
 const {a,locale}=useAdvisoryLabels(),[variants,setVariants]=useState<JourneyVariant[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let live=true;void Promise.resolve(supabase.rpc('advisory_journey_catalog',{p_family:family})).then(r=>{if(!live)return;if(r.error)throw r.error;const choices=availableVariants(r.data.variants,family);setVariants(choices);onCatalog?.(choices);setSelected(defaultVariant(choices)?.id||'');setLoading(false);}).catch(()=>{if(live){onCatalog?.([]);setError(true);setLoading(false);}});return()=>{live=false;};},[family,onCatalog]);
 const choice=variants.find(v=>v.id===selected);
 return <div className={css.wide}><strong>{a('fjVariant')}</strong>{loading?<p role="status">{a('loading')}</p>:error||!choice?<p role="alert">{a('fjUnavailable')}</p>:null}
 {variants.length>1?<fieldset disabled={loading}><legend>{a('fjChoose')}</legend>{variants.map(v=><label className={css.check} key={v.id}><input type="radio" name="journey_version_id" value={v.version_id} checked={v.id===selected} onChange={()=>setSelected(v.id)}/>{journeyName(v.definition,locale)} {v.is_default&&`(${a('fjDefault')})`}</label>)}</fieldset>:choice&&<p>{journeyName(choice.definition,locale)}</p>}
 {variants.length<=1&&<input type="hidden" name="journey_version_id" value={choice?.version_id||''}/>}
 {choice&&<details className={previewCss.preview} data-journey-preview={choice.version_id}><summary>{a('fjPreview')} · v{choice.version}</summary>{choice.definition.format===2&&<p className={previewCss.hint}>{controlledText(locale,'possibleHint')}</p>}<ol className={previewCss.stages} key={choice.version_id}>{choice.definition.stages.map((s,index)=>{
  const outcomes=choice.definition.format===2?s.outcomes||[]:[],branch=s.key!=='close'&&outcomes.length>1;
  const route=s.key==='close'?(locale==='en'?'Final stage':'ขั้นตอนสุดท้าย'):s.conditional?controlledText(locale,'conditional'):branch?`${outcomes.length} ${locale==='en'?'choices':'ทางเลือก'}`:(locale==='en'?'Normal route':'เส้นทางปกติ');
  const heading=<><span className={previewCss.number} aria-hidden="true">{index+1}</span><span className={previewCss.identity}><strong>{journeyName(s,locale)}</strong><small>{a(s.required?'fjRequired':'fjOptional')} · {route}{s.conditional&&branch&&` · ${outcomes.length} ${locale==='en'?'choices':'ทางเลือก'}`}</small></span></>;
  return <li key={s.key} data-preview-stage={s.key}>{branch?<details className={previewCss.branch}><summary>{heading}<span className={previewCss.chevron} aria-hidden="true">⌄</span></summary><ul className={previewCss.outcomes}>{outcomes.map(o=><li key={o.key}><span>{journeyName(o,locale)}</span><span aria-hidden="true">→</span><span>{journeyName(choice.definition.stages.find(target=>target.key===o.target)||{},locale,'—')}</span></li>)}</ul></details>:<div className={previewCss.stage}>{heading}</div>}</li>;
 })}</ol></details>}
 </div>;
}
