'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import LanguageSelector from '../../components/LanguageSelector';
import DetailModal from '../../components/DetailModal';
import {useAdvisoryLabels} from '../../advisory/control/shared';
import {journeyFamilies,errorKey} from '../../../lib/advisory-control';
import {journeyName,type JourneyVariant,type JourneyDefinition} from '../../../lib/advisory-flexible-journey';
import JourneyRoutingEditor from './JourneyRoutingEditor';
import {journeyIssues} from '../../../lib/advisory-journey-presentation';
import {builderDraft,arrangeDraft,canRemoveStage,addDraftChoice} from './draft-routes';
import {journeyRequest} from './client';
import {journeyText,type JourneyLabel} from './labels';
import css from './journey-templates.module.css';

export default function JourneyTemplates(){
 const {a,locale}=useAdvisoryLabels(),t=(k:JourneyLabel)=>journeyText(locale,k);
 const [variants,setVariants]=useState<JourneyVariant[]>([]),[family,setFamily]=useState(journeyFamilies[0].key),[selected,setSelected]=useState(''),[editing,setEditing]=useState(false),[draft,setDraft]=useState<JourneyDefinition|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [stageKey,setStageKey]=useState(''),[focusRequest,setFocusRequest]=useState(0),[clone,setClone]=useState<{stage:string;branch:boolean}|null>(null);
 const lock=useRef(false),ticket=useRef<{body:string;id:string}|null>(null),sequence=useRef(0);
 const reload=useCallback(async()=>{const n=++sequence.current;try{const r=await journeyRequest();if(n===sequence.current){setVariants(r.variants);setLoading(false);}return true;}catch(e){if(n===sequence.current){setError(String((e as Error).message));setLoading(false);}return false;}},[]);
 useEffect(()=>{const counter=sequence;void reload();return()=>{counter.current++;};},[reload]);
 const choices=variants.filter(v=>v.family_key===family),current=choices.find(v=>v.id===selected)||choices.find(v=>v.is_default)||choices[0];
 function start(create=false,at=stageKey,branch=false){
  setError('');setNotice('');setEditing(true);setClone(null);
  let next:JourneyDefinition;
  if(create){setSelected('new');const f=journeyFamilies.find(f=>f.key===family)!;next=builderDraft({name_th:'',name_en:'',stages:f.stages.map((key,i)=>({key,name_th:f.stage_labels_th[i],name_en:f.stage_labels_en[i],required:true}))});}
  else{setSelected(current.id);next=builderDraft(current.definition);}
  const key=next.stages.some(s=>s.key===at)?at:next.stages[0].key;
  if(branch&&(next.stages.find(s=>s.key===key)?.outcomes?.length||0)<2)next=addDraftChoice(next,key,'outcome_'+crypto.randomUUID().replaceAll('-',''));
  setDraft(next);setStageKey(key);if(!create)setFocusRequest(n=>n+1);
 }
 function branchAt(key:string){
  setStageKey(key);
  if(!editing){setClone({stage:key,branch:true});return;}
  setDraft(d=>d&&(d.stages.find(s=>s.key===key)?.outcomes?.length||0)<2?addDraftChoice(d,key,'outcome_'+crypto.randomUUID().replaceAll('-','')):d);setFocusRequest(n=>n+1);
 }
 async function perform(action:string,payload:unknown){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');const body={action,id:action==='create'?null:current.id,revision:action==='create'?null:current.revision,payload},serialized=JSON.stringify(body);if(ticket.current?.body!==serialized)ticket.current={body:serialized,id:crypto.randomUUID()};try{const r=await journeyRequest({...body,request_id:ticket.current.id});ticket.current=null;setSelected(r.id);setEditing(false);setDraft(null);setNotice(t('saved'));await reload();}catch(e){setError(String((e as Error).message));}finally{lock.current=false;setBusy(false);}}
 function move(index:number,delta:number){setDraft(d=>{if(!d)return d;const stages=[...d.stages],to=index+delta;if(to<0||to>=stages.length-1||index===stages.length-1)return d;[stages[to],stages[index]]=[stages[index],stages[to]];return arrangeDraft(d,stages);});}
 function remove(index:number){if(!draft||!canRemoveStage(draft,draft.stages[index].key))return;setStageKey(draft.stages[Math.max(0,index-1)].key);setDraft(arrangeDraft(draft,draft.stages.filter((_,i)=>i!==index)));}
 function addStage(){if(!draft||draft.stages.length>=20)return;const key='step_'+crypto.randomUUID().replaceAll('-','');setDraft(arrangeDraft(draft,[...draft.stages.slice(0,-1),{key,name_th:'',name_en:'',required:true,conditional:false},draft.stages.at(-1)!]));setStageKey(key);setFocusRequest(n=>n+1);}
 function submit(e:FormEvent){e.preventDefault();if(draft&&!journeyIssues(draft).length)void perform(selected==='new'?'create':'publish',{...(selected==='new'?{family_key:family}:{}),definition:draft});}
 function cancel(){setEditing(false);setDraft(null);setSelected(current?.id||'');}
 return <main className={css.page}>
  <header className={css.builderHeader}><div><nav aria-label={t('back')}><Link href="/dashboard"><ArrowLeft size={15}/>{t('back')}</Link></nav><h1>{t('title')}</h1></div><LanguageSelector/></header>
  <div className={css.selectionBar}><label className={css.family}>{t('family')}<select value={family} disabled={busy||editing||!!clone} onChange={e=>{setFamily(e.target.value);setSelected('');setStageKey('');}}>{journeyFamilies.map(f=><option key={f.key} value={f.key}>{a('family.'+f.key)}</option>)}</select></label>
   <label className={css.variantSelect}>{t('variants')}<select disabled={loading||busy||editing||!!clone||!choices.length} value={current?.id||''} onChange={e=>{setSelected(e.target.value);setStageKey('');}}>{!choices.length&&<option value="">{t(loading?'loading':'empty')}</option>}{choices.map(v=><option key={v.id} value={v.id}>{journeyName(v.definition,locale)} · v{v.version} · {t(v.active?'active':'inactive')}{v.is_default?` · ${t('default')}`:''}</option>)}</select></label>
   <button disabled={loading||busy||editing} onClick={()=>start(true,'')}>{t('add')}</button>
  </div>
  {current&&!editing&&<details className={css.variantManagement}><summary>{t('manageVariant')}</summary><div className={css.actions}><button disabled={busy||current.is_default} onClick={()=>void perform('configure',{active:!current.active,is_default:false})}>{t(current.active?'deactivate':'activate')}</button><button disabled={busy||!current.active||current.is_default} onClick={()=>void perform('configure',{active:true,is_default:true})}>{t('setDefault')}</button><button disabled={busy} onClick={()=>void reload()}>{t('refresh')}</button><small>{t('defaultHint')}</small></div></details>}
  {error&&<p className={css.error} role="alert">{a(errorKey(error))}</p>}{notice&&<p role="status" className={css.notice}>{notice}</p>}
  <section className={css.panel}>{editing&&draft?<form onSubmit={submit}>
   <header><div><h2>{t(selected==='new'?'add':'draftLabel')}{selected!=='new'&&` · v${current.version+1}`}</h2><p className={css.formHint}>{t('normalHint')}</p></div><div className={css.actions}><button type="button" disabled={busy} onClick={cancel}>{t('cancel')}</button><button className={css.primary} type="submit" disabled={busy||!!journeyIssues(draft).length}>{t(busy?'busy':selected==='new'?'create':'publish')}</button></div></header>
   <div className={css.names}><label>{t('nameTh')}<input required disabled={busy} maxLength={160} value={draft.name_th} onChange={e=>setDraft({...draft,name_th:e.target.value})}/></label><label>{t('nameEn')}<input required disabled={busy} maxLength={160} value={draft.name_en} onChange={e=>setDraft({...draft,name_en:e.target.value})}/></label></div>
   <JourneyRoutingEditor definition={draft} locale={locale} onChange={setDraft} onMove={move} onRemove={remove} onAddStage={addStage} onBranch={branchAt} selectedStage={stageKey} onSelectStage={setStageKey} focusRequest={focusRequest} disabled={busy}/>
   <p className={css.notice}>{t('saveHint')}</p>
  </form>:current&&<>
   <header><h2>{journeyName(current.definition,locale)} · v{current.version}</h2><button disabled={busy} onClick={()=>setClone({stage:stageKey||current.definition.stages[0].key,branch:false})}>{t('edit')}</button></header>
   <JourneyRoutingEditor definition={current.definition} locale={locale} selectedStage={stageKey} onSelectStage={setStageKey} onBranch={branchAt} onEditStage={key=>setClone({stage:key,branch:false})} disabled={busy}/>
   <p className={css.notice}>{t('saveHint')}</p>
  </>}</section>
  <DetailModal open={!!clone} size="confirm" title={t('cloneTitle')} onClose={()=>setClone(null)} footer={<div className={css.cloneActions}><button type="button" onClick={()=>setClone(null)}>{t('cancel')}</button><button className={css.primary} type="button" onClick={()=>clone&&start(false,clone.stage,clone.branch)}>{t('cloneConfirm')}</button></div>}>
   <p>{t('cloneFrom')} <strong>v{current?.version}</strong> {t('cloneFocus')} <strong>“{journeyName(current?.definition.stages.find(s=>s.key===clone?.stage)||{},locale)}”</strong></p><p>{t('cloneHint')}</p>
  </DetailModal>
 </main>;
}
