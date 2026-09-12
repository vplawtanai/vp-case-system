"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceGuard } from "../tax-invoices/access";
import { useTaxInvoice } from "../tax-invoices/use-tax-invoice";
import { TaxInvoiceEditor } from "../tax-invoices/editor";
import type { UserPermissions } from "../../../lib/permissions";
import { documentError } from "../document-decision/shared";
import { CombinedReceiptTaxDocument } from "./document";
import { TaxCorrectionHistoryNotice } from "../tax-corrections/history-notice";
import { combinedTaxRow, type CombinedDocument } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

export function CombinedWorkspace({ id, previewOnly = false }: { id: string; previewOnly?: boolean }) {
  const { t } = useI18n();
  return <TaxInvoiceGuard>{permissions => permissions.canViewFinanceReceipts ? <Load key={id} id={id} permissions={permissions} previewOnly={previewOnly} /> : <p role="alert">{t("finance.combined.viewPermission")}</p>}</TaxInvoiceGuard>;
}
function Load({ id, permissions, previewOnly }: { id: string; permissions: UserPermissions; previewOnly: boolean }) {
  const { locale, t } = useI18n();
  const [row, setRow] = useState<CombinedDocument | null>(null), [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    const result = await supabase.from("finance_combined_documents").select("*").eq("id", id).single();
    if (result.error || !result.data) { setRow(null); setError(result.error || new Error("DOCUMENT_SOURCE_CHANGED")); return; }
    setError(""); setRow(result.data as CombinedDocument);
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => { void reload(); }, 0); return () => clearTimeout(timer); }, [reload]);
  return error ? <p className={styles.error} role="alert">{documentError(error, locale)}</p> : row ? <Content combined={row} permissions={permissions} reloadCombined={reload} previewOnly={previewOnly} /> : <p role="status">{t("finance.combined.loadingDocument")}</p>;
}
function Content({ combined, permissions, reloadCombined, previewOnly }: { combined: CombinedDocument; permissions: UserPermissions; reloadCombined: () => Promise<void>; previewOnly: boolean }) {
  const { t } = useI18n();
  const state = useTaxInvoice(combined.tax_invoice_id), [printing, setPrinting] = useState(false), [printError, setPrintError] = useState("");
  const valid = state.row && combinedTaxRow(combined, state.row);
  async function reload() { await reloadCombined(); await state.reload(); }
  async function print() {
    if (!valid || !state.logoUrl || printing) return;
    setPrinting(true); setPrintError("");
    try { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode())); window.print(); }
    catch { setPrintError("finance.taxInvoice.ui.printFailed"); }
    finally { setPrinting(false); }
  }
  return <><header className={`${styles.header} ${styles.noPrint}`}><div><Link className={styles.button} href={`/finance/payments/${combined.payment_id}`}>{t("finance.combined.backPayment")}</Link><h1>{combined.combined_no || t("finance.combined.draftTitle")}</h1><span className={styles.status}>{t(combined.status === "cancelled" ? "finance.taxInvoice.ui.statusCancelled" : `status.${combined.status}`)}</span></div>
    <div className={styles.actions}>{previewOnly ? <Link className={styles.button} href={`/finance/combined-documents/${combined.id}`}>{t("finance.combined.backDocument")}</Link> : <Link className={styles.button} href={`/finance/combined-documents/${combined.id}/preview`}>{t("common.actions.previewPrint")}</Link>}<button className={styles.primary} disabled={!valid || !state.logoUrl || printing} onClick={() => void print()}>{t("common.actions.printPdf")}</button></div></header>
    {printError || state.error ? <p role="alert" className={styles.error}>{printError ? t(printError) : state.error}</p> : state.loading ? <p role="status">{t("finance.combined.loadingEvidence")}</p> : !valid ? <p role="alert">{t("finance.combined.linkInvalid")}</p> : previewOnly ? <CombinedReceiptTaxDocument combined={combined} row={valid} logoUrl={state.logoUrl} documentNotice={combined.status === "issued" ? <TaxCorrectionHistoryNotice taxId={valid.id} combinedId={combined.id} /> : undefined} /> : <TaxInvoiceEditor key={combined.updated_at + valid.updated_at} row={valid} combined={combined} permissions={permissions} logoUrl={state.logoUrl} blockers={state.blockers} reload={reload} />}
    {combined.status === "issued" ? <p className={`${styles.notice} ${styles.noPrint}`}>{t("finance.combined.issuedReadonly")}</p> : null}
  </>;
}
