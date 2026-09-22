"use client";
import { useRef, useState } from "react";
import { Check, Pencil, Send, UserRound, X } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { ExpensePaymentPanel, ExpenseSettlementForm, type ExpenseRun } from "./forms";
import type { Expense, ExpenseAccess, ExpenseAccount, ExpenseLookups } from "./shared";
import type { ExpenseRequest } from "./requests";
import { expenseCategoryLabel } from "./categories";
import css from "./purchase-request.module.css";

type Props = { access: ExpenseAccess; accounts: ExpenseAccount[]; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean };
export function claimStatus(items: Expense[]) {
 if (items.some(i => i.status === "draft")) return "draft";
 if (items.some(i => i.status === "submitted")) return "claimPending";
 const approved = items.filter(i => i.status === "accepted");
 if (!approved.length) return "claimRejected";
 if (approved.every(i => i.payout?.status === "confirmed" || i.obligation?.settled)) return "claimRefunded";
 if (approved.every(i => i.obligation?.waived || i.settlement?.mode === "no_reimbursement")) return "notReimbursed";
 return "claimAwaitingRefund";
}
export function ClaimRequestReview({ request, error, onClose, onEdit, ...props }: Props & { request: ExpenseRequest; error: string; onClose: () => void; onEdit: () => void }) {
 const { t } = useI18n();
 const [selected, setSelected] = useState(request.items.find(i => i.status === "submitted")?.id || request.items[0]?.id);
 const item = request.items.find(i => i.id === selected) || request.items[0];
 return <DetailModal open size="workflow" title={t("expenses.claimReview")} closeOnBackdrop={false} onClose={() => { if (!props.busy) onClose(); }}>
  <div className={css.review}>
   {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
   <div className={css.itemSelect}><label htmlFor="claim-review-item">{t("expenses.requestItems")}</label><select id="claim-review-item" disabled={props.busy} value={item?.id || ""} onChange={e => setSelected(e.target.value)}>{request.items.map((i,n) => <option key={i.id} value={i.id}>{t("expenses.itemNumber",{count:n+1})}: {i.description} · {t(`expenses.${claimStatus([i])}`)}</option>)}</select></div>
   {item ? <ClaimItemReview key={item.id} row={item} {...props} /> : null}
   {request.status === "draft" ? <div className={css.actions}>{request.created_by === props.access.user_id ? <button className={ui.secondary} disabled={props.busy} onClick={onEdit}><Pencil size={17}/>{t("expenses.editRequest")}</button> : null}{request.created_by === props.access.user_id || props.access.can_manage ? <button className={ui.primary} disabled={props.busy} onClick={() => void props.run("submit_finance_expense_request",{p_id:request.id,p_version:request.version})}><Send size={17}/>{t("expenses.submitRequest")}</button> : null}</div> : null}
  </div>
 </DetailModal>;
}
export function ClaimItemReview({ row, access, accounts, lookups, run, busy }: Props & { row: Expense }) {
 const { t, locale, date } = useI18n();
 const [amount,setAmount] = useState(String(row.obligation?.gross_amount ?? row.reimbursement_requested));
 const [note,setNote] = useState(""), [rejecting,setRejecting] = useState(false), [working,setWorking] = useState(false), [uncertain,setUncertain] = useState(false);
 const attempt = useRef<Record<string,unknown>|null>(null), lock = useRef(false);
 const reviewable = row.status === "submitted" && access.can_manage && access.employee_reimbursement_review_supported;
 const disabled = busy || working || uncertain;
 const validAmount = Number(amount)>0 && Number(amount)<=row.reimbursement_requested && Number(amount)<=row.gross_amount && Math.abs(Number(amount)*100-Math.round(Number(amount)*100))<0.000001;
 const money = (v:number) => `${v.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`;
 const client = lookups.clients.find(c=>c.id===row.client_id)?.name || row.client_id;
 const linkedCase = lookups.cases.find(c=>c.id===row.case_id), matter = lookups.matters.find(m=>m.id===row.advisory_matter_id);
 const work = linkedCase ? `${linkedCase.file_no} ${linkedCase.title}` : matter ? `${matter.matter_no} ${matter.title}` : row.case_id ?? row.advisory_matter_id;
 async function decide(accept:boolean) {
  if (busy || lock.current || !reviewable) return;
  if (!attempt.current && !accept && !note.trim()) { setRejecting(true);return; }
  if (!attempt.current && accept && !validAmount) return;
  lock.current=true;setWorking(true);
  if (!attempt.current) attempt.current={p_operation:crypto.randomUUID(),p_expense:row.id,p_version:row.version,p_accept:accept,p_amount:accept?Number(amount):null,p_reason:note};
  try { if (!await run("review_finance_employee_reimbursement",attempt.current)) { setUncertain(true);return; }setUncertain(false);attempt.current=null; }
  finally { lock.current=false;setWorking(false); }
 }
 return <div className={css.review} data-claim-review>
  <section className={css.facts}><div><h3>{row.description}</h3><p>{t("expenses.claimPaidDate")}: {date(row.expense_date)} · {expenseCategoryLabel(row.category,locale)}</p>{row.vendor_name?<p>{t("expenses.vendor")}: {row.vendor_name}</p>:null}</div><div className={css.amount}><span>{t("expenses.claimPersonalAmount")}</span><strong>{money(row.gross_amount)}</strong></div></section>
  <p><UserRound size={20} aria-hidden="true"/> {t("expenses.requestClaimant")}: <strong>{row.claimant_name || lookups.people.find(p=>p.id===row.claimant_id)?.name || row.claimant_id || t("expenses.unavailable")}</strong></p>
  {client || work!=null?<div className={css.linkageSummary} data-claim-linkage>{client?<p>{t("expenses.client")}: {client}</p>:null}{work!=null?<p>{t("expenses.purchaseWork")}: {work}</p>:null}</div>:null}
  <p>{t("expenses.status")}: <strong>{t(`expenses.${claimStatus([row])}`)}</strong></p>
  {row.note?<p>{row.note}</p>:null}
  <div className={css.columns}><div className={css.controls}>
   {reviewable?<><FieldGroup id="claim-approved" label={t("expenses.claimApprovedAmount")}><input type="number" min="0.01" step="0.01" max={Math.min(row.reimbursement_requested,row.gross_amount)} value={amount} disabled={disabled} onChange={e=>setAmount(e.target.value)}/></FieldGroup><FieldGroup id="claim-review-note" label={t("expenses.companyOptionalNote")}><textarea maxLength={2000} value={note} disabled={disabled} onChange={e=>setNote(e.target.value)}/></FieldGroup>{rejecting&&!note.trim()?<p role="alert">{t("expenses.companyRejectReason")}</p>:null}</>:row.review_reason?<p>{row.review_reason}</p>:null}
  </div><aside className={css.summary}><h3>{t("expenses.purchaseRequestSummary")}</h3><dl><div><dt>{t("expenses.requested")}</dt><dd>{money(row.reimbursement_requested)}</dd></div><div><dt>{t("expenses.claimApprovedAmount")}</dt><dd>{row.settlement?money(row.settlement.amount):reviewable&&validAmount?money(Number(amount)):t("expenses.awaitingDecision")}</dd></div></dl></aside></div>
  {row.status === "submitted" && access.can_manage && !access.employee_reimbursement_review_supported?<Callout tone="warning">{t("expenses.claimMigrationRequired")}</Callout>:null}
  {uncertain?<Callout tone="warning">{t("expenses.purchaseRequestRetry")}</Callout>:null}
  {reviewable?<div className={css.actions}>{!uncertain?<button type="button" className={ui.secondary} disabled={busy||working} onClick={()=>void decide(false)}><X size={17}/>{t("expenses.companyReject")}</button>:null}<button type="button" className={ui.primary} disabled={busy||working||(!uncertain&&!validAmount)} onClick={()=>void decide(true)}><Check size={17}/>{t(uncertain?"expenses.companyRetryReview":"expenses.claimApprove")}</button></div>:null}
  {row.status === "accepted" && !row.settlement && access.can_manage ? <ExpenseSettlementForm row={row} lookups={lookups} run={run} busy={busy}/> : null}
  {row.status === "accepted" ? <ExpensePaymentPanel row={row} access={access} accounts={accounts} run={run} busy={busy}/> : null}
 </div>;
}
