"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Send, X } from "lucide-react";
import DetailModal from "../../components/DetailModal";
import { Callout, FieldGroup } from "../../components/ui/patterns";
import ui from "../../components/ui/vp-ui.module.css";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import type { Expense, ExpenseAccess, ExpenseLookups } from "./shared";
import type { ExpenseRequest } from "./requests";
import type { ExpenseRun } from "./forms";
import type { CompanyTaxCalculation } from "./company-tax";
import { companyReviewComplete } from "./company-workflow";
import { expenseCategoryLabel } from "./categories";
import { PurchaseTaxChoices, emptyPurchaseTax } from "./purchase-tax-choices";
import css from "./purchase-request.module.css";

type ItemProps = { row: Expense; access: ExpenseAccess; lookups: ExpenseLookups; run: ExpenseRun; busy: boolean };
export function PurchaseRequestReview({ request, access, lookups, busy, error, run, onClose, onEdit }: Omit<ItemProps,"row"> & { request: ExpenseRequest; error: string; onClose: () => void; onEdit: () => void }) {
 const { t } = useI18n();
 const [selection, setSelection] = useState(() => ({ id:request.items.find(i => !companyReviewComplete(i))?.id || request.items[0]?.id, complete:false }));
 const item = request.items.find(i => i.id === selection.id);
 const active = item && !selection.complete && companyReviewComplete(item) && !busy && !error ? request.items.find(i => !companyReviewComplete(i)) || item : item;
 const focus = useRef<HTMLDivElement>(null), previous = useRef(active?.id);
 useEffect(() => { if (previous.current !== active?.id) focus.current?.focus();previous.current = active?.id; },[active?.id]);
 return <DetailModal open size="workflow" title={t("expenses.purchaseRequestReview")} closeOnBackdrop={false} onClose={() => { if (!busy) onClose(); }}>
  <div className={css.review} ref={focus} tabIndex={-1}>
   {error ? <Callout tone="negative" role="alert">{t(`expenses.${error}`)}</Callout> : null}
   {request.items.length > 1 ? <div className={css.itemSelect}><label htmlFor="purchase-review-item">{t("expenses.requestItems")}</label><select id="purchase-review-item" disabled={busy} value={active?.id || ""} onChange={e => setSelection({ id:e.target.value,complete:companyReviewComplete(request.items.find(i => i.id === e.target.value)!) })}>{request.items.map((i,n) => <option key={i.id} value={i.id}>{t("expenses.itemNumber",{ count:n+1 })}: {i.description}</option>)}</select></div> : null}
   {active ? <PurchaseRequestItemReview key={active.id} row={active} access={access} lookups={lookups} busy={busy} run={run} /> : null}
   {request.status === "draft" ? <div className={css.actions}>{request.created_by === access.user_id ? <button type="button" className={ui.secondary} disabled={busy} onClick={onEdit}><Pencil size={17} />{t("expenses.editRequest")}</button> : null}{request.created_by === access.user_id || access.can_manage ? <button type="button" className={ui.primary} disabled={busy} onClick={() => void run("submit_finance_expense_request",{p_id:request.id,p_version:request.version})}><Send size={17} />{t("expenses.sendForReview")}</button> : null}</div> : null}
  </div>
 </DetailModal>;
}

