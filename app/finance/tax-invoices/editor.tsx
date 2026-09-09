"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "../../../lib/i18n/provider";
import { uiMessage } from "../../../lib/i18n/core";
import type { UserPermissions } from "../../../lib/permissions";
import { supabase } from "../../../lib/supabase";
import { TaxInvoiceDocument } from "./tax-document";
import { taxDraftDirty, taxIssueReady } from "./review";
import { taxError, taxMoney, taxObject, taxPresentation,  taxText, type TaxDecisions, type TaxInvoice } from "./shared";
import styles from "./tax-invoices.module.css";
import { CombinedReceiptTaxDocument } from "../combined-documents/document";
import type { CombinedDocument } from "../combined-documents/shared";
import { documentError } from "../document-decision/shared";
export function TaxInvoiceEditor({ row, permissions, logoUrl, blockers, reload, combined }: { row: TaxInvoice; permissions: UserPermissions; logoUrl: string; blockers: string[]; reload: () => Promise<void>; combined?: CombinedDocument }) {
  const { locale, t, date } = useI18n();
  const [decisions, setDecisions] = useState<TaxDecisions>(row.decisions_json), [issueDate, setIssueDate] = useState(row.issue_date);
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [reviewed, setReviewed] = useState(false);
  const [ack, setAck] = useState(false), [delayAck, setDelayAck] = useState(false), [reason, setReason] = useState("");
  const [refreshAck, setRefreshAck] = useState(false), [cancelOpen, setCancelOpen] = useState(false);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const lock = useRef(false), alert = useRef<HTMLDivElement>(null);
  const presentation = taxPresentation(row);
  if (!presentation.ok) return <p className={styles.error} role="alert">{t("finance.taxInvoice.ui.evidenceInvalid")}</p>;
  const d = presentation.value, source = taxObject(row.source_snapshot_json), customer = taxObject(source.customer);
  const title = t(combined ? "finance.document.combined" : "finance.document.taxInvoice"), prefix = combined ? "VP-RTI" : "VP-TI";
  const draft = row.status === "draft", editable = draft && permissions.canManageFinanceTaxInvoices && (!combined || permissions.canManageFinanceReceipts);
  const dirty = taxDraftDirty(row, issueDate, decisions);
  const missingAddress = !taxText(customer.address), missingTax = !taxText(customer.tax_id);
  const headOffice = ["สำนักงานใหญ่", "head office", "00000"].includes(taxText(customer.branch).toLowerCase());
  const branchType = headOffice ? "head_office" : decisions.buyer_branch_type || "";
  const delay = issueDate > d.taxPointDate;
  const ready = taxIssueReady({ status: row.status, canIssue: permissions.canIssueFinanceTaxInvoices && (!combined || (permissions.canIssueFinanceReceipts && receiptChecked)), busy, dirty, blockerCount: blockers.length,
    reviewed, acknowledged: ack, logoReady: Boolean(logoUrl), delayed: delay, delayAcknowledged: delayAck });
  const needsEvidence = missingAddress || (decisions.buyer_vat_registered === true && (missingTax || !headOffice));
  function change<K extends keyof TaxDecisions>(key: K, value: TaxDecisions[K]) { setDecisions(previous => ({ ...previous, [key]: value })); setReviewed(false); setAck(false); setError(""); }
  async function run(action: "save" | "refresh" | "issue" | "cancel") {
    if (lock.current) return;
    if (action === "issue" && !ready) {
      setError(uiMessage("finance.taxInvoice.ui.reviewRequired"));
      requestAnimationFrame(() => alert.current?.focus()); return;
    }
    if (action === "cancel" && !reason.trim()) { setError(uiMessage("finance.taxInvoice.error.reasonRequired")); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = combined ? (action === "save" ? await supabase.rpc("save_finance_combined_document_draft", { p_combined_id: combined.id, p_issue_date: issueDate, p_decisions_json: decisions, p_expected_updated_at: combined.updated_at })
        : action === "refresh" ? await supabase.rpc("refresh_finance_combined_document_draft", { p_combined_id: combined.id, p_expected_updated_at: combined.updated_at })
        : action === "issue" ? await supabase.rpc("issue_finance_combined_document", { p_combined_id: combined.id, p_reviewed_snapshot_json: combined.draft_snapshot_json, p_acknowledged: ack, p_delayed_issue_acknowledged: delayAck, p_external_receipt_checked: receiptChecked, p_external_tax_checked: decisions.external_coverage_checked === true })
        : await supabase.rpc("cancel_finance_combined_document_draft", { p_combined_id: combined.id, p_reason: reason.trim() }))
        : action === "save" ? await supabase.rpc("save_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_issue_date: issueDate, p_decisions_json: decisions, p_expected_updated_at: row.updated_at })
        : action === "refresh" ? await supabase.rpc("refresh_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_expected_updated_at: row.updated_at })
        : action === "issue" ? await supabase.rpc("issue_finance_tax_invoice", { p_tax_invoice_id: row.id, p_reviewed_snapshot_json: row.draft_snapshot_json, p_acknowledged: ack, p_delayed_issue_acknowledged: delayAck })
        : await supabase.rpc("cancel_finance_tax_invoice_draft", { p_tax_invoice_id: row.id, p_reason: reason.trim() });
      if (result.error || result.data !== (combined?.id || row.id)) throw result.error || new Error("response");
      await reload();
    } catch (cause) { setError(cause); requestAnimationFrame(() => alert.current?.focus()); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <section className={`${styles.section} ${styles.noPrint}`}><div className={styles.actions}><Link className={styles.button} href={`/finance/payments/${row.payment_id}`}>{t("finance.taxInvoice.ui.sourcePayment")}</Link><Link className={styles.button} href={`/finance/invoices/${row.invoice_id}`}>{d.invoiceNumber}</Link><Link className={styles.button} href={combined ? `/finance/combined-documents/${combined.id}/preview` : `/finance/tax-invoices/${row.id}/preview`}>{t("common.actions.previewPrint")}</Link></div></section>
    <section className={`${styles.section} ${styles.noPrint}`}><h2>{t("finance.taxInvoice.ui.sourceTax")}</h2><dl className={styles.facts}><div><dt>{t("finance.taxInvoice.ui.beforeVat")}</dt><dd>{taxMoney(d.beforeVat)} THB</dd></div><div><dt>VAT</dt><dd>{taxMoney(d.vat)} THB</dd></div><div><dt>{combined ? t("finance.taxInvoice.ui.settlement") : t("finance.taxInvoice.ui.gross")}</dt><dd>{taxMoney(combined ? d.settlement : d.gross)} THB</dd></div><div><dt>{t("finance.taxInvoice.ui.actualReceived")}</dt><dd>{taxMoney(d.cash)} THB</dd></div><div><dt>{t("finance.taxInvoice.ui.wht")}</dt><dd>{taxMoney(d.wht)} THB</dd></div></dl></section>
    {draft ? <>
      <fieldset className={`${styles.section} ${styles.noPrint}`} disabled={!editable || busy}><legend>{t("finance.taxInvoice.ui.buyerVat")}</legend><div className={styles.grid}>
        <div><span className={styles.small}>{t("finance.taxInvoice.ui.buyer")}</span><p>{taxText(customer.name)}</p>{!missingAddress ? <p>{taxText(customer.address)}</p> : null}{!missingTax ? <p>{t("finance.taxInvoice.ui.taxId")} {taxText(customer.tax_id)}</p> : null}</div>
        <label className={styles.field}>{t("finance.taxInvoice.ui.buyerVatStatus")}<select className={styles.input} value={typeof decisions.buyer_vat_registered === "boolean" ? String(decisions.buyer_vat_registered) : ""} onChange={e => change("buyer_vat_registered", e.target.value === "" ? null : e.target.value === "true")}><option value="">{t("finance.taxInvoice.ui.unspecified")}</option><option value="true">{t("finance.taxInvoice.ui.registered")}</option><option value="false">{t("finance.taxInvoice.ui.notRegistered")}</option></select></label>
        {missingAddress ? <label className={styles.field}>{t("finance.taxInvoice.ui.buyerAddress")}<textarea rows={3} maxLength={2000} className={styles.input} value={decisions.customer_address || ""} onChange={e => change("customer_address", e.target.value)} /></label> : null}
        {decisions.buyer_vat_registered === true ? <>
          {missingTax ? <label className={styles.field}>{t("finance.taxInvoice.ui.taxId")}<input className={styles.input} inputMode="numeric" maxLength={13} value={decisions.customer_tax_id || ""} onChange={e => change("customer_tax_id", e.target.value)} /></label> : null}
          {headOffice ? <p>{t("finance.taxInvoice.ui.sourceHeadOffice")}</p> : <label className={styles.field}>{t("finance.taxInvoice.ui.branchType")}<select className={styles.input} value={branchType} onChange={e => change("buyer_branch_type", e.target.value)}><option value="">{t("finance.taxInvoice.ui.unspecified")}</option><option value="head_office">{t("finance.taxInvoice.ui.headOffice")}</option><option value="branch">{t("finance.taxInvoice.ui.branch")}</option></select></label>}
          {branchType === "branch" ? <label className={styles.field}>{t("finance.taxInvoice.ui.branchCode")}<input className={styles.input} maxLength={5} inputMode="numeric" value={decisions.buyer_branch_code || ""} onChange={e => change("buyer_branch_code", e.target.value)} /></label> : null}
        </> : null}
        {needsEvidence ? <label className={styles.field}>{t("finance.taxInvoice.ui.identityEvidence")}<textarea className={styles.input} rows={2} maxLength={2000} value={decisions.identity_evidence || ""} onChange={e => change("identity_evidence", e.target.value)} /><span className={styles.small}>{t("finance.taxInvoice.ui.identityScope")}</span></label> : null}
        {source.schema_version === 1 ? <><label className={styles.field}>{t("finance.taxInvoice.ui.lineTreatment")}<select className={styles.input} value={decisions.tax_treatment || ""} onChange={e => change("tax_treatment", e.target.value)}><option value="">{t("finance.taxInvoice.ui.unconfirmed")}</option><option value="standard_rated">{t("finance.taxInvoice.ui.standardTreatment")}</option><option value="zero_rated">{t("finance.taxInvoice.ui.zeroEvidence")}</option></select></label>
        {decisions.tax_treatment === "zero_rated" ? <label className={styles.field}>{t("finance.taxInvoice.ui.zeroReason")}<textarea className={styles.input} rows={2} maxLength={2000} value={decisions.treatment_reason || ""} onChange={e => change("treatment_reason", e.target.value)} /></label> : null}</> : <p className={styles.small}>{t("finance.taxInvoice.ui.frozenTreatment")}</p>}
      </div></fieldset>
      <fieldset className={`${styles.section} ${styles.noPrint}`} disabled={!editable || busy}><legend>{t("finance.taxInvoice.ui.taxPointDates")}</legend><p>{t("finance.taxInvoice.ui.sourceReceivedDate")} <strong>{date(d.taxPointDate)}</strong></p>
        <label className={styles.check}><input type="checkbox" checked={decisions.no_earlier_event === true} onChange={e => change("no_earlier_event", e.target.checked)} />{t("finance.taxInvoice.ui.noEarlierEvent")}</label>
        <label className={styles.check}><input type="checkbox" checked={decisions.external_coverage_checked === true} onChange={e => change("external_coverage_checked", e.target.checked)} />{t("finance.taxInvoice.ui.externalCoverage", { prefix })}</label>
        <label className={styles.field}>{t("finance.taxInvoice.ui.issueDate")}<input className={styles.input} type="date" value={issueDate} min={d.taxPointDate} onChange={e => { setIssueDate(e.target.value); setReviewed(false); setAck(false); setDelayAck(false); }} /></label>
        {delay ? <p className={styles.warning}>{t("finance.taxInvoice.ui.delayWarning")}</p> : null}
      </fieldset>
      <section className={`${styles.section} ${styles.noPrint}`}><p role="status" className={dirty ? styles.warning : styles.small}>{dirty ? t("common.state.unsaved") : t("finance.taxInvoice.ui.latestSaved")}</p>{editable ? <button className={styles.button} disabled={busy || !dirty} onClick={() => void run("save")}>{t("common.actions.saveChanges")}</button> : null}</section>
    </> : <section className={`${styles.section} ${styles.noPrint}`}><h2>{t("finance.taxInvoice.ui.history")}</h2><p>{t(`status.${row.status}`)}{row.issued_at ? ` · ${date(row.issued_at, true)}` : ""}</p>{row.cancel_reason ? <p>{t("finance.taxInvoice.ui.reason")} {row.cancel_reason}</p> : null}{row.issue_date > d.taxPointDate ? <p className={styles.warning}>{t("finance.taxInvoice.ui.delayHistory")}</p> : null}</section>}
    <div className={styles.preview}>{combined ? <CombinedReceiptTaxDocument combined={combined} row={row} logoUrl={logoUrl} /> : <TaxInvoiceDocument row={row} logoUrl={logoUrl} />}</div>
    <div ref={alert} tabIndex={-1} className={styles.noPrint}>{error ? <p className={styles.error} role="alert">{documentError(error, locale)}</p> : null}</div>
    {draft ? <>
      <section className={`${styles.section} ${styles.noPrint}`}><h2>{t("finance.taxInvoice.ui.confirmIssue", { title })}</h2>
        {blockers.length ? <div className={styles.notice}><strong>{t("finance.taxInvoice.ui.notReady")}</strong><ul>{blockers.map(code => <li key={code}>{taxError(code, locale)}</li>)}</ul></div> : null}
        {dirty ? <p className={styles.warning}>{t("finance.taxInvoice.ui.saveBeforeReview")}</p> : null}
        {permissions.canIssueFinanceTaxInvoices && (!combined || permissions.canIssueFinanceReceipts) ? <>
          <label className={styles.check}><input type="checkbox" disabled={busy || dirty || !logoUrl} checked={reviewed} onChange={e => { setReviewed(e.target.checked); setAck(false); }} />{t("finance.taxInvoice.ui.reviewAck")}</label>
          {delay ? <label className={styles.check}><input type="checkbox" disabled={busy || dirty} checked={delayAck} onChange={e => setDelayAck(e.target.checked)} />{t("finance.taxInvoice.ui.delayAck")}</label> : null}
          {combined ? <label className={styles.check}><input type="checkbox" disabled={busy || dirty} checked={receiptChecked} onChange={e => setReceiptChecked(e.target.checked)} />{t("finance.taxInvoice.ui.receiptAck")}</label> : null}
          <label className={styles.check}><input type="checkbox" disabled={busy || dirty || !reviewed} checked={ack} onChange={e => setAck(e.target.checked)} />{t("finance.taxInvoice.ui.issueAck", { prefix })}</label>
          <button className={styles.primary} disabled={!ready} onClick={() => void run("issue")}>{busy ? t("finance.taxInvoice.ui.processing") : t("finance.taxInvoice.ui.issue", { title })}</button>
        </> : <p className={styles.small}>{combined ? t("finance.taxInvoice.ui.combinedAuthority") : t("finance.taxInvoice.ui.taxAuthority")}</p>}
      </section>
      {editable ? <section className={`${styles.section} ${styles.noPrint}`}><h2>{t("finance.taxInvoice.ui.otherActions")}</h2>
        <label className={styles.check}><input type="checkbox" checked={refreshAck} disabled={busy} onChange={e => setRefreshAck(e.target.checked)} />{t("finance.taxInvoice.ui.refreshAck")}</label><button className={styles.button} disabled={busy || !refreshAck || dirty} onClick={() => void run("refresh")}>{t("finance.taxInvoice.ui.refresh")}</button>
        <p><button className={styles.danger} disabled={busy} onClick={() => setCancelOpen(!cancelOpen)}>{t("finance.taxInvoice.ui.cancelDraft")}</button></p>
        {cancelOpen ? <><label className={styles.field}>{t("finance.taxInvoice.ui.cancelReason")}<textarea className={styles.input} rows={2} maxLength={2000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label><p className={styles.small}>{t("finance.taxInvoice.ui.cancelScope")}</p><button className={styles.danger} disabled={busy || !reason.trim()} onClick={() => void run("cancel")}>{t("finance.taxInvoice.ui.confirmCancel")}</button></> : null}
      </section> : null}
    </> : null}
  </>;
}
