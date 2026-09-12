"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import type { UserPermissions } from "../../../lib/permissions";
import { useI18n } from "../../../lib/i18n/provider";
import { money } from "../invoices/shared";
import { paymentUiLabels } from "../payments/shared";
import { documentDecisionLabel, documentError } from "./shared";
import { loadInvoicePostPaymentDocuments, type DocumentHeader, type InvoicePostPaymentData, type PostPaymentEntry } from "./invoice-post-payment-source";
import styles from "./invoice-post-payment.module.css";

type Props = { invoiceId: string; permissions: UserPermissions };
export function InvoicePostPaymentDocuments(props: Props) {
  return <Load key={`${props.invoiceId}:${props.permissions.canViewFinanceReceipts}:${props.permissions.canViewFinanceTaxInvoices}`} {...props} />;
}
function Load({ invoiceId, permissions }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<InvoicePostPaymentData | null>(null), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  const { canViewFinanceReceipts: receiptAccess, canViewFinanceTaxInvoices: taxAccess } = permissions;
  const allowed = receiptAccess || taxAccess;
  useEffect(() => {
    let active = true;
    if (allowed) void loadInvoicePostPaymentDocuments(supabase, invoiceId, { canViewFinanceReceipts: receiptAccess, canViewFinanceTaxInvoices: taxAccess })
      .then(result => { if (active) setData(result); })
      .catch(error => { console.error("Invoice post-payment read failed", error); if (active) setFailed(true); });
    return () => { active = false; };
  }, [invoiceId, allowed, receiptAccess, taxAccess, revision]);
  if (allowed && data && !failed) return <InvoicePostPaymentPanel data={data} permissions={permissions} />;
  return <section className={styles.panel} aria-label={t("finance.document.postPayment.title")}><h2>{t("finance.document.postPayment.title")}</h2>
    <p role={failed || !allowed ? "alert" : "status"}>{t(!allowed ? "finance.document.postPayment.noAccess" : failed ? "finance.document.postPayment.loadFailed" : "finance.document.checkingDecision")}</p>
    {failed ? <button type="button" className={styles.button} onClick={() => { setData(null); setFailed(false); setRevision(value => value + 1); }}>{t("common.actions.retry")}</button> : null}
  </section>;
}

export function InvoicePostPaymentPanel({ data, permissions }: { data: InvoicePostPaymentData; permissions: UserPermissions }) {
  const { locale, t } = useI18n();
  const summary = data.summary, labels = paymentUiLabels(locale);
  return <section className={styles.panel} aria-label={t("finance.document.postPayment.title")}>
    <h2>{t("finance.document.postPayment.title")}</h2>
    <dl className={styles.summary}>
      <div><dt>{t("finance.invoice.ui.settlementStatus")}</dt><dd>{labels.settlementStatuses[summary.payment_status]}</dd></div>
      <div><dt>{t("finance.document.postPayment.confirmedCount")}</dt><dd>{data.payments.length}</dd></div>
      <div><dt>{t("finance.payment.settlement.settlementTotal")}</dt><dd>{money(summary.economically_settled_amount, summary.currency)}</dd></div>
      <div><dt>{t("finance.invoice.ui.outstanding")}</dt><dd>{money(summary.outstanding_amount, summary.currency)}</dd></div>
    </dl>
    {!data.payments.length ? <p>{t("finance.document.postPayment.unpaid")}</p> : data.payments.map(entry => <PaymentDocuments key={entry.payment.id} entry={entry} permissions={permissions} />)}
  </section>;
}