export function PurchaseRequestItemReview({ row, access, lookups, run, busy }: ItemProps) {
 const { t, locale, date } = useI18n();
 const [recipient,setRecipient] = useState(row.reviewed_recipient_name || row.vendor_name || "");
 const [tax,setTax] = useState(row.creator_tax || emptyPurchaseTax), [note,setNote] = useState(""), [rejecting,setRejecting] = useState(false);
 const [result,setResult] = useState<{key:string;value:CompanyTaxCalculation}|null>(null), [failed,setFailed] = useState(false), [working,setWorking] = useState(false), [uncertain,setUncertain] = useState(false);
 const attempt = useRef<Record<string,unknown>|null>(null), lock = useRef(false), noteField = useRef<HTMLTextAreaElement>(null);
 const reviewable = row.status === "submitted" && access.can_manage && access.can_tax_review;
 const input = useMemo(() => ({ ...tax, schema_version:2, eligibility:"pending", reason:note }),[tax,note]);
 const key = JSON.stringify(input);
 const calculation = row.tax_review?.request_json?.calculation || (result?.key === key ? result.value : null);
 useEffect(() => {
  if (!reviewable) return;
  let active=true;
  const timer=setTimeout(async()=>{
   try {
    const r=await supabase.rpc("preview_finance_company_expense_tax",{p_expense:row.id,p_input:input});
    if (!active) return;
    if (r.error || r.data?.schema_version !== 2) { setFailed(true);return; }
    setFailed(false);setResult({key:JSON.stringify(input),value:r.data});
   } catch { if(active)setFailed(true); }
  },160);
  return()=>{active=false;clearTimeout(timer);};
 },[input,row.id,reviewable]);
 const clientName = lookups.clients.find(c => c.id === row.client_id)?.name || row.client_id;
 const linkedCase = lookups.cases.find(c => c.id === row.case_id);
 const linkedMatter = lookups.matters.find(m => m.id === row.advisory_matter_id);
 const workName = linkedCase ? `${linkedCase.file_no} ${linkedCase.title}` : linkedMatter ? `${linkedMatter.matter_no} ${linkedMatter.title}` : row.case_id ?? row.advisory_matter_id;
 const disabled=busy||working||uncertain;

 const money=(value:number)=>`${value.toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} THB`;
 async function decide(accept:boolean) {
  if (lock.current||busy||working) return;
  if (!attempt.current && !accept && !note.trim()) { setRejecting(true);requestAnimationFrame(()=>noteField.current?.focus());return; }
  if (!attempt.current && accept && (!calculation?.ready||failed||!recipient.trim())) return;
  lock.current=true;setWorking(true);
  if (!attempt.current) attempt.current={p_operation:crypto.randomUUID(),p_expense:row.id,p_version:row.version,p_accept:accept,p_input:{...tax,recipient_name:recipient.trim()},p_reason:note};
  try {
   // An uncertain response is retried with the identical operation and reviewed choices.
   if (!await run("review_finance_company_purchase_request",attempt.current)) {setUncertain(true);return;}
   setUncertain(false);attempt.current=null;
  } finally {lock.current=false;setWorking(false);}
 }
 return <div className={css.review} data-purchase-review>
  <section className={css.facts}><div><h3>{row.description}</h3>{!reviewable ? <p>{row.reviewed_recipient_name || row.vendor_name}</p> : null}<p>{date(row.expense_date)} · {expenseCategoryLabel(row.category,locale)}</p></div><div className={css.amount}><span>{t("expenses.amount")}</span><strong>{money(row.declared_gross_amount ?? row.gross_amount)}</strong></div></section>
  {clientName || workName != null ? <div className={css.linkageSummary} data-purchase-linkage>{clientName ? <p>{t("expenses.client")}: {clientName}</p> : null}{workName != null ? <p>{t("expenses.purchaseWork")}: {workName}</p> : null}</div> : null}
  <div className={css.columns}><div className={css.controls}>
   {reviewable ? <FieldGroup id="purchase-review-recipient" label={t("expenses.purchaseRequestVendor")}><input required maxLength={300} value={recipient} disabled={disabled} onChange={e=>setRecipient(e.target.value)} /></FieldGroup> : null}
   {reviewable ? <PurchaseTaxChoices value={tax} onChange={setTax} disabled={disabled} /> : <dl><dt>{t("expenses.status")}</dt><dd>{t(`expenses.${row.payout?.status === "confirmed" || row.obligation?.settled ? "paid" : row.obligation ? "unpaid" : row.status}`)}</dd></dl>}
  </div><aside className={css.summary} data-purchase-summary aria-live="polite"><h3>{t("expenses.purchaseRequestSummary")}</h3>
   {calculation ? <dl>{([['companyBeforeVat',calculation.vat_base],['vat',calculation.vat_amount],['expenseTotal',calculation.gross],['wht',calculation.wht_amount],['purchaseRequestNet',calculation.net]] as const).map(([label,amount])=><div key={label}><dt>{t(`expenses.${label}`)}{label==='vat'&&calculation.vat_rate!=null?` ${calculation.vat_rate}%`:label==='wht'&&calculation.wht_rate?` ${calculation.wht_rate}%`:null}</dt><dd>{amount==null?t("expenses.unavailable"):money(amount)}</dd></div>)}</dl>:<p role="status">{t(reviewable ? failed ? "expenses.companyTaxPreviewFailed" : "expenses.companyTaxCalculating" : "expenses.unavailable")}</p>}
  </aside>
   {row.status === "submitted" && access.can_manage ? <details className={css.note} open={rejecting || undefined}><summary>{t("expenses.companyOptionalNote")}</summary><textarea ref={noteField} aria-label={t("expenses.companyOptionalNote")} maxLength={2000} value={note} disabled={disabled} onChange={e=>setNote(e.target.value)} />{rejecting&&!note.trim()?<p role="alert">{t("expenses.companyRejectReason")}</p>:null}</details>:row.review_reason?<p>{row.review_reason}</p>:null}
  </div>
  {reviewable&&!recipient.trim()?<Callout tone="warning">{t("expenses.purchaseRequestPayeeRequired")}</Callout>:null}
  {uncertain?<Callout tone="warning">{t("expenses.purchaseRequestRetry")}</Callout>:null}
  {row.status==='submitted'&&access.can_manage?<div className={css.actions}>{!uncertain?<button type="button" className={ui.secondary} disabled={busy||working} onClick={()=>void decide(false)}><X size={17}/>{t("expenses.companyReject")}</button>:null}<button type="button" className={ui.primary} disabled={busy||working||(!uncertain&&(!reviewable||!calculation?.ready||failed||!recipient.trim()))} onClick={()=>void decide(true)}><Check size={17}/>{t(uncertain?"expenses.companyRetryReview":"expenses.companyApprove")}</button></div>:null}
 </div>;
}
