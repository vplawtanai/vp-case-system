'use client';
import {useRef,useState,type ReactNode} from 'react';
import {supabase} from '../../../lib/supabase';
import CaseEditModal from './CaseEditModal';
import {useDefendantText} from './defendant-labels';
import {useCaseBusinessDate} from './use-case-business-date';
import {currentCoverage,defendantError,defendantSuggestion,filingsFor,flowReadiness,liveRepresentations,partyLabel,prepareDefendantRequest,type DefendantContext,type DefendantParty,type SaveRequest} from './defendant-model';
import base from './case-detail.module.css';
import css from './case-defendant.module.css';

export type DefendantEdit={kind:'representation'|'service'|'service_void'|'deadline'|'filing'|'filing_void'|'extension'|'counterclaim'|'counterclaim_void'|'counterclaim_relink'|'flow_start'|'flow_transition';id?:string;partyId?:string;filingId?:string;targetStage?:string;correct?:boolean};
export function PartyPicker({parties,selected,onChange,legend,disabled=false,single=false}:{parties:DefendantParty[];selected:string[];onChange:(ids:string[])=>void;legend:string;disabled?:boolean;single?:boolean}){
 const {t}=useDefendantText();const [search,setSearch]=useState('');
 return <fieldset className={css.picker} disabled={disabled}><legend>{legend}</legend>{parties.length>5&&<input type="search" aria-label={t('search')} placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)}/>}
 <div className={css.options}>{parties.filter(p=>partyLabel(p).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p=><label key={p.id} className={css.check}><input type={single?'radio':'checkbox'} name={single?'party-selection':undefined} checked={selected.includes(p.id)} onChange={()=>onChange(single?[p.id]:selected.includes(p.id)?selected.filter(id=>id!==p.id):[...selected,p.id])}/><span>{partyLabel(p)}</span></label>)}</div>{!parties.length&&<p>{t('none')}</p>}</fieldset>;
}

