"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DetailModal from "../../components/DetailModal";
import { supabase } from "../../../lib/supabase";
import { useI18n } from "../../../lib/i18n/provider";
import type { UserPermissions } from "../../../lib/permissions";
import { correctionBases, correctionError, correctionModes, validCorrectionInput, type CorrectionContext, type CorrectionMode } from "./shared";
import styles from "../tax-invoices/tax-invoices.module.css";
import layout from "./corrections.module.css";

export function TaxCorrectionHistoryList({ rows }: { rows: CorrectionContext["history"] }) {
  const { t, date } = useI18n();
  return <ul className={layout.history}>{rows.map(h => <li key={h.id}>
    <div className={layout.historyHeading}><Link className={styles.button} href={`/finance/tax-corrections/${h.id}`}>{h.number || t("taxCorrection." + h.mode)}</Link>
      {h.number ? <span>{t("taxCorrection." + h.mode)}</span> : null}
      <span className={styles.status}>{h.status === "approved" ? t("taxCorrection.approved") : t("status." + h.status)}</span></div>
    <p className={layout.source}>{t("taxCorrection.createdAt")} <time dateTime={h.created_at}>{date(h.created_at, true)}</time>
      {h.document_date ? <> · {t("taxCorrection.documentDate")} <time dateTime={h.document_date}>{date(h.document_date)}</time></> : null}</p>
  </li>)}</ul>;
}

export function TaxCorrectionInitiation({ taxId, combinedId = null, permissions }: { taxId: string; combinedId?: string | null; permissions: UserPermissions }) {
  const { t, locale } = useI18n(), router = useRouter();
  const [context, setContext] = useState<CorrectionContext | null>(null), [open, setOpen] = useState(false), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), lock = useRef(false), request = useRef("");
  const [mode, setMode] = useState<CorrectionMode | "">(""), [basis, setBasis] = useState("");
  const [reason, setReason] = useState(""), [evidence, setEvidence] = useState(""), [date, setDate] = useState(""), [eventDate, setEventDate] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const canManage = permissions.canManageFinanceTaxInvoices && (!combinedId || permissions.canManageFinanceReceipts);
  const reload = useCallback(async () => {
    const result = await supabase.rpc("get_finance_tax_correction_context", { p_tax_invoice_id: taxId, p_combined_id: combinedId });
    if (result.error) throw result.error;
    setContext(result.data);
  }, [taxId, combinedId]);
  useEffect(() => { void reload().catch(e => setError(correctionError(e, locale))); }, [reload, locale]);
  async function create() {
    if (lock.current || !canManage) return;
    const lines = Object.entries(amounts).filter(([, value]) => value !== "").map(([item_id, base_change]) => ({ item_id, base_change }));
    if (!validCorrectionInput(mode, reason, evidence, basis, date, eventDate, lines)) { setError(t("taxCorrection.error.required")); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const r = await supabase.rpc("create_finance_tax_correction_draft", { p_request_id: request.current, p_tax_invoice_id: taxId,
        p_combined_id: combinedId, p_mode: mode, p_reason: reason, p_legal_basis: basis, p_evidence_reference: evidence,
        p_issue_date: date, p_adjustment_date: eventDate, p_lines: lines });
      if (r.error || typeof r.data !== "string") throw r.error || new Error("response");
      router.push(`/finance/tax-corrections/${r.data}`);
    } catch (e) { setError(correctionError(e, locale)); } finally { lock.current = false; setBusy(false); }
  }
  return <section className={`${styles.section} ${styles.noPrint}`}>
    <h2>{t("taxCorrection.history")}</h2>
    {context?.source.source_correction_id ? <p className={styles.warning}>{t("taxCorrection.replaced")} <Link href={`/finance/tax-corrections/${context.source.source_correction_id}`}>{t("taxCorrection.current")}</Link></p> : null}
    {context ? <TaxCorrectionHistoryList rows={context.history} /> : null}
    {!open && error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {canManage && context ? <button className={styles.button} onClick={() => { request.current = crypto.randomUUID(); setMode(""); setBasis(""); setReason(""); setEvidence(""); setAmounts({}); setError(""); setOpen(true); }}>{t("taxCorrection.title")}</button> : null}
    <DetailModal open={open} title={t("taxCorrection.title")} subtitle={context?.source.document_no} onClose={() => { if (!busy) setOpen(false); }}
      footer={<button className={styles.primary} disabled={busy} onClick={() => void create()}>{t("taxCorrection.create")}</button>}>
      <p className={styles.notice}>{t("taxCorrection.warning")}</p>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <fieldset disabled={busy} className={`${styles.section} ${layout.form}`} onChange={() => setError("")}><div className={styles.grid}>
        <label className={styles.field}>{t("taxCorrection.mode")}<select className={styles.input} value={mode} onChange={e => { setMode(e.target.value as CorrectionMode); setBasis(""); setAmounts({}); }}><option value="">{t("taxCorrection.choose")}</option>{correctionModes.map(m => <option key={m} value={m}>{t("taxCorrection." + m)}</option>)}</select></label>
        <label className={styles.field}>{t("taxCorrection.basis")}<select className={styles.input} value={basis} onChange={e => setBasis(e.target.value)}><option value="">{t("taxCorrection.choose")}</option>{mode ? correctionBases[mode].map(b => <option value={b} key={b}>{t("taxCorrection." + b)}</option>) : null}</select></label>
        <label className={styles.field}>{t("taxCorrection.date")}<input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className={styles.field}>{t("taxCorrection.adjustmentDate")}<input type="date" className={styles.input} value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
      </div><label className={styles.field}>{t("taxCorrection.reason")}<textarea className={styles.input} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <label className={styles.field}>{t("taxCorrection.evidence")}<input className={styles.input} maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
        {mode === "credit_note" || mode === "debit_note" ? context?.items.map(item => <label className={styles.field} key={item.id}>{item.source_snapshot_json.description} · {t("taxCorrection.amount")}
          <span className={layout.source}>{t("taxCorrection.originalBase")} {Number(item.amount_before_vat).toLocaleString(locale, { minimumFractionDigits: 2 })} {"THB"}{" · "}{"VAT"} {Number(item.vat_amount).toLocaleString(locale, { minimumFractionDigits: 2 })} {"THB"}</span>
          <input inputMode="decimal" className={styles.input} value={amounts[item.id] || ""} onChange={e => setAmounts(a => ({ ...a, [item.id]: e.target.value }))} /></label>) : null}
        {mode === "cancel_and_reissue" ? <p className={styles.warning}>{t("taxCorrection.reissueWarning")}</p> : mode === "replacement_copy" ? <p className={styles.notice}>{t("taxCorrection.copyWarning")}</p> : null}
      </fieldset>
    </DetailModal>
  </section>;
}
