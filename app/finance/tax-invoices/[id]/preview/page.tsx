"use client";
import { useState } from "react";
import Link from "next/link";
import { useI18n } from "../../../../../lib/i18n/provider";
import { useParams } from "next/navigation";
import { TaxInvoiceGuard } from "../../access";
import { TaxInvoiceDocument } from "../../tax-document";
import { useTaxInvoice } from "../../use-tax-invoice";
import { taxPresentation } from "../../shared";
import { TaxCorrectionHistoryNotice } from "../../../tax-corrections/history-notice";
import styles from "../../tax-invoices.module.css";

export default function TaxPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <TaxInvoiceGuard>{() => <Preview key={id} id={id} />}</TaxInvoiceGuard>;
}
function Preview({ id }: { id: string }) {
  const { t } = useI18n();
  const { row, error, loading, logoUrl, reload } = useTaxInvoice(id);
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState("");
  const printable = !loading && !error && logoUrl && row && taxPresentation(row).ok;
  async function print() {
    if (!printable || printing) return;
    setPrinting(true); setPrintError("");
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode()));
      window.print();
    } catch { setPrintError("finance.taxInvoice.ui.printFailed"); }
    finally { setPrinting(false); }
  }
  if (row?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${row.combined_document_id}/preview`}>{t("finance.taxInvoice.ui.previewCombined")}</Link>;
  return <><header className={`${styles.header} ${styles.noPrint}`}><h1>{t("finance.taxInvoice.ui.previewTitle")}</h1><div className={styles.actions}><Link className={styles.button} href={`/finance/tax-invoices/${id}`}>{t("finance.taxInvoice.ui.back")}</Link><button className={styles.primary} disabled={!printable || printing} onClick={() => void print()}>{t("common.actions.printPdf")}</button></div></header>
    {printError || error ? <p className={styles.error} role="alert">{printError ? t(printError) : error} <button className={styles.button} onClick={() => void reload()}>{t("finance.taxInvoice.ui.reload")}</button></p> : loading ? <p role="status">{t("common.state.loading")}</p> : row ? <TaxInvoiceDocument row={row} logoUrl={logoUrl} documentNotice={row.status === "issued" ? <TaxCorrectionHistoryNotice taxId={row.id} /> : undefined} /> : null}
  </>;
}
