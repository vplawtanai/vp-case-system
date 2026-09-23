"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Send, UserRound } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { WorkflowDate } from "../workflow-time-ui";
import { requestReference, requestTotals, requestWorkflowTime, type ExpenseRequest } from "./requests";
import { hasReimbursement, itemStage, requestNextAction, requestStage, requestTimeline, requestWaiting } from "./request-operations";
import { expenseCategoryLabel } from "./categories";
import { expenseHref, pendingExpenseTax, type Expense, type ExpenseAccess } from "./shared";
import type { ExpenseRun } from "./forms";
import { claimStatus } from "./claim-review";
import { RequestItemProgress } from "./item-navigator";
import css from "./expenses.module.css";

const stageKey = (stage: string) => stage === "accepted" ? "requestAccepted" : stage === "rejected" ? "requestRejected" : stage;

export function ExpenseRequestRow({ request, access, onOpen }: { request: ExpenseRequest; access?: ExpenseAccess; onOpen: () => void }) {
 const { t, locale, date } = useI18n(), totals = requestTotals(request.items);
 const dates = request.items.map(e => e.expense_date).sort(), claim = request.kind === "employee_claim";
 const reviewable = access?.can_manage && request.items.some(e => e.status === "submitted");
 if (claim) {
  const money=(v:number)=>`${v.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`;
  const approved=request.items.filter(i=>i.settlement);
  return <tr data-request-row={request.id}>
   <td data-label={t("expenses.reference")}><strong>{requestReference(request.id)}</strong><small>{request.items.map(i=>i.description || expenseCategoryLabel(i.category,locale)).join(" · ")}</small></td>
   <td data-label={t("expenses.requestClaimant")}><span className={css.actions}><UserRound size={20} aria-hidden="true"/>{request.requester_name}</span></td>
   <td data-label={t("expenses.itemCount")}>{totals.count}</td>
   <td data-label={t("expenses.requested")}>{money(totals.requested)}</td>
   <td data-label={t("expenses.approved")}>{approved.length?money(approved.reduce((n,i)=>n+Math.round(i.settlement!.amount*100),0)/100):t("expenses.awaitingDecision")}</td>
   <td className={css.requestStatusCell} data-label={t("expenses.status")}><RequestItemProgress items={request.items} claim status={claimStatus(request.items)}/></td>
   <td data-label={t("expenses.requestSubmittedAt")}><WorkflowDate value={requestWorkflowTime(request)}/></td>
   <td data-label={t("expenses.action")}><button type="button" className={reviewable?ui.primary:ui.secondary} onClick={onOpen}>{t(reviewable?"expenses.reviewRequest":"expenses.view")}<ArrowRight size={14}/></button></td>
  </tr>;
 }
 return <tr data-request-row={request.id}><td colSpan={7} className={css.requestCell}><div className={css.requestQueueRow}>
  <div><strong>{requestReference(request.id)} · {request.requester_name}</strong><small>{t(claim ? "expenses.claims" : "expenses.newBatch")} · {t("expenses.count", { count: totals.count })}</small><small>{t("expenses.date")}: {date(dates[0])}{dates[0] !== dates.at(-1) ? ` - ${date(dates.at(-1))}` : ""}</small><small>{request.note}</small></div>
  <div><span>{t("expenses.expenseTotal")}</span><strong>{totals.gross.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</strong>{hasReimbursement(claim, request.items) ? <small>{t(claim ? "expenses.requestedTotal" : "expenses.staffRequestedTotal")}: {totals.requested.toLocaleString(locale, { minimumFractionDigits: 2 })} THB</small> : null}</div>
  <div><span className={css.badge}>{t(`expenses.${stageKey(requestStage(request))}`)}</span><small><WorkflowDate value={requestWorkflowTime(request)} /></small></div>
  <button type="button" className={reviewable ? ui.primary : ui.secondary} onClick={onOpen}>{t(reviewable ? "expenses.reviewRequest" : "expenses.view")}<ArrowRight size={14} /></button>
 </div></td></tr>;
}

export function ExpenseRequestReview({ request, access, busy, error, run, onClose, onEdit, renderItem }: { request: ExpenseRequest; access: ExpenseAccess; busy: boolean; error: string; run: ExpenseRun; onClose: () => void; onEdit: () => void; renderItem: (row: Expense) => ReactNode }) {
 const { t, locale, date } = useI18n();
 const [selected, setSelected] = useState<string | null>(() => access.can_manage ? request.items.find(e => e.status === "submitted")?.id || null : null);
 const [now] = useState(Date.now);
 const totals = requestTotals(request.items), own = request.created_by === access.user_id, claim = request.kind === "employee_claim";
 const stage = requestStage(request), pending = request.items.filter(e => e.status === "submitted").length;
 const waiting = requestWaiting(request, now), timeline = requestTimeline(request);
 const staff = access.can_manage || access.can_tax_review || access.can_record || access.can_confirm;
 const payable = request.items.find(e => e.status === "accepted" && !pendingExpenseTax(e) && e.obligation && !e.obligation.settled && !e.obligation.waived && (e.payout?.can_confirm || (access.can_manage && access.can_record)));
 const money = (value: number) => `${value.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 return <DetailModal open size="workflow" title={requestReference(request.id)} onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={false} footer={<div className={css.actions}>
  <button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{t("common.actions.close")}</button>
  {request.status === "draft" && own ? <button type="button" className={ui.secondary} disabled={busy} onClick={onEdit}><Pencil size={17} />{t("expenses.editRequest")}</button> : null}
  {request.status === "draft" && (own || access.can_manage) ? <button type="button" className={ui.primary} disabled={busy} onClick={() => void run("submit_finance_expense_request", { p_id: request.id, p_version: request.version })}><Send size={17} />{t(claim ? "expenses.submitRequest" : "expenses.sendForReview")}</button> : !pending && payable ? <Link className={ui.primary} href={`${expenseHref(payable)}#payment`}>{t("expenses.payNow")}<ArrowRight size={17} /></Link> : null}
 </div>}><div className={css.page}>
  {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
  <div className={css.requestMetadata}><span>{t(claim ? "expenses.requestClaimant" : "expenses.recordedBy")}: <strong>{request.requester_name}</strong></span><span>{t("expenses.draftCreatedAt")}: <time dateTime={request.created_at}>{date(request.created_at, true)}</time></span>{request.status === "submitted" ? <span>{t(claim ? "expenses.requestSubmittedAt" : "expenses.requestSentAt")}: {request.submitted_at ? <time dateTime={request.submitted_at}>{date(request.submitted_at, true)}</time> : t("expenses.queueTimeUnknown")}</span> : null}</div>
  <section className={css.requestProgress} aria-label={t("expenses.requestProgress")}>
   <div className={css.actions}><strong>{t(`expenses.${stageKey(stage)}`)}</strong>{waiting ? <small>{t(`expenses.${waiting.label}`, { count: waiting.days })}</small> : null}</div>
   <h2>{t("expenses.nextAction")}</h2><p>{t(`expenses.${requestNextAction(request, access)}`, { count: pending })}</p>
  </section>
  {request.note ? <p>{request.note}</p> : null}
  <dl className={css.requestTotals}><div><dt>{t("expenses.requestItems")}</dt><dd>{totals.count}</dd></div><div><dt>{t("expenses.expenseTotal")}</dt><dd>{money(totals.gross)}</dd></div>{hasReimbursement(claim, request.items) ? <div><dt>{t(claim ? "expenses.requestedTotal" : "expenses.staffRequestedTotal")}</dt><dd>{money(totals.requested)}</dd></div> : null}</dl>
  <div className={css.requestItems}>{request.items.map((item, index) => <section key={item.id} className={css.requestItemReview}>
   <button type="button" className={css.itemToggle} disabled={busy} aria-expanded={selected === item.id} aria-controls={`request-item-${item.id}`} onClick={() => setSelected(selected === item.id ? null : item.id)}>
    <span><strong>{t("expenses.itemNumber", { count: index + 1 })}: {item.description}</strong><small>{date(item.expense_date)} · {expenseCategoryLabel(item.category, locale)}</small>{staff && item.status === "accepted" ? <small>{t("expenses.vat")}: {t(`expenses.${item.tax_review?.vat_state || "pending"}`)} · WHT: {t(`expenses.${item.tax_review?.wht_state || "pending"}`)}</small> : null}</span>
    <span><strong>{money(item.gross_amount)}</strong><small>{t(`expenses.${stageKey(itemStage(item))}`)}</small>{access.can_manage && item.status === "submitted" ? <small className={css.reviewLink}>{t("expenses.reviewItem")} <ArrowRight size={14} /></small> : null}</span>
   </button>
   {item.status === "rejected" ? <div className={css.rejection}><p>{t("expenses.nextRejected")}</p>{item.review_reason ? <p>{item.review_reason}</p> : null}</div> : null}
   {selected === item.id ? <div id={`request-item-${item.id}`} className={css.itemEditor}>{staff ? renderItem(item) : <dl className={css.facts}><div><dt>{t("expenses.description")}</dt><dd>{item.description}</dd></div>{item.vendor_name ? <div><dt>{t("expenses.vendor")}</dt><dd>{item.vendor_name}</dd></div> : null}{item.note ? <div><dt>{t("expenses.note")}</dt><dd>{item.note}</dd></div> : null}{item.review_reason && item.status !== "rejected" ? <div><dt>{t("expenses.reviewResult")}</dt><dd>{item.review_reason}</dd></div> : null}</dl>}</div> : null}
  </section>)}</div>
  <section className={css.section}><h2>{t("expenses.requestTimeline")}</h2><ol className={css.requestTimeline}>{timeline.map(event => <li key={event.key}><span>{t(`expenses.${stageKey(event.label)}`)}{event.item ? ` · ${t("expenses.itemNumber", { count: event.item })}` : ""}</span><time dateTime={event.at}>{date(event.at, true)}</time></li>)}</ol></section>
 </div></DetailModal>;
}