export default function DefendantEditor({edit,context,caseId,canLegal,onClose,onSaved,onReload}:{edit:DefendantEdit;context:DefendantContext;caseId:number;canLegal:boolean;onClose:()=>void;onSaved:()=>void;onReload:()=>void}){
 const {t,date,locale}=useDefendantText(),today=useCaseBusinessDate(),data=context.data;
 const filing=data.filings.find(f=>f.id===edit.id),claim=data.counterclaims.find(c=>c.id===edit.id),group=data.extension_groups.find(g=>g.id===edit.id),person=data.represented.find(r=>r.party_id===edit.partyId),attempt=person?.attempts.find(a=>a.id===edit.id);
 const isFiling=edit.kind==='filing',isClaim=edit.kind.startsWith('counterclaim'),isExtension=edit.kind==='extension',isService=edit.kind==='service',isVoid=edit.kind.endsWith('_void'),isFlow=edit.kind.startsWith('flow_');
 const current=isFiling?filing:isClaim?claim:null;
 const initialParties=isFiling&&filing?currentCoverage(filing).map(c=>c.party_id):isClaim&&claim?currentCoverage(claim).filter(c=>c.side==='claimant').map(c=>c.party_id):isExtension&&group?group.coverage.map(c=>c.party_id):edit.partyId?[edit.partyId]:[];
 const [parties,setParties]=useState(initialParties),[mode,setMode]=useState(initialParties.length>1?'joint':'separate'),[adding,setAdding]=useState(true);
 const [day,setDay]=useState(current?.filed_on||group?.requested_on||attempt?.attempted_on||''),[note,setNote]=useState(current?.note||group?.note||attempt?.note||''),[doc,setDoc]=useState(current?.document_ref||group?.document_ref||''),[reason,setReason]=useState('');
 const [result,setResult]=useState<string>(attempt?.result||'served'),[method,setMethod]=useState(attempt?.method||''),[failure,setFailure]=useState(attempt?.failure_reason||'');
 const [due,setDue]=useState(person?defendantSuggestion(person)?.date||'':''),[existing,setExisting]=useState(''),[linkMode,setLinkMode]=useState(false);
 const [granted,setGranted]=useState(group?.lifecycle==='granted'),[grants,setGrants]=useState<Record<string,string>>({});
 const [filingId,setFilingId]=useState(claim?.filing_id||edit.filingId||''),[targets,setTargets]=useState(claim?currentCoverage(claim).filter(c=>c.side==='target').map(c=>c.party_id):[]),[replace,setReplace]=useState(false);
 const [stage,setStage]=useState(edit.targetStage||data.flow?.current_stage||''),[filingMethod,setFilingMethod]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const retry=useRef<SaveRequest|null>(null),lock=useRef(false),[newId]=useState(()=>crypto.randomUUID()),[replacementId]=useState(()=>crypto.randomUUID());
 const active=liveRepresentations(data),readiness=flowReadiness(data);
 const chosenFiling=data.filings.find(f=>f.id===filingId&&f.lifecycle==='active');
 const representedParties=active.map(r=>r.party);
 const preservedSelection=initialParties.filter(id=>!representedParties.some(p=>p.id===id));
 const selectable=isExtension?active.filter(r=>!filingsFor(data,r.party_id).length&&r.deadline?.status==='Active'&&!r.deadline.deleted_at).map(r=>r.party):isClaim?representedParties.filter(p=>chosenFiling&&currentCoverage(chosenFiling).some(c=>c.party_id===p.id)):representedParties;
 const flowReasonRequired=!!edit.correct||data.stages.find(s=>s.stage_key===stage)?.ordinal!==(data.stages.find(s=>s.stage_key===data.flow?.current_stage)?.ordinal??-2)+1;
 const needsReason=isVoid||!!edit.id&&(['filing','extension','counterclaim','counterclaim_relink'].includes(edit.kind))||edit.kind==='representation'&&!adding||edit.kind==='flow_transition'&&flowReasonRequired;
 const title=edit.kind==='representation'?'manage':isFiling?(filing?'correct':'fileAnswer'):isExtension?'extension':isClaim?(isVoid?'voidAction':edit.kind==='counterclaim_relink'?'relink':claim?'correct':'recordCounterclaim'):isService?(attempt?'serviceEdit':'service'):edit.kind==='service_void'?'serviceVoid':edit.kind==='filing_void'?'voidFiling':edit.kind==='deadline'?'confirmDue':edit.kind==='flow_start'?'start':edit.correct?'flowCorrect':'nextStage';
 const activeClaims=filing?data.counterclaims.filter(c=>c.filing_id===filing.id&&c.lifecycle==='active'):[];
 const coverageChanged=!!filing&&[...parties].sort().join()!==currentCoverage(filing).map(c=>c.party_id).sort().join();
 const blocked=!!activeClaims.length&&(edit.kind==='filing_void'||coverageChanged||replace);
 function input(label:string,value:string,set:(v:string)=>void,type='text',required=false):ReactNode{return <label>{t(label)}<input type={type} required={required} value={value} onChange={e=>set(e.target.value)} onInput={e=>set(e.currentTarget.value)} {...(type==='date'&&label!=='newDue'?{max:today}:{})}/></label>;}
 function confirm(){return <label className={css.check}><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{t('humanConfirm')}</span></label>;}
 function build(){
  let action='',payload:Record<string,unknown>={},entity=0;
  const reference={document_ref:doc.trim()||null,note:note.trim()||null};
  if(edit.kind==='representation'){action='representation';payload={parties,active:adding,...(!adding?{reason}:{})};if(!parties.length)throw Error('CASE104_PARTIES_REQUIRED');}
  else if(isService){action='service';payload={party_id:edit.partyId,...(attempt?{attempt_id:attempt.id}:{}),result,method:method||null,attempted_on:day||null,note:note||null,...(result==='failed'?{failure_kind:attempt?.failure_kind||'other',failure_reason:failure}:{}),...(result==='served'&&canLegal?{confirm_lawful:true}:{})};}
  else if(edit.kind==='service_void'){action='service_void';payload={party_id:edit.partyId,attempt_id:edit.id,reason};}
  else if(edit.kind==='deadline'){action='deadline';payload={party_id:edit.partyId,confirmed,...(linkMode?{existing_id:existing}:{due}),...(reason?{reason}:{})};}
  else if(isFiling){
   if((mode==='separate'&&parties.length!==1)||(mode==='joint'&&parties.length<2))throw Error('CASE104_PARTIES_REQUIRED');
   action=filing?'filing_correct':'filing_create';entity=filing?.version||0;
   payload={id:filing?.id||newId,filed_on:day,...reference,...(!filing||coverageChanged?{parties}:{}),...(filing?{reason,...(replace?{replacement_id:replacementId}: {})}:{})};
  }else if(edit.kind==='filing_void'){action='filing_void';entity=filing?.version||0;payload={id:edit.id,reason};}
  else if(isExtension){action='extension';entity=group?.version||0;payload={id:group?.id||newId,...reference,...(group?{reason}:{parties,requested_on:day||null}),...(granted?{confirmed,grants:parties.map(party_id=>({party_id,due:grants[party_id]}))}:{})};if(!parties.length)throw Error('CASE104_PARTIES_REQUIRED');}
  else if(isClaim){action=edit.kind==='counterclaim_void'?'counterclaim_void':edit.kind==='counterclaim_relink'?'counterclaim_relink':claim?'counterclaim_correct':'counterclaim_create';payload={id:claim?.id||newId,version:claim?.version||0,...(isVoid?{reason}:edit.kind==='counterclaim_relink'?{filing_id:filingId,reason}:{filing_id:filingId,filed_on:day,...reference,claimants:parties,targets,...(claim?{reason}:{})})};}
  else if(isFlow){action=edit.kind;payload=edit.kind==='flow_start'?{id:newId,stage,start_kind:'cut_in',acknowledged:confirmed,...(filingMethod?{filing_method:filingMethod}:{})}:{id:data.flow?.id,stage,confirmed,reason,...(edit.correct?{corrects_id:data.transitions[0]?.id}:{})};if(stage==='D-CIV-03'&&!readiness.readyForHearing)throw Error('CASE104_UNRESOLVED');}
  return {action,payload,entity};
 }
 async function save(e:React.FormEvent){
  e.preventDefault();if(lock.current||blocked)return;lock.current=true;setBusy(true);setError('');
  try{
   if(!uncertain){const v=build();retry.current=prepareDefendantRequest(retry.current,caseId,v.action,v.payload,data,v.entity,context.manualDeadlines);}
   const r=await supabase.rpc('case104_save',retry.current!);
   if(r.error){const key=defendantError(r.error.message);setError(key);setUncertain(key==='uncertain');if(key!=='uncertain')retry.current=null;return;}
   setUncertain(false);onSaved();
  }catch(err){const key=defendantError(err instanceof Error?err.message:'');setError(key);setUncertain(!!retry.current&&key==='uncertain');}
  finally{lock.current=false;setBusy(false);}
 }
 return <CaseEditModal title={t(title)} className={css.editor} busy={busy||uncertain} onClose={onClose}><form className={css.form} onSubmit={save}>
 <fieldset disabled={busy||uncertain} className={css.fields}>
 {edit.kind==='representation'&&<><div className={css.segment}><button type="button" aria-pressed={adding} onClick={()=>{setAdding(true);setParties([]);}}>{t('add')}</button><button type="button" aria-pressed={!adding} onClick={()=>{setAdding(false);setParties([]);}}>{t('withdraw')}</button></div><PartyPicker legend={t('represented')} parties={context.parties.filter(p=>p.role==='defendant'&&!p.deleted_at&&(adding?!active.some(r=>r.party_id===p.id):active.some(r=>r.party_id===p.id)))} selected={parties} onChange={setParties}/><p className={css.hint}>{t('membershipHint')}</p></>}
 {person&&<p className={css.identity}>{partyLabel(person.party)}</p>}
 {isService&&<><label>{t('result')}<select value={result} onChange={e=>setResult(e.target.value)}><option value="served">{t('served')}</option><option value="failed">{t('failed')}</option><option value="pending">{t('pending')}</option></select></label><div className={css.two}><label>{t('method')}<select required={result!=='failed'} value={method} onChange={e=>setMethod(e.target.value)}><option value="">{t('unknown')}</option>{['normal','posting','electronic','other'].map(m=><option key={m} value={m}>{t(m)}</option>)}</select></label>{input('serviceDate',day,setDay,'date',result!=='failed')}</div>{result==='failed'&&<label>{t('failureReason')}<textarea required value={failure} onChange={e=>setFailure(e.target.value)}/></label>}<label>{t('note')}<textarea value={note} onChange={e=>setNote(e.target.value)}/></label></>}
 {edit.kind==='deadline'&&person&&<><p className={css.hint}>{t('suggestionHint')}{defendantSuggestion(person)&&<strong> · {t('suggested')}: {date(defendantSuggestion(person)!.date)}</strong>}</p><label>{t('due')}<select value={linkMode?'existing':'new'} onChange={e=>setLinkMode(e.target.value==='existing')}><option value="new">{t('createDue')}</option><option value="existing">{t('linkDue')}</option></select></label>{linkMode?<label>{t('linkDue')}<select required value={existing} onChange={e=>setExisting(e.target.value)}><option value="">{t('choose')}</option>{context.manualDeadlines.map((d,i)=><option key={d.id} value={d.id}>{t('due')} {i+1} · {date(d.current_due_date)}</option>)}</select></label>:input('newDue',due,setDue,'date',true)}{confirm()}</>}
 {preservedSelection.length>0&&(isFiling||isClaim)&&<p className={css.hint}>{t('preserveHint')} · {preservedSelection.map(id=>context.parties.find(p=>p.id===id)).filter((p):p is DefendantParty=>!!p).map(partyLabel).join(' · ')}</p>}
 {isFiling&&<><label>{t('filingMode')}<select value={mode} onChange={e=>{setMode(e.target.value);setParties([]);}}><option value="separate">{t('separate')}</option><option value="joint">{t('joint')}</option></select></label><PartyPicker parties={representedParties} selected={parties} onChange={setParties} single={mode==='separate'} legend={t('coverage')}/>{input('filedOn',day,setDay,'date',true)}<p className={css.hint}>{t('filingHint')}</p><p className={css.hint}>{t('counterclaimSeparate')}</p>{filing&&<label className={css.check}><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/><span>{t('replacement')}</span></label>}</>}
 {isExtension&&<><p className={css.hint}>{t('extensionHint')}</p>{!group?<><PartyPicker parties={selectable} selected={parties} onChange={setParties} legend={t('coverage')}/>{input('requested',day,setDay,'date')}</>:<p>{parties.map(id=>context.parties.find(p=>p.id===id)).filter((p):p is DefendantParty=>!!p).map(partyLabel).join(' · ')}</p>}<label>{t('extensions')}<select value={granted?'granted':'pending'} disabled={group?.lifecycle==='granted'} onChange={e=>setGranted(e.target.value==='granted')}><option value="pending">{t('pendingExtension')}</option><option value="granted">{t('granted')}</option></select></label>{parties.map(id=>{const r=data.represented.find(p=>p.party_id===id);return <div className={css.dueRow} key={id}><strong>{r?partyLabel(r.party):t('none')}</strong><span>{t('currentDue')}: {date(r?.deadline?.current_due_date)}</span>{granted&&input('newDue',grants[id]||'',v=>setGrants({...grants,[id]:v}),'date',true)}</div>;})}{granted&&confirm()}</>}
 {isClaim&&!isVoid&&<><label>{t('filing')}<select required value={filingId} onChange={e=>{setFilingId(e.target.value);if(edit.kind!=='counterclaim_relink')setParties([]);}}><option value="">{t('choose')}</option>{data.filings.map((f,i)=>f.lifecycle==='active'?<option key={f.id} value={f.id}>{t('filing')} {i+1} · {date(f.filed_on)}</option>:null)}</select></label>{edit.kind!=='counterclaim_relink'&&<><PartyPicker parties={selectable} selected={parties} onChange={setParties} legend={t('claimants')}/><PartyPicker parties={context.parties.filter(p=>p.role==='plaintiff'&&!p.deleted_at)} selected={targets} onChange={setTargets} legend={t('targets')}/>{input('filedOn',day,setDay,'date',true)}</>}</>}
 {(isFiling||isExtension||edit.kind==='counterclaim')&&<>{input('document',doc,setDoc,'url')}<small>{t('documentHint')}</small><label>{t('note')}<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label></>}
 {isFlow&&<>{edit.kind==='flow_start'&&<p className={css.hint}>{t('title')} · {t('cutInHint')}</p>}<label>{t('currentStage')}<select required value={stage} onChange={e=>setStage(e.target.value)}><option value="">{t('choose')}</option>{data.stages.map(s=><option key={s.stage_key} value={s.stage_key} disabled={s.stage_key==='D-CIV-03'&&!readiness.readyForHearing}>{s[locale==='th'?'title_th':'title_en']}</option>)}</select></label>{edit.kind==='flow_start'&&<label>{t('filingMethod')}<select value={filingMethod} onChange={e=>setFilingMethod(e.target.value)}><option value="">{t('notSpecified')}</option>{['not_filed','paper','efiling_v3','efiling_v4'].map(m=><option key={m} value={m}>{t(m)}</option>)}</select></label>}{confirm()}</>}
 {needsReason&&<label>{t('reason')}<textarea required rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
 {isVoid&&<p className={css.hint}>{t('preserveHint')}</p>}
 </fieldset>
 {blocked&&<p className={css.warning} role="alert">{t('error.dependency')}</p>}
 {error&&<p className={css.warning} role="alert">{t('error.'+error)}{uncertain&&<> {t('uncertainHint')}</>}</p>}
 <footer className={css.actions}>{!uncertain&&<button type="button" className={base.secondary} disabled={busy} onClick={onClose}>{t('cancel')}</button>}{error==='stale'?<button type="button" className={base.primary} onClick={onReload}>{t('reload')}</button>:<button className={base.primary} disabled={busy||blocked} type="submit">{t(busy?'saving':uncertain?'retry':'save')}</button>}</footer>
 </form></CaseEditModal>;
}
