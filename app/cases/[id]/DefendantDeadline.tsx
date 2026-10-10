'use client';
import {useDefendantText} from './defendant-labels';
import {useCaseBusinessDate} from './use-case-business-date';
import {defendantObligation,partyLabel,type DefendantData,type Representation} from './defendant-model';
import base from './case-detail.module.css';
import css from './case-defendant.module.css';
export function DefendantDeadline({data,person,onAnswer}:{data:DefendantData;person:Representation;onAnswer?:()=>void}){
 const {t,date}=useDefendantText(),today=useCaseBusinessDate(),state=defendantObligation(data,person,today),d=person.deadline;
 const source=person.attempts.find(a=>a.id===person.control?.lawful_attempt_id);
 return <article className={css.deadline} id={d?`case-deadline-${d.id}`:undefined}>
 <header><div><h3>{t('due')}</h3><strong>{partyLabel(person.party)}</strong></div><span className={css.badge}>{t('readonly')}</span></header>
 <p className={css.muted}>{t('linkedHint')}</p><dl className={css.facts}>
 <div><dt>{t('source')}</dt><dd>{source?`${t(source.method||'unknown')} · ${date(source.attempted_on)}`:t('none')}</dd></div>
 {state.extended&&<div><dt>{t('originalDue')}</dt><dd>{date(d?.original_due_date)}</dd></div>}
 <div><dt>{t(state.extended?'currentDue':'due')}</dt><dd>{date(state.due)}</dd></div>
 <div><dt>{t('answer')}</dt><dd><ObligationStatus data={data} person={person}/></dd></div>
 {state.filings.length>0&&<div><dt>{t('filings')}</dt><dd>{state.filings.map(f=>`${t('filing')} ${data.filings.indexOf(f)+1} · ${date(f.filed_on)}`).join(' / ')}</dd></div>}
 </dl>{person.extensions.filter(e=>!e.deleted_at).map(e=><p className={css.muted} key={e.id}>{t('extensions')} {e.extension_no} · {date(e.granted_until_date)}</p>)}
 {onAnswer&&<button type="button" className={base.secondary} onClick={onAnswer}>{t('goAnswer')}</button>}</article>;
}
export function ObligationStatus({data,person}:{data:DefendantData;person:Representation}){
 const {t}=useDefendantText(),today=useCaseBusinessDate(),s=defendantObligation(data,person,today);
 return <span className={css.status} data-state={s.filed?'filed':s.days!==null&&s.days<0?'overdue':s.state}><span>{t(s.state)}</span>{s.days!==null&&<strong>{s.days===0?t('today'):t(s.days<0?'daysOverdue':'daysRemaining').replace('{days}',String(Math.abs(s.days)))}</strong>}</span>;
}
