"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { documentError, vatTreatmentLabel, type DocumentLine } from "./shared";
import { useI18n } from "../../../lib/i18n/provider";
import styles from "../tax-invoices/tax-invoices.module.css";

export function InvoiceDocumentReadiness({ invoiceId, revision }: { invoiceId: string; revision: string | null }) {
  const { locale, t } = useI18n();
  const [result, setResult] = useState<{ lines: DocumentLine[]; unknown_lines: DocumentLine[]; buyer_identity_warning: boolean } | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await supabase.rpc("finance_invoice_document_readiness", { p_invoice_id: invoiceId });
      if (active) { setError(response.error); setResult(response.error ? null : response.data); }
    })().catch(cause => { if (active) { setResult(null); setError(cause); } });
    return () => { active = false; };
  }, [invoiceId, revision]);
  return <section className={`${styles.section} ${styles.noPrint}`}><h2>{t("finance.document.afterPayment")}</h2>
    {error ? <p role="alert" className={styles.error}>{documentError(error, locale)}</p> : !result ? <p role="status">{t("finance.document.checkingVat")}</p> : <>
      <ul>{result.lines.map(line => { const treatment = line.resolved_vat_treatment.treatment; return <li key={line.id}><strong>{line.description}</strong>: {vatTreatmentLabel(treatment, locale, line.vat_rate)} · {t(treatment === "unknown" ? "finance.document.undetermined" : ["standard_rate", "zero_rated"].includes(treatment) ? "finance.document.combined" : "finance.document.receiptOnly")}</li>; })}</ul>
      {result.buyer_identity_warning ? <p className={styles.warning}>{t("finance.document.buyerEarlyWarning")}</p> : null}
      {result.unknown_lines.length ? <p className={styles.warning}>{t("finance.document.sourceVatReview")}</p> : null}
    </>}
  </section>;
}
