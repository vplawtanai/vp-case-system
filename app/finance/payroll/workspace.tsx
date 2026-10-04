'use client';
import {useCallback,useEffect,useRef,useState,useContext,createContext,type FormEvent,type ReactNode,type ComponentProps} from 'react';
import {ChevronLeft,ChevronRight,LockKeyhole,Plus,RefreshCw} from 'lucide-react';
import BaseModal,{type DetailModalProps} from '../../components/DetailModal';
import ui from '../../components/ui/vp-ui.module.css';
import {useI18n} from '../../../lib/i18n/provider';
import {SearchableCombobox} from '../expenses/searchable-combobox';
import {PayeeModal} from '../payouts/payee-modal';
import type {Payee} from '../payouts/shared';
import {payrollRequest} from './client';
import {payrollText,payrollError,type PayrollLabel} from './labels';
import {effective,payrollPaymentReadiness,payrollLandingTab,payrollPeopleOptions,payrollSetupPeople,hasPayrollHistory,netPay,accountKey,type PayrollData,type Person} from './model';
import {mt,monthLabel,dateLabel,shiftMonth,canPay,selectedNet,lineIdentity,monthlyFacts,knownMonthlyFacts,monthlyError,monthlyText,type MonthlyRow,type WorkspaceData,type MonthlyLabel} from './monthly';
import css from './payroll.module.css';
const Feedback=createContext('');
function DetailModal(props:DetailModalProps){const error=useContext(Feedback);return <BaseModal {...props}>{error&&<p className={css.error} role="alert">{error}</p>}{props.children}</BaseModal>;}
type Body={action:string;payload?:unknown;items?:unknown;month?:string;acknowledged?:boolean};
type Change=(body:Body)=>Promise<boolean>;
type Text=(key:PayrollLabel)=>string;
function Field({label,children}:{label:string;children:ReactNode}){return <label className={css.field}><span>{label}</span>{children}</label>;}
function Empty({children}:{children:ReactNode}){return <div className={css.empty}>{children}</div>;}
function PayrollForm({children,onSubmit,...props}:ComponentProps<'form'>){
 const {locale}=useI18n(),[invalid,setInvalid]=useState(false);
 return <form {...props} noValidate onSubmit={e=>{e.preventDefault();if(!e.currentTarget.checkValidity()){setInvalid(true);e.currentTarget.querySelector<HTMLElement>(':invalid')?.focus();return;}setInvalid(false);onSubmit?.(e);}}>{invalid&&<p className={css.error} role="alert">{payrollText(locale,'inputInvalid')}</p>}{children}</form>;
}
export default function PayrollWorkspace(){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),m=(k:MonthlyLabel)=>mt(locale,k),money=(n:number)=>Number(n).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
 const [data,setData]=useState<WorkspaceData|null>(null),[tab,setTab]=useState<'people'|'periods'|'obligations'|null>(null),[month,setMonth]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState<PayrollLabel|null>(null),[stale,setStale]=useState(false);
 const [modal,setModal]=useState<'engagement'|'end_engagement'|'rate'|'pay'|'review'|'history'|'reload'|'cancel_legacy'|null>(null),[person,setPerson]=useState<Person|null>(null),[row,setRow]=useState<MonthlyRow|null>(null),[payee,setPayee]=useState<Payee|undefined>(),[selected,setSelected]=useState<string[]>([]);
 const lock=useRef(false),sequence=useRef(0),pending=useRef<{body:string;id:string}|null>(null);
 const load=useCallback(async()=>{const seq=++sequence.current;setLoading(true);try{const result=await payrollRequest(undefined,undefined,month||undefined);if(seq!==sequence.current)return;if(!Array.isArray(result.monthly?.rows)||!Array.isArray(result.people)||!Array.isArray(result.new_people_options))throw Error('PAYROLL_FAILED');setData(result);setTab(current=>current??payrollLandingTab({...result,people:payrollSetupPeople(result)}));setStale(false);}finally{if(seq===sequence.current)setLoading(false);}},[month]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{void load().catch(e=>{setStale(true);setError(e);});return invalidate;},[load,invalidate]);
 async function mutate(body:Body){if(lock.current||stale)return false;lock.current=true;setBusy(true);setError(null);setNotice(null);const encoded=JSON.stringify(body);if(pending.current?.body!==encoded)pending.current={body:encoded,id:crypto.randomUUID()};try{await payrollRequest({...body,request_id:pending.current.id});pending.current=null;try{await load();setNotice(body.action==='monthly_pay'?'paymentDone':'saved');}catch{setStale(true);setNotice('savedReadFailed');}setSelected([]);return true;}catch(e){setError(e);return false;}finally{lock.current=false;setBusy(false);}}
 function close(){if(!lock.current){setModal(null);setRow(null);}}
 const blocked=busy||loading||stale,monthly=data?.monthly,rows=monthly?.rows||[],chosen=rows.filter(r=>selected.includes(r.payee_id)),eligible=rows.filter(canPay);
 const issuePerson=(error as {issue?:{person?:string}})?.issue?.person;
 const errorMessage=error?(issuePerson?issuePerson+': ':'')+(monthlyError(locale,error)||payrollError(locale,error)):'';
 function changeMonth(value:string){if(busy)return;setMonth(value);setSelected([]);setError(null);setNotice(null);}
 function openPay(r?:MonthlyRow){if(r)setSelected([r.payee_id]);setModal('pay');}
 const setupPeople=data?payrollSetupPeople(data).filter(hasPayrollHistory):[];
 const issueText=(issue:string)=>issue in monthlyText?m(issue as MonthlyLabel):m('setup_incomplete');
 return <Feedback.Provider value={errorMessage}><main className={`${ui.scope} ${css.root}`}>
  <header className={css.header}><div><span className={css.badge}><LockKeyhole size={13}/>&nbsp;{t('private')}</span><h1>{t('title')}</h1><p className={css.muted}>{t('intro')}</p></div><button className={ui.secondary} disabled={busy||loading} onClick={()=>{setError(null);void load().catch(e=>{setStale(true);setError(e);});}}><RefreshCw size={16}/>{t('reload')}</button></header>
  <nav className={css.tabs} role="tablist" aria-label={t('title')}>{(['people','periods','obligations'] as const).map(k=><button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k)}>{k==='periods'?m('payMonth'):t(k)}</button>)}</nav>
  {errorMessage&&<p className={css.error} role="alert">{errorMessage}</p>}{notice&&<p className={css.success} role="status">{t(notice)}</p>}
  {loading&&!data?<p role="status">{t('loading')}</p>:data&&monthly&&<>
   {tab==='periods'&&<>
    <div className={css.monthBar}><button className={ui.secondary} aria-label={m('previous')} disabled={busy} onClick={()=>changeMonth(shiftMonth(monthly.month,-1))}><ChevronLeft size={20}/></button><div><h2>{monthLabel(monthly.month,locale)}</h2><Field label={m('month')}><input type="month" value={monthly.month.slice(0,7)} disabled={busy} onChange={e=>{if(e.target.value)changeMonth(e.target.value+'-01');}}/></Field></div><button className={ui.secondary} aria-label={m('next')} disabled={busy} onClick={()=>changeMonth(shiftMonth(monthly.month,1))}><ChevronRight size={20}/></button></div>
    <div className={css.monthSummary}><div className={css.metrics}>{([['peopleCount',monthly.summary.people],['ready',monthly.summary.ready],['amount_required',monthly.summary.amount_required],['unconfirmedTotal',money(monthly.summary.net_total)+' THB']] as const).map(([key,value])=><div key={key}><span>{m(key)}</span><strong>{value}</strong>{key==='peopleCount'&&<small>{m('paid')}: {monthly.summary.paid}</small>}</div>)}</div><aside className={css.obligationSummary}><strong>{m('finalObligations')}</strong>{(['employee_ss','employer_ss','employee_wht','contractor_wht'] as const).map(k=><div key={k}><span>{t(k)}</span><b>{money(monthly.obligations[k]||0)}</b></div>)}<small>{m('pendingHint')}</small></aside></div>
    <p className={css.muted}>{m('previewHint')}</p>
    {!rows.length?<Empty>{m('emptyMonth')}</Empty>:<div className={css.tableWrap}><table className={`${css.table} ${css.monthTable}`}><thead><tr><th aria-label={t('select')}/><th>{t('name')}</th><th>{t('kind')}</th><th>{m('monthlyAmount')}</th><th>{m('socialSecurity')}</th><th>{t('wht')}</th><th>{t('net')}</th><th>{t('note')}</th><th>{m('actions')}</th></tr></thead><tbody>{rows.map(r=><tr key={r.payee_id} data-person={r.payee_id} data-selected={selected.includes(r.payee_id)}><td><input type="checkbox" aria-label={t('select')+': '+r.name} disabled={blocked||!canPay(r)} checked={selected.includes(r.payee_id)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.payee_id]:s.filter(id=>id!==r.payee_id))}/></td><td data-label={t('name')}><strong>{r.name}</strong><small>{r.destination?.summary||m('destination_missing')}</small></td><td data-label={t('kind')}><span className={css.badge}>{r.kind?t(r.kind):'—'}</span></td><td data-label={m('monthlyAmount')}>{r.line?.reviewed?money(r.line.base_amount):r.recurring_amount!==null?money(r.recurring_amount):'—'}{r.recurring_amount!==null&&r.line?.requires_base_review&&<small>{t('rate')}: {money(r.recurring_amount)}</small>}</td><td data-label={m('socialSecurity')}>{r.kind==='contractor'?m('noSS'):r.line?.reviewed?`${money(r.line.employee_ss)} / ${money(r.line.employer_ss)}`:m('unresolved')}</td><td data-label={t('wht')}>{r.line?.reviewed?money(r.line.wht_amount):'—'}</td><td data-label={t('net')}><strong>{r.line?.reviewed?money(r.line.net_amount):'—'}</strong></td><td data-label={t('note')}><span className={r.state==='paid'?css.readyState:css.reviewState}>{m(r.state)}</span>{r.issues.map(x=><small key={x}>{issueText(x)}</small>)}{r.source?.requires_base_review&&!r.line?.reviewed&&<small>{m('noAutoAmount')}</small>}{r.line?.adjustment_reason&&<small>{r.line.adjustment_reason}</small>}</td><td><div className={css.rowActions}>
     {canPay(r)?<button className={ui.primary} disabled={blocked} onClick={()=>openPay(r)}>{r.line?.net_amount===0?m('finishZero'):m('pay')}</button>:null}
     {!r.line?.frozen_json&&r.source&&!r.issues.some(x=>['missing_rate','mixed_engagement','no_engagement','source_changed'].includes(x))&&<button className={ui.secondary} disabled={blocked} onClick={()=>{setRow(r);setModal('review');}}>{r.state==='amount_required'?m('enterAmount'):m('reviewFacts')}</button>}
     {r.issues.includes('source_changed')&&<button className={ui.secondary} disabled={blocked} onClick={()=>{setRow(r);setModal('reload');}}>{m('reloadPerson')}</button>}
     {r.state==='setup_incomplete'&&r.issues.some(x=>x!=='monthly_facts_required')&&<button className={ui.secondary} onClick={()=>setTab('people')}>{m('setup')}</button>}
     {r.payment?.status==='draft'&&<button className={ui.secondary} disabled={blocked} onClick={()=>{setRow(r);setModal('cancel_legacy');}}>{t('cancelPrepared')}</button>}
     {!!r.line?.frozen_json&&<button className={ui.secondary} onClick={()=>{setRow(r);setModal('history');}}>{m('paymentHistory')}</button>}
    </div></td></tr>)}</tbody></table></div>}
    {rows.length>0&&<div className={css.toolbar}><label className={css.check}><input type="checkbox" disabled={blocked||!eligible.length} checked={eligible.length>0&&eligible.every(r=>selected.includes(r.payee_id))} onChange={e=>setSelected(e.target.checked?eligible.map(r=>r.payee_id):[])}/>{m('selectReady')}</label><strong>{t('selected').replace('{n}',String(chosen.length)).replace('{amount}',chosen.some(r=>!r.line?.reviewed)?m('unresolved'):money(selectedNet(chosen)))}</strong><button className={ui.primary} disabled={blocked||!chosen.length||!chosen.every(canPay)} onClick={()=>openPay()}>{m('paySelected').replace('{n}',String(chosen.length))}</button></div>}
   </>}
   {tab==='people'&&<><div className={css.toolbar}><h2>{t('people')}</h2><button className={ui.primary} disabled={blocked} onClick={()=>{setPerson(null);setModal('engagement');}}><Plus size={16}/>{t('addPerson')}</button></div><p className={css.muted}>{t('identityHint')}</p>{!setupPeople.length?<Empty>{t('emptyPeople')}</Empty>:<div className={css.tableWrap}><table className={`${css.table} ${css.monthTable}`}><thead><tr><th>{t('name')}</th><th>{t('kind')}</th><th>{t('rate')}</th><th>{m('recipient')}</th><th>{m('actions')}</th></tr></thead><tbody>{setupPeople.map(p=>{const e=effective(p.engagements,data.today),r=effective(p.rates,data.today),payment=payrollPaymentReadiness(p);return <tr key={p.id}><td data-label={t('name')}><strong>{p.legal_name}</strong><small>{t(!e?'notStarted':e.active?'active':'inactive')}</small></td><td data-label={t('kind')}>{e?t(e.kind):'—'}{e?.kind==='contractor'&&<small>{m('socialSecurity')}: {m('noSS')}</small>}</td><td data-label={t('rate')}>{r?money(r.monthly_amount):'—'}<small>{r?dateLabel(r.effective_from,locale):m('missing_rate')}</small></td><td data-label={m('recipient')}>{payment.bank?payment.summary:m('destination_missing')}<small>{payment.recipient?t('recipientSaved'):t('missingPayee')}</small></td><td><details><summary>{m('personHistory')}</summary><div className={css.rowActions}><button className={ui.secondary} disabled={blocked} onClick={()=>{setPerson(p);setModal('rate');}}>{t('changeRate')}</button><button className={ui.secondary} disabled={blocked} onClick={()=>{setPerson(p);setModal('engagement');}}>{t(e&&!e.active?'resumeEngagement':'changeEngagement')}</button>{e?.active&&<button className={ui.secondary} disabled={blocked} onClick={()=>{setPerson(p);setModal('end_engagement');}}>{t('endEngagement')}</button>}<button className={ui.secondary} disabled={blocked} onClick={()=>setPayee(payrollPeopleOptions(data.people_options).find(y=>y.id===p.id))}>{t('paymentIdentity')}</button></div><div className={css.history}><strong>{t('history')}</strong>{p.rates.map(x=><p key={x.id}>{dateLabel(x.effective_from,locale)} · {money(x.monthly_amount)} THB · {x.reason}</p>)}<strong>{t('engagementHistory')}</strong>{p.engagements.map(x=><p key={x.id}>{dateLabel(x.effective_from,locale)} · {t(x.kind)} · {t(x.active?'active':'inactive')} · {x.reason}</p>)}</div></details></td></tr>;})}</tbody></table></div>}</>}
   {tab==='obligations'&&<><h2>{t('obligations')}</h2><p className={css.notice}>{t('obligationHint')}</p>{!data.obligations.length?<Empty>{t('empty')}</Empty>:<div className={css.tableWrap}><table className={`${css.table} ${css.monthTable}`}><thead><tr><th>{m('month')}</th><th>{t('name')}</th><th>{t('obligations')}</th><th>THB</th></tr></thead><tbody>{data.obligations.map(o=><tr key={o.id}><td data-label={m('month')}>{monthLabel(o.month,locale)}</td><td data-label={t('name')}>{o.name}</td><td data-label={t('obligations')}>{t(o.kind)}<small>{t('pending')}</small></td><td data-label="THB">{money(o.amount)}</td></tr>)}</tbody></table></div>}</>}
   {(modal==='rate'||modal==='engagement'||modal==='end_engagement')&&<PersonForm mode={modal} data={data} person={person} t={t} busy={busy} onClose={close} onChange={mutate} onPayee={setPayee}/>}
   {modal==='cancel_legacy'&&row&&<CancelLegacyPayment row={row} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='review'&&row&&<ReviewForm row={row} month={monthly.month} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='pay'&&chosen.length>0&&<MonthlyPayment rows={chosen} data={data} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='reload'&&row&&<DetailModal open title={m('reloadPerson')+' · '+row.name} size="confirm" onClose={close} closeOnBackdrop={!busy}><p className={css.notice}>{m('reloadHint')}</p><button className={ui.primary} disabled={blocked} onClick={async()=>{if(await mutate({action:'monthly_reload',month:monthly.month,items:[lineIdentity(row,row.line!.id)]}))close();}}>{t('confirm')}</button></DetailModal>}
   {modal==='history'&&row&&<DetailModal open title={m('paymentHistory')+' · '+row.name} size="confirm" onClose={close}><div className={css.form}><span className={css.badge}>{m(row.state)}</span><strong>{money(row.line!.net_amount)} THB</strong><p>{row.payment?.destination_summary||row.destination?.summary}</p>{row.payment?.paid_on&&<p>{dateLabel(row.payment.paid_on,locale)}</p>}<p>{row.line?.note}</p><p>{row.line?.adjustment_reason}</p><p className={css.notice}>{m('frozen')}</p></div></DetailModal>}
   {payee&&<PayeeModal payee={payee} onClose={()=>setPayee(undefined)} onSaved={()=>{setPayee(undefined);setError(null);void load().then(()=>setNotice('recipientSaved')).catch(()=>{setStale(true);setNotice('savedReadFailed');});}}/>}
  </>}
 </main></Feedback.Provider>;
}
function PersonForm({mode,data,person,t,busy,onClose,onChange,onPayee}:{mode:'engagement'|'end_engagement'|'rate';data:PayrollData;person:Person|null;t:Text;busy:boolean;onClose:()=>void;onChange:Change;onPayee:(p:Payee)=>void}){
 const options=person?payrollPeopleOptions(data.people_options):data.new_people_options;
 const [id]=useState(()=>crypto.randomUUID()),[selected,setSelected]=useState(person?.id||''),option=options.find(p=>p.id===selected);
 const [kind,setKind]=useState(effective(person?.engagements||[],data.today)?.kind||'employee');
 const ending=mode==='end_engagement';
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!option?.version)return;
  const f=new FormData(e.currentTarget),effectiveFrom=String(f.get('effective_from'));
  const payload={id,payee_id:option.id,effective_from:effectiveFrom,reason:String(f.get('reason')),
   ...(mode==='rate'?{monthly_amount:Number(f.get('monthly_amount'))}:{kind:ending?(effective(person?.engagements||[],effectiveFrom)?.kind||kind):kind,active:!ending})};
  if(await onChange({action:mode==='rate'?'rate':'engagement',payload}))onClose();
 }
 const title=t(mode==='rate'?'changeRate':ending?'endEngagement':person?(effective(person.engagements,data.today)?.active===false?'resumeEngagement':'changeEngagement'):'addPerson');
 return <DetailModal open title={title} size="edit" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={submit}>
  <p className={css.notice}>{t(ending?'endEngagementHint':'effectiveHint')}</p>
  {person?<Field label={t('name')}><input value={person.legal_name} readOnly/></Field>:<div className={css.field}>
   <label htmlFor="payroll-person">{t('name')}</label>
   <SearchableCombobox id="payroll-person" label={t('name')} value={selected} disabled={busy} onChange={setSelected}
    options={data.new_people_options.map(p=>({value:p.id,label:{th:p.display_label,en:p.display_label}}))}
    placeholder={t('searchPeople')} requiredMessage={t('selectPerson')}/>
   <p className={css.muted}>{t('eligiblePeopleHint')}</p>
   {!options.length&&<p className={css.notice}>{t('noEligiblePeople')}</p>}
  </div>}
  {option&&!option.version?<><p className={css.warning}>{t('destinationRequired')}</p><button type="button" className={ui.secondary} onClick={()=>onPayee(option)}>{t('paymentIdentity')}</button></>:null}
  {mode==='rate'?<Field label={t('rate')}><input name="monthly_amount" type="number" min="0.01" step="0.01" required disabled={busy}/></Field>:ending?<p>{t(kind)}</p>:<>
   <Field label={t('kind')}><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)} disabled={busy}><option value="employee">{t('employee')}</option><option value="contractor">{t('contractor')}</option></select></Field>
   {kind==='contractor'&&<p className={css.notice}>{t('contractorHint')}</p>}
  </>}
  <Field label={t('effective')}><input name="effective_from" type="date" required disabled={busy} defaultValue={data.today}/></Field>
  <Field label={t('reason')}><textarea name="reason" required maxLength={2000} disabled={busy}/></Field>
  <button className={ending?ui.danger:ui.primary} disabled={busy||!option?.version}>{t(ending?'endEngagement':'save')}</button>
 </PayrollForm></DetailModal>;
}
function AmountFields({row,busy}:{row:MonthlyRow;busy:boolean}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),m=(k:MonthlyLabel)=>mt(locale,k),l=row.line;
 const partial=!!(l?.requires_base_review||row.source?.requires_base_review),known=knownMonthlyFacts(row);
 const [taxTreatment,setTaxTreatment]=useState(known.wht_treatment||'');
 const missingSS=row.kind==='employee'?(['employee_ss','employer_ss'] as const).filter(key=>known[key]===undefined):[];
 const missingTax=known.wht_treatment===undefined,missing=missingTax||missingSS.length>0;
 const amount=l?.reviewed?Number(l.base_amount):partial?'':row.recurring_amount??'';
 return <>
  {partial&&<p className={css.warning}>{m('noAutoAmount')}</p>}
  <Field label={m('actualMonthlyAmount')}><input name="base_amount" type="number" min="0" step="0.01" required defaultValue={amount} disabled={busy}/></Field>
  <Field label={m('amountReason')}><textarea name="note" defaultValue={l?.note||l?.adjustment_reason||''} required maxLength={2000} disabled={busy}/></Field>
  {missing&&<div className={css.missingFacts}>
   <strong>{m('missingFacts')}</strong><p className={css.muted}>{m('missingFactsHint')}</p>
   {missingTax&&<Field label={t(row.kind==='employee'?'employee_wht':'contractor_wht')}><select name="wht_treatment" value={taxTreatment} required disabled={busy} onChange={e=>setTaxTreatment(e.target.value)}><option value="">{m('chooseTreatment')}</option><option value="none">{t('none')}</option><option value="withhold">{t('withhold')}</option></select></Field>}
   {missingTax&&taxTreatment==='withhold'&&<Field label={t('wht')}><input name="wht_amount" type="number" min="0.01" step="0.01" required disabled={busy}/></Field>}
   {missingSS.length>0&&<div className={css.formGrid}>{missingSS.map(key=><Field key={key} label={t(key)}><input name={key} type="number" min="0" step="0.01" required disabled={busy}/></Field>)}</div>}
   {row.kind==='contractor'&&<p className={css.muted}>{t('contractorHint')}</p>}
  </div>}
  {!partial&&missing&&<details className={css.adjustments}><summary>{m('otherAdjustments')}</summary><div className={css.formGrid}>{(['additions','deductions'] as const).map(key=><Field key={key} label={t(key)}><input name={key} type="number" min="0" step="0.01" required defaultValue={Number(l?.[key]??0)} disabled={busy}/></Field>)}</div></details>}
 </>;
}
function ReviewForm({row,month,busy,onClose,onChange}:{row:MonthlyRow;month:string;busy:boolean;onClose:()=>void;onChange:Change}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),[id]=useState(()=>crypto.randomUUID()),[error,setError]=useState('');
 const [net,setNet]=useState<number|null>(row.line?.reviewed?row.line.net_amount:null);
 function update(form:HTMLFormElement){try{setNet(netPay(monthlyFacts(row,new FormData(form))));}catch{setNet(null);}}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();try{const facts=monthlyFacts(row,new FormData(e.currentTarget));if(netPay(facts)<0)throw Error('PAYROLL_INPUT_INVALID');if(await onChange({action:'monthly_save',month,items:[{...lineIdentity(row,id),facts}]}))onClose();}catch(e){setError(monthlyError(locale,e)||payrollError(locale,e));}}
 return <DetailModal open title={mt(locale,row.state==='amount_required'?'enterAmount':'reviewFacts')+' · '+row.name} size="edit" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={submit} onChange={e=>update(e.currentTarget)}><p>{monthLabel(month,locale)}</p>{error&&<p className={css.error} role="alert">{error}</p>}<AmountFields row={row} busy={busy}/><div className={css.summary}><span>{t('net')}</span><strong>{net===null?'—':net.toLocaleString(locale,{minimumFractionDigits:2})} THB</strong></div><button className={ui.primary} disabled={busy}>{t('save')}</button></PayrollForm></DetailModal>;
}
function MonthlyPayment({rows,data,busy,onClose,onChange}:{rows:MonthlyRow[];data:WorkspaceData;busy:boolean;onClose:()=>void;onChange:Change}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),m=(k:MonthlyLabel)=>mt(locale,k);
 const allZero=rows.every(r=>r.line?.reviewed&&r.line.net_amount===0);
 const [choices,setChoices]=useState(()=>Object.fromEntries(rows.map(r=>[r.payee_id,{lineId:crypto.randomUUID(),id:r.payment?.id||crypto.randomUUID(),account:r.payment?.bank_account_id||r.payment?.cash_location_id||'',date:r.payment?.paid_on||data.today}])));
 const [ack,setAck]=useState(false),[error,setError]=useState(''),[amounts,setAmounts]=useState<Record<string,number|null>>(()=>Object.fromEntries(rows.map(r=>[r.payee_id,r.line?.reviewed?r.line.net_amount:null])));
 function formFacts(form:HTMLFormElement,r:MonthlyRow){const section=form.querySelector<HTMLFieldSetElement>(`fieldset[data-facts="${r.payee_id}"]`),fields=new FormData();section?.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea').forEach(input=>{if(input instanceof HTMLInputElement&&input.type==='checkbox'&&!input.checked)return;fields.set(input.name,input.value);});return monthlyFacts(r,fields);}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();try{const items=rows.map(r=>{const c=choices[r.payee_id],facts=r.line?.reviewed?null:formFacts(e.currentTarget,r),net=facts?netPay(facts):r.line!.net_amount;const a=data.accounts.find(x=>accountKey(x)===c.account);if(net<0||(!a&&net>0))throw Error('PAYROLL_ACCOUNT_DENIED');return {...lineIdentity(r,c.lineId),...(facts?{facts}:{}),payout_id:c.id,payout_version:r.payment?.version||null,payee_version:r.payee_version,destination_id:r.destination?.id,bank_account_id:a?.bank_account_id||null,cash_location_id:a?.cash_location_id||null,paid_on:c.date};});if(await onChange({action:'monthly_pay',month:data.monthly.month,items,acknowledged:ack}))onClose();}catch(e){setError(monthlyError(locale,e)||payrollError(locale,e));}}
 return <DetailModal open title={allZero?m('finishZero'):t('confirm')} size="workflow" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={submit} onChange={e=>{const form=e.currentTarget;setAmounts(Object.fromEntries(rows.map(r=>{try{return[r.payee_id,r.line?.reviewed?r.line.net_amount:netPay(formFacts(form,r))];}catch{return[r.payee_id,null];}})));}}><p className={css.notice}>{m('separate')}</p>{error&&<p className={css.error} role="alert">{error}</p>}<div className={css.paymentRows}>{rows.map(r=><section className={css.paymentRow} key={r.payee_id}><div className={css.toolbar}><strong>{r.name}</strong><strong>{amounts[r.payee_id]===null?'—':amounts[r.payee_id]?.toLocaleString(locale,{minimumFractionDigits:2})} THB</strong></div><p>{t(r.kind!)} · {monthLabel(data.monthly.month,locale)}</p><p>{m('recipient')}: {r.destination?.summary||m('cashOnly')}</p>{!r.line?.reviewed&&<fieldset className={css.facts} data-facts={r.payee_id}><legend>{m('reviewFacts')}</legend><AmountFields row={r} busy={busy}/></fieldset>}{r.line?.net_amount===0?<p className={css.notice}>{m('zeroHint')}</p>:<div className={css.formGrid}><Field label={t('account')}><select required value={choices[r.payee_id].account} disabled={busy||!!r.payment} onChange={e=>setChoices(c=>({...c,[r.payee_id]:{...c[r.payee_id],account:e.target.value}}))}><option value="">{t('chooseAccount')}</option>{data.accounts.filter(a=>r.destination||!a.bank_account_id).map(a=><option key={accountKey(a)} value={accountKey(a)}>{locale==='en'?a.name_en:a.name_th}</option>)}</select></Field><Field label={t('paymentDate')}><input type="date" required value={choices[r.payee_id].date} disabled={busy||!!r.payment} onChange={e=>setChoices(c=>({...c,[r.payee_id]:{...c[r.payee_id],date:e.target.value}}))}/></Field></div>}</section>)}</div><label className={css.check}><input type="checkbox" checked={ack} required disabled={busy} onChange={e=>setAck(e.target.checked)}/>{allZero?m('zeroAck'):t('paymentAck')}</label><button className={ui.primary} disabled={busy||!ack}>{allZero?m('finishZero'):t('confirm')}</button></PayrollForm></DetailModal>;
}

// Recovery for drafts prepared before 091. Normal monthly Pay never stops at
// this intermediate state; cancellation retains frozen facts and creates no cash.
function CancelLegacyPayment({row,busy,onClose,onChange}:{row:MonthlyRow;busy:boolean;onClose:()=>void;onChange:Change}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),[ack,setAck]=useState(false);
 return <DetailModal open title={t('cancelPrepared')+' · '+row.name} size="confirm" onClose={onClose} closeOnBackdrop={!busy}><div className={css.form}><p>{row.line?.net_amount.toLocaleString(locale,{minimumFractionDigits:2})} THB</p><label className={css.check}><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>{t('cancelAck')}</label><button className={ui.danger} disabled={busy||!ack} onClick={async()=>{if(await onChange({action:'cancel',items:[{line_id:row.line!.id,payout_id:row.payment!.id,payout_version:row.payment!.version}],acknowledged:true}))onClose();}}>{t('cancelPrepared')}</button></div></DetailModal>;
}
