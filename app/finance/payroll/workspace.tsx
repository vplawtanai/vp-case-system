'use client';
import {useCallback,useEffect,useRef,useState,useContext,createContext,type FormEvent,type ReactNode,type ComponentProps} from 'react';
import {ChevronLeft,ChevronRight,LockKeyhole,Plus,RefreshCw,Pencil,MoreHorizontal} from 'lucide-react';
import BaseModal,{type DetailModalProps} from '../../components/DetailModal';
import ui from '../../components/ui/vp-ui.module.css';
import {useI18n} from '../../../lib/i18n/provider';
import {SearchableCombobox} from '../expenses/searchable-combobox';
import {PayeeModal} from '../payouts/payee-modal';
import type {Payee} from '../payouts/shared';
import {payrollRequest} from './client';
import {payrollText,payrollError,type PayrollLabel} from './labels';
import {effective,payrollPeopleOptions,netPay,accountKey,type PayrollData,type Person} from './model';
import {mt,monthLabel,dateLabel,shiftMonth,selectedNet,lineIdentity,monthlyFacts,knownMonthlyFacts,monthlyError,monthlyText,type MonthlyRow,type WorkspaceData,type MonthlyLabel} from './monthly';
import {st,workspacePeople,recurringRate,readyForConfirmation,type SingleLabel} from './single-page';
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
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),m=(k:MonthlyLabel)=>mt(locale,k),s=(k:SingleLabel)=>st(locale,k),money=(n:number)=>Number(n).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2});
 const [data,setData]=useState<WorkspaceData|null>(null),[month,setMonth]=useState(''),[includeInactive,setIncludeInactive]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<unknown>(null),[notice,setNotice]=useState<PayrollLabel|null>(null),[stale,setStale]=useState(false);
 const [modal,setModal]=useState<'engagement'|'end_engagement'|'rate'|'pay'|'review'|'history'|'manage'|'correct'|'cancel_legacy'|null>(null),[person,setPerson]=useState<Person|null>(null),[row,setRow]=useState<MonthlyRow|null>(null),[payee,setPayee]=useState<Payee|undefined>(),[selected,setSelected]=useState<string[]>([]);
 const [correction,setCorrection]=useState<{kind:'setup'|'rate'|'line';payee_id:string;target:string|null;name:string;affected:number}|null>(null);
 const lock=useRef(false),sequence=useRef(0),pending=useRef<{body:string;id:string}|null>(null);
 const load=useCallback(async()=>{const seq=++sequence.current;setLoading(true);try{const result=await payrollRequest(undefined,undefined,month||undefined);if(seq!==sequence.current)return;if(!Array.isArray(result.monthly?.rows)||!Array.isArray(result.people)||!Array.isArray(result.new_people_options)||!result.corrections)throw Error('PAYROLL_FAILED');setData(result);setStale(false);}finally{if(seq===sequence.current)setLoading(false);}},[month]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{void load().catch(e=>{setStale(true);setError(e);});return invalidate;},[load,invalidate]);
 async function mutate(body:Body){if(lock.current||stale)return false;lock.current=true;setBusy(true);setError(null);setNotice(null);const encoded=JSON.stringify(body);if(pending.current?.body!==encoded)pending.current={body:encoded,id:crypto.randomUUID()};try{await payrollRequest({...body,request_id:pending.current.id});pending.current=null;try{await load();setNotice(body.action==='monthly_pay'?'paymentDone':'saved');}catch{setStale(true);setNotice('savedReadFailed');}setSelected([]);return true;}catch(e){setError(e);return false;}finally{lock.current=false;setBusy(false);}}
 function close(){if(!lock.current){setModal(null);setRow(null);setError(null);}}
 const blocked=busy||loading||stale,monthly=data?.monthly,rows=monthly?.rows||[],chosen=rows.filter(r=>selected.includes(r.payee_id)),eligible=rows.filter(readyForConfirmation);
 const issuePerson=(error as {issue?:{person?:string}})?.issue?.person,code=String((error as Error)?.message||'');
 const errorMessage=error?(issuePerson?issuePerson+': ':'')+(/CORRECTION_FINALIZED/.test(code)?s('locked'):monthlyError(locale,error)||payrollError(locale,error)):'';
 function changeMonth(value:string){if(blocked)return;setMonth(value);setSelected([]);setError(null);setNotice(null);}
 function openPay(r?:MonthlyRow){if(r)setSelected([r.payee_id]);setError(null);setModal('pay');}
 function edit(r:MonthlyRow,p?:Person){setError(null);setPerson(p||null);setRow(r);setModal('review');}
 function setup(p:Person|null,mode:'rate'|'engagement'|'end_engagement'|'manage'){setError(null);setPerson(p);setModal(mode);}
 function bank(id:string){setError(null);setModal(null);setPayee(data?.people_options.find(p=>p.id===id));}
 function remove(kind:'setup'|'rate'|'line',id:string,target:string|null,name:string,affected:number){setError(null);setCorrection({kind,payee_id:id,target,name,affected});setModal('correct');}
 const issueText=(issue:string)=>issue in monthlyText?m(issue as MonthlyLabel):m('setup_incomplete');
 return <Feedback.Provider value={errorMessage}><main className={`${ui.scope} ${css.root}`}>
  <header className={css.header}><div><span className={css.badge}><LockKeyhole size={13}/>&nbsp;{t('private')}</span><h1>{t('title')}</h1><p className={css.muted}>{s('intro')}</p></div><div className={css.actions}><button className={ui.secondary} disabled={busy||loading} onClick={()=>{setError(null);void load().catch(e=>{setStale(true);setError(e);});}}><RefreshCw size={16}/>{t('reload')}</button><button className={ui.primary} disabled={blocked} onClick={()=>setup(null,'engagement')}><Plus size={16}/>{t('addPerson')}</button></div></header>
  {errorMessage&&!modal&&<p className={css.error} role="alert">{errorMessage}</p>}{notice&&<p className={css.success} role="status">{t(notice)}</p>}
  {loading&&!data?<p role="status">{t('loading')}</p>:data&&monthly&&<>
   <div className={css.monthBar}><button className={ui.secondary} aria-label={m('previous')} disabled={blocked} onClick={()=>changeMonth(shiftMonth(monthly.month,-1))}><ChevronLeft size={20}/></button><h2>{monthLabel(monthly.month,locale)}</h2><button className={ui.secondary} aria-label={m('next')} disabled={blocked} onClick={()=>changeMonth(shiftMonth(monthly.month,1))}><ChevronRight size={20}/></button></div>
   <div className={css.monthSummary}><div className={css.metrics}>{([['peopleCount',monthly.summary.people],['ready',eligible.length],['paid',monthly.summary.paid],['unconfirmedTotal',money(monthly.summary.net_total)+' THB']] as const).map(([key,value])=><div key={key}><span>{m(key)}</span><strong>{value}</strong></div>)}</div><aside className={css.obligationSummary}><strong>{m('finalObligations')}</strong>{(['employee_ss','employer_ss','employee_wht','contractor_wht'] as const).map(k=><div key={k}><span>{t(k)}</span><b>{money(monthly.obligations[k]||0)}</b></div>)}<small>{m('pendingHint')}</small></aside></div>
   <label className={css.check}><input type="checkbox" checked={includeInactive} onChange={e=>setIncludeInactive(e.target.checked)}/>{s('allPeople')}</label>
   {!workspacePeople(data,includeInactive).length?<Empty>{m('emptyMonth')}</Empty>:<div className={css.tableWrap}><table className={`${css.table} ${css.monthTable}`}><thead><tr><th aria-label={t('select')}/><th>{t('name')}</th><th>{t('kind')}</th><th>{s('recurring')}</th><th>{s('extras')}</th><th>{s('deductions')}</th><th>{m('socialSecurity')}</th><th>{t('wht')}</th><th>{t('net')}</th><th>{s('status')}</th><th>{m('actions')}</th></tr></thead><tbody>{workspacePeople(data,includeInactive).map(({row:r,person:p})=>{
    const rate=recurringRate(p,monthly.month),editable=!r.line?.frozen_json&&!!r.source&&!r.issues.some(x=>['missing_rate','mixed_engagement','no_engagement','source_changed'].includes(x));
    const amount=rate?.monthly_amount??r.recurring_amount,known=knownMonthlyFacts(r),frozen=!!r.line?.frozen_json;
    const monthlyButton=(label:string,value:string)=> <button className={css.cellEdit} disabled={blocked||!editable} aria-label={label+' · '+r.name} onClick={()=>edit(r,p)}>{value}{editable&&<Pencil size={12} aria-hidden/>}</button>;
    return <tr key={r.payee_id} data-person={r.payee_id} data-selected={selected.includes(r.payee_id)}><td><input type="checkbox" aria-label={t('select')+': '+r.name} disabled={blocked||!readyForConfirmation(r)} checked={selected.includes(r.payee_id)} onChange={e=>setSelected(v=>e.target.checked?[...v,r.payee_id]:v.filter(id=>id!==r.payee_id))}/></td>
     <td data-label={t('name')}><strong>{r.name}</strong><button className={css.bankLink} disabled={blocked} onClick={()=>bank(r.payee_id)}>{r.destination?.summary||s('bank')}<Pencil size={11}/></button></td>
     <td data-label={t('kind')}><button className={`${css.badge} ${css.cellEdit}`} disabled={blocked||!p} onClick={()=>setup(p||null,'engagement')}>{r.kind?t(r.kind):'—'}<Pencil size={11}/></button></td>
     <td data-label={s('recurring')}><button className={css.cellEdit} disabled={blocked||!p} aria-label={s('editRate')+' · '+r.name} onClick={()=>setup(p||null,'rate')}>{amount==null?'—':money(amount)}<Pencil size={12}/></button><small>{rate?dateLabel(rate.effective_from,locale):m('missing_rate')}</small>{r.line?.reviewed&&Number(r.line.base_amount)!==Number(amount)&&<small>{m('actualMonthlyAmount')}: {money(r.line.base_amount)}</small>}</td>
     <td data-label={s('extras')}>{monthlyButton(s('extras'),money(r.line?.additions||0))}</td><td data-label={s('deductions')}>{monthlyButton(s('deductions'),money(r.line?.deductions||0))}</td>
     <td data-label={m('socialSecurity')}>{r.kind==='contractor'?m('noSS'):monthlyButton(m('socialSecurity'),known.employee_ss===undefined?'—':money(known.employee_ss)+' / '+money(known.employer_ss||0))}</td>
     <td data-label={t('wht')}>{monthlyButton(t('wht'),known.wht_amount===undefined?'—':money(known.wht_amount))}</td><td data-label={t('net')}><strong>{r.line?.reviewed?money(r.line.net_amount):'—'}</strong></td>
     <td data-label={s('status')}><span className={r.state==='paid'?css.readyState:css.reviewState}>{m(r.state)}</span>{r.issues.filter(x=>x!=='monthly_facts_required').map(x=><small key={x}>{issueText(x)}</small>)}</td>
     <td><div className={css.rowActions}>{readyForConfirmation(r)&&<button className={ui.primary} disabled={blocked} onClick={()=>openPay(r)}>{r.line?.net_amount===0?m('finishZero'):m('pay')}</button>}
      {editable&&<button className={ui.secondary} disabled={blocked} onClick={()=>edit(r,p)}>{s('edit')}</button>}
      {r.issues.includes('source_changed')&&r.line&&<button className={ui.secondary} disabled={blocked||!data.corrections[r.payee_id]?.lines[r.line.id]} onClick={()=>remove('line',r.payee_id,r.line!.id,r.name,1)}>{s('reset')}</button>}
      {frozen&&<button className={ui.secondary} onClick={()=>{setRow(r);setModal('history');}}>{m('paymentHistory')}</button>}
      <button className={ui.secondary} disabled={blocked||!p} aria-label={s('manage')+' · '+r.name} onClick={()=>setup(p||null,'manage')}><MoreHorizontal size={16}/></button>
     </div></td></tr>;
   })}</tbody></table></div>}
   {rows.length>0&&<div className={css.toolbar}><label className={css.check}><input type="checkbox" disabled={blocked||!eligible.length} checked={eligible.length>0&&eligible.every(r=>selected.includes(r.payee_id))} onChange={e=>setSelected(e.target.checked?eligible.map(r=>r.payee_id):[])}/>{m('selectReady')}</label><strong>{t('selected').replace('{n}',String(chosen.length)).replace('{amount}',money(selectedNet(chosen)))}</strong><button className={ui.primary} disabled={blocked||!chosen.length||!chosen.every(readyForConfirmation)} onClick={()=>openPay()}>{m('paySelected').replace('{n}',String(chosen.length))}</button></div>}
   {(modal==='rate'||modal==='engagement'||modal==='end_engagement')&&<PersonForm mode={modal} data={data} person={person} t={t} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='review'&&row&&<ReviewForm row={row} month={monthly.month} busy={busy} onClose={close} onChange={mutate} onReset={row.line&&data.corrections[row.payee_id]?.lines[row.line.id]?()=>remove('line',row.payee_id,row.line!.id,row.name,1):undefined}/>}
   {modal==='pay'&&chosen.length>0&&<MonthlyPayment rows={chosen} data={data} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='cancel_legacy'&&row&&<CancelLegacyPayment row={row} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='correct'&&correction&&<CorrectionModal correction={correction} hash={data.corrections[correction.payee_id]?.hash} busy={busy} onClose={close} onChange={mutate}/>}
   {modal==='manage'&&person&&<DetailModal open title={s('manage')+' · '+person.legal_name} size="edit" onClose={close}><div className={css.form}>
    <div className={css.actions}><button className={ui.secondary} onClick={()=>setup(person,'engagement')}>{t('changeEngagement')}</button><button className={ui.secondary} onClick={()=>setup(person,'end_engagement')}>{t('endEngagement')}</button><button className={ui.secondary} onClick={()=>bank(person.id)}>{s('bank')}</button></div>
    <h3>{t('history')}</h3><div className={css.history}>{person.rates.map(rate=><article key={rate.id}><strong>{money(rate.monthly_amount)} THB</strong><span>{dateLabel(rate.effective_from,locale)} · {rate.reason}</span>{data.corrections[person.id]?.rates[rate.id]?.allowed?<button className={ui.danger} onClick={()=>remove('rate',person.id,rate.id,person.legal_name,data.corrections[person.id].rates[rate.id].affected_lines)}>{s('deleteRate')}</button>:<small>{s('locked')}</small>}</article>)}</div>
    <button className={ui.secondary} onClick={()=>setup(person,'rate')}>{s('editRate')}</button><h3>{t('engagementHistory')}</h3>{person.engagements.map(e=><p key={e.id}>{dateLabel(e.effective_from,locale)} · {t(e.kind)} · {t(e.active?'active':'inactive')} · {e.reason}</p>)}
    {data.corrections[person.id]?.setup_allowed?<button className={ui.danger} onClick={()=>remove('setup',person.id,null,person.legal_name,data.corrections[person.id].line_count)}>{s('deleteSetup')}</button>:<p className={css.notice}>{s('locked')}</p>}
   </div></DetailModal>}
   {modal==='history'&&row&&<DetailModal open title={m('paymentHistory')+' · '+row.name} size="confirm" onClose={close}><div className={css.form}><span className={css.badge}>{m(row.state)}</span><strong>{money(row.line!.net_amount)} THB</strong><p>{row.payment?.destination_summary||row.destination?.summary}</p>{row.payment?.paid_on&&<p>{dateLabel(row.payment.paid_on,locale)}</p>}<p>{row.line?.note}</p><p className={css.notice}>{m('frozen')}</p>{row.payment?.status==='draft'&&<button className={ui.secondary} onClick={()=>setModal('cancel_legacy')}>{t('cancelPrepared')}</button>}</div></DetailModal>}
   {payee&&<PayeeModal payee={payee} onClose={()=>setPayee(undefined)} onSaved={()=>{setPayee(undefined);setError(null);void load().then(()=>setNotice('recipientSaved')).catch(()=>{setStale(true);setNotice('savedReadFailed');});}}/>}
  </>}
 </main></Feedback.Provider>;
}
function CorrectionModal({correction,hash,busy,onClose,onChange}:{correction:{kind:'setup'|'rate'|'line';payee_id:string;target:string|null;name:string;affected:number};hash?:string;busy:boolean;onClose:()=>void;onChange:Change}){
 const {locale}=useI18n(),title=st(locale,correction.kind==='setup'?'deleteSetup':correction.kind==='rate'?'deleteRate':'reset');
 return <DetailModal open title={title} size="confirm" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={async e=>{const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();if(await onChange({action:'correct',payload:{...correction,expected_hash:hash,reason}}))onClose();}}><strong>{correction.name}</strong><p>{st(locale,correction.kind==='line'?'resetHint':'deleteHint')}</p>{correction.kind!=='line'&&correction.affected>0&&<p className={css.warning}>{st(locale,'affected').replace('{n}',String(correction.affected))}</p>}<Field label={payrollText(locale,'reason')}><textarea name="reason" required maxLength={2000} disabled={busy}/></Field><div className={css.actions}><button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{st(locale,'cancel')}</button><button className={ui.danger} disabled={busy||!hash}>{st(locale,'confirmDelete')}</button></div></PayrollForm></DetailModal>;
}
function PersonForm({mode,data,person,t,busy,onClose,onChange}:{mode:'engagement'|'end_engagement'|'rate';data:PayrollData;person:Person|null;t:Text;busy:boolean;onClose:()=>void;onChange:Change}){
 const {locale}=useI18n(),s=(k:SingleLabel)=>st(locale,k),options=person?payrollPeopleOptions(data.people_options):data.new_people_options;
 const [id]=useState(()=>crypto.randomUUID()),[selected,setSelected]=useState(person?.id||''),option=options.find(p=>p.id===selected);
 const [kind,setKind]=useState(effective(person?.engagements||[],data.today)?.kind||'employee');
 const ending=mode==='end_engagement',creating=!person;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!option)return;
  const f=new FormData(e.currentTarget),effectiveFrom=String(f.get('effective_from'));
  const base={id,payee_id:option.id,effective_from:effectiveFrom,reason:String(f.get('reason'))};
  const destination=creating&&['bank_name','account_name','account_number'].some(k=>String(f.get(k)||'').trim())?{bank_name:String(f.get('bank_name')).trim(),account_name:String(f.get('account_name')||'').trim(),account_number:String(f.get('account_number')||'').trim()}:undefined;
  const payload=creating?{...base,kind,monthly_amount:Number(f.get('monthly_amount')),destination,tax_id:String(f.get('tax_id')||'').trim()}:{...base,...(mode==='rate'?{monthly_amount:Number(f.get('monthly_amount'))}:{kind:ending?(effective(person?.engagements||[],effectiveFrom)?.kind||kind):kind,active:!ending})};
  if(await onChange({action:creating?'setup':mode==='rate'?'rate':'engagement',payload}))onClose();
 }
 const title=mode==='rate'?s('editRate'):t(ending?'endEngagement':person?'changeEngagement':'addPerson');
 return <DetailModal open title={title} size="edit" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={submit}>
  <p className={css.notice}>{t(ending?'endEngagementHint':'effectiveHint')}</p>
  {person?<strong>{person.legal_name}</strong>:<div className={css.field}><label htmlFor="payroll-person">{t('name')}</label><SearchableCombobox id="payroll-person" label={t('name')} value={selected} disabled={busy} onChange={setSelected} options={data.new_people_options.map(p=>({value:p.id,label:{th:p.display_label,en:p.display_label}}))} placeholder={t('searchPeople')} requiredMessage={t('selectPerson')}/><p className={css.muted}>{t('eligiblePeopleHint')}</p>{!options.length&&<p>{t('noEligiblePeople')}</p>}</div>}
  {mode!=='rate'&&!ending&&<><Field label={t('kind')}><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)} disabled={busy}><option value="employee">{t('employee')}</option><option value="contractor">{t('contractor')}</option></select></Field>{kind==='contractor'&&<p className={css.notice}>{t('contractorHint')}</p>}</>}
  {(mode==='rate'||creating)&&<Field label={s('recurring')}><input name="monthly_amount" type="number" min="0.01" step="0.01" required disabled={busy} defaultValue={person?effective(person.rates,data.today)?.monthly_amount:undefined}/></Field>}
  <Field label={t('effective')}><input name="effective_from" type="date" required disabled={busy} defaultValue={data.today}/></Field>
  <Field label={t('reason')}><textarea name="reason" required maxLength={2000} disabled={busy}/></Field>
  {creating&&option&&<div className={css.form} key={option.id}><strong>{s('bank')}</strong><p className={css.muted}>{s('bankHint')}</p><Field label={s('taxId')}><input name="tax_id" inputMode="numeric" pattern="[0-9]{13}" maxLength={13} defaultValue={option.tax_id||''} disabled={busy}/></Field><div className={css.formGrid}><Field label={s('bankName')}><input name="bank_name" maxLength={200} defaultValue={option.destination?.bank_name||''} disabled={busy}/></Field><Field label={s('accountName')}><input name="account_name" maxLength={200} defaultValue={option.destination?.account_name||''} disabled={busy}/></Field><Field label={s('accountNumber')}><input name="account_number" maxLength={50} defaultValue={option.destination?.account_number||''} disabled={busy}/></Field></div></div>}
  <div className={css.actions}><button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{s('cancel')}</button><button className={ending?ui.danger:ui.primary} disabled={busy||!option}>{t(ending?'endEngagement':'save')}</button></div>
 </PayrollForm></DetailModal>;
}
function AmountFields({row,busy}:{row:MonthlyRow;busy:boolean}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),m=(k:MonthlyLabel)=>mt(locale,k),s=(k:SingleLabel)=>st(locale,k),l=row.line;
 const partial=!!(l?.requires_base_review||row.source?.requires_base_review),known=knownMonthlyFacts(row);
 const [taxTreatment,setTaxTreatment]=useState(known.wht_treatment||'');
 const amount=l?.reviewed?Number(l.base_amount):partial?'':row.recurring_amount??'';
 return <>
  {partial&&<p className={css.warning}>{m('noAutoAmount')}</p>}
  <div className={css.formGrid}><Field label={m('actualMonthlyAmount')}><input name="base_amount" type="number" min="0" step="0.01" required defaultValue={amount} disabled={busy}/></Field><Field label={s('extras')}><input name="additions" type="number" min="0" step="0.01" required defaultValue={Number(l?.additions??0)} disabled={busy}/></Field><Field label={s('deductions')}><input name="deductions" type="number" min="0" step="0.01" required defaultValue={Number(l?.deductions??0)} disabled={busy}/></Field></div>
  <p className={css.muted}>{s('monthOnly')}</p>
  {row.kind==='employee'?<div className={css.formGrid}>{(['employee_ss','employer_ss'] as const).map(key=><Field key={key} label={t(key)}><input name={key} type="number" min="0" step="0.01" required defaultValue={known[key]??''} disabled={busy}/></Field>)}</div>:<p className={css.notice}>{t('contractorHint')}</p>}
  <div className={css.formGrid}><Field label={t(row.kind==='employee'?'employee_wht':'contractor_wht')}><select name="wht_treatment" value={taxTreatment} required disabled={busy} onChange={e=>setTaxTreatment(e.target.value)}><option value="">{m('chooseTreatment')}</option><option value="none">{t('none')}</option><option value="withhold">{t('withhold')}</option></select></Field>{taxTreatment==='withhold'&&<Field label={t('wht')}><input name="wht_amount" type="number" min="0.01" step="0.01" required defaultValue={known.wht_amount||''} disabled={busy}/></Field>}</div>
  <p className={css.muted}>{s('taxHint')}</p><Field label={m('amountReason')}><textarea name="note" defaultValue={l?.note||l?.adjustment_reason||''} required maxLength={2000} disabled={busy}/></Field>
 </>;
}
function ReviewForm({row,month,busy,onClose,onChange,onReset}:{row:MonthlyRow;month:string;busy:boolean;onClose:()=>void;onChange:Change;onReset?:()=>void}){
 const {locale}=useI18n(),t:Text=k=>payrollText(locale,k),[id]=useState(()=>crypto.randomUUID()),[error,setError]=useState('');
 const [net,setNet]=useState<number|null>(row.line?.reviewed?row.line.net_amount:null);
 function update(form:HTMLFormElement){try{setNet(netPay(monthlyFacts(row,new FormData(form))));}catch{setNet(null);}}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();try{const facts=monthlyFacts(row,new FormData(e.currentTarget));if(netPay(facts)<0)throw Error('PAYROLL_INPUT_INVALID');if(await onChange({action:'monthly_save',month,items:[{...lineIdentity(row,id),facts}]}))onClose();}catch(e){setError(monthlyError(locale,e)||payrollError(locale,e));}}
 return <DetailModal open title={st(locale,'editMonth')+' · '+row.name} size="edit" onClose={onClose} closeOnBackdrop={!busy}><PayrollForm className={css.form} onSubmit={submit} onChange={e=>update(e.currentTarget)}><p>{monthLabel(month,locale)} · {row.kind&&t(row.kind)}</p>{error&&<p className={css.error} role="alert">{error}</p>}<AmountFields row={row} busy={busy}/><p>{st(locale,'bank')}: {row.destination?.summary||'—'}</p><div className={css.summary}><span>{t('net')}</span><strong>{net===null?'—':net.toLocaleString(locale,{minimumFractionDigits:2})} THB</strong></div><p className={css.muted}>{st(locale,'recordOnly')}</p><div className={css.actions}>{onReset&&<button type="button" className={ui.danger} disabled={busy} onClick={onReset}>{st(locale,'reset')}</button>}<button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{st(locale,'cancel')}</button><button className={ui.primary} disabled={busy}>{t('save')}</button></div></PayrollForm></DetailModal>;
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
