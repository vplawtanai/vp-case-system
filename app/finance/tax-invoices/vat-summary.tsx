"use client";

import { useI18n } from "../../../lib/i18n/provider";
import type { TaxEligibility } from "./shared";
import { vatSummaryUnavailable, vatConfirmationBlocker, vatEligibilityBlockerMessage, vatTreatmentPresentation, type InvoiceVatLine } from "./vat-treatment";
import styles from "./tax-invoices.module.css";

const amount = (value: number, currency: string) => `${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function TaxInvoiceVatSummary({ lines, error, eligibility }: { lines: InvoiceVatLine[] | null; error: string; eligibility: TaxEligibility | null }) {
  const { locale, t } = useI18n();
  const unresolved = lines?.some(line => line.treatment === "unknown");
  const multipleInvoices = new Set(lines?.map(line => line.invoiceId)).size > 1;
  const issued = eligibility?.existing_status === "issued";
  const awaitingTreatmentConfirmation = eligibility?.blockers.includes(vatConfirmationBlocker);
  const blocked = Boolean(error || !lines?.length || unresolved || eligibility?.blockers.length || (!eligibility?.existing_id && !eligibility?.can_prepare));
  return <div className={styles.vatSummary}>
    <h3>{t("finance.taxInvoice.vatSummary.heading")}</h3>
    {error ? <p className={styles.warning} role="alert">{error === vatSummaryUnavailable ? t("finance.taxInvoice.vatSummary.unavailable") : error}</p> : lines ? <>
      <table className={styles.vatTable} aria-label={t("finance.taxInvoice.vatSummary.table")}>
        <thead><tr><th scope="col">{t("finance.taxInvoice.vatSummary.item")}</th><th scope="col">{t("finance.taxInvoice.vatSummary.beforeVat")}</th><th scope="col">{t("finance.taxInvoice.vatSummary.sourceVat")}</th><th scope="col">VAT</th><th scope="col">{t("finance.taxInvoice.vatSummary.status")}</th></tr></thead>
        <tbody>{lines.map(line => {
          const display = vatTreatmentPresentation(line.treatment, line.rate, locale);
          return <tr key={`${line.invoiceId}:${line.id}`}>
            <th scope="row" data-label={t("finance.taxInvoice.vatSummary.item")}>{line.description}{multipleInvoices ? <small>{line.invoiceNumber}</small> : null}</th>
            <td data-label={t("finance.taxInvoice.vatSummary.beforeVat")} className={styles.vatAmount}>{amount(line.beforeVat, line.currency)}</td>
            <td data-label={t("finance.taxInvoice.vatSummary.sourceVat")}><span className={display.workflow === "unresolved" ? styles.vatUnknown : styles.vatKnown}>{display.label}</span>
              {line.treatment === "standard_rate" && awaitingTreatmentConfirmation ? <small>{t("finance.taxInvoice.vatSummary.treatmentConfirmation")}<br /><strong>{t("finance.taxInvoice.vatSummary.pending")}</strong></small> : null}
            </td>
            <td data-label="VAT" className={styles.vatAmount}>{amount(line.vat, line.currency)}</td>
            <td data-label={t("finance.taxInvoice.vatSummary.status")}>{display.status}{display.workflow !== "unresolved" ? <small>{display.explanation}</small> : null}</td>
          </tr>;
        })}</tbody>
      </table>
      {unresolved ? <p className={styles.warning}>{t("finance.taxInvoice.vatSummary.unknownExplanation")}<br />{t("finance.taxInvoice.vatSummary.unknownDecision")}</p> : null}
    </> : <p className={styles.small} role="status">{t("finance.taxInvoice.vatSummary.loading")}</p>}
    {eligibility ? <div className={styles.vatReadiness}>
      <strong>{issued ? t("finance.taxInvoice.vatSummary.issued") : blocked ? t("finance.taxInvoice.vatSummary.notReady") : t("finance.taxInvoice.vatSummary.reviewDraft")}</strong>
      {eligibility.blockers.length ? <ul>{eligibility.blockers.map(code => <li key={code}>{vatEligibilityBlockerMessage(code, lines, locale)}</li>)}</ul> : null}
    </div> : null}
  </div>;
}
