"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useTaxAccess } from "../tax-invoices/access";
import { documentDecisionLabel, documentError, vatTreatmentLabel, type DocumentDecision } from "./shared";
import { useI18n } from "../../../lib/i18n/provider";
import styles from "../tax-invoices/tax-invoices.module.css";

export function FinanceDocumentNextAction({ paymentId }: { paymentId: string }) {
  return <NextAction key={paymentId} paymentId={paymentId} />;
}
function NextAction({ paymentId }: { paymentId: string }) {
  const { locale, t } = useI18n();
  const { permissions } = useTaxAccess(), router = useRouter(), lock = useRef(false);
  const [decision, setDecision] = useState<DocumentDecision | null>(null), [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(false), [receiptChecked, setReceiptChecked] = useState(false), [taxChecked, setTaxChecked] = useState(false);
  const canView = permissions?.canViewFinanceReceipts || permissions?.canViewFinanceTaxInvoices;
  useEffect(() => {
    let active = true;
    if (canView) void (async () => {
      const result = await supabase.rpc("get_finance_document_decision", { p_payment_id: paymentId });
      if (active) { setDecision(result.error ? null : result.data); setError(result.error); }
    })().catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [paymentId, canView]);
  if (!canView) return null;
  const kind = decision?.decision, paired = kind === "combined_receipt_tax_invoice";
  const receiptOnly = kind === "receipt_only" || kind === "receipt_completion_only";
  const canManage = paired ? permissions?.canManageFinanceReceipts && permissions?.canManageFinanceTaxInvoices : receiptOnly ? permissions?.canManageFinanceReceipts : permissions?.canManageFinanceTaxInvoices;
  const existingId = decision?.combined_id || (paired ? decision?.receipt_id || decision?.tax_invoice_id : receiptOnly ? decision?.receipt_id : decision?.tax_invoice_id);
  const existingPath = decision?.combined_id ? "combined-documents" : (paired && decision?.receipt_id) || receiptOnly ? "receipts" : "tax-invoices";
  const actionable = !!kind && !kind.startsWith("blocked_") && kind !== "complete";
  async function create() {
    if (lock.current || !canManage || !actionable || !receiptChecked || (paired && !taxChecked)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = paired ? await supabase.rpc("create_finance_combined_document_draft", { p_payment_id: paymentId, p_external_receipt_checked: receiptChecked, p_external_tax_checked: taxChecked })
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
      {existingId ? <Link className={styles.primary} href={`/finance/${existingPath}/${existingId}`}>{t("finance.document.openExisting")}</Link> : actionable && canManage ? <button className={styles.primary} disabled={busy} onClick={() => setOpen(true)}>{documentDecisionLabel(decision.decision, locale)}</button> : null}
      {decision.receipt_id && existingPath !== "receipts" ? <p><Link className={styles.button} href={`/finance/receipts/${decision.receipt_id}`}>{t("finance.document.openIssuedReceipt")}</Link></p> : null}
      {open && actionable && !existingId ? <div className={styles.section}>
        <p className={styles.small}>{t("finance.document.externalStop")}</p>
        <label className={styles.check}><input type="checkbox" checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />{t(receiptOnly || paired ? "finance.document.checkExternalReceipt" : "finance.document.checkCompletion")}</label>
        {paired ? <label className={styles.check}><input type="checkbox" checked={taxChecked} onChange={e => setTaxChecked(e.target.checked)} />{t("finance.document.checkExternalTax")}</label> : null}
        <button className={styles.primary} disabled={busy || !receiptChecked || (paired && !taxChecked)} onClick={() => void create()}>{t("finance.document.confirmDraft")}</button>
      </div> : null}
    </>}
  </section>;
}
