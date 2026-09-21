"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, Clock, Wallet } from "lucide-react";
import { FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { QueueSort, WorkflowDate } from "../workflow-time-ui";
import type { QueueOrder } from "../workflow-time";
import { requestReference, requestTotals, requestWorkflowTime, type ExpenseRequest } from "./requests";
import { requestStage } from "./request-operations";
import { companyQueue, companyReviewComplete, companySummary } from "./company-workflow";
import type { ExpenseAccess } from "./shared";
import { expenseStatusTone } from "./presentation";
import css from "./expenses.module.css";
import company from "./company.module.css";

export function CompanyExpenseList({ requests, access, onRequest, initialTaxFilter = false }: { requests: ExpenseRequest[]; access: ExpenseAccess; onRequest: (id: string) => void; initialTaxFilter?: boolean }) {
 const { t, locale } = useI18n();
 const [search, setSearch] = useState(""), [status, setStatus] = useState(initialTaxFilter ? "tax" : "all"), [order, setOrder] = useState<QueueOrder>("newest"), [page, setPage] = useState(0);
 const queue = companyQueue(requests, { claims: false, search, status, order, locale }), icons = { review: Clock, unpaid: Wallet, paid: CircleCheck, rejected: CircleX };
 const money = (n: number) => `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`;
 return <>
  <div className={`${css.stats} ${company.stats}`}>{companySummary(requests).map(s => { const Icon = icons[s.lane]; return <article className={css.stat} key={s.lane}><span className={css.icon}><Icon size={26} aria-hidden="true" /></span><div><span>{t(`expenses.${s.lane === "rejected" ? "requestRejected" : s.lane}`)}</span><strong>{t("expenses.companyRequestCount", { count: s.requests })}</strong><div className={company.itemCount}>{t("expenses.count", { count: s.items })}</div><small>{money(s.amount)}</small></div></article>; })}</div>
  <div className={`${css.filters} ${company.filters}`}><FieldGroup id="company-search" label={t("expenses.companySearch")}><input type="search" placeholder={t("expenses.companySearchPlaceholder")} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></FieldGroup><FieldGroup id="company-status" label={t("expenses.status")}><select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>{["all", "draft", "review", "unpaid", "paid", "rejected", "accepted", "tax"].map(s => <option key={s} value={s}>{t(`expenses.${s === "rejected" ? "requestRejected" : s === "accepted" ? "requestAccepted" : s}`)}</option>)}</select></FieldGroup><QueueSort id="company-order" value={order} onChange={v => { setOrder(v); setPage(0); }} /></div>
  <section><div className={css.sectionHead}><h2>{t("expenses.companyRequests")} <span>{t("expenses.companyRequestCount", { count: queue.length })}</span></h2></div>
   {queue.length ? <table className={`${css.table} ${company.table}`}><thead><tr>{["companyRequest", "recordedBy", "requestItems", "expenseTotal", "status", "companyQueuedAt", "action"].map(k => <th key={k}>{t(`expenses.${k}`)}</th>)}</tr></thead><tbody>{queue.slice(page * 10, page * 10 + 10).map(entry => { const r = entry.request!, stage = requestStage(r), reviewing = (access.can_manage || access.can_tax_review) && r.status === "submitted" && r.items.some(i => !companyReviewComplete(i)); return <tr key={r.id} data-request-row={r.id}>
    <td data-label={t("expenses.companyRequest")}><strong>{requestReference(r.id)}</strong>{r.note ? <small>{r.note}</small> : null}</td><td data-label={t("expenses.recordedBy")}>{r.requester_name}</td><td data-label={t("expenses.requestItems")}>{t("expenses.count", { count: r.items.length })}</td><td className={css.money} data-label={t("expenses.expenseTotal")}>{money(requestTotals(r.items).gross)}</td><td data-label={t("expenses.status")}><span className={css.badge} data-tone={expenseStatusTone(stage)}>{t(`expenses.${stage === "accepted" ? "requestAccepted" : stage === "rejected" ? "requestRejected" : stage}`)}</span></td><td data-label={t("expenses.companyQueuedAt")}><WorkflowDate value={requestWorkflowTime(r)} /></td><td data-label={t("expenses.action")}><button className={ui.secondary} type="button" onClick={() => onRequest(r.id)}>{t(reviewing ? "expenses.reviewRequest" : "expenses.view")}<ArrowRight size={14} aria-hidden="true" /></button></td>
   </tr>; })}</tbody></table> : <div className={css.empty}><strong>{t("expenses.empty")}</strong><p>{t("expenses.companyEmpty")}</p></div>}
  </section>
  {queue.length > 10 ? <div className={css.footer}><button type="button" className={ui.secondary} aria-label={t("expenses.previous")} disabled={!page} onClick={() => setPage(page - 1)}><ArrowLeft size={18} /></button><span>{page + 1}</span><button type="button" className={ui.secondary} aria-label={t("expenses.next")} disabled={(page + 1) * 10 >= queue.length} onClick={() => setPage(page + 1)}><ArrowRight size={18} /></button></div> : null}
 </>;
}
