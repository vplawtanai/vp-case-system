"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, ListTodo, UserRound, FolderOpen, ChevronRight } from "lucide-react";
import { useI18n } from "../../lib/i18n/provider";
import { getDueStatusStyle } from "../../lib/dueStatus";
import type { AlertCandidate, CaseItem, CasePreview, RiskLevel } from "./case-list-model";
import { alertLabel, caseTerm, caseText } from "./labels";
import css from "./cases.module.css";

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { locale } = useI18n();
  return <span className={css.badge} style={getDueStatusStyle(level)}>{caseText(locale, level)}</span>;
}
export function CaseStatus({ value }: { value?: string | null }) {
  const { locale } = useI18n();
  return <span className={css.status} data-status={value?.toLowerCase()}>{caseTerm(value, locale)}</span>;
}
export function AlertList({ alerts, compact = false }: { alerts: AlertCandidate[]; compact?: boolean }) {
  const { locale, date } = useI18n();
  const shown = alerts.slice(0, compact ? 1 : 3);
  return <div className={css.alertList}>{shown.length ? shown.map((a,i) => <div key={i}>
    <time>{date(a.date)}</time><span className={css.clamp}>{alertLabel(a, locale)}</span>
  </div>) : <span className={css.muted}>—</span>}
    {alerts.length > shown.length && <small>{caseText(locale, "more", { count: alerts.length - shown.length })}</small>}
  </div>;
}

export function CaseList({ cases, onPreview }: { cases: CaseItem[]; onPreview: (item: CaseItem) => void }) {
  const { locale, date } = useI18n();
  const t = (key: Parameters<typeof caseText>[1]) => caseText(locale, key);
  const identity = (c: CaseItem) => <><strong className={css.court}>{c.court_name || t("noCourt")}</strong><span className={css.blackNo}>{c.case_number || t("noBlackNo")}</span></>;
  return <>
    <div className={css.tableWrap}><table className={css.table}>
      <colgroup><col style={{width:"12%"}}/><col style={{width:"19%"}}/><col style={{width:"21%"}}/><col style={{width:"13%"}}/><col style={{width:"14%"}}/><col style={{width:"16%"}}/><col style={{width:"5%"}}/></colgroup>
      <thead><tr>{["fileNo","courtIdentity","caseTitle","client","status","nextAlert","openFull"].map(key => <th key={key} scope="col">{key === "openFull" ? <span className={css.srOnly}>{t("openFull")}</span> : t(key as Parameters<typeof t>[0])}</th>)}</tr></thead>
      <tbody>{cases.map(c => <tr key={c.id} onClick={() => onPreview(c)} data-case-row={c.id}>
        <td><button type="button" className={css.fileButton} onClick={e => {e.stopPropagation(); onPreview(c);}} aria-haspopup="dialog">{c.file_no || `#${c.id}`}</button><small className={css.muted}>{caseTerm(c.phase, locale)}</small></td>
        <td>{identity(c)}</td>
        <td><span className={css.clamp} title={c.title || undefined}>{c.title || t("untitled")}</span><small className={css.muted}>{caseTerm(c.case_type, locale)}</small></td>
        <td><span className={css.clamp}>{c.client_name || t("noClient")}</span></td>
        <td><CaseStatus value={c.status}/><small className={css.owner}><UserRound size={12}/><span className={css.clamp}>{c.owner_name || t("unknown")}</span></small></td>
        <td><RiskBadge level={c.risk_level || "clear"}/><AlertList alerts={c.next_alerts || []} compact/></td>
        <td><Link className={css.openLink} href={`/cases/${c.id}`} onClick={e => e.stopPropagation()} aria-label={`${t("openFull")} ${c.file_no || c.id}`} title={t("openFull")}><ArrowUpRight size={17}/></Link></td>
      </tr>)}</tbody>
    </table></div>
    <div className={css.mobileList}>{cases.map(c => <article key={c.id} className={css.mobileCard}>
      <div className={css.mobileHead}><button type="button" className={css.fileButton} onClick={() => onPreview(c)} aria-haspopup="dialog">{c.file_no || `#${c.id}`}</button><CaseStatus value={c.status}/></div>
      <button type="button" className={css.cardIdentity} onClick={() => onPreview(c)} aria-haspopup="dialog">{identity(c)}<span className={css.clamp}>{c.title || t("untitled")}</span></button>
      <div className={css.mobileFacts}><span>{t("client")}<strong>{c.client_name || t("noClient")}</strong></span><span>{t("owner")}<strong>{c.owner_name || t("unknown")}</strong></span></div>
      <div className={css.mobileFoot}><RiskBadge level={c.risk_level || "clear"}/><button type="button" className={css.textButton} onClick={() => onPreview(c)}>{t("preview")}<ChevronRight size={15}/></button></div>
      {c.next_alert_date && <small className={css.muted}>{t("nextAlert")}: {date(c.next_alert_date)}</small>}
    </article>)}</div>
  </>;
}

