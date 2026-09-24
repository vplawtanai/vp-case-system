"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTaxAccess } from "../tax-invoices/access";
import { documentDecisionLabel, documentError, vatTreatmentLabel, type DocumentDecision } from "./shared";
import { useI18n } from "../../../lib/i18n/provider";
import styles from "../tax-invoices/tax-invoices.module.css";

export function FinanceDocumentNextAction({ paymentId, directMoneyId }: { paymentId?: string | null; directMoneyId?: string | null }) {
  return <NextAction key={directMoneyId || paymentId} paymentId={paymentId || ""} directMoneyId={directMoneyId || ""} />;
}
function NextAction({ paymentId, directMoneyId }: { paymentId: string; directMoneyId: string }) {
  const { locale, t } = useI18n();
  const { permissions } = useTaxAccess(), router = useRouter(), lock = useRef(false);
  const [decision, setDecision] = useState<DocumentDecision | null>(null), [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(Boolean(directMoneyId)), [receiptChecked, setReceiptChecked] = useState(false), [taxChecked, setTaxChecked] = useState(false);
  const [noEarlierEvent, setNoEarlierEvent] = useState(false);
  const canView = permissions?.canViewFinanceReceipts || permissions?.canViewFinanceTaxInvoices;
  useEffect(() => {
    let active = true;
    if (canView) void (async () => {
      const result = directMoneyId ? await supabase.rpc("get_finance_received_document_decision", { p_source_type: "direct_money_receipt", p_source_id: directMoneyId }) : await supabase.rpc("get_finance_document_decision", { p_payment_id: paymentId });
      let nextDecision = result.error ? null : result.data as DocumentDecision | null;
      if (directMoneyId && nextDecision?.combined_id) {
        // The Direct decision provides the Combined ID, but not its lifecycle status.
        const combined = await supabase.from("finance_combined_documents").select("status").eq("id", nextDecision.combined_id).eq("direct_money_receipt_id", directMoneyId).single();
        if (combined.error || !combined.data || !["draft", "issued"].includes(combined.data.status)) throw combined.error || new Error("DOCUMENT_SOURCE_CHANGED");
        nextDecision = { ...nextDecision, combined_status: combined.data.status };
      }
      if (active) { setDecision(nextDecision); setError(result.error); }
    })().catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [paymentId, directMoneyId, canView]);
  if (!canView) return null;
  const kind = decision?.decision, paired = kind === "combined_receipt_tax_invoice";
  const receiptOnly = kind === "receipt_only" || kind === "receipt_completion_only";
  const completedReceipt = Boolean(directMoneyId && kind === "complete" && !decision?.tax_invoice_id && decision?.receipt_id);
  const canManage = paired ? permissions?.canManageFinanceReceipts && permissions?.canManageFinanceTaxInvoices : receiptOnly ? permissions?.canManageFinanceReceipts : permissions?.canManageFinanceTaxInvoices;
  const existingId = decision?.combined_id || (paired ? decision?.receipt_id || decision?.tax_invoice_id : receiptOnly || completedReceipt ? decision?.receipt_id : decision?.tax_invoice_id);
  const existingPath = decision?.combined_id ? "combined-documents" : (paired && decision?.receipt_id) || receiptOnly || completedReceipt ? "receipts" : "tax-invoices";
  const directCombined = Boolean(directMoneyId && decision?.combined_id);
  const existingLabel = directCombined && decision?.combined_status === "draft" ? "finance.document.openCombinedDraft"
    : directCombined && decision?.combined_status === "issued" ? "finance.document.postPayment.openCombined" : "finance.document.openExisting";
  const actionable = !!kind && !kind.startsWith("blocked_") && kind !== "complete";
  async function create() {
    if (lock.current || !canManage || !actionable || !receiptChecked || (paired && !taxChecked) || (directMoneyId && !receiptOnly && (!taxChecked || !noEarlierEvent))) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = directMoneyId ? await supabase.rpc("create_finance_received_document_draft", { p_source_type: "direct_money_receipt", p_source_id: directMoneyId, p_external_receipt_checked: receiptChecked, p_external_tax_checked: taxChecked, p_no_earlier_event: noEarlierEvent }) : paired ? await supabase.rpc("create_finance_combined_document_draft", { p_payment_id: paymentId, p_external_receipt_checked: receiptChecked, p_external_tax_checked: taxChecked })
        : receiptOnly ? await supabase.rpc("create_finance_receipt_draft_from_payment", { p_payment_id: paymentId, p_external_receipt_checked: receiptChecked })
        : await supabase.rpc("create_finance_tax_invoice_draft", { p_payment_id: paymentId });
      if (result.error || typeof result.data !== "string") throw result.error || new Error("response");
      router.push(`/finance/${paired ? "combined-documents" : receiptOnly ? "receipts" : "tax-invoices"}/${result.data}`);
    } catch (cause) { setError(cause); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={`${styles.nextAction} ${styles.noPrint}`} aria-label={t("finance.document.afterPayment")}><h2>{t("finance.document.afterPayment")}</h2>
    {error ? <p role="alert" className={styles.error}>{documentError(error, locale, paired)}</p> : !decision ? <p role="status">{t("finance.document.checkingDecision")}</p> : <>
      <p><strong>{documentDecisionLabel(decision.decision, locale)}</strong></p>
      {decision.decision === "receipt_only" ? <p>{t("finance.document.noTaxExplanation")}</p> : null}
      <ul>{decision.lines.map(line => <li key={line.id}>{line.description}: {vatTreatmentLabel(line.resolved_vat_treatment.treatment, locale, line.vat_rate)}</li>)}</ul>
      {decision.blockers?.length ? <ul className={styles.notice}>{decision.blockers.map(code => <li key={code}>{documentError(code, locale, paired)}</li>)}</ul> : null}
      {existingId ? <Link className={styles.primary} href={`/finance/${existingPath}/${existingId}`}>{t(existingLabel)}</Link> : actionable && canManage && !directMoneyId ? <button className={styles.primary} disabled={busy} onClick={() => setOpen(true)}>{documentDecisionLabel(decision.decision, locale)}</button> : null}
      {!directCombined && decision.receipt_id && existingPath !== "receipts" ? <p><Link className={styles.button} href={`/finance/receipts/${decision.receipt_id}`}>{t("finance.document.openIssuedReceipt")}</Link></p> : null}
      {open && actionable && canManage && !existingId ? <div className={styles.section}>
        <p className={styles.small}>{t("finance.document.externalStop")}</p>
        <label className={styles.check}><input type="checkbox" checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />{t(receiptOnly || paired ? "finance.document.checkExternalReceipt" : "finance.document.checkCompletion")}</label>
        {paired || (directMoneyId && !receiptOnly) ? <label className={styles.check}><input type="checkbox" checked={taxChecked} onChange={e => setTaxChecked(e.target.checked)} />{t("finance.document.checkExternalTax")}</label> : null}
        {directMoneyId && !receiptOnly ? <label className={styles.check}><input type="checkbox" checked={noEarlierEvent} onChange={e => setNoEarlierEvent(e.target.checked)} />{t("finance.taxInvoice.ui.noEarlierEvent")}</label> : null}
        <button className={styles.primary} disabled={busy || !receiptChecked || (paired && !taxChecked) || Boolean(directMoneyId && !receiptOnly && (!taxChecked || !noEarlierEvent))} onClick={() => void create()}>{t(directMoneyId ? "directMoney.prepareDocument" : "finance.document.confirmDraft")}</button>
      </div> : null}
    </>}
  </section>;
}