function PaymentDocuments({ entry, permissions }: { entry: PostPaymentEntry; permissions: UserPermissions }) {
  const { locale, t } = useI18n();
  const { payment, decision } = entry, kind = decision.decision;
  const blocked = kind.startsWith("blocked_");
  const completion = kind === "tax_invoice_completion_only" || kind === "receipt_completion_only";
  const paired = kind === "combined_receipt_tax_invoice";
  const receiptOnly = kind === "receipt_only" || kind === "receipt_completion_only";
  const taxNotApplicable = kind === "receipt_only" || (kind === "complete" && !decision.tax_invoice_id && !decision.combined_id);
  const canManage = paired ? permissions.canManageFinanceReceipts && permissions.canManageFinanceTaxInvoices
    : receiptOnly ? permissions.canManageFinanceReceipts : permissions.canManageFinanceTaxInvoices;
  const paymentPath = `/finance/payments/${payment.id}`;
  return <article className={styles.payment}>
    <header className={styles.header}><div><h3>{t("finance.invoice.ui.payment")} {payment.internal_reference || payment.id.slice(0, 8).toUpperCase()}</h3>
      <small>{t("status.confirmed")} · {t("finance.document.postPayment.allocatedHere")} {money(entry.allocation.effective_settlement_total, payment.currency)}</small></div>
      <Link className={styles.button} href={paymentPath}>{t("finance.invoice.ui.openPayment")}</Link></header>
    <div className={styles.documents}>
      <DocumentList title={t("finance.document.receipt")} rows={entry.receipts} path="receipts" empty={t("finance.document.postPayment.noReceipt")} />
      <DocumentList title={t("finance.document.taxInvoice")} rows={entry.taxInvoices} path="tax-invoices"
        empty={t(taxNotApplicable ? "finance.document.postPayment.taxNotApplicable" : blocked ? "finance.document.reviewSource" : "finance.document.postPayment.taxRequired")} />
      {paired || completion || blocked || decision.combined_id || !!entry.combined?.length ? <DocumentList title={t("finance.document.combined")} rows={entry.combined} path="combined-documents"
        empty={t(completion ? "finance.document.postPayment.noHistoricalCombined" : blocked || !!decision.blockers?.length ? "finance.document.reviewSource" : "finance.document.postPayment.readyToPrepare")} /> : null}
    </div>
    <div className={styles.next}>
      <p><small>{t("finance.document.postPayment.next")}</small>{!blocked ? <><br /><strong>{documentDecisionLabel(kind, locale)}</strong></> : null}</p>
      {kind === "receipt_only" ? <p>{t("finance.document.noTaxExplanation")}</p> : null}
      {blocked || !!decision.blockers?.length ? <div className={styles.notice} role="note">
        {blocked ? documentDecisionLabel(kind, locale) : t("finance.document.postPayment.issueBlocked")}
        {!!decision.blockers?.length ? <ul>{decision.blockers.map(code => <li key={code}>{documentError(code, locale, decision.decision === "combined_receipt_tax_invoice")}</li>)}</ul> : null}
      </div> : null}
      {!blocked && kind !== "complete" && canManage ? <Link className={styles.primary} href={paymentPath}>
        {t(decision.blockers?.length ? "finance.document.postPayment.reviewPayment" : "finance.document.postPayment.continuePayment")}
      </Link> : null}
    </div>
  </article>;
}

function DocumentList({ title, rows, path, empty }: { title: string; rows: DocumentHeader[] | null; path: string; empty: string }) {
  const { t } = useI18n();
  return <div className={styles.document}><h4>{title}</h4>{rows === null ? <p>{t("finance.document.postPayment.noAccess")}</p> : !rows.length ? <p>{empty}</p> : <>
    {!rows.some(row => row.status === "draft" || row.status === "issued") ? <p>{empty}</p> : null}
    {rows.map(row => <div key={row.id} className={styles.record}><div><strong>{row.number || t(`status.${row.status}`)}</strong>{row.number ? <small>{t(`status.${row.status}`)}</small> : null}</div>
      {!row.combined_document_id ? <Link className={styles.button} href={`/finance/${path}/${row.id}`}>
        {t(path === "combined-documents" ? "finance.document.postPayment.openCombined" : path === "receipts" ? "finance.document.postPayment.openReceipt" : "finance.document.postPayment.openTax")}
      </Link> : null}
    </div>)}
  </>}</div>;
}
