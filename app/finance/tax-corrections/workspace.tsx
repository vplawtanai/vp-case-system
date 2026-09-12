"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { loadReviewedDocumentLogo } from "../../../lib/documentLogo";
import { useI18n } from "../../../lib/i18n/provider";
import type { UserPermissions } from "../../../lib/permissions";
import { TaxCorrectionDocument, correctionTaxProjection } from "./document";
import { correctionError, type CorrectionDocumentRow, type CorrectionRow, type CorrectionContext } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";

export function TaxCorrectionWorkspace({ id, permissions }: { id: string; permissions: UserPermissions }) {
  const { t, locale, date } = useI18n();
  const [row, setRow] = useState<CorrectionRow | null>(null), [document, setDocument] = useState<CorrectionDocumentRow | null>(null);
  const [history, setHistory] = useState<CorrectionContext | null>(null), [logo, setLogo] = useState("");
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [evidence, setEvidence] = useState(""), [legal, setLegal] = useState(false), [recovered, setRecovered] = useState(false), [ack, setAck] = useState(false), [external, setExternal] = useState(false);
  const [cancelReason, setCancelReason] = useState(""), lock = useRef(false), logoRef = useRef(""), generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const c = await supabase.from("finance_tax_document_corrections").select("*").eq("id", id).single();
      if (c.error) throw c.error;
      const d = await supabase.from("finance_tax_correction_documents").select("*").eq("id", id).maybeSingle();
      if (d.error) throw d.error;
      if ((c.data.status === "issued") !== Boolean(d.data)) throw new Error("evidence");
      const projection = correctionTaxProjection(c.data, d.data);
      if (!projection.presentation.ok) throw new Error("evidence");
      const url = await loadReviewedDocumentLogo(supabase, projection.presentation.value.logo);
      if (current !== generation.current) { URL.revokeObjectURL(url); return; }
      if (logoRef.current) URL.revokeObjectURL(logoRef.current);
      logoRef.current = url; setLogo(url); setRow(c.data); setDocument(d.data);
      const context = await supabase.rpc("get_finance_tax_correction_context", { p_tax_invoice_id: c.data.original_tax_invoice_id, p_combined_id: c.data.original_combined_document_id });
      if (current !== generation.current) return;
      if (context.error) throw context.error; setHistory(context.data);
      setLegal(false); setRecovered(false); setAck(false); setExternal(false);
    } catch (e) { if (current === generation.current) { setRow(null); setError(correctionError(e, locale)); } } finally { if (current === generation.current) setLoading(false); }
  }, [id, locale]);
  const invalidate = useCallback(() => { generation.current++; if (logoRef.current) URL.revokeObjectURL(logoRef.current); }, []);
  useEffect(() => { void reload(); return invalidate; }, [reload, invalidate]);
  const paired = Boolean(row?.original_combined_document_id), canIssue = permissions.canIssueFinanceTaxInvoices && (!paired || permissions.canIssueFinanceReceipts);
  const canManage = permissions.canManageFinanceTaxInvoices && (!paired || permissions.canManageFinanceReceipts);
  async function print() {
    if (!row || !logo || printing) return;
    setPrinting(true);
    try {
      await window.document.fonts.ready;
      await Promise.all(Array.from(window.document.querySelectorAll<HTMLImageElement>(".legal-document-print-root img")).map(image => image.decode()));
      window.print();
    } catch { setError(t("finance.taxInvoice.ui.printFailed")); } finally { setPrinting(false); }
  }
  async function run(action: "approve" | "issue" | "cancel") {
    if (!row || lock.current) return;
    if (action === "approve" && (!legal || evidence.trim().length < 5 || (row.correction_mode === "cancel_and_reissue" && !recovered))
      || action === "issue" && (!ack || !external) || action === "cancel" && !cancelReason.trim()) { setError(t("taxCorrection.error.review")); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = action === "approve" ? await supabase.rpc("approve_finance_tax_correction", { p_id: id, p_reviewed_snapshot_json: row.draft_snapshot_json, p_legal_acknowledged: legal, p_review_evidence: evidence, p_original_recovered: recovered })
        : action === "issue" ? await supabase.rpc("issue_finance_tax_correction", { p_id: id, p_reviewed_snapshot_json: row.draft_snapshot_json, p_acknowledged: ack, p_external_number_checked: external })
          : await supabase.rpc("cancel_finance_tax_correction_draft", { p_id: id, p_reason: cancelReason });
      if (result.error || result.data !== id) throw result.error || new Error("response");
      await reload();
    } catch (e) { setError(correctionError(e, locale)); } finally { lock.current = false; setBusy(false); }
  }
  if (loading) return <p role="status">{t("common.state.loading")}</p>;
  if (!row) return <p role="alert">{error} <button className={styles.button} onClick={() => void reload()}>{t("finance.taxInvoice.ui.reload")}</button></p>;
  const originalPath = row.original_combined_document_id ? `/finance/combined-documents/${row.original_combined_document_id}` : `/finance/tax-invoices/${row.original_tax_invoice_id}`;
  const replaced = history?.history.find(h => h.source_correction_id === id && h.mode === "cancel_and_reissue" && h.status === "issued");
  return <>
    <header className={`${styles.header} ${styles.noPrint}`}><div><Link className={styles.button} href={originalPath}>{t("taxCorrection.original")}</Link>
      <h1>{document?.document_no || t("taxCorrection." + row.correction_mode)}</h1><span className={styles.status}>{row.status === "approved" ? t("taxCorrection.approved") : t("status." + row.status)}</span>
      {document ? <p className={styles.small}>{t("taxCorrection." + row.correction_mode)} · {t("taxCorrection.issuedAt")} <time dateTime={document.issued_at}>{date(document.issued_at, true)}</time></p> : null}
      {row.source_correction_id ? <Link className={styles.button} href={`/finance/tax-corrections/${row.source_correction_id}`}>{t("taxCorrection.previous")}</Link> : null}</div>
      <button className={styles.button} disabled={!logo || printing} onClick={() => void print()} title={t("common.actions.previewPrint")}>{t("common.actions.previewPrint")}</button></header>
    <div className={styles.preview}><TaxCorrectionDocument correction={row} document={document} logoUrl={logo}
      replacementNotice={replaced ? <p className={styles.warning}>{t("taxCorrection.replaced")} <Link href={`/finance/tax-corrections/${replaced.id}`}>{replaced.number}</Link></p> : undefined} /></div>
    <div className={styles.noPrint}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {row.status === "draft" && canIssue ? <section className={styles.section}><h2>{t("taxCorrection.approve")}</h2><p className={styles.notice}>{t("taxCorrection.warning")}</p>
        <label className={styles.field}>{t("taxCorrection.reviewEvidence")}<textarea className={styles.input} maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
        <label className={styles.check}><input type="checkbox" checked={legal} onChange={e => setLegal(e.target.checked)} />{t("taxCorrection.legalAck")}</label>
        {row.correction_mode === "cancel_and_reissue" ? <label className={styles.check}><input type="checkbox" checked={recovered} onChange={e => setRecovered(e.target.checked)} />{t("taxCorrection.recovered")}</label> : null}
        <button className={styles.primary} disabled={busy || !logo} onClick={() => void run("approve")}>{t("taxCorrection.approve")}</button></section> : null}
      {row.status === "approved" && canIssue ? <section className={styles.section}><h2>{t("taxCorrection.issue")}</h2>
        <label className={styles.check}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{t("taxCorrection.issueAck")}</label>
        <label className={styles.check}><input type="checkbox" checked={external} onChange={e => setExternal(e.target.checked)} />{t("taxCorrection.externalAck")}</label>
        <button className={styles.primary} disabled={busy || !logo} onClick={() => void run("issue")}>{t("taxCorrection.issue")}</button></section> : null}
      {canManage && (row.status === "draft" || row.status === "approved") ? <section className={styles.section}><h2>{t("taxCorrection.other")}</h2>
        <label className={styles.field}>{t("taxCorrection.reason")}<input className={styles.input} value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></label>
        <button className={styles.danger} disabled={busy} onClick={() => void run("cancel")}>{t("taxCorrection.cancel")}</button></section> : null}
    </div>
  </>;
}
