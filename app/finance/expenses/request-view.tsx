"use client";
import { useState, type ReactNode } from "react";
import { ArrowRight, Pencil, Send } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { WorkflowDate } from "../workflow-time-ui";
import { requestProgress, requestReference, requestTotals, requestWorkflowTime, type ExpenseRequest } from "./requests";
import { expenseCategoryLabel } from "./categories";
import type { Expense, ExpenseAccess } from "./shared";
import type { ExpenseRun } from "./forms";
import css from "./expenses.module.css";

export function ExpenseRequestRow({ request, onOpen }: { request: ExpenseRequest; onOpen: () => void }) {
 const { t, locale, date } = useI18n(), totals = requestTotals(request.items);
 const dates = request.items.map(e => e.expense_date).sort();
 return <tr data-request-row={request.id}><td colSpan={7} className={css.requestCell}><div className={css.requestQueueRow}>
  <div><strong>{requestReference(request.id)} · {request.requester_name}</strong><small>{t(request.kind === "employee_claim" ? "expenses.claims" : "expenses.newBatch")} · {t("expenses.count", { count: totals.count })}</small><small>{t("expenses.date")}: {date(dates[0])}{dates[0] !== dates.at(-1) ? ` - ${date(dates.at(-1))}` : ""}</small><small>{request.note}</small></div>
  <div><span>{t("expenses.expenseTotal")}</span><strong>{totals.gross.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</strong><small>{t("expenses.requestedTotal")}: {totals.requested.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</small></div>
  <div><span className={css.badge}>{t(`expenses.${requestProgress(request)}`)}</span><small><WorkflowDate value={requestWorkflowTime(request)} /></small></div>
  <button type="button" className={ui.secondary} onClick={onOpen}>{t("expenses.view")}<ArrowRight size={14} /></button>
 </div></td></tr>;
}

export function ExpenseRequestReview({ request, access, busy, error, run, onClose, onEdit, renderItem }: { request: ExpenseRequest; access: ExpenseAccess; busy: boolean; error: string; run: ExpenseRun; onClose: () => void; onEdit: () => void; renderItem: (row: Expense) => ReactNode }) {
 const { t, locale, date } = useI18n(), [selected, setSelected] = useState<string | null>(null);
 const totals = requestTotals(request.items), own = request.created_by === access.user_id;
 return <DetailModal open size="workflow" title={requestReference(request.id)} subtitle={request.requester_name} onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={false} footer={<div className={css.actions}>
  <button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{t("common.actions.close")}</button>
  {request.status === "draft" && own ? <button type="button" className={ui.secondary} disabled={busy} onClick={onEdit}><Pencil size={17} />{t("expenses.editRequest")}</button> : null}
  {request.status === "draft" && (own || access.can_manage) ? <button type="button" className={ui.primary} disabled={busy} onClick={() => void run("submit_finance_expense_request", { p_id: request.id, p_version: request.version })}><Send size={17} />{t("expenses.submitRequest")}</button> : null}
 </div>}><div className={css.page}>
  {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
  <div className={css.actions}><span className={css.badge}>{t(`expenses.${requestProgress(request)}`)}</span>{request.status === "submitted" ? <span>{t("expenses.requestSubmittedAt")}: {request.submitted_at ? <time dateTime={request.submitted_at}>{date(request.submitted_at, true)}</time> : t("expenses.queueTimeUnknown")}</span> : <WorkflowDate value={requestWorkflowTime(request)} />}</div>
  {request.note ? <p>{request.note}</p> : null}
  <dl className={css.requestTotals}><div><dt>{t("expenses.requestItems")}</dt><dd>{totals.count}</dd></div><div><dt>{t("expenses.expenseTotal")}</dt><dd>{totals.gross.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</dd></div><div><dt>{t("expenses.requestedTotal")}</dt><dd>{totals.requested.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</dd></div></dl>
  <div className={css.requestItems}>{request.items.map((item, index) => <section key={item.id} className={css.requestItemReview}>
   <button type="button" className={css.itemToggle} disabled={busy} aria-expanded={selected === item.id} aria-controls={`request-item-${item.id}`} onClick={() => setSelected(selected === item.id ? null : item.id)}>
    <span><strong>{t("expenses.itemNumber", { count: index + 1 })}: {item.description}</strong><small>{date(item.expense_date)} · {expenseCategoryLabel(item.category, locale)}</small></span>
    <span><strong>{item.gross_amount.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</strong><small>{t(`expenses.${item.status}`)}</small></span>
   </button>
   {selected === item.id ? <div id={`request-item-${item.id}`} className={css.itemEditor}>{renderItem(item)}</div> : null}
  </section>)}</div>
 </div></DetailModal>;
}
