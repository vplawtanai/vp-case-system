"use client";
import { useI18n } from "../../../../lib/i18n/provider";
import { FinanceDocumentNextAction } from "../../document-decision/next-action";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { UserPermissions } from "../../../../lib/permissions";
import { supabase } from "../../../../lib/supabase";
import { ReceiptGuard } from "../access";
import { ReceiptDocument } from "../receipt-document";
import { receiptMethodLabel, receiptMoney, receiptPresentation, receiptRpc, receiptStatusLabel, safeReceiptError, type ReceiptCommand } from "../shared";
import { useReceipt } from "../use-receipt";
import styles from "../receipts.module.css";

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptGuard>{(permissions) => <ReceiptWorkspace key={id} id={id} permissions={permissions} />}</ReceiptGuard>;
}

function ReceiptWorkspace({ id, permissions }: { id: string; permissions: UserPermissions }) {
  const { locale, t, date } = useI18n();
  const { receipt, loading, error: loadError, reload, logoUrl } = useReceipt(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const [mode, setMode] = useState<"issue" | "cancel" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const lock = useRef(false);
  const presentation = receipt ? receiptPresentation(receipt) : null;
  const document = presentation?.ok ? presentation.value : null;
  const fingerprint = receipt ? JSON.stringify([receipt.id, receipt.updated_at, receipt.draft_snapshot_json]) : "";
  const logoReady = Boolean(document && (!document.logo || logoUrl));
  const canIssue = receipt?.status === "draft" && permissions.canIssueFinanceReceipts && Boolean(document?.logo) && logoReady && reviewed === fingerprint;
  function clearReview() { setReviewed(""); setPreview(false); setMode(null); setAcknowledged(false); setReason(""); }
  function startMode(next: "issue" | "cancel" | "void") { setMode(next); setReason(""); setAcknowledged(false); setError(""); }
  async function run(command: ReceiptCommand) {
    if (lock.current || !receipt) return;
    if (command.kind === "issue" && !canIssue) return;
    if ((command.kind === "refresh" || command.kind === "cancel") && (receipt.status !== "draft" || !permissions.canManageFinanceReceipts)) return;
    if (command.kind === "void" && (receipt.status !== "issued" || !permissions.canVoidFinanceReceipts)) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const rpc = receiptRpc(command);
      const result = await supabase.rpc(rpc.name, rpc.args);
      if (result.error || result.data !== id) throw result.error || new Error("Unexpected receipt ID");
      clearReview();
      await reload();
      setMessage(command.kind === "refresh" ? "finance.receipt.refreshed" : "finance.receipt.operationSucceeded");
    } catch (cause) {
      clearReview();
      await reload();
      setError(cause);
    } finally { lock.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">{t("finance.receipt.loading")}</p>;
  if (receipt?.combined_document_id) return <Link className={styles.primary} href={`/finance/combined-documents/${receipt.combined_document_id}`}>{t("finance.taxInvoice.ui.openCombined")}</Link>;
  if (!receipt) return <><p role="alert" className={styles.error}>{loadError}</p><button type="button" className={styles.button} onClick={() => void reload()}>{t("common.actions.retry")}</button></>;
  return <>
    <header className={`${styles.heading} ${styles.noPrint}`}>
      <div><Link className={styles.link} href="/finance/receipts">{t("finance.receipt.allReceipts")}</Link><h1>{document?.receipt.number || receipt.receipt_no || t("finance.receipt.draft")}</h1><span className={styles.status}>{receiptStatusLabel(receipt.status, locale)}</span></div>
      <div className={styles.actions}><Link className={styles.button} href={`/finance/payments/${receipt.payment_id}`}>{t("finance.receipt.payment")}</Link><button type="button" className={styles.button} disabled={busy} onClick={() => { clearReview(); void reload(); }}>{t("finance.receipt.reload")}</button></div>
    </header>
    {error || loadError ? <p role="alert" className={styles.error}>{error ? safeReceiptError(error, locale) : loadError}</p> : null}
    {message ? <p role="status" className={styles.notice}>{t(message)}</p> : null}
    {presentation && !presentation.ok ? <p role="alert" className={styles.error}>{t("finance.receipt.evidenceInvalid")}</p> : null}
    {document && !document.logo ? <p className={`${styles.notice} ${styles.noPrint}`}>{receipt.status === "draft" ? t("finance.receipt.legacyDraftLogo") : t("finance.receipt.legacyIssuedLogo")}</p> : null}
    {document ? <div className={styles.noPrint}>
      <section className={styles.section}><h2>{t("finance.receipt.paymentTotals")}</h2><dl className={styles.facts}>
        <div><dt>{t("finance.receipt.settlement")}</dt><dd><strong>{receiptMoney(document.payment.settlement, document.payment.currency)}</strong></dd></div>
        <div><dt>{t("finance.receipt.sourceWht")}</dt><dd><strong>{receiptMoney(document.payment.wht, document.payment.currency)}</strong></dd></div>
        <div><dt>{t("finance.taxInvoice.ui.actualReceived")}</dt><dd><strong>{receiptMoney(document.payment.cash, document.payment.currency)}</strong></dd></div>
        <div><dt>{t("finance.receipt.receivedOn")}</dt><dd>{date(document.payment.receivedOn)}</dd></div><div><dt>{t("finance.receipt.paymentReference")}</dt><dd>{document.payment.reference}</dd></div><div><dt>{t("finance.receipt.method")}</dt><dd>{receiptMethodLabel(document.payment.method, locale)}</dd></div>
        {document.payment.bank ? <div><dt>{t("finance.receipt.receivingBank")}</dt><dd>{document.payment.bank.bankName}<br />{document.payment.bank.accountName}<br />{document.payment.bank.accountNumber}</dd></div> : null}
        {document.payment.receivingAccountReference ? <div><dt>{t("finance.receipt.receivingDetails")}</dt><dd>{document.payment.receivingAccountReference}</dd></div> : null}
      </dl></section>
      <section className={styles.section}><h2>{t("finance.receipt.parties")}</h2><dl className={styles.facts}><div><dt>{t("finance.receipt.recipient")}</dt><dd>{document.identity.companyNameTh}<br />{document.identity.addressTh || document.identity.addressEn}<br />{document.identity.taxId}<br />{document.identity.branchTh || document.identity.branchEn}</dd></div><div><dt>{t("finance.receipt.payer")}</dt><dd>{document.customer.name}<br />{document.customer.address}{document.customer.taxId ? <><br />{document.customer.taxId}</> : null}{document.customer.branch ? <><br />{document.customer.branch}</> : null}</dd></div></dl></section>
      <section className={styles.section}><h2>{t("finance.receipt.invoiceReferences")}</h2><table className={styles.table}><thead><tr><th>{t("finance.receipt.invoiceItems")}</th><th>{t("finance.taxInvoice.ui.actualReceived")}</th><th>{t("finance.receipt.wht")}</th><th>{t("finance.receipt.settlement")}</th></tr></thead><tbody>{document.invoices.map((invoice) => <tr key={invoice.id}><td data-label={t("finance.receipt.invoiceItems")}>{invoice.number}<p>{invoice.description}</p></td><td data-label={t("finance.taxInvoice.ui.actualReceived")}>{receiptMoney(invoice.cash, invoice.currency)}</td><td data-label={t("finance.receipt.wht")}>{receiptMoney(invoice.wht, invoice.currency)}</td><td data-label={t("finance.receipt.settlement")}>{receiptMoney(invoice.settlement, invoice.currency)}</td></tr>)}</tbody></table></section>
      {document.receipt.issuedAt ? <section className={styles.section}><h2>{t("finance.taxInvoice.ui.history")}</h2><dl className={styles.facts}><div><dt>{t("finance.receipt.issuedAt")}</dt><dd>{date(document.receipt.issuedAt, true)}</dd></div><div><dt>{t("finance.receipt.issuer")}</dt><dd>{document.receipt.issuedBy}</dd></div></dl></section> : null}
      <FinanceDocumentNextAction paymentId={receipt.payment_id} />
    </div> : null}
    <section className={`${styles.section} ${styles.noPrint}`}>
      {receipt.status === "voided" ? <p className={styles.error}>{t("finance.receipt.voidedAt", { date: receipt.voided_at && Number.isFinite(Date.parse(receipt.voided_at)) ? date(receipt.voided_at, true) : t("finance.receipt.missingTime") })}<br />{t("finance.taxInvoice.ui.reason")} {receipt.void_reason}</p> : null}
      {receipt.replaces_receipt_id ? <p>{t("finance.receipt.replaces")} <Link className={styles.link} href={`/finance/receipts/${receipt.replaces_receipt_id}`}>{receipt.replaces_receipt_id}</Link></p> : null}
      <div className={styles.actions}>
        {document ? <><button type="button" className={styles.button} disabled={busy || !logoReady} onClick={() => { setPreview(true); setReviewed(fingerprint); }}>{t("finance.receipt.review")}</button><Link className={styles.button} href={`/finance/receipts/${id}/preview`}>{t("finance.receipt.openPreview")}</Link></> : null}
        {receipt.status === "draft" && permissions.canManageFinanceReceipts ? <button type="button" className={styles.button} disabled={busy} onClick={() => void run({ kind: "refresh", receiptId: id })}>{t("finance.receipt.refresh")}</button> : null}
      </div>
    </section>
    {preview && document ? <div className={styles.preview}><ReceiptDocument receipt={receipt} logoUrl={logoUrl} /></div> : null}
    <section className={`${styles.section} ${styles.noPrint}`} aria-label={t("finance.receipt.reviewConfirm")}>
      {receipt.status === "draft" && permissions.canIssueFinanceReceipts ? <>
        <h2>{t("finance.receipt.confirmIssue")}</h2>
        <p className={styles.small}>{t("finance.receipt.reviewGuidance")}</p>
        <button type="button" className={styles.primary} disabled={busy || !canIssue} onClick={() => startMode("issue")}>{t("finance.receipt.issue")}</button>
      </> : null}
      {((receipt.status === "draft" && permissions.canManageFinanceReceipts) || (receipt.status === "issued" && permissions.canVoidFinanceReceipts)) && mode !== "issue" ? <div className={styles.otherActions}>
        <h3>{t("finance.taxInvoice.ui.otherActions")}</h3>
        <p className={styles.small}>{t("finance.receipt.voidScope")}</p>
        <button type="button" className={styles.danger} disabled={busy} onClick={() => startMode(receipt.status === "draft" ? "cancel" : "void")}>{receipt.status === "draft" ? t("finance.taxInvoice.ui.cancelDraft") : t("finance.receipt.void")}</button>
      </div> : null}
      {mode ? <div className={styles.confirmation} aria-label={t("finance.receipt.confirmOperation")}>
        <h3>{mode === "issue" ? t("finance.receipt.issueConfirmation") : mode === "void" ? t("finance.receipt.voidConfirmation") : t("finance.taxInvoice.ui.confirmCancel")}</h3>
        {mode !== "issue" ? <label className={styles.label}>{t("finance.receipt.reason")}<textarea className={styles.input} maxLength={2000} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label> : null}
        {mode !== "cancel" ? <label className={styles.check}><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />{mode === "issue" ? t("finance.receipt.issueAck") : t("finance.receipt.voidAck")}</label> : null}
        <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => setMode(null)}>{t("common.actions.close")}</button><button type="button" className={mode === "issue" ? styles.primary : styles.danger} disabled={busy || (mode !== "cancel" && !acknowledged) || (mode !== "issue" && !reason.trim()) || (mode === "issue" && !canIssue)} onClick={() => void run(mode === "issue" ? { kind: "issue", receiptId: id, acknowledged, reviewedSnapshot: receipt.draft_snapshot_json } : mode === "void" ? { kind: "void", receiptId: id, reason, acknowledged } : { kind: "cancel", receiptId: id, reason })}>{busy ? t("finance.taxInvoice.ui.processing") : t("common.actions.confirm")}</button></div>
      </div> : null}
    </section>
  </>;
}
