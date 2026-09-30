"use client";
import Link from 'next/link';
import {AlertCircle,ChevronDown} from 'lucide-react';
import type {Matter} from '../../../lib/advisory-control';
import {useI18n} from '../../../lib/i18n/provider';
import css from './control.module.css';

export function OverdueDays({days}:{days?:number}){
 const {t}=useI18n();
 return days&&days>0?<span className={css.overdueDays}><AlertCircle size={13} aria-hidden="true"/>{t(days===1?'advisory.overdueDay':'advisory.overdueDays',{n:days})}</span>:null;
}
export function OverdueIndicator({matter,expanded,onToggle,controls}:{matter:Matter;expanded:boolean;onToggle:()=>void;controls:string}){
 const {t}=useI18n(),count=matter.overdue_item_count||0;
 if(!matter.has_overdue_work||!count)return null;
 return <div className={css.overdueIndicator}><button type="button" className={css.overdueButton} aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
  <AlertCircle size={13} aria-hidden="true"/>{t(count===1?'advisory.overdueItem':'advisory.overdueItems',{n:count})}<ChevronDown size={13} aria-hidden="true"/>
 </button><small>{t(matter.oldest_overdue_days===1?'advisory.oldestOverdueDay':'advisory.oldestOverdueDays',{n:matter.oldest_overdue_days||0})}</small></div>;
}
export function OverduePreview({matter}:{matter:Matter}){
 const {t,date}=useI18n(),preview=matter.overdue_preview||[],remaining=Math.max(0,(matter.overdue_item_count||0)-preview.length);
 return <div className={css.overduePreview}>
  <strong>{t('advisory.overdueForMatter',{matter:matter.matter_no})}</strong>
  <ul>{preview.map(item=><li key={item.source+':'+item.source_id}>
   <strong>{item.title}</strong><OverdueDays days={item.overdue_days}/>
   <span>{item.assignee_name||t('advisory.unassigned')} · {date(item.due_date)}</span>
  </li>)}</ul>
  <div>{remaining>0&&<span>{t(remaining===1?'advisory.moreOverdueItem':'advisory.moreOverdueItems',{n:remaining})}</span>}<Link href={'/advisory/'+matter.id}>{t('advisory.openMatter')} →</Link></div>
 </div>;
}
