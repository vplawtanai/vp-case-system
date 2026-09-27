"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../../lib/supabase';
import {useI18n} from '../../../lib/i18n/provider';
import {messages} from '../../../lib/i18n/catalog';
import type {ControlRead,Person} from '../../../lib/advisory-control';
import css from './control.module.css';
export function useAdvisoryLabels(){const i=useI18n();return {...i,a:(key:string,parameters?:Record<string,string|number>)=>i.t('advisory.'+key,parameters),label:(value:string|null|undefined)=>!value?'—':messages['advisory.enum.'+value]?i.t('advisory.enum.'+value):value};}
export function useControl(id?:string,query='{}'){
 const [data,setData]=useState<ControlRead|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const sequence=useRef(0);
 const reload=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError(false);
  try{const r=await supabase.rpc('advisory_control_read',{p_matter_id:id||null,p_query:JSON.parse(query)});if(token!==sequence.current)return;setError(!!r.error);setData(r.error?null:r.data as ControlRead);}
  catch{if(token===sequence.current){setError(true);setData(null);}}
  finally{if(token===sequence.current)setLoading(false);}
 },[id,query]);
 const cancel=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{void reload();return cancel;},[reload,cancel]);
 return {data,error,loading,reload};
}
export function usePeople(){const [people,setPeople]=useState<Person[]>([]);useEffect(()=>{let live=true;void supabase.from('user_profiles').select('id,full_name,staff_name,role').eq('active',true).eq('account_type','operational').eq('assignable',true).order('full_name').limit(200).then(r=>{if(live&&r.data)setPeople(r.data);});return()=>{live=false;};},[]);return people;}
export function Badge({value}:{value:string|null|undefined}){const {label}=useAdvisoryLabels();return <span className={css.badge} data-status={value}>{label(value)}</span>;}
export function Pagination({offset,total,onChange}:{offset:number;total:number;onChange:(offset:number)=>void}){const {a}=useAdvisoryLabels();return <div className={css.pagination}><span>{a('count',{n:total})}</span><div><button disabled={offset===0} onClick={()=>onChange(Math.max(0,offset-20))}>{a('previous')}</button><span>{Math.floor(offset/20)+1}</span><button disabled={offset+20>=total} onClick={()=>onChange(offset+20)}>{a('nextPage')}</button></div></div>;}
