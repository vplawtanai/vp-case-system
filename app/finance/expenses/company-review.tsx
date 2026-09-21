"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Pencil, Send } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { requestReference, requestTotals, type ExpenseRequest } from "./requests";
import { hasReimbursement, itemStage, requestNextAction, requestStage } from "./request-operations";
import { companyPayee, companyProgress, companyReviewComplete, companyTimeline, noTaxReviewArgs } from "./company-workflow";
import { companyApprovalMissing, companyMoneyIncomplete, creatorPaymentLabel } from "./company-money";
import { expenseCategoryLabel } from "./categories";
import { ExpensePaymentPanel, ExpenseSettlementForm, ExpenseTaxForm, type ExpenseRun } from "./forms";
import { pendingExpenseTax, type Expense, type ExpenseAccess, type ExpenseAccount, type ExpenseLookups } from "./shared";
import { ExpenseTechnical } from "./audit-view";
import { expenseStatusTone } from "./presentation";
import css from "./expenses.module.css";
import company from "./company.module.css";

const stageKey = (s: string) => s === "accepted" ? "requestAccepted" : s === "rejected" ? "requestRejected" : s;
export function CompanyRequestReview({ request, access, accounts = [], lookups, busy, error, run, onClose, onEdit }: { request: ExpenseRequest; access: ExpenseAccess; accounts?: ExpenseAccount[]; lookups: ExpenseLookups; busy: boolean; error: string; run: ExpenseRun; onClose: () => void; onEdit: () => void }) {
 const { t, locale, date } = useI18n(), staff = access.can_manage || access.can_tax_review;
 const [selection, setSelection] = useState(() => ({ id: staff && request.status === "submitted" ? request.items.find(i => !companyReviewComplete(i))?.id || null : null, complete: false }));
 const selected = request.items.find(i => i.id === selection.id);
 // Advance only after authoritative read-back resolves all review steps, never after a partial failure.
 const active = selected && !selection.complete && companyReviewComplete(selected) && !busy && !error ? request.items.find(i => !companyReviewComplete(i))?.id || null : selection.id;
 const panel = useRef<HTMLDivElement>(null);
 const previousActive = useRef(active);
 useEffect(() => {
  if (previousActive.current && previousActive.current !== active) {
   panel.current?.focus({ preventScroll: true });
   panel.current?.scrollIntoView({ block: "nearest" });
  }
  previousActive.current = active;
 }, [active]);
 const reviewed = companyProgress(request), total = requestTotals(request.items), stage = requestStage(request), remaining = request.items.filter(i => !companyReviewComplete(i)).length;
 const money = (v: number) => `${v.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 const reimbursement = request.items.filter(i => i.personally_paid), decided = reimbursement.length > 0 && reimbursement.every(i => i.status === "rejected" || (i.settlement && i.settlement.mode !== "undecided"));
 const reimbursed = requestTotals(reimbursement.map(i => ({ gross_amount: i.gross_amount, reimbursement_requested: i.status === "rejected" ? 0 : i.settlement?.mode === "reimburse" ? i.settlement.amount : 0 }))).requested;
 return <DetailModal open size="workflow" title={requestReference(request.id)} closeOnBackdrop={false} onClose={() => { if (!busy) onClose(); }} footer={<div className={css.actions}><button type="button" className={ui.secondary} disabled={busy} onClick={onClose}>{t("common.actions.close")}</button>{request.status === "draft" && request.created_by === access.user_id ? <button type="button" className={ui.secondary} disabled={busy} onClick={onEdit}><Pencil size={17} />{t("expenses.editRequest")}</button> : null}{request.status === "draft" && (request.created_by === access.user_id || access.can_manage) ? <button type="button" className={ui.primary} disabled={busy || (access.creator_payment_fact_supported === true && companyMoneyIncomplete(request.items))} onClick={() => void run("submit_finance_expense_request", { p_id: request.id, p_version: request.version })}><Send size={17} />{t("expenses.sendForReview")}</button> : null}</div>}><div className={css.page}>
  {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
  {request.status === "draft" && access.creator_payment_fact_supported === true && companyMoneyIncomplete(request.items) ? <Callout tone="info">{t("expenses.companyMoneyIncomplete")}</Callout> : null}
  <div className={css.requestMetadata}><span>{t("expenses.recordedBy")}: <strong>{request.requester_name}</strong></span><span>{t(request.status === "draft" ? "expenses.draftCreatedAt" : "expenses.requestSentAt")}: {date(request.status === "draft" ? request.created_at : request.submitted_at, true)}</span></div>
  <section className={css.requestProgress} aria-label={t("expenses.requestProgress")}><div className={company.progress}><span className={css.badge} data-tone={expenseStatusTone(stage)}>{t(`expenses.${stageKey(stage)}`)}</span><strong role="status">{t(reviewed === total.count ? "expenses.companyReviewDone" : "expenses.companyReviewProgress", { count: reviewed, total: total.count })}</strong></div><h2>{t("expenses.nextAction")}</h2><p>{t(`expenses.${requestNextAction(request, access)}`, { count: request.items.filter(i => i.status === "submitted").length })}</p>{reviewed === total.count && remaining ? <p>{t("expenses.companyRemaining", { count: remaining })}</p> : null}</section>
  {request.note ? <p>{request.note}</p> : null}
  <dl className={css.requestTotals}><div><dt>{t("expenses.requestItems")}</dt><dd>{total.count}</dd></div><div><dt>{t("expenses.expenseTotal")}</dt><dd>{money(total.gross)}</dd></div>{hasReimbursement(false, request.items) ? <div><dt>{t(decided ? "expenses.companyReimbursementDue" : "expenses.staffRequestedTotal")}</dt><dd>{money(decided ? reimbursed : total.requested)}</dd></div> : null}</dl>
  <div className={css.requestItems}>{request.items.map((item, index) => <section key={item.id} className={`${css.requestItemReview} ${company.itemCard}`}>
   <button className={`${css.itemToggle} ${company.itemToggle}`} type="button" disabled={busy} aria-expanded={active === item.id} aria-controls={`company-item-${item.id}`} onClick={() => setSelection({ id: active === item.id ? null : item.id, complete: companyReviewComplete(item) })}><span><strong>{t("expenses.itemNumber", { count: index + 1 })}: {item.description}</strong><small>{date(item.expense_date)} · {expenseCategoryLabel(item.category, locale)}</small></span><span className={company.itemStatus}><strong>{money(item.gross_amount)}</strong><span className={css.badge} data-tone={expenseStatusTone(itemStage(item))}>{t(`expenses.${stageKey(itemStage(item))}`)}</span>{staff && !companyReviewComplete(item) && request.status !== "draft" && active !== item.id ? <small className={css.reviewLink}>{t("expenses.reviewItem")} <ArrowRight size={14} /></small> : null}<ChevronDown size={18} aria-hidden="true" /></span></button>
   {active === item.id ? <div ref={panel} tabIndex={-1} id={`company-item-${item.id}`} className={`${css.itemEditor} ${company.selected}`}><CompanyItemReview key={item.id} row={item} access={access} accounts={accounts} lookups={lookups} run={run} busy={busy} /></div> : null}
  </section>)}</div>
  <details className={css.disclosure}><summary>{t("expenses.requestTimeline")}</summary><ol className={css.requestTimeline}>{companyTimeline(request).map(e => <li key={e.key}><span>{t(`expenses.${stageKey(e.label)}`)}{e.item ? ` · ${t("expenses.itemNumber", { count: e.item })}` : ""}</span><time dateTime={e.at}>{date(e.at, true)}</time></li>)}</ol></details>
  <ExpenseTechnical isAdmin={access.is_admin} evidence={{ request: request.audit, items: request.items.map(item => ({ id: item.id, audit: item.audit })) }} />
 </div></DetailModal>;
}

export function CompanyItemReview({ row, access, accounts = [], lookups, run, busy }: { row: Expense; access: ExpenseAccess; accounts?: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean }) {
 const { t, locale, date } = useI18n();
 const [reason, setReason] = useState(""), [ack, setAck] = useState(false), [working, setWorking] = useState(false), [partial, setPartial] = useState(false);
 const [taxPlan, setTaxPlan] = useState<Record<string, unknown> | null>(null), [settlementPlan, setSettlementPlan] = useState<Record<string, unknown> | null>(null);
 const [updatedPayees, setUpdatedPayees] = useState<ExpenseLookups["payees"] | null>(null);
 const parties = updatedPayees ? { ...lookups, payees: updatedPayees } : lookups;
 const lock = useRef(false), reviewPanel = useRef<HTMLDivElement>(null);
 const attempt = useRef<{ steps: { rpc: string; args: Record<string, unknown> }[]; next: number } | null>(null);
 const disabled = busy || working, payee = companyPayee(row, parties), tax = row.tax_review;
 const simple = row.vat_awareness === "no" && row.wht_awareness === "no" && !tax;
 const money = (v: number) => `${v.toLocaleString(locale, { minimumFractionDigits: 2 })} THB`;
 const plannedTax = access.can_tax_review ? simple ? ack ? noTaxReviewArgs(row, "readiness-only", reason).p_input : null : taxPlan?.p_input as Record<string, unknown> | null : null;
 const missing = companyApprovalMissing(row, settlementPlan, plannedTax, reason, parties);
 async function approve(accept: boolean) {
  if (lock.current || disabled || !reason.trim()) return;
  if (accept && !attempt.current && missing.length) return;
  if (accept && !attempt.current && [...(reviewPanel.current?.querySelectorAll<HTMLFormElement>("form[data-review-plan]") || [])].some(form => !form.reportValidity())) return;
  lock.current = true; setWorking(true);
  try {
   if (!attempt.current) {
    const steps = [{ rpc: "review_finance_expense", args: { p_id: row.id, p_version: row.version, p_accept: accept, p_reason: reason } as Record<string, unknown> }];
    if (accept && access.can_tax_review) {
     const args = simple ? ack ? noTaxReviewArgs(row, crypto.randomUUID(), reason) : null : taxPlan;
     if (args) steps.push({ rpc: "review_finance_expense_tax", args });
    }
    if (accept && settlementPlan && settlementPlan.p_mode !== "undecided") steps.push({ rpc: "decide_finance_expense_settlement", args: settlementPlan });
    attempt.current = { steps, next: 0 };
   }
   // Resume only unfinished steps, with identical operation IDs and payloads after a failed response.
   while (attempt.current.next < attempt.current.steps.length) {
    const step = attempt.current.steps[attempt.current.next];
    if (!await run(step.rpc, step.args)) { setPartial(true); return; }
    attempt.current.next++;
   }
   setPartial(false); attempt.current = null;
  } finally { lock.current = false; setWorking(false); }
 }
 const context = [["client", lookups.clients.find(c => c.id === row.client_id)?.name], ["case", lookups.cases.find(c => c.id === row.case_id)?.title], ["matter", lookups.matters.find(c => c.id === row.advisory_matter_id)?.title]];
 return <div className={company.review} ref={reviewPanel}>
  <section><h3>{t("expenses.companyFacts")}</h3><dl className={css.facts}>{[["date", date(row.expense_date)], ["category", expenseCategoryLabel(row.category, locale)], ["amount", money(row.gross_amount)], ["vendor", row.vendor_name], ["description", row.description], ["note", row.note], ...context].filter(([,v]) => v).map(([k,v]) => <div key={k}><dt>{t(`expenses.${k}`)}</dt><dd>{v}</dd></div>)}</dl></section>
  <section><h3>{t("expenses.companyPaymentPayee")}</h3><strong>{t("expenses.companyCreatorDeclaration")}</strong><dl className={css.facts}><div><dt>{t("expenses.companyPaymentQuestion")}</dt><dd>{t(`expenses.${creatorPaymentLabel(row)}`)}{row.creator_payment_fact === "personal_paid" && row.claimant_name ? ` · ${row.claimant_name}` : ""}</dd></div>{row.personally_paid ? <><div><dt>{t("expenses.companyReimbursementPayee")}</dt><dd>{payee?.legal_name || row.claimant_name || t("expenses.companyMissingPayee")}</dd></div><div><dt>{t("expenses.staffRequestedTotal")}</dt><dd>{money(row.reimbursement_requested)}</dd></div></> : null}{row.settlement ? <><div><dt>{t("expenses.companyMoneyDecision")}</dt><dd>{t(`expenses.${row.settlement.mode}`)}</dd></div><div><dt>{t("expenses.settlementAmount")}</dt><dd>{money(row.settlement.amount)}<br />{row.settlement.reason}</dd></div></> : null}{row.settlement && !row.personally_paid && payee ? <div><dt>{t(row.settlement.mode === "supplier_unpaid" ? "expenses.companySupplierPayee" : "expenses.vendor")}</dt><dd>{payee.legal_name}</dd></div> : null}</dl>
   {row.payout?.status === "confirmed" ? <p>{t("expenses.paid")}</p> : null}
   {(row.status === "submitted" || row.status === "accepted") && !row.settlement && access.can_manage ? <ExpenseSettlementForm companyReview row={row} lookups={parties} onPayees={setUpdatedPayees} run={run} busy={disabled || partial} plan={row.status === "submitted" || partial ? { onPlan: setSettlementPlan, reason } : undefined} /> : null}
   {row.status === "accepted" && row.creator_payment_fact === "company_paid" && row.settlement && ["company_bank", "company_cash"].includes(row.settlement.mode) ? <ExpensePaymentPanel key={row.payout?.id || row.settlement.id} row={row} access={access} accounts={accounts} run={run} busy={disabled || partial} /> : null}
  </section>
  <section><h3>{t("expenses.companyTax")}</h3><strong>{t("expenses.companyCreatorDeclaration")}</strong><div className={company.taxFacts} data-creator-tax><span>VAT<strong>{t(`expenses.${row.vat_awareness || "companyDeclarationUnavailable"}`)}</strong></span><span>WHT<strong>{t(`expenses.${row.wht_awareness || "companyDeclarationUnavailable"}`)}</strong></span></div>
   <strong>{t("expenses.companyTaxDecision")}</strong><div className={company.taxFacts} data-finance-tax><span>VAT<strong>{t(`expenses.${tax?.vat_state || "pending"}`)}</strong></span><span>WHT<strong>{t(`expenses.${tax?.wht_state || "pending"}`)}</strong></span><span>{t("expenses.eligibility")}<strong>{t(tax?.vat_state === "none" ? "expenses.companyNotApplicable" : `expenses.${tax?.eligibility || "pending"}`)}</strong></span></div>
   {simple && access.can_tax_review && (row.status === "submitted" || partial) ? <label className={css.check}><input type="checkbox" checked={ack} disabled={disabled || partial} onChange={e => setAck(e.target.checked)} /><span>{t("expenses.companyNoTaxAck")}</span></label> : null}
   {(row.status === "submitted" || row.status === "accepted") && pendingExpenseTax(row) && !(simple && (row.status === "submitted" || partial)) ? access.can_tax_review ? <ExpenseTaxForm key={tax?.id || "new"} secondary row={row} run={run} busy={disabled || partial} plan={row.status === "submitted" || partial ? { onPlan: setTaxPlan, reason } : undefined} /> : <p>{t("expenses.companyTaxPermission")}</p> : null}
   {tax?.wht_exception ? <Callout tone="warning">{t("expenses.whtException")}</Callout> : null}
  </section>
  {partial ? <div className={company.reviewResult}><Callout tone="warning">{t("expenses.companyReviewPartial")}</Callout></div> : null}
  {row.status === "submitted" && !partial && missing.length ? <div className={company.reviewResult} data-readiness-checklist aria-live="polite"><strong>{t("expenses.companyMissingDecisions")}</strong><ul>{missing.map(key => <li key={key}>{t(`expenses.${key}`)}</li>)}</ul></div> : null}
  {(row.status === "submitted" || partial) && access.can_manage ? <form className={`${css.form} ${company.decision}`} onSubmit={e => { e.preventDefault(); void approve(true); }}><FieldGroup id="company-review-reason" label={t("expenses.reason")}><textarea required value={reason} maxLength={2000} disabled={disabled || partial} onChange={e => setReason(e.target.value)} /></FieldGroup><div className={company.decisionActions}><div className={css.footer}>{!partial ? <button type="button" className={ui.secondary} disabled={disabled || !reason.trim()} onClick={() => void approve(false)}>{t("expenses.companyReject")}</button> : null}<button type="submit" className={ui.primary} disabled={disabled || !reason.trim() || (!partial && missing.length > 0)}><Check size={17} />{t(partial ? "expenses.companyRetryReview" : "expenses.companyApprove")}</button></div><small>{t("expenses.companyNextItemHelp")}</small></div></form> : row.review_reason ? <p className={company.reviewResult}>{t("expenses.reviewResult")}: {row.review_reason}</p> : null}
 </div>;
}
