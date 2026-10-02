'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import {availableVariants,defaultVariant,journeyName,type JourneyVariant} from '../../../lib/advisory-flexible-journey';
import {useAdvisoryLabels} from './shared';
import {controlledText} from './controlled-journey-labels';
import css from './control.module.css';
export default function JourneyVariantField({family}:{family:string}){
 const {a,locale}=useAdvisoryLabels(),[variants,setVariants]=useState<JourneyVariant[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let live=true;void Promise.resolve(supabase.rpc('advisory_journey_catalog',{p_family:family})).then(r=>{if(!live)return;if(r.error)throw r.error;const choices=availableVariants(r.data.variants,family);setVariants(choices);setSelected(defaultVariant(choices)?.id||'');setLoading(false);}).catch(()=>{if(live){setError(true);setLoading(false);}});return()=>{live=false;};},[family]);
 const choice=variants.find(v=>v.id===selected);
 return <div className={css.wide}><strong>{a('fjVariant')}</strong>{loading?<p role="status">{a('loading')}</p>:error||!choice?<p role="alert">{a('fjUnavailable')}</p>:null}
 {variants.length>1?<fieldset disabled={loading}><legend>{a('fjChoose')}</legend>{variants.map(v=><label className={css.check} key={v.id}><input type="radio" name="journey-choice" checked={v.id===selected} onChange={()=>setSelected(v.id)}/>{journeyName(v.definition,locale)} {v.is_default&&`(${a('fjDefault')})`}</label>)}</fieldset>:choice&&<p>{journeyName(choice.definition,locale)}</p>}
 <input type="hidden" name="variant_id" value={choice?.id||''}/><input type="hidden" name="journey_version_id" value={choice?.version_id||''}/>
 {choice&&<details><summary>{a('fjPreview')} · v{choice.version}</summary>{choice.definition.format===2&&<p>{controlledText(locale,'possibleHint')}</p>}<ol>{choice.definition.stages.map(s=><li key={s.key}>{journeyName(s,locale)} · {a(s.required?'fjRequired':'fjOptional')}{s.conditional&&` · ${controlledText(locale,'conditional')}`}</li>)}</ol></details>}
 </div>;
}