export function CaseQuickViewBody({ item, preview }: { item: CaseItem; preview: CasePreview }) {
  const { locale, date } = useI18n();
  const t = (key: Parameters<typeof caseText>[1]) => caseText(locale, key);
  const { task, deadline, hearing } = preview;
  return <div className={css.quickView}>
    <div className={css.caseIdentity}><div className={css.identityTop}><span><FolderOpen size={17}/>{item.file_no || `#${item.id}`}</span><CaseStatus value={item.status}/></div>
      <h3>{item.court_name || t("noCourt")}</h3><div className={css.quickBlack}><small>{t("blackNo")}</small>{item.case_number || t("noBlackNo")}</div>
      <p className={css.fullTitle}>{item.title || t("untitled")}</p>
    </div>
    <div className={css.quickColumns}><dl className={css.facts}>
      {([
        ["client", item.client_name || t("noClient")], ["owner", item.owner_name || t("unknown")], ["type", caseTerm(item.case_type,locale)], ["phase", caseTerm(item.phase,locale)],
      ] as const).map(([key,value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
    </dl><div className={css.nextItems}>
      <section><CalendarDays size={18}/><div><h4>{t("nextHearing")}</h4>{hearing ? <><strong>{hearing.appointment_type === "นัดอื่นๆ" ? hearing.appointment_other || t("hearing") : caseTerm(hearing.appointment_type || "นัดศาล",locale)}</strong><p>{date(hearing.event_date)} {hearing.event_time?.slice(0,5)}</p></> : <p>{t("noHearing")}</p>}</div></section>
      <section><ListTodo size={18}/><div><h4>{t("nextTask")}</h4>{task ? <><strong>{task.task_type === "อื่นๆ" ? task.task_other || t("task") : caseTerm(task.task_type || "งานที่ต้องทำ",locale)}</strong><p>{task.due_date ? date(task.due_date) : t("noDate")}</p></> : <p>{t("noTask")}</p>}</div></section>
      <section><Clock3 size={18}/><div><h4>{t("nearestDeadline")}</h4>{deadline ? <><strong>{deadline.deadline_type === "other" ? deadline.deadline_other || t("deadline") : caseTerm(deadline.deadline_type,locale)}</strong><p>{date(deadline.current_due_date)}</p></> : <p>{t("noDeadline")}</p>}</div></section>
    </div></div>
    <details className={css.supporting}><summary>{t("nextAlert")} · {t("storage")}</summary><AlertList alerts={item.next_alerts || []}/><dl className={css.facts}>
      <div><dt>{t("storage")}</dt><dd>{caseTerm(item.physical_storage_type,locale)}</dd></div><div><dt>{t("location")}</dt><dd>{item.physical_storage_detail || t("unknown")}</dd></div><div><dt>{t("updated")}</dt><dd>{date(item.updated_at,true)}</dd></div>
    </dl></details>
  </div>;
}
