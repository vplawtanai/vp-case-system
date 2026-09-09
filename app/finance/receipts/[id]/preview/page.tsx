"use client";
import { useI18n } from "../../../../../lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReceiptGuard } from "../../access";
import { ReceiptDocument } from "../../receipt-document";
import { receiptPresentation, receiptStatusLabel } from "../../shared";
import { useReceipt } from "../../use-receipt";
import styles from "../../receipts.module.css";

export default function ReceiptPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptGuard>{() => <ReceiptPreview key={id} id={id} />}</ReceiptGuard>;
}
function ReceiptPreview({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const { receipt, loading, error, reload, logoUrl } = useReceipt(id);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const result = receipt ? receiptPresentation(receipt) : null;
  const printable = result?.ok && (!result.value.logo || Boolean(logoUrl)) && !error && !loading;
  async function print() {
    if (!printable || printing) return;
    setPrinting(true); setPrintError("");
    try {
      await window.document.fonts.ready;
      await Promise.all(Array.from(window.document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode()));
      window.print();
    }
    catch { setPrintError("finance.receipt.printFailed"); }
    finally { setPrinting(false); }
  }
  if (receipt?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${receipt.combined_document_id}/preview`}>{t("finance.taxInvoice.ui.previewCombined")}</Link>;
  return <>
    {printError ? <p role="alert" className={`${styles.error} ${styles.noPrint}`}>{t(printError)}</p> : null}
    <header className={`${styles.heading} ${styles.noPrint}`}><div><h1>{receipt ? receiptStatusLabel(receipt.status, locale) : t("finance.receipt.previewTitle")}</h1></div><div className={styles.actions}><Link href={`/finance/receipts/${id}`} className={styles.button}>{t("finance.receipt.back")}</Link><button type="button" className={styles.primary} disabled={!printable || printing} onClick={() => void print()}>{t("common.actions.printPdf")}</button></div></header>
    {loading ? <p role="status">{t("finance.receipt.loadingPreview")}</p> : error ? <div role="alert" className={styles.error}>{error} <button type="button" className={styles.button} onClick={() => void reload()}>{t("common.actions.retry")}</button></div> : receipt ? <ReceiptDocument receipt={receipt} logoUrl={logoUrl} /> : null}
  </>;
}
